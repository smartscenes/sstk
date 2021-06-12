#!/usr/bin/env node

/* jshint esversion: 6 */
var async = require('async');
var shell = require('shelljs');
var STK = require('./stk-ssc');
var path = require('path');
var cmd = require('./ssc-parseargs');
cmd
  .version('0.0.1')
  .description('Sample points from a mesh')
  .option('--input <filename>', 'Input path')
  .option('--input_type <type>', 'Input type (id or path)',  /^(id|path)$/, 'id')
  .option('--id <id>', 'Scene id [default: scene00092]', STK.util.cmd.parseList)
  .option('--source <source>', 'Scene source (wssScene) [default: wssScene]', 'wssScene')
  .option('--format <format>', 'Scene format')
  .option('--level <level>', 'Scene level to render', STK.util.cmd.parseInt)
  .option('--room <room>', 'Room id to render [null]')
  .option('--samples <number>', 'Number of samples [default: 100000]', STK.util.cmd.parseInt, 1000000)
  .option('--opacity_threshold <number>', 'Opacity threshold', STK.util.cmd.parseFloat, -1)
  .option('--resolution <number>', 'Resolution for view rendering [default: 256]', STK.util.cmd.parseInt, 256)
  .option('--limit_to_visible [flag]', 'Limit to visible', STK.util.cmd.parseBoolean, false)
  .option('--ignore_redundant [flag]', 'Limit to non-redundant materials', STK.util.cmd.parseBoolean, false)
  .option('--check_reverse_faces [flag]', 'Whether to do explicit check of reversed faces', STK.util.cmd.parseBoolean, false)
  .option('--ignore_redundant_samples <number>', 'Numbers of sample points per mesh to check for non-redundant materials', STK.util.cmd.parseInt, 0)
  .option('--restrict_redundant_white_materials [flag]', 'Whether only white materials are considered for redundant materials', STK.util.cmd.parseBoolean, false)
  .option('--output_dir <dir>', 'Base directory for output files', '.')
  .option('--skip_existing', 'Whether to skip output of existing files', STK.util.cmd.parseBoolean, false)
  .option('--ply_format <format>', 'Ply format to use (binary_little_endian or ascii)')
  .option('--id_field <fieldname>', 'id field', 'id')
  .option('--world_up <vector3>', STK.util.cmd.parseVector, STK.Constants.worldUp)
  .option('--world_front <vector3>', STK.util.cmd.parseVector, STK.Constants.worldFront)
  .option('--use_search_controller [flag]', 'Whether to lookup asset information online', STK.util.cmd.parseBoolean, false)
  .option('--node_index_file <filename', 'Output filename for node index file')
  .optionGroups(['config_file', 'color_by'])
  .parse(process.argv);

var argv = cmd;

