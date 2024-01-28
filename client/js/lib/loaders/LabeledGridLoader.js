'use strict';

var BinaryView = require('util/BinaryView');

/**
 * Labeled Grid Loader.
 * @constructor
 * @memberof loaders
 */
var LabeledGridLoader = function (params) {
  this.setOptions(params);
};

LabeledGridLoader.prototype.setOptions = function(options) {
  this.options = options || {};
};

/**
 * Parses a file containing a labeled grid
 * @param filename Name of file (used for debug messages)
 * @param binary {jbinary} jbinary object containing the data of the file
 * @returns {*}
 */
LabeledGridLoader.prototype.parse = function (filename, binary) {
  // here you can use `binary` instance to parse data
  //console.log(binary);
  //! Read an occupancy grid file. File starts with ASCII header of following format (excluding comments after #):
  //!   labeledgrid\t1
  //!   dimensions\tdimX dimY dimZ  # vec3ul
  //!   worldToGrid\tfloat00 float01 float02 float03 float10 ... float33  # mat4f
  //!   voxelSize\tfloat
  //!   labels\tId1,Id2,Id3,...
  //!   numVoxels\tsize_t
  //!   data:
  //! Binary section follows with 4-tuples of int16_t (x, y, z, label) in little endian

  var voxData = binary.view;
  //
  // read header
  //
  var grid = {
    type: 'labeledgrid',
    worldToGrid: new THREE.Matrix4(),
    gridToWorld: new THREE.Matrix4(),
    labels: [],
    voxelSize: 1,
    numVoxels: 0
  };
  var offset = 0;
  var lineData = BinaryView.getLine(voxData, offset);
  if (!lineData) {
    console.error('Parsing labeledgrid ' + filename + ': Empty voxel data');
    return false;
  }
  var line = lineData.string;
  if (!line.startsWith('labeledgrid')) {
    console.error('Parsing labeledgrid ' + filename + ': first line reads [' + line + '] instead of [labeledgrid]');
    return false;
  }

  var versionString = line.substring(12);
  var version = parseInt(versionString);
  console.log('Parsing labeledgrid ' + filename + ': Reading labeledgrid version ' + version);

  grid.depth = grid.height = grid.width = 0;
  var done = false;
  while (!done) {
    lineData = BinaryView.getLine(voxData, lineData.next);
    line = lineData.string;
    if (line.startsWith('data')) done = true;
    else {
      var fields = line.split('\t');
      var name = fields[0];
      var value = fields[1];
      if (name == 'dimensions') {
        var dimensions = value.split(' ');
        grid.depth = parseInt(dimensions[0]);
        grid.width = parseInt(dimensions[1]);
        grid.height = parseInt(dimensions[2]);
      } else if (name == 'worldToGrid') {
        var m = value.split(' ');
        m = m.map(function (a) { return parseFloat(a); });
        grid.worldToGrid.set(
          m[0], m[1], m[2], m[3],
          m[4], m[5], m[6], m[7],
          m[8], m[9], m[10], m[11],
          m[12], m[13], m[14], m[15]
        );
        grid.gridToWorld.copy(grid.worldToGrid).invert();
      } else if (name == 'voxelSize') {
        grid.voxelSize = parseFloat(value);
      } else if (name == 'numVoxels') {
        grid.numVoxels = parseInt(value);
      } else if (name == 'labels') {
        grid.labels = value.split(',');
      } else {
        console.warn('Parsing labeledgrid ' + filename + ': unrecognized keyword [' + line + '], skipping');
      }
    }
  }  // while

  if (!done) {
    console.error('Parsing labeledgrid ' + filename + ':  error reading header');
    return false;
  }
  if (grid.depth === 0) {
    console.error('Parsing labeledgrid ' + filename + ':  missing dimensions in header');
    return false;
  }

  grid.size = grid.width * grid.height * grid.depth;
  grid.dims = [grid.depth, grid.width, grid.height];

  // Store voxels as bit array backed by UInt8Array
  // Number of bytes to allocate for voxels
  grid.voxels = (grid.labels.length < 255) ? new Uint8Array(grid.size) : new Uint16Array(grid.size);
  //grid.voxels = new Map();
  grid.getKey = function (x, y, z) {
    return x * grid.width * grid.height + z * grid.width + y;
  };
  grid.isVoxelSet = function (x, y, z) {
    return grid.getVoxel(x,y,z);
  };
  grid.getVoxel = function (x, y, z) {
    var vi = grid.getKey(x,y,z);
    if (vi >= 0 && vi < grid.size) {
      return grid.voxels[vi];
    }
  };
  grid.setVoxel = function (x, y, z, flag) {
    var vi = grid.getKey(x,y,z);
    if (vi >= 0 && vi < grid.size) {
      grid.voxels[vi] = flag;
    }
  };

  //
  // read voxel data
  //
  voxData.seek(lineData.next);
  var nVoxelsRead = 0;
  while (nVoxelsRead < grid.numVoxels) {
    // read uint16s in little endian
    var x = voxData.getUint16(undefined, true);
    var y = voxData.getUint16(undefined, true);
    var z = voxData.getUint16(undefined, true);
    var label = voxData.getUint16(undefined, true);
    grid.setVoxel(x,y,z,label + 1);

    //if (nVoxelsRead < 16) {
    //  console.log(nVoxelsRead + ' ' + x + ' ' + y + ' ' + z + ' ' + label);
    //}
    nVoxelsRead++;
  }  // while

  console.log('Parsing labeledgrid ' + filename + ':  read ' + nVoxelsRead + ' voxels');
  //console.log(grid);
  return grid;
};

module.exports = LabeledGridLoader;
