#!/usr/bin/env node

var async = require('async');
var cmd = require('commander');
var shell = require('shelljs');
var STK = require('./stk-ssc');
var THREE = global.THREE;
var _ = STK.util;

cmd
  .version('0.0.1')
  .description('Renders images for scene given a set of camera viewpoints')
  .option('--id <id>', 'Scene or model id [default: 0004dd3cb11e50530676f77b55262d38]', '0004dd3cb11e50530676f77b55262d38')
  .option('--source <source>', 'Scene or model source [default: p5dScene]', 'p5dScene')
  .option('--level <level>', 'Scene level to render', STK.util.cmd.parseInt)
  .option('--path <path>', 'File path to scene or model')
  .option('--format <format>', 'File format to use')
  .option('--assetType <type>', 'Asset type (scene or model)')
  .option('--cameras <cameraFile>', 'Read .cam or .conf file with camera extrinsics and intrinsics')
  .option('-n, --limit <num>', 'Limit on number of cameras to render', STK.util.cmd.parseInt, -1)
  .option('--output_dir <dir>', 'Base directory for output files', '.')
  .option('--width <width>', 'Image width [default: 640]', STK.util.cmd.parseInt, 640)
  .option('--height <height>', 'Image height [default: 480]', STK.util.cmd.parseInt, 480)
  .option('--use_ambient_occlusion [flag]', 'Use ambient occlusion or not', STK.util.cmd.parseBoolean, true)
  .option('--compress_png', 'Compress PNG output using pngquant [false]')
  .option('--lights [flag]', 'Whether to use lights', STK.util.cmd.parseBoolean, false)
  .option('--compress_png [flag]', 'Compress PNG output using pngquant', STK.util.cmd.parseBoolean, false)
  .option('--color_by <color_by>', 'Recoloring scheme (' + STK.scene.SceneUtil.ColorByOptions.join(',') + ')')
  .option('--color <color>', 'Color when coloring by color', 'gray')
  .option('--encode_index [flag]', 'Encode color index directly', STK.util.cmd.parseBoolean, false)
  .option('--write_index [flag]', 'Output index to file', STK.util.cmd.parseBoolean, false)
  .option('--index <filename>', 'Input index to use for consistent encoding')
  .option('--object_index <filename>', 'Input index to use for object ids')
  .parse(process.argv);
var argv = cmd;
if (!cmd.cameras) {
  console.error('Please specify --cameras <cameraFile>');
  process.exit(-1);
}

// Parse arguments and initialize globals
var outdir = argv.output_dir;
var maxViews = argv.limit;
var width = argv.width;
var height = argv.height;
var useLights = argv.lights;
var useShadows = argv.lights;  // TODO: parameterize
var renderer = new STK.PNGRenderer({
  width: width,
  height: height,
  useAmbientOcclusion: cmd.encode_index? false : cmd.use_ambient_occlusion,
  useLights: cmd.encode_index? false : useLights,
  useShadows: cmd.encode_index? false : useShadows,
  compress: cmd.compress_png
});
var assetManager = new STK.assets.AssetManager({
  autoAlignModels: false,
  autoScaleModels: false,
  assetCacheSize: 50,
  enableLights: useLights,
  defaultLightState: useLights
});

STK.assets.AssetGroups.registerDefaults();
var assets = require('./data/assets.json');
var assetsMap = _.keyBy(assets, 'name');
STK.assets.registerCustomAssetGroupsSync(assetsMap, [argv.source]);

function readConfFile(lines) {
  var cameras = [];
  var intrinsics;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line.startsWith('intrinsics_matrix')) {
      // intrinsics_matrix <fx> 0 <cx>  0 <fy> <cy> 0 0 1
      var t = line.split(/\s+/).slice(1).map(function (s) { return parseFloat(s); });
      intrinsics = { width: argv.width, height: argv.height, fx: t[0], fy: t[4], cx: t[2], cy: t[5] };
    } else if (line.startsWith('scan')) {
      // scan <depth_image_filename> <color_image_filename> <camera-to-world-matrix>
      var parts = line.split(/\s+/);
      var extrinsics_array = parts.slice(3).map(function (s) { return parseFloat(s); });
      var extrinsics = STK.geo.Object3DUtil.arrayToMatrix4(extrinsics_array, true);
      var cam = new STK.gfx.Camera();
      cam.initFromExtrinsicsIntrinsics(extrinsics, intrinsics);
      cam.name = parts[2].split('.')[0];  // color_image_filename without extension
      cameras.push(cam);
    }
  }
  return cameras;
}

