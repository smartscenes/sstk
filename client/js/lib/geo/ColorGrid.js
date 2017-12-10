'use strict';

var Grid = require('geo/Grid');

/**
 * ColorGrid with voxels stored as 4 bytes
 * @constructor
 * @memberof geo
 * @extends geo.Grid
 */
var ColorGrid = function (params) {
  params = params || {};
  Grid.call(this, params);
  this.type = 'colorgrid';
  this.dataType = 'uint8';   // Basic unit of a voxel element  (what typed array to use)
  this.bitsPerElement = 8*Grid.Types[this.dataType].bytes;     // Number of bits used per element
  this.elementsPerVoxel = 4;        // Number of elements per voxel
  this.voxels = null;
  this.minThreshold = params.minThreshold || 0;
  // this.properties = [
  //   { name: 'kinds', value: 'RGB-color space space space' }
  // ];
};
ColorGrid.prototype = Object.create(Grid.prototype);
ColorGrid.prototype.constructor = ColorGrid;

ColorGrid.prototype.isVoxelSet = function(x, y, z) {
  var voxel = this.getRawVoxel(x, y, z);
  return (voxel && (voxel[3] > this.minThreshold*255));
};

ColorGrid.prototype.setColor = function (x, y, z, c) {
  return this.setVoxel(x,y,z,c);
};

ColorGrid.prototype.setOpacity = function (x, y, z, opacity) {
  var vi = this.__indexOf(x, y, z);
  var i = this.elementsPerVoxel*vi + 3;
  if (i >= 0 && i < this.__voxelsBuffer.length) {
    this.__voxelsBuffer[i] = Math.floor(opacity*255);
  }
};

/**
 * Returns voxel as THREE.Color
 * @param x {int}
 * @param y {int}
 * @param z {int}
 * @returns {THREE.Color}
 */
ColorGrid.prototype.getColor = function (x, y, z) {
  var voxel = this.getRawVoxel(x, y, z);
  if (voxel && (voxel[3] > this.minThreshold*255)) {
    var c = new THREE.Color();
    c.setRGB(voxel[0]/255, voxel[1]/255, voxel[2]/255);
    return c;
  }
};

ColorGrid.prototype.setVoxel = function (x, y, z, c) {
  var alpha = c ? ((c.a != undefined) ? c.a : 1): 0;
  var v = c ? [Math.floor(c.r * 255), Math.floor(c.g * 255), Math.floor(c.b * 255), alpha * 255] : null;
  return this.setRawVoxel(x, y, z, v);
};

ColorGrid.prototype.getVoxel = function (x, y, z) {
  var voxel = this.getRawVoxel(x, y, z);
  if (voxel && (voxel[3] > this.minThreshold*255)) {
    //return  ( voxel[0] & 255 ) << 16 ^ ( voxel[1] & 255 ) << 8 ^ ( voxel[2] & 255 ) << 0;
    return ( voxel[3] & 255 ) << 24 ^ ( voxel[0] & 255 ) << 16 ^ ( voxel[1] & 255 ) << 8 ^ ( voxel[2] & 255 ) << 0;
  }
};

module.exports = ColorGrid;
