#!/usr/bin/env node

/* jshint esversion: 6 */
const VERSION = '0.0.1';
const STK = require('../stk-ssc');
const URDFExporter = STK.exporters.URDFExporter;
const cmd = require('commander');
const process_asset_helper = require("../ssc-process-assets");
cmd
  .version(VERSION)
  .description('Loads an GLTF model with articulations and exports it as an URDF')
  .option('--input <filename>', 'Input GLTF filename')
  .option('--output_dir <dir>', 'Output directory')
  .option('--output_mesh_format <format>', 'Output mesh format', /^(obj|gltf|glb|dae)$/, 'glb')
  .parse(process.argv);

function exportURDF(name, target) {
  const exportOpts = {
    name: name,
    meshFormat: cmd.output_mesh_format,
    meshExportOpts: {
      exportTextures: true                   // For OBJMTL export
    }
  };
  // parameters for creating exporter
  const exporterOpts = {
    fs: STK.fs
  };

  const exporter = new URDFExporter(exporterOpts);
  exporter.export(target, exportOpts);
}

function createAssetManager() {
  //const useSearchController = cmd.use_search_controller;
  const useSearchController = STK.Constants.baseUrl.startsWith('http://') || STK.Constants.baseUrl.startsWith('https://');
  const assetManager = new STK.assets.AssetManager({
    autoAlignModels: cmd.auto_align,
    autoScaleModels: false,
    assetCacheSize: cmd.assetCacheSize,
    enableLights: cmd.use_lights,
    defaultLightState: cmd.use_lights,
    supportArticulated: true, mergeFixedParts: true,
    searchController: useSearchController ? new STK.search.BasicSearchController() : null
  });
  return assetManager;
}

const assetManager = createAssetManager();

function convertAsset() {
  const inputInfo = process_asset_helper.prepareAssetInfo('path', cmd.input,
    {  assetType: 'model', source: cmd.source, inputFormat: cmd.format,
            outputDir: cmd.output_dir, assetsDb: null });
  const assetLoadInfo = inputInfo.loadInfo;
  assetManager.loadModel(assetLoadInfo, (err, mInst) => {
    STK.util.waitImagesLoaded(() => {
      mInst.getArticulatedObjects();
      exportURDF(inputInfo.outputname, mInst.object3D);
    });
  });
}

convertAsset();