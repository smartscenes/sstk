'use strict';

require('three-controls');

const Constants = require('Constants');
const ArticulationsConstants = require('./ArticulationsConstants');
const ArticulationAnnotatorState = require('./ArticulationAnnotatorState');
const AssetGroups = require('assets/AssetGroups');
const AssetManager = require('assets/AssetManager');
const BasicSearchController = require('search/BasicSearchController');
const Object3DUtil = require('geo/Object3DUtil');
const OBBFitter = require('geo/OBBFitter');
const GeometryUtil = require('geo/GeometryUtil');
const PartsLoader = require('articulations/PartsLoader');
const ViewGenerator = require('gfx/ViewGenerator');
const UIUtil = require('ui/UIUtil');
const async = require('async');
const _ = require('util/util');

const SCENE_BACKGROUND_COLOR = 0xefefef;
PartsLoader.MESH_OPACITY = 1;

class SceneHelper {
  constructor(params) {
    this.container = params.container;
    this.domHelper = params.domHelper;
    this.assetPaths = params.assetPaths;
    this.modelId = params.modelId;
    this.timings = params.timings;
    this.annotations = [];
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

   __initScene(onReady) {
    const loader = new PartsLoader({ assetManager: this.assetManager });
    async.parallel([
      cb => this.loadAnnotations((err, record) => {
        cb(null, record);
      }),
      cb => loader.lookupPartsInfo(this.modelId, 'articulation-parts', (err, partsInfo) => {
        if (err) {
          cb(err);
        } else {
          if (partsInfo && partsInfo['files'] && this.domHelper) {
            this.domHelper.addConnectivityGraphViz(partsInfo['files']['connectivity_graph_viz']);
          }
          loader.loadPartsWithConnectivityGraph(this.modelId, partsInfo, { discardHierarchy: true }, cb);
        }
      })
    ], (err, results) => {
      if (err) {
        UIUtil.showAlertWithPanel(this.container, 'Error loading model', 'alert-danger', 0);
      } else {
        //console.log(results);
        const parts = results[1];

        this.parts = parts.parts;
        this.partsAnnId = parts.annId;

        this.displayParts();

        const state = new ArticulationAnnotatorState({
          scene: this.scene,
          partsAnnId: this.partsAnnId,
          parts: this.parts,
          annotations: this.annotations,
          connectivityGraph: parts.connectivityGraph.connections,
          object3D: this.object3D,
        });

        onReady(state, this.controls, this.camera, this.renderer);
      }
    });
  }

  /**
   * Loads any existing annotations from database
   */
  loadAnnotations(cb) {
    $('#loading-current').html('articulation annotations');

    $.ajax({
      url: `${Constants.baseUrl}/articulation-annotations/load-annotations`,
      method: 'GET',
      data: {
        modelId: this.modelId,
      },
      success: ((record) => {
        if (record) {
          this.setAnnotations(record);
        }
        cb(null, record);
      }),
      error: ((err) => {
        console.warn("Error fetching annotations", err);
        cb(err);
      }),
    });
  }

  setAnnotations(record) {
    console.log(record);
    if (record.notes != null && this.domHelper) {
      this.domHelper.setNotes(record.notes);
    }
    let data = record.data;
    let articulations = data.articulations || [];
    let groupedArticulations = _.groupBy(articulations || [], 'pid');
    _.each(groupedArticulations, (partArticulations, pid) => {
      this.annotations[pid] = partArticulations;
    });
    this.timingHistory = data.timingHistory || [];
    if (data.timings) {
      this.timingHistory.push(data.timings);
    }
  }

  /**
   * Displays object (separated into parts), and links to sidebar.
   */
  displayParts() {
    // Initialize scene, camera, etc.
    this.setupScene();

    // Align object3D so up is Y
    const assetInfo = this.assetManager.getLoadModelInfo(null, this.modelId);
    if (assetInfo != null) {
      const front = AssetGroups.getDefaultFront(assetInfo);
      const up = AssetGroups.getDefaultUp(assetInfo);
      Object3DUtil.alignToUpFrontAxes(this.object3D, up, front, Constants.worldUp, Constants.worldFront);
    }
    // Store original color since mesh color will change depending on state
    // console.log('parts', this.parts);
    this.parts.forEach(part => {
      if (part) {
        // Create a merged mesh, because the annotator can only handle meshes
        // Make sure children don't have other parts
        if (!(part.object3D instanceof THREE.Mesh)) {
          //part.object3D.children = part.object3D.children.filter(c => c.userData.pid == null);
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
          Object3DUtil.applyMaterial(part.object3D, Object3DUtil.getSimpleFalseColorMaterial(part.pid, ArticulationsConstants.INITIAL_COLOR));
          part.originalColor = ArticulationsConstants.INITIAL_COLOR;
          if (this.annotations[part.pid] && this.annotations[part.pid].length > 0) {
            part.prevColor = ArticulationsConstants.ANNOTATED_PART_COLOR;
          } else {
            part.prevColor = ArticulationsConstants.INITIAL_COLOR;
          }
          if (!part.obb) {
            part.obb = OBBFitter.fitOBB(part.object3D, { constrainVertical: false });
          }
          this.object3D.add(part.object3D);
        }
      }
    });
    this.parts = this.parts.map(part => (part && part.object3D)? part : null );
    if (this.domHelper) {
      this.domHelper.addPartPills(this.parts, this.annotations);
    }
    this.resetSceneCamera();
  }

  /**
   * Initialize renderer, scene, camera, etc.
   */
  setupScene() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.renderer = new THREE.WebGLRenderer({antialias: true});
    this.container.appendChild(this.renderer.domElement);
    this.renderer.setSize(width, height);

    this.scene = new THREE.Scene();
    this.object3D = new THREE.Group();
    this.scene.add(this.object3D);
    this.scene.background = new THREE.Color(SCENE_BACKGROUND_COLOR);
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
    let distanceScale = 1.2;
    let bbox = Object3DUtil.getBoundingBox(this.object3D);
    let centroid = bbox.centroid();
    let viewGenerator = new ViewGenerator({camera: this.camera, cameraPositionStrategy: 'positionByDistance'});
    let view = viewGenerator.getViewForBBox({
      name: 'view',
      target: bbox,
      theta: Math.PI / 6,
      phi: 14 * Math.PI / 8,
      dists: distanceScale
    });
    let position = Object3DUtil.toVector3(view.position);

    position.y = 1.2;
    this.controls.target.copy(centroid);
    this.controls.update();
    this.camera.position.copy(position);
    this.camera.lookAt(centroid);
    this.camera.updateMatrix();
    this.camera.updateProjectionMatrix();
  }
}

// Exports
module.exports = SceneHelper;
