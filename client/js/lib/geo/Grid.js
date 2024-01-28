'use strict';

//var BinaryView = require('util/BinaryView');
var BBox = require('geo/BBox');
var _ = require('util/util');
//require('bitview');

/**
 * Grid - represents a voxel grid
 * @params [params.dataType='uchar'] {string} type of an element of the grid
 * @params [params.elementsPerVoxel=1] {int} number of element per voxel
 * @property type {string} type of the grid
 * @property dataType {string} type of an element of the grid
 * @constructor
 * @memberOf geo
 */
var Grid = function (params) {
  params = params || {};
  this.type = 'grid';
  this.worldToGrid = new THREE.Matrix4();
  this.gridToWorld = new THREE.Matrix4();
  this.labels = [];
  this.voxelSize = 1;
  this.__depth = 0;
  this.__width = 0;
  this.__height = 0;
  this.__size = 0;
  this.dataType = params.dataType || 'uchar';   // Basic unit of a voxel element  (what typed array to use)
  this.bitsPerElement = 8*Grid.Types[this.dataType].bytes;     // Number of bits used per element
  this.elementsPerVoxel = params.elementsPerVoxel || 1;        // Number of elements per voxel
};
Grid.prototype.constructor = Grid;

// Mapping of type to bytes
Grid.Types = Object.freeze({
  'int8': { bytes: 1, array: Int8Array },
  'uint8': { bytes: 1, array: Uint8Array },
  'uchar': { bytes: 1, array: Uint8Array },
  'int16': { bytes: 2, array: Int16Array },
  'uint16': { bytes: 2, array: Uint16Array },
  'int32': { bytes: 4, array: Int32Array },
  'uint32': { bytes: 4, array: Uint32Array },
  'int64': { bytes: 8 },
  'uint64': { bytes: 8 },
  'float32': { bytes: 4, array: Float32Array },
  'float64': { bytes: 8, array: Float64Array }
});

Grid.prototype.__createVoxelBuffer = function(params) {
  var nbytes = Math.ceil(this.sizeInBits / 8);
  var arrayBuffer = params.data? params.data : new ArrayBuffer(nbytes);
  if (!(arrayBuffer instanceof ArrayBuffer)) {
    console.warn('Grid data not ArrayBuffer');
  }
  if (arrayBuffer.length < nbytes) {
    console.warn('Grid data should be ' + nbytes + ' bytes, but only ' + arrayBuffer.length);
  }
  var typeInfo = Grid.Types[this.dataType];
  if (typeInfo && typeInfo.array) {
    return new typeInfo.array(arrayBuffer);
  } else {
    return new Uint8Array(arrayBuffer);
  }
};

Grid.prototype.init = function (params) {
  if (params.dims) {
    this.__depth = params.dims[0];
    this.__width = params.dims[1];
    this.__height = params.dims[2];
  } else if (params.orderedDims) {
    this.__width = params.orderedDims[0];
    this.__height = params.orderedDims[1];
    this.__depth = params.orderedDims[2];
  }
  this.__size = this.__width * this.__height * this.__depth;
  this.labels = params.labels || [];
  this.voxelSize = 1;
  this.__voxelsBuffer = this.__createVoxelBuffer(params);
};

/* Read only properties */
Object.defineProperty(Grid.prototype, 'size', {
  get: function () { return this.__size; }
});

/* Size in bits */
Object.defineProperty(Grid.prototype, 'sizeInBits', {
  get: function() { return this.size * this.elementsPerVoxel * this.bitsPerElement; }
});

// Dimensions corresponding to x,y,z
Object.defineProperty(Grid.prototype, 'dims', {
  get: function () { return [this.__depth, this.__width, this.__height]; }
});

// Dimensions ordered from fasted varying to slowest (from the voxelBuffer)
Object.defineProperty(Grid.prototype, 'orderedDims', {
  get: function() {
    // Strange ordering: y, z, x
    if (this.elementsPerVoxel > 1) {
      return [this.elementsPerVoxel, this.__width, this.__height, this.__depth];
    } else {
      return [this.__width, this.__height, this.__depth];
    }
  }
});

Grid.prototype.isVoxelSet = function (x, y, z) {
  return this.getVoxel(x,y,z);
};

Grid.prototype.getVoxel = function (x, y, z) {
  return this.getRawVoxel(x,y,z);
};

Grid.prototype.getRawVoxel = function (x, y, z) {
  var vi = this.__indexOf(x, y, z);
  if (this.elementsPerVoxel > 1) {
    var start = this.elementsPerVoxel*vi;
    var end = start + this.elementsPerVoxel;
    return (start >= 0 && end < this.__voxelsBuffer.length) ?
      this.__voxelsBuffer.subarray(start, end) : null;
  } else {
    return (vi >= 0 && vi < this.__voxelsBuffer.length) ? this.__voxelsBuffer[vi] : null;
  }
};

