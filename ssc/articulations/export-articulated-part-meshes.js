#!/usr/bin/env node

var async = require('async');
var path = require('path');
var shell = require('shelljs');
var STK = require('../stk-ssc');
var cmd = require('../ssc-parseargs');
var THREE = global.THREE;
var _ = STK.util;

STK.ImageUtil.DISABLE_IMAGE_RESIZE = true;  // Don't resize images (no need since not rendering)

cmd
  .version('0.0.1')
  .description('Export parts as separate objs')
  .option('--input <filename>', 'Input path')
  .option('--input_type <type>', 'Input type (id or path)',  /^(id|path)$/, 'path')
  .option('--auto_align [flag]', STK.util.cmd.parseBoolean, false)
  .option('--world_up <vector3>', STK.util.cmd.parseVector)
  .option('--world_front <vector3>', STK.util.cmd.parseVector)
  .option('--input_format <format>', 'File format to use')
  .option('--output_dir <dir>', 'Base directory for output files', '.')
  .option('--mesh_format <format>', 'Output mesh file format to use', /^(obj|gltf)$/, 'obj')
  .option('--export_materials [flag]', 'Whether to export materials (mtl)')
  .option('--export_textures <type>',
    'How to export textures (`copy` will make copy of original textures, `export` will export jpg or png directly from the images with simple filenames)',
    /^(none|copy|export)$/, 'export')
  .option('--texture_path <dir>', 'Texture path for exported textures', 'images')
//  .option('--support_articulated [flag]', 'Whether to parse articulated object', STK.util.cmd.parseBoolean)
  .option('--merge_fixed_parts [flag]', 'Whether to merge fixed parts', STK.util.cmd.parseBoolean)
  .optionGroups(['config_file', 'color_by'])
  .option('--skip_existing', 'Skip rendering existing images [false]')
  .option('--use_search_controller [flag]', 'Whether to lookup asset information online', STK.util.cmd.parseBoolean, false)
  .parse(process.argv);

// Only export articulated
cmd.support_articulated = true;
// Parse arguments and initialize globals
if (!cmd.input) {
  console.error('Please specify --input <filename>');
  process.exit(-1);
}
STK.Constants.setWorldUpFront(STK.geo.Object3DUtil.toVector3(cmd.world_up), STK.geo.Object3DUtil.toVector3(cmd.world_front));
STK.materials.Materials.setDefaultMaterialType('phong');
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

var useSearchController = cmd.use_search_controller;
var assetManager = new STK.assets.AssetManager({
  autoAlignModels: cmd.auto_align, autoScaleModels: false, assetCacheSize: 10,
  useColladaScale: false, convertUpAxis: false,
  supportArticulated: cmd.support_articulated, mergeFixedParts: cmd.merge_fixed_parts,
  searchController: useSearchController? new STK.search.BasicSearchController() : null
});


function exportParts(exporter, exportOpts, parts, callback) {
  var objectId = exportOpts.name;
  console.log('Process ' + objectId + ' parts got ' + parts.length);
  async.forEachSeries(parts, function(part, partCb) {
    if (part && part.object3D) {
      var index = part.pid;
      var filename = index;
      exporter.export(part.object3D, _.defaults({name: filename, callback: partCb}, exportOpts));
    } else {
      partCb(null);
    }
  }, function(objectErr, objectResults) {
    if (objectErr) {
      console.error('Error exporting ' + objectId + ' to ' + exportOpts.dir + ': ' + objectErr);
    }
    callback();
  });
}

function rewriteTexturePath(src) {
  //console.log('Rewriting ' + src + ', replacing ' + texturePath);
  // src = src.replace(texturePath, '');
  // src = src.replace(/.*\/..\/..\/texture\//, '');
  // src = cmd.texture_path + '/' + src;
  return src;
}

//STK.Constants.setVirtualUnit(1);
function processFiles() {
  var objExporter;
  if (cmd.mesh_format === 'obj') {
    objExporter = new STK.exporters.OBJMTLExporter({ fs: STK.fs });
  } else if (cmd.mesh_format === 'gltf') {
    objExporter = new STK.exporters.GLTFExporter({ fs: STK.fs });
  } else {
    console.error('Unknown output type: ' + cmd.mesh_format);
  }

  var names = files;
  async.forEachOfSeries(names, function (name, index, callback) {
    var basename;
    var info;
    var outname;
    if (cmd.input_type === 'id') {
      var id = name;
      var split = id.split('.');
      outname = split[split.length-1];
      basename = cmd.output_dir + '/' + outname;
      info = {fullId: id, format: cmd.input_format};
    } else if (cmd.input_type === 'path') {
      var file = name;
      var split = path.basename(file).split('.');
      outname = split[0];
      basename = cmd.output_dir + '/' + outname;
      info = {file: file, format: cmd.input_format, assetType: 'model', defaultMaterialType: THREE.MeshPhongMaterial};
    }
    if (cmd.skip_existing && shell.test('-d', basename)) {
      console.warn('Skipping existing scene at ' + basename);
      setTimeout(function () {
        callback();
      }, 0);
    } else {
      shell.mkdir('-p', basename);
      shell.mkdir('-p', basename + '/part_meshes');

      console.log('Processing ' + name + '(' + index + '/' + names.length + ') with output to ' + outname);
      if (cmd.assetInfo) {
        info = _.defaults(info, cmd.assetInfo);
      }

      function processSegmentedModel(err, modelInstance) {
        var wrapped = modelInstance.getObject3D('Model');
        var object3D = wrapped.children[0];
        object3D.name = object3D.name.replace('-orig', '');

        var texturePath = cmd.texture_path;
        var exportTexturesFlag = false;
        if (cmd.export_materials) {
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
        }

        if (object3D.type === 'ArticulatedObject') {
          // Articulated object
          // Output part information as well
          var json = object3D.toArticulatedPartsJson();
          STK.fs.writeToFile(basename + '/' + outname + '.articulated-parts.json', JSON.stringify(json));

          var objExportOpts = {
            dir: basename + '/part_meshes',
            name: outname,
            getMeshName: 'default',

            skipMtl: !cmd.export_materials,
            exportTextures: exportTexturesFlag,
            texturePath: '../' + texturePath,
            texturesIndex: new STK.ds.Index(),
            rewriteTexturePathFn: rewriteTexturePath
          };
          var parts = object3D.parts;
          STK.util.waitImagesLoaded(function () {
            exportParts(objExporter, objExportOpts, parts, function (err3, res3) {
              if (err3) {
                console.error('Error processing ' + name, err3);
              }
              callback(err3, res3);
            });
          });
        } else {
          console.error('Error processing ' + name + ': Not articulated object');
          callback('Not articulated object');
        }
      }

      function processModel(err, modelInstance) {
        modelInstance.object3D.updateMatrixWorld();
        processSegmentedModel(err, modelInstance);
      }
      assetManager.loadModel(info, processModel);
    }
  }, function (err, results) {
    if (err) {
      console.error('Error ' + err);
    }
    console.log('DONE');
  });
}

processFiles();