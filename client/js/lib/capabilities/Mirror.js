var _ = require('util');
require('three-mirror');

function Mirror(opts) {
  this.object3D = opts.object3D;
  this.mirrorMaterials = opts.mirrorMaterials;
  this.assetManager = opts.assetManager;
  this.ignoreSelfModel = opts.ignoreSelfModel;
  this.camera = opts.camera;

  if (THREE.CombinedCamera && this.camera instanceof THREE.CombinedCamera) {
    //console.log('Using combined camera');
    this.combinedCamera = this.camera;
    this.camera = this.combinedCamera.cameraP;
  }

  this.mirror = new THREE.Mirror(
    opts.renderer,
    this.camera,
    { debugMode: false, textureWidth: opts.width, textureHeight: opts.height, color: opts.color }
  );

  // TODO: Handle multiple mirror on same object....
  var scope = this;
  _.each(this.mirrorMaterials, function(mat) {
    mat.mesh.add(scope.mirror);
    mat.setMaterial(scope.mirror.material);
  });

  this.assetManager.Publish('dynamicAssetLoaded', this);
}

Mirror.prototype.__update = function() {
  if (this.combinedCamera) {
    this.combinedCamera.updateProjectionMatrix();
    this.camera.updateProjectionMatrix();
  }
  //this.mirror.matrixNeedsUpdate = true;
  this.mirror.render();
};

Mirror.prototype.update = function() {
  if (this.ignoreSelfModel) {
    var Object3DUtil = require('geo/Object3DUtil');
    var modelInstance = Object3DUtil.getModelInstance(this.object3D, true);
    if (modelInstance) {
      Object3DUtil.setVisible(modelInstance.object3D, false);
    }
    this.__update();
    if (modelInstance) {
      Object3DUtil.setVisible(modelInstance.object3D, true);
    }
  } else {
    this.__update();
  }
};

Mirror.prototype.destroy = function() {

};

module.exports = Mirror;