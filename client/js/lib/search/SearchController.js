'use strict';

var Constants = require('Constants');
var SearchPanel = require('ui/SearchPanel');
var BasicSearchController = require('search/BasicSearchController');
var _ = require('util/util');

/**
 * SearchController with search panel
 * @param params
 * @constructor
 * @extends search.BasicSearchController
 * @memberOf search
 */
function SearchController(params) {
  var defaults = {
    // Fields to include in tooltip
    tooltipIncludeFields: ['fullId', 'name', 'source', 'id',
      'tags', 'description', 'category', 'category0', 'wnlemmas', 'wnsynsetkey', 'wnhyperlemmas', 'wnhypersynsetkeys',
      'color', 'material', 'shape', 'depicts', 'state', "style", "theme", 'usedFor', 'foundIn', 'hasPart', 'attr',
      'solidVolume', 'surfaceVolume', 'supportSurfaceArea',
      'volume', 'weight', 'staticFrictionForce',
      'isCornerPiece', 'isContainerLike', 'materialsCategory',
      'setIds', 'componentIds',
      'isSingleCleanObject', 'hasNestedObjects', 'hasMultipleObjects', 'isArrangement', 'isAligned',
      'support', 'symType',
      'unit', 'up', 'front', 'nfaces', 'nvertices',
      'scenes', 'datasets', 'datatags',
      'nrooms', 'nlevels', 'nmodels', 'nobjects', 'ndoors', 'nwindows', 'nwalls', 'npeople', 'nmisc', // scenes
      'levelRating', 'overallRating', // scene ratings
      'floorArea', 'floorAreaFilled', // Rooms
      'sceneType',
      'a3d.category', 'imageSize', 'fileSize', 'popularity', 'modelQuality',
      'pcaDim', 'dims', 'aligned.dims', 'score'],
    tooltipIncludeLimits: {'description': { length: 256 }}
  };
  params = _.defaults(Object.create(null), params, defaults);
  BasicSearchController.call(this, _.defaults({ deferInit: true}, params));

  var scope = this;
  this.searchPanel = new SearchPanel(_.defaults({
      sources: this.sources,
      searchModule: this,
      showCrumbs: params.showCrumbs,
      rootCrumb: params.rootCrumb,
      additionalSearchOpts: { solrQueryProxy: params.solrSearchQueryProxy },
      showRecent: params.showRecent
    },
    params));
  // Forward all events from searchPanel
  this.searchPanel.SubscribeAll(this, function(event) {
    scope.Publish.apply(scope, arguments);
  });

  // Application callback for searchSimilarityModelId
  this.searchSimilarGetModelIdCallback = params.searchSimilarGetModelIdCallback;
  if (this.searchSimilarGetModelIdCallback && this.searchPanel.showSearchOptions) {
    // Add search similar button
    this.searchPanel.searchSimilarButton = $('<input type="button" value="Similar"/>').click(
      function() {
        var sim = scope.searchPanel.searchSimilarByOptions.val();
        scope.modelSimilaritySearch(scope.searchSimilarGetModelIdCallback(), sim, 0, 21);
      });
    this.searchSimilarBys = ['gshist', 'lfd', 'sdd', 'shd', 'sis', 'zernike', 'combined'];
    this.searchPanel.searchSimilarByOptions = $('<select></select>');
    for (var i = 0; i < this.searchSimilarBys.length; i++) {
      var s = this.searchSimilarBys[i];
      this.searchPanel.searchSimilarByOptions.append('<option value="' + s + '">' + s + '</option>');
    }
    this.searchPanel.searchSimilarByOptions.val('sdd');
    //this.searchOptionsElem.append("<br/>");
    this.searchPanel.addToSearchOptions(this.searchPanel.searchSimilarByOptions);
    this.searchPanel.addToSearchOptions(this.searchPanel.searchSimilarButton);
  }

  if (!params.deferInit) {
    this.init();
  }
}

SearchController.prototype = Object.create(BasicSearchController.prototype);
SearchController.prototype.constructor = SearchController;

SearchController.prototype.addRecent = function(info) {
  this.searchPanel.addRecent(info);
};


Object.defineProperty(SearchController.prototype, 'primarySortOrder', {
  get: function() { return this.searchPanel.sortOrder; },
  set: function(v) { this.searchPanel.sortOrder = v; }
});
Object.defineProperty(SearchController.prototype, 'isSearchBySize', {
  get: function () { return this.searchPanel.isSearchBySize; },
  set: function (v) { this.searchPanel.isSearchBySize = v; }
});

Object.defineProperty(SearchController.prototype, 'crumbs', {
  get: function () { return this.searchPanel.crumbs; },
  set: function (v) { this.searchPanel.crumbs = v; }
});

Object.defineProperty(SearchController.prototype, 'source', {
  get: function () { return this.searchPanel.source; },
  set: function (source) { this.searchPanel.selectSource(source); }
});

Object.defineProperty(SearchController.prototype, 'searchText', {
  get: function () { return this.searchPanel.getSearchText(); }
});

SearchController.prototype.loadIdsFromFile = function(file) {
  this.searchPanel.loadIdsFromFile(file);
};

SearchController.prototype.selectSource = function (source) {
  this.searchPanel.selectSource(source);
};

