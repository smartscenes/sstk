#!/usr/bin/env node

var cmd = require('./ssc-parseargs');
var path = require('path');
var shell = require('shelljs');
var STK = require('./stk-ssc');
var THREE = global.THREE;
var _ = STK.util;

STK.Constants.setVirtualUnit(1);  // set to meters

cmd
  .version('0.0.2')
  .description('Renders images for scene given a set of camera viewpoints')
  .option('--id <id>', 'Scene or model id [default: scene0000_00]', 'scene0000_00')
  .option('--source <source>', 'Scene or model source [default: scan2cad]', 'scan2cad')
  .option('--level <level>', 'Scene level to render', STK.util.cmd.parseInt)
  .option('--path <path>', 'File path to scene or model')
  .option('--format <format>', 'File format to use')
  .option('--assetType <type>', 'Asset type (scene or model)')
  .option('--assetGroups <groups>', 'Asset groups (scene or model) to load', STK.util.cmd.parseList)
  .option('--cameras <cameraFile>', 'Read .cam or .conf file with camera extrinsics and intrinsics')
  .option('--cameraSceneUp <vec3>', 'Coordinate frame (up-dir) that the camera is specified in', STK.util.cmd.parseVector)
  .option('--cameraSceneFront <vec3>', 'Coordinate frame (front-dir) that the camera is specified in', STK.util.cmd.parseVector)
  .option('--filterCameras <filter>', 'Filter cameras', STK.util.cmd.parseRegex)
  .option('--lookDir <vec3>', 'Set look dir (overriding camera pose)', STK.util.cmd.parseVector)
  .option('-n, --limit <num>', 'Limit on number of cameras to render', STK.util.cmd.parseInt, -1)
  .option('--output_dir <dir>', 'Base directory for output files', '.')
  .optionGroups(['config_file', 'render_options', 'color_by', 'transform3d', 'norm_geo'])
  .option('--width <width>', 'Image width [default: 640]', STK.util.cmd.parseInt, 640)
  .option('--height <height>', 'Image height [default: 480]', STK.util.cmd.parseInt, 480)
  .option('--view_index <index>', 'View index to use for debugging')
  .option('--material_type <material_type>')
  .option('--material_side <material_side>')
  .option('--auto_align [flag]', 'Whether to auto align asset', STK.util.cmd.parseBoolean, false)
  .option('--use_search_controller [flag]', 'Whether to lookup asset information online', STK.util.cmd.parseBoolean, false)
  .option('--debug [flag]', 'Debug', STK.util.cmd.parseBoolean, false)
  .parse(process.argv);
var argv = cmd;
if (!cmd.cameras) {
  if (cmd.views && cmd.camera) {
    // okay
  } else {
    console.error('Please specify --cameras <cameraFile>');
    process.exit(-1);
  }
}
if (cmd.id == null && cmd.path == null) {
  console.error('Please specify either --id or --path');
  process.exit(-1);
}
cmd.material_type = cmd.material_type;
if (cmd.material_type) {
  STK.materials.Materials.setDefaultMaterialType(cmd.material_type, cmd.material_type);
}
if (cmd.material_side) {
  STK.materials.Materials.DefaultMaterialSide = STK.materials.Materials.getMaterialSide(cmd.material_side, STK.materials.Materials.DefaultMaterialSide);
}

// Parse arguments and initialize globals
var outdir = argv.output_dir;
var maxViews = argv.limit;
var width = argv.width;
var height = argv.height;
var useLights = argv.use_lights;
var usePhysicalLights = argv.use_physical_lights;

var rendererOptions = cmd.getRendererOptions(cmd);
var renderer = new STK.PNGRenderer(rendererOptions);
var assetManager = new STK.assets.AssetManager({
  autoAlignModels: cmd.auto_align,
  autoScaleModels: false,
  assetCacheSize: 50,
  enableLights: useLights,
  defaultLightState: useLights,
  searchController: cmd.use_search_controller? new STK.search.BasicSearchController() : null
});

var assetSources = cmd.getAssetSources(null, null, cmd.assetGroups);
if (assetSources) {
  STK.assets.registerAssetGroupsSync({ assetSources: assetSources });
}

