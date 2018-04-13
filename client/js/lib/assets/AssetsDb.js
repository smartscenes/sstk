// In memory database of asset infos
// For quick and dirty assets

'use strict';

var AssetLoader = require('assets/AssetLoader');
var DataUtils = require('data/DataUtils');
var IOUtil = require('io/IOUtil');
var SolrQueryParser = require('search/SolrQueryParser');
var _ = require('util');

/**
 * Simple in memory database of assets
 * @param params
 * @constructor
 * @memberOf assets
 */
var AssetsDb = function (params) {
  params = params || {};
  this.assetIdField = params.assetIdField || 'id';
  this.fieldOptions = params.fieldOptions;
  this.assetInfos = [];
  this.assetIdToInfo = {};
  this.convertDataFn = params.convertDataFn;
  this.defaults = params.defaults;
  this.fields = [];
};

AssetsDb.prototype.__getSimpleFilter = function(queryTerms) {
  // Old style, simplified parsing
  var queryPairs = queryTerms.map(function (x) { return x.split(':', 2); });
  var filter = function (m) {
    for (var i = 0; i < queryPairs.length; i++) {
      var f = queryPairs[i][0];
      var v = queryPairs[i][1];
      if (v === '*') {
        if (m[f] === null || m[f] === undefined) {
          return false;
        }
      } else if (m[f] !== v) {
        return false;
      }
    }
    return true;
  };
  return filter;
};

/**
 * Execute basic query
 * @param params Query parameters
 * @param [params.query=*:*] {string} Query
 * @param [params.start=0] {int} Record to start at
 * @param [params.limit=0] {int} Limit on number of records to fetch
 * @param [params.sort] {string} Sort order
 * @param [params.fields] {string} Fields to return
 * @param [params.filter] {string} Additional filter (ex: '+datasets:ShapeNet')
 * @param callback Error first callback
 */
AssetsDb.prototype.query = function (params, callback) {
  var query = params.query;
  var start = params.start || 0;
  var limit = params.limit || 0;
  query = query.trim();
  if (query === '' || query === '*:*') {
    var resp = this.getMatching(null, start, limit);
    var data = { response: resp };
    // parameters to callback: data, textStatus, jqXH
    callback(null, data);
  } else {
    var queryTerms = query.split(' ');
    if (queryTerms.length === 1 && queryTerms[0].startsWith('fullId:')) {
      // Special handling if search by fullId
      var assetInfo = this.getAssetInfo(queryTerms[0].substring('fullId:'.length));
      var docs = [];
      if (assetInfo) {
        docs.push(assetInfo);
      }
      var data = { response: { docs: docs, start: 0, numFound: docs.length } };
      callback(null, data);
    } else {
      var filter;
      try {
        // Try parsing with special solrQueryParser
        filter = SolrQueryParser.getFilter(query);
        //console.log(filter);
      } catch (err) {
        console.error('Invalid query "' + query + '": ' + err.message);
        console.error(err);
        // Try simple filter
        filter = this.__getSimpleFilter(queryTerms);
      }
      var resp = this.getMatching(filter, start, limit);
      var data = {response: resp};
      // parameters to callback: data, textStatus, jqXH
      callback(null, data);
    }
  }
  // TODO: CHECK FOR ERRORS IN QUERY
  //  callback('Unsupported query ' + query)
};

AssetsDb.prototype.getMatching = function (filter, start, limit, sort) {
  var matched = [];
  var nMatched = 0;
  var infos = this.assetInfos;
  if (sort) {
    infos = sort(infos);
  }
  if (filter) {
    for (var i = 0; i < infos.length; i++) {
      var m = infos[i];
      if (filter(m)) {
        if (nMatched >= start && (limit <= 0 || matched.length < limit)) {
          matched.push(m);
        }
        nMatched++;
      }
    }
  } else {
    if (limit > 0) {
      matched = infos.slice(start, start + limit);
    } else {
      matched = infos.slice(start);
    }
    nMatched = infos.length;
  }
  return { docs: matched, start: start, numFound: nMatched };
};

AssetsDb.prototype.getAssetInfo = function (assetId) {
  return this.assetIdToInfo[assetId];
};

AssetsDb.prototype.getAssetIds = function() {
  return _.keys(this.assetIdToInfo);
};

AssetsDb.prototype.clear = function () {
  this.assetInfos = [];
  this.assetIdToInfo = {};
};

