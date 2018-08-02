/*
 * Camera wrapper class
 */
'use strict';

var Constants = require('Constants');
var Object3DUtil = require('geo/Object3DUtil');
var _ = require('util');

function Camera(fov, aspect, near, far) {
  THREE.PerspectiveCamera.call(this, fov, aspect, near, far);
}

Camera.prototype = Object.create(THREE.PerspectiveCamera.prototype);
Camera.prototype.constructor = Camera;

// Initializes Camera from pair of strings giving extrinsics and intrinsics.
// extrinsics is 4x4 transformation matrix taking camera coordinates to world.
// Camera axes are +x=right, +y=up, -z=view
// intrinsics are given as: { width, height, fx, fy, cx, cy }
Camera.prototype.initFromExtrinsicsIntrinsics = function (extrMatrix, intr) {
  this.matrix.copy(extrMatrix);
  this.matrix.decompose(this.position, this.quaternion, this.scale);
  if (intr) {
    this.fov = 2 * Math.atan(intr.height / (2 * intr.fy)) * (180 / Math.PI);
    this.aspect = intr.width / intr.height;
  }
  this.matrixWorldNeedsUpdate = true;
  this.updateMatrixWorld();
  this.updateProjectionMatrix();
};

// Parse Camera representation from gaps string
Camera.prototype.initFromGapsString = function (str, aspect) {
  var l = str.split(/\s+/).map(function (s) { return parseFloat(s); });
  var vx = l[0], vy = l[1], vz = l[2],
      tx = l[3], ty = l[4], tz = l[5],
      ux = l[6], uy = l[7], uz = l[8],
      xf = l[9], yf = l[10], v = l[11];

  // Old coordinates used to be different
  // this.position.set(vx, vz, -vy).multiplyScalar(Constants.metersToVirtualUnit);
  // this.up.set(ux, uz, -uy);
  // var towards = new THREE.Vector3(tx, tz, -ty);

  //this.position.set(-vx, vy, -vz).multiplyScalar(Constants.metersToVirtualUnit);
  //this.up.set(-ux, uy, -uz);
  //var towards = new THREE.Vector3(-tx, ty, -tz);

  this.position.set(vx, vy, vz);
  this.up.set(ux, uy, uz);
  var towards = new THREE.Vector3(tx, ty, tz);
  //var right = new THREE.Vector3();
  //right.crossVectors(this.up, towards);
  //towards.normalize();
  //this.up.crossVectors(right, towards);
  //this.up.normalize();
  var target = this.position.clone();
  target.add(towards);
  this.lookAt(target);
  this.fov = THREE.Math.radToDeg(yf) * 2;  // set vertical fov and ignore horizontal fov
  this.value = v;
  this.aspect = aspect;

  this.updateProjectionMatrix();
};

Camera.prototype.applyTransform = (function () {
  var normalMatrix = new THREE.Matrix3();
  var rot = new THREE.Matrix4();
  var q = new THREE.Quaternion();
  return function(transform) {
    normalMatrix.getNormalMatrix(transform);
    this.up.applyMatrix3(normalMatrix);
    this.up.normalize();

    // Apply transform to camera
    q.setFromRotationMatrix(rot.extractRotation(transform));
    this.quaternion.multiplyQuaternions(q, this.quaternion);
    this.position.applyMatrix4(transform);
    this.updateMatrix();
    this.updateMatrixWorld();
    this.updateProjectionMatrix();
    return this;
  };
}());

// Create camera from json
Camera.fromJson = function(json, width, height) {
  var camera;
  width = width || json.width;
  height = height || json.height;
  var aspect = (width && height)? width / height : json.aspect;
  switch (json.type) {
    case 'combined':
    case 'CombinedCamera':
      camera = new THREE.CombinedCamera(json.width, height, json.fov, json.near, json.far, json.near, json.far);
      break;
    case 'orthographic':
    case 'OrthographicCamera':
      var left =  json.left || -width/2;
      var right = json.right || width/2;
      var top = json.top || height/2;
      var bottom = json.bottom || -height/2;
      camera = new THREE.OrthographicCamera(left, right, top, bottom, json.near, json.far);
      camera.fov = json.fov;
      camera.aspect = aspect;
      break;
    // case 'direct':
    //   camera = new THREE.Camera();
    //   camera.projectionMatrix.copy(json.projectionMatrix);
    //   break;
    case 'perspective':
    case 'PerspectiveCamera':
    default:
      camera = new THREE.PerspectiveCamera(json.fov, aspect, json.near, json.far);
      break;
  }
  var updateProjectMatrixNeeded = false;
  if (json.position) {
    camera.position.copy(Object3DUtil.toVector3(json.position));
    updateProjectMatrixNeeded = true;
  }
  if (json.target) {
    camera.lookAt(Object3DUtil.toVector3(json.target));
    updateProjectMatrixNeeded = true;
  }
  camera.updateMatrix();
  if (updateProjectMatrixNeeded/*&& json.type !== 'direct'*/) {
    camera.updateProjectionMatrix();
  }
  return camera;
};

Camera.setView = function(camera, options) {
  var Object3DUtil = require('geo/Object3DUtil');
  var target = Object3DUtil.toVector3(options.target);        // Target to look at
  var position = Object3DUtil.toVector3(options.position);    // Camera position
  var up = Object3DUtil.toVector3(options.up);  // Up direction
  var lookatUp = Object3DUtil.toVector3(options.lookatUp) || up;  // Up to use for looking at target

  // Set up to use for lookAt
  var cameraUp = up || camera.up.clone();
  if (lookatUp) {
    camera.up.copy(lookatUp);
  }
  camera.position.copy(position);
  camera.lookAt(target);

  // Set back up to use for camera
  camera.up.copy(cameraUp);

  if (options.fov) {
    camera.fov = options.fov;
  }
  if (options.near) {
    camera.near = options.near;
  }
  if (options.far) {
    camera.far = options.far;
  }

  if (camera instanceof THREE.OrthographicCamera) {
    // The size that we set is the mid plane of the viewing frustum
    var hyperfocus = target.clone().sub(camera.position).length();
    var halfHeight = Math.tan(camera.fov * Math.PI / 180 / 2) * hyperfocus;
    var planeHeight = 2 * halfHeight;
    var planeWidth = planeHeight * camera.aspect;
    var halfWidth = planeWidth / 2;

    camera.left = -halfWidth;
    camera.right = halfWidth;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
  }
  camera.updateMatrix();
  camera.updateProjectionMatrix(target);
};

module.exports = Camera;
