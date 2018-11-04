#!/usr/bin/env node

var async = require('async');
var path = require('path');
var fs = require('fs');
var shell = require('shelljs');
var STK = require('../stk-ssc');
var cmd = require('../ssc-parseargs');
var THREE = global.THREE;
var _ = STK.util;

cmd
  .version('0.0.1')
  .option('--input <filename>', 'Input path')
  .option('--input_format <format>', 'File format to use', 'suncg')
  .option('--output_dir <dir>', 'Base directory for output files', '.')
  .optionGroups(['config_file', 'color_by'])
  .option('--skip_existing', 'Skip exporting of existing meshes [false]')
  .option('--compress', 'Compress output [false]')
  .option('--texture_path <dir>', 'Texture path', '../../texture')
  .parse(process.argv);

// Parse arguments and initialize globals
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

if (!cmd.assetGroups) { cmd.assetGroups = []; }
if (cmd.assetGroups.indexOf('p5d') < 0) { cmd.assetGroups.push('p5d'); }

if (cmd.assetInfo && cmd.assetInfo.source) {
  var source = cmd.assetInfo.source;
  if (cmd.assetGroups.indexOf(source) < 0) { cmd.assetGroups.push(source); }
}

if (cmd.assetGroups) {
  STK.assets.AssetGroups.registerDefaults();
  var assets = require('../data/assets.json');
  var assetsMap = _.keyBy(assets, 'name');
  STK.assets.registerCustomAssetGroupsSync(assetsMap, cmd.assetGroups);  // Make sure we get register necessary asset groups
}

var output_basename = cmd.output;
var assetManager = new STK.assets.AssetManager({
  autoAlignModels: false, autoScaleModels: false, assetCacheSize: 100 });

//STK.assets.AssetGroups.registerDefaults();
//STK.assets.AssetGroups.setDefaultFormat(cmd.model_format);

var assetGroup = STK.assets.AssetGroups.getAssetGroup('p5d');
var p5dGroup = STK.assets.AssetGroups.getAssetGroup('p5d');

var sceneDefaults = { includeCeiling: true, attachWallsToRooms: true };
if (cmd.assetInfo) {
  sceneDefaults = _.merge(sceneDefaults, cmd.assetInfo);
}
if (cmd.scene) {
  sceneDefaults = _.merge(sceneDefaults, cmd.scene);
}

function rewriteTexturePath(src) {
  var texturePath = p5dGroup.texturePath;
  if (src.startsWith('/') && texturePath.startsWith('file://')) {
    texturePath = texturePath.substr(7);
  }
  //console.log('Rewriting ' + src + ', replacing ' + texturePath);
  src = src.replace(texturePath, '');
  src = src.replace(/.*\/..\/..\/texture\//, '');
  src = cmd.texture_path + '/' + src;
  return src;
}

function exportScene(exporter, exportOpts, sceneState, callback) {
  var scene = sceneState.scene;
  var sceneId = sceneState.info.id;
  var filename = exportOpts.name || sceneId;
  exporter.export(scene, _.defaults({ name: filename, callback: callback }, exportOpts));
}

//STK.Constants.setVirtualUnit(1);
var meshNameFunc = function (node) {
  if (node.userData.id != undefined) {
    return node.userData.type + '#' + node.userData.id;
  }
};
var groupNameFunc = function (node) {
  if (node.userData.type === 'Model') {
    var regex = /p5d\.(\S+)/;
    var matches = regex.exec(node.name);
    return matches ? 'Model#' + matches[1] : node.name;
  } else if (node.userData.archType) {
    return node.userData.archType + '#' + node.userData.id;
  } else if (node.userData.type === 'ModelInstance') {
    return 'Object#' + node.userData.id;
  } else if (node.userData.id != undefined) {
    return node.userData.type + '#' + node.userData.id;
  } else if (node instanceof THREE.Scene) {
    if (node.name) {
      var p = node.name.split('.');
      return p[p.length-1];
    } else {
      return 'Scene';
    }
  }
};
var objExporter = new STK.exporters.OBJMTLExporter({ fs: STK.fs });

function processFiles() {
  async.forEachOfSeries(files, function (file, index, callback) {
    STK.util.clearCache();

    var outputDir = cmd.output_dir;
    var basename = output_basename;
    var scenename;
    if (basename) {
      // Specified output - append index
      if (files.length > 0) {
        basename = basename + '_' + index;
      }
      scenename = basename;
      basename = outputDir? outputDir + '/' + basename : basename;
    } else {
      basename = path.basename(file, path.extname(file)) || 'mesh';
      scenename = basename;
      basename = (outputDir? outputDir : path.dirname(file)) + '/' + basename;
    }

    // Planner5d scenes
    if (cmd.skip_existing && shell.test('-d', basename)) {
      console.warn('Skipping existing scene at ' + basename);
      setTimeout(function () { callback(); }, 0);
    } else {
      shell.mkdir('-p', basename);
      var sceneOpts = _.defaultsDeep({ file: file, assetType: 'scene', format: cmd.input_format }, sceneDefaults);
      assetManager.loadAsset(sceneOpts,
        function (err, sceneState) {
          //console.log(sceneState);
          sceneState.compactify();  // Make sure that there are no missing models
          sceneState.scene.name = scenename;
          var sceneBBox = STK.geo.Object3DUtil.getBoundingBox(sceneState.fullScene);
          var bbdims = sceneBBox.dimensions();
          console.log('Loaded ' + file +
            ' bbdims: [' + bbdims.x + ',' + bbdims.y + ',' + bbdims.z + ']');

          var unit = 1;
          var sceneTransformMatrixInverse = new THREE.Matrix4();
          sceneTransformMatrixInverse.getInverse(sceneState.scene.matrixWorld);
          if (unit) {
            // Hack to put into meters
            var scaleMat = new THREE.Matrix4();
            scaleMat.makeScale(unit, unit, unit);
            sceneTransformMatrixInverse.multiply(scaleMat);
          }
          var exportOpts = {
            dir: basename,
            name: scenename,
            skipMtl: false,
            rewriteTexturePathFn: rewriteTexturePath,
            transform: sceneTransformMatrixInverse,
            defaultUvScale: new THREE.Vector2(0.01, 0.01),
            getMeshName: meshNameFunc,
            getGroupName: groupNameFunc
          };
          function waitImages() {
            STK.util.waitImagesLoaded(function () {
              exportScene(objExporter, exportOpts, sceneState, function () {
                if (cmd.compress) {
                  var objfile = basename + '/' + scenename + '.obj';
                  //console.log('Compressing ' + objfile);
                  STK.util.execSync('xz -f ' + objfile, {encoding: 'utf8'});
                }
                callback();
              });
            });
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
    if (err) {
      console.error('Error ' + err);
    }
    console.log('DONE');
  });
}

processFiles();