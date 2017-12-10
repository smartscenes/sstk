#!/usr/bin/env node

var fs = require('fs');
var async = require('async');
var shell = require('shelljs');
var STK = require('./stk-ssc');

var cmd = require('commander');
cmd
  .version('0.0.1')
  .option('--id <id>', 'Model id [default: 101]', STK.util.cmd.parseList, ['101'])
  .option('--source <source>', 'Model source [default: p5d]', 'p5d')
//  .option('--ann_type <type>', 'Annotation type', /^(raw|clean|aggr)$/)
  .option('-n, --ann_limit <num>', 'Limit on number of annotations to export', STK.util.cmd.parseInt, 1)
  .option('--output_dir <dir>', 'Base directory for output files', '.')
  .option('--include_annId [flag]', 'Whether to include ann id in output filename', STK.util.cmd.parseBoolean, false)
  .option('--skip_existing [flag]', 'Whether to skip output of existing files', STK.util.cmd.parseBoolean, false)
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

if (ids.indexOf('all') >= 0) {
  ids = assetsDb.getAssetIds().map(function (x) {
    return x.split('.', 2)[1];
  });
} else if (ids.indexOf('annotated') >= 0) {
  var annotationsUrl = STK.Constants.baseUrl + '/part-annotations/list?format=json&$columns=itemId';
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

var source = argv.source;

var segmentsType = 'part-annotations';
// if (argv.ann_type === 'raw') {
//   segmentsType = 'segment-annotations-raw';
// } else if (argv.ann_type === 'clean') {
//   segmentsType = 'segment-annotations-clean';
// }
var annNum = argv.ann_limit;
console.log('segmentsType is ' + segmentsType);
var segments = new STK.geo.Segments({ showNodeCallback: function (segmentedObject3D) { } },  segmentsType);
function exportAnnotation(loadInfo, outdir, callback) {
  shell.mkdir('-p', outdir);
  assetManager.getModelInstanceFromLoadModelInfo(loadInfo, function (mInst) {
    segments.init(mInst);
    mInst.model.info.annId = loadInfo.annId;
    segments.loadSegments(function (err, res) {
      if (!err) {
        var id = loadInfo.id;
        var annId = loadInfo.annId;
        var annIndex = loadInfo.annIndex;
        var basename = id;
        if (argv.include_annId) {
          basename = (annId != undefined)? id + '_' + annIndex : id;
        } else {
          basename = (annIndex != undefined) ? id + '_' + annIndex : id;
        }
        basename = outdir + '/' + basename;
        segments.indexedSegmentation.annId = loadInfo.annId;
        fs.writeFileSync(basename + '.json', JSON.stringify(segments.indexedSegmentation));
        callback(err, res);
      } else {
        console.error(err, res);
        callback(err, res);
      }
    });
  });
}

function processIds(ids, outdir, doneCallback) {
  async.forEachSeries(ids, function (id, callback) {
    var mInfo = assetsDb.getAssetInfo(argv.source + '.' + id);
    var loadInfo = assetManager.getLoadModelInfo(argv.source, id, mInfo);
    var segmentsInfo = loadInfo[segmentsType];
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
            data.forEach(function(x) {
              if (typeof x.data === 'string') {
                x.data = JSON.parse(x.data);
              }
            });
            fs.writeFileSync(basename + '/' + id + '.anns.json', JSON.stringify(data));
            var annIds = data.map(function (rec) {
              return rec.id;
            });
            if (annNum > 0) {
              annIds = _.sortBy(annIds, function(id) { return -id; });
              annIds = _.take(annIds, annNum);
            }
            async.forEachOfSeries(annIds, function (annId, index, cb) {
              var loadInfoCopy = _.clone(loadInfo);
              loadInfoCopy.annId = annId;
              loadInfoCopy.annIndex = (annNum !== 1)? index : undefined;
              exportAnnotation(loadInfoCopy, basename, cb);
            }, function (err, results) {
              callback(err, results);
            });
          })
          .fail(function (err) {
            callback(err, null);
          })
      } else {
        exportAnnotation(loadInfo, basename, callback);
      }
    } else {
      setTimeout(function () { callback('No annotations for ' + id + ', segmentsType ' + segmentsType, null); }, 0);
    }
  }, function (err, results) {
    if (doneCallback) {
      doneCallback(err, results);
    } else {
      console.log('DONE');
    }
  });
}

processIds(ids, argv.output_dir);
