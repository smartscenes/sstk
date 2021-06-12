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
  .description('Write .info.json file for asset (for getting realigned/resized bbdims).')
  .option('--input <filename>', 'Input path')
  .option('--input_format <format>', 'Input file format to use')
  .option('--input_type <type>', 'Input type (id or path)',  /^(id|path)$/, 'id')
  .option('--assetType <type>', 'Asset type (scene or model)', 'model')
  .option('--auto_scale [flag]', 'Whether to auto scale asset', STK.util.cmd.parseBoolean, false)
  .option('--auto_align [flag]', 'Whether to auto align asset', STK.util.cmd.parseBoolean, false)
  .option('--skip_existing [flag]', 'Whether to skip existing', STK.util.cmd.parseBoolean, false)
  .option('--use_search_controller [flag]', 'Whether to lookup asset information online', STK.util.cmd.parseBoolean, false)
  .option('--output_dir <dir>', 'Base directory for output files', '.')
  .parse(process.argv);

STK.Constants.setVirtualUnit(1);  // set to meters

// Parse arguments and initialize globals
if (!cmd.input) {
  console.error('Please specify --input <filename>');
  process.exit(-1);
}
var files = cmd.getInputs(cmd.input);

var assetSources = cmd.getAssetSources(cmd.input_type, files, cmd.assetGroups);
if (assetSources) {
  STK.assets.registerAssetGroupsSync({ assetSources: assetSources });
}

var output_basename = cmd.output;
var useSearchController = cmd.use_search_controller;
var assetManager = new STK.assets.AssetManager({
  autoAlignModels: cmd.auto_align, autoScaleModels: cmd.auto_scale, assetCacheSize: 100,
  useColladaScale: false, convertUpAxis: false,
  searchController: useSearchController? new STK.search.BasicSearchController() : null
});

var sceneDefaults = { includeCeiling: true, attachWallsToRooms: true };
if (cmd.scene) {
  sceneDefaults = _.merge(sceneDefaults, cmd.scene);
}
if (cmd.assetInfo) {
  sceneDefaults = _.defaults(sceneDefaults, cmd.assetInfo);
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
      if (cmd.input_type === 'id') {
        var idparts = file.split('.');
        var id = idparts[idparts.length-1];
        basename = id;
        scenename = basename;
        basename = (outputDir ? outputDir : '.') + '/' + basename;
      } else if (cmd.input_type === 'path') {
        basename = path.basename(file, path.extname(file)) || 'mesh';
        scenename = basename;
        basename = (outputDir ? outputDir : path.dirname(file)) + '/' + basename;
      }
    }

    var outputFilename = basename + ".info.json"
    if (cmd.skip_existing && shell.test('-e', outputFilename)) {
      console.warn('Skipping existing info at ' + outputFilename);
      setTimeout(function () { callback(); }, 0);
    } else {
      var info;
      var timings = new STK.Timings();
      timings.start('exportMesh');
      var metadata = {};
      if (cmd.input_type === 'id') {
        info = { fullId: file, format: cmd.input_format, assetType: cmd.assetType, defaultMaterialType: THREE.MeshPhongMaterial };
        metadata.id = id;
      } else if (cmd.input_type === 'path') {
        info = { file: file, format: cmd.input_format, assetType: cmd.assetType, defaultMaterialType: THREE.MeshPhongMaterial };
        metadata.path = file;
      }
      if (cmd.assetInfo) {
        info = _.defaults(info, cmd.assetInfo);
      }

      timings.start('load');
      assetManager.loadAsset(info, function (err, asset) {
        timings.stop('load');
        var sceneState;
        if (asset instanceof STK.scene.SceneState) {
          sceneState = asset;
        } else if (asset instanceof STK.model.ModelInstance) {
          var modelInstance = asset;
          var sceneInfo = _.defaults(
            { defaultUp: STK.Constants.worldUp, defaultFront: STK.Constants.worldFront, unit: 1 },
            _.pick(modelInstance.model.info, ['id', 'source', 'fullId'])
          );
          sceneState = new STK.scene.SceneState(null, sceneInfo);
          sceneState.addObject(modelInstance, cmd.auto_align || cmd.auto_scale);
        } else if (err) {
          console.error("Error loading asset", info, err);
          return;
        } else {
          console.error("Unsupported asset type ", info, asset);
          return;
        }

        sceneState.compactify();  // Make sure that there are no missing models
        sceneState.scene.name = scenename;
        var sceneBBox = STK.geo.Object3DUtil.getBoundingBox(sceneState.fullScene);
        var bbdims = sceneBBox.dimensions();
        console.log('Loaded ' + file +
          ' bbdims: [' + bbdims.x + ',' + bbdims.y + ',' + bbdims.z + ']');
        var bboxes = [];
        //console.log(sceneBBox.toString());
        bboxes.push(sceneBBox.toJSON('aligned'));
        STK.geo.Object3DUtil.traverse(sceneState.fullScene, function(n) {
          return true;
        });
        var unit;
        if (asset instanceof STK.model.ModelInstance) {
          var modelInstance = asset;
          var modelInstanceBBox = STK.geo.Object3DUtil.computeBoundingBoxLocal(modelInstance.getObject3D('Model'));
          bboxes.push(modelInstanceBBox.toJSON('raw'));
          //console.log(modelInstanceBBox.toString());
          unit = modelInstance.model.getUnit();
        }
        var metadata = {
          bboxes: bboxes,
          stats: STK.geo.Object3DUtil.getObjectStats(sceneState.scene, true),
          unit: unit
        };
        STK.util.waitImagesLoaded(function () {
          STK.fs.writeToFile(outputFilename, JSON.stringify(metadata));
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