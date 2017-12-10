var _ = require('util');
var Object3DUtil = require('geo/Object3DUtil');

/**
 * Skeleton joints and orientations (currently from scenegrok)
 *
 * @author Angel Chang
 * @constructor
 * @memberOf anim
 */
function PosedSkeleton(json) {
  // String id;
  // Vector3f worldPosition;        // Position of root joint (spine base) in world/scene coordinates
  // Quaternion worldOrientation;   // Orientation of root joint (spine base) in world/scene coordinates
  // List<Vector3f> jointPositionsKinect;       // Joint positions from kinect (in world/scene coordinates)
  // List<Quaternion> jointOrientationsKinect;  // Joint orientations from kinect (in world/scene coordinates)
  // List<Float> jointConfidencesKinect;
  // List<Vector3f> bonePositions;       // Joint coordinate frame origins (in body coordinates)
  // List<Quaternion> boneOrientations;  // Joint coordinate frame orientations (in body coordinates)
  // List<Float> boneLengths;
  //
  // transient Transform worldToBody;
  // transient Transform bodyToWorld;
  _.merge(this, _.omit(json, ['jointPositions', 'jointOrientations', 'jointConfidences', 'jointPositionsKinect', 'jointOrientationsKinect', 'jointConfidencesKinect']));
  this.worldPosition = json.worldPosition? Object3DUtil.toVector3(json.worldPosition) : new THREE.Vector3();
  this.worldOrientation = json.worldOrientation? Object3DUtil.toQuaternion(json.worldOrientation) : new THREE.Quaternion();
  this.jointPositionsKinect = _.map(json.jointPositions || json.jointPositionsKinect, function(x) { return Object3DUtil.toVector3(x); });
  this.jointOrientationsKinect = _.map(json.jointOrientations || json.jointOrientationsKinect, function(x) { return Object3DUtil.toQuaternion(x); });
  this.jointConfidencesKinect = json.jointConfidences || json.jointConfidencesKinect;
  this.bonePositions = json.bonePositions? _.map(json.bonePositions, function(x) { return Object3DUtil.toVector3(x); }) : null;
  this.boneOrientations = json.boneOrientations? _.map(json.boneOrientations, function(x) { return Object3DUtil.toQuaternion(x); }) : null;
  if (this.cameraTransform) {
    // If there is a camera transform, apply to jointPositions and jointOrientations
    for (var i = 0; i < this.jointPositionsKinect.length; i++) {
      this.jointPositionsKinect[i].applyMatrix4(this.cameraTransform);
    }
    var decomposed = Object3DUtil.decomposeMatrix4(this.cameraTransform);
    for (var i = 0; i < this.jointOrientationsKinect.length; i++) {
      this.jointOrientationsKinect[i].multiplyQuaternions(decomposed.orientation, this.jointOrientationsKinect[i]);
    }
  }
  this.__update();
}

PosedSkeleton.prototype.__update = function() {
  // Recompute transient cached data
  this.bodyToWorld = new THREE.Matrix4();
  this.bodyToWorld.setPosition(this.worldPosition);
  this.bodyToWorld.makeRotationFromQuaternion(this.worldOrientation);
  this.worldToBody = new THREE.Matrix4();
  this.worldToBody.getInverse(this.bodyToWorld);
};

PosedSkeleton.prototype.getJointPositionScene = function(jointId, useKinect) {
  if (useKinect) {
    return this.jointPositionsKinect[jointId];
  } else {
    return this.bonePositions[jointId].clone().applyMatrix4(this.bodyToWorld);
  }
};

PosedSkeleton.prototype.getJointPositionBody = function(jointId) {
  this.jointPositionsKinect[jointId].clone().applyMatrix4(this.worldToBody);
};

PosedSkeleton.prototype.getJointCoordFrameScene = function(jointId, useKinect) {
  if (useKinect) {
    return this.jointOrientationsKinect[jointId];
  } else {
    return this.boneOrientations[jointId].clone().applyQuaternion(this.worldOrientation);
  }
};

PosedSkeleton.prototype.getJointCoordFrameBody = function(jointId) {
  return this.boneOrientations[jointId];
};

module.exports = PosedSkeleton;