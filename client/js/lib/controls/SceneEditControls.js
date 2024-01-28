'use strict';

const Constants = require('Constants');
const Manipulator = require('controls/Manipulator');
const DragDrop = require('controls/DragDrop');
const AttachmentPlaneVisualizer = require('controls/AttachmentPlaneVisualizer');
const PubSub = require('PubSub');
const Object3DUtil = require('geo/Object3DUtil');
const ModelInstance = require('model/ModelInstance');

/**
 * Combined controls for scene editing (includes movement using drag drop, and scaling/rotation via Manipulator)
 * @param params
 * @param params.enabled {boolean} If this scene edit controls is enabled
 * @param params.allowRotation {boolean} Whether to allow rotation
 * @param params.allowScaling {boolean} Whether to allow scaling
 * @param params.useVisualizer {boolean} Whether to use a visualizer
 * @param params.useThreeTransformControls {boolean} Whether to use three.js transform controls
 * @param params.putOnArchOnly {boolean} set False to allow placement of objects on other non-arch objects.
 * @param params.restrictToSurface {boolean} set True to stick the object onto currently attached surface
 * @constructor
 * @memberOf controls
 */
const SceneEditControls = function (params) {
  PubSub.call(this);

  // The app using the edit controls
  // assumes the app has the following functions
  //  onEditOpInit, onEditOpDone
  //  onSceneUpdated
  //  render
  //  scaleModels, rotateModels
  //  deleteObject
  this.app = params.app;

  this.enabled = params.enabled;
  this.allowRotation = params.allowRotation;
  this.allowScaling  = params.allowScaling;
  this.useVisualizer = params.useVisualizer;

  this.useThreeTransformControls = params.useThreeTransformControls || false;
  this.useModelBase = true;
  this.supportSurfaceChange = params.supportSurfaceChange;
  this.allowAny = params.allowAny;
  this.transformControls = null;

  // How much to rotate and scale by
  this.rotateBy = params.rotateBy || Math.PI / 32;
  this.scaleBy = params.scaleBy || 1.1;

  this.scene = params.scene;
  this.picker = params.picker;
  this.container = params.container;
  this.cameraControls = params.cameraControls;
  this.uilog = params.uilog;

  this.selected = null;

  this.dragdrop = null;
  this.manipulator = null;
  this.attachmentVisualizer = null;

  this._transformMode = 'scale';

  this.putOnArchOnly = params.putOnArchOnly;
  this.restrictToSurface = params.restrictToSurface;

  this.manipulatorSizeMultiplier = params.manipulatorSizeMultiplier;
  this.manipulatorFixedRotationAxis = params.manipulatorFixedRotationAxis;

  this.init();
};

SceneEditControls.prototype = Object.create(PubSub.prototype);
SceneEditControls.prototype.constructor = SceneEditControls;

SceneEditControls.prototype.setPutOnArchOnly = function(val) {
  this.putOnArchOnly = val;
  this.dragdrop.restrictSupportToArch = val;
};

SceneEditControls.prototype.setRestrictToSurface = function(val) {
  this.restrictToSurface = val;
  this.dragdrop.restrictMovementToPlane = val;
};

SceneEditControls.prototype.reset = function (params) {
  if (params) {
    params.camera = params.cameraControls.camera;
    params.controls = params.cameraControls.controls;

    this.scene = params.scene;
    this.cameraControls = params.cameraControls;
    if (this.transformControls) {
      this.scene.add(this.transformControls);
      this.transformControls.camera = this.cameraControls.camera;
    }
    if (this.dragdrop) {
      this.dragdrop.reset(params);
    }
    if (this.manipulator) {
      this.manipulator.reset(params);
    }
    if (this.attachmentVisualizer)  {
      this.attachmentVisualizer.reset(params);
    }
  }
  this.detach();
};

SceneEditControls.prototype.init = function () {
  this.initManipulator();
  this.initDragDrop();
  this.initVisualizer();
  this.Subscribe(Constants.EDIT_OPSTATE.INIT, this.app, this.app.onEditOpInit.bind(this.app));
  this.Subscribe(Constants.EDIT_OPSTATE.DONE, this.app, this.app.onEditOpDone.bind(this.app));
  this.Subscribe(Constants.EDIT_OPSTATE.CANCEL, this.app, this.app.onEditOpCancel.bind(this.app));
  this.Subscribe('SelectedInstanceChanged', this.app, this.app.onSelectedInstanceChanged.bind(this.app));
};

