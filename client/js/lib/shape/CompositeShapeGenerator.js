var Constants = require('Constants');
var Object3DUtil = require('geo/Object3DUtil');
var ShapeGenerator = require('shape/ShapeGenerator');
var _ = require('util/util');

function CompositeShapeGenerator() {
  ShapeGenerator.call(this);
}

CompositeShapeGenerator.prototype = Object.create(ShapeGenerator.prototype);
CompositeShapeGenerator.prototype.constructor = CompositeShapeGenerator;

/**
 * Creates a rectangular box with slabs as sides
 * The box is width x height x depth with each slab having a thickness
 * The height of the sides are decreased by thickness (top/bottom are width x depth)
 * The width of front/back are decreased by thickness (left/right are full depth)
 * @param opts
 * @param opts.thickness {number} how thick each slab should be
 * @param opts.height {number} height of the box
 * @param opts.depth {number} depth of the box
 * @param opts.width {number} width of the box
 * @param [opts.gap] {number} a bit of gap to leave to avoid z-fighting
 *
 * @param [opts.sides] {string[]} What sides to generate (default is all)
 *
 * @param [opts.name] {string} Name of the generated shape
 * @param [opts.transform] {THREE.Matrix4} Full 4x4 matrix specifying the transform of the shape (overrides the `rotation`, `position`, `scale` and `scaleBy`)
 * @param [opts.rotation] {THREE.Matrix3|THREE.Matrix4|THREE.Quaternion} Rotation to apply to shape
 * @param [opts.position] {THREE.Vector3} Position of the shape (center of the box)
 * @param [opts.scale] {THREE.Vector3} How to scale the shape
 * @param [opts.scaleBy] {THREE.Vector3} Multiplier to the scale
 *
 * @param [opts.material] {THREE.Material} material to use on the box
 * @param [opts.color] {THREE.Color} color to use on the box
 *
 * @param cb
 * @returns {*}
 */
CompositeShapeGenerator.prototype.generateThickBox = function(opts, cb) {
  var g = 2*(opts.gap || 0);
  var parts = [ {
    name: "left",
    shape: "box",
    material: opts.material,
    color: opts.color || "orange",
    width: opts.thickness,
    height: opts.height - 2*opts.thickness - g,
    depth: opts.depth - g,
    position: [-opts.width/2 + opts.thickness/2, 0, 0],
  }, {
    name: "right",
    shape: "box",
    material: opts.material,
    color: opts.color || "red",
    width: opts.thickness,
    height: opts.height - 2*opts.thickness - g,
    depth: opts.depth - g,
    position: [+opts.width/2 - opts.thickness/2, 0, 0],
  },
  {
    name: "top",
    shape: "box",
    material: opts.material,
    color: opts.color || "white",
    width: opts.width,
    height: opts.thickness,
    depth: opts.depth,
    position: [0, +opts.height/2 - opts.thickness/2, 0],
  },
  {
    name: "bottom",
    shape: "box",
    material: opts.material,
    color: opts.color || "black",
    width: opts.width,
    height: opts.thickness,
    depth: opts.depth,
    position: [0, -opts.height/2 + opts.thickness/2, 0],
  },
  {
    name: "front",
    shape: "box",
    material: opts.material,
    color: opts.color || "blue",
    width: opts.width - 2*opts.thickness - g,
    height: opts.height - 2*opts.thickness - g,
    depth: opts.thickness,
    position: [0, 0, -opts.depth/2 + opts.thickness/2],
  },
  {
    name: "back",
    shape: "box",
    material: opts.material,
    color: opts.color || "green",
    width: opts.width - 2*opts.thickness - g,
    height: opts.height - 2*opts.thickness - g,
    depth: opts.thickness,
    position: [0, 0, +opts.depth/2 - opts.thickness/2],
  }];
  if (opts.sides) {
    parts = parts.filter(function(x) { return opts.sides.indexOf(x.name) >= 0; });
  }
  var shapeOpts = _.pick(opts, ['name', 'transform', 'scale', 'scaleBy', 'position', 'rotation']);
  shapeOpts.parts = parts;
  return this.generate(shapeOpts, (err, obj) => {
    if (obj && obj.userData) {
      obj.userData.shape = 'thickBox';
      obj.userData.shapeParameters = _.pick(opts, ['width', 'height', 'depth', 'thickness', 'gap', 'sides']);
      obj.userData.shapeParameters.position = opts.position? opts.position.toArray() : undefined;
      obj.userData.shapeParameters.rotation = opts.rotation? opts.rotation.toArray() : undefined;
      // TODO: handle material / color
    }
    cb(err, obj);
  });
};

