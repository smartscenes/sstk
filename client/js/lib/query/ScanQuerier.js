'use strict';

var AssetQuerier = require('query/AssetQuerier');
var ScanSchema = require('model/ScanSchema'); // Require this to ensure that ScanSchema is associated with assetType scan
var _ = require('util/util');

/**
 * Provides a query interfaces for scans
 * @constructor
 * @extends query.AssetQuerier
 * @memberOf query
 * @param options Configuration parameters for AssetQuerier
 * @param [options.viewerUrl=view-model] {string} Base url for viewer (asset is shown using the pattern `${viewerUrl}?modelId=${fullId}`)
 * @param [options.viewerWindowName='Scan Viewer'] {string} Name of browser tab to use for asset viewer (used if `viewerIframe` is not specified)
 * @param [options.assetTypes=['scan']] {string[]} List of asset types to support
 * @param [options.previewImageIndex=0] {int|string} Which image to use for the preview image (shown in search results)
 */
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
