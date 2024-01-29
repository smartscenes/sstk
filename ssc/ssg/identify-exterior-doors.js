#!/usr/bin/env node

var fs = require('fs');
var STK = require('../stk-ssc');
var THREE = global.THREE;
var cmd = require('../ssc-parseargs');
var processAssetsHelper = require('../ssc-process-assets');
var _ = STK.util;

cmd
  .version('0.0.1')
  .description('Identify exterior doors')
  .option('--input <filename|id>', 'Input path')
  .option('--input_format <format>', 'Input file format to use')
  .option('--inputType <type>', 'Input type (id or path)',  /^(id|path)$/, 'id')
  .option('--output_dir <dir>', 'Base directory for output files', '.')
  .option('--render_dir <dir>', 'Directory to place renderings of what the attachment region objects look like (no renderings if not specified)')
  .option('--show_ceiling [flag]', 'Whether to show ceiling or not', STK.util.cmd.parseBoolean, false)
  .option('--view_doors [flag]', 'Whether to save views of each door', STK.util.cmd.parseBoolean, false)
  // .option('--width <width>', 'Image width [default: 1000]', STK.util.cmd.parseInt, 1000)
  // .option('--height <height>', 'Image height [default: 1000]', STK.util.cmd.parseInt, 1000)
  .option('--use_search_controller [flag]', 'Whether to lookup asset information online', STK.util.cmd.parseBoolean, false)
  .optionGroups(['config_file', 'render_options'])
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
  autoAlignModels: false, autoScaleModels: false, assetCacheSize: 100,
  searchController: useSearchController? new STK.search.BasicSearchController() : null
});
var assetSources = cmd.getAssetSources(cmd.inputType, files, cmd.assetGroups);
if (assetSources) {
  STK.assets.registerAssetGroupsSync({ assetSources: assetSources });
}
cmd.material_type = cmd.material_type || 'phong';
if (cmd.material_type) {
  STK.materials.Materials.setDefaultMaterialType(cmd.material_type, cmd.material_type);
}

var rendererOptions = cmd.getRendererOptions(cmd);
var renderer = cmd.render_dir? new STK.PNGRenderer(rendererOptions) : null;

function renderDebug(basename, asset, exteriorDoors, callback) {
  var cameraControls = STK.gfx.SceneSetupHelper.createCameraControls(renderer, { width: cmd.width, height: cmd.height});
  var scene = asset.fullScene;
  var lighting_options =  _.mapKeys(
      _.pick(cmd, ['use_directional_lights', 'lights', 'use_physical_lights', 'use_lights']),
      function(v,k) { return _.camelCase(k); });
  STK.gfx.SceneSetupHelper.setupLights(scene, cameraControls.camera, lighting_options);

  asset.setVisible(
    cmd.show_ceiling,
    function (node) {
      return node.userData.type === 'Ceiling';
    }
  );

  // color doors
  for (var i = 0; i < exteriorDoors.length; i++) {
    var door = exteriorDoors[i];
    var obj = door.object3D;
    obj.userData.isSelected = true;
    asset.selectedObjects.push(obj);

    var mat = STK.geo.Object3DUtil.getSimpleFalseColorMaterial(i+1);
    STK.geo.Object3DUtil.setMaterial(obj, mat, STK.geo.Object3DUtil.MaterialsAll, true,
      function (node) {
        return !node.userData.isHidden;  // don't set material for hidden objects
    });
  }

  var sceneBBox = STK.geo.Object3DUtil.getBoundingBox(asset.fullScene);
  cameraControls.viewTarget({ targetBBox: sceneBBox, viewIndex: 4 });
  renderer.renderToPng(scene, cameraControls.camera, basename + '.doors.png', {});

  var renderDoorViews = cmd.view_doors;
  if (renderDoorViews) {
    var viewOptimzer = new STK.gfx.ViewOptimizer({
      cameraControls: cameraControls,
      maxWidth: 300, maxHeight: 300,
      width: renderer.width,
      height: renderer.height
    });

    for (var i = 0; i < exteriorDoors.length; i++) {
      var door = exteriorDoors[i];
      var doorId = door.object3D.userData.id;
      console.log('render door ' + doorId);

      // view door
      var cameraOpts = viewOptimzer.lookAt(asset, door.object3D);
      cameraControls.viewTarget(cameraOpts);
      renderer.renderToPng(scene, cameraControls.camera, basename + '.door-' + doorId + '.png', {});
    }
  }
  callback();
}

function processAsset(asset, opts, cb) {
  console.log('identifyExteriorDoors');
  console.time('identifyExteriorDoors');
  var exteriorDoors = STK.scene.SceneUtil.identifyExteriorDoors(asset, {});
  console.timeEnd('identifyExteriorDoors');
  var output = {
    id: asset.info.fullId,
    exteriorDoorIds: exteriorDoors.map(d => d.object3D.userData.id)
  };
  var outfilename = opts.basename + '.exteriorDoors.json';
  fs.writeFileSync(outfilename, JSON.stringify(output));

  if (renderer) {
    var renderOutput = opts.basename.replace(cmd.output_dir, cmd.render_dir);
    STK.gfx.SceneSetupHelper.getEnvMap(renderer, cmd.envmap).then(( { envMap } ) => {
      asset.fullScene.environment = envMap;
      renderDebug(renderOutput, asset, exteriorDoors, cb);
    });
  } else {
    cb();
  }
}

processAssetsHelper.processAssets(cmd, files, assetManager, processAsset);