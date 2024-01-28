'use strict';

// Generic 3D viewer

var CameraControls = require('controls/CameraControls');
var Constants = require('Constants');
var CanvasUtil = require('ui/CanvasUtil');
var ClippingBox = require('gfx/ClippingBox');
var Object3DUtil = require('geo/Object3DUtil');
var Lights = require('gfx/Lights');
var Materials = require('materials/Materials');
var PubSub = require('PubSub');
var WaitPubSubMultiQueue = require('util/WaitPubSubMultiQueue');
var Renderer = require('gfx/Renderer');
var System = require('system');
var FileUtil = require('io/FileUtil');
var UIUtil = require('ui/UIUtil');
var dat = require('ui/datGui');
var keymap = require('controls/keymap');
var Stats = require('stats');
var _ = require('util/util');

/**
 * Basic 3D viewer.  This class includes some common hookup code for setting up the camera and handling redisplay
 * @param params {Object} Configuration
 * @param [params.appId] Application ID
 * @param params.container Main view container element
 * @param [params.useDatGui=false] {boolean} Whether the dat.gui menu should be made visible
 * @param [params.screenshotMaxWidth] {int} Maximum width for a screenshot
 * @param [params.screenshotMaxHeight] {int} Maximum height for a screenshot
 * @param [params.uihookups] {Object.<string, {name: string, element: string, click: callback, shortcut: string}>} Map of ui controls (by name) to basic ui definition.
 * @param [params.instructions] {string} HTML string for instructions
 * @param [params.useAmbientOcclusion=false] {boolean} Whether to use ambient occlusion for rendering or not
 * @param [params.ambientOcclusionType=ssao] {string} What type of ambient occlusion to use (ssao|sao)
 * @param [params.useEDLShader=false] {boolean} Whether to use eye-dome lighting shader pass for rendering or not
 * @param [params.useShadows=false] {boolean} Whether to use shadows for rendering or not
 * @param [params.usePhysicalLights=false] {boolean} Whether to use physically based lights
 * @param [params.loadingIconUrl] {string} URL to use for loading icon
 * @param [params.maxGridCells] {int} The maximum number of cells to have for display of a 2D grid plane
 * @param [params.drawAxes=false] {boolean} Whether to draw axes on the scene or not
 * @param [params.showStats=false] {boolean} Whether to show javascript performance stats panel
 * @param [params.useClippingPlanes=false] {boolean} Whether to support clipping planes
 * @param [params.clipOnLookAt=false] {boolean} Whether to automatically set clipping planes on lookAt
 * @param [params.useOverlayMessages=false] {boolean} Whether to use overlay alert messages
 * @constructor
 */
var Viewer3D = function (params) {
  PubSub.call(this);
  params = _.defaults(params, {
    useEnvMap: true,
    useBackground: false,
    useEDLShader: false,
    useShadows: false,
    lightsOn: false,
    useAmbientOcclusion: false,
    ambientOcclusionType: 'ssao',
    usePhysicalLights: true,
    useOverlayMessages: false
  });
  this.urlParams = this.getUrlParams();
  this.__options = params;
  this.appId = params.appId;
  this.system = System;
  //console.log(this.system);
  this.container = params.container;
  this.useDatGui = params.useDatGui;
  this.useClippingPlanes = params.useClippingPlanes;
  this.clipOnLookAt = params.clipOnLookAt;
  this.screenshotMaxWidth = params.screenshotMaxWidth || Constants.previewMaxWidth;
  this.screenshotMaxHeight = params.screenshotMaxHeight || Constants.previewMaxHeight;
  this.uihookups = params.uihookups;
  this.instructions = params.instructions;
  this.loadingIconUrl = (params.loadingIconUrl !== undefined) ? params.loadingIconUrl : Constants.defaultLoadingIconUrl;
  this.maxGridCells = (params.maxGridCells !== undefined)? params.maxGridCells : 200;

  this.useAmbientOcclusion = params.useAmbientOcclusion;
  this.ambientOcclusionType = params.ambientOcclusionType;
  this.useEDLShader = params.useEDLShader;
  this.useShadows = params.useShadows;
  this.lightsOn = params.lightsOn;
  this.usePhysicalLights = params.usePhysicalLights;
  this.useOverlayMessages = params.useOverlayMessages;

  this.cameraControls = null;
  this.camera = null;
  this.renderer = null;
  this.stats = null;

  // Camera parameters
  this.viewNames = ['unspecified', 'left', 'right', 'bottom', 'top', 'front', 'back'];//, 'turntable-front'];
  this.viewNamesMap = _.invert(this.viewNames);
  this.agentHeight = 1.7;
  this._viewIndex = (params.viewIndex !== undefined) ? params.viewIndex : 0;
  this._useOrthographicCamera = false;
  this._mouseMode = null;
  this._mouseModes = {
    'positionAgentCamera': { cursor: 'crosshair' },
    'selectPoint': {}
  };

  // Camera controls parameters
  this.controlTypes = Constants.ControlTypes;
  this.controlTypesMap = _.invert(this.controlTypes);
  this._controlTypeIndex = 0;
  this.controlType = this.controlTypes[this._controlTypeIndex];
  this.fixedWidthToHeightRatio = false;

  // Wireframe
  this.__isWireframe = false;

  // Draw axes
  this._drawAxes = (params.drawAxes !== undefined) ? params.drawAxes : false;
  this.axesSize = 10*Constants.metersToVirtualUnit;
  this.axes = null;

  // Grid
  this._showGrid = false;
  this._gridNeedUpdate = false; // Does the grid need to be recreated?
  this._gridPlaneHeight = 0;  // Grid plane height
  this.__gridPlane = null;

  // 2D view
  this._show2D = false;

  // What types of meshes to show
  this.__showMeshes = true;
  this.__showLines = true;
  this.__showPoints = true;
  // Have outline or not
  this.__useOutline = false;

  // Have background
  this.__useEnvMap = params.useEnvMap;
  this.__useBackground = params.useBackground;
  this.__selectedEnvMapName = 'neutral';
  var envMapsList = [
    { name: 'neutral' },
    { name: 'venice_sunset',
      path: `${Constants.baseUrl}/data/envmaps/venice_sunset_1k.hdr`,
      type: 'equirectangular'
    }
  ];

  this.__envMaps = _.keyBy(envMapsList, 'name');

  // headlights
  this._useHeadlight = false;
  this._headlights = {};

  // Has this viewer been "launched" (i.e. initialized?)
  this.isLaunched = false;

  if (this.useClippingPlanes) {
    this.clippingBox = new ClippingBox();
  }

  // async tasks that we are waiting on
  this._waiting = new WaitPubSubMultiQueue();
  // Forward all events from waiting queue
  var scope = this;
  this._waiting.SubscribeAll(this, function (event) {
    scope.Publish.apply(scope, arguments);
  });

  // dynamic assets and controls
  this._dynamicAssets = [];
  this._controls = [];

  this.__perfStats = new Stats();
  this.__perfStats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
  this.showStats = (params.showStats !== undefined) ? params.showStats : false;
  document.body.appendChild( this.__perfStats.dom );
};

