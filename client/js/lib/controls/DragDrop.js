'use strict';

const Constants = require('Constants');
const ModelInstance = require('model/ModelInstance');
const ObjectAttachment = require('model/ObjectAttachment');
const Object3DUtil = require('geo/Object3DUtil');
const HighlightControls = require('controls/HighlightControls');
const PubSub = require('PubSub');
const UILog = require('editor/UILog');
const AttachmentBasedBoundingBoxHelper = require('geo/AttachmentBasedBoundingBoxHelper');

/**
 * Controls that allows for drag and drop of a object in 3D.
 * Drag and drag publishes the following events
 * Each event has a parameter indicating the command type (string), and an optional parameter indicating
 *   the object being manipulated
 *  Constants.EDIT_OPSTATE.INIT
 *  Constants.EDIT_OPSTATE.DONE
 * @param params Configuration
 * @param params.container Main view container element (used for setting cursor style and picking coordinates)
 * @param params.picker {controls.Picker} Picker to use for picking
 * @param params.controls Camera controls that need to be disabled when drag drop happens
 * @param params.uilog {editor.UILog} UILog to track user actions
 * @param params.sceneUpdatedCallback {controls.Picker} Picker to use for picking
 * @param [params.enabled=false] {boolean} Whether drag drop is enabled or not.
 * @param [params.allowAny=false] {boolean} Whether any object3D is can be drag and dropped or just object3D with userData isEditable.
 * @param [params.attachToParent=false] {boolean} Whether to automatically attach to support parent or remain detached when putOnObject is true.
 * @param [params.useModelBase=false] {boolean} Whether to use model base ...
 * @param [params.useModelContactPoint=true] {boolean} Whether to use prespecified model contact points.
 * @param [params.allowFloating=false] {boolean} Whether to allow floating objects (if putOnObject is true - does this work?).
 * @param [params.movementMode=DragDrop.Movement.MOVE_ON_SUPPORT_OBJECTS] How drag drop movement works
 * @param [params.supportSurfaceChange=DragDrop.SSC.NONE] {DragDrop.SSC.NONE|DragDrop.SSC.SWITCH_ATTACHMENT|DragDrop.SSC.REORIENT_CHILD}
 *    What happens if the support surface changes
 * @param [params.useVisualizer=false] {boolean} Whether to visualize the bounding box of selected object.
 * @param [params.restrictSupportToArch=false] {boolean} set to 'true' to restrict the placement of objects on arch surfaces.
 * @param [params.allowedSupportObjectTypes=null] {string[]} array of allowed object types/categories for support.
 * @param [params.highlightSupportOnHover=false] {boolean} whether to highlight support surface on hover
 * @memberOf controls
 * @constructor
 */
function DragDrop(params) {
  PubSub.call(this);

  this.container = params.container;
  this.picker = params.picker;
  this.controls = params.controls;  // other controls
  this.sceneUpdatedCallback = params.sceneUpdatedCallback;
  this.useVisualizer = params.useVisualizer;
  this.uilog = params.uilog;
  this.allowAny = params.allowAny;
  this.attachToParent = params.attachToParent;
  this.useModelBase = params.useModelBase;
  this.useModelContactPoint = (params.useModelContactPoint != undefined)? params.useModelContactPoint:true;
  this.useWorldBBoxAttachments = false;  // Use world aabb face centers as attachments (or use oriented bounding box face centers as attachments)
  this.pickerPlaneSize = 100*Constants.metersToVirtualUnit;

  // Drag and drop is enabled
  this.enabled = (params.enabled != undefined)? params.enabled : false;

  // Movement mode
  this.__movementMode = (params.movementMode != null)? params.movementMode : DragDrop.Movement.MOVE_ON_SUPPORT_OBJECTS;
  this.__putOnObject = (params.putOnObject != undefined)? params.putOnObject : true;
  // If putOnObject is true, but we didn't find parent object, do we allow the object to be floating in the air?
  this.allowFloating = (params.allowFloating != undefined)? params.allowFloating : false;
  // What to do when support surface changes
  this.__supportSurfaceChange = (params.supportSurfaceChange !== undefined) ? params.supportSurfaceChange : DragDrop.SSC.NONE;
  if (this.supportSurfaceChange === DragDrop.SSC.REORIENT_CHILD) {
    if (!this.useModelBase) {
      console.log('Using supportSurfaceChange REORIENT_CHILD - setting useModelBase to true');
      this.useModelBase = true;
    }
  }
  // Can we place on any objects or just architecture elements
  this.restrictSupportToArch = (params.restrictSupportToArch != undefined)? params.restrictSupportToArch : false;
  this.allowedSupportObjectTypes = params.allowedSupportObjectTypes;
  this.highlightSupportOnHover = (params.highlightSupportOnHover != undefined)? params.highlightSupportOnHover : false;

  // Different cursor stype to use
  this.cursorMoveStyle = 'none'; //'move';

  this.defaultCursor = 'auto';

  this.__userIsInserting = false; //true after user has clicked on a model, but before mouse enters container
  this.__insertMode = false; //true when user is in process of placing inserted model

  this.__shouldPush = false; //true when mouse is dragged
  this.__isMouseDown = false; //used for determining mouse drag

  this.__controlsEnabled = this.controls.enabled; // Backs up other control status
  this.__modelMoveStarted = false; //used for log event filtering
  this.__moveInteraction = null;
  this.__insertInteraction = null;
  this.reset(params);
}

