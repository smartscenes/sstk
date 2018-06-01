'use strict';

var AssetGroups = require('assets/AssetGroups');
var AssetManager = require('assets/AssetManager');
var CanvasUtil = require('ui/CanvasUtil');
var Colors = require('util/Colors');
var Constants = require('Constants');
var fs = require('io/FileUtil');
var ImageUtil = require('util/ImageUtil');
var Renderer = require('gfx/Renderer');
var SearchController = require('search/SearchController');
var Simulator = require('sim/Simulator');
var SimDialog = require('sim/SimDialog');
var SimEditUI = require('sim/SimEditUI');
var Viewer3D = require('Viewer3D');
var _ = require('util');
require('jquery-console');

Constants.defaultPalette = Colors.palettes.d3_unknown_category18;

var simConfig = Constants.config.sim || {};
var sensorConfigs = simConfig.sensors;
var agentConfigs = simConfig.agents;
var replaceModels = simConfig.replaceModels;

if (_.isArray(sensorConfigs)) {
  sensorConfigs = { 'default': sensorConfigs };
}
_.each(sensorConfigs, function (sensors) {
  _.each(sensors, function(s) {
    s.includeIndex = true;
  });
});

/**
 * Viewer for Simulator
 * @constructor
 * @memberOf sim
 */
function SimViewer(params) {
  Constants.setVirtualUnit(1);  // meters
  var scope = this;
  var defaults = {
    appId: 'SimViewer@0.0.1',
    scene: {
      fullId: 'p5dScene.53f23453bc17d9010064d5ae887f683b',
      enableMirrors: true,
      replaceModels: replaceModels,
      hideCategories: ['plant', 'person']
    },
    agent: {},
    navmap: { autoUpdate: true, autoCreateGrid: false },
    start: 'random',
    goal: 'random',
    // goal: { type: 'position', position: [2.68, 0.05, -10.39] },
    // goal: { type: 'object', categories: ['door', 'arch'], select: 'random' },
    // goal: { type: 'room', minRooms: 1, roomTypes: ['bathroom'], select: 'closest' },
    frameSkip: 1,
    observations: { objectId: true, objectType: false, forces: true, normal: true, depth: true, map: true },
    uihookups: _.keyBy([
      {
        name: 'toggleEdit',
        click: function() {
          scope.showEdit = !scope.showEdit;
        },
        shortcut: 'f3',
        keyopts: { filter: function(event) { return true; }}
      },
      {
        name: 'toggleConsole',
        click: function() {
          scope.showConsole = !scope.showConsole;
        },
        shortcut: 'f4',
        keyopts: { filter: function(event) { return true; }}
      },
      // Main controls
      {
        name: 'forwards',
        click: function() {
          scope.act({name: 'forwards'});
        },
        shortcut: 'i'
      },
      {
        name: 'backwards',
        click: function() {
          scope.act({name: 'backwards'});
        },
        shortcut: 'k'
      },
      {
        name: 'turnLeft',
        click: function() {
          scope.act({name: 'turnLeft'});
        }.bind(this),
        shortcut: 'j'
      },
      {
        name: 'turnRight',
        click: function() {
          scope.act({name: 'turnRight'});
        },
        shortcut: 'l'
      },
      {
        name: 'idle',
        click: function() {
          scope.act({name: 'idle'});
        },
        shortcut: 'd'
      },
      {
        name: 'strafeLeft',
        click: function() {
          scope.act({name: 'strafeLeft'});
        },
        shortcut: 'left'
      },
      {
        name: 'strafeRight',
        click: function() {
          scope.act({name: 'strafeRight'});
        },
        shortcut: 'right'
      },
      {
        name: 'lookUp',
        click: function() {
          scope.act({name: 'lookUp', angle: Math.PI / 24});
        },
        shortcut: 'up'
      },
      {
        name: 'lookDown',
        click: function() {
          scope.act({name: 'lookDown', angle: Math.PI / 24});
        },
        shortcut: 'down'
      },
      {
        name: 'observe',
        click: function() {
          scope.observe();
        },
        shortcut: 'o'
      },
      {
        name: 'reset',
        click: function() {
          scope.reset();
        },
        shortcut: 'r'
      },
      {
        name: 'showMap',
        click: function() {
          scope.toggleShowMap();
        },
        shortcut: 'm'
      },
      {
        name: 'showScene',
        click: function() {
          scope.toggleShowScene();
        },
        shortcut: 'shift-m'
      },
      {
        name: 'screenshot',
        click: function() {
          scope.saveImage();
        },
        shortcut: 'ctrl-i'
      },
      {
        name: 'Toggle stats',
        click: function () {
          this.showStats = !this.showStats;
        }.bind(this),
        shortcut: 'f5'
      },
      {
        name: 'topview',
        click: function() {
          var view = scope.simulator.prepareTopDownMapProjection();
          var canvas = CanvasUtil.createCanvasFromPixels({ width: view.width, height: view.height, data: view.pixels });
          fs.saveCanvasImage(canvas, scope.simulator.state.getSceneId() + '.topview.png');
        },
        shortcut: 'v'
      }
    ], 'name')
  };
  this.urlParams = _.getUrlParams();
  var allParams = _.defaultsDeep(Object.create(null), this.urlParams, params, defaults);
  if (allParams.agentConfig) {
    _.defaultsDeep(allParams.agent, agentConfigs[allParams.agentConfig]);
  }
  if (this.urlParams.addObjectAtGoal) {
    // Initial modifications to scene
    allParams.modifications = [{
      'name': 'add',
      'modelIds': 'p5d.s__1957',
      'positionAt': 'goal',
      'rotation': 'random'
    }];
  }
  Viewer3D.call(this, allParams);

  this.allParams = allParams;
  this.frameSkip = allParams.frameSkip;
  this.mapContainer = allParams.mapContainer;
  this.sensorsContainer = allParams.sensorsContainer;
  this.goalsContainer = allParams.goalsContainer;
  // Already in Viewer3D
  //this.useAmbientOcclusion = (allParams.useAmbientOcclusion !== undefined) ? allParams.useAmbientOcclusion : false;
  //this.useShadows = (allParams.useShadows !== undefined) ? allParams.useShadows : false;
  //this.useLights = (allParams.useLights !== undefined) ? allParams.useLights : false;
  this.defaultModelFormat = this.urlParams['modelFormat'] || params.defaultModelFormat || 'utf8v2';
  this.defaultSceneFormat = this.urlParams['format'] || params.defaultSceneFormat || 'wss';
  AssetGroups.setDefaultFormat(this.defaultModelFormat);

  this.simulator = null;
  this.simDialog = null;
  this.simEdit = null;
  this.mapModeIndex = 0;
  this.__autoUpdateObservations = false;
  this.__initialized  = false;
}

