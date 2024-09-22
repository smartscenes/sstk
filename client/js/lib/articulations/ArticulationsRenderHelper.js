const md5 = require('md5');
const async = require('async');
const Constants = require('Constants');
const BBox = require('geo/BBox');
const Articulation = require('articulations/Articulation');
const ArticulatedObject = require('articulations/ArticulatedObject');
const DisplayAxis = require('articulations/DisplayAxis');
const DisplayRadar = require('articulations/DisplayRadar');
const PartsLoader = require('articulations/PartsLoader');
const ModelInfo = require('model/ModelInfo');
const Colors = require('util/Colors');
const GeometryUtil = require('geo/GeometryUtil');
const Object3DUtil = require('geo/Object3DUtil');
const SceneSetupHelper = require('gfx/SceneSetupHelper');
const SceneState = require('scene/SceneState');
const _ = require('util/util');

/**
 * Utilities for rendering articulations
 * @constructor
 * @param params Configuration parameters
 * @param [params.assetManager] {assets.AssetManager} Asset manager for loading assets
 * @param [params.renderer] {gfx.Renderer} Renderer
 * @param [params.showAxisRadar] {boolean} Whether to show the axis and radar for the moving part
 * @param [params.staticColor] {THREE.Color|string} What color to use for static parts
 *       Use 'neutral' (default) for neutral coloring, 'original' for original textures.
 * @param [params.staticOpacity] {float} Number between 0 and 1 specifying opacity of static part (default is fully opaque)
 * @param [params.baseOpacity] {float} Number between 0 and 1 specifying opacity of base part (default is same as staticOpacity)
 * @param [params.movingPartColor] {THREE.Color|string} What color to use for main moving part
 *       Use 'highlight' (default) to use the highlightColor
 * @param [params.attachedMovingPartColor] {THREE.Color|string} What color to use for parts attached to moving part
 *       Use 'faded_highlight' (default) to use a lighter version of the highlightColor
 * @param [params.basePartColor] {THREE.Color|string} What color to use for the base part
 *       Use 'basepart_highlight' (default) to use a different color to highlight the base partr
 * @param [params.neutralColor] {THREE.Color|string} Controls color used for neutral coloring (default is light gray)
 * @param [params.highlightColor] {THREE.Color|string} Controls highlighted part coloring (default is green)
 * @param [params.basepart_highlight] {THREE.Color|string} Controls highlighted part coloring for base parts (default is purple)
 * @param [params.backgroundColor] {THREE.Color|string} Specify to have a background color (default is none - transparent)
 **/
class ArticulationsRenderHelper {
  constructor(params) {
    this.__fs = params.fs || Constants.sys.fs;
    this.assetManager = params.assetManager;
    this.renderer = params.renderer;
    this.showAxisRadar = params.showAxisRadar;
    this.useDirectionalLights = params.useDirectionalLights;
    this.useLights = params.useLights;
    this.usePhysicalLights = params.usePhysicalLights;
    this.minIterations = params.minIterations || 10;
    this.maxIterations = params.maxIterations || 20;
    this.defaultTilt = 30;
    this.defaultAzimuth = -45;
    //this.minRotation = Math.PI/180;
    //this.maxRotation = 20*Math.PI/180;
    //this.minTranslation = 0.005;

    this.materials = {
      'neutral': Object3DUtil.getSimpleFalseColorMaterial(0, params.neutralColor || '#a3a3a3'),
      'highlight': Object3DUtil.getSimpleFalseColorMaterial(1, params.highlightColor || '#42bc67'),
      'faded_highlight': Object3DUtil.getSimpleFalseColorMaterial(2,
        Colors.lighten(Colors.toColor(params.highlightColor || '#42bc67'))),
      'basepart_highlight': Object3DUtil.getSimpleFalseColorMaterial(5, params.basepart_highlight || '#9467bd'),
    };
    this.backgroundColor = params.backgroundColor;
    this.staticColor = params.staticColor || 'neutral';  // Color for static unmoving parts
    this.movingPartColor = params.movingPartColor || 'highlight';  // Color for moving parts
    this.attachedMovingPartColor = params.attachedMovingPartColor || 'faded_highlight'; // Color for attached moving part (vs main moving part)
    this.basePartColor = params.basePartColor || 'basepart_highlight'; // Color for basepart
    if (this.staticColor !== 'original') {
      this.staticPartMaterial = this.materials[this.staticColor] ||
        Object3DUtil.getSimpleFalseColorMaterial(3, params.staticColor);
    }
    if (this.movingPartColor !== 'original') {
      this.movingPartMaterial = this.materials[this.movingPartColor] ||
        Object3DUtil.getSimpleFalseColorMaterial(4, params.movingPartColor);
    }
    if (this.attachedMovingPartColor !== 'original') {
      this.attachedMovingPartMaterial = this.materials[this.attachedMovingPartColor] ||
        Object3DUtil.getSimpleFalseColorMaterial(6, params.attachedMovingPartColor);
    }

    if (this.basePartColor !== 'original') {
      this.basePartMaterial = this.materials[this.basePartColor] ||
        Object3DUtil.getSimpleFalseColorMaterial(7, this.basePartColor);
    }

    this.staticPartOpacity = params.staticOpacity;
    this.basePartOpacity = (params.baseOpacity != null)? params.baseOpacity : this.staticPartOpacity;
  }

