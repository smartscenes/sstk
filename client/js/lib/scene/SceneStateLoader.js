/**
 * Scene Loader for SceneState json files
 */

'use strict';

var SceneState = require('scene/SceneState');
var SceneLoader = require('scene/SceneLoader');
var ArchCreator = require('geo/ArchCreator');
var _ = require('util/util');

function SceneStateLoader(params) {
  SceneLoader.call(this, params);
  this.defaultSource = 'wss';
  this.defaults = {}; // TODO: have some reasonable defaults

  var archCreatorOptions = ArchCreator.DEFAULTS;
  if (params.archOptions) {
    archCreatorOptions = _.defaultsDeep(Object.create(null), params.archOptions, archCreatorOptions);
  }
  this.__archCreatorOptions = archCreatorOptions;
  this.archCreator = new ArchCreator(_.defaults({ assetManager: this.assetManager }, archCreatorOptions));
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

SceneStateLoader.prototype.__loadArch = function(json, scene, customMaterials, callback) {
  if (scene.arch) {
    var scope = this;
    if (scene.arch.ref != null && !scene.arch.elements) {
      var loadOptions = { fullId: scene.arch.ref, archOptions: this.__archCreatorOptions };
      scope.assetManager.loadArch(loadOptions, function(err, archRes) {
        if (err) {
          callback(err);
        } else {
          _.defaults(scene.arch, archRes.json);
          if (scene.arch.modification) {
            scope.archCreator.applyModification(archRes.arch, scene.arch.modification);
          }
          var ss = scope.archCreator.toSceneState(archRes.json, archRes.arch, false);
          ss.arch = scene.arch;
          callback(null, ss);
        }
      });
    } else {
      var filter = ArchCreator.getFilter({
        includeCeiling: scope.includeCeiling,
        includeFloor: scope.includeFloor,
        includeWalls: scope.includeWalls,
        room: scope.room,
        level: scope.level,
        archIds: scope.archIds
      });
      var arch = this.archCreator.createArch(scene.arch, {
        filterElements: filter,
        groupRoomsToLevels: true,
        customMaterials: customMaterials
      });
      var ss = this.archCreator.toSceneState(json, arch, false);
      ss.arch = scene.arch;
      callback(null, ss);
    }
  } else {
    callback(null, new SceneState(null, null));
  }
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

  var scope = this;
  var customMaterials = null;
  if (scene.materials && scene.textures && scene.images) {
    var resourcePath = _.get(scene, ['defaults', 'texturePath']) || this.defaults.texturePath;
    customMaterials = this.assetManager.loadMaterials(scene, { resourcePath: resourcePath });
  }
  this.__loadArch(json, scene, customMaterials, function(err, sceneResult) {
    if (err) {
      // TODO: propagate error
      console.log('Error loading arch', err);
      if (!sceneResult) {
        sceneResult = new SceneState(null, null);
      }
    }

    // TODO: make it possible to apply custom materials on to individual objects/models
    var models = scene.object;
    sceneResult.modelInstancesMeta = models;
    sceneResult.json = json;
    sceneResult.assetTransforms = scene.assetTransforms;

    var wrappedCallback = function (sr) {
      // Load object3D.userData.id from instanceId
      for (var i = 0; i < models.length; i++) {
        let modelInstanceId = models[i].id;
        if (sr.modelInstances[i] !== undefined){
          sr.modelInstances[i].object3D.userData.id = modelInstanceId;  
        }
      }
      sr.updateState(json);
      callback(sr);
    };

    if (models.length <= 0) {
      wrappedCallback(sceneResult);
    } else {
      // Get all models at flat list for now!
      for (var i = 0; i < models.length; i++) {
        scope.__loadModel(sceneResult, i, models[i].modelId, wrappedCallback);
      }
    }
  });
};

// Exports
module.exports = SceneStateLoader;
