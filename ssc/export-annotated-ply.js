#!/usr/bin/env node

var fs = require('fs');
var async = require('async');
var shell = require('shelljs');
var STK = require('./stk-ssc');

var cmd = require('commander');
cmd
  .version('0.0.1')
  .option('--id <id>', 'Model id [default: ScanNet-2016-07-24_10-48-40]', STK.util.cmd.parseList, ['ScanNet-2016-07-24_10-48-40'])
  .option('--ids_file <file>', 'File with model ids')
  .option('--parentId <parentId>', 'Parent model id', STK.util.cmd.parseList, [])
  .option('--source <source>', 'Model source [default: scan-checked]', 'scan-checked')
  .option('--labels <filename>', 'Labels file', 'none') //__dirname + '/data/scannet-category-color-index.txt')
  .option('--outlabels <filename>', 'Output labels file')
  .option('--label_mapping <filename>', 'Label mappings file', __dirname + '/data/label-mappings.tsv')
  .option('--label_mapping_category <cat>', 'Label mapping category field', 'category')
  .option('--nyu40_colors <filename>', 'Color mapping for nyu40 colors', STK.Constants.assetsDir + '/data/labels/nyu40colors.csv')
  .option('--mpr40_colors <filename>', 'Color mapping for mpr40 colors', STK.Constants.assetsDir + '/data/labels/mpr40.tsv')
  .option('--ann_type <type>', 'Annotation type' /*, /^(raw|clean|aggr)$/*/)
  .option('-n, --ann_limit <num>', 'Limit on number of annotations to export', STK.util.cmd.parseInt, -1)
  .option('--output_dir <dir>', 'Base directory for output files', '.')
  .option('--include_annId [flag]', 'Whether to include ann id in output filename', STK.util.cmd.parseBoolean, false)
  .option('--skip_existing [flag]', 'Whether to skip output of existing files', STK.util.cmd.parseBoolean, false)
  .option('--disable_ply_output [flag]', 'Whether to skip writing PLY files', STK.util.cmd.parseBoolean, false)
  .option('--ply_format [format]', 'Ply format to use (binary_little_endian or ascii)')
  .parse(process.argv);
var argv = cmd;

// Parse arguments and initialize globals
var skip_existing = argv.skip_existing;
var assetManager = new STK.assets.AssetManager({ autoAlignModels: false, autoScaleModels: false });
var ids = argv.id;

var assets = require('./data/assets.json');
var assetsMap = _.keyBy(assets, 'name');
STK.assets.registerCustomAssetGroupsSync(assetsMap, [argv.source]);

var assetGroup = STK.assets.AssetGroups.getAssetGroup(argv.source);
var assetsDb = assetGroup? assetGroup.assetDb : null;
if (!assetsDb) {
  console.log('Unrecognized asset source ' + argv.source);
  return;
}

if (cmd.ids_file) {
  var data = fs.readFileSync(cmd.ids_file, 'utf8');
  ids = data.split('\n');
  ids = STK.util.shuffle(ids);
} else if (ids[0] === 'all') {
  ids = assetGroup.assetDb.assetInfos.map(function(info) { return info.id; });
  ids = STK.util.shuffle(ids);
}

// Some utility function for exporting semantic segmentations

// Create ply exporter
function create_ply_exporter(format) {
  var VertexAttrs = STK.exporters.PLYExporter.VertexAttributes;
  return new STK.exporters.PLYExporter({
    fs: STK.fs,
    format: format,
    vertexAttributes: [ VertexAttrs.rgbColor, VertexAttrs.objectId, VertexAttrs.categoryId,
      {
        name: 'NYU40',
        stride: 1,
        properties: [{
          name: 'NYU40',
          type: 'uint8'
        }]
      },
      {
        name: 'mpr40',
        stride: 1,
        properties: [{
          name: 'mpr40',
          type: 'uint8'
        }]
      }
    ]
  });
}

