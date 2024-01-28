'use strict';

var Constants = require('Constants');
var ModelInstance = require('model/ModelInstance');
var Object3DUtil = require('geo/Object3DUtil');
var PubSub = require('PubSub');
var ImageButton = require('ui/ImageButton');
var ImageUtil = require('util/ImageUtil');
var InstanceMasks = require('rlsd/InstanceMasks');
var MaskAddress = require('rlsd/MaskAddress');
var MaskCommentUI = require('rlsd/MaskCommentUI');
var MaskAnnotations = require('rlsd/MaskAnnotations');
var ObjectMaskFilters = require('rlsd/ObjectMaskFilters');
var PoseSuggester = require('rlsd/PoseSuggester');
var PanoramaViewer = require('rlsd/PanoramaViewer');
var ProgressBar = require('rlsd/ProgressBar');
var UILog = require('editor/UILog');
var _ = require('util/util');

require('jquery-ui');
require('three-controls');

/**
 * UI for selecting image masks and selecting object for placement
 * The ImageMaskObjectPlacer publishes the following events
 * <ul>
 *   <li>objectSelected: newObject3D, associatedMaskAddresses, object was selected</li>
 *   <li>maskSelected: newMaskAddress, label, mask was selected</li>
 *   <li>maskAnnotationUpdated: maskAddresses, what masks are updated</li>
 *   <li>customInstanceAdded: customObjInfo, custom instance added</li>
 *   <li>customInstanceRemoved: customObjInfo, custom instance added</li>
 * </ul>
 * To facilitate testing of different conditions of the controls, there are various flags that can be turned on and off.
 * @param params
 * @param params.picker {controls.Picker}
 * @param [params.scene] {THREE.Scene} Scene (call {@link reset} to update when scene is switched)
 * @param [params.sceneState] {scene.SceneState} Scene state (call {@link reset} to update when scene is switched)
 * @param [params.camera] {THREE.Camera} Camera (call {@link reset} to update when scene is switched)
 * @param [params.sceneEditControls] {controls.SceneEditControls} Scene edit controls (call {@link reset} to update when scene is switched)
 * @param [params.autoPlace=true] {boolean} Whether the selected object is automatically placed based on click position (vs dragged into the scene)
 * @param [params.sceneWizard] {SceneWizard}
 * @param [params.labelManager] {LabelManager}
 * @param [params.enabled=false] {boolean} Whether this control is enabled or not
 * @param [params.debug=false] {boolean} Whether to enable debug messages
 * @constructor
 * @memberOf controls
 */
function ImageMaskObjectPlacer(params) {
  PubSub.call(this);
  this.active = false;
  this.enabled = params.enabled;
  this.sceneWizard = params.sceneWizard;
  this.labelManager = params.labelManager;
  this.scene = params.scene;
  this.sceneState = params.sceneState;
  this.debug = params.debug;

  // Options on how the placement UI should work
  // Select mode for what happens when we click on a point on the panorama
  this.__defaultSelectMode = 'placeObject';
  this.__selectMode = this.__defaultSelectMode; // 'selectMask', 'placeObject', 'assignMask', 'createPointLabel', 'specifyPointLabelPosition
  // Allow selection of mask from object
  this.linkedMaskObjectSelection = false;
  // Whether we enforce assignment of mask to object to be oneToOne
  this.oneToOne = false;
  // Placement options
  this.autoPlace = (params.autoPlace != undefined) ? params.autoPlace : false;
  this.bottomAttachmentAdjustmentEnabled = params.bottomAttachmentAdjustmentEnabled;

  // Panorama state
  this.startPanoMaximized = params.startPanoMaximized;
  this.separatePanoOverlay = params.separatePanoOverlay;
  this.hoverSphereCount = 10; // When we hover an object that has multiple masks, all the masks should get hover highlighted. In this occasion, we need multiple hover spheres.
  this.defaultPanoramaSizeRatio = params.panoramaSizeRatio;
  this.panoMaximized = false;
  this.__isPanoramaLocked = false;
  this.__panoInteractionInfo = null; // Contains information about panoramic interaction (not null when panorama is maximized, currently stores the startTime of the interaction)

  // Pose suggester
  this.poseSuggester = new PoseSuggester({
    sceneWizard: this.sceneWizard,
    prefetch: true,
    // TODO: Fix spelling of suggestor to suggester
    enabled: (params.poseSuggestorEnabled != undefined) ? params.poseSuggestorEnabled : true
  });

  // Information about the instance and objects
  this.instanceMasks = null;
  this.objectInfoStore = null;
  this.maskAnnotations = new MaskAnnotations({
    oneToOne: this.oneToOne,
    deleteMaskObjectCallback: (pair) => { this.deleteObjectIn3DView(pair.object3d); }
  });

  // Information about the current active viewpoint
  this.activeViewpoint = null; // Viewpoint currently selected. A viewpoint corresponds to a photo.
  this.activeViewpointObjectInfoStore = null; // Contains information about objects that are to be annotated from the selected viewpoint.

  // UI elements
  this.progressBar = null;
  this.maskCommentUI = null;
  // Tooltips are setup on demand
  this.__tooltipText = null;
  this.__tooltipInput = null;

  // UI state (what is hovered and what is selected)
  this.__hoverMasks = [];
  this.__hoverObjects = [];
  this.__selectedMask = null;
  this.__selectedMaskInfo = null;
  this.__selectedObject3d = null;   // TODO: should we track selected model instance (not selected object3d)?
  this.__isHighlightedAll = true;

  this.__isInserting = false;    // Is the user currently inserting an object?
  this.__skipSelectedInstanceChanged = false;   // Ignore SelectedInstanceChanged event

  // Model placement information
  this.__toReplaceInfo = null; // Object about to be replaced by the newly added object.
  this.__autoPlaceClickInsertInfo = null;
  this.__queryAndPlaceInfo = null;

  this.sceneEditControls = params.sceneEditControls;
  this.searchController = params.searchController;
  this.defaultSource = params.defaultSource;
  this.picker = params.picker;

  this.uilog = params.uilog;

  this.viewer = params.viewer;
  this.viewer.Subscribe('ObjectPlaced', this, this.__onModelPlaced.bind(this)); // Triggered when user finish inserting a new object
  this.viewer.Subscribe('ModelLoaded', this, this.__onModelLoaded.bind(this)); // Triggered when user start inserting a new object
  this.viewer.Subscribe('ObjectInsertCancelled', this, this.__onModelInsertCancelled.bind(this)); // Triggered when user cancels an insert operation
  this.viewer.Subscribe('SelectedInstanceChanged', this, this.__onSelectedInstanceChanged.bind(this)); // Triggered when user selects a 3D object
  this.viewer.Subscribe('HighlightChanged', this, this.__on3DViewerHighlightChanged.bind(this)); // Triggered when user mouse hover a 3D object
  this.viewer.Subscribe('SceneLoaded', this, this.__onSceneLoaded.bind(this));
  this.viewer.Subscribe('DeleteObject', this, this.__onDeletedObject.bind(this));
  // this.viewer.Subscribe('PasteStarted', this, this._onPasteStarted.bind(this));
  this.viewer.Subscribe('PasteCompleted', this, this._onPasteCompleted.bind(this));

  // RGB preview event handlers

  this.panoViewer = this.__createPanoViewer(params);
  this.setupMaskComment(params.maskCommentUI);
  this.__setupUILog();
}

ImageMaskObjectPlacer.SELECT_MODES = ['selectMask', 'placeObject', 'assignMask', 'createPointLabel', 'specifyPointLabelPosition'];

ImageMaskObjectPlacer.prototype = Object.create(PubSub.prototype);
ImageMaskObjectPlacer.prototype.constructor = ImageMaskObjectPlacer;

Object.defineProperty(ImageMaskObjectPlacer.prototype, 'selectMode', {
  get: function () { return this.__selectMode; },
  set: function(v) {
    if (ImageMaskObjectPlacer.SELECT_MODES.indexOf(v) >= 0) {
      this.__selectMode = v;
    } else {
      console.warn('Unknown ImageMaskObjectPlacer selectMode: ' + v + ', use default ' + this.__defaultSelectMode);
      this.__selectMode = this.__defaultSelectMode;
    }
    console.info({selectMode: this.__selectMode});
    if (this.__selectMode === 'selectMask') {
      // Show selected mask
      this.selectMask(this.selectedMask);
    } else if (this.__selectMode === 'assignMask') {
      // Show all highlights
      this.highlightAssignedMasks();
    }
  }
});

Object.defineProperty(ImageMaskObjectPlacer.prototype, 'maskAssignMode', {
  get: function () { return this.__selectMode === 'assignMask'; },
  set: function (v) {
    this.selectMode = v? 'assignMask' : this.__defaultSelectMode;
  }
});

Object.defineProperty(ImageMaskObjectPlacer.prototype, 'placeObjectMode', {
  get: function () { return this.__selectMode === 'placeObject'; },
});

Object.defineProperty(ImageMaskObjectPlacer.prototype, 'specifyPointLabelPositionMode', {
  get: function () { return this.__selectMode === 'specifyPointLabelPosition'; },
  set: function (v) {
    this.selectMode = v? 'specifyPointLabelPosition' : this.__defaultSelectMode;
  }
});

Object.defineProperty(ImageMaskObjectPlacer.prototype, 'selectedModelInstance', {
  get: function () { return this.__selectedObject3d? Object3DUtil.getModelInstance(this.__selectedObject3d) : null; },
});

