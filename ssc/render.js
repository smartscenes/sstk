#!/usr/bin/env node

var async = require('async');
var fs = require('fs');
var shell = require('shelljs');
var STK = require('./stk-ssc');
var cmd = require('./ssc-parseargs');
var THREE = global.THREE;
var _ = STK.util;

cmd
  .version('0.0.1')
  .description('Renders asset by id')
  .option('--id <id>', 'Scene or model id [default: e251dc99c5b4a9127af78305d7f7113c]', 'e251dc99c5b4a9127af78305d7f7113c')
  .option('--ids_file <file>', 'File with model ids')
  .option('--source <source>', 'Scene or model source [default: 3dw]', '3dw')
  .option('--format <format>', 'Asset format')
  .option('--output_dir <dir>', 'Base directory for output files', '.')
  .option('--output_suffix <suffix>', 'Suffix to use in output png (sceneId.suffix.png)')
  .option('--use_subdir','Put output into subdirectory per id [false]')
  .optionGroups(['config_file', 'scene', 'render_options', 'view', 'render_views', 'color_by', 'transform3d', 'norm_geo', 'asset_cache'])
  .option('--skip_existing', 'Skip rendering existing images [false]')
  .option('--voxels <voxel-type>', 'Type of voxels to use [default: none]', 'none')
  .option('--extra <extra>', 'Additional stuff to render [wall|navmap]',
  /*/^(wall|navmap)$/, */ STK.util.cmd.collect, [])
  .option('--level <level>', 'Scene level to render', STK.util.cmd.parseInt)
  .option('--room <room>', 'Room id to render [null]')
  .option('--show_ceiling [flag]', 'Whether to show ceiling or not', STK.util.cmd.parseBoolean, false)
  .option('--auto_align [flag]', 'Whether to auto align asset', STK.util.cmd.parseBoolean, false)
  .option('--seed <num>', 'Random seed to use', STK.util.cmd.parseInt, 12345678)
  .option('--repeat <num>', 'Number of times to repeat rendering of scene (for stress testing)', STK.util.cmd.parseInt, 1)
  .option('--heapdump <num>', 'Number of times to dump the heap (for memory debugging)', STK.util.cmd.parseInt, 0)
  .option('--material_type <material_type>')
  .option('--material_side <material_side>')
  .option('--support_articulated [flag]', 'Whether to parse articulated object', STK.util.cmd.parseBoolean)
  .option('--use_search_controller [flag]', 'Whether to lookup asset information online', STK.util.cmd.parseBoolean, false)
  .parse(process.argv);

var msg = cmd.checkImageSize(cmd);
if (msg) {
  console.error(msg);
  process.exit(-1);
}

var useSearchController = cmd.use_search_controller;
// Parse arguments and initialize globals
STK.Constants.setVirtualUnit(1);  // set to meters
cmd.material_type = cmd.material_type || 'phong';
if (cmd.material_type) {
  STK.materials.Materials.setDefaultMaterialType(cmd.material_type, cmd.material_type);
}
if (cmd.material_side) {
  STK.materials.Materials.DefaultMaterialSide = STK.materials.Materials.getMaterialSide(cmd.material_side, STK.materials.Materials.DefaultMaterialSide);
}

var rendererOptions = cmd.getRendererOptions(cmd);
var renderer = new STK.PNGRenderer(rendererOptions);
var assetManager = new STK.assets.AssetManager({
  autoAlignModels: cmd.auto_align,
  autoScaleModels: false,
  assetCacheSize: cmd.assetCacheSize,
  enableLights: cmd.use_lights,
  defaultLightState: cmd.use_lights,
  supportArticulated: cmd.support_articulated, mergeFixedParts: false,
  searchController: useSearchController? new STK.search.BasicSearchController() : null
});
var ids = cmd.id ? [cmd.id] : ['e251dc99c5b4a9127af78305d7f7113c'];

var assetFiles = (cmd.assets != null)? [cmd.assets] : [];
STK.assets.registerAssetGroupsSync({ assetSources: [cmd.source], assetFiles: assetFiles });
if (cmd.format) {
  STK.assets.AssetGroups.setDefaultFormat(cmd.format);
}

