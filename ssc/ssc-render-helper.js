const STK = require('./stk-ssc');
const _ = STK.util;

// This file holds utility rendering functions used by render-file.js and render.js that handles interpreting
// common rendering command-line options

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
 * @param renderOpts.callback {function(err,res)} Callback
 * @param cmdOpts {Object} Options on the view to render, what to render
 * @param [cmdOpts.color_by] {string} If color_by is 'depth' and output_image_encoding is not 'rgba', then we need to convert the depth into millimeters
 * @param [cmdOpts.output_image_encoding] If color_by is 'depth' and output_image_encoding is not 'rgba', then we need to convert the depth into millimeters
 * @param [cmdOpts.convert_pixels] Whether we need to apply conversion to final pixels (used if postprocess is specified for renderOpts)
 * @param [cmdOpts.render_all_views] {boolean} whether to render all view
 * @param [cmdOpts.render_turntable] {boolean} whether to render turntable
 * @param [cmdOpts.use_current_view] {boolean} whether to use current camera position
 * @param [cmdOpts.view] {Object}
 * @param [cmdOpts.views] {Object}
 * @param [cmdOpts.view_index] {int What specific view to render
 * @param [cmdOpts.width] {int} Requested image width
 * @param [cmdOpts.height] {int} Requested image height
 * @param [cmdOpts.max_width] {int} Maximum number of pixels in the horizontal dimension
 * @param [cmdOpts.max_height] {int} Maximum number of pixels in the vertical dimension
 * @param [cmdOpts.max_pixels] {int} Maximum number of pixels
 * @param checkImageSize {function(opts, limits)} Checks whether the image size is within limits
 */
function render(scene, renderer, renderOpts, cmdOpts, checkImageSize) {
  const sceneBBox = renderOpts.targetBBox;
  const outbasename = renderOpts.basename;
  const cameraControls = renderOpts.cameraControls;
  const camera = renderOpts.cameraControls.camera;
  const cb = renderOpts.callback;
  //console.log('cmdOpts', cmdOpts);
  const logdata = _.defaults({}, renderOpts.logdata || {});
  if (cmdOpts.color_by === 'depth' && cmdOpts.output_image_encoding != 'rgba') {
    renderOpts.postprocess = { operation: 'unpackRGBAdepth', dataType: 'uint16', metersToUnit: 1000 };
  }
  if (cmdOpts.convert_pixels && !renderOpts.postprocess) {
    renderOpts.postprocess = { operation: 'convert', dataType: cmdOpts.convert_pixels };
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
    let errmsg  = null;  // Set to error message
    // Set view
    if (cmdOpts.use_current_view) {
      // No need to set view (using view of existing, preset camera)
      console.log('use existing camera');
    } else if (cmdOpts.view) {
      // Using more complex view parameters
      const viewOpts = cmdOpts.view.position? cmdOpts.view :
        cameraControls.getView(_.merge(Object.create(null), cmdOpts.view, { target: scene }));

      if (viewOpts.imageSize) {
        //console.log('got', viewOpts);
        const width = viewOpts.imageSize[0];
        const height = viewOpts.imageSize[1];
        errmsg = checkImageSize({ width: width, height: height }, cmdOpts);
        if (!errmsg && (width !== renderer.width || height !== renderer.height)) {
          renderer.setSize(width, height);
          camera.aspect = width / height;
        }
      }
      if (!errmsg) {
        cameraControls.viewTarget(viewOpts);
      } else {
        console.warn('Error rendering scene', errmsg);
      }
    } else if (cmdOpts.view_index != undefined) {
      // Using view index
      console.log('using view_index', cmdOpts.view_index);
      const views = cameraControls.generateViews(sceneBBox, cmdOpts.width, cmdOpts.height);
      cameraControls.viewTarget(views[cmdOpts.view_index]);  // default
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
      const opts = { logdata: logdata, postprocess: renderOpts.postprocess,
        includeIndexInfo: cmdOpts.log_index_info, index: cmdOpts.pixel_index };
      renderer.renderToPng(scene, camera, outbasename, opts);
    }
    setTimeout( function() { cb(errmsg); }, 0);
  }
}

// Fields (from cmdOpts) that the render functions looks at
render.cmdFields = [ 'color_by', 'output_image_encoding', 'convert_pixels',
  'render_all_views', 'render_turntable',
  'views', 'view', 'view_index', 'view_target_ids', 'find_good_views', 'use_current_view',
  'width', 'height', 'max_width', 'max_height', 'max_pixels', 'save_view_log',
  'log_index_info', 'pixel_index'
];

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

function getSceneCameraConfigs(sceneState, defaultCameraConfig) {
  if (sceneState.cameras) {
    const mapFunc = _.isArray(sceneState.cameras)? _.map : _.mapValues;
    const configs = mapFunc(sceneState.cameras, (config) => {
      if (config) {
        const converted = sceneState.convertCameraConfig(config);
        return _.defaults(converted, defaultCameraConfig);
      }
    });
    return configs;
  }
}

function getSceneCamera(sceneState, cameraIndex, defaultCameraConfig, width, height) {
  if (sceneState.cameras) {
    let sceneCameraConfig = sceneState.cameras[cameraIndex];
    if (sceneCameraConfig) {
      //console.log(sceneCameraConfig);
      sceneCameraConfig = sceneState.convertCameraConfig(cameraIndex);
      _.defaults(sceneCameraConfig, defaultCameraConfig);
      //console.log(sceneCameraConfig);
      return STK.gfx.Camera.fromJson(sceneCameraConfig, width, height);
    } else {
      console.warn('no camera ' + cameraIndex + ' found for scene!');
    }
  } else {
    console.warn('there are no camera specified for scene!');
  }
}

function getTargetObjects(sceneState, targetIds) {
  if (_.isString(targetIds)) {
    targetIds = targetIds.split(',');
  }
  console.log('Target ids: ' + JSON.stringify(targetIds));
  const includeAnyObject = (targetIds.indexOf('object') >= 0);
  const targetObjects = sceneState.findNodes(function (x) {
    if (includeAnyObject) {
      const modelInstance = STK.geo.Object3DUtil.getModelInstance(x);
      return !!modelInstance && (!modelInstance.model.isRoom());
    } else {
      return targetIds.indexOf(x.userData.id) >= 0;
    }
  });
  return targetObjects;
}

const rendererFactory = new STK.gfx.RendererFactory({ rendererType: STK.PNGRenderer });
function getSimpleRenderer(width, height) {
  //const name = `simple-${width}x${height}`;
  return rendererFactory.getOffscreenRenderer('simple', { width: width, height: height });
}

function getTargetObjectViews(sceneState, view_target_ids, cameraControls, rendererOpts, initialViewOpts) {
  if (view_target_ids) {
    const targetObjects = getTargetObjects(sceneState, view_target_ids);
    if (targetObjects && targetObjects.length > 0) {
      console.log('Target objects: ' + targetObjects.length);
      const viewOptimizer = new STK.gfx.ViewOptimizer({
        cameraControls: cameraControls,
        //scorer: 'simple',
        renderer: getSimpleRenderer(rendererOpts.width, rendererOpts.height),
        maxWidth: rendererOpts.maxWidth,
        maxHeight: rendererOpts.maxHeight,
        width: rendererOpts.width,
        height: rendererOpts.height
      });
      // TODO: allow for several different views
      const viewOpts = viewOptimizer.lookAt(sceneState, targetObjects, initialViewOpts);
      return { view: viewOpts };
    } else {
      console.warn('Target objects not found');
    }
  }
  return null;
}

function updateViewOptsForTargetObjects(sceneState, cmdOpts, cameraControls, renderer) {
  if (cmdOpts.view_target_ids) {
    if (cmdOpts.find_good_views) {
      // we want to find some good views for the object
      const initialViewOpts = cmdOpts.view;
      const viewInfo = getTargetObjectViews(
        sceneState, cmdOpts.view_target_ids, cameraControls, {
          width: renderer.width,
          height: renderer.height,
          maxWidth: 300,
          maxHeight: 300
        }, initialViewOpts);
      if (viewInfo) {
        // console.log('got viewInfo', viewInfo);
        cmdOpts.initialViewOpts = cmdOpts.view;
        cmdOpts.view = viewInfo.view;
      }
    } else {
      // normal case
      const targetObjects = getTargetObjects(sceneState, cmdOpts.view_target_ids);
      if (targetObjects && targetObjects.length > 0) {
        const bbox = STK.geo.Object3DUtil.getBoundingBox(targetObjects);
        cmdOpts.targetBBox = bbox;
      }
    }
  }
}


/**
 * Helper function that adds lights to a scene
 * @param scene {THREE.Scene}
 * @param camera {THREE.Camera}
 * @param cmdOpts
 * @param [cmdOpts.lights] {gfx.LightSpec[]} Exact lights to add to the scene
 * @param [cmdOpts.use_directional_lights] {boolean} Whether directional light should be added
 * @param [cmdOpts.use_ambient_light_only] {boolean} Whether an ambient light should be used
 * @param [cmdOpts.use_physical_lights] {boolean} Used for default case of dding hemisphere lights
 *  (whether we should use physically based lights)
 * @param [cmdOpts.use_lights] {boolean} Used for default case of dding hemisphere lights
 *  (whether there will be other lights that are on)
 */
function addLights(scene, camera, cmdOpts) {
  if (cmdOpts.use_directional_lights) {
    STK.gfx.Lights.addSimple2LightSetup(camera, new THREE.Vector3(0, 0, 0), true);
  } else if (cmdOpts.lights) {
    const lights = STK.gfx.Lights.setupLights(cmdOpts.lights);
    for (let i = 0; i < lights.length; i++) {
      scene.add(lights[i]);
    }
  } else if (cmdOpts.use_ambient_light_only) {
    scene.add(new THREE.AmbientLight());
  } else {
    const light = STK.gfx.Lights.getDefaultHemisphereLight(cmdOpts.use_physical_lights, cmdOpts.use_lights);
    scene.add(light);
  }
}

function setShadows(sceneState, useShadows) {
  if (useShadows) {
    STK.geo.Object3DUtil.setCastShadow(sceneState.fullScene, true);
    STK.geo.Object3DUtil.setReceiveShadow(sceneState.fullScene, true);
  }
}

function setVisible(sceneState, cmdOpts) {
  sceneState.setVisible(
    cmdOpts.show_ceiling,
    function (node) {
      return node.userData.type === 'Ceiling';
    }
  );
  if (cmdOpts.hide_nonparent_arch) {
    const parents = sceneState.getParentObjects();
    console.log('got parentIds', parents.map(x => x.userData.id));
    sceneState.setVisible(
      false,
      function (node) {
        return node.userData.isArch && parents.indexOf(node) < 0;
      }
    );
  }
  if (cmdOpts.hide_empty_regions) {
    const regions = sceneState.getParentRegions();
    console.log('got regionIds', regions.map(x => x.userData.id));
    sceneState.setVisible(
      false,
      function (node) {
        return node.userData.type === 'Room' && regions.indexOf(node) < 0;
      }
    );
  }
}

function colorArch(sceneState, archColor) {
  if (archColor != null) {
    if (archColor === 'original') {
      STK.scene.SceneUtil.colorSceneArch(sceneState, {colorBy: 'original'});
    } else {
      STK.scene.SceneUtil.colorSceneArch(sceneState, {colorBy: 'color', color: archColor});
    }
  }
}

/**
 * Color scene based on command-line options
 * @param scene {THREE.Scene}
 * @param sceneState {scene.SceneState}
 * @param cmdOpts
 * @param basename
 * @param cb
 */
function colorScene(scene, sceneState, cmdOpts, basename, cb) {
  if (cmdOpts.color_by === 'vertexAttribute' || cmdOpts.color_by === 'faceAttribute') {
    STK.scene.SceneUtil.colorObject3D(scene, {
      colorBy: cmdOpts.color_by,
      color: cmdOpts.color,
      encodeIndex: cmdOpts.encode_index
    });
    cb();
  } else if (cmdOpts.color_by) {
    const color_by = cmdOpts.color_by;
    const opts = {
      loadIndex: {index: cmdOpts.index, objectIndex: cmdOpts.object_index},
      color: cmdOpts.color,
      encodeIndex: cmdOpts.encode_index,
      writeIndex: cmdOpts.write_index ? basename : null,
      restrictToIndex: cmdOpts.restrict_to_color_index,
      modelIdCategoryMapping: cmdOpts.model_category_mapping? { path: cmdOpts.model_category_mapping } : null,
      fs: STK.fs,
      callback: function (err, res) {
        if (err) {
          console.warn('Error coloring scene: ', err);
        }
        colorArch(sceneState, cmdOpts.arch_color);
        cb(null, res);
      }
    };
    STK.scene.SceneUtil.colorScene(sceneState, color_by, opts);
  } else if (cmdOpts.arch_color != null) {
    colorArch(sceneState, cmdOpts.arch_color);
    cb();
  } else {
    cb();
  }
}

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

function getEnvMap(renderer, path) {
  if (path === 'neutral') {
    return STK.materials.Materials.getNeutralEnvMap(renderer.getPmremGenerator());
  } else {
    return STK.materials.Materials.getEquirectangularEnvMap(path, renderer.getPmremGenerator());
  }
}

module.exports = {
  render: render,
  convertViews: convertViews,
  addLights: addLights,
  colorScene: colorScene,
  retexture: retexture,
  setShadows: setShadows,
  setVisible: setVisible,
  getEnvMap: getEnvMap,
  getSceneCameraConfigs: getSceneCameraConfigs,
  getSceneCamera: getSceneCamera,
  getTargetObjects: getTargetObjects,
  getTargetObjectViews: getTargetObjectViews,
  updateViewOptsForTargetObjects: updateViewOptsForTargetObjects
};