'use strict';

var Constants = require('Constants');
var AssetQuerier = require('query/AssetQuerier');
var ModelSchema = require('model/ModelSchema');
var _ = require('util/util');

/**
 * Provides a query interfaces for models
 * @constructor
 * @extends query.AssetQuerier
 * @memberOf query
 * @param options Configuration parameters for AssetQuerier
 * @param [options.viewerUrl=view-model] {string} Base url for viewer (asset is shown using the pattern `${viewerUrl}?modelId=${fullId}`)
 * @param [options.viewerWindowName='Model Viewer'] {string} Name of browser tab to use for asset viewer (used if `viewerIframe` is not specified)
 * @param [options.assetTypes=['model']] {string[]} List of asset types to support
 * @param [options.previewImageIndex=13] {int|string} Which image to use for the preview image (shown in search results)
 */
function ModelQuerier(options) {
  // Set reasonable defaults
  var defaults = {
    viewerUrl: Constants.baseUrl + '/view-model',
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
  var extra = this.options.includeExtraAssets ? '&extra' : '';
  return this.viewerUrl + '?modelId=' + fullId + extra;
};

// Exports
module.exports = ModelQuerier;
