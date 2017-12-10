'use strict';

var Constants = require('Constants');
var PubSub = require('PubSub');
var Picker = require('controls/Picker');
var HighlightControls = require('controls/HighlightControls');
var UILog = require('editor/UILog');
var MeshHelpers = require('geo/MeshHelpers');
var Object3DUtil = require('geo/Object3DUtil');
var ModelInstance = require('model/ModelInstance');
var SceneState = require('scene/SceneState');

/**
 * Controls for rotating and scaling an object
 * @param params
 * @constructor
 * @memberOf controls
 */
function Manipulator(params) {
  PubSub.call(this);
  this.init(params);
}

Manipulator.prototype = Object.create(PubSub.prototype);
Manipulator.prototype.constructor = Manipulator;

Manipulator.prototype.init = function (params) {
  //The following fields do not change after initiation
  this.scene = params.scene;
  this.picker = params.picker;
  this.container = params.container;
  this.camera = params.camera;
  this.controls = params.controls;
  this.uilog = params.uilog;
  this.useModelBase = params.useModelBase;  // attachment point is baked in to model base, NOT yet working...
  this.imagesDir = Constants.manipulatorImagesDir;
  this.enabled = true;
  this.allowRotation = (params.allowRotation !== undefined) ? params.allowRotation : true;
  this.allowScaling = (params.allowScaling !== undefined) ? params.allowScaling : true;
  this.position = new THREE.Vector3();

  //The following fields change according to which object has been clicked
  this.modelInstance = null;
  this.scaleTile = null;
  this.rotationCircle = null;
  this.manipulatorPlane = null;//NOTE: Invisible manipulator plane is used to determine points for mouse scale/rotation
  this.scaleTileOffsetAmount = 0.002*Constants.metersToVirtualUnit;
  this.rotationCircleOffsetAmount = 0.003*Constants.metersToVirtualUnit;
  this.manipulatorPlaneSize = 100*Constants.metersToVirtualUnit;

  this.scaleTileTexture = Object3DUtil.loadTexture(this.imagesDir + '/scaleManipulator.png', THREE.UVMapping);
  this.rotationCircleTexture = Object3DUtil.loadTexture(this.imagesDir + '/rotationManipulator.png', THREE.UVMapping);

  this.scaleTileHighlightTexture = Object3DUtil.loadTexture(this.imagesDir + '/scaleManipulator_highlighted.png', THREE.UVMapping);
  this.rotationCircleHighlightTexture = Object3DUtil.loadTexture(this.imagesDir + '/rotationManipulator_highlighted.png', THREE.UVMapping);

  //Used for mouse scaling/rotation
  this.componentClicked = null; //component clicked is the part of the manipulator clicked on mouseDown

  this.active = false; //true when connector is connected to a modelInstance

  // Assumes that the manipulator is attached on the bottom face
  this.setAttachmentFace(Constants.BBoxFaceCenters.BOTTOM);

  this.highlightControls = this.createHighlightControls();
  //this.axes = new MeshHelpers.FatAxes(100, 10);
};

Manipulator.prototype.setAttachmentFace = function (faceIndex) {
  var scope = this;
  function rotateMesh(m) {
    if (m) {
      m.rotation.set(0, 0, 0);
      if (scope.rotatePlane) {
        m.setRotationFromAxisAngle(scope.rotatePlane.axis, scope.rotatePlane.angle);
      }
    }
  }

  this.attachmentFace = faceIndex;
  this.manipulatorPlaneNormal = Object3DUtil.InNormals[this.attachmentFace];
  this.scaleTileOffset = this.manipulatorPlaneNormal.clone().multiplyScalar(this.scaleTileOffsetAmount);
  this.rotationCircleOffset = this.manipulatorPlaneNormal.clone().multiplyScalar(this.rotationCircleOffsetAmount);
  // X (YZ plane) - rotateY
  // Y (XZ plane) - rotateX
  // Z (XY plane) - default
  this.rotatePlane = Object3DUtil.PlaneToFaceRotationParams[this.attachmentFace];
  rotateMesh(this.manipulatorPlane);
  rotateMesh(this.scaleTile);
  rotateMesh(this.rotationCircle);
  this.update();
};

//getModelBase() computes the center of the bottom face of the object's BBox
Manipulator.prototype.getModelBase = function () {
  if (this.useModelBase) {
    var attachmentPoint = this.modelInstance.getAttachmentPointWorld();
    if (attachmentPoint) {
      return attachmentPoint;
    }
  }
  var bbox = this.modelInstance.getBBox();
  var faceCenters = bbox.getFaceCenters();
  var attachmentFaceCenter = faceCenters[this.attachmentFace];
  return attachmentFaceCenter;
};

