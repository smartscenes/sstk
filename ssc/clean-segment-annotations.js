#!/usr/bin/env node

var fs = require('fs');
var async = require('async');
var shell = require('shelljs');
var STK = require('./stk-ssc');

var cmd = require('commander');
cmd
  .version('0.0.1')
  .description('Cleans aggregated segment annotations')
  .option('--id <id>', 'Model id [default: 2azQ1b91cZZ_room14,5q7pvUzZiYa_room5]', STK.util.cmd.parseList, ['2azQ1b91cZZ_room14','5q7pvUzZiYa_room5'])
  .option('--source <source>', 'Model source [default: mprm4]', 'mprm4')
//  .option('--ann_type <type>', 'Annotation type', /^(raw|clean|aggr)$/)
  .option('--output_dir <dir>', 'Base directory for output files', '.')
  .option('--skip_existing [flag]', 'Whether to skip output of existing files', STK.util.cmd.parseBoolean, false)
  .parse(process.argv);
var argv = cmd;

// Parse arguments and initialize globals
var skip_existing = argv.skip_existing;
var assetManager = new STK.assets.AssetManager({ autoAlignModels: true, autoScaleModels: false });
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

if (ids.indexOf('all') >= 0) {
  ids = assetsDb.getAssetIds().map(function (x) {
    return x.split('.', 2)[1];
  });
} else {
  if (ids.length === 1 && ids[0].endsWith('.txt')) {
    // Read files form input file
    var data = STK.util.readSync(ids[0]);
    ids = data.split('\n').map(function(x) { return STK.util.trim(x); }).filter(function(x) { return x.length > 0; });
  }
}

var source = argv.source;

//var segmentsType = 'surfaces';
var segmentsType = 'surfaces-aggr1';
var aggressiveMerge = false;

function contains(g, g2) {
  var c = g.obb.isOBBContained(g2.obb);
  if (!c && aggressiveMerge) {
    // Check individual vertices
    var points = segments.getRawSegmentVertices(g2.segments);
    var allContained = true;
    for (var i = 0; i < points.length; i++) {
      if (!g.obb.isPointContained(points[i])) {
        allContained = false;
        break;
      }
    }
    c = allContained;
  }
  return c;
}

function computeAnnotationStatistics(segmentation, annotations) {
  var segGroups = annotations.segGroups;
  var nsegs = _.size(segmentation.segIndexToVerts);
  var nverts = _.size(segmentation.segIndices);
  var annotatedSegs = _.sumBy(segGroups, function(x) { return x.segments.length; });
  var annotatedVerts = _.sumBy(segGroups, function(x) { return x.nVertices; });
  var ninstances = segGroups.length;
  var labels = _.map(segGroups, function(x) { return x.label; });
  var labelCounts = _.countBy(labels);
  var nlabels = _.size(labelCounts);

  // Not included: labeledObjects, categories, percentObjectLabeled
  return {
    id: segmentation.sceneId,
    totalVertices: nverts,
    totalSegments: nsegs,
    annotatedVertices: annotatedVerts,
    annotatedSegments: annotatedSegs,
    unannotatedVertices: nverts - annotatedVerts,
    unannotatedSegments: nsegs - annotatedSegs,
    segmentGroups: segGroups.length,
    objects: ninstances,
    labels: nlabels,
    percentComplete: 100*annotatedVerts/nverts
  };
}