// Export segmentation plys
// Export different colorings: raw, category, object
function export_segmentation_plys(segments, opts) {
  var plyExporter = opts.plyExporter;
  var labelRemap = opts.labelRemap;
  var callback = opts.callback;
  var categoryColorIndex = opts.categoryColorIndex;
  var basename = opts.basename;
  var unlabeledColor =  new THREE.Color(STK.Constants.defaultPalette.colors[0]);

  // colorSegments takes in three parameters: labelToIndex mapping, getLabelFn, getMaterialFn
  // Slightly weird, but segment attribute are set after coloring
  segments.colorSegments('Category', categoryColorIndex, mapCategoryFn);
  var nyu40Labels = labelRemap? labelRemap.getLabelSet('nyu40') : null;
  var mpr40Labels = labelRemap? labelRemap.getLabelSet('mpr40') : null;
  if (nyu40Labels) {
    segments.colorSegments('NYU40', nyu40Labels.labelToId, nyu40Labels.rawLabelToLabel, nyu40Labels.getMaterial, nyu40Labels.unlabeledId);
  }
  if (mpr40Labels) {
    segments.colorSegments('mpr40', mpr40Labels.labelToId, mpr40Labels.rawLabelToLabel, mpr40Labels.getMaterial, mpr40Labels.unlabeledId);
  }
  var objColorIndex = segments.colorSegments('Object', {'unknown': 0});

  async.series([
    function (cb) {
      //segments.setMaterialVertexColors(THREE.VertexColors);
      segments.colorRawSegmentsOriginal();
      segments.export(plyExporter, basename + '.annotated', cb);
    },
    function (cb) {
      //segments.setMaterialVertexColors(THREE.NoColors);
      segments.colorRawSegments(unlabeledColor);
      segments.colorSegments('Category', categoryColorIndex, mapCategoryFn);
      segments.export(plyExporter, basename + '.categories.annotated', cb);
    },
    function (cb) {
      // Map from Category to NYU40 and export
      if (nyu40Labels) {
        segments.colorRawSegments(nyu40Labels.unlabeledColor);
        segments.colorSegments('NYU40', nyu40Labels.labelToId, nyu40Labels.rawLabelToLabel, nyu40Labels.getMaterial, nyu40Labels.unlabeledId);
        segments.export(plyExporter, basename + '.nyu40.annotated', cb);
      } else {
        setTimeout(cb, 0);
      }
    },
    function (cb) {
      // Map from Category to MPR40 and export
      if (mpr40Labels) {
        segments.colorRawSegments(mpr40Labels.unlabeledColor);
        segments.colorSegments('mpr40', mpr40Labels.labelToId, mpr40Labels.rawLabelToLabel, mpr40Labels.getMaterial, mpr40Labels.unlabeledId);
        segments.export(plyExporter, basename + '.mpr40.annotated', cb);
      } else {
        setTimeout(cb, 0);
      }
    },
    function (cb) {
      segments.colorRawSegments(unlabeledColor);
      segments.colorSegments('Object', objColorIndex);
      segments.export(plyExporter, basename + '.instances.annotated', cb);
    }
  ], callback);
}

var plyExporter = create_ply_exporter(argv.ply_format);

STK.Constants.defaultPalette = STK.Colors.palettes.d3_unknown_category19p;

// Object category color index
var categoryColorIndex = (argv.labels && argv.labels !== 'none')?
  STK.util.loadLabelColorIndex(argv.labels) : {};

var labelMappingCategory = argv.label_mapping_category;
var labelMappings = STK.fs.loadDelimited(argv.label_mapping, { keyBy: labelMappingCategory }).data;
if (labelMappings && _.size(categoryColorIndex) === 0) {
  categoryColorIndex['unknown'] = 0;  //'#A9A9A9';
  _.each(labelMappings, function(label, k) {
    categoryColorIndex[k] = label.index;
  });
}

//console.log('labelMappings', labelMappings);
var labelRemap;
var mapCategoryFn;
if (labelMappings) {
  if (labelMappingCategory !== 'category') {
    mapCategoryFn = function(rawlabel) {
      var entry = labelMappings[rawlabel];
      return entry && entry.category? entry.category : rawlabel;
    }
  }
  var mpr40Colors = STK.fs.loadDelimited(argv.mpr40_colors).data;
  var nyu40Colors = STK.fs.loadDelimited(argv.nyu40_colors).data;

  labelRemap = new STK.LabelRemap({
    mappings: labelMappings,
    labelSets: {
      'mpr40': { data: mpr40Colors, id: 'mpcat40index', label: 'mpcat40', unlabeled: 'unlabeled', empty: 'void', other: 'misc' },
      'nyu40': { data: nyu40Colors, id: 'nyu40id', label: 'nyu40class', unlabeled: 'void', other: 'otherprop' }
    },
    mappingKeyField: labelMappingCategory
  });
}

var segmentsType = 'surfaces';
if (argv.ann_type === 'raw') {
  segmentsType = 'segment-annotations-raw';
} else if (argv.ann_type === 'clean') {
  segmentsType = 'segment-annotations-clean';
} else if (argv.ann_type === 'latest') {
  segmentsType = 'segment-annotations-latest';
} else if (argv.ann_type) {
  segmentsType = argv.ann_type;
}
var annNum = argv.ann_limit;
console.log('segmentsType is ' + segmentsType);
var segments = new STK.geo.Segments({ skipSegmentedObject3D: true, skipUnlabeledSegment: true, keepAttributes: true,
  showNodeCallback: function (segmentedObject3D) { } },  'annSegments');
