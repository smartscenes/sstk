'use strict';

var AssetGroups = require('assets/AssetGroups');
var Constants = require('Constants');
var PubSub = require('PubSub');
var SearchModule = require('search/SearchModule');
var SolrQuerier = require('search/SolrQuerier');
var _ = require('util/util');

var RNG = require('math/RNG');

/**
 * BasicBasicSearchController - Simple search controller that don't have a search panel attached to it
 * 
 * @param params
 * @constructor
 * @memberOf search
 */
function BasicSearchController(params) {
  PubSub.call(this);
  var defaults = {
    boostFields: ['name'],  // Fields to boost score when returning search results
    encodeQuery: false,     // Whether query should be encoded or not
    source: Constants.defaultModelSource,
    deferInit: false,
    searchTimeout: 10000    // Timeout in milliseconds
  };
  params = _.defaults(Object.create(null), params, defaults);

  this.name = params.name || 'searchController';
  this.rng = params.rng || RNG.global;
  this.boostFields = params.boostFields;
  this.encodeQuery = params.encodeQuery;
  this.searchTimeout = params.timeout;  // Timeout in milliseconds
  this.searchModulesBySource = {};  // Custom search modules by source

  this.useFiltered = true;
  this.__initializeFilters(params.assetFilters);

  this.sources = params.sources;
  if (!this.sources) {
    this.sources = Object.keys(this.searchUrls);
  }
  // Restrict sources for overall models3d search
  if (params.restrictModelSources) {
    var sources = this.sources.filter(function (elem) { return elem !== 'models3d' && elem !== 'scans'; }) ;
    this.restrictModelSources(sources);
  }

  this.defaultSearchModule = new SolrQuerier({
    timeout: this.searchTimeout
  });

  if (!params.deferInit) {
    this.init();
  }
}

BasicSearchController.prototype = Object.create(PubSub.prototype);
BasicSearchController.prototype.constructor = BasicSearchController;

BasicSearchController.prototype.init = function() {
  this.__registerSearchModules();
};