//getTileDimension computes the size that tile should be
Manipulator.prototype.getTileDimension = function (extra) {
  var bbox = this.modelInstance.getBBox();
  var allFaceDims = bbox.getFaceDims();
  var attachmentFaceDims = allFaceDims[this.attachmentFace];
  var maxDim = Math.max(attachmentFaceDims.x, attachmentFaceDims.y);
  // Use distance from camera to ensure minimum size of manipulator (based on screen pixels)
  // NOTE: This fails badly if the object is not within the scene (manipulator could be huge!)
  var closest = bbox.closestBoundaryPoint(this.camera.position);
  var dist = closest.distanceTo(this.camera.position);
  var c = new THREE.Vector2(this.container.clientWidth, this.container.clientHeight);
  var v = Object3DUtil.getVisibleWidthHeight(this.camera, dist);
  var r = v.length() / c.length();
  return maxDim + extra * r;
};

//Insert components of the manipulator under the object
Manipulator.prototype.addManipulatorToScene = function (modelInstance) {
  if (this.enabled) {
    this.modelInstance = modelInstance;
    this.active = true;
    // ASSUME attachment at bottom for now
    // TODO: get attachment from modelInstance
    this.position.copy(this.getModelBase());
    this.addScaleTile();
    this.addRotationCircle();
    this.addManipulatorPlane();
    var attachmentIndex = this.modelInstance.object3D.userData['childWorldBBFaceIndex'];
    if (attachmentIndex == undefined) { attachmentIndex = Constants.BBoxFaces.BOTTOM; }
    this.setAttachmentFace(attachmentIndex);
    if (this.axes) {
      this.axes.attach(modelInstance.object3D);
      if (this.axes.parent !== this.scene) {
        this.scene.add(this.axes);
      }
    }
    return true;
  } else {
    return false;
  }
};

Manipulator.prototype.addRotationCircle = function () {
  //console.log('Add rotation circle');
  if (this.rotationCircle) {
    this.removeRotationCircle();
  }

  if (!this.allowRotation) return; // rotation not allowed

  var circleRad = this.getTileDimension(50) / 2;
  var circleGeo = new THREE.CircleGeometry(circleRad, 20);
  var material = new THREE.MeshBasicMaterial({
    map: this.rotationCircleTexture,
    //color: new THREE.Color("green"),
    side: THREE.DoubleSide,
    opacity: 0.95,
    transparent: true,
    alphaTest: 0.5
  });
  var circleMesh = new THREE.Mesh(circleGeo, material);
  circleMesh.name = 'ManipulatorRotate';

  //Object3DUtil.rescaleObject3D(circleMesh, 1.1);
  if (this.rotatePlane) {
    circleMesh.setRotationFromAxisAngle(this.rotatePlane.axis, this.rotatePlane.angle);
  }
  circleMesh.position.copy(this.position);
  circleMesh.position.add(this.rotationCircleOffset); //so circle doesn't clash with other meshes under object
  circleMesh.updateMatrix();
  circleMesh.userData = this;

  this.rotationCircle = circleMesh;
  this.scene.add(circleMesh);
  this.scene.pickables.push(circleMesh);
};

Manipulator.prototype.addScaleTile = function () {
  //console.log('Add scale tile');

  if (this.scaleTile) {
    this.removeScaleTile();
  }

  if (!this.allowScaling) return; // scaling not allowed

  var tileDim = this.getTileDimension(50);
  var planeGeo = new THREE.PlaneBufferGeometry(tileDim, tileDim);

  var material = new THREE.MeshBasicMaterial({
      map: this.scaleTileTexture,
      transparent: true,
      alphaTest: 0.5,
      color: 0xFFFFFF,
      side: THREE.DoubleSide
    }
  );
  var planeMesh = new THREE.Mesh(planeGeo, material);
  planeMesh.name = 'ManipulatorScale';

  //Object3DUtil.rescaleObject3D(planeMesh, 1.4);
  if (this.rotatePlane) {
    planeMesh.setRotationFromAxisAngle(this.rotatePlane.axis, this.rotatePlane.angle);
  }
  planeMesh.position.copy(this.position);
  planeMesh.position.add(this.scaleTileOffset); //so tile doesn't clash with other meshes under object
  planeMesh.updateMatrix();
  planeMesh.userData = this;

  this.scene.pickables.push(planeMesh);
  this.scaleTile = planeMesh;
  this.scene.add(planeMesh);
};

