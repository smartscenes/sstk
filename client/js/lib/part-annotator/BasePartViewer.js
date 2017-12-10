'use strict';

var BBox = require('geo/BBox');
var Constants = require('lib/Constants');
var CameraControls = require('controls/CameraControls');
var CameraControlsPanel = require('controls/CameraControlsPanel');
var Viewer3D = require('Viewer3D');
var Picker = require('controls/Picker');
var AssetManager = require('assets/AssetManager');
var LabelsPanel = require('ui/LabelsPanel');
var Object3DUtil = require('geo/Object3DUtil');
var Renderer = require('gfx/Renderer');
var SearchController = require('search/SearchController');
var Colors = require('util/Colors');
var Timings = require('util/Timings');
var UIUtil = require('ui/UIUtil');
var _ = require('util');
var keymap = require('controls/keymap');
var Materials = require('materials/Materials');

Materials.DefaultMaterialType = THREE.MeshPhongMaterial;

/**
 * Base class for looking at parts of meshes.
 * @param params
 * @param [params.appId] {string} Application ID (passed to annotation server and stored in db)
 * @param [params.enableLookAt] {boolean} Whether to allow look at support (not fully functional yet)
 * @param [params.delayedLoading] {boolean} Whether to delay loading and setting up of annotation target (scene/model) until later.
 *   Otherwise, scene/model is loaded during init.  Use if additional setup of scene/model is required.
 * @param [params.labelsPanel] {Object} Configuration for {@link LabelsPanel}
 * @constructor
 * @extends Viewer3D
 */
function BasePartViewer(params) {
  Constants.defaultPalette = Colors.palettes['d3_category19p'];
  var defaults = {
    appId: 'BasePartViewer.v1',
    instructions: {
      panel: $('#instructionsPanel'),
      element: $('#instructions'),
      html:
        'Left click = Select/Deselect part<br>' +
        'Right click and drag or arrow keys = Orbit Model<br>' +
        'SHIFT + Right click and drag = Pan view<br>' +
        'Mouse wheel = Zoom view<br>' +
        'Number keys = Keyboard shortcut for part name<br><br>' +
        'C = toggle transparency'
    },
    labelsPanel: {
      container: $('#nameButtonsDiv'),
      labels: [],
      suggestions: []
    },
    enableLookAt: false,
    uihookups: _.keyBy([
      {
        name: 'Toggle transparency',
        element: '#colorBtn',
        click: function () {
          this.setTransparency(!this.isTransparent);
        }.bind(this),
        shortcut: 'c'
      },
      {
        name: 'Save image',
        click: function () {
          this.saveImage();
        }.bind(this),
        shortcut: 'ctrl-shift-i'
      },
      {
        name: 'Toggle stats',
        click: function () {
          this.showStats = !this.showStats;
        }.bind(this),
        shortcut: 'f5'
      }
    ], 'name')
  };
  params = _.defaultsDeep(Object.create(null), params, defaults);
  this.urlParams = _.getUrlParams();
  Viewer3D.call(this, params);

  this.mode = Constants.getGlobal('mode');
  if (!this.mode) {
    this.mode = this.urlParams['mode'] || params.mode;
  }
  this.submitStatusUrl = params.submitStatusUrl;

  this.appId = params.appId;
  this.enableLookAt = params.enableLookAt;
  this.delayedLoading = params.delayedLoading;
  this.labelsPanelConfig = params.labelsPanel;
  if (this.mode === 'verify') {
    this.labelsPanelConfig.allowEditStatus = true;
    this.labelsPanelConfig.validStatuses = ['', 'cleaned', 'rejected'];
  }

  this.timings = new Timings();
  this.isTransparent = false;
  this.ground = null;
  this.scene = null;
  this.assetManager = null;
  this.searchController = null;
  this.picker = null;

  // Debug node
  this.debugNode = new THREE.Group();
  this.debugNode.name = 'debugNode';
  this.useAmbientOcclusion = true;

  this.labelsPanel = null;
  this.excludeFromPicking = [];

  this.labeler = this.createLabeler();
}

BasePartViewer.prototype = Object.create(Viewer3D.prototype);
BasePartViewer.prototype.constructor = BasePartViewer;

BasePartViewer.prototype.start = function () {
  if (!this.container) {
    console.error('Cannot start without parent container element');
  } else {
    this.init(this.container);
    this.animate();
    this.redisplay();
  }
};

BasePartViewer.prototype.init = function (container) {
  this.setupLoadingIcon();
  this.assetManager = new AssetManager({
    autoAlignModels: true,
    useDynamic: true // set dynamic to be true so our picking will work
  });
  this.searchController = new SearchController();
  this.assetManager.setSearchController(this.searchController);

  this.createPanel();

  this.setupInstructions();

  this.userId = Constants.getGlobalOrDefault('userId', 'USER');

  this.container = container;
  this.setupCameraControls();
  this.renderer = new Renderer({
    container: this.container,
    camera: this.camera,
    useLights: false,
    useAmbientOcclusion: this.useAmbientOcclusion,
    antialias: true
  });

  this.picker = new Picker();

  this.registerEventListeners();
  if (!this.delayedLoading) {
    this.setupScene();
  }
};