BasicSearchController.prototype.__initializeFilters = function(assetTypeFilterOptions) {
  assetTypeFilterOptions = assetTypeFilterOptions || {};
  assetTypeFilterOptions['model'] = assetTypeFilterOptions['model'] || {};
  assetTypeFilterOptions['scan'] = assetTypeFilterOptions['scan'] || {};
  assetTypeFilterOptions['scene'] = assetTypeFilterOptions['scene'] || {};
  assetTypeFilterOptions['room'] = assetTypeFilterOptions['room'] || {};
  assetTypeFilterOptions['texture'] = assetTypeFilterOptions['texture'] || {};
  this.__searchOptionsByAssetType = {
    'model': {
      name: 'models3d',
      defaultFilter: assetTypeFilterOptions['model'].filter,  // filter that will apply for all models
      sourceFilter: assetTypeFilterOptions['model'].sourceFilter,  // filter that will apply for all models (for restricting asset sources)
      groupFilter: ' +hasModel:true -modelSize:[' + Constants.maxModelSize + ' TO * ]',  // filter just for when all models are queried
      searchUrl: Constants.models3dSearchUrl,
      //var modelFields = 'fullId,name,source,id,tags,category,category0,wnlemmas,unit,up,front,nfaces,materials,scenes,datasets,hasModel,popularity,score';
      fields: ''
    },
    'scan': {
      name: 'scans',
      defaultFilter: assetTypeFilterOptions['scan'].filter,  // filter that will apply for all scans
      sourceFilter: assetTypeFilterOptions['scan'].sourceFilter,  // filter that will apply for all scans (for restricting asset sources)
      searchUrl: Constants.models3dSearchUrl,
      fields: ''
    },
    'scene': {
      name: 'scenes',
      defaultFilter: assetTypeFilterOptions['scene'].filter,
      sourceFilter: assetTypeFilterOptions['scene'].sourceFilter,  // filter that will apply for all scenes (for restricting asset sources)
      searchUrl: Constants.scenesSearchUrl,
      // TODO: If data is too big, only get it when user requests it
      // Also, add other informative fields for scenes
      fields: 'fullId,name,source,id,format,data,description,category,nmodels,nrooms,nlevels,nobjects,ndoors,nwindows,nwalls,npeople,nmisc,minPoint,maxPoint,dims,levelRating,overallRating'
    },
    'room': {
      name: 'rooms',
      defaultFilter: assetTypeFilterOptions['room'].filter,
      sourceFilter: assetTypeFilterOptions['room'].sourceFilter,  // filter that will apply for all rooms (for restricting asset sources)
      searchUrl: Constants.roomsSearchUrl,
      // TODO: If data is too big, only get it when user requests it
      // Also, add other informative fields for scenes
      //fields: 'fullId,name,source,id,format,data,description,category,nmodels,nrooms,nfloors'
      fields: ''
    },
    'texture': {
      name: 'textures',
      defaultFilter: assetTypeFilterOptions['texture'].filter,
      sourceFilter: assetTypeFilterOptions['texture'].sourceFilter,  // filter that will apply for all textures (for restricting asset sources)
      searchUrl: Constants.texturesSearchUrl,
      fields: 'fullId,name,source,id,tags,category,imageSize,fileSize'
    }
  };

  var assetGroups = AssetGroups.getAssetGroups();

  this.searchUrls = {};
  this.defaultSearchOptionsFiltered = {};
  this.defaultSearchOptionsUnfiltered = {};
  // Asset types
  for (var type in this.__searchOptionsByAssetType) {
    if (this.__searchOptionsByAssetType.hasOwnProperty(type)) {
      var assetType = this.__searchOptionsByAssetType[type];
      var name = assetType.name;
      this.searchUrls[name] = assetType.searchUrl;
      this.defaultSearchOptionsUnfiltered[name] = {
        fields: assetType.fields
      };
      var filter = assetType.defaultFilter || '';
      if (assetType.sourceFilter) {
        filter = filter + ' ' + assetType.sourceFilter;
      }
      if (assetType.groupFilter) {
        filter = filter + ' ' + assetType.groupFilter;
      }
      this.defaultSearchOptionsFiltered[name] = {
        filter: filter,
        fields: assetType.fields
      };
    }
  }
  // Specific asset groups
  for (var name in assetGroups) {
    if (assetGroups.hasOwnProperty(name)) {
      if (this.searchUrls[name]) {
        // Ignore (already added), happens for textures
        // console.log('Ignoring ' + name);
        continue;
      }
      this.__updateSearchFilterForAssetGroup(assetGroups[name]);
    }
  }
  this.enableFiltering(this.useFiltered);
};

BasicSearchController.prototype.__updateSearchFilterForAssetGroup = function(assetGroup) {
  // TODO: move some of these to be properties of the asset group...
  var name = assetGroup.name;
  var assetTypeOptions = this.__searchOptionsByAssetType[assetGroup.type] || {};
  this.searchUrls[name] = assetGroup.searchUrl || assetTypeOptions.searchUrl;
  if (!this.searchUrls[assetGroup.assetType]) {
    this.searchUrls[assetGroup.assetType] = this.searchUrls[name];
  }
  var filter = '+source:' + name;
  this.defaultSearchOptionsUnfiltered[name] = {
    filter: filter,
    fields: assetTypeOptions.fields
  };
  if (assetGroup.defaultFilter) {
    // Add filter for this asset group (other than the source:name filter)
    filter = filter + ' ' + assetGroup.defaultFilter;
  }
  if (assetTypeOptions.defaultFilter) {
    // Add filter for this assetType
    filter = filter + ' ' + assetTypeOptions.defaultFilter;
  }
  this.defaultSearchOptionsFiltered[name] = {
    filter: filter,
    fields: assetTypeOptions.fields
  };
};