Viewer3D.prototype = Object.create(PubSub.prototype);
Viewer3D.prototype.constructor = Viewer3D;

Viewer3D.prototype.getUrlParams = function() {
  if (!this.urlParams) {
    this.urlParams = _.getUrlParams();
  }
  return this.urlParams;
};

Object.defineProperty(Viewer3D.prototype, 'useOrthographicCamera', {
  get: function () {return this._useOrthographicCamera; },
  set: function (v) {
    this._useOrthographicCamera = v;
    if (this.camera instanceof THREE.CombinedCamera) {
      if (v) {
        this.camera.toOrthographic(this.cameraControls.controls.target);
      } else {
        this.camera.toPerspective();
      }
    } else {
      console.warn('Camera does not support changing between orthographic and perspective');
    }
  }
});

Object.defineProperty(Viewer3D.prototype, 'mouseMode', {
  get: function () {return this._mouseMode; },
  set: function (v) {
    if (this._mouseMode !== v) {
      if (this._mouseMode) {
        this.__clearMouseModeCallbacks(this._mouseMode);
      }
    }
    this._mouseMode = v;
    if (this._mouseMode) {
      var newcursor = _.get(this._mouseModes, [this._mouseMode, 'cursor'], 'crosshair');
      this.renderer.domElement.style.cursor = newcursor;
    } else {
      this.renderer.domElement.style.cursor = 'auto';
    }
  }
});

Object.defineProperty(Viewer3D.prototype, 'showStats', {
  get: function () {return this._showStats; },
  set: function (v) {
    this._showStats = v;
    if (v) {
      this.__perfStats.dom.style.visibility = 'visible';
    } else {
      this.__perfStats.dom.style.visibility = 'hidden';
    }
  }
});

Object.defineProperty(Viewer3D.prototype, 'useOutline', {
  get: function () {return this.__useOutline; },
  set: function (v) {
    this.__useOutline = v;
    if (v) {
      this.renderer.setEffect('outline');
    } else {
      this.renderer.setEffect(null);
    }
  }
});

Object.defineProperty(Viewer3D.prototype, 'showLines', {
  get: function () {return this.__showLines; },
  set: function (v) {
    this.__showLines = v;
    Object3DUtil.setVisibleForType(this.getRenderScene(), 'line', v);
  }
});

Object.defineProperty(Viewer3D.prototype, 'showPoints', {
  get: function () {return this.__showPoints; },
  set: function (v) {
    this.__showPoints = v;
    Object3DUtil.setVisibleForType(this.getRenderScene(), 'point', v);
  }
});

Object.defineProperty(Viewer3D.prototype, 'showMeshes', {
  get: function () {return this.__showMeshes; },
  set: function (v) {
    this.__showMeshes = v;
    Object3DUtil.setVisibleForType(this.getRenderScene(), 'mesh', v);
  }
});

Object.defineProperty(Viewer3D.prototype, 'viewIndex', {
  get: function () {return this._viewIndex; },
  set: function (v) {
    if (v != undefined) {
      this._viewIndex = (typeof (v) === 'number') ? v : parseInt(v);
      this.setView(this._viewIndex);
    }
  }
});

Object.defineProperty(Viewer3D.prototype, 'controlTypeIndex', {
  get: function () {return this._controlTypeIndex; },
  set: function (v) {
    this._controlTypeIndex = (typeof (v) === 'number') ? v : parseInt(v);
    this.updateCameraControl(this._controlTypeIndex);
  }
});

Object.defineProperty(Viewer3D.prototype, 'autoRotate', {
  get: function () {return this.cameraControls? this.cameraControls.getAutoRotate() : false; },
  set: function (v) {
    if (this.cameraControls) {
      this.cameraControls.setAutoRotate(v);
    }
  }
});

Object.defineProperty(Viewer3D.prototype, 'showAxes', {
  get: function () {return this._drawAxes; },
  set: function (v) {
    this._drawAxes = v;
    var scene = this.getRenderScene();
    if (v) {
      if (!this.axes) {
        this.axes = Object3DUtil.makeAxes(this.axesSize);
      }
      if (this.axes.parent !== scene) {
        scene.add(this.axes);
      }
    } else {
      if (this.axes) {
        scene.remove(this.axes);
      }
    }
  }
});

