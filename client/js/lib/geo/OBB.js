/**
 * Oriented bounding box
 * @constructor
 * @memberOf geo
 */
var OBB = require('three-OBB');
var BBoxUtil = require('geo/BBoxUtil');
var Constants = require('Constants');
var _ = require('util/util');

OBB.prototype.containsPoint = OBB.prototype.isPointContained;

/**
 * Initializes OBB from JSON
 * @param obb {object} JSON representation
 * @param obb.centroid
 * @param obb.axesLengths
 * @param obb.normalizedAxes
 * @param [obb.dominantNormal]
 * @param [obb.metadata] Metadata about the obb
 * @returns {OBB}
 */
OBB.prototype.fromJSON = function (obb) {
  this.position.set(obb.centroid[0], obb.centroid[1], obb.centroid[2]);
  this.halfSizes.set(obb.axesLengths[0], obb.axesLengths[1], obb.axesLengths[2]);
  this.halfSizes.multiplyScalar(0.5);
  var m = obb.normalizedAxes;
  this.basis.set(
    m[0], m[3], m[6], 0,
    m[1], m[4], m[7], 0,
    m[2], m[5], m[8], 0,
    0, 0, 0, 1);
  if (obb.dominantNormal) {
    this.__dominantNormal = new THREE.Vector3(obb.dominantNormal[0], obb.dominantNormal[1], obb.dominantNormal[2]);
  } else {
    this.__dominantNormal = undefined;
  }
  this.metadata = obb.metadata;
  this.clearCache();
  return this;
};

/**
 * Returns serializable JSON representation
 * @returns {{centroid: number[], axesLengths: number[], normalizedAxes: number[]}}
 */
OBB.prototype.toJSON = function () {
  var json = {};
  json.centroid = [this.position.x, this.position.y, this.position.z];
  json.axesLengths = [this.halfSizes.x * 2,this.halfSizes.y * 2,this.halfSizes.z * 2];
  var m = this.basis.elements;
  json.normalizedAxes = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
  json.metadata = this.metadata;
  var mm = this.getMinMax();
  json.min = [mm.min.x, mm.min.y, mm.min.z];
  json.max = [mm.max.x, mm.max.y, mm.max.z];
  return json;
};

/**
 * Converts the OBB to a Mesh object with BoxGeometry
 */
OBB.prototype.toMesh = function(material) {
  var mesh = new THREE.Mesh(new THREE.BoxGeometry(this.halfSizes.x*2, this.halfSizes.y*2, this.halfSizes.z*2), material);
  mesh.applyMatrix4(this.basis);
  var p = this.position;
  mesh.applyMatrix4(new THREE.Matrix4().makeTranslation(p.x, p.y, p.z));
  return mesh;
};

Object.defineProperty(OBB.prototype, 'dominantNormal', {
  get: function () {
    if (!this.__dominantNormal) {
      this.__dominantNormal = this.__extractDominantNormal();
    }
    return this.__dominantNormal;
  }
});

OBB.prototype.ensureMinSize = function(min) {
  var m = min/2;
  this.halfSizes.x = Math.max(m, this.halfSizes.x);
  this.halfSizes.y = Math.max(m, this.halfSizes.y);
  this.halfSizes.z = Math.max(m, this.halfSizes.z);
};

OBB.prototype.__getSmallestIndex = function() {
  // Pick the R col with the smallest length
  var smallestIdx = 1;
  var r = [this.halfSizes.x, this.halfSizes.y, this.halfSizes.z];
  if (r[0] < r[smallestIdx]) smallestIdx = 0;
  if (r[2] < r[smallestIdx]) smallestIdx = 2;
  return smallestIdx;
};

// expose function
OBB.prototype.getSmallestIndex = OBB.prototype.__getSmallestIndex;

OBB.prototype.getDominantNormalIndex = OBB.prototype.__getSmallestIndex;

OBB.prototype.__extractDominantNormal = function () {
  var smallestIdx = this.__getSmallestIndex();
  var m = this.basis.elements;
  var si = smallestIdx * 4;
  return new THREE.Vector3(m[si], m[si + 1], m[si + 2]);
};

OBB.prototype.__updateVectorsByRotationMatrix = function(rotMat) {
  this.__dominantNormal.applyMatrix4(rotMat);         // rotate dominant normal
};

