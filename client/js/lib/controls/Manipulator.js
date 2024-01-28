'use strict';

var Constants = require('Constants');
var PubSub = require('PubSub');
var HighlightControls = require('controls/HighlightControls');
var UILog = require('editor/UILog');
var Object3DUtil = require('geo/Object3DUtil');
var MatrixUtil = require('math/MatrixUtil');

/**
 * Controls for rotating and scaling an object
 * @param params
 * @param params.scene {scene.SceneState} Scene to show manipulator in
 * @param params.picker {controls.Picker} Picker to use
 * @param params.container {jQuery} Container to for converting mouse coordinates into scene coordinates
 * @param params.camera {THREE.Camera} Camera
 * @param params.controls {{ enabled: boolean}} Controls to disable to manipulator is active
 * @param params.uilog {editor.UILog}
 * @param [params.useModelBase=false] {boolean}
 * @param [params.allowRotation=true] {boolean}
 * @param [params.allowScaling=true] {boolean}
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
  this.useModelBase = params.useModelBase;  // attachment point is baked in to model base, mostly working?
  this.useModelOBB = params.useModelOBB;  // whether to use model obb for manipulator plane
  this.imagesDir = Constants.manipulatorImagesDir;
  this.enabled = true;
  this.allowRotation = (params.allowRotation !== undefined) ? params.allowRotation : true;
  this.allowScaling = (params.allowScaling !== undefined) ? params.allowScaling : true;
  this.position = new THREE.Vector3();

  //The following fields change according to which object has been clicked
  this.modelInstance = null;
  this.scaleTile = null;
  this.rotationCircle = null;
  this.manipulatorPlane = null; //NOTE: Invisible manipulator plane is used to determine points for mouse scale/rotation
  this.scaleTileOffsetAmount = 0.002*Constants.metersToVirtualUnit;
  this.rotationCircleOffsetAmount = 0.003*Constants.metersToVirtualUnit;
  this.manipulatorPlaneSize = 100*Constants.metersToVirtualUnit;

  this.scaleTileColor = new THREE.Color('#00a6ed');
  this.scaleTileHighlightColor = new THREE.Color('cyan');

  this.rotationCircleColor = new THREE.Color('orange');
  this.rotationCircleHighlightColor = new THREE.Color('yellow');

  //Used for mouse scaling/rotation
  this.componentClicked = null; //component clicked is the part of the manipulator clicked on mouseDown

  this.active = false; //true when connector is connected to a modelInstance

  // Assumes that the manipulator is attached on the bottom face
  this.setAttachmentFace(Constants.BBoxFaceCenters.BOTTOM);

  this.highlightControls = this.createHighlightControls();
  //this.axes = new MeshHelpers.FatAxes(100, 10);

  this.controlsEnabled = null; // Used to preserve initial state of orbit control.

  this.manipulatorSizeMultiplier = (params.manipulatorSizeMultiplier !== undefined) ? params.manipulatorSizeMultiplier : 1.0;
  this.limitRotationsToAxis = (params.manipulatorFixedRotationAxis !== undefined) ? params.manipulatorFixedRotationAxis: undefined;
};

Manipulator.prototype.setAttachmentFace = function (faceIndex, faceNormal) {
  var scope = this;
  function rotateMesh(m) {
    if (m) {
      m.rotation.set(0, 0, 0);
      if (scope.__quaternion) {
        m.quaternion.copy(scope.__quaternion);
      }
    }
  }

  this.attachmentFace = faceIndex;
  if (this.useModelOBB && faceNormal) {
    this.manipulatorPlaneNormal = faceNormal.clone();
    this.manipulatorPlaneDir = (this.attachmentFace === Constants.BBoxFaces.BOTTOM || this.attachmentFace === Constants.BBoxFaces.TOP)?
      Constants.worldFront : Constants.worldUp;
  } else {
    this.manipulatorPlaneNormal = Object3DUtil.InNormals[this.attachmentFace];
    this.manipulatorPlaneDir = (this.attachmentFace === Constants.BBoxFaces.BOTTOM || this.attachmentFace === Constants.BBoxFaces.TOP)?
      Constants.worldFront : Constants.worldUp;
  }
  this.__quaternion = MatrixUtil.getAlignmentQuaternion(new THREE.Vector3(0,0,1), new THREE.Vector3(0,1,0),
    this.manipulatorPlaneNormal, this.manipulatorPlaneDir);
  this.scaleTileOffset = this.manipulatorPlaneNormal.clone().multiplyScalar(this.scaleTileOffsetAmount);
  this.rotationCircleOffset = this.manipulatorPlaneNormal.clone().multiplyScalar(this.rotationCircleOffsetAmount);
  rotateMesh(this.manipulatorPlane);
  rotateMesh(this.scaleTile);
  rotateMesh(this.rotationCircle);
  this.update();
};

Manipulator.prototype.getModelBBox = function () {
  var bbox = this.modelInstance.getBBox();
  return bbox;
};

//getModelBase() computes the center of the bottom face of the object's BBox
Manipulator.prototype.getModelBase = function () {
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

//getTileDimension computes the size that tile should be
Manipulator.prototype.getTileDimension = function (extra) {
  var bbox = this.getModelBBox();
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
  return (maxDim + extra * r)*this.manipulatorSizeMultiplier;
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

  var circleRad = this.getTileDimension( 0.05*Constants.metersToVirtualUnit) / 2;
  var circleGeo = new THREE.RingGeometry(circleRad*0.75, circleRad*0.9, 45);
  var material = new THREE.MeshBasicMaterial({
    color: this.rotationCircleColor,
    side: THREE.DoubleSide,
    opacity: 0.95,
    transparent: true,
    alphaTest: 0.5
  });
  var circleMesh = new THREE.Mesh(circleGeo, material);
  circleMesh.name = 'ManipulatorRotate';

  if (this.__quaternion) {
    circleMesh.quaternion.copy(this.__quaternion);
  }
  circleMesh.position.copy(this.position);
  circleMesh.position.add(this.rotationCircleOffset); //so circle doesn't clash with other meshes under object
  circleMesh.updateMatrix();
  circleMesh.userData.isManipulator = true;
  circleMesh.userData.isRotationCircle = true;

  this.rotationCircle = circleMesh;
  this.scene.add(circleMesh);
  this.scene.pickables.push(circleMesh);
};

Manipulator.prototype.__createArrowShape = function(lineLength, lineWidth, arrowLength, arrowWidth) {
  arrowLength = arrowLength || lineLength / Math.sqrt(2);
  arrowWidth = arrowWidth || lineLength / 5;
  lineWidth = lineWidth || lineLength / 3;
  var halfLineWidthSqrt2 = 0.5 * lineWidth / Math.sqrt(2);
  var lineLengthSqrt2 = lineLength / Math.sqrt(2);
  var shape = new THREE.Shape();
  shape.moveTo(0,0);
  shape.lineTo(arrowLength, 0);
  shape.lineTo(arrowLength, arrowWidth);
  shape.lineTo(arrowWidth + halfLineWidthSqrt2, arrowWidth);
  shape.lineTo(lineLengthSqrt2 + halfLineWidthSqrt2, lineLengthSqrt2);
  shape.lineTo(lineLengthSqrt2, lineLengthSqrt2 + halfLineWidthSqrt2);
  shape.lineTo(arrowWidth, arrowWidth + halfLineWidthSqrt2);
  shape.lineTo(arrowWidth, arrowLength);
  shape.lineTo(0, arrowLength);
  shape.lineTo(0, 0);
  return shape;
};

Manipulator.prototype.__createArrowMesh = function(name, size, color) {
  var arrowShape = this.__createArrowShape(size*Math.sqrt(2));
  var arrowGeo = new THREE.ShapeBufferGeometry(arrowShape);

  var material = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.95,
      alphaTest: 0.5,
      side: THREE.DoubleSide
    }
  );
  var arrowMesh = new THREE.Mesh(arrowGeo, material);
  arrowMesh.name = name;
  return arrowMesh;
};

Manipulator.prototype.addScaleTile = function () {
  //console.log('Add scale tile');

  if (this.scaleTile) {
    this.removeScaleTile();
  }

  if (!this.allowScaling) return; // scaling not allowed

  var tileDim = this.getTileDimension(0.05*Constants.metersToVirtualUnit);
  var scaleTile = new THREE.Group();
  scaleTile.name = 'ManipulatorScale';
  var arrowInfos = [
    { pos: [-0.5,-0.5], rot: 0 },
    { pos: [0.5,-0.5], rot: Math.PI/2 },
    { pos: [0.5,0.5], rot: Math.PI },
    { pos: [-0.5,0.5], rot: -Math.PI/2 }
  ];
  for (var i = 0; i < arrowInfos.length; i++) {
    var arrowInfo = arrowInfos[i];
    var arrowSize = tileDim*0.17;
    var arrow = this.__createArrowMesh('ManipulatorScaleArrow' + i, arrowSize, this.scaleTileColor);
    arrow.position.set(arrowInfo.pos[0]*tileDim, arrowInfo.pos[1]*tileDim, 0);
    arrow.rotation.z = arrowInfo.rot;
    arrow.userData.isManipulator = true;
    arrow.userData.isScaleTile = true;
    scaleTile.add(arrow);
  }

  // var planeGeo = new THREE.PlaneBufferGeometry(tileDim, tileDim);
  // var material = new THREE.MeshBasicMaterial({
  //     transparent: true,
  //     alphaTest: 0.5,
  //     color: 0xFFFFFF,
  //     side: THREE.DoubleSide
  //   }
  // );
  // var planeMesh = new THREE.Mesh(planeGeo, material);
  // scaleTile.add(planeMesh);

  if (this.__quaternion) {
    scaleTile.quaternion.copy(this.__quaternion);
  }
  scaleTile.position.copy(this.position);
  scaleTile.position.add(this.scaleTileOffset); //so tile doesn't clash with other meshes under object
  scaleTile.updateMatrix();
  scaleTile.userData.isManipulator = true;
  scaleTile.userData.isScaleTile = true;

  this.scene.pickables.push(scaleTile);
  this.scaleTile = scaleTile;
  this.scene.add(scaleTile);
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
  if (this.__quaternion) {
    this.manipulatorPlane.quaternion.copy(this.__quaternion);
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
Manipulator.prototype.__getProjectedMouseLocation = function (x, y) {
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
      if (scaledBy !== undefined && scaledBy !== 1) {
        this.rotationCircle.scale.multiplyScalar(scaledBy);
      }
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
      this.scaleTile.scale.multiplyScalar(scaledBy);
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
    this.prevProjMouse = this.__getProjectedMouseLocation(mouse.x, mouse.y);
    if (intersected === undefined) {
      // Need to figure out intersected for myself
      var pickables = (this.scene.pickables) ? this.scene.pickables : this.scene.children;
      intersected = this.picker.getFirstIntersected(mouse.x, mouse.y, this.camera, pickables);
    }
    if (intersected) {
      if (intersected.object.userData.isManipulator) {
        if (this.componentClicked !== intersected.object) {
          this.componentClicked = intersected.object;
          this.interaction =  this.modelInstance.getUILogInfo();
          this.interaction['startTime'] = new Date().getTime();
          this.interaction['deltas'] = [];
          this.interaction['total'] = 0;
          this.interaction['input'] = 'manipulator';
          if (this.componentClicked === this.scaleTile) {
            this.Publish(Constants.EDIT_OPSTATE.INIT, Constants.CMDTYPE.SCALE, { object: this.modelInstance });
            this.interaction.type = UILog.EVENT.MODEL_SCALE_END;
            this.interaction['field'] = 'scaleBy';
            this.interaction['total'] = 1.0;
            this.uilog.log(UILog.EVENT.MODEL_SCALE_START, event, this.interaction);

          } else if (this.componentClicked === this.rotationCircle) {
            this.Publish(Constants.EDIT_OPSTATE.INIT, Constants.CMDTYPE.ROTATE, { object: this.modelInstance });
            this.interaction.type = UILog.EVENT.MODEL_ROTATE_END;
            this.interaction['field'] = 'rotateBy';
            this.interaction['axis'] = this.manipulatorPlaneNormal.clone();
            
            this.uilog.log(UILog.EVENT.MODEL_ROTATE_START, event, this.interaction);
          }
        }
        if (this.controls) {
          this.controlsEnabled = this.controls.enabled;
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
      this.currProjMouse = this.__getProjectedMouseLocation(mouse.x, mouse.y);

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
  var scope = this;
  return new HighlightControls({
    container: this.container,
    picker: this.picker,
    camera: this.camera,
    scene: this.scene,
    acceptCallback: function (intersected) {
      return intersected && intersected.object.userData.isManipulator;
    },
    highlightCallback: function (object3D, flag) {
      if (flag) {
        if (object3D.userData.isRotationCircle) {
          scope.highlightRotationCircle();
        } else {
          scope.highlightScaleTile();
        }
      } else {
        scope.revertMaterials();
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
  if (this.limitRotationsToAxis !== undefined) {
    axis = this.limitRotationsToAxis.clone();
  }
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

Manipulator.prototype.getRotationAxis = function() {
  const axis = (this.limitRotationsToAxis)? this.limitRotationsToAxis : this.manipulatorPlaneNormal;
  return axis.clone();
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
      this.controls.enabled = this.controlsEnabled;
    }
    return notHandled;
  }
};

/**
 * Attaches manipulator to model instance
 * @param modelInstance {model/ModelInstance}
 * @returns {boolean}
 */
Manipulator.prototype.attach = function (modelInstance) {
  return this.addManipulatorToScene(modelInstance);
};

/**
 * Detaches manipulator from any selected objects
 */
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


/**
 * Resets manipulator for a new scene
 * @param params
 * @param params.scene {scene.SceneState} Scene to show manipulator in
 * @param params.camera {THREE.Camera} Camera
 * @param params.controls {{ enabled: boolean}} Controls to disable to manipulator is active
 */
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
    this.scaleTile.traverse((mesh) => {
      if (mesh.material) {
        mesh.material.color.copy(this.scaleTileColor);
      }
    });
  }
  if (this.rotationCircle) {
    this.rotationCircle.material.color.copy(this.rotationCircleColor);
  }
};

Manipulator.prototype.highlightRotationCircle = function () {
  this.rotationCircle.material.color.copy(this.rotationCircleHighlightColor);
};

Manipulator.prototype.highlightScaleTile = function () {
  this.scaleTile.traverse((mesh) => {
    if (mesh.material) {
      mesh.material.color.copy(this.scaleTileHighlightColor);
    }
  });
};

module.exports = Manipulator;