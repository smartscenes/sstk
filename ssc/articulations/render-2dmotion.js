#!/usr/bin/env node
/* This code is to render 2D data for 2DMotion project */
const async = require('async');
const shell = require('shelljs');
const STK = require('../stk-ssc');
const cmd = require('../ssc-parseargs');
const THREE = global.THREE;
const ArticulationsRenderDataGenerator = STK.articulations.ArticulationsRenderDataGenerator;
const _ = STK.util;

cmd
  // .version('0.0.1')
  .option('--id <id>', 'Scene or model id [default: lamp_0061]', '47645')
  .option('--model_label <modelLabel>', 'Model Label')
  .option('--part_indexes <partIndexes>', 'Set of part indices to render for this articulated object', STK.util.cmd.parseIntList, [])
  .option('--part_labels <partLabels>', 'Set of corresponding part labels to the index', STK.util.cmd.parseList, [])
  .option('--parts <filename>', 'File with part information (CSV file of model_cat,model_id,part_id,part_label,close_state)')
  .option('--source <source>', 'Scene or model source [default: partnetsim]', 'partnetsim')
  // Maybe used to set the gltf format for the mesh
  .option('--format <format>', 'Asset format')
  // Default path has been set
  .option('--output_dir <dir>', 'Base directory for output files')
  // Default using subdir
  .option('--use_subdir [flag]', 'Put output into subdirectory per id [true]', STK.util.cmd.parseBoolean, true)
  // Default background color is transparent
  .option('--background_color <name>', 'Color name for the scene background, eg, grey or skyblue')
  // Other parameters
  .optionGroups(['config_file', 'render_options', 'render_views', 'asset_cache'])
  .option('--skip_existing', 'Skip rendering existing images [false]')
  .option('--auto_align [flag]', 'Whether to auto align asset', STK.util.cmd.parseBoolean, false)
  .option('--heapdump <num>', 'Number of times to dump the heap (for memory debugging)', STK.util.cmd.parseInt, 0)
  .option('--material_type <material_type>')
  .option('--material_side <material_side>')
  .option('--num_viewpoints <n>', 'Number of viewpoints to render', STK.util.cmd.parseInt, 5)
  .option('--num_motion_states <n>', 'Number of motion states to render', STK.util.cmd.parseInt, 4)
  .option('--upsample_original <n>', 'Whether to render original color image at higher resolution', STK.util.cmd.parseInt)
  .option('--width <width>', 'Image width [default: 256]', STK.util.cmd.parseInt, 256)
  .option('--height <height>', 'Image height [default: 256]', STK.util.cmd.parseInt, 256)
  // .option('--static_color <name>', 'What color to use for static node (original, neutral, or specified color)', 'original')
  // .option('--moving_part_color <name>', 'What color to use for main moving part (original, neutral, highlight, faded_highlight or specified color)', 'original')
  // .option('--attached_moving_part_color <name>', 'What color to use for attached moving parts (original, neutral, highlight, faded_highlight or specified color)', 'original')
  // .option('--static_opacity <amount>', 'Amount of opacity to have for the non-moving parts (from 0 to 1)')
  .option('--use_search_controller [flag]', 'Whether to lookup asset information online', STK.util.cmd.parseBoolean, false)
  .parse(process.argv);

// Parse arguments and initialize globals
STK.Constants.setVirtualUnit(1);  // set to meters
cmd.material_type = cmd.material_type || 'phong';
if (cmd.material_type) {
  STK.materials.Materials.setDefaultMaterialType(cmd.material_type, 'basic');
}
if (cmd.material_side) {
  STK.materials.Materials.DefaultMaterialSide = STK.materials.Materials.getMaterialSide(cmd.material_side, STK.materials.Materials.DefaultMaterialSide);
}

function loadParts(filename) {
  if (filename != null) {
    const partsByModelId = STK.fs.loadDelimited(filename, { groupBy: 'model_id' });
    return partsByModelId;
  }
}

