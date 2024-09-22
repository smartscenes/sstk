#!/usr/bin/env node
/*
    This renders articulations for an object. 
    The following example command can be run from the ssc folder
    NODE_BASE_URL=http://localhost:8010/articulations/ ./render-articulations.js 
      --input shape2motion.lamp_0061 --input_type id
      --use_subdir --output_dir ./
      --static_color neutral --moving_part_color highlight --show_axis_radar
      --background_color lightgrey --framerate 40
 */

const STK = require('../stk-ssc');
const _ = STK.util;
const cmd = require('../ssc-parseargs');
const processAssetsHelper = require('../ssc-process-assets');
const THREE = global.THREE;
const ArticulationsRenderHelper = STK.articulations.ArticulationsRenderHelper;

cmd
  .version('0.0.1')
  .description('Renders articulations for asset by id or path')
  .option('--input <filename>', 'Input path', 'shape2motion.lamp_0061')
  .option('--inputType <type>', 'Input type (id or path)',  /^(id|path)$/, 'id')
  .option('--format <format>', 'Asset format')
  .option('--output_dir <dir>', 'Base directory for output files', '.')
  .option('--use_subdir [flag]','Put output into subdirectory per id [false]', STK.util.cmd.parseBoolean, false)
  .optionGroups(['config_file', 'render_options', 'render_views', 'asset_cache'])
  .option('--skip_existing', 'Skip rendering existing images [false]')
  .option('--auto_align [flag]', 'Whether to auto align asset', STK.util.cmd.parseBoolean, false)
  .option('--heapdump <num>', 'Number of times to dump the heap (for memory debugging)', STK.util.cmd.parseInt, 0)
  .option('--material_type <material_type>')
  .option('--material_side <material_side>')
  .option('--iterations <num>', 'Number of iterations to use for each articulation', STK.util.cmd.parseInt, 20)
  .option('--static_color <name>', 'What color to use for static node (original, neutral, or specified color)', 'original')
  .option('--base_part_color <name>', 'Color name for the base part, eg, grey or skyblue', 'original')
  .option('--moving_part_color <name>', 'What color to use for main moving part (original, neutral, highlight, faded_highlight or specified color)', 'original')
  .option('--attached_moving_part_color <name>', 'What color to use for attached moving parts (original, neutral, highlight, faded_highlight or specified color)', 'original')
  .option('--background_color <name>', 'Color name for the scene background, eg, grey or skyblue', 'lightgrey')
  .option('--static_opacity <amount>', 'Amount of opacity to have for the non-moving parts (from 0 to 1)')
  .option('--tilt <tilt>', 'Default tilt (from horizontal) in degrees [20]', STK.util.cmd.parseInt, 30)
  .option('--show_axis_radar [flag]', 'Whether to display axis and radar for the articulated parts', STK.util.cmd.parseBoolean)
  .option('--combine_all [flag]', 'Whether to combine all generated gif into one final gif', STK.util.cmd.parseBoolean)
  .option('--clear_pngs [flag]', 'Whether to remove generated pngs', STK.util.cmd.parseBoolean)
  .option('--video_format <format>', 'Format for output videos', 'gif')
  .parse(process.argv);

if (!cmd.input) {
  console.error('Please specify --input <filename>');
  process.exit(-1);
}
const inputs = cmd.getInputs(cmd.input);
cmd.assetType = 'model';

const msg = cmd.checkImageSize(cmd);
if (msg) {
  console.error(msg);
  process.exit(-1);
}

// Parse arguments and initialize globals
STK.Constants.setVirtualUnit(1);  // set to meters
cmd.material_type = cmd.material_type || 'phong';
if (cmd.material_type) {
  STK.materials.Materials.setDefaultMaterialType(cmd.material_type, cmd.material_type);
}
if (cmd.material_side) {
  STK.materials.Materials.DefaultMaterialSide = STK.materials.Materials.getMaterialSide(cmd.material_side, STK.materials.Materials.DefaultMaterialSide);
}

function createRenderer() {
  const rendererOptions = cmd.getRendererOptions(cmd);
  return new STK.PNGRenderer(rendererOptions);
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
    supportArticulated: true, mergeFixedParts: false,
    searchController: useSearchController ? new STK.search.BasicSearchController() : null
  });
  return assetManager;
}