var useSearchController = cmd.use_search_controller;
var assetManager = new STK.assets.AssetManager({
  autoAlignModels: false, autoScaleModels: false, assetCacheSize: 100,
  useColladaScale: false, convertUpAxis: false,
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

cmd.world_up = STK.geo.Object3DUtil.toVector3(cmd.world_up);
cmd.world_front = STK.geo.Object3DUtil.toVector3(cmd.world_front);

var inputs = [];
if (cmd.input) {
  inputs = cmd.getInputs(cmd.input);
} else {
  inputs = argv.id ? argv.id : ['scene00092'];
}

STK.assets.registerAssetGroupsSync({ assetSources: [cmd.source] });
if (argv.format) {
  STK.assets.AssetGroups.setDefaultFormat(argv.format);
}

var VertexAttrs = STK.exporters.PLYExporter.VertexAttributes;
var exporter = new STK.exporters.PLYExporter({ fs: STK.fs, format: argv.ply_format,
  vertexAttributes: [ VertexAttrs.normal, VertexAttrs.rgbColor, VertexAttrs.opacity, VertexAttrs.nodeIndex ] });

function samplePoints(modelObject3D, numSamples, opts) {
  opts = opts || {};
  var rng = opts.rng;
  console.log('Sampling ' + numSamples + ' for coloring');
  var epsilon = 0.0001;
  var bbox = STK.geo.Object3DUtil.getBoundingBox(modelObject3D);
  var minDim = bbox.minDim();
  var adjustedEpsilon = epsilon*minDim;
  // TODO: Make the below more readable
  // TODO: handle split_by_material
  var samples = STK.geo.MeshSampling.sampleObject(modelObject3D, numSamples, {
      handleMaterialSide: true,
      recursive: true,
      userDataFields: ['nodeIndex'],
      weightFn: {
//      name: opts.limitToVisible? 'visibleWithArea' : 'area',
          name: opts.weightFn ||
            (opts.ignoreRedundant? "areaWithoutInnerRedundantMaterials" : null ) ||
            (opts.limitToVisible? (opts.skipInnerMaterial? 'areaWithVisibleMaterial' : 'visibility') : 'area'),
          args: { scene: modelObject3D, visibleTriangles: opts.visibleTriangles,
              ignoreMaterialWithMinScore: opts.skipInnerMaterial, minMaterialScoreRange: opts.minMaterialScoreRange,
              // parameters for "areaWithoutInnerRedundantMaterials"
              restrictRedundantToWhiteMaterial: cmd.restrict_redundant_white_materials,
              checkReverseFaces: cmd.check_reverse_faces,
              nsamples: cmd.ignore_redundant_samples, epsilon: adjustedEpsilon,
              minMaterialScore: opts.minMaterialScoreRange? opts.minMaterialScoreRange[1] : undefined }
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
    return s.opacity > cmd.opacity_threshold;  // Ignore samples with zero opacity
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
    } else if (cmd.input_type === 'path') {
      var file = name;
      var split = path.basename(file).split('.');
      outname = split[0];
      basename = outputDir + '/' + outname;
      info = {file: file, format: cmd.format, assetType: 'scene', defaultMaterialType: THREE.MeshPhongMaterial};
    }

    var floor = cmd.level;
    var room = cmd.room;
    if (floor != null) {
      basename += '_' + floor;
      info.floor = floor;
      if (room != null) {
        basename += '_' + room;
        info.room = room;
      }
    }

    console.log('Output to ' + basename);
    shell.mkdir('-p', outputDir);

    console.log('try load scene ', info);
    info.copyFields = [];
    console.log('info', info);
    assetManager.loadAssetAsScene(info, function (err, sceneState) {
      if (err) {
        console.error('Error loading', info, err);
        callback(err);
      } else {
        console.log('Loaded ' + name);
        function onDrained() {
          console.log('Sampling points');
          var object3D = sceneState.scene;
          var objectIndex = sceneState.getObjectIndex();
          sceneState.populateMeshUserData('nodeIndex', objectIndex);
          var opts = {};
          if (cmd.limit_to_visible || cmd.ignore_redundant) {
            var d = Math.max(cmd.resolution * 2, 256); // Make sure resolution is at least somewhat okay
            var visible = STK.gfx.ViewUtils.identifyVisibleTriangles({scene: object3D, width: d, height: d});
            opts = {
              visibleTriangles: visible,
              ignoreRedundant: cmd.ignore_redundant,
              limitToVisible: cmd.limit_to_visible, skipInnerMaterial: false, minMaterialScoreRange: [0, 0.5]
            };
          }
          //var indexed = STK.geo.Object3DUtil.getIndexedNodes(object3D, { splitByMaterial: cmd.split_by_material });
          var samples = samplePoints(object3D, argv.samples, opts);
          exporter.exportSampledPoints(samples, {name: basename});

          if (cmd.node_index_file) {
            objectIndex.export({ fs: STK.fs, filename: cmd.node_index_file, callback: callback});
          } else {
            callback();
          }
        }
        STK.util.waitImagesLoaded(onDrained);
      }
    }, metadata);
  }, function (err, results) {
    console.log('DONE');
  });
}

processInputs();