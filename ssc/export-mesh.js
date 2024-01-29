#!/usr/bin/env node

var async = require('async');
var path = require('path');
var shell = require('shelljs');
var STK = require('./stk-ssc');
var cmd = require('./ssc-parseargs');
var render_helper = require("./ssc-render-helper");
var THREE = global.THREE;
var _ = STK.util;

STK.ImageUtil.DISABLE_IMAGE_RESIZE = true;  // Don't resize images (no need since not rendering)

cmd
  .version('0.0.1')
  .description('Export asset as single mesh.  Tested with kmz to obj/mtl only.')
  .option('--input <filename>', 'Input path')
  .option('--input_format <format>', 'Input file format to use')
  .option('--input_type <type>', 'Input type (id or path)',  /^(id|path)$/, 'id')
  .option('--assetType <type>', 'Asset type (scene or model)', 'model')
  .option('--assetGroups <groups>', 'Asset groups (scene or model) to load', STK.util.cmd.parseList)
  .option('--output_format <format>', 'Output file format to use', /^(obj|gltf|glb|ply)$/, 'obj')
  .option('--output_dir <dir>', 'Base directory for output files', '.')
  .option('--world_up <vector3>', STK.util.cmd.parseVector)
  .option('--world_front <vector3>', STK.util.cmd.parseVector)
  .optionGroups(['config_file', 'color_by'])
  .option('--skip_existing', 'Skip exporting of existing meshes [false]')
  .option('--compress', 'Compress output [false]')
  .option('--export_textures <type>',
    'How to export textures (`copy` will make copy of original textures, `export` will export jpg or png directly from the images with simple filenames)',
    /^(none|copy|export)$/, 'export')
  .option('--texture_path <dir>', 'Texture path for exported textures', 'images')
  .optionGroups(['transform3d'])
  .option('--mirror <axisplane>', 'Whether to apply mirroring', /^(x|y|z|xz|yz|xy)$/)
  .option('--rewrite_texture_path [flag]', 'Do we need to rewrite the texture path', STK.util.cmd.parseBoolean, false)
  .option('--auto_scale [flag]', 'Whether to auto scale asset', STK.util.cmd.parseBoolean, false)
  .option('--auto_align [flag]', 'Whether to auto align asset', STK.util.cmd.parseBoolean, false)
  .option('--require_faces [flag]', 'Whether to skip geometry without faces when exporting', STK.util.cmd.parseBoolean, false)
  .option('--handle_material_side [flag]', 'Whether to duplicate or reverse face vertices when exporting based on double-sided or back-sided materials', STK.util.cmd.parseBoolean, false)
  .option('--use_search_controller [flag]', 'Whether to lookup asset information online', STK.util.cmd.parseBoolean, false)
  .option('--include_group [flag]', 'Whether to include group g commands in the output obj file', STK.util.cmd.parseBoolean, false)
  .option('--ensure_unique_object_name [flag]', 'Whether to ensure object names in the output obj file are unique', STK.util.cmd.parseBoolean, true)
  .option('--uv_scale <scale>', 'Whether to scale the UV (e.g. 0.01)', STK.util.cmd.parseFloat)
  .option('--embed_images [flag]', 'Whether embed images (for gltf)', STK.util.cmd.parseBoolean, true)
  .option('--material_type <material_type>')
  // options for hiding some parts of the scene
  .option('--show_ceiling [flag]', 'Whether to show ceiling or not', STK.util.cmd.parseBoolean, true)
  .option('--hide_nonparent_arch [flag]', 'Whether to hide arch nodes that are not support parents', STK.util.cmd.parseBoolean, false)
  .option('--hide_empty_regions [flag]', 'Whether to hide empty regions', STK.util.cmd.parseBoolean, false)
  .parse(process.argv);

STK.Constants.setVirtualUnit(1);  // set to meters
STK.Constants.setWorldUpFront(STK.geo.Object3DUtil.toVector3(cmd.world_up), STK.geo.Object3DUtil.toVector3(cmd.world_front));
if (cmd.material_type) {
  STK.materials.Materials.setDefaultMaterialType(cmd.material_type, cmd.material_type);
}

// Parse arguments and initialize globals
if (!cmd.input) {
  console.error('Please specify --input <filename>');
  process.exit(-1);
}

var files = cmd.getInputs(cmd.input);
var output_basename = cmd.output;

// Need to have search controller before registering assets
var useSearchController = cmd.use_search_controller;
var auto_align_models = (cmd.assetType === 'model')? cmd.auto_align : false;
var assetManager = new STK.assets.AssetManager({
  autoAlignModels: auto_align_models, autoScaleModels: cmd.auto_scale, assetCacheSize: 100,
  useColladaScale: false, convertUpAxis: false,
  searchController: useSearchController? new STK.search.BasicSearchController() : null
});

var assetSources = cmd.getAssetSources(cmd.input_type, files, cmd.assetGroups);
if (assetSources) {
  STK.assets.registerAssetGroupsSync({ assetSources: assetSources });
}