function createCameraControls(renderer) {
  const cameraConfig = _.defaults(Object.create(null), cmd.camera || {}, {
    type: 'perspective',
    fov: 50,
    near: 0.1*STK.Constants.metersToVirtualUnit,
    far: 400*STK.Constants.metersToVirtualUnit
  });
  const camera = STK.gfx.Camera.fromJson(cameraConfig, cmd.width, cmd.height);
  const cameraControls = new STK.controls.CameraControls({
    camera: camera,
    container: renderer.canvas,
    controlType: 'none',
    cameraPositionStrategy: 'positionByCentroid' //'positionByCentroid'
  });
  return cameraControls;
}

function createScene(camera) {
  const scene = new THREE.Scene();
  scene.add(camera);
  if (cmd.use_directional_lights) {
    STK.gfx.Lights.addSimple2LightSetup(camera, new THREE.Vector3(0, 0, 0), true);
  } else {
    const light = STK.gfx.Lights.getDefaultHemisphereLight(cmd.use_lights, cmd.use_lights);
    scene.add(light);
  }
  if (cmd.background_color != null) {
    scene.background = STK.Colors.toColor(cmd.background_color);
  }
  return scene;
}

function createRenderHelper(assetManager, renderer) {
  const renderHelper = new ArticulationsRenderHelper({
    assetManager: assetManager,
    renderer: renderer,
    showAxisRadar: cmd.show_axis_radar,
    useLights: cmd.use_lights,
    usePhysicalLights: cmd.use_physical_lights,
    useDirectionalLights: cmd.use_directional_lights,
    backgroundColor: cmd.background_color,
    staticColor: cmd.static_color,
    basePartColor: cmd.base_part_color,
    movingPartColor: cmd.moving_part_color,
    attachedMovingPartColor: cmd.attached_moving_part_color,
    staticOpacity: cmd.static_opacity
  });
  return renderHelper;
}

const renderer = createRenderer();
const assetManager = createAssetManager();
const cameraControls = createCameraControls(renderer);
const renderHelper = createRenderHelper(assetManager, renderer);

STK.assets.registerAssetGroupsSync({ assetSources: [cmd.source] });
if (cmd.format) {
  STK.assets.AssetGroups.setDefaultFormat(cmd.format);
}
var assetSources = cmd.getAssetSources(cmd.inputType, inputs, cmd.assetGroups);
if (assetSources) {
  STK.assets.registerAssetGroupsSync({ assetSources: assetSources });
}

function processAsset(asset, opts, callback) {
  console.log('Processing ' + opts.basename);
  // Create THREE scene
  const scene = createScene(cameraControls.camera);

  // const metadata = assetsDb? assetsDb.getAssetInfo(fullId) : null;

  const wrappedCallback = function() {
    assetManager.clearCache();
    STK.geo.Object3DUtil.dispose(scene);
    callback();
  };

  const mInst = asset;
  const sceneState = new STK.scene.SceneState(null, mInst.model.info);
  sceneState.addObject(mInst, cmd.auto_align);
  scene.add(sceneState.fullScene);
  const sceneBBox = STK.geo.Object3DUtil.getBoundingBox(mInst.object3D);
  const bbdims = sceneBBox.dimensions();
  console.log('Loaded ' + sceneState.getFullID() +
    ' bbdims: [' + bbdims.x + ',' + bbdims.y + ',' + bbdims.z + ']');

  const fullId = mInst.model.info.fullId;
  console.log('fullId', fullId);
  const renderOpts = {
    cameraControls: cameraControls,
    targetBBox: sceneBBox,
    basename: opts.basename,
    framerate: cmd.framerate,
    tilt: cmd.tilt,
    skipVideo: cmd.skip_video,
    combineAll: cmd.combine_all,
    format: cmd.video_format,
    clearPngs: cmd.clear_pngs,
    iterations: cmd.iterations,
    logdata: { fullId: fullId, assetType: 'model', toWorld: mInst.getObject3D('Model').matrixWorld.toArray() },
    callback: wrappedCallback
  };

  setTimeout( function() {
    renderHelper.renderArticulatedModelInstance(scene, mInst, renderOpts);
  }, 0);
}

function main() {
  processAssetsHelper.processAssets(cmd, inputs, assetManager, processAsset);
}

main();