#!/usr/bin/env node

const fs = require('fs');
const STK = require('../stk-ssc');
const THREE = global.THREE;
const cmd = require('../ssc-parseargs');
const processAssetsHelper = require('../ssc-process-assets');
const _ = STK.util;

cmd
  .version('0.0.1')
  .description('Identify potentially duplicate model and align to canonical')
  .option('--input <filename>', 'Input path')
  .option('--output_dir <dir>', 'Base directory for output files', '.')
  .option('--align_to_source <source>', 'Source to align to')
  .option('--align_to <modelId>', 'Model id to align to')
  .option('--assetGroups <assetGroups', 'Asset groups', STK.util.parseList)
//  .option('--use_search_controller [flag]', 'Whether to lookup asset information online', STK.util.cmd.parseBoolean, false)
  .parse(process.argv);

cmd.inputType = 'path';
cmd.assetType = 'model';

if (!cmd.input) {
  console.error('Please specify --input <filename|id>');
  process.exit(-1);
}
const files = cmd.getInputs(cmd.input);
const useSearchController = true; //cmd.use_search_controller;
const searchController = useSearchController? new STK.search.BasicSearchController() : null;
STK.Constants.setVirtualUnit(1);
const assetManager = new STK.assets.AssetManager({
  autoAlignModels: true, autoScaleModels: true, assetCacheSize: 100,
  searchController: searchController
});
const assetSources = cmd.getAssetSources(cmd.inputType, files, cmd.assetGroups);
if (assetSources) {
  STK.assets.registerAssetGroupsSync({ assetSources: assetSources });
}

function checkModelAlign(asset, alignToModelId, cb) {
  assetManager.loadModel({ fullId: alignToModelId }, (err, alignToModel) => {
    if (err) {
      console.error('Error loading asset', alignToModelId);
      cb(err, null);
    } else {
      const sourceMesh = STK.geo.GeometryUtil.mergeMeshesWithTransform(asset.object3D);
      const targetMesh = STK.geo.GeometryUtil.mergeMeshesWithTransform(alignToModel.object3D);

      let alignInfo = STK.geo.MeshAligner.alignMeshesSemiExact(sourceMesh, targetMesh, {
        compatibleCheck: {
          checkVerts: false,
          checkFaces: false,
          checkMaterials: true
        }
      });
      if (!alignInfo.isCompatible && alignInfo.message.startsWith('Materials')) {
        alignInfo = STK.geo.MeshAligner.alignMeshesSemiExact(sourceMesh, targetMesh, {
          compatibleCheck: {
            checkVerts: false,
            checkFaces: false,
            checkMaterials: false
          }
        });
      }
      cb(null, alignInfo);
    }
  });
}

function queryAndAlign(asset, opts, cb) {
  const stats = STK.geo.Object3DUtil.getObjectStats(asset.object3D);
  console.log('stats', stats);
  const assetSource = opts.source;
  const maxPercDiff = 0.1;
  const minVerts = Math.floor(stats.nverts * (1-maxPercDiff));
  const maxVerts = Math.ceil(stats.nverts * (1+maxPercDiff));
  const minFaces = Math.floor(stats.nfaces * (1-maxPercDiff));
  const maxFaces = Math.ceil(stats.nfaces * (1+maxPercDiff));
  const category = 'chair';
  const query = [`source:${assetSource}`, `wnhyperlemmas:${category}`,
    `nvertices:[${minVerts} TO ${maxVerts}]`, `nfaces:[${minFaces} TO ${maxFaces}]`].join(' AND ');
  searchController.query({ source: assetSource, query: query},
    (err, results) => {
      if (err) {
        console.error('Error querying for similar models', err);
        cb(err, null);
      } else {
        const candidateObjectInfos = results.response.docs;
        console.log(query, candidateObjectInfos.length);
        const sorted = _.sortBy(candidateObjectInfos, info => {
          return Math.abs(stats.nverts - info.nvertices);
        });
        for (let objectInfo of sorted) {
          console.log(objectInfo.id);
        }
        cb(null);
      }
    });

}

function processAsset(asset, opts, cb) {
  if (cmd.align_to) {
    checkModelAlign(asset, cmd.align_to, cb);
  } else {
    queryAndAlign(asset, cmd, cb);
  }
}

processAssetsHelper.processAssets(cmd, files, assetManager, processAsset);


