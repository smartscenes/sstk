var MaterialGenerator = require('materials/MaterialGenerator');
var Object3DUtil = require('geo/Object3DUtil');
var _ = require('util');

function ShapeGenerator() {
  this.materialGenerator = new MaterialGenerator();
}

ShapeGenerator.prototype.generate = function(opts, cb) {
  if (opts.parts) {
    var object = new THREE.Group();
    for (var i = 0; i < opts.parts.length; i++) {
      var part = this.generate(opts.parts[i]);
      if (part) {
        object.add(part);
      }
      // if (i > 0) {
      //   var p0 = opts.parts[i-1].position;
      //   var p1 = opts.parts[i].position;
      //   if (p0 && p1) {
      //     p0 = Object3DUtil.toVector3(p0);
      //     p1 = Object3DUtil.toVector3(p1);
      //     var rod = Object3DUtil.makeCylinder(p0, p1, 0.1, 'gray');
      //     object.add(rod);
      //   }
      // }
    }
    return object;
  } else {
    return this.__generateBasic(opts, cb);
  }
};

ShapeGenerator.prototype.__generateMaterial = function(opts) {
  var material = this.materialGenerator.generate(opts);
  return material;
};

var generators = {
  'box': function (opts) {
    return THREE.SceneUtils.createMultiMaterialObject(
      // width, height, depth, widthSegments, heightSegments, depthSegments
      new THREE.BoxGeometry(opts.width || 80, opts.height || 80, opts.depth || 80,
        opts.widthSegments || 1, opts.heightSegments || 1, opts.depthSegments || 1), opts.materials);
  },
  'sphere': function (opts) {
    return THREE.SceneUtils.createMultiMaterialObject(
      // radius, widthSegments, heightSegments, phiStart, phiLength, thetaStart, thetaLength
      new THREE.SphereGeometry(opts.radius || 40,
        opts.widthSegments || 32, opts.heightSegments || 16), opts.materials);
  },
  'cylinder': function (opts) {
    return THREE.SceneUtils.createMultiMaterialObject(
      // radiusTop, radiusBottom, height, radialSegments, heightSegments, openEnded, thetaStart, thetaLength
      new THREE.CylinderGeometry(opts.radiusTop || opts.radius|| 40, opts.radiusBottom || opts.radius || 40, opts.height || 80,
        opts.radialSegments || 20, opts.heightSegments || 4), opts.materials);
  },
  'cone': function (opts) {
    return THREE.SceneUtils.createMultiMaterialObject(
      // radiusTop, radiusBottom, height, radialSegments, heightSegments, openEnded, thetaStart, thetaLength
      new THREE.CylinderGeometry(0, opts.radiusBottom || opts.radius || 40, opts.height || 80,
        opts.radialSegments || 20, opts.heightSegments || 4), opts.materials);
  },
  'pyramid': function (opts) {
    return THREE.SceneUtils.createMultiMaterialObject(
      // radiusTop, radiusBottom, height, radialSegments, heightSegments, openEnded, thetaStart, thetaLength
      new THREE.CylinderGeometry(0, opts.radiusBottom || opts.radius || 40, opts.height || 80,
        opts.radialSegments || 4, opts.heightSegments || 4), opts.materials);
  },
  'torus': function(opts) {
    return THREE.SceneUtils.createMultiMaterialObject(
      // radius - radius of entire torus
      // tube - diameter of tube (less than total radius)
      // radialSegments - sides per cylinder segment
      // tubularSegments - cylinders around torus ("sides")
      // arc
      new THREE.TorusGeometry(opts.radius || 40, opts.tube || 20,
        opts.radialSegments || 16, opts.tubularSegments || 40 ), opts.materials);
  }
};

ShapeGenerator.prototype.__generateBasic = function(opts, cb) {
  var generator = generators[opts.shape];
  if (generator) {
    var material = this.__generateMaterial(opts);
    var shape = generator(_.merge(Object.create(null), opts, { materials: [material]}));
    if (opts.name) {
      shape.name = opts.name;
    }
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
        } else if (opts.rotation instanceof THREE.Quaternion) {
          shape.setRotationFromQuaternion(opts.rotation);
        }
      }
    }
    if (cb) {
      cb(null, shape);
    }
    return shape;
  } else {
    if (cb) {
      cb('Unsupported shape: ' + opts.shape);
    }
  }
};

module.exports = ShapeGenerator;