var sceneDefaults = { includeCeiling: true, attachWallsToRooms: true };
if (cmd.scene) {
  sceneDefaults = _.merge(sceneDefaults, cmd.scene);
}
if (cmd.assetInfo) {
  sceneDefaults = _.defaults(sceneDefaults, cmd.assetInfo);
}

function rewriteTexturePath(src, originalTexturePath) {
  if (cmd.rewrite_texture_path) {
    // console.log('Rewriting ' + src + ', replacing ' + texturePath);
    src = src.replace(originalTexturePath, '');
    //src = src.replace(/.*\/..\/..\/texture\//, '');
    src = cmd.texture_path + '/' + src;
  }
  return src;
}

function exportScene(exporter, exportOpts, sceneState, callback) {
  var scene = exportOpts.rootObject || sceneState.scene;
  var sceneId = sceneState.info.id;
  var filename = exportOpts.name || sceneId;
  exporter.export(scene, _.defaults({name: filename, callback: callback}, exportOpts));
}

//STK.Constants.setVirtualUnit(1);
var nodeNameFunc = function (node) {
  if (node.userData.type != undefined && node.userData.id != undefined) {
    return node.userData.type + '#' + node.userData.id;
  } else if (node.name != undefined) {
    return node.name;
  } else if (node.userData.id != undefined) {
    var type = node.type.toLowerCase();
    return type + '_' + node.userData.id;
  } else {
    var type = node.type.toLowerCase();
    return type + '_' + node.id;
  }
};

// TODO: Support different exporters
var meshExporter;
var output_is_gltf = false;
if (cmd.output_format === 'obj') {
  meshExporter = new STK.exporters.OBJMTLExporter({ fs: STK.fs });
} else if (cmd.output_format === 'gltf' || cmd.output_format === 'glb') {
  output_is_gltf = true;
  meshExporter = new STK.exporters.GLTFExporter({ fs: STK.fs });
} else if (cmd.output_format === 'ply') {
  meshExporter = new STK.exporters.PLYExporter({ fs: STK.fs });
}