Object.defineProperty(Viewer3D.prototype, 'showGrid', {
  get: function () {return this._showGrid; },
  set: function (v) {
    this._showGrid = v;
    if (v) {
      this.__ensureGridPlane();
    }
    if (this.__gridPlane) { Object3DUtil.setVisible(this.__gridPlane, v); }
  }
});

Object.defineProperty(Viewer3D.prototype, 'gridPlane', {
  get: function () {
    return this.__gridPlane;
  },
  set: function (g) {
    this.__gridPlane = g;
  }
});

Object.defineProperty(Viewer3D.prototype, 'gridPlaneHeight', {
  get: function () {
    return this._gridPlaneHeight;
  },
  set: function (g) {
    this._gridPlaneHeight = g;
    if (this.__gridPlane) {
      this.__gridPlane.position.y = g;
      this.__gridPlane.updateMatrix();
      Object3DUtil.clearCache(this.__gridPlane);
    }
  }
});

Object.defineProperty(Viewer3D.prototype, 'pickingPlane', {
  get: function () {
    this.__ensurePickingPlane();
    return this.__pickingPlane;
  },
  set: function (g) {
    this.__pickingPlane = g;
  }
});

Object.defineProperty(Viewer3D.prototype, 'useEnvMap', {
  get: function () {
    return this.__useEnvMap;
  },
  set: function (flag) {
    this.__useEnvMap = flag;
    this.__ensureEnvMap(this.__selectedEnvMapName);
  }
});

Object.defineProperty(Viewer3D.prototype, 'useBackground', {
  get: function () {
    return this.__useBackground;
  },
  set: function (flag) {
    this.__useBackground = flag;
    this.__ensureEnvMap(this.__selectedEnvMapName);
  }
});

Object.defineProperty(Viewer3D.prototype, 'show2D', {
  get: function () {return this._show2D; },
  set: function (v) {
    if (v && !this._show2D) {
      // Remember old camera settings
      this._cameraStateBefore2D = this.cameraControls.getCurrentCameraState();
      this._cameraStateBefore2D['useOrthographicCamera'] = this.useOrthographicCamera;
      this._cameraStateBefore2D['viewIndex'] = this.viewIndex;
      this._cameraStateBefore2D['showGrid'] = this.showGrid;
    }
    if (v) {
      this.useOrthographicCamera = true;
      this.viewIndex = this.viewNamesMap['top'];
      // TODO: show grid
      this.showGrid = true;
      // Disable camera controls (TODO: potentially allow zoom)
      this.cameraControls.controls.enabled = false;
    } else {
      // Revert to old settings
      if (this._cameraStateBefore2D) {
        this.useOrthographicCamera = this._cameraStateBefore2D['useOrthographicCamera'];
        this.viewIndex = this._cameraStateBefore2D['viewIndex'];
        this.showGrid = this._cameraStateBefore2D['showGrid'];
        this.cameraControls.restoreCameraState(this._cameraStateBefore2D);
        this._cameraStateBefore2D = null;
      }
      // Reenable camera controls
      this.cameraControls.controls.enabled = true;
    }
    this._show2D = v;
  }
});

Viewer3D.prototype.__clearMouseModeCallbacks = function(mouseMode) {
  // cancel whatever else was happening
  var callbacks = _.get(this._mouseModes, [mouseMode, 'callbacks']);
  if (callbacks) {
    // console.log('Clearing callbacks', callbacks);
    for (var i = 0; i < callbacks.length; i++) {
      var callback = callbacks[i];
      var deactivated = callback.deactivate();
      if (deactivated > 0) {
        callback.notify('canceled');
      }
    }
    callbacks.splice(0, callbacks.length);
  }
};

Viewer3D.prototype.__addEventBasedMouseModeCallback = function(mouseMode, eventname, limitOnce, cb) {
  var scope = this;
  var event_callback = function(event) {
    cb(null, event);
  };
  var callback = {
    notify: function(message) { cb(); },
    deactivate: function() { return scope.Unsubscribe(eventname, scope, event_callback); }
  };
  this._mouseModes[mouseMode] = this._mouseModes[mouseMode] || {};
  this._mouseModes[mouseMode].callbacks = this._mouseModes[mouseMode].callbacks || [];
  this._mouseModes[mouseMode].callbacks.push(callback);
  if (limitOnce) {
    this.SubscribeOnce(eventname, this, event_callback);
  } else {
    this.Subscribe(eventname, this, event_callback, {});
  }
};

Viewer3D.prototype.__computeGridPlanePosition = function() {
  var bbox = this.getSceneBoundingBox();
  var p = bbox.getWorldPosition(new THREE.Vector3(0.5, -0.001, 0.5));
  return p;
};