DragDrop.SSC = Constants.EditStrategy.SupportSurfaceChange;
DragDrop.Movement = Constants.EditStrategy.MovementMode;
DragDrop.prototype = Object.create(PubSub.prototype);
DragDrop.prototype.constructor = DragDrop;

// set true to restrict movement of objects to a plane
Object.defineProperty(DragDrop.prototype, 'restrictMovementToPlane', {
  get: function () { return this.putOnObject? this.movementMode === DragDrop.Movement.MOVE_ON_ATTACHMENT_PLANE : true; },
  set: function (v) {
    if (this.putOnObject) {
      this.movementMode = (v? DragDrop.Movement.MOVE_ON_ATTACHMENT_PLANE : DragDrop.Movement.MOVE_ON_SUPPORT_OBJECTS);
    }
  }
});

// Should we always try to have objects be supported?
Object.defineProperty(DragDrop.prototype, 'putOnObject', {
  get: function () { return this.movementMode === DragDrop.Movement.MOVE_ON_SUPPORT_OBJECTS ||
    this.movementMode === DragDrop.Movement.MOVE_ON_ATTACHMENT_PLANE; }
});

// Convert strings if needed
Object.defineProperty(DragDrop.prototype, 'movementMode', {
  get: function () { return this.__movementMode; },
  set: function(v) {
    let mode = v;
    if (typeof(v) === 'string') {
      if (v.length === 1) {
        mode = parseInt(v);
      } else {
        mode = DragDrop.Movement[v];
      }
    }
    this.__movementMode = mode;
  }
});

Object.defineProperty(DragDrop.prototype, 'supportSurfaceChange', {
  get: function () { return this.__supportSurfaceChange; },
  set: function(v) {
    let mode = v;
    if (typeof(v) === 'string') {
      if (v.length === 1) {
        mode = parseInt(v);
      } else {
        mode = DragDrop.SSC[v];
      }
    }
    this.__supportSurfaceChange = mode;
  }
});

Object.defineProperty(DragDrop.prototype, 'insertMode', {
  get: function () { return this.__insertMode; }
});

DragDrop.prototype.reset = function (params) {
  this.camera = params.camera;
  this.scene = params.scene;
  this.controls = params.controls;
  this.enabled = (params.enabled !== undefined) ? params.enabled : this.enabled;

  // We have selected this object3D
  this.selected = null;
  this.selectedObjectAttachment = null;
  // Our mouse is over this object3D
  this.intersected = null;
  // The plane that we will move in
  // NOTE: Starting from THREE.js r72, we need to make the material not visible
  //       so the object is not displayed, but still intersectable by the RayCaster
  this.plane = this.plane || new THREE.Mesh(new THREE.PlaneBufferGeometry(this.pickerPlaneSize, this.pickerPlaneSize, 8, 8),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      opacity: 0.25,
      transparent: true,
      wireframe: true,
      visible: false
    }));
  this.plane.name = 'FloatPickingPlane';
  this.ignore = [this.plane];
  if (this.scene) {
    this.scene.add(this.plane);
  }

  this.mouse = new THREE.Vector2();
  this.placementInfo = {
    offset: new THREE.Vector3()
  };
  this.highlightControls = this.createHighlightControls();

  // private variables for keep track of state
  this.__markActiveSupport(this.__oldParent, false);
  this.__markActiveSupport(this.__newParent, false);
  this.__markActiveSupport(this.__hoverParent, false);
  this.__newParent = null;
  this.__oldParent = null;
  this.__hoverParent = null;
};

//Called after user selects model from side panel and model is loaded
DragDrop.prototype.onInsert = function (object3D) {
  if (this.enabled) {
    // Inserting an object, indicate the selected object
    this.selected = object3D;
    this.selectedObjectAttachment = new ObjectAttachment(object3D);
    this.selected.visible = true;

    // Set booleans appropriately
    this.__shouldPush = true;
    this.__userIsInserting = true;
    this.__insertMode = true;

    this.container.style.cursor = this.cursorMoveStyle;

    // TODO: set appropriate attachment based on priors
    const attachments = this.__identifyAttachmentsForPlacement(this.selectedObjectAttachment);
    this.selectedPoint = attachments[this.placementInfo.attachmentIndex].world.pos;

    this.__oldParent = null;

    if (this.uilog) {
      this.__insertInteraction = ModelInstance.getUILogInfo(object3D, true);
      this.__insertInteraction.type = UILog.EVENT.MODEL_INSERT_END;
      this.__insertInteraction['startTime'] = new Date().getTime();
      this.uilog.log(UILog.EVENT.MODEL_INSERT_START, null, this.__insertInteraction);
    }
  }
};

