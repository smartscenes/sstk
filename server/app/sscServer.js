var _ = require('lodash');
var STK = null;
var THREE = null;
var log = require('../lib/logger')('SSCServer');

var DEFAULT_WIDTH = 1024;
var DEFAULT_HEIGHT = 768;

function __init() {
  // Make sure we pull in STK (do this on demand)
  if (!STK) {
    log.info('Initializing STK-SSC');
    STK = require('../../ssc/stk-ssc');
    //STK.Constants.baseUrl = 'http://localhost:8010/';
  }
  if (!THREE) {
    THREE = global.THREE;
  }
}

function SSCServer() {
  this.__renderer = null;
  this.width = DEFAULT_WIDTH;
  this.height = DEFAULT_HEIGHT;
}

SSCServer.prototype.getRenderer = function(opts) {
  opts = opts || {};
  _.defaults(opts, { width: this.width, height: this.height });
  // TODO: Have separate renderers for each width/height (cached)
  if (!this.__renderer) {
    this.__renderer = new STK.PNGRenderer({
      width: this.width,
      height: this.height,
//      debugFilename: 'debugRender'
    });
  }
  if (opts.width !== this.width || opts.height !== this.height) {
    this.width = opts.width;
    this.height = opts.height;
    this.__renderer.setSize(this.width, this.height);
  }
  return this.__renderer;
};

SSCServer.prototype.getSimpleRenderer = function(opts) {
  opts = opts || {};
  _.defaults(opts, { width: this.width, height: this.height });
  if (!this.__simpleRenderer) {
    // Simple renderer without ambient occlusion or shadows
    this.__simpleRenderer = new STK.PNGRenderer({
      //debugFilename: 'debugOffscreenRender',
      isOffscreen: true,
      useAmbientOcclusion: false,
      useLights: false,
      width: opts.width,
      height: opts.height,
      reuseBuffers: false
    });
  }
  return this.__simpleRenderer;
};

SSCServer.prototype.getAssetManager = function() {
  if (!this.__assetManager) {
    this.__assetManager = new STK.assets.AssetManager({
      autoAlignModels: false, autoScaleModels: false, assetCacheSize: 100 });
    STK.assets.AssetGroups.registerDefaults();
    var dataDir = './static/data/';
    var p5dAssets = STK.assets.registerCustomAssetGroupSync(
      dataDir + 'suncg/suncg.planner5d.models.json',
      dataDir + 'suncg/suncg.planner5d.models.full.csv');

  }
  return this.__assetManager;
};

