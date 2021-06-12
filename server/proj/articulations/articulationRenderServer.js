/* 
Example Request URL::
  http://localhost:8000/render/articulations/all?modelId=shape2motion.lamp_0061&static_color=neutral
        &moving_part_color=highlight&show_axis_radar=true&background_color=lightgrey
        &iterations=20
*/

const _ = require('lodash');
const log = require('../../lib/logger')('ArticulationRenderServer');
const shell = require('shelljs');

const DEFAULT_WIDTH = 1000;
const DEFAULT_HEIGHT = 1000;

let STK = null;
let THREE = null;

function __init() {
  // Make sure we pull in STK (do this on demand)
  if (!STK) {
    console.log('Initializing STK-SSC');
    log.info('Initializing STK-SSC');
    STK = require('../../../ssc/stk-ssc');
    //STK.Constants.baseUrl = 'http://localhost:8010/';
    STK.Constants.setVirtualUnit(1);  // set to meters
    const material_type = 'phong';
    STK.materials.Materials.setDefaultMaterialType(material_type, material_type);
    STK.util.clearCache();
  }
  if (!THREE) {
    THREE = global.THREE;
  }
}

function ArticulationRenderServer(params) {
  params = params || {};
  this.__renderer = null;
  this.sources = params.sources || ['shape2motion', 'rpmnet', 'partnetsim'];
  this.width = params.width || DEFAULT_WIDTH;
  this.height = params.height || DEFAULT_HEIGHT;
  this.outputDir = params.outputDir || "../../../../../renderings";
}

ArticulationRenderServer.prototype.getAssetManager = function() {
  if (!this.__assetManager) {
    console.log('Initializing assetmanager');
    let useSearchController = STK.Constants.baseUrl.startsWith('http://') || STK.Constants.baseUrl.startsWith('https://');
    this.__assetManager = new STK.assets.AssetManager({
      autoAlignModels: false,
      autoScaleModels: false,
      assetCacheSize: 100,
      enableLights: false,
      defaultLightState: false,
      supportArticulated: true, mergeFixedParts: false,
      searchController: useSearchController? new STK.search.BasicSearchController() : null
   });
      
    STK.assets.AssetGroups.registerDefaults();
    let assets = require('../../../ssc/data/assets.json');
    let assetsMap = _.keyBy(assets, 'name');
    // Register all custom asset groups
    STK.assets.registerCustomAssetGroupsSync(assetsMap, this.sources);
  }
  this.__assetManager.clearCache();
  return this.__assetManager;
};

ArticulationRenderServer.prototype.getRenderer = function(opts) {
  opts = opts || {};
  _.defaults(opts, { width: this.width, height: this.height });
  // TODO: Have separate renderers for each width/height (cached)
  if (!this.__renderer) {
    console.log('Initializing renderer');
    this.__renderer = new STK.PNGRenderer({
      width: this.width,
      height: this.height,
      useAmbientOcclusion: false,
      useEDLShader: false,
      useOutlineShader: false,
      ambientOcclusionOptions: {
          type: undefined
      },
      outlineColor: false,
      usePhysicalLights: false,
      useShadows: false,
      compress: false,
      skip_existing: false,
      reuseBuffers: true
      });
  }
  if (opts.width !== this.width || opts.height !== this.height) {
    this.width = opts.width;
    this.height = opts.height;
    this.__renderer.setSize(this.width, this.height);
  }
  return this.__renderer;
};

ArticulationRenderServer.prototype.createDirectory = function(outputDir) {
  shell.mkdir('-p', outputDir);
};

ArticulationRenderServer.prototype.renderArticulated = function (req, res) {
  try {
      __init();
      let queryParams = _.defaults({}, req.body, req.query);
      this.processRendering(queryParams, false, (err, result) => {
          if (err) {
              console.error('Error inside ArticulationRenderServer: ',err);
              res.status(400).send('Rendering not successful.');
          } else {
              res.status(200).send(result);
          }
      });
  } catch (err) {
      console.error(err);
      res.status(500).send('Error rendering Ids.');
  }
};

ArticulationRenderServer.prototype.renderProposed = function (req, res) {
  try {
      __init();
      let queryParams = _.defaults({}, req.body, req.query);
      this.processRendering(queryParams, true, (err, result) => {
        if (err) {
            console.error('Error inside ArticulationRenderServer: ',err);
            res.status(400).send('Rendering not successful.');
        } else {
            res.status(200).send(result);
        }
      });

  } catch (err) {
      console.error(err);
      res.status(500).send('Error rendering Ids.');
  }
};

ArticulationRenderServer.prototype.processRendering = function (params, renderProposed, callback) {
  const modelId = params.modelId;
  const width = this.width;
  const height = this.height;
  const renderer = this.getRenderer({ width: width, height: height });

  const source = modelId.split('.')[0];
  const id = modelId.substring(source.length + 1);

  const subDir = renderProposed? 'proposed' : 'final';
  const outputDir = this.outputDir + '/' + subDir + '/' + source + '/' + id;
  const basename = outputDir + '/' + id;

  console.log('Processing ' + modelId + ' output ' + basename);
  this.createDirectory(outputDir);

  let assetManager = this.getAssetManager(source);
  let renderHelper = new STK.articulations.ArticulationsRenderHelper({
      assetManager: assetManager,
      renderer: renderer,
      showAxisRadar: params.show_axis_radar,
      useLights: params.use_lights,
      usePhysicalLights: params.use_physical_lights,
      useDirectionalLights: params.use_directional_lights,
      backgroundColor: params.background_color || 'lightgrey',
      staticColor: params.static_color,
      basePartColor: params.base_part_color,
      movingPartColor: params.moving_part_color,
      attachedMovingPartColor: params.attached_moving_part_color,
      staticOpacity: (params.static_opacity != null)? params.static_opacity : 0.3
  });

  const renderOpts = {
    basename: basename,
    framerate: params.framerate,
    tilt: params.tilt,
    skipExisting: params.skip_existing,
    combineAll: params.combine_all,
    iterations: params.iterations,
    logdata: {}
  };

  if (renderProposed) {
    if (params.articulations != null) {
      let articulations = params.articulations;
      renderHelper.renderProposedArticulationsForId(modelId, articulations, renderOpts, callback);
    } else {
      callback("Please specify set of articulations to render");
    }
  } else {
    renderHelper.renderArticulatedForId(modelId, {}, renderOpts, callback);
  }
};

module.exports = ArticulationRenderServer;
