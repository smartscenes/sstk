#!/usr/bin/env node

var async = require('async');
var path = require('path');
var fs = require('fs');
var shell = require('shelljs');
var STK = require('./stk-ssc');
var cmd = require('./ssc-parseargs');
var THREE = global.THREE;
var _ = STK.util;

cmd
  .version('0.0.1')
  .description('Renders asset file')
  .option('--input <filename>', 'Input path')
  .option('--format <format>', 'File format to use')
  .option('--assetType <type>', 'Asset type (scene or model)', 'model')
  .option('--output_dir <dir>', 'Base directory for output files', '.')
  .option('--use_ambient_occlusion [flag]', 'Use ambient occlusion or not', STK.util.cmd.parseBoolean, true)
  .optionGroups(['config_file', 'render_views', 'color_by'])
  .option('--view_index <view_index>', 'Which view to render [0-7]', STK.util.cmd.parseInt)
  .option('--use_scene_camera <camera_name>', 'Use camera from scene')
  .option('--skip_existing', 'Skip rendering existing images [false]')
  .option('--width <width>', 'Image width [default: 1000]', STK.util.cmd.parseInt, 1000)
  .option('--height <height>', 'Image height [default: 1000]', STK.util.cmd.parseInt, 1000)
  .option('--material_type <material_type>')
  .option('--use_search_controller [flag]', 'Whether to lookup asset information online', STK.util.cmd.parseBoolean, false)
  .parse(process.argv);

// Parse arguments and initialize globals
if (!cmd.input) {
  console.error('Please specify --input <filename>');
  process.exit(-1);
}
var files = [cmd.input];
if (cmd.input.endsWith('.txt')) {
  // Read files form input file
  var data = STK.util.readSync(cmd.input);
  files = data.split('\n').map(function(x) { return STK.util.trim(x); }).filter(function(x) { return x.length > 0; });
}

if (cmd.assetInfo && cmd.assetInfo.source) {
  var source = cmd.assetInfo.source;
  if (!cmd.assetGroups) { cmd.assetGroups = [source]; }
  if (cmd.assetGroups.indexOf(source) < 0) { cmd.assetGroups.push(source); }
}

if (cmd.assetGroups) {
  STK.assets.AssetGroups.registerDefaults();
  var assets = require('./data/assets.json');
  var assetsMap = _.keyBy(assets, 'name');
  STK.assets.registerCustomAssetGroupsSync(assetsMap, cmd.assetGroups);  // Make sure we get register necessary asset groups
}

//STK.Constants.setVirtualUnit(1);  // set to meters
if (cmd.material_type) {
  STK.materials.Materials.DefaultMaterialType = STK.materials.Materials.getMaterialType(cmd.material_type)
}

var output_basename = cmd.output;
// Parse arguments and initialize globals
var renderer = new STK.PNGRenderer({
  width: cmd.width, height: cmd.height,
  useAmbientOcclusion: cmd.encode_index? false : cmd.use_ambient_occlusion,
  compress: cmd.compress_png, skip_existing: cmd.skip_existing, reuseBuffers: true,
  flipxy: cmd.flipxy,
});
var useSearchController = cmd.use_search_controller
var assetManager = new STK.assets.AssetManager({
  autoAlignModels: false, autoScaleModels: false, assetCacheSize: 100,
  searchController: useSearchController? new STK.search.BasicSearchController() : null
});

var cameraConfig = _.defaults(Object.create(null), cmd.camera || {}, {
  type: 'perspective',
  fov: 50,
  near: 0.1*STK.Constants.metersToVirtualUnit,
  far: 400*STK.Constants.metersToVirtualUnit
});