OBB.prototype.applyMatrix4 = (function() {
  var temp = new THREE.Matrix4();
  var v1 = new THREE.Vector3();
  var v2 = new THREE.Vector3();
  var v3 = new THREE.Vector3();

  return function (matrix) {
    temp.extractRotation(matrix);
    this.__dominantNormal = this.__extractDominantNormal();
    this.__updateVectorsByRotationMatrix(temp);       // rotate dominant normal (and other cached vectors)

    this.position.applyMatrix4(matrix);               // transform position
    temp.multiplyMatrices(matrix, this.basis);
    this.basis.extractRotation(temp);

    temp.extractBasis(v1,v2,v3);
    this.halfSizes.multiply(new THREE.Vector3(v1.length(), v2.length(), v3.length()));
    this.clearCache();
    return this;
  };
})();
OBB.prototype.applyMatrix = OBB.prototype.applyMatrix4;

OBB.prototype.scaleBy = function (factor) {
  this.halfSizes.multiplyScalar(factor);
  this.clearCache();
  return this;
};

OBB.prototype.expandLengths = function (halfLengthDeltas) {
  this.halfSizes.add(halfLengthDeltas);
  this.clearCache();
  return this;
};

OBB.prototype.clearCache = function () {
  delete this.corners;
};

// Return world position given relative point, center is (0.5,0.5,0.5)
OBB.prototype.getWorldPosition = function (relPoint, out) {
  if (relPoint) {
    var v = out || new THREE.Vector3();
    v.set(relPoint.x - 0.5, relPoint.y - 0.5, relPoint.z - 0.5);
    v.multiplyScalar(2);
    v.multiply(this.halfSizes);
    v.applyMatrix4(this.basis);
    v.add(this.position);
    return v;
  } else {
    return this.getCenter();
  }
};

OBB.prototype.localDirToWorldDir = function(v) {
  v.applyMatrix4(this.basis);
  return v;
};

OBB.prototype.worldDirToLocalDir = (function() {
  var inv = new THREE.Matrix4();
  return function(v) {
    inv.copy(this.basis).invert();
    v.applyMatrix4(inv);
    return v;
  };
})();

OBB.prototype.getLengthInLocalDir = function(v) {
  return Math.abs(v.dot(this.halfSizes))*2;
};

OBB.prototype.getLengthInWorldDir = (function() {
  var temp = new THREE.Vector3();
  return function(v) {
    temp.copy(v);
    this.worldDirToLocalDir(temp);
    return this.getLengthInLocalDir(temp);
  };
})();

OBB.prototype.getCenter = function(out) {
  if (out) {
    out.copy(this.position);
    return out;
  } else {
    return this.position.clone();
  }
};

OBB.prototype.centroid = OBB.prototype.getCenter;

OBB.prototype.volume = function() {
  var h = this.halfSizes;
  return h.x * h.y * h.z * 8;
};

OBB.prototype.surfaceArea = function() {
  var h = this.halfSizes;
  return 8*(h.x * h.y + h.z * h.x + h.x * h.y);
};

OBB.prototype.diagonalLength = (function() {
  var i0 = new THREE.Vector3(0, 0, 0);
  var i1 = new THREE.Vector3(1, 1, 1);
  var c0 = new THREE.Vector3();
  var c1 = new THREE.Vector3();
  return function() {
    this.getWorldPosition(i0, c0);
    this.getWorldPosition(i1, c1);
    return c0.distanceTo(c1);
  };
})();

/**
 * Aspect ratio is two numbers: shortest/longest, shortest/middle
 */
OBB.prototype.aspectRatios = function() {
  var dims = this.halfSizes;
  var short = Math.min(Math.min(dims.x, dims.y), dims.z);
  var long = Math.max(Math.max(dims.x, dims.y), dims.z);
  var mid;
  if (dims.x != short && dims.x != long) {
    mid = dims.x;
  } else if (dims.y != short && dims.y != long) {
    mid = dims.y;
  } else {
    mid = dims.z;
  }
  return new THREE.Vector2(short/long, short/mid);
};

OBB.prototype.__updateCorners = function (force) {
  var compute = force;
  if (!this.corners) {
    this.corners = [];
    for (var i = 0; i < 8; i++) {
      this.corners[i] = new THREE.Vector3();
    }
    compute = true;
  }

  if (compute) {
    for (var i = 0; i < 8; i++) {
      this.corners[i].set( (i>>2)%2, (i>>1)%2, i%2);
      this.getWorldPosition(this.corners[i], this.corners[i]);
    }
    //console.log(this.corners);
  }
};

OBB.prototype.isOBBContained = function(obb) {
  var corners = obb.getCorners();
  for ( var index = 0; index < 8; ++index ) {
    // check each point
    if ( this.isPointContained( corners[ index ] ) === false ) {
      // as soon as one point is outside the OBB, return false
      return false;
    }
  }
  return true;
};