  // Functions for rendering joints
  renderJointsForId(modelId, joints, options, callback) {
    const partsField = options.partsField || 'articulation-parts';
    const partsLoader = new PartsLoader({ assetManager: this.assetManager });
    partsLoader.loadPartsWithConnectivityGraphById(modelId, { partsField: partsField, discardHierarchy: true }, (err, partData) => {
      if (err) {
        console.error(`Error loading parts fullId=${modelId}`, err);
        callback(err);
      } else {
        // Setup the scene and render
        const scope = this;
        function render() {
          scope.setupRenderJointsWithConnectivity(modelId, partData.connectivityGraph, joints, options, callback);
        }

        if (options.waitImagesLoaded) {
          options.waitImagesLoaded(render);
        } else {
          render();
        }
      }
    });
  }

  setupRenderJointsWithConnectivity(modelId, connectivityGraph, joints, options, callback) {
    this.__setupRender(modelId, options,
      (scene, objectNode, renderOpts, cb) =>
        this.renderJointsWithConnectivity(scene, objectNode, connectivityGraph, joints, renderOpts, cb),
      callback);
  }

  renderJointsWithConnectivity(scene, objectNode, connectivityGraph, joints, options, callback) {
    const processed = [];
    const processedByHash = {};
    for (let index = 0; index < joints.length; index++) {
      const joint = joints[index];
      // Create a fake articulation
      const pid = joint.movingPartId;
      const baseId = joint.basePartId;
      // Create fake articulation
      const articulation = new Articulation({
        pid: pid,
        base: [baseId],
        axis: [0,0,1]
      });
      const basename = options.basename + '-' + pid + '-' + baseId;
      const hash = pid + '-' + baseId;
      const filename = basename + '.png';
      const fileExists = this.__fs && this.__fs.existsSync(filename);
      let status = fileExists ? 'overwrite' : 'new';
      if (options.skipExisting && fileExists) {
        // Skip
        status = 'exists';
      } else if (processedByHash[hash]) {
        // Already processed this one (skip)
        status = 'repeat';
      } else {
        // Create articulated object and articulated state
        const articulatedObject = new ArticulatedObject([articulation], connectivityGraph);
        const articulationState = articulatedObject.articulationStates[0];

        // Add to objectNode
        objectNode.add(articulatedObject);
        /** Apply part colorings */
        this.applyPartColorings(articulatedObject, articulationState, true);

        /** Render articulation animation file */
        const opts = _.defaults({ basename: basename, transform: objectNode.matrixWorld }, options);
        this.renderStatic(scene, articulatedObject, null, opts);
        // Cleanup
        objectNode.remove(articulatedObject);
        connectivityGraph.discardPartHierarchy();
      }

      const info = {
        index: index,
        pid: pid,
        filename: filename,
        status: status
      };
      processed.push(info);
      processedByHash[hash] = true;
    }

    callback(null, processed);
  }

  // Functions for rendering proposed articulations
  renderProposedArticulationsForId(modelId, articulations, options, callback) {
    const partsField = options.partsField || 'articulation-parts';
    const partsLoader = new PartsLoader({ assetManager: this.assetManager });
    partsLoader.loadPartsWithConnectivityGraphById(modelId, { partsField: partsField, discardHierarchy: true }, (err, partData) => {
      if (err) {
        console.error(`Error loading parts fullId=${modelId}`, err);
        callback(err);
      } else {
        // Setup the scene and render
        const scope = this;
        function render() {
          scope.setupRenderProposedArticulationsWithConnectivity(modelId, partData.connectivityGraph, articulations, options, callback);
        }

        if (options.waitImagesLoaded) {
          options.waitImagesLoaded(render);
        } else {
          render();
        }
      }
    });
  }

