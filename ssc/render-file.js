#!/usr/bin/env node

var async = require('async');
var path = require('path');
var shell = require('shelljs');
var STK = require('./stk-ssc');
var cmd = require('./ssc-parseargs');
var THREE = global.THREE;
var _ = STK.util;

cmd
  .version('0.0.1')
  .description('Renders asset file')
  .option('--input <filename>', 'Input path')
  .option('--format <format>', 'File format to use')
  .option('--assetType <type>', 'Asset type (scene or model)', 'model')
  .option('--output_dir <dir>', 'Base directory for output files', '.')
  .option('--output <filename>', 'Output path')
  .option('--auto_align [flag]', 'Whether to auto align asset', STK.util.cmd.parseBoolean, false)
  .optionGroups(['config_file', 'render_options', 'view', 'render_views', 'color_by'])
  .option('--skip_existing', 'Skip rendering existing images [false]')
  .option('--material_type <material_type>')
  .option('--use_search_controller [flag]', 'Whether to lookup asset information online', STK.util.cmd.parseBoolean, false)
  .parse(process.argv);

// Parse arguments and initialize globals
var msg = cmd.checkImageSize(cmd);
if (msg) {
  console.error(msg);
  process.exit(-1);
}

if (!cmd.input) {
  console.error('Please specify --input <filename>');
  process.exit(-1);
}
var files = [cmd.input];
if (cmd.input.endsWith('.txt')) {
  // Read files form input file
  var data = STK.util.readSync(cmd.input);
  files = data.split('\n').map(function(x) { return STK.util.trim(x); }).filter(function(x) { return x.length > 0; });
}

if (cmd.assetInfo && cmd.assetInfo.source) {
  var source = cmd.assetInfo.source;
  if (!cmd.assetGroups) { cmd.assetGroups = [source]; }
  if (cmd.assetGroups.indexOf(source) < 0) { cmd.assetGroups.push(source); }
}

if (cmd.assetGroups) {
  STK.assets.AssetGroups.registerDefaults();
  var assets = require('./data/assets.json');
  var assetsMap = _.keyBy(assets, 'name');
  STK.assets.registerCustomAssetGroupsSync(assetsMap, cmd.assetGroups);  // Make sure we get register necessary asset groups
}

//STK.Constants.setVirtualUnit(1);  // set to meters
if (cmd.material_type) {
  STK.materials.Materials.DefaultMaterialType = STK.materials.Materials.getMaterialType(cmd.material_type)
}

var output_basename = cmd.output;
var use_ambient_occlusion = (cmd.use_ambient_occlusion && cmd.ambient_occlusion_type !== 'edl');
// Parse arguments and initialize globals
var renderer = new STK.PNGRenderer({
  width: cmd.width, height: cmd.height,
  useAmbientOcclusion: cmd.encode_index? false : use_ambient_occlusion,
  useEDLShader: (cmd.use_ambient_occlusion && cmd.ambient_occlusion_type === 'edl'),
  useOutlineShader: cmd.encode_index? false : cmd.use_outline_shader,
  ambientOcclusionOptions: {
    type: use_ambient_occlusion? cmd.ambient_occlusion_type : undefined
  },
  outlineColor: cmd.encode_index? false : cmd.outline_color,
  useLights: cmd.encode_index? false : cmd.use_lights,
  useShadows: cmd.encode_index? false : cmd.use_shadows,
  compress: cmd.compress_png, skip_existing: cmd.skip_existing, reuseBuffers: true,
  flipxy: cmd.flipxy,
});
var useSearchController = cmd.use_search_controller;
var assetManager = new STK.assets.AssetManager({
  autoAlignModels: cmd.auto_align, autoScaleModels: false, assetCacheSize: 100,
  searchController: useSearchController? new STK.search.BasicSearchController() : null
});

var cameraConfig = _.defaults(Object.create(null), cmd.camera || {}, {
  type: 'perspective',
  fov: 50,
  near: 0.1*STK.Constants.metersToVirtualUnit,
  far: 400*STK.Constants.metersToVirtualUnit
});

/**
 * Render scene
 * @param scene {THREE.Object3D}
 * @param renderer {STK.PNGRenderer}
 * @param renderOpts {Object} Options on how to render and where to save the rendered file
 * @param renderOpts.cameraControls {STK.controls.CameraControls} cameraControls
 * @param renderOpts.targetBBox {STK.geo.BBox} Bounding box of the target
 * @param renderOpts.basename {string} basename to output to
 * @param renderOpts.angleStep {number} turntable_step
 * @param renderOpts.framerate {number} framerate
 * @param renderOpts.tilt {number} tilt from horizontal
 * @param renderOpts.skipVideo {boolean} Whether to skip outputing of video
 * @param cmdOpts {Object} Options on the view to render
 * @param [cmdOpts.render_all_views] {boolean}
 * @param [cmdOpts.render_turntable] {boolean}
 * @param [cmdOpts.view] {Object}
 * @param [cmdOpts.view_index] {int}
 * @param [cmdOpts.width] {int} Requested image width
 * @param [cmdOpts.height] {int} Requested image height
 * @param [cmdOpts.max_width] {int} Maximum number of pixels in the horizontal dimension
 * @param [cmdOpts.max_height] {int} Maximum number of pixels in the vertical dimension
 * @param [cmdOpts.max_pixels] {int} Maximum number of pixels
 * @param renderOpts.callback {function(err,res)} Callback
 */