Object.defineProperty(ImageMaskObjectPlacer.prototype, 'selectedObject3d', {
  get: function () { return this.__selectedObject3d; },
  set: function (obj) {
    var prevSelectedObject = this.__selectedObject3d;
    this.__selectedObject3d = obj;
    var associatedMasks = obj? this.__findObject3DMasks(obj) : null;
    this.Publish('objectSelected', obj, associatedMasks);

    if (this.uilog) {
      if (prevSelectedObject !== obj) {
        var modelInfo = obj? ModelInstance.getUILogInfo(obj, true) : null;
        this.uilog.log(UILog.EVENT.SELECT_OBJECT, null, {selectedModelInfo: modelInfo});
      }
    }
  }
});

Object.defineProperty(ImageMaskObjectPlacer.prototype, 'selectedMask', {
  get: function () { return this.__selectedMask; },
  set: function (maskAddr) {
    this.__selectedMask = maskAddr;
    if (maskAddr) {
      this.__selectedMaskInfo = this.activeViewpointObjectInfoStore.get(maskAddr.maskId);
    } else {
      this.__selectedMaskInfo = null;
    }
  }
});

Object.defineProperty(ImageMaskObjectPlacer.prototype, 'loadedMaskInfos', {
  get: function () { return _.get(this.viewer, ['sceneState', 'json', 'maskInfos']); },
});

ImageMaskObjectPlacer.prototype.highlightAssignedMasks = function () {
  if (this.selectedObject3d) {
    const objectMasks =  this.__findObject3DMasks(this.selectedObject3d);
    const assignedMasks = (objectMasks)? new Set(objectMasks.map(x => x.maskId)): null;
    const pixels = this.instanceMasks.getAllMasksHighlight(this.activeViewpointObjectInfoStore, this.maskAnnotations, assignedMasks);
    this.panoViewer.highlightSelected(pixels.data, pixels.width, pixels.height);
  } else {
    const pixels = this.instanceMasks.createPixelBuffer();
    this.panoViewer.highlightSelected(pixels.data, pixels.width, pixels.height);
  }
};

ImageMaskObjectPlacer.prototype.__createPanoViewer = function(params) {
  var scope = this;
  // If a separate pano overlay is used, this is overlay pano. Otherwise, its background + overlay pano.
  const panoParams = {
    overlayCanvas: params.panoViewer.overlayCanvas,
    backgroundCanvas:  this.separatePanoOverlay? params.panoViewer.backgroundCanvas : params.panoViewer.overlayCanvas,
    showBackground: true,
    enabled: true,
    showOverlays: true,
    sizeRatio: this.defaultPanoramaSizeRatio,
    cameraOrbitStartCallback:(cameraOrbitInteraction) => {
      if (scope.uilog) {
        scope.uilog.log(UILog.EVENT.PANORAMA_ORBIT_START, null, cameraOrbitInteraction);
      }
    },
    cameraOrbitEndCallback:(cameraOrbitInteraction) => {
      if (scope.uilog) {
        scope.uilog.log(UILog.EVENT.PANORAMA_ORBIT_END, null, cameraOrbitInteraction);
      }
    },
    cameraOrbitCallback: (lookDir) => {
      params.onCameraOrbitCallback(lookDir);
      if (scope.panoViewer) {
        scope.panoViewer.setPanoramaLookDirection(lookDir.toArray());
      }
    },
    onPanoHover: function(event, coords) {
      //console.log('got', panoCoordsNormalized, screenCoordsNormalized, clientPos);
      const clientMousePos = { x: event.clientX, y: event.clientY }; // Client mouse position
      if (!scope.instanceMasks) { return true; }
      var panoMaskId = scope.instanceMasks.getInstanceId(coords.panoCoordsNormalized, true);
      var hoverInstId = (coords.pointInstanceId != null)? coords.pointInstanceId : panoMaskId;

      if (scope.maskAssignMode && scope.selectedObject3d) {
        // Usual hover effect skipped.
      }	else {
        if (hoverInstId === InstanceMasks.MASK_BACKGROUND_ID || !(scope.activeViewpointObjectInfoStore.has(hoverInstId))) {
          // Hover on background. No Highlight
          scope.hoverHighlightMask(null);
          return true; // Event not handled
        } else {
          var hoverMaskAddress = new MaskAddress(scope.activeViewpoint.id, hoverInstId, coords.panoCoordsNormalized);
          scope.hoverHighlightMask(hoverMaskAddress, clientMousePos);
          return false; // Event handled
        }
      }
    },
    onPanoClick: function(event, coords) {
      console.log("Clicked", event, coords, scope.__selectMode);
      scope.__initiateAutoPlace(coords.screenCoordsNormalized);

      if (!scope.instanceMasks) { return true; }
      var panoMaskId = scope.instanceMasks.getInstanceId(coords.panoCoordsNormalized, true);
      var selectedInstId = (coords.pointInstanceId != null)? coords.pointInstanceId : panoMaskId;
      var selectedMask = new MaskAddress(scope.activeViewpoint.id, selectedInstId , coords.panoCoordsNormalized);

      if (scope.maskAssignMode && scope.selectedObject3d) {
        if (scope.maskObjectAssignments.isObjectMaskAssigned(selectedMask, scope.selectedObject3d)) {
          if (scope.__findObject3DMasks(scope.selectedObject3d).length > 1) {
            scope.removeMaskObjectAssignment(selectedMask, scope.selectedObject3d);
            scope.highlightAssignedMasks();
            if (scope.debug) {
              console.log({did: {action: "unassign", mask: selectedMask, object3d: scope.selectedObject3d}});
            }
          } else {
            console.info("Cannot unassign the mask since only 1 mask is assigned to the object.");
          }
        } else {
          scope.assignObjectToMask(selectedMask, scope.selectedObject3d);
          scope.highlightAssignedMasks();
          if (scope.debug) {
            console.log({did: {action: "assign", mask: selectedMask, object3d: scope.selectedObject3d}});
          }
        }
      } else if (scope.specifyPointLabelPositionMode) {
        console.log('specifyPointLabelPosition');
        const clientMousePos = { x: event.clientX, y: event.clientY }; // Client mouse position
        scope.__updatePointInstancePosition(scope.activeLabelInfo.id, coords.panoCoordsNormalized, coords.point3d, clientMousePos);
        scope.exitSpecifyPointLabelPositionMode();
        return true;
      }	else {
        if (selectedInstId === InstanceMasks.MASK_BACKGROUND_ID || !(scope.activeViewpointObjectInfoStore.has(selectedInstId))) {
          if (event.ctrlKey) {
            // Create a new point mask
            const clientMousePos = { x: event.clientX, y: event.clientY }; // Client mouse position
            scope.__addPointInstance(coords.panoCoordsNormalized, coords.point3d, clientMousePos);
          } else {
            scope.selectMask(null);
            return true;
          }
        } else {
          scope.selectMask(selectedMask);
          if (scope.placeObjectMode) {
            scope.__initiateQueryAndPlace(selectedMask.maskId, coords.screenCoordsNormalized);
          }
          return false;
        }
      }
    }
  };
  return new PanoramaViewer(panoParams);
};

ImageMaskObjectPlacer.prototype.exitSpecialMode = function() {
  if (this.specifyPointLabelPositionMode) {
    this.exitSpecifyPointLabelPositionMode();
  }

  if (this.maskCommentUI.active) {
    this.maskCommentUI.close();
  } else {
    this.reset();
  }
};

ImageMaskObjectPlacer.prototype.enterSpecifyPointLabelPositionMode = function(labelInfo) {
  this.specifyPointLabelPositionMode = true;
  this.activeLabelInfo = labelInfo;
  this.sceneEditControls.enabled = false;
  this.sceneEditControls.setCursorStyle('pointer');
}

ImageMaskObjectPlacer.prototype.exitSpecifyPointLabelPositionMode = function() {
  this.specifyPointLabelPositionMode = false;
  delete this.activeLabelInfo;
  this.sceneEditControls.enabled = true;
  this.sceneEditControls.setCursorStyle('initial');
}

ImageMaskObjectPlacer.prototype.__setupUILog = function() {
  const scope = this;
  this.uilog.addEnhancer((evt) => {
    evt.data.associatedMasks = [];
    if (this.selectedMask != null) {
      evt.data.selectedMask = scope.selectedMask.toString();
      evt.data.associatedMasks = [scope.selectedMask.toString()];
    } else {
      evt.data.selectedMask = null;
    }
    if (this.selectedObject3d) {
      evt.data.selectedObject = ModelInstance.getUILogInfo(scope.selectedObject3d, true);
      evt.data.associatedMasks = scope.__findObject3DMasks(scope.selectedObject3d).map((a)=>a.toString());
    }	else {
      evt.data.selectedObject = null;
    }
  });

  this.uilog.addEnhancer(function(evt){
    evt.data.panoramaOverlayed = {
      "enabled": scope.panoMaximized,
      "startTime": null
    };
    if (scope.__panoInteractionInfo) {
      evt.data.panoramaOverlayed.startTime = scope.__panoInteractionInfo.startTime;
    }
  });
};

/** Update panorama camera based on 3D scene camera.
 * @param {THREE.Camera} camera
 * @param {THREE.Matrix4} worldToSceneMatrix
 * @returns Camera look direction in scene coordinate frame
 */