SceneEditControls.prototype.initVisualizer = function() {
  if (this.useVisualizer) {
    this.attachmentVisualizer = new AttachmentPlaneVisualizer({
      scene: this.scene,
      enabled: true,
      useModelBase: this.useModelBase
    });
  }
};

SceneEditControls.prototype.initDragDrop = function () {
  this.dragdrop = new DragDrop({
    scene: this.scene,
    picker: this.picker,
    container: this.container,
    camera: this.cameraControls.camera,
    controls: this.cameraControls.controls,
    sceneUpdatedCallback: (this.app.onSceneUpdated) ? this.app.onSceneUpdated.bind(this.app) : undefined,
    enabled: true,
    allowAny: this.allowAny,
    attachToParent: true,
    supportSurfaceChange: this.supportSurfaceChange,
    useModelBase: this.useModelBase,
    uilog: this.uilog,
    putOnArchOnly: this.putOnArchOnly
  });
  this.dragdrop.Subscribe(Constants.EDIT_OPSTATE.INIT, this.app, this.app.onEditOpInit.bind(this.app));
  this.dragdrop.Subscribe(Constants.EDIT_OPSTATE.DONE, this.app, this.app.onEditOpDone.bind(this.app));

  this.dragdrop.Subscribe('HighlightChanged', this, function(object3d, isHighlight) {
    this.Publish('HighlightChanged', object3d, isHighlight);
    // console.log({"callback": "HighlightChanged", "object3d": object3d, "isHighlight": isHighlight});
  });

  this.dragdrop.Subscribe('AttachmentChanged', this, function (attachment) {
    if (attachment && attachment.bbFaceIndex !== undefined) {
      if (this.manipulator) {
        this.manipulator.setAttachmentFace(attachment.bbFaceIndex, attachment.faceNormal);
      }
      if (this.attachmentVisualizer) {
        this.attachmentVisualizer.setAttachmentFace(attachment.bbFaceIndex, attachment.surfaceNormal);
      }
    }
  }.bind(this));
};

SceneEditControls.prototype.initManipulator = function () {
  /* A single instance of Manipulator adds and removes edit tiles
   corresponding to ModelInstances which act as an interface
   for scaling and rotating their object3Ds when a new model is clicked
   */
  this.manipulator = new Manipulator({
    scene: this.scene,
    picker: this.picker,
    container: this.container,
    camera: this.cameraControls.camera,
    controls: this.cameraControls.controls,
    useModelBase: this.useModelBase,
    uilog: this.uilog,
    allowRotation: this.allowRotation,
    allowScaling: this.allowScaling,
    manipulatorSizeMultiplier: this.manipulatorSizeMultiplier,
    manipulatorFixedRotationAxis: this.manipulatorFixedRotationAxis
  });
  this.manipulator.Subscribe(Constants.EDIT_OPSTATE.INIT, this.app, this.app.onEditOpInit.bind(this.app));
  this.manipulator.Subscribe(Constants.EDIT_OPSTATE.DONE, this.app, this.app.onEditOpDone.bind(this.app));
  this.manipulator.Subscribe(Constants.EDIT_OPSTATE.INIT, this, function () {
    this.dragdrop.enabled = false;
  });
  this.manipulator.Subscribe(Constants.EDIT_OPSTATE.DONE, this, function () {
    this.dragdrop.enabled = true;
  });
};

SceneEditControls.prototype.update = function () {
  if (this.manipulator) {
    this.manipulator.update();
  }
  if (this.attachmentVisualizer) {
    this.attachmentVisualizer.update();
  }
  // if (this.transformControls) {
  //   this.transformControls.update();
  // }
};

// Make sure transform controls are initialized
SceneEditControls.prototype.ensureTransformControls = function() {
  if (!this.transformControls) {
    this.transformControls = new THREE.TransformControls(this.cameraControls.camera, this.app.renderer.domElement);
    this.transformControls.setMode(this._transformMode);
    this.transformControls.addEventListener('change', this.app.render);
    this.scene.add(this.transformControls);
  }
};