function readConfFile(lines) {
  var cameras = [];
  var intrinsics;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line.startsWith('intrinsics_matrix')) {
      // intrinsics_matrix <fx> 0 <cx>  0 <fy> <cy> 0 0 1
      var t = line.split(/\s+/).slice(1).map(function (s) { return parseFloat(s); });
      intrinsics = { width: argv.width, height: argv.height, fx: t[0], fy: t[4], cx: t[2], cy: t[5] };
    } else if (line.startsWith('scan')) {
      // scan <depth_image_filename> <color_image_filename> <camera-to-world-matrix>
      var parts = line.split(/\s+/);
      var extrinsics_array = parts.slice(3).map(function (s) { return parseFloat(s); });
      var extrinsics = STK.geo.Object3DUtil.arrayToMatrix4(extrinsics_array, true);
      var cam = new STK.gfx.Camera();
      cam.initFromExtrinsicsIntrinsics(extrinsics, intrinsics);
      cam.name = parts[2].split('.')[0];  // color_image_filename without extension
      cameras.push(cam);
    }
  }
  return cameras;
}

function jsonToCamera(json, aspect, defaults) {
  var cam;
  if (json.camera.type != null) {
    cam = STK.gfx.Camera.fromJson(json.camera);
    if (aspect != null) {
      cam.aspect = aspect;
    }
  } else {
    cam = new STK.gfx.Camera(45, aspect, 0.001, 1000);
  }
  if (json.camera.isEquirectangular) {
    cam.isEquirectangular = true;
  }
  if (json.camera.fov) {
    cam.fov = json.camera.fov;
  }
  if (json.camera.extrinsics) {
    var camDir = json.camera.direction? STK.geo.Object3DUtil.toVector3(json.camera.direction) : null;
    var extrinsics = STK.geo.Object3DUtil.arrayToMatrix4(json.camera.extrinsics, json.camera.isRowMajor);
    //console.log('camDir', camDir.clone().applyMatrix4(new THREE.Matrix4().extractRotation(extrinsics)));
    cam.initFromExtrinsicsIntrinsics(extrinsics, null, camDir);
    //console.log('camDir2', cam.getWorldDirection(new THREE.Vector3()));
  } else if (json.camera.position && json.camera.rotation) {
    if (json.camera.up) {
      cam.up.set(...json.camera.up);
    } else {
      cam.up.set(0, 0, 1);
    }
    cam.position.set(...json.camera.position);
    cam.rotation.set(...json.camera.rotation);
  } else if ((json.camera.lookat || json.camera.target) && json.camera.position) {
    if (json.camera.up) {
      cam.up.set(...json.camera.up);
    } else {
      cam.up.set(0, 0, 1);
    }
    // cam.position.set(...json.camera.position);
    // cam.lookAt(...json.camera.lookat);
    STK.gfx.Camera.setView(cam, { target: (json.camera.lookat || json.camera.target), position: json.camera.position });
  } else if (json.camera.dof && json.camera.center) {
    var dof = json.camera.dof;
    var c = json.camera.center;
    cam.up.set(0, 0, 1);
    cam.position.set(dof[0] + c[0], dof[1] + c[1], dof[2] + c[2]);
    cam.rotation.set(dof[3], dof[4], dof[5]);
  }
  cam.updateMatrix();
  cam.updateProjectionMatrix();
  // Set camera name if not already set
  if (!(cam.name && cam.name.length > 0)) {
    cam.name = json.id;
  }
  // Associate bbox information with the camera view
  if (json.bbox_corner) {
    cam.object_id = json.object_id;
    var points = json.bbox_corner.map(function(p) {
      return new THREE.Vector3(...p);
    });
    //console.log('got points', points);
    var useAABB = false;
    if (useAABB) {
      var bbox = new STK.geo.BBox();
      bbox.includePoints(points);
      cam.bbox = bbox;
    } else {
      cam.bbox = STK.geo.OBBFitter.fitPointsOBB(points, {constrainVertical: true, upAxis: 'z'});
    }
    cam.bbox_corners = points;
    //console.log('got bbox corners', cam.bbox.getCorners());
  }
  // console.log(cam.name, cam.position.toArray(), cam.rotation.toArray());
  return cam;
}

