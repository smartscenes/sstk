#!/usr/bin/env node

var async = require('async');
var path = require('path');
var shell = require('shelljs');
var STK = require('./stk-ssc');
var cmd = require('./ssc-parseargs');
var THREE = global.THREE;
var _ = STK.util;

cmd
  .version('0.0.1')
  .description('Print some basic information about the asset (no scaling/alignment).')
  .option('--input <filename>', 'Input path')
  .option('--input_format <format>', 'Input file format to use')
  .option('--inputType <type>', 'Input type (id or path)',  /^(id|path)$/, 'id')
  .option('--assetType <type>', 'Asset type (scene or model)', 'model')
  .option('--output_dir <dir>', 'Base directory for output files', '.')
  .option('--use_search_controller [flag]', 'Whether to lookup asset information online', STK.util.cmd.parseBoolean, false)
  .parse(process.argv);

// Parse arguments and initialize globals
if (!cmd.input) {
  console.error('Please specify --input <filename>');
  process.exit(-1);
}
var files = cmd.getInputs(cmd.input);
var output_basename = cmd.output;

// Need to have search controller before registering assets
var useSearchController = cmd.use_search_controller;
var assetManager = new STK.assets.AssetManager({
  autoAlignModels: false, autoScaleModels: false, assetCacheSize: 100,
  useColladaScale: false, convertUpAxis: false,
  searchController: useSearchController? new STK.search.BasicSearchController() : null
});

var assetSources = cmd.getAssetSources(cmd.inputType, files, cmd.assetGroups);
if (assetSources) {
  STK.assets.registerAssetGroupsSync({ assetSources: assetSources });
}

var sceneDefaults = { includeCeiling: true, attachWallsToRooms: true };
if (cmd.scene) {
  sceneDefaults = _.merge(sceneDefaults, cmd.scene);
}
if (cmd.assetInfo) {
  sceneDefaults = _.defaults(sceneDefaults, cmd.assetInfo);
}

function printAssetInfo(asset) {
  if (asset instanceof STK.model.ModelInstance) {
    var bbox = STK.geo.Object3DUtil.getBoundingBox(asset.object3D);
    console.log(bbox.toString());
    var stats = STK.geo.Object3DUtil.getObjectStats(asset.object3D, true);
    console.log(stats);
  } else {
    throw 'Unsupported asset type';
  }
}

function processFiles() {
  async.forEachOfSeries(files, function (file, index, callback) {
    STK.util.clearCache();

    var outputDir = cmd.output_dir;
    var basename = output_basename;
    var scenename;
    if (basename) {
      // Specified output - append index
      if (files.length > 1) {
        basename = basename + '_' + index;
      }
      scenename = basename;
      basename = outputDir? outputDir + '/' + basename : basename;
    } else {
      if (cmd.inputType === 'id') {
        var idparts = file.split('.');
        var id = idparts[idparts.length-1];
        basename = id;
        scenename = basename;
        basename = (outputDir ? outputDir : '.') + '/' + basename;
      } else if (cmd.inputType === 'path') {
        basename = path.basename(file, path.extname(file)) || 'mesh';
        scenename = basename;
        basename = (outputDir ? outputDir : path.dirname(file)) + '/' + basename;
      }
    }

    if (cmd.skip_existing && shell.test('-d', basename)) {
      console.warn('Skipping existing scene at ' + basename);
      setTimeout(function () { callback(); }, 0);
    } else {
      shell.mkdir('-p', basename);
      var info;
      var timings = new STK.Timings();
      var metadata = {};
      if (cmd.inputType === 'id') {
        info = { fullId: file, format: cmd.input_format, assetType: cmd.assetType, defaultMaterialType: THREE.MeshPhongMaterial };
        metadata.id = id;
      } else if (cmd.inputType === 'path') {
        info = { file: file, format: cmd.input_format, assetType: cmd.assetType, defaultMaterialType: THREE.MeshPhongMaterial };
        metadata.path = file;
      }
      if (cmd.assetInfo) {
        info = _.defaults(info, cmd.assetInfo);
      }

      timings.start('load');
      assetManager.loadAsset(info, function (err, asset) {
        timings.stop('load');
        STK.util.waitImagesLoaded(function() {
          printAssetInfo(asset);
          callback();
        });
      });
    }
  }, function (err, results) {
    if (err) {
      console.error('Error ' + err);
    }
    console.log('DONE');
  });
}

processFiles();