const Object3DAssetVoxels = require('model/Object3DAssetVoxels');
const Object3DUtil = require('geo/Object3DUtil');

// SceneRawVoxels computed as raw voxels grid (without representing as composite of model voxels)
// This representation is okay for static scenes but very poor for scenes where we allow objects to be moved
class SceneRawVoxels extends Object3DAssetVoxels {
  constructor(params) {
    super(params);
    this.__defaultOpts['recursive'] = true;
  }

  getAssetObject3D() {
    return this.sceneState.scene;
  }

  get sceneState() {
    return this.asset;
  }

  set sceneState(v) {
    this.sceneState = v;
  }

  init(sceneState, showVoxels) {
    super.init(sceneState);
    if (this.voxelNode && this.voxelNode.parent) {
      this.voxelNode.parent.remove(this.voxelNode);
    }
    this.voxelNode = new THREE.Object3D();
    //if (showVoxels) {
      //this.ensureVoxels();
    //}
    Object3DUtil.setVisible(this.voxelNode, showVoxels);
  }

  setVisible(flag) {
    if (this.voxelNode) {
      Object3DUtil.setVisible(this.voxelNode, flag);
    }
  }
}

module.exports = SceneRawVoxels;
