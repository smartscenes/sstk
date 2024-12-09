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
      values: ['SKIP', 'RoomType', 'LLM', 'RoomTypeLLM', 'InstructScene'],
      defaultValue: 'LLM'
    }, {
      id: 'si.archGenMethod',
      name: 'sceneInference.arch.genMethod',
      text: 'Architecture Generation Method',
      type: 'text',
      values: ['generate', 'retrieve'],
      defaultValue: 'retrieve'
    }, {
      id: 'si.archGenModel',
      name: 'sceneInference.arch.genModel',
      text: 'Architecture Generation Model',
      type: 'text',
      values: ['SquareRoomGenerator', 'Holodeck'],
      defaultValue: 'SquareRoomGenerator'
    }, {
      id: 'si.layout',
      name: 'sceneInference.layoutModel',
      text: 'Layout Generation Model',
      type: 'text',
      values: ['ATISS', 'DiffuScene', 'LayoutGPT', 'Holodeck', 'InstructScene'],
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
    }, {
      id: 'si.retrieveSources',
      name: 'sceneInference.assetSources',
      text: 'Object Asset Sources',
      type: 'text',
      defaultValue: 'fpModel'
    }, {
      id: 'si.useCategory',
      name: 'sceneInference.useCategory',
      text: 'Object Retrieval: Filter by Category',
      type: 'boolean',
      defaultValue: false
    }, {
      id: 'si.useWnsynset',
      name: 'sceneInference.retrieve.useWnsynset',
      text: 'Object Retrieval: Filter by Wnsynset',
      type: 'boolean',
      defaultValue: true
    }, {
      id: 'si.mapTo3dfront',
      name: 'sceneInference.retrieve.mapTo3dfront',
      text: 'Object Retrieval: Map Categories to 3D-FRONT',
      type: 'boolean',
      defaultValue: false
    }];

    super(params);
  }
}

// Exports
module.exports = SceneGeneratorConfig;
