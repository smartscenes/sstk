#!/usr/bin/env node

/* jshint esversion: 6 */
const VERSION = '0.0.1';
const STK = require('../stk-ssc');
const shell = require('shelljs');
const path = require('path');
const cmd = require('../ssc-parseargs');
cmd
  .version(VERSION)
  .description('Export parts as GLTF for articulations')
  .option('--id <id>', 'Model id [default: rpmnet.Balance_01', 'rpmnet.Balance_01')
  .option('--output <filename>', 'Output filename')
  .option('--include_connectivity [flag]', 'Whether to export part connectivity', STK.util.cmd.parseBoolean, true)
  .option('--include_articulations [flag]', 'Whether to export articulations', STK.util.cmd.parseBoolean, true)
  .option('--embed_images [flag]', 'Whether to embed images', STK.util.cmd.parseBoolean, true)
  .option('--binary [flag]', 'Whether to save to binary gltf', STK.util.cmd.parseBoolean, true)
  .parse(process.argv);

const PartsLoader = STK.articulations.PartsLoader;

function createObject3D(modelId, parts) {
  const object3D = new THREE.Group();
  for (let part of parts) {
    if (part) {
      object3D.add(part.object3D);
    }
  }

  // const assetInfo = assetManager.getLoadModelInfo(null, modelId);
  // if (assetInfo != null) {
  //   const front = STK.assets.AssetGroups.getDefaultFront(assetInfo);
  //   const up = STK.assets.AssetGroups.getDefaultUp(assetInfo);
  //   STK.geo.Object3DUtil.alignToUpFrontAxes(object3D, up, front, STK.Constants.worldUp, STK.Constants.worldFront);
  // }

  return object3D;
}

const useSearchController = STK.Constants.baseUrl.startsWith('http://') || STK.Constants.baseUrl.startsWith('https://');
const assetManager = new STK.assets.AssetManager({
  autoScaleModels: false,
  autoAlignModels: false,
  supportArticulated: true,
  useSearchController: useSearchController? new STK.search.BasicSearchController() : null });
const exporter = new STK.exporters.GLTFExporter({ fs: STK.fs });

function exportParts(modelId, partData, outputFilename, options, callback) {
  const outputDir = path.dirname(outputFilename);
  shell.mkdir('-p', outputDir);
  console.log(`Exporting object with ${partData.parts.length} parts`);
  const object3D = createObject3D(modelId, partData.parts);
  const scene = new THREE.Scene();
  scene.userData.id = modelId;
  scene.add(object3D);
  if (options.include_connectivity) {
    scene.userData.partsConnectivity = partData.connectivityGraph.toJson();
  }
  if (options.include_articulations) {
    scene.userData.articulations = partData.articulations;
  }

  const exportOpts = {
    dir: outputDir,
    name: path.basename(outputFilename),
    binary: options.binary,
    embedImages: options.embed_images,
    callback: callback
  };
  exporter.export(scene, exportOpts);
}

function exportWithFullId(modelId, output_filename, options) {
  const source = modelId.split('.')[0];
  STK.assets.registerAssetGroupsSync({ assetSources: [source] });
  const partsLoader = new PartsLoader({assetManager: assetManager });
  const taskQueue = new STK.TaskQueue();
  partsLoader.lookupPartsInfo(modelId, 'articulation-parts', (err, partsInfo) => {
    if (err) {
      console.error('Error locating articulation-parts for ' + modelId, err);
    } else {
      partsLoader.loadPartsWithConnectivityGraph(modelId, partsInfo, { discardHierarchy: true },function(err, partData) {
        if (err) {
          console.error(`Error loading parts fullId=${modelId}`, err);
        } else {
          taskQueue.push(STK.util.waitImagesLoaded);
          if (options.include_articulations) {
            taskQueue.push((cb) => {
              partsLoader.lookupPartsInfo(modelId, 'articulations', (err, artsInfo) => {
                if (artsInfo) {
                  STK.util.getJSON(artsInfo['files']['articulations'], (err2, articulations) => {
                    partData.articulations = articulations;
                    cb();
                  });
                } else {
                  cb();
                }
              });
            })
          }
          taskQueue.awaitAll(() =>
            exportParts(modelId, partData, output_filename, options, () => {
              console.log('Parts for ' + modelId + ' exported');
            }));
        }
      });
    }
  });
}

if (cmd.output != null) {
  exportWithFullId(cmd.id, cmd.output, cmd);
} else {
  console.error("Please specify --output");
}