SceneEditControls.prototype.attach = function (modelInstanceOrObject, attachmentIndex) {
  let modelInstance = (modelInstanceOrObject instanceof ModelInstance) ? modelInstanceOrObject : undefined;
  const object = modelInstanceOrObject.object3D || modelInstanceOrObject;
  if (!modelInstance) {
    modelInstance = Object3DUtil.getModelInstance(object);
  }
  if (attachmentIndex != undefined) {
    object.userData['childWorldBBFaceIndex'] = attachmentIndex;
  }
  this.selected = object;
  //this.visible = true;
  if (this.useThreeTransformControls) {
    this.ensureTransformControls();
    this.transformControls.attach(object);
  } else {
    //if (this.dragdrop) {
    //  this.dragdrop.attach(object);
    //}
    if (this.manipulator) {
      this.manipulator.attach(modelInstance);
    }
  }
  if (this.attachmentVisualizer) {
    this.attachmentVisualizer.attach(modelInstance);
  }
};

SceneEditControls.prototype.detach = function () {
  this.selected = null;
  //this.visible = false;
  if (this.dragdrop) {
    this.dragdrop.detach();
  }
  if (this.manipulator) {
    this.manipulator.detach();
  }
  if (this.attachmentVisualizer) {
    this.attachmentVisualizer.detach();
  }
  if (this.transformControls) {
    this.transformControls.detach();
  }
};

SceneEditControls.prototype.onInsert = function (object) {
  this.selected = null;
  if (this.enabled) {
    if (this.dragdrop) {
      this.dragdrop.onInsert(object);
    }
    const modelInstance = Object3DUtil.getModelInstance(object);
    this.attach(modelInstance);
    this.Publish('SelectedInstanceChanged', modelInstance);
  }
};

SceneEditControls.prototype.cancelInsertion = function () {
  let cancelled;
  if (this.enabled && this.dragdrop) {
    cancelled = this.dragdrop.cancelInsertion();
  }
  this.detach();
  this.Publish(Constants.EDIT_OPSTATE.CANCEL, Constants.CMDTYPE.INSERT, { object: cancelled });
  return cancelled;
};

SceneEditControls.prototype.setCursorStyle = function (style) {
  this.container.style.cursor = style;
  this.dragdrop.defaultCursor = style;
};

SceneEditControls.prototype.getCursorStyle = function() {
  return this.container.style.cursor;
}

SceneEditControls.prototype.onMouseUp = function (event) {
  if (this.transformControls && this.transformControls.axis) {
    // transform controls in effect...
    return;
  }
  if (this.enabled) {
    const notHandled1 = this.dragdrop.onMouseUp(event);
    const notHandled2 = this.manipulator.onMouseUp(event);
    return notHandled1 && notHandled2;
  }
};

SceneEditControls.prototype.select = function (event) {
  const fullScene = this.scene;
  const selectables = (fullScene.selectables) ? fullScene.selectables : fullScene.children;
  const picked = this.getIntersected(event, selectables);
  if (picked) {
    console.log('selected point', picked.point);
  }
  return picked? picked.object : null;
};

SceneEditControls.prototype.selectMesh = function (event) {
  const fullScene = this.scene;
  const selectables = (fullScene.selectables) ? fullScene.selectables : fullScene.children;
  const picked = this.getIntersected(event, selectables);
  if (picked) {
    console.log('selected point', picked.point);
  }
  return picked? picked.descendant : null;
};

SceneEditControls.prototype.pick = function (event) {
  const fullScene = this.scene;
  const pickables = (fullScene.pickables) ? fullScene.pickables : fullScene.children;
  const picked = this.getIntersected(event, pickables);
  return picked? picked.object : null;
};

SceneEditControls.prototype.getIntersected = function (event, object3Ds) {
  object3Ds = object3Ds || this.scene.children;
  // const mouse = this.picker.getCoordinates(this.container, event);
  // const intersects = this.picker.getIntersected(mouse.x, mouse.y, this.cameraControls.camera, object3Ds, this.dragdrop.ignore);
  // if (intersects.length > 0) {
  //   return intersects[0];
  // }
  // return null;
  const intersects = this.picker.pick({
    targetType: 'object',
    container: this.container,
    position: { clientX: event.clientX, clientY: event.clientY },
    camera: this.cameraControls.camera,
    objects: object3Ds,
    ignore: this.dragdrop.ignore,
    scene: this.scene
  });
  return intersects;
};