ImageMaskObjectPlacer.prototype.__updatePanoramaCamera = function(camera, worldToSceneMatrix) {
  var sceneCamDir = new THREE.Vector3();
  sceneCamDir.copy(camera.getWorldDirection(sceneCamDir));
  sceneCamDir.applyMatrix4(worldToSceneMatrix);
  sceneCamDir.normalize(); // Just in case
  // console.log("TODO: Update pano camera direction: " + [sceneCamDir.x, sceneCamDir.y, sceneCamDir.z].toString());
  let lookDir = [sceneCamDir.x, sceneCamDir.y, sceneCamDir.z];
  this.panoViewer.setPanoramaLookDirection(lookDir);
  return lookDir;
};

ImageMaskObjectPlacer.prototype.__initiateQueryAndPlace = function(objectId, normalizedClickPoint) {
  const label = this.activeViewpointObjectInfoStore.getMaskLabel(objectId);
  const queryAndPlaceInfo = { objectId: objectId };
  queryAndPlaceInfo.childAttachment = this.labelManager.maskLabelToChildAttachment(label);
  if (this.debug) {
    console.log("Child attachment: ", queryAndPlaceInfo.childAttachment);
  }

  // Trigger search.
  queryAndPlaceInfo.query = this.labelManager.maskLabelToQuery(label);
  if (this.debug) {
    console.log("query: ", queryAndPlaceInfo.query);
  }
  this.__queryAndPlaceInfo = queryAndPlaceInfo;
  this.__sendSearchQuery(queryAndPlaceInfo.query);
  this.viewer.activateTab('models');
};

ImageMaskObjectPlacer.prototype.__initiateAutoPlace = function(normalizedClickPoint){
  this.__autoPlaceClickInsertInfo = null;
  if (this.autoPlace) {
    var editControls = this.sceneEditControls;
    var dragdrop = editControls.dragdrop;
    var supportObjects = dragdrop.getSupportObjects();

    var clientX = normalizedClickPoint.x * editControls.container.clientWidth;
    var clientY = normalizedClickPoint.y * editControls.container.clientHeight;
    var ignored = dragdrop.ignore.concat([dragdrop.selected]);

    var intersect = this.picker.pick({
      targetType: 'object',
      container: editControls.container,
      position: { clientX: clientX, clientY: clientY },
      camera: editControls.cameraControls.camera,
      objects: supportObjects,
      ignore: ignored,
      scene: editControls.scene,
    });

    if (intersect) {
      var normal = intersect.face.normal.clone();
      normal = normal.transformDirection(intersect.descendant.matrixWorld);
      this.__autoPlaceClickInsertInfo = {
        point: intersect.point,
        parent: intersect.object,
        normal: normal
      };
      if (this.debug) {
        console.log('initiateAutoPlace', this.__autoPlaceClickInsertInfo);
      }
    }
  }
};

ImageMaskObjectPlacer.prototype.setObjectInfoStore = function(objectInfoStore){
  this.objectInfoStore = objectInfoStore;
  this.activeViewpointObjectInfoStore = null;
  this.__updateCustomInstances(this.loadedMaskInfos);
  if (this.activeViewpoint && this.instanceMasks) {
    this.__updateActiveViewpointObjectInfoStore();
  }
};

// Helper Methods

/**
 * Selects the given object3D in STK Viewer.
 * @param {THREE.Object3D} object3d
 */
ImageMaskObjectPlacer.prototype.selectObjectIn3DView = function (object3d) {
  // Helper method to select an object in the 3D viewer
  if (!this.viewer.sceneState.hasObject(object3d)) {
    object3d = null;
  }
  if (this.debug) {
    console.log({"Selected Object3D": object3d});
  }
  this.selectedObject3d = object3d;

  this.__skipSelectedInstanceChanged = true; // Break  feedback loop
  this.sceneEditControls.selectObject(object3d);
  this.__skipSelectedInstanceChanged = false;
};

/**
 * Removes the given Object3d from the scene. 
 * @param {THREE.Object3D} object3d
 */
ImageMaskObjectPlacer.prototype.deleteObjectIn3DView = function (object3d) {
  if (!this.viewer.sceneState.hasObject(object3d)) {
    return;
  }

  this.selectObjectIn3DView(object3d);
  this.sceneEditControls.deleteSelected(null);
  this.selectObjectIn3DView(null);
};

/**
 * Adds the given object3D to scene
 * @param {THREE.Object3D} object3d
 */
ImageMaskObjectPlacer.prototype.addObjectTo3DView = function (object3d, parent) {
  this.viewer.sceneState.addObject(Object3DUtil.getModelInstance(object3d));
  console.assert(object3d.parent === parent);
};

/**
 * Highlights object in 3D view
 * @param {THREE.Object3D} object3d
 */
ImageMaskObjectPlacer.prototype.highlightObjectIn3DView = function (object3d) {
  this.picker.highlightObject(object3d);
  if (this.debug) {
    console.log({highlight: object3d});
  }
};

/**
 * Highlight objects in 3D view
 * @param {THREE.Object3D} object3d
 */
ImageMaskObjectPlacer.prototype.highlightObjectsIn3DView = function (object3ds) {
  this.picker.highlightObjects(object3ds);
  if (this.debug) {
    console.log({highlights: object3ds});
  }
};

/**
 * Unhighlights object in 3D view
 * @param {THREE.Object3D} object3d
 */
ImageMaskObjectPlacer.prototype.unHighlightObjectIn3DView = function (object3d) {
  this.picker.unhighlightObject(object3d);
  if (this.debug) {
    console.log({unhighlight: object3d});
  }
};

/**
 * Unhighlights objects in 3D view
 * @param {THREE.Object3D} object3d
 */
ImageMaskObjectPlacer.prototype.unHighlightObjectsIn3DView = function (object3ds) {
  this.picker.unhighlightObjects(object3ds);
  if (this.debug) {
    console.log({unhighlights: object3ds});
  }
};

/**
 * Rotate object by y axis in 3D view
 * @param {ModelInstance} modelInstance
 * @param {THREE.Vector3} axis
 * @param {float} rotateBy
 */

ImageMaskObjectPlacer.prototype.rotateModel = function (modelInstance, axis, rotateBy) {
  this.viewer.rotateModels([modelInstance], axis, rotateBy);
};

// End of Helper Methods

// Event Handlers

ImageMaskObjectPlacer.prototype.__onDeletedObject = function(object3d, minst){
  var maskAddresses = this.__findObject3DMasks(object3d);
  maskAddresses.forEach((maskAddress) => {
    this.removeMaskObjectAssignment(maskAddress, object3d); // Last removal of this should clear mask assignments of children.
    if (this.debug) {
      console.log({"Deleted":{"modelInstance": minst, "object3d": object3d, maskAddress:maskAddress, toReplaceInfo:this.__toReplaceInfo}});
    }
  });
  this.__onMaskAnnotationUpdated(maskAddresses);
  this.selectObjectIn3DView(null);
};

ImageMaskObjectPlacer.prototype.__fixupMaskInfos = function(sceneState) {
  const json = sceneState.json;
  const maskAnnotations = this.maskAnnotations;
  if (json.maskInfos) {
    if (json.maskObjectAssignments) {
      // Make sure maskInfos are properly populated
      json.maskInfos.forEach(maskInfo => {
        if (maskInfo.photoId == null && maskInfo.isCustom) {
          const photoIds = maskAnnotations.maskObjectAssignments.lookupPhotoIdsForMaskId(maskInfo.id);
          if (photoIds.length === 1) {
            maskInfo.photoId = photoIds[0];
          }
        }
      });
    }

    // Check with maskinfos are missing
    const annotatedIds = maskAnnotations.getAnnotatedIds();
    const maskInfoIds = new Set();
    for (let maskInfo of json.maskInfos) {
      maskInfoIds.add(maskInfo.id);
    }
    for (let id of annotatedIds) {
      if (!maskInfoIds.has(id)) {
        const annotation = maskAnnotations.getAnnotation(id);
        if (annotation.objects) {
          console.warn('Missing info for annotated', id, annotation);
          const object3d = annotation.objects[0].object3d;
          console.log(object3d.name);
          json.maskInfos.push({
            id: id, photoId: annotation.objects[0].maskAddress.photoId,
            label: 'unknown',
            isCustom: true, isMissing: true
          });
        }
      }
    }
  }
}

ImageMaskObjectPlacer.prototype.__checkUnmatchedModelInstances = function(sceneState) {
  const maskAnnotations = this.maskAnnotations;
  // Check if there are some model instances not included in maskObjectAssignments
  const unmatched = [];
  for (let modelInstance of sceneState.modelInstances) {
    const masks = maskAnnotations.findObject3DMasks(modelInstance.object3D);
    if (masks.length === 0) {
      console.warn('Object without mask', modelInstance.object3D.userData);
      modelInstance.object3D.userData.unmatched = true;
      unmatched.push(modelInstance);
    }
  }
  if (unmatched.length) {
    bootbox.confirm({
      "message":
        `There are ${unmatched.length} objects that are not assigned to masks, do you want to automatically remove them?` +
        '<br/>If you want to manually check and remove them, you can search for "unmatched:true" in the "Scene Hierarchy" panel',
      "buttons": {
        confirm: { label: "Yes" },
        cancel: { label: "No" }
      },
      "callback": (result) => {
        if (result) {
          // remove unmatched model instances
          sceneState.removeModelInstances(unmatched);
          this.viewer.showMessage('Removed ' + unmatched.length + ' objects');
        }
      }
    });
  }
  return unmatched;
}

