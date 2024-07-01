'use strict';

var Constants = require('lib/Constants');
var AssetManager = require('assets/AssetManager');
var SearchController = require('search/SearchController');
var _ = require('util/util');
require('jquery-lazy');

/**
 * Simplified asset querier (without visual search or schema)
 * The asset querier provides an ui for a user to query for assets.
 * Preview images of assets are displayed in a search panel allowing for pagination.
 * @constructor SimpleAssetQuerier
 * @memberOf query
 * @param options Configuration parameters for AssetQuerier
 * @param [options.entriesPerRow=6] {int} Number of entries to show per row
 * @param [options.nRows=50] {int} Number of rows to show
 * @param [options.suggester] Autocomplete suggester
 * @param [options.viewerUrl] {string} Base url for viewer (asset is shown using the pattern `${viewerUrl}?fullId=${fullId}`)
 * @param [options.viewerIframe] {jQueryObject} If specified, asset is shown in the specified iframe vs a new tab.
 * @param [options.viewerModal] {jQueryObject} If specified, asset is shown in the specified iframe/modal vs a new tab.  Requires `viewerIframe` be specified as well.
 * @param [options.viewerWindowName='Asset Viewer'] {string} Name of browser tab to use for asset viewer (used if `viewerIframe` is not specified)
 * @param [options.searchPanel] {jQueryObject|string} jQuery object or selector for where search results will be displayed
 * @param [options.searchButton] {jQueryObject|string} jQuery object or selector for button to trigger search
 * @param [options.searchTextElem] {jQueryObject|string} jQuery object or selector for search textbox
 * @param [options.assetFiles] {string|string[]} List of asset metadata files to register
 * @param [options.assetTypes] {string[]} List of asset types to support
 * @param [options.selectedAssetType] {string} Selected asset type (defaults to first element of `assetTypes` if `assetTypes` is specified)
 * @param [options.sources] {string[]} Asset data sources to support
 * @param [options.previewImageIndex] {int|string} Which image to use for the preview image (shown in search results)
 * @param [options.onClickAsset] {function(source, id, result)} Callback for when an asset is clicked (defaults to showing the asset in a new tab or modal)
 * @param [options.customizeResult] {function(source, id, result, element)} Callback to customize display of asset in element
 * @param [options.showLoadFile] {boolean} Whether option to load file of ids is shown
 * @param [options.allowSave] {boolean} Whether option to save list of ids of shown
 * @param [options.initialQuery] {string} Initial query of assets to search for
 * @param [options.idsFile] {string|File} File of ids (one per line) to display
 */
function AssetQuerier(options) {
  var defaults = {
    viewerWindowName: 'Asset Viewer',
    entriesPerRow: 6,
    nRows: 50
  };
  this.urlParams = _.getUrlParams();
  options = _.defaults({}, this.urlParams, options, defaults);
  this.init(options);
}

AssetQuerier.prototype.init = function (options) {
  var scope = this;
  scope.__initAssets(options)
    .then(function(assetGroups) {
      scope.__initSearch(options, assetGroups);
    });
};

AssetQuerier.prototype.__initAssets = function (options) {
  this.assetManager = new AssetManager({
    previewImageIndex: options.previewImageIndex
  });

  var scope = this;
  var p = new Promise(
    function(resolve, reject) {
      // Setup assetGroups
      if (options.assetFiles) {
        scope.assetManager.registerCustomAssetGroups({
          assetFiles: options.assetFiles,
          callback: function(err, results) {
            resolve(results);
          }
        });
      } else {
        resolve([]);
      }
    }
  );
  return p;
};

AssetQuerier.prototype.__initSearch = function (options, assetGroups) {
  this.viewerUrl = options.viewerUrl;
  this.viewerIframe = options.viewerIframe;
  this.viewerModal = options.viewerModal;
  this.viewerWindowName = options.viewerWindowName;

  this.assetTypes = options.assetTypes;
  this.selectedAssetType = options.selectedAssetType || this.assetTypes[0];

  // Main search panel where search results are displayed
  var sources = options.sources;
  this.searchPanel = $(options.searchPanel);
  this.searchButton = $(options.searchButton);
  this.searchTextElem = $(options.searchTextElem);
  this.searchController = new SearchController({
    sources: sources,
    getImagePreviewUrlCallback: this.assetManager.getImagePreviewUrl.bind(this.assetManager),
    onClickResultCallback: options.onClickAsset || this.showResult.bind(this),
    appendResultElemCallback: options.customizeResult,
    tooltipIncludeFields: options.tooltipIncludeFields,
    entriesPerRow: options.entriesPerRow,
    nRows: options.nRows,
    searchPanel: this.searchPanel,
    loadImagesLazy: true,
    encodeQuery: false,
    showSearchSourceOption: sources.length > 1,
    showLoadFile: options.showLoadFile,
    allowSave: options.allowSave,
    searchButton: this.searchButton,
    searchTextElem: this.searchTextElem,
    boostFields: []
  });
  if (assetGroups) {
    for (var i = 0; i < assetGroups.length; i++) {
      var assetGroup = assetGroups[i];
      this.searchController.registerSearchModule(assetGroup.source, assetGroup.assetDb || assetGroup.solrUrl);
    }
  }
  if (options.suggester) {
    this.searchController.searchPanel.setAutocomplete(options.suggester);
  }

  var idsFile = options.idsFile;
  var initialQuery = options.initialQuery;
  if (idsFile) {
    this.searchController.loadIdsFromFile(idsFile);
  } else if (initialQuery) {
    this.searchController.setSearchText(initialQuery);
    this.searchController.startSearch();
  }

  // Resize
  window.addEventListener('resize', this.onWindowResize.bind(this), false);
};

AssetQuerier.prototype.onWindowResize = function () {
  this.searchController.onResize();
};


AssetQuerier.prototype.getViewResultUrl = function(fullId, result) {
  return this.viewerUrl + '?fullId=' + fullId;
};

AssetQuerier.prototype.openViewer = function (url, windowName) {
  if (this.viewerIframe && this.viewerModal) {
    this.viewerIframe.attr('src', url);
    if (this.viewerModal) {
      this.viewerModal.modal('show');
    }
  } else {
    window.open(url, windowName);
  }
};

AssetQuerier.prototype.showResult = function (source, id, result) {
  var fullId = AssetManager.toFullId(source, id);
  var url = this.getViewResultUrl(fullId, result);
  this.openViewer(url, this.viewerWindowName);
};

// Exports
module.exports = AssetQuerier;
