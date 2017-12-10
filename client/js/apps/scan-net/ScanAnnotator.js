'use strict';

/* Interface for annotating scans */

var AssetGroups = require('assets/AssetGroups');
var AssetLoader = require('assets/AssetLoader');
var CameraControlsPanel = require('controls/CameraControlsPanel');
var Constants = require('Constants');
var Colors = require('util/Colors');
var ModelViewer = require('model-viewer/ModelViewer');
var Object3DUtil = require('geo/Object3DUtil');
var ShapeEditor = require('editor/ShapeEditor');
var SceneEditControls = require('controls/SceneEditControls');
var LabeledGridEditor = require('editor/LabeledGridEditor');
var Voxels = require('model/ModelInstanceVoxels');
var RegionsPanel = require('ui/RegionsPanel');
var UIUtil = require('ui/UIUtil');
var _ = require('util');

Constants.defaultPalette = Colors.palettes.d3_category18;
/**
 * Generic scan annotation app
 * @param params
 * @constructor
 * @extends ModelViewer
 */
var ScanAnnotator = function (params) {
  var defaults = {
    allowPrevNext: false,
    maxGridCells: 50,
    showShapeEditor: true,
    useVoxelEditor: false,
    showVoxels: false,
    useClippingPlanes: true,
    clipOnLookAt: true
  };
  params = _.defaults(Object.create(null), params, defaults);
  ModelViewer.call(this, params);
  this._showShapeEditor = params.showShapeEditor;
  this._useVoxelEditor = params.useVoxelEditor;
  this._showVoxels = params.showVoxels;
  this.partViewerUrlTemplate = _.template(params.partViewerUrl);
  this.defaultPartSource = params.defaultPartSource;
  this.defaultPartType = params.defaultPartType;
  this.controlTypes = ['orbitRightClick', 'firstPerson'];
  this.controlTypesMap = _.invert(this.controlTypes);
  this.controlType = this.controlTypes[this._controlTypeIndex];
  this.regionsPanel = new RegionsPanel({
    container: params.loadAnnotationsPanel,
    app: this,
    fileTypes: ['regions', 'rooms', 'rooms_refined', 'rooms_fixed']
  });

  this.mouseTooltipSpan = null;
  this._voxelOpacity = 1.0;
  this._bboxOpacity = 0.25;
  this._colorBy = 'roomType';
};

ScanAnnotator.prototype = Object.create(ModelViewer.prototype);
ScanAnnotator.prototype.constructor = ScanAnnotator;

Object.defineProperty(ScanAnnotator.prototype, 'showShapeEditor', {
  get: function () {return this._showShapeEditor; },
  set: function (v) {
    if (v) {
      // Setup up ShapeEditor
      if (!this.gridPlane) {
        this.show2D = v;
      } else {
        this.showGrid = v;
      }
      this.shapeEditor.enabled = true;
      this.shapeEditor.groundPlane = (this.voxelEditor) ? this.voxelEditor.plane : this.gridPlane;
      this.shapeEditor.groundNormal = Constants.worldUp;
    } else {
      // Revert to old settings
      this.shapeEditor.enabled = false;
    }
    this.editControls.enabled = !v;
    this._showShapeEditor = v;
  }
});

Object.defineProperty(ScanAnnotator.prototype, 'showVoxels', {
  get: function () {return this._showVoxels; },
  set: function (v) {
    this._showVoxels = v;
    if (this.labeledVoxels) {
      Object3DUtil.setVisible(this.labeledVoxels.getVoxelNode(), v);
    }
    if (this.voxelEditor) { this.voxelEditor.enabled = v; }
    this.editControls.enabled = !v;
  }
});

Object.defineProperty(ScanAnnotator.prototype, 'voxelOpacity', {
  get: function () {return this._voxelOpacity; },
  set: function (v) {
    this._voxelOpacity = v;
    var target = this.labeledVoxels.getVoxelNode();
    if (target) {
      // Make semi transparent
      var transparency = 1.0 - this._voxelOpacity;
      Object3DUtil.setTransparency(target, transparency);
    }
  }
});

