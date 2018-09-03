#!/usr/bin/env node

/* jshint esversion: 6 */
var async = require('async');
var shell = require('shelljs');
var STK = require('./stk-ssc');
var path = require('path');
var cmd = require('commander');
cmd
  .version('0.0.1')
  .description('Sample points from a mesh')
  .option('--input <filename>', 'Input path')
  .option('--input_type <type>', 'Input type (id or path)',  /^(id|path)$/, 'id')
  .option('--id <id>', 'Model id [default: 26d98eed64a7f76318a93a45bf780820]', STK.util.cmd.parseList)
  .option('--source <source>', 'Model source (p5d, 3dw, wss) [default: 3dw]', '3dw')
  .option('--format <format>', 'Model format')
  .option('--samples <number>', 'Number of samples [default: 100000]', STK.util.cmd.parseInt, 100000)
  .option('--resolution <number>', 'Resolution for view rendering [default: 256]', STK.util.cmd.parseInt, 256)
  .option('--limit_to_visible [flag]', 'Limit to visible', STK.util.cmd.parseBoolean, false)
  .option('--ignore_redundant [flag]', 'Limit to non-redundant materials', STK.util.cmd.parseBoolean, false)
  .option('--output_dir <dir>', 'Base directory for output files', '.')
  .option('--skip_existing', 'Whether to skip output of existing files', STK.util.cmd.parseBoolean, false)
  .option('--ply_format <format>', 'Ply format to use (binary_little_endian or ascii)')
  .parse(process.argv);

var argv = cmd;

var useSearchController = STK.Constants.baseUrl.startsWith('http://') || STK.Constants.baseUrl.startsWith('https://');
var assetManager = new STK.assets.AssetManager({
  autoAlignModels: false, autoScaleModels: false, assetCacheSize: 100,
  searchController: useSearchController? new STK.search.BasicSearchController() : null
});

if (cmd.limit_to_visible && cmd.ignore_redundant) {
  console.error('Please specify --limit_to_visible or --ignore_redundant but not both');
  process.exit(-1);
}
if (cmd.input && cmd.id) {
  console.error('Please specify --input or --id but not both');
  process.exit(-1);
}
if (cmd.id && cmd.input_type !== 'id') {
  console.error('Please specify --input_type id when using --id');
  process.exit(-1);
}

var inputs = [];
if (cmd.input) {
  var files = [cmd.input];
  if (cmd.input.endsWith('.txt')) {
    // Read files form input file
    var data = STK.util.readSync(cmd.input);
    files = data.split('\n').map(function(x) { return STK.util.trim(x); }).filter(function(x) { return x.length > 0; });
    inputs = files;
  } else {
    inputs = cmd.input.split(',')
  }
} else {
  var ids = argv.id ? argv.id : ['26d98eed64a7f76318a93a45bf780820'];
  inputs = ids;
}

STK.assets.AssetGroups.registerDefaults();
var assets = require('./data/assets.json');
var assetsMap = _.keyBy(assets, 'name');
STK.assets.registerCustomAssetGroupsSync(assetsMap, [argv.source]);
if (argv.format) {
  STK.assets.AssetGroups.setDefaultFormat(argv.format);
}

var VertexAttrs = STK.exporters.PLYExporter.VertexAttributes;
var exporter = new STK.exporters.PLYExporter({ fs: STK.fs, format: argv.ply_format,
  vertexAttributes: [ VertexAttrs.normal, VertexAttrs.rgbColor, VertexAttrs.opacity ] });

function samplePoints(modelObject3D, numSamples, opts) {
  opts = opts || {};
  var rng = opts.rng;
  console.log('Sampling ' + numSamples + ' for coloring');
  var samples = STK.geo.MeshSampling.sampleObject(modelObject3D, numSamples, {
      weightFn: {
//      name: opts.limitToVisible? 'visibleWithArea' : 'area',
          name: opts.weightFn ||
            (opts.ignoreRedundant? "areaWithoutInnerRedundantMaterials" : null ) ||
            (opts.limitToVisible? (opts.skipInnerMaterial? 'areaWithVisibleMaterial' : 'visibility') : 'area'),
          args: { scene: modelObject3D, visibleTriangles: opts.visibleTriangles,
              ignoreMaterialWithMinScore: opts.skipInnerMaterial, minMaterialScoreRange: opts.minMaterialScoreRange,
              nsamples: 0 }
      },
      scoreFn: {
          name: opts.scoreFn || (opts.limitToVisible? 'smoothedVisibility' : 'area'),
          args: { scene: modelObject3D, visibleTriangles: opts.visibleTriangles }
      }
  });
  var flatSamples = _.flatten(samples);
  //console.log('samples', flatSamples, modelObject3D);
  if (opts.jitter) {
      _.forEach(flatSamples, function (s) {
          s.worldPoint.x += (rng.random() - 0.5) * 5e-2;
          s.worldPoint.y += (rng.random() - 0.5) * 5e-2;
          s.worldPoint.z += (rng.random() - 0.5) * 5e-2;
      });
  }
  //console.log('before',flatSamples.length);
  flatSamples = _.filter(flatSamples, function (s) {
      return s.opacity > 0;  // Ignore samples with zero opacity
  });
  //console.log('after',flatSamples.length);
  return flatSamples;
}

function processInputs(assetsDb) {
  async.forEachSeries(inputs, function (name, callback) {
    STK.util.clearCache();

    var outputDir = cmd.output_dir;
    var outname;
    var basename;
    var metadata;
    var info;

    if (cmd.input_type === 'id') {
      var sid = STK.assets.AssetManager.toSourceId(cmd.source, name);
      outname = sid.id;
      basename = outputDir + '/' + outname;
      info = {fullId: sid.fullId, format: cmd.format};
      metadata = assetsDb? assetsDb.getAssetInfo(fullId) : null;
    } else {
      var file = name;
      var split = path.basename(file).split('.');
      outname = split[0];
      basename = outputDir + '/' + outname;
      info = {file: file, format: cmd.format, assetType: 'model', defaultMaterialType: THREE.MeshPhongMaterial};
    }
    console.log('Output to ' + basename);
    shell.mkdir('-p', basename);

    console.log('try load model ', info);
    assetManager.loadModel(info, function (err, mInst) {
      if (err) {
        console.error('Error loading', info, err);
        callback(err);
      } else {
        console.log('Loaded ' + name);
        //console.log('info', mInst.model.info, mInst.model.getUp(), mInst.model.getFront());
        function onDrained() {
          console.log('Sampling points');
          var object3D = mInst.getObject3D("ModelInstance");
          var opts = { };
          if (cmd.limit_to_visible || cmd.ignore_redundant) {
            var d =  Math.max(cmd.resolution*2, 256); // Make sure resolution is at least somewhat okay
            var visible = STK.gfx.ViewUtils.identifyVisibleTriangles({ scene: object3D, width: d, height: d });
            opts = {
              visibleTriangles: visible,
              ignoreRedundant: cmd.ignore_redundant,
              limitToVisible: cmd.limit_to_visible, skipInnerMaterial: false, minMaterialScoreRange: [0, 0.3]};
          }
          var samples = samplePoints(object3D, argv.samples, opts);
          exporter.exportSampledPoints(samples, { name: basename });
          callback();
        }
        STK.util.waitImagesLoaded(onDrained);
      }
    }, metadata);
  }, function (err, results) {
    console.log('DONE');
  });
}

processInputs();