#!/usr/bin/env node

var async = require('async');
var cmd = require('commander');
var STK = require('./stk-ssc');
var fs = require('fs');
var shell = require('shelljs');

cmd
  .version('0.0.1')
  .option('--source <id>', 'Source ply')
  .option('--target <id>', 'Target ply')
  .option('-n, --ann_limit <num>', 'Limit on number of annotations to export', STK.util.cmd.parseInt, -1)
  .option('--output_dir <dir>', 'Base directory for output files', '.')
  .option('--sourceSegmentType <type>', 'Source segmentation type to project', 'segment-annotations-raw')
  .option('--targetSegmentType <type>', 'Target segmentation type to project', 'surfaces-finest')
  .option('--max_dist <num>', 'Maximum distance when projecting annotations (default: 0.01)', STK.util.cmd.parseFloat, 1e-2)
  .option('--splitTargetSegments [flag]', 'Whether the target segments should be split to accomodate source annotations', STK.util.cmd.parseBoolean, false)
  .parse(process.argv);

if (!cmd.source) {
  console.error('Please specify --source <id>');
  process.exit(-1);
}

if (!cmd.target) {
  console.error('Please specify --target <id');
  process.exit(-1);
}

STK.assets.AssetGroups.registerDefaults();
var assets = require('./data/assets.json');
var assetsMap = _.keyBy(assets, 'name');
var assetSources = [cmd.source.split('.')[0], cmd.target.split('.')[0]];
STK.assets.registerCustomAssetGroupsSync(assetsMap, assetSources);
var assetManager = new STK.assets.AssetManager({ autoAlignModels: false, autoScaleModels: false });

var plyExporter = new STK.exporters.PLYExporter({ fs: STK.fs });
var annNum = cmd.ann_limit;
shell.mkdir('-p', cmd.output_dir);

STK.Constants.defaultPalette = STK.Colors.palettes.d3_unknown_category19p;
var categoryColorIndex = (cmd.labels && cmd.labels !== 'none')?
  STK.util.loadLabelColorIndex(argv.labels) : { 'unknown': 0 };
var testOutput = true;
var verbose = true;

