const ConfigControls = require('ui/ConfigControls');

class SceneGeneratorConfig extends ConfigControls {
  constructor(params) {
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
    }, {
      id: 'si.layout',
      name: 'sceneInference.layoutModel',
      text: 'Layout Generation Model',
      type: 'text',
      values: ['ATISS', 'DiffuScene'],
      defaultValue: 'ATISS'
    }];

    super(params);
  }
}

// Exports
module.exports = SceneGeneratorConfig;