DragDrop.prototype.__identifyAttachmentsForPlacement = function (objectAttachment) {
  // Assume attaching on the bottom
  // Conceptually, the different bbface centers represent possible attachment points for the object
  // TODO: default to different attachments based on object3D
  const object3D = objectAttachment.object3D;
  const modelInstance = objectAttachment.modelInstance;
  const u = object3D.userData;
  let childAttachmentIndex = u['attachmentIndex'];
  let childWorldBBFaceIndex = u['childWorldBBFaceIndex'];
  if (modelInstance) {
    this.placementInfo.attachments = modelInstance.getCandidateAttachmentPoints();
    // HACKY!!! Find annotated attachment point if available...
    let contactPointAttachmentIndex = -1;
    if (this.useModelContactPoint) {
      const arr = this.placementInfo.attachments;
      for (let i = 0; i < arr.length; i++) {
        if (arr[i].type === 'annotated') {
          // Set attachmentIndex to this
          contactPointAttachmentIndex = i;
          break;
        }
      }
    }
    if (contactPointAttachmentIndex >= 0) {
      this.placementInfo.attachmentIndex = contactPointAttachmentIndex;
    } else {
      if (this.useWorldBBoxAttachments) {
        this.placementInfo.attachments = objectAttachment.identifyWorldBoundingBoxAttachments();
      }
      u['attachmentIndex'] = undefined;
      //this.placementInfo.attachmentIndex = childWorldBBFaceIndex;
    }
  } else {
    // Some other thingy... code path not really tested
    this.placementInfo.attachments = objectAttachment.identifyWorldBoundingBoxAttachments();
    u['attachmentIndex'] = undefined;
    //this.placementInfo.attachmentIndex = childWorldBBFaceIndex;
  }
  if (childWorldBBFaceIndex == null && childAttachmentIndex == null) {
    childAttachmentIndex = objectAttachment.getAttachmentIndex();
    childWorldBBFaceIndex = objectAttachment.childAttachmentIndexToWorldBBFaceIndex(childAttachmentIndex);
  } else if (this.supportSurfaceChange === DragDrop.SSC.REORIENT_CHILD) {
    // use childWordBBFaceIndex
    if (childWorldBBFaceIndex == null) {
      childWorldBBFaceIndex = objectAttachment.childAttachmentIndexToWorldBBFaceIndex(childAttachmentIndex);
    }
  } else {
    if (childAttachmentIndex == null) {
      const info = objectAttachment.getAttachmentInfoFromWorldSurfaceInNormal(Object3DUtil.InNormals[childWorldBBFaceIndex]);
      childAttachmentIndex = info.bbFaceIndexBase;
    }
  }
  this.placementInfo.attachmentIndex = childAttachmentIndex;
  this.placementInfo.childWorldBBFaceIndex = childWorldBBFaceIndex;

  this.__updateAttachmentIndex(this.selectedObjectAttachment, this.placementInfo.attachmentIndex, this.placementInfo.childWorldBBFaceIndex);
  return this.placementInfo.attachments;
};