AssetsDb.prototype.__loadAssetInfoFromAssetIdList = function (assetGroup, data) {
  var lines = data.split('\n');
  lines = lines.map(function (line) { return line.trim(); })
    .filter(function (line) { return line.length > 0; });
  var assetInfos = lines.map(function (s) {
    return { id: s };
  });
  console.log('Got ' + assetInfos.length + ' assets');
  return assetInfos;
};

AssetsDb.prototype.__updateAssetInfo = function(assetGroup, m) {
  if (assetGroup) {
    m['fullId'] = assetGroup.name + '.' + m[this.assetIdField];
    m['source'] = assetGroup.name;
    if (assetGroup.assetFields && _.isArray(assetGroup.assetFields)) {
      var loadInfo = assetGroup.getLoadInfo(m[this.assetIdField], m['format'], m);
      _.defaults(m, _.pick(loadInfo, assetGroup.assetFields));
    }
  }
  if (this.defaults) {
    _.defaults(m, this.defaults);
  }
};

AssetsDb.prototype.__loadAssetInfoFromCsvData = function (assetGroup, data) {
  var parsed = IOUtil.parseDelimited(data, { header: true, skipEmptyLines: true,
    dynamicTyping: function(fieldname) {
        // Make sure id is treated as a string, but other fields are dynamically typed
        if (fieldname === 'id') {
          return false;
        } else {
          return true;
        }
    }
  });
  // TODO: Rework hack
  var arrayFields = {
    model: ['datasets', 'category', 'variantIds', 'componentIds', 'setIds', 'wnsynset','wnsynsetkey'],
    scene: ['datasets', 'modelIds', 'modelCats', 'modelNames', 'modelTags', 'roomIds', 'roomTypes', 'origRoomTypes']
  };
  var splitFields = arrayFields[assetGroup.type];
  var assetInfos = parsed.data;
  for (var i = 0; i < assetInfos.length; i++) {
    if (this.convertDataFn) {
      assetInfos[i] = this.convertDataFn(assetInfos[i]);
    }
    var m = assetInfos[i];
    if (splitFields) {
      _.each(m, function(v,k) {
        if (splitFields.indexOf(k) >= 0 && v != undefined) {
          if (typeof(v) != 'string') {
            v = v.toString();
          }
          v = v.trim();
          if (v.length > 0) {
            m[k] = v.split(',');
          } else {
            m[k] = [];
          }
        }
      });
    }
  }
  console.log('Got ' + assetInfos.length + ' assets');
  return assetInfos;
};

AssetsDb.prototype.__loadAssetInfoFromJsonData = function (assetGroup, data) {
  if (typeof data === 'string') {
    data = JSON.parse(data);
  }
  var assetInfos = data;
  console.log('Got ' + assetInfos.length + ' assets');
  return assetInfos;
};

AssetsDb.prototype.loadAssetInfoFromData = function (assetGroup, data, filename, options) {
  options = options || {};
  var assetInfos;
  if (filename.endsWith('json') || options.format === 'json') {
    assetInfos = this.__loadAssetInfoFromJsonData(assetGroup, data);
  } else if (filename.endsWith('csv') || filename.endsWith('tsv') || options.format === 'csv' || options.format === 'tsv') {
    assetInfos = this.__loadAssetInfoFromCsvData(assetGroup, data);
  } else {
    assetInfos = this.__loadAssetInfoFromAssetIdList(assetGroup, data);
  }

  if (options.mode === 'merge' && options.assetField) {
    var assetIdField = options.assetIdField || this.assetIdField;
    for (var i = 0; i < assetInfos.length; i++) {
      var m = assetInfos[i];
      var fullId = assetGroup.name + '.' + m[assetIdField];
      var asset = this.assetIdToInfo[fullId];
      _.set(asset, options.assetField, _.omit(m, [assetIdField, 'fullId', 'source']));
    }
  } else {
    var assetIdToInfo = {};
    for (var i = 0; i < assetInfos.length; i++) {
      var m = assetInfos[i];
      this.__updateAssetInfo(assetGroup, m);
      m.isCustomAsset = true;
      assetIdToInfo[m.fullId] = m;
    }
    this.assetInfos = assetInfos;
    this.assetIdToInfo = assetIdToInfo;
    this.fields = DataUtils.extractFieldsFromData(this.assetInfos, this.fieldOptions);
  }
};

AssetsDb.prototype.loadAssetInfo = function (assetGroup, file, callback, options) {
  var scope = this;
  var loader = new AssetLoader();
  return loader.loadErrorFirst(file, undefined, function(err, data) {
    if (!err) {
      scope.loadAssetInfoFromData(assetGroup, data, file.name || file, options);
    }
    if (callback) {
      callback(err, scope);
    }
  });
};

module.exports = AssetsDb;
