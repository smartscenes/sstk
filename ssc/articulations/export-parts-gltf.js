#!/usr/bin/env node

/* jshint esversion: 6 */
const VERSION = '0.0.1';
const STK = require('../stk-ssc');
const OBBFitter = STK.geo.OBBFitter;
const PartGeomsGen = STK.parts.PartGeomsGen;
const shell = require('shelljs');
const path = require('path');
const cmd = require('../ssc-parseargs');
cmd
  .version(VERSION)
  .description('Export parts as GLTF for articulations')
  .option('--id <id>', 'Model id [default: rpmnet.Balance_01]', 'rpmnet.Balance_01')
  .option('--name [name]', 'Optional scene name (default to id)')
  .option('--output <filename>', 'Output filename')
  .option('--parts_field <name>', 'Field to use for parts',  'articulation-parts')
  .option('--add_geometry [flag]', 'Whether to add interior geometry', STK.util.cmd.parseBoolean, true)
  .option('--infer_geometry [flag]', 'Whether to infer missing geometry', STK.util.cmd.parseBoolean, false)
  .option('--ensure_connectivity [flag]', 'Whether to ensure (compute) part connectivity', STK.util.cmd.parseBoolean, true)
  .option('--include_connectivity [flag]', 'Whether to export part connectivity', STK.util.cmd.parseBoolean, true)
  .option('--include_articulations [flag]', 'Whether to export articulations', STK.util.cmd.parseBoolean, true)
  .option('--embed_images [flag]', 'Whether to embed images', STK.util.cmd.parseBoolean, true)
  .option('--binary [flag]', 'Whether to save to binary gltf', STK.util.cmd.parseBoolean, true)
  .option('--as_scene [flag]', 'Whether to save as scene with hierarchical objects', STK.util.cmd.parseBoolean, true)
  .option('--label_parser <label_parser>', 'Label parser to use (ObjectPartLabelParser)')
  .parse(process.argv);

const PartsLoader = STK.articulations.PartsLoader;
const _ = STK.util;

function createObject3D(name, parts, assetInfo) {
  const object3D = new THREE.Group();
  for (let part of parts) {
    if (part) {
      object3D.add(part.object3D);
    }
  }

  if (assetInfo != null) {
    const front = STK.model.ModelInfo.getFront(assetInfo);
    const up = STK.model.ModelInfo.getUp(assetInfo);
    const unit = STK.model.ModelInfo.getUnit(assetInfo);
    STK.Constants.setVirtualUnit(unit);
    STK.geo.Object3DUtil.alignToUpFrontAxes(object3D, up, front, STK.Constants.worldUp, STK.Constants.worldFront);
  }
  object3D.name = name;
  return object3D;
}

