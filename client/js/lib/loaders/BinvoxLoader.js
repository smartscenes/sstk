'use strict';

var bitview = require('bitview');
var BinaryView = require('util/BinaryView');

/**
 * BinvoxLoader
 * @constructor
 * @memberof loaders
 */
var BinvoxLoader = function () {
};

// binary is a jbinary object
BinvoxLoader.prototype.parse = function (filename, binary) {
  // here you can use `binary` instance to parse data
  //console.log(binary);

  var binvoxData = binary.view;
  //
  // read header
  //
  var grid = {
    type: 'binvox',
    worldToGrid: new THREE.Matrix4(),
    gridToWorld: new THREE.Matrix4(),
    labels: ['occupied'],
    voxelSize: 1,
    numVoxels: 0,
    // Binvox specific fields
    binvoxTranslate: new THREE.Vector3(),
    binvoxScale: 1.0
  };

  var offset = 0;
  var lineData = BinaryView.getLine(binvoxData, offset);
  if (!lineData) {
    console.error('Parsing binvox ' + filename + ': Empty binvox data');
    return false;
  }
  var line = lineData.string;
  if (!line.startsWith('#binvox')) {
    console.error('Parsing binvox ' + filename + ': first line reads [' + line + '] instead of [#binvox]');
    return false;
  }

  var versionString = line.substring(8);
  var version = parseInt(versionString);
  console.log('Parsing binvox ' + filename + ': Reading binvox version ' + version);

  grid.depth = grid.height = grid.width = 0;
  var done = false;
  while (!done) {
    lineData = BinaryView.getLine(binvoxData, lineData.next);
    line = lineData.string;
    if (line.startsWith('data')) {
      done = true;
    } else if (line.startsWith('dim')) {
      var dimensions = line.split(' ');
      grid.depth = parseInt(dimensions[1]);
      grid.height = parseInt(dimensions[2]);
      grid.width = parseInt(dimensions[3]);
    } else if (line.startsWith('translate')) {
      var translate = line.split(' ');
      grid.binvoxTranslate.x = parseFloat(translate[1]);
      grid.binvoxTranslate.y = parseFloat(translate[2]);
      grid.binvoxTranslate.z = parseFloat(translate[3]);
    } else if (line.startsWith('scale')) {
      var scale = line.split(' ');
      grid.binvoxScale = parseFloat(scale[1]);
    } else {
      console.warn('Parsing binvox ' + filename + ': unrecognized keyword [' + line + '], skipping');
    }
  }  // while

  if (!done) {
    console.error('Parsing binvox ' + filename + ':  error reading header');
    return false;
  }
  if (grid.depth === 0) {
    console.error('Parsing binvox ' + filename + ':  missing dimensions in header');
    return false;
  }

  grid.size = grid.width * grid.height * grid.depth;
  grid.dims = [grid.depth, grid.width, grid.height];
  this.updateGridTransforms(grid);

  // Store voxels as bit array backed by UInt8Array
  // Number of bytes to allocate for voxels
  // Can use ndarray
  var nbytes = Math.ceil(grid.size / 8);
  var voxelsBuffer = new Uint8Array(nbytes);
  /* globals BitView */
  grid.voxels = new BitView(voxelsBuffer.buffer);
  grid.isVoxelSet = function (x, y, z) {
    var vi = x * grid.width * grid.height + z * grid.width + y;
    return (vi >= 0 && vi < grid.size) ? grid.voxels.getBit(vi) : 0;
  };
  grid.getVoxel = function (x, y, z) {
    return grid.isVoxelSet(x,y,z);
  };
  grid.setVoxel = function (x, y, z, flag) {
    var vi = x * grid.width * grid.height + z * grid.width + y;
    if (vi >= 0 && vi < grid.size) {
      grid.voxels.setBit(vi, flag);
    }
  };

  //
  // read voxel data
  //
  var value;
  var count;
  var index = 0;
  var endIndex = 0;
  var nVoxelsRead = 0;
  var i;

  binvoxData.seek(lineData.next);
  while (endIndex < grid.size) {

    value = binvoxData.getUint8();
    count = binvoxData.getUint8();

    endIndex = index + count;
    if (endIndex > grid.size) {
      console.error('More data than grid specified (endIndex:'+endIndex+' grid.size:'+grid.size);
      return false;
    }
    for (i = index; i < endIndex; i++) {
      grid.voxels.setBit(i, value);
    }

    if (value > 0) nVoxelsRead += count;
    index = endIndex;

  }  // while
  grid.numVoxels = nVoxelsRead;

  console.log('Parsing binvox ' + filename + ':  read ' + nVoxelsRead + ' voxels');
  //console.log(grid);
  return grid;
};

BinvoxLoader.prototype.updateGridTransforms = function (grid) {
  // Take voxels to model space
  // Rescale voxels to model space and translate
  var maxVoxelDim = Math.max.apply(null, grid.dims); // Get max of array
  var voxelScale = grid.binvoxScale / maxVoxelDim;

  var quaternion = new THREE.Quaternion();
  grid.gridToWorld.compose(grid.binvoxTranslate, quaternion,
    new THREE.Vector3(voxelScale, voxelScale, voxelScale));
  grid.worldToGrid.getInverse(grid.gridToWorld);
  grid.voxelSize = voxelScale;
};

module.exports = BinvoxLoader;
