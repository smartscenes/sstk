'use strict';

var GeometryUtil = require('geo/GeometryUtil');
var _ = require('util');

// Patch THREE.Box2 with legacy function names
if (!_.isFunction(THREE.Box2.prototype.intersects)) {
  THREE.Box2.prototype.intersects = function (box) {
    return this.intersectsBox(box);
  };
}
if (!_.isFunction(THREE.Box2.prototype.includeBBox)) {
  THREE.Box2.prototype.includeBBox = function (box) {
    return this.union(box);
  };
}
if (!_.isFunction(THREE.Box2.prototype.contains)) {
  THREE.Box2.prototype.contains = function (box) {
    return this.containsBox(box);
  };
}

/**
 * Axis aligned bounding box
 * @memberOf geo
 * @param min {THREE.Vector3}
 * @param max {THREE.Vector3}
 * @constructor
 */
function BBox(min, max) {
  this.min = min || new THREE.Vector3(Infinity, Infinity, Infinity);
  this.max = max || new THREE.Vector3(-Infinity, -Infinity, -Infinity);
}

BBox.prototype.clone = function () {
  var bbox = new BBox();
  bbox.copy(this);
  return bbox;
};

BBox.prototype.copy = function (bbox) {
  this.min.copy(bbox.min);
  this.max.copy(bbox.max);
  this.clearCache();
};

BBox.prototype.valid = function () {
  if (!isFinite(this.min.x)) return false;
  if (!isFinite(this.min.y)) return false;
  if (!isFinite(this.min.z)) return false;
  if (!isFinite(this.max.x)) return false;
  if (!isFinite(this.max.y)) return false;
  if (!isFinite(this.max.z)) return false;
  return (this.min.x <= this.max.x) && (this.min.y <= this.max.y) && (this.min.z <= this.max.z);
};

BBox.prototype.fromCenterRadius = function (cx, cy, cz, rx, ry, rz) {
  this.min.x = cx - rx;
  this.min.y = cy - ry;
  this.min.z = cz - rz;
  this.max.x = cx + rx;
  this.max.y = cy + ry;
  this.max.z = cz + rz;
  this.clearCache();
};

BBox.prototype.fromCenterRadiusArray = function (arr) {
  this.fromCenterRadius(arr[0], arr[1], arr[2], arr[3], arr[4], arr[5]);
};

BBox.prototype.includeBBox = function (bbox) {
  this.__includePoint(bbox.min);
  this.__includePoint(bbox.max);
  this.clearCache();
};

BBox.prototype.includeLine = function (line, transform) {
  var scope = this;
  GeometryUtil.forMeshVertices(line, function (v) {
      scope.__includePoint(v, transform);
    }
  );
  this.clearCache();
};

BBox.prototype.includeMesh = function (mesh, transform) {
  var nFaces = GeometryUtil.getGeometryFaceCount(mesh.geometry);
  if (nFaces > 0) {
    var scope = this;
    GeometryUtil.forMeshVertices(mesh, function (v) {
        scope.__includePoint(v, transform);
      }
    );
    // Three.js code to help compute bounding box
    // Here for comparison, we shouldn't be slower
    //var bboxHelper = new THREE.BoundingBoxHelper(mesh);
    //bboxHelper.update();
    //this.includeBBox(bboxHelper.box);
    //        } else {
    //            console.warn("Skipping mesh with no faces");
    //            console.log(mesh);
  }
  this.clearCache();
};

BBox.prototype.includePoints = function (points, transform) {
  var scope = this;
  GeometryUtil.forMeshVertices(points, function (v) {
      scope.__includePoint(v, transform);
    }
  );
  this.clearCache();
};

BBox.prototype.includeObject3D = function (root, transform, filter) {
  if (filter && !filter(root)) {
    //console.log("filtering out ", root.userData);
    return;  // root didn't pass filter (skip)
  }
  root.updateMatrixWorld();
  // NOTE: We don't use the three.js bbox helper because
  //   we filter out vertices that are not part of faces
  //   (the filtering can also be done when loading models)
  //var bboxHelper = new THREE.BoundingBoxHelper(root);
  //bboxHelper.update();
  //this.includeBBox(bboxHelper.box);
  var bbox = new BBox();
  if (root instanceof THREE.Mesh) {
    bbox.includeMesh(root, transform);
  } else if (root instanceof THREE.Line) {
    bbox.includeLine(root, transform);
  } else if (root instanceof THREE.Points) {
    bbox.includePoints(root, transform);
  }
  if (root.children) {
    for (var i = 0; i < root.children.length; i++) {
      var child = root.children[i];
      var include = !(child instanceof THREE.Camera);
      if (include) {
        var childBBox = new BBox();
        childBBox.includeObject3D(root.children[i], transform, filter);
        if (childBBox.valid()) bbox.includeBBox(childBBox);
      }
    }
  }
  this.includeBBox(bbox);
};

