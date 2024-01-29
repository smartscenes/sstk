#!/usr/bin/env node

/* jshint esversion: 6 */
var async = require('async');
var path = require('path');
var shell = require('shelljs');
var STK = require('./stk-ssc');
var THREE = global.THREE;
var _ = STK.util;
var cmd = require('./ssc-parseargs');
cmd
  .version('0.0.1')
  .description('Create colored voxels for a model from file')
  .option('--input <filename>', 'Input path')
  .option('--input_type <type>', 'Input type (id or path)',  /^(id|path)$/, 'path')
  .option('--input_format [format]', 'Model format')
  .option('--resolution [number]', 'Voxel grid resolution [default: 32 (32x32x32)]', STK.util.cmd.parseInt, 32)
  .option('--samples [number]', 'Number of samples [default: 100000]', STK.util.cmd.parseInt, 100000)
  .option('--downsample [multiplier]', 'Downsample voxel grid resolution down from original voxel resolution [default: 1]. Example: use 4 to takes 128^3 to 32^3', STK.util.cmd.parseInt, 1)
  .option('--voxels [voxels-file]', 'File of voxels to downsample from')
  .option('--output_dir [dir]', 'Base directory for output files', '.')
  .option('--output <filename>', 'Output path')
  .optionGroups(['config_file', 'color_by'])
  .option('--skip_existing', 'Whether to skip output of existing files', STK.util.cmd.parseBoolean, false)
  .option('--use_search_controller [flag]', 'Whether to lookup asset information online', STK.util.cmd.parseBoolean, false)
  .parse(process.argv);

var argv = cmd;

if (!cmd.input) {
  console.error('Please specify --input <filename>');
  process.exit(-1);
}

var inputs = cmd.getInputs(cmd.input);
if (cmd.assetInfo && cmd.assetInfo.source) {
  var source = cmd.assetInfo.source;
  if (!cmd.assetGroups) { cmd.assetGroups = [source]; }
  if (cmd.assetGroups.indexOf(source) < 0) { cmd.assetGroups.push(source); }
}

if (cmd.assetGroups) {
  STK.assets.registerAssetGroupsSync({
    assetSources: cmd.assetGroups,
    assetFiles: null,
    skipDefault: false,
    includeAllAssetFilesSources: true
  });
}

var output_basename = cmd.output;
var useSearchController = cmd.use_search_controller;
var assetManager = new STK.assets.AssetManager({
  autoAlignModels: true, autoScaleModels: true, assetCacheSize: 100,
  searchController: useSearchController? new STK.search.BasicSearchController() : null
});

var nrrdexp = new STK.exporters.NRRDExporter({ fs: STK.fs });
var voxelsField = argv.voxels;
var voxelOpts = {numSamples: argv.samples, dim: argv.resolution, downsampleBy: argv.downsample,
                 samplesPerVoxel: 0,
                 limitToVisible: true, useTwoPass: true, center: true, useMaterialScores: true };
var assetType = 'model';

function processInputs(inputs, assetsDb) {
  async.forEachOfSeries(inputs, function (input, index, callback) {
    STK.util.clearCache();

    var outputDir = cmd.output_dir;
    var basename = output_basename;
    if (basename) {
      // Specified output - append index
      if (inputs.length > 1) {
        basename = basename + '_' + index;
      }
      basename = outputDir ? outputDir + '/' + basename : basename;
    } else if (cmd.input_type === 'id') {
      var idparts = input.split('.');
      var id = idparts[idparts.length-1];
      basename = id;
      basename = (outputDir ? outputDir : '.') + '/' + basename;
    } else if (cmd.input_type === 'path') {
      basename = path.basename(input, path.extname(input)) || 'mesh';
      basename = (outputDir ? outputDir : path.dirname(input)) + '/' + basename;
    }

    outputDir = path.dirname(basename);
    var name = path.basename(basename);
    //console.log('output dir ' + outputDir);
    shell.mkdir('-p', outputDir);

    var info;
    var metadata = {};
    if (cmd.input_type === 'id') {
      info = { fullId: input, format: cmd.input_format, assetType: assetType, defaultMaterialType: THREE.MeshPhongMaterial };
      metadata.id = id;
    } else if (cmd.input_type === 'path') {
      info = { file: input, format: cmd.input_format, assetType: assetType, defaultMaterialType: THREE.MeshPhongMaterial };
      metadata.path = input;
    }
    if (cmd.assetInfo) {
      info = _.defaults(info, cmd.assetInfo);
    }

    console.log('try load model ' + input);
    assetManager.loadModel(info, function (err, mInst) {
      if (err) {
        console.error("Error loading model", info, err);
        callback(err);
      } else {
        console.log('Loaded ' + input);
        //console.log('info', mInst.model.info, mInst.model.getUp(), mInst.model.getFront());
        function onDrained() {
          console.log('Creating colored voxels');
          mInst.voxels = new STK.model.ModelInstanceVoxels({voxelsField: voxelsField});
          mInst.voxels.init(mInst);
          STK.geo.Object3DUtil.ensureVertexNormals(mInst.object3D);  // ensure vertex normals (used in voxel color sampling)
          mInst.voxels.createColorVoxels(voxelOpts, function (colorVoxels) {
            var voxelGrid = colorVoxels.getVoxelGrid();
            var nVoxels = voxelGrid.countSetVoxels();
            console.log('Number of voxels: ' + nVoxels + ' for ' + id);
            if (nVoxels > 0) {
              nrrdexp.export(voxelGrid, {
                dir: outputDir,
                name: name,
                content: mInst.model.info.fullId + '_rgba.vox',
                callback: callback
              });
            } else {
              console.log('Skipping export of voxels for ' + mInst.model.info.fullId);
              callback();
            }
          });
        }
        STK.util.waitImagesLoaded(onDrained);
      }
    }, function (error) {
      console.error('Error loading ' + input, error);
    }, metadata);
  }, function (err, results) {
    console.log('DONE');
  });
}

processInputs(inputs);