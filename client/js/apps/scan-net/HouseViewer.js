'use strict';

var AssetGroups = require('assets/AssetGroups');
var CameraControlsPanel = require('controls/CameraControlsPanel');
var Constants = require('Constants');
var Colors = require('util/Colors');
var LabelsPanel = require('ui/LabelsPanel');
var ModelViewer = require('model-viewer/ModelViewer');
var Object3DUtil = require('geo/Object3DUtil');
var RegionsPanel = require('ui/RegionsPanel');
var UIUtil = require('ui/UIUtil');
var Util = require('util/Util');
var keymap = require('controls/keymap');
var _ = require('util');

Constants.defaultPalette = Colors.palettes.d3_category18;

/**
 * Interface for viewing annotated scans of houses
 * @param params
 * @constructor
 * @extends ModelViewer
 * @memberOf scannet
 */
var HouseViewer = function (params) {
  var defaults = {
    allowPrevNext: false,
    maxGridCells: 50,
    useClippingPlanes: true,
    clipOnLookAt: true,
    regionsPanel: {
        allowLocalLoading: true,
        fileTypes: ['regions', 'rooms']
    }
  };
  params = _.defaults(Object.create(null), params, defaults);
  ModelViewer.call(this, params);
  this.partViewerUrlTemplate = _.template(params.partViewerUrl);
  this.defaultPartSource = params.defaultPartSource;
  this.defaultPartType = params.defaultPartType;
  this.controlTypes = ['orbitRightClick', 'firstPerson'];
  this.controlTypesMap = Util.toIndexMap(this.controlTypes);
  this.controlType = this.controlTypes[this._controlTypeIndex];
  var regionsPanelOptions = _.defaults(Object.create(null), { app: this}, params.regionsPanel);
  this.regionsPanel = new RegionsPanel(regionsPanelOptions);

  this.mouseTooltipSpan = null;
  this._bboxOpacity = 0;
  this._regionOpacity = 0.25;
  this._objectsVisible = false;
  this._colorBy = 'regionType';
};

HouseViewer.prototype = Object.create(ModelViewer.prototype);
HouseViewer.prototype.constructor = HouseViewer;

Object.defineProperty(HouseViewer.prototype, 'colorBy', {
  get: function () {return this._colorBy; },
  set: function (v) {
    this._colorBy = v;
    if (this.house) {
      this.house.recolor(this._colorBy);
    }
  }
});

Object.defineProperty(HouseViewer.prototype, 'bboxOpacity', {
  get: function () {return this._bboxOpacity; },
  set: function (v) {
    this._bboxOpacity = v;
    if (this.house) {
      this.house.setBBoxOpacity(v);
    }
  }
});

Object.defineProperty(HouseViewer.prototype, 'regionOpacity', {
  get: function () {return this._regionOpacity; },
  set: function (v) {
    this._regionOpacity = v;
    if (this.house) {
      this.house.setRegionOpacity(v);
    }
  }
});

Object.defineProperty(HouseViewer.prototype, 'objectsVisible', {
  get: function () {return this._objectsVisible; },
  set: function (v) {
    this._objectsVisible = v;
    if (this.house) {
      this.house.setObjectsVisible(v);
    }
  }
});