SceneEditControls.prototype.onMouseDown = function (event) {
  if (this.transformControls && this.transformControls.axis) {
    // transform controls in effect...
    return;
  }
  if (this.enabled) {
    event.preventDefault();

    const fullScene = this.scene;

    const pickables = (fullScene.pickables) ? fullScene.pickables : fullScene.children;
    const intersected = this.getIntersected(event, pickables);

    if (!this.dragdrop.insertMode) {
      let notHandled = this.manipulator.onMouseDown(event, intersected);
      if (!notHandled) return notHandled;

      notHandled = this.dragdrop.onMouseDown(event, intersected);
      // if(!notHandled) return notHandled;

      let modelInstance;
      let clickedObject = null;
      if (intersected) {
        modelInstance = Object3DUtil.getModelInstance(intersected.object);
        if (modelInstance && modelInstance.isDraggable) {
          clickedObject = modelInstance.object3D;
        } else if (this.allowAny) {
          clickedObject = intersected.object;
        }
      }

      // Check if selected instance changed
      if (this.selected !== clickedObject) {
        this.__selectObject(clickedObject, modelInstance);
        if (clickedObject) {
          return false;
        }
      }
      if (!notHandled) {
        return notHandled;
      }
    } else {
      return false; // Insert mode placement happens. So event handled.
    }
  }
  return true;
};

SceneEditControls.prototype.__selectObject = function(object3D, modelInstance) {
  if (object3D) {
    this.attach(modelInstance || object3D);
    this.Publish('SelectedInstanceChanged', modelInstance || object3D);
  } else {
    this.detach();
    this.Publish('SelectedInstanceChanged', null);
  }
};

SceneEditControls.prototype.highlightObject = function(object3D, flag) {
  console.log('highlightObject', object3D);
  const highlightControls = this.dragdrop.highlightControls;
  if (highlightControls) {
    if (flag) {
      highlightControls.highlight(object3D);
    } else {
      highlightControls.unhighlight(object3D);
    }
  }
};

SceneEditControls.prototype.selectObject = function(object3D) {
  this.__selectObject(object3D, object3D? Object3DUtil.getModelInstance(object3D) : null);
};

SceneEditControls.prototype.onMouseMove = function (event) {
  if (this.transformControls && this.transformControls.axis) {
    // transform controls in effect...
    this.dragdrop.clearHighlight();
    return;
  }
  if (this.enabled) {
    const notHandled1 = this.dragdrop.onMouseMove(event);
    const notHandled2 = this.manipulator.onMouseMove(event);
    // console.log("nh1 " + notHandled1.toString() + " nh2 " + notHandled2.toString());
    return (notHandled1 && notHandled2);
  }
  return true;
};

SceneEditControls.prototype.onMouseLeave = function (event) {
  if (this.enabled) {
    this.dragdrop.onMouseLeave(event);
    this.manipulator.onMouseLeave(event);
  }
};

SceneEditControls.prototype.onKeyUp = function (event) {
  // Not handled
  return true;
};

SceneEditControls.prototype.onKeyDown = function (event) {
  if (this.useThreeTransformControls) {
    const notHandled = this.handleTransformControllerKeys(event);
    if (!notHandled) return notHandled;
  }

  switch (event.which) {
    case 81:  // Q debug
      return false;
    case 117: // F6
      this.useThreeTransformControls = !this.useThreeTransformControls;
      if (this.selected) {
        const object = this.selected;
        this.detach(object);
        this.attach(object);
      }
      return false;
    case 40:  // DOWN
      if(this.allowScaling){
        return !this.scaleSelected(1.0 / this.scaleBy, event);
      }
      return false;
    case 38:  // UP
      if(this.allowScaling){
        return !this.scaleSelected(this.scaleBy, event);
      }
      return false;
    case 37:  // LEFT
      if(this.allowRotation){
        return !this.rotateSelected(this.rotateBy, event);
      }
      return false;
    case 39:  // RIGHT
      if(this.allowRotation){
        return !this.rotateSelected(-this.rotateBy, event);
      }
      return false;
    case 46: // delete
    case 8: // backspace
      return !this.deleteSelected(event);
    case 27: //escape
      const obj = this.cancelInsertion();
      if (obj) {//this part of the code is here because the editControls doesn't have access to sceneState
        this.app.deleteObject(obj, event);
      }
      this.container.style.cursor = 'initial';
      if (this.cameraControls.controls) {
        this.cameraControls.controls.enabled = true;
      }
      return true;
    default:
      break;
  }
  return true;
};