function createAssetManager() {
  const useSearchController = cmd.use_search_controller;
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

// todo: Change the default camera control
function createCameraControls(renderer) {
  const cameraConfig = _.defaults(Object.create(null), cmd.camera || {}, {
    type: 'perspective',
    fov: 50,
    near: 0.1 * STK.Constants.metersToVirtualUnit,
    far: 400 * STK.Constants.metersToVirtualUnit
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
    const light = STK.gfx.Lights.getDefaultHemisphereLight(cmd.use_physical_lights, cmd.use_lights);
    scene.add(light);
  }
  if (cmd.background_color != null) {
    scene.background = STK.Colors.toColor(cmd.background_color);
  }
  return scene;
}

// Create renderhelper designed for this task
// todo: adjust the color
function createRenderHelper(assetManager, renderer) {
  const renderHelper = new ArticulationsRenderDataGenerator({
    assetManager: assetManager,
    renderer: renderer,
    showAxisRadar: false,
    useLights: cmd.use_lights,
    usePhysicalLights: cmd.use_physical_lights,
    useDirectionalLights: cmd.use_directional_lights,
    staticColor: '#000000',
    movingPartColor: '#00ff00',
    attachedMovingPartColor: '#00ff00',
//    staticOpacity: cmd.static_opacity,
  });

  return renderHelper;
}

const rendererOptions = cmd.getRendererOptions(cmd);
const renderer = new STK.PNGRenderer(rendererOptions);
const assetManager = createAssetManager();
const cameraControls = createCameraControls(renderer);
const renderHelper = createRenderHelper(assetManager, renderer);

let ids = [cmd.id];

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


function processIds(assetsDb) {
  const memcheckOpts = { heapdump: { limit: cmd.heapdump } };
  const partsByModelId = loadParts(cmd.parts).data || {};
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
    const fullId = cmd.source + '.' + id;
    const metadata = assetsDb ? assetsDb.getAssetInfo(fullId) : null;

    const wrappedCallback = function () {
      STK.geo.Object3DUtil.dispose(scene);
      callback();
    };

    if (assetGroup.type === STK.Constants.assetTypeModel) {
      assetManager.clearCache();
      assetManager.getModelInstance(cmd.source, fullId, function (mInst) {
          const sceneState = new STK.scene.SceneState(null, mInst.model.info);
          sceneState.addObject(mInst, cmd.auto_align);
          scene.add(sceneState.fullScene);
          const sceneBBox = STK.geo.Object3DUtil.getBoundingBox(mInst.object3D);
          const bbdims = sceneBBox.dimensions();
          console.log('Loaded ' + sceneState.getFullID() +
            ' bbdims: [' + bbdims.x + ',' + bbdims.y + ',' + bbdims.z + ']');

          const parts = partsByModelId[id] || [];
          if (parts && parts.length) {
            const motionStateValues = parts.map(
              (p,i) => { return { artIndex: p.part_id, name: 'closed', value: p.close_state }; });
            renderHelper.setArticulationMotionStateValues(mInst, motionStateValues);
          }
          const part_indexes = cmd.part_indexes.length? cmd.part_indexes : parts.map(p => p.part_id);
          const part_labels = cmd.part_labels.length? cmd.part_labels : parts.map(p => p.part_label);
          const model_label = (cmd.model_label != null)? cmd.model_label : (parts.length? parts[0].model_cat : 'unknown');

          // Record something for motions
          const renderOpts = {
            source: cmd.source,
            model_label: model_label,
            part_indexes: part_indexes,
            part_labels: part_labels,
            num_viewpoints: cmd.num_viewpoints,
            num_motion_states: cmd.num_motion_states,
            upsampleOriginal: cmd.upsample_original,   // Whether to upsample original color image
            randomizeViews: false,
            uniformViews: true,

            cameraControls: cameraControls,
            targetBBox: sceneBBox,
            basename: basename,
            logdata: { fullId: fullId, assetType: assetGroup.type, toWorld: mInst.getObject3D('Model').matrixWorld.toArray() },
            callback: wrappedCallback
          };

          function onDrained() {
            setTimeout(function () {
              renderHelper.renderArticulatedModelInstance(scene, mInst, renderOpts);
            }, 0);
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