function projectSegmentAnnotations (srcSegments, tgtSegments, tgt2srcVtxMap, outputFilename, callback) {
  var srcModelInst = srcSegments.modelInstance;
  var tgtModelInst = tgtSegments.modelInstance;

  var srcMesh = tgtSegments.rawSegmentObject3D;
  var tgtMesh = tgtSegments.rawSegmentObject3D;

  var tgtSegToVertIndices = tgtSegments.rawSegmentObject3D.userData.segToVertIndices;
  var tgtVertToSegIndices = tgtSegments.rawSegmentObject3D.userData.vertToSegIndices;
  var tgtSegGroups = tgtSegments.segmentGroups;

  var srcSegToVertIndices = srcSegments.rawSegmentObject3D.userData.segToVertIndices;
  var srcVertToSegIndices = srcSegments.rawSegmentObject3D.userData.vertToSegIndices;
  var srcSegGroups = srcSegments.segmentGroups;
  var srcSegGroupsById = _.keyBy(srcSegGroups, 'id');
  var srcSegToSegGroupIndices = _.invertMulti(srcSegGroupsById, 'segments');

  var finalTgtSegGroups = [];
  var finalTgtSegGroupsByIndex = {};

  // tgt vertex to tgt segment
  function tgtVertToTgtSeg(tgtVi) {
    return tgtVertToSegIndices[tgtVi];
  }

  // For each tgt vertex, look up src annotation segment group label
  function tgtVertToSrcSegGroup(tgtVi) {
    if (tgt2srcVtxMap[tgtVi] !== undefined) {
      var srcVi = tgt2srcVtxMap[tgtVi];  // src vertex
      var srcSegI = srcVertToSegIndices[srcVi];
      return srcSegToSegGroupIndices[srcSegI];
    }
  }

  function addToSegmentGroup(segGroupI, segments) {
    var segGroup = finalTgtSegGroupsByIndex[segGroupI];
    if (!segGroup) {
      var srcSegGroup = srcSegGroupsById[segGroupI];
      segGroup = {
        id: srcSegGroup.id,
        objectId: srcSegGroup.objectId,
        label: srcSegGroup.label,
        segments: []
      };
      finalTgtSegGroupsByIndex[segGroupI] = segGroup;
      finalTgtSegGroups.push(segGroup);
    }
    segGroup.segments.push.apply(segGroup.segments, segments);
  }

  // For each target segment group, for each vertex, get the segment annotation
  var finalTargetAnnotation = {
    sceneId: tgtModelInst.model.getFullID(),
    appId: 'project-annotations-v0.1',
    segGroups: finalTgtSegGroups
  };
  var newSegments = [];
  if (cmd.splitTargetSegments) {
    finalTargetAnnotation.segIndices = [];
  }
  _.forEach(tgtSegToVertIndices, function (tgtVertIndices, tgtSegI) {
    var groupedTgtVertIndices = _.groupBy(tgtVertIndices, tgtVertToSrcSegGroup);
    if (cmd.splitTargetSegments) {
      // create new segmentation (not really good - since this new segments could be discontinuous)
      if (_.size(groupedTgtVertIndices) === 2) {
        // group unknown pieces into main one
        if (groupedTgtVertIndices['undefined']) {
          var otherKey = _.keys(groupedTgtVertIndices).filter(function(x) { return x !== 'undefined'; })[0];
          var vs = groupedTgtVertIndices[otherKey];
          vs.push.apply(vs, groupedTgtVertIndices['undefined']);
          delete groupedTgtVertIndices['undefined'];
        }
      }
      if (verbose) {
        if (_.size(groupedTgtVertIndices) > 1) {
          console.log('split target segment ' + tgtSegI + ' into ' + _.size(groupedTgtVertIndices));
        }
      }
      _.forEach(groupedTgtVertIndices, function(verts, segGroupI) {
        var newTgtSegI = newSegments.length;
        newSegments.push(verts);
        for (var i = 0; i < verts.length; i++) {
          finalTargetAnnotation.segIndices[verts[i]] = newTgtSegI;
        }
        if (segGroupI !== 'undefined') {
          addToSegmentGroup(segGroupI, [newTgtSegI]);
        }
      });
    } else {
      // Get aggregated srcSegIndex
      var counts = _.mapValues(groupedTgtVertIndices, function(x) { return x.length; });
      var countPairs = _.map(counts, function(count, segGroupI) { return { segGroupI: segGroupI, count: count }});
      var maxPair = _.maxBy(countPairs, 'count');
      //console.log('maxPair', maxPair);
      if (maxPair && maxPair.segGroupI !== 'undefined') {
        addToSegmentGroup(maxPair.segGroupI, [tgtSegI]);
      }
    }
  });

  fs.writeFileSync(outputFilename, JSON.stringify(finalTargetAnnotation));

  // Test load output
  if (testOutput) {
    var tgtInfo = tgtModelInst.model.info;
    tgtInfo.__projectedSegments = _.clone(tgtInfo[cmd.targetSegmentType]);
    if (tgtInfo.__projectedSegments.file) {
      tgtInfo.__projectedSegments.files = {
        'segments': tgtInfo.__projectedSegments.file,
        'segmentGroups': outputFilename
      };
      delete tgtInfo.__projectedSegments.file;
    } else {
      tgtInfo.__projectedSegments.files['segmentGroups'] = outputFilename;
    }
    var testSegments = new STK.geo.Segments({
      showNodeCallback: function (segmentedObject3D) {
      }
    }, '__projectedSegments');
    testSegments.init(tgtModelInst);
    testSegments.loadSegments(function (err, res) {
      if (err) {
        console.error('Error loading projected segments ' + tgtModelInst.model.getFullID(), err);
        callback(err, res);
      } else {
        // Slightly weird, but segment attribute are set after coloring
        testSegments.colorSegments('Category', categoryColorIndex);
        var objColorIndex = testSegments.colorSegments('Object', {'unknown': 0});
        async.series([
          function (cb) {
            testSegments.setMaterialVertexColors(THREE.NoColors);
            testSegments.colorSegments('Category', categoryColorIndex);
            testSegments.export(plyExporter, outputFilename.replace('.json', '.category.annotated'), cb);
          },
          function (cb) {
            testSegments.setMaterialVertexColors(THREE.NoColors);
            testSegments.colorSegments('Object', objColorIndex);
            testSegments.export(plyExporter, outputFilename.replace('.json', '.instances.annotated'), cb);
          }
        ], callback);
      }
    });
  } else {
    callback();
  }
}