  __setupRender(modelId, options, renderCallback, doneCallback) {
    const cameraControls = options.cameraControls || SceneSetupHelper.createCameraControls(this.renderer, {
      camera: options.camera, width: this.renderer.width, height: this.renderer.height
    });
    const scene = SceneSetupHelper.createScene(cameraControls.camera, {
      backgroundColor: this.backgroundColor,
      useLights: this.useLights,
      usePhysicalLights: this.usePhysicalLights,
      useDirectionalLights: this.useDirectionalLights
    });
    const wrappedCallback = function (err, result) {
      Object3DUtil.dispose(scene);
      doneCallback(err, result);
    };

    const objectNode = new THREE.Group();
    scene.add(objectNode);
    const assetInfo = this.assetManager.getLoadModelInfo(null, modelId);
    if (assetInfo != null) {
      const front = ModelInfo.getFront(assetInfo);
      const up = ModelInfo.getUp(assetInfo);
      Object3DUtil.alignToUpFrontAxes(objectNode, up, front, Constants.worldUp, Constants.worldFront);
    }
    scene.updateMatrixWorld();

    const logdata = options.logdata ? _.defaults({ fullId: modelId, toWorld: objectNode.matrixWorld.toArray() }, options.logdata) : null;
    const renderOpts = _.merge(
      _.pick(options, ['basename', 'framerate', 'tilt', 'skipExisting', 'skipVideo', 'combineAll', 'iterations', 'width', 'height']),
      {
        cameraControls: cameraControls,
        logdata: logdata
      }
    );

    renderCallback(scene, objectNode, renderOpts, wrappedCallback);
  }

  setupRenderProposedArticulationsWithConnectivity(modelId, connectivityGraph, articulations, options, callback) {
    this.__setupRender(modelId, options,
      (scene, objectNode, renderOpts, cb) =>
        this.renderProposedArticulationsWithConnectivity(scene, objectNode, connectivityGraph, articulations, renderOpts, cb),
      callback);
  }

  renderProposedArticulationsWithConnectivity(scene, objectNode, connectivityGraph, articulations, options, callback) {
    const articulationHashInfos = [];
    const hashInfosByHashId = {};
    for (let index = 0; index < articulations.length; index++) {
      const articulation = new Articulation(articulations[index]);
      const articulationHash = md5(articulation.getHashString());
      const pid = articulation.pid;

      const basename = options.basename + '-' + pid + '-' + articulationHash;
      const outputFormat = options.format || 'gif';
      const filename = basename + '.' + outputFormat;
      const fileExists = this.__fs && this.__fs.existsSync(filename);
      let status = fileExists ? 'overwrite' : 'new';
      if (options.skipExisting && fileExists) {
        // Skip
        status = 'exists';
      } else if (hashInfosByHashId[articulationHash] && hashInfosByHashId[articulationHash].length) {
        // Already processed this one (skip)
        status = 'repeat';
      } else {
        // Create articulated object and articulated state
        const articulatedObject = new ArticulatedObject([articulation], connectivityGraph);
        const articulationState = articulatedObject.articulationStates[0];

        // Add to objectNode
        objectNode.add(articulatedObject);
        /** Apply part colorings */
        this.applyPartColorings(articulatedObject, articulationState, true);

        /** Render articulation animation file */
        const opts = _.defaults({ basename: basename, transform: objectNode.matrixWorld }, options);
        this.renderArticulation(scene, articulatedObject, articulationState, opts);
        // Cleanup
        objectNode.remove(articulatedObject);
        connectivityGraph.discardPartHierarchy();
      }

      const hashInfo = {
        index: index,
        pid: pid,
        hash: articulationHash,
        filename: filename,
        status: status
      };
      articulationHashInfos.push(hashInfo);
      hashInfosByHashId[articulationHash] = hashInfosByHashId[articulationHash] || [];
      hashInfosByHashId[articulationHash].push(hashInfo);
    }

    // TODO: Should we support the combineAll feature here?
    callback(null, articulationHashInfos);
  }