/**
 * Creates a polygonal prism (a polygonal box) with slabs as sides
 * The box is width x height x depth with each slab having a thickness
 * The height of the sides are decreased by thickness (top/bottom are width x depth)
 * The depth of left/right sides are decreased by thickness (front/back are width wide)
 * @param opts*
 * @param opts.points {THREE.Vector3[]} array of points defining the polygon
 * @param opts.height {number} height of the box
 * @param opts.thickness {number} how thick each slab should be
 * @param [opts.gap] {number} a bit of gap to leave to avoid z-fighting
 *
 * @param [opts.sides] {string[]} What sides to generate (default is all)
 *
 * @param [opts.name] {string} Name of the generated shape
 * @param [opts.transform] {THREE.Matrix4} Full 4x4 matrix specifying the transform of the shape (overrides the `rotation`, `position`, `scale` and `scaleBy`)
 * @param [opts.rotation] {THREE.Matrix3|THREE.Matrix4|THREE.Quaternion} Rotation to apply to shape
 * @param [opts.position] {THREE.Vector3} Position of the shape (center of the box)
 * @param [opts.scale] {THREE.Vector3} How to scale the shape
 * @param [opts.scaleBy] {THREE.Vector3} Multiplier to the scale
 *
 * @param [opts.material] {THREE.Material} material to use on the box
 * @param [opts.color] {THREE.Color} color to use on the box
 *
 * @param cb
 * @returns {*}
 */
CompositeShapeGenerator.prototype.generateThickPolygonalPrism = function(opts, cb) {
  var parts = [];
  var frontDir = new THREE.Vector3();
  var upDir = Constants.worldUp;
  for (var i = 0; i < opts.points.length; i++) {
    var p1 = opts.points[i];
    var p2 = opts.points[(i+1) % opts.points.length];
    var width = p1.distanceTo(p2);
    // Take start --> end to be right, front to be normal
    var startToEnd = p2.clone().sub(p1).normalize();
    frontDir.crossVectors(startToEnd, upDir).normalize();
    var alignMatrix = Object3DUtil.getAlignmentMatrix(new THREE.Vector3(0,1,0), new THREE.Vector3(0,0,1),
      upDir, frontDir);

    var centerTo = p1.clone().add(p2).multiplyScalar(0.5);
    centerTo.add(upDir.clone().multiplyScalar(opts.height / 2));
    alignMatrix.setPosition(centerTo);
    parts.push({
      name: "side_" + i,
      shape: "box",
      material: opts.material,
      color: opts.color || "orange",
      width: width,
      height: opts.height - opts.thickness,
      depth: opts.thickness,
      position: centerTo,
      rotation: alignMatrix
    });
  }
  var alignMatrix2 = Object3DUtil.getAlignmentMatrix(
    new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, -1, 0),
    upDir, Constants.worldFront
  );

  var points2D = opts.points.map(function(p) { return new THREE.Vector2(p.x, p.z); });
  parts.push(
    {
      name: "top",
      shape: "polygonal_prism",
      material: opts.material,
      color: opts.color || "white",
      points: points2D,
      depth: opts.thickness,
      bevelEnabled: false,
      rotation: alignMatrix2,
      position: [0, +opts.height/2 - opts.thickness/2, 0],
    });
  parts.push(
    {
      name: "bottom",
      shape: "polygonal_prism",
      material: opts.material,
      color: opts.color || "black",
      points: points2D,
      depth: opts.thickness,
      bevelEnabled: false,
      rotation: alignMatrix2,
      position: [0, -opts.height/2 + opts.thickness/2, 0],
    });
  if (opts.sides) {
    parts = parts.filter(function(x) { return opts.sides.indexOf(x.name) >= 0; });
  }
  var shapeOpts = _.pick(opts, ['name', 'transform', 'scale', 'scaleBy', 'position', 'rotation']);
  shapeOpts.parts = parts;
  return this.generate(shapeOpts, (err, obj) => {
    if (obj && obj.userData) {
      obj.userData.shape = 'thickPolygonPrism';
      obj.userData.shapeParameters = _.pick(opts, ['points', 'height', 'thickness', 'sides']);
      obj.userData.shapeParameters.points = opts.points.map(p => p.toArray());
      obj.userData.shapeParameters.position = opts.position? opts.position.toArray() : undefined;
      obj.userData.shapeParameters.rotation = opts.rotation? opts.rotation.toArray() : undefined;
      // TODO: handle material / color
    }
    cb(err, obj);
  });
};

CompositeShapeGenerator.prototype.generate = function(opts, callback) {
  if (opts.parameters) {
    if (opts.shape === 'thickBox') {
      return this.generateThickBox(opts.parameters, callback);
    } else if (opts.shape === 'thickPolygonPrism') {
      return this.generateThickPolygonalPrism(opts.parameters, callback);
    }
  } else {
    return ShapeGenerator.prototype.generate.call(this, opts, callback);
  }
};

module.exports = CompositeShapeGenerator;