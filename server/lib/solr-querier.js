var request = require('request');
var log = require('../lib/logger')('solr-querier');

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
  var url = this.url;
  var jsonParams = (params.query) ? params : { params: params };

  var options = {
    url: url,
    headers: { 'Content-type': 'application/json' },
    method: 'GET',
    body: JSON.stringify(jsonParams)
  };

  return new Promise(function (resolve, reject) {
    request(options, function (error, response, body) {
      if (!error && response.statusCode == 200) {
        resolve(JSON.parse(body));
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


SOLRQuerier.prototype.queryDb = function (params, res, onSuccessCallback, onErrorCallback) {
  var url = this.url;
  var jsonParams = (params.query) ? params : { params: params };

  var onSuccess = onSuccessCallback || function (data) {
    res.json(data);
  };
  var onError = onErrorCallback || function (err) {
    res.json({ code: 100, status: 'Error in solr connection: ' + err });
  };

  var options = {
    url: url,
    headers: { 'Content-type': 'application/json' },
    method: 'GET',
    body: JSON.stringify(jsonParams)
  };

  request(options, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      if (onSuccess) { onSuccess(body); }
    } else {
      log.error('Error querying from solr: ' + url, error);
      if (response) {
        log.info('Response status is ' + response.statusCode, body);
      }
      if (onError) { onError(error); }
    }
  });
};

module.exports = SOLRQuerier;
