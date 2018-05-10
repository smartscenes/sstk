#!/usr/bin/env node

var fs = require('fs');
var async = require('async');
var path = require('path');
var shell = require('shelljs');
var STK = require('./stk-ssc');

var cmd = require('commander');
cmd
  .version('0.0.1')
  .description('Export scan to model alignment provided by turkers')
  .option('--id <id>', 'Model id [default: ScanNet-2016-07-24_10-48-40]', STK.util.cmd.parseList, ['ScanNet-2016-07-24_10-48-40'])
  .option('--ids_file <file>', 'File with model ids')
  .option('--parentId <parentId>', 'Parent model id', STK.util.cmd.parseList, [])
  .option('--source <source>', 'Model source [default: scan-checked]', 'scan-checked')
  .option('--ann_type <type>', 'Annotation type', 'scan-model-alignments')
  .option('-n, --ann_limit <num>', 'Limit on number of annotations to export', STK.util.cmd.parseInt, -1)
  .option('--labels <filename>', 'Labels file', __dirname + '/data/scannet-category-color-index.txt')
  .option('--label_mapping <filename>', 'Label mappings file', STK.Constants.assetsDir + '/data/labels/label-mappings.tsv')
  .option('--export_plys [flag]', 'Whether to export plys', STK.util.cmd.parseBoolean, false)
  .option('--output_dir <dir>', 'Base directory for output files', '.')
  .option('--include_annId [flag]', 'Whether to include ann id in output filename', STK.util.cmd.parseBoolean, false)
  .option('--skip_existing [flag]', 'Whether to skip output of existing files', STK.util.cmd.parseBoolean, false)
  .option('--assetCacheSize <num>', 'Asset cache size', STK.util.cmd.parseInt, 100)
  .parse(process.argv);
var argv = cmd;

// Parse arguments and initialize globals
var skip_existing = argv.skip_existing;
var assetManager = new STK.assets.AssetManager({ autoAlignModels: false, autoScaleModels: false, assetCacheSize: cmd.assetCacheSize });
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

var source = argv.source;
var VertexAttrs = STK.exporters.PLYExporter.VertexAttributes;
var plyExporter = new STK.exporters.PLYExporter({
  fs: STK.fs,
//  format: 'ascii',
  vertexAttributes: [ VertexAttrs.rgbColor, VertexAttrs.objectId, VertexAttrs.categoryId, {
    name: 'NYU40',
    stride: 1,
    properties: [{
      name: 'NYU40',
      type: 'uint8'
    }]
  }]
});

STK.Constants.defaultPalette = STK.Colors.palettes.d3_unknown_category19p;
var categoryIndexMap = (argv.labels && argv.labels !== 'none')?
  STK.util.loadLabelColorIndex(argv.labels) : {};

var labelMappings = STK.fs.loadDelimited(argv.label_mapping, { keyBy: 'category' }).data;
if (labelMappings && _.size(categoryIndexMap) === 0) {
  categoryIndexMap['unknown'] = 0;  //'#A9A9A9';
  _.each(labelMappings, function(label, k) {
    categoryIndexMap[k] = label.index;
  });
}

var categoryColorIndex;
if (categoryIndexMap) {
  categoryColorIndex = new STK.ds.Index();
  categoryColorIndex.fromLabelIndexMap(categoryIndexMap);
}

//console.log('labelMappings', labelMappings);
var nyu40ColorIndex = null;
var mapToNYU40Fn = null;
if (labelMappings) {
  var nyu40Grouped = _.groupBy(_.values(labelMappings), 'nyu40class');
  //console.log('nyu40Grouped', nyu40Grouped);
  //console.log('nyu40GroupedCategories', _.mapValues(nyu40Grouped, function(g) { return _.map(g, function(v) { return v.category; }); }));
  nyu40ColorIndex = _.mapValues(nyu40Grouped, function(g) { return g[0].nyu40id; });
  nyu40ColorIndex['unknown'] = 0;
  //console.log('nyu40ColorIndex', nyu40ColorIndex);
  mapToNYU40Fn = function (label) {
    if (label !== 'unknown') {
      var m = labelMappings[label];
      return m ? m.nyu40class : 'otherprop';
    } else {
      return label;
    }
  };
}


var annType = argv.ann_type;
var annNum = argv.ann_limit;