BasePartViewer.prototype.registerBasicEventListeners = function () {
  Viewer3D.prototype.registerBasicEventListeners.call(this);

  var scope = this;
  // Disables text selection on domElement (hopefully prevents annoying blue highlighting while dragging sometimes)
  this.renderer.domElement.addEventListener('selectstart', function(e){ e.preventDefault(); });
  if (this.enableLookAt) {
    this.renderer.domElement.addEventListener('dblclick', function (event) {
      var part = scope.labeler.findPart(event);
      if (part) {
        scope.lookAtPart(part);
      }
    });
  }
};

BasePartViewer.prototype.createScene = function() {
  this.scene = new THREE.Scene();
  this.scene.name = 'scene';
  this.scene.add(this.camera);
  this.scene.add(this.debugNode);
  if (this.pickableGroup && this.pickableGroup instanceof THREE.Object3D) {
    this.scene.add(this.pickableGroup);
  }
  if (Constants.isBrowser) { window.scene = this.scene; }  // export for THREE.js inspector
};

BasePartViewer.prototype.setupScene = function() {
  this.createScene();
  // TODO: Populate me
  console.error(this.constructor.name + '.setupScene - Please implement me!!!');
};

// Create panel with icons and part names
BasePartViewer.prototype.createPanel = function () {
  var partLabels = this.getInitialPartLabels();
  if (!this.labelsPanel) {
    var options = _.defaults( Object.create(null), { labels: partLabels }, this.labelsPanelConfig);
    this.labelsPanel = new LabelsPanel(options);
    this.labelsPanel.createPanel();
    this.labelsPanel.Subscribe('labelSelected', this, this.onSelectLabel.bind(this));
    this.labelsPanel.Subscribe('labelAdded', this, function() {
      this.labeler.updateLabels(this.labelsPanel.labelInfos);
    }.bind(this));
    this.labelsPanel.Subscribe('labelDeleted', this, function(labelInfo) {
      this.labeler.updateLabels(this.labelsPanel.labelInfos);
      if (this.labeler.currentLabelInfo ===  labelInfo) {
        this.onSelectLabel(null);
      }
    }.bind(this));
    this.labelsPanel.Subscribe('labelRenamed', this, this.onRenameLabel.bind(this));
    this.labelsPanel.Subscribe('labelsRemapped', this, this.onRemapLabels.bind(this));
    this.labelsPanel.Subscribe('submitStatus', this, this.submitStatusUpdates.bind(this));
  } else {
    this.labelsPanel.setLabels(partLabels);
  }
  this.labeler.updateLabels(this.labelsPanel.labelInfos);
  this.labelInfos = this.labelsPanel.labelInfos;  // TODO: Do we need this?
};

BasePartViewer.prototype.showAlert = function(message, style) {
  UIUtil.showAlert(null, message, style);
};

BasePartViewer.prototype.submitStatusUpdates = function(updates) {
  var panel = this.labelsPanel.panel;
  if (this.submitStatusUrl) {
    if (!updates || _.size(updates) === 0) {
      UIUtil.showAlert(panel, 'Nothing to update', 'alert-warning');
      this.labelsPanel.onSubmitFinished();
      return;
    }
    var data = {
      'action': 'edit',
      'data': updates,
      'clean': this.__useCleanAnnotations
    };
    $.ajax({
      type: 'POST',
      url: this.submitStatusUrl,
      contentType: 'application/json;charset=utf-8',
      data: JSON.stringify(data),
      dataType: 'json',
      success: function (res) {
        console.log(res);
        if (res.code === 200) {
          UIUtil.showAlert(panel, 'Status updates successfully submitted.', 'alert-success');
          var dataById = _.keyBy(res.data, 'id');
          var labelInfos = this.labelsPanel.labelInfos;
          for (var i = 0; i < labelInfos.length; i++) {
            var ann = labelInfos[i].annotation;
            if (ann && dataById[ann.id]) {
              labelInfos[i].annotation = dataById[ann.id];
              this.labelsPanel.updateStatus(labelInfos[i]);
            }
          }
          this.labelsPanel.onSubmitFinished();
        } else {
          UIUtil.showAlert(panel, 'Error submitting status updates: ' + res.status);
          this.labelsPanel.onSubmitFinished();
        }
      }.bind(this),
      error: function () {
        UIUtil.showAlert(panel, 'Error submitting status updates');
        this.labelsPanel.onSubmitFinished();
      }.bind(this)
    });
  } else {
    UIUtil.showAlert(panel, 'No submit status URL');
    this.labelsPanel.onSubmitFinished();
  }
};

BasePartViewer.prototype.getIntersected = function(event) {
  if (!this.scene) { return; } // Not ready yet
  var mouse = this.picker.getCoordinates(this.container, event);

  //Get intersection object
  var intersect = this.picker.getFirstIntersected({
    x: mouse.x, y: mouse.y, camera: this.camera,
    objects: this.pickables || this.scene.children, ignore: this.excludeFromPicking,
    allowAllModelInstances: true
  });
  return intersect;
};

