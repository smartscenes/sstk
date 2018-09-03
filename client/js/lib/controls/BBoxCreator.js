/* BBoxCreator
  Allows user to drag and drop a bounding box for a shape in the 3D depth-scan
*/

'use strict';

var Object3DUtil = require('geo/Object3DUtil');
var OBB = require('geo/OBB');
var Constants = require('Constants');
var PubSub = require('PubSub');
var MeshHelpers = require('geo/MeshHelpers');

function BBoxCreator(params) {
  PubSub.call(this);

  this.autoAdjustCamera = params.autoAdjustCamera;

  //THREE UI VARIABLES
  this.scene = params.scene;
  this.picker = params.picker;
  this.camera = params.camera;
  this.controls = params.controls;
  this.container = params.container;

  this.__mouse = new THREE.Vector2();
  this.__prevMouse3D = new THREE.Vector3();
  this.__mouse3D = new THREE.Vector3();
  this.__mouseDown = false;
  this.__currstep = 0;

  // Color of the front arrow
  this.__frontArrowColor = 0x1870B2;
  // Color of the bounding box
  this.__boxColor = 0x4A148C;

  this.__bottomFaceCenter = new THREE.Vector3();
  this.__supportParent = null;//object3D on which to place object if user inserts from query

  this.__projectionPlaneStep1 = null;
  this.__projectionPlaneStep2 = null;

  this.__step0info = new StepInfo(0);
  this.__step1info = new StepInfo(1);
  this.__step2info = new StepInfo(2);

  this.width = 0;
  this.depth = 0;
  this.height = 0;

  // Callback when BBoxCreator is closed
  this.onCloseCallback = params.onCloseCallback;

  this.placementInfo = null;

  this.scene = params.scene;
  this.camera = params.camera;
  this.controls = params.controls;
  this.debug = true;
}

BBoxCreator.prototype = Object.create(PubSub.prototype);
BBoxCreator.prototype.constructor = BBoxCreator;

BBoxCreator.prototype.reset = function (params) {
  params = params || {};
  this.scene = params.scene || this.scene;
  this.camera = params.camera || this.camera;
  this.controls = params.controls || this.controls;

  this.__mouse = new THREE.Vector2();
  this.__prevMouse3D = new THREE.Vector3();
  this.__mouse3D = new THREE.Vector3();
  this.__mouseDown = false;
  this.__currstep = 0;

  this.scene.remove(this.__step0info.arrow);
  this.scene.remove(this.__step1info.arrow);
  this.scene.remove(this.__step2info.arrow);
  this.scene.remove(this.__boxMesh);
  this.scene.remove(this.__frontArrow);

  if (this.autoAdjustCamera) {
    this.controls.restoreCameraState();
  }

  this.__step0info = new StepInfo(0);
  this.__step1info = new StepInfo(1);
  this.__step2info = new StepInfo(2);

  this.placementInfo = null;

  this.depth = 0;
  this.height = 0;
  this.width = 0;
};

BBoxCreator.prototype.onDocumentMouseDown = function (event) {
  switch (this.__currstep) {
    case 0:
      this.__step0MouseDown(event);
      break;
    case 1:
      this.__step1MouseDown(event);
      break;
    case 2:
      this.__step2MouseDown(event);
      break;
    default:
      break;
  }
};

BBoxCreator.prototype.onDocumentMouseMove = function (event) {
  switch (this.__currstep) {
    case 0:
      this.__step0MouseMove(event);
      break;
    case 1:
      this.__step1MouseMove(event);
      break;
    case 2:
      this.__step2MouseMove(event);
      break;
    default:
      break;
  }
};

BBoxCreator.prototype.onDocumentMouseUp = function (event) {
  switch (this.__currstep) {
    case 0:
      this.__step0MouseUp(event);
      break;
    case 1:
      this.__step1MouseUp(event);
      break;
    case 2:
      this.__step2MouseUp(event);
      break;
    default:
      break;
  }
};

BBoxCreator.prototype.placeCamera = function () {
  this.savedCameraState = this.controls.getCurrentCameraState();
  var target = this.__step0info.end.clone();
  target.y += this.__step0info.length;
  var position = target.clone();
  position.add(this.__step0info.dir.clone().multiplyScalar(this.__step0info.length));
  position.add(new THREE.Vector3(0,this.__step0info.length, 0));

  this.camera.position.copy(position);
  this.camera.lookAt(target);
  this.controls.controls.target.copy(target);
  this.controls.controls.update();
  this.camera.updateProjectionMatrix();
  console.log(this.controls.cameraStates);
};

BBoxCreator.prototype.__step0MouseDown = function (event) {
  this.__mouseDown = true;
  this.__updateMouse(event);
  var supportObjects = (this.scene.supportObjects) ? this.scene.supportObjects : this.scene.selectables;
  var intersects = this.picker.getIntersected(this.__mouse.x, this.__mouse.y, this.camera, supportObjects);
  if (intersects.length) {
    this.__supportParent = intersects[0].object;
    this.__prevMouse3D.copy(intersects[0].point);
    this.__step0info.origin = this.__prevMouse3D;
    this.__step0info.origin.y += 0.05;
  }
  this.Publish('BBoxStarted', event);
};

