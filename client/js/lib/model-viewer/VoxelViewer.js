var BBox = require('geo/BBox');
var CameraControls = require('controls/CameraControls');
var CameraControlsPanel = require('controls/CameraControlsPanel');
var Constants = require('Constants');
var Object3DUtil = require('geo/Object3DUtil');
var Renderer = require('gfx/Renderer');
var UIUtil = require('ui/UIUtil');
var Viewer3D = require('Viewer3D');
var Voxels = require('geo/Voxels');
var _ = require('util');

function VoxelViewer(params) {
  var defaults = {
    useDatGui: true,
    uihookups: _.keyBy([
      {
        name: 'saveImage',
        click: this.saveImage.bind(this),
        shortcut: 'i'
      }
   ]),
    mesher: 'greedy'
  };
  this.urlParams = _.getUrlParams();
  var allParams = _.defaultsDeep(Object.create(null), this.urlParams, params, defaults);
  Viewer3D.call(this, allParams);
  this.useAmbientOcclusion = true;
  this.allowCustomLoading = true;
  this.controlsPanel = $(allParams.controls || '#controls');
  this.__voxelThreshold = 0;
  this.__mesher = allParams.mesher;
}

VoxelViewer.prototype = Object.create(Viewer3D.prototype);
VoxelViewer.prototype.constructor = VoxelViewer;

VoxelViewer.prototype.init = function() {
  this.setupBasicScene();
  this.setupUI();
  this.setupDatGui();
  this.registerEventListeners();
};

Object.defineProperty(Viewer3D.prototype, 'voxelThreshold', {
  get: function () {
    return this.__voxelThreshold;
  },
  set: function (v) {
    this.__voxelThreshold = v;
    if (this.voxels && this.voxels.updateGridField) {
      this.voxels.updateGridField('minThreshold', v);
    }
  }
});

Object.defineProperty(Viewer3D.prototype, 'mesher', {
  get: function () {
    return this.__mesher;
  },
  set: function (v) {
    this.__mesher = v;
    if (this.voxels && this.voxels.updateField) {
      this.voxels.updateField('mesher', v);
    }
  }
});


VoxelViewer.prototype.setupDatGui = function() {
  if (this.useDatGui) {
    Viewer3D.prototype.setupDatGui.call(this);
    this.datgui.add(this, 'voxelThreshold', 0, 1, 0.01).name('Voxel threshold');
    this.datgui.add(this, 'mesher', ['greedy', 'stupid', 'monotone', 'culled']).name('Mesher');
    if (this.loadFileInput) {
      this.datgui.add({
        loadFile : function() {
          this.loadFileInput.file.click();
        }.bind(this)}, 'loadFile'). name('Load voxels');
    }
  }
};

VoxelViewer.prototype.setupUI = function() {
  var scope = this;
  if (this.allowCustomLoading) {
    var loadFileInput = UIUtil.createFileInput({
        id: scope.__prefix + 'loadFile',
        label: 'Load',
        hideFilename: true,
        inline: true,
        //style: 'hidden',
        loadFn: function (file) {
          scope.loadVoxels(file);
        }
    });
    this.controlsPanel.append(loadFileInput.group);
    this.loadFileInput = loadFileInput;
  }
};

VoxelViewer.prototype.setupBasicScene = function() {
  // Setup renderer
  var width = this.container.clientWidth;
  var height = this.container.clientHeight;
  this.camera = new THREE.CombinedCamera(width, height, 45, 1, 4000, 1, 4000);
  this.renderer = new Renderer({ container: this.container, camera: this.camera, useAmbientOcclusion: this.useAmbientOcclusion });

  // Setup camera controls
  this.cameraControls = new CameraControls({
    camera: this.camera,
    controlType: this.controlType,
    container: this.container,
    autoRotateCheckbox: $('#autoRotate'),
    renderCallback: this.render.bind(this) });

  // Setup scene
  this.scene = new THREE.Scene();
  this.light = this.createDefaultLight();
  this.scene.add(this.light);
  this.scene.add(this.camera);

  this.voxelsNode = new THREE.Group();
  this.voxelsNode.name = 'Voxels';
  this.scene.add(this.voxelsNode);
};

VoxelViewer.prototype.registerCustomEventListeners = function() {
  if (Constants.isBrowser) {
    window.scene = this.scene;  // Export for THREE.js inspector debugging
    window.addEventListener('resize', this.onWindowResize.bind(this), false);
    $(document).keydown(this.keyHandler.bind(this));
    //this.setupDatGui();
    //this.setupInstructions();
  }

  // Hookup camera control panel
  this.cameraControlsPanel = new CameraControlsPanel({
    app: this,
    container: $('#cameraControls'),
    controls: this.cameraControls,
    iconsPath: Constants.cameraControlIconsDir,
    cameraWidgetSettings: Constants.cameraWidgetSettings
  });
  this.cameraControlsPanel.hookupRotateKeys();
};

VoxelViewer.prototype.keyHandler = function (event) {
  //        console.log("Key pressed: " + event.which + ", " + String.fromCharCode(event.which));
  //        console.log(event.target);
  var tagName = (event.target || event.srcElement).tagName;
  if (tagName === 'INPUT' || tagName === 'SELECT' || tagName === 'TEXTAREA') {
    return;
  }
  switch (event.which) {
    case 33:
      // on page up code
      this.nextSlice(+1, event.shiftKey);
      event.stopPropagation();
      event.preventDefault();
      return;

    case 34:
      // on page down code
      this.nextSlice(-1, event.shiftKey);
      event.stopPropagation();
      event.preventDefault();
      return;
  }
};

VoxelViewer.prototype.getRenderScene = function () {
  return this.scene;
};

VoxelViewer.prototype.clearVoxels = function() {
  Object3DUtil.removeAllChildren(this.voxelsNode);
};

VoxelViewer.prototype.loadVoxels = function(file) {
  var scope = this;
  scope.clearVoxels();
  scope.voxels = new Voxels({
    path: file,
    mesher: this.mesher,
    size: this.voxelSize,
    sizeBy: this.voxelSize ? null : 'alpha'
  });
  scope.voxels.init();
  scope.voxels.loadVoxels(function(v) {
    var voxelNode = scope.voxels.getVoxelNode();
    Object3DUtil.centerAndRescaleObject3DToWorld(voxelNode, 200);
    scope.voxelsNode.add(voxelNode);
    scope.cameraControls.viewTarget({
      targetBBox: Object3DUtil.getBoundingBox(voxelNode),
      theta: Math.PI/6,
      phi: -Math.PI/4,
      distanceScale: 2.0
    });
  }, function(err) {
    scope.showAlert('Error loading voxels: ' + err);
  });
};

VoxelViewer.prototype.nextSlice = function (inc, partControl) {
  this.voxels.clearVoxelSlice(this.voxelsNode);
  if (partControl) {
    this.voxels.showNextSliceDim(this.voxelsNode, inc, -1);
  } else {
    this.voxels.showNextVoxelSlice(this.voxelsNode, inc, this.voxels.sliceDim, -1);
  }
};

VoxelViewer.prototype.showAlert = function(message, style) {
  UIUtil.showAlert(this.container, message, style || 'alert-danger');
};

VoxelViewer.prototype.getSceneBoundingBox = function () {
  if (this.voxels) {
    return Object3DUtil.getBoundingBox(this.voxelsNode);
  } else {
    var bbox = new BBox();
    bbox.includePoint(new THREE.Vector3());
  }
};


module.exports = VoxelViewer;
