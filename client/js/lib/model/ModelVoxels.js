var Object3DAssetVoxels = require('model/Object3DAssetVoxels');
var Model = require('model/Model');

/**
 * Represents a set of voxels for a model (can be used by model instances)
 * @param params
 * @param [params.voxelsField='voxels-surface'] {string} What voxels to use
 * @constructor
 * @memberOf model
 */
var ModelVoxels = function (params) {
  Object3DAssetVoxels.call(this, params);
  this.__assetVoxelPrefix = 'ModelVoxel';
  this.__checkAssetType = 'Model';
};

ModelVoxels.prototype = Object.create(Object3DAssetVoxels.prototype);
ModelVoxels.prototype.constructor = ModelVoxels;

Object.defineProperty(ModelVoxels.prototype, 'model', {
  get: function () { return this.asset; },
  set: function (v) { this.asset = v; }
});

/**
 * Return transform from voxel grid coordinates to model coordinates
 * @returns {THREE.Matrix4}
 */
ModelVoxels.prototype.getGridToModel = ModelVoxels.prototype.getGridToAsset;

/**
 * Return transform from model coordinates to voxel grid coordinates
 * @returns {THREE.Matrix4}
 */
ModelVoxels.prototype.getModelToGrid = ModelVoxels.prototype.getAssetToGrid;

/**
 * Updates the voxel grid and transforms
 * @param grid
 * @private
 */
ModelVoxels.prototype.__updateVoxelGrid = function (grid) {
  // Make sure we use more general asset space names
  if (this.model.info) {
    var mi = this.model.info;
    if (mi.modelSpaceMetadata) {
      mi.assetSpaceMetadata = mi.modelSpaceMetadata;
    }
    if (mi.voxelsToModelTransform) {
      mi.voxelsToAssetTransform = mi.voxelsToModelTransform;
    }
  }
  return Object3DAssetVoxels.prototype.__updateVoxelGrid.call(this, grid);
};

module.exports = ModelVoxels;