Viewer3D.prototype.__ensureGridPlane = function (forceRecompute) {
  //console.log('computing grid plane');
  forceRecompute = forceRecompute || this._gridNeedUpdate;
  if (!this.__gridPlane) {
    // TODO: ensure that the grid is large enough
    var width = 30 * Constants.metersToVirtualUnit;
    var height = 30 * Constants.metersToVirtualUnit;
    this.__gridPlane = Object3DUtil.makeGrid(width,height,50,50,0xf0f0f0);
    Object3DUtil.alignToUpFrontAxes(this.__gridPlane, new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0),
      Constants.worldUp, Constants.worldFront);
  }
  var created = false;
  var scene = this.getRenderScene();
  if (this.__gridPlane.parent !== scene || forceRecompute) {
    if (this.__gridPlane && this.__gridPlane.parent) { this.__gridPlane.parent.remove(this.__gridPlane); }
    // Position the grid to be centered on the current scene
    var bbox = this.getSceneBoundingBox();
    if (bbox && bbox.valid()) {
      var bbdims = bbox.dimensions();
      var u = this.__gridPlane.userData;
      if (bbdims.z > u.totalWidth || bbdims.x > u.totalHeight) {
        var width = Math.max(bbdims.z * 1.01, u.totalWidth);
        var height = Math.max(bbdims.x * 1.01, u.totalHeight);
        var nw = Math.ceil(width / u.gridWidth);
        var nh = Math.ceil(height / u.gridHeight);
        width = nw * u.gridWidth;
        height = nh * u.gridHeight;
        // Cap nw and nh so our grid cells are not too many
        if (this.maxGridCells) {
          var prev = nw + 'x' + nh;
          nw = Math.min(nw, this.maxGridCells);
          nh = Math.min(nh, this.maxGridCells);
          if (nw > this.maxGridCells) {
            console.log("why so large? " + nw);
          }
          var curr = nw + 'x' + nh;
          console.log('Capping number of grid lines from ' + prev + ' to ' + curr + ' for maxGridCells=' + this.maxGridCells);
        }
        this.__gridPlane = Object3DUtil.makeGrid(width,height,nw,nh,u.gridColor);
        Object3DUtil.alignToUpFrontAxes(this.__gridPlane, new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0),
         Constants.worldUp, Constants.worldFront);
      }
      var p = bbox.getWorldPosition(new THREE.Vector3(0.5, -0.001, 0.5));
      this.__gridPlane.position.set(p.x, this._gridPlaneHeight, p.z);
      this.__gridPlane.updateMatrix();
      Object3DUtil.clearCache(this.__gridPlane);
    }
    scene.add(this.__gridPlane);
    created = true;
  }
  Object3DUtil.setVisible(this.__gridPlane, this._showGrid);
  this._gridNeedUpdate = false;
  return created;
};

Viewer3D.prototype.__ensurePickingPlane = function() {
  if (!this.__pickingPlane) {
    // TODO: ensure that the grid is large enough
    var width = 100* Constants.metersToVirtualUnit;
    var height = 100* Constants.metersToVirtualUnit;
    this.__pickingPlane = Object3DUtil.makePickingPlane(width,height);
  }
  var scene = this.getRenderScene();
  if (this.__pickingPlane.parent !== scene) {
    // Position the grid to be centered on the current scene
    var bbox = this.getSceneBoundingBox();
    if (bbox && bbox.valid()) {
      var bbdims = bbox.dimensions();
      var u = this.__pickingPlane.userData;
      if (bbdims.x > u.width || bbdims.z > u.height) {
        var width = Math.max(bbdims.x*1.01, u.width);
        var height = Math.max(bbdims.z*1.01, u.height);
        this.__pickingPlane = Object3DUtil.makePickingPlane(width,height);
      }
      var p = bbox.getWorldPosition(new THREE.Vector3(0.5, -0.001, 0.5));
      this.__pickingPlane.position.set(p.x, p.y, p.z);
      this.__pickingPlane.updateMatrix();
      Object3DUtil.clearCache(this.__pickingPlane);
    }
  }
  scene.add(this.__pickingPlane);
};

Viewer3D.prototype.launch = function () {

  if (!this.isLaunched) {
    this.init();
    this.redisplay();
    this.isLaunched = true;
    this.Publish("Launch");
  }
};

Viewer3D.prototype.init = function () {
  console.error('Please initialize renderer, camera, and cameraControls');
};

Viewer3D.prototype.setupInstructions = function () {
  // Create instructions and make tab toggleable
  var instructions = this.instructions;
  if (instructions) {
    if (instructions.panel) {
      instructions.panel.click(function () {
        instructions.element.toggle();
      });
    }
    instructions.element.hide();
    instructions.element.html(instructions.html);
  }
};

