/**
 * Interface to Scene Generator
 */

'use strict';

var Constants = require('Constants');
var SceneGeneratorConfig = require('scene/SceneGeneratorConfig');
var WebService = require('io/WebService');

function SceneGenerator(params) {
  params = params || {};
  // Timeout in milliseconds
  params.timeout = params.timeout || 300000;  // Allow for five minutes (TODO: Have server send back progress...)
  WebService.call(this, params);
  // Configuration panel
  this.configContainer = params.configContainer;
  var configPanel = new SceneGeneratorConfig({
    container: this.configContainer
  });
  this.getConfigCallback = function () {
    return configPanel.getConfig({ stringify: true });
  };
}

SceneGenerator.prototype = Object.create(WebService.prototype);
SceneGenerator.prototype.constructor = SceneGenerator;

SceneGenerator.prototype.generate = function (text, currentSceneState, succeededCallback, failedCallback) {
  var url = Constants.sceneGenerationUrl;
  var queryData = {
    'text': text,
    'nscenes': 1
  };
  if (currentSceneState && !text.startsWith('generate')) {
    // Some kind of interaction, let's pass the current scene state
    var ss = currentSceneState.toJsonString();
    queryData['initialSceneState'] = ss;
  } else {
    queryData['options'] = {
      sceneUp: Constants.defaultSceneUp,
      sceneFront: Constants.defaultSceneFront,
      sceneUnit: Constants.defaultSceneUnit
    };
  }
  if (this.getConfigCallback) {
    var config = this.getConfigCallback();
    if (Object.keys(config).length > 0) {
      queryData['config'] = config;
    }
  }
  this.query(url, queryData, succeededCallback, failedCallback);
};

SceneGenerator.prototype.__toResults = function(data) {
  return data.results.scenes;
};

// Exports
module.exports = SceneGenerator;


