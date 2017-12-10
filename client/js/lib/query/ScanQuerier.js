'use strict';

var AssetQuerier = require('query/AssetQuerier');
var ScanSchema = require('model/ScanSchema');
var _ = require('util');

function ScanQuerier(options) {
  // Set reasonable defaults
  var defaults = {
    viewerUrl: 'view-model',
    viewerWindowName: 'Scan Viewer',
    previewImageIndex: 0,
    assetTypes: ['scan']
  };
  options = _.defaults({}, options, defaults);
  AssetQuerier.call(this, options);
}

ScanQuerier.prototype = Object.create(AssetQuerier.prototype);
ScanQuerier.prototype.constructor = ScanQuerier;

ScanQuerier.prototype.getViewResultUrl = function(fullId, result) {
  return this.viewerUrl + '?modelId=' + fullId;
};

// Exports
module.exports = ScanQuerier;
