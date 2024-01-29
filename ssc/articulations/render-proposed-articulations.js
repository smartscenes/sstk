#!/usr/bin/env node
/*
    This renders articulations for an object. 
    The following example command can be run from the ssc folder
    NODE_BASE_URL=http://ec2-52-14-172-161.us-east-2.compute.amazonaws.com/articulations/ ./render-proposed-articulations.js
      --id shape2motion.lamp_0061 --use_subdir --output_dir ./
      --static_color neutral --moving_part_color highlight --show_axis_radar
      --background_color lightgrey --framerate 40
 */
const shell = require('shelljs');
const STK = require('../stk-ssc');
const cmd = require('../ssc-parseargs');
const ArticulationsRenderHelper = STK.articulations.ArticulationsRenderHelper;

cmd
  .version('0.0.1')
  .description('Renders asset by id')
  .option('--id <id>', 'Scene or model id [default: shape2motion.lamp_0061]', 'shape2motion.lamp_0061')
  .option('--articulations <filename>', 'Articulations filename')
  .option('--output_dir <dir>', 'Base directory for output files', '.')
  .option('--use_subdir [flag]','Put output into subdirectory per id [false]', STK.util.cmd.parseBoolean, false)
  .optionGroups(['config_file', 'render_options', 'render_views', 'asset_cache'])
  .option('--skip_existing', 'Skip rendering existing images [false]')
  .option('--auto_align [flag]', 'Whether to auto align asset', STK.util.cmd.parseBoolean, false)
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
  .parse(process.argv);

if (!cmd.articulations) {
  console.error('Articulations file not specified');
  process.exit(-1);
}

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

function registerAssets(sid) {
  STK.assets.registerAssetGroupsSync({ assetSources: [sid.source] });
  const assetGroup = assetManager.getAssetGroup(sid.source);
  return assetGroup;
}

function checkAssetId(assetGroup, sid) {
  if (!assetGroup) {
    return 'Unrecognized asset source ' + sid.source;
  }
  const supportedAssetTypes = ['model'];
  if (supportedAssetTypes.indexOf(assetGroup.type) < 0) {
    return 'Unsupported asset type ' + assetGroup.type;
  }
}

function readArticulations(filename) {
  const data = STK.fs.readSync(filename, 'utf8');
  return JSON.parse(data);
}

const renderer = createRenderer();
const assetManager = createAssetManager();
const renderHelper = createRenderHelper(assetManager, renderer);
const sid = STK.assets.AssetManager.toSourceId(null, cmd.id);

const assetGroup = registerAssets(sid);
const errMsg = checkAssetId(assetGroup, sid);
if (errMsg) {
  console.error(errMsg);
  process.exit(-1);
}

function renderArticulations(sid, articulations) {
  const fullId = sid.fullId;

  let outputDir = cmd.output_dir;
  if (cmd.use_subdir) {
    outputDir = outputDir + '/' + sid.id;
    if (cmd.skip_existing && shell.test('-d', outputDir)) {
      console.warn('Skipping existing output at: ' + outputDir);
      setTimeout(function () {
        callback();
      });
      return;
    }
  }
  const basename = outputDir + '/' + sid.id;
  shell.mkdir('-p', outputDir);
  shell.rm('-rf', basename);

  const renderOpts = {
    basename: basename,
    framerate: cmd.framerate,
    tilt: cmd.tilt,
    skipVideo: cmd.skip_video,
    iterations: cmd.iterations,
    logdata: {},
    waitImagesLoaded: STK.util.waitImagesLoaded
  };

  renderHelper.renderProposedArticulationsForId(fullId, articulations, renderOpts, (err, res) => {
    if (err) {
      console.error('Error rendering ' + fullId, err);
    } else {
      console.log(res);
      console.log('DONE');
    }
  });
}

const articulations = readArticulations(cmd.articulations);
renderArticulations(sid, articulations);