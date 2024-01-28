/**
 * Interface to Scene Generator
 */

const Constants = require('Constants');
const SceneGeneratorConfig = require('scene/SceneGeneratorConfig');
const WebService = require('io/WebService');

class SceneGenerator extends WebService {
  constructor(params) {
    params = params || {};
    // Timeout in milliseconds
    params.timeout = params.timeout || 300000;  // Allow for five minutes (TODO: Have server send back progress...)

    super(params);

    // Configuration panel
    this.configContainer = params.configContainer;
    const configPanel = new SceneGeneratorConfig({
      container: this.configContainer
    });
    this.getConfigCallback = function () {
      return configPanel.getConfig({stringify: true});
    };
  }
  generate(text, currentSceneState, succeededCallback, failedCallback) {
    let url = Constants.sceneBuilderUrl;
    let queryData = { format: 'STK' };
    if (text.startsWith('retrieve')) {
      url = url + '/scene/retrieve/';
      const sceneId = text.split(' ')[1];
      if (sceneId != null) {
        url = url + sceneId;
      }
    } else if (text.startsWith('generate')) {
      url = url + '/scene/generate';
      queryData['type'] = 'text';
      queryData['input'] = text;
    } else {
      // Some kind of interaction, let's pass the current scene state
      if (currentSceneState) {
        // url = url + '/modify;
        // const ss = currentSceneState.toJsonString();
        // queryData['initialSceneState'] = ss;
      }
      failedCallback('Please start your command with retrieve or generate');
    }

    if (this.getConfigCallback) {
      const config = this.getConfigCallback();
      if (Object.keys(config).length > 0) {
        queryData['config'] = config;
      }
    }
    this.query(url, queryData, succeededCallback, failedCallback);
  }
  __toResults(data) {
    // console.log(data);
    return [ { data: data } ];
  }

  // TODO: delete this code
  __deprecated_generate(text, currentSceneState, succeededCallback, failedCallback) {
    // Old scene generation code
    const url = Constants.baseUrl + '/ws/scenes/interact';
    const queryData = {
      'text': text,
      'nscenes': 1
    };
    if (currentSceneState && !text.startsWith('generate')) {
      // Some kind of interaction, let's pass the current scene state
      const ss = currentSceneState.toJsonString();
      queryData['initialSceneState'] = ss;
    } else {
      queryData['options'] = {
        sceneUp: Constants.defaultSceneUp,
        sceneFront: Constants.defaultSceneFront,
        sceneUnit: Constants.defaultSceneUnit
      };
    }
    if (this.getConfigCallback) {
      const config = this.getConfigCallback();
      if (Object.keys(config).length > 0) {
        queryData['config'] = config;
      }
    }
    this.query(url, queryData, succeededCallback, failedCallback);
  }

  __deprecated_toResults(data) {
    return data.results.scenes;
  }

}

// Exports
module.exports = SceneGenerator;


