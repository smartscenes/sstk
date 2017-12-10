'use strict';

var BoundingBoxHelper = require('geo/BoundingBoxHelper');
var Object3DUtil = require('geo/Object3DUtil');

var AttachmentBasedBoundingBoxHelper = function (object, attachmentFace, color) {
  this.attachmentFace = undefined;
  this.attachmentOffset = 0.01;
  this.scaleFactor = 1.0;  // Extra scaling of the bounding box (if we didn't want a tight fit)

  // Create material for the visualizer
  this.clearMat = new THREE.MeshLambertMaterial({ visible: false });
  this.attachmentMat = new THREE.MeshLambertMaterial({ color: color,side: THREE.DoubleSide });
  // Initialize all faces to be transparent
  var materials = [];
  for (var i = 0; i < 6; i++) {
    materials.push(this.clearMat);
  }
  var material = new THREE.MultiMaterial(materials);

  BoundingBoxHelper.call(this, object, material);
  this.materials = material.materials;
  this.setAttachmentFace(attachmentFace);
};

AttachmentBasedBoundingBoxHelper.prototype = Object.create(BoundingBoxHelper.prototype);
AttachmentBasedBoundingBoxHelper.prototype.constructor = BoundingBoxHelper;

AttachmentBasedBoundingBoxHelper.prototype.setAttachmentFace = function (attachmentFace) {
  if (this.attachmentFace !== attachmentFace) {
    this.attachmentFace = attachmentFace;
    // Initialize all faces to be transparent
    for (var i = 0; i < 6; i++) {
      this.materials[i] = this.clearMat;
    }
    // Make the attachment plane a nice color
    var bboxFaceIndexToColor = this.getBoxGeoFaceIndex(attachmentFace);
    this.materials[bboxFaceIndexToColor] = this.attachmentMat;
  }
};

AttachmentBasedBoundingBoxHelper.prototype.getBoxGeoFaceIndex = function (sceneViewerFaceIndex) {
  //indices are sceneViewerFaceIndex and values are corresponding boxGeoFaceIndex
  var faceMap = [1,0,3,2,5,4];
  return faceMap[sceneViewerFaceIndex];
};

AttachmentBasedBoundingBoxHelper.prototype.update = function (force) {
  if (this.object) {
    var bb = Object3DUtil.getBoundingBox(this.object, force);
    this.box.set(bb.min, bb.max);
    this.box.size(this.scale);
    this.box.center(this.position);
    var initialScale = this.scale.clone();
    if (this.scaleFactor) {
      this.scale.multiplyScalar(this.scaleFactor);
    }
    if (this.attachmentOffset) {
      var attachmentOffsetVector = Object3DUtil.InNormals[this.attachmentFace].clone();
      var scaleDelta = this.scale.clone().sub(initialScale);
      var scaleDeltaVector = attachmentOffsetVector.clone().multiply(scaleDelta);
      attachmentOffsetVector.multiplyScalar(this.attachmentOffset).add(scaleDeltaVector);
      this.position.add(attachmentOffsetVector);
    }
  } else {
    this.box.makeEmpty();
  }
};

module.exports = AttachmentBasedBoundingBoxHelper;
