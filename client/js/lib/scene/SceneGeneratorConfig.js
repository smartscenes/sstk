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
      id: 'si.parser',
      name: 'sceneInference.parserModel',
      text: 'Scene Parser Model',
      type: 'text',
      values: ['RoomType', 'LLM', 'InstructScene'],
      defaultValue: 'LLM'
    }, {
      id: 'si.layout',
      name: 'sceneInference.layoutModel',
      text: 'Layout Generation Model',
      type: 'text',
      values: ['ATISS', 'DiffuScene', 'InstructScene'],
      defaultValue: 'ATISS'
    }, {
      id: 'si.passText',
      name: 'sceneInference.passTextToLayout',
      text: 'Pass Text to Layout Model',
      type: 'boolean',
      defaultValue: false
    }, {
      id: 'si.genMethod',
      name: 'sceneInference.object.genMethod',
      text: 'Object Generation Method',
      type: 'text',
      values: ['generate', 'retrieve'],
      defaultValue: 'retrieve'
    }, {
      id: 'si.retrieveType',
      name: 'sceneInference.object.retrieveType',
      text: 'Object Retrieval Method',
      type: 'text',
      values: ['category', 'embedding'],
      defaultValue: 'category'
    }];

    super(params);
  }
}

// Exports
module.exports = SceneGeneratorConfig;
