/**
 * Interface to part visualizer
 */

'use strict';

var Constants = require('Constants');
var WebService = require('io/WebService');

function VisualizeParts(params) {
  params = params || {};
  // Timeout in milliseconds
  params.timeout = params.timeout || 60000;
  WebService.call(this, params);
}

VisualizeParts.prototype = Object.create(WebService.prototype);
VisualizeParts.prototype.constructor = VisualizeParts;

VisualizeParts.prototype.visualizeParts = function (text, currentSceneState) {
  this.getParts(text, currentSceneState, function (objParts) {
    currentSceneState.createGhostSceneWithParts(objParts);
  }.bind(this));
};

VisualizeParts.prototype.getParts = function (text, currentSceneState, succeededCallback1, failedCallback1) {
  var url = Constants.getPartsUrl;
  var queryData = {
    'text': text
  };
  var ss = currentSceneState.toJsonString();
  queryData['initialSceneState'] = ss;
  this.query(url, queryData, succeededCallback1, failedCallback1);
};

VisualizeParts.prototype.__toResults = function(data) {
  return data.results.results;
};

// Exports
module.exports = VisualizeParts;