Viewer3D.prototype.setupDatGui = function () {
  if (this.useDatGui) {
    var scope = this;
    var showAll = !(this.useDatGui instanceof Object);
    var options = (this.useDatGui instanceof Object) ? this.useDatGui : {};
    // Set up dat gui;
    var gui = new dat.GUI();
    gui.close();
    if ((showAll || options['appId']) && this.appId != null) {
      const appIdGui = gui.add(this, 'appId');
      $(appIdGui.domElement).find('input').prop('readonly', true);
    }
    if (showAll || options['camera']) {
      var cameraGui = gui.addFolder('camera');
      cameraGui.add(this, 'useOrthographicCamera').name('orthographic').listen();
      cameraGui.add(this, 'viewIndex', this.viewNamesMap).name('view').listen();
      cameraGui.add(this, 'controlTypeIndex', this.controlTypesMap).name('controls').listen();
      cameraGui.add(this, 'autoRotate').listen();
      cameraGui.add(this, 'agentHeight', this.agentHeight).listen();
      cameraGui.add({
        positionAgent: function() {
          scope.mouseMode = 'positionAgentCamera';
        }
      }, 'positionAgent').listen();
    }
    var viewGui = gui.addFolder('view');
    if (showAll || options['showAxes']) { viewGui.add(this, 'showAxes').listen(); }
    if (showAll || options['axesSize']) { viewGui.add(this, 'axesSize', 1, 10000).listen(); }
    if (showAll || options['showGrid']) { viewGui.add(this, 'showGrid').listen(); }
    if (showAll || options['showGrid']) { viewGui.add(this, 'gridPlaneHeight', -10*Constants.metersToVirtualUnit, 10*Constants.metersToVirtualUnit).listen(); }
    if (showAll || options['show2D'])   { viewGui.add(this, 'show2D').listen(); }
    if (showAll || options['showStats']) { viewGui.add(this, 'showStats').listen(); }
    if (showAll || options['showLines']) { viewGui.add(this, 'showLines').listen(); }
    if (showAll || options['showPoints']) { viewGui.add(this, 'showPoints').listen(); }

    var renderingGui = gui.addFolder('rendering');
    if (showAll || options['useOutline']) { renderingGui.add(this, 'useOutline').listen(); }
    if (showAll || options['envMap']) {
      var envMapNames = Object.keys(this.__envMaps);
      renderingGui.add(this, 'envMapName', envMapNames).name('envMap').listen();
    }
    if (showAll || options['useBackground']) { renderingGui.add(this, 'useBackground').listen(); }
    if (showAll || options['useEnvMap']) { renderingGui.add(this, 'useEnvMap').listen(); }
    if (showAll) { this.renderer.setupDatGui(renderingGui); }

    if (this.clippingBox && (showAll || options['showClipping'])) {
      var clippingGui = viewGui.addFolder('clipping');
      this.clippingBox.updateDatGui(clippingGui);
      this.renderer.renderer.clippingPlanes = Constants.EmptyArray;
      var propsClipping = {
        get 'enabled'() { return scope.renderer.renderer.clippingPlanes !== Constants.EmptyArray; },
        set 'enabled'( v ) { scope.renderer.renderer.clippingPlanes = v? scope.clippingBox.clippingPlanes: Constants.EmptyArray; }
      };
      clippingGui.add(propsClipping, 'enabled').listen();
      this.clippingOptions = propsClipping;
    }

    this.datgui = gui;
  }
};

Viewer3D.prototype.updateDatGui = function () {
  if (this.datgui) {
    this.datgui.update();
  }
};

Viewer3D.prototype.setupLoadingIcon = function () {
  if (this.loadingIconUrl) {
    this.loadingIcon = $('<img/>')
      .attr('src', this.loadingIconUrl);
    this.loadingIcon.hide();
    $(this.container).append(this.loadingIcon);
  }
};

Viewer3D.prototype.__positionLoadingIcon = function () {
  if (this.loadingIcon && this.container) {
    this.loadingIcon.position({
      my: 'center',
      at: 'center',
      of: this.container
    });
  }
};

Viewer3D.prototype.showLoadingIcon = function (isLoading) {
  //console.log('isLoading=%s', isLoading);
  this.isLoading = isLoading;
  if (this.loadingIcon) {
    this.__positionLoadingIcon();
    if (this.isLoading) {
      this.loadingIcon.show();
      this.__positionLoadingIcon();
    } else {
      this.loadingIcon.hide();
    }
  }
};

Viewer3D.prototype.addWaitingToQueue = function(queueName, obj) {
  var waitingKey = queueName + '_' + _.generateRandomId();
  this.addWaiting(waitingKey, obj || true, queueName);
  return waitingKey;
};

Viewer3D.prototype.addWaiting = function(id, obj, queueName) {
  this._waiting.addWaiting(id, obj, queueName);
  this.showLoadingIcon(true);
};

Viewer3D.prototype.removeWaiting = function(id, queueName) {
  this._waiting.removeWaiting(id, queueName);
  if (this._waiting.isAllEmpty) {
    this.showLoadingIcon(false);
  }
};

Viewer3D.prototype.waitAll = function(cb) {
  this._waiting.waitAll(cb);
};

Viewer3D.prototype.toggleControlType = function () {
  // Changes camera controls
  this.controlTypeIndex = (this.controlTypeIndex + 1) % this.controlTypes.length;
};

Viewer3D.prototype.getSceneBoundingBox = function () {
  console.error('getSceneBoundingBox not Implemented!!!');
};

// Returns desirable aspect ratio for camera
Viewer3D.prototype.getAspectRatio = function () {
  var width = this.container.clientWidth;
  var height = this.container.clientHeight;
  return width / height;
};

Viewer3D.prototype.resetCamera = function (options) {
  this.camera.up.copy(Constants.worldUp);
  if (options) {
    this.cameraControls.viewTarget(options);
  } else {
    this.camera.position.copy(Constants.defaultCamera.position);
    this.camera.updateMatrix();
    this.camera.updateProjectionMatrix();
  }
};

Viewer3D.prototype.setView = function (options) {
  if (!this.cameraControls) return;
  var width = this.container.clientWidth;
  var height = this.container.clientHeight;

  var bbox = this.getSceneBoundingBox();
  if (typeof options === 'string') {
    // Convert to something....
    if (options.indexOf(',') > 0) {
      options = options.split(",");
    } else {
      options = parseInt(options);
    }
  }

  if (options instanceof THREE.Vector2) {
    var view = this.cameraControls.getView({ name: 'view', target: bbox, theta: options.x, phi: options.y});
    this.cameraControls.viewTarget(view);
  } else if (Array.isArray(options)) {
    if (options.length === 2) {
      var view = this.cameraControls.getView({ name: 'view', target: bbox, theta: options[0], phi: options[1]});
      this.cameraControls.viewTarget(view);
    } else {
      console.error("Cannot interpret view: " + options.join(","));
    }
  } else if (typeof options === 'number') {
    var index = options;
    var views = this.cameraControls.generateViews(bbox, width, height);
    this.cameraControls.viewTarget(views[index]);
  } else {
    this.cameraControls.viewTarget(options);
  }
};

