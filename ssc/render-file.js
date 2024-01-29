#!/usr/bin/env node

var async = require('async');
var path = require('path');
var shell = require('shelljs');
var fs = require('fs');
var STK = require('./stk-ssc');
var cmd = require('./ssc-parseargs');
var render_helper = require('./ssc-render-helper');
var THREE = global.THREE;
var _ = STK.util;

cmd
  .version('0.0.1')
  .description('Renders asset file')
  .option('--input <filename>', 'Input path')
  .option('--format <format>', 'File format to use')
  .option('--assetType <type>', 'Asset type (scene or model)', 'model')
  .option('--assetInfo <json>', 'Asset info (up,front)', STK.util.cmd.parseJson)
  .option('--assetGroups <groups>', 'Asset groups (scene or model) to load', STK.util.cmd.parseList)
  .option('--output_dir <dir>', 'Base directory for output files', '.')
  .option('--output <filename>', 'Output path')
  .option('--video_format <format>', 'Format for output videos', 'mp4')
  .option('--auto_align [flag]', 'Whether to auto align asset', STK.util.cmd.parseBoolean, false)
  .optionGroups(['config_file', 'render_options', 'view', 'render_views', 'color_by', 'transform3d', 'norm_geo'])
  .option('--skip_existing', 'Skip rendering existing images [false]', STK.util.cmd.parseBoolean, false)
  .option('--material_type <material_type>')
  .option('--material_side <material_side>')
  .option('--show_ceiling [flag]', 'Whether to show ceiling or not', STK.util.cmd.parseBoolean, false)
  .option('--hide_nonparent_arch [flag]', 'Whether to hide arch nodes that are not support parents', STK.util.cmd.parseBoolean, false)
  .option('--hide_empty_regions [flag]', 'Whether to hide empty regions', STK.util.cmd.parseBoolean, false)
  .option('--use_search_controller [flag]', 'Whether to lookup asset information online', STK.util.cmd.parseBoolean, false)
  .parse(process.argv);

STK.Constants.setVirtualUnit(1);  // set to meters

// Parse arguments and initialize globals
var msg = cmd.checkImageSize(cmd);
if (msg) {
  console.error(msg);
  process.exit(-1);
}

if (!cmd.input) {
  console.error('Please specify --input <filename>');
  process.exit(-1);
}
var files = cmd.getInputs(cmd.input);

// Need to have search controller before registering assets
var useSearchController = cmd.use_search_controller;
var assetManager = new STK.assets.AssetManager({
  autoAlignModels: cmd.auto_align, autoScaleModels: false, assetCacheSize: 100,
  searchController: useSearchController? new STK.search.BasicSearchController() : null
});

var assetSources = cmd.getAssetSources('path', files, cmd.assetGroups);
if (assetSources) {
  STK.assets.registerAssetGroupsSync({ assetSources: assetSources });
}

//STK.Constants.setVirtualUnit(1);  // set to meters
cmd.material_type = cmd.material_type || 'phong';
if (cmd.material_type) {
  STK.materials.Materials.setDefaultMaterialType(cmd.material_type, cmd.material_type);
}
if (cmd.material_side) {
  STK.materials.Materials.DefaultMaterialSide = STK.materials.Materials.getMaterialSide(cmd.material_side, STK.materials.Materials.DefaultMaterialSide);
}