SceneEditControls.prototype.scaleSelected = function(scaleBy, event) {
  if (this.manipulator.modelInstance) {
    const cmdParams = {object: this.manipulator.modelInstance, scaleBy: scaleBy};
    this.Publish(Constants.EDIT_OPSTATE.INIT, Constants.CMDTYPE.SCALE, cmdParams);
    this.app.scaleModels([this.manipulator.modelInstance], scaleBy, this.manipulator.getAttachmentFace());
    this.manipulator.updateRotationCircle(scaleBy, 0);
    this.manipulator.updateScaleTile(scaleBy);
    this.Publish(Constants.EDIT_OPSTATE.DONE, Constants.CMDTYPE.SCALE, cmdParams);
    return true;
  } else {
    return false;
  }
};

SceneEditControls.prototype.rotateSelected = function(rotateBy, event) {
  if (this.manipulator.modelInstance) {
    const cmdParams = { object: this.manipulator.modelInstance, rotateBy: rotateBy };
    this.Publish(Constants.EDIT_OPSTATE.INIT, Constants.CMDTYPE.ROTATE, cmdParams);
    const axis = this.manipulator.getRotationAxis();
    this.app.rotateModels([this.manipulator.modelInstance], axis, rotateBy, this.manipulator.getAttachmentFace());
    this.manipulator.updateRotationCircle(1, rotateBy);
    this.Publish(Constants.EDIT_OPSTATE.DONE, Constants.CMDTYPE.ROTATE, cmdParams);
    return true;
  } else {
    return false;
  }
};

SceneEditControls.prototype.deleteSelected = function (event) {
  if (this.selected) {
    this.app.deleteObject(this.selected, event);
    return true;  // we handled event
  }
  return false;
};

SceneEditControls.prototype.tumbleSelected = function (event) {
  if (this.selected) {
    this.app.tumbleObject(this.selected, event);
    return true;  // we handled event
  }
  return false;
};

SceneEditControls.prototype.handleTransformControllerKeys = function (event) {
  if (this.transformControls) {
    switch (event.which) {
      case 81: // Q
        this.transformControls.setSpace(this.transformControls.space === 'local' ? 'world' : 'local');
        return false;

      case 17: // Ctrl
        this.transformControls.setTranslationSnap(0.5*Constants.metersToVirtualUnit);
        this.transformControls.setRotationSnap(THREE.MathUtils.degToRad(15));
        return false;

      case 87: // W
        this.transformControls.setMode('translate');
        this._transformMode = 'translate';
        return false;

      case 69: // E
        this.transformControls.setMode('rotate');
        this._transformMode = 'rotate';
        return false;

      case 82: // R
        this.transformControls.setMode('scale');
        this._transformMode = 'scale';
        return false;

      case 187:
      case 107: // +, =, num+
        this.transformControls.setSize(this.transformControls.size + 0.1);
        return false;

      case 189:
      case 109: // -, _, num-
        this.transformControls.setSize(Math.max(this.transformControls.size - 0.1, 0.1));
        return false;
    }
  }
  return true;
};

SceneEditControls.prototype.updateDatGui = function(datgui) {
  const gui = datgui.getFolder('controls');
  gui.add(this, 'controlMode', ['basic', 'translate', 'rotate', 'scale']).name('control').listen();
  if (this.dragdrop) {
    gui.add(this.dragdrop, 'movementMode', Constants.EditStrategy.MovementMode).name('movement').listen();
    gui.add(this.dragdrop, 'supportSurfaceChange', Constants.EditStrategy.SupportSurfaceChange).name('support change').listen();
  }
  return gui;
};


Object.defineProperty(SceneEditControls.prototype, 'controlMode', {
  get: function () {
    return this.useThreeTransformControls? this._transformMode : 'basic';
  },
  set: function (m) {
    const prevUseThreeTransformControls = this.useThreeTransformControls;
    if (m === 'basic') {
      this.useThreeTransformControls = false;
    } else {
      this.useThreeTransformControls = true;
      this._transformMode = m;
      if (this.transformControls) {
        this.transformControls.setMode(m);
      }
    }
    if (prevUseThreeTransformControls !== this.useThreeTransformControls && this.selected) {
      const object = this.selected;
      this.detach(object);
      this.attach(object);
    }
  }
});


module.exports = SceneEditControls;