var assetGroup = assetManager.getAssetGroup(cmd.source);
if (!assetGroup) {
  console.log('Unrecognized asset source ' + cmd.source);
  return;
}
var supportedAssetTypes = ['scene', 'model', 'scan'];
if (supportedAssetTypes.indexOf(assetGroup.type) < 0) {
  console.log('Unsupported asset type ' + assetGroup.type);
  return;
}

if (cmd.ids_file) {
  var data = fs.readFileSync(cmd.ids_file, 'utf8');
  ids = data.split('\n').map(function(x) { return x.trim(); }).filter(function(x) { return x.length; });
  ids = STK.util.shuffle(ids);
} else if (cmd.id === 'all') {
  ids = assetGroup.assetDb.assetInfos.map(function(info) { return info.id; });
  ids = STK.util.shuffle(ids);
}

if (cmd.repeat > 1) {
  ids = _.flatten(_.times(cmd.repeat, _.constant(ids)));
}

var sceneDefaults = { includeCeiling: true, defaultMaterialType: STK.materials.Materials.DefaultMaterialType, preload: cmd.extra };
if (cmd.scene) {
  sceneDefaults = _.merge(sceneDefaults, cmd.scene);
}
sceneDefaults.emptyRoom = cmd.empty_room;
sceneDefaults.archOnly = cmd.arch_only;

var cameraConfig = _.defaults(Object.create(null), cmd.camera || {}, {
  type: 'perspective',
  fov: 50,
  near: 0.1*STK.Constants.metersToVirtualUnit,
  far: 400*STK.Constants.metersToVirtualUnit
});

main();

/**
 * Retexture scene
 * @param opts {Object} Options for retexturing
 * @param opts.cache
 * @param opts.sceneState {STK.scene.SceneState}
 * @param opts.assetManager {STK.assets.AssetManager}
 * @param opts.rng
 * @param opts.waitTextures {boolean} Whether to wait for texture images to load
 * @param opts.retexture.textureOnly
 * @param opts.retexture.texturedObjects
 * @param opts.retexture.textureSet
 * @param cb
 */
function retexture(opts, cb) {
  STK.scene.SceneUtil.getAggregatedSceneStatistics(opts.cache, function(err, aggregatedSceneStatistics) {
    STK.scene.SceneUtil.recolorWithCompatibleMaterials(opts.sceneState, {
      randomize: true,
      textureOnly: opts.retexture.textureOnly,
      texturedObjects: opts.retexture.texturedObjects,
      textureSet: opts.retexture.textureSet,
      assetManager: opts.assetManager,
      rng: opts.rng,
      aggregatedSceneStatistics: aggregatedSceneStatistics
    });
    if (opts.waitTextures) {
      STK.util.waitImagesLoaded(function() {
        cb();
      });
    } else {
      setTimeout(function() { cb(); }, 0);
    }
  }, { fs: STK.fs });
}

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
  //console.log('cmdOpts', cmdOpts);
  var logdata = _.defaults({}, renderOpts.logdata || {});
  if (cmd.color_by === 'depth' && cmd.output_image_encoding != 'rgba') {
    renderOpts.postprocess = { operation: 'unpackRGBAdepth', dataType: 'uint16', metersToUnit: 1000 };
  }
  if (cmd.convert_pixels && !renderOpts.postprocess) {
    renderOpts.postprocess = { operation: 'convert', dataType: cmd.convert_pixels };
  }
  if (cmdOpts.render_all_views) {
    // Render a bunch of views
    renderer.renderAllViews(scene, renderOpts);
  } else if (cmdOpts.render_turntable) {
    // Render turntable
    renderer.renderTurntable(scene, renderOpts);
  } else if (cmdOpts.views) {
    // Render multiple views
    renderer.renderViews(scene, cmdOpts.views, renderOpts);
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
      var opts = { logdata: logdata, postprocess: renderOpts.postprocess };
      renderer.renderToPng(scene, camera, outbasename, opts);
    }
    setTimeout( function() { cb(errmsg); }, 0);
  }
}

function convertViews(sceneState, cmdOpts) {
  if (cmdOpts.view && cmdOpts.view.coordinate_frame === 'scene') {
    cmdOpts.view = sceneState.convertCameraConfig(cmdOpts.view);
  } else if (cmdOpts.views) {
    for (var i = 0; i < cmdOpts.views.length; i++) {
      var view = cmdOpts.views[i];
      if (view.coordinate_frame === 'scene') {
        cmdOpts.views[i] = sceneState.convertCameraConfig(view);
      }
    }
  }
}

