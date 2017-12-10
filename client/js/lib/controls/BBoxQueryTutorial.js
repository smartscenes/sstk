'use strict';

var Constants = require('Constants');
var PubSub = require('PubSub');
var Object3DUtil = require('geo/Object3DUtil');

/**
 * Tutorial illustrating how to use the {@link controls.BBoxQueryControls} to insert a model into the scene
 * The tutorial takes the user through the following steps:
 * 0. Tutorial model is loaded and displayed to the user along with arrows around bounding box of the model
 * 1. User presses Ctrl-B to enter BBox query mode
 * 2. User draws arrows following tutorial arrows
 * 3. Model query dialog shows up and user selects a model
 * 4. The model is loaded and inserted into the scene
 * 5. User clicks "done" to indicate that they are finished with the tutorial
 * @param params
 * @param [params.tutorialModelId] {string} Id of model to use for tutorial
 * @param [params.tutorialCameraPosition] {float[]|THREE.Vector3} Position to place tutorial camera
 * @constructor
 * @memberOf controls
 */
var BBoxQueryTutorial = function (params) {
  PubSub.call(this);

  this.inTutorialMode = false;
  this.tutorialState = {
    hasEnteredBBoxQuery: false, // Step 1 complete
    hasDrawnBBox: false,        // Step 2 complete
    hasInsertedModel: false,    // Step 4 complete
    hasClosedBBoxQuery: false   // Step 5 complete
  };

  this.app = params.app; // App is a scene viewer instance
  this.tutorialModelId = (params.tutorialModelId !== undefined) ? params.tutorialModelId : Constants.tutorialModelId;
  this.tutorialCameraPosition = (params.tutorialCameraPosition !== undefined) ? params.tutorialCameraPosition : Constants.tutorialCameraPosition;
};

BBoxQueryTutorial.prototype = Object.create(PubSub.prototype);
BBoxQueryTutorial.prototype.constructor = BBoxQueryTutorial;

BBoxQueryTutorial.prototype.enterTutorialMode = function () {
  // Preparing to go into Step 0

  // Disable various components of the app
  // TODO: Move this into app call
  this.app.editControls.manipulator.detach();
  this.app.editControls.dragdrop.enabled = false;
  this.app.editControls.manipulator.enabled = false;
  // Saves current state before tutorial start
  this.app.undoStack.pushCurrentState(Constants.CMDTYPE.TUTORIAL_START);
  // Disable the undo stack for this tutorial
  this.app.undoStack.disable();

  // Subscribe to bbox query events
  this.enableSubscription(true);

  this.inTutorialMode = true;
  var message = '1) Press "Ctrl-B" or click the "BBox" button to begin a bounding box query.';
  $('#tutorialDialogue').css('visibility','visible');
  $('#tutorialInstructions').append($('<span></span>').attr('class', 'instructionStep').text(message));

  this.app.assetManager.getModelInstance(null, this.tutorialModelId, this.onTutorialRootModelLoad.bind(this));
};

BBoxQueryTutorial.prototype.enableSubscription = function (flag) {
  // Subscribe to bbox query controller messages
  var bboxQueryController = this.app.contextQueryControls;
  if (flag) {
    bboxQueryController.Subscribe('ContextQueryActive', this, this.onBBoxQueryActive);
    bboxQueryController.Subscribe('ContextQueryInactive', this, this.onBBoxQueryInactive);
    bboxQueryController.Subscribe('BBoxCompleted', this, this.onBBoxFinished);
    bboxQueryController.Subscribe('ContextQueryModelInserted', this, this.onModelInserted);
  } else {
    bboxQueryController.Unsubscribe('ContextQueryActive', this, this.onBBoxQueryActive);
    bboxQueryController.Unsubscribe('ContextQueryInactive', this, this.onBBoxQueryInactive);
    bboxQueryController.Unsubscribe('BBoxCompleted', this, this.onBBoxFinished);
    bboxQueryController.Unsubscribe('ContextQueryModelInserted', this, this.onModelInserted);
  }
};

BBoxQueryTutorial.prototype.onTutorialRootModelLoad = function (modelInstance) {
  // Step 0 - Tutorial model has loaded
  this.app.createSceneWithOneModel(modelInstance, { initModelInstance: true, clearUILog: false, clearUndoStack: false });
  var greyMaterial = Object3DUtil.ClearMat;
  Object3DUtil.setMaterial(modelInstance.object3D,greyMaterial,Object3DUtil.MaterialsAll,true);
  this.tutorialModel = modelInstance;
  this.drawTutorialArrows(modelInstance);
  this.setTutorialCamera(modelInstance);
};