var id = argv.id;
var fullId = argv.source + '.' + id;
var level = argv.level;
var aspect = width / height;
var cameras = [];
if (argv.cameras) {
  // Camera are specified
  var defaultCam = {};
  if (argv.camera) {
    defaultCam = argv.camera;
  }
  if (argv.cameras.endsWith('.json')) {
    var json = STK.util.readSync(argv.cameras, 'json');
    cameras = _.map(json, (el) => jsonToCamera(_.defaultsDeep(el, { camera: defaultCam }), aspect));
  } else if (argv.cameras.endsWith('.jsonl')) {
    var json = STK.util.readSync(argv.cameras, 'jsonl');
    cameras = _.map(json, (el) => jsonToCamera(_.defaultsDeep(el, { camera: defaultCam }), aspect));
  } else {
    var camlines = STK.util.readSync(argv.cameras).split('\n');
    if (camlines[0].startsWith('dataset')) {  // .conf file
      cameras = readConfFile(camlines);
    } else { // GAPS .cam file
      for (var i = 0; i < camlines.length; i++) {
        var camline = camlines[i];
        if (camline && camline.length) {
          var cam = new STK.gfx.Camera();
          cam.initFromGapsString(camline, aspect);
          cameras.push(cam);
        }
      }
    }
  }
  if (argv.filterCameras) {
    cameras = cameras.filter(x => x.name.match(argv.filterCameras));
  }
  if (argv.lookDir) {
    var lookAt = new THREE.Vector3();
    var lookDir = new THREE.Vector3(...argv.lookDir);
    console.log('Use lookDir', lookDir);
    for (var i = 0; i < cameras.length; i++) {
      lookAt.copy(cameras[i].position).add(lookDir);
      cameras[i].lookAt(lookAt);
    }
  }
} else if (argv.views && argv.camera) {
  cameras = _.map(argv.views, (json) => {
    var cam = _.defaults(Object.create(null), json, argv.camera);
    return jsonToCamera({ camera: cam }, aspect);
  });
}

function addBoxToDebug(box, debugNode) {
  var bboxFromCorners = new STK.geo.MeshHelpers.FatLines(box.bbox_corners, 0.005, 'red', { inputType: 'boxCorners' });
  //STK.geo.Object3DUtil.setDepthTest(bboxFromCorners, false);
  //STK.geo.Object3DUtil.setDepthWrite(bboxFromCorners, false);
  var bboxFromObbCorners = new STK.geo.MeshHelpers.FatLines(box.bbox.getCornersVisOrder(), 0.005, 'orange', { inputType: 'boxCorners' });
  var bboxFromObb = new STK.geo.MeshHelpers.OBB(box.bbox, 'gray').toWireFrame(0.005, false, 'blue');
  debugNode.add(bboxFromCorners);
  debugNode.add(bboxFromObbCorners);
  debugNode.add(bboxFromObb);
}

var bboxes = [];
for (var i = 0; i < cameras.length; i++) {
  var cam = cameras[i];
  if (cam.bbox) {
    var index = (typeof cam.object_id === 'string')? parseInt(cam.object_id) : cam.object_id;
    var color = new THREE.Color();
    if (cmd.encode_index) {
      color.setHex(index);
    } else {
      color = STK.Colors.createColor(index);
    }
    bboxes.push({
      objectId: index,
      bbox: cam.bbox,
      bbox_corners: cam.bbox_corners,
      color: color
    });
  }
}

var scene = new THREE.Scene();

// Add specified lights, or default hemisphere light
if (cmd.lights) {
  var lights = STK.gfx.Lights.setupLights(cmd.lights);
  for (var i = 0; i < lights.length; i++) {
    scene.add(lights[i]);
  }
} else {
  var light = STK.gfx.Lights.getDefaultHemisphereLight(usePhysicalLights, useLights);
  scene.add(light);
}

// Create default camera
var view_index = cmd.view_index;