ImageMaskObjectPlacer.prototype.__fixupMaskInfosCustomMissing = function() {
  const maskAnnotations = this.maskAnnotations;
  for (let maskInfo of this.activeViewpointObjectInfoStore.values()) {
    if (maskInfo.isMissing) {
      const annotation = maskAnnotations.getAnnotation(maskInfo.id);
      const object3d = annotation.objects[0].object3d;
      const pointInfo = this.__getPointInfoForObject(object3d);
      maskInfo.type = 'point';
      maskInfo.point3d = pointInfo.point3d;
      maskInfo.pointNormalized = pointInfo.panoCoordsNormalized
    }
  }
}

ImageMaskObjectPlacer.prototype.__onSceneLoaded = function(sceneState){
  // TODO: Load object mask correspondences
  if (sceneState.json) {
    this.maskAnnotations.populate(sceneState.json, sceneState.modelInstances);
    this.__fixupMaskInfos(sceneState);
    this.__updateCustomInstances(sceneState.json.maskInfos);
    this.__checkUnmatchedModelInstances(sceneState);
  }

  // Restore edit mode
  this.viewer.setEditMode(true);
};

ImageMaskObjectPlacer.prototype.__findObject3DMasks = function(object3d) {
  return this.maskObjectAssignments.findObject3DMasks(object3d);
};

/**
 * Event handler triggered when 3D object is hovered over.
 * Highlights 3D object and image object.
 * @param {Object3D} object3d 
 * @param {boolean} isHighlight 
 */
ImageMaskObjectPlacer.prototype.__on3DViewerHighlightChanged = function (object3d, isHighlight) {
  const scope = this;

  if (isHighlight) {
    this.hoverHighlightObject(object3d);
  } else {
    this.hoverHighlightObject(null);
  }

  var foundMatches = this.__findObject3DMasks(object3d);
  if (!foundMatches) {
    if (isHighlight) {
      // The highlighted object is not mask assigned
      console.error({"Highlighted object not assigned to mask. Removing zombie object.": object3d});
      this.viewer.deleteObject(object3d, {reason: "Removed zombie object"});
    }
    scope.hoverHighlightObject(null);
  }
};

/**
 * Event handler triggered when user cancels insert operation
 * @param {modelInstance} modelInstance
 * @param {params}  
 */
ImageMaskObjectPlacer.prototype.__onModelInsertCancelled = function (modelInstance, params) {
  this.__isInserting = false;
  this.__showHUD();

  if (this.debug) {
    console.log({"ModelInsertCancelled": {"modelInstance": modelInstance, "params": params}});
  }
  if (this.__toReplaceInfo) {
    // TODO: Specify parent
    this.addObjectTo3DView(this.__toReplaceInfo.object3d, this.__toReplaceInfo.parent);

    this.assignObjectToMask(this.selectedMask, this.__toReplaceInfo.object3d);
    this.__toReplaceInfo = null;
  }
};

ImageMaskObjectPlacer.prototype.__hideHUD = function() {
  if (this.progressBar) {
    this.progressBar.setVisible(false);
  }
  if (!this.panoMaximized) {
    this.panoViewer.setVisible(false);
  }
};

// ImageQueryControls.prototype._onPasteStarted = function(modelInstance){
  // this.__onInsertStart(modelInstance, {how: "PASTE"});
// }

ImageMaskObjectPlacer.prototype._onPasteCompleted = function(modelInstance) {
  this.__onInsertStart(modelInstance, { how: "PASTE" });
  this.__onModelPlaced(modelInstance, { opType: "PASTE", object3D: modelInstance.object3D });
};

ImageMaskObjectPlacer.prototype.__onModelLoaded = function(modelInstance, params) {
  this.__onInsertStart(modelInstance, { how: "INSERT" });
  if (this.debug) {
    console.log({"event": "ModelLoaded", "modelInstance": modelInstance, "params": params});
  }
};

/**
 * Event handler triggered when user clicks on model to insert.
 * Clears previous assignment and sets visibility.
 * @param {modelInstance} modelInstance 
 */
ImageMaskObjectPlacer.prototype.__onInsertStart = function (modelInstance, params) {
  this.__isInserting = true;

  this.__hideHUD();
  if (this.selectedObject3d) {
    var existingObjectInfo = {
      modelInstance: this.selectedModelInstance,
      object3d: this.selectedObject3d,
      parent: this.selectedObject3d.parent,
      worldPosition: this.selectedObject3d.getWorldPosition(new THREE.Vector3()),
      assignedMasks: this.__findObject3DMasks(this.selectedObject3d)
    };
    if (this.oneToOne) {
      this.maskObjectAssignments.clearMaskAssignment(this.selectedMask);
      if (this.debug) {
        console.log({"Removed": existingObjectInfo, "Added": modelInstance});
      }
    } else{
      // Clear all mask assignments to this object so it will get automatically removed.
      this.maskObjectAssignments.removeAssignmentsForObject3D(existingObjectInfo.object3d);
      if (this.debug) {
        console.log({"Removed": existingObjectInfo, toReplaceInfo: this.__toReplaceInfo});
      }
    }
    this.__toReplaceInfo = existingObjectInfo;
  } else {
    this.__toReplaceInfo = null;
  }
  if (this.selectedMask || this.__toReplaceInfo) {
    var object = modelInstance.object3D;
    if (this.debug) {
      console.log("Loaded!" + object.userData.id);
    }
    this.viewer.unblockInsert();

    if (this.__toReplaceInfo != null) {
      this.viewer.setEditMode(false);
    } else if (this.autoPlace && this.__autoPlaceClickInsertInfo) {
      // Switch over to auto place with point and click
      this.viewer.setEditMode(false);
    } else {
      // Neither replacement nor point and click.
      this.invokePoseSuggester(modelInstance);
    }
  } else {
    if (params.how === "INSERT") {
      this.sceneEditControls.cancelInsertion();
    } else if (params.how === "PASTE") {
      // this.viewer.deleteObject(modelInstance.object3D, {reason: "Pasted zombie object"});
    }
    this.viewer.showWarning('Please select a mask first or an object to replace.');
    this.viewer.blockInsert();
  }
};

// Pose suggester
ImageMaskObjectPlacer.prototype.prefetchPose = function(){
  let maskedView = this.panoViewer.getMaskedView();
  if (this.poseSuggester && this.poseSuggester.enabled && this.poseSuggester.prefetch && this.selectedMask) {
    this.poseSuggester.fetchPose(this.viewer.sceneState.arch.ref, null, maskedView, this.selectedMask,
      (err, result) => {
      }
    );
  }
};

ImageMaskObjectPlacer.prototype.__applyPose = function(modelInstance, pose) {
  console.log('Pose suggestor: applying pose', pose, modelInstance.object3D.userData);
  if (pose.isSupported) {
    const azimuth = pose.azimuth * Math.PI / 180;
    console.log("RLSD applyPose: predicted rotate by", azimuth);
    // var baseRotateBy = this.rlsdConfigManager.getCameraLookDirectionOnPlane(this); // TODO: @Qirui: Since masks are pre-computed, we should no longer add the current camera angle.
    // console.log("baseRotateBy", baseRotateBy);
    // this.rotateModel(modelInstance, new THREE.Vector3(0,1,0), baseRotateBy + azimuth);
    //console.log("initial angle", modelInstance.object3D.rotation.setFromVector3(new THREE.Vector3(Math.PI, 0, Math.PI)));
    const position = modelInstance.object3D.position.clone();
    console.log("RLSD applyPose: original rotation and position",  modelInstance.object3D.rotation.clone(),  modelInstance.object3D.position.clone());
    modelInstance.clearRotation();
    Object3DUtil.alignToUpFrontAxes(modelInstance.object3D, Constants.worldUp, Constants.worldFront, this.sceneState.info.up, this.sceneState.info.front);
    console.log("RLSD applyPose: initial rotation and position",  modelInstance.object3D.rotation.clone(),  modelInstance.object3D.position.clone());
    this.rotateModel(modelInstance, Constants.worldUp, azimuth);
    console.log("RLSD applyPose: final rotation and position",  modelInstance.object3D.rotation.clone(),  modelInstance.object3D.position.clone());
    modelInstance.object3D.position.copy(position);
  }
};

ImageMaskObjectPlacer.prototype.invokePoseSuggester = function(modelInstance) {
  if (!this.poseSuggester.enabled) {
    return; // Pose suggester not enabled
  }

  const maskedView = this.panoViewer.getMaskedView();
  const sceneState = this.viewer.sceneState;
  let pose = this.poseSuggester.getPose(sceneState.arch.ref, modelInstance, maskedView, this.selectedMask);
  if (!pose) {
    pose = this.poseSuggester.getPose(sceneState.arch.ref, null, maskedView, this.selectedMask);
  }

  if (pose) {
    this.__applyPose(modelInstance, pose);
  } else {
    var waitingKey = this.viewer.addWaitingToQueue('suggestPose');
    this.poseSuggester.fetchPose(sceneState.arch.ref, modelInstance, maskedView, this.selectedMask,
      (err, resPose) => {
        if (err) {
          // TODO: handle error
          this.viewer.showWarning('Error invoking pose suggester');
        } else {
          this.__applyPose(modelInstance, resPose);
        }
        this.viewer.removeWaiting(waitingKey, 'suggestPose');
        console.log("pose suggest finish...");
      }
    );
  }
};

/**
 * Event handler triggered when user clicks on 3D model.
 * Selects the object and image mask.
 * @param {modelInstance} modelInstance
 */