DragDrop.prototype.__identifyAttachmentIndex = function (intersects) {
  // TODO: Depending on the normal of the support surface, pick appropriate face to attach
  // TODO: Decouple world bbox and object semantic frame
  const selected = this.selected;
  if (this.supportSurfaceChange === DragDrop.SSC.NONE) {
    // keep old attachmentIndex (if it exists)
    const attachmentIndex = this.selectedObjectAttachment.getAttachmentIndex(selected);
    const changed = this.placementInfo.attachmentIndex !== attachmentIndex;
    this.placementInfo.attachmentIndex = attachmentIndex;
    this.placementInfo.childWorldBBFaceIndex = this.selectedObjectAttachment.childAttachmentIndexToWorldBBFaceIndex(attachmentIndex);
    return true;
  }
  // We need to do something based on the intersected surface
  const worldSurfaceNorm = this.picker.getIntersectedNormal(intersects[0]);
  const attachmentInfo = this.selectedObjectAttachment.getAttachmentInfoFromWorldSurfaceInNormal(worldSurfaceNorm);
  const bbFaceIndexBase = attachmentInfo.bbFaceIndexBase;
  const bbFaceIndexWorld = attachmentInfo.bbFaceIndexWorld;
  if (bbFaceIndexBase >= 0) {
    if (this.supportSurfaceChange === DragDrop.SSC.SWITCH_ATTACHMENT) {
      // switch child attachment face to side closest/compatible with the support surface
      if (this.placementInfo.attachmentIndex >= 0 && this.placementInfo.attachmentIndex < 6) {
        if (bbFaceIndexBase !== this.placementInfo.attachmentIndex) {
          this.placementInfo.attachmentIndex = bbFaceIndexBase;
          this.placementInfo.childWorldBBFaceIndex = bbFaceIndexWorld;
          this.__updateAttachmentIndex(this.selectedObjectAttachment, this.placementInfo.attachmentIndex, bbFaceIndexWorld, worldSurfaceNorm);
        }
        return true;
      } else {
        // Special, don't change // HACKY, HACKY
        return this.placementInfo.childWorldBBFaceIndex === bbFaceIndexWorld;
      }
    } else if (this.supportSurfaceChange === DragDrop.SSC.REORIENT_CHILD) {
      // Reorient so normal from attachment point is in same direction as the norm
      //console.log('SSC.REORIENT_CHILD');
      // get current attachment index and what is the direction of the attachment normal (plus another orthogonal vector))
      const currentAttachmentIndex = this.selectedObjectAttachment.getAttachmentIndex();
      let baseAttachmentObjInNormal = selected.userData['attachmentBaseIn'];
      let baseAttachmentObjDir2 = selected.userData['attachmentBaseDir2'];
      if (baseAttachmentObjInNormal == null) {
        this.placementInfo.childWorldBBFaceIndex = null;
        baseAttachmentObjInNormal = this.selectedObjectAttachment.childAttachmentIndexToBaseInNorm(currentAttachmentIndex).clone();
        const orientingDirIndex = (currentAttachmentIndex + 2) % 6;
        baseAttachmentObjDir2 = Object3DUtil.InNormals[orientingDirIndex].clone();
      }
      const targetInNormal = attachmentInfo.baseInNorm;
      if (!targetInNormal.equals(baseAttachmentObjInNormal)) {
        const orientingDirIndex = (currentAttachmentIndex + 2) % 6;
        const targetDir2 = Object3DUtil.InNormals[orientingDirIndex].clone();
        // console.log('getting quaternion', baseAttachmentObjInNormal, baseAttachmentObjDir2, targetInNormal, targetDir2);
        const q = Object3DUtil.getAlignmentQuaternion(baseAttachmentObjInNormal, baseAttachmentObjDir2, targetInNormal, targetDir2);
        selected.quaternion.multiplyQuaternions(selected.quaternion, q);
        selected.updateMatrix();
        Object3DUtil.clearCache(selected);
      }
      // if (bbFaceIndexBase != currentAttachmentIndex) {
      //   const attachmentInfo2 = this.selectedObjectAttachment.getAttachmentInfoFromWorldSurfaceInNormal(worldSurfaceNorm);
      //   console.log('got attachInfo', currentAttachmentIndex, bbFaceIndexBase, attachmentInfo, attachmentInfo2);
      // }
      // NOTE: This shouldn't change
      //console.log('got bbFaceIndexBase', currentAttachmentIndex, bbFaceIndexBase, bbFaceIndexWorld);
      if (bbFaceIndexWorld !== this.placementInfo.childWorldBBFaceIndex) {
        //console.log('SSC.REORIENT_CHILD bbFaceIndexWorld changed: old=' + this.placementInfo.childWorldBBFaceIndex +', new=' + bbFaceIndexWorld);
        //console.log('SSC.REORIENT_CHILD currentAttachmentIndex=' + currentAttachmentIndex + ', bbFaceIndexBase=' + bbFaceIndexBase);
        this.placementInfo.attachmentIndex = currentAttachmentIndex;
        this.placementInfo.childWorldBBFaceIndex = bbFaceIndexWorld;
        this.__updateAttachmentIndex(this.selectedObjectAttachment, this.placementInfo.attachmentIndex, bbFaceIndexWorld, worldSurfaceNorm);
        //this.Publish('AttachmentChanged', { bbFaceIndex: bbFaceIndexWorld });
      }
      this.placementInfo.childWorldBBFaceIndex = bbFaceIndexWorld;
      return true;
    }
  } else {
    console.log('Cannot determine bbFaceIndexBase');
    return false;
  }
};

DragDrop.prototype.onMouseMove = function (event) {
  if (this.__isMouseDown) {
    this.__shouldPush = true;
  }
  if (!this.enabled) return true;
  event.preventDefault();

  if (this.selected) {
    this.mouse = this.picker.getCoordinates(this.container, event);
    this.__moveSelected(this.mouse.x, this.mouse.y);
    if (!this.__insertMode) {
      if (!this.__modelMoveStarted) {
        this.__moveInteraction = ModelInstance.getUILogInfo(this.selected, true);
        this.__moveInteraction.type = UILog.EVENT.MODEL_MOVE_END;
        this.__moveInteraction['startTime'] = new Date().getTime();
  
        this.uilog.log(UILog.EVENT.MODEL_MOVE_START, event, this.__moveInteraction);
        this.__modelMoveStarted = true;
      }
    }
    return false;
  } else {
    if (this.highlightControls) {
      // Highlight model on mouseover
      this.highlightControls.onMouseMove(event);
      this.intersected = this.highlightControls.intersected;
    }
    if (this.highlightSupportOnHover) {
      const supportParent = this.getSupportParent(this.intersected);
      if (supportParent !== this.__hoverParent) {
        this.__markActiveSupport(this.__hoverParent, false);
        this.__hoverParent = supportParent;
        this.__markActiveSupport(supportParent, true);
      }
    }
    if (this.intersected) {
      this.container.style.cursor = 'pointer';
      return false; // Event handled
    } else {
      this.container.style.cursor = this.defaultCursor;
    }
    return true;
  }
};

