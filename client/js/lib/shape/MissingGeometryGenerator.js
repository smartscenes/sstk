const Constants = require('Constants');
const CompositeShapeGenerator = require('shape/CompositeShapeGenerator');
const Materials = require('materials/Materials');
const MeshColors = require('geo/MeshColors');
const MeshHelpers = require('geo/MeshHelpers');
const ModelUtil = require('model/ModelUtil');
const OBBFitter = require('geo/OBBFitter');
const Object3DUtil = require('geo/Object3DUtil');
const async = require('async');
const _ = require('util/util');

const InferMaterials = {
  getMaterialAtIntersectedPoint: function(object3D, raycaster) {
    const intersected = raycaster.intersectObject(object3D, true);
    if (intersected && intersected.length) {
      return Materials.getMaterialAtIntersected(intersected[0]);
    }
  },
  getColorMaterialAtIntersectedPoint: function(object3D, raycaster) {
    const intersected = raycaster.intersectObject(object3D, true);
    if (intersected && intersected.length) {
      const mesh = intersected[0].object;
      const sample = { uv: intersected[0].uv, face: intersected[0].face };
      MeshColors.populateSampleUVColor(mesh, sample);
      return Materials.getStandardMaterial(sample.color, sample.opacity, THREE.FrontSide);
    }
  }
};

// Parameters are in meters
const defaultOpts = {
  '_all_': {
    'inferMaterial': {
      enabled: true,
      name: 'getMaterialAtIntersectedPoint'
    },
    'obbField': 'obb',
    'checkBounds': false,
    'checkReverseDirection': false
  },
  'panel': {
    'thickness': 0.025
  },
  'drawer': {
    'thickness': 0.0125,
    'depth': 0.5,
    'gap': 0.00001,
    'wgap': 0, // how much to decrease width
    'hgap': 0, // how much to decrease height
    'minDepth': 0.05,
    'allowNonRectangular': true,
  }
};
// Field to convert from meters to virtual units
const convertFields = ['depth', 'thickness', 'depth', 'gap', 'minDepth'];

function toVirtualUnits(spec) {
  if (spec.unit === 'vu') {
    return spec;
  }
  const geomSpecVU = _.clone(spec);
  convertFields.forEach(f => {
    if (geomSpecVU[f] != null) {
      geomSpecVU[f] = geomSpecVU[f] * Constants.metersToVirtualUnit;
    }
  });
  geomSpecVU.unit = 'vu';
  return geomSpecVU;
}

/**
 * Generates missing geometry for objects
 * @param allOpts options for how to generate geometry that applies to all
 * @param optsByLabel options for how to generate geometry by label
 * @constructor
 */
function MissingGeometryGenerator(allOpts, optsByLabel) {
  this.__shapeGenerator = new CompositeShapeGenerator();
  this.opts = optsByLabel || {};
  if (allOpts) {
    this.opts['_all_'] = allOpts;
  }
  this.opts = _.defaultsDeep(this.opts, defaultOpts);
  this.obbField = _.get(this.opts, ['_all_', 'obbField']);
  const inferMaterialOpts = _.get(this.opts, ['_all_', 'inferMaterial']);
  this.inferMaterial = (inferMaterialOpts && inferMaterialOpts.enabled)?
    InferMaterials[inferMaterialOpts.name] : null;

}

MissingGeometryGenerator.prototype.generateMissingGeometry = function(object, generateSpecs, callback) {
  var scope = this;
  async.mapSeries(generateSpecs, function (spec, cb) {
    scope.generateMissingGeometryForSpec(spec, object, cb);
  }, function(err, generated) {
    if (err) {
      callback(err);
    } else {
      var ngenerated = _.sumBy(generated, function(x) { return x? 1 : 0; });
      var objectGenResults = {
        specs: generateSpecs,
        generated: generated,
        numGenerated: ngenerated
      };
      if (object.parts) {
        scope.generateMissingGeometryForParts(object.parts, (err, partGenResults) => {
          var finalResults = objectGenResults;
          if (partGenResults) {
            finalResults = {
              specs: generateSpecs,
              parts: partGenResults.parts,
              generated: _.concat(generated, partGenResults.generated),
              numGenerated: ngenerated + partGenResults.numGenerated
            };
          }
          callback(err, finalResults);
        });
      } else {
        callback(null, objectGenResults);
      }
    }
  });
};

