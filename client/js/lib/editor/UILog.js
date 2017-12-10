'use strict';

define([], function () {

  UILog.EVENT = Object.freeze({
    RAW_MOUSE: 'RAW_MOUSE',
    RAW_KEY: 'RAW_KEY',

    STATE_MOUSE: 'STATE_MOUSE',
    STATE_CAMERA: 'STATE_CAMERA',
    STATE_SCENE: 'STATE_SCENE',

    SCENE_CREATE: 'SCENE_CREATE',
    SCENE_LOAD: 'SCENE_LOAD',
    SCENE_SAVE: 'SCENE_SAVE',
    SCENE_CLOSE: 'SCENE_CLOSE',

    CAMERA_ORBIT: 'CAMERA_ORBIT',
    CAMERA_DOLLY: 'CAMERA_DOLLY',
    CAMERA_ZOOM: 'CAMERA_ZOOM',
    CAMERA_RESET: 'CAMERA_RESET',

    MODEL_SELECT: 'MODEL_SELECT',
    MODEL_DESELECT: 'MODEL_DESELECT',
    MODEL_ROTATE: 'MODEL_ROTATE',
    MODEL_SCALE: 'MODEL_SCALE',
    MODEL_TUMBLE: 'MODEL_TUMBLE',
    MODEL_DELETE: 'MODEL_DELETE',
    MODEL_INSERT: 'MODEL_INSERT',
    MODEL_COPY: 'MODEL_COPY',
    MODEL_PASTE: 'MODEL_PASTE',
    MODEL_MOVE: 'MODEL_MOVE',
    MODEL_LOAD:  'MODEL_LOAD',

    SEARCH_QUERY: 'SEARCH_QUERY',
    SEARCH_SCROLL: 'SEARCH_SCROLL',
    SEARCH_SELECT: 'SEARCH_SELECT',
    SEARCH_DESELECT: 'SEARCH_DESELECT',

    TUTORIAL_START: 'TUTORIAL_START',

    UNDOSTACK_UNDO: 'UNDOSTACK_UNDO',
    UNDOSTACK_REDO: 'UNDOSTACK_REDO',

    CONTEXT_QUERY_STARTED: 'CONTEXT_QUERY_STARTED',
    CONTEXT_QUERY_MODELS_STARTED: 'CONTEXT_QUERY_MODELS_STARTED',
    CONTEXT_QUERY_FINISHED: 'CONTEXT_QUERY_FINISHED',
    CONTEXT_QUERY_SELECT: 'CONTEXT_QUERY_SELECT',
    CONTEXT_QUERY_INSERT: 'CONTEXT_QUERY_INSERT',
    CONTEXT_QUERY_REPLACE: 'CONTEXT_QUERY_REPLACE',
    CONTEXT_QUERY_FILTER: 'CONTEXT_QUERY_FILTER',
    CONTEXT_QUERY_SEARCH: 'CONTEXT_QUERY_SEARCH',

    MISC: 'MISC'
  });

  function UIEvent(type, input, data, time) {
    // Event type (see UILog.EVENT)
    this.type = type;
    // Actual user input (keypress, mouse movement, etc)
    this.input = input;
    // Additional data associated with the event
    // modelIndex, scale, rotation, etc
    this.data = data;
    // Event timestamp
    this.time = time;
  }

  function UILog(params) {
    this.logBuffer = [];
    this.enabled = params.enabled;
  }

  UILog.prototype.log = function (type, rawinput, data) {
    if (this.enabled) {
      var time = new Date().getTime();
      data = data || '';
      var input = this.filterInput(rawinput);
      var evt = new UIEvent(type, input, data, time);
      this.logBuffer.push(evt);
    }
  };

  UILog.prototype.filterInput = function (rawinput) {
    var input = {};
    // TODO: Decide on the important fields and filter from rawinput
    var keepFields = [];
    for (var i = 0; i < keepFields.length; i++) {
      var field = keepFields[i];
      if (rawinput[i] !== undefined) {
        input[field] = rawinput[i];
      }
    }
    if (rawinput instanceof KeyboardEvent) {
      input['type'] = 'keyboard';
    } else if (rawinput instanceof MouseEvent) {
      input['type'] = 'mouse';
    }
    return input;
  };

  UILog.prototype.stringify = function () {
    return JSON.stringify(this.logBuffer);
  };

  UILog.prototype.fromJSONString = function (string) {
    this.logBuffer = (string) ? JSON.parse(string) : [];
  };

  UILog.prototype.clear = function () {
    this.logBuffer = [];
  };

  return UILog;
});
