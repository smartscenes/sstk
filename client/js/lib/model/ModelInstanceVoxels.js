'use strict';

var Object3DUtil = require('geo/Object3DUtil');
var ModelVoxels = require('model/ModelVoxels');

/**
 * Represents voxels for a specific ModelInstance
 * @param params
 * @constructor
 * @memberOf model
 */
var ModelInstanceVoxels = function (params) {
  ModelVoxels.call(this, params);
};

ModelInstanceVoxels.prototype = Object.create(ModelVoxels.prototype);
ModelInstanceVoxels.prototype.constructor = ModelInstanceVoxels;

ModelInstanceVoxels.prototype.init = function (modelInstance) {
  this.modelInstance = modelInstance;
  var model = (this.modelInstance) ? this.modelInstance.model : null;
  ModelVoxels.prototype.init.call(this, model);
};

ModelInstanceVoxels.prototype.setVoxels = function (modelVoxels) {
  //this.updateVoxelGrid_(modelVoxels.voxelGrid);
  this.voxelGrid = modelVoxels.voxelGrid;
  this.voxelMeshes = modelVoxels.voxelMeshes;
  this.voxelNode = modelVoxels.voxelNode.clone();
  this.updateTransform();
};

ModelInstanceVoxels.prototype.getGridToWorld = function () {
  if (this.voxelGrid && this.modelInstance) {
    if (!this._gridToWorld) {
      this._gridToWorld = new THREE.Matrix4();
    }
    var modelObject = this.modelInstance.getObject3D('Model');
    modelObject.updateMatrixWorld();
    var gridToModel = this.getGridToModel();
    this._gridToWorld.multiplyMatrices(modelObject.matrixWorld, gridToModel);
    return this._gridToWorld;
  }
};

ModelInstanceVoxels.prototype.getWorldToGrid = function () {
  if (this.voxelGrid && this.modelInstance) {
    if (!this._worldToGrid) {
      this._worldToGrid = new THREE.Matrix4();
    }
    var modelObject = this.modelInstance.getObject3D('Model');
    modelObject.updateMatrixWorld();
    this._worldToGrid.copy(modelObject.matrixWorld).invert();
    var modelToGrid = this.getModelToGrid();
    this._worldToGrid.multiplyMatrices(modelToGrid, this._worldToGrid);
    return this._worldToGrid;
  }
};

ModelInstanceVoxels.prototype.__updateVoxelGrid = function (grid) {
  ModelVoxels.prototype.__updateVoxelGrid.call(this, grid);
  //
  // Step 2: Apply model transform from the model instance
  //
  this.updateTransform();
};

ModelInstanceVoxels.prototype.updateTransform = function () {
  // Apply same matrix as model
  if (this.modelInstance && this.voxelNode) {
    var modelObject = this.modelInstance.getObject3D('Model');
    modelObject.updateMatrixWorld();
    var matrix = modelObject.matrixWorld.clone();
    Object3DUtil.setMatrix(this.voxelNode, matrix);
  }
};

ModelInstanceVoxels.prototype.getAssetObject3D = function() {
  return this.modelInstance.getObject3D('Model');
};

ModelInstanceVoxels.prototype.createColorVoxels = function (opts, callback) {
  var scope = this;
  this.createColorGrid(opts, function(grid) {
    // Make a copy of our voxels and set the grid to be the returned grid
    var mv = new ModelInstanceVoxels({ voxelField: scope.voxelField });
    mv._useVoxelGridTransforms = scope._useVoxelGridTransforms;
    // Need this because we track both the modelInstance and the model
    mv.init(scope.modelInstance);
    mv.setVoxelGrid(grid);
    callback(mv);
  });
};

module.exports = ModelInstanceVoxels;
