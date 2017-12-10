#!/usr/bin/env node

var async = require('async');
var fs = require('fs');
var shell = require('shelljs');
var STK = require('./stk-ssc');
var cmd = require('./ssc-parseargs');
var THREE = global.THREE;

cmd
  .version('0.0.1')
  .option('--id <id>', 'Scene or model id [default: 0020d9dab70c6c8cfc0564c139c82dce]', '0020d9dab70c6c8cfc0564c139c82dce')
  .option('--ids_file <file>', 'File with model ids')
  .option('--source <source>', 'Scene or model source [default: p5dScene]', 'p5dScene')
  .option('--format <format>', 'Asset format')
  .option('--output_dir <dir>', 'Base directory for output files', '.')
  .option('--output_suffix <suffix>', 'Suffix to use in output png (sceneId.suffix.png)')
  .option('--use_subdir','Put output into subdirectory per id [false]')
  .optionGroups(['config_file', 'scene', 'render_options', 'view', 'render_views', 'color_by', 'asset_cache'])
  .option('--skip_existing', 'Skip rendering existing images [false]')
  .option('--use_lights', 'Use local lights and shadows [false]')
  .option('--voxels <voxel-type>', 'Type of voxels to use [default: none]', 'none')
  .option('--extra <extra>', 'Additional stuff to render [wall|navmap]',
  /*/^(wall|navmap)$/, */ STK.util.cmd.collect, [])
  .option('--level <level>', 'Scene level to render', STK.util.cmd.parseInt)
  .option('--room <room>', 'Room id to render [null]')
  .option('--show_ceiling [flag]', 'Whether to show ceiling or not', STK.util.cmd.parseBoolean, false)
  .option('--seed <num>', 'Random seed to use', STK.util.cmd.parseInt, 12345678)
  .option('--repeat <num>', 'Number of times to repeat rendering of scene (for stress testing)', STK.util.cmd.parseInt, 1)
  .option('--heapdump <num>', 'Number of times to dump the heap (for memory debugging)', STK.util.cmd.parseInt, 0)
  .parse(process.argv);

var useSearchController = STK.Constants.baseUrl.startsWith('http://') || STK.Constants.baseUrl.startsWith('https://');
// Parse arguments and initialize globals
STK.Constants.setVirtualUnit(1);  // set to meters
var renderer = new STK.PNGRenderer({
  width: cmd.width,
  height: cmd.height,
  useAmbientOcclusion: cmd.encode_index? false : cmd.use_ambient_occlusion,
  useLights: cmd.encode_index? false : cmd.use_lights,
  useShadows: cmd.encode_index? false : cmd.use_shadows,
  compress: cmd.compress_png,
  skip_existing: cmd.skip_existing,
  reuseBuffers: true
});
var assetManager = new STK.assets.AssetManager({
  autoAlignModels: false,
  autoScaleModels: false,
  assetCacheSize: cmd.assetCacheSize,
  enableLights: cmd.use_lights,
  defaultLightState: cmd.use_lights,
  searchController: useSearchController? new STK.search.BasicSearchController() : null
});
var ids = cmd.id ? [cmd.id] : ['0020d9dab70c6c8cfc0564c139c82dce'];

STK.assets.AssetGroups.registerDefaults();
var assets = require('./data/assets.json');
var assetsMap = _.keyBy(assets, 'name');
STK.assets.registerCustomAssetGroupsSync(assetsMap, [cmd.source]);
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

var sceneDefaults = { includeCeiling: true, defaultMaterialType: THREE.MeshPhongMaterial, preload: cmd.extra };
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

function getAggregatedSceneStatistics(cache, cb) {
  if (cache.aggregatedSceneStatistics) {
    setTimeout(function() { cb(null, cache.aggregatedSceneStatistics); }, 0);
  } else {
    var p5dSceneAssetGroup = STK.assets.AssetGroups.getAssetGroup('p5dScene');
    cache.aggregatedSceneStatistics = new STK.ssg.SceneStatistics;
    cache.aggregatedSceneStatistics.importCsvs({
      fs: STK.fs,
      basename: p5dSceneAssetGroup.rootPath + '/stats/suncg',
      callback: function(err, data) {
        cb(err, cache.aggregatedSceneStatistics);
      }
    })
  }
}

