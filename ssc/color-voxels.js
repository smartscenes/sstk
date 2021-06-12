#!/usr/bin/env node

/* jshint esversion: 6 */
var async = require('async');
var shell = require('shelljs');
var STK = require('./stk-ssc');
var THREE = global.THREE;
var cmd = require('./ssc-parseargs');
cmd
  .version('0.0.1')
  .description('Create colored voxels for a model')
  .option('--id [id]', 'Model id [default: 26d98eed64a7f76318a93a45bf780820]', '26d98eed64a7f76318a93a45bf780820')
  .option('--source [source]', 'Model source (3dw, wss) [default: 3dw]', '3dw')
  .option('--format [format]', 'Model format')
  .option('--resolution [number]', 'Voxel grid resolution [default: 32 (32x32x32)]', STK.util.cmd.parseInt, 32)
  .option('--samples [number]', 'Number of samples [default: 100000]', STK.util.cmd.parseInt, 100000)
  .option('--downsample [multiplier]', 'Downsample voxel grid resolution down from original voxel resolution [default: 1]. Example: use 4 to takes 128^3 to 32^3', STK.util.cmd.parseInt, 1)
  .option('--voxels [voxel-type]', 'Type of voxels to use [default: none]', 'none')
  .option('--output_dir [dir]', 'Base directory for output files', '.')
  .optionGroups(['config_file', 'color_by'])
  .option('--skip_existing', 'Whether to skip output of existing files', STK.util.cmd.parseBoolean, false)
  .option('--assets <filename>', 'Additional assets files')
  .parse(process.argv);

var argv = cmd;

var useSearchController = STK.Constants.baseUrl.startsWith('http://') || STK.Constants.baseUrl.startsWith('https://');
var assetManager = new STK.assets.AssetManager({
  autoAlignModels: true, autoScaleModels: true, assetCacheSize: 100,
  searchController: useSearchController? new STK.search.BasicSearchController() : null
});
var ids = argv.id ? [argv.id] : ['26d98eed64a7f76318a93a45bf780820'];

var assetFiles = (cmd.assets != null)? [cmd.assets] : [];
STK.assets.registerAssetGroupsSync({
  assetSources: [cmd.source],
  assetFiles: assetFiles,
  skipDefault: false,
  includeAllAssetFilesSources: true
});
if (argv.format) {
  STK.assets.AssetGroups.setDefaultFormat(argv.format);
}

var nrrdexp = new STK.exporters.NRRDExporter({ fs: STK.fs });
var voxelsField = argv.voxels;
var voxelOpts = {numSamples: argv.samples, dim: argv.resolution, downsampleBy: argv.downsample,
                 samplesPerVoxel: 0,
                 limitToVisible: true, useTwoPass: true, center: true, useMaterialScores: true };

function processIds(assetsDb) {
  async.forEachSeries(ids, function (id, callback) {
    var basename = argv.output_dir + '/' + id;
    shell.mkdir('-p', basename);
    var fullId = argv.source + '.' + id;
    var metadata = assetsDb? assetsDb.getAssetInfo(fullId) : null;
    console.log('try load model ' + fullId);
    assetManager.getModelInstance(null, fullId, function (mInst) {
      console.log('Loaded ' + fullId);
      //console.log('info', mInst.model.info, mInst.model.getUp(), mInst.model.getFront());
      function onDrained() {
        console.log('Creating colored voxels');
        mInst.voxels = new STK.model.ModelInstanceVoxels({voxelsField: voxelsField});
        mInst.voxels.init(mInst);
        mInst.voxels.createColorVoxels(voxelOpts, function (colorVoxels) {
          var voxelGrid = colorVoxels.getVoxelGrid();
          var nVoxels = voxelGrid.countSetVoxels();
          console.log('Number of voxels: ' + nVoxels + ' for ' + id);
          if (nVoxels > 0) {
            nrrdexp.export(voxelGrid, {
              dir: basename,
              name: id,
              content: mInst.model.info.fullId + '_rgba.vox',
              callback: callback
            });
          } else {
            console.log('Skipping export of voxels for ' + mInst.model.info.fullId);
            callback();
          }
        });
      }
      function waitImages() {
        STK.util.waitImagesLoaded(onDrained);
      }
      if (cmd.color_by) {
        STK.scene.SceneUtil.colorScene(sceneState, cmd.color_by, {
          color: cmd.color,
          loadIndex: { index: cmd.index, objectIndex: cmd.object_index },
          encodeIndex: cmd.encode_index,
          writeIndex: cmd.write_index? basename + '/' + id : null,
          restrictToIndex: cmd.restrict_to_color_index,
          fs: STK.fs,
          callback: function() { waitImages(); }
        });
      } else {
        waitImages();
      }
    }, function (error) {
      console.error('Error loading ' + fullId, error);
    }, metadata);
  }, function (err, results) {
    console.log('DONE');
  });
}

processIds();