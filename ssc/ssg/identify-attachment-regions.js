#!/usr/bin/env node

var fs = require('fs');
var STK = require('../stk-ssc');
var THREE = global.THREE;
var cmd = require('../ssc-parseargs');
var processAssetsHelper = require('../ssc-process-assets');
var _ = STK.util;

cmd
  .version('0.0.1')
  .description('Identify attachment regions')
  .option('--input <filename|id>', 'Input path')
  .option('--input_format <format>', 'Input file format to use')
  .option('--inputType <type>', 'Input type (id or path)',  /^(id|path)$/, 'id')
  .option('--output_dir <dir>', 'Base directory for output files', '.')
  .option('--render_dir <dir>', 'Directory to place renderings of what the attachment region objects look like (no renderings if not specified)')
  .option('--width <width>', 'Image width [default: 1000]', STK.util.cmd.parseInt, 1000)
  .option('--height <height>', 'Image height [default: 1000]', STK.util.cmd.parseInt, 1000)
  .option('--use_search_controller [flag]', 'Whether to lookup asset information online', STK.util.cmd.parseBoolean, false)
  .parse(process.argv);

STK.Constants.setVirtualUnit(1);  // set to meters

// Parse arguments and initialize globals
if (!cmd.input) {
  console.error('Please specify --input <filename|id>');
  process.exit(-1);
}
var files = cmd.getInputs(cmd.input);
// Need to have search controller before registering assets
var useSearchController = cmd.use_search_controller;
var assetManager = new STK.assets.AssetManager({
  autoAlignModels: true, autoScaleModels: false, assetCacheSize: 100,
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

function renderDebug(basename, asset, attachments, callback) {
  var cameraControls = STK.gfx.SceneSetupHelper.createCameraControls(renderer, { width: cmd.width, height: cmd.height});
  var scene = STK.gfx.SceneSetupHelper.createScene(cameraControls.camera, {});

  // Render asset
  scene.add(asset.object3D);

  if (attachments) {
    var up = asset.model.getUp();
    var front = asset.model.getFront();
    console.log('upfront', up, front);
    var group = new THREE.Group();
    STK.geo.Object3DUtil.alignToUpFrontAxes(group, up, front, STK.Constants.worldUp, STK.Constants.worldFront);
    for (let attachment of attachments) {
      group.add(attachment.vizNode);
    }

    scene.add(group);
    scene.updateMatrixWorld();
    setView(cameraControls, scene);
    renderer.renderToPng(scene, cameraControls.camera, basename + '.attachment.png', {});
  }
  callback();
}

function processAsset(asset, opts, cb) {
  var includeVizNode = cmd.render_dir != null;
  asset.object3D.updateMatrixWorld();
  var supportOpts = {
    support: asset.model.info.support,
    transform: asset.getWorldToOriginalModel()
  };
  var attachments = STK.model.ModelUtil.identifyObjectAttachments(asset.object3D, supportOpts, includeVizNode);
  var output = {
    id: asset.model.getFullID(),
    bbox: STK.geo.Object3DUtil.getBoundingBox(asset.object3D).toJSON()
  };
  if (attachments.length > 0) {
    output.attachments = attachments.map(x => _.omit(x, ['vizNode', 'attachment.points']));

    var outfilename = opts.basename + '.attachment.json';
    fs.writeFileSync(outfilename, JSON.stringify(output));

    if (renderer) {
      var renderOutput = opts.basename.replace(cmd.output_dir, cmd.render_dir);
      renderDebug(renderOutput, asset, attachments, cb);
    } else {
      cb();
    }
  } else {
    cb();
  }
}

processAssetsHelper.processAssets(cmd, files, assetManager, processAsset);