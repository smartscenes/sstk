var Constants = require('Constants');
var CompositeShapeGenerator = require('shape/CompositeShapeGenerator');
var Materials = require('materials/Materials');
var OBBFitter = require('geo/OBBFitter');
var async = require('async');
var _ = require('util/util');

var defaultOpts = {
  '_all_': { 'inferMaterial': true },
  'drawer': {
    'thickness': 0.0125 * Constants.metersToVirtualUnit,
    'depth': 0.5 * Constants.metersToVirtualUnit,
    'gap': 0.00001 * Constants.metersToVirtualUnit,
    'minDepth': 0.05 * Constants.metersToVirtualUnit,
    'allowNonRectangular': true,
  }
};

/**
 * Generates missing geometry for objects
 * @param opts options for how to generate geometry by label
 * @constructor
 */
function MissingGeometryGenerator(opts) {
  this.__shapeGenerator = new CompositeShapeGenerator();
  this.opts = opts || {};
  this.opts = _.defaultsDeep(this.opts, defaultOpts);
  this.inferMaterial = _.get(this.opts, ['_all_', 'inferMaterial']);
}

MissingGeometryGenerator.prototype.generateMissingGeometry = function(parts, callback) {
  if (!Array.isArray(parts)) { parts = [parts]; }
  var scope = this;
  async.mapSeries(parts, function (part, cb) {
    if (part) {
      scope.generateMissingGeometryForPart(part, cb);
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

MissingGeometryGenerator.prototype.ensureOBBForPart = function(part) {
  if (!part.obb && part.partMesh) {
    part.obb = OBBFitter.fitMeshOBB([part.partMesh], { constrainVertical: true });
  } else {
    console.error('No mesh geometry for part', part.id);
  }
};

/**
 * Generate missing geometry for part
 * @param part
 * @param part.label {string} Name of part
 * @param [part.partmesh] {THREE.Mesh} Part mesh (can be specified instead of OBB)
 * @param [part.obb] {OBB} Part OBB
 * @param [part.id] {string} Part id
 * @param [part.object3D] {THREE.Object3D} Entire object
 * @param callback
 */
MissingGeometryGenerator.prototype.generateMissingGeometryForPart = function(part, callback) {
  if (part.label === 'drawer front') {
    this.generateDrawerFromFront(part, callback);
  } else if (part.label === 'drawer') {
    var minDepth = _.get(this.opts, ['drawer', 'minDepth']);
    this.ensureOBBForPart(part);
    var halfSizes = part.obb.halfSizes;
    var m = Math.min(halfSizes.x, halfSizes.z);
    if (m < minDepth) {
      part.label = 'drawer front';
      this.generateDrawerFromFront(part, callback);
    } else {
      callback(null, null);
    }
  } else {
    callback(null, null);
  }
};

MissingGeometryGenerator.prototype.generateDrawerFromFront = function(part, callback) {
  // Generate drawer geometry based on just the front
  this.ensureOBBForPart(part);
  var obb = part.obb;
  //console.log('OBB', obb);
  // Raycast from obb backward - make sure near is larger than the obb of the front
  // Front back dir
  var frontBackDir = obb.dominantNormal().clone();
  var raycaster = new THREE.Raycaster(obb.position.clone(), frontBackDir, Math.min(obb.halfSizes.x, obb.halfSizes.y)*2);
  raycaster.intersectBackFaces = true;
  var intersected = raycaster.intersectObject(part.object3D, true);
  if (intersected.length === 0) {
    // Try reverse direction
    frontBackDir.negate();
    intersected = raycaster.intersectObject(part.object3D, true);
    obb = obb.clone();
    obb.reverseNormal();
  }
  //console.log('intersected', intersected);

  var gap = _.get(this.opts, ['drawer', 'gap']);
  var thickness = _.get(this.opts, ['drawer', 'thickness']);
  // up and left to right direction
  var upDir = new THREE.Vector3(0,1,0);
  var sideDir = frontBackDir.clone().cross(upDir);

  var depth = _.get(this.opts, ['drawer', 'depth']);
  var usePoints = false;
  var points = _.get(this.opts, ['drawer', 'allowNonRectangular'])? [] : null;
  if (intersected.length) {
    depth = intersected[0].distance;
    var initialDepth = depth;
    if (points) {
      points.push(intersected[0].point);
    }

    // Also try from sides
    obb.getWorldPosition(new THREE.Vector3(0,0.5,0.5), raycaster.ray.origin);
    raycaster.ray.origin.addScaledVector(sideDir, thickness/2);
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
    obb.getWorldPosition(new THREE.Vector3(1,0.5,0.5), raycaster.ray.origin);
    raycaster.ray.origin.addScaledVector(sideDir, -thickness/2);
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
  var position = obb.position.clone();
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

  var material = null;
  if (this.inferMaterial) {
    // raycast from center to front to get texture for inside of drawer
    raycaster.near = 0;
    raycaster.ray.origin.copy(position);
    raycaster.ray.direction.copy(frontBackDir).negate();
    var intersectedFront = raycaster.intersectObject(part.object3D, true);
    if (intersectedFront && intersectedFront.length) {
      material = Materials.getMaterialAtIntersected(intersectedFront[0]);
    }
  }

  // Make rectangular box or polygonal box
  if (usePoints) {
    points = points.map(function(p) {
      p = p.clone();
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
        obj.userData.parameters = _.pick(shapeOpts, ['width', 'height', 'depth', 'thickness', 'sides']);
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
      width: halfwidth * 2 - gap,
      height: halfheight * 2 - gap,
      depth: depth - gap,
      thickness: thickness,
      position: position,
      rotation: rotation,
      gap: gap,
      sides: ["back", "bottom", "left", "right"],
      material: material
    };
    this.__shapeGenerator.generateThickBox(shapeOpts, function (err, obj) {
      if (obj && obj.userData) {
        obj.userData.label = 'drawer';
        obj.userData.parameters = _.pick(shapeOpts, ['width', 'height', 'depth', 'thickness', 'sides']);
        _.each(obj.children, function(x) {
          x.userData.label = obj.userData.label + ' ' + x.name;
        });
      }
      callback(err, obj);
    });
  }
};

module.exports = MissingGeometryGenerator;