Viewer3D.prototype.updateCameraControl = function (index) {
  this._controlTypeIndex = index;
  this.controlType = this.controlTypes[index];
  this.cameraControls.setControlType(this.controlType);
};

Viewer3D.prototype.saveImage = function (maxWidth, maxHeight) {
  // NOTE: This may crash if dataUrl is too long...
  var dataUrl = this.getImageData(maxWidth, maxHeight);
  var blob = CanvasUtil.dataUrlToBlob(dataUrl);
  this.__savedImageCount = this.__savedImageCount || 0;
  FileUtil.saveBlob(blob, this.getRenderScene().name + '_image_' + this.__savedImageCount + '.png');
  this.__savedImageCount++;
  //this.showImageData(dataUrl);
};

Viewer3D.prototype.saveImageDataToPng = function(pixels, filename) {
  var canvas = CanvasUtil.createCanvasFromPixels(pixels);
  FileUtil.saveCanvasImage(canvas, filename);
};

Viewer3D.prototype.showImageData = function (dataUrl) {
  var imageHtml = '<img src="' + dataUrl + '"/>';
  bootbox.dialog({
    message: imageHtml,
    onEscape: true
  });
  // Can no longer open dataUrls in chrome!
  // https://bugs.chromium.org/p/chromium/issues/detail?id=594215
  //window.open(dataUrl);
};

Viewer3D.prototype.getPreviewImageData = function () {
  return this.getImageData(this.screenshotMaxWidth, this.screenshotMaxHeight);
};

Viewer3D.prototype.getImageData = function (maxWidth, maxHeight) {
  this.render();
  var dataUrl = CanvasUtil.getTrimmedCanvasDataUrl(this.renderer.domElement,maxWidth,maxHeight);
  return dataUrl;
};

Viewer3D.prototype.onWindowResize = function (options) {
  if (this.renderer && this.camera) {

    var width = this.container.clientWidth;
    var height = this.container.clientHeight;
    if (this.fixedWidthToHeightAspectRatio) {
      this.camera.aspect = this.fixedWidthToHeightAspectRatio;
      var height2 = width / this.fixedWidthToHeightAspectRatio;
      if (height2 > height) {
        width = height * this.fixedWidthToHeightAspectRatio;
      } else {
        height = height2;
      }
      console.log('got width x height', width, height, this.fixedWidthToHeightAspectRatio);
    } else {
      this.camera.aspect = width / height;
    }
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);

    if (this.cameraControls) {
      this.cameraControls.handleResize();
    }

    this.__positionLoadingIcon();
    this.render();
  }
};

Viewer3D.prototype.onSceneChanged = function () {
  // Set various parameters for new scene
  this.useOrthographicCamera = this._useOrthographicCamera;
  var p = this.__computeGridPlanePosition();
  this.gridPlaneHeight = p.y;
  this._gridNeedUpdate = true;
  this.showGrid = this._showGrid;
  if (!this.__keepCurrentView) {
    this.viewIndex = this._viewIndex;
  }
  this.showAxes = this._drawAxes;
  if (this.clippingBox) {
    var bbox = this.getSceneBoundingBox();
    if (bbox && bbox.valid()) {
      this.clippingBox.init(bbox);
    }
  }
  this.__ensureEnvMap(this.__selectedEnvMapName);
};

Viewer3D.prototype.getRenderScene = function () {
  // NOTE: Subclasses should provide implementation!!!
};

Viewer3D.prototype.render = function () {
  if (!this.renderer) return;
  var scene = this.getRenderScene();
  if (scene) {
    this.renderer.render(scene, this.camera);
  }
};

Viewer3D.prototype.clearAssets = function () {
  this._dynamicAssets.forEach(function(x) { x.destroy(); });
  this._dynamicAssets = [];  // Clears dynamic assets
};

Viewer3D.prototype.clearControls = function () {
  this._controls = [];  // Clears controls
};

Viewer3D.prototype.addControl = function (control) {
  if (this._controls.indexOf(control) < 0) {
    this._controls.push(control);
  }
};

Viewer3D.prototype.updateAndRender = function () {
  this._dynamicAssets.forEach(function(x) { x.update(); });
  this._controls.forEach(function(x) { x.update(); });
  this.render();
};

Viewer3D.prototype.redisplay = function () {
  requestAnimationFrame(this.redisplay.bind(this));
  if (this.__perfStats) { this.__perfStats.begin(); }
  if (this.cameraControls) {
    this.cameraControls.update();
  }
  this.updateAndRender();
  if (this.__perfStats) { this.__perfStats.end(); }
};

Viewer3D.prototype.animate = function () {
  requestAnimationFrame(this.animate.bind(this));
  this.updateAndRender();
};

// Errors
Viewer3D.prototype.showError = function (msg, parent) {
  return UIUtil.showAlert({ parent: parent, message: msg, style: 'alert-danger', overlay: this.useOverlayMessages });
};

Viewer3D.prototype.showWarning = function (msg, parent) {
  return UIUtil.showAlert({ parent: parent, message: msg, style: 'alert-warning', overlay: this.useOverlayMessages });
};

Viewer3D.prototype.showMessage = function (msg, parent) {
  return UIUtil.showAlert({ parent: parent, message: msg, style: 'alert-info', overlay: this.useOverlayMessages });
};

// Hookups for event registration
// Register event handlers for mouse and keyboard interaction
Viewer3D.prototype.registerEventListeners = function () {
  this.registerBasicEventListeners();
  this.registerCustomEventListeners();

  // Simple UIHookups
  UIUtil.setupUIHookups(this.uihookups, keymap);
};