function colorize(loadInfo, outdir, callback) {
  shell.mkdir('-p', outdir);
  assetManager.getModelInstanceFromLoadModelInfo(loadInfo, function (mInst) {
    segments.init(mInst);
    mInst.model.info.annSegments = STK.util.cloneDeep(mInst.model.info[segmentsType]);
    var annSegmentsInfo = mInst.model.info.annSegments;
    if (annSegmentsInfo.files && loadInfo.segmentsType && loadInfo.segmentsType !== segmentsType) {
      var segmentationInfo = mInst.model.info[loadInfo.segmentsType];
      var segmentationFile = STK.util.get(segmentationInfo, 'file') || STK.util.get(segmentationInfo, 'files.segments');
      if (segmentationFile) {
        annSegmentsInfo.files['segments'] = segmentationFile;
      } else {
        console.warn('Cannot get segmentation file for segment type ' + loadInfo.segmentsType);
      }
    }
    mInst.model.info.annId = loadInfo.annId;
    segments.loadSegments(function (err, res) {
      if (!err) {
        var id = loadInfo.id;
        var annId = loadInfo.annId;
        var annIndex = loadInfo.annIndex;
        var basename = id;
        if (argv.include_annId) {
          basename = (annId != undefined)? id + '_' + annId : id;
        } else {
          basename = (annIndex != undefined) ? id + '_' + annIndex : id;
        }
        basename = outdir + '/' + basename;
        if (segments.segmentGroupsData) {
          fs.writeFileSync(basename + '.semseg.json', JSON.stringify(segments.segmentGroupsData));
        }

        if (!cmd.disable_ply_output) {
          export_segmentation_plys(segments, {
            basename: basename,
            plyExporter: plyExporter,
            callback: callback,
            labelRemap: labelRemap,
            categoryColorIndex: categoryColorIndex,
            mapCategoryFn: mapCategoryFn
          });
        }
      } else {
        console.error(err, res);
        callback(err, res);
      }
    });
  });
}

function processIds(ids, outdir, doneCallback) {
  async.forEachSeries(ids, function (id, cb) {
    function callback(err, result) {
      if (err) {
        console.error('Error processing id ' + id, err);
      }
      // Don't really care about the result, discard
      cb();
    }
    console.log('Proccessing ' + id);
    var mInfo = assetsDb.getAssetInfo(argv.source + '.' + id);
    var loadInfo = assetManager.getLoadModelInfo(argv.source, id, mInfo);
    var segmentsInfo = loadInfo[segmentsType];
    //console.log('info', segmentsType, segmentsInfo);
    STK.util.clearCache();
    var basename = outdir + '/' + id;
    console.log('skip_existing is ' + skip_existing);
    if (skip_existing && shell.test('-d', basename)) {
      console.warn('Skipping existing output at: ' + basename);
      setTimeout(function () { callback(); }, 0);
    } else if (segmentsInfo) {
      if (segmentsInfo.files && segmentsInfo.files.annIds) {
        console.log('fetching from ' + segmentsInfo.files.annIds);
        STK.util.getJSON(segmentsInfo.files.annIds)
          .done(function (data) {
            shell.mkdir('-p', basename);
            fs.writeFileSync(basename + '/' + id + '.semseg.anns.json', JSON.stringify(data));
            var anns = data;
            if (annNum > 0) {
              anns = _.take(anns, annNum);
            }
            async.forEachOfSeries(anns, function (ann, index, cb) {
              var annSegmentType = STK.util.get(ann, 'data.metadata.segmentType') || segmentsType;
              var loadInfoCopy = _.clone(loadInfo);
              loadInfoCopy.annId = ann.id;
              loadInfoCopy.annIndex = (annNum !== 1)? index : undefined;
              loadInfoCopy.segmentsType = annSegmentType;
              colorize(loadInfoCopy, basename, cb);
            }, function (err, results) {
              callback(err, results);
            });
          })
          .fail(function (err) {
            callback(err, null);
          })
      } else {
        colorize(loadInfo, basename, callback);
      }
    } else {
      setTimeout(function () { callback('No segment info for ' + id + ', segmentsType ' + segmentsType, null); }, 0);
    }
  }, function (err, results) {
    if (doneCallback) {
      doneCallback(err, results);
    } else {
      console.log('DONE');
    }
  });
}

function processParentIds(parentIds, outdir, doneCallback) {
  var grouped = _.groupBy(assetsDb.assetInfos, 'parentId');
  console.log('parentIds', parentIds);
  async.forEachSeries(parentIds, function (pid, callback) {
    var g = grouped[pid];
    if (g) {
      processIds(g.map(function (x) {
        return x.id;
      }), outdir + '/' + pid, callback);
    } else {
      console.log('No elements for ' + pid);
      setTimeout(function () { callback(); }, 0);
    }
  }, function(err, results) {
    if (doneCallback) {
      doneCallback(err, results);
    } else {
      console.log('DONE');
    }
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

var parentIds = argv.parentId;
if (parentIds && parentIds.length) {
  processParentIds(parentIds, argv.output_dir, exportCategoryLabels);
} else {
  processIds(ids, argv.output_dir, exportCategoryLabels);
}