function createScene(name, parts, connectivityGraph, articulations) {
  const articulationsByPid = _.groupBy(articulations, 'pid');
  const scene = STK.articulations.ArticulatedObject.createArticulatedScene(name, connectivityGraph,
    (pid) => articulationsByPid[pid], ['remove']);
  return scene;
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
  let scene;
  const name = (options.name != null)? options.name : modelId;
  if (options.as_scene) {
    scene = createScene(name, partData.parts, partData.connectivityGraph, partData.articulations);
  } else {
    const object3D = createObject3D(name, partData.parts);
    scene = new THREE.Scene();
    scene.userData.id = modelId;
    scene.add(object3D);
    if (options.include_connectivity) {
      scene.userData.partsConnectivity = partData.connectivityGraph.toJson();
    }
    if (options.include_articulations) {
      scene.userData.articulations = partData.articulations;
    }
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

function ensurePartObbs(parts, object3D, obbFitter) {
  object3D.updateMatrixWorld();
  const objectToWorld = object3D.matrixWorld.clone();
  const worldToObject = objectToWorld.clone().invert();
  parts.forEach(part => {
    if (part) {
      if (part.object3D) {
        if (!part.obb) {
          part.obbWorld = obbFitter(part.object3D);
          part.obb = part.obbWorld.clone().applyMatrix4(worldToObject);
        } else {
          part.obbWorld = part.obb.clone().applyMatrix4(objectToWorld);
        }
        object3D.add(part.object3D);
      }
    }
  });
}

/**
 * Generate geometry
 * @param add_missing - add missing geometry
 * @param infer_geometry - if false, use annotated geometry only.  if true, infer missing geometry
 * @param parts
 * @param callback
 */
function generateGeometry(add_missing, infer_geometry, parts, assetInfo, callback) {
  const obbFitter = function(object3D) {
    console.log('fit obb');
    return OBBFitter.fitOBB(object3D, { constrainVertical: true });
  };
  if (add_missing) {
    const shapeGenerator = PartGeomsGen.getShapeGenerator();
    const object3D = createObject3D('object3d', parts, assetInfo);
    ensurePartObbs(parts, object3D, obbFitter);
    if (infer_geometry) {
      PartGeomsGen.generateDefaultGeometries(shapeGenerator, object3D, parts, callback);
    } else {
      PartGeomsGen.generateGeometries(shapeGenerator, object3D, parts, false, callback);
    }
  } else {
    callback();
  }
}

function exportWithFullId(modelId, output_filename, options) {
  const source = modelId.split('.')[0];
  STK.assets.registerAssetGroupsSync({ assetSources: [source] });
  const partsLoader = new PartsLoader({assetManager: assetManager, labelParser: options.label_parser });
  partsLoader.autocomputeConnectivityGraph = options.ensure_connectivity;
  const taskQueue = new STK.TaskQueue();
  partsLoader.loadPartsWithConnectivityGraphById(modelId,{ partsField: options.parts_field, discardHierarchy: true },
    function(err, partData) {
      if (!partData) {
        console.error(`Error loading parts fullId=${modelId}`, err);
      } else {
        if (err) {
          console.warn(`Warning loading parts fullId=${modelId}`, err);
        }
        taskQueue.push(STK.util.waitImagesLoaded);
        if (options.include_articulations) {
          taskQueue.push((cb) => {
            partsLoader.lookupPartsInfo(modelId, 'articulations', (err, artsInfo) => {
              if (artsInfo) {
                STK.util.getJSON(artsInfo['files']['articulations'], (err2, articulations) => {
                  if (articulations.data) {
                    partData.articulations = articulations.data.articulations;
                    const connectivity = articulations.data.connections || articulations.data.connectivity;
                    if (connectivity) {
                      console.log('using annotated connectivity graph from articulations');
                      const connectivityGraph = new STK.parts.PartConnectivityGraph(connectivity, partData.parts);
                      const reducedConnectivityGraph = connectivityGraph.clone();
                      reducedConnectivityGraph.cutExtraConnectionsFromChildParts(partData.articulations);
                      partData.connectivityGraph = reducedConnectivityGraph;
                    }
                    partData.parts.map((part,i) => {
                      const p = articulations.data.parts[i];
                      if (p) {
                        part.geoms = p.geoms;
                      }
                    });
                  } else {
                    partData.articulations = articulations;
                  }
                  const nArticulations = (partData.articulations)? partData.articulations.length : 0;
                  console.log(`got ${nArticulations} articulations`);
                  cb();
                });
              } else {
                console.log('no articulations');
                cb();
              }
            });
          });
        }
        taskQueue.awaitAll(() => {
          generateGeometry(options.add_geometry, options.infer_geometry, partData.parts, partData.metadata.assetInfo,(err, generated) => {
            exportParts(modelId, partData, output_filename, options, () => {
              console.log('Parts for ' + modelId + ' exported');
            });
          });
        });
      }
    });
}

if (cmd.output != null) {
  exportWithFullId(cmd.id, cmd.output, cmd);
} else {
  console.error("Please specify --output");
}
