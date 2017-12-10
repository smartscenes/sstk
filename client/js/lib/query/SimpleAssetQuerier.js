'use strict';

var Constants = require('lib/Constants');
var AssetManager = require('assets/AssetManager');
var SearchController = require('search/SearchController');
var _ = require('util');
require('jquery-lazy');

// Simplified asset querier (without visual search or schema)
function AssetQuerier(options) {
  var defaults = {
    viewerWindowName: 'Asset Viewer',
    entriesPerRow: 6,
    nRows: 50
  };
  options = _.defaults({}, options, defaults);
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

  this.urlParams = _.getUrlParams();
  var idsFile = this.urlParams['idsFile'];
  var initialQuery = options.initialQuery || this.urlParams['initialQuery'];
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
    this.viewerModal.modal('show');
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