Manipulator.prototype.addManipulatorPlane = function () {
  if (!this.manipulatorPlane) {
    //console.log('Create manipulator plane');
    var planeGeo = new THREE.PlaneBufferGeometry(this.manipulatorPlaneSize, this.manipulatorPlaneSize);
    // NOTE: Starting from THREE.js r72, we need to make the material not visible
    //       so the object is not displayed, but still intersectable by the RayCaster
    var material = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, visible: false });
    this.manipulatorPlane = new THREE.Mesh(planeGeo, material);
    this.manipulatorPlane.name = 'ManipulatorPlane';
  }
  this.manipulatorPlane.rotation.set(0, 0, 0);
  if (this.rotatePlane) {
    this.manipulatorPlane.setRotationFromAxisAngle(this.rotatePlane.axis, this.rotatePlane.angle);
  }
  this.manipulatorPlane.position.copy(this.position);
  this.manipulatorPlane.position.add(this.scaleTileOffset); //so tile doesn't clash with other meshes under object
  this.manipulatorPlane.updateMatrix();
  if (this.manipulatorPlane.parent !== this.scene) {
    this.scene.add(this.manipulatorPlane);
  }
};

/* getProjectedMouseLocation() returns the world position of the mouse as projected
 onto the plane of the manipulator.  This location is used for scaling/rotation via
 mouse interaction
 */
Manipulator.prototype.getProjectedMouseLocation = function (x, y) {
  var proj2DIntersects = this.picker.getIntersected(x, y, this.camera, [this.manipulatorPlane]);
  if (proj2DIntersects.length > 0) {
    return proj2DIntersects[0].point;
  }
  return null;
};

/*
 updateRotationCircle() is called when object is scaled to ensure
 that the manipulator matches the object
 */
Manipulator.prototype.updateRotationCircle = function (scaledBy, rotatedBy) {
  if (this.rotationCircle) {
    if ((rotatedBy !== undefined && rotatedBy !== 0) || (scaledBy !== undefined && scaledBy !== 1)) {
      this.rotationCircle.position.set(0, 0, 0);
      var obj = this.rotationCircle;
      obj.scale.x = obj.scale.x * scaledBy;
      obj.scale.y = obj.scale.y * scaledBy;
      obj.scale.z = obj.scale.z * scaledBy;
      this.rotationCircle.rotateZ(-rotatedBy);
    }
    this.rotationCircle.position.copy(this.position);
    this.rotationCircle.position.add(this.rotationCircleOffset);
    this.rotationCircle.updateMatrixWorld();
    Object3DUtil.clearCache(this.rotationCircle);
  }
};

/*
 updateScaleTile() is called when object is scaled to ensure
 that the manipulator matches the object
 */
Manipulator.prototype.updateScaleTile = function (scaledBy) {
  if (this.scaleTile) {
    if (scaledBy !== undefined && scaledBy !== 1) {
      this.scaleTile.position.set(0, 0, 0);
      var obj = this.scaleTile;
      obj.scale.x = obj.scale.x * scaledBy;
      obj.scale.y = obj.scale.y * scaledBy;
      obj.scale.z = obj.scale.z * scaledBy;
    }
    this.scaleTile.position.copy(this.position);
    this.scaleTile.position.add(this.scaleTileOffset);
    this.scaleTile.updateMatrixWorld();
    Object3DUtil.clearCache(this.scaleTile);
  }
};

Manipulator.prototype.update = function () {
  if (this.active) {
    this.position.copy(this.getModelBase());
    this.updateScaleTile();
    this.updateRotationCircle();
    if (this.axes) {
      this.axes.update();
    }
    if (!this.componentClicked) {
      this.manipulatorPlane.position.copy(this.position);
      this.manipulatorPlane.position.add(this.scaleTileOffset); //so tile doesn't clash with other meshes under object
    }
  }
};