// Event listeners that we will always want
Viewer3D.prototype.registerBasicEventListeners = function () {
  // Toggle alerts on close
  $(document).on('click', '.alert-close', function () {
    $(this).parent().hide();
  });
  var scope = this;
  window.addEventListener('resize', function(event) { scope.onWindowResize(event); }, false);
  window.addEventListener("beforeunload", function(event) { scope.confirmPageUnload(event); } , false);
};

Viewer3D.prototype.registerContextMenu = function(callback) {
  window.addEventListener('pointerdown', function(event) {
    if ((event.ctrlKey || event.metaKey) && event.button === THREE.MOUSE.RIGHT) {
      event.stopPropagation();
    }
  }, true);
  $(document).on('contextmenu', function(event) {
    if ((event.ctrlKey || event.metaKey) && event.button === THREE.MOUSE.RIGHT) {
      event.preventDefault();
      callback(event);
    }
  });
};

Viewer3D.prototype.confirmPageUnload = function(event) {
  var message = this.checkUnsavedChanges();
  if (message) {
    event.returnValue = message;
    return message;
  }
};

Viewer3D.prototype.checkUnsavedChanges = function() {
  return null;  // Override and return message if there are unsaved changes
};

// Event listeners that we want for sometimes
Viewer3D.prototype.registerCustomEventListeners = function () {
};

// Custom asset registration
var AssetGroups = require('assets/AssetGroups');
var AssetManager = require('assets/AssetManager');
var AssetsDb = require('assets/AssetsDb');
var LocalFileLoader = require('io/LocalFileLoader');

Viewer3D.prototype.setSourceAndSearch = function (searchController, source, searchText, cb) {
  // Goto this asset group and do a search
  searchController.selectSource(source);
  searchController.setSearchText(searchText);
  searchController.startSearch(cb);
};

Viewer3D.prototype.searchForAsset = function (searchController, defaultSource, assetId) {
  var source = defaultSource;
  var initialSearch = '';
  if (assetId) {
    var sid = AssetManager.toSourceId(defaultSource, assetId);
    source = sid.source;
    initialSearch = 'fullId:' + assetId;
  }
  this.setSourceAndSearch(searchController, source, initialSearch);
};

Viewer3D.prototype.registerCustomAssetGroup = function (searchController, assetIdsFile, jsonFile, onLoad) {
  function _getAssetList(assetGroup, filename, data) {
    if (searchController.hasSource(assetGroup.name)) {
      this.showWarning('Replacing models for source ' + assetGroup.name);
    }
    AssetGroups.registerAssetGroup(assetGroup);
    console.log('Registered asset group: ' + assetGroup.name);
    var assetsDb = new AssetsDb();
    assetsDb.loadAssetInfoFromData(assetGroup, data, filename);
    assetGroup.setAssetDb(assetsDb);
    searchController.registerSearchModule(assetGroup.name, assetsDb);
    if (onLoad) {
      if (typeof onLoad === 'function') {
        onLoad(assetGroup);
      } else {
        var searchText = (typeof onLoad === 'string') ? onLoad : '';
        this.setSourceAndSearch(searchController, assetGroup.name, searchText);
      }
    }
    this.Publish('AssetGroupRegistered', assetGroup);
  }
  function _registerAssetGroupFromJson(json) {
    if (typeof json === 'string') {
      json = JSON.parse(json);
    }
    var assetGroup = AssetGroups.createCustomAssetGroup(json);
    if (!assetIdsFile) {
      assetIdsFile = assetGroup.idsFile;
    }
    var filename = (assetIdsFile instanceof File) ? assetIdsFile.name : assetIdsFile;
    this.loadTextFile(assetIdsFile, _getAssetList.bind(this, assetGroup, filename), 'Error loading model file');
  }

  this.loadTextFile(jsonFile, _registerAssetGroupFromJson.bind(this), 'Error loading metadata file');
};

Viewer3D.prototype.registerCustomAssetGroups = function (searchController, assetFiles, onLoad) {
  var loaded = [];
  function onAssetGroupLoaded(i, assetGroup) {
    loaded[i] = assetGroup;
    var allOk = _.every(loaded, function(x) { return x; });
    if (allOk) {
      onLoad(loaded);
    }
  }
  for (var i = 0; i < assetFiles.length; i++) {
    var f = assetFiles[i];
    if (typeof f === 'string') {
      f = { metadata: f };
    }
    this.registerCustomAssetGroup(searchController, f.ids, f.metadata, onAssetGroupLoaded.bind(this,i));
  }

};


Viewer3D.prototype.loadTextFile = function (file, onsuccess, onerror) {
  var filename = (file instanceof File) ? file.name : file;
  if (typeof onerror === 'string') {
    onerror = this.showError.bind(this, onerror + filename);
  }
  if (file instanceof File) {
    var localLoader = new LocalFileLoader();
    localLoader.load(file, 'UTF-8', onsuccess, undefined, onerror);
  } else {
    $.ajax({
      type: 'GET',
      url: file,
      success: onsuccess,
      error: onerror,
      complete: function () {}
    });
  }
};

Object.defineProperty(Viewer3D.prototype, 'showLocalPanel', {
  get: function () { return $('#customLoadingPanel').is(':visible'); },
  set: function (v) {
    if (v) { $('#customLoadingPanel').show(); }
    else { $('#customLoadingPanel').hide(); }
  }
});

Viewer3D.prototype.setupLocalLoading = function (loadFromLocal, allowMultiple, fileTypes) {
  // Load from local button
  var loadingPanel = $('#customLoadingContents');
  var loadLocalInput = UIUtil.createFileInput({
    id: 'loadLocal', label: 'Load',
    loadFn: loadFromLocal,
    allowMultiple: allowMultiple,
    fileTypes: fileTypes
  });
  if (loadLocalInput.group) {
    loadingPanel.append(loadLocalInput.group);
  }
};

