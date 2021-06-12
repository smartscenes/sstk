#!/usr/bin/env node

var async = require('async');
var path = require('path');
var fs = require('fs');
var shell = require('shelljs');
var STK = require('./stk-ssc');
var cmd = require('./ssc-parseargs');
var THREE = global.THREE;
var _ = STK.util;

STK.ImageUtil.DISABLE_IMAGE_RESIZE = true;  // Don't resize images (no need since not rendering)

cmd
  .version('0.0.1')
  .description('Export parts as separate objs')
  .option('--input <filename>', 'Input path')
  .option('--input_type <type>', 'Input type (id or path)',  /^(id|path)$/, 'path')
  .option('--filter_empty [flag]', STK.util.cmd.parseBoolean, false)
  .option('--collapse_nested [flag]', STK.util.cmd.parseBoolean, false)
  .option('--auto_align [flag]', STK.util.cmd.parseBoolean, false)
  .option('--alignments <filename>', 'CSV of alignments')
  .option('--world_up <vector3>', STK.util.cmd.parseVector)
  .option('--world_front <vector3>', STK.util.cmd.parseVector)
  .option('--split_by_material [flag]', STK.util.cmd.parseBoolean, false)
  .option('--split_by_connectivity [flag]', STK.util.cmd.parseBoolean, false)
  .option('--keep_double_faces_together [flag]', STK.util.cmd.parseBoolean, false)
  .option('--input_format <format>', 'File format to use')
  .option('--output_dir <dir>', 'Base directory for output files', '.')
  .option('--segmentation <filename>', 'Segmentation file')
  .option('--segmentLevels <levels>', 'Segmentation levels', STK.util.cmd.parseList, ['components', 'pieces'])
  .option('--mesh_format <format>', 'Output mesh file format to use', /^(obj|gltf)$/, 'obj')
  .option('--export_materials [flag]', 'Whether to export materials (mtl)')
  .option('--export_textures <type>',
    'How to export textures (`copy` will make copy of original textures, `export` will export jpg or png directly from the images with simple filenames)',
    /^(none|copy|export)$/, 'export')
  .option('--texture_path <dir>', 'Texture path for exported textures', 'images')
  .option('--support_articulated [flag]', 'Whether to parse articulated object', STK.util.cmd.parseBoolean)
  .option('--merge_fixed_parts [flag]', 'Whether to merge fixed parts', STK.util.cmd.parseBoolean)
  .optionGroups(['config_file', 'color_by'])
  .option('--skip_existing', 'Skip rendering existing images [false]')
  .option('--use_search_controller [flag]', 'Whether to lookup asset information online', STK.util.cmd.parseBoolean, false)
  .option('--handle_material_side [flag]', 'Whether to duplicate or reverse face vertices when exporting based on double-sided or back-sided materials', STK.util.cmd.parseBoolean, false)
  .parse(process.argv);

// Parse arguments and initialize globals
if (!cmd.input) {
  console.error('Please specify --input <filename>');
  process.exit(-1);
}
STK.Constants.setWorldUpFront(STK.geo.Object3DUtil.toVector3(cmd.world_up), STK.geo.Object3DUtil.toVector3(cmd.world_front));
STK.materials.Materials.setDefaultMaterialType('phong');

var files = cmd.getInputs(cmd.input);
var assetSources = cmd.getAssetSources(cmd.input_type, files, cmd.assetGroups);
if (assetSources) {
  STK.assets.registerAssetGroupsSync({ assetSources: assetSources });
}

var useSearchController = cmd.use_search_controller;
var assetManager = new STK.assets.AssetManager({
  autoAlignModels: cmd.auto_align, autoScaleModels: false, assetCacheSize: 10,
  useColladaScale: false, convertUpAxis: false,
  supportArticulated: cmd.support_articulated, mergeFixedParts: cmd.merge_fixed_parts,
  searchController: useSearchController? new STK.search.BasicSearchController() : null
});