// Return world position given relative point, center is (0.5,0.5,0.5)
BBox.prototype.getWorldPosition = function (relPoint) {
  if (relPoint) {
    var x = (1.0 - relPoint.x) * this.min.x + relPoint.x * this.max.x;
    var y = (1.0 - relPoint.y) * this.min.y + relPoint.y * this.max.y;
    var z = (1.0 - relPoint.z) * this.min.z + relPoint.z * this.max.z;
    var p = new THREE.Vector3(x, y, z);
    return p;
  } else {
    return this.centroid();
  }
};

BBox.prototype.centroid = function () {
  var centroid = new THREE.Vector3();
  centroid.addVectors(this.min, this.max);
  centroid.multiplyScalar(0.5);
  return centroid;
};

BBox.prototype.radius = function () {
  return this.min.distanceTo(this.max) / 2;
};

BBox.prototype.contains = function (p) {
  if (p instanceof BBox) {
    return this.contains(p.min) && this.contains(p.max);
  } else {
    return !(p.x < this.min.x || p.x > this.max.x ||
      p.y < this.min.y || p.y > this.max.y ||
      p.z < this.min.z || p.z > this.max.z);
  }
};

BBox.prototype.closestPoint = function (p, out) {
  var v = out || new THREE.Vector3();
  v.copy(p);
  v.clamp(this.min, this.max);
  return v;
};

BBox.prototype.closestBoundaryPoint = function (p, out) {
  var v = this.closestPoint(p, out);
  var max = this.max, min = this.min;
  var dists = [
    ['max','x', Math.abs(v.x - max.x)], ['min', 'x', Math.abs(v.x - min.x)],
    ['max','y', Math.abs(v.y - max.y)], ['min', 'y', Math.abs(v.y - min.y)],
    ['max','z', Math.abs(v.z - max.z)], ['min', 'z', Math.abs(v.z - min.z)]
  ];
  var minDist = _.minBy(dists, function (d) { return d[2]; });
  v[minDist[1]] = this[minDist[0]][minDist[1]];
  return v;
};

BBox.prototype.distanceToPoint = function (p, opt) {
  if (opt === 'clamped') {
    return this.closestPoint(p).sub(p).length();
  } else if (opt === 'signed') {
    var d = this.closestBoundaryPoint(p).sub(p).length();
    if (this.contains(p)) {
      d = -d;
    }
    return d;
  } else {
    return this.closestBoundaryPoint(p).sub(p).length();
  }
};

// Assymetric (i.e. forward / directed ) Hausdorff distance from this to bbox
BBox.prototype.hausdorffDistanceDirected = function (bbox, opt) {
  var corners = this.getCorners();
  var maxDist = -Infinity;
  for (var i = 0; i < 8; ++i) {
    var p = corners[i];
    var distToP = bbox.distanceToPoint(p, opt);
    if (distToP > maxDist) {
      maxDist = distToP;
    }
  }
  return maxDist;
};

// Symmetric Hausdorff distance between this and bbox
BBox.prototype.hausdorffDistance = function (bbox, opt) {
  var dAB = this.hausdorffDistanceDirected(bbox, opt);
  var dBA = bbox.hausdorffDistanceDirected(this, opt);
  //console.log(dAB, dBA);
  if (dAB > dBA) { return dAB; } else { return dBA; }
};

BBox.prototype.distanceTo = function (bbox) {
  var ca = this.centroid();
  var cb = bbox.centroid();
  var ha = this.dimensions().multiplyScalar(0.5);
  var hb = bbox.dimensions().multiplyScalar(0.5);
  var dc = ca.sub(cb);
  dc.x = Math.abs(dc.x);  dc.y = Math.abs(dc.y);  dc.z = Math.abs(dc.z);
  var hh = ha.add(hb);
  var d = dc.sub(hh);
  var isInside = d.x < 0 && d.y < 0 && d.z < 0;
  var clampedD = new THREE.Vector3(Math.max(0, d.x), Math.max(0, d.y), Math.max(0, d.z));
  return isInside ? 0 : clampedD.length();
};