DragDrop.prototype.onMouseLeave = function (event) {
  if (!this.enabled) return;
  if (!this.selected) {
    if (this.highlightControls) {
      // Highlight model on mouseover
      this.highlightControls.onMouseLeave(event);
      this.intersected = this.highlightControls.intersected;
    }
    if (this.intersected) {
      this.container.style.cursor = 'pointer';
    } else {
      this.container.style.cursor = this.defaultCursor;
    }
  }
};

DragDrop.prototype.clearHighlight = function () {
  if (this.highlightControls) {
    this.highlightControls.clear();
  }
};

DragDrop.prototype.isEditable = function (intersected) {
  if (this.allowAny) { return true; }
  else {
    const modelInstance = Object3DUtil.getModelInstance(intersected.object);
    return modelInstance && modelInstance.isDraggable;
  }
};

DragDrop.prototype.isSelectable = function (intersected) {
  if (this.allowAny) { return true; }
  else {
    const modelInstance = Object3DUtil.getModelInstance(intersected.object);
    return modelInstance && modelInstance.object3D.userData.isSelectable;
  }
};

DragDrop.prototype.createHighlightControls = function () {
  const scope = this;
  const highlightControls = new HighlightControls({
    container: this.container,
    picker: this.picker,
    camera: this.camera,
    scene: this.scene,
    acceptCallback: function (intersected) {
      return scope.isSelectable(intersected);
    }
  });
  highlightControls.Subscribe("HighlightChanged", this, function(object3d, isHighlight){
    this.Publish("HighlightChanged", object3d, isHighlight);
  });
  return highlightControls;
};

DragDrop.prototype.__positionPlane = function(plane, intersected) {
  plane.position.copy(intersected.point);
  if (this.movementMode === DragDrop.Movement.MOVE_UP_DOWN) {
    // assumes y up
    plane.position.y = this.camera.position.y;
  }
  //TODO(MS): Have plane be positioned on support surface for putOnObject mode
  plane.lookAt(this.camera.position);
};

DragDrop.prototype.__getOffset = function (intersected) {
  const offset = new THREE.Vector3();
  intersected.object.localToWorld(offset);
  offset.sub(intersected.point);
  return offset;
};

DragDrop.prototype.onMouseDown = function (event, intersected) {
  this.__isMouseDown = true;
  this.__modelMoveStarted = false;

  if (this.enabled && !this.__insertMode) {
    event.preventDefault();
    this.mouse = this.picker.getCoordinates(this.container, event);
    if (intersected === undefined) {
      const pickables = (this.scene.pickables) ? this.scene.pickables : this.scene.children;
      intersected = this.picker.getFirstIntersected(this.mouse.x, this.mouse.y, this.camera, pickables);
    }
    if (intersected) {
      this.__positionPlane(this.plane, intersected);
      const accept = this.isEditable(intersected);
      if (accept) {
        intersected.offset = this.__getOffset(intersected);
        this.attach(intersected);
        return false;
      } else {
        this.detach();
      }
    } else {
      this.detach();
    }
  }
  return true;
};

DragDrop.prototype.__updateAttachmentIndex = function(objectAttachment, childAttachmentIndex, childWorldBBFaceIndex, supportSurfaceNorm) {
  if (this.useModelBase) {
    const attachment = objectAttachment.updateAttachment(this.placementInfo.attachments, childAttachmentIndex, childWorldBBFaceIndex, supportSurfaceNorm);
    if (attachment) {
      const childFaceWorldInNorm = attachment.world.out.clone().negate();
      const surfaceNorm = supportSurfaceNorm? supportSurfaceNorm.clone() : childFaceWorldInNorm;
      this.Publish('AttachmentChanged',
        { bbFaceIndex: childWorldBBFaceIndex, faceNormal: childFaceWorldInNorm, surfaceNormal: surfaceNorm });
    }
  } else {
    this.Publish('AttachmentChanged', { bbFaceIndex: childWorldBBFaceIndex });
  }
};

DragDrop.prototype.attach = function (intersected) {
  this.selected = intersected.object;
  this.selectedObjectAttachment = new ObjectAttachment(intersected.object);
  this.selectedPoint = intersected.point;
  this.Publish(Constants.EDIT_OPSTATE.INIT, Constants.CMDTYPE.MOVE, { object: this.selected });

  this.placementInfo = {
    // offset of selected point from (0,0,0) in world space
    offset: intersected.offset
  };
  // Save the relative position of point with respect to the 6 cube face centers...
  if (this.putOnObject) {
    this.detachSelectedFromParent();
    this.__setAllOffsets();
  }
  if (this.controls) {
    this.__controlsEnabled = this.controls.enabled;
    this.controls.enabled = false;
  }
  this.container.style.cursor = this.cursorMoveStyle;
};

DragDrop.prototype.detach = function () {
  this.selected = null;
  this.selectedObjectAttachment = null;
  if (this.controls) {
    this.controls.enabled = this.__controlsEnabled;
  }
  this.container.style.cursor = this.defaultCursor;
};