HouseViewer.prototype.init = function () {
  ModelViewer.prototype.init.call(this);
  var scope = this;
  this.regionsPanel.init();
  // Make sure visibility for objects are correct
  this.regionsPanel.meshHierarchy.Subscribe('SelectNode', this, function(partNode) {
    if (partNode.userData.type !== 'Object') {
      scope.objectsVisible = scope.objectsVisible;
    }
  });

  var scene = this.getRenderScene();
  var sceneBBox = this.getSceneBoundingBox();
  this.labelsPanel = new LabelsPanel({
      container: $('#nameButtonsDiv'),
      autoLowercase: false,
      labels: [
        'Bedroom',
        'Bathroom',
        'Toilet',
        'Conference_Room',
        'Kitchen',
        'Living_Room',
        'Room',
        'Dining_Room',
        'Office',
        'Garage',
        'Hallway',
        'Hall',
        'Gym',
        'Child_Room',
        'Balcony',
        'Storage',
        'Wardrobe',
        'Entryway',
        'Lobby',
        'Terrace'
      ],
      labelToName: function (label, idx) {
        if (this.house) {
          var regionTypeCounts = this.house.statistics.regionTypes;
          var count = regionTypeCounts[label];
          if (count > 0) {
            return label + '(' + count + ')';
          }
        }
        return label;
      }.bind(this)
    }
  );

  if (this.datgui) {
    this.datgui.add(this, 'bboxOpacity', 0, 1).name('BBox opacity').listen();
    this.datgui.add(this, 'regionOpacity', 0, 1).name('Region opacity').listen();
    this.datgui.add(this, 'objectsVisible').name('Show objects').listen();
    this.datgui.add(this, 'colorBy', ['regionId', 'regionType', 'level']).listen();
    this.datgui.open();
  }
  if (this.clippingOptions) {
    this.clippingOptions.enabled = true;
  }

  this.setupEventListeners();

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

HouseViewer.prototype.setupInstructions = function () {
  var instructions = $('#instructions');
  if (instructions) {
    instructions.html(
      [
        'Right click = Orbit view (shift+right to pan)',
        'Mouse wheel = Zoom view',
        'I = Save image',
        'T = Toggle view controller mode',
        'Shift+R = Reset camera',
        'Shift+A = Toggle coordinate axes'
      ].join('<br>')
    );
  }
};

HouseViewer.prototype.setupEventListeners = function () {
  var scope = this;
  scope.mouseTooltipSpan = $('#mouseToolTip');
  $(this.renderer.domElement).hover(
    function () {
      scope.mouseTooltipSpan.show();
    },
    function () {
      scope.mouseTooltipSpan.hide();
    }
  );

  this.renderer.domElement.addEventListener('click', function (event) {
      event.preventDefault();
      scope.renderer.domElement.focus();
      if (event.which === Constants.LEFT_MOUSE_BTN) {
        if ((event.ctrlKey || event.metaKey) && event.shiftKey) {
          var selected = scope.selectMesh(event);
          if (selected) {
            scope.gridPlaneHeight = selected.point.y;
          }
        }
      }
    },
    false
  );
};

HouseViewer.prototype.onSceneChanged = function () {
  ModelViewer.prototype.onSceneChanged.call(this);
  var scene = this.getRenderScene();
  var sceneBBox = this.getSceneBoundingBox();
  // ShapeEditor need to come before
  var target = this.getTarget();
  this.regionsPanel.setTarget(target);
};

HouseViewer.prototype.loadAnnotations = function(file, fileType) {
  console.log('loading ' + fileType, file);
  var scope = this;
  var info = scope.getTarget().model.info;
  var partSource = info.partSource || this.defaultPartSource;
  var partAssetGroup = AssetGroups.getAssetGroup(partSource);
  var partType = partAssetGroup? partAssetGroup.regionName : this.defaultPartType;

  //var assetLoader = new AssetLoader();
  //var filename = (typeof file === 'string')? file : file.name;
  var HouseLoader = require('loaders/HouseLoader');
  var houseLoader = new HouseLoader({ fs: require('io/FileUtil') });
  houseLoader.load(file, function(err, house) {
    house.name = info.id;
    console.log('loaded', house);
    var objectsNode = houseLoader.createHouseGeometry(house);
    objectsNode.userData.partSource = info.partSource;
    objectsNode.userData.partType = partType;
    var target = scope.getTarget();
    Object3DUtil.setMatrix(objectsNode, target.getObject3D('Model').matrixWorld);

    scope.debugNode.add(objectsNode);
    scope.regionsPanel.setRegions(objectsNode);
    scope.house = house;
    house.recolor(scope.colorBy);
    house.setBBoxOpacity(scope.bboxOpacity);
    house.setRegionOpacity(scope.regionOpacity);
    house.setObjectsVisible(scope.objectsVisible);
    // Get room categories
    var regionTypes = _.keys(house.statistics.regionTypes);
    scope.labelsPanel.setLabels(regionTypes, house.getRegionTypeIndex().idToIndex);
  });
};

HouseViewer.prototype.open = function(scene, objects) {
  for (var i = 0; i < objects.length; i++) {
    console.log('open', objects[i]);
    if (objects[i].userData.type === 'Room' || objects[i].userData.type === 'Region' || objects[i].userData.type === 'box') {
      // Open in new window
      var regionId = objects[i].userData.id;
      if (scene.userData.partType) {
        regionId = scene.userData.partType + objects[i].userData.index;
      }
      var id = scene.userData.id + '_' + regionId;
      var source = scene.userData.partSource || this.defaultPartSource;
      var fullId = source + '.' + id;
      var url = this.partViewerUrlTemplate({ id: fullId });
      window.open(url, '_blank');
    }
  }
};


module.exports = HouseViewer;