  // Functions for rendering final annotations with articulated object
  renderArticulatedForId(fullId, metadata, options, callback) {
    this.assetManager.getModelInstance(null, fullId,
      (mInst) => {
        if (!Constants.isBrowser) {
          // Ensure is normal geometry (for some reason, BufferGeometry not working with ssc)
          Object3DUtil.traverseMeshes(mInst.object3D, false, function (m) {
            m.geometry = GeometryUtil.toGeometry(m.geometry);
          });
        }

        const cameraControls = options.cameraControls || SceneSetupHelper.createCameraControls(this.renderer, {
          camera: options.camera, width: this.renderer.width, height: this.renderer.height
        });
        const scene = SceneSetupHelper.createScene(cameraControls.camera, {
          backgroundColor: this.backgroundColor,
          useLights: this.useLights,
          usePhysicalLights: this.usePhysicalLights,
          useDirectionalLights: this.useDirectionalLights
        });
        const wrappedCallback = function (err, result) {
          Object3DUtil.dispose(scene);
          callback(err, result);
        };

        const sceneState = new SceneState(null, mInst.model.info);
        sceneState.addObject(mInst, this.assetManager.autoAlignModels);
        scene.add(sceneState.fullScene);
        const sceneBBox = Object3DUtil.getBoundingBox(mInst.object3D);
        const bbdims = sceneBBox.dimensions();
        console.log('Loaded ' + sceneState.getFullID() +
          ' bbdims: [' + bbdims.x + ',' + bbdims.y + ',' + bbdims.z + ']');
        const logdata = options.logdata ? _.defaults({ fullId: fullId, toWorld: mInst.getObject3D('Model').matrixWorld.toArray() }, options.logdata) : null;

        const renderOpts = _.merge(
          _.pick(options, ['basename', 'framerate', 'tilt', 'skipExisting', 'skipVideo', 'combineAll', 'iterations', 'width', 'height']),
          {
            cameraControls: cameraControls,
            targetBBox: sceneBBox,
            logdata: logdata
          }
        );

        const scope = this;
        function render() {
          scope.renderArticulatedModelInstance(scene, mInst, renderOpts, wrappedCallback);
        }

        if (options.waitImagesLoaded) {
          options.waitImagesLoaded(render);
        } else {
          render();
        }
      },
      (error) => {
        console.error('Error loading ' + fullId, error);
        callback(error, null);
      },
      metadata);
  }

  renderArticulatedModelInstance(scene, mInst, options, callback) {
    const articulatedObjects = mInst.getArticulatedObjects();
    if (articulatedObjects.length) {
      async.eachSeries(articulatedObjects, (artObj, cb) => {
        const opts = (articulatedObjects.length === 1) ? options :
          _.defaults({ basename: options.basename + '/1' }, options);
        this.renderArticulatedObject(scene, artObj, opts, cb);
      }, callback);
    } else {
      console.log(`No articulated objects for ${mInst.model.getFullID()}`);
      callback();
    }
  }

  renderArticulatedObject(scene, articulatedObject, options, callback) {
    const articulationStates = articulatedObject.articulationStates;
    const articulationStatesByPart = _.groupBy(articulationStates, 'pid');
    for (let pid of Object.keys(articulationStatesByPart)) {
      /** Render articulation animation files */
      const opts = _.defaults({ basename: options.basename + '-' + pid }, options);
      this.renderArticulations(scene, articulatedObject, articulationStatesByPart[pid], opts);
    }
    if (!options.skipVideo && options.combineAll) {
      // TODO: be careful here - if there are other gifs / files that matches, lots of things will be combined
      const outputFormat = options.format || 'gif';
      this.renderer.removeFile(options.basename + '.' + outputFormat);
      this.renderer.mergeVideoSequence(options.basename + '*.' + outputFormat, options.basename + '.' + outputFormat);
    }
    const res = _.map(articulatedObject.articulations, art => {
      const s = art.toJson();
      s.hash = md5(art.getHashString());
      return s;
    });
    // console.log(res);
    callback(null, res);
  }

  renderArticulations(scene, articulatedObject, articulationStates, options) {
    let index = 0;
    for (let articulationState of articulationStates) {
      /** Apply part colorings */
      this.applyPartColorings(articulatedObject, articulationState, true);

      /** Render articulation animation files */
      // Handle multiple articulations per part by adding to basename
      const opts = _.defaults({ basename: options.basename + '-' + index, transform: articulatedObject.matrixWorld }, options);
      this.renderArticulation(scene, articulatedObject, articulationState, opts);
      index++;
    }
  }

