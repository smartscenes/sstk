'use strict';

var AssetQuerier = require('query/AssetQuerier');
var ModelSchema = require('model/ModelSchema');
var _ = require('util');

function ModelQuerier(options) {
  // Set reasonable defaults
  var defaults = {
    viewerUrl: 'view-model',
    viewerWindowName: 'Model Viewer',
    previewImageIndex: 13,
    assetTypes: ['model'],
    schemas: { 'model': new ModelSchema() }
  };
  options = _.defaults({}, options, defaults);
  AssetQuerier.call(this, options);
}

ModelQuerier.prototype = Object.create(AssetQuerier.prototype);
ModelQuerier.prototype.constructor = ModelQuerier;

ModelQuerier.prototype.getViewResultUrl = function(fullId, result) {
  return this.viewerUrl + '?modelId=' + fullId;
};

// Exports
module.exports = ModelQuerier;