BBoxQueryTutorial.prototype.setTutorialCamera = function (modelInstance) {
  var targetBBox = modelInstance.getBBox();
  var cameraOptions = {
    position: this.tutorialCameraPosition,
    target: targetBBox.centroid()
  };
  this.app.resetCamera(cameraOptions);
};

BBoxQueryTutorial.prototype.drawTutorialArrows = function (modelInstance) {
  var targetBBox = modelInstance.getBBox().scaleBy(1.1);
  var dims = targetBBox.dimensions();
  var c = targetBBox.getCorners();
  var color = 0xff00000;
  var p0 = c[4].clone(); p0.y = 0;
  var arrowHelper0 = new THREE.ArrowHelper(new THREE.Vector3(-1,0,0), p0, dims.x, color);
  var p1 = c[0].clone(); p1.y = 0;
  var arrowHelper1 = new THREE.ArrowHelper(new THREE.Vector3(0,0,1), p1, dims.z, color);
  var p2 = c[1].clone();
  var arrowHelper2 = new THREE.ArrowHelper(new THREE.Vector3(0,1,0), p2, dims.y, color);

  this.tutorialNode = new THREE.Group('TutorialNode');
  this.tutorialNode.add(arrowHelper0);
  this.tutorialNode.add(arrowHelper1);
  this.tutorialNode.add(arrowHelper2);
  this.getScene().add(this.tutorialNode);
};

BBoxQueryTutorial.prototype.getScene = function () {
  return this.app.sceneState.fullScene;
};

BBoxQueryTutorial.prototype.onBBoxQueryActive = function () {
  if (this.inTutorialMode) {
    // Step 1 complete
    if (!this.tutorialState.hasEnteredBBoxQuery) {
      $('.instructionStep').css('font-size','10px');
      var message =
        '2) Trace along the red arrows by clicking and dragging to draw a box around the chair, starting with the front side.' +
        'Dragging from the <b>front side first</b> is important because it will define the orientation of your query.';
      $('#tutorialInstructions').append('<br/>').append($('<span></span>').attr('class', 'instructionStep').html(message));
      this.tutorialState.hasEnteredBBoxQuery = true;
    }
  }
};

BBoxQueryTutorial.prototype.onBBoxFinished = function () {
  if (this.inTutorialMode) {
    if (!this.tutorialState.hasDrawnBBox) {
      $('.instructionStep').css('font-size', '10px');
      var message = '3) Type in the keyword "Chair" to narrow your query, then click on the matching model.';
      $('#tutorialInstructions').append('<br/>').append($('<span></span>').attr('class', 'instructionStep').text(message));
      this.tutorialState.hasDrawnBBox = true;
    }
  }
};

BBoxQueryTutorial.prototype.onBBoxQueryInactive = function () {
  if (this.inTutorialMode) {
    if (this.tutorialState.hasInsertedModel) {
      this.tutorialState.hasClosedBBoxQuery = true;
    }
  }
};

BBoxQueryTutorial.prototype.onModelInserted = function () {
  if (this.inTutorialMode) {
    if (!this.tutorialState.hasInsertedModel) {
      var doneButton = $('<br><input type="button" style="margin-left:100px;" value="Done"/>');
      $('#tutorialInstructions').append(doneButton);
      doneButton.click(function () {
        this.exitTutorialMode();
      }.bind(this));
      this.tutorialState.hasInsertedModel = true;
    }
  }
};

BBoxQueryTutorial.prototype.exitTutorialMode = function () {
  // Done button was pressed

  // Restore state of the app
  this.app.editControls.dragdrop.enabled = true;
  this.app.editControls.manipulator.enabled = true;
  if (this.app.contextQueryControls.active) {
    this.app.toggleContextQueryMode();
  }
  // Re-enable the undo stack
  this.app.undoStack.enable();
  // Restore state before tutorial start
  this.app.undoStack.undo();

  $('#tutorialDialogue').css('visibility','hidden');
  this.inTutorialMode = false;
  if (this.tutorialNode) {
    this.getScene().remove(this.tutorialNode);
    this.tutorialNode = null;
  }
  if (this.tutorialModel) {
    this.getScene().remove(this.tutorialModel);
  }
  // Unsubscribe from bbox query events
  this.enableSubscription(true);
  this.Publish('TutorialModeCompleted');
};

module.exports = BBoxQueryTutorial;

/**
 * Event indicating the tutorial was completed
 * @event BBoxQueryTutorial#TutorialModeCompleted
 * @memberOf controls
 */