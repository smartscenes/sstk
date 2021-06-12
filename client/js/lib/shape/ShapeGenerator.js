var MaterialGenerator = require('materials/MaterialGenerator');
var Object3DUtil = require('geo/Object3DUtil');
var async = require('async');
var _ = require('util/util');

/**
 * Generate shapes
 * @namespace {shape}
 * @constructor
 */
function ShapeGenerator() {
  this.materialGenerator = new MaterialGenerator();
  this.generators = generators;
}

/**
 * Generate a fabulous shape composed of geometric components
 * @param opts {ShapeDescriptor}
 * @param callback {function(err,THREE.Object)}
 * @returns {*}
 */
ShapeGenerator.prototype.generate = function(opts, callback) {
  if (opts.parts) {
    var scope = this;
    var object = new THREE.Group();
    async.forEachOf(opts.parts, function(value,i,cb) {
      scope.generate(opts.parts[i], function(err, part) {
        if (part) {
          object.add(part);
        }
        if (opts.includeConnector) {
          if (i > 0) {
            var p0 = opts.parts[i - 1].position;
            var p1 = opts.parts[i].position;
            if (p0 && p1) {
              p0 = Object3DUtil.toVector3(p0);
              p1 = Object3DUtil.toVector3(p1);
              var rod = Object3DUtil.makeCylinder(p0, p1, 0.1, 'gray');
              object.add(rod);
            }
          }
        }
        cb(err, part);
      });
    }, function(err) {
      scope.__applyOptions(object, opts);
      if (callback) {
        callback(err, object);
      }
    });
    return object;
  } else {
    return this.__generateBasic(opts, callback);
  }
};

ShapeGenerator.prototype.__generateMaterial = function(opts) {
  var material = this.materialGenerator.generate(opts);
  return material;
};

ShapeGenerator.createMultiMaterialObject = function ( geometry, materials ) {
  // var group = new THREE.Group();
  // for ( var i = 0, l = materials.length; i < l; i ++ ) {
  //   group.add( new THREE.Mesh( geometry, materials[ i ] ) );
  // }
  // return group;
  if (materials.length === 1) {
    return new THREE.Mesh(geometry, materials[0]);
  } else {
    return new THREE.Mesh(geometry, materials);
  }
};

var generators = {
  'box': function (opts) {
    return ShapeGenerator.createMultiMaterialObject(
      // width, height, depth, widthSegments, heightSegments, depthSegments
      new THREE.BoxGeometry(opts.width || 80, opts.height || 80, opts.depth || 80,
        opts.widthSegments || 1, opts.heightSegments || 1, opts.depthSegments || 1), opts.materials);
  },
  'polygonal_prism': function(opts) {
    var shape = new THREE.Shape(opts.points);
    return ShapeGenerator.createMultiMaterialObject(
      new THREE.ExtrudeGeometry(shape,
        { depth: opts.depth, bevelEnabled: opts.bevelEnabled }), opts.materials);
  },
  'sphere': function (opts) {
    return ShapeGenerator.createMultiMaterialObject(
      // radius, widthSegments, heightSegments, phiStart, phiLength, thetaStart, thetaLength
      new THREE.SphereGeometry(opts.radius || 40,
        opts.widthSegments || 32, opts.heightSegments || 16), opts.materials);
  },
  'cylinder': function (opts) {
    return ShapeGenerator.createMultiMaterialObject(
      // radiusTop, radiusBottom, height, radialSegments, heightSegments, openEnded, thetaStart, thetaLength
      new THREE.CylinderGeometry(opts.radiusTop || opts.radius|| 40, opts.radiusBottom || opts.radius || 40, opts.height || 80,
        opts.radialSegments || 20, opts.heightSegments || 4), opts.materials);
  },
  'cone': function (opts) {
    return ShapeGenerator.createMultiMaterialObject(
      // radiusTop, radiusBottom, height, radialSegments, heightSegments, openEnded, thetaStart, thetaLength
      new THREE.CylinderGeometry(0, opts.radiusBottom || opts.radius || 40, opts.height || 80,
        opts.radialSegments || 20, opts.heightSegments || 4), opts.materials);
  },
  'pyramid': function (opts) {
    return ShapeGenerator.createMultiMaterialObject(
      // radiusTop, radiusBottom, height, radialSegments, heightSegments, openEnded, thetaStart, thetaLength
      new THREE.CylinderGeometry(0, opts.radiusBottom || opts.radius || 40, opts.height || 80,
        opts.radialSegments || 4, opts.heightSegments || 4), opts.materials);
  },
  'torus': function(opts) {
    return ShapeGenerator.createMultiMaterialObject(
      // radius - radius of entire torus
      // tube - diameter of tube (less than total radius)
      // radialSegments - sides per cylinder segment
      // tubularSegments - cylinders around torus ("sides")
      // arc
      new THREE.TorusGeometry(opts.radius || 40, opts.tube || 20,
        opts.radialSegments || 16, opts.tubularSegments || 40 ), opts.materials);
  }
};

ShapeGenerator.prototype.__applyOptions = function(shape, opts) {
  if (opts.name) {
    shape.name = opts.name;
  }
  shape.userData.shape = opts.shape;
  if (opts.transform) {
    Object3DUtil.setMatrix(opts.transform);
  } else {
    if (opts.scale) {
      shape.scale.copy(Object3DUtil.toVector3(opts.scale));
    }
    if (opts.scaleBy) {
      shape.scale.multiply(Object3DUtil.toVector3(opts.scaleBy));
    }
    if (opts.position) {
      shape.position.copy(Object3DUtil.toVector3(opts.position));
    }
    if (opts.rotation) {
      if (opts.rotation instanceof THREE.Matrix3) {
        shape.setRotationFromMatrix(opts.rotation);
      } else if (opts.rotation instanceof THREE.Matrix4) {
        shape.rotation.setFromRotationMatrix(opts.rotation);
      } else if (opts.rotation instanceof THREE.Quaternion) {
        shape.setRotationFromQuaternion(opts.rotation);
      } else {
        console.warn('ShapeGenerator: Unsupported rotation type', opts.rotation);
      }
    }
  }
};


ShapeGenerator.prototype.__generateBasic = function(opts, cb) {
  var generator = this.generators[opts.shape];
  if (generator) {
    var material = this.__generateMaterial(opts);
    var shape = generator(_.merge(Object.create(null), opts, { materials: [material]}));
    this.__applyOptions(shape, opts);
    if (cb) {
      cb(null, shape);
    }
    //console.log('generated basic shape', shape);
    return shape;
  } else {
    if (cb) {
      cb('Unsupported shape: ' + opts.shape);
    }
  }
};

module.exports = ShapeGenerator;

/**
 * Description for what kind of shape to generate
 * @typedef ShapeDescriptor
 * @type {object}
 * @property name {string}
 * @property transform {THREE.Matrix4} Full 4x4 matrix specifying the transform of the shape (overrides the `rotation`, `position`, `scale` and `scaleBy`)
 * @property rotation {THREE.Matrix3|THREE.Matrix4|THREE.Quaternion} Rotation to apply to shape
 * @property position {THREE.Vector3} Position of the shape
 * @property scale {THREE.Vector3} How to scale the shape
 * @property scaleBy {THREE.Vector3} Multiplier to the scale
 * @property parts {ShapeDescriptor[]}
 * @property includeConnector {boolean}
 * @property [texture] {string} Path to texture
 * @property [color] {string|int[]|THREE.Color} Color name or css hex
 * @property [colorNoise] {{h: number, s: number, l: number}} HSL spread of color
 * @property [material] {THREE.Material|THREE.MultiMaterial} Material
 */
