#!/usr/bin/env node

var async = require('async');
var cmd = require('commander');
var path = require('path');
var shell = require('shelljs');
var STK = require('./stk-ssc');

cmd
  .version('0.0.1')
  .description('Recolors ply with face annotations using prettier colors')
  .option('--input <filename>', 'Input path')
  .option('--labels <filename>', 'Labels file', __dirname + '/data/scannet-category-color-index.txt')
  .option('--outlabels <filename>', 'Output labels file')
  .option('--nyu40_colors <filename>', 'Color mapping for nyu40 colors', STK.Constants.assetsDir + '/data/labels/nyu40colors.csv')
  .option('--mpr40_colors <filename>', 'Color mapping for mpr40 colors', STK.Constants.assetsDir + '/data/labels/mpr40.tsv')
  .option('--label_mapping <filename>', 'Label mappings file', STK.Constants.assetsDir + '/data/labels/label-mappings.tsv')
  .parse(process.argv);
var argv = cmd;

if (!cmd.input) {
  console.error('Please specify --input <filename>');
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
  fs: STK.fs,
//  format: 'ascii',
//   vertexAttributes: [ VertexAttrs.rgbColor, VertexAttrs.objectId, VertexAttrs.categoryId, {
//     name: 'NYU40',
//     stride: 1,
//     properties: [{
//       name: 'NYU40',
//       type: 'uint8'
//     }]
//   }]
});

STK.Constants.defaultPalette = STK.Colors.palettes.d3_unknown_category19p;

var labelMappings = STK.fs.loadDelimited(argv.label_mapping, { keyBy: 'category' }).data;
var mpr40Colors = STK.fs.loadDelimited(argv.mpr40_colors, { keyBy: 'mpcat40index'}).data;
var nyu40Colors = STK.fs.loadDelimited(argv.nyu40_colors, { keyBy: 'nyu40id'}).data;
var labelToId = function(label) {
  var x = labelMappings[label];
  if (!x) {
    console.log('Unknown label ' + label);
  }
  return x? x.index : 0;
};

var categoryColorIndex = STK.util.loadLabelColorIndex(argv.labels);
if (labelToId) {
  console.log('Remap label colors');
  //console.log(categoryColorIndex);
  categoryColorIndex = _.mapKeys(categoryColorIndex, function (v,k) {
    return labelToId(k);
  });
}

function getRemapped(mappings, targetIdField, labelToId, idToColor) {
  var remapped = _.mapValues(mappings, function(v) { return v[targetIdField] || 0; });
  if (labelToId) {
    console.log('Remap ' + targetIdField + ' keys');
    remapped = _.mapKeys(remapped, function(v,k) {
      return labelToId(k);
    });
    remapped[0] = 0;
  } else {
    remapped['unknown'] = 0;
  }
  if (idToColor) {
    console.log('Remap ' + targetIdField + ' values');
    remapped = _.mapValues(remapped, function(v) {
      return idToColor(v);
    });
  }
  return remapped;
}

//console.log('labelMappings', labelMappings);
var nyu40ColorIndex = null;
var mapToNYU40Fn = null;
var mpr40ColorIndex = null;
if (labelMappings) {
  mpr40ColorIndex = getRemapped(labelMappings, 'mpcat40index', labelToId, function(id) {
    //console.log('mpr40 of ' + id);
    return mpr40Colors[id].hex;
  });
  nyu40ColorIndex = getRemapped(labelMappings, 'nyu40id', labelToId, function(id) {
    //console.log('nyu40id of ' + id);
    return nyu40Colors[id].hex;
  });
  // mapToNYU40Fn = function (label) {
  //   if (label !== 'unknown') {
  //     var m = labelMappings[label];
  //     return m ? m.nyu40class : 'otherprop';
  //   } else {
  //     return label;
  //   }
  // };
}

function colorize(loadInfo, basename, callback) {
  assetManager.getModelInstanceFromLoadModelInfo(loadInfo, function (mInst) {
    var obj = mInst.object3D;
    var worldToModelTransform = null;
    // obj.updateMatrixWorld();
    // var worldToModelTransform = new THREE.Matrix4();
    // worldToModelTransform.getInverse(target.matrixWorld);

    async.series([
      function(cb) {
        STK.geo.Object3DUtil.colorVerticesUsingFaceAttribute(obj, 'segment_id', {'unknown': 0});
        plyExporter.export(obj, {
          transform: worldToModelTransform,
          name: basename + '.instances.annotated',
          callback: cb
        });
      },
      function(cb) {
        STK.geo.Object3DUtil.colorVerticesUsingFaceAttribute(obj, 'material_id', categoryColorIndex);
        plyExporter.export(obj, {
          transform: worldToModelTransform,
          name: basename + '.category.annotated',
          callback: cb
        });
      },
      function(cb) {
        if (nyu40ColorIndex) {
          STK.geo.Object3DUtil.colorVerticesUsingFaceAttribute(obj, 'material_id', nyu40ColorIndex, mapToNYU40Fn);
          plyExporter.export(obj, {transform: worldToModelTransform, name: basename + '.nyu40.annotated', callback: cb});
        } else {
          cb();
        }
      },
      function(cb) {
        if (mpr40ColorIndex) {
          STK.geo.Object3DUtil.colorVerticesUsingFaceAttribute(obj, 'material_id', mpr40ColorIndex);
          plyExporter.export(obj, {transform: worldToModelTransform, name: basename + '.mpr40.annotated', callback: cb});
        } else {
          cb();
        }
      }], callback);
  }, null, function(err) {
    console.error(err);
    callback(err);
  });
}

function exportLabels(fs, labelColorIndex, outfilename) {
  var labels = _.map(labelColorIndex, function(colorIndex, label) {
    return {
      index: colorIndex,
      label: label,
      color: STK.geo.Object3DUtil.createColor(colorIndex).getHexString()
    }
  });
  labels = _.sortBy(labels, ['index']);
  var labelsStr = 'index,label,color\n' + _.map(labels, function(label) {
    return label.index + ',' + label.label + ',' + label.color; }).join('\n');
  fs.fsWriteToFile(outfilename, labelsStr, function() {
    fs.fsExportFile(outfilename, outfilename);
    console.log('Exported labels to ' + outfilename);
  }, function(err) {
    console.warn('Error exporting labels to ' + outfilename + ': ', err);
  });
  console.log('DONE');
}

function exportCategoryLabels() {
  if (argv.outlabels) {
    var fs = STK.fs;
    exportLabels(fs, categoryColorIndex, argv.outlabels);
  } else {
    console.log('DONE');
  }
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

    console.log('Processing ' + file + '(' + index + '/' + files.length + ')');
    var info = { file: file, format: cmd.format, assetType: cmd.assetType, options: { customFaceAttributes: ['segment_id', 'material_id']} };
    colorize(info, basename, callback);
  }, function (err, results) {
    console.log('DONE');
  });
}

processFiles();