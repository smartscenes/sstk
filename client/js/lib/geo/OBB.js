/**
 * Oriented bounding box
 * @constructor
 * @memberOf geo
 */
var OBB = require('three-OBB');

/**
 * Initializes OBB from JSON
 * @param obb {string} JSON representation
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
  return json;
};

OBB.prototype.dominantNormal = function () {
  if (!this.__dominantNormal) {
    this.__dominantNormal = this.__extractDominantNormal();
  }
  return this.__dominantNormal;
};

OBB.prototype.__extractDominantNormal = function () {
  // Pick the R col with the smallest length
  var smallestIdx = 1;
  var r = [this.halfSizes.x, this.halfSizes.y, this.halfSizes.z];
  if (r[0] < r[smallestIdx]) smallestIdx = 0;
  if (r[2] < r[smallestIdx]) smallestIdx = 2;
  var m = this.basis.elements;
  var si = smallestIdx * 4;
  return new THREE.Vector3(m[si], m[si + 1], m[si + 2]);
};

OBB.prototype.applyMatrix = function (matrix) {
  var temp = new THREE.Matrix4();
  temp.extractRotation(matrix);
  this.__dominantNormal = this.__extractDominantNormal();
  this.__dominantNormal.applyMatrix4(temp);

  this.position.applyMatrix4(matrix);
  temp.multiplyMatrices(matrix, this.basis);
  this.basis.extractRotation(temp);
  var v1 = new THREE.Vector3();
  var v2 = new THREE.Vector3();
  var v3 = new THREE.Vector3();
  temp.extractBasis(v1,v2,v3);
  this.halfSizes.multiply(new THREE.Vector3(v1.length(), v2.length(), v3.length()));
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
    v.set(0.5 - relPoint.x, 0.5 - relPoint.y, 0.5 - relPoint.z);
    v.multiplyScalar(2);
    v.multiply(this.halfSizes);
    v.applyMatrix4(this.basis);
    v.add(this.position);
    return v;
  } else {
    return this.centroid();
  }
};

OBB.prototype.centroid = function(out) {
  if (out) {
    out.copy(this.position);
    return out;
  } else {
    return this.position.clone();
  }
};

OBB.prototype.volume = function() {
  var h = this.halfSizes;
  return h.x * h.y * h.z * 8;
};

OBB.prototype.surfaceArea = function() {
  var h = this.halfSizes;
  return 8*(h.x * h.y + h.z * h.x + h.x * h.y);
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

OBB.prototype.getCorners = function (force) {
  // TODO: make sure to clear cache when OBB is changed (need to update original three-OBB.js)
  this.__updateCorners(force);
  return this.corners;
};

OBB.prototype.getMinMax = function() {
  var corners = this.getCorners(true);
  var box = new THREE.Box3();
  box.setFromPoints(corners);
  return { min: box.min, max: box.max };
};

module.exports = OBB;