Grid.prototype.countSetVoxels = function() {
  var nVoxelsSet = 0;
  for (var i = 0; i < this.dims[0]; i++) {
    for (var j = 0; j < this.dims[1]; j++) {
      for (var k = 0; k < this.dims[2]; k++) {
        if (this.isVoxelSet(i,j,k)) {
          nVoxelsSet++;
        }
      }
    }
  }
  return nVoxelsSet;
};

Grid.prototype.getSetVoxelsBoundingBox = function() {
  var bbox = new BBox();
  for (var i = 0; i < this.dims[0]; i++) {
    for (var j = 0; j < this.dims[1]; j++) {
      for (var k = 0; k < this.dims[2]; k++) {
        if (this.isVoxelSet(i,j,k)) {
          bbox.includePoint(new THREE.Vector3(i, j, k));
        }
      }
    }
  }
  return bbox;
};

Grid.prototype.setVoxel = function (x, y, z, value) {
  return this.setRawVoxel(x,y,z, value);
};

Grid.prototype.setRawVoxel = function (x, y, z, value) {
  var vi = this.__indexOf(x, y, z);
  if (this.elementsPerVoxel > 1) {
    var start = this.elementsPerVoxel*vi;
    var end = start + this.elementsPerVoxel;
    if (start >= 0 && end < this.__voxelsBuffer.length) {
      for (var i = 0; i < this.elementsPerVoxel; i++) {
        this.__voxelsBuffer[start+i] = value? value[i] : 0;
      }
    }
  } else {
    if (vi >= 0 && vi < this.__voxelsBuffer.length) {
      this.__voxelsBuffer[vi] = value? value : 0;
    }
  }
};

Grid.prototype.getRawData = function() {
  return this.__voxelsBuffer;
};

Grid.prototype.__indexOf = function (x, y, z) {
  if (x < 0 || x >= this.__depth || y < 0 || y >= this.__width || z < 0 || z >= this.__height) {
    return -1;
  }
  return x * this.__width * this.__height + z * this.__width + y;
};

Grid.prototype.copy = function(g) {
  // TODO: double check grids are compatible
  this.copyTransform(g);
  this.__voxelsBuffer.set(g.__voxelsBuffer);
};

/**
 * Copies transfrom from input grid to this grid
 * @param g {geo.Grid}
 * @param scaleFactor {number}
 */
Grid.prototype.copyTransform = function(g, scaleFactor) {
  this.worldToGrid.copy(g.worldToGrid);
  this.gridToWorld.copy(g.gridToWorld);
  this.voxelSize = g.voxelSize;
  if (scaleFactor && scaleFactor != 1) {
    var S = new THREE.Matrix4();
    S.makeScale(scaleFactor, scaleFactor, scaleFactor);
    this.gridToWorld.multiply(S);
    this.worldToGrid.copy(this.gridToWorld).invert();
    this.voxelSize *= scaleFactor;
  }
};

/**
 * Copies values from input grid to this grid (assumes the two grids are the same dimensions)
 * @param g {geo.Grid}
 * @param convert {function(*, Array):*} Converts a voxel value from input grid to this grid
 */
Grid.prototype.copyValues = function(g, convert) {
  // TODO: Ensure grids are the same size
  for (var i = 0; i < g.dims[0]; i++) {
    for (var j = 0; j < g.dims[1]; j++) {
      for (var k = 0; k < g.dims[2]; k++) {
        this.setVoxel(i,j,k, convert(g.getVoxel(i,j,k), [i,j,k]));
      }
    }
  }
};

/**
 * Copies values from input grid with larger dimensions to this grid
 * @param g {geo.Grid}
 * @param convert {function(Array, Array):*} Converts an array of voxel values from input grid to this grid
 * @param reduceBy {int} Factor to reduce by
 */
Grid.prototype.copyReducedValues = function(g, convert, reduceBy) {
  // TODO: Ensure grids are the same size
  for (var i = 0, i2=0; i < g.dims[0]; i+=reduceBy, i2++) {
    for (var j = 0, j2=0; j < g.dims[1]; j+=reduceBy, j2++) {
      for (var k = 0, k2=0; k < g.dims[2]; k+=reduceBy, k2++) {
        var chunk = [];
        for (var a = 0; a < reduceBy; a++) {
          for (var b = 0; b < reduceBy; b++) {
            for (var c = 0; c < reduceBy; c++) {
              chunk.push(g.getVoxel(i+a, j+b, k+c));
            }
          }
        }
        this.setVoxel(i2,j2,k2, convert(chunk, [i2,j2,k2]));
      }
    }
  }
};

Grid.prototype.__compare = function(g) {
  var dims1 = this.dims;
  var dims2 = g.dims;
  if (!_.isEqual(dims1, dims2)) {
    console.log('dimension mismatch: ', dims1, dims2);
    return false;
  }
  var matched = true;
  if (!this.__compareBytes(g)) { matched = false; }
  if (!this.__compareValues(g)) { matched = false; }
  return matched;
};

