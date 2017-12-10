#!/usr/bin/env node

var fs = require('fs');
var async = require('async');
var shell = require('shelljs');
var STK = require('./stk-ssc');

var cmd = require('commander');
cmd
  .version('0.0.1')
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

var source = argv.source;
var segmentsType = 'surfaces';
var compareSegmentsType = 'segment-annotations-raw';

if (ids.indexOf('all') >= 0) {
  ids = assetsDb.getAssetIds().map(function (x) {
    return x.split('.', 2)[1];
  });
} else if (ids.indexOf('annotated') >= 0) {
  var annotationsUrl = assetGroup[compareSegmentsType].files.annotatedAssetIds;
  console.log('got annotationsUrl', annotationsUrl);
  var data = STK.util.readSync(annotationsUrl);
  var itemIds = _.uniq(JSON.parse(data).map(function(x) { return x.itemId; })).filter(function(x) { return x; });
  ids = itemIds.map(function (x) {
    return x.split('.', 2)[1];
  });
} else {
  if (ids.length === 1 && ids[0].endsWith('.txt')) {
    // Read files form input file
    var data = STK.util.readSync(ids[0]);
    ids = data.split('\n').map(function(x) { return STK.util.trim(x); }).filter(function(x) { return x.length > 0; });
  }
}

function compare(segments, initial, final) {
  var segGroups1 = initial.segGroups;
  var segGroups2 = final.segGroups;
  // for (var i = 0; i < segGroups1.length; i++) {
  //   var seg = segGroups1[i];
  //   console.log(seg.label + seg.id);
  // }
  // for (var i = 0; i < segGroups2.length; i++) {
  //   var seg = segGroups2[i];
  //   console.log(seg.label + seg.id);
  // }
  var alignment = segments.compare(segGroups1, segGroups2);
  for (var i = 0; i < alignment.alignment.length; i++) {
    var pair = alignment.alignment[i];
    var sg1 = pair[0] >= 0? segGroups1[pair[0]] : null;
    var sg2 = pair[1] >= 0? segGroups2[pair[1]] : null;
    var sg1key = sg1? sg1.label + '(' + sg1.nVertices + ')' : null;
    var sg2key = sg2? sg2.label + '(' + sg2.nVertices + ')' : null;
    if (sg1key !== sg2key) {
      // var sg1str = sg1? sg1.label + sg1.id + '[' + sg1.segments.join(',') + ']' : '-';
      // var sg2str = sg2? sg2.label + sg2.id + '[' + sg2.segments.join(',') + ']' : '-';
      var sg1str = sg1? sg1.label + '(' + sg1.id + ',' + sg1.nVertices + ')' : '-';
      var sg2str = sg2? sg2.label + '(' + sg2.id + ',' + sg2.nVertices + ')' : '-';
      console.log('mismatch ' + sg1str + ':' + sg2str);
    }
  }
}

function compareAnnotations(loadInfo, basename, segments, callback) {
  console.log('Processing ' + loadInfo.fullId);
  var segmentsInfo = loadInfo[segmentsType];

  var segmentation = STK.fs.readSync(segmentsInfo.files.segments);
  segmentation = JSON.parse(segmentation);
  var vertToSegIndex = segmentation.segIndices;
  var segIndexToVerts = _.invertBy(vertToSegIndex);
  segmentation.segIndexToVerts = segIndexToVerts;

  var initalAnnotations = STK.fs.readSync(segmentsInfo.files.segmentGroups);
  initalAnnotations = JSON.parse(initalAnnotations);

  // Load annotation ids
  var compareSegmentsInfo = loadInfo[compareSegmentsType];
  var id = loadInfo.id;
  STK.util.getJSON(compareSegmentsInfo.files.annIds)
    .done(function (data) {
      shell.mkdir('-p', basename);
      fs.writeFileSync(basename + '/' + id + '.anns.json', JSON.stringify(data));
      var annIds = data.map(function (rec) {
        return rec.id;
      });
      async.forEachOfSeries(annIds, function (annId, index, cb) {
        var compareSegGroupsFile = compareSegmentsInfo.files.segmentGroups;
        compareSegGroupsFile = STK.util.replaceVars(compareSegGroupsFile, { annId: annId });
        var anns2 = STK.fs.readSync(compareSegGroupsFile);
        anns2 = JSON.parse(anns2);
        console.log('Comparing ' + loadInfo.fullId + ' ' + annId);
        compare(segments, initalAnnotations, anns2);
        setTimeout( function() { cb(); }, 0);
      }, function (err, results) {
        callback(err, results);
      });
    })
    .fail(function (err) {
      callback(err, null);
    })
}

var segments = new STK.geo.Segments({
    showNodeCallback: function (segmentedObject3D) { } ,
    skipSegmentedObject3D: true
  },
  segmentsType);

function processIds(ids, outdir, doneCallback) {
  shell.mkdir('-p', outdir);
  async.forEachSeries(ids, function (id, callback) {
    var mInfo = assetsDb.getAssetInfo(argv.source + '.' + id);
    var loadInfo = assetManager.getLoadModelInfo(argv.source, id, mInfo);
    assetManager.getModelInstanceFromLoadModelInfo(loadInfo, function (mInst) {
      segments.init(mInst);
      mInst.model.info.annId = loadInfo.annId;
      segments.loadSegments(function (err, res) {
        if (!err) {
          compareAnnotations(loadInfo, outdir, segments, callback);
        } else {
          callback();
        }
      });
    });
  }, function (err, results) {
    if (doneCallback) {
      doneCallback(err, results);
    } else {
      console.log('DONE');
    }
  });
}

processIds(ids, argv.output_dir);
