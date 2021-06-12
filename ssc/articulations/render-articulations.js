#!/usr/bin/env node
/*
    This renders articulations for an object. 
    The following example command can be run from the ssc folder
    NODE_BASE_URL=http://localhost:8010/articulations/ ./render-articulations.js 
      --source shape2motion --id lamp_0061--use_subdir --output_dir ./
      --static_color neutral --moving_part_color highlight --show_axis_radar
      --background_color lightgrey --framerate 40
 */

const async = require('async');
const fs = require('fs');
const shell = require('shelljs');
const STK = require('../stk-ssc');
const cmd = require('../ssc-parseargs');
const THREE = global.THREE;
const ArticulationsRenderHelper = STK.articulations.ArticulationsRenderHelper;

cmd
  .version('0.0.1')
  .description('Renders asset by id')
  .option('--id <id>', 'Scene or model id [default: lamp_0061]', 'lamp_0061')
  .option('--ids_file <file>', 'File with model ids')
  .option('--source <source>', 'Scene or model source [default: shape2motion]', 'shape2motion')
  .option('--format <format>', 'Asset format')
  .option('--output_dir <dir>', 'Base directory for output files', '.')
  .option('--use_subdir','Put output into subdirectory per id [false]')
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
  .parse(process.argv);

const msg = cmd.checkImageSize(cmd);
if (msg) {
  console.error(msg);
  process.exit(-1);
}

// Parse arguments and initialize globals
STK.Constants.setVirtualUnit(1);  // set to meters
cmd.material_type = cmd.material_type || 'phong';
if (cmd.material_type) {
  STK.materials.Materials.setDefaultMaterialType(cmd.material_type, cmd.material_type)
}
if (cmd.material_side) {
  STK.materials.Materials.DefaultMaterialSide = STK.materials.Materials.getMaterialSide(cmd.material_side, STK.materials.Materials.DefaultMaterialSide);
}

function createRenderer() {
  const use_ambient_occlusion = (cmd.use_ambient_occlusion && cmd.ambient_occlusion_type !== 'edl');
  const renderer = new STK.PNGRenderer({
    width: cmd.width,
    height: cmd.height,
    useAmbientOcclusion: cmd.encode_index ? false : use_ambient_occlusion,
    useEDLShader: (cmd.use_ambient_occlusion && cmd.ambient_occlusion_type === 'edl'),
    useOutlineShader: cmd.encode_index ? false : cmd.use_outline_shader,
    ambientOcclusionOptions: {
      type: use_ambient_occlusion ? cmd.ambient_occlusion_type : undefined
    },
    outlineColor: cmd.encode_index ? false : cmd.outline_color,
    usePhysicalLights: cmd.encode_index ? false : cmd.use_physical_lights,
    useShadows: cmd.encode_index ? false : cmd.use_shadows,
    compress: cmd.compress_png,
    skip_existing: cmd.skip_existing,
    reuseBuffers: true
  });
  return renderer;
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

let ids = cmd.id ? [cmd.id] : ['lamp_0061'];

STK.assets.registerAssetGroupsSync({ assetSources: [cmd.source] });
if (cmd.format) {
  STK.assets.AssetGroups.setDefaultFormat(cmd.format);
}

const assetGroup = assetManager.getAssetGroup(cmd.source);
if (!assetGroup) {
  console.log('Unrecognized asset source ' + cmd.source);
  return;
}
const supportedAssetTypes = ['model'];
if (supportedAssetTypes.indexOf(assetGroup.type) < 0) {
  console.log('Unsupported asset type ' + assetGroup.type);
  return;
}

if (cmd.ids_file) {
  const data = fs.readFileSync(cmd.ids_file, 'utf8');
  ids = data.split('\n').map(function(x) { return x.trim(); }).filter(function(x) { return x.length; });
  ids = STK.util.shuffle(ids);
} else if (cmd.id === 'all') {
  ids = assetGroup.assetDb.assetInfos.map(function(info) { return info.id; });
  ids = STK.util.shuffle(ids);
}

function processIds(assetsDb) {
  const memcheckOpts = { heapdump: { limit: cmd.heapdump } };
  async.forEachOfSeries(ids, function (id, index, callback) {
    console.log('Processing ' + id);
    STK.util.clearCache();
    STK.util.checkMemory('Processing ' + id + ' index=' + index, memcheckOpts);
    // Create THREE scene
    const scene = createScene(cameraControls.camera);

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
    //shell.rm('-rf', basename);
    const fullId = cmd.source + '.' + id;
    const metadata = assetsDb? assetsDb.getAssetInfo(fullId) : null;

    const wrappedCallback = function() {
      STK.geo.Object3DUtil.dispose(scene);
      callback();
    };

    if (assetGroup.type === STK.Constants.assetTypeModel) {
      assetManager.clearCache();
      assetManager.getModelInstance(cmd.source, fullId, function (mInst) {
        // Ensure is normal geometry (for some reason, BufferGeometry not working with ssc)
        STK.geo.Object3DUtil.traverseMeshes(mInst.object3D, false, function(m) {
          m.geometry = STK.geo.GeometryUtil.toGeometry(m.geometry);
        });

        const sceneState = new STK.scene.SceneState(null, mInst.model.info);
        sceneState.addObject(mInst, cmd.auto_align);
        scene.add(sceneState.fullScene);
        const sceneBBox = STK.geo.Object3DUtil.getBoundingBox(mInst.object3D);
        const bbdims = sceneBBox.dimensions();
        console.log('Loaded ' + sceneState.getFullID() +
          ' bbdims: [' + bbdims.x + ',' + bbdims.y + ',' + bbdims.z + ']');

        const renderOpts = {
          cameraControls: cameraControls,
          targetBBox: sceneBBox,
          basename: basename,
          framerate: cmd.framerate,
          tilt: cmd.tilt,
          skipVideo: cmd.skip_video,
          combineAll: cmd.combine_all,
          iterations: cmd.iterations,
          logdata: { fullId: fullId, assetType: assetGroup.type, toWorld: mInst.getObject3D('Model').matrixWorld.toArray() },
          callback: wrappedCallback
        };

        function onDrained() {
          setTimeout( function() {
            renderHelper.renderArticulatedModelInstance(scene, mInst, renderOpts); }, 0);
        }

        STK.util.waitImagesLoaded(onDrained);
      },
      function (error) {
        console.error('Error loading ' + fullId, error);
        callback(error, null);
      },
      metadata);
    }
  }, function (err, results) {
    console.log('DONE');
  });
}

function main() {
  processIds();
}

main();