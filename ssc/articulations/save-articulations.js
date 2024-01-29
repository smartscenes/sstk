#!/usr/bin/env node
/*
    This saves articulations for an object.
 */

const fs = require('fs');
const shell = require('shelljs');
const STK = require('../stk-ssc');
const cmd = require('../ssc-parseargs');

cmd
  .version('0.0.1')
  .description('Saves articulations of asset by id')
  .option('--id <id>', 'Scene or model id [default: lamp_0061]', 'lamp_0061')
  .option('--source <source>', 'Scene or model source [default: shape2motion]', 'shape2motion')
  .option('--output_dir <dir>', 'Base directory for output files', '.')
  .option('--use_subdir [flag]','Put output into subdirectory per id [false]', STK.util.cmd.parseBoolean, false)
  .parse(process.argv);

function createAssetManager() {
  //const useSearchController = cmd.use_search_controller;
  const useSearchController = STK.Constants.baseUrl.startsWith('http://') || STK.Constants.baseUrl.startsWith('https://');
  const assetManager = new STK.assets.AssetManager({
    autoAlignModels: false,
    autoScaleModels: false,
    supportArticulated: true, mergeFixedParts: false,
    searchController: useSearchController ? new STK.search.BasicSearchController() : null
  });
  return assetManager;
}

const sourceId = STK.assets.AssetManager.toSourceId(cmd.source, cmd.id);
const assetManager = createAssetManager();
STK.assets.registerAssetGroupsSync({ assetSources: [sourceId.source] });

const assetGroup = assetManager.getAssetGroup(sourceId.source);
if (!assetGroup) {
  console.log('Unrecognized asset source ' + sourceId.source);
  return;
}
const supportedAssetTypes = ['model'];
if (supportedAssetTypes.indexOf(assetGroup.type) < 0) {
  console.log('Unsupported asset type ' + assetGroup.type);
  return;
}

function saveArticulationForAssetId(sourceId, callback) {
  const id = sourceId.id;
  const fullId = sourceId.fullId;
  //const source = sourceId.source;

  console.log('Processing ' + id);

  let outputDir = cmd.output_dir;
  if (cmd.use_subdir) {
    outputDir = outputDir + '/' + id;
    if (cmd.skip_existing && shell.test('-d', outputDir)) {
      console.warn('Skipping existing output at: ' + outputDir);
      setTimeout(function () {
        callback();
      });
      return;
    }
  }
  const basename = outputDir + '/' + id;
  shell.mkdir('-p', outputDir);

  if (assetGroup.type === STK.Constants.assetTypeModel) {
    assetManager.getModelInstance(null, fullId, (mInst) => {
        const articulatedObjects = mInst.getArticulatedObjects();
        if (articulatedObjects.length > 0) {
          let iObj = 0;
          for (let artObj of articulatedObjects) {
            const filename = ((articulatedObjects.length > 1)? basename + '-' + iObj : basename) + '.articulations.json';

            const artsJson = artObj.articulations.map(a => a.toJson());
            fs.writeFileSync(filename, JSON.stringify(artsJson));
            console.log('Output written to ' + filename);
            iObj++;
          }
        } else {
          console.log('No articulations for ' + fullId)
        }
    },
    function (error) {
      console.error('Error loading ' + fullId, error);
      callback(error, null);
    });
  }
}

function main() {
  saveArticulationForAssetId(sourceId, () => {});
}

main();