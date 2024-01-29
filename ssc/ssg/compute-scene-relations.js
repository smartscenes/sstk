#!/usr/bin/env node

// Compute various scene statistics and relations
// such as portals, outlier objects, etc
var async = require('async');
var shell = require('shelljs');
var STK = require('../stk-ssc');

var RELATIONS_VERSION_STRING = 'scene-relations@1.0.2';

var cmd = require('../ssc-parseargs');
cmd
  .version('0.0.1')
  .option('--id <id>', 'Scene id [default: 108736851_177263586]', '108736851_177263586')
  .option('--ids_file <file>', 'File with scene ids')
  .option('--source <source>', 'Scene source (fpScene) [default: fpScene]', 'fpScene')
  .option('--format <format>', 'Asset format')
  .option('--output_dir <dir>', 'Base directory for output files', '.')
  .option('--skip_existing [flag]', 'Whether to skip output of existing files', STK.util.parseBoolean, false)
  .parse(process.argv);

var argv = cmd;
var _ = STK.util;
var SceneUtil = STK.scene.SceneUtil;

// Parse arguments and initialize globals
var source = argv.source;
var assetManager = new STK.assets.AssetManager({
  autoAlignModels: false, autoScaleModels: false, assetCacheSize: 100 });
var assetFiles = (cmd.assets != null)? [cmd.assets] : [];
STK.assets.registerAssetGroupsSync({ assetSources: [cmd.source], assetFiles: assetFiles });
if (cmd.format) {
  STK.assets.AssetGroups.setDefaultFormat(cmd.format);
}

var ids = [argv.id];
if (cmd.ids_file) {
  var data = STK.fs.readSync(cmd.ids_file, 'utf8');
  ids = data.split('\n');
  ids = STK.util.filter(ids, function(x) { return x.length > 0; });
  ids = STK.util.shuffle(ids);
}

function detectOutliers(sceneState) {
  var result = SceneUtil.detectOutlierObjects(sceneState);
  console.log('Outliers for scene ' + sceneState.getFullID() + ': ' + result.outliers.length);
  var outliers;
  if (result.outliers.length > 0) {
    outliers = [];
    for (var i = 0; i < result.outliers.length; i++) {
      var node = result.outliers[i];
      var bbox = STK.geo.Object3DUtil.getBoundingBox(node);
      outliers.push( { id: node.userData.id, bbox: bbox.toJSON() });
      console.log('Outlier for scene ' + sceneState.getFullID() + ': ' + node.userData.id + ' bbox: ' + bbox.toString());
    }
  }
  return outliers;
}

function processScene(outfile, sceneState, callback) {
  SceneUtil.identifyRelations(sceneState, { assetManager: assetManager}, function(err, relations) {
    var statistics = SceneUtil.computeStatistics(sceneState, { relations: relations, unit: 1 });
    var out = {
      version: RELATIONS_VERSION_STRING,
      id: sceneState.info.id,
      statistics: statistics,
      relations: relations
    };
    var outliers = detectOutliers(sceneState);
    if (outliers && outliers.length) {
      out.outliers = outliers;
    }
    STK.fs.fsWriteToFile(outfile, JSON.stringify(out), callback);
  });
}

async.forEachSeries(ids, function (id, callback) {
  var fullId = source + '.' + id;
  // Planner5d scenes
  STK.util.clearCache();
  var basename = argv.output_dir + '/' + id;
  if (argv.skip_existing && shell.test('-d', basename)) {
    console.warn('Skipping existing scene at ' + basename);
    setTimeout(function () { callback(); }, 0);
  } else {
    shell.mkdir('-p', basename);
    assetManager.loadScene({ fullId: fullId, includeCeiling: true, attachWallsToRooms: true, defaultFormat: cmd.format },
      function (err, sceneState) {
        //console.log(sceneState);
        sceneState.compactify();  // Make sure that there are no missing models
        var sceneBBox = STK.geo.Object3DUtil.getBoundingBox(sceneState.fullScene);
        var bbdims = sceneBBox.dimensions();
        console.log('Loaded ' + sceneState.getFullID() +
          ' bbdims: [' + bbdims.x + ',' + bbdims.y + ',' + bbdims.z + ']');

        STK.util.waitImagesLoaded(function() {
          var outfile = basename + '/' + id + '.relations.json';
          processScene(outfile, sceneState,
           function(err, res) {
             STK.geo.Object3DUtil.dispose(sceneState.fullScene);
             callback(err);
           });
        });
    });
  }
}, function (err, results) {
  if (err) {
    console.error('Error ' + err);
  }
  console.log('DONE');
});