MissingGeometryGenerator.prototype.generateMissingGeometryForSpec = function(spec, object, callback) {
  if (spec.type === 'top') {
    // Make sure that the OBB for the object is vertical
    this.ensureOBBForPart(object, { constrainVertical: true });
    var objectOBB = object[this.obbField];
    // get top
    var topObb;

    if (!spec.useObjectOBB) {
      topObb = ModelUtil.getTightObbForSide(object.partMesh, Constants.BBoxFaces.TOP);
    }

    if (!topObb) {
      console.log('Using object OBB to determine top OBB');
      topObb = objectOBB.clone();
    }

    // assume y up
    var panelDefaults = _.get(this.opts, ['panel']);
    var panelOpts = _.defaults(Object.create(null), spec || {}, panelDefaults);
    panelOpts = toVirtualUnits(panelOpts);
    var thickness = panelOpts.thickness;
    topObb.position.y = topObb.position.y + topObb.halfSizes.y + thickness / 2;
    topObb.halfSizes.y = thickness / 2;
    var topInfo = {};
    topInfo[this.obbField] = topObb;

    // TODO: use modelId as top if specified
    this.__generatePanelFromOBB(topInfo, spec, object.partMesh, objectOBB, callback);
  } else {
    console.warn('Unsupported generate geometry spec', spec);
  }
};

MissingGeometryGenerator.prototype.generateMissingGeometryForParts = function(parts, callback) {
  if (!Array.isArray(parts)) { parts = [parts]; }
  var scope = this;
  async.mapSeries(parts, function (part, cb) {
    if (part) {
      scope.generateMissingGeometryForPart(part, {}, cb);
    } else {
      cb(null, null);
    }
  }, function(err, generated) {
    if (err) {
      callback(err);
    } else {
      var ngenerated = _.sumBy(generated, function(x) { return x? 1 : 0; });
      var result = {
        parts: parts,
        generated: generated,
        numGenerated: ngenerated
      };
      callback(null, result);
    }
  });
};


MissingGeometryGenerator.prototype.ensureOBBForPart = function(part, inputObbFitOptions) {
  var defaultObbFitOptions = { constrainVertical: true };
  var obbFitOptions = defaultObbFitOptions;
  if (inputObbFitOptions) {
    obbFitOptions = _.defaults(Object.create(null), obbFitOptions, defaultObbFitOptions);
  }
  var obbField = this.obbField;
  if (!part[obbField]) {
    if (part.partMesh) {
      part[obbField] = OBBFitter.fitObjectOBB([part.partMesh], obbFitOptions);
    } else {
      console.error('No mesh geometry for part', part.id);
    }
  }
  return part[obbField];
};

/**
 * Generate missing geometry for part
 * @param part
 * @param part.label {string} Name of part
 * @param [part.partmesh] {THREE.Mesh} Part mesh (can be specified instead of OBB)
 * @param [part.obb] {OBB} Part OBB (note: obb fieldname can also differ based on this.obbField)
 * @param [part.id] {string} Part id
 * @param [part.object3D] {THREE.Object3D} Entire object
 * @param [spec] Additional specification of how to generate the geometry
 * @param callback
 */