function render(scene, renderer, renderOpts, cmdOpts) {
  var sceneBBox = renderOpts.targetBBox;
  var outbasename = renderOpts.basename;
  var cameraControls = renderOpts.cameraControls;
  var camera = renderOpts.cameraControls.camera;
  var cb = renderOpts.callback;
  console.log('cmdOpts', cmdOpts);
  var logdata = _.defaults({}, renderOpts.logdata || {});
  if (cmdOpts.render_all_views) {
    // Render a bunch of views
    renderer.renderAllViews(scene, renderOpts);
  } else if (cmdOpts.render_turntable) {
    // Render turntable
    renderer.renderTurntable(scene, renderOpts);
  } else {
    var errmsg  = null;  // Set to error message
    // Set view
    if (cmdOpts.use_scene_camera) {
      // No need to set view (using scene camera)
      console.log('use scene camera');
    } else if (cmdOpts.view_index != undefined) {
      // Using view index
      var views = cameraControls.generateViews(sceneBBox, cmdOpts.width, cmdOpts.height);
      cameraControls.viewTarget(views[cmdOpts.view_index]);  // default
    } else if (cmdOpts.view) {
      // Using more complex view parameters
      var viewOpts = cmdOpts.view.position? cmdOpts.view : cameraControls.getView(_.merge(Object.create(null), cmdOpts.view, { target: scene }));

      if (viewOpts.imageSize) {
        //console.log('got', viewOpts);
        var width = viewOpts.imageSize[0];
        var height = viewOpts.imageSize[1];
        errmsg = cmd.checkImageSize({ width: width, height: height }, cmdOpts);
        if (!errmsg && (width !== renderer.width || height !== renderer.height)) {
          renderer.setSize(width, height);
          camera.aspect = width / height;
        }
      }
      if (!errmsg) {
        cameraControls.viewTarget(viewOpts);
      } else {
        console.warn('Error rendering scene', msg);
      }
    } else {
      // angled view is default
      cameraControls.viewTarget({
        targetBBox: sceneBBox,
        phi: -Math.PI / 4,
        theta: Math.PI / 6,
        distanceScale: 2.0
      });
    }

    if (!errmsg) {
      logdata.cameraConfig = cameraControls.lastViewConfig;
      var opts = { logdata: logdata };
      if (cmd.color_by === 'depth' && cmd.output_image_encoding != 'rgba') {
        opts.postprocess = { operation: 'unpackRGBAdepth', dataType: 'uint16', metersToUnit: 1000 };
      }
      renderer.renderToPng(scene, camera, outbasename, opts);
    }
    setTimeout( function() { cb(errmsg); }, 0);
  }
}