ImageMaskObjectPlacer.prototype.__onSelectedInstanceChanged = function (modelInstance) {
  console.log('selectedInstanceChanged', modelInstance);
  if (this.__isInserting) return; // Break feedback loop (when new model inserted)
  if (this.__skipSelectedInstanceChanged) return;

  if (modelInstance) {
    const object3d = modelInstance.object3D;
    this.selectedObject3d = object3d;
    if (this.debug) {
      console.log({"Selected Object3D": this.selectedObject3d});
    }
    if (this.linkedMaskObjectSelection) {
      this.selectMaskFromObject(object3d);
    } else{
      this.selectMask(null); // Since we are selecting an object, a mask cannot be selected.
    }
    // this.viewer.unblockInsert();
  } else {
    this.selectedObject3d = null;
    if (this.debug) {
      console.log({"Selected Object3D": this.selectedObject3d});
    }
    if (this.linkedMaskObjectSelection) {
      this.selectMaskFromObject(null);
    }
    if (this.selectedMask == null) {
      // this.viewer.blockInsert();
    }
  }
  if (this.debug) {
    console.log({"event": "SelectedInstanceChanged", "modelInstance": modelInstance});
  }
};

ImageMaskObjectPlacer.prototype.__onAutoPlaceModelPlaced = function(modelInstance, params){
  var object = params.object3D;
  var childAttachment = this.__queryAndPlaceInfo.childAttachment;
  var insertInfo = this.__autoPlaceClickInsertInfo;

  Object3DUtil.attachToParent(object, insertInfo.parent, this.viewer.scene);

  if (this.debug) {
    console.log('modelPlaced on click', childAttachment, this.bottomAttachmentAdjustmentEnabled, insertInfo);
  }
  if (object.userData.defaultAttachment != null) {
    object.userData.defaultAttachment = childAttachment;
  }
  if (childAttachment.childBBFaceIndex != null) {
    modelInstance.setAttachmentPoint({
      position: Object3DUtil.FaceCenters01[childAttachment.childBBFaceIndex],
      coordFrame: 'childBB'});
  }

  if (childAttachment.attachmentSurface === 'bottom' || insertInfo.normal.y > 0.9) {
    if (this.bottomAttachmentAdjustmentEnabled && childAttachment.restrictToArch) {
      let floorHeight = this.getRoomFloorHeight(insertInfo.object, insertInfo.point);
      if (floorHeight != null) {
        insertInfo.point.y = floorHeight;
      }
      if (this.debug) {
        console.log("floor height: ", floorHeight);
      }
    }

    // Bottom attachment
    Object3DUtil.placeObject3DByOrigin(object, insertInfo.point);
    this.invokePoseSuggester(modelInstance);
  } else if (childAttachment.attachmentSurface === 'top') {
    Object3DUtil.placeObject3DByOrigin(object, insertInfo.point);
  } else {
    // Assume side attachment
    Object3DUtil.placeObject3DByOrigin(object, insertInfo.point);

    // Compute angle
    let dx = insertInfo.normal.x;
    let dz = insertInfo.normal.z;

    var alpha = Math.acos(dx);
    if (dz > 0) {
      alpha = -alpha;
    }
    let angle = Math.PI/2 - alpha;
    this.rotateModel(modelInstance, new THREE.Vector3(0,-1,0), angle);
    if (this.debug) {
      console.log('rotateModel', {dx: dx, dz: dz, ang: angle});
    }
    // Update angle based on pose suggester, if the pose suggester supports the object.
    // Skip pose suggester since we have computed an angle to attach on back side.
    // this.invokePoseSuggester(modelInstance);
  }
  object.updateMatrix();
  Object3DUtil.clearCache(object);
  this.__autoPlaceClickInsertInfo = null;
};

ImageMaskObjectPlacer.prototype.getRoomFloorHeight = function (object, point) {
  let regionId = this.viewer.activeViewpoint.getRegionId();
  let room = this.viewer.sceneState.getRoomById(regionId);
  // let room = this.viewer.sceneState.fullScene.children[0].children[0].children.filter(r => (parseInt(r.userData.id) == roomIndex))[0];
  return this.viewer.sceneState.getFloorHeight(room, null);
};

ImageMaskObjectPlacer.prototype.displayMaskComment = function () {
  if (this.selectedMask) {
    this.maskCommentUI.display(this.maskAnnotations.getComment(this.selectedMask));
  } else if (this.selectedObject3d) {
    var objectMasks =  this.__findObject3DMasks(this.selectedObject3d);
    if (objectMasks.length === 1) {
      this.maskCommentUI.display(this.maskAnnotations.getComment(objectMasks[0]));
    } else if (objectMasks.length === 0) {
      this.viewer.showWarning('Cannot edit comment: no masks associated with object');
    } else {
      this.viewer.showWarning('Cannot edit comment: multiple masks associated with object');
    }
  }
};

ImageMaskObjectPlacer.prototype.setupMaskComment = function (container) {
  this.maskCommentUI = new MaskCommentUI(container);
  this.maskCommentUI.Subscribe('submit', this, (json) => {
    this.maskAnnotations.setComment(this.selectedMask, json);
    this.__onMaskAnnotationUpdated(this.selectedMask);
  });
  this.maskCommentUI.Subscribe('delete', this, () => {
    this.maskAnnotations.deleteComment(this.selectedMask);
    this.__onMaskAnnotationUpdated(this.selectedMask);
  });
};

ImageMaskObjectPlacer.prototype.__showHUD = function() {
  if (this.progressBar) {
    this.progressBar.setVisible(true);
  }
  this.panoViewer.setVisible(true);
};

ImageMaskObjectPlacer.prototype.__replace = function(modelInstance, replaceObjectInfo) {
  // The newly placed object replaces the object in toReplaceInfo
  if (this.debug) {
    console.log('Got replace info', replaceObjectInfo);
  }
  var oldModelInst = replaceObjectInfo.modelInstance;
  var oldObject3D = oldModelInst.object3D;
  var newObject3D = modelInstance.object3D;

  // Have the new model have the same attachment point
  var oldAttachment = oldModelInst.getCurrentAttachment();
  if (oldAttachment) {
    modelInstance.setAttachmentPoint(oldAttachment);
  }
  // The new object should have the same parent as the replaced object
  Object3DUtil.attachToParent(newObject3D, this.__toReplaceInfo.parent, this.viewer.scene);
  // Have the new model have the same position and rotation
  var worldPos = replaceObjectInfo.worldPosition;
  Object3DUtil.placeObject3DByOrigin(newObject3D, worldPos);
  newObject3D.rotation.copy(oldObject3D.rotation);
  // object.scale.set(replaceObjectInfo.object3d.scale.x, replaceObjectInfo.object3d.scale.y, replaceObjectInfo.object3d.scale.z);
  newObject3D.updateMatrix();
  Object3DUtil.clearCache(newObject3D);
};

/**
 * Event handler triggered when user places a model.
 * Edits visibility
 * @param {modelInstance} modelInstance
 * @param {params}  
 */
ImageMaskObjectPlacer.prototype.__onModelPlaced = function (modelInstance, params) {
  if (params.opType === Constants.CMDTYPE.MOVE) {
    return;
  }
  if (this.debug) {
    console.log({"event": "ModelPlaced", "modelInstance": modelInstance, "params": params});
    console.log("Updated Assignments: ", this.maskObjectAssignments);
  }

  // Restore edit mode
  this.viewer.setEditMode(true);

  this.__isInserting = false;
  this.__showHUD();

  if (this.selectedMask == null && this.__toReplaceInfo == null) {
    return;
  }
  if (params.opType === 'INSERT' || params.opType === 'PASTE') {

    var object = params.object3D;
    if (this.__toReplaceInfo) {
      this.__replace(modelInstance, this.__toReplaceInfo);
    } else if (this.autoPlace && this.__autoPlaceClickInsertInfo) {
      this.__onAutoPlaceModelPlaced(modelInstance, params);
    }

    // Check and Remove Existing Object and Mask Assignment
    if (this.oneToOne) {
      this.maskObjectAssignments.clearMaskAssignment(this.selectedMask);
    }
    if (this.__toReplaceInfo) {
      this.__toReplaceInfo.assignedMasks.forEach((assignedMask) => {
        this.assignObjectToMask(assignedMask, object);
      });
    } else if (this.selectedMask) {
      this.assignObjectToMask(this.selectedMask, object);
    } else {
      console.assert(false);
    }
    this.__onMaskAnnotationUpdated(this.selectedMask);
    this.selectObjectIn3DView(object);
    if (!this.linkedMaskObjectSelection) {
      this.selectMask(null);
    }
    this.__toReplaceInfo = null;
  }
};

/**
 * Make sure that mask address is updated
 * @param maskAddress {MaskAddress|MaskAddress[]}
 * @private
 */
ImageMaskObjectPlacer.prototype.__onMaskAnnotationUpdated = function(maskAddress) {
  if (maskAddress) {
    var maskAddresses = Array.isArray(maskAddress) ? maskAddress : [maskAddress];
    this.Publish('maskAnnotationUpdated', maskAddresses);
    this.updateProgressBar();
  }
};

// End of Event Handlers

/**
 * Selects an object in the image mask
 * @param {THREE.Object3D} object3d
 */
ImageMaskObjectPlacer.prototype.selectMaskFromObject = function (object3d) {
  if (object3d) {
    // Do reverse lookup for the mask
    var foundMatches = this.__findObject3DMasks(object3d);
    console.assert(foundMatches.length <= 1);
    if (this.activeViewpoint != null) {
      if (foundMatches) {
        this.selectMask(foundMatches[0]);
      } else {
        console.info("Selected an object without a mask. This usually happens during the insert induced by a paste.");
        // this.selectMask(null);
      }
    }
  } else {
    this.selectMask(null);
  }
};

