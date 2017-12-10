'use strict';

define([
    'Constants',
    'geo/Object3DUtil',
    'editor/UndoStack'
  ],
  function (Constants, Object3DUtil, UndoStack) {

    /**
     * Undo stack encapsulation class
     *
     * Events published by the UndoStack
     *  ReachedBeginning - The beginning of the undo stack was reached (no more events to undo)
     *  ReachedEnd - The end of the undo stack was reached (no more events to redo)
     *  RecordedNewState - A new state was pushed onto the undo stack
     *  RestoredSavedState - A state was restored from the undo stack
     **/
    function SceneViewerUndoStack(sceneViewer, maxSize) {
      // Extend UndoStack
      UndoStack.call(this, sceneViewer, maxSize);

      this.sceneViewer = sceneViewer;
      this.sceneState = sceneViewer.sceneState;
    }

    // Extend PubSub
    SceneViewerUndoStack.prototype = Object.create(UndoStack.prototype);
    SceneViewerUndoStack.prototype.constructor = SceneViewerUndoStack;

    SceneViewerUndoStack.prototype.trimSavedState = function(saveState) {
      // Trims unnecessary information from saved state;
      delete saveState.sceneInfo;
    };

    SceneViewerUndoStack.prototype.restoreSaveState = function (saveState, deltaState, prevState) {
      if (saveState.stateType === 'delta') {
        var objInfo = saveState[deltaState];
        this.applyObjectInfo(objInfo);
        if (this.trimSavedState && !saveState.sceneInfo) {
          // Need to populate the saveState.sceneInfo
          this.sceneState = this.sceneViewer.sceneState;
          var serializedSceneState = this.sceneState.toJson();
          saveState.sceneInfo = { 'format': 'sceneState', 'data': serializedSceneState };
        }
      } else {
        if (deltaState === 'before' && prevState) {
          this.sceneViewer.restoreScene(prevState.sceneInfo);
        } else {
          this.sceneViewer.restoreScene(saveState.sceneInfo);
        }
      }
    };

    SceneViewerUndoStack.prototype.getObjectInfo = function (object) {
      var obj;
      if (object instanceof THREE.Object3D) {
        obj = object;
      } else if (object.object3D instanceof THREE.Object3D) {
        obj = object.object3D;
      }
      if (obj) {
        obj.updateMatrixWorld();
        return {
          index: obj.index,
          parentIndex: obj.parent ? obj.parent.index : -1,
          transform: obj.matrixWorld.toArray()
        };
      }
    };

    SceneViewerUndoStack.prototype.applyObjectInfo = function (objInfo) {
      var worldMatrix = new THREE.Matrix4();
      worldMatrix.fromArray(objInfo.transform);
      this.sceneState.setObjectWorldMatrix(objInfo.index, objInfo.parentIndex, worldMatrix);
    };

    SceneViewerUndoStack.prototype.prepareDeltaState = function (cmdType, cmdParams) {
      this.deltaStateBefore = null;
      if (this.useDeltaStates && cmdParams && cmdParams.object) {
        if (cmdType === Constants.CMDTYPE.SCALE || cmdType === Constants.CMDTYPE.ROTATE ||
          cmdType === Constants.CMDTYPE.MOVE || cmdType === Constants.CMDTYPE.SWITCHFACE) {
          //this.sceneState.assignObjectIndices();
          this.deltaStateBefore = this.getObjectInfo(cmdParams.object);
        }
      }
    };

    SceneViewerUndoStack.prototype.createSaveState = function (cmdType, cmdParams) {
      this.sceneState = this.sceneViewer.sceneState;
      var serializedSceneState = this.sceneViewer.getSerializedState? this.sceneViewer.getSerializedState() : this.sceneState.toJson(true);
      var sceneInfo = { 'format': 'sceneState', 'data': serializedSceneState };
      if (this.useDeltaStates && cmdParams && cmdParams.object && this.deltaStateBefore) {
        if (cmdType === Constants.CMDTYPE.SCALE || cmdType === Constants.CMDTYPE.ROTATE ||
            cmdType === Constants.CMDTYPE.MOVE || cmdType === Constants.CMDTYPE.SWITCHFACE) {
          // Create delta state
          //this.sceneState.assignObjectIndices();
          var deltaState = new UndoStack.SavedState(cmdType, 'delta');
          deltaState['sceneInfo'] = sceneInfo;
          deltaState['before'] = this.deltaStateBefore;
          deltaState['after'] = this.getObjectInfo(cmdParams.object);
          this.deltaStateBefore = null;
          return deltaState;
        }
      }
      var state = new UndoStack.SavedState(cmdType, 'full');
      state.sceneInfo = sceneInfo;
      return state;
    };

    // Exports
    return SceneViewerUndoStack;
  });