function processFiles() {
  async.forEachOfSeries(files, function (file, index, callback) {
    STK.util.clearCache();

    // skip if output png already exists
    var outputDir = cmd.output_dir;
    var basename = output_basename;
    if (basename) {
      // Specified output - append index
      if (files.length > 0) {
        basename = basename + '_' + index;
      }
      basename = outputDir? outputDir + '/' + basename : basename;
    } else {
      basename = path.basename(file, path.extname(file)) || 'screenshot';
      basename = (outputDir? outputDir : path.dirname(file)) + '/' + basename;
    }
    var pngfilename = basename + '.png';

    if (cmd.skip_existing && STK.fs.existsSync(pngfilename)) {

      console.warn('Skipping render of existing file at ' + pngfilename);
      callback();

    } else {

      shell.mkdir('-p', path.dirname(pngfilename));

      console.log('Processing ' + file + '(' + index + '/' + files.length + ')');
      var info = { file: file, format: cmd.format, assetType: cmd.assetType, defaultMaterialType: THREE.MeshPhongMaterial };
      if (cmd.assetInfo) {
        info = _.defaults(info, cmd.assetInfo);
      }
      //console.log('info', info)

      assetManager.loadAsset(info, function (err, asset) {
        var sceneState;
        if (asset instanceof STK.scene.SceneState) {
          sceneState = asset;
        } else if (asset instanceof STK.model.ModelInstance) {
          var modelInstance = asset;
          sceneState = new STK.scene.SceneState(null, modelInstance.model.info);
          console.time('toGeometry');
          // Ensure is normal geometry (for some reason, BufferGeometry not working with ssc)
          STK.geo.Object3DUtil.traverseMeshes(modelInstance.object3D, false, function(m) {
            m.geometry = STK.geo.GeometryUtil.toGeometry(m.geometry);
          });
          console.timeEnd('toGeometry');
          sceneState.addObject(modelInstance);
        } else if (err) {
          console.error("Error loading asset", info, err);
          return;
        } else {
          console.error("Unsupported asset type ", info, asset);
          return;
        }

        // Create THREE scene
        var scene = new THREE.Scene();
        var light = STK.gfx.Lights.getDefaultHemisphereLight(false);
        var camera;
        //console.log('use_scene_camera', cmd.use_scene_camera);
        var use_scene_camera = false;
        if (cmd.use_scene_camera) {
          // Try to get camera from scene!
          if (sceneState.cameras) {
            var sceneCameraConfig = sceneState.cameras[cmd.use_scene_camera]
            if (sceneCameraConfig) {
              //console.log(sceneCameraConfig);
              sceneCameraConfig = sceneState.convertCameraConfig(sceneCameraConfig);
              _.defaults(sceneCameraConfig, cameraConfig);
              //console.log(sceneCameraConfig);
              camera = STK.gfx.Camera.fromJson(sceneCameraConfig, cmd.width, cmd.height);
              use_scene_camera = true;
            } else {
              console.warn('no camera ' + cmd.use_scene_camera + ' found for scene!');
            }
          } else {
            console.warn('use_scene_camera is set but there is no camera specified for scene!');
          }
        }
        if (!camera) {
          camera = STK.gfx.Camera.fromJson(cameraConfig, cmd.width, cmd.height);
        }
        scene.add(light);
        scene.add(camera);
        var cameraControls = new STK.controls.CameraControls({
          camera: camera,
          container: renderer.canvas,
          controlType: 'none',
          cameraPositionStrategy: 'positionByCentroid'
        });


        sceneState.compactify();  // Make sure that there are no missing models
        scene.add(sceneState.fullScene);
        if (!cmd.assetInfo) {
          STK.geo.Object3DUtil.centerAndRescaleObject3DToWorld(sceneState.fullScene, 200);
        }
        var sceneBBox = STK.geo.Object3DUtil.getBoundingBox(sceneState.fullScene);
        var bbdims = sceneBBox.dimensions();
        console.log('Loaded ' + sceneState.getFullID() +
          ' bbdims: [' + bbdims.x + ',' + bbdims.y + ',' + bbdims.z + ']');
        console.log('bbox', sceneBBox);

        var outbasename = cmd.color_by? (basename + '.' + cmd.color_by) : basename;
        if (cmd.encode_index) {
          outbasename = outbasename + '.encoded';
        }
        var wrappedCallback = function() {
          STK.geo.Object3DUtil.dispose(scene);
          callback();
        };

        var renderOpts = {
          cameraControls: cameraControls,
          targetBBox: sceneBBox,
          basename: outbasename,
          angleStep: cmd.turntable_step,
          framerate: cmd.framerate,
          tilt: cmd.tilt,
          skipVideo: cmd.skip_video,
          callback: wrappedCallback
        };

        function onDrained() {
          if (cmd.render_all_views) {
            renderer.renderAllViews(scene, renderOpts);
          } else if (cmd.render_turntable) {
            // farther near for scenes to avoid z-fighting
            //camera.near = 400;
            renderer.renderTurntable(scene, renderOpts);
          } else {  // top down view is default
            if (use_scene_camera) {
              console.log('use scene camera');
            } else if (cmd.view_index != undefined) {
              var views = cameraControls.generateViews(sceneBBox, cmd.width, cmd.height);
              cameraControls.viewTarget(views[cmd.view_index]);  // default
            } else if (cmd.view) {
              var viewOpts = cmd.view;
              if (cmd.view.coordinate_frame === 'scene') {
                viewOpts = sceneState.convertCameraConfig(cmd.view);
              }
              viewOpts = _.defaults({targetBBox: sceneBBox}, viewOpts);
              cameraControls.viewTarget(viewOpts);
            } else {
              cameraControls.viewTarget({
                targetBBox: sceneBBox,
                theta: Math.PI/6,
                phi: -Math.PI/4,
                distanceScale: 2.0
              });
            }

            renderer.renderToPng(scene, camera, outbasename);
            setTimeout( function() { wrappedCallback(); }, 0);
          }
        }

        function waitImages() {
          STK.util.waitImagesLoaded(onDrained);
        }

        if (cmd.color_by) {
          STK.scene.SceneUtil.colorScene(sceneState, cmd.color_by, {
            color: cmd.color,
            loadIndex: { index: cmd.index, objectIndex: cmd.object_index },
            encodeIndex: cmd.encode_index,
            writeIndex: cmd.write_index? basename : null,
            restrictToIndex: cmd.restrict_to_color_index,
            fs: STK.fs,
            callback: function() { waitImages(); }
          });
        } else {
          waitImages();
        }
      });
    }
  }, function (err, results) {
    console.log('DONE');
  });
}

processFiles();