BasicSearchController.prototype.__registerSearchModules = function() {
  var assetGroups = AssetGroups.getAssetGroups();
  //console.log('got sources', this.sources);
  for (var i = 0; i < this.sources.length; i++) {
    var name = this.sources[i];
    var assetGroup = assetGroups[name];
    //console.log('got asset group', assetGroup);
    if (assetGroup && assetGroup.assetDb) {
      if (!this.searchModulesBySource[assetGroup.name]) {
        this.registerSearchModule(assetGroup.name, assetGroup.assetDb);
      }
    }
  }
};

BasicSearchController.prototype.enableFiltering = function (filter) {
    this.useFiltered = filter;
    if (filter) {
      this.defaultSearchOptions = this.defaultSearchOptionsFiltered;
    } else {
      this.defaultSearchOptions = this.defaultSearchOptionsUnfiltered;
    }
  };

BasicSearchController.prototype.setFilter = function (assetType, filter) {
  var options = {};
  options[assetType] = { filter: filter };
  this.__initializeFilters(options);
};

BasicSearchController.prototype.restrictModelSources = function (sources) {
  this.restrictSources('models3d', sources);
};

BasicSearchController.prototype.restrictSources = function (datatype, sources) {
  var query = '(' + sources.join(' OR ') + ')';
  this.defaultSearchOptionsFiltered[datatype]['filter'] = this.defaultSearchOptionsFiltered[datatype]['filter'] + ' +source:' + query;
  this.defaultSearchOptionsUnfiltered[datatype]['filter'] = this.defaultSearchOptionsUnfiltered[datatype]['filter'] + ' +source:' + query;
};

BasicSearchController.prototype.hasSource = function (source) {
  return this.sources.indexOf(source) >= 0;
};

BasicSearchController.prototype.encodeQueryText = function (text) {
  // Do a normal encodeURIComponent, but then replace
  // '%20' with '+' so that spaces are handled in the way
  // that Solr expects them.
  text = encodeURIComponent(text);
  text = text.replace(/%20/g, '+');
  return text;
};

BasicSearchController.prototype.getQuerySortOrder = function () {
  return '';
};

// TODO: convert to error first callback
BasicSearchController.prototype.searchByIds = function (source, ids, searchSucceededCallback, searchFailedCallback) {
  if (!ids || ids.length === 0) {
    searchFailedCallback('Please specify ids for searchByIds');
    return;
  }
  var query;
  ids = ids.map(function(x) { return x.trim(); }).filter(function(x) { return x.length > 0; });
  var hasFullId = ids.findIndex(function(x) { return x.indexOf('.') > 0; }) >= 0;
  if (/*source !== 'textures' && */ hasFullId) {
    query = this.getQuery('fullId', ids);
  } else {
    query = this.getQuery('id', ids);
  }
  // TODO: support pagination
  var sortOrder = this.getQuerySortOrder();
  this.query(
    {
      source: source, query: query, order: sortOrder, start: 0, limit: ids.length,
    }, (err, res) => {
      if (err) {
        if (searchFailedCallback) searchFailedCallback(err);
      } else {
        if (searchFailedCallback) searchSucceededCallback(res);
      }
    }
  );
};

BasicSearchController.prototype.getQuery = function (field, values) {
  if (values instanceof Array) {
    return field + ':(' + values.join(' OR ') + ')';
  } else {
    return field + ':' + values;
  }
};

BasicSearchController.prototype.__getSearchUrl = function(source) {
  var solrUrl = this.searchUrls[source];
  if (!solrUrl) {
    solrUrl = this.searchUrls['models3d'];
  }
  return solrUrl;
};

// Custom search modules (not part of solr)
BasicSearchController.prototype.registerSearchModule = function (source, searchModule) {
  if (!searchModule) {
    console.warn('No search module given for ' + source);
    return;
  }
  // console.log('register search module', source);
  if (typeof searchModule === 'string') {
    // Just a solr url
    this.searchUrls[source] = searchModule;
    if (searchModule === this.searchUrls['models3d'] || searchModule === this.searchUrls['scenes']) {
      var assetGroups = AssetGroups.getAssetGroups();
      this.__updateSearchFilterForAssetGroup(assetGroups[source]);
    }
  } else {
    this.searchModulesBySource[source] = searchModule;
  }
};

