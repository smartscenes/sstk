'use strict';

var _ = require('util/util');

/**
 * Basic wrapper for my webservices
 *
 * @constructor
 */
function WebService(params) {
  params = params || {};
  // Application callback when ws has succeeded
  // Parameters: resultList
  this.succeededCallback = params.succeededCallback;
  // Application callback when ws has failed
  // Parameters: error message
  this.failedCallback = params.failedCallback;
  // Application callback for scene generation progress
  // Parameters: status
  this.progressCallback = params.progressCallback;
  // Timeout in milliseconds
  this.timeout = params.timeout;
}

WebService.prototype.query = function (url, queryData, succeededCallback1, failedCallback1) {
  if (this.progressCallback) {
    this.progressCallback('START');
  }
  // Use default get parts succeeded callback if none specified
  var succeededCallback = (succeededCallback1) ?
    this.succeeded.bind(this, succeededCallback1) :
    this.succeeded.bind(this, this.succeededCallback);
  // Use default get parts failed callback if none specified
  var failedCallback = (failedCallback1) ?
    this.failed.bind(this, failedCallback1) :
    this.failed.bind(this, this.failedCallback);

  var method = 'POST';
  _.ajax
  ({
    type: method,
    url: url,
    contentType: 'application/json;charset=utf-8',
    data: JSON.stringify(queryData),
    dataType: 'json',
    success: succeededCallback,
    error: failedCallback,
    timeout: this.timeout   // in milliseconds. With JSONP, this is the only way to get the error handler to fire.
  });
};

WebService.prototype.__toResults = function(data) {
  return data;
};

WebService.prototype.succeeded = function (callback, data, textStatus, jqXHR) {
  if (this.progressCallback) {
    this.progressCallback('SUCCESS');
  }
  if (callback) {
    callback(this.__toResults(data));
  } else {
    console.log(data);
  }
};

WebService.prototype.failed = function (callback, jqXHR, textStatus, errorThrown) {
  this.failedWithMessage(callback, textStatus + ' ' + errorThrown);
};

WebService.prototype.failedWithMessage = function (callback, message) {
  if (this.progressCallback) {
    this.progressCallback('FAILED');
  }
  if (callback) {
    callback(message);
  } else {
    console.log(message);
  }
};

// Exports
module.exports = WebService;
