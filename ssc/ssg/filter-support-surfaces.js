#!/usr/bin/env node

const fs = require('fs');
const STK = require('../stk-ssc');
const THREE = global.THREE;
const cmd = require('../ssc-parseargs');
const processAssetsHelper = require('../ssc-process-assets');
const _ = STK.util;

cmd
  .version('0.0.1')
  .description('Filter support surfaces')
  .option('--input <filename|id>', 'Input path')
  .option('--input_format <format>', 'Input file format to use')
  .option('--inputType <type>', 'Input type (id or path)',  /^(id|path)$/, 'id')
  .option('--filter <type>', 'Filter type (external, up)',  _.parseList)
  .option('--output_dir <dir>', 'Base directory for output files', '.')
  .option('--output_format <format>', 'Output format', /^(gltf|glb|ply)$/, 'ply')
  .option('--render_dir <dir>', 'Directory to place renderings of what the attachment region objects look like (no renderings if not specified)')
  .option('--width <width>', 'Image width [default: 1000]', STK.util.cmd.parseInt, 1000)
  .option('--height <height>', 'Image height [default: 1000]', STK.util.cmd.parseInt, 1000)
  .option('--max_vertices <num>', 'Maximum number of vertices [default: none]', STK.util.cmd.parseInt)
  .option('--min_length <num>', 'Minimum dimension size [default: none]', STK.util.cmd.parseFloat)
  .option('--use_search_controller [flag]', 'Whether to lookup asset information online', STK.util.cmd.parseBoolean, false)
  .parse(process.argv);

// Parse arguments and initialize globals
if (!cmd.input) {
  console.error('Please specify --input <filename|id>');
  process.exit(-1);
}
const files = cmd.getInputs(cmd.input);
// Need to have search controller before registering assets
const useSearchController = cmd.use_search_controller;
STK.Constants.setVirtualUnit(1);
const assetManager = new STK.assets.AssetManager({
  autoAlignModels: true, autoScaleModels: true, assetCacheSize: 100,
  searchController: useSearchController? new STK.search.BasicSearchController() : null
});
const assetSources = cmd.getAssetSources(cmd.inputType, files, cmd.assetGroups);
if (assetSources) {
  STK.assets.registerAssetGroupsSync({ assetSources: assetSources });
}

const renderer = cmd.render_dir? new STK.PNGRenderer({
  width: cmd.width,
  height: cmd.height,
  compress: cmd.compress_png,
  skip_existing: cmd.skip_existing,
  reuseBuffers: true
}) : null;

function setView(cameraControls, object3D) {
  const bbox = STK.geo.Object3DUtil.getBoundingBox(object3D, true);
  cameraControls.viewTarget({
    targetBBox: bbox, distanceScale: 1.5,
    phi: -Math.PI / 4,
    theta: Math.PI / 6,
  });
}

function renderDebug(basename, asset, supportSurfaces, callback) {
  const cameraControls = STK.gfx.SceneSetupHelper.createCameraControls(renderer, { width: cmd.width, height: cmd.height});
  const scene = STK.gfx.SceneSetupHelper.createScene(cameraControls.camera, {});

  // Render asset
  STK.geo.Object3DUtil.setMaterial(asset.object3D, STK.geo.Object3DUtil.ClearMat);
  // STK.geo.Object3DUtil.setOpacity(asset.object3D, 0.5);
  scene.add(asset.object3D);

  if (supportSurfaces) {
    const up = asset.model.getUp();
    const front = asset.model.getFront();
    // console.log('upfront', up, front);
    const group = new THREE.Group('SupportSurfaces');
    STK.geo.Object3DUtil.alignToUpFrontAxes(group, up, front, STK.Constants.worldUp, STK.Constants.worldFront);
    for (let supportSurface of supportSurfaces) {
      if (supportSurface.vizNode) {
        group.add(supportSurface.vizNode);
      }
    }

    scene.add(group);
    scene.updateMatrixWorld();
    setView(cameraControls, scene);
    renderer.renderToPng(scene, cameraControls.camera, basename + '.filteredSupportSurface.png', {});
    //fs.writeFileSync(basename + '.supportSurface.three.json', JSON.stringify(scene.toJSON()));
    callback();
  } else {
    callback();
  }
}

function getExporter(format) {
  if (format == null) {
    format = 'ply';
  }
  const exportOpts = {};
  let exporter = null;
  if (format === 'ply') {
    exporter = new STK.exporters.PLYExporter({ fs: STK.fs });
  } else if (format === 'glb' || format === 'gltf') {
    exporter = new STK.exporters.GLTFExporter({ fs: STK.fs });
    exportOpts.binary = format === 'glb';
    exportOpts.embedImages = true;
  } else {
    console.error('Unsupported export format', format);
    return;
  }
  return { exporter: exporter, exportOpts: exportOpts };
}