function cleanAnnotations(loadInfo, outfile, segments, aggregatedStats) {
  console.log('Processing ' + loadInfo.fullId);
  var segmentsInfo = loadInfo[segmentsType];

  var annotations = STK.fs.readSync(segmentsInfo.files.segmentGroups);
  annotations = JSON.parse(annotations);
  var segmentation = STK.fs.readSync(segmentsInfo.files.segments);
  segmentation = JSON.parse(segmentation);
  var vertToSegIndex = segmentation.segIndices;
  var segIndexToVerts = _.invertBy(vertToSegIndex);
  segmentation.segIndexToVerts = segIndexToVerts;
  annotations.sceneId = loadInfo.fullId;
  var minVertices = 3;
  var segGroups = annotations.segGroups;
  for (var i = 0; i < segGroups.length; i++) {
    var segGroup = segGroups[i];
    var nSegsBefore = segGroup.segments.length;
    segGroup.segments = _.filter(segGroup.segments, function(segIndex) {
      return segIndexToVerts[segIndex];
    });
    segGroup.obb = segments.fitOBB('Raw', segGroup.segments);
    segGroup.nVertices = segments.getRawSegmentVerticesCount(segGroup.segments);
    var nSegsAfter = segGroup.segments.length;
    console.log('Segment ' + segGroup.label + ', group ' + segGroup.id +
      ' nSegsBefore=' + nSegsBefore + ', nSegsAfter=' + nSegsAfter +
      ' nVertices=' + points.length);
  }
  var totalVerticesForLabel = {};
  var segGroupsByLabel = _.groupBy(segGroups, function(x) { return x.label; });
  _.each(segGroupsByLabel, function(groups, label) {
    totalVerticesForLabel[label] = _.sumBy(groups, function(g) {
      return g.nVertices;
    });
    //console.log('label ' + label + ' ' + totalVerticesForLabel[label]);
    var sorted = _.sortBy(groups, function(g) {
      return g.obb.volume();
    });
    //console.log('sorted', JSON.stringify(sorted, null, 2));
    var unprocessed = sorted;
    var processed = [];
    while (unprocessed.length > 0) {
      var g = unprocessed.pop();
      processed.push(g);
      var keep = [];
      for (var i = 0; i < unprocessed.length; i++) {
        var g2 = unprocessed[i];
        if (contains(g, g2)) {
          // Merge together
          for (var j = 0; j < g2.segments.length; j++) {
            g.segments.push(g2.segments[j]);
          }
          console.log('Merging ' + label + ', group ' + g2.id + ' with ' + g.id);
          g2.segments = [];
        } else {
          keep.push(g2);
        }
      }
      unprocessed = keep;
    }
  });

  var modelWorldInverse = new THREE.Matrix4();
  var modelObject3D = segments.modelInstance.getObject3D('Model');
  modelObject3D.updateMatrixWorld();
  modelWorldInverse.copy(modelObject3D.matrixWorld).invert();
  for (var i = 0; i < segGroups.length; i++) {
    var segGroup = segGroups[i];
    segGroup.obb = segments.fitOBB('Raw', segGroup.segments);
    segGroup.obb.applyMatrix4(modelWorldInverse);
    segGroup.nVertices = segments.getRawSegmentVerticesCount(segGroup.segments);
  }
  annotations.segGroups = _.filter(annotations.segGroups, function(x) {
    var keep = x.segments.length && x.nVertices > minVertices;
    if (!keep) {
      console.log('Drop ' + x.label + ', group ' + x.id);
    }
    return keep;
  });
  annotations.segGroups = _.sortBy(annotations.segGroups,
    [ function(x) { return -totalVerticesForLabel[x.label] },
      function(x) { return x.label; },
      function(x) { return -x.nVertices; }]);
  fs.writeFileSync(outfile, JSON.stringify(annotations, null, 2));

  var annStats = computeAnnotationStatistics(segmentation, annotations);
  fs.writeFileSync(outfile.replace('.json', '.stats.json'), JSON.stringify(annStats, null, 2));
  aggregatedStats[loadInfo.fullId] = annStats;
}

var segments = new STK.geo.Segments({
    showNodeCallback: function (segmentedObject3D) { } ,
    skipSegmentedObject3D: true
  },
  segmentsType);

function createCsvString(map) {
  var array = _.map(map, function(v,k) {
    v['id'] = k;
    return v;
  });
  var fields = _.keys(array[0]);
  var header = fields.join(',');
  var rows = [header];
  for (var i = 0; i < array.length; i++) {
    var r = _.map(fields, function(f) { return array[i][f]; });
    rows.push(r.join(','));
  }
  return rows.join('\n');
}

function processIds(ids, outdir, doneCallback) {
  shell.mkdir('-p', outdir);
  var aggregatedStats = {};
  async.forEachSeries(ids, function (id, callback) {
    var mInfo = assetsDb.getAssetInfo(argv.source + '.' + id);
    var loadInfo = assetManager.getLoadModelInfo(argv.source, id, mInfo);
    assetManager.getModelInstanceFromLoadModelInfo(loadInfo, function (mInst) {
      segments.init(mInst);
      mInst.model.info.annId = loadInfo.annId;
      segments.loadSegments(function (err, res) {
        if (!err) {
          var filename = outdir + '/' + id + '.anns.json';
          cleanAnnotations(loadInfo, filename, segments, aggregatedStats);
        }
        setTimeout(function () {
          callback();
        }, 0);
      });
    });
  }, function (err, results) {
    var csvString = createCsvString(aggregatedStats);
    fs.writeFileSync(cmd.source + '.anns.stats.csv', csvString);
    if (doneCallback) {
      doneCallback(err, results);
    } else {
      console.log('DONE');
    }
  });
}

processIds(ids, argv.output_dir);