MissingGeometryGenerator.prototype.generateMissingGeometryForPart = function(part, spec, callback) {
  spec = spec || {};
  if (spec.type === 'panel') {
    this.ensureOBBForPart(part);
    this.__generatePanelFromOBB(part, spec, null, null, callback);
  } else if (part.label === 'drawer front') {
    this.__generateDrawerFromFront(part, spec, callback);
  } else if (spec.type === 'drawer' || part.label === 'drawer') {
    var minDepth = spec.minDepth || _.get(this.opts, ['drawer', 'minDepth']);
    minDepth = minDepth*Constants.metersToVirtualUnit;

    // console.log('got part', part);
    var obb = this.ensureOBBForPart(part);
    var halfSizes = obb.halfSizes;
    var m = Math.min(halfSizes.x, halfSizes.z);
    if (m < minDepth) {
      part.label = 'drawer front';
      this.__generateDrawerFromFront(part, spec, callback);
    } else {
      callback(null, null);
    }
  } else {
    callback(null, null);
  }
};

MissingGeometryGenerator.prototype.__generatePanelFromOBB = function(part, spec, object3D, objectOBB, callback) {
  var defaults = _.get(this.opts, ['panel']);
  var opts = _.defaults(Object.create(null), spec || {}, defaults);
  opts = toVirtualUnits(opts);
  console.log('got opts', opts);
  var thickness = opts.thickness;
  var obbField = this.obbField;
  var obb = part[obbField].clone();
  obb.ensureMinSize(thickness);

  var material = spec.material;
  if (!material && this.inferMaterial) {
    var sideDir = new THREE.Vector3(1, 0, 0);
    var raycaster = new THREE.Raycaster(objectOBB.position.clone(), sideDir);
    raycaster.ray.origin = objectOBB.position.clone().add(objectOBB.halfSizes.clone().multiply(new THREE.Vector3(-1.5, -1, 0)));

    material = this.inferMaterial(object3D, raycaster);
  }

  //var arrowHelper = new THREE.ArrowHelper(raycaster.ray.direction, raycaster.ray.origin, 100, 0xff0000);
  var mesh = obb.toMesh(material);
  //mesh.add(arrowHelper)

  callback(null, mesh);
};

MissingGeometryGenerator.prototype.__tryIntersectObject = function(raycaster, intersectTargets, obb, frontBackDir, flags) {
  var intersected = raycaster.intersectObjects(intersectTargets, true);
  if (intersected.length === 0) {
    // Try reverse direction
    frontBackDir.negate();
    intersected = raycaster.intersectObjects(intersectTargets, true);
    if (intersected.length) {
      obb.reverseNormal();
    }
  } else if (flags.checkReverseDirection) {
    // Try reverse direction
    raycaster.ray.direction = raycaster.ray.direction.clone().negate();
    var intersectedReverse = raycaster.intersectObjects(intersectTargets, true);
    // Put ray direction back
    raycaster.ray.direction = frontBackDir;
    if (intersectedReverse.length && intersectedReverse[0].distance < intersected[0].distance) {
      // Assume the dominantNormal should be reversed
      frontBackDir.negate();
      intersected = intersectedReverse;
      obb = obb.clone();
      obb.reverseNormal();
    } else {
      // The original direction is better
    }
  }
  return intersected;
};

/**
 * Generate drawer for part
 * @param part {Part} Part that we are generating missing geometry for
 * @param spec {Object} Geometry specification
 * @param callback
 */