SearchController.prototype.setSearchText = function (s) {
  return this.searchPanel.setSearchText(s);
};

SearchController.prototype.getSearchText = function (defaultValue) {
  return this.searchPanel.getSearchText(defaultValue);
};

SearchController.prototype.setResultList = function (source, ids) {
  this.searchPanel.setResultList(source, ids);
};

SearchController.prototype.updatePreviewImages = function (previewImageIndex) {
  this.searchPanel.updatePreviewImages(previewImageIndex);
};

SearchController.prototype.setSearchCallback = function (callback) {
  this.searchPanel.setSearchCallback(callback);
};

SearchController.prototype.onResize = function (options) {
  this.searchPanel.onResize(options);
};

SearchController.prototype.startSearch = function (callback) {
  this.searchPanel.startSearch(callback);
};

SearchController.prototype.refreshSearch = function () {
  this.searchPanel.refreshSearch();
};

SearchController.prototype.search = function (query, callback, searchDisplayOptions) {
  return this.searchPanel.search(query, callback, searchDisplayOptions);
};

SearchController.prototype.searchByIds = function (source, ids, searchSucceededCallback, searchFailedCallback) {
  ids = ids.map(function(x) { return x.trim(); }).filter(function(x) { return x.length > 0; });
  searchSucceededCallback = searchSucceededCallback || this.searchPanel.searchSucceeded.bind(
    this.searchPanel, {
      ordering: _.map(ids, function (id) {
        return {id: id};
      }), idField: 'id'
    });
  searchFailedCallback || this.searchPanel.searchFailed.bind(this.searchPanel);
  BasicSearchController.prototype.searchByIds.call(this, source, ids, searchSucceededCallback, searchFailedCallback);
};



SearchController.prototype.getQuerySortOrder = function () {
  return this.searchPanel.getQuerySortOrder();
};

// Search with a custom search querier and show results in search panel
SearchController.prototype.__getSearchCallbacks = function(source, idField, searchSucceededCb, searchFailedCb, toData) {
  const scope = this;
  if (!searchSucceededCb) {
    // Use default search succeeded callback
    searchSucceededCb = function(json) {
      var data = toData? toData(json) : json;
      var results = data.results;
      if (results) {
        var resultIds = results.map(function (m) { return m[idField]; });
        var options = { ordering: results, idField: idField };
        scope.searchByIds(source, resultIds,
          (data) => scope.searchPanel.searchSucceeded(options, data),
          (err) => scope.searchPanel.searchFailed(err));
      } else {
        var message = (data.message != null)? data.message : 'Cannot find matching results';
        scope.searchPanel.searchFailed(message);
      }
    };
  }
  if (!searchFailedCb) {
    // Use default search failed callback
    searchFailedCb = function(err) { scope.searchPanel.searchFailed(err); };
  }

  return { succeeded: searchSucceededCb, failed: searchFailedCb };
};

SearchController.prototype.initiateCustomSearch = function(querier, queryData, source, idField, searchSucceededCallback, searchFailedCallback) {
  source = (source == null)? this.source : source;
  var callbacks = this.__getSearchCallbacks(source, idField, searchSucceededCallback, searchFailedCallback);
  return querier.query(queryData, callbacks.succeeded, callbacks.failed);
};

// Model similarity searches
SearchController.prototype.modelSimilaritySearch = function (modelId, similarity, start, limit, searchSucceededCallback, searchFailedCallback) {
  var callbacks = this.__getSearchCallbacks(this.source, 'modelId', searchSucceededCallback, searchFailedCallback);
  var url = Constants.models3dSimilaritySearchUrl;
  var queryData = {
    'modelId': modelId,
    'similarity': similarity,
    'start': start,
    'rows': limit
  };
  var method = 'POST';
  _.ajax
      ({
        type: method,
        url: url,
        contentType: 'application/json;charset=utf-8',
        data: JSON.stringify(queryData),
        dataType: 'json',
        success: callbacks.succeeded,
        error: callbacks.failed,
        timeout: 10000      // in milliseconds. With JSONP, this is the only way to get the error handler to fire.
      });
};

// More advanced model text search (using custom nlp)
SearchController.prototype.modelTextSearch = function (text, sceneState, limit, searchSucceededCallback, searchFailedCallback) {
  var callbacks = this.__getSearchCallbacks(this.source, 'modelId', searchSucceededCallback, searchFailedCallback, function(json) {
    return json.results;
  });
  var url = Constants.models3dTextSearchUrl;
  var queryData = {
      'text': text,
      'initialSceneState': sceneState,
      'limit': limit
    };
  var timeout = this.searchTimeout;
  var method = 'POST';
  _.ajax
    ({
      type: method,
      url: url,
      contentType: 'application/json;charset=utf-8',
      data: JSON.stringify(queryData),
      dataType: 'json',
      success: callbacks.succeeded,
      error: callbacks.failed,
      timeout: timeout      // in milliseconds. With JSONP, this is the only way to get the error handler to fire.
    });
};

// Custom search modules (not part of solr)
SearchController.prototype.registerSearchModule = function (source, searchModule) {
  BasicSearchController.prototype.registerSearchModule.call(this, source, searchModule);
  this.searchPanel.registerSource(source);
};

module.exports = SearchController;
