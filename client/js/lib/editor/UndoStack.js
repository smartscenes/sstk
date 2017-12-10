'use strict';

define([
    'PubSub'
  ],
  function (PubSub) {

    /**
     * Undo stack encapsulation class
     *
     * Events published by the UndoStack
     *  ReachedBeginning - The beginning of the undo stack was reached (no more events to undo)
     *  ReachedEnd - The end of the undo stack was reached (no more events to redo)
     *  RecordedNewState - A new state was pushed onto the undo stack
     *  RestoredSavedState - A state was restored from the undo stack
     **/
    function UndoStack(app, maxSize) {
      // Extend PubSub
      PubSub.call(this);

      this.app = app;
      this.maxSize = maxSize;
      this.states = []; // Array of pre command states in historical order
      this.pos = -1;      // Pointer to the last state

      // Options that makes the undo stack more complicated but potentially more efficient
      this.useDeltaStates = true; // Use delta state for faster undo/redo
      this.trimSavedState = null; // Function to trims old full states that are not needed

      // Is the undo stack enabled?
      // If set to false, then no state is tracked and things are not pushed unto the undo stack
      this.enabled = true;

      this.clear();
    }

    // Extend PubSub
    UndoStack.prototype = Object.create(PubSub.prototype);
    UndoStack.prototype.constructor = UndoStack;

    UndoStack.prototype.clear = function () {
      this.states = [];
      this.pos = -1;
    };

    UndoStack.prototype.disable = function () {
      this.enabled = false;
    };

    UndoStack.prototype.enable = function () {
      this.enabled = true;
    };

    // Constructor to save scene state snapshot before a command of cmdType is applied to targetModel
    function SavedState(cmdType, stateType, data) {
      this.cmdType = cmdType;
      this.stateType = stateType;
      if (data) {
        this.data = data;
      }
    }

    UndoStack.SavedState = SavedState;

    UndoStack.prototype.prepareDeltaState = function (cmdType, cmdParams) {
      // TODO: Subclass implement something more intelligent!!!
    };

    UndoStack.prototype.restoreSaveState = function (saveState, deltaState, prevState) {
      // TODO: Subclass implement something more intelligent!!!
      if (this.app.restoreState) {
        this.app.restoreState(saveState, deltaState, prevState);
      }
    };

    UndoStack.prototype.createSaveState = function (cmdType, cmdParams) {
      // TODO: Subclass implement something more intelligent!!!
      if (this.app.getState) {
        var data = this.app.getState({clone: true}); // NOTE: app need to make sure state is cloned!
        return new SavedState(cmdType, 'full', data);
      }
    };

    UndoStack.prototype.undo = function () {
      if (!this.enabled) return;

      // Return if empty stack
      if (this.pos <= 0) {
        return;
      }

      //console.log('UndoStack: undo ' + this.states[this.pos].cmdType + ', pos=' + this.pos);
      // pos is pointing to the last saved state (where the last saved state = current state)
      this.restoreSaveState(this.states[this.pos], 'before', this.states[this.pos - 1]);
      this.pos--;

      this.Publish('RestoredSavedState');
      if (this.pos === 0) {
        this.Publish('ReachedBeginning');
      }
    };

    UndoStack.prototype.redo = function () {
      if (!this.enabled) return;

      // If at the end of the stack (no next state) then return
      if (this.pos >= (this.states.length - 1)) return;

      this.pos++;
      this.restoreSaveState(this.states[this.pos], 'after');
      //console.log('UndoStack: redo ' + this.states[this.pos].cmdType + ', pos=' + this.pos);

      this.Publish('RestoredSavedState');
      if (this.pos === (this.states.length - 1)) {
        this.Publish('ReachedEnd');
      }
    };

    // Delete all future states beyond current pos
    UndoStack.prototype.forgetFuture = function () {
      this.states = this.states.slice(0, this.pos + 1);
    };

    UndoStack.prototype.last = function () {
      return this.states[this.pos];
    };

    UndoStack.prototype.pushCurrentState = function (cmdType, cmdParams) {
      if (!this.enabled) return;

      // Pop oldest state off if stack is maxed out
      if (this.states.length === this.maxSize) {
        this.states.shift();
        this.pos--;
      }

      this.forgetFuture();

      // Push current state onto stack and move pos forward
      var curState = this.createSaveState(cmdType, cmdParams);
      this.states.push(curState);
      this.pos++;

      // Trims unneeded data from previous state
      if (this.trimSavedState) {
        if (this.pos > 0) {
          // If this state is delta and the previous state is a delta, then we can drop the full state scene info
          var lastState = this.states[this.pos - 1];
          if (curState.stateType === 'delta' && lastState.stateType === 'delta') {
            this.trimSavedState(lastState);
          }
        }
      }

      this.Publish('RecordedNewState');
      //console.log('UndoStack: add ' + cmdType + ', pos=' + this.pos);
      if (this.pos === 0) {
        // First state was saved
        this.Publish('ReachedBeginning');
      }
      return curState;
    };

    UndoStack.prototype.isEmpty = function () {
      return this.states.length === 0;
    };

    UndoStack.prototype.size = function() {
      return this.states.length;
    };

    UndoStack.prototype.atBeginning = function () {
      return this.pos <= 0;
    };

    // Exports
    return UndoStack;
  });
