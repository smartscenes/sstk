'use strict';

var Constants = require('Constants');
var SearchPanel = require('ui/SearchPanel');
var BasicSearchController = require('search/BasicSearchController');
var _ = require('util');

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
      'color', 'material', 'shape', 'depicts', 'state', 'usedFor', 'foundIn', 'hasPart', 'attr',
      'solidVolume', 'surfaceVolume', 'supportSurfaceArea',
      'volume', 'weight', 'staticFrictionForce',
      'isCornerPiece', 'isContainerLike', 'materialsCategory',
      'setIds', 'componentIds',
      'isSingleCleanObject', 'isAligned',
      'tags', 'description', 'category', 'category0', 'wnlemmas', 'wnsynsetkey',
      'unit', 'up', 'front', 'nfaces',
      'scenes', 'datasets',
      'nrooms', 'nlevels', 'nmodels', 'nobjects', 'ndoors', 'nwindows', 'nwalls', 'npeople', 'nmisc', // scenes
      'levelRating', 'overallRating', // scene ratings
      'floorArea', // Rooms
      'a3d.category', 'imageSize', 'fileSize', 'popularity', 'modelQuality',
      'pcaDim', 'dims', 'aligned.dims', 'score']
  };
  params = _.defaults(Object.create(null), params, defaults);
  BasicSearchController.call(this, params);

  var scope = this;
  this.searchPanel = new SearchPanel(_.defaults({
      sources: this.sources,
      searchModule: this
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
}

SearchController.prototype = Object.create(BasicSearchController.prototype);
SearchController.prototype.constructor = SearchController;

Object.defineProperty(SearchController.prototype, 'isSearchBySize', {
  get: function () { return this.searchPanel.isSearchBySize; },
  set: function (v) { this.searchPanel.isSearchBySize = v; }
});

Object.defineProperty(SearchController.prototype, 'source', {
  get: function () { return this.searchPanel.source; },
  set: function (source) { this.searchPanel.selectSource(source); }
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
  this.searchPanel.search(query, callback, searchDisplayOptions);
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

// Model similarity searches

SearchController.prototype.modelSimilaritySearch = function (modelId, similarity, start, limit,
                                                            searchSucceededCallback, searchFailedCallback) {
  if (!searchSucceededCallback) {
    // Use default search succeeded callback
    searchSucceededCallback = function (data) {
      var models = data.results;
      if (models) {
        var modelIds = models.map(function (m) { return m.modelId; });
        var options = { ordering: models, idField: 'modelId' };
        this.searchByIds(this.source, modelIds,
          this.searchPanel.searchSucceeded.bind(this.searchPanel, options), this.searchPanel.searchFailed.bind(this.searchPanel));
      } else {
        if (data.message) {
          this.searchPanel.showSearchFailedMessage(data.message);
        }
      }
    }.bind(this);
  }
  if (!searchFailedCallback) {
    // Use default search failed callback
    searchFailedCallback = this.searchPanel.searchFailed.bind(this.searchPanel);
  }

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
        success: searchSucceededCallback,
        error: searchFailedCallback,
        timeout: 10000      // in milliseconds. With JSONP, this is the only way to get the error handler to fire.
      });
};

// More advanced model text search (using custom nlp)
SearchController.prototype.modelTextSearch = function (text, sceneState, limit,
                                                      searchSucceededCallback, searchFailedCallback) {
  if (!searchSucceededCallback) {
    // Use default search succeeded callback
    searchSucceededCallback = function(json) {
      var data = json.results;
      var models = data.results;
      if (models && models.length > 0) {
        var modelIds = models.map(function (m) { return m.modelId; });
        var options = { ordering: models, idField: 'modelId' };
        this.searchByIds(this.source, modelIds,
          this.searchPanel.searchSucceeded.bind(this.searchPanel, options), this.searchPanel.searchFailed.bind(this.searchPanel));
      } else {
        if (data.message) {
          this.searchPanel.showSearchFailedMessage(data.message);
        }
      }
    }.bind(this);
  }
  if (!searchFailedCallback) {
    // Use default search failed callback
    searchFailedCallback = this.searchPanel.searchFailed.bind(this.searchPanel);
  }

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
      success: searchSucceededCallback,
      error: searchFailedCallback,
      timeout: timeout      // in milliseconds. With JSONP, this is the only way to get the error handler to fire.
    });
};

// Custom search modules (not part of solr)
SearchController.prototype.registerSearchModule = function (source, searchModule) {
  BasicSearchController.prototype.registerSearchModule.call(this, source, searchModule);
  this.searchPanel.registerSource(source);
};

module.exports = SearchController;