/**
 * Merges Object Mask Assignment information to the save data.
 * @param json {Object} json into which the annotation will be merged (output from SceneState.toJson)
 */
ImageMaskObjectPlacer.prototype.mergeAnnotationData = function (json) {
  var instanceIdObjectJsonMap = new Map();
  json["scene"]["object"].forEach((object_json) => {
    instanceIdObjectJsonMap.set(object_json["id"], object_json);
  });
  var assignments = this.maskObjectAssignments.getAssignmentsArray(instanceIdObjectJsonMap);
  var comments = this.maskAnnotations.getCommentsArray();

  json["maskObjectAssignments"] = assignments;
  json["maskComments"] = comments;
  const maskIdsSet = this.maskAnnotations.getAnnotatedIds();
  for (let k of this.activeViewpointObjectInfoStore.keys()) {
    maskIdsSet.add(k);
  }
  for (let v of this.objectInfoStore.values()) {
    if (v.isCustom) {
      maskIdsSet.add(v.id);
    }
  }
  const maskIds = _.sortBy([...maskIdsSet], x => x);
  json['maskInfos'] = maskIds.map(id => {
    const maskInfo = this.objectInfoStore.get(id);
    return _.pick(maskInfo, ['id', 'label', 'type', 'isCustom', 'point3d', 'pointNormalized', 'photoId']);
  });
  return json;
};

ImageMaskObjectPlacer.prototype.removeMaskObjectAssignment = function (maskAddress, object3d){
  return this.maskObjectAssignments.removeAssignment(maskAddress, object3d);
};

/**
 * Assigns an object to given mask
 * @param {MaskAddress} selectedMask
 * @param {Object3D} object
 */
ImageMaskObjectPlacer.prototype.assignObjectToMask = function (selectedMask, object) {
  this.maskObjectAssignments.assignObjectToMask(selectedMask, object);
};

ImageMaskObjectPlacer.prototype.selectMaskById = function(maskId, clickPoint) {
  // TODO: Figure out what is up with the maskAddress (why it exist versus a simple object mask id?
  if (maskId != null) {
    var maskAddr = new MaskAddress(this.activeViewpoint.id, maskId, clickPoint);
    this.selectMask(maskAddr);
  } else {
    this.selectMask(null);
  }
};

/**
 * Selects the given mask.
 * @param {MaskAddress} maskAddress 
 */
ImageMaskObjectPlacer.prototype.selectMask = function (maskAddress) {
  var selectedPoints = this.panoViewer.selectPointInstances(maskAddress? maskAddress.maskId : null);
  if (!selectedPoints) {
    this.__hideLabelInputTooltip(true);
  }

  if (this.isHighlightedAll) {
    this.isHighlightedAll = false;
  }
  // Update selected mask
  var prevMask = this.selectedMask;
  this.selectedMask = maskAddress;
  this.viewer.statusbar.setAllowMaskComment(this.selectedMask != null);

  // Highlight selected object
  this.highlightSelectedObjectInPhoto();

  if (this.selectedMask == null) {
    if (this.linkedMaskObjectSelection) {
      // Deselect selection in 3D
      this.selectObjectIn3DView(null);
    }
    if (this.selectedObject3d == null) {
      // this.viewer.blockInsert();
    }
    if (this.debug) {
      console.log("Clear selection");
    }
  } else {
    // this.viewer.unblockInsert();
    if (this.debug) {
      console.log("Mask Object Assignments: ", this.maskObjectAssignments);
    }
    if (this.linkedMaskObjectSelection) {
      const assignments = this.maskObjectAssignments.get(this.selectedMask);
      if (assignments) {
        // Select the assigned object in 3D viewer.
        console.assert(assignments.length === 1);
        this.selectObjectIn3DView(assignments[0].object3d);
      } else {
        // Deselect
        this.selectObjectIn3DView(null);
      }
    } else {
      this.selectObjectIn3DView(null); // Since we are selecting a mask, an object cannot be selected.
    }
    if (this.debug) {
      console.log("Selected: " + this.selectedMask);
    }
  }
  this.prefetchPose();

  if (this.uilog) {
    var modelInfos = [];
    if (this.selectedMask) {
      const assignments = this.maskObjectAssignments.get(this.selectedMask);
      if (assignments) {
        assignments.forEach((objectMaskPair) => {
          modelInfos.push(ModelInstance.getUILogInfo(objectMaskPair.object3d, true));
        });
      }
    }
    if (prevMask !== this.selectedMask) {
      this.uilog.log(UILog.EVENT.SELECT_MASK, null, {associatedModelInfos: modelInfos});
    }
  }

  var maskLabel = this.selectedMask? this.activeViewpointObjectInfoStore.getMaskLabel(this.selectedMask.maskId) : null;
  this.Publish('maskSelected', this.selectedMask, maskLabel);
};

ImageMaskObjectPlacer.prototype.createProgressBar = function () {
  if (this.progressBar) {
    return;
  }
  this.progressBar = new ProgressBar({
    progress: $('#progress'),
    bar: $('#bar'),
    barText: $('#barText')
  });

  var scope = this;
  var progress = this.progressBar.progressElement;
  progress.click(function (event) {
    scope.isHighlightedAll = !scope.isHighlightedAll;
  });
  progress.mouseenter(function (event) {
    if (!scope.isHighlightedAll) {
      scope.progressBar.setHoverProgress(true);
    }
  });
  progress.mouseleave(function (event) {
    if (!scope.isHighlightedAll) {
      scope.progressBar.setHoverProgress(false);
    }
  });
};

ImageMaskObjectPlacer.prototype.updateProgressBar = function () {
  if (this.progressBar) {
    var done = this.countCompleted();
    var total = this.activeViewpointObjectInfoStore? this.activeViewpointObjectInfoStore.size : 0;
    this.progressBar.update(done, total);
  }
};

ImageMaskObjectPlacer.prototype.countCompleted = function () {
  return this.maskAnnotations.getAnnotatedCount();
};

/**
 * Resets the scene editor
 * @param {parameters} params 
 */
ImageMaskObjectPlacer.prototype.reset = function (params) {
  params = params || {};
  this.scene = params.scene || this.scene;
  this.sceneState = params.sceneState || this.sceneState;

  this.searchController.setSearchText('');
  this.active = true;
};

/**
 * Creates the hidden instance image used to create the object masks
 * @param {filepath} url
 */
ImageMaskObjectPlacer.prototype.__loadInstanceMasks = function (url) {
  var image;
  var scope = this;
  let promise = new Promise(function(resolve) {
    image = document.createElement('img');
    image.src = url;
    image.onload = () => resolve(image);
  }).then(function(result) {
    var res = ImageUtil.getImageDataScaled(result, 1);
    // var res = ImageUtil.getImageData(result);
    return res;
  }).then(function(result) {
    result.isRGBA = true;
    scope.instanceMasks = new InstanceMasks(result);
    scope.instanceMasks.init();
  });
  return promise;
};

/**
 * Sets the selected object to be highlighted using its buffer and the image
 * @param {img} image
 */
ImageMaskObjectPlacer.prototype.highlightSelectedObjectInPhoto = function () {
  if (this.selectedMask == null) {
    this.panoViewer.clearSelectedHighlight();
  } else {
    var selectedMaskBuffer = this.instanceMasks.getColoredInstanceHighlightMask(this.selectedMask.maskId, 'selected');
    if (selectedMaskBuffer) {
      this.panoViewer.highlightSelected(selectedMaskBuffer.data, selectedMaskBuffer.width, selectedMaskBuffer.height);
    } else {
      console.warn('Invalid selected maskId', this.selectedMask.maskId);
    }
  }
};

ImageMaskObjectPlacer.prototype.__clearHovered = function() {
  // Unhighlight past highlight mask
  this.panoViewer.clearHoverHighlight();

  if (this.__hoverObjects.length) {
    this.unHighlightObjectsIn3DView(this.__hoverObjects);
  }
  this.__hoverObjects = [];
  this.__hoverMasks = [];
};

ImageMaskObjectPlacer.prototype.__updateHoverMaskHighlight = function(maskAddress, maskIndex) {
  if (!this.activeViewpoint) {
    console.log('Active viewpoint not ready');
    return false;
  }

  if (this.activeViewpoint.id != maskAddress.photoId) {
    // The hovered object is not assigned to this viewpoint
    console.log('Mismatch of viewpoint to requested mask', this.activeViewpoint.id, maskAddress.photoId);
    return false;
  }

  var instanceMask = this.instanceMasks? this.instanceMasks.getInstanceHighlightMask(maskAddress.maskId) : null;
  if (!instanceMask) {
    // Happens when the hovered object has a mask assigned from a different viewpoint
    console.warn('No instance mask for', maskAddress.maskId);
    return false;
  }

  // Alters highlight color based on object match status
  const mode = InstanceMasks.getColorMode(this.maskAnnotations, maskAddress);
  InstanceMasks.changeHighlightColoration(instanceMask, mode);

  this.panoViewer.highlightHover(instanceMask.data, instanceMask.width, instanceMask.height, maskIndex);
  return true;
};

/**
 * Highlights a 3D object and associated masks
 * @param {MaskAddress} maskAddress 
 */
