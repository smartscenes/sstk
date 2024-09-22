#!/usr/bin/env node

var async = require('async');
var path = require('path');
var shell = require('shelljs');
var STK = require('./stk-ssc');
var cmd = require('./ssc-parseargs');
var processAssetsHelper = require('./ssc-process-assets');
const fs = require("fs");
var THREE = global.THREE;
var _ = STK.util;

cmd
  .version('0.0.1')
  .description('Write .info.json file for asset (for getting realigned/resized bbdims).')
  .option('--input <filename>', 'Input path')
  .option('--input_format <format>', 'Input file format to use')
  .option('--inputType <type>', 'Input type (id or path)',  /^(id|path)$/, 'id')
  .option('--assetType <type>', 'Asset type (scene or model)', 'model')
  .option('--assetGroups <groups>', 'Asset groups (scene or model) to load', STK.util.cmd.parseList)
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
var output_basename = cmd.output;
// Need to have search controller before registering assets
var useSearchController = cmd.use_search_controller;
var assetManager = new STK.assets.AssetManager({
  autoAlignModels: true, autoScaleModels: false, assetCacheSize: 100,
  searchController: useSearchController? new STK.search.BasicSearchController() : null
});
var assetSources = cmd.getAssetSources(cmd.inputType, files, cmd.assetGroups);
if (assetSources) {
  STK.assets.registerAssetGroupsSync({ assetSources: assetSources });
}

function processAsset(asset, opts, cb) {
  var meshlist = STK.geo.Object3DUtil.getMeshList(asset.object3D, true);
  var infos = [];
  for (var i = 0; i < meshlist.length; i++) {
    var mesh = meshlist[i];
    var info = { index: i, meshIndex: mesh.userData.meshIndex, primitiveIndex: mesh.userData.primitiveIndex };
    var nodePath = STK.geo.Object3DUtil.getAncestors(mesh, true,
      (node) => { return node.userData.nodeIndex; });
    info.nodePath = _.reverse(nodePath);
    infos[i] = info;
  }
  var outfilename = opts.basename + '.meshIndex.json';
  var output = {
    id: asset.model.getFullID(),
    meshMapping: infos
  };
  fs.writeFileSync(outfilename, JSON.stringify(output));

  cb(null, null);
}

processAssetsHelper.processAssets(cmd, files, assetManager, processAsset);