  setBBoxView(bbox, opts) {
    const cameraControls = opts.cameraControls;
    const tilt = (opts.tilt != null) ? opts.tilt : this.defaultTilt;
    const azimuth = (opts.azimuth != null) ? opts.azimuth : this.defaultAzimuth;
    const theta = tilt / 180 * Math.PI;
    const phi = azimuth / 180 * Math.PI;
    const distanceScale = opts.distanceScale || 1.5;

    cameraControls.viewTarget({
      targetBBox: bbox, distanceScale: distanceScale,
      phi: phi,
      theta: theta
    });
  }

  setArticulationView(scene, node, articulationState, opts) {
    const targetBBox = opts.targetBBox;
    const bbox = this.getBBoxWithArticulations(node, articulationState, opts);
    if (targetBBox) {
      bbox.includeBBox(targetBBox);
    }
    this.setBBoxView(bbox, opts);
  }

  setNodeView(scene, node, opts) {
    const targetBBox = opts.targetBBox;
    const bbox = new BBox();
    bbox.includeObject3D(node);
    if (targetBBox) {
      bbox.includeBBox(targetBBox);
    }
    this.setBBoxView(bbox, opts);
  }

  getBBoxWithArticulations(node, articulationState, opts) {
    const maxIterations = opts.iterations || this.minIterations;
    if (_.isFinite(articulationState.rangeMin)) {
      articulationState.setToMin();
    } else {
      articulationState.setToDefault();
    }
    const rangeAmount = _.isFinite(articulationState.rangeAmount) ? articulationState.rangeAmount : articulationState.defaultRangeAmount;
    let delta = rangeAmount / (maxIterations - 1);
    let iter = 0;
    let done = false;
    const bbox = new BBox();
    while (!done && iter < maxIterations) {
      articulationState.apply(delta);
      bbox.includeObject3D(node);
      iter++;
      if (articulationState.atMax) {
        done = true;
      }
    }

    articulationState.setToDefault();
    return bbox;
  }

  renderArticulation(scene, node, articulationState, opts) {
    const basename = opts.basename;
    console.time('render ' + basename);
    const pngfiles = [];
    this.renderArticulationFrames(scene, node, articulationState, opts,
      (scene, camera, iter, renderOpts) => {
        const pngfile = basename + '-' + _.padStart(iter.toString(), 4, '0') + '.png';
        pngfiles.push(pngfile);
        this.renderer.renderToPng(scene, camera, pngfile, renderOpts);
      });

    if (!opts.skipVideo) {
      console.time('convert ' + basename);
      const outputFormat = opts.format || 'gif';
      const outputFilename = basename + '.' + outputFormat;
      const pattern = this.renderer.getMatchingPngPattern(basename, outputFormat);
      this.renderer.pngSeqToVideo(pattern, outputFilename, {
        framerate: opts.framerate
      });
      if (opts.clearPngs) {
        for (let pngfile of pngfiles) {
          this.renderer.removeFile(pngfile);
        }
      }
      console.timeEnd('convert ' + basename);
      console.log('rendered ' + outputFilename);
    }
    console.timeEnd('render ' + basename);
  }

