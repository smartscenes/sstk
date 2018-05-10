#!/usr/bin/env node

var async = require('async');
var cmd = require('commander');
var path = require('path');
var shell = require('shelljs');
var STK = require('./stk-ssc');

cmd
  .version('0.0.1')
  .description('Transfers face annotation in ply directly onto vertex colors')
  .option('--input <filename>', 'Input path')
  .option('--from <property_type>', 'Whether to transfer from vertex or face property (default=face)', 'vertex')
  .option('--property <name>', 'Name of property to transfer (default=segment_id)', 'segment_id')
  .option('--incr_by <number>', 'Amount to increment by (default=1)', STK.util.cmd.parseInt, 1)
  .option('--use_pretty_colors [flag]', 'Whether to use pretty colors people can see', STK.util.cmd.parseBoolean, false)
  .parse(process.argv);
var argv = cmd;

if (!cmd.input) {
  console.error('Please specify --input <filename>');
  process.exit(-1);
}
if (cmd.from !== 'vertex' && cmd.from !== 'face') {
  console.error('Please specify --from <face|vertex>');
  process.exit(-1);
}
var files = [cmd.input];
if (cmd.input.endsWith('.txt')) {
  // Read files form input file
  var data = STK.util.readSync(cmd.input);
  files = data.split('\n').map(function(x) { return STK.util.trim(x); }).filter(function(x) { return x.length > 0; });
}

// Parse arguments and initialize globals
var assetManager = new STK.assets.AssetManager({ autoAlignModels: false, autoScaleModels: false });

var output_basename = cmd.output;
//var VertexAttrs = STK.exporters.PLYExporter.VertexAttributes;
var plyExporter = new STK.exporters.PLYExporter({
  fs: STK.fs
//  format: 'ascii'
});

function getColor(i) {
  var v = i + cmd.incr_by;
  var color;
  if (cmd.use_pretty_colors) {
    color = STK.geo.Object3DUtil.createColor(v);
  } else {
    color = new THREE.Color();
    color.setHex(v);
  }
  return color;
}

function colorize_by_face(loadInfo, basename, incrBy, callback) {
  var customFaceAttributes = loadInfo.options.customFaceAttributes;
  name_mappings = {
    'segment_id': 'instances',
    'material_id': 'category'
  }
  assetManager.getModelInstanceFromLoadModelInfo(loadInfo, function (mInst) {
    var obj = mInst.object3D;
    var worldToModelTransform = null;
    // obj.updateMatrixWorld();
    // var worldToModelTransform = new THREE.Matrix4();
    // worldToModelTransform.getInverse(target.matrixWorld);

    async.forEachOfSeries(customFaceAttributes,
      function (faceAttribute, index, cb) {
        var outname = name_mappings[faceAttribute] || faceAttribute;
        STK.geo.Object3DUtil.colorVerticesUsingFaceAttribute(obj, faceAttribute, getColor);
        plyExporter.export(obj, {
          transform: worldToModelTransform,
          name: basename + '.' + outname + '.vertex',
          callback: cb
        });
      },
      callback);
  }, null, function(err) {
    console.error(err);
    callback(err);
  });
}

function colorize_by_vertex(loadInfo, basename, incrBy, callback) {
  var customAttributes = loadInfo.options.customVertexAttributes;
  name_mappings = {
    'segment_id': 'instances',
    'material_id': 'category'
  }
  assetManager.getModelInstanceFromLoadModelInfo(loadInfo, function (mInst) {
    var obj = mInst.object3D;
    var worldToModelTransform = null;
    // obj.updateMatrixWorld();
    // var worldToModelTransform = new THREE.Matrix4();
    // worldToModelTransform.getInverse(target.matrixWorld);

    async.forEachOfSeries(customAttributes,
      function (attribute, index, cb) {
        var outname = name_mappings[attribute] || attribute;
        STK.geo.Object3DUtil.colorVerticesUsingVertexAttribute(obj, attribute, getColor);
        plyExporter.export(obj, {
          transform: worldToModelTransform,
          name: basename + '.' + outname + '.vertex',
          callback: cb
        });
      },
      callback);
  }, null, function(err) {
    console.error(err);
    callback(err);
  });
}

function processFiles() {
  async.forEachOfSeries(files, function (file, index, callback) {
    STK.util.clearCache();

    // skip if output png already exists
    var outputDir = cmd.output_dir;
    var basename = output_basename;
    if (basename) {
      // Specified output - append index
      if (files.length > 0) {
        basename = basename + '_' + index;
      }
      basename = outputDir? outputDir + '/' + basename : basename;
    } else {
      basename = path.basename(file, path.extname(file)) || 'model';
      basename = (outputDir? outputDir : path.dirname(file)) + '/' + basename;
    }

    shell.mkdir('-p', path.dirname(file));

    console.log('Processing ' + file + '(' + index + '/' + files.length + ')' + ', transferring ' + cmd.from + ' property ' + cmd.property);
    var property = cmd.property;
    var info = { file: file, format: cmd.format, assetType: cmd.assetType };
    if (cmd.from === 'face') {
      info.options = { customFaceAttributes: [property]};
      colorize_by_face(info, basename, callback);
    } else {
      info.options = { customVertexAttributes: [property]};
      colorize_by_vertex(info, basename, callback);
    }
  }, function (err, results) {
    console.log('DONE');
  });
}

processFiles();