MissingGeometryGenerator.prototype.__generateDrawerFromFront = function(part, spec, callback) {
  var checkReverseDirection = _.get(this.opts, ['_all_', 'checkReverseDirection']);
  var checkBounds = _.get(this.opts, ['_all_', 'checkBounds']);
  // console.log('got checkBounds, checkReverseDirection', checkBounds, checkReverseDirection);
  var defaults = _.get(this.opts, ['drawer']);
  var opts = _.defaults(Object.create(null), spec || {}, defaults);
  opts = toVirtualUnits(opts);
  // Generate drawer geometry based on just the front

  // This obb is in world coordinates
  var initialPartObb = this.ensureOBBForPart(part);
  // Let's have the part obb with y-up, x left-right, and +z be the front-to-back (-z is the front direction)
  var obb = initialPartObb.clone();
  // console.log('OBB', obb);
  var domIndex = obb.getDominantNormalIndex();
  if (domIndex === 1) {
    callback('Cannot generate drawer with dominant normal that is in the y direction', null);
    return;
  }
  obb.setDominantNormalComponentTo(2);
  domIndex = obb.getDominantNormalIndex();
  // console.log('got dominant normal index', domIndex);

  // Raycast from obb backward - make sure near is larger than the obb of the front
  var frontBackDir = obb.localDirToWorldDir(new THREE.Vector3(0,0,1));
  var raycaster = new THREE.Raycaster(obb.position.clone(), frontBackDir, Math.min(obb.halfSizes.x, obb.halfSizes.y)*2);
  //var raycaster = new THREE.Raycaster(obb.position.clone(), frontBackDir, obb.halfSizes.getComponent(domIndex)*2);
  raycaster.intersectBackFaces = true;

  var intersectTargets = [part.object3D];
  var intersected = this.__tryIntersectObject(raycaster, intersectTargets, obb, frontBackDir, { checkReverseDirection: checkReverseDirection });
  if (intersected.length === 0) {
    if (checkBounds) {
      const bbox = Object3DUtil.getBoundingBox(part.object3D);
      // console.log('checkBounds', bbox);
      const box = new MeshHelpers.BoxMinMax(bbox.min, bbox.max, 'white');
      box.updateMatrixWorld();
      intersectTargets.push(box);
      intersected = this.__tryIntersectObject(raycaster, intersectTargets, obb, frontBackDir, { checkReverseDirection: checkReverseDirection });
    }
  }
  frontBackDir = frontBackDir.clone();  // Make sure this is separate from the raycaster ray at this point

  //console.log('intersected', intersected);

  var gap = _.get(opts, ['gap']);
  var wgap = _.get(opts, ['wgap']);
  var hgap = _.get(opts, ['hgap']);
  var thickness = _.get(opts, ['thickness']);
  // up and left to right direction
  var upDir = new THREE.Vector3(0,1,0);
  var sideDir = frontBackDir.clone().cross(upDir);

  var depth = _.get(opts, ['depth']);
  var guessDepth = spec.depth == null; // depth not specified
  var usePoints = false;
  var points = _.get(opts, ['allowNonRectangular'])? [] : null;
  if (guessDepth && intersected.length) {
    // get drawer depth
    depth = intersected[0].distance;
    var initialDepth = depth;
    if (points) {
      points.push(intersected[0].point);
    }

    // Also try from sides
    obb.getWorldPosition(new THREE.Vector3(0,0.5,1), raycaster.ray.origin);
    raycaster.ray.origin.addScaledVector(sideDir, -thickness);
    var intersected1 = raycaster.intersectObject(part.object3D, true);
    //console.log('intersected1', raycaster.ray.origin, intersected1);
    if (intersected1.length) {
      depth = Math.min(depth, intersected1[0].distance);
      if (points) {
        points.unshift(intersected1[0].point);
        points.unshift(raycaster.ray.origin.clone());
        if (depth < initialDepth * 0.8) {
          usePoints = true;
        }
      }
    }
    obb.getWorldPosition(new THREE.Vector3(1,0.5,1), raycaster.ray.origin);
    raycaster.ray.origin.addScaledVector(sideDir, +thickness);
    var intersected2 = raycaster.intersectObject(part.object3D, true);
    //console.log('intersected2', raycaster.ray.origin, intersected2);
    if (intersected2.length) {
      depth = Math.min(depth, intersected2[0].distance);
      if (points) {
        points.push(intersected2[0].point);
        points.push(raycaster.ray.origin.clone());
        if (depth < initialDepth * 0.8) {
          usePoints = true;
        }
      }
    }
  }

  // Set position to be center of drawer
  // Start from back of the drawer front obb (assume domIndex is 2)
  var relBackFaceCenter = new THREE.Vector3(0.5, 0.5, 1);
  var position = obb.getWorldPosition(relBackFaceCenter);
  position.addScaledVector(frontBackDir, depth/2);

  // Check sides
  var halfwidth = Math.max(obb.halfSizes.x, obb.halfSizes.z);
  var halfheight = obb.halfSizes.y;
  var checkExtents = true;
  if (checkExtents) {
    raycaster.near = 0;
    raycaster.ray.origin.copy(position);
    raycaster.ray.direction.copy(sideDir);
    var sideIntersect = raycaster.intersectObject(part.object3D, true);
    var d1 = halfwidth;
    if (sideIntersect.length && sideIntersect[0].distance < halfwidth) {
      d1 = sideIntersect[0].distance;
    }
    raycaster.ray.direction.negate();
    sideIntersect = raycaster.intersectObject(part.object3D, true);
    var d2 = halfwidth;
    if (sideIntersect.length && sideIntersect[0].distance < halfwidth) {
      d2 = sideIntersect[0].distance;
    }
    halfwidth = Math.min(halfwidth, d1, d2);

    raycaster.ray.direction.set(0,1,0);
    sideIntersect = raycaster.intersectObject(part.object3D, true);
    d1 = halfheight;
    if (sideIntersect.length && sideIntersect[0].distance < halfheight) {
      d1 = sideIntersect[0].distance;
    }
    raycaster.ray.direction.negate();
    sideIntersect = raycaster.intersectObject(part.object3D, true);
    d2 = halfheight;
    if (sideIntersect.length && sideIntersect[0].distance < halfheight) {
      d2 = sideIntersect[0].distance;
    }
    halfheight = (d1+d2)/2;
    position.y += (d1-d2)/2;
  }

  var material = spec.material;
  if (!material && this.inferMaterial) {
    // raycast from center to front to get texture for inside of drawer
    raycaster.near = 0;
    raycaster.ray.origin.copy(position);
    raycaster.ray.direction.copy(frontBackDir).negate();
    material = this.inferMaterial(part.object3D, raycaster);
  }

  // Make rectangular box or polygonal box
  if (usePoints) {
    halfheight = halfheight - thickness/2;
    points = points.map(function(p) {
      p = p.clone();
      p.addScaledVector(frontBackDir, -thickness);
      p.sub(position);
      p.sub(new THREE.Vector3(0,halfheight,0)); // TODO: Assumes y
      return p;
    });
    var sides = ['bottom'];
    for (var i = 0; i < points.length - 1; i++) {
      sides.push('side_' + i);
    }
    var shapeOpts = {
      // width: 0.75, height: 0.5, depth: 1,
      points: points,
      height: halfheight * 2,
      thickness: thickness,
      position: position,
      sides: sides,
      material: material
    };
    this.__shapeGenerator.generateThickPolygonalPrism(shapeOpts, function (err, obj) {
      if (obj && obj.userData) {
        obj.userData.label = 'drawer';
        _.each(obj.children, function(x) {
          x.userData.label = obj.userData.label + ' ' + x.name;
        });
      }
      callback(err, obj);
    });

  } else {
    var rotation = obb.basis;
    var shapeOpts = {
      // width: 0.75, height: 0.5, depth: 1,
      width: halfwidth * 2 - gap - wgap,
      height: halfheight * 2 - gap -hgap,
      depth: depth - gap,
      thickness: thickness,
      position: position,
      rotation: rotation,
      gap: gap,
      sides: ['back', 'bottom', 'left', 'right'],
      material: material
    };
    this.__shapeGenerator.generateThickBox(shapeOpts, function (err, obj) {
      if (obj && obj.userData) {
        obj.userData.label = 'drawer';
        _.each(obj.children, function(x) {
          x.userData.label = obj.userData.label + ' ' + x.name;
        });
      }
      callback(err, obj);
    });
  }
};

MissingGeometryGenerator.DEFAULT_OPTIONS = defaultOpts;
MissingGeometryGenerator.InferMaterials = InferMaterials;

module.exports = MissingGeometryGenerator;