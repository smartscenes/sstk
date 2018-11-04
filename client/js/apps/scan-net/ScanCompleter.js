'use strict';

/* Interface for annotating scans */

var AssetLoader = require('assets/AssetLoader');
var Auth = require('util/Auth');
var Constants = require('Constants');
var FileUtil = require('io/FileUtil');
var keymap = require('controls/keymap');
var Object3DUtil = require('geo/Object3DUtil');
var PLYExporter = require('exporters/PLYExporter');
var SceneViewer = require('scene-viewer/SceneViewer');
var SceneUtil = require('scene/SceneUtil');
var ShapeEditor = require('editor/ShapeEditor');
var UIUtil = require('ui/UIUtil');
var _ = require('util/util');

/**
 * Interface for someone to complete a scan by marking objects and walls
 * @param params
 * @constructor
 * @extends SceneViewer
 * @memberOf scannet
 */
var ScanCompleter = function (params) {
  var defaults = {
    sources: ['models3d'],
    allowPrevNext: false,
    maxGridCells: 50,
    showSearchOptions: false,
    showShapeEditor: true,
    drawAxes: true,
    autoLoadScene: true,
    allowEdit: true,
    allowEditAny: false,
    editMode: true,
    addGround: false,
    useDatGui: true,
    groupCategories: true,
    localLoadingFiletypes: ['scene'],
    categories: ['window','chair','bed','sofa','table','stand', 'desk', 'tv_stand',
      'television','door', 'kitchen_cabinet', 'hanging_kitchen_cabinet', 'wardrobe_cabinet',
      'toilet', 'sink', 'bathtub', 'mirror',
      'indoor_lamp','kitchen_appliance', 'household_appliance', 'fan', 'picture_frame', 'kitchenware', 'toy']
  };

  params = _.defaults(Object.create(null), params, defaults);
  SceneViewer.call(this, params);
  this._showShapeEditor = params.showShapeEditor;
  this.partViewerUrlTemplate = _.template(params.partViewerUrl);
  this.controlTypes = ['orbitRightClick', 'firstPerson'];
  this.controlTypesMap = _.invert(this.controlTypes);
  this.controlType = this.controlTypes[this._controlTypeIndex];
  this.categories = params.categories;
  this.groupCategories = params.groupCategories;

  this.auth = new Auth();
  this.auth.authenticate(function(user) {
    this.userId = user.username;
  }.bind(this));

  this.mouseTooltipSpan = null;
};

ScanCompleter.prototype = Object.create(SceneViewer.prototype);
ScanCompleter.prototype.constructor = ScanCompleter;

Object.defineProperty(ScanCompleter.prototype, 'showShapeEditor', {
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
      this.shapeEditor.groundPlane = this.gridPlane;
      this.shapeEditor.groundNormal = Constants.worldUp;
    } else {
      // Revert to old settings
      this.shapeEditor.finish();
      this.shapeEditor.enabled = false;
    }
    this.editControls.enabled = !v;
    this._showShapeEditor = v;
  }
});

ScanCompleter.prototype.init = function () {
  SceneViewer.prototype.init.call(this);

  var scene = this.getRenderScene();
  this.shapeEditor = new ShapeEditor({
    app: this,
    container: this.container,
    picker: this.picker,
    camera: this.camera,
    scene: scene,
    mode: ShapeEditor.DrawModes.Wall,
    defaultDrawMode: ShapeEditor.DrawModes.Wall
  });

  if (this.datgui) {
    this.datgui.add(this, 'showShapeEditor').name('ShapeEditor').listen();
    this.shapeEditor.updateDatGui(this.datgui);
    this.datgui.open();
  }

  this.cameraControlsPanel.hookupRotateKeys();

  this.showShapeEditor = true;
  this.showGrid = true;
  this.modelSearchController.searchPanel.searchCategories(this.categories, this.groupCategories);
};

ScanCompleter.prototype.setupInstructions = function () {
  var instructions = $('#instructions');
  if (instructions) {
    instructions.html(
      [
        'Draw walls by clicking on grid plane in wall mode (W).',
        'If necessary, control wall height with "boxHeight" slider, and adjust ground height using "view->gridPlaneHeight" slider.',
        'Add objects by switching out of ShapeEditor mode (S), selecting from panel and placing in scene by left click',
        'Right click = Orbit view (shift+right to pan)',
        'Mouse wheel = Zoom view',
        'S = Toggle shape editing mode (for drawing walls)',
        'W = Toggle wall drawing mode',
        'DEL = Delete currently selected object / wall',
        'Ctrl-S = Save current annotations to file.'
      ].join('<br>')
    );
  }
};