OBB.prototype.contains = function(p) {
  if (p instanceof OBB) {
    return this.isOBBContained(p);
  } else if (p instanceof THREE.Vector3) {
    return this.isPointContained(p);
  } else {
    throw 'Unsupported contains';
  }
};

OBB.prototype.getCorners = function (force) {
  // TODO: make sure to clear cache when OBB is changed (need to update original three-OBB.js)
  this.__updateCorners(force);
  return this.corners;
};

OBB.prototype.getCornersVisOrder = function(force) {
  // Get corners in a order that is good for visualization
  var origCorners = this.getCorners(force);
  var corners = origCorners.slice();
  corners[2] = origCorners[3];
  corners[3] = origCorners[2];
  corners[6] = origCorners[7];
  corners[7] = origCorners[6];
  return corners;
};

OBB.prototype.getMinMax = function() {
  var corners = this.getCorners(true);
  var box = new THREE.Box3();
  box.setFromPoints(corners);
  return { min: box.min, max: box.max };
};

OBB.prototype.getRotationQuaternion = function(quaternion) {
  quaternion = quaternion || new THREE.Quaternion();
  quaternion.setFromRotationMatrix(this.basis);
  return quaternion;
};

// Return transform that converts world to local position
// zeroCenter flag true indicates that local position center is (0,0,0) (extents from -0.5 to 0.5)
//                       otherwise,    local position center is (0.5, 0.5, 0.5)
OBB.prototype.getWorldToLocalMatrix4 = function (zeroCenter) {
  var matrix = this.getLocalToWorldMatrix4(zeroCenter);
  matrix.invert();
  return matrix;
};

// Return transform that converts local position to world,
// zeroCenter flag true indicates that local position center is (0,0,0) (extents from -0.5 to 0.5)
//                       otherwise,    local position center is (0.5, 0.5, 0.5)
OBB.prototype.getLocalToWorldMatrix4 = function (zeroCenter) {
  var matrix = new THREE.Matrix4();
  matrix.copy(this.basis);
  matrix.scale(this.halfSizes); // acts as if scale input vector, and then rotate with basis
  matrix.setPosition(this.position);
  if (!zeroCenter) {
    var centerMatrix = new THREE.Matrix4();
    centerMatrix.setPosition(new THREE.Vector3(-0.5, -0.5, -0.5));
    matrix.multiply(centerMatrix);
  }
  return matrix;
};

OBB.prototype.isAxisAligned = (function() {
  var a = new THREE.Vector3();
  var b = new THREE.Vector3();
  var c = new THREE.Vector3();
  function isSingleOne(v) {
    return (v.x === 1 && v.y === 0 && v.z === 0)
        || (v.x === 0 && v.y === 1 && v.z === 0)
        || (v.x === 0 && v.y === 0 && v.z === 1);
  }
  return function() {
    this.basis.extractBasis(a,b,c);
    return isSingleOne(a) && isSingleOne(b) && isSingleOne(c);
  };
}());

/**
 * @param index {int} Index should be 0, 1, 2, 3, 4, 5
 * @param res {THREE.Vector3} Optional result vector
 * @returns {Vector3}
 */
OBB.prototype.getBasisVector = function(index, res) {
  res = res || new THREE.Vector3();
  var isNeg = index >= 3;
  res.setFromMatrixColumn(this.basis, (isNeg)? index - 3 : index);
  if (isNeg) {
    res.negate();
  }
  // console.log('got basis', index, res.clone(), res.length(), res);
  return res;
};

OBB.prototype.extractBasis = function(a,b,c) {
  return this.basis.extractBasis(a,b,c);
};

OBB.prototype.dimensions = function (out) {
  var dims = out || new THREE.Vector3();
  dims.copy(this.halfSizes);
  dims.multiplyScalar(2);
  return dims;
};
OBB.prototype.getSize = OBB.prototype.dimensions;

OBB.prototype.maxDim = function () {
  var dims = this.dimensions();
  var maxDim = Math.max(dims.x, dims.y, dims.z);
  return maxDim;
};

OBB.prototype.maxDimAxisIndex = function () {
  var dims = this.dimensions();
  var dimsWithIndices = [[0, dims.x], [1, dims.y], [2, dims.z]];
  var maxDim = _.maxBy(dimsWithIndices, function (d) { return d[1]; });
  return maxDim[0];
};

OBB.prototype.maxDimAxis = function (out) {
  out = out || new THREE.Vector3();
  var i = this.maxDimAxisIndex();
  out.setFromMatrixColumn(this.basis, i);
  return out;
};