Object.defineProperty(ScanAnnotator.prototype, 'colorBy', {
  get: function () {return this._colorBy; },
  set: function (v) {
    this._colorBy = v;
    if (this.house) {
      this.house.recolor(this._colorBy);
    }
  }
});

Object.defineProperty(ScanAnnotator.prototype, 'bboxOpacity', {
  get: function () {return this._bboxOpacity; },
  set: function (v) {
    this._bboxOpacity = v;
    if (this.house) {
      this.house.setBBoxOpacity(v);
    }
  }
});

ScanAnnotator.prototype.init = function () {
  ModelViewer.prototype.init.call(this);
  this.regionsPanel.init();

  var scene = this.getRenderScene();
  var sceneBBox = this.getSceneBoundingBox();
  this.shapeEditor = new ShapeEditor({
    app: this,
    container: this.container,
    picker: this.picker,
    camera: this.camera,
    scene: scene,
    labelsPanel: {
      container: $('#nameButtonsDiv'),
      allowNewLabels: true,
      autoLowercase: false,
      checkNewLabel: 'notInLabels',
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
      labelToName: function(label, idx) {
        if (this.house) {
          var roomTypeCounts = this.house.statistics.roomTypes;
          var count = roomTypeCounts[label];
          if (count > 0) {
            return label + '(' + count + ')';
          }
        }
        return label;
      }.bind(this)
    }
  });
  this.editControls = new SceneEditControls({
    app: this,
    container: this.container,
    picker: this.picker,
    cameraControls: this.cameraControls,
    scene: this.shapeEditor.node,
    enabled: !this.showShapeEditor,
    allowAny: true,
    useThreeTransformControls: true,
    uilog: this.uilog
  });
  if (this._useVoxelEditor) {
    this.voxelEditor = new LabeledGridEditor({
      container: this.container,
      picker: this.picker,
      camera: this.camera,
      scene: scene,
      sceneBBox: sceneBBox,
      supportDrag: false
    });
    var scope = this;
    this.shapeEditor.Subscribe('labelChanged', scope.voxelEditor, function (labelInfo) {
      scope.mouseTooltipSpan.text(labelInfo.name);
      scope.voxelEditor.setLabelInfo(labelInfo);
    });
  }

  if (this.datgui) {
    this.datgui.add(this, 'showShapeEditor').name('Shapes').listen();
    this.datgui.add(this, 'showVoxels').name('Voxels').listen();
    this.datgui.add(this, 'voxelOpacity', 0, 1).name('Voxel opacity').listen();
    this.datgui.add(this, 'bboxOpacity', 0, 1).name('BBox opacity').listen();
    this.datgui.add(this, 'colorBy', ['roomId', 'roomType', 'level']).listen();
    this.shapeEditor.updateDatGui(this.datgui);
    this.datgui.open();
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

  this.labeledVoxels = new Voxels({ voxelsField: 'voxels-labeled', mesher: 'culled' });
};

ScanAnnotator.prototype.setupInstructions = function () {
  var instructions = $('#instructions');
  if (instructions) {
    instructions.html(
      [
        'Select room type from panel and left click-drag to draw a box.',
        'Change box height in control panel. Change ground plane height from controls->view.',
        'Right click = Orbit view (shift+right to pan)',
        'Mouse wheel = Zoom view',
        'B = Toggle box selection mode',
        'DEL = Delete currently selected box',
        'S = Toggle manipulator to scale mode',
        'R = Toggle manipulator to translate mode',
        'P = Print current annotations and save to file',
        'I = Save image',
        'T = Toggle view controller mode',
        '1/2/3... = Shortcuts to select label',
        'Shift+R = Reset camera',
        'Shift+A = Toggle coordinate axes'
      ].join('<br>')
    );
  }
};

ScanAnnotator.prototype.setupEventListeners = function () {
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
            var p = selected.point.clone();
            console.log(scope.getTarget().modelObject3D.worldToLocal(p));
          }
        } else {
          scope.shapeEditor.onMouseClick(event);
        }
      }
    },
    false
  );

  this.renderer.domElement.addEventListener('mouseup', function (event) {
      event.preventDefault();
      scope.renderer.domElement.focus();
      if (event.which === Constants.LEFT_MOUSE_BTN) {
        scope.editControls.onMouseUp(event);
        scope.shapeEditor.onMouseUp(event);
        if (scope.voxelEditor) { scope.voxelEditor.onMouseUp(event); }
      }
    },
    false
  );

  this.renderer.domElement.addEventListener('mousedown', function (event) {
      scope.renderer.domElement.focus();
      if (event.which === Constants.LEFT_MOUSE_BTN) {
        scope.editControls.onMouseDown(event);
        scope.shapeEditor.onMouseDown(event);
        if (scope.voxelEditor) { scope.voxelEditor.onMouseDown(event); }
      }
    },
    false
  );

  this.renderer.domElement.addEventListener('mousemove', function (event) {
      event.preventDefault();
      scope.renderer.domElement.focus();
      // Set position of mouse tooltip
      var rect = scope.container.getBoundingClientRect();
      scope.mouseTooltipSpan.css({
        top: (event.clientY - rect.top + 30) + 'px',
        left: (event.clientX - rect.left + 30) + 'px'
      });
      if (event.which !== Constants.RIGHT_MOUSE_BTN) {
        scope.editControls.onMouseMove(event);
        scope.shapeEditor.onMouseMove(event);
        if (scope.voxelEditor) { scope.voxelEditor.onMouseMove(event); }
      }
    },
    false
  );

  this.renderer.domElement.addEventListener('keydown', function (event) {
      event.preventDefault();
      scope.renderer.domElement.focus();
      scope.shapeEditor.onKeypress(event);
    },
    false
  );

};