BBoxCreator.prototype.__step0MouseMove = function (event) {
  if (this.__mouseDown) {
    this.__updateMouse(event);

    var planeGeo = new THREE.PlaneBufferGeometry(10000, 10000);
    var material = new THREE.MeshBasicMaterial({ color: 'red', side: THREE.DoubleSide });
    var mesh = new THREE.Mesh(planeGeo, material);
    mesh.rotateX(Math.PI / 2);
    mesh.position.copy(this.__step0info.origin);
    mesh.updateMatrixWorld();

    var intersects = this.picker.getIntersected(this.__mouse.x, this.__mouse.y, this.camera, [mesh]);
    if (intersects.length) {//TODO: figure out what happens if fails
      this.__mouse3D.copy(intersects[0].point);
      var endpoint = this.__mouse3D.clone();
      // endpoint.y = this.__step0info.origin.y;
      this.__step0info.updateArrow(endpoint, this.scene);
      this.width = this.__step0info.length;
      if (this.debug) {
        console.log('width: ' + this.width);
      }
    }
  }
};

BBoxCreator.prototype.__step0MouseUp = function (event) {
  this.__mouseDown = false;
  this.__currstep++;
  $('#contextQueryToolHelp').css('visibility','hidden');
  if (this.autoAdjustCamera) {
    this.placeCamera();
  }
};

BBoxCreator.prototype.__step1MouseMove = function (event) {
  this.__step1info.origin = this.__step0info.end;
  this.__updateMouse(event);

  if (!this.__projectionPlaneStep1) {
    // Create projection plane
    var planeGeo = new THREE.PlaneBufferGeometry(10000, 10000);
    var material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: 'red' });
    this.__projectionPlaneStep1 = new THREE.Mesh(planeGeo, material);
    this.__projectionPlaneStep1.rotateX(Math.PI / 2);
  }
  this.__projectionPlaneStep1.position.copy(this.__step1info.end);
  this.__projectionPlaneStep1.updateMatrixWorld();

  var intersects = this.picker.getIntersected(this.__mouse.x, this.__mouse.y, this.camera, [this.__projectionPlaneStep1]);
  if (intersects.length) {
    this.__mouse3D.copy(intersects[0].point);

    var orthogDir = new THREE.Vector3();
    orthogDir.crossVectors(this.__step0info.dir,new THREE.Vector3(0,1,0));
    var vec = this.__mouse3D.clone().sub(this.__step1info.origin);
    vec.projectOnVector(orthogDir);
    vec.add(this.__step1info.origin);

    this.__step1info.updateArrow(vec,this.scene);
    this.depth = this.__step1info.length;
    if (this.debug) {
      console.log('Depth: ' + this.depth);
    }
    this.displayBox();
  }
};

BBoxCreator.prototype.__step1MouseDown = function (event) {
  this.__mouseDown = true;
};

BBoxCreator.prototype.__step1MouseUp = function (event) {
  this.__mouseDown = false;
  this.__currstep++;
};

BBoxCreator.prototype.__step2MouseMove = function (event) {
  this.__step2info.origin = this.__step1info.end;
  this.__updateMouse(event);

  if (!this.__projectionPlaneStep2) {
    // Create projection plane
    var planeGeo = new THREE.PlaneBufferGeometry(10000,10000);
    var material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: 'red', opacity: 0.2 });
    this.__projectionPlaneStep2 = new THREE.Mesh(planeGeo,material);
  }
  var lookat = this.camera.position.clone();
  lookat.y = 0;
  this.__projectionPlaneStep2.lookAt(lookat);
  this.__projectionPlaneStep2.position.copy(this.__step2info.origin);
  this.__projectionPlaneStep2.updateMatrixWorld();

  var intersects = this.picker.getIntersected(this.__mouse.x, this.__mouse.y, this.camera, [this.__projectionPlaneStep2]);
  if (intersects.length) {
    this.__mouse3D.copy(intersects[0].point);
    var endpoint = this.__mouse3D.clone();
    endpoint.x = this.__step2info.origin.x;
    endpoint.z = this.__step2info.origin.z;
    this.__step2info.updateArrow(endpoint,this.scene);
    this.height = this.__step2info.length;
    if (this.debug) {
      console.log('height: ' + this.height);
    }
    this.displayBox();
  }
};

BBoxCreator.prototype.__step2MouseDown = function (event) {
  this.__mouseDown = false;
};

BBoxCreator.prototype.__step2MouseUp = function (event) {
  this.__mouseDown = false;
  this.__currstep++;

  this.scene.remove(this.__step0info.arrow);
  this.scene.remove(this.__step1info.arrow);
  this.scene.remove(this.__step2info.arrow);

  // BBox is finished!!!
  this.displayBox();

  this.placementInfo = {
    position: this.__bottomFaceCenter,
    yRotation: this.__yRotation,
    attachmentIndex: Constants.BBoxFaceCenters.BOTTOM,
    supportParent: this.__supportParent
  };

  this.controls.enabled = true;
  this.container.style.cursor = 'initial';

  if (this.autoAdjustCamera && this.savedCameraState) {
    this.controls.restoreCameraState(this.savedCameraState);
    this.savedCameraState = null;
  }
  this.Publish('BBoxCompleted');
};

