#!/usr/bin/env node

var async = require('async');
var shell = require('shelljs');
var STK = require('./stk-ssc');
var THREE = global.THREE;
var cmd = require('commander');
cmd
  .version('0.0.1')
  .option('--id <id>', 'Model id [default: 100]', '100')
  .parse(process.argv);
var argv = cmd;

var assetManager = new STK.assets.AssetManager({
  autoAlignModels: false, autoScaleModels: false, assetCacheSize: 100 });
STK.assets.AssetGroups.registerDefaults();
var assets = require('./data/assets.json');
var assetsMap = _.keyBy(assets, 'name');
STK.assets.registerCustomAssetGroupsSync(assetsMap, 'p5d');

var p5dAssetGroup = STK.assets.AssetGroups.getAssetGroup('p5d');
var assetInfos = assetGroup.assetDb.assetInfos;

async.forEachSeries(assetInfos, function (assetInfo, callback) {
  assetManager.loadScene({ fullId: fullId, attachWallsToRooms: true, keepInvalid: true, keepParse: true, includeCeiling: true },
    function (err, sceneState) {
      //console.log(sceneState);
      sceneState.compactify();  // Make sure that there are no missing models
      var sceneBBox = STK.geo.Object3DUtil.getBoundingBox(sceneState.fullScene);
      var bbdims = sceneBBox.dimensions();
      console.log('Loaded ' + sceneState.getFullID() +
        ' bbdims: [' + bbdims.x + ',' + bbdims.y + ',' + bbdims.z + ']');

      var exportOpts = {
        dir: basename,
        name: 'house',
        unit: 1,
        omitBBox: argv.omit_bbox,
        saveStats: argv.save_stats,
        callback: callback,
        useOrigMaterials: false // Debugging for exporting original materials to check what those looked like
      };
      STK.util.waitImagesLoaded(function() {
        suncgExporter.export(sceneState, exportOpts);
      });
    });
  }
}, function (err, results) {
  if (err) {
    console.error('Error ' + err);
  }
  console.log('DONE');
});