SimViewer.prototype = Object.create(Viewer3D.prototype);
SimViewer.prototype.constructor = SimViewer;

Object.defineProperty(Viewer3D.prototype, 'showEdit', {
  get: function () { return this.simEdit.isVisible; },
  set: function (v) {
    if (this.simEdit) {
      if (v) {
        this.simEdit.show();
      } else {
        this.simEdit.hide();
      }
    }
  }
});

Object.defineProperty(Viewer3D.prototype, 'showConsole', {
  get: function () { return this.console? this.console.is(':visible') : false; },
  set: function (v) {
    if (this.console) {
      if (v) {
        this.console.show();
      } else {
        this.console.hide();
      }
    }
  }
});

SimViewer.prototype.init = function () {
  if (!this.__initialized) {
    // RENDERER
    var width = this.container.clientWidth;
    var height = this.container.clientHeight;
    this.renderer = new Renderer({
      container: this.container,
      isOffscreen: true,  // NOTE: enables return of color frames, slows down render loop
      useAmbientOcclusion: this.useAmbientOcclusion,
      useLights: this.useLights,
      useShadows: this.useShadows
    });
    var assetManager = new AssetManager({
      autoAlignModels: false, autoScaleModels: false, assetCacheSize: 100,
      enableLights: this.allParams.useLights,
      defaultLightState: this.allParams.defaultLightState
    });
    assetManager.setSearchController(new SearchController());
    assetManager.searchController.setFilter('model', '+source:(wss OR p5d)');
    assetManager.Subscribe('dynamicAssetLoaded', this, function(d) {
      //console.log('adding to dynamic assets', d);
      this._dynamicAssets.push(d);
    }.bind(this));
    var sensorConfigName = this.allParams.sensors || 'default';
    var sensorConfig = sensorConfigs[sensorConfigName] || sensorConfigs.default;
    this.simulator = new Simulator({
      renderer: this.renderer,
      useLights: this.useLights,
      useShadows: this.useShadows,
      useSky: this.allParams.useSky,
      width: width,
      height: height,
      assetManager: assetManager,
      navmap: this.allParams.navmap,
      collisionDetection: this.allParams.collisionDetection,
      scene: this.allParams.scene,
      agent: this.allParams.agent,
      sensors: sensorConfig,
      visualizeSensors: true,
      observations: this.allParams.observations,
      start: this.allParams.start,
      goal: this.allParams.goal,
      defaultLightState: this.allParams.defaultLightState,
      modifications: this.allParams.modifications,
      colorEncoding: 'screen',
      fs: fs
    });
    this.camera = this.simulator.getAgent().getCamera();
    this.simDialog = new SimDialog({ simulator: this.simulator });
    this.simEdit = new SimEditUI({ app: this,
      editPanel: $('#editPanel'),
      allowEdit: true,
      editMode: false,
      modelSources: ['models3d', 'wss', 'p5d'],
      restrictModels: '+source:(wss OR p5d)',
      simulator: this.simulator,
      assetManager: assetManager,
      sceneState: this.simulator.state.sceneState,
      cameraControls: { camera: this.camera },
    });
    this.simEdit.init();
    this.showEdit = false;
    //this.simulator.assetManager.maxAnisotropy = this.renderer.getMaxAnisotropy();

    this.setupConsole();
    this.registerEventListeners();
    window.addEventListener('resize', this.onWindowResize.bind(this), false);
    this.__initialized = true;
  }
};

