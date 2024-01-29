#!/usr/bin/env node

/* jshint esversion: 6 */
var async = require('async');
var shell = require('shelljs');
var path = require("path");
var STK = require('../stk-ssc');
var THREE = global.THREE;
var cmd = require('../ssc-parseargs');
var process_asset_helper = require('../ssc-process-assets');
var render_helper = require('../ssc-render-helper');

cmd
  .version('0.0.1')
  .description('Create surface voxels for a scene')
  .option('--input <filename>', 'Input id or path')
  .option('--input_type <type>', 'Input type (id or path)',  /^(id|path)$/, 'id')
  .option('--source <source>', 'Scene source (wssScene, 3dfScene, fpScene) [default: 3dfScene]', '3dfScene')
  .option('--format <format>', 'Scene format')
  .option('--output_dir <dir>', 'Base directory for output files', '.')
  .option('--use_subdir [flag]','Put output into subdirectory per id [false]', STK.util.cmd.parseBoolean, false)
  .optionGroups(['config_file', 'voxels', 'color_by'])
//  .option('--model-voxels <voxel-type>', 'Type of model voxels to use [default: none]', 'none')
  .option('--level <level>', 'Scene level to render', STK.util.cmd.parseInt)
  .option('--room <room>', 'Room id to render [null]')
  .option('--show_ceiling [flag]', 'Whether to show ceiling or not', STK.util.cmd.parseBoolean, false)
  .option('--hide_nonparent_arch [flag]', 'Whether to hide arch nodes that are not support parents', STK.util.cmd.parseBoolean, false)
  .option('--hide_empty_regions [flag]', 'Whether to hide empty regions', STK.util.cmd.parseBoolean, false)
//  .option('--assetInfo <json>', 'Asset info (up,front)', STK.util.cmd.parseJson)
  .option('--assetGroups <groups>', 'Asset groups (scene or model) to load', STK.util.cmd.parseList)

  .option('--skip_existing', 'Whether to skip output of existing files', STK.util.cmd.parseBoolean, false)
  .option('--use_search_controller [flag]', 'Whether to lookup asset information online', STK.util.cmd.parseBoolean, false)
  .option('--assets <filename>', 'Additional assets files')
  .parse(process.argv);

STK.Constants.setVirtualUnit(1);  // set to meters

var argv = cmd;

var useSearchController = argv.use_search_controller;
var assetManager = new STK.assets.AssetManager({
  autoAlignModels: true, autoScaleModels: true, assetCacheSize: 100,
  searchController: useSearchController? new STK.search.BasicSearchController() : null
});

if (!cmd.input) {
  console.error('Please specify --input <filename>');
  process.exit(-1);
}
var inputs = cmd.getInputs(cmd.input);


var assetFiles = (cmd.assets != null)? [cmd.assets] : [];
var assetSources = cmd.getAssetSources(cmd.input_type, inputs, cmd.assetGroups);
STK.assets.registerAssetGroupsSync({
  assetSources: assetSources,
  assetFiles: assetFiles,
  skipDefault: false,
  includeAllAssetFilesSources: true
});
if (argv.format) {
  STK.assets.AssetGroups.setDefaultFormat(argv.format);
}

var nrrdexp = new STK.exporters.NRRDExporter({ fs: STK.fs });
var voxelsField = argv.voxels;
var voxelOpts = {
  useFixedVoxelSize: argv.use_fixed_voxel_size, voxelSize: argv.voxel_size,
  numSamples: argv.samples, dim: argv.resolution, downsampleBy: argv.downsample,
  samplesPerVoxel: 0, aggregateMode: argv.voxel_aggregate_mode,
  limitToVisible: false, useTwoPass: false, center: true, useMaterialScores: false };

function processInputs(assetsDb) {
  async.forEachSeries(inputs, function (input, callback) {
    var inputInfo = process_asset_helper.prepareAssetInfo(cmd.input_type, input,
      {  assetType: 'scene', source: argv.source,
              inputFormat: argv.format,
              level: argv.level, room: argv.room,
              outputDir: argv.output_dir, assetsDb: assetsDb });
    var basename = inputInfo.outputname;
    var output_dir = cmd.use_subdir? basename : path.dirname(basename);
    shell.mkdir('-p', output_dir);
    var assetname = inputInfo.assetname;
    var metadata = inputInfo.metadata;
    var assetLoadInfo = inputInfo.loadInfo;
    console.log('try load scene ' + assetname);
    assetManager.loadAssetAsScene(assetLoadInfo, function (err, sceneState) {
      if (err) {
        console.error('Error loading ' + assetname, err);
        callback(err, null);
        return;
      }

      console.log('Loaded ' + assetname);
      var sceneBBox = STK.geo.Object3DUtil.getBoundingBox(sceneState.fullScene);
      var bbdims = sceneBBox.dimensions();

      console.log('Loaded ' + assetname +
        ' bbdims: [' + bbdims.x + ',' + bbdims.y + ',' + bbdims.z + ']');
      //console.log('info', sceneState.info);
      sceneState.compactify();  // Make sure that there are no missing models
      render_helper.setVisible(sceneState, cmd); // Hide some parts based on command arguments

      sceneBBox = STK.geo.Object3DUtil.getBoundingBox(sceneState.fullScene, true);
      bbdims = sceneBBox.dimensions();
      console.log('Visible ' + assetname +
        ' bbdims: [' + bbdims.x + ',' + bbdims.y + ',' + bbdims.z + ']');

      function onDrained() {
        console.log('Creating colored voxels');
        sceneState.voxels = new STK.scene.SceneRawVoxels({voxelsField: voxelsField});
        sceneState.voxels.init(sceneState);
        sceneState.voxels.createColorVoxels(voxelOpts, function (colorVoxels) {
          var voxelGrid = colorVoxels.getVoxelGrid();
          var nVoxels = voxelGrid.countSetVoxels();
          console.log('Number of voxels: ' + nVoxels + ' for ' + assetname);
          if (nVoxels > 0) {
            nrrdexp.export(voxelGrid, {
              dir: output_dir,
              name: assetname,
              content: sceneState.info.fullId + '_rgba.vox',
              callback: callback
            });
          } else {
            console.log('Skipping export of voxels for ' + sceneState.info.fullId);
            callback();
          }
        });
      }

      function waitImages() {
        STK.util.waitImagesLoaded(onDrained);
      }

      // color the scene
      render_helper.colorScene(sceneState.scene, sceneState, cmd, basename, waitImages);
    }, function (error) {
      console.error('Error loading ' + assetname, error);
    }, metadata);
  }, function (err, results) {
    console.log('DONE');
  });
}

processInputs();