BasePartViewer.prototype.getIntersectedMesh = function(event) {
  if (!this.scene) { return; } // Not ready yet
  var mouse = this.picker.getCoordinates(this.container, event);

  //Get intersection object
  var intersect = this.picker.getFirstIntersectedMesh(mouse.x, mouse.y,
    this.camera, this.scene.children, this.excludeFromPicking);
  return intersect;
};

BasePartViewer.prototype.updateLabels = function() {
  var partLabels = this.getInitialPartLabels() || [];
  if (this.labelsPanel) {
    this.labelsPanel.setLabels(partLabels);
  }
  this.labeler.updateLabels(this.labelsPanel.labelInfos);
};

BasePartViewer.prototype.createLabeler = function() {
  console.error(this.constructor.name + '.createLabeler - Please implement me!!!');
};

BasePartViewer.prototype.lookAtPart = function (part) {
  if (this.labeler.getPartBoundingBox) {
    var bbox = this.labeler.getPartBoundingBox(part);
    this.cameraControls.viewTarget({
      targetBBox: bbox,
      viewIndex: 0,
      distanceScale: 1.5
    });
  }
};

BasePartViewer.prototype.lookAtParts = function (parts) {
  console.log('parts', parts);
  if (this.labeler.getPartBoundingBox) {
    if (parts && parts.length > 0) {
      var bbox = new BBox();
      for (var i = 0; i < parts.length; i++) {
        var partBBox = this.labeler.getPartBoundingBox(parts[i]);
        console.log('part', partBBox);
        if (partBBox) {
          bbox.includeBBox(partBBox);
        }
      }
      this.cameraControls.viewTarget({
        targetBBox: bbox,
        viewIndex: 0,
        distanceScale: 1.5
      });
    }
  }
};

BasePartViewer.prototype.setupCameraControls = function () {
  var width = this.container.clientWidth;
  var height = this.container.clientHeight;
  this.camera = new THREE.PerspectiveCamera(45, width / height, 1, 4000);

  this.cameraControls = new CameraControls({
    controlType: 'orbitRightClick',
    camera: this.camera,
    container: this.container,
    autoRotateCheckbox: $('#autoRotate'),
    renderCallback: this.render.bind(this)
  });
  this.cameraControls.saveCameraState(true);

  // Hookup camera control panel
  this.cameraControlsPanel = new CameraControlsPanel({
    app: this,
    container: $('#cameraControls'),
    controls: this.cameraControls,
    iconsPath: Constants.cameraControlIconsDir,
    cameraWidgetSettings: Constants.cameraWidgetSettings
  });

  keymap({ on: 'left' }, this.cameraControlsPanel.orbitControls.left);
  keymap({ on: 'right' }, this.cameraControlsPanel.orbitControls.right);
  keymap({ on: 'up' }, this.cameraControlsPanel.orbitControls.up);
  keymap({ on: 'down' }, this.cameraControlsPanel.orbitControls.down);
  keymap({ on: 'ctrl-shift-r'}, function() { this.cameraControls.resetCamera(); }.bind(this));
};

BasePartViewer.prototype.getInitialPartLabels = function () {
  if (Constants.hasGlobal('parts')) {
    return Constants.getGlobalOrDefault('parts', [], { dropEmpty: true });
  } else {
    return undefined;
  }
};

BasePartViewer.prototype.onSelectLabel = function (labelInfo) {
  if (labelInfo) {
    this.setTransparency(true);
  }
  this.labeler.currentLabelInfo = labelInfo;
};

BasePartViewer.prototype.onRenameLabel = function (labelInfo) {
};

BasePartViewer.prototype.onRemapLabels = function () {
  console.log(this.labelsPanel.labelInfos);
  this.labeler.updateLabels(this.labelsPanel.labelInfos);
  this.labelInfos = this.labelsPanel.labelInfos; // TODO: do we need this?
};

BasePartViewer.prototype.setTransparency = function (flag, force) {
  var changed = this.isTransparent !== flag;
  //console.log('setTransparency: ' + flag + ', changed=' + changed);
  if (changed || force) {
    this.isTransparent = flag;
    if (this.__modelInstance) {
      Object3DUtil.setVisible(this.__modelInstance.object3D, !flag);
    }
    this.labeler.showParts(flag);
  }
};

// Reset camera to default position
//BasePartViewer.prototype.resetCamera = function () {
//  this.camera.up.copy(Constants.worldUp);
//  this.cameraControls.viewTarget({
//    position: Constants.defaultCamera.position,
//    target: new THREE.Vector3()
//  });
//};

BasePartViewer.prototype.getRenderScene = function () {
  return this.scene;
};

// TODO: deduplicate
BasePartViewer.prototype.registerCustomModelAssetGroup = function(assetIdsFile, jsonFile, autoLoad) {
  this.registerCustomAssetGroup(this.searchController, assetIdsFile, jsonFile, autoLoad);
};

BasePartViewer.prototype.registerCustomModelAssetGroups = function(assetFiles, autoLoad) {
  this.registerCustomAssetGroups(this.searchController, assetFiles, autoLoad);
};

module.exports = BasePartViewer;