BBox.prototype.dimensions = function () {
  var dims = new THREE.Vector3();
  dims.subVectors(this.max, this.min);
  return dims;
};

BBox.prototype.volume = function() {
  var dims = this.dimensions();
  return dims.x * dims.y * dims.z;
};

BBox.prototype.maxDim = function () {
  var dims = this.dimensions();
  var maxDim = Math.max(dims.x, dims.y, dims.z);
  return maxDim;
};

BBox.prototype.maxDimAxisName = function () {
  var dims = this.dimensions();
  var dimsWithNames = [['x', dims.x], ['y', dims.y], ['z', dims.z]];
  var maxDim = _.maxBy(dimsWithNames, function (d) { return d[1]; });
  return maxDim[0];
};

BBox.prototype.includePoint = function (point, transform) {
  this.__includePoint(point, transform);
  this.clearCache();
};

BBox.prototype.__includePoint = function (point, transform) {
  // Private version (cache not cleared)
  var p = point;
  if (transform) {
    p = point.clone();
    p.applyMatrix4(transform);
  }

  this.min.min(p);
  this.max.max(p);
  //this.min.x = Math.min(this.min.x, point.x);
  //this.min.y = Math.min(this.min.y, point.y);
  //this.min.z = Math.min(this.min.z, point.z);

  //this.max.x = Math.max(this.max.x, point.x);
  //this.max.y = Math.max(this.max.y, point.y);
  //this.max.z = Math.max(this.max.z, point.z);
};

// NOTE: This function is not right, can't multiply min/max by transform and still get bbox!  But who uses it?
BBox.prototype.transform = function (matrix) {
  console.warn('STK - BBox transform is deprecated!!!');
  var bbox = new BBox();
  bbox.copy(this);
  bbox.min.applyMatrix4(matrix);
  bbox.max.applyMatrix4(matrix);
  return bbox;
};

// Create bbox by transforming corners.  NOTE: This may result in much larger bbox!!!!
BBox.prototype.toTransformedBBox = function (matrix) {
  var bbox = new BBox();
  var corners = this.getCorners();
  for (var i = 0; i < corners.length; i++) {
    bbox.__includePoint(corners[i], matrix);
  }
  return bbox;
};

BBox.prototype.scaleBy = function (scale) {
  var center = this.centroid();
  var extents = this.dimensions().multiplyScalar(scale * 0.5);
  var bbox = new BBox();
  bbox.fromCenterRadius(center.x, center.y, center.z, extents.x, extents.y, extents.z);
  return bbox;
};

BBox.prototype.expandBy = function (delta) {
  var center = this.centroid();
  var extents = (delta instanceof THREE.Vector3)?
    this.dimensions().multiplyScalar(0.5).add(delta) :
    this.dimensions().multiplyScalar(0.5).addScalar(delta);
  var bbox = new BBox();
  bbox.fromCenterRadius(center.x, center.y, center.z, extents.x, extents.y, extents.z);
  return bbox;
};

BBox.prototype.sample = function(rng, out) {
  out = out || new THREE.Vector3();
  var bbdims = this.dimensions();
  var a = rng.random() * bbdims.x + this.min.x;
  var b = rng.random() * bbdims.y + this.min.y;
  var c = rng.random() * bbdims.z + this.min.z;
  out.set(a,b,c);
  return out;
};

BBox.prototype.clearCache = function () {
  delete this.corners;
  delete this.faceCenters;
};

BBox.prototype.__updateCorners = function (force) {
  var compute = force;
  if (!this.corners) {
    this.corners = [];
    for (var i = 0; i < 8; i++) {
      this.corners[i] = new THREE.Vector3();
    }
    compute = true;
  }

  if (compute) {
    this.corners[0].x = this.min.x;
    this.corners[0].y = this.min.y;
    this.corners[0].z = this.min.z;
    this.corners[1].x = this.min.x;
    this.corners[1].y = this.min.y;
    this.corners[1].z = this.max.z;
    this.corners[2].x = this.min.x;
    this.corners[2].y = this.max.y;
    this.corners[2].z = this.min.z;
    this.corners[3].x = this.min.x;
    this.corners[3].y = this.max.y;
    this.corners[3].z = this.max.z;
    this.corners[4].x = this.max.x;
    this.corners[4].y = this.min.y;
    this.corners[4].z = this.min.z;
    this.corners[5].x = this.max.x;
    this.corners[5].y = this.min.y;
    this.corners[5].z = this.max.z;
    this.corners[6].x = this.max.x;
    this.corners[6].y = this.max.y;
    this.corners[6].z = this.min.z;
    this.corners[7].x = this.max.x;
    this.corners[7].y = this.max.y;
    this.corners[7].z = this.max.z;
  }
};

