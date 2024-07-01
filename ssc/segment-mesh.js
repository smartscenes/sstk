#!/usr/bin/env node

/* jshint esversion: 6 */
const async = require('async');
const shell = require('shelljs');
const STK = require('./stk-ssc');
const _ = STK.util;
const path = require('path');
const cmd = require('./ssc-parseargs');
const fs = require('fs');
cmd
  .version('0.0.1')
  .description('Segment mesh and stores away the segmentation')
  .option('--input <filename>', 'Input path')
  .option('--input_type <type>', 'Input type (id or path)',  /^(id|path)$/, 'id')
  .option('--format <format>', 'Model format')
  .option('--output_dir <dir>', 'Base directory for output files', '.')
  .option('--segmentator_method <method>', 'Segmentation method', /^(connectivity|clustering|fwab-vert|fwab-tri)$/)
  .option('--segmentator_format <format>', 'Segmentation format', /^(trimesh|triIndexToSeg)$/)
  .option('--skip_existing', 'Whether to skip output of existing files', STK.util.cmd.parseBoolean, false)
  .optionGroups(['config_file'])
  .parse(process.argv);

// segmentation parameters (specify via config file, segmentator field)
//  adjFaceNormSimThreshold
//  restrictToPlanarSurfaces (used for clustering based segmentation)
//  segMinVerts (used for fwab segmentation)
//  colorWeight (used for fwab segmentation)
//  ignoreMeshGroups (don't restrict segmentation to within meshes)

// Parse arguments and initialize globals
if (!cmd.input) {
  console.error('Please specify --input <filename>');
  process.exit(-1);
}
STK.materials.Materials.setDefaultMaterialType('phong');

const files = cmd.getInputs(cmd.input);

// Need to have search controller before registering assets
const useSearchController = cmd.use_search_controller;
const assetManager = new STK.assets.AssetManager({
  autoAlignModels: cmd.auto_align, autoScaleModels: false, assetCacheSize: 10,
  useColladaScale: false, convertUpAxis: false,
  searchController: useSearchController? new STK.search.BasicSearchController() : null
});

const assetSources = cmd.getAssetSources(cmd.input_type, files, cmd.assetGroups);
if (assetSources) {
  STK.assets.registerAssetGroupsSync({ assetSources: assetSources });
}
if (cmd.format) {
  STK.assets.AssetGroups.setDefaultFormat(cmd.format);
}

const segOpts = _.defaults(Object.create(null), {
    method: cmd.segmentator_method,
    format: cmd.segmentator_format
  },
  cmd.segmentator || {},
  {
    method: 'connectivity',
    format: 'trimesh',
    condenseFaceIndices: true
  }
);

function segmentObject(modelObject3D, opts, callbacks) {
  opts = opts || {};
  const segmentator = new STK.geo.ObjectSegmentator();
  opts.kthr = opts.adjFaceNormSimThreshold;  // TODO(MS): Unhack
  console.log('segmentModel with opts:', opts);
  // if (opts.createSegmented) {
  //   let cloned = modelObject3D.clone();
  //   cloned = segmentator.segmentObject(cloned, opts);
  //   callbacks.onSegmented(cloned);
  // } else {
    let segmentation = segmentator.getSegmentation(modelObject3D, opts);
    callbacks.onSegmented(segmentation);
  //}
}

function processInputs(inputs, assetsDb) {
  async.forEachSeries(inputs, function (name, callback) {
    STK.util.clearCache();

    let outputDir = cmd.output_dir;
    let outname;
    let basename;
    let metadata;
    let info;

    if (cmd.input_type === 'id') {
      const sid = STK.assets.AssetManager.toSourceId(cmd.source, name);
      outname = sid.id;
      basename = outputDir + '/' + outname;
      info = {fullId: sid.fullId, format: cmd.format};
      metadata = assetsDb? assetsDb.getAssetInfo(sid.fullId) : null;
    } else {
      const file = name;
      const split = path.basename(file).split('.');
      outname = split[0];
      basename = outputDir + '/' + outname;
      info = {file: file, format: cmd.format, assetType: 'model', defaultMaterialType: THREE.MeshPhongMaterial};
    }
    console.log('Output to ' + basename);
    shell.mkdir('-p', outputDir);

    console.log('try load model ', info);
    assetManager.loadModel(info, function (err, mInst) {
      if (err) {
        console.error('Error loading', info, err);
        callback(err);
      } else {
        console.log('Loaded ' + name);
        //console.log('info', mInst.model.info, mInst.model.getUp(), mInst.model.getFront());
        function onDrained() {
          console.log('Segmenting object');
          const object3D = mInst.getObject3D("ModelInstance");
          segmentObject(object3D, segOpts, {
            onSegmented: (segmentation) => {
              // segmentation is grouped by meshIndex so let's flatten and add segIndex
              const segments = _.flatten(segmentation);
              for (let i = 0; i < segments.length; i++) {
                segments[i].segIndex = i;
              }
              const result = {
                modelId: info.fullId,
                path: info.file,
                metadata: segOpts,
                segmentation: segments
              };
              fs.writeFileSync(basename + '.' + segOpts.method + '.segs.json', JSON.stringify(result));
              callback();
            }
          });
        }
        STK.util.waitImagesLoaded(onDrained);
      }
    }, metadata);
  }, function (err, results) {
    console.log('DONE');
  });
}

processInputs(files);