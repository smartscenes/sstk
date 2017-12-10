/**
 * Scene Loader for SceneState json files
 */

'use strict';

var SceneState = require('scene/SceneState');
var SceneLoader = require('scene/SceneLoader');
var _ = require('util');

function SceneStateLoader(params) {
  SceneLoader.call(this, params);
  this.defaultSource = 'wss';
}

SceneStateLoader.prototype = Object.create(SceneLoader.prototype);
SceneStateLoader.prototype.constructor = SceneStateLoader;

SceneStateLoader.prototype.load = function (url, onLoad, onProgress, onError) {
  var scope = this;
  var loader = new THREE.FileLoader(scope.manager);
  //loader.setCrossOrigin(this.crossOrigin);
  return loader.load(url, function (text) {
    var json = JSON.parse(text);
    var sceneState = (json.hasOwnProperty('scene')) ? json : { scene: json };
    scope.parse(sceneState, onLoad, url);
  }, onProgress, onError);
};

SceneStateLoader.prototype.parse = function (json, callback, url) {
  // The json stores an array of models in the field scene.object
  // Each model has the following information
  //   index: instance id
  //   modelId: full model id (for looking up model information)
  //   parentIndex: instance id of the parent model (i.e. model that this one is attached to)
  //   transform: 16 value array indicating global transform

  json = _.cloneDeep(json);  // Make a copy, we sometimes mutate
  var scene = json.scene || json;
  if (scene.scene) {
    json = scene;  // Set json to be here so we can locates stuff later...
    scene = scene.scene;   // Sometimes double nesting!!! Ack!!! (happens with SceneStudio scene and ui_log)
  }
  var models = scene.object;

  var sceneResult = new SceneState(null, null);
  sceneResult.modelInstancesMeta = models;
  sceneResult.json = json;

  if (scene.wrappedThreeObjects) {
    var wrappedThreeObjects = scene.wrappedThreeObjects;

    for (var i = 0; i < wrappedThreeObjects.length; i++) {
      var objectLoader = new THREE.ObjectLoader();
      var loadedObj3D = objectLoader.parse(wrappedThreeObjects[i].object3D);
      sceneResult.addExtraObject(loadedObj3D);
    }
  }

  var wrappedCallback = function(sr) {
    sr.updateState(json);
    callback(sr);
  };

  if (models.length <= 0) {
    wrappedCallback(sceneResult);
  } else {
    // Get all models at flat list for now!
    for (var i = 0; i < models.length; i++) {
      var m = models[i];
      this.__loadModel(sceneResult, i, m.modelId, wrappedCallback);
    }
  }
};

// Exports
module.exports = SceneStateLoader;