BBox.prototype.getCorners = function (force) {
  this.__updateCorners(force);
  return this.corners;
};

BBox.prototype.__updateFaceCenters = function (force) {
  var compute = force;
  if (!this.faceCenters) {
    this.faceCenters = [];
    for (var i = 0; i < 6; i++) {
      this.faceCenters[i] = new THREE.Vector3();
    }
    compute = true;
  }
  if (compute) {
    var centroid = this.centroid();
    for (var i = 0; i < 6; i++) {
      this.faceCenters[i].copy(centroid);
    }
    this.faceCenters[0].x = this.min.x;
    this.faceCenters[1].x = this.max.x;
    this.faceCenters[2].y = this.min.y;
    this.faceCenters[3].y = this.max.y;
    this.faceCenters[4].z = this.min.z;
    this.faceCenters[5].z = this.max.z;
  }
};

BBox.prototype.getFaceCenters = function (force, copy) {
  this.__updateFaceCenters(force);
  if (!copy) {
    return this.faceCenters;
  } else {
    // Returns copy of face centers (in case it gets mutated...)
    var faceCentersCopy = [];
    for (var i = 0; i < this.faceCenters.length; i++) {
      faceCentersCopy[i] = this.faceCenters[i].clone();
    }
    return faceCentersCopy;
  }
};

BBox.prototype.getFaceDims = function () {
  var dims = this.dimensions();
  return BBox.getFaceDims(dims);
};

BBox.prototype.closestCorner = function (point) {
  this.__updateCorners();
  var mindist = Infinity;
  var minpointi = -1;
  for (var i = 0; i < 8; i++) {
    var dist = this.corners[i].distanceTo(point);
    if (dist < mindist) {
      mindist = dist;
      minpointi = i;
    }
  }
  return this.corners[minpointi];
};

BBox.prototype.surfaceArea = function () {
  // this is the surfaceArea of the BOX, not the
  // mesh surface
  var dx = this.max.x - this.min.x;
  var dy = this.max.y - this.min.y;
  var dz = this.max.z - this.min.z;
  var area = 2 * (dx * dy + dx * dz + dy * dz);
  return area;
};

BBox.prototype.isEq = function (box2) {
  // Tests if two BBoxes are (approximately) equal
  // and returns a boolean answer
  var epsilon = 10;
  var differences = [];
  differences.push(this.max.x - box2.max.x);
  differences.push(this.max.y - box2.max.y);
  differences.push(this.max.z - box2.max.z);
  differences.push(this.min.x - box2.min.x);
  differences.push(this.min.y - box2.min.y);
  differences.push(this.min.z - box2.min.z);
  for (var i in differences) {
    if (Math.abs(differences[i]) > epsilon) {
      return false;
    }
  }
  return true;
};

// Tests whether this BBox intersects BBox b
BBox.prototype.intersects = function (b) {
  var ca = this.max.clone().add(this.min).multiplyScalar(0.5);
  var cb = b.max.clone().add(b.min).multiplyScalar(0.5);
  var d = new THREE.Vector3();
  d.subVectors(ca, cb);  // delta vector
  var ha = this.max.clone().sub(this.min).multiplyScalar(0.5);
  var hb = b.max.clone().sub(b.min).multiplyScalar(0.5);
  var h = new THREE.Vector3();
  h.addVectors(ha, hb);  // sum of half-widths

  if (Math.abs(d.x) > h.x) return false;
  if (Math.abs(d.y) > h.y) return false;
  if (Math.abs(d.z) > h.z) return false;
  return true; // boxes overlap
};

// Intersection of this BBox with BBox b or null if none
BBox.prototype.intersection = function (b) {
  var min = this.min.clone().max(b.min);
  var max = this.max.clone().min(b.max);
  var intersection = new BBox(min, max);
  if (intersection.valid()) {
    return intersection;
  } else {
    return null;
  }
};