var rng = new STK.math.RNG();
rng.seed(cmd.seed);
var mainCache = {};
function processIds(assetsDb) {
  var memcheckOpts = { heapdump: { limit: cmd.heapdump } };
  async.forEachOfSeries(ids, function (id, index, callback) {
    console.log('Processing ' + id);
    STK.util.clearCache();
    STK.util.checkMemory('Processing ' + id + ' index=' + index, memcheckOpts);
    // Create THREE scene
    var scene = new THREE.Scene();
    var camera = STK.gfx.Camera.fromJson(cameraConfig, cmd.width, cmd.height);
    scene.add(camera);
    if (cmd.use_directional_lights) {
      STK.gfx.Lights.addSimple2LightSetup(camera, new THREE.Vector3(0, 0, 0), true);
    } else if (cmd.lights) {
      var lights = STK.gfx.Lights.setupLights(cmd.lights);
      for (var i = 0; i < lights.length; i++) {
        scene.add(lights[i]);
      }
    } else {
      var light = STK.gfx.Lights.getDefaultHemisphereLight(cmd.use_physical_lights, cmd.use_lights);
      scene.add(light);
    }
    var cameraControls = new STK.controls.CameraControls({
      camera: camera,
      container: renderer.canvas,
      controlType: 'none',
      cameraPositionStrategy: 'positionByCentroid' //'positionByCentroid'
    });

    var outputDir = cmd.output_dir;
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
    var basename = outputDir + '/' + id;
    shell.mkdir('-p', outputDir);
    var fullId = cmd.source + '.' + id;
    var metadata = assetsDb? assetsDb.getAssetInfo(fullId) : null;

    var wrappedCallback = function() {
      STK.geo.Object3DUtil.dispose(scene);
      callback();
    };

    // Scenes
    if (assetGroup.type === STK.Constants.assetTypeScene) {
      var floor = cmd.level;
      var room = cmd.room;
      if (floor != null) {
        basename += '_' + floor;
        if (room != null) {
          basename += '_' + room;
        }
      }
      var sceneOpts = {fullId: fullId, floor: floor, room: room};
      if (cmd.assetInfo && (cmd.assetInfo.source == null || cmd.assetInfo.source === cmd.source)) {
        sceneOpts = _.defaults(sceneOpts, cmd.assetInfo);
      }
      sceneOpts = _.defaults(sceneOpts, sceneDefaults);
      assetManager.loadScene(sceneOpts, function (err, sceneState) {
        //console.log(sceneState);
        sceneState.compactify();  // Make sure that there are no missing models
        if (cmd.use_shadows) {
          STK.geo.Object3DUtil.setCastShadow(sceneState.fullScene, true);
          STK.geo.Object3DUtil.setReceiveShadow(sceneState.fullScene, true);
        }
        sceneState.setVisible(
          cmd.show_ceiling,
          function (node) {
            return node.userData.type === 'Ceiling';
          }
        );
        scene.add(sceneState.fullScene);
        var sceneBBox = STK.geo.Object3DUtil.getBoundingBox(sceneState.fullScene);
        var bbdims = sceneBBox.dimensions();
        console.log('Loaded ' + sceneState.getFullID() +
          ' bbdims: [' + bbdims.x + ',' + bbdims.y + ',' + bbdims.z + ']');
        var bboxes = [];
        var transformInfo = STK.geo.Object3DUtil.applyTransforms(sceneState.fullScene, {
          assetName: sceneState.getFullID() ,
          hasTransforms: cmd.auto_align || cmd.auto_scale,
          normalizeSize: cmd.normalize_size,
          normalizeSizeTo: cmd.normalize_size_to,
          center: cmd.center,
          bboxes: bboxes,
          debug: true
        });

        var suffix = cmd.output_suffix || cmd.color_by;
        var outbasename = suffix? (basename + '.' + suffix) : basename;
        if (cmd.encode_index) {
          outbasename = outbasename + '.encoded';
        }

        for (var i = 0; i < cmd.extra.length; i++) {
          var extra = cmd.extra[i];
          var extraInfo = sceneState.info[extra];
          if (extraInfo) {
            if (extraInfo.assetType === 'wall') {
              if (extraInfo.data) {
                var walls = extraInfo.data;
                STK.scene.SceneUtil.visualizeWallLines(sceneState, walls);
              } else {
                console.warn('No wall for scene ' + fullId);
              }
            } else if (extraInfo.assetType === 'navmap') {
              var collisionProcessor = STK.sim.CollisionProcessorFactory.createCollisionProcessor({mode: 'navgrid'});
              if (extraInfo.data) {
                var navscene = new STK.nav.NavScene({
                  sceneState: sceneState,
                  tileOverlap: 0.25,
                  baseTileHeight: collisionProcessor.traversableFloorHeight * STK.Constants.metersToVirtualUnit,
                  isValid: function (position) {
                    return collisionProcessor.isPositionInsideScene(sceneState, position);
                  }
                });
                sceneState.navscene = navscene;
                //navscene.visualizeTileWeight();
                navscene.visualizeTraversable(new THREE.Color('orange'));
              } else {
                console.warn('No navmap for scene ' + fullId);
              }
            } else {
              console.warn('Unsupported extra ' + extra);
            }
          } else {
            console.warn('No info for extra ' + extra);
          }
        }

        var cmdOpts = _.defaults(
          _.pick(cmd, ['render_all_views', 'render_turntable', 'views', 'view', 'view_index',
            'width', 'height', 'max_width', 'max_height', 'max_pixels', 'save_view_log']) );
        if (cmdOpts.view == undefined && cmdOpts.view_index == undefined) {
          cmdOpts.view_index = 0;
        }
        convertViews(sceneState, cmdOpts);
        if (cmdOpts.save_view_log) {
          renderer.viewlogFilename = outbasename + '.views.jsonl';
          shell.rm(renderer.viewlogFilename);
        } else {
          renderer.viewlogFilename = null;
        }
        function doRender(outbasename, cb) {
          var renderOpts = {
            cameraControls: cameraControls,
            targetBBox: sceneBBox,
            basename: outbasename,
            angleStep: cmd.turntable_step,
            framerate: cmd.framerate,
            tilt: cmd.tilt,
            skipVideo: cmd.skip_video,
            logdata: _.defaults({ assetType: assetGroup.type, toWorld: sceneState.scene.matrixWorld.toArray() }, sceneOpts),
            callback: cb
          };

          if (cmd.render_turntable) {
            // farther near for scenes to avoid z-fighting
            camera.near = 4 * STK.Constants.metersToVirtualUnit;
          }
          render(scene, renderer, renderOpts, cmdOpts);
        }

        function onDrained() {
          if (cmd.retexture) {
            var count = 0;
            async.whilst(function() {
              return count < cmd.retexture;
            }, function(cb) {
              count++;
              // reseed and retexture
              var name = outbasename + '.' + count;
              var retextureOpts = _.get(cmd, 'scene.retexture') || {};
              var newseed = (count === 1 && retextureOpts.seed)? retextureOpts.seed : rng.randBits(31);
              console.log('retexturing with seed ' + newseed + ' for ' + name);
              rng.seed(newseed);
              retexture({
                waitTextures: true,
                cache: mainCache,
                sceneState: sceneState,
                assetManager: assetManager,
                rng: rng,
                retexture: retextureOpts
              }, function(err, res) {
                if (err) {
                  console.warn('Error retexturing scene: ', err);
                }
                doRender(name, cb);
              });
            }, function(err, n) {
              wrappedCallback();
            });
          } else {
            doRender(outbasename, wrappedCallback);
          }
        }

        function waitImages() {
          STK.util.waitImagesLoaded(onDrained);
        }

        if (cmd.color_by) {
          STK.scene.SceneUtil.colorScene(sceneState, cmd.color_by, {
            loadIndex: { index: cmd.index, objectIndex: cmd.object_index },
            color: cmd.color,
            encodeIndex: cmd.encode_index,
            writeIndex: cmd.write_index? basename : null,
            restrictToIndex: cmd.restrict_to_color_index,
            fs: STK.fs,
            callback: function(err, res) {
              if (err) {
                console.warn('Error coloring scene: ', err);
              }
              waitImages();
            }
          });
        } else {
          waitImages();
        }
      }, function(error) {
        console.error('Error loading ' + fullId, error);
        callback(error, null);
      });
    } else if (assetGroup.type === STK.Constants.assetTypeModel || assetGroup.type === STK.Constants.assetTypeScan) {
      assetManager.clearCache();
      assetManager.getModelInstance(cmd.source, fullId, function (mInst) {
        // Ensure is normal geometry (for some reason, BufferGeometry not working with ssc)
        STK.geo.Object3DUtil.normalizeGeometry(mInst.object3D, {
          assetName: fullId,
          toGeometry: cmd.to_geometry,
          toNonindexed: cmd.to_nonindexed
        });
        var sceneState = new STK.scene.SceneState(null, mInst.model.info);
        sceneState.addObject(mInst, cmd.auto_align);
        scene.add(sceneState.fullScene);
        var sceneBBox = STK.geo.Object3DUtil.getBoundingBox(mInst.object3D);
        var bbdims = sceneBBox.dimensions();
        console.log('Loaded ' + sceneState.getFullID() +
          ' bbdims: [' + bbdims.x + ',' + bbdims.y + ',' + bbdims.z + ']');
        var bboxes = [];
        var transformInfo = STK.geo.Object3DUtil.applyTransforms(sceneState.fullScene, {
          assetName: fullId,
          hasTransforms: cmd.auto_align || cmd.auto_scale,
          normalizeSize: cmd.normalize_size,
          normalizeSizeTo: cmd.normalize_size_to,
          center: cmd.center,
          bboxes: bboxes,
          debug: true
        });

        var suffix = cmd.output_suffix || cmd.color_by;
        var outbasename = suffix? (basename + '.' + suffix) : basename;
        if (cmd.encode_index) {
          outbasename = outbasename + '.encoded';
        }

        var cmdOpts = _.defaults(
          _.pick(cmd, ['render_all_views', 'render_turntable', 'views', 'view', 'view_index',
            'width', 'height', 'max_width', 'max_height', 'max_pixels', 'save_view_log']));
        convertViews(sceneState, cmdOpts);
        if (cmdOpts.save_view_log) {
          renderer.viewlogFilename = outbasename + '.views.jsonl';
          shell.rm(renderer.viewlogFilename);
        } else {
          renderer.viewlogFilename = null;
        }

        var renderOpts = {
          cameraControls: cameraControls,
          targetBBox: sceneBBox,
          basename: outbasename,
          angleStep: cmd.turntable_step,
          framerate: cmd.framerate,
          tilt: cmd.tilt,
          skipVideo: cmd.skip_video,
          logdata: { fullId: fullId, assetType: assetGroup.type, toWorld: mInst.getObject3D('Model').matrixWorld.toArray() },
          callback: wrappedCallback
        };

        function onDrained() {
          if (cmd.voxels && cmd.voxels !== 'none') {
            mInst.voxels = new STK.model.ModelInstanceVoxels({voxelsField: cmd.voxels});
            mInst.voxels.init(mInst);
            mInst.voxels.loadVoxels(function (v) {
              STK.geo.Object3DUtil.setVisible(mInst.object3D, false);
              scene.add(v.getVoxelNode());
              render(scene, renderer, renderOpts, cmdOpts);
            });
          } else {
            render(scene, renderer, renderOpts, cmdOpts);
          }
        }

        function waitImages() {
          STK.util.waitImagesLoaded(onDrained);
        }

        if (cmd.color_by === 'vertexAttribute' || cmd.color_by === 'faceAttribute') {
          var okay = STK.scene.SceneUtil.colorObject3D(scene, {
            colorBy: cmd.color_by,
            color: cmd.color,
            encodeIndex: cmd.encode_index
          });
          waitImages();
        } else if (cmd.color_by) {
          STK.scene.SceneUtil.colorScene(sceneState, cmd.color_by, {
            loadIndex: { index: cmd.index, objectIndex: cmd.object_index },
            color: cmd.color,
            encodeIndex: cmd.encode_index,
            writeIndex: cmd.write_index? basename : null,
            restrictToIndex: cmd.restrict_to_color_index,
            fs: STK.fs,
            callback: function(err, res) {
              if (err) {
                console.warn('Error coloring scene: ', err);
              }
              waitImages();
            }
          });
        } else {
          waitImages();
        }
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