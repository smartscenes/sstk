'use strict';

var FileLoader = require('io/FileLoader');

function AssetLoader(params) {
  FileLoader.call(this, params);
}

AssetLoader.prototype = Object.create(FileLoader.prototype);
AssetLoader.prototype.constructor = AssetLoader;

module.exports = AssetLoader;