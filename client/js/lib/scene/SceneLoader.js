'use strict';

var Constants = require('Constants');
var SceneState = require('scene/SceneState');
var Object3DUtil = require('geo/Object3DUtil');
var PubSub = require('PubSub');
var _ = require('util/util');

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

  this.includeCeiling = (params.includeCeiling != undefined)? params.includeCeiling : true;
  this.includeWalls = (params.includeWalls != undefined)? params.includeWalls : true;
  this.includeFloor = (params.includeFloor != undefined)? params.includeFloor : true;
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
    try {
      scope.parse(JSON.parse(text), onLoad, url, loadInfo);
    } catch (err) {
      console.error('Error loading scene', url, err);
      onError(err);
    }
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
  var scene = sceneResult.scene || new THREE.Scene();
  var roots = [];
  var transforms = [];
  var needParentingById = [];
  for (var i = 0; i < sceneResult.modelInstancesMeta.length; i++) {
    var metadata = sceneResult.modelInstancesMeta[i];
    if (metadata) {
      delete metadata.childIndices;  // We'll compute our own
    }
  }
  for (var i = 0; i < sceneResult.modelInstances.length; i++) {
    var metadata = sceneResult.modelInstancesMeta[i];
    var modelInst = sceneResult.modelInstances[i];
    if (modelInst) {
      if (metadata.id != null) {
        modelInst.object3D.userData.id = metadata.id;
      }
      if (metadata.userData) {
        _.merge(modelInst.object3D.userData, metadata.userData);
      }
    }
    this.setObjectFlags(sceneResult, modelInst);
    if (modelInst) {
      if (sceneResult.assetTransforms) {
        var assetTransform = sceneResult.assetTransforms[modelInst.model.info.source];
        if (assetTransform) {
          if (assetTransform.alignTo || assetTransform.scaleTo) {
            var targetUp = assetTransform.alignTo ? Object3DUtil.toVector3(assetTransform.alignTo.up) : null;
            var targetFront = assetTransform.alignTo ? Object3DUtil.toVector3(assetTransform.alignTo.front) : null;
            modelInst.alignAndScale(targetUp, targetFront, Constants.metersToVirtualUnit * assetTransform.scaleTo);
          }
          if (assetTransform.centerTo) {
            modelInst.centerTo(Object3DUtil.toVector3(assetTransform.centerTo));
          }
        }
      }
      if (metadata.transform)  {
        var te = metadata.transform.data || metadata.transform;
        var transform = new THREE.Matrix4();
        transform.set(te[0], te[4], te[8], te[12],
          te[1], te[5], te[9], te[13],
          te[2], te[6], te[10], te[14],
          te[3], te[7], te[11], te[15]
        );
        modelInst.applyTransform(transform);
      } else {
        // No transform - try to apply the stuff we know about
        if (metadata.scale) {
          if (typeof metadata.scale === 'number') {
            modelInst.setScale(metadata.scale);
          } else if (metadata.scale instanceof THREE.Vector3) {
            modelInst.setScaleVector(metadata.scale);
          }
        }
        if (metadata.quaternion) {
          modelInst.setQuaternion(metadata.quaternion);
        }
        if (metadata.position) {
          modelInst.setTranslation(metadata.position);
        }
        if (metadata.visible != null) {
          modelInst.object3D.visible = metadata.visible;
        }
        if (metadata.vertexColor != null) {
          Object3DUtil.colorVertices(modelInst.object3D, metadata.vertexColor, metadata.opacity);
        } else {
          if (metadata.color != null) {
            Object3DUtil.setMaterial(modelInst.object3D, Object3DUtil.getColor(metadata.color));
          }
          if (metadata.opacity != null) {
            Object3DUtil.setOpacity(modelInst.object3D, metadata.opacity);
          }
        }
      }
      transforms.push(modelInst.object3D.matrix.clone());
      // TODO: is this recursive linking okay?
      // Don't use userData since that is suppose to be well behaved and we are not
      // Probably not good if we want to export this scene
      modelInst.object3D.metadata = {
        modelInstance: modelInst,
        metadata: metadata
      };
      modelInst.object3D.name = (metadata.name != null)? metadata.name : '' + i;
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
        if (metadata.parentId != null) {
          needParentingById.push(i);
        } else {
          roots.push(i);
        }
      }
    } else {
      transforms.push(null);
    }
  }
  // complete scene state
  sceneResult.scene = scene;
  // update support hierarchy
  if (this.useSupportHierarchy) {
    scene.updateMatrixWorld();
    var todo = roots.slice(0);
    // Try to put model as child of parent
    // Process those that are parented by id first
    for (var j = 0; j < needParentingById.length; j++) {
      var i = needParentingById[j];
      var metadata = sceneResult.modelInstancesMeta[i];
      var modelInst = sceneResult.modelInstances[i];
      if (modelInst) {
        var node = sceneResult.findNodeById(metadata.parentId);
        if (node && modelInst.parent !== node) {
          // console.log('attach to parent 1', modelInst.object3D, node, scene);
          node.updateMatrixWorld();
          modelInst.object3D.updateMatrixWorld();
          var minv = new THREE.Matrix4();
          minv.copy(node.matrixWorld).invert();
          minv.multiplyMatrices(minv, scene.matrixWorld);
          node.add(modelInst.object3D);
          modelInst.applyTransform(minv);
        }
        todo.push(i);
      }
    }
    // Process objects that go on top of other objects
    while (todo.length > 0) {
      var i = todo.shift();
      var metadata = sceneResult.modelInstancesMeta[i];
      var modelInst = sceneResult.modelInstances[i];
      if (modelInst) {
        if (metadata.childIndices) {
          var minv = new THREE.Matrix4();
          minv.copy(transforms[i]).invert();
          for (var j = 0; j < metadata.childIndices.length; j++) {
            var ci = metadata.childIndices[j];
            var child = sceneResult.modelInstances[ci];
            if (child) {
              // console.log('attach to parent 2', modelInst.object3D, child.object3D, modelInst.object3D);
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
  var modelFormat = this.defaultModelFormat;
  if (sceneResult.modelInstancesMeta && sceneResult.modelInstancesMeta[modelIndex]) {
    if (sceneResult.modelInstancesMeta[modelIndex].format != null) {
      modelFormat = sceneResult.modelInstancesMeta[modelIndex].format;
    }
  }
  this.assetManager.getModelInstance(this.defaultSource, modelId,
    this.__onModelInstanceLoaded.bind(this, sceneResult, modelIndex,
      this.__onSceneCompleted.bind(this, callback)),
    this.__onModelInstanceLoadError.bind(this, sceneResult, modelIndex,
      this.__onSceneCompleted.bind(this, callback)),
    { defaultFormat: modelFormat }
  );
};

SceneLoader.prototype.parse = function (json, callbackFinished, url) {
  if (json.format === 'objects' && json.objects) {
    var sceneResult = new SceneState(null, null);
    var objects = json.objects.map(function(record) {
      record.position = Object3DUtil.toVector3(record.position);
      record.scale = Object3DUtil.toVector3(record.scale);
      record.quaternion = Object3DUtil.toQuaternion(record.quaternion);
      return record;
    });
    if (json.scan) {
      objects.unshift(json.scan);
    }
    sceneResult.modelInstancesMeta = objects;
    console.log('objects', objects);
    for (var i = 0; i < objects.length; i++) {
      this.__loadModel(sceneResult, i, objects[i].fullId, callbackFinished);
    }
  } else {
    throw 'Please implement parse method!!!';
  }
};

// Exports
module.exports = SceneLoader;
