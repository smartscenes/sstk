// In memory database of asset infos
// For quick and dirty assets

'use strict';

const Constants = require('Constants');
const AssetLoader = require('assets/AssetLoader');
const DataUtils = require('data/DataUtils');
const IOUtil = require('io/IOUtil');
const SolrQueryParser = require('search/SolrQueryParser');
const _ = require('util/util');

/**
 * Simple in memory database of assets
 * @param params
 * @param [params.assetIdField='id'] {string} What field to use for asset id
 * @param [params.fieldOptions] {object}
 * @param [params.convertDataFn] {function(object): object} Convert asset info
 * @param [params.lazyConvertDataFn] {function(object): object} Lazy convert asset info
 * @param [params.groupDataFn] {function(object[]): object[]} Reshape asset info array
 * @param [params.defaults] {object}
 * @constructor
 * @memberOf assets
 */
const AssetsDb = function (params) {
  params = params || {};
  this.assetIdField = params.assetIdField || 'id';
  this.fieldOptions = params.fieldOptions;
  this.assetInfos = [];
  this.assetIdToInfo = {};
  this.lazyConvertDataFn = params.lazyConvertDataFn;
  this.convertDataFn = params.convertDataFn;
  this.groupDataFn = params.groupDataFn;
  this.defaults = params.defaults;
  this.fields = [];
};

