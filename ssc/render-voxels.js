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
  .description('Renders voxels (size of voxel determined by alpha channel, use --size 0.8 to render fixed size voxels)')
  .option('--input <filename>', 'Input voxels')
  .option('--output <filename>', 'Output filename base')
  .option('--output_dir <dir>', 'Base directory for output files')
  .option('--use_ambient_occlusion [flag]', 'Use ambient occlusion or not', STK.util.cmd.parseBoolean, false)
  .option('--mesher <mesher>', 'Mesher to use for visualization' , /^(greedy|stupid|monotone|culled)$/i, 'stupid')
  .option('--size <size>', 'Size to use for voxels when using stupid mesher (default: alpha)', STK.util.cmd.parseFloat)
  .optionGroups(['config_file', 'render_views'])
  .option('--view_index <view_index>', 'Which view to render [0-7]', STK.util.cmd.parseInt)
  .option('--voxel_threshold <threshold>', 'Threshold (from 0 to 1) on alpha channel for showing voxel [0]', STK.util.cmd.parseFloat, 0)
  .option('--width <width>', 'Image width [default: 1000]', STK.util.cmd.parseInt, 1000)
  .option('--height <height>', 'Image height [default: 1000]', STK.util.cmd.parseInt, 1000)
  .option('--heapdump <num>', 'Number of times to dump the heap (for memory debugging)', STK.util.cmd.parseInt, 0)
  .parse(process.argv);

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

var output_basename = cmd.output;
// Parse arguments and initialize globals
var renderer = new STK.PNGRenderer({
  width: cmd.width, height: cmd.height, useAmbientOcclusion: cmd.use_ambient_occlusion,
  compress: cmd.compress_png, skip_existing: cmd.skip_existing, reuseBuffers: true
});

var cameraConfig = _.defaults(Object.create(null), cmd.camera || {}, {
  type: 'perspective',
  fov: 50,
  near: 0.1*STK.Constants.metersToVirtualUnit,
  far: 10*STK.Constants.metersToVirtualUnit
});

function processFiles() {
  var memcheckOpts = { heapdump: { limit: cmd.heapdump } };
  async.forEachOfSeries(files, function (file, index, callback) {
    STK.util.clearCache();
    STK.util.checkMemory('Processing ' + file + ' index=' + index, memcheckOpts);

    // skip if output png already exists
    var outputDir = cmd.output_dir;
    var basename = output_basename;
    if (basename) {
      // Specified output - append index
      if (files.length > 1) {
        basename = basename + '_' + index;
      }
      basename = outputDir? outputDir + '/' + basename : basename;
    } else {
      basename = path.basename(file, path.extname(file)) || 'voxels';
      basename = (outputDir? outputDir : path.dirname(file)) + '/' + basename;
    }
    var pngfilename = basename + '.png';

    if (cmd.skip_existing && STK.fs.existsSync(pngfilename)) {

      console.warn('Skipping render of existing file at ' + pngfilename);
      callback();

    } else {

      shell.mkdir('-p', path.dirname(pngfilename));

      console.log('Processing ' + file + '(' + index + '/' + files.length + ')');
      // Create THREE scene
      var scene = new THREE.Scene();
      var light = STK.gfx.Lights.getDefaultHemisphereLight(false);
      var camera = STK.gfx.Camera.fromJson(cameraConfig, cmd.width, cmd.height);
      scene.add(light);
      scene.add(camera);
      var cameraControls = new STK.controls.CameraControls({
        camera: camera,
        container: renderer.canvas,
        controlType: 'none',
        cameraPositionStrategy: 'positionByCentroid'
      });

      var voxels = new STK.geo.Voxels({
        path: file,
        mesher: cmd.mesher,
        size: cmd.size,
        sizeBy: cmd.size? null : 'alpha'
      });
      voxels.init();
      voxels.loadVoxels(function() {
          console.log('Setting voxel threshold to ' + cmd.voxel_threshold);
          voxels.updateGridField('minThreshold', cmd.voxel_threshold);
          var voxelNode = voxels.getVoxelNode();
          STK.geo.Object3DUtil.centerAndRescaleObject3DToWorld(voxelNode, 200);
          scene.add(voxelNode);
          var sceneBBox = STK.geo.Object3DUtil.getBoundingBox(voxelNode);
          //console.log(sceneBBox);

          var wrappedCallback = function() {
            voxels.reset();
            STK.geo.Object3DUtil.dispose(scene);
            callback();
          };

          var renderOpts = {
            cameraControls: cameraControls,
            targetBBox: sceneBBox,
            basename: basename,
            angleStep: cmd.turntable_step,
            framerate: cmd.framerate,
            tilt: cmd.tilt,
            skipVideo: cmd.skip_video,
            callback: wrappedCallback,
            distanceScale: 2.0
          };

          function render() {
            if (cmd.render_all_views) {
              renderer.renderAllViews(scene, renderOpts);
            } else if (cmd.render_turntable) {
              renderer.renderTurntable(scene, renderOpts);
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
            } else {  // top down view is default
              cameraControls.viewTarget({
                targetBBox: sceneBBox,
                theta: Math.PI/6,
                phi: -Math.PI/4,
                distanceScale: 2.0
              });
              renderer.renderToPng(scene, camera, pngfilename);
              setTimeout( function() { wrappedCallback(); }, 0);
            }
          }

          STK.util.waitImagesLoaded(function() {
            render();
          });
        },
        function (error) {
          console.error('Error', error);
          callback(error, null);
        });

    }

  }, function (err, results) {
    console.log('DONE');
  });
}

processFiles();