SSCServer.prototype.__loadAndRender = function(opts, callback) {
  if (!opts.fullId) {
    callback({ code: 400, status: "Please specify fullId of asset to render"}, null);
    return;
  }

  var assetManager = this.getAssetManager();

  var width = opts.width || DEFAULT_WIDTH;
  var height = opts.height || DEFAULT_HEIGHT;
  var renderer = this.getRenderer({ width: width, height: height });

  // Parse camera parameters
  var camParams = _.defaults(Object.create(null), opts.camera, {
    type: 'perspective',
    fov: 50,
    near: 10,
    far: 40000
  });
  var camera;
  var viewIndex;
  if (camParams.gaps) {
    camera = new STK.gfx.Camera();
    camera.initFromGapsString(camParams.gaps, width / height);
    camParams.isSceneSpace = true;
  } else {
    //camera = new THREE.PerspectiveCamera(camParams.fov, width / height, camParams.near, camParams.far);
    camera = STK.gfx.Camera.fromJson(camParams, width, height);
    viewIndex = opts.viewIndex? parseInt(opts.viewIndex) : 0;
  }

  // Set up scene
  var fullId = opts.fullId;
  var floor = opts.floor;
  var room = opts.room;

  var cameraControls = new STK.controls.CameraControls({
    camera: camera,
    container: renderer.canvas,
    controlType: 'none',
    cameraPositionStrategy: 'positionByCentroid'
  });
  //cameraControls.controls = null;

  var scope = this;
  assetManager.loadAsset({ fullId: fullId, floor: floor, room: room, includeCeiling: true }, function (err, asset) {
    if (asset) {
      var sceneState;
      if (asset instanceof STK.scene.SceneState) {
        sceneState = asset;
        //console.log(sceneState);
        sceneState.compactify();  // Make sure that there are no missing models
        sceneState.setVisible(
          opts.showCeiling,
          function (node) {
            return node.userData.type === 'Ceiling';
          }
        );
      } else if (asset instanceof STK.model.ModelInstance) {
        sceneState = new STK.scene.SceneState();
        var modelInstance = asset;
        modelInstance.alignAndScale(sceneState.getUp(), sceneState.getFront(), sceneState.getVirtualUnit());
        modelInstance.ensureNormalizedModelCoordinateFrame();
        modelInstance.object3D.metadata = {
          modelInstance: modelInstance
        };
        var center = new THREE.Vector3(0, 0, 0);
        STK.geo.Object3DUtil.placeObject3D(modelInstance.object3D, center, new THREE.Vector3(0.5, 0.5, 0));
        sceneState.addObject(modelInstance);
        sceneState.info = modelInstance.model.info;
      } else {
        callback({ code: 500, status: "Unsupported asset type " + fullId }, null);
        return;
      }

      if (opts.colorBy) {
        STK.scene.SceneUtil.colorScene(sceneState, opts.colorBy);
      }
      var sceneBBox = STK.geo.Object3DUtil.getBoundingBox(sceneState.fullScene);
      var bbdims = sceneBBox.dimensions();
      log.info('Loaded ' + sceneState.getFullID() +
        ' bbdims: [' + bbdims.x + ',' + bbdims.y + ',' + bbdims.z + ']');

      var light = STK.gfx.Lights.getDefaultHemisphereLight(false);
      var scene = sceneState.fullScene;
      scene.add(light);
      scene.add(camera);
      scene.updateMatrixWorld();
      // apply scene transform on cam
      if (camParams.isSceneSpace) {
        log.info('Transform camera to world space');
        camera.applyTransform(sceneState.scene.matrixWorld);
      }

      function onDrained() {
        try {
          var targetObjects = null;
          if (opts.targetIds) {
            var targetIds = Array.isArray(opts.targetIds) ? opts.targetIds : opts.targetIds.split(',');
            log.info('Target ids: ' + JSON.stringify(targetIds));
            targetObjects = sceneState.findNodes(function (x) {
              return targetIds.indexOf(x.userData.id) >= 0;
            });
            if (targetObjects.length === 0) {
              log.warn('Target objects not found');
            }
          }
          if (targetObjects && targetObjects.length > 0) {
            log.info('Target objects: ' + targetObjects.length);
            var viewOptimizer = new STK.gfx.ViewOptimizer({
              cameraControls: cameraControls,
              //scorer: 'simple',
              renderer: scope.getSimpleRenderer({ width: width, height: height }),
              maxWidth: 300, maxHeight: 300,
              width: renderer.width,
              height: renderer.height
            });
            var opt = viewOptimizer.lookAt(sceneState, targetObjects);
            cameraControls.viewTarget(opt);
          } else if (camParams.view) {
            var viewOpts = camParams.view;
            if (camParams.view.coordinate_frame === 'scene') {
              viewOpts = sceneState.convertCameraConfig(camParams.view);
            }
            viewOpts = _.defaults({targetBBox: sceneBBox}, viewOpts);
            cameraControls.viewTarget(viewOpts);
          } else if (viewIndex != undefined) {
            var views = cameraControls.generateViews(sceneBBox, width, height);
            viewIndex = THREE.Math.clamp(viewIndex, 0, views.length - 1);
            cameraControls.viewTarget(views[viewIndex]);  // default
          } else {
            log.info('Using existing camera');
          }
          // cameraControls.viewTarget({ targetBBox: sceneBBox, viewIndex: 4, distanceScale: 1.1 });
          var buffer = renderer.renderToBuffer(scene, camera);
          STK.geo.Object3DUtil.dispose(scene);
          callback(null, buffer);
        } catch (err) {
          STK.geo.Object3DUtil.dispose(scene);
          callback({ code: 500, status: "Error rendering " + fullId, error: err});
        }
      }
      STK.util.waitImagesLoaded(onDrained);
    } else {
      callback({ code: 400, status: "Error loading " + fullId + (err? ': ' + err : '')}, null);
    }
  });
};

SSCServer.prototype.render = function(req, res) {
  __init();
  var queryParams = _.defaults({}, req.body, req.query);
  var booleans = ['showCeiling'];
  // Need to convert booleans
  booleans.forEach(function(b) {
    queryParams[b] = STK.util.parseBoolean(queryParams[b]);
  });
  this.__loadAndRender(queryParams, function (err, buffer) {
    if (buffer) {
      res.contentType('image/png');
      res.send(buffer);
    } else if (err) {
      log.error('Error rendering ' + JSON.stringify(queryParams));
      log.error(JSON.stringify(err));
      console.error(err);
      res.json(_.omit(err, 'error'));
    } else {
      res.json({ code: 500, status: "Unknown error"});
    }
  });
};

module.exports = SSCServer;
