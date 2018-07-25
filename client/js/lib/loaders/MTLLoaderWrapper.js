'use strict';

var BasicLoader = require('loaders/BasicLoader');
require('loaders/MTLLoader');

/**
 * MTLLoaderWrapper
 * @constructor
 * @memberof loaders
 */
var MTLLoaderWrapper = function (params) {
  this.fs = params.fs;
  this.mtlLoader = new THREE.MTLLoader();
  this.mtlLoader.setCrossOrigin(params.crossOrigin);
  this.mtlLoader.setMaterialOptions(params);
};

MTLLoaderWrapper.prototype = Object.create(BasicLoader.prototype);
MTLLoaderWrapper.prototype.constructor = MTLLoaderWrapper;

/**
 * Parses Wavefront .MTL files
 * @param mtlurl url to mtl file
 * @param callback function(err, parsedMaterialsCreator)
 * @returns {*}
 */
MTLLoaderWrapper.prototype.load = function (mtlurl, callback) {
  var scope = this;
  this.fs.readAsync(mtlurl, 'utf-8', function(err, data) {
    if (err) {
      callback(err);
    } else {
      try {
        scope.mtlLoader.setBaseUrl(mtlurl.substr(0, mtlurl.lastIndexOf( "/" ) + 1));
        var materialsCreator = scope.mtlLoader.parse(data);
        materialsCreator.preload();
        // console.log(materialsCreator);
        callback(null, materialsCreator);
      } catch(e) {
        callback(e);
      }
    }
  });
};

module.exports = MTLLoaderWrapper;