BBox.prototype.intersection2 = function (a,b) {
  this.min.copy(a.min).max(b.min);
  this.max.copy(a.max).min(b.max);
  if (this.valid()) return this;
  else return null;
};

// Union of this BBox with BBox b
BBox.prototype.union = function (b) {
  var min = this.min.clone().min(b.min);
  var max = this.max.clone().max(b.max);
  return new BBox(min, max);
};

BBox.prototype.union2 = function(a,b) {
  this.min.copy(a.min).min(b.min);
  this.max.copy(a.max).max(b.max);
  return this;
};

BBox.prototype.toBox2 = function (axisToRemove) {
  if (!axisToRemove) {
    console.error('[BBox.toBox2] specify axisToRemove');
    return null;
  }
  var min = THREE.Vector2();
  var max = THREE.Vector2();
  switch (axisToRemove) {
    case 'z':
      min.x = this.min.x;  min.y = this.min.y;
      max.x = this.max.x;  max.y = this.max.y;
      break;
    case 'y':
      min.x = this.min.x;  min.z = this.min.z;
      max.x = this.max.x;  max.z = this.max.z;
      break;
    case 'x':
      min.y = this.min.y;  min.z = this.min.z;
      max.y = this.max.y;  max.z = this.max.z;
      break;
  }
  return new THREE.Box2(min, max);
};

// Return isoperimetric quotient (IQ) of BBox: 0 <= IQ <= 1 (cube)
// measures closeness of BBox to perfect cube
BBox.prototype.isoperimetricQuotient = function () {
  var dims = this.dimensions();
  var S = this.surfaceArea();
  var V = dims.x * dims.y * dims.z;
  return 216.0 * V * V / Math.pow(S, 3);
};

BBox.prototype.toString = function() {
  function vtoString(v) {
    return '[' + v.x + ',' + v.y + ',' + v.z + ']';
  }
  return '{ min: ' + vtoString(this.min) + ', max: ' + vtoString(this.max) +
    ', dims: ' + vtoString(this.dimensions()) + ', centroid: ' + vtoString(this.centroid()) + '}';
};

BBox.prototype.toJSON = function (name) {
  var json = {};
  if (name) {
    json.name = name;
  }
  json.min = [this.min.x, this.min.y, this.min.z];
  json.max = [this.max.x, this.max.y, this.max.z];
  return json;
};

BBox.getVolume = function(bb) {
  return bb? bb.volume() : 0;
};

BBox.getIntersectionMeasure = (function() {
  var tmp = new BBox();
  return function(bb1, bb2, opts) {
    opts = opts || {};
    var measureFn = opts.measure || BBox.getVolume;
    var intersection = tmp.intersection2(bb1, bb2);
    if (intersection) {
      return measureFn(intersection);
    } else {
      return 0;
    }
  };
})();

BBox.getUnionMeasure = (function() {
  var tmp = new BBox();
  return function(bb1, bb2, opts) {
    opts = opts || {};
    var measureFn = opts.measure || BBox.getVolume;
    var union = tmp.union2(bb1, bb2);
    if (union) {
      return measureFn(union);
    } else {
      return 0;
    }
  };
})();

BBox.getOverlapRatio = function(bb1, bb2, opts) {
  opts = opts || {};
  var measureFn = opts.measure || BBox.getVolume;
  var intersectValue = BBox.getIntersectionMeasure(bb1, bb2, opts);
  var bb1Value = measureFn(bb1);
  return _.safeDivide(intersectValue, bb1Value, 0);
};

BBox.getJaccardOverlapRatio = function(bb1, bb2, opts) {
  opts = opts || {};
  var intersectValue = BBox.getIntersectionMeasure(bb1, bb2, opts);
  var unionValue = BBox.getUnionMeasure(bb1, bb2, opts);
  return _.safeDivide(intersectValue, unionValue, 0);
};

BBox.getFaceDims = function(dims) {
  var faceDims = [];
  faceDims[0] = new THREE.Vector2(dims.y, dims.z);
  faceDims[1] = faceDims[0];
  faceDims[2] = new THREE.Vector2(dims.x, dims.z);
  faceDims[3] = faceDims[2];
  faceDims[4] = new THREE.Vector2(dims.x, dims.y);
  faceDims[5] = faceDims[4];
  return faceDims;
};

// Exports
module.exports = BBox;