function exportSupportSurfaces(asset, supportSurfaces, opts) {
  const worldToModel = asset.getWorldToOriginalModel();
  const exporterWithOpts = getExporter(opts.format);
  const exporter = exporterWithOpts.exporter;
  const callback = opts.callback;
  const exportOpts = _.merge(exporterWithOpts.exportOpts, {
    name: opts.basename + '.filteredSupportSurface',
//    transform: worldToModel,
    callback: () => { callback(); }
  });
  const group = new THREE.Group();
  for (let surface of supportSurfaces) {
    const mat = STK.materials.Materials.getSimpleFalseColorMaterial(1, null, STK.Colors.palettes.d3_unknown_category18, THREE.FrontSide);
    const segMesh = surface.meshSeg.toMesh(surface.meshSeg.mesh.matrixWorld);
    const surfaceInfo = surface.toJSONNoSamples();
    segMesh.userData = {
      surfaceIndex: surfaceInfo.index,
      area: surfaceInfo.area,
      modelNormal: surfaceInfo.modelNormal,
      modelObb: surfaceInfo.modelObb,
      isVertical: surfaceInfo.isVertical,
      isHorizontal: surfaceInfo.isHorizontal,
      isInterior: surfaceInfo.isInterior
    };
    segMesh.applyMatrix4(worldToModel);
    segMesh.material = mat;
    surface.vizNode = segMesh;
    group.add(segMesh);
  }
  exporter.export(group, exportOpts);
}

function filterSupportSurfaces(object3D, supportSurfaces, filters, opts) {
  let filteredSupportSurfaces = supportSurfaces;
  for (let filter of filters) {
    const nsurfaces = filteredSupportSurfaces.length;
    if (filter === 'up') {
      console.log('filtering for upward facing surfaces');
      filteredSupportSurfaces = filteredSupportSurfaces.filter(x => x.isUpwardFacing());
    } else if (filter === 'visible') {
      console.log('filtering for visible surfaces');
      STK.model.ModelUtil.populateSurfaceVisibility(object3D, filteredSupportSurfaces);
      filteredSupportSurfaces = filteredSupportSurfaces.filter(x => x.visibility > 0.2);
    } else if (filter === 'exterior') {
      console.log('filtering for exterior surfaces');
      filteredSupportSurfaces = filteredSupportSurfaces.filter(x => !x.json.isInterior);
    }
    console.log(`after filter ${filter}: got ${filteredSupportSurfaces.length} from ${nsurfaces}`);
  }
  if (opts.min_length) {
    const nsurfaces = filteredSupportSurfaces.length;
    console.log('filtering for minimum dimension length', opts.min_length);
    filteredSupportSurfaces = filteredSupportSurfaces.filter(x => {
      const otherAxesLengths = x.obb.dimensions().toArray().filter((v,i) => i !== x.obb.minDimAxisIndex());
      //console.log(otherAxesLengths, Math.min(...otherAxesLengths));
      return Math.min(...otherAxesLengths) > opts.min_length;
    });
    console.log(`after filter min_length: got ${filteredSupportSurfaces.length} from ${nsurfaces}`);
  }
  return filteredSupportSurfaces;
}
function processAsset(asset, opts, cb) {
  asset.object3D.updateMatrixWorld();
  const supportSurfacesInfo = asset.model.info['support-surfaces'];
  const supportSurfacesFile = supportSurfacesInfo.files.json;
  STK.model.ModelUtil.loadSupportSurfaces(asset.object3D, supportSurfacesFile, {
    callback: (err, supportSurfaces) => {
      if (err) {
        console.log('No support surfaces found for ' + asset.model.getFullID());
        cb();
      } else {
        const filteredSupportSurfaces = filterSupportSurfaces(asset.object3D, supportSurfaces, cmd.filter,
          { min_length: cmd.min_length });
        if (filteredSupportSurfaces.length) {
          if (opts.max_vertices) {
            const simplified = STK.model.ModelUtil.simplifySurfaces(filteredSupportSurfaces, { maxVertices: opts.max_vertices} );
            if (simplified && simplified.length) {
              console.log('Surfaces requires simplification: ' + simplified.length);
            }
          }
          exportSupportSurfaces(asset, filteredSupportSurfaces, {
            basename: opts.basename,
            format: cmd.output_format,
            callback: function (err, res) {
              if (renderer) {
                const renderOutput = opts.basename.replace(cmd.output_dir, cmd.render_dir);
                renderDebug(renderOutput, asset, filteredSupportSurfaces, cb);
              } else {
                cb();
              }
            }
          });
        } else {
          console.log('No support surfaces found for ' + asset.model.getFullID());
          cb();
        }
      }
    }
  });
}

processAssetsHelper.processAssets(cmd, files, assetManager, processAsset);