function processFiles() {
  async.forEachOfSeries(files, function (file, index, callback) {
    STK.util.clearCache();

    var outputDir = cmd.output_dir;
    var basename = output_basename;
    var scenename;
    if (basename) {
      // Specified output - append index
      if (files.length > 1) {
        basename = basename + '_' + index;
      }
      scenename = basename;
      basename = outputDir? outputDir + '/' + basename : basename;
    } else {
      if (cmd.input_type === 'id') {
        var idparts = file.split('.');
        var id = idparts[idparts.length-1];
        basename = id;
        scenename = basename;
        basename = (outputDir ? outputDir : '.') + '/' + basename;
      } else if (cmd.input_type === 'path') {
        basename = path.basename(file, path.extname(file)) || 'mesh';
        scenename = basename;
        basename = (outputDir ? outputDir : path.dirname(file)) + '/' + basename;
      }
    }

    if (cmd.skip_existing && shell.test('-d', basename)) {
      console.warn('Skipping existing scene at ' + basename);
      setTimeout(function () { callback(); }, 0);
    } else {
      var texturePath = cmd.texture_path;
      shell.mkdir('-p', basename);
      var info;
      var timings = new STK.Timings();
      timings.start('exportMesh');
      var metadata = {};
      if (cmd.input_type === 'id') {
        info = { fullId: file, format: cmd.input_format, assetType: cmd.assetType, defaultMaterialType: THREE.MeshPhongMaterial };
        metadata.id = file;
      } else if (cmd.input_type === 'path') {
        info = { file: file, format: cmd.input_format, assetType: cmd.assetType, defaultMaterialType: THREE.MeshPhongMaterial };
        metadata.path = file;
      }
      if (cmd.assetInfo) {
        info = _.defaults(info, cmd.assetInfo);
      }

      var exportTexturesFlag = false;
      if (cmd.export_textures === 'none') {
      } else if (cmd.export_textures === 'copy') {
        // TODO: This currently works just for ZipLoader
        // Make sure that this works for textures directly obtained from the internet
        info.options = {
          textureCacheOpts: {
            dir: basename, //+ '/' + texturePath,
            rewritePath: rewriteTexturePath,
            fs: STK.fs
          }
        };
      } else if (cmd.export_textures === 'export') {
        shell.mkdir('-p', basename + '/' + texturePath);
        exportTexturesFlag = true;
      }

      console.log('Load asset', info);
      timings.start('load');
      let loadFunc = info.assetType === 'model' ? 'loadAsset' : 'loadAssetAsScene';
      assetManager[loadFunc](info, function (err, asset) {
        timings.stop('load');
        var sceneState;
        var rootObject;
        var originalTexturePath;
        if (asset instanceof STK.scene.SceneState) {
          sceneState = asset;
        } else if (asset instanceof STK.model.ModelInstance) {
          var modelInstance = asset;
          var sceneInfo = _.defaults(
            { defaultUp: STK.Constants.worldUp, defaultFront: STK.Constants.worldFront, unit: 1 },
            _.pick(modelInstance.model.info, ['id', 'source', 'fullId'])
          );
          sceneState = new STK.scene.SceneState(null, sceneInfo);
          sceneState.addObject(modelInstance, cmd.auto_align || cmd.auto_scale);
          // Hack to discard some nested layers of names for a model instance
          rootObject = modelInstance.getObject3D('Model').children[0];
          originalTexturePath = modelInstance.model.info.texturePath;
        } else if (err) {
          console.error("Error loading asset", info, err);
          return;
        } else {
          console.error("Unsupported asset type ", info, asset);
          return;
        }

        sceneState.compactify();  // Make sure that there are no missing models
        sceneState.scene.name = scenename;
        var sceneBBox = STK.geo.Object3DUtil.getBoundingBox(sceneState.fullScene);
        var bbdims = sceneBBox.dimensions();
        console.log('Loaded ' + file +
          ' bbdims: [' + bbdims.x + ',' + bbdims.y + ',' + bbdims.z + ']');
        var bboxes = [];
        bboxes.push(sceneBBox.toJSON('loaded'));
        var transformInfo = STK.geo.Object3DUtil.normalizeGeometryAndApplyTransforms(sceneState.fullScene, {
          assetName: file,
          hasTransforms: cmd.auto_align || cmd.auto_scale,
          removeEmptyGeometries: cmd.require_faces,
          normalizeSize: cmd.normalize_size,
          normalizeSizeTo: cmd.normalize_size_to,
          center: cmd.center,
          bboxes: bboxes,
          debug: true
        });

        var noTransforms = !transformInfo.hasTransforms;
        var sceneTransformMatrixInverse = new THREE.Matrix4();
        if (noTransforms) {
          sceneTransformMatrixInverse.copy(sceneState.scene.matrixWorld).invert();
          if (cmd.mirror) {
            var t = STK.geo.Object3DUtil.getReflectionMatrix(cmd.mirror);
            sceneTransformMatrixInverse.premultiply(t);
            metadata.transform = t.toArray();
          }
        } else {
          if (cmd.mirror) {
            STK.geo.Object3DUtil.reflect(sceneState.scene, cmd.mirror);
          }
          metadata.transform = sceneState.scene.matrixWorld.toArray();
        }
        if (output_is_gltf) {
          // NOTE: gltf export entire hierarchy with transform
          // So if we want to export with transform, need to make sure that the transform is included
          if (rootObject && sceneState.scene !== rootObject) {
            var matrixWorld = rootObject.matrixWorld.clone();
            rootObject = rootObject.clone();
            matrixWorld.premultiply(sceneTransformMatrixInverse);
            STK.geo.Object3DUtil.setMatrix(rootObject, matrixWorld);
          }
        }
        // Export scene
        var exportOpts = {
          dir: basename,
          name: scenename,
          rootObject: rootObject,
          skipMtl: false,
          binary: true,  // for gltf
          embedImages: cmd.embed_images, // for gltf
          forcePowerOfTwoTextures: false, // for gltf (TODO: determine if still supported and if so, make option)
          skipCameras: true, // for gltf
          exportTextures: exportTexturesFlag,
          handleMaterialSide: cmd.handle_material_side,
          texturePath: texturePath,
          rewriteTexturePathFn: function(src) { return rewriteTexturePath(src, originalTexturePath); },
          transform: sceneTransformMatrixInverse,
          defaultUvScale: cmd.uv_scale? new THREE.Vector2(cmd.uv_scale, cmd.uv_scale) : undefined,
          getMeshName: nodeNameFunc,
          ensureUniqueObjectName: cmd.ensure_unique_object_name,
          getGroupName: cmd.include_group? function(node) {
            // Hack to discard some nested layers of names for a model instance
            if (node === rootObject) {
              return null;
            } else {
              return nodeNameFunc(node);
            }
          } : null
        };
        function waitImages() {
          STK.util.waitImagesLoaded(function () {
            timings.start('export');
            exportScene(meshExporter, exportOpts, sceneState, function (err, result) {
              if (cmd.compress) {
                var objfile = basename + '/' + scenename + '.obj';
                //console.log('Compressing ' + objfile);
                STK.util.execSync('xz -f ' + objfile, {encoding: 'utf8'});
              }
              timings.stop('export');
              timings.stop('exportMesh');
              // Output metadata
              metadata['bbox'] = sceneBBox.toJSON();
              metadata['bboxes'] = bboxes;
              metadata['timings'] = timings;
              metadata['command'] = process.argv;
              if (result && !output_is_gltf) {
                _.defaults(metadata, result);
              }
              STK.fs.writeFileSync(basename + '/' + scenename + ".metadata.json", JSON.stringify(metadata));
              callback();
            });
          });
        }
        render_helper.setVisible(sceneState, cmd);
        render_helper.colorScene(sceneState.fullScene, sceneState, cmd, basename, waitImages);
      });
    }
  }, function (err, results) {
    if (err) {
      console.error('Error ' + err);
    }
    console.log('DONE');
  });
}

processFiles();