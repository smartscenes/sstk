require('three-controls');

const Constants = require('Constants');
const ModelInfo = require('model/ModelInfo');
const AssetManager = require('assets/AssetManager');
const BasicSearchController = require('search/BasicSearchController');
const Object3DUtil = require('geo/Object3DUtil');
const OBBFitter = require('geo/OBBFitter');
const GeometryUtil = require('geo/GeometryUtil');
const PartVisualizer = require('./PartVisualizer');
const PartsLoader = require('articulations/PartsLoader');
const ViewGenerator = require('gfx/ViewGenerator');
const UIUtil = require('ui/UIUtil');
const async = require('async');

PartsLoader.MESH_OPACITY = 1;

class SceneHelper {
  constructor(params) {
    this.container = params.container;
    this.modelId = params.modelId;
    this.labelParser = params.labelParser;
    this.loadSave = params.loadSave;
    this.colors = params.colors;
    this.refitOBB = params.refitOBB;
    this.partsField = params.partsField || 'articulation-parts';
    this.__needOneMeshPerPart = false; // Used to be needed, now okay?
    this.obbFitter = function(object3D) {
      console.log('fit obb');
      return OBBFitter.fitOBB(object3D, { constrainVertical: true });
    };
  }

  /**
   * Load part annotations and display part tags in sidebar.
   */
  initScene(onReady) {
    // Load articulation annotations if they exist
    this.assetManager = new AssetManager({autoAlignModels: false, autoScaleModels: false, supportArticulated: true,
      searchController: new BasicSearchController() });
    this.assetManager.registerCustomAssetGroups({
      assetFiles: Constants.extraAssetsFile,
      filterByAssetId: this.modelId,
      callback: (err, res) => {
        this.__initScene(onReady);
      }
    });
  }

  __loadModel(callback) {
    const loader = new PartsLoader({ assetManager: this.assetManager, labelParser: this.labelParser, debug: true,
      connectivityOpts: {
        obbFitter: this.obbFitter, refitOBB: this.refitOBB
      } });
    const result = {};
    async.parallel([
      // get asset information
      // load articulation annotation
      cb => this.loadSave.loadStartingAnnotations((err, record) => {
        result.annotation = record;
        cb(null, record);
      }),
      cb => loader.lookupPartsInfo(this.modelId, this.partsField, (err, partsInfo) => {
        if (err) {
          cb(err);
        } else {
          loader.loadPartsWithConnectivityGraphById(this.modelId, { partsField: this.partsField, discardHierarchy: true },
            (err, loadedPartsInfo) => {
              result.partsInfo = loadedPartsInfo;
              cb(err, loadedPartsInfo);
          });
        }
      })
    ], (err, results) => {
      callback(err, result);
    });
  }

  __initScene(onReady) {
    this.__loadModel((err, result) => {
      if (err) {
        console.error(err);
        UIUtil.showAlertWithPanel(this.container, 'Error loading model', 'alert-danger', 0);
      } else {
        //console.log(result);
        const partsInfo = result.partsInfo;

        this.displayParts(partsInfo.parts, result.assetInfo);
        const parts = partsInfo.parts.map(part => (part && part.object3D)? part : null );
        const connectivityGraphViz = (partsInfo.metadata && partsInfo.metadata['files'])?
          partsInfo.metadata['files']['connectivity_graph_viz'] : null;

        onReady({
          // scene information
          scene: this.scene,
          partsAnnId: partsInfo.annId,
          parts: parts,
          assetSideness: this.assetManager.__getMaterialSide(this.assetInfo),
          annotations: this.loadSave.annotations,
          connectivityGraph: partsInfo.connectivityGraph,
          connectivityGraphViz: connectivityGraphViz,
          object3D: this.object3D,
          // camera and controls
          controls: this.controls,
          camera: this.camera,
          renderer: this.renderer
        });
      }
    });
  }