// Handles onMouseDown event
// The intersected object is optionally passed in if raytracing was performed before hand
Manipulator.prototype.onMouseDown = function (event, intersected) {
  event.preventDefault();
  this.mouseDown = true;
  if (this.active) {
    var mouse = this.picker.getCoordinates(this.container, event);
    this.prevProjMouse = this.getProjectedMouseLocation(mouse.x, mouse.y);
    if (intersected === undefined) {
      // Need to figure out intersected for myself
      var pickables = (this.scene.pickables) ? this.scene.pickables : this.scene.children;
      intersected = this.picker.getFirstIntersected(mouse.x, mouse.y, this.camera, pickables);
    }
    if (intersected) {
      if (intersected.object.userData instanceof Manipulator) {
        if (this.componentClicked !== intersected.object) {
          this.componentClicked = intersected.object;
          this.interaction =  this.modelInstance.getUILogInfo();
          this.interaction['startTime'] = new Date().getTime();
          this.interaction['deltas'] = [];
          this.interaction['total'] = 0;
          this.interaction['input'] = 'manipulator';
          if (this.componentClicked === this.scaleTile) {
            this.Publish(Constants.EDIT_OPSTATE.INIT, Constants.CMDTYPE.SCALE, { object: this.modelInstance });
            this.interaction.type = UILog.EVENT.MODEL_SCALE;
            this.interaction['field'] = 'scaleBy';
          } else if (this.componentClicked === this.rotationCircle) {
            this.Publish(Constants.EDIT_OPSTATE.INIT, Constants.CMDTYPE.ROTATE, { object: this.modelInstance });
            this.interaction.type = UILog.EVENT.MODEL_ROTATE;
            this.interaction['field'] = 'rotateBy';
            this.interaction['axis'] = this.manipulatorPlaneNormal.clone();
          }
        }
        if (this.controls) {
          this.controls.enabled = false;
        }
        return false;
      }
    }
  }
  return true;
};

Manipulator.prototype.onMouseMove = function (event) {
  var notHandled = true;
  if (this.active) {
    if (this.mouseDown) {
    } else {
      this.highlightControls.onMouseMove(event);
    }
    if (this.componentClicked) {
      var mouse = this.picker.getCoordinates(this.container, event);
      this.currProjMouse = this.getProjectedMouseLocation(mouse.x, mouse.y);

      if (this.prevProjMouse && this.currProjMouse) {
        if (this.componentClicked === this.scaleTile) {
          //SCALING
          var scaledBy = this.handleMouseScaling();
          this.updateScaleTile(scaledBy);
          this.updateRotationCircle(scaledBy, 0);
          // Accumulate deltas
          this.interaction['deltas'].push(scaledBy);
          this.interaction['total'] *= scaledBy;
        } else if (this.componentClicked === this.rotationCircle) {
          //ROTATION
          var rotatedBy = this.handleMouseRotation();
          this.updateRotationCircle(1, rotatedBy);
          // Accumulate deltas
          this.interaction['deltas'].push(rotatedBy);
          this.interaction['total'] += rotatedBy;
        }
        notHandled = false;
      }
    }
    this.prevProjMouse = this.currProjMouse;
  }
  return notHandled;
};

Manipulator.prototype.setVisible = function (flag) {
  if (this.active) {
    this.rotationCircle.visible = flag;
    this.scaleTile.visible = flag;
  }
};

Manipulator.prototype.createHighlightControls = function () {
  return new HighlightControls({
    container: this.container,
    picker: this.picker,
    camera: this.camera,
    scene: this.scene,
    acceptCallback: function (intersected) {
      return intersected.object.userData instanceof Manipulator;
    },
    highlightCallback: function (object3D, flag) {
      if (flag) {
        if (object3D.geometry instanceof THREE.CircleGeometry) {
          object3D.userData.highlightRotationCircle();
        } else {
          object3D.userData.highlightScaleTile();
        }
      } else {
        object3D.userData.revertMaterials();
      }
    }
  });
};

Manipulator.prototype.getAttachmentFace = function() {
  if (this.useModelBase) {
    // No need to specify attachmentFace
    return undefined;
  } else {
    return this.attachmentFace;
  }
};

Manipulator.prototype.handleMouseScaling = function () {
  // //TODO: consider factoring out this code elsewhere
  var basePoint = this.getModelBase();
  var attachmentFace = this.getAttachmentFace();

  var currDistance = this.currProjMouse.distanceTo(basePoint);
  var prevDistance = this.prevProjMouse.distanceTo(basePoint);

  var scale = currDistance / prevDistance;
  this.modelInstance.scaleBy(scale, attachmentFace);
  return scale;
};