var output_basename = cmd.output;
var rendererOptions = cmd.getRendererOptions(cmd);
var renderer = new STK.PNGRenderer(rendererOptions);

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
    var videoFormat = cmd.video_format;
    var basename = output_basename;
    if (basename) {
      // Specified output - append index
      if (files.length > 1) {
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
      var dirname = path.dirname(pngfilename);
      if (!fs.existsSync(dirname)) {
        shell.mkdir('-p', dirname);
      }

      console.log('Processing ' + file + '(' + index + '/' + files.length + ')');
      var info = { file: file, format: cmd.format, assetType: cmd.assetType, defaultMaterialType: STK.materials.Materials.DefaultMaterialType };
      if (cmd.assetInfo) {
        info = cmd.combine(info, cmd.assetInfo, ['format', 'assetType']);
      }
      // console.log('info', info);
      var loadFunction = (info.assetType === 'model')? 'loadAsset' : 'loadAssetAsScene';
      assetManager[loadFunction](info, function (err, asset) {
        var sceneState;
        var defaultViewOpts = {};
        if (asset instanceof STK.scene.SceneState) {
          sceneState = asset;
          if (cmd.view == undefined && cmd.view_index == undefined) {
            defaultViewOpts = { view_index: 0 };
          }
        } else if (asset instanceof STK.model.ModelInstance) {
          var modelInstance = asset;
          sceneState = new STK.scene.SceneState(null, modelInstance.model.info);
          STK.geo.Object3DUtil.normalizeGeometry(modelInstance.object3D, {
            assetName: file,
            toGeometry: cmd.to_geometry,
            toNonindexed: cmd.to_nonindexed
          });
          sceneState.addObject(modelInstance, cmd.auto_align);
        } else if (err) {
          console.error("Error loading asset", info, err);
          return;
        } else {
          console.error("Unsupported asset type ", info, asset);
          return;
        }

        // Create THREE scene
        var scene = new THREE.Scene();
        var camera;
        //console.log('use_scene_camera', cmd.use_scene_camera);
        var use_current_view = false;
        // TODO: check this logic
        if (cmd.use_scene_camera) {
          // Try to get camera from scene!
          camera = render_helper.getSceneCamera(sceneState, cmd.use_scene_camera, cameraConfig, cmd.width, cmd.height);
          if (camera) {
            use_current_view = true;
          }
        }
        if (!camera) {
          camera = STK.gfx.Camera.fromJson(cameraConfig, cmd.width, cmd.height);
        }
        render_helper.addLights(scene, camera, cmd);
        scene.add(camera);
        var cameraControls = new STK.controls.CameraControls({
          camera: camera,
          container: renderer.canvas,
          controlType: 'none',
          cameraPositionStrategy: 'positionByCentroid'
        });

        sceneState.compactify();  // Make sure that there are no missing models
        render_helper.setShadows(sceneState, cmd.use_shadows);
        render_helper.setVisible(sceneState, cmd);

        scene.add(sceneState.fullScene);
        //if (!cmd.assetInfo) {
        //  STK.geo.Object3DUtil.centerAndRescaleObject3DToWorld(sceneState.fullScene, 200);
        //}
        var sceneBBox = STK.geo.Object3DUtil.getBoundingBox(sceneState.fullScene);
        var bbdims = sceneBBox.dimensions();
        console.log('Loaded ' + sceneState.getFullID() +
          ' bbdims: [' + bbdims.x + ',' + bbdims.y + ',' + bbdims.z + ']');
        console.log('bbox', sceneBBox);
        var bboxes = [];
        var transformInfo = STK.geo.Object3DUtil.applyTransforms(sceneState.fullScene, {
          assetName: sceneState.getFullID() ,
          hasTransforms: cmd.auto_align || cmd.auto_scale,
          normalizeSize: cmd.normalize_size,
          normalizeSizeTo: cmd.normalize_size_to,
          center: cmd.center,
          bboxes: bboxes,
          debug: true
        });

        var outbasename = cmd.color_by? (basename + '.' + cmd.color_by) : basename;
        if (cmd.encode_index) {
          outbasename = outbasename + '.encoded';
        }
        var wrappedCallback = function() {
          STK.geo.Object3DUtil.dispose(scene);
          callback();
        };

        var cmdOpts = _.defaults(_.pick(cmd, render_helper.render.cmdFields), defaultViewOpts);
        render_helper.convertViews(sceneState, cmdOpts);
        render_helper.updateViewOptsForTargetObjects(sceneState, cmdOpts, cameraControls, renderer);
        cmdOpts.use_current_view = use_current_view;

        var renderOpts = {
          cameraControls: cameraControls,
          targetBBox: cmdOpts.targetBBox || sceneBBox,
          basename: outbasename,
          videoFormat: videoFormat,
          angleStep: cmd.turntable_step,
          framerate: cmd.framerate,
          tilt: cmd.tilt,
          skipVideo: cmd.skip_video,
          callback: wrappedCallback
        };

        if (cmdOpts.save_view_log) {
          renderer.viewlogFilename = outbasename + '.views.jsonl';
          shell.rm(renderer.viewlogFilename);
        } else {
          renderer.viewlogFilename = null;
        }

        function onDrained() {
          render_helper.render(scene, renderer, renderOpts, cmdOpts, cmd.checkImageSize);
        }

        function waitImages() {
          render_helper.getEnvMap(renderer, cmd.envmap).then(( { envMap } ) => {
            scene.environment = envMap;
            STK.util.waitImagesLoaded(onDrained);
          });
        }

        render_helper.colorScene(scene, sceneState, cmd, basename, waitImages);
      });
    }
  }, function (err, results) {
    console.log('DONE');
  });
}

processFiles();