  addPartsToObject3D(object3D, parts, annotations, assetInfo) {
    // Store original color since mesh color will change depending on state
    // console.log('parts', this.parts);
    object3D.updateMatrixWorld();
    const side = this.assetManager.__getMaterialSide(assetInfo);
    const objectToWorld = object3D.matrixWorld.clone();
    const worldToObject = objectToWorld.clone().invert();
    parts.forEach(part => {
      if (part) {
        // Create a merged mesh, because the annotator can only handle meshes
        // Make sure children don't have other parts
        if (typeof(part.pid) === 'string') {
          part.pid = parseInt(part.pid);
        }
        if (this.__needOneMeshPerPart && !(part.object3D instanceof THREE.Mesh)) {
          //part.object3D.children = part.object3D.children.filter(c => c.userData.pid == null);
          // NOTE: this merge meshes doesn't work well now that we are using buffergeometry...
          part.object3D = GeometryUtil.mergeMeshes(part.object3D);
          if (part.object3D) {
            part.object3D.userData.pid = part.pid;
            part.object3D.userData.label = part.label;
            part.object3D.userData.name = part.name;
          } else {
            console.warn(`Part ${part.pid} (${part.name}) does not have any geometry`);
          }
        }
        if (part.object3D) {
          PartVisualizer.initPartMaterials(part, part.object3D, this.colors.INITIAL_COLOR, side);
          if (!part.obb) {
            part.obbWorld = this.obbFitter(part.object3D);
            part.obb = part.obbWorld.clone().applyMatrix4(worldToObject);
          } else {
            part.obbWorld = part.obb.clone().applyMatrix4(objectToWorld);
          }
          object3D.add(part.object3D);
        }
      }
    });
  }

  /**
   * Displays object (separated into parts), and links to sidebar.
   */
  displayParts(parts) {
    // Initialize scene, camera, etc.
    this.setupScene();

    // Align object3D so up is Y
    const assetInfo = this.assetManager.getLoadModelInfo(null, this.modelId);
    if (assetInfo != null) {
      const front = ModelInfo.getFront(assetInfo);
      const up = ModelInfo.getUp(assetInfo);
      const unit = ModelInfo.getUnit(assetInfo);
      Constants.setVirtualUnit(unit);
      Object3DUtil.alignToUpFrontAxes(this.object3D, up, front, Constants.worldUp, Constants.worldFront);
    }
    const annotations = this.loadSave.getCheckedAnnotations(parts);
    const object3D = this.object3D;
    this.addPartsToObject3D(object3D, parts, annotations, assetInfo);
    this.resetSceneCamera();
    this.assetInfo = assetInfo;
  }

  /**
   * Initialize renderer, scene, camera, etc.
   */
  setupScene() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.renderer = new THREE.WebGLRenderer({antialias: true, alpha: true });
    this.container.appendChild(this.renderer.domElement);
    this.renderer.setSize(width, height);

    this.scene = new THREE.Scene();
    this.object3D = new THREE.Group();
    this.scene.add(this.object3D);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x202020, 1.0));

    this.camera = new THREE.PerspectiveCamera(75, width / height, .1, 1000);
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableKeys = false;

    this.camera.position.set(0.5, 0.7, 1.0);

    $(window).on('resize', () => {
      this.onWindowResize();
    });
  }

  onWindowResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
  }

  resetSceneCamera() {
    const distanceScale = 1.2;
    const bbox = Object3DUtil.getBoundingBox(this.object3D);
    const centroid = bbox.centroid();
    const viewGenerator = new ViewGenerator({camera: this.camera, cameraPositionStrategy: 'positionByDistance'});
    const view = viewGenerator.getViewForBBox({
      name: 'view',
      target: bbox,
      theta: Math.PI / 6,
      phi: 14 * Math.PI / 8,
      dists: distanceScale
    });
    const position = Object3DUtil.toVector3(view.position);
    position.y = 1.2;
    this.camera.position.copy(position);
    this.camera.lookAt(centroid);
    this.camera.updateMatrix();
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(centroid);
    this.controls.update();
  }
}

// Exports
module.exports = SceneHelper;
