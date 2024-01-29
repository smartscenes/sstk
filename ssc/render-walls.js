#!/usr/bin/env node

var cmd = require('./ssc-parseargs');
var path = require('path');
var shell = require('shelljs');
var STK = require('./stk-ssc');
var THREE = global.THREE;
var _ = STK.util;

cmd
  .version('0.0.1')
  .description('Renders images for scene given a set of camera viewpoints')
  .option('--path <path>', 'File path to scene or model')
  .option('--cameras <cameraFile>', 'Read .cam or .conf file with camera extrinsics and intrinsics')
  .option('--output_dir <dir>', 'Base directory for output files', '.')
  .optionGroups(['config_file', 'render_options', 'color_by', 'transform3d', 'norm_geo'])
  .option('--pixels_per_meter <pixels>', 'Pixels per meter [default: 100]', STK.util.cmd.parseInt, 100)
  .parse(process.argv);

STK.Constants.setVirtualUnit(1);  // set to meters
STK.materials.Materials.setDefaultMaterialType('basic', 'basic');  // non-shaded basic material
STK.materials.Materials.DefaultMaterialSide = STK.materials.Materials.getMaterialSide('double', STK.materials.Materials.DefaultMaterialSide);

// parse options and cameras
const rendererOptions = cmd.getRendererOptions(cmd);
const renderer = new STK.PNGRenderer(rendererOptions);
const assetManager = new STK.assets.AssetManager();
const camerasJson = STK.util.readSync(cmd.cameras, 'jsonl');
const cameras = _.map(camerasJson, (camline) => {
  const cam = STK.gfx.Camera.fromJson(camline);  cam.userData = camline;  return cam;
});
const info = { file: cmd.path, assetType: 'model', defaultMaterialType: 'basic', materialSidedness: 'double' };
if (cmd.color_by === 'vertexAttribute') { info.options = { customVertexAttributes: [cmd.color]}; }
if (cmd.color_by === 'faceAttribute') { info.options = { customFaceAttributes: [cmd.color]}; }
let pngOpts = (cmd.color_by === 'depth' && cmd.output_image_encoding != 'rgba') ? { postprocess: { operation: 'unpackRGBAdepth', dataType: 'uint16', metersToUnit: 1000 } } : null;
if (cmd.convert_pixels && pngOpts === null) { pngOpts = { postprocess: { operation: 'convert', dataType: cmd.convert_pixels } }; }
let pngSuffix = cmd.encode_index ? '.encoded.png' : '.png';
if (cmd.color_by) {
  if (cmd.color_by === 'vertexAttribute' || cmd.color_by === 'faceAttribute') {
    pngSuffix = '.' + cmd.color + pngSuffix;
  } else {
    pngSuffix = '.' + cmd.color_by + pngSuffix;
  }
}

const scene = new THREE.Scene();
assetManager.loadAsset(info, function (err, asset) {
  STK.geo.Object3DUtil.normalizeGeometry(asset.object3D, { toGeometry: cmd.to_geometry, toNonindexed: cmd.to_nonindexed });
  scene.add(asset.object3D);
  function onDrained() {
    shell.mkdir('-p', cmd.output_dir);
    for (let i = 0; i < cameras.length; i++) {
      const cam = cameras[i];
      const filename = path.join(cmd.output_dir, (cam.name || i) + pngSuffix);
      renderer.setSize(parseInt(cam.userData.width * cmd.pixels_per_meter), parseInt(cam.userData.height * cmd.pixels_per_meter));
      const pixels = renderer.renderToPng(scene, cam, filename, pngOpts);
    }
  };
  if (cmd.color_by) {
    const okay = STK.scene.SceneUtil.colorObject3D(scene, { colorBy: cmd.color_by, color: cmd.color, encodeIndex: cmd.encode_index, bgcolor: 'white', ensureVertexColorSamePerTri: true });
    if (okay) { STK.util.waitImagesLoaded(onDrained); }
  } else {
    STK.util.waitImagesLoaded(onDrained);
  }
});