function retexture(opts, cb) {
  getAggregatedSceneStatistics(opts.cache, function(err, aggregatedSceneStatistics) {
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
  });
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
    var light = STK.gfx.Lights.getDefaultHemisphereLight(cmd.use_lights, cmd.use_lights);
    var camera = STK.gfx.Camera.fromJson(cameraConfig, cmd.width, cmd.height);
    scene.add(light);
    scene.add(camera);
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

    // Planner5d scenes
    if (assetGroup.type === STK.Constants.assetTypeScene) {
      var floor = cmd.level;
      var room = cmd.room;
      if (floor != null) {
        basename += '_' + floor;
        if (room != null) {
          basename += '_' + room;
        }
      }
      var sceneOpts = _.defaults({fullId: fullId, floor: floor, room: room}, sceneDefaults);
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
              var collisionProcessor = STK.sim.CollisionProcessorFactory.createCollisionProcessor();
              if (extraInfo.data) {
                var navscene = new STK.nav.NavScene({
                  sceneState: sceneState,
                  tileOverlap: 0.25,
                  baseTileHeight: collisionProcessor.traversableFloorHeight * STK.Constants.metersToVirtualUnit,
                  isValid: function (position) {
                    return collisionProcessor.isPositionInsideScene(sceneState, position);
                  }
                });
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

        function render(outbasename, cb) {
          var renderOpts = {
            cameraControls: cameraControls,
            targetBBox: sceneBBox,
            basename: outbasename,
            angleStep: cmd.turntable_step,
            framerate: cmd.framerate,
            tilt: cmd.tilt,
            skipVideo: cmd.skip_video,
            callback: cb
          };

          if (cmd.render_all_views) {
            renderer.renderAllViews(scene, renderOpts);
          } else if (cmd.render_turntable) {
            // farther near for scenes to avoid z-fighting
            camera.near = 4 * STK.Constants.metersToVirtualUnit;
            renderer.renderTurntable(scene, renderOpts);
          } else if (cmd.view) {
            var viewOpts = cmd.view.position? cmd.view : cameraControls.getView(_.merge(Object.create(null), cmd.view, { target: scene }));
            if (viewOpts.imageSize) {
              //console.log('got', viewOpts);
              var width = viewOpts.imageSize[0];
              var height = viewOpts.imageSize[1];
              if (width !== renderer.width || height !== renderer.height) {
                renderer.setSize(width, height);
                camera.aspect = width / height;
              }
            }
            cameraControls.viewTarget(viewOpts);
            renderer.renderToPng(scene, camera, outbasename);
            setTimeout( function() { cb(); }, 0);
          } else {  // top down view is default
            var views = cameraControls.generateViews(sceneBBox, cmd.width, cmd.height);
            cameraControls.viewTarget(views[cmd.view_index]);  // default
            // cameraControls.viewTarget({ targetBBox: sceneBBox, viewIndex: 4, distanceScale: 1.1 });
            renderer.renderToPng(scene, camera, outbasename);
            setTimeout( function() { cb(); }, 0);
          }
        }

        function onDrained() {
          if (cmd.retexture) {
            var count = 0;
            async.whilst(function() {
              return count < cmd.retexture;
            }, function(cb) {
              count++;
              // reseed and retexure
              var name = outbasename + '.' + count;
              var newseed = (count === 1 && cmd.scene.retexture && cmd.scene.retexture.seed)? cmd.scene.retexture.seed : rng.randBits(31);
              console.log('retexturing with seed ' + newseed + ' for ' + name);
              rng.seed(newseed);
              retexture({
                waitTextures: true,
                cache: mainCache,
                sceneState: sceneState,
                assetManager: assetManager,
                rng: rng,
                retexture: cmd.scene.retexture
              }, function(err, res) {
                render(name, cb);
              });
            }, function(err, n) {
              wrappedCallback();
            });
          } else {
            render(outbasename, wrappedCallback);
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
        STK.geo.Object3DUtil.traverseMeshes(mInst.object3D, false, function(m) {
          m.geometry = STK.geo.GeometryUtil.toGeometry(m.geometry);
        });
        var sceneState = new STK.scene.SceneState(null, mInst.model.info);
        sceneState.addObject(mInst);
        scene.add(sceneState.fullScene);
        var sceneBBox = STK.geo.Object3DUtil.getBoundingBox(mInst.object3D);

        var renderOpts = {
          cameraControls: cameraControls,
          targetBBox: sceneBBox,
          basename: basename,
          angleStep: cmd.turntable_step,
          framerate: cmd.framerate,
          tilt: cmd.tilt,
          skipVideo: cmd.skip_video,
          callback: wrappedCallback
        };

        function render() {
          if (cmd.render_all_views) {
            renderer.renderAllViews(scene, renderOpts);
          } else if (cmd.render_turntable) {
            renderer.renderTurntable(scene, renderOpts);
          } else if (cmd.view) {
            var viewOpts = cmd.view.position? cmd.view : cameraControls.getView(_.merge(Object.create(null), cmd.view, { target: scene }));
            if (viewOpts.imageSize) {
              //console.log('got', viewOpts);
              var width = viewOpts.imageSize[0];
              var height = viewOpts.imageSize[1];
              if (width !== renderer.width || height !== renderer.height) {
                renderer.setSize(width, height);
                camera.aspect = width / height;
              }
            }
            cameraControls.viewTarget(viewOpts);
            renderer.renderToPng(scene, camera, outbasename);
            setTimeout( function() { cb(); }, 0);
          } else {  // top down view is default
            cameraControls.viewTarget({
              targetBBox: sceneBBox,
              //viewIndex: 4,
              phi: 0,
              theta: Math.PI / 4,
              distanceScale: 1.5
            });
            renderer.renderToPng(scene, camera, basename + '.png');
            setTimeout( function() { wrappedCallback(); }, 0);
          }
        }

        function onDrained() {
          if (cmd.voxels && cmd.voxels !== 'none') {
            mInst.voxels = new STK.model.ModelInstanceVoxels({voxelsField: cmd.voxels});
            mInst.voxels.init(mInst);
            mInst.voxels.loadVoxels(function (v) {
              STK.geo.Object3DUtil.setVisible(mInst.object3D, false);
              scene.add(v.getVoxelNode());
              render();
            });
          } else {
            render();
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