  renderArticulationFrames(scene, node, articulationState, opts, addFrame) {
    const cameraControls = opts.cameraControls;
    const maxIterations = opts.iterations || this.maxIterations;

    this.setArticulationView(scene, node, articulationState, opts);

    const renderOpts = _.clone(opts);
    renderOpts.logdata = _.defaults({ cameraConfig: cameraControls.lastViewConfig }, opts.logdata || {});

    if (_.isFinite(articulationState.rangeMin)) {
      articulationState.setToMin();
    } else {
      articulationState.setToDefault();
    }

    let widgetsNode;
    let onStateUpdated;
    if (this.showAxisRadar) {
      //console.log('showAxisRadar', opts.transform);
      widgetsNode = new THREE.Group();
      widgetsNode.applyMatrix4(opts.transform);
      const displayAxis = new DisplayAxis({ articulation: articulationState });
      displayAxis.update(articulationState.articulation.isTranslation);  // show axis points
      displayAxis.attach(widgetsNode);
      if (articulationState.articulation.isTranslation) {
        onStateUpdated = function() {
          displayAxis.updateValue();
        };
      } else {
        const displayRadar = new DisplayRadar({articulation: articulationState});
        displayRadar.update();
        displayRadar.attach(widgetsNode);
        onStateUpdated = function() {
          displayRadar.updateValue();
        };
      }
      scene.add(widgetsNode);
    }

    // TODO: set delta appropriately
    const rangeAmount = _.isFinite(articulationState.rangeAmount) ? articulationState.rangeAmount : articulationState.defaultRangeAmount;
    let delta = 2 * rangeAmount / (maxIterations - 1);
    let iter = 0;
    let done = false;
    while (!done && iter < maxIterations) {
      const d = articulationState.apply(delta);
      if (onStateUpdated) {
        onStateUpdated(d);
      }
      addFrame(scene, cameraControls.camera, iter, renderOpts);
      iter++;

      // Check if we need to reverse
      if (articulationState.atMax) {
        delta = -delta;
      }
      if (articulationState.atMin) {
        done = true;
      }
    }
    articulationState.setToDefault();

    if (widgetsNode) {
      scene.remove(widgetsNode);
      // TODO: Make sure to destroy the displayAxis and displayRadar so there is no memory leak
    }
  }

  // Render static image
  // If articulationState information is provided and showAxisRadar, then axisRadar will be rendered
  renderStatic(scene, node, articulationState, opts) {
    const basename = opts.basename;
    const cameraControls = opts.cameraControls;

    let widgetsNode;
    if (articulationState && this.showAxisRadar) {
      //console.log('showAxisRadar', opts.transform);
      widgetsNode = new THREE.Group();
      widgetsNode.applyMatrix4(opts.transform);
      const displayAxis = new DisplayAxis({ articulation: articulationState.articulation });
      const displayRadar = new DisplayRadar({ articulation: articulationState.articulation });
      displayAxis.update();
      displayRadar.update();
      displayAxis.attach(widgetsNode);
      displayRadar.attach(widgetsNode);
      scene.add(widgetsNode);
    }

    this.setNodeView(scene, node, opts);

    const renderOpts = _.clone(opts);
    renderOpts.logdata = _.defaults({ cameraConfig: cameraControls.lastViewConfig }, opts.logdata || {});

    const pngfile = basename + '.png';
    this.renderer.renderToPng(scene, cameraControls.camera, pngfile, renderOpts);

    if (widgetsNode) {
      scene.remove(widgetsNode);
      // TODO: Make sure to destroy the displayAxis and displayRadar so there is no memory leak
    }
  }

  applyPartColorings(articulatedObject, articulationState, resetObjectColors, skipStaticPartMaterials) {
    if (resetObjectColors) {
      this.resetObject3DColor(articulatedObject);
    }
    if (this.staticPartMaterial && !skipStaticPartMaterials) {
      this.setMaterial(articulatedObject, this.staticPartMaterial, this.staticPartOpacity);
    }
    if (this.staticColor !== this.attachedMovingPartColor) {
      this.colorObject3D(articulationState.articulatedNode, this.attachedMovingPartColor, this.attachedMovingPartMaterial);
    }
    if (this.movingPartColor !== this.attachedMovingPartColor) {
      this.colorObject3D(articulationState.part.object3D, this.movingPartColor, this.movingPartMaterial);
    }
    if (this.basePartColor !== this.staticColor) {
      if (articulationState.part.baseIds) {
        for (let baseId of articulationState.part.baseIds) {
          const baseObject = articulatedObject.parts[baseId].object3D;
          this.colorObject3D(baseObject, this.basePartColor, this.basePartMaterial, this.basePartOpacity);
        }
      }
    }
  }

  colorObject3D(object3D, colorMode, material, opacity) {
    if (colorMode === 'original') {
      this.resetObject3DColor(object3D);
    } else {
      this.setMaterial(object3D, material, opacity);
    }
  }

  resetObject3DColor(object3D) {
    Object3DUtil.revertMaterials(object3D, true, true);
  }

  setMaterial(object3D, mat, opacity) {
    Object3DUtil.setMaterial(object3D, mat, Object3DUtil.MaterialsAll, true);
    if (opacity != null && opacity < 1) {
      Object3DUtil.setOpacity(object3D, opacity);
    }
  }

}

module.exports = ArticulationsRenderHelper;