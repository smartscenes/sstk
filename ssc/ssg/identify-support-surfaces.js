#!/usr/bin/env node

var fs = require('fs');
var STK = require('../stk-ssc');
var THREE = global.THREE;
var cmd = require('../ssc-parseargs');
var processAssetsHelper = require('../ssc-process-assets');
var _ = STK.util;

cmd
  .version('0.0.1')
  .description('Identify support surfaces')
  .option('--input <filename|id>', 'Input path')
  .option('--input_format <format>', 'Input file format to use')
  .option('--inputType <type>', 'Input type (id or path)',  /^(id|path)$/, 'id')
  .option('--output_dir <dir>', 'Base directory for output files', '.')
  .option('--render_dir <dir>', 'Directory to place renderings of what the attachment region objects look like (no renderings if not specified)')
  .option('--width <width>', 'Image width [default: 1000]', STK.util.cmd.parseInt, 1000)
  .option('--height <height>', 'Image height [default: 1000]', STK.util.cmd.parseInt, 1000)
  .option('--use_search_controller [flag]', 'Whether to lookup asset information online', STK.util.cmd.parseBoolean, false)
  .parse(process.argv);

// Parse arguments and initialize globals
if (!cmd.input) {
  console.error('Please specify --input <filename|id>');
  process.exit(-1);
}
var files = cmd.getInputs(cmd.input);
// Need to have search controller before registering assets
var useSearchController = cmd.use_search_controller;
STK.Constants.setVirtualUnit(1);
var assetManager = new STK.assets.AssetManager({
  autoAlignModels: true, autoScaleModels: true, assetCacheSize: 100,
  searchController: useSearchController? new STK.search.BasicSearchController() : null
});
var assetSources = cmd.getAssetSources(cmd.inputType, files, cmd.assetGroups);
if (assetSources) {
  STK.assets.registerAssetGroupsSync({ assetSources: assetSources });
}

var renderer = cmd.render_dir? new STK.PNGRenderer({
  width: cmd.width,
  height: cmd.height,
  compress: cmd.compress_png,
  skip_existing: cmd.skip_existing,
  reuseBuffers: true
}) : null;

function setView(cameraControls, object3D) {
  var bbox = STK.geo.Object3DUtil.getBoundingBox(object3D, true);
  cameraControls.viewTarget({
    targetBBox: bbox, distanceScale: 1.5,
    phi: -Math.PI / 4,
    theta: Math.PI / 6,
  });
}

function renderDebug(basename, asset, supportSurfaces, callback) {
  var cameraControls = STK.gfx.SceneSetupHelper.createCameraControls(renderer, { width: cmd.width, height: cmd.height});
  var scene = STK.gfx.SceneSetupHelper.createScene(cameraControls.camera, {});
  var exporter = new STK.exporters.GLTFExporter({ fs: STK.fs });
  var exportOpts = {
    name: basename + '.supportSurface',
    binary: true,
    callback: () => { callback(); }
  };

  // Render asset
  STK.geo.Object3DUtil.setMaterial(asset.object3D, STK.geo.Object3DUtil.ClearMat);
  // STK.geo.Object3DUtil.setOpacity(asset.object3D, 0.5);
  scene.add(asset.object3D);

  if (supportSurfaces) {
    var up = asset.model.getUp();
    var front = asset.model.getFront();
    console.log('upfront', up, front);
    var group = new THREE.Group('SupportSurfaces');
    STK.geo.Object3DUtil.alignToUpFrontAxes(group, up, front, STK.Constants.worldUp, STK.Constants.worldFront);
    for (let supportSurface of supportSurfaces) {
      if (supportSurface.vizNode) {
        group.add(supportSurface.vizNode);
      }
    }

    scene.add(group);
    scene.updateMatrixWorld();
    setView(cameraControls, scene);
    renderer.renderToPng(scene, cameraControls.camera, basename + '.supportSurface.png', {});
    //fs.writeFileSync(basename + '.supportSurface.three.json', JSON.stringify(scene.toJSON()));
    exporter.export(scene, { name: basename + '.supportSurface.viz', binary: true });
    exporter.export(group, exportOpts);
  } else {
    callback();
  }
}

function processAsset(asset, opts, cb) {
  var includeVizNode = cmd.render_dir != null;
  asset.object3D.updateMatrixWorld();
  var worldToModel = asset.getWorldToOriginalModel();
  var supportSurfaces = STK.model.ModelUtil.identifySupportSurfaces(asset.object3D, {}, includeVizNode);
  var output = {
    id: asset.model.getFullID(),
    modelToWorld: asset.getOriginalModelToWorld().toArray(),
    bbox: STK.geo.Object3DUtil.getBoundingBox(asset.object3D, true).toJSON(),
    modelbbox: STK.geo.Object3DUtil.computeBoundingBoxLocal(asset.object3D).toJSON()
  };
  if (supportSurfaces.length > 0) {
    output.supportSurfaces = supportSurfaces.map(s => s.toJSON());
    for (var i = 0; i < supportSurfaces.length; i++) {
      var supportSurface = supportSurfaces[i];
      if (supportSurface.vizNode) {
        supportSurface.vizNode.applyMatrix4(worldToModel);
      }
    }

    var outfilename = opts.basename + '.supportSurface.json';
    fs.writeFileSync(outfilename, JSON.stringify(output));

    if (renderer) {
      var renderOutput = opts.basename.replace(cmd.output_dir, cmd.render_dir);
      renderDebug(renderOutput, asset, supportSurfaces, cb);
    } else {
      cb();
    }
  } else {
    console.log('No support surfaces found for ' + asset.model.getFullID());
    cb();
  }
}

processAssetsHelper.processAssets(cmd, files, assetManager, processAsset);