Viewer3D.prototype.setupBasicRenderer = function() {
  // Setup renderer
  var width = this.container.clientWidth;
  var height = this.container.clientHeight;
  this.camera = new THREE.CombinedCamera(width, height, 45, 1, 4000, 1, 4000);
  this.renderer = new Renderer({
    container: this.container,
    camera: this.camera,
    useAmbientOcclusion: this.useAmbientOcclusion,
    useEDLShader: this.useEDLShader,
    useShadows: this.useShadows,
    usePhysicalLights: this.usePhysicalLights
  });

  // Setup camera controls
  this.cameraControls = new CameraControls({
    camera: this.camera,
    controlType: this.controlType,
    container: this.container,
    autoRotateCheckbox: $('#autoRotate'),
    renderCallback: this.render.bind(this) });
};

// toggle wireframe mode to see triangle
Viewer3D.prototype.toggleWireframe = function () {
  this.setWireframeMode(!this.__isWireframe);
};

Viewer3D.prototype.setWireframeMode = function (flag) {
  this.__isWireframe = flag;
  var scene = this.getRenderScene();
  if (!scene) { return; } // Not ready yet
  //console.log('set wireframe', this.__isWireframe);
  if (this.__isWireframe) {
    Object3DUtil.setWireframe(scene, true);
  } else {
    Object3DUtil.setWireframe(scene, false);
  }
};

Viewer3D.prototype.createDefaultLight = function() {
  return Lights.getDefaultHemisphereLight(this.usePhysicalLights, this.lightsOn);
};

Viewer3D.prototype.positionCameraByAgentHeight = function(event, objects) {
  var mouse = this.picker.getCoordinates(this.container, event);
  var intersects = this.picker.getIntersectedDescendants(mouse.x, mouse.y, this.camera, objects);
  if (intersects.length > 0) {
    var cameraPosition = intersects[0].point.clone();
    cameraPosition.y += this.agentHeight*Constants.metersToVirtualUnit;
    var targetPosition = this.cameraControls.controls.target;
    if (targetPosition) {
      targetPosition.y = cameraPosition.y;
      this.cameraControls.viewTarget({position: cameraPosition, target: targetPosition});
    } else {
      this.cameraControls.viewTarget({position: cameraPosition, target: this.cameraControls.lastViewConfig.target});
    }
    var cameraControlIndex = this.controlTypesMap['firstPerson'];
    if (cameraControlIndex >= 0) {
      this.updateCameraControl(cameraControlIndex);
    }
  }
};

Viewer3D.prototype.__updateEnvMapSettings = function(envMapEntry) {
  const scene = this.getRenderScene();
  const envMap = envMapEntry? envMapEntry.envMap : null;
  scene.environment = this.useEnvMap? envMap : null;
  scene.background = this.useBackground? envMap : null;
};

Viewer3D.prototype.__ensureEnvMap = function(name) {
  var entry = this.__envMaps[name];
  if (entry) {
    if (!entry.envMap) {
      this.__loadEnvMap(entry);
    } else {
      this.__updateEnvMapSettings(entry);
    }
  } else {
    console.error('Unknown env map', name);
  }
};

Viewer3D.prototype.__loadEnvMap = function(entry) {
  Materials.getEnvMap(entry, this.renderer.getPmremGenerator()).then(( { envMap } ) => {
    entry.envMap = envMap;
    this.__updateEnvMapSettings(entry);
  });
};

Object.defineProperty(Viewer3D.prototype, 'envMap', {
  get: function () {
    return this.__envMaps[this.__selectedEnvMapName];
  }
});

Object.defineProperty(Viewer3D.prototype, 'envMapName', {
  get: function () { return this.__selectedEnvMapName; },
  set: function (v) {
    this.__selectedEnvMapName = v;
    this.__ensureEnvMap(this.__selectedEnvMapName);
  }
});

Viewer3D.prototype.initHeadlights = function() {
  var headlight1 = new THREE.PointLight('#ffffff', 0, 0, 2);
  headlight1.position.y = .2;
  headlight1.position.x = .2;
  headlight1.shadow.bias = -0.02;
  headlight1.shadow.mapSize = new THREE.Vector2(1024, 1024);
  headlight1.name = 'headlight_point';
  headlight1.castShadow = this.useShadows;
  this._headlights['point'] = headlight1;

  var headlight2  = new THREE.DirectionalLight('#ffffff', 0.5);
  headlight2.position.set(0.5, 0, 0.866); // ~60º
  headlight2.name = 'headlight_directional';
  headlight2.castShadow = this.useShadows;
  this._headlights['directional'] = headlight2;
};

Object.defineProperty(Viewer3D.prototype, 'useHeadlight', {
  get: function () { return this._useHeadlight; },
  set: function (v) {
    this._useHeadlight = v;
    if (this._headlights) {
      _.each(this._headlights, (light, k) => {
        if (this._useHeadlight) {
          this.camera.add(light);
        } else {
          this.camera.remove(light);
        }
      });
    }
  }
});

Viewer3D.prototype.authenticate = function (cb) {
  // Most basic auth ever
  if (this.userId && !this.userId.startsWith('USER@')) {
    cb({ username: this.userId });
    return;
  }
  if (!this.auth) {
    var Auth = require('util/Auth');
    this.auth = new Auth();
  }
  this.auth.authenticate(function (user) {
    this.userId = user.username;
    cb(user);
  }.bind(this));
};

module.exports = Viewer3D;