'use strict';

var AssetManager = require('assets/AssetManager');
var SearchController = require('search/SearchController');
var VisualSchemaSearch = require('ui/VisualSchemaSearch');
var SchemaHelp = require('ui/SchemaHelp');
var _ = require('util');
require('jquery-lazy');

/**
 * Asset querier with visual search and schema
 * The asset querier provides an ui for a user to query for assets.
 * Preview images of assets are displayed in a search panel allowing for pagination.
 * @constructor
 * @memberOf query
 * @param options Configuration parameters for AssetQuerier
 * @param [options.schemas] {Object<string,data.DataSchema>} Map of asset group to schema.  If not specified, schema for asset type is created and used.
 * @param [options.filters] {data.FieldFilter[]} Initial set of filters for search
 * @param [options.filterPanel] {jQueryObject|string} jQuery object or selector for filter panel for visual search
 * @param [options.entriesPerRow=6] {int} Number of entries to show per row
 * @param [options.nRows=50] {int} Number of rows to show
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
 * @param [options.sources] {string[]} Asset data sources to support (defaults to sources corresponding to `assetTypes` if not specified)
 * @param [options.previewImageIndex] {int|string} Which image to use for the preview image (shown in search results)
 * @param [options.onClickAsset] {function(source, id, result)} Callback for when an asset is clicked (defaults to showing the asset in a new tab or modal)
 * @param [options.customizeResult] {function(source, id, result, element)} Callback to customize display of asset in element
 * @param [options.showLoadFile=true] {boolean} Whether option to load file of ids is shown
 * @param [options.allowSave=true] {boolean} Whether option to save list of ids of shown
 * @param [options.initialQuery] {string} Initial query of assets to search for
 * @param [options.idsFile] {string|File} File of ids (one per line) to display
 * @param [options.screenshots] {string[]} List of screenshots to show
 * @param [options.useScreenShotIndex] {boolean} Whether to use screenshot index (true) or label (false)
 */
function AssetQuerier(options) {
  var defaults = {
    viewerWindowName: 'Asset Viewer',
    entriesPerRow: 6,
    nRows: 50,
    showLoadFile: true,
    allowSave: true,
    schemas: {}
  };
  this.urlParams = _.getUrlParams();
  options = _.defaults({}, this.urlParams, options, defaults);
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
          //console.log('got assetGroup', assetGroup);
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
  var sources = options.sources || this.assetTypes.map( function(x) { return this.schemas[x].source; }.bind(this));
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
    showAnimatedOnHover: options.showAnimatedOnHover,
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
    var useScreenShotIndex = options.useScreenShotIndex;
    var imageIndexElem = $('<select></select>');
    for (var i = 0; i < options.screenshots.length; i++) {
      var v = useScreenShotIndex? i : options.screenshots[i];
      imageIndexElem.append('<option value="' + v + '">' + options.screenshots[i] + '</option>');
    }
    imageIndexElem.val(useScreenShotIndex? 0 : options.screenshots[0]);
    var scope = this;
    var selectImagePreviewFunc = function() {
      //console.log('got imageIndexElem', imageIndexElem.val());
      scope.setPreviewImage(imageIndexElem.val());
    };
    imageIndexElem.change(selectImagePreviewFunc);
    selectImagePreviewFunc();
    this.searchController.searchPanel.addToSearchOptions(imageIndexElem);
  }
  this.searchController.Subscribe('startSearch', this, function(searchTerm){
    // The search controller is about to start searching...
    // make sure our filters are in place
    //console.log('startSearch', this.selectedAssetType, this.visualSearch.getFilterString());
    this.searchController.setFilter(this.selectedAssetType, this.visualSearch.getFilterString());
  }.bind(this));
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
  if (this.viewerIframe) {
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

AssetQuerier.prototype.setPreviewImage = function(imageIndex) {
  this.assetManager.previewImageIndex = imageIndex;
  this.searchController.updatePreviewImages(imageIndex);
};

// Exports
module.exports = AssetQuerier;
