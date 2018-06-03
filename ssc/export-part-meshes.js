#!/usr/bin/env node

var async = require('async');
var path = require('path');
var fs = require('fs');
var shell = require('shelljs');
var STK = require('./stk-ssc');
var cmd = require('./ssc-parseargs');
var THREE = global.THREE;
var _ = STK.util;

cmd
  .version('0.0.1')
  .description('Export parts as separate objs')
  .option('--input <filename>', 'Input path')
  .option('--filter_empty [flag]', STK.util.cmd.parseBoolean, false)
  .option('--collapse_nested [flag]', STK.util.cmd.parseBoolean, false)
  .option('--auto_align [flag]', STK.util.cmd.parseBoolean, false)
  .option('--world_up <vector3>', STK.util.cmd.parseVector)
  .option('--world_front <vector3>', STK.util.cmd.parseVector)
  .option('--use_ids [flag]', STK.util.cmd.parseBoolean, false)
  .option('--split_by_material [flag]', STK.util.cmd.parseBoolean, false)
  .option('--input_format <format>', 'File format to use')
  .option('--output_dir <dir>', 'Base directory for output files', '.')
  .optionGroups(['config_file', 'color_by'])
  .option('--skip_existing', 'Skip rendering existing images [false]')
  .option('--use_search_controller [flag]', 'Whether to lookup asset information online', STK.util.cmd.parseBoolean, false)
  .parse(process.argv);

// Parse arguments and initialize globals
if (!cmd.input) {
  console.error('Please specify --input <filename>');
  process.exit(-1);
}
STK.Constants.setWorldUpFront(STK.geo.Object3DUtil.toVector3(cmd.world_up), STK.geo.Object3DUtil.toVector3(cmd.world_front));
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
  searchController: useSearchController? new STK.search.BasicSearchController() : null
});

///

// function rewriteTexturePath(src) {
//   var texturePath = p5dGroup.texturePath;
//   if (src.startsWith('/') && texturePath.startsWith('file://')) {
//     texturePath = texturePath.substr(7);
//   }
//   //console.log('Rewriting ' + src + ', replacing ' + texturePath);
//   return src.replace(texturePath, '../../texture/');
// }

function exportParts(exporter, exportOpts, object3D, callback) {
  var meshes = STK.geo.Object3DUtil.findNodes(object3D, function(x) { return x instanceof THREE.Mesh; });
  var objectId = exportOpts.name;
  console.log('Process ' + objectId + ' parts got ' + meshes.length);
  async.forEachSeries(meshes, function(mesh, meshCb) {
    var index = mesh.userData.nodeIndex;
    var filename = index;
    exporter.export(mesh, _.defaults({name: filename, callback: meshCb}, exportOpts));
  }, function(objectErr, objectResults) {
    if (objectErr) {
      console.error('Error exporting ' + objectId + ' to ' + exportOpts.dir + ': ' + objectErr);
    }
    callback();
  });
}

function exportHierarchy(exporter, exportOpts, object3D, callback) {
  exportOpts = _.defaults({ callback: function(err, result) {
      if (result) {
        var json = result.json;
        var outputDir = exportOpts.dir || '.';
        // Leaf ids
        var leafIds = json.leafIds;
        var leadIdsFile = outputDir + '/leaf_part_ids.json';
        fs.writeFileSync(leadIdsFile, JSON.stringify(leafIds));
        // Basic tree
        var basicTree = {};
        for (var i = 0; i < json.nodes.length; i++) {
          basicTree[i] = json.nodes[i].children;
        }
        basicTree['root'] = 0;
        var basicTreeFile = outputDir + '/tree_hier.json';
        fs.writeFileSync(basicTreeFile, JSON.stringify(basicTree));
      }
      callback(err, result);
    }
  }, exportOpts);
  exporter.export(object3D, exportOpts);
}



//STK.Constants.setVirtualUnit(1);
function processFiles() {
  var objExporter = new STK.exporters.OBJMTLExporter({fs: STK.fs});
  var ajsonExporter = new STK.exporters.AJSONExporter({fs: STK.fs});
  var names = files;
  async.forEachOfSeries(names, function (name, index, callback) {
    var basename;
    var info;
    var outname;
    if (cmd.use_ids) {
      var id = name;
      var split = id.split('.');
      outname = split[split.length-1];
      basename = cmd.output_dir + '/' + outname;
      info = {fullId: id, format: cmd.format};
    } else {
      var file = name;
      var split = path.basename(file).split('.');
      outname = split[0];
      basename = cmd.output_dir + '/' + outname;
      info = {file: file, format: cmd.format, assetType: 'model', defaultMaterialType: THREE.MeshPhongMaterial};
    }
    if (cmd.skip_existing && shell.test('-d', basename)) {
      console.warn('Skipping existing scene at ' + basename);
      setTimeout(function () {
        callback();
      }, 0);
    } else {
      shell.mkdir('-p', basename);
      shell.mkdir('-p', basename + '/leaf_part_obj');

      console.log('Processing ' + name + '(' + index + '/' + names.length + ') with output to ' + outname);
      if (cmd.assetInfo) {
        info = _.defaults(info, cmd.assetInfo);
      }

      assetManager.loadModel(info,
        function (err, modelInstance) {
          modelInstance.object3D.updateMatrixWorld();
          var wrapped = modelInstance.getObject3D('Model');
          var object3D = wrapped.children[0];
          object3D.name = object3D.name.replace('-orig', '');
          STK.geo.Object3DUtil.populateSceneGraphPath(object3D, object3D);
          if (cmd.filter_empty) {
            console.log('Remove empty geometry from ' + name);
            STK.geo.Object3DUtil.removeEmptyGeometries(object3D);
          }
          if (cmd.collapse_nested) {
            console.log('Collapse nested for ' + name);
            object3D = STK.geo.Object3DUtil.collapseNestedPaths(object3D);
          }

          var ajsonExportOpts = {
            dir: basename,
            name: outname,
            splitByMaterial: cmd.split_by_material,
            json: {
              rootTransform: wrapped.matrix.toArray()
            }
          };
          var objExportOpts = {
            dir: basename + '/leaf_part_obj',
            name: outname,
            skipMtl: true,
//            rewriteTexturePathFn: rewriteTexturePath
          };
          STK.util.waitImagesLoaded(function () {
            exportHierarchy(ajsonExporter, ajsonExportOpts, object3D, function (err2, res2) {
              if (err2) {
                console.error('Error processing ' + name, err2);
                callback(err2, res2);
              } else {
                exportParts(objExporter, objExportOpts, res2.indexed.root, function (err3, res3) {
                  if (err3) {
                    console.error('Error processing ' + name, err3);
                  }
                  callback(err3, res3);
                });
              }
            });
          });
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