ScanAnnotator.prototype.onEditOpInit = function (command, cmdParams) {
};

ScanAnnotator.prototype.onEditOpDone = function (command, cmdParams) {
};

ScanAnnotator.prototype.onSceneChanged = function () {
  ModelViewer.prototype.onSceneChanged.call(this);
  this.showShapeEditor = this._showShapeEditor;
  var scene = this.getRenderScene();
  var sceneBBox = this.getSceneBoundingBox();
  // ShapeEditor need to come before
  var target = this.getTarget();
  this.shapeEditor.reset({
    scene: scene,
    camera: this.camera,
    matrixWorld: target.getObject3D('Model').matrixWorld
  });
  this.editControls.reset({
    scene: this.shapeEditor.node,
    cameraControls: this.cameraControls
  });
  this.regionsPanel.setTarget(target);
  if (this.voxelEditor) {
    this.voxelEditor.reset({
      scene: scene,
      sceneBBox: sceneBBox,
      camera: this.camera
    });
  }
  if (target) {
    this.shapeEditor.baseObject = target.object3D;
    if (this.voxelEditor) { this.loadVoxels(target, this.labeledVoxels); }
  } else {
    this.shapeEditor.baseObject = null;
  }
};

ScanAnnotator.prototype.loadVoxels = function (modelInstance, voxels) {
  var scene = this.getRenderScene();
  voxels.init(modelInstance);
  voxels.loadVoxels(
    function (v) {
      this.voxelEditor.setVoxels(v);
      this.gridPlane = this.voxelEditor.gridlines;
      this.showGrid = this._showGrid;
      this.shapeEditor.setLabels(v.getVoxelGrid().labels);
      this.voxelOpacity = this._voxelOpacity;
      Object3DUtil.setVisible(this.labeledVoxels.getVoxelNode(), this._showVoxels);
      scene.add(v.getVoxelNode());
    }.bind(this)
  );
};