Grid.prototype.__compareBytes = function(g) {
  // TODO: Ensure grids are the same size
  console.log('compareBytes', this, g);
  var matched = true;
  for (var i = 0; i < this.__voxelsBuffer.length; i++) {
    if (this.__voxelsBuffer[i] !== g.__voxelsBuffer[i]) {
      console.log('different at ' + i + ': ' + this.__voxelsBuffer[i] + ' vs ' + g.__voxelsBuffer[i]);
      matched = false;
    }
  }
  return matched;
};

Grid.prototype.__compareValues = function(g) {
  var matched = true;
  // TODO: Ensure grids are the same size
  console.log('compareValues', this, g);
  for (var i = 0; i < this.dims[0]; i++) {
    for (var j = 0; j < this.dims[1]; j++) {
      for (var k = 0; k < this.dims[2]; k++) {
        var v1 = this.getRawVoxel(i,j,k);
        var v2 = g.getRawVoxel(i,j,k);
        var diff = (!!v1 !== !!v2) || (v1 && v2 && v1.length !== v2.length);
        if (!diff && v1 && v2) {
          for (var vi = 0; vi < v1.length; vi++) {
            if (v1[vi] !== v2[vi]) {
              diff = true;
              break;
            }
          }
        }
        if (diff) {
          console.log('different at ' + JSON.stringify([i,j,k])
            + ', index ' + this.__indexOf(i,j,k) + ' vs ' + g.__indexOf(i,j,k)
            + ': ' + JSON.stringify(v1) + ' vs ' + JSON.stringify(v2));
          matched  = false;
        }
      }
    }
  }
  return matched;
};

// Similar to copy values except that values are not
// set if convert returns undefined or null
Grid.prototype.copyValuesPartial = function(g, convert) {
  // TODO: Ensure grids are the same size
  for (var i = 0; i < g.dims[0]; i++) {
    for (var j = 0; j < g.dims[1]; j++) {
      for (var k = 0; k < g.dims[2]; k++) {
        var v = convert(g.getVoxel(i,j,k), [i,j,k]);
        if (v != undefined) {
          this.setVoxel(i, j, k, v);
        }
      }
    }
  }
};

Grid.prototype.iterate = function(process) {
  var g = this;
  for (var i = 0; i < g.dims[0]; i++) {
    for (var j = 0; j < g.dims[1]; j++) {
      for (var k = 0; k < g.dims[2]; k++) {
        process(g.getRawVoxel(i,j,k), [i,j,k]);
      }
    }
  }
};

Grid.prototype.getOrigin = function() {
  var origin = new THREE.Vector3();
  origin.setFromMatrixPosition(this.gridToWorld);
  return origin;
};

Grid.prototype.getGridToWorldBasisOrdered = function() {
  var xAxis = new THREE.Vector3();
  var yAxis = new THREE.Vector3();
  var zAxis = new THREE.Vector3();
  this.gridToWorld.extractBasis(xAxis, yAxis, zAxis);
  // From fastest to slowest (y, z, x)
  return [yAxis, zAxis, xAxis];
};

var directions = [
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(+1, 0, 0),
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, +1, 0),
  new THREE.Vector3(0, 0, -1),
  new THREE.Vector3(0, 0, +1)
];

Grid.prototype.getNeighborOccupancy = function(i,j,k) {
  var scope = this;
  function getOccupancy(d) {
    return !!scope.isVoxelSet(i + d.x, j + d.y, k + d.z);
  }
  return _.map(directions, function(d) {
    return getOccupancy(d);
  });
};

Grid.prototype.getNeighborDirections = function(transform) {
  if (transform) {
    return _.map(directions, function(d) {
      if (transform instanceof THREE.Matrix4) {
        return d.clone().applyMatrix4(transform);
      } else if (_.isFunction(transform)) {
        return transform(d);
      }
    });
  } else {
    return directions;
  }
};

Grid.prototype.iterateNeighborsCoords = function(i,j,k, process) {
  return _.map(directions, function(d) {
    process(i+d.x, j + d.y, k + d.z);
  });
};

Grid.prototype.toGrid = function(p, out, opts) {
  opts = opts || {};
  out = out || new THREE.Vector3();
  var transform = opts.transform || this.worldToGrid;
  p = p.clone();
  p.applyMatrix4(transform);
  // we take the floor - is that the good thing?
  out.x = Math.floor(p.x);
  out.y = Math.floor(p.y);
  out.z = Math.floor(p.z);
  if (opts.clamp) {
    var dims = this.dims;
    out.x = _.clamp(out.x, 0, dims[0]);
    out.y = _.clamp(out.y, 0, dims[1]);
    out.z = _.clamp(out.z, 0, dims[2]);
  }
  return out;
};

Grid.prototype.toWorld = function(p, out, opts) {
  opts = opts || {};
  out = out || new THREE.Vector3();
  var transform = opts.transform || this.gridToWorld;
  out.copy(p);
  out.applyMatrix4(transform);
  return out;
};

module.exports = Grid;