function projectColors(srcMesh, tgtMesh, tgt2srcVtxMap, filename, callback) {
  // test code: project vertex colors from src to tgt
  console.log('Setting colors');
  var srcColors = srcMesh.geometry.attributes['color'];
  var tgtColors = tgtMesh.geometry.attributes['color'];
  var stride = tgtColors.itemSize;
  for (var i = 0; i < tgtColors.count; i++) {
    if (tgt2srcVtxMap[i] !== undefined) {
      var tgtBase = stride * i, srcBase = stride * tgt2srcVtxMap[i];
      for (var k = 0; k < stride; k++) {
        tgtColors.array[tgtBase + k] = srcColors.array[srcBase + k];
      }
    }
  }
  plyExporter.export(tgtMesh, {
    name: filename,
    callback: function (err, res) {
      console.log('Exported ' + filename);
      callback(err, null)
    }
  });
}

function projectAnnotations (srcModelInst, tgtModelInst, outputDir, callback) {
  // Acquire vertex map from tgt to src
  var srcMesh = STK.geo.Object3DUtil.getMeshes(srcModelInst.object3D).list[0];
  var tgtMesh = STK.geo.Object3DUtil.getMeshes(tgtModelInst.object3D).list[0];
  console.log('Computing vertex mapping: ' + srcModelInst.model.getFullID() + ' -> ' + tgtModelInst.model.getFullID());
  var tgt2srcVtxMap;

  var srcSegments = new STK.geo.Segments({ showNodeCallback: function (segmentedObject3D) { }, skipSegmentedObject3D: true, skipUnlabeledSegment: true }, cmd.sourceSegmentType);
  var tgtSegments = new STK.geo.Segments({ showNodeCallback: function (segmentedObject3D) { }, skipSegmentedObject3D: true, skipUnlabeledSegment: true }, cmd.targetSegmentType);

  var srcInfo = srcModelInst.model.info;
  console.log('srcModelInfo', srcModelInst.model.info.parentId, srcModelInst.model.info.roomId);
  console.log('tgtModelInfo', tgtModelInst.model.info.parentId, tgtModelInst.model.info.roomId);
  var srcSegmentsInfo = srcInfo[cmd.sourceSegmentType];
  if (srcSegmentsInfo.files && srcSegmentsInfo.files.annIds) {
    srcSegments.segmentType = 'annSegments';
    tgt2srcVtxMap = STK.geo.GeometryUtil.getVertexMapping(tgtMesh.geometry, srcMesh.geometry, cmd.max_dist);
    var annotations = JSON.parse(STK.fs.readSync(srcSegmentsInfo.files.annIds));
    //console.log(annotations);
    var anns = annotations;
    if (annNum > 0) {
      anns = _.take(anns, annNum);
    }

    async.series([
      function (cb) {
        // Get segments for tgt
        console.log('load segments for ' + tgtModelInst.model.getFullID());
        tgtSegments.init(tgtModelInst);
        tgtSegments.loadSegments(function (err, res) {
          if (err) {
            console.error('Error loading target model segments ' + tgtModelInst.model.getFullID(), err);
          }
          cb(err, res);
        });
      },
      function (cb) {
        // Get segment groups for each annotation on src
        async.mapSeries(anns, function (ann, cbIn) {
          var annId = ann.id;
          var annSegmentType = STK.util.get(ann, 'data.metadata.segmentType') || cmd.sourceSegmentType;
          console.log('load segments for ' + srcModelInst.model.getFullID() + ' annId=' + annId + ' segmentType=' + annSegmentType);
          srcModelInst.model.info.annId = annId;
          srcModelInst.model.info.annSegments = STK.util.cloneDeep(srcModelInst.model.info[cmd.sourceSegmentType]);
          var annSegmentsInfo = srcModelInst.model.info.annSegments;
          if (annSegmentsInfo.files && annSegmentType !== cmd.sourceSegmentType) {
            var segmentationInfo = srcModelInst.model.info[annSegmentType];
            var segmentationFile = STK.util.get(segmentationInfo, 'file') || STK.util.get(segmentationInfo, 'files.segments');
            if (segmentationFile) {
              annSegmentsInfo.files['segments'] = segmentationFile;
            } else {
              console.warn('Cannot get segmentation file for segment type ' + annSegmentType);
            }
          }
          srcSegments.init(srcModelInst);
          srcSegments.loadSegments(function (err, res) {
            if (!err) {
              var outputfilename = outputDir + '/' + tgtModelInst.model.info.id + '_' + annId + '_proj.semseg.json';
              projectSegmentAnnotations(srcSegments, tgtSegments, tgt2srcVtxMap, outputfilename, cbIn);
            } else {
              console.error('Error loading source model segments ' + srcModelInst.model.getFullID(), err);
              cbIn(err, res);
            }
          });
        }, function (err, annotations) {
          cb(err, annotations);
        });
      }],
      function(err, res) {
        callback(err, res);
      }
    );

  } else if (srcSegmentsInfo) {
    tgt2srcVtxMap = STK.geo.GeometryUtil.getVertexMapping(tgtMesh.geometry, srcMesh.geometry, cmd.max_dist);
    async.series([
        function (cb) {
          // Get segments for tgt
          console.log('load segments for ' + tgtModelInst.model.getFullID());
          tgtSegments.init(tgtModelInst);
          tgtSegments.loadSegments(function (err, res) {
            if (err) {
              console.error('Error loading target model segments ' + tgtModelInst.model.getFullID(), err);
            }
            cb(err, res);
          });
        },
        function (cb) {
          // Get segments for tgt
          console.log('load segments for ' + srcModelInst.model.getFullID());
          srcSegments.init(srcModelInst);
          srcSegments.loadSegments(function (err, res) {
            if (!err) {
              var outputfilename = outputDir + '/' + tgtModelInst.model.info.id + '_' + cmd.sourceSegmentType + '_proj.semseg.json';
              projectSegmentAnnotations(srcSegments, tgtSegments, tgt2srcVtxMap, outputfilename, cb);
            } else {
              console.error('Error loading source model segments ' + srcModelInst.model.getFullID(), err);
              cb(err, res);
            }
          });
        }],
      function(err, res) {
        callback(err, res);
      }
    );
  } else {
    callback('No source segment information for ' + cmd.sourceSegmentType);
  }

}

async.parallel([
  function (cb) {
    var info = { fullId: cmd.source };
    assetManager.loadAsset(info, function(err, res) {
      if (err) {
        console.error('Error loading source ply ' + cmd.source);
      }
      cb(err, res);
    });
  },
  function (cb) {
    var info = { fullId: cmd.target };
    assetManager.loadAsset(info, function(err, res) {
      if (err) {
        console.error('Error loading target ply ' + cmd.target);
      }
      cb(err, res);
    });
  }
], function (err, srcAndTgtModelInsts) {
  if (!err) {
    projectAnnotations(srcAndTgtModelInsts[0], srcAndTgtModelInsts[1], cmd.output_dir, function (err, res) {
      if (err) {
        console.error('Error projecting annotations', err);
      }
      console.log('DONE!');
    });
  }
});
