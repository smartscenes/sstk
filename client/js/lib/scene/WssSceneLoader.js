/**
 * Scene Loader for WSS Scene files
 */

'use strict';

var SceneState = require('scene/SceneState');
var SceneLoader = require('scene/SceneLoader');
var _ = require('util');

function WssSceneLoader(params) {
  SceneLoader.call(this, params);
  this.defaultSource = 'wss';
}

WssSceneLoader.prototype = Object.create(SceneLoader.prototype);
WssSceneLoader.prototype.constructor = WssSceneLoader;

WssSceneLoader.prototype.parse = function (json, callbackFinished, url) {
  // The json stores an array of models directly
  // Each model has the following information
  //   index: instance id
  //   modelID: wss model id (for looking up model information)
  //   parentIndex: instance id of the parent model (i.e. model that this one is attached to)
  //   renderStateArr: array of booleans indicating if the model is pickable, inserting, selectable, selected (ignore)
  //   cu(x),cv(y),cw(z): three 3d vectors for the local coordinates
  //   parentMeshI: mesh index of the parent that this instance attaches to
  //   parentTriI: triangle of mesh of the parent that this instance attaches to
  //   parentUV: ????
  //   cubeFace: 0-5 indicating tumble state
  //   scale: scalar indicating the scale
  //   rotation: rotation in radians around cw starting from cu
  //   transform: 16 value array indicating global transform
  var models;
  var cameras;
  json = _.cloneDeep(json);  // Make a copy, we sometimes mutate
  json = json.scene || json;
  if (json.length) {
    // Simple array...
    models = json;
  } else {
    // TODO: handle json.cameras;
    models = json.objects;
    if (json.cameras) {
      cameras = json.cameras.map(function (cam) {
        return {
          name: cam['name'],
          up: cam['up'],
          position: cam['eye'],
          target: cam['lookAt']
        };
      });
    }
  }

  var sceneResult = new SceneState(null, null);
  sceneResult.modelInstancesMeta = models;
  if (cameras) {
    // Set current camera
    sceneResult['json'] = {
      scene: {
        camera: cameras
      }
    };
    sceneResult.applyCameraState('current');
  }

  // Get all models at flat list for now!
  for (var i = 0; i < models.length; i++) {
    var m = models[i];
    // Older version of wss format in SceneStudio DB represented each model as a string...
    if (typeof m === 'string') {
      m = JSON.parse(m);
      models[i] = m;
    }
    // Get the model instance
    this.__loadModel(sceneResult, i, m.modelID, callbackFinished);
  }

};

// Exports
module.exports = WssSceneLoader;
