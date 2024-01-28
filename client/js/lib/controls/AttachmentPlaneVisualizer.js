'use strict';

var Constants = require('Constants');
var MatrixUtil = require('math/MatrixUtil');
var Object3DUtil = require('geo/Object3DUtil');
var _ = require('util/util');

var AttachmentPlaneVisualizer = function (options) {
  this.options = _.defaults(Object.create(null), options || {}, {
    enabled: true,
    color: 'yellow',
    opacity: 0.5,
    attachmentFace: Constants.BBoxFaces.BOTTOM,
    attachmentOffset: 0.001*Constants.metersToVirtualUnit,
    scaleFactor: 1.0          // Extra scaling of the bounding box (if we didn't want a tight fit)
  });

  this.useModelBase = this.options.useModelBase;  // attachment point is baked in to model base, mostly working?
  this.modelInstance = null;
  this.active = false; // true when attached to a modelInstance
  this.enabled = this.options.enabled;

  this.scene = this.options.scene;
  this.attachmentFace = undefined;

  // Create material for the visualizer
  this.attachmentMat = new THREE.MeshBasicMaterial(
    { color: this.options.color, opacity: this.options.opacity, side: THREE.DoubleSide, transparent: true });
  var planeGeo = new THREE.PlaneBufferGeometry(1, 1);
  this.attachmentPlane = new THREE.Mesh(planeGeo, this.attachmentMat);
  this.attachmentPlane.name = 'AttachmentPlane';
  this.setAttachmentFace(this.options.attachmentFace);
};

AttachmentPlaneVisualizer.prototype.setAttachmentFace = function (attachmentFace, faceNormal) {
  this.attachmentFace = attachmentFace;
  if (faceNormal) {
    this.attachmentPlaneNormal = faceNormal.clone();
    this.attachmentPlaneDir = (this.attachmentFace === Constants.BBoxFaces.BOTTOM || this.attachmentFace === Constants.BBoxFaces.TOP)?
      Constants.worldFront : Constants.worldUp;
  } else {
    this.attachmentPlaneNormal = Object3DUtil.InNormals[this.attachmentFace];
    this.attachmentPlaneDir = (this.attachmentFace === Constants.BBoxFaces.BOTTOM || this.attachmentFace === Constants.BBoxFaces.TOP)?
      Constants.worldFront : Constants.worldUp;
  }
  this.__offset = this.attachmentPlaneNormal.clone().multiplyScalar(this.options.attachmentOffset);
  this.__quaternion = MatrixUtil.getAlignmentQuaternion(new THREE.Vector3(0,0,1), new THREE.Vector3(0,1,0),
    this.attachmentPlaneNormal, this.attachmentPlaneDir);
  this.attachmentPlane.setRotationFromQuaternion(this.__quaternion);
};

AttachmentPlaneVisualizer.prototype.update = function (force) {
  if (this.modelInstance) {
    var position = this.getAttachmentPoint();
    var bbox = this.getModelBBox().toTransformedBBox(this.__quaternion);
    var dim = bbox.dimensions();
    this.attachmentPlane.scale.copy(dim);
    this.attachmentPlane.position.copy(position);
    this.attachmentPlane.position.add(this.__offset); // so visualizer don't clash with other meshes under object
  } else {
    this.attachmentPlane.scale.set(0,0,0);
  }
};

AttachmentPlaneVisualizer.prototype.getModelBBox = function () {
  var bbox = this.modelInstance.getBBox();
  return bbox;
};

AttachmentPlaneVisualizer.prototype.getAttachmentPoint = function () {
  if (this.useModelBase) {
    var attachmentPoint = this.modelInstance.getAttachmentPointWorld();
    if (attachmentPoint) {
      return attachmentPoint;
    }
  }
  var bbox = this.getModelBBox();
  var faceCenters = bbox.getFaceCenters();
  var attachmentFaceCenter = faceCenters[this.attachmentFace];
  return attachmentFaceCenter;
};

/**
 * Attaches visualizer to model instance
 * @param modelInstance {model/ModelInstance}
 * @returns {boolean}
 */
AttachmentPlaneVisualizer.prototype.attach = function (modelInstance) {
  if (this.enabled) {
    this.modelInstance = modelInstance;
    this.active = true;
    // ASSUME attachment at bottom for now
    var attachmentIndex = this.modelInstance.object3D.userData['childWorldBBFaceIndex'];
    if (attachmentIndex == undefined) { attachmentIndex = Constants.BBoxFaces.BOTTOM; }
    this.setAttachmentFace(attachmentIndex);
    this.update(true);
    this.scene.add(this.attachmentPlane);
    return true;
  } else {
    return false;
  }
};

/**
 * Detaches visualizer from any selected objects
 */
AttachmentPlaneVisualizer.prototype.detach = function () {
  this.scene.remove(this.attachmentPlane);
};

/**
 * Resets visualizer for a new scene
 * @param params
 * @param params.scene {scene.SceneState} Scene to show manipulator in
 */
AttachmentPlaneVisualizer.prototype.reset = function (params) {
  if (params) {
    this.scene = params.scene;
  }
  this.detach();
};


module.exports = AttachmentPlaneVisualizer;