ScanAnnotator.prototype.setAnnotations = function(json) {
  var scope = this;
  var modelId = this.getTargetModelId();
  var idParts = modelId.split('.');
  if (json.fullId == undefined || json.annotations == undefined) {
    UIUtil.showAlert(null, 'Invalid annotations file!');
  } else if (json.fullId === modelId || json.id === idParts[idParts.length-1]) {
    // Apply annotations
    var toWorld = scope.shapeEditor.matrixWorld;
    for (var i = 0; i < json.annotations.length; i++) {
      var ann = json.annotations[i];
      if (ann.type === 'box') {
        ann.id = 'region' + i;
      }
    }
    scope.shapeEditor.setObjects(json.annotations, { transform: toWorld });
    scope.shapeEditor.objectsNode.userData.id = idParts[idParts.length-1];
    this.regionsPanel.setRegions(scope.shapeEditor.objectsNode);
  } else {
    UIUtil.showAlert(null, 'Annotations are not for current model.  Please load model ' + json.fullId + '.');
    // bootbox.confirm('Annotations are not for current model. Do you want to load model ' + json.id + '?',
    //   function (result) {
    //     if (result) {
    //       this.clearAndLoadModel();
    //     }
    //   }.bind(this));
  }
};

ScanAnnotator.prototype.hasAnnotations = function() {
  var objects = this.shapeEditor.getObjects();
  return (objects && objects.length);
};

ScanAnnotator.prototype.loadAnnotations = function(file, fileType) {
  if (!file) {
    UIUtil.showAlert(null, 'No annotations file!');
    return;
  }
  console.log('loading ' + fileType, file);
  var scope = this;
  var assetLoader = new AssetLoader();
  var filename = (typeof file === 'string')? file : file.name;
  if (fileType === 'house' || fileType === 'rooms' || fileType === 'rooms_refined' || fileType === 'rooms_fixed') {
    var info = scope.getTarget().model.info;
    var partSource = info.partSource || this.defaultPartSource;
    var partAssetGroup = AssetGroups.getAssetGroup(partSource);
    var partType = partAssetGroup? partAssetGroup.regionName : this.defaultPartType;
    console.log('partAssetGroup', partAssetGroup);

    var HouseLoader = require('loaders/HouseLoader');
    var houseLoader = new HouseLoader({ fs: require('io/FileUtil') });
    houseLoader.load(file, function(err, house) {
      if (err) {
        console.error('Error loading ' + fileType, err);
        UIUtil.showAlert('Error loading ' + fileType);
      } else {
        house.name = info.id;
        console.log('loaded', house);
        var objectsNode = houseLoader.createHouseGeometry(house);
        objectsNode.userData.partSource = info.partSource;
        objectsNode.userData.partType = partType;
        Object3DUtil.setMatrix(objectsNode, scope.shapeEditor.matrixWorld);

        //scope.shapeEditor.setObjects(json.annotations, { transform: toWorld });
        scope.debugNode.add(objectsNode);
        scope.regionsPanel.setRegions(objectsNode);
        house.recolor(scope.colorBy);
        house.setBBoxOpacity(scope.bboxOpacity);
        scope.house = house;
        // Get room categories
        var roomTypes = _.keys(house.statistics.roomTypes);
        scope.shapeEditor.labelsPanel.setLabels(roomTypes, house.getRegionTypeIndex().idToIndex);
      }
    });
  } else {
    assetLoader.load(file, 'json', function (json) {
      scope.setAnnotations(json);
      scope.house = null;
    }, null, function (err) {
      UIUtil.showAlert(null, 'Error loading annotations ' + filename);
      console.error('Error loading annotations ' + filename, err);
    });
  }
};

ScanAnnotator.prototype.open = function(scene, objects) {
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


module.exports = ScanAnnotator;