var id = argv.id;
var fullId = argv.source + '.' + id;
var level = argv.level;
var aspect = width / height;
var cameras = [];
if (argv.cameras) {
  var camlines = STK.util.readSync(argv.cameras).split('\n');
  if (camlines[0].startsWith('dataset')) {  // .conf file
    cameras = readConfFile(camlines);
  } else { // GAPS .cam file
    for (var i = 0; i < camlines.length; i++) {
      var camline = camlines[i];
      if (camline && camline.length) {
        var cam = new STK.gfx.Camera();
        cam.initFromGapsString(camline, aspect);
        cameras.push(cam);
      }
    }
  }
}
var scene = new THREE.Scene();

// Add p5d lights, or default hemisphere light
var light = STK.gfx.Lights.getDefaultHemisphereLight(useLights, useLights);
scene.add(light);

// Create default camera
var defaultCamera = new THREE.PerspectiveCamera(50, aspect, 10, 40000);
scene.add(defaultCamera);
var cameraControls = new STK.controls.CameraControls({
  camera: defaultCamera,
  controlType: 'none',
  container: renderer.canvas
});

// Load p5d scene
var info = { fullId: fullId, floor: level, format: argv.format, assetType: argv.assetType, includeCeiling: true };
if (argv.path) {
  // A file path is provided... hmmm
  info = { file: argv.path, format: argv.format, assetType: argv.assetType, defaultMaterialType: THREE.MeshPhongMaterial }
}
assetManager.loadAsset(info, function (err, asset) {
  var sceneState;
  if (asset instanceof STK.scene.SceneState) {
    sceneState = asset;
  } else if (asset instanceof STK.model.ModelInstance) {
    var modelInstance = asset;
    sceneState = new STK.scene.SceneState(null, modelInstance.model.info);
    sceneState.addObject(modelInstance);
  } else {
    console.error("Unsupported asset type " + fullId, asset);
    return;
  }
  sceneState.compactify();  // Make sure that there are no missing models
  scene.add(sceneState.fullScene);
  var sceneBBox = STK.geo.Object3DUtil.getBoundingBox(sceneState.fullScene);
  var bbdims = sceneBBox.dimensions();
  console.log('Loaded ' + sceneState.getFullID() +
    ' bbdims: [' + bbdims.x + ',' + bbdims.y + ',' + bbdims.z + ']');

  scene.updateMatrixWorld();
  // apply scene transform on cam
  for (var i = 0; i < cameras.length; i++) {
    cameras[i].applyTransform(sceneState.scene.matrixWorld);
  }

  var basename = outdir + '/' + id + ((level != undefined)? ('_' + level):'');
  var onDrained = function() {
    // render each camera's view
    var nCams = (maxViews> 0)? Math.min(cameras.length, maxViews) : cameras.length;
    suffix = cmd.encode_index? '.encoded.png' : '.png';
    suffix = cmd.color_by? ('.' + cmd.color_by + suffix) : suffix;
    shell.mkdir('-p', outdir);
    for (var i = 0; i < nCams; i++) {
      var cam = cameras[i];
      var filename;
      if (cam.name && cam.name.length > 0) {
        filename = outdir + '/' + cam.name + suffix;
      } else {
        filename = basename + '-' + i + suffix
      }
      renderer.renderToPng(scene, cam, filename);
    }

    // // add camera frustums to scene
    // for (var j = 0; j < cameras.length; j++) {
    //   var frustum = STK.geo.Object3DUtil.makeCameraFrustum(cameras[j]);
    //   scene.add(frustum);
    // }

    // // render default view with frustums
    // var views = cameraControls.generateViews(sceneBBox, width, height);
    // cameraControls.viewTarget(views[0]);
    // renderer.renderToPng(scene, defaultCamera, basename + '-' + i + suffix);
  };

  function waitImages() {
    STK.util.waitImagesLoaded(onDrained);
  }

  if (argv.color_by) {
    STK.scene.SceneUtil.colorScene(sceneState, argv.color_by, {
      color: argv.color,
      loadIndex: { index: cmd.index, objectIndex: cmd.object_index },
      encodeIndex: argv.encode_index,
      writeIndex: cmd.write_index? basename : null,
      fs: STK.fs,
      callback: function() { waitImages(); }
    });
  } else {
    waitImages();
  }
});

console.log('DONE');
