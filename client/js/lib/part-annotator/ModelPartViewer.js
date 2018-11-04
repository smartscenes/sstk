'use strict';

var Constants = require('lib/Constants');
var BasePartViewer = require('part-annotator/BasePartViewer');
var BBox = require('geo/BBox');
var Object3DUtil = require('geo/Object3DUtil');
var _ = require('util/util');

/**
 * Part viewer for a single model.
 * @param params {Object}
 * @param [params.addGround=false] {boolean} Whether to have a ground plane at base of model
 * @param [params.defaultSource='3dw'] {string} What asset source to use (if source not specified)
 * @param [params.defaultCameraSettings] {Object} Default camera settings to use
 * @constructor
 * @extends BasePartViewer
 */
function ModelPartViewer(params) {
  var defaults = {
    addGround: false,
    defaultSource: '3dw',
    defaultCameraSettings: {
      theta: Math.PI / 12,
      phi: - Math.PI / 3
    }
  };
  params = _.defaultsDeep(Object.create(null), params, defaults);
  BasePartViewer.call(this, params);

  this.addGround = params.addGround;
  this.defaultSource = params.defaultSource;
  this.defaultCameraSettings = params.defaultCameraSettings;

  this.__modelInstance = null;
  this.__loadingModelInfo = null;
}

ModelPartViewer.prototype = Object.create(BasePartViewer.prototype);
ModelPartViewer.prototype.constructor = ModelPartViewer;

Object.defineProperty(ModelPartViewer.prototype, 'modelInstance', {
  get: function () { return this.__modelInstance; }
});

Object.defineProperty(ModelPartViewer.prototype, 'modelId', {
  get: function () {
    if (this.__modelInstance) {
      return this.__modelInstance.model.info.fullId;
    }
  }
});

Object.defineProperty(ModelPartViewer.prototype, 'itemId', {
  get: function () {
    if (this.__modelInstance) {
      return this.__modelInstance.model.info.fullId;
    }
  }
});

ModelPartViewer.prototype.getAnnotationItemId = function() {
  return Constants.getGlobalOrDefault('modelId', this.urlParams['modelId'], {dropEmpty: true});
};

ModelPartViewer.prototype.setupScene = function () {
  this.createScene();
  var light = new THREE.HemisphereLight(0xffffff, 0x202020, 1);
  this.scene.add(light);

  var mId = this.getAnnotationItemId();
  if (mId) {
    var format = this.urlParams['format'];
    var metadata = format? { defaultFormat: format } : null;
    var modelInfo = this.assetManager.getLoadModelInfo(this.defaultSource, mId, metadata);
    this.clearAndLoadModel(modelInfo);
  }
};

ModelPartViewer.prototype.addTransparentGround = function (pos, dims) {
  pos = pos || new THREE.Vector3(0, 0, 0);
  dims = dims || new THREE.Vector3(100, 100, 8);

  if (this.ground) {
    this.scene.remove(this.ground);
    _.pull(this.excludeFromPicking, this.ground);
  }

  this.ground = this.makeGround(dims);

  this.ground.renderOrder = 1;  // Make sure ground always renders after model (fixes transparency order issues)
  this.ground.rotation.x = -Math.PI / 2;
  this.ground.position.copy(pos);
  this.ground.position.y -= dims.z / 2;  // offset so that ground top surface center is at pos
  this.ground.receiveShadow = true;

  this.scene.add(this.ground);
  this.excludeFromPicking.push(this.ground);
};

ModelPartViewer.prototype.makeGround = function (dims) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(dims.x, dims.y, dims.z, 10, 10),
    Object3DUtil.ClearMat);
};

ModelPartViewer.prototype.clearAndLoadModel = function (modelinfo) {
  if (this.__modelInstance) {
    this.scene.remove(this.__modelInstance.object3D);
    this.scene.remove(this.debugNode);
    this.debugNode = new THREE.Object3D('debugNode');
    this.scene.add(this.debugNode);
    this.__modelInstance = null;
  }
  // load
  this.timings.start('modelLoad');
  //this.start = new Date().getTime();
  this.addWaiting('model-' + modelinfo.fullId);
  this.assetManager.getModelInstanceFromLoadModelInfo(modelinfo, this.onModelLoad.bind(this), function() {
    this.removeWaiting('model-' + modelinfo.fullId);
  }.bind(this));
  this.__loadingModelInfo = modelinfo;
  this.Publish('modelLoadStart', modelinfo);
};

ModelPartViewer.prototype.onModelLoad = function (modelInstance) {
  // var end = new Date().getTime();
  // var time = end - this.start;
  this.timings.stop('modelLoad');
  var time = this.timings.get('modelLoad').duration;
  //console.log('Load time for model: ' + time);

  this.scene.add(modelInstance.object3D);
  this.__modelInstance = modelInstance;
  Object3DUtil.placeObject3DByBBFaceCenter(modelInstance.object3D, null, Constants.BBoxFaceCenters.BOTTOM);  // center bottom to origin
  if (this.labeler) {
    this.labeler.setTarget(modelInstance);
  }

  var bb = Object3DUtil.getBoundingBox(modelInstance.object3D);
  if (this.addGround) {
    var bbdims = bb.dimensions();
    var d = Math.max(bbdims.x, bbdims.z)*2;
    var groundCenter = bb.centroid();
    groundCenter.y -= bbdims.y / 2;
    this.addTransparentGround(groundCenter, new THREE.Vector3(d, d, d/50));
  }

  this.onSceneChanged();
  var cameraParams = _.defaults( { targetBBox: bb }, this.defaultCameraSettings );
  this.resetCamera(cameraParams);
  this.cameraControls.saveCameraState(true);

  this.removeWaiting('model-' + modelInstance.model.info.fullId);
  this.setTransparency(false, true);
  //console.log(modelInstance);
  //console.log('Finished loading model: ' + JSON.stringify(modelInstance.model.info));
};

ModelPartViewer.prototype.getSceneBoundingBox = function() {
  //return Object3DUtil.getBoundingBox(this.scene);
  var target = this.__modelInstance;
  if (target) {
    return Object3DUtil.getBoundingBox(target.object3D);
  } else {
    var bbox = new BBox();
    bbox.includePoint(new THREE.Vector3());
  }
};

// ModelPartViewer.prototype.resetCamera = function () {
//  var pos = Constants.defaultCamera.position;
//  if (this.modelInstance) {
//    var targetBBox = Object3DUtil.getBoundingBox(this.modelInstance.object3D);
//    var d = targetBBox.maxDim();
//    pos = pos.clone().multiplyScalar(d / 80);
//  }
//  this.camera.up.copy(Constants.worldUp);
//  this.cameraControls.viewTarget({
//    position: pos,
//    target: new THREE.Vector3()
//  });
//};

module.exports = ModelPartViewer;