SimViewer.prototype.act = function(opts) {
  if (this.__autoUpdateObservations) {
    var scope = this;
    this.simulator.step(opts, this.frameSkip, function (err, res) {
      scope.lastActionResult = res;
      scope.visualizeSensorData(scope.sensorsContainer, res);
    });
  } else {
    this.simulator.act(opts, this.frameSkip);
  }
};

SimViewer.prototype.toggleShowScene = function() {
  this.simulator.state.sceneState.scene.visible = !this.simulator.state.sceneState.scene.visible;
};

SimViewer.prototype.toggleShowMap = function() {
  var navscene = this.simulator.state.navscene;
  if (navscene) {
    this.mapModeIndex = (this.mapModeIndex + 1) % navscene.mapModes.length;
    console.log('set mapModeIndex to ' + this.mapModeIndex);
    navscene.showMap(this.mapModeIndex);
  } else {
    console.warn('cannot toggle mapModeIndex');
  }
};

SimViewer.prototype.registerCustomEventListeners = function() {
  var scope = this;
  function __wrappedEventListener(cb) {
    return function(event) {
      event.preventDefault();
      scope.renderer.domElement.focus();
      var r = cb(event);
      if (r === false) {
        event.stopImmediatePropagation();
        event.stopPropagation();
      }
      return r;
    }
  }

  this.renderer.domElement.addEventListener('click', __wrappedEventListener(function (event) {
      var picker = scope.simulator.__simOperations.picker;

      var raycastMouse = picker.getCoordinates(scope.renderer.domElement, event);
      var intersected = picker.getFirstIntersected(raycastMouse.x, raycastMouse.y, scope.simulator.getAgent().getCamera(), scope.simulator.state.sceneState.fullScene.pickables);
      console.log('intersected', raycastMouse, intersected);
      return false;
    }),
    false
  );
};