OBB.prototype.minDim = function () {
  var dims = this.dimensions();
  var minDim = Math.min(dims.x, dims.y, dims.z);
  return minDim;
};

OBB.prototype.minDimAxisIndex = function () {
  var dims = this.dimensions();
  var dimsWithIndices = [[0, dims.x], [1, dims.y], [2, dims.z]];
  var maxDim = _.minBy(dimsWithIndices, function (d) { return d[1]; });
  return maxDim[0];
};

OBB.prototype.minDimAxis = function (out) {
  out = out || new THREE.Vector3();
  var i = this.minDimAxisIndex();
  out.setFromMatrixColumn(this.basis, i);
  return out;
};

OBB.prototype.getNumValidDimensions = function(min) {
  min = min || 0;
  var dims = this.dimensions();
  var okayDims = _.filter(['x','y','z'], function(d) { return dims[d] > min; });
  return okayDims.length;
};

OBB.prototype.getFaceDims = function () {
  var dims = this.dimensions();
  return BBoxUtil.getFaceDims(dims);
};

OBB.prototype.getFaceNormalDims = function () {
  var dims = this.dimensions();
  return BBoxUtil.getFaceNormalDims(dims);
};

OBB.prototype.getFaceCorners = function (faceIndex) {
  return BBoxUtil.getFaceCorners(this.getCorners(), faceIndex);
};

OBB.prototype.sample = function(out, rng) {
  out = BBoxUtil.sample(out, rng);
  return this.getWorldPosition(out, out);
};

OBB.prototype.sampleFace = function(faceIndex, out, rng) {
  out = BBoxUtil.sampleFace(faceIndex, out, rng);
  return this.getWorldPosition(out, out);
};

OBB.prototype.reverseNormal = function() {
  // Reverse the dominant normal
  var smallestIdx = this.__getSmallestIndex();
  var m = this.basis.elements;
  var si = smallestIdx * 4;
  m[si] = -m[si];
  m[si+1] = -m[si+1];
  m[si+2] = -m[si+2];
  var si2_raw = (smallestIdx === 0)? 2 : ((smallestIdx+1)%3);
  var si2 = si2_raw*4;
  m[si2] = -m[si2];
  m[si2+1] = -m[si2+1];
  m[si2+2] = -m[si2+2];
  this.__isReversed = true;  // track that we made this change
  this.__dominantNormal = this.__extractDominantNormal();
  this.clearCache();
};

OBB.prototype.setDominantNormalComponentTo = function(targetIndex) {
  var domIndex = this.getDominantNormalIndex();
  if (domIndex !== targetIndex) {
    if (targetIndex >= 0 && targetIndex < 3) {
      var m = this.basis.elements;
      var di = domIndex * 4;
      var ti = targetIndex * 4;
      var tmp = [-m[ti], -m[ti+1], -m[ti+2]];
      m[ti] = m[di];
      m[ti+1] = m[di+1];
      m[ti+2] = m[di+2];
      m[di] = tmp[ti];
      m[di+1] = tmp[ti+1];
      m[di+2] = tmp[ti+2];
      this.__dominantNormal = this.__extractDominantNormal();
      this.clearCache();
    } else {
      console.error('Invalid target index for OBB.setDominantNormalComponentTo', targetIndex);
    }
  }
};

Object.defineProperty(OBB.prototype, 'min', {
  get: function () { return this.getMinMax().min; }
});

Object.defineProperty(OBB.prototype, 'max', {
  get: function () { return this.getMinMax().max; }
});

Object.defineProperty(OBB.prototype, 'isPlane', {
  get: function () {
    // check if very shortest dimension is must smaller than the other two dimensions
    var aspectRatios = this.aspectRatios();
    return aspectRatios.x < 0.1 && aspectRatios.y < 0.1;
  }
});

OBB.prototype.isVerticalPlane = function(up) {
  up = up || Constants.worldUp;
  return this.isPlane && Math.abs(this.dominantNormal.dot(up)) < 0.05;
};

OBB.prototype.isHorizontalPlane = function(up) {
  up = up || Constants.worldUp;
  return this.isPlane && Math.abs(this.dominantNormal.dot(up)) >= 0.95;
};

OBB.fromJSON = function(json) {
  var obb = new OBB();
  obb.fromJSON(json);
  return obb;
};

OBB.fromAABB = function(aabb, transform) {
  var obb = new OBB();
  obb.setFromAABB(aabb);
  if (transform) {
    obb.applyMatrix4(transform);
  }
  return obb;
};

module.exports = OBB;
