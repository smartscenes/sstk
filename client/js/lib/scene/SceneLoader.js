'use strict';

var PubSub = require('PubSub');
var _ = require('util');

function SceneLoader(params) {
  PubSub.call(this);
  this.defaultModelFormat = params.defaultModelFormat;
  this.assetManager = params.assetManager;
  this.useSupportHierarchy = true;
  this.useNormalizedCoordinateFrame = true;
  this.freezeObjects = params.freezeObjects;  // Option to make placed objects not movable
  this.floor = params.floor;  // Floor to load (ignored by most loaders)
  if (typeof this.floor === 'string') {
    this.floor = parseInt(this.floor);
  }
  this.room = params.room;  // Room to load (ignored by most loaders)
  if (typeof this.room === 'string') {
    this.room = parseInt(this.room);
  }
  this.defaultSource = undefined;
}

SceneLoader.prototype = Object.create(PubSub.prototype);
SceneLoader.prototype.constructor = SceneLoader;

SceneLoader.prototype.setCrossOrigin = function (value) {
  this.crossOrigin = value;
};

SceneLoader.prototype.load = function (url, onLoad, onProgress, onError, loadInfo) {
  var scope = this;
  var loader = new THREE.FileLoader(scope.manager);
  //loader.setCrossOrigin(this.crossOrigin);
  return loader.load(url, function (text) {
    scope.parse(JSON.parse(text), onLoad, url, loadInfo);
  }, onProgress, onError);
};

SceneLoader.prototype.setObjectFlags = function(sceneState, modelInst) {
  sceneState.setObjectFlags(modelInst);
  if (this.freezeObjects && modelInst) {
    modelInst.object3D.userData.isSelectable = true;
    modelInst.object3D.userData.isEditable = false;
  }
};

// SceneResult comes at end since we do binding of callback
SceneLoader.prototype.__onSceneCompleted = function (callback, sceneResult) {
  // Convert to scene and make appropriate transforms
  var scene = new THREE.Scene();
  var roots = [];
  var transforms = [];
  for (var i = 0; i < sceneResult.modelInstancesMeta.length; i++) {
    var metadata = sceneResult.modelInstancesMeta[i];
    if (metadata) {
      delete metadata.childIndices;  // We'll compute our own
    }
  }
  for (var i = 0; i < sceneResult.modelInstances.length; i++) {
    var metadata = sceneResult.modelInstancesMeta[i];
    var modelInst = sceneResult.modelInstances[i];
    if (metadata.userData) {
      _.merge(modelInst.object3D.userData, metadata.userData);
    }
    this.setObjectFlags(sceneResult, modelInst);
    if (modelInst) {
      if (metadata.transform)  {
        var te = metadata.transform.data || metadata.transform;
        var transform = new THREE.Matrix4();
        transform.set(te[0], te[4], te[8], te[12],
          te[1], te[5], te[9], te[13],
          te[2], te[6], te[10], te[14],
          te[3], te[7], te[11], te[15]
        );
        transforms.push(transform);
        modelInst.applyTransform(transform);
      } else {
        // No transform - try to apply the stuff we know about
        if (metadata.scale) {
          modelInst.setScale(metadata.scale);
        }
        transforms.push(modelInst.object3D.matrix);
      }
      // TODO: is this recursive linking okay?
      // Don't use userData since that is suppose to be well behaved and we are not
      // Probably not good if we want to export this scene
      modelInst.object3D.metadata = {
        modelInstance: modelInst,
        metadata: metadata
      };
      modelInst.object3D.name = '' + i;
      if (this.useNormalizedCoordinateFrame) {
        transforms[i] = modelInst.ensureNormalizedModelCoordinateFrame().clone();
      }

      scene.add(modelInst.object3D);

      if (metadata.parentIndex >= 0) {
        var parent = sceneResult.modelInstancesMeta[metadata.parentIndex];
        if (parent.childIndices) {
          parent.childIndices.push(i);
        } else {
          parent.childIndices = [i];
        }
      } else {
        roots.push(i);
      }
    } else {
      transforms.push(null);
    }
  }
  if (this.useSupportHierarchy) {
    // Try to put model as child of parent
    var todo = roots.slice(0);
    while (todo.length > 0) {
      var i = todo.shift();
      var metadata = sceneResult.modelInstancesMeta[i];
      var modelInst = sceneResult.modelInstances[i];
      if (modelInst) {
        if (metadata.childIndices) {
          var minv = new THREE.Matrix4();
          minv.getInverse(transforms[i]);
          for (var j = 0; j < metadata.childIndices.length; j++) {
            var ci = metadata.childIndices[j];
            var child = sceneResult.modelInstances[ci];
            if (child) {
              modelInst.object3D.add(child.object3D);
              // Fix child transform to be relative to parent
              // cwm = pwm * cm
              // cm = pwm^(-1)*cwm
              child.applyTransform(minv);
              // Add child to todo queue
              todo.push(ci);
            }
          }
        }
      }
    }
  }
  sceneResult.scene = scene;
  this.Publish('sceneLoaded', sceneResult);
  callback(sceneResult);
};

SceneLoader.prototype.__onModelInstanceLoaded = function (sceneResult, modelIndex, allModelsLoadedCallback, modelInstance) {
  allModelsLoadedCallback = allModelsLoadedCallback || this.__onSceneCompleted.bind(this);
  sceneResult.modelInstances[modelIndex] = modelInstance;
  sceneResult.modelInstancesLoaded += 1;
  this.Publish('modelLoaded', modelIndex, sceneResult);
  if (sceneResult.modelInstancesLoaded + sceneResult.modelInstancesErrors === sceneResult.modelInstancesMeta.length) {
    allModelsLoadedCallback(sceneResult);
  }
};

SceneLoader.prototype.__onModelInstanceLoadError = function (sceneResult, modelIndex, allModelsLoadedCallback, error) {
  console.error('Cannot load: ' + error);
  allModelsLoadedCallback = allModelsLoadedCallback || this.__onSceneCompleted.bind(this);
  sceneResult.modelInstancesErrors += 1;
  this.Publish('modelLoadedError', modelIndex, sceneResult);
  if (sceneResult.modelInstancesLoaded + sceneResult.modelInstancesErrors === sceneResult.modelInstancesMeta.length) {
    allModelsLoadedCallback(sceneResult);
  }
};

SceneLoader.prototype.__loadModel = function (sceneResult, modelIndex, modelId, callback) {
  this.assetManager.getModelInstance(this.defaultSource, modelId,
    this.__onModelInstanceLoaded.bind(this, sceneResult, modelIndex,
      this.__onSceneCompleted.bind(this, callback)),
    this.__onModelInstanceLoadError.bind(this, sceneResult, modelIndex,
      this.__onSceneCompleted.bind(this, callback)),
    { defaultFormat: this.defaultModelFormat }
  );
};

SceneLoader.prototype.parse = function (json, callbackFinished, url) {
  throw 'Please implement parse method!!!';
};

// Exports
module.exports = SceneLoader;