DragDrop.prototype.onMouseUp = function (event) {
  if (event) {
    event.preventDefault();
  }
  this.__isMouseDown = false;
  this.__modelMoveStarted = false;
  let notHandled = true;
  if (!this.enabled) return notHandled;
  if (this.selected) {
    if (this.putOnObject) {
      this.__markActiveSupport(this.__oldParent, false);
      this.__markActiveSupport(this.__newParent, false);
      this.__newParent = this.__newParent ? this.__newParent : this.__oldParent;
      if (this.attachToParent) {
        Object3DUtil.attachToParent(this.selected, this.__newParent, this.scene);
      }
      this.selected.visible = true;
      if (this.sceneUpdatedCallback) {
        this.sceneUpdatedCallback();
      }
    }
    if (this.__shouldPush) {
      this.__shouldPush = false;
      if (this.__insertMode) {
        // What to log in the ui about this model
        this.Publish(Constants.EDIT_OPSTATE.DONE, Constants.CMDTYPE.INSERT, { object: this.selected });
        if (this.uilog) {
          // const objInfo = ModelInstance.getUILogInfo(this.selected, true);
          const interactionType = this.__insertInteraction.type;
          delete this.__insertInteraction.type;

          this.uilog.log(interactionType, event, this.__insertInteraction);
        }
      } else {
        // What to log in the ui about this model
        this.Publish(Constants.EDIT_OPSTATE.DONE, Constants.CMDTYPE.MOVE, { object: this.selected });
        if (this.uilog) {
          // const objInfo = ModelInstance.getUILogInfo(this.selected, true);
          // objInfo["startTime"] = modelMoveStartTime;
          // this.uilog.log(UILog.EVENT.MODEL_MOVE, event, objInfo);
          // this.uilog.log(UILog.EVENT.MODEL_MOVE_END, event, objInfo);
          if (this.__moveInteraction) {
            const interactionType = this.__moveInteraction.type;
            delete this.__moveInteraction.type;
            this.uilog.log(interactionType, event, this.__moveInteraction);
            this.__moveInteraction = null;
          }
        }
      }
    }
    notHandled = false;
  }
  if (this.controls) {
    this.controls.enabled = this.__controlsEnabled;
  }
  this.selected = null;
  this.selectedObjectAttachment = null;
  this.container.style.cursor = this.defaultCursor;
  this.__shouldPush = false;
  this.__insertMode = false;
  this.removeVisualizer();
  this.__moveInteraction = null;
  return notHandled;
};

DragDrop.prototype.getSupportParent = function(object3D) {
  if (object3D) {
    const res = Object3DUtil.findFirstAncestor(object3D, function (node) {
      return node.userData.isSupportObject;
    });
    return res.ancestor || object3D;
  }
};

DragDrop.prototype.__isObjectType = function(obj3D, validTypes) {
  for (let validType of validTypes) {
    if (obj3D.userData.type === validType) {
      return true;
    }
    const modelInstance = Object3DUtil.getModelInstance(obj3D, true);
    if (modelInstance && modelInstance.model.hasCategory(validType)) {
      return true;
    }
  }
  return false;
};

DragDrop.prototype.getSupportObjects = function() {
  const selectables = (this.scene.selectables) ? this.scene.selectables : this.scene.children;
  let supportObjects = (this.scene.supportObjects) ? this.scene.supportObjects : selectables;
  if (this.restrictSupportToArch) {
    // Filter out non room support objects
    supportObjects = supportObjects.filter(obj3D => obj3D.userData.isArch);
  }
  if (this.allowedSupportObjectTypes) {
    // Filter out support objects by type
    supportObjects = supportObjects.filter(obj3D => this.__isObjectType(obj3D, this.allowedSupportObjectTypes));
  }
  return supportObjects;
};

DragDrop.prototype.__getRaycaster = function(x, y, camera) {
  if (!this.__raycaster) {
    this.__raycaster = new THREE.Raycaster();
  }
  this.__raycaster.setFromCamera({ x: x, y: y}, camera);
  return this.__raycaster;
};

DragDrop.prototype.__positionObjectAtPoint = function(object, position) {
  const parent = object.parent;
  if (parent) {
    parent.worldToLocal(position);
  }
  object.position.copy(position);
  object.updateMatrix();
  Object3DUtil.clearCache(object);
};

DragDrop.prototype.__moveObjectInPlane = (function() {
  const intersectPoint = new THREE.Vector3();
  return function(object, x, y, plane, finalOffset) {
    const raycaster = this.__getRaycaster(x, y, this.camera);
    // Find intersection
    if (plane instanceof THREE.Plane) {
      // Infinite plane
      raycaster.ray.intersectPlane(plane, intersectPoint);
    } else if (plane instanceof THREE.Object3D) {
      // Finite plane (as mesh)
      const intersects = raycaster.intersectObject(plane);
      if (intersects.length) {
        intersectPoint.copy(intersects[0].point);
      }
    } else {
      console.warn('Unsupported plane type', plane);
    }
    if (intersectPoint) { // Move the object
      if (finalOffset) {
        intersectPoint.add(finalOffset);
      }
      this.__positionObjectAtPoint(object, intersectPoint);
    }
  };
})();