AssetsDb.prototype.__getSimpleFilter = function(queryTerms) {
  // Old style, simplified parsing
  const queryPairs = queryTerms.map(function (x) { return x.split(':', 2); });
  const filter = function (m) {
    for (let i = 0; i < queryPairs.length; i++) {
      const f = queryPairs[i][0];
      const v = queryPairs[i][1];
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
  let query = params.query;
  const start = params.start || 0;
  const limit = params.limit || 0;
  query = query.trim();
  if (query === '' || query === '*:*') {
    const resp = this.getMatching(null, start, limit);
    const data = { response: resp };
    // parameters to callback: data, textStatus, jqXH
    callback(null, data);
  } else {
    const queryTerms = query.split(' ');
    if (queryTerms.length === 1 && queryTerms[0].startsWith('fullId:') && queryTerms[0].indexOf('*') < 0) {
      // Special handling if search by fullId
      const assetInfo = this.getAssetInfo(queryTerms[0].substring('fullId:'.length));
      const docs = [];
      if (assetInfo) {
        docs.push(assetInfo);
      }
      const data = { response: { docs: docs, start: 0, numFound: docs.length } };
      callback(null, data);
    } else {
      let filter;
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
      const resp = this.getMatching(filter, start, limit);
      const data = {response: resp};
      // parameters to callback: data, textStatus, jqXH
      callback(null, data);
    }
  }
  // TODO: CHECK FOR ERRORS IN QUERY
  //  callback('Unsupported query ' + query)
};

AssetsDb.prototype.getFilter = function(query) {
  if (query == null || query === '' || query === '*:*') {
    return null;
  } else {
    let filter;
    try {
      // Try parsing with special solrQueryParser
      filter = SolrQueryParser.getFilter(query);
      //console.log(filter);
    } catch (err) {
      console.error('Invalid query "' + query + '": ' + err.message);
      console.error(err);
      // Try simple filter
      const queryTerms = query.split(' ');
      filter = this.__getSimpleFilter(queryTerms);
    }
    return filter;
  }
};

AssetsDb.prototype.getMatching = function (filter, start, limit, sort) {
  if (start == null) {
    start = 0;
  }
  if (limit == null) {
    limit = 0;
  }
  let matched = [];
  let nMatched = 0;
  let infos = this.assetInfos;
  if (sort) {
    infos = sort(infos);
  }
  if (filter) {
    for (let i = 0; i < infos.length; i++) {
      const m = infos[i];
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
  if (this.lazyConvertDataFn) {
    matched = _.map(matched, this.lazyConvertDataFn);
  }
  return { docs: matched, start: start, numFound: nMatched };
};

AssetsDb.prototype.getAssetInfo = function (assetId) {
  const assetInfo = this.assetIdToInfo[assetId];
  if (this.lazyConvertDataFn) {
    return assetInfo? this.lazyConvertDataFn(assetInfo) : null;
  } else {
    return assetInfo;
  }
};

AssetsDb.prototype.getAssetIds = function() {
  return _.keys(this.assetIdToInfo);
};

AssetsDb.prototype.clear = function () {
  this.assetInfos = [];
  this.assetIdToInfo = {};
};

AssetsDb.prototype.__loadAssetInfoFromAssetIdList = function (assetGroup, data) {
  let lines = data.split('\n');
  lines = lines.map(function (line) { return line.trim(); })
    .filter(function (line) { return line.length > 0; });
  const assetInfos = lines.map(function (s) {
    return { id: s };
  });
  console.log('Got ' + assetInfos.length + ' assets');
  return assetInfos;
};

AssetsDb.prototype.__updateAssetInfo = function(assetGroup, m) {
  const assetIdField = this.assetIdField;
  if (assetGroup) {
    m['fullId'] = assetGroup.name + '.' + m[assetIdField];
    m['source'] = assetGroup.name;
    if (assetIdField !== 'id' && m['id'] == null) {
      m['id'] = String(m[assetIdField]);  // Ensures id is a string
    }
    if (assetGroup.assetFields && _.isArray(assetGroup.assetFields)) {
      const loadInfo = assetGroup.getLoadInfo(m[assetIdField], m['format'], m);
      _.defaults(m, _.pick(loadInfo, assetGroup.assetFields));
    }
  }
  if (this.defaults) {
    _.defaults(m, this.defaults);
  }
};

AssetsDb.prototype.__loadAssetInfoFromCsvData = function (assetGroup, data) {
  const scope = this;
  const parsed = IOUtil.parseDelimited(data, { header: true, skipEmptyLines: true,
    dynamicTyping: function(fieldname) {
        // Make sure id is treated as a string, but other fields are dynamically typed
        if (fieldname === scope.assetIdField || fieldname === 'id') {
          return false;
        } else {
          return true;
        }
    }
  });
  let splitFields = assetGroup.arrayFields;
  if (!splitFields) {
    splitFields = _.get(Constants.assetTypes, [assetGroup.type, 'arrayFields']);
  }
  let assetInfos = parsed.data;
  if (this.groupDataFn) {
    assetInfos = this.groupDataFn(assetInfos);
  }
  for (let i = 0; i < assetInfos.length; i++) {
    if (this.convertDataFn) {
      assetInfos[i] = this.convertDataFn(assetInfos[i]);
    }
    const m = assetInfos[i];
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
  const assetInfos = data;
  console.log('Got ' + assetInfos.length + ' assets for ' + assetGroup.name);
  return assetInfos;
};

AssetsDb.prototype.__loadAssetInfoFromJsonlData = function (assetGroup, data) {
  if (typeof data === 'string') {
    data = IOUtil.parseJsonl(data, { flatten: true });
  }
  const assetInfos = data;
  console.log('Got ' + assetInfos.length + ' assets for ' + assetGroup.name);
  return assetInfos;
};

AssetsDb.prototype.loadAssetInfoFromData = function (assetGroup, data, filename, options) {
  options = options || {};
  let assetInfos;
  if (filename.endsWith('json') || options.format === 'json') {
    assetInfos = this.__loadAssetInfoFromJsonData(assetGroup, data);
  } else if (filename.endsWith('jsonl') || options.format === 'jsonl') {
    assetInfos = this.__loadAssetInfoFromJsonlData(assetGroup, data);
  } else if (filename.endsWith('csv') || filename.endsWith('tsv') || options.format === 'csv' || options.format === 'tsv') {
    assetInfos = this.__loadAssetInfoFromCsvData(assetGroup, data);
  } else {
    assetInfos = this.__loadAssetInfoFromAssetIdList(assetGroup, data);
  }

  this.assetIdField = options.assetIdField || this.assetIdField;
  this.updateAssetInfos(assetInfos, assetGroup, options);
}

AssetsDb.prototype.updateAssetInfos = function(assetInfos, assetGroup, options) {
  const assetIdField = this.assetIdField;
  if (options && options.mode === 'merge' && options.assetField) {
    for (let i = 0; i < assetInfos.length; i++) {
      const m = assetInfos[i];
      const fullId = assetGroup.name + '.' + m[assetIdField];
      const asset = this.assetIdToInfo[fullId];
      _.set(asset, options.assetField, _.omit(m, [assetIdField, 'fullId', 'source']));
    }
  } else {
    this.setAssetInfos(assetInfos, assetGroup);
  }
};

AssetsDb.prototype.setAssetInfos = function(assetInfos, assetGroup) {
  const assetIdToInfo = {};
  for (let i = 0; i < assetInfos.length; i++) {
    const m = assetInfos[i];
    this.__updateAssetInfo(assetGroup, m);
    m.isCustomAsset = true;
    assetIdToInfo[m.fullId] = m;
  }
  this.assetInfos = assetInfos;
  this.assetIdToInfo = assetIdToInfo;
  this.fields = DataUtils.extractFieldsFromData(this.assetInfos, this.fieldOptions);
};

AssetsDb.prototype.loadAssetInfo = function (assetGroup, file, callback, options) {
  const scope = this;
  const loader = new AssetLoader();
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
