var _ = require('util');

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
  var url = opts.url;
  if (url) {
    if (url.endsWith('/select') || url.endsWith('/fields')) {
      var i = url.lastIndexOf('/');
      url = url.substring(0, i);
    }
    this.schemaUrl = url + '/fields';
    this.searchUrl = url + '/select';
  }
  this.timeout = opts.timeout || 5000;
  this.limit = opts.limit || 100;
}

SolrQuerier.prototype.escapeValue = function(str) {
  var pattern = /([\!\*\+\-\=<>\&\|\(\)\[\]\{\}\^\~\?\:\\/" ])/g;
  return str.replace(pattern, "\\$1");
};

SolrQuerier.prototype.quoteValue = function(str) {
  var pattern = /(["])/g;
  return '"' + str.replace(pattern, "\\$1") + '"';
};

SolrQuerier.prototype.getRandomSortOrder = function (rng) {
  var seed = Math.floor((rng.random() * 1000000000) + 1);
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
      var escaped = escape? _.map(values, function(x) { return escape(x); }) : values;
      return field + ':(' + escaped.join(' OR ') + ')';
    } else {
      return '';
    }
  } else {
    var escaped = escape? escape(values) : values;
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
  var scope = this;
  var rest = Array.prototype.slice.call(arguments, 1);
  var parts = _.map(rest, function(x) { return scope.getQuery(x.field, x.value, x.escape); });
  parts = _.filter(parts, function(x) { return x.length; });
  return parts.join(' ' + conj + ' ');
};

SolrQuerier.prototype.getQueryUrl = function (params) {
  // Get base solr query URL
  var solrUrl = params.url || this.searchUrl;
  var queryData = this.__toQueryData(params);
  // Construct query params string from query data
  var queryParams = _.param(queryData);
  // Return full query URL
  return solrUrl + '?' + queryParams;
};

/**
 * Execute basic query
 * @param params Query parameters
 * @param [params.url=this.searchUrl] {string} Solr search url
 * @param [params.query=*:*] {string} Solr query
 * @param [params.start=0] {int} Record to start at
 * @param [params.limit=0] {int} Limit on number of records to fetch
 * @param [params.sort] {string} Sort order
 * @param [params.fields] {string} Fields to return
 * @param [params.filter] {string} Additional solr filter (ex: '+datasets:ShapeNet')
 * @param [params.format=json] {string} Query results format
 * @param callback
 */
SolrQuerier.prototype.query = function (params, callback) {
  var solrUrl = params.url || this.searchUrl;
  var queryData = this.__toQueryData(params);
  return this.__query(solrUrl, queryData, _.getCallback(params, callback));
};

SolrQuerier.prototype.__toQueryData = function(params) {
  var solrQuery = params.query || '*:*';

  var start = params.start || 0;
  var limit = params.limit || this.limit;
  var fields = params.fields;
  var format = params.format || 'json';
  var filter = params.filter;

// Setup queryData
  var queryData = {
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
  var otherValidFields = ['sort', 'group', 'group.query', 'group.limit'];
  for (var i = 0; i < otherValidFields.length; i++) {
    var f = otherValidFields[i];
    if (params[f] != undefined && params[f] !== '') {
      queryData[f] = params[f];
    }
  }
  return queryData;
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
  var solrUrl = params.url || this.searchUrl;
  var solrQuery = params.query || '*:*';

  var filter = params.filter;
  var facetField = params['facet.field'] || params.facetField;
  var facetSort = params['facet.sort'] || params.facetSort;
  var facetLimit = params['facet.limit'] || params.facetLimit || -1;
  var facetMinCount = params['facet.mincount'] || params.facetMinCount || 0;

  // Setup queryData
  var queryData = {
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
  var solrUrl = params.url || this.searchUrl;
  var solrQuery = params.query || '*:*';

  var filter = params.filter;
  var field = params.field;

  var queryData = {
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
  var solrUrl = params.url || this.schemaUrl;
  var method = 'GET';
  var cb =  _.getCallback(params, callback);
  return _.ajax
  ({
    type: method,
    url: solrUrl,
    contentType: 'application/json;charset=utf-8',
    dataType: 'json',
    callback: callback,
    timeout: this.timeout
  });
};


SolrQuerier.prototype.__query = function (solrUrl, queryData, callback) {
  var timeout = this.searchTimeout;
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
};

module.exports = SolrQuerier;