Manipulator.prototype.handleMouseRotation = function () {
  //console.time('rotate');
  var attachmentFace = this.getAttachmentFace();

  var prevProjMouse = this.prevProjMouse.clone();
  var currProjMouse = this.currProjMouse.clone();
  var modelBase = this.getModelBase();
  var prevRadialVector = prevProjMouse.sub(modelBase).normalize();
  var currRadialVector = currProjMouse.sub(modelBase).normalize();
  var dot = prevRadialVector.dot(currRadialVector);
  var angle = Math.acos(dot);
  if (!isFinite(angle) || angle <= 0.01) {
    if (!isFinite(angle)) {
      console.log('skipping: angle=' + angle + ', dot=' + dot);
    }
    // Don't do anything if angle very small
    return 0.0;
  }

  var cross = prevRadialVector.cross(currRadialVector);
  if (cross.dot(this.manipulatorPlaneNormal) < 0) {
    angle = -angle;
  }
  var axis = this.manipulatorPlaneNormal.clone();
  //var object = this.modelInstance.object3D;
  //var oldParent = object.parent;

  //THE FOLLOWING WORKS BUT IS SLOW
  //Object3DUtil.detachFromParent(this.modelInstance.object3D, this.scene);
  if (attachmentFace != undefined) {
    this.modelInstance.rotateWrtBBFace(axis, angle, attachmentFace);
  } else {
    this.modelInstance.rotateAboutAxisSimple(axis, angle, true);
  }
  //Object3DUtil.attachToParent(this.modelInstance.object3D, oldParent);
  //console.timeEnd('rotate');
  return angle;
};

Manipulator.prototype.getRotationAxis = function(angle) {
  return this.manipulatorPlaneNormal.clone();
};

Manipulator.prototype.onMouseLeave = function (event) {
  this.__manipulationDone(event);
};

Manipulator.prototype.onMouseUp = function (event) {
  event.preventDefault();
  return this.__manipulationDone(event);
};

Manipulator.prototype.__manipulationDone = function(event) {
  if (this.active) {
    var notHandled = true;
    this.updateScaleTile(1);
    this.updateRotationCircle(1, 0);
    if (this.componentClicked) {
      // log interaction
      if (this.interaction) {
        var interactionType = this.interaction.type;
        delete this.interaction.type;
        this.uilog.log(interactionType, event, this.interaction);
        delete this.interaction;
      }
      if (this.componentClicked === this.scaleTile) {
        this.Publish(Constants.EDIT_OPSTATE.DONE, Constants.CMDTYPE.SCALE, { object: this.modelInstance });
      } else if (this.componentClicked === this.rotationCircle) {
        this.Publish(Constants.EDIT_OPSTATE.DONE, Constants.CMDTYPE.ROTATE, { object: this.modelInstance });
      }
      notHandled = false;
    }
    this.componentClicked = null;
    this.mouseDown = false;
    if (this.controls) {
      this.controls.enabled = true;
    }
    return notHandled;
  }
};

Manipulator.prototype.attach = function (modelInstance) {
  return this.addManipulatorToScene(modelInstance);
};

Manipulator.prototype.detach = function () {
  if (this.axes) {
    this.axes.detach();
    if (this.axes.parent === this.scene) {
      this.scene.remove(this.axes);
    }
  }
  this.removeRotationCircle();
  this.removeScaleTile();
  this.removeManipulatorPlane();
  this.modelInstance = null;
  this.active = false;
  this.componentClicked = null;
};

Manipulator.prototype.reset = function (params) {
  if (params) {
    this.camera = params.camera;
    this.scene = params.scene;
    this.controls = params.controls;
    this.highlightControls = this.createHighlightControls();
  }
  this.detach();
};

Manipulator.prototype.removeRotationCircle = function () {
  if (!this.rotationCircle) return;
  this.scene.remove(this.rotationCircle);
  var index = this.scene.pickables.indexOf(this.rotationCircle);
  if (index >= 0) {
    this.scene.pickables.splice(index, 1);
  }
  this.rotationCircle = null;
};

Manipulator.prototype.removeScaleTile = function (clear) {
  if (!this.scaleTile) return;
  this.scene.remove(this.scaleTile);
  var index = this.scene.pickables.indexOf(this.scaleTile);
  if (index >= 0) {
    this.scene.pickables.splice(index, 1);
  }
  this.scaleTile = null;
};

Manipulator.prototype.removeManipulatorPlane = function (clear) {
  if (!this.manipulatorPlane) return;
  this.scene.remove(this.manipulatorPlane);
  if (clear) this.manipulatorPlane = null;
};

Manipulator.prototype.revertMaterials = function () {
  if (this.scaleTile) {
    this.scaleTile.material.map = this.scaleTileTexture;
  }
  if (this.rotationCircle) {
    this.rotationCircle.material.map = this.rotationCircleTexture;
  }
};

Manipulator.prototype.highlightRotationCircle = function () {
  this.rotationCircle.material.map = this.rotationCircleHighlightTexture;
};

Manipulator.prototype.highlightScaleTile = function () {
  this.scaleTile.material.map = this.scaleTileHighlightTexture;
};

module.exports = Manipulator;