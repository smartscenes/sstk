'use strict';

var AssetManager = require('assets/AssetManager');
var SearchController = require('search/SearchController');
var VisualSchemaSearch = require('ui/VisualSchemaSearch');
var SchemaHelp = require('ui/SchemaHelp');
var _ = require('util');
require('jquery-lazy');

function AssetQuerier(options) {
  var defaults = {
    viewerWindowName: 'Asset Viewer',
    entriesPerRow: 6,
    nRows: 50,
    schemas: {}
  };
  options = _.defaults({}, options, defaults);
  this.init(options);
}

AssetQuerier.prototype.init = function (options) {
  var scope = this;
  scope.__initAssets(options)
    .then(function(assetGroups) {
      // Update schemas with registered asset groups
      if (assetGroups) {
        for (var i = 0; i < assetGroups.length; i++) {
          var assetGroup = assetGroups[i];
          if (assetGroup.solrUrl && assetGroup.assetTypeInfo) {
            var schemaClass = assetGroup.assetTypeInfo.schema;
            assetGroup.schemaUrl = assetGroup.solrUrl + '/schema/fields';
            assetGroup.searchUrl = assetGroup.solrUrl + '/select';
            if (schemaClass) {
              options.schemas[assetGroup.name] = new schemaClass({
                schemaUrl: assetGroup.schemaUrl,
                searchUrl: assetGroup.searchUrl
              });
              if (!options.schemas[assetGroup.type]) {
                options.schemas[assetGroup.type] = options.schemas[assetGroup.name];
              }
            }
          }
        }
      }
      scope.__initSearch(options);
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

AssetQuerier.prototype.__initSearch = function (options) {
  this.viewerUrl = options.viewerUrl;
  this.viewerIframe = options.viewerIframe;
  this.viewerModal = options.viewerModal;
  this.viewerWindowName = options.viewerWindowName;

  this.assetTypes = options.assetTypes;
  this.selectedAssetType = options.selectedAssetType || this.assetTypes[0];
  this.schemas = options.schemas;
  this.schemasBySource = _.keyBy(this.schemas, 'source');

  // add data constraints gui
  this.visualSearch = new VisualSchemaSearch({
    container: $(options.filterPanel),
    filters: options.filters,
    schema: this.schemas[this.selectedAssetType]
  });
  if (options.helpPanel) {
    if (typeof options.helpPanel === 'string') {
      options.helpPanel = { selector: options.helpPanel };
    }
    this.helpPanel = $(options.helpPanel.selector);
    this.helpPanel.close = options.helpPanel.close || function() { this.helpPanel.hide(); }.bind(this);
    this.__updateHelp();
  }

  // Main search panel where search results are displayed
  var sources = this.assetTypes.map( function(x) { return this.schemas[x].source; }.bind(this));
  this.searchPanel = $(options.searchPanel);
  this.searchButton = $(options.searchButton);
  this.searchTextElem = $(options.searchTextElem);
  this.searchController = new SearchController({
    sources: sources,
    getImagePreviewUrlCallback: this.assetManager.getImagePreviewUrl.bind(this.assetManager),
    onClickResultCallback: this.showResult.bind(this),
    appendResultElemCallback: options.customizeResult,
    entriesPerRow: options.entriesPerRow,
    nRows: options.nRows,
    searchPanel: this.searchPanel,
    loadImagesLazy: true,
    encodeQuery: false,
    showSearchSourceOption: sources.length > 1,
    showLoadFile: true,
    allowSave: true,
    sourceChangedCallback: function(source) {
      var schema = this.schemasBySource[source];
      this.selectedAssetType = schema.assetType;
      this.visualSearch.setSchema(schema);
      this.__updateHelp();
    }.bind(this),
    searchButton: this.searchButton,
    searchTextElem: this.searchTextElem,
    boostFields: []
  });
  if (options.screenshots) {
    var imageIndexElem = $('<select></select>');
    for (var i = 0; i < options.screenshots.length; i++) {
      imageIndexElem.append('<option value="' + options.screenshots[i] + '">' + options.screenshots[i] + '</option>');
    }
    imageIndexElem.val(options.screenshots[0]);
    var scope = this;
    var selectImagePreviewFunc = function() {
      scope.setPreviewImage(imageIndexElem.val());
    };
    imageIndexElem.change(selectImagePreviewFunc);
    selectImagePreviewFunc();
    this.searchController.searchPanel.addToSearchOptions(imageIndexElem);
  }
  this.searchController.Subscribe('startSearch', this, function(searchTerm){
    // The search controller is about to start searching...
    // make sure our filters are in place
    this.searchController.setFilter(this.selectedAssetType, this.visualSearch.getFilterString());
  }.bind(this));
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

AssetQuerier.prototype.__updateHelp = function() {
  var scope = this;
  var schema = this.schemas[this.selectedAssetType];
  if (!schema.help) {
    schema.help = new SchemaHelp({
      schema: schema,
      useVisualSearch: true,
      allowSort: true,
      exampleLinkClicked: function(example) {
        if (example.filters) {
          scope.searchController.setFilter(scope.selectedAssetType, example.filters);
        } else {
          scope.searchController.setFilter(scope.selectedAssetType, scope.visualSearch.getFilterString());
        }
        scope.searchController.setSearchText(example.query);
        scope.searchController.search(example.query);
        scope.helpPanel.close();
      }
    });
  }
  var helpDiv = schema.help.getHelp();
  this.helpPanel.empty();
  this.helpPanel.append(helpDiv);
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

AssetQuerier.prototype.setPreviewImage = function(imageIndex) {
  this.assetManager.previewImageIndex = imageIndex;
  this.searchController.updatePreviewImages(imageIndex);
};

// Exports
module.exports = AssetQuerier;