ScanCompleter.prototype.bindKeys = function () {
  var scope = this;
  var canvas = scope.renderer.domElement;
  keymap({ on: 'defmod-s', do: 'Save scene', target: canvas }, function () {
    var basename = scope.sceneState.info.fullId + '.' + scope.userId;
    console.log('Saving scene JSON+PLY for ' + basename);
    var json = scope.exportJSON(basename);
    scope.exportPLY(basename);
  });
  keymap({ on: 'shift-defmod-s', do: 'Save scene', target: canvas }, function () {
    var basename = scope.sceneState.info.fullId + '.' + scope.userId;
    console.log('Saving scene PLY for ' + basename);
    scope.exportPLY(basename);
  });
  // TODO Undo/redo is broken and needs to be fixed before re-enabling
  // keymap({ on: 'defmod-z', do: 'Undo', target: canvas }, function (event) {
  //   scope.undo(event);
  // });
  // keymap({ on: 'defmod-y', do: 'Redo', target: canvas }, function (event) {
  //   scope.redo(event);
  // });
  keymap({ on: 'ctrl-m', do: 'Tumble orientation', target: canvas }, function (event) {
    scope.tumble(event);
  });
  keymap({ on: 'ctrl-i', do: 'Take screenshot', target: canvas }, function () {
    scope.saveImage();
  });
  keymap({ on: 'ctrl-o', do: 'Reset camera', target: canvas }, function () {
    scope.cameraControls.restoreCameraState();
  });
  keymap({ on: 's', do: 'Toggle shape edit mode', target: canvas }, function () {
    console.log('Toggling shape edit');
    scope.showShapeEditor = !scope.showShapeEditor;
  });
};

ScanCompleter.prototype.getSerializedState = function() {
  var json = this.sceneState.toJson();
  var numObjects = json.scene.object.length;
  var annotations = this.shapeEditor.getAnnotations(numObjects);
  var out = _.merge(json, annotations);
  out.userId = this.userId;
  return out;
};

ScanCompleter.prototype.exportJSON = function (basename) {
  this.shapeEditor.finish();
  var out = this.getSerializedState();
  FileUtil.saveJson(out, basename + '.json', function(key, value) {
    if (value instanceof THREE.Vector3) {
      return value.toArray();
    } else {
      return value;
    }
  });
  return out;
};

ScanCompleter.prototype.exportPLY = function (basename) {
  this.shapeEditor.finish();
  var sceneState = this.sceneState;
  var scanIndex = _.findIndex(sceneState.modelInstances, function(m) {
    return m.model.info.source === 'mprm-hc';
  });
  if (scanIndex < 0) {
    scanIndex = 0;
  }

  // NOTE: this assumes all modelInstance object3Ds have a correctly set userData.objectIndex
  var object3Ds = _.map(sceneState.modelInstances, function(m) { return m.object3D; });
  object3Ds.push.apply(object3Ds, this.shapeEditor.objects);
  _.forEach(object3Ds, function(oi) {
    // NOTE: Why "Object" instead of "objectId"? See PLYExporter VertexAttributes.objectId spec -- name is Object, confusingly
    var attributes = { Object: oi.userData.objectIndex };
    Object3DUtil.traverseMeshes(oi, false, function(mesh) {
      mesh.userData.attributes = attributes;
    });
  });

  sceneState.fullScene.updateMatrixWorld();
  var target = sceneState.modelInstances[scanIndex].getObject3D('Model');
  var worldToModelTransform = new THREE.Matrix4();
  worldToModelTransform.getInverse(target.matrixWorld);

  var plyExporter = new PLYExporter({
    // format: 'ascii',
    vertexAttributes: [ PLYExporter.VertexAttributes.rgbColor, PLYExporter.VertexAttributes.objectId ]
  });
  SceneUtil.colorObjects(object3Ds, {
    palette: Constants.defaultPalette,
    getId: function (obj3D) {
      return obj3D.userData.objectIndex;
    },
    callback: function(err, res) {
      plyExporter.export(object3Ds, {
        transform: worldToModelTransform,
        name: basename
      });
    }
  });
};