DragDrop.prototype.__moveSelectedUpDown = (function() {
  const targetPoint = new THREE.Vector3();
  return function (x, y) {
    const object = this.selected;
    object.getWorldPosition(targetPoint);

    const raycaster = this.__getRaycaster(x, y, this.camera);
    const intersects = raycaster.intersectObject(this.plane);
    if (intersects.length) {
      // assume y-up
      targetPoint.y = intersects[0].point.y;
      this.__positionObjectAtPoint(object, targetPoint);
    }
  };
})();

DragDrop.prototype.__moveSelectedOnPickingPlane = function (x, y) {
  // Maybe just move along the picking plane...
  this.__moveObjectInPlane(this.selected, x, y, this.plane, this.placementInfo.offset);
};

DragDrop.prototype.__handleInsertion = function(x,y, supportObjects, ignored) {
  const initialIntersected = this.picker.getIntersected(x, y, this.camera, supportObjects, ignored);
  if (initialIntersected.length > 0) {
    this.__userIsInserting = false;
    this.selected.visible = true;
    const mouse3DLoc = initialIntersected[0].point;
    // Make sure that attachment point set correctly
    this.__updateAttachmentIndex(this.selectedObjectAttachment, this.placementInfo.attachmentIndex, this.placementInfo.childWorldBBFaceIndex);
    if (this.placementInfo.attachmentIndex >= 0 && this.placementInfo.attachmentIndex < 6) {
      Object3DUtil.placeObject3DByBBFaceCenter(this.selected, mouse3DLoc, this.placementInfo.attachmentIndex, this.placementInfo.childWorldBBFaceIndex);
    } else {
      Object3DUtil.placeObject3DByOrigin(this.selected, mouse3DLoc);
    }
    this.detachSelectedFromParent();
    this.__setAllOffsets();
    return initialIntersected[0];
  }
};

DragDrop.prototype.__markActiveSupport = function(parent, flag) {
  if (parent) {
    parent.isActiveSupport = flag;
  }
};

DragDrop.prototype.__moveSelectedOnSupportObjects = function (x, y) {
  //const pickables = (this.scene.pickables)? this.scene.pickables: this.scene.children;
  const supportObjects = this.getSupportObjects();
  // supportObjects = [this.selected.parent];
  // console.log({"Support objects": supportObjects});
  const ignored = [this.plane, this.selected];

  // TODO: Should we just check if the object intersects???
  // Figure out which other object the cursor intersects
  //const screenOffset = new THREE.Vector2(0,0);
  if (this.__userIsInserting) {
    const initialIntersected = this.__handleInsertion(x, y, supportObjects, ignored);
    if (!initialIntersected) {
      // Skip whatever else is happening...
      return;
    }
  }

  const screenOffset = this.placementInfo.attachmentOffsetsScreen[this.placementInfo.attachmentIndex] || { x: 0, y: 0 };
  let intersects = this.picker.getIntersected(x + screenOffset.x, y + screenOffset.y,
    this.camera, supportObjects, ignored);
  // Make sure that the selected and intersects are truly distinct (should be handled by ignored)
  // intersects = intersects.filter(x => !Object3DUtil.isDescendantOf(x.object, this.selected, true));

  // unmark new parent as being active support
  this.__markActiveSupport(this.__oldParent, false);
  this.__markActiveSupport(this.__newParent, false);

  let targetPoint;
  if (intersects.length > 0) { //no intersect for movement after redo
    // Figure out the supporting plane of that object
    const ok = this.__identifyAttachmentIndex(intersects);
    if (ok) {
      // Figure out where new position should be...
      targetPoint = intersects[0].point.clone();
      if (this.useModelBase) {
        // Using model base - object is recentered to 0,0,0 at attachment point so we don't need the offset
      } else {
        // Not using model base, object origin remains the same, need to add offset to compensate
        const selectedPointToAttachmentOffset = this.placementInfo.attachmentOffsets[this.placementInfo.attachmentIndex];
        targetPoint.add(selectedPointToAttachmentOffset);
      }
      // Switch parent...
      this.__newParent = intersects[0].object;
    }
  } else if (this.allowFloating) {
    // TODO: Have the plane be in the same orientation as the lastBBFaceIndex
    const raycaster = this.picker.getRaycaster(x, y, this.camera);
    intersects = raycaster.intersectObject(this.plane);
    if (intersects.length > 0) {
      // Figure out where new position should be...
      targetPoint = intersects[0].point.add(this.placementInfo.offset);
    }
    this.__newParent = null;
  }
  if (targetPoint) {
    this.__positionObjectAtPoint(this.selected, targetPoint);
  }
  // mark new parent as being active support
  this.__markActiveSupport(this.__newParent, true);
};