function adjustArrowMaterial(arrow) {
  // Make sure arrow is visible
  arrow.line.material.depthTest = false;
  arrow.line.material.depthWrite = false;
  arrow.cone.material.depthTest = false;
  arrow.cone.material.depthWrite = false;
}

BBoxCreator.prototype.displayBox = function () {
  this.scene.remove(this.__frontArrow);
  this.scene.remove(this.__boxMesh);

  var boxGeo = new THREE.BoxGeometry(this.width,this.height,this.depth);
  var material = new THREE.MeshBasicMaterial({ color: this.__boxColor,wireframe: true,side: THREE.DoubleSide });
  this.__boxMesh = new THREE.Mesh(boxGeo,material);

  var xDir = new THREE.Vector3(1,0,0);
  this.__yRotation = xDir.angleTo(this.__step0info.dir);
  var angleEndpoint = this.__step0info.end.clone().sub(this.__step0info.origin);
  this.__yRotation = (angleEndpoint.z < 0) ? this.__yRotation : -this.__yRotation;
  this.__boxMesh.rotateOnAxis(new THREE.Vector3(0,1,0), this.__yRotation);

  var basePosition = new THREE.Vector3();
  var step0Vector = this.__step0info.dir.clone().multiplyScalar(this.__step0info.length / 2);
  basePosition.addVectors(this.__step0info.origin,step0Vector);
  basePosition.add(this.__step1info.dir.clone().multiplyScalar(this.__step1info.length / 2));

  this.__bottomFaceCenter = basePosition;

  //Front-orientation arrow
  var dir = this.__step1info.dir.clone().multiplyScalar(-1);
  var origin = basePosition;
  var length = this.depth / 1.8;
  var headWidth = this.width * 0.15;
  var headLength = this.depth * 0.2;
  this.__frontArrow = new MeshHelpers.FatArrow(dir,origin,length,this.width * 0.05,headLength,headWidth,this.__frontArrowColor);
  adjustArrowMaterial(this.__frontArrow);

  this.scene.add(this.__frontArrow);
  this.scene.add(this.__boxMesh);
  if (this.__step2info.end.y > this.__step1info.end.y) {
    Object3DUtil.placeObject3DByBBFaceCenter(this.__boxMesh, basePosition, Constants.BBoxFaceCenters.BOTTOM);
  } else {
    Object3DUtil.placeObject3DByBBFaceCenter(this.__boxMesh, basePosition, Constants.BBoxFaceCenters.TOP);
  }

  this.__boxMesh.updateMatrix();
  this.__boxMesh.updateMatrixWorld();
};

BBoxCreator.prototype.getBoxCorners = function () {
  var corners = this.__boxMesh.geometry.vertices.map(function (v) {
    var position = v.clone();
    return position.applyMatrix4(this.__boxMesh.matrixWorld);
  }.bind(this));

  return corners;
};

BBoxCreator.prototype.getOBB = function () {
  // Returns OBB representing this bbox
  var position = this.__boxMesh.getWorldPosition(new THREE.Vector3());
  var radius = new THREE.Vector3(this.width, this.height, this.depth);
  var quaternion = this.__boxMesh.getWorldQuaternion(new THREE.Quaternion());
  var obb = new OBB({ centroid: position, radius: radius, quaternion: quaternion });
  console.log(obb);
  return obb;
};

BBoxCreator.prototype.__updateMouse = function (event) {
  var rect = this.container.getBoundingClientRect();
  this.__mouse.x = ((event.clientX - rect.left) / this.container.clientWidth) * 2 - 1;
  this.__mouse.y = -((event.clientY - rect.top) / this.container.clientHeight) * 2 + 1;
};

function StepInfo(step, color, origin, dir, length, end, arrow) {
  this.step = step;
  this.color = color ? color : 'purple';
  this.origin = origin ? origin : new THREE.Vector3();
  this.dir = dir ? dir : new THREE.Vector3();
  this.length = length ? length : 0;
  this.end = end ? end : new THREE.Vector3();
  this.arrow = arrow ? arrow : null;
}

StepInfo.prototype.updateArrow = function (endpoint, scene) {
  var diff = endpoint.clone().sub(this.origin);
  this.dir = diff.clone().normalize();
  this.length = diff.length();
  this.end = endpoint.clone();
  if (!this.arrow) {
    var arrowHelper = new MeshHelpers.FatArrow(
      this.dir,
      this.origin,
      this.length,
      5,
      undefined,
      undefined,
      this.color);
    adjustArrowMaterial(arrowHelper);

    scene.add(arrowHelper);
    this.arrow = arrowHelper;
  } else {
    this.arrow.setDirection(this.dir);
    this.arrow.setLength(this.length, 5);
  }
};

module.exports = BBoxCreator;