ImageMaskObjectPlacer.prototype.hoverHighlightObject = function(object3d) {
  if (!object3d) {
    // Nothing hovered
    // Unhighlight past highlight masks
    if (this.__hoverObjects.length) {
      this.__clearHovered();
    }
  } else if (JSON.stringify([object3d.uuid])!== JSON.stringify(this.__hoverObjects.map((v)=>v.uuid))) {
    // object that is hovered has changed
    this.__clearHovered();

    // Highlight hovered object
    this.highlightObjectIn3DView(object3d);

    // Highlight masks associated with hovered object
    var associatedMasks = this.__findObject3DMasks(object3d);
    var maskIndex = 0;
    // TODO: Review and refactor this code (it is very similar to the hoverHighlightMask code)
    associatedMasks.forEach((maskAddress) => {
      this.__hoverMasks.push(maskAddress);
      const updated = this.__updateHoverMaskHighlight(maskAddress, maskIndex);
      if (updated) {
        maskIndex++;
      }
    });
  }
  // Update hover objects
  this.__hoverObjects = (object3d)? [object3d] : [];
};

ImageMaskObjectPlacer.prototype.hoverHighlightMaskById = function(maskId) {
  // TODO: Figure out what is up with the maskAddress (why it exist versus a simple object mask id?
  if (maskId != null) {
    var maskAddr = new MaskAddress(this.activeViewpoint.id, maskId, null);
    this.hoverHighlightMask(maskAddr);
  } else {
    this.hoverHighlightMask(null);
  }
};

/**
 * Highlights a mask and associated 3D objects
 * @param {MaskAddress} maskAddress
 * @param {{x: number, y: number}} pos
 */
ImageMaskObjectPlacer.prototype.hoverHighlightMask = function(maskAddress, pos) {
  this.__hideLabelTooltip();
  const hoveredPoints = this.panoViewer.highlightPointInstances(
    maskAddress? maskAddress.maskId : null, this.maskAnnotations);

  if (!maskAddress && this.__hoverMasks) {
    // Nothing hovered - clear highlight
    this.__clearHovered();
  } else if (JSON.stringify([maskAddress.toString()]) !== JSON.stringify(this.__hoverMasks.map((v)=> v.toString()))) {
    this.__clearHovered();
    // mask that is hovered has changed
    const hoveredMask = (hoveredPoints === 0)? this.__updateHoverMaskHighlight(maskAddress, 0) : 0;
    if (hoveredMask || hoveredPoints) {
      // Highlight in 3D view
      const maskObjectPairs = this.maskObjectAssignments.get(maskAddress);
      if (maskObjectPairs) {
        maskObjectPairs.forEach((maskObjectPair) => {
          this.__hoverObjects.push(maskObjectPair.object3d);
        });
      }
      this.highlightObjectsIn3DView(this.__hoverObjects);
    }
  }

  if (maskAddress) {
    this.__hoverMasks = [maskAddress];
    if (pos) {
      const hoverQuery = this.labelManager.maskLabelToQuery(this.activeViewpointObjectInfoStore.getMaskLabel(maskAddress.maskId));
      this.__showLabelTooltip(pos, hoverQuery.maskLabel);
    }
  } else {
    this.__hoverMasks = [];
  }
};

ImageMaskObjectPlacer.prototype.__hideLabelInputTooltip = function(updateSelectedIfVisible) {
  if (this.__tooltipInput && this.__tooltipInput.is(":visible")) {
    if (updateSelectedIfVisible && this.__selectedMask != null) {
      const input = this.__tooltipInput.find('input[type=text]');
      if (input.val().trim() === '') {
        input.val('unknown');
      }
      input.change();
    }
    this.__tooltipInput.css('visibility', 'hidden');
  }
};

ImageMaskObjectPlacer.prototype.__showLabelInputTooltip = function(pos, label) {
  if (!this.__tooltipInput) {
    var tooltipInput = $('<div class="tooltipText"></div>')
      .append($('<input type="text"/>'));
    tooltipInput.change(() => {
      var label = tooltipInput.find('input[type=text]').val();
      this.__selectedMaskInfo.label = label;
      if (this.placeObjectMode) {
        this.__initiateQueryAndPlace(this.selectedMask.maskId);
        this.__hideLabelInputTooltip(false);
      }
    });
    $('body').append(tooltipInput);
    this.__tooltipInput = tooltipInput;
  }
  this.__tooltipInput.find('input[type=text]').val(label);
  this.__tooltipInput.css({'top': `${pos.y}px`, 'left': `${pos.x}px`, 'visibility': 'visible', 'opacity': '1'});
};

ImageMaskObjectPlacer.prototype.__hideLabelTooltip = function() {
  if (this.__tooltipText) {
    this.__tooltipText.css('visibility', 'hidden');
  }
};

ImageMaskObjectPlacer.prototype.__showLabelTooltip = function(pos, label) {
  if (!this.__tooltipText) {
    this.__tooltipText = $('<div class="tooltipText"></div>');
    $('body').append(this.__tooltipText);
  }
  this.__tooltipText.css({'top': `${pos.y}px`, 'left': `${pos.x}px`,
    'visibility': 'visible', 'opacity': '1', 'textTransform': 'capitalize'}).text(label);
};

/**
 * Creates the highlight all button
 */
ImageMaskObjectPlacer.prototype.__createHighlightAllButton = function (container) {
  var iconURL = Constants.ICON_PATH + 'highlight';
  var imageButton = new ImageButton({
    'iconUrl': iconURL + '_normal.png',
    'activeUrl': iconURL + '_active.png',
    container: container,
    click: (event) => {
      this.isHighlightedAll = !this.isHighlightedAll;
    }
  });
  imageButton.element
    .attr('id', 'highlightButton')
    .addClass('highlightControlsButton');
  return imageButton;
};

/**
 * Highlights all the instances in the image window
 */
ImageMaskObjectPlacer.prototype.__highlightAll = function () {
  const pixels = this.instanceMasks.getAllMasksHighlight(this.activeViewpointObjectInfoStore, this.maskAnnotations);
  this.panoViewer.highlightSelected(pixels.data, pixels.width, pixels.height);
};

ImageMaskObjectPlacer.prototype.__updateActiveViewpointObjectInfoStore = function() {
  if (this.activeViewpoint) {
    const assignedMasks = this.activeViewpoint.assignedMasks;
    const pixelThreshold = this.viewer.pixelThreshold;
    if (assignedMasks || pixelThreshold != null) {
      console.log("Filter masks", assignedMasks, 'pixelThreshold', pixelThreshold);
      const filter = ObjectMaskFilters.getMaskFilter({ assignedMasks: assignedMasks, pixelThreshold: pixelThreshold });
      this.activeViewpointObjectInfoStore = this.objectInfoStore.filterMasks((info,id) => {
        return filter(info, id) || (info.isCustom && info.photoId === this.activeViewpoint.id);
      });
      this.createProgressBar();
      this.updateProgressBar();
    } else {
      console.log('viewpoint', this.activeViewpoint);
      const objectIds = new Set(this.instanceMasks.objectIds);
      this.activeViewpointObjectInfoStore = this.objectInfoStore.filterMasks((info, id) => {
        return objectIds.has(id) || (info.isCustom && info.photoId === this.activeViewpoint.id);
      });
      this.createProgressBar();
      this.updateProgressBar();
    }
  } else {
    // Have this be the object info store for the entire scene
    this.activeViewpointObjectInfoStore = this.objectInfoStore;
  }
};

Object.defineProperty(ImageMaskObjectPlacer.prototype, 'isPanoramaLocked', {
  get: function () { return this.__isPanoramaLocked; },
  set: function (v) {
    this.__isPanoramaLocked = v;
    this.panoViewer.setOrbitAllowed(!v);
  }
});

Object.defineProperty(ImageMaskObjectPlacer.prototype, 'maskObjectAssignments', {
  get: function() { return this.maskAnnotations.maskObjectAssignments; }
});

Object.defineProperty(ImageMaskObjectPlacer.prototype, 'isHighlightedAll', {
  get: function () { return this.__isHighlightedAll; },
  set: function (v) {
    this.__isHighlightedAll = v;
    if (v) {
      this.__highlightAll();
    } else {
      this.panoViewer.clearSelectedHighlight();
    }
    if (this.progressBar) {
      this.progressBar.setHoverProgress(v);
    }
    if (this.__highlightAllButton) {
      this.__highlightAllButton.isActive = v;
    }
  }
});

ImageMaskObjectPlacer.prototype.viewObject = function (object3d) {
  // get object centroid
  const bbox = Object3DUtil.getBoundingBox(object3d);
  const centroid = bbox.centroid();
  // get centroid in scene state coordinate?
  const worldToScene = this.sceneState.getWorldToSceneMatrix();
  centroid.applyMatrix4(worldToScene);
  const position = new THREE.Vector3(...this.activeViewpoint.cameraState.position);
  const lookDir = new THREE.Vector3();
  lookDir.subVectors(centroid, position);
  this.viewer.setCameraToPanoramaView(lookDir);
};

ImageMaskObjectPlacer.prototype.__getPointInfoForObject = function (object3d) {
  // get object centroid
  const bbox = Object3DUtil.getBoundingBox(object3d);
  const centroid = bbox.centroid();
  const sceneToWorld = this.sceneState.scene.matrixWorld;
  if (this.activeViewpoint) {
    const point = this.panoViewer.getPanoCoordsToTarget(centroid, sceneToWorld);
    return point;
  }
};