SimViewer.prototype.launch = function () {
  var scope = this;
  if (!this.isLaunched) {
    Viewer3D.prototype.launch.call(this);
    //onLaunched = onLaunched || function(cb) { setTimeout(0, cb); };
    // Make sure there is nothing we are waiting for before starting (e.g. registering of assets)
    this.waitAll(function(err, result) {
      scope.simulator.start(function (startErr, sceneState) {
        if (startErr) {
          console.log('Got error starting simulator', startErr);
        } else {
          scope.isStarted = true;
          console.log('Started!');
          console.log('Got scene state from simulator', sceneState);
          // Do initial observation
          scope.onWindowResize(); // Make sure window size is good
          scope.getEpisodeInfo();
        }
      });
    });
  }
};

SimViewer.prototype.reset = function () {
  var scope = this;
  this.simulator.reset(function(err, sceneState) {
    scope.getEpisodeInfo();
  });
};

SimViewer.prototype.getEpisodeInfo = function() {
  var scope = this;
  this.simulator.getEpisodeInfo({}, function(err, episodeInfo) {
    console.log('Got episode info', episodeInfo);
    if (episodeInfo && episodeInfo.goalObservations) {
      for (var i = 0; i < episodeInfo.goalObservations.length; i++) {
        scope.visualizeSensorData(scope.goalsContainer, episodeInfo.goalObservations[i], true, 'goal' + i);
      }
    }
    scope.simulator.step({name: 'idle'}, 1, function (err, res) {
      scope.lastActionResult = res;
      scope.visualizeSensorData(scope.sensorsContainer, res, true);
    });
  });
};

SimViewer.prototype.render = function () {
  if (this.simulator && this.isStarted) {
    this.simulator.render();
  }
};

SimViewer.prototype.redisplay = function () {
  requestAnimationFrame(this.redisplay.bind(this));
  if (this.__perfStats) { this.__perfStats.begin(); }
  if (this.simulator) {
    this.simulator.update();
    var navscene = this.simulator.state.navscene;
    if (navscene && this.mapModeIndex) {
      navscene.showMap(this.mapModeIndex);
    }
    if (navscene) {
      if (this.allParams.observations.map) {
        // NOTE: this is expensive and slows down the render loop
        this.updateTopDownMap(this.mapContainer);
      }
    }
  }
  this.updateAndRender();
  if (this.__perfStats) { this.__perfStats.end(); }
};

SimViewer.prototype.onWindowResize = function (options) {
  var width = this.container.clientWidth;
  var height = this.container.clientHeight;
  this.simulator.getAgent().resizeCameraSensors(width, height);
  Viewer3D.prototype.onWindowResize.call(this, options);

  var sensorsWidth = $(this.sensorsContainer).width();
  var goalsWidth = $(this.goalsContainer).width();
  var targetWidth = Math.max(goalsWidth, sensorsWidth);
  var r = targetWidth? targetWidth/width : 1;
  var rescaledShape = [Math.round(width*r), Math.round(height*r)];
  this.simulator.getAgent().resizeCameraSensors(width, height, rescaledShape[0], rescaledShape[1]);
  this.simEdit.onResize(options);
};

SimViewer.prototype.observe = function(cb) {
  var scope = this;
  this.lastActionResult = this.simulator.getObservations(function(err, res) {
    scope.visualizeSensorData(scope.sensorsContainer, res, true);
    if (cb) {
      cb(err, res);
    }
  });
};