// Load scene
var info = { fullId: fullId, floor: level, format: argv.format, assetType: argv.assetType, includeCeiling: true };
if (argv.path) {
  // A file path is provided... hmmm
  info = {
    file: argv.path,
    format: argv.format,
    assetType: argv.assetType,
    defaultMaterialType: STK.materials.Materials.DefaultMaterialType
  };
}
if (argv.material_type != null) {
  info.defaultMaterialType = argv.material_type;
}
if (argv.material_side != null) {
  info.materialSidedness = argv.material_side;
}
if (argv.color_by === 'vertexAttribute') {
  info.options = { customVertexAttributes: [argv.color]};
} else if (argv.color_by === 'faceAttribute') {
  info.options = { customFaceAttributes: [argv.color]};
}

var useSceneState = false;
assetManager.loadAsset(info, function (err, asset) {
  var sceneState;
  if (asset instanceof STK.scene.SceneState) {
    sceneState = asset;
    sceneState.compactify();  // Make sure that there are no missing models
    scene.add(sceneState.fullScene);
    useSceneState = true;
  } else if (asset instanceof STK.model.ModelInstance) {
    var modelInstance = asset;
    STK.geo.Object3DUtil.normalizeGeometry(modelInstance.object3D, {
      assetName: fullId,
      toGeometry: cmd.to_geometry,
      toNonindexed: cmd.to_nonindexed
    });
    if (useSceneState) {
      sceneState = new STK.scene.SceneState(null, modelInstance.model.info);
      //console.log(modelInstance.model.info);
      sceneState.addObject(modelInstance);
      scene.add(sceneState.fullScene);
    } else {
      scene.add(modelInstance.object3D);
    }
  } else {
    console.error("Unsupported asset type " + fullId, asset);
    return;
  }
  scene.updateMatrixWorld();
  var sceneBBox = STK.geo.Object3DUtil.getBoundingBox(scene);
  var bbdims = sceneBBox.dimensions();
  console.log('Loaded ' + (info.fullId? info.fullId : info.file) +
    ' bbdims: [' + bbdims.x + ',' + bbdims.y + ',' + bbdims.z + ']');
  console.log(sceneBBox.toJSON());
  var bboxes = [sceneBBox.toJSON('loaded')];
  var transformInfo = STK.geo.Object3DUtil.applyTransforms(scene, {
    assetName: fullId,
    hasTransforms: cmd.auto_align || cmd.auto_scale,
    normalizeSize: cmd.normalize_size,
    normalizeSizeTo: cmd.normalize_size_to,
    center: cmd.center,
    bboxes: bboxes,
    debug: true
  });

  if (cmd.cameraSceneUp != null && cmd.cameraSceneFront != null) {
    var camSceneUp = STK.geo.Object3DUtil.toVector3(cmd.cameraSceneUp);
    var camSceneFront = STK.geo.Object3DUtil.toVector3(cmd.cameraSceneFront);
    var cameraSceneToWorld = STK.geo.Object3DUtil.getAlignmentMatrix(
      camSceneUp, camSceneFront, STK.Constants.worldUp, STK.Constants.worldFront);
    //console.log('apply camera scene up/front', cameraSceneToWorld);
    for (var i = 0; i < cameras.length; i++) {
      cameras[i].applyTransform(cameraSceneToWorld);
    }
  } else if (sceneState != null) {
    //console.log('apply scene state transform', sceneState.scene.matrixWorld);
    // apply scene transform on cam
    for (var i = 0; i < cameras.length; i++) {
      cameras[i].applyTransform(sceneState.scene.matrixWorld);
    }
  }
  var defaultCamera = null;
  if (view_index != null) {
    defaultCamera = new THREE.PerspectiveCamera(50, aspect,
      0.1*STK.Constants.metersToVirtualUnit, 400*STK.Constants.metersToVirtualUnit);
    scene.add(defaultCamera);
    var cameraControls = new STK.controls.CameraControls({
      camera: defaultCamera,
      controlType: 'none',
      container: renderer.canvas,
      cameraPositionStrategy: 'positionByCentroid'
    });
    if (view_index < 0) {
      cameraControls.viewTarget({
        targetBBox: sceneBBox,
        phi: -Math.PI / 4,
        theta: Math.PI / 6,
        distanceScale: 2.0
      });
    } else {
      var views = cameraControls.generateViews(sceneBBox, width, height);
      cameraControls.viewTarget(views[view_index]);  // default
      console.log(views[view_index]);
    }
    if (cameras.length == 0) {
      cameras.push(defaultCamera);
    }
  }

  var debugNode = new THREE.Group();
  if (useSceneState) {
    STK.geo.Object3DUtil.setMatrix(debugNode, sceneState.scene.matrixWorld);
  }
  scene.add(debugNode);

  var name = info.file? path.basename(info.file, path.extname(info.file)) : id;
  var basename = outdir + '/' + name + ((level != undefined)? ('_' + level):'');
  var onDrained = function() {
    // render each camera's view
    var nCams = (maxViews> 0)? Math.min(cameras.length, maxViews) : cameras.length;
    var suffix = cmd.encode_index? '.encoded.png' : '.png';
    if (cmd.color_by) {
      if (cmd.color_by === 'vertexAttribute' || cmd.color_by === 'faceAttribute') {
        suffix = '.' + cmd.color + suffix;
      } else {
        suffix = '.' + cmd.color_by + suffix;
      }
    }
    shell.mkdir('-p', outdir);
    for (var i = 0; i < nCams; i++) {
      var cam = cameras[i];
      var filename;
      if (cam.name && cam.name.length > 0) {
        filename = outdir + '/' + cam.name + suffix;
      } else {
        filename = basename + '-' + i + suffix;
      }
      var opts = cmd.color_by === 'depth' && cmd.output_image_encoding != 'rgba' ? {
        postprocess: { operation: 'unpackRGBAdepth', dataType: 'uint16', metersToUnit: 1000 }
      } : null;
      if (cmd.convert_pixels && opts === null) {
        opts = {
          postprocess: { operation: 'convert', dataType: cmd.convert_pixels }
        };
      }

      if (cmd.color_by === 'vertexInBox') {
        STK.scene.SceneUtil.colorObject3D(scene, {
          colorBy: cmd.color_by,
          bbox: cam.bbox,
          color: cmd.color,
          bgcolor: 'black',
          ensureVertexColorSamePerTri: true
        });
      }
      if (cmd.debug && cam.bbox) {
        addBoxToDebug(cam, debugNode);
      }
      if (cmd.debug_all && bboxes) {
        for (var bi = 0; bi < bboxes.length; bi++) {
          addBoxToDebug(bboxes[bi], debugNode);
        }
      }
      if (defaultCamera) {
        cam = defaultCamera;
      }
      var pixels = renderer.renderToPng(scene, cam, filename, opts);
      //var counts = STK.ImageUtil.getIndexCounts(pixels);
      //console.log('got counts', counts);
      STK.geo.Object3DUtil.removeAllChildren(debugNode);
    }

    // // add camera frustums to scene
    // for (var j = 0; j < cameras.length; j++) {
    //   var frustum = STK.geo.Object3DUtil.makeCameraFrustum(cameras[j]);
    //   debugNode.add(frustum);
    // }

    // // render default view with frustums
    // var views = cameraControls.generateViews(sceneBBox, width, height);
    // cameraControls.viewTarget(views[0]);
    // renderer.renderToPng(scene, defaultCamera, basename + '-' + i + suffix);
  };

  function waitImages() {
    STK.util.waitImagesLoaded(onDrained);
  }

  if (argv.color_by === 'vertexInBox') {
    waitImages();
  } else if (argv.color_by) {
    if (useSceneState) {
      STK.scene.SceneUtil.colorScene(sceneState, argv.color_by, {
        color: argv.color,
        loadIndex: {index: cmd.index, objectIndex: cmd.object_index},
        encodeIndex: argv.encode_index,
        writeIndex: cmd.write_index ? basename : null,
        fs: STK.fs,
        callback: function () {
          waitImages();
        }
      });
    } else {
      var okay = STK.scene.SceneUtil.colorObject3D(scene, {
        colorBy: argv.color_by,
        color: argv.color,
        encodeIndex: argv.encode_index,
        bboxes: bboxes,
        bgcolor: 'white',
        ensureVertexColorSamePerTri: true //argv.encode_index
      });
      if (okay) {
        waitImages();
      } else {
        throw "Unsupported color option " + argv.color_by + " for useSceneState=false";
      }
    }
  } else {
    waitImages();
  }
});

console.log('DONE');