ImageMaskObjectPlacer.prototype.viewMaskById = function (maskId) {
  const maskInfo = this.activeViewpointObjectInfoStore.get(maskId);
  if (maskInfo) {
    if (maskInfo.pointNormalized) {
      const lookDir = this.activeViewpoint.getLookDirForNormalizedPanoCoords(maskInfo.pointNormalized);
      this.viewer.setCameraToPanoramaView(lookDir);
    } else {
      console.warn('Missing mask point ' + maskId);
    }
  } else {
    console.warn('Cannot find object with maskId ' + maskId);
  }
};

/**
 * Method called in SceneViewer.js to inform selection of a new viewpoint
 * @param {rlsd.Viewpoint} viewpoint
 * @param {function(err, res)} callback
 */
ImageMaskObjectPlacer.prototype.setViewpoint = function (viewpoint, callback) {
  this.activeViewpoint = viewpoint;
  this.activeViewpointObjectInfoStore = null;
  this.instanceMasks = null;

  let imageUrl = viewpoint.rgbUrl;
  let instanceUrl = viewpoint.instanceUrl;

  var highlightControls = $('#highlightControls');
  highlightControls.empty();
  this.__highlightAllButton = this.__createHighlightAllButton(highlightControls);
  // this.createSemanticImage(semanticUrl);
  this.__loadInstanceMasks(instanceUrl).then(()=>{
    console.log('load instance masks');
    // this.createCanvas(this.instancePixelBuffer);
    if (this.objectInfoStore) {
      this.objectInfoStore.updateObjectInfos(this.instanceMasks.instanceIdToMaskInfo);
      this.__updateActiveViewpointObjectInfoStore();
      this.__fixupMaskInfosCustomMissing();
      this.panoViewer.updatePointInstances(this.activeViewpointObjectInfoStore.getPointInstances());
      this.updateProgressBar();
      this.Publish('customInstancesUpdated');
    }

    callback();
  });

  this.panoViewer.setVisible(true);
  this.panoViewer.resetPanoramicView(viewpoint, imageUrl, this.hoverSphereCount);

  // Clear past selections
  this.selectMask(null);
};

/**
 * Sends the query to the right panel to search for objects
 * @param {Object} query
 */
ImageMaskObjectPlacer.prototype.__sendSearchQuery = function (query) {
  if (query.source == null) {
    query.source = this.defaultSource;
  }

  var crumbs = [];
  if (this.searchController.searchPanel.showCrumbs) {
    crumbs = JSON.parse(JSON.stringify(this.searchController.searchPanel.rootCrumb));
    if (query.crumbs) {
      crumbs = crumbs.concat(query.crumbs);
    }
  }
  var searchDetails = this.searchController.searchPanel.expandCrumbLink(query, crumbs);

  var modelInfos = [];
  var logInfo = {
    "modelInfos": modelInfos
  };
  if (this.selectedMask && this.maskObjectAssignments.has(this.selectedMask)) {
    this.maskObjectAssignments.get(this.selectedMask).forEach((maskObjectPair)=>{
      modelInfos.push(ModelInstance.getUILogInfo(maskObjectPair.object3d, true));
    });
  }
  // modelInfo["queryString"] = query.queryString;
  logInfo["searchDetails"] = searchDetails;
  this.uilog.log(UILog.EVENT.IMAGE_QUERY_MODELS_STARTED, null, logInfo);
};

ImageMaskObjectPlacer.prototype.onCameraUpdate = function(camera){
  this.panoViewer.setFOV(camera.fov);
  this.panoViewer.setAspectRatio(this.viewer.renderer.domElement.width, this.viewer.renderer.domElement.height);
};

ImageMaskObjectPlacer.prototype.onResize = function() {
  this.panoViewer.setAspectRatio(this.viewer.renderer.domElement.width, this.viewer.renderer.domElement.height);
};

ImageMaskObjectPlacer.prototype.__maximizePanorama = function() {
  if (!this.panoMaximized) {
    this.__panoInteractionInfo = {"startTime": new Date().getTime()};
    if (this.uilog) {
      this.uilog.log(UILog.EVENT.PANO_OVERLAY_START, null, this.__panoInteractionInfo);
    }
  }
  this.panoViewer.sizeRatio = 1.0;
  this.panoViewer.setAspectRatio(this.viewer.renderer.domElement.width, this.viewer.renderer.domElement.height);
  this.panoMaximized = true;
  this.panoViewer.setOrbitAllowed(false);
};

ImageMaskObjectPlacer.prototype.__minimizePanorama = function() {
  if (this.panoMaximized) {
    if (this.uilog) {
      this.uilog.log(UILog.EVENT.PANO_OVERLAY_END, null, this.__panoInteractionInfo);
    }
    this.__panoInteractionInfo = null;
  }

  this.panoViewer.sizeRatio = this.defaultPanoramaSizeRatio;
  this.panoViewer.setAspectRatio(this.viewer.renderer.domElement.width, this.viewer.renderer.domElement.height);
  this.panoMaximized = false;
  if (!this.isPanoramaLocked) {
    this.panoViewer.setOrbitAllowed(true);
  }
};

ImageMaskObjectPlacer.prototype.setPanoOverlay = function(flag) {
  // Panorama is overlayed on top of main renderer
  if (flag) {
    this.__maximizePanorama();
    if (this.separatePanoOverlay) {
      this.panoViewer.setZIndex('1', '-2');
    } else {
      this.panoViewer.setZIndex('-1', '-2');
      this.viewer.renderer.domElement.style.opacity = '0.75';
    }
  } else {
    this.__minimizePanorama();
    this.viewer.renderer.domElement.style.opacity = '1';
    this.panoViewer.setZIndex('5', '4');
  }
};

// UI controls (currently delegates to panoviewer)
ImageMaskObjectPlacer.prototype.onMouseDown = function(event) {
  let notHandled = true;
  if (this.panoMaximized) {
    notHandled = this.panoViewer.onMouseDown(event);
  }
  return notHandled;
};

ImageMaskObjectPlacer.prototype.onMouseMove = function(event) {
  let notHandled = true;
  if (this.panoMaximized) {
    notHandled = this.panoViewer.onMouseMove(event);
  }
  return notHandled;
};

ImageMaskObjectPlacer.prototype.update = function() {
  // TODO: updateAndRender
  if (!this.isPanoramaLocked) {
    var lookDirection = this.__updatePanoramaCamera(this.viewer.cameraControls.camera, this.viewer.sceneState.getWorldToSceneAlignmentMatrix());
    if (this.viewer.activeViewpoint && lookDirection){
      this.viewer.activeViewpoint.updateLookDirection(lookDirection);
    }
  }
};

ImageMaskObjectPlacer.prototype.__addPointInstance = function(panoCoordsNormalized, point3d, clientMousePos) {
  console.log('add point instance');
  const label = '';
  const photoId = this.activeViewpoint.id;
  const maskInfo = this.activeViewpointObjectInfoStore.addPointInstance(
    photoId, label, panoCoordsNormalized, point3d);
  this.__hideLabelInputTooltip(true);
  this.panoViewer.updatePointInstances(this.activeViewpointObjectInfoStore.getPointInstances());
  this.__showLabelInputTooltip(clientMousePos, label);
  this.Publish('customInstanceAdded', maskInfo);
  this.Publish('customInstancesUpdated');
  // auto select mask
  this.updateProgressBar();
  this.selectMaskById(maskInfo.id);
};

ImageMaskObjectPlacer.prototype.__updatePointInstancePosition = function(maskId, panoCoordsNormalized, point3d, clientMousePos) {
  console.log('update point instance', maskId);
  const maskInfo = this.activeViewpointObjectInfoStore.get(maskId);
  maskInfo.point3d = point3d;
  maskInfo.pointNormalized = panoCoordsNormalized;
  if (maskInfo.isMissing) {
    maskInfo.type = 'point';
    delete maskInfo.isMissing;
  }
  this.panoViewer.updatePointInstances(this.activeViewpointObjectInfoStore.getPointInstances());
  this.Publish('customInstancesUpdated');
  // auto select mask
  this.updateProgressBar();
  this.selectMaskById(maskInfo.id);
};

ImageMaskObjectPlacer.prototype.removeCustomInstance = function(maskId) {
  var maskAddr = new MaskAddress(this.activeViewpoint.id, maskId, null);
  this.maskObjectAssignments.clearMaskAssignment(maskAddr);
  var maskInfo = this.activeViewpointObjectInfoStore.removePointInstance(maskId);
  this.panoViewer.updatePointInstances(this.activeViewpointObjectInfoStore.getPointInstances());
  if (this.selectedMask && this.selectedMask.maskId === maskId) {
    this.selectMask(null);
  }
  this.updateProgressBar();
  this.Publish('customInstanceRemoved', maskInfo);
  this.Publish('customInstancesUpdated');
};

ImageMaskObjectPlacer.prototype.__updateCustomInstances = function(maskInfos) {
  if (maskInfos && this.objectInfoStore) {
    const customMaskInfos = maskInfos.filter(x => x.isCustom);
    const objectInfoStore = this.activeViewpointObjectInfoStore || this.objectInfoStore;
    objectInfoStore.clearCustomObjectInfos();
    for (let m of customMaskInfos) {
      objectInfoStore.setObjectInfo(m.id, m);
    }
    this.panoViewer.updatePointInstances(objectInfoStore.getPointInstances());
    this.updateProgressBar();
    this.Publish('customInstancesUpdated');
  }
};

module.exports = ImageMaskObjectPlacer;