// New search module interface for search panel
// Faceted search for a field with search succeeded/failed callbacks
BasicSearchController.prototype.facetFieldSearch = function (params, callback) {
  var source = params.source || this.source;
  var solrUrl = params.url || this.__getSearchUrl(source);
  var defaultOptions = this.defaultSearchOptions[source];
  params = _.defaults(Object.create(null), params, defaultOptions || {},
    { url: solrUrl, facetSort: SearchModule.facetOrderCount });
  return this.defaultSearchModule.facetFieldSearch(params, callback);
};

// Stats search for a field with search succeeded/failed callbacks
BasicSearchController.prototype.getStats = function (params, callback) {
  var source = params.source || this.source;
  var solrUrl = params.url || this.__getSearchUrl(source);
  var defaultOptions = this.defaultSearchOptions[source];
  params = _.defaults(Object.create(null), params, defaultOptions || {}, { url: solrUrl });
  return this.defaultSearchModule.getStats(params, callback);
};

BasicSearchController.prototype.lookupFields = function (url, callback) {
  return this.defaultSearchModule.lookupFields({url: url }, callback);
};

BasicSearchController.prototype.getRandomSortOrder = function () {
  return this.defaultSearchModule.getRandomSortOrder(this.rng);
};

BasicSearchController.prototype.queryIds = function(ids, callback) {
  this.searchByIds(this.source, ids, function (data) {
    callback(null, data);
  }, function (err) {
    callback(err);
  });
};

BasicSearchController.prototype.getQueryUrl = function (opts) {
  var updatedQueryOpts = this.__createQueryOptions(opts);
  return this.defaultSearchModule.getQueryUrl(updatedQueryOpts);
};

BasicSearchController.prototype.getQueryOpts = function (opts) {
  var updatedQueryOpts = this.__createQueryOptions(opts);
  return this.defaultSearchModule.getQueryOpts(updatedQueryOpts);
};

BasicSearchController.prototype.__createQueryOptions = function (queryOpts) {
  if (queryOpts.searchText && !queryOpts.query) {
    var searchTerm = this.encodeQuery ? this.encodeQueryText(queryOpts.searchText) : queryOpts.searchText;
    var solrQuery = searchTerm;
    if (this.encodeQuery && this.boostFields) {
      for (var i = 0; i < this.boostFields.length; i++) {
        solrQuery = solrQuery + ' ' + this.boostFields[i] + ':' + searchTerm + '^2 ';
      }
    }
    queryOpts = _.clone(queryOpts);
    queryOpts.query = solrQuery;
  }

  var source = queryOpts.source || this.source;
  var solrUrl = queryOpts.url || this.__getSearchUrl(source);
  var solrQuery = queryOpts.query;
  // Create query data object
  // Add default options to query data
  var defaultOptions = this.defaultSearchOptions[source];
  //console.log('got defaultOptions', defaultOptions, source, this);
  if (defaultOptions) {
    // Skip additional filtering of query if only looking for single fullId model
    var skipFilter = solrQuery.indexOf('fullId:') >= 0;
    if (skipFilter) {
      defaultOptions = _.omit(defaultOptions, 'filter');
    }
  }
  //console.log('got defaultOptions', defaultOptions);
  return _.defaults(Object.create(null), queryOpts, defaultOptions || {}, { url: solrUrl });
};

BasicSearchController.prototype.query = function(queryOpts, callback) {
  var updatedQueryOpts = this.__createQueryOptions(queryOpts);
  //console.log('querying', updatedQueryOpts);
  var searchModule = this.searchModulesBySource[queryOpts.source];
  if (searchModule) {
    searchModule.query(updatedQueryOpts, callback);
  } else {
    this.defaultSearchModule.query(updatedQueryOpts, callback);
  }
};

module.exports = BasicSearchController;
