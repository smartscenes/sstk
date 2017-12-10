'use strict';

var ModelVoxels = require('model/ModelVoxels');
var ModelInstanceVoxels = require('model/ModelInstanceVoxels');
var Object3DUtil = require('geo/Object3DUtil');

var SceneVoxels = function (params) {
  this.sceneState = undefined;
  this.cachedModelVoxels = {};
  this.voxelNode = undefined;
};

SceneVoxels.prototype.init = function (sceneState, showVoxels) {
  this.sceneState = sceneState;
  this.cachedModelVoxels = {};
  if (this.voxelNode && this.voxelNode.parent) {
    this.voxelNode.parent.remove(this.voxelNode);
  }
  this.voxelNode = new THREE.Object3D();
  if (showVoxels) {
    this.ensureVoxels();
  }
  Object3DUtil.setVisible(this.voxelNode, showVoxels);
};

SceneVoxels.prototype.setVisible = function (flag) {
  if (this.voxelNode) {
    Object3DUtil.setVisible(this.voxelNode, flag);
  }
};

SceneVoxels.prototype.ensureVoxels = function () {
  // TODO: Review the caching logic
  //console.log('Ensuring voxels...');
  var voxelsField = this.sceneState.info.voxelsField;
  for (var i = 0; i < this.sceneState.modelInstances.length; i++) {
    var modelInstance = this.sceneState.modelInstances[i];
    if (!modelInstance.voxels) {
      modelInstance.voxels = new ModelInstanceVoxels({ material: Object3DUtil.getSimpleFalseColorMaterial(i), voxelsField: voxelsField });
      modelInstance.voxels.init(this.sceneState.modelInstances[i]);
    }
  }

  Object3DUtil.removeAllChildren(this.voxelNode);
  var mainVoxelNode = this.voxelNode;
  function modelVoxelsLoaded(modelInstances, modelVoxels) {
    for (var i = 0; i < modelInstances.length; i++) {
      //console.log('Ensuring voxels for modelInstances ' + modelInstances[i].modelInstanceId);
      var voxels = modelInstances[i].voxels;
      voxels.setVoxels(modelVoxels);
      if (voxels.material) {
        Object3DUtil.setMaterial(voxels.getVoxelNode(), voxels.material);
      }
      mainVoxelNode.add(voxels.getVoxelNode());
    }
  }

  var modelInstancesByModelIds = this.sceneState.createModelIdToInstanceMap();
  // Trim cachedModelVoxels...
  for (var modelId in this.cachedModelVoxels) {
    if (this.cachedModelVoxels.hasOwnProperty(modelId) && !modelInstancesByModelIds[modelId]) {
      delete this.cachedModelVoxels[modelId];
    }
  }
  // Make sure voxels are cached
  var voxelsField = this.sceneState.info.voxelsField;
  for (var modelId in modelInstancesByModelIds) {
    if (modelInstancesByModelIds.hasOwnProperty(modelId)) {
      //console.log('Ensuring voxels for model ' + modelId);
      var modelInstances = modelInstancesByModelIds[modelId];
      // Make sure we have cached model voxels
      if (!this.cachedModelVoxels[modelId]) {
        this.cachedModelVoxels[modelId] = new ModelVoxels({ voxelsField: voxelsField });
        this.cachedModelVoxels[modelId].init(modelInstances[0].model);
        this.cachedModelVoxels[modelId].loadVoxels(
          modelVoxelsLoaded.bind(this, modelInstances)
        );
      } else {
        modelVoxelsLoaded(modelInstances, this.cachedModelVoxels[modelId]);
      }
    }
  }
};

SceneVoxels.prototype.update = function () {
  if (this.sceneState) {
    for (var i = 0; i < this.sceneState.modelInstances.length; i++) {
      // Make sure voxels are up to date
      if (this.sceneState.modelInstances[i].voxels) {
        this.sceneState.modelInstances[i].voxels.updateTransform();
      }
    }
  }
};

module.exports = SceneVoxels;