DragDrop.prototype.__moveSelectedOnAttachmentPlane = function(x,y) {
  if (this.__userIsInserting) {
    const supportObjects = this.getSupportObjects();
    const ignored = [this.plane, this.selected];
    const initialIntersected = this.__handleInsertion(x, y, supportObjects, ignored);
    if (!initialIntersected) {
      // Skip whatever else is happening...
      return;
    }
  }

  // TODO: Check this logic
  // Create attachment plane
  const attachmentPlane = new THREE.Plane();
  attachmentPlane.setFromNormalAndCoplanarPoint(this.selected.userData.attachmentWorldOut, this.selected.userData.attachmentWorldPos);

  // Project cursor location point to attachment plane
  const screenOffset = this.placementInfo.attachmentOffsetsScreen[this.placementInfo.attachmentIndex];
  this.__moveObjectInPlane(this.selected, x + screenOffset.x, y + screenOffset.y, attachmentPlane, null);
};

DragDrop.prototype.__moveSelected = function (x, y) {
  // console.log("Move Selected " + x + " " + y);
  if (this.movementMode === DragDrop.Movement.MOVE_ON_PICKING_PLANE) {
    this.__moveSelectedOnPickingPlane(x, y);
  } else if (this.movementMode === DragDrop.Movement.MOVE_UP_DOWN) {
    this.__moveSelectedUpDown(x, y);
  } else if (this.movementMode === DragDrop.Movement.MOVE_ON_SUPPORT_OBJECTS) {
    this.__moveSelectedOnSupportObjects(x, y);
  } else if (this.movementMode === DragDrop.Movement.MOVE_ON_ATTACHMENT_PLANE) {
    this.__moveSelectedOnAttachmentPlane(x, y);
  } else {
    console.log('Unsupported placementMode', this.movementMode);
  }
  this.updateVisualizer();
};

DragDrop.prototype.cancelInsertion = function () {
  if (this.__insertMode) {
    const cancelledObject = this.selected;
    this.__shouldPush = false;
    this.onMouseUp();
    
    if (this.uilog) {
      // const objInfo = ModelInstance.getUILogInfo(this.selected, true);
      delete this.__insertInteraction.type;
      this.uilog.log(UILog.EVENT.MODEL_INSERT_CANCELLED, null, this.__insertInteraction);
    }
    
    return cancelledObject;
  }
};

DragDrop.prototype.detachSelectedFromParent = function () {
  this.__markActiveSupport(this.__newParent, false);
  this.__markActiveSupport(this.__oldParent, false);
  this.__newParent = null;
  this.__oldParent = this.selected.parent;
  Object3DUtil.detachFromParent(this.selected, this.scene);
};

DragDrop.prototype.__setAllOffsets = function () {
  const origPos = new THREE.Vector3();
  this.selected.localToWorld(origPos);
  // Original position (0,0,0) of the object in world coordinate
  this.placementInfo.origPosition = origPos;
  // Position of the original selected point of the object
  this.placementInfo.origSelectedPoint = this.selectedPoint;
  const attachments = this.__identifyAttachmentsForPlacement(this.selectedObjectAttachment);
  // offset in world space from the (0,0,0) of the object to the different attachment points
  // this allows the position operation to work
  this.placementInfo.attachmentOffsets = attachments.map(function (att) {
    const p = att.world.pos;
    const selectedPointToAttachmentOffset = origPos.clone().sub(p);
    return selectedPointToAttachmentOffset;
  });
  // Get attachment offsets projects onto the screen from the clicked point
  const camera = this.camera;
  const x = this.mouse.x;
  const y = this.mouse.y;
  this.placementInfo.attachmentOffsetsScreen = attachments.map(function (att) {
    const p = att.world.pos;
    const v = p.clone().project(camera);
    const clickedToAttachmentOffset = new THREE.Vector2(v.x - x, v.y - y);
    return clickedToAttachmentOffset;
  });
};

/*Visualizer is a box geometry that encloses the selected object and has
 transparent faces on all sides except for the side containing the attachment
 point of the object*/
DragDrop.prototype.createVisualizer = function () {
  if (this.selected && !this.visualizer) {
    // Create the bbox helper and use as the visualizer
    this.visualizer = new AttachmentBasedBoundingBoxHelper(this.selected, this.placementInfo.childWorldBBFaceIndex,
      { color: 'green', scaleFactor: 1.05, showBBox: false });
    this.visualizer.update();
    this.scene.add(this.visualizer);
  }
};

//TODO: make faster
DragDrop.prototype.updateVisualizer = function () {
  if (this.selected && this.useVisualizer) {
    if (this.visualizer) {
      this.visualizer.attach(this.selected);
      this.visualizer.setAttachmentFace(this.placementInfo.childWorldBBFaceIndex);
      this.visualizer.update();
      if (this.visualizer.parent !== this.scene) {
        this.scene.add(this.visualizer);
      }
    } else {
      this.createVisualizer();
    }
  } else {
    this.removeVisualizer();
  }
};

DragDrop.prototype.removeVisualizer = function (clear) {
  if (this.visualizer) {
    this.scene.remove(this.visualizer);
    if (clear) {
      this.visualizer = null;
    } else {
      this.visualizer.detach();
    }
  }
};

// Exports
module.exports = DragDrop;