function colorize(loadInfo, output, callback) {
  var outdir = path.dirname(output);
  shell.mkdir('-p', outdir);
  var basename = path.basename(output);
  var placedModels = loadInfo.placedModels;
  //console.log('placedModels', placedModels);
  assetManager.loadScene(loadInfo, function (err, sceneState) {
    var scanIndex = _.findIndex(sceneState.modelInstances, function(m) {
      return m.model.isScan();
    });
    // var placedModelInstances = _.filter(sceneState.modelInstances, function(x, i) {
    //   return i !== scanIndex;
    // });
    var placedModelInstances = _.map(placedModels, function(placed, i) {
      var mi = placed.mInstIndex;
      var m = sceneState.modelInstances[mi];
      m.object3D.category = placed.label;
      var attributes = {
        categoryId: categoryColorIndex.indexOf(placed.label, true),
        objectId: placed.segGroupIndex
      };
      if (nyu40ColorIndex) {
        var nyu40Label = mapToNYU40Fn(placed.label);
        attributes['NYU40'] = nyu40ColorIndex[nyu40Label];
      }
      STK.geo.Object3DUtil.traverseMeshes(m.object3D, false, function(mesh) {
        mesh.userData.attributes = attributes;
      });
      return m;
    });
    var alignedObject3Ds = _.map(placedModelInstances, function(m) { return m.object3D; });
    sceneState.fullScene.updateMatrixWorld();
    var target = sceneState.modelInstances[scanIndex].getObject3D('Model');
    var worldToModelTransform = new THREE.Matrix4();
    worldToModelTransform.getInverse(target.matrixWorld);

    STK.scene.SceneUtil.colorScene(sceneState, 'category', {
      index: categoryColorIndex,
      palette: STK.Constants.defaultPalette,
      getCategory: function(modelInstance) {
        return modelInstance.object3D.category;
      },
      callback: function(err, res) {
        var name = outdir + '/' + basename + '.categories.aligned';
        plyExporter.export(alignedObject3Ds, {transform: worldToModelTransform, name: name, callback: callback});
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
    console.log('Processing ' + id);
    var mInfo = assetsDb.getAssetInfo(argv.source + '.' + id);
    var loadInfo = assetManager.getLoadModelInfo(argv.source, id, mInfo);
    var annInfo = loadInfo[annType];
    //console.log('info', annType, annInfo);
    STK.util.clearCache();
    var basename = outdir + '/' + id;
    console.log('skip_existing is ' + skip_existing);
    if (skip_existing && shell.test('-d', basename)) {
      console.warn('Skipping existing output at: ' + basename);
      setTimeout(function () { callback(); }, 0);
    } else {
      if (annInfo && annInfo.files && annInfo.files.annIds) {
        console.log('fetching from ' + annInfo.files.annIds);
        STK.util.getJSON(annInfo.files.annIds)
          .done(function (data) {
            shell.mkdir('-p', basename);
            var anns = data;
            anns = _.sortBy(anns, function(ann) { return -ann.id; });
            fs.writeFileSync(basename + '/' + id + '.align.anns.json', JSON.stringify(anns));
            if (annNum > 0) {
              anns = _.take(anns, annNum);
            }
            async.forEachOfSeries(anns, function (ann, index, cb) {
              var annId = ann.id;
              var annIndex = (annNum !== 1)? index : undefined;
              var outputname = id;
              if (argv.include_annId) {
                outputname = (annId != undefined)? id + '_' + annId : id;
              } else {
                outputname = (annIndex != undefined) ? id + '_' + annIndex : id;
              }
              outputname = basename + '/' + outputname;

              fs.writeFileSync(outputname + '.align.json', JSON.stringify(ann));
              var sceneData = ann.data.scene;
              // var alignAnnotationId = ann.id;
              // var segmentType = ann.data.segmentType;
              // var segmentAnnotationId = ann.data.segmentAnnotationId;
              // var segmentAnnotationUrl = STK.util.replaceVars("${baseUrl}/segment-annotations/aggregated?annId=${annId}",
              //   { baseUrl: STK.Constants.baseUrl, annId: segmentAnnotationId });
              // STK.util.getJSON(segmentAnnotationUrl, function(err, segmentAnnotations) {
              //   if (err) {
              //     callback(err, segmentAnnotations);
              //   } else {
              //     // Merge the two
              //     console.log(segmentAnnotations);
              //     console.log(ann);
              //     var merged = {};
              //     merged.sceneId = segmentAnnotations.sceneId;
              //     merged.annIds = {
              //       semseg: segmentAnnotationId,
              //       align: alignAnnotationId
              //     };
              //     merged.objects = segmentAnnotations.segGroups;
              //
              //   }
              // });
              //console.log('ann.data', ann.data);
              if (cmd.export_plys) {
                if (ann.data.placedModels && ann.data.placedModels.length > 0) {
                  colorize({data: sceneData, placedModels: ann.data.placedModels}, outputname, callback);
                } else {
                  console.log('No placedModels, skipping');
                  callback();
                }
              } else {
                callback();
              }
            }, function (err, results) {
              callback(err, results);
            });
          })
          .fail(function (err) {
            callback(err, null);
          });
      }
      else {
        setTimeout(function () {
          callback('No annotation info for ' + id + ', annType ' + annType, null);
        }, 0);
      }
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

var parentIds = argv.parentId;
if (parentIds && parentIds.length) {
  processParentIds(parentIds, argv.output_dir);
} else {
  processIds(ids, argv.output_dir);
}