function processFiles() {
  async.forEachOfSeries(files, function (file, index, callback) {
    STK.util.clearCache();

    // skip if output png already exists
    var outputDir = cmd.output_dir;
    var basename = output_basename;
    if (basename) {
      // Specified output - append index
      if (files.length > 1) {
        basename = basename + '_' + index;
      }
      basename = outputDir? outputDir + '/' + basename : basename;
    } else {
      basename = path.basename(file, path.extname(file)) || 'screenshot';
      basename = (outputDir? outputDir : path.dirname(file)) + '/' + basename;
    }
    var pngfilename = basename + '.png';

    if (cmd.skip_existing && STK.fs.existsSync(pngfilename)) {

      console.warn('Skipping render of existing file at ' + pngfilename);
      callback();

    } else {

      shell.mkdir('-p', path.dirname(pngfilename));

      console.log('Processing ' + file + '(' + index + '/' + files.length + ')');
      var info = { file: file, format: cmd.format, assetType: cmd.assetType, defaultMaterialType: THREE.MeshPhongMaterial };
      if (cmd.assetInfo) {
        info = _.defaults(info, cmd.assetInfo);
      }
      //console.log('info', info)

      assetManager.loadAsset(info, function (err, asset) {
        var sceneState;
        var defaultViewOpts = {};
        if (asset instanceof STK.scene.SceneState) {
          sceneState = asset;
          defaultViewOpts = { view_index: 0 };
        } else if (asset instanceof STK.model.ModelInstance) {
          var modelInstance = asset;
          sceneState = new STK.scene.SceneState(null, modelInstance.model.info);
          console.time('toGeometry');
          // Ensure is normal geometry (for some reason, BufferGeometry not working with ssc)
          STK.geo.Object3DUtil.traverseMeshes(modelInstance.object3D, false, function(m) {
            m.geometry = STK.geo.GeometryUtil.toGeometry(m.geometry);
          });
          console.timeEnd('toGeometry');
          sceneState.addObject(modelInstance, cmd.auto_align);
        } else if (err) {
          console.error("Error loading asset", info, err);
          return;
        } else {
          console.error("Unsupported asset type ", info, asset);
          return;
        }

        // Create THREE scene
        var scene = new THREE.Scene();
        var light = STK.gfx.Lights.getDefaultHemisphereLight(false);
        var camera;
        //console.log('use_scene_camera', cmd.use_scene_camera);
        var use_scene_camera = false;
        if (cmd.use_scene_camera) {
          // Try to get camera from scene!
          if (sceneState.cameras) {
            var sceneCameraConfig = sceneState.cameras[cmd.use_scene_camera];
            if (sceneCameraConfig) {
              //console.log(sceneCameraConfig);
              sceneCameraConfig = sceneState.convertCameraConfig(sceneCameraConfig);
              _.defaults(sceneCameraConfig, cameraConfig);
              //console.log(sceneCameraConfig);
              camera = STK.gfx.Camera.fromJson(sceneCameraConfig, cmd.width, cmd.height);
              use_scene_camera = true;
            } else {
              console.warn('no camera ' + cmd.use_scene_camera + ' found for scene!');
            }
          } else {
            console.warn('use_scene_camera is set but there is no camera specified for scene!');
          }
        }
        if (!camera) {
          camera = STK.gfx.Camera.fromJson(cameraConfig, cmd.width, cmd.height);
        }
        scene.add(light);
        scene.add(camera);
        var cameraControls = new STK.controls.CameraControls({
          camera: camera,
          container: renderer.canvas,
          controlType: 'none',
          cameraPositionStrategy: 'positionByCentroid'
        });


        sceneState.compactify();  // Make sure that there are no missing models
        scene.add(sceneState.fullScene);
        if (!cmd.assetInfo) {
          STK.geo.Object3DUtil.centerAndRescaleObject3DToWorld(sceneState.fullScene, 200);
        }
        var sceneBBox = STK.geo.Object3DUtil.getBoundingBox(sceneState.fullScene);
        var bbdims = sceneBBox.dimensions();
        console.log('Loaded ' + sceneState.getFullID() +
          ' bbdims: [' + bbdims.x + ',' + bbdims.y + ',' + bbdims.z + ']');
        console.log('bbox', sceneBBox);

        var outbasename = cmd.color_by? (basename + '.' + cmd.color_by) : basename;
        if (cmd.encode_index) {
          outbasename = outbasename + '.encoded';
        }
        var wrappedCallback = function() {
          STK.geo.Object3DUtil.dispose(scene);
          callback();
        };

        var renderOpts = {
          cameraControls: cameraControls,
          targetBBox: sceneBBox,
          basename: outbasename,
          angleStep: cmd.turntable_step,
          framerate: cmd.framerate,
          tilt: cmd.tilt,
          skipVideo: cmd.skip_video,
          callback: wrappedCallback
        };

        var cmdOpts = _.defaults(
          _.pick(cmd, ['render_all_views', 'render_turntable', 'view', 'view_index',
            'width', 'height', 'max_width', 'max_height', 'max_pixels', 'save_view_log']), defaultViewOpts);
        if (cmdOpts.view && cmdOpts.view.coordinate_frame === 'scene') {
          cmdOpts.view = sceneState.convertCameraConfig(cmdOpts.view);
        }
        cmdOpts.use_scene_camera = use_scene_camera;
        if (cmdOpts.save_view_log) {
          renderer.viewlogFilename = outbasename + '.views.jsonl';
          shell.rm(renderer.viewlogFilename);
        } else {
          renderer.viewlogFilename = null;
        }

        function onDrained() {
          render(scene, renderer, renderOpts, cmdOpts);
        }

        function waitImages() {
          STK.util.waitImagesLoaded(onDrained);
        }

        if (cmd.color_by) {
          STK.scene.SceneUtil.colorScene(sceneState, cmd.color_by, {
            color: cmd.color,
            loadIndex: { index: cmd.index, objectIndex: cmd.object_index },
            encodeIndex: cmd.encode_index,
            writeIndex: cmd.write_index? basename : null,
            restrictToIndex: cmd.restrict_to_color_index,
            fs: STK.fs,
            callback: function() { waitImages(); }
          });
        } else {
          waitImages();
        }
      });
    }
  }, function (err, results) {
    console.log('DONE');
  });
}

processFiles();