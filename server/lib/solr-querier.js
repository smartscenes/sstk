var request = require('request');
var log = require('../lib/logger')('solr-querier');
var _ = require('lodash');

// Class to communicate with Solr web services
// params should contain members: host, user, password, database
function SOLRQuerier(params) {
  if (params && params.url) {
    this.url = params.url;
  } else {
    throw new Error('Tried to create SOLRQuerier with invalid params:' + params);
  }
}

SOLRQuerier.prototype.queryDbWithPromise = function (params) {
  var url = params.url || this.url;
  var jsonParams = (params.query) ? { params: params.query } : { params: params };
  var isJson = jsonParams.params.wt === 'json';

  var options = {
    url: url,
    headers: { 'Content-type': 'application/json' },
    method: 'GET',
    body: JSON.stringify(jsonParams)
  };

  return new Promise(function (resolve, reject) {
    request(options, function (error, response, body) {
      if (!error && response.statusCode == 200) {
        resolve(isJson? JSON.parse(body) : body);
      } else {
        log.error('Error querying from solr: ' + url, error);
        if (response) {
          log.info('Response status is ' + response.statusCode, body);
        }
        reject('Error querying from solr: ' + url);
      }
    });
  });
};

SOLRQuerier.prototype.__query = function (url, params, callback) {
  var jsonParams = { params: params };

  var options = {
    url: url,
    headers: { 'Content-type': 'application/json' },
    method: 'GET',
    body: JSON.stringify(jsonParams)
  };

  var isJson = jsonParams.params.wt === 'json';
  request(options, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      if (isJson) {
        if (body) {
          try {
            body = JSON.parse(body);
          } catch (err) {
            if (callback) { callback(err); }
            return;
          }
        }
      }
      if (callback) { callback(null, body); }
    } else {
      log.error('Error querying from solr: ' + url, jsonParams, error);
      if (response) {
        log.info('Response status is ' + response.statusCode, body);
      }
      if (callback) { callback(error || 'Error querying from solr'); }
    }
  });
};

SOLRQuerier.prototype.__queryAll = function (url, params, callback) {
  var queryParams = _.clone(params);
  queryParams.wt = 'json';
  var limit = 20000;
  var ndocs;
  var scope = this;
  var documents = [];
  function queryRange(start) {
    queryParams.start = start;
    queryParams.rows = limit;
    scope.__query(url, queryParams, (err, res) => {
      if (err) {
        callback(err, { response: { numFound: ndocs, start: 0, docs: documents }});
      } else {
        if (ndocs == null) {
          ndocs = res.response.numFound;
        }
        documents.push(...res.response.docs);
        if (documents.length < ndocs) {
          setTimeout(function () {
            queryRange(start + limit);
          }, 0);
        } else {
          callback(null, { response: { numFound: ndocs, start: 0, docs: documents }});
        }
      }
    });
  }

  queryRange(0);
};

SOLRQuerier.prototype.queryDb = function (params, callback) {
  var url = params.url || this.url;
  var queryParams = (params.query) ? params.query : params ;
  if (queryParams.rows === 'all') {
    return this.__queryAll(url, queryParams, callback);
  } else {
    return this.__query(url, queryParams, callback);
  }
};

SOLRQuerier.prototype.queryAssetInfo = function(solrUrl, id, cb) {
  var params = {
    q: 'fullId:' + id,
    wt: 'json'
  };
  this.queryDb({ url: solrUrl, query: params },
    function(err, result) {
      if (err) {
        cb(err);
      } else {
        if (result.response && result.response.numFound > 0) {
          cb(null, result.response.docs[0]);
        } else {
          cb('Asset ' + id + ' not found');
        }
      }
    }
  );
};

SOLRQuerier.prototype.queryAssetIds = function(solrUrl, query, rows, cb) {
  var params = {
    q: query,
    rows: rows,
    fl: 'id',
    wt: 'json'
  };
  this.queryDb({ url: solrUrl, query: params },
    function(err, result) {
      if (err) {
        cb(err);
      } else {
        cb(null, result.response);
      }
    }
  );
};

module.exports = SOLRQuerier;