ScanCompleter.prototype.setupEventListeners = function () {
  this.bindKeys();
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
      }
    },
    false
  );

  this.renderer.domElement.addEventListener('mousedown', function (event) {
      scope.renderer.domElement.focus();
      if (event.which === Constants.LEFT_MOUSE_BTN) {
        scope.editControls.onMouseDown(event);
        scope.shapeEditor.onMouseDown(event);
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
      }
    },
    false
  );

  this.renderer.domElement.addEventListener('mouseleave', function (event) {
    scope.editControls.onMouseLeave(event);
  });

  this.renderer.domElement.addEventListener('keydown', function (event) {
      event.preventDefault();
      scope.renderer.domElement.focus();
      var needHandling = scope.editControls.onKeyDown(event);
      if (needHandling) {
        scope.shapeEditor.onKeypress(event);
      }
    },
    false
  );

};

ScanCompleter.prototype.getTarget = function() {
  return this.sceneState.modelInstances[0];
};

ScanCompleter.prototype.getTargetModelId  = function () {
  var target = this.getTarget();
  return target? target.model.info.fullId : null;
};

ScanCompleter.prototype.onSceneChanged = function () {
  SceneViewer.prototype.onSceneChanged.call(this);
  this.showShapeEditor = this._showShapeEditor;
  var scene = this.getRenderScene();
  // ShapeEditor need to come before
  var target = this.getTarget();
  var info = target.model.info;
  var imgUrl = this.assetManager.getImagePreviewUrl(info.source, info.id);
  var img = $('<img src="'+ imgUrl +'">');
  $('#imagePanel').empty();
  img.appendTo('#imagePanel');
  this.shapeEditor.reset({
    scene: scene,
    camera: this.camera,
    matrixWorld: target.getObject3D('Model').matrixWorld
  });

  // if sceneState.json.annotations is non-empty, parse and populate ShapeEditor node
  var annotations = _.get(this.sceneState, 'json.annotations');
  if (annotations) {
    var toWorld = this.shapeEditor.matrixWorld;
    this.shapeEditor.setObjects(annotations, { transform: toWorld });
  }

  var n = this.shapeEditor.node;
  n.isPickable = true;
  n.isSelectable = false;
  n.isEditable = false;
  n.isSupportObject = true;
  this.sceneState.extraObjects.push(n);
  this.sceneState._addObject3DToFullScene(n);
  if (!this.sceneState.info.fullId) {
    this.sceneState.info.fullId = target.model.info.fullId;
  }

  if (target) {
    this.shapeEditor.baseObject = target.object3D;
  } else {
    this.shapeEditor.baseObject = null;
  }
  // Make sure grid plane is empty
  if (this.__gridPlane) {
    var modelInstances = Object3DUtil.findModelInstances(this.__gridPlane);
    for (var i = 0; i < modelInstances.length; i++) {
      this.__gridPlane.remove(modelInstances[i].object3D);
    }
  }
};

ScanCompleter.prototype.setAnnotations = function(json) {
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

ScanCompleter.prototype.loadAnnotations = function(file, fileType) {
  if (!file) {
    UIUtil.showAlert(null, 'No annotations file!');
    return;
  }
  console.log('loading ' + fileType, file);
  var scope = this;
  var assetLoader = new AssetLoader();
  var filename = (typeof file === 'string')? file : file.name;
  if (fileType === 'scan') {
  } else {
    assetLoader.load(file, 'json', function (json) {
      scope.setAnnotations(json);
    }, null, function (err) {
      UIUtil.showAlert(null, 'Error loading annotations ' + filename);
      console.error('Error loading annotations ' + filename, err);
    });
  }
};

ScanCompleter.prototype.__ensureGridPlane = function (forceRecompute) {
  var created = SceneViewer.prototype.__ensureGridPlane.call(this, forceRecompute);
  if (created) {
    console.log('ScanCompleter ensureGridPlane');
    this.__gridPlane.isPickable = true;
    this.__gridPlane.isSelectable = false;
    this.__gridPlane.isEditable = false;
    this.__gridPlane.isSupportObject = true;
    this.sceneState.extraObjects.push(this.__gridPlane);
    this.sceneState._addObject3DToFullScene(this.__gridPlane);
  }
};

ScanCompleter.prototype.modelSearchResultClickedCallback = function (source, id, result, elem, index) {
  // Automatically toggle to model insert mode
  this.showShapeEditor = false;
  SceneViewer.prototype.modelSearchResultClickedCallback.call(this, source, id, result, elem, index);
};


module.exports = ScanCompleter;

