const _ = require('util/util');

/**
 * Responsible for querying a Solr index
 * @param opts Configuration
 * @param opts.url {string} Solr url to query
 * @param [opts.timeout=5000] {int} Timeout (in milliseconds) to wait for the response
 * @param [opts.limit=100] {int} Limit on the number of entries to query
 * @constructor
 * @memberOf search
 */
function SolrQuerier(opts) {
  let url = opts.url;
  if (url) {
    if (url.endsWith('/select') || url.endsWith('/fields')) {
      const i = url.lastIndexOf('/');
      url = url.substring(0, i);
    }
    this.schemaUrl = url + '/schema/fields';
    this.searchUrl = url + '/select';
  }
  this.timeout = opts.timeout || 5000;
  this.limit = opts.limit || 100;
}

SolrQuerier.MAX_BOOLEAN_CLAUSES = 512;

SolrQuerier.prototype.escapeValue = function(str) {
  const pattern = /([\!\*\+\-\=<>\&\|\(\)\[\]\{\}\^\~\?\:\\/" ])/g;
  return str.replace(pattern, "\\$1");
};

SolrQuerier.prototype.quoteValue = function(str) {
  const pattern = /(["])/g;
  return '"' + str.replace(pattern, "\\$1") + '"';
};

SolrQuerier.prototype.getRandomSortOrder = function (rng) {
  const seed = Math.floor((rng.random() * 1000000000) + 1);
  return 'random_' + seed + ' desc';
};

/**
 * Returns a solr query string for querying records with field matching any one of the specified values
 * @param field {string} Field name
 * @param values {string|string[]} List of values to match
 * @param [escape] {string|function(string)} Whether and how to escape values
 * @returns {string} Solr query string
 */
SolrQuerier.prototype.getQuery = function (field, values, escape) {
  if (escape && typeof escape !== 'function') {
    if (escape === 'quote') {
      escape = this.quoteValue;
    } else {
      escape = this.escapeValue;
    }
  }
  if (values instanceof Array) {
    if (values.length) {
      if (values.length > SolrQuerier.MAX_BOOLEAN_CLAUSES) {
        console.warn('Long query, consider breaking it into several pieces');
      }
      const escaped = escape? _.map(values, function(x) { return escape(x); }) : values;
      return field + ':(' + escaped.join(' OR ') + ')';
    } else {
      return '';
    }
  } else {
    const escaped = escape? escape(values) : values;
    return field + ':' + escaped;
  }
};

/**
 * Returns a compound query string
 * @param conj {string} Conjuction (`AND|OR`)
 * @param terms {string[]} Terms to join
 * @returns {string}
 */
SolrQuerier.prototype.getCompoundQuery = function (conj, terms) {
  const scope = this;
  const rest = Array.prototype.slice.call(arguments, 1);
  let parts = _.map(rest, function(x) { return scope.getQuery(x.field, x.value, x.escape); });
  parts = _.filter(parts, function(x) { return x.length; });
  return parts.join(' ' + conj + ' ');
};

SolrQuerier.prototype.getQueryUrl = function (params) {
  // Get base solr query URL
  const solrUrl = params.url || this.searchUrl;
  const queryData = this.__toQueryData(params);
  // Construct query params string from query data
  const queryParams = _.param(queryData);
  // Return full query URL
  return solrUrl + '?' + queryParams;
};

SolrQuerier.prototype.getQueryOpts = function (params) {
  // Get base solr query URL
  const solrUrl = params.url || this.searchUrl;
  const queryData = this.__toQueryData(params);
  return queryData;
};

/**
 * KNN query for NNs to vector or asset
 * @class KNNQuery
 * @param {string} field - Field to search over
 * @param {int} k - k nearest neighbor to fetch
 * @param {double[]} [vector] - vector to search over
 * @param {string} [fullId] - id to query over
 * @param {function} [queryEmbeddingFn] - function to call to obtain embedding (if fullId not specified)
 * @param {string} [query] - query to provide as input to queryEmbeddingFn
 **/

/**
 * Execute basic query
 * @param params Query parameters
 * @param [params.url=this.searchUrl] {string} Solr search url
 * @param [params.query=*:*] {string} Solr query
 * @param [params.knn=] {KNNQuery} KNN query with vector (cannot be specified together with main query)
 * @param [params.start=0] {int} Record to start at
 * @param [params.limit=0] {int} Limit on number of records to fetch
 * @param [params.sort] {string} Sort order
 * @param [params.fields] {string} Fields to return
 * @param [params.filter] {string} Additional solr filter (ex: '+datasets:ShapeNet')
 * @param [params.format=json] {string} Query results format
 * @param callback
 */
SolrQuerier.prototype.query = function (params, callback) {
  const solrUrl = params.url || this.searchUrl;
  const cb = _.getCallback(params, callback);
  if (params.knn && params.knn.vector == null) {
    if (params.knn.queryEmbeddingFn) {
      this.__queryKNNAssetWithCustomEmbedding(params, cb);
    } else {
      this.__queryKNNAsset(params, cb);
    }
  } else {
    const queryData = this.__toQueryData(params);
    return this.__query(solrUrl, queryData, cb, params.solrQueryProxy);
  }
};

SolrQuerier.prototype.__queryKNNAsset = function(params, callback) {
  // need to fill in params.knn.vector
  const solrUrl = params.url || this.searchUrl;
  if (params.knn.fullId) {
    const queryData = this.__toQueryData({ query: `fullId:${params.knn.fullId}`, fields: [params.knn.field, 'fullId'] });
    this.__query(solrUrl, queryData, (err, data) => {
      if (err) {
        callback(err);
      } else {
        if (data.response && data.response.docs && data.response.docs.length > 0) {
          const doc = data.response.docs[0];
          const vector = doc[params.knn.field];
          if (vector) {
            params.knn.vector = vector;
            const queryData2 = this.__toQueryData(params);
            return this.__query(solrUrl, queryData2, callback, params.solrQueryProxy);
          } else {
            callback(`Cannot get field ${params.knn.field} for asset ${params.knn.fullId}`);
          }
        } else {
          callback('Cannot find asset');
        }
      }
    }, params.solrQueryProxy);
  } else {
    callback('Missing knn vector and fullId');
  }
};

SolrQuerier.prototype.__queryKNNAssetWithCustomEmbedding = function(params, callback) {
  // need to fill in params.knn.vector
  const solrUrl = params.url || this.searchUrl;
  if (params.knn.query) {
    params.knn.queryEmbeddingFn(params.knn.query, (err, data) => {
      if (err) {
        callback(err);
      } else {
        // handle response
        if (data) {
          params.knn.vector = data;
          const queryData2 = this.__toQueryData(params);
          return this.__query(solrUrl, queryData2, callback, params.solrQueryProxy);
        } else {
          callback(`Cannot get embedding for input ${params.knn.query}`);
        }
      }
    });
  } else {
    callback('Missing knn query');
  }
};

SolrQuerier.prototype.__toQueryData = function(params) {
  const solrQuery = params.query || '*:*';

  const start = params.start || 0;
  const limit = params.limit || this.limit;
  const fields = params.fields;
  const format = params.format || 'json';
  const filter = params.filter;

// Setup queryData
  const queryData = {
    'q': solrQuery,
    'wt': format,
    'start': start,
    'rows': limit
  };

  if (fields) {
    queryData['fl'] = fields;
  }
  if (filter) {
    queryData['fq'] = filter;
  }
  // NOTE: Add additional fields here
  // Filter down list of things that solr support
  const otherValidFields = ['sort', 'group', 'group.query', 'group.limit'];
  for (let i = 0; i < otherValidFields.length; i++) {
    const f = otherValidFields[i];
    if (params[f] != undefined && params[f] !== '') {
      queryData[f] = params[f];
    }
  }
  if (params.knn) {
    const knnString = this.getKNNQueryString(params.knn.field, params.knn.vector, params.knn.k);
    if (queryData.q !== '*:*') {
      console.warn(`replacing query ${queryData.q} with KNN search`, params.knn);
    }
    queryData.q = knnString;
  }
  return queryData;
};

SolrQuerier.prototype.getKNNQueryString = function(fieldname, vector, k) {
  const vstr = vector.join(',');
  const topK = k || 10;
  return `{!knn f=${fieldname} topK=${topK}}[${vstr}]`;
};

/**
 * Faceted search for a field with error first callback
 * @param params Facet search parameters
 * @param params.facetField {string} Field to facet on (ex: 'category')
 * @param [params.facetSort] {string} How to sort the results
 * @param [params.facetLimit=-1] {int} Number of facet results to return
 * @param [params.facetMinCount=0] {int} Minimum number of results for that facet to be returned
 * @param [params.url=this.searchUrl] {string} Solr search url
 * @param [params.query=*:*] {string} Solr query
 * @param [params.filter] {string} Additional solr filter (ex: '+datasets:ShapeNet')
 * @param callback Error first callback
 */
SolrQuerier.prototype.facetFieldSearch = function (params, callback) {
  const solrUrl = params.url || this.searchUrl;
  const solrQuery = params.query || '*:*';

  const filter = params.filter;
  const facetField = params['facet.field'] || params.facetField;
  const facetSort = params['facet.sort'] || params.facetSort;
  const facetLimit = params['facet.limit'] || params.facetLimit || -1;
  const facetMinCount = params['facet.mincount'] || params.facetMinCount || 0;

  // Setup queryData
  const queryData = {
    'q': solrQuery,
    'fq': filter,
    'wt': 'json',
    'start': 0,
    'rows': 0,
    'facet': true,
    'facet.sort': facetSort,
    'facet.limit': facetLimit,
    'facet.field': facetField,
    'facet.mincount': facetMinCount
  };
  return this.__query(solrUrl, queryData, _.getCallback(params, callback));
};

/**
 * Retrieves statistics for a field with error first callback
 * @param [params.url=this.searchUrl] {string} Solr search url
 * @param [params.query=*:*] {string} Solr query
 * @param [params.filter] {string} Additional solr filter (ex: '+datasets:ShapeNet')
 * @param params.field {string} Field to get statistics on
 * @param callback Error first callback
 */
SolrQuerier.prototype.getStats = function (params, callback) {
  const solrUrl = params.url || this.searchUrl;
  const solrQuery = params.query || '*:*';

  const filter = params.filter;
  const field = params.field;

  const queryData = {
    'q': solrQuery,
    'fq': filter,
    'wt': 'json',
    'start': 0,
    'rows': 0,
    'stats': true,
    'stats.field': field
  };
  return this.__query(solrUrl, queryData, _.getCallback(params, callback));
};

/**
 * Lookup queriable fields and their types
 * @param [params.url=this.schemaUrl] Url for looking up fields
 * @param callback Error first callback
 */
SolrQuerier.prototype.lookupFields = function (params, callback) {
  const solrUrl = params.url || this.schemaUrl;
  const method = 'GET';
  const cb =  _.getCallback(params, callback);
  return _.ajax
  ({
    type: method,
    url: solrUrl,
    contentType: 'application/json;charset=utf-8',
    dataType: 'json',
    callback: cb,
    timeout: this.timeout
  });
};

SolrQuerier.prototype.__query = function (solrUrl, queryData, callback, solrQueryProxy) {
  if (solrQueryProxy && solrQueryProxy.isActive) {
    solrQueryProxy.query(solrUrl, queryData, callback);
  } else {
    const timeout = this.timeout;
    return _.ajax
    ({
      type: 'POST',
      url: solrUrl,
      data: queryData,
      dataType: 'jsonp',      // At some point, we might want to switch to a PHP script that queries Solr locally, and then we could use regular JSON again.
      jsonp: 'json.wrf',      // Solr requires the JSONP callback to have this name.
      traditional: true,      // If facet.field is array, it will become facet.field=a1&facet.field=a2 instead of facet.field[]=a1&facet.field[]=a2
      callback: callback,
      timeout: timeout       // in milliseconds. With JSONP, this is the only way to get the error handler to fire.
    });
  }
};

module.exports = SolrQuerier;