function exportParts(exporter, exportOpts, object3D, callback) {
  var meshes = STK.geo.Object3DUtil.findNodes(object3D, function(x) { return x instanceof THREE.Mesh; });
  var objectId = exportOpts.name;
  console.log('Process ' + objectId + ' parts got ' + meshes.length);
  async.forEachSeries(meshes, function(mesh, meshCb) {
    var index = mesh.userData.nodeIndex;
    var filename = index;
    // TODO: remove once we fix OBJMTLExporter to handle normals for double faces/reverse faces
    mesh.geometry = STK.geo.GeometryUtil.toGeometry(mesh.geometry);
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

function readAlignmentCsv(filename, idField) {
  var data = STK.fs.loadDelimited(filename).data;
  var defaultUp = STK.geo.Object3DUtil.toVector3([0,0,1]);
  var defaultFront = STK.geo.Object3DUtil.toVector3([0,-1,0]);
  _.each(data, function(r) {
    if (r.up) {
      r.up = STK.geo.Object3DUtil.toVector3(r.up);
    } else {
      r.up = defaultUp;
    }
    if (r.front) {
      r.front = STK.geo.Object3DUtil.toVector3(r.front);
    } else {
      r.front = defaultFront;
    }
  });
  return _.keyBy(data, idField);
}

function getRotationMatrix(alignments, id) {
  var alignment = alignments? alignments[id] : null;
  var rotationMatrix;
  if (alignment) {
    rotationMatrix = STK.geo.Object3DUtil.getAlignmentMatrix(alignment.up, alignment.front, cmd.world_up, cmd.world_front);
  } else {
    console.log('Cannot find alignment for', id);
    rotationMatrix = new THREE.Matrix4();
  }
  console.log('Got alignment', id, alignment, cmd.world_front, cmd.world_up, rotationMatrix);
  return rotationMatrix;
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
  var alignments = cmd.alignments? readAlignmentCsv(cmd.alignments, cmd.id_field) : null;
// TODO: Support different exporters
  var objExporter;
  if (cmd.mesh_format === 'obj') {
    objExporter = new STK.exporters.OBJMTLExporter({ fs: STK.fs });
  } else if (cmd.mesh_format === 'gltf') {
    objExporter = new STK.exporters.GLTFExporter({ fs: STK.fs });
  } else {
    console.error('Unknown output type: ' + cmd.mesh_format);
  }

  var ajsonExporter = new STK.exporters.AJSONExporter({fs: STK.fs});
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
      shell.mkdir('-p', basename + '/leaf_part_obj');

      console.log('Processing ' + name + '(' + index + '/' + names.length + ') with output to ' + outname);
      if (cmd.assetInfo) {
        info = _.defaults(info, cmd.assetInfo);
      }

      function processSegmentedModel(modelInstance, segments) {
        console.log('Processing segmented model ' + name);
        var wrapped = modelInstance.getObject3D('Model');
        var object3D;
        if (segments) {
          object3D = segments.segmentedObject3DHierarchical;
        } else {
          object3D = wrapped.children[0];
          object3D.name = object3D.name.replace('-orig', '');
        }
        STK.geo.Object3DUtil.populateSceneGraphPath(object3D, object3D);
        if (cmd.filter_empty) {
          console.log('Remove empty geometry from ' + name);
          STK.geo.Object3DUtil.removeEmptyGeometries(object3D);
        }
        if (cmd.collapse_nested) {
          console.log('Collapse nested for ' + name);
          object3D = STK.geo.Object3DUtil.collapseNestedPaths(object3D);
        }

        if (object3D.type === 'ArticulatedObject') {
          // Articulated object
          // Output part information as well
          var json = object3D.toArticulatedPartsJson();
          STK.fs.writeToFile(basename + '/' + outname + '.articulated-parts.json', JSON.stringify(json));
        }

        var ajsonExportOpts = {
          dir: basename,
          name: outname,
          keepDoubleFacesTogether: cmd.keep_double_faces_together,
          splitByMaterial: cmd.split_by_material,
          splitByConnectivity: cmd.split_by_connectivity,
          json: {
            rootTransform: wrapped.matrix.toArray()
          }
        };

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

        var objExportOpts = {
          dir: basename + '/leaf_part_obj',
          name: outname,
          getMeshName: 'default',
          handleMaterialSide: cmd.handle_material_side,
          skipMtl: !cmd.export_materials,
          exportTextures: exportTexturesFlag,
          texturePath: '../' + texturePath,
          texturesIndex: new STK.ds.Index(),
          rewriteTexturePathFn: rewriteTexturePath
        };
        console.log('Wait for images');
        STK.util.waitImagesLoaded(function () {
          console.log('Images loaded, exporting parts');
          exportHierarchy(ajsonExporter, ajsonExportOpts, object3D, function (err2, res2) {
            if (err2) {
              console.error('Error exporting hierarchy ' + name, err2);
              callback(err2);
            } else {
              exportParts(objExporter, objExportOpts, res2.indexed.root, function (err3, res3) {
                if (err3) {
                  console.error('Error exporting parts ' + name, err3);
                }
                callback(err3);
              });
            }
          });
        });
      }

      function processModel(modelInstance) {
        if (alignments) {
          var object3D = modelInstance.getObject3D("ModelInstance");
          var rotationMatrix = getRotationMatrix(alignments, outname);
          STK.geo.Object3DUtil.setMatrix(object3D, rotationMatrix);
        }
        modelInstance.object3D.updateMatrixWorld();
        if (cmd.segmentation || cmd.segmentsType) {
          var segmentsType = cmd.segmentsType || 'custom_segmentation';
          var segments = new STK.geo.Segments({
            skipSegmentedObject3D: false,
            segmentLevels: cmd.segmentLevels,
            keepMaterials: true,
            showNodeCallback: function (segmentedObject3D) {
            }
          }, segmentsType);
          var segmentsInfo = modelInstance.model.info[segmentsType];
          if (cmd.segmentation) {
            segmentsInfo = {
              "name": "parts",
              "format": "indexedSegmentation",
              "files": {
                "segmentation": cmd.segmentation
              }
            };
            modelInstance.model.info[segmentsType] = segmentsInfo;
          }
          segments.init(modelInstance);
          segments.loadSegments(function (err, res) {
            if (err) {
              console.error("Error loading segments", err);
              callback(err, res);
            } else {
              processSegmentedModel(modelInstance, segments);
            }
          });
        } else {
          processSegmentedModel(modelInstance);
        }
      }
      console.log('Loading model ' + name);
      assetManager.loadModel(info, function(err, modelInstance) {
        if (err) {
          console.log("Error loading model", err);
        } else {
          console.log('Loaded model ' + name);
          processModel(modelInstance);
        }
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