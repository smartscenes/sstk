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

    CAMERA_ORBIT_START: 'CAMERA_ORBIT_START',
    CAMERA_ORBIT_END: 'CAMERA_ORBIT_END',
    // CAMERA_DOLLY: 'CAMERA_DOLLY',
    // CAMERA_ZOOM: 'CAMERA_ZOOM',
    // CAMERA_RESET: 'CAMERA_RESET',

    MODEL_SELECT: 'MODEL_SELECT',
    MODEL_DESELECT: 'MODEL_DESELECT',
    MODEL_ROTATE: 'MODEL_ROTATE', // Triggered by pose suggestor rotate and keyboard rotate
    MODEL_ROTATE_START: 'MODEL_ROTATE_START',
    MODEL_ROTATE_END: 'MODEL_ROTATE_END',
    MODEL_SCALE: 'MODEL_SCALE', // Triggered by keyboard scale
    MODEL_SCALE_START: 'MODEL_SCALE_START',
    MODEL_SCALE_END: 'MODEL_SCALE_END',
    MODEL_TUMBLE: 'MODEL_TUMBLE',
    MODEL_DELETE: 'MODEL_DELETE',
    MODEL_INSERT: 'MODEL_INSERT', // Triggered when no drag-drop occur to place the object
    MODEL_INSERT_START: 'MODEL_INSERT_START',
    MODEL_INSERT_END: 'MODEL_INSERT_END',
    MODEL_INSERT_CANCELLED: "MODEL_INSERT_CANCELLED",
    MODEL_COPY: 'MODEL_COPY',
    MODEL_PASTE: 'MODEL_PASTE',
    // MODEL_MOVE: 'MODEL_MOVE',
    MODEL_MOVE_START: 'MODEL_MOVE_START',
    MODEL_MOVE_END: 'MODEL_MOVE_END',
    MODEL_LOAD:  'MODEL_LOAD',

    IMAGE_QUERY_MODELS_STARTED: 'IMAGE_QUERY_MODELS_STARTED',
    SEARCH_QUERY: 'SEARCH_QUERY',
    // SEARCH_SCROLL: 'SEARCH_SCROLL',
    SEARCH_SELECT: 'SEARCH_SELECT',
    SEARCH_RESULTS_PANEL_FOCUS: 'SEARCH_RESULTS_PANEL_FOCUS',
    SEARCH_RESULTS_PANEL_UNFOCUS: 'SEARCH_RESULTS_PANEL_UNFOCUS',
    SEARCH_CONTAINER_UNFOCUS: 'SEARCH_CONTAINER_UNFOCUS',
    SEARCH_CONTAINER_FOCUS: 'SEARCH_CONTAINER_FOCUS',
    // SEARCH_DESELECT: 'SEARCH_DESELECT',

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

    SELECT_MASK: "SELECT_MASK", //RLSD Mask Select
    SELECT_OBJECT: "SELECT_OBJECT", // RLSD Object Select

    PANORAMA_ORBIT_START: "PANORAMA_ORBIT_START",
    PANORAMA_ORBIT_END: "PANORAMA_ORBIT_END",

    TASK_LOADED: "TASK_LOADED", // RLSD Task Loaded
    TASK_SAVED: "TASK_SAVED", // RLSD Task Saved

    VIEWPOINT_START: "VIEWPOINT_START", // RLSD Start of viewpoint annotation
    VIEWPOINT_END: "VIEWPOINT_END", // RLSD End of viewpoint annotation

    PANO_OVERLAY_START: "PANO_OVERLAY_START", // RLSD: Overlay panorama
    PANO_OVERLAY_END: "PANO_OVERLAY_END", // RLSD: End Overlay panorama

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
    this.debug = params.debug;
    this.enhancers = [];
    if (params.sessionId) {
      this.sessionId = params.sessionId;
    }
    this.prevSessionId = null;
  }

  UILog.prototype.addEnhancer = function(enhancer){
    this.enhancers.push(enhancer);
  };

  UILog.prototype.log = function (type, rawinput, data) {
    if (this.enabled) {
      var time = new Date().getTime();
      data = data || '';
      var input = this.filterInput(rawinput);
      var evt = new UIEvent(type, input, data, time);
      this.enhancers.forEach((v)=>{
          v(evt);
      });
      this.logBuffer.push(evt);
      if (this.debug) {
        console.log(evt);
      }
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
    return JSON.stringify({
      log: this.logBuffer,
      sessionId: this.sessionId,
      prevSessionId: this.prevSessionId
    });
  };

  UILog.prototype.fromJSONString = function (string) {
    this.logBuffer = (string) ? JSON.parse(string) : [];
  };

  UILog.prototype.clear = function () {
    this.logBuffer = [];
  };

  return UILog;
});
