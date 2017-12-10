'use strict';

var ConfigControls = require('ui/ConfigControls');

function SceneGeneratorConfig(params) {
  // Container in which config is displayed and configured
  params.prefix = params.prefix || 'sgc_';
  // TODO: Fetch options from server and display
  // Fetch option fieldname, display name, description, default value...
  params.options = [{
    id: 'si.imo',
    name: 'sceneInference.inferMissingObjects',
    text: 'Infer Additional Objects',
    type: 'boolean',
    defaultValue: false
  }];

  ConfigControls.call(this, params);
}

SceneGeneratorConfig.prototype = Object.create(ConfigControls.prototype);
SceneGeneratorConfig.prototype.constructor = SceneGeneratorConfig;

// Exports
module.exports = SceneGeneratorConfig;