SimViewer.prototype.__visualizeImageData = function(container, imageId, image, opts) {
  // TODO: Make this more efficient!!!
  var elem = container.find('#' + imageId);
  if (!elem.length) {
    elem = $('<img/>').attr('id', imageId);
    container.append(elem);
  }
  this.__tmpCanvas = this.__tmpCanvas || document.createElement('canvas');
  this.__tmpCanvas.width = image.shape[0];
  this.__tmpCanvas.height = image.shape[1];
  var ctx = this.__tmpCanvas.getContext('2d');
  var imageData = ctx.getImageData(0, 0, image.shape[0], image.shape[1]);
  imageData.data.set(image.data);
  if (opts && opts.flipY) {
    ImageUtil.flipPixelsY(imageData.data, image.shape[0], image.shape[1]);
  }
  ctx.putImageData(imageData, 0, 0);
  // elem.attr('width', sensor.shape[0]);
  // elem.attr('height', sensor.shape[1]);
  // elem.get(0).getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(sensor.data), sensor.shape[0], sensor.shape[1]), 0, 0);
  var targetWidth = container.width();
  var r = targetWidth? targetWidth/image.shape[0] : 1;
  var rescaledShape = [Math.round(image.shape[0]*r), Math.round(image.shape[1]*r)];
  //console.log('rescaledShape', rescaledShape);
  elem.attr('width', rescaledShape[0]);
  elem.attr('height',rescaledShape[1]);
  elem.attr('src', this.__tmpCanvas.toDataURL());
};

SimViewer.prototype.updateTopDownMap = function(container) {
  var encodedMap = this.simulator.getEncodedMap();
  var c = $(container);
  if (c && encodedMap) {
    var maps = Array.isArray(encodedMap)? encodedMap : [encodedMap];
    for (var i = 0; i < maps.length; i++) {
      var map = maps[i];
      //console.log('got map', map);
      this.__visualizeImageData(c, 'topDownMap_' + i, { data: map.data, shape: [map.width, map.height] });
    }
  }
};

SimViewer.prototype.visualizeSensorData = function(container, actionResult, debug, name) {
  if (debug) {
    console.log(actionResult);
  }
  if (container && actionResult) {
    var c = $(container);
    var id = c.attr('id');
    var sensors = actionResult.observation.sensors;
    var scope = this;
    _.each(sensors, function(sensor, sensor_name) {
      if (sensor.data && (sensor.type === 'normal' || sensor.type === 'semantic' || sensor.type === 'depth' || sensor.type === 'color')) {
        var sid = (name? id + '_' + name : id) + '_' + sensor_name;
        var sensor_data = sensor.data_viz || sensor.data;
        var pixelBuffer = sensor_data instanceof ArrayBuffer? new Uint8ClampedArray(sensor_data) : sensor_data;
        if (sensor.shape[2] === 1) {
          var rgbaPixelBuffer = new Uint8ClampedArray(sensor.shape[0]*sensor.shape[1]*4);
          var convertFn = function(x) { return x; };
          if (sensor.encoding === 'depth') {
            var r = 255/_.max(pixelBuffer);
            convertFn = function(x) { return r*x; }
          }
          for (var i = 0, k = 0; i < sensor_data.length; i++, k+=4) {
            var v = convertFn(pixelBuffer[i]);
            rgbaPixelBuffer[k] = v;
            rgbaPixelBuffer[k+1] = v;
            rgbaPixelBuffer[k+2] = v;
            rgbaPixelBuffer[k+3] = 255;
          }
          pixelBuffer = rgbaPixelBuffer;
        }
        scope.__visualizeImageData(c, sid, { data: pixelBuffer, shape: sensor.shape }, { flipY: true });
      }
    });
  }
};

SimViewer.prototype.setupConsole = function () {
  var textConsole = this.allParams.console? $(this.allParams.console) : null;
  var scope = this;
  if (textConsole) {
    var controller = textConsole.console({
      promptLabel: 'Simulator> ',
      commandValidate: function (line) {
        return line !== '';
      },
      commandHandle: function (line, report) {
        // Make sure we observe (since we no longer observe on every step)
        try {
          scope.observe(
            function(err, res) {
              try {
                scope.simDialog.process(scope.lastActionResult, line, report);
              } catch (e) {
                console.error(e.stack);
                report(e.toString());
              }
            });
        } catch(e) {
          console.error(e.stack);
          return e.toString();
        }
      },
      animateScroll: true,
      promptHistory: true,
      welcomeMessage: 'Enter interactive text commands'
    });
    //controller.promptText('toggle door');
    this.console = textConsole;
  }
};

SimViewer.prototype.getRenderScene = function () {
  if (this.simulator && this.isStarted) {
    return this.simulator.scene;
  }
};


// Exports
module.exports = SimViewer;
