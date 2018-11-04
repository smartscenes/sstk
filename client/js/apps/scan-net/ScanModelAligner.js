'use strict';

var Constants = require('Constants');
var keymap = require('controls/keymap');
var AnnotatorHelper = require('annotate/AnnotatorHelper');
var LabelsPanel = require('ui/LabelsPanel');
var Object3DUtil = require('geo/Object3DUtil');
var PubSub = require('PubSub');
var MeshHelpers = require('geo/MeshHelpers');
var SceneViewer = require('scene-viewer/SceneViewer');
var Segments = require('geo/Segments');
var Timings = require('util/Timings');
var UIUtil = require('ui/UIUtil');
var _ = require('util/util');

/**
 * Task for aligning 3D models to a scanned scene mesh
 * Much of the functionality of aligning and placing 3D models is provided by the {@link SceneViewer}
 *   and {@link controls.OBBQueryControls}.
 * @param params Configuration (see {@link SceneViewer} and {@link AnnotatorHelper} for additional parameters)
 * @param [params.submitToParent] {boolean} Whether to submit to parent window or directly to DB (if not specified, will be true if nested window.parent !== window.top)
 * @param [params.segmentType=surfaces] {string}
 * @param [params.skipLabelSet=['wall', 'floor', 'ceiling', 'window', 'door', 'unknown']] {string[]} List of labels not to attempt model alignment for
 * @param [params.minObjects=1] {int} Minimum of objects required
 * @constructor
 * @memberOf scannet
 */
function ScanModelAligner(params) {
  var defaults = {
    appId: 'ScanModelAligner.v1',
    submitAnnotationsUrl: Constants.submitAnnotationsURL,
    retrieveAnnotationsUrl: Constants.retrieveAnnotationsURL,
    submitToParent: window.parent !== window.top,
    screenshotMaxWidth: 100,
    screenshotMaxHeight: 100,
    enforceUserId: true,
    skipLabelSet: ['unknown', 'delete', 'remove'],
    shapeLabels: { 'box': ['wall', 'floor', 'ceiling', 'window', 'door'] },
    //hideSkippedLabelSegments: true,
    segmentType: 'surfaces',
    minObjects: 1,
    showSegs: true,
    task: 'scan-model-align',

    // SceneViewer configuration
    allowEdit: true,
    allowBBoxQuery: true,
    allowMagicColors: false,
    //allowCopyPaste: false,  // No explicit linking between model and labels if allowCopyPaste is true
    contextQueryType: 'obb',
    //restrictModels: '+datasets:ShapeNetCore',
    contextQueryOptions: { source: 'models3d' },
    //restrictModels: '+datasets:(ShapeNetSem OR ShapeNetCore) -category:Room',
    restrictModels: '+datasets:ShapeNetSem -category:Room',
    centerFirstModel: false, // Try to keep original scan coordinates
    useDatGui: { showScan: true, scanOpacity: true, showModels: true, showSegs: true, controls: true },
    instructions: {
      html: 'Click on objects to find 3D models to put on top of them and choose best match from the list that shows up.<br>' +
      'Rotate with left/right key, resize with up/down, and drag with mouse to move.<br>' +
      'When no object is selected, arrow keys or right-click and mouse wheel control the camera.<br>' +
      'After selecting a object, you can delete an object by pressing delete/backspace or use "r" to replace it.'
    },
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
        name: 'Toggle stats',
        click: function () {
          this.viewer.showStats = !this.viewer.showStats;
        }.bind(this),
        shortcut: 'f5'
      },
      // {
      //   name: 'remove',
      //   element: '#removeBtn',
      //   click: this.removeCurrentObject.bind(this),
      //   shortcut: 'del'
      // },
      {
        name: 'replace',
        element: '#replaceBtn',
        click: this.replaceSelected.bind(this),
        shortcut: 'r'
      },
      {
        name: 'submit',
        element: '#submitBtn',
        click: this.submitAnnotations.bind(this, 'done')
      },
      {
        name: 'save',
        element: '#saveBtn',
        click: this.submitAnnotations.bind(this, 'save')
      },
      {
        name: 'Debug',
        click: function () {
          var annotations = this.getAnnotations();
          console.log(annotations);
        }.bind(this),
        shortcut: 'shift-d'
      }
    ], 'name')
  };
  params = _.defaultsDeep(Object.create(null), params, defaults);

  this.viewer = new SceneViewer(params);
  this.appId = params.appId;
  this.task = params.task;
  this.modelId = params.modelId;
  this.segmentType = params.segmentType;
  this.skipLabelSet = params.skipLabelSet;
  this.shapeLabels = params.shapeLabels;
  if (this.shapeLabels) {
    this.labelToShape = _.invertMulti(this.shapeLabels);
  }
  this.__minObjects = params.minObjects;
  this.__showSegs = params.showSegs;
  this.timings = new Timings();

  this.viewer.Subscribe('SceneLoaded', this, this.__onSceneLoaded.bind(this));
  this.viewer.Subscribe('SceneRestore', this, this.__onSceneRestored.bind(this));
  this.viewer.Subscribe('ModelLoaded', this, this.__onModelLoaded.bind(this));
  this.viewer.Subscribe('DeleteObject', this, this.__onDeleteObject.bind(this));
  this.excludeFromPicking = [];
  this.isTransparent = false;
  this.placedModels = {};
  this.selectedSegmentIndex = null;
  this.instructions = { html: params.instructions.html };

  // Parse url parameters
  this.urlParams = _.getUrlParams();
  this.modelId = this.urlParams['modelId'] || this.modelId;
  this.segmentType = this.urlParams['segmentType'] || this.segmentType;
  this.segmentAnnotationId = this.urlParams['segmentAnnotationId'];
  this.userId = this.urlParams['userId'] || this.urlParams['workerId'];
  this.startFrom = this.urlParams['startFrom'] || params.startFrom;

  // Submission hookup
  this.submitToParent = params.submitToParent;
  this.__annotatorHelper = new AnnotatorHelper(this, params);
  // Use our custom submit annotations function
  this.__annotatorHelper.__submitAnnotations = function(action) {
    this.__submitAnnotations(action);
  }.bind(this);
}

ScanModelAligner.prototype = Object.create(PubSub.prototype);
ScanModelAligner.prototype.constructor = ScanModelAligner;

ScanModelAligner.prototype.init = function () {
  var scope = this;
  this.labels = [];
  this.labelsPanel = new LabelsPanel({
    container: '#nameButtonsDiv',
    labels: this.labels,
    labelColorIndex: this.labelColors
  });
  this.labelsPanel.createPanel();
  this.labelsPanel.Subscribe('labelSelected', this, this.onSelectLabel.bind(this));
  this.segments = new Segments({
    showNodeCallback: function(node) { scope.showNodeCallback(node); },
    sortSegmentsByArea: false,
    skipUnlabeledSegment: true
  }, this.segmentType);
  if (this.startFrom != undefined) {
    this.timings.start('sceneLoad');
    this.__startFromExisting(this.startFrom);
  } else if (this.modelId) {
    this.timings.start('scanLoad');
    this.viewer.loadModel(null, this.modelId, { useModelCoordFrame: true });
  }
  this.viewer.editControls.dragdrop.putOnObject = false;  // allow putting objects anywhere
  this.viewer.editControls.dragdrop.attachToParent = false;  // Don't attach to parent
  // NOTE: We want to make sure transform controls events are registered before scan model aligner events
  this.viewer.editControls.ensureTransformControls();
  this.registerEvents();

  this.setupDatGui();
};

ScanModelAligner.prototype.setupDatGui = function () {
  if (this.viewer.useDatGui) {
    var showAll = !(this.viewer.useDatGui instanceof Object);
    var options = (this.viewer.useDatGui instanceof Object) ? this.viewer.useDatGui : {};
    // Set up dat gui;
    var gui = this.viewer.datgui;
    if (gui) {
      var viewGui = gui.getFolder('view');
      if (showAll || options['showSegs']) {
        viewGui.add(this, 'showSegs').listen();
      }
    }
  }
};

Object.defineProperty(ScanModelAligner.prototype, 'showSegs', {
  get: function () {return this.__showSegs; },
  set: function (v) {
    this.__showSegs = v;
    Object3DUtil.setVisible(this.viewer.sceneState.debugNode, v);
  }
});

ScanModelAligner.prototype.gotoSegmentGroup = function (segGroupIdx, placedModel) {
  if (this.currObbWf) {
    this.viewer.sceneState.debugNode.remove(this.currObbWf);
  }
  var segGroup = this.segments.segmentGroups[segGroupIdx];
  var obb = this.segments.fitOBB('Raw', segGroup.segments);
  var labelinfo = this.labelsPanel.labelInfos[segGroupIdx];
  var mesh = new MeshHelpers.OBB(obb, labelinfo.colorMat);
  var meshwf = mesh.toWireFrame(1.0, true);
  this.currObbWf = meshwf;
  this.viewer.sceneState.debugNode.add(meshwf);
  var label = segGroup.label;
  var shape;
  if (this.labelToShape && this.labelToShape[label]) {
    shape = this.labelToShape[label];
  }
  console.log('Considering ' + label + ' with shape ' + shape);
  if (shape) {
    if (shape === 'box') {
      var transform = mesh.matrix.clone();
      mesh.material = Object3DUtil.TransparentMat;
      Object3DUtil.clearTransform(mesh);
      var modelInstance = this.viewer.onShapeInsert(mesh, { transform: transform, shape: 'box', enableEditControls: false });
      this.placedModels[segGroupIdx].modelInstance = modelInstance;
      modelInstance.object3D.userData.segGroupIndex = segGroupIdx;
    } else {
      console.warn('Ignoring unsupported shape: ' + shape);
    }
  } else {
    this.viewer.setContextQueryActive(true);
    this.viewer.contextQueryControls.setPlacement(obb, segGroup, placedModel);
    this.viewer.contextQueryControls.searchByTerm(label, true);
  }
};

ScanModelAligner.prototype.replaceSelected = function () {
  var selected = this.viewer.editControls.selected;
  if (selected) {
    var segGroupIndex = selected.userData.segGroupIndex;
    if (segGroupIndex != undefined) {
      this.selectedSegmentIndex = segGroupIndex;
      this.gotoSegmentGroup(segGroupIndex, Object3DUtil.getModelInstance(selected));
      //this.viewer.replace();
    }
  }
};

ScanModelAligner.prototype.removeCurrentObject = function () {
  if (this.selectedSegmentIndex >= 0) {
    var segmentGroup = this.placedModels[this.selectedSegmentIndex];
    delete this.placedModels[this.selectedSegmentIndex];
  }
  this.viewer.contextQueryControls.remove(this.viewer.sceneState);
};

ScanModelAligner.prototype.__onDeleteObject = function (object, modelInst) {
  var segGroupIndex = object.userData.segGroupIndex;
  if (segGroupIndex != undefined) {
    delete this.placedModels[segGroupIndex];
  }
  this.viewer.contextQueryControls.remove(this.viewer.sceneState);
};

ScanModelAligner.prototype.showNodeCallback = function (node) {
  this.viewer.sceneState.debugNode.add(node);
};

ScanModelAligner.prototype.onSelectLabel = function (labelInfo) {
  if (labelInfo) {
    this.setTransparency(true);
  }
  //this.labeler.currentLabelInfo = labelInfo;
};

ScanModelAligner.prototype.setTarget = function (modelInstance) {
  if (this.segmentAnnotationId) {
    var segInfo = modelInstance.model.info[this.segmentType];
    if (!segInfo.files && segInfo.file) {
      segInfo.files = {'segments': segInfo.file};
      delete segInfo.file;
    }
    segInfo.files["segmentGroups"] = _.replaceVars('${baseUrl}/scans/segment-annotations/aggregated?annId=${annId}', {
      baseUrl: Constants.baseUrl,
      annId: this.segmentAnnotationId
    });
  }
  this.segments.init(modelInstance);
  this.segments.loadSegments(function (err, res) {
    if (!err && this.onSegmentsLoaded) {
      this.onSegmentsLoaded(this.segments);
    }
  }.bind(this));
};

ScanModelAligner.prototype.labelFromExisting = function (labels, options) {
  options = options || {};
  var segmentGroups = this.segments.segmentGroups;
  for (var i = 0; i < segmentGroups.length; i++) {
    var segGroup = segmentGroups[i];
    if (segGroup.label === 'unknown') {
      continue; // Skip unknown
    }
    if (segGroup.segments && segGroup.segments.length > 0) {
      var segs = segGroup.segments;
      var labelInfo = options.addLabels?
        labels.addLabel(segGroup.label, { fixed: options.fixed } ) :
        labels.createLabel(segGroup.label, { index: i, color: options.color, fixed: options.fixed } );
    }
  }
};

ScanModelAligner.prototype.onSegmentsLoaded = function (segments) {
  var labelColorIndex = { 'unknown': '#A9A9A9' };  // mapping label to colors
  segments.colorSegments('Segment', labelColorIndex, null, function(index, color) {
    var mat = Object3DUtil.getSimpleFalseColorMaterial(index, color);
    mat.side = THREE.FrontSide;
    return mat;
  });
  this.labelsPanel.setLabels(segments.getLabels(), labelColorIndex);
  segments.showAllSegments(true);  // don't recolor (we are happy)
  this.timings.mark('annotatorReady');
  this.viewer.cameraControls.timedAutoRotate(10000, 10.0, function () {});
};

ScanModelAligner.prototype.__onModelLoaded = function (modelInstance) {
  if (modelInstance.model.isScan()) {
    this.timings.stop('scanLoad');
    this.setTarget(modelInstance);
    UIUtil.showAlert(null, this.instructions.html, 'alert-warning', 15000);
  } else {  // inserted model
    // TODO: Fix segGroupIndex to use selectedSegmentIndex when the result was clicked (in case it was updated)
    // See SceneViewer.contextQueryControlsOnClickResult
    var segGroupIndex = this.selectedSegmentIndex;
    if (segGroupIndex >= 0) {
      var segGroup = this.placedModels[segGroupIndex];
      segGroup.modelInstance = modelInstance;
      modelInstance.object3D.userData.segGroupIndex = segGroupIndex;
    }
  }
};

ScanModelAligner.prototype.__onSceneLoaded = function () {
  this.sceneState = this.viewer.sceneState;
  if (this.__objectIndexToSegGroupIndex) {
    // Being loaded from scratch!
    var scope = this;
    _.forEach(this.__objectIndexToSegGroupIndex, function(segGroupIndex, objectIndex) {
      scope.placedModels[segGroupIndex].modelInstance = scope.sceneState.modelInstances[objectIndex];
      scope.sceneState.modelInstances[objectIndex].object3D.userData.segGroupIndex = segGroupIndex;
    });
    delete this.__objectIndexToSegGroupIndex;
    this.timings.stop('sceneLoad');

    for (var i = 0; i < scope.sceneState.modelInstances.length; i++) {
      var modelInstance = scope.sceneState.modelInstances[i];
      if (modelInstance.model.isScan()) {
        this.setTarget(modelInstance);
        break;
      }
    }
  }
  //this.labeler.setTarget(this.sceneState.scene);
};

ScanModelAligner.prototype.__onSceneRestored = function () {
  this.sceneState = this.viewer.sceneState;
  if (this.segments) {
    this.showNodeCallback(this.segments.rawSegmentObject3D);
    this.showNodeCallback(this.segments.segmentedObject3D);
    this.showNodeCallback(this.segments.obbsObject3D);
  }
  // sceneState restore due to undo/redo
  this.placedModels = {};
  for (var i = 0; i < this.sceneState.modelInstances.length; i++) {
    var modelInst = this.sceneState.modelInstances[i];
    var segGroupIndex = modelInst.object3D.userData.segGroupIndex;
    if (segGroupIndex != undefined) {
      var segGroup = this.segments.segmentGroups[segGroupIndex];
      //console.log('segments', modelInst.object3D.userData, this.segments.segmentGroups);
      var m = {
        segmentIndex: segGroupIndex,
        label: segGroup.label,
        modelInstance: modelInst
      };
      this.placedModels[segGroupIndex] = m;
    }
    if (modelInst.model.isScan()) {
      // this.setTarget(modelInst);
      // Weird hack - this undo thing is kinda weird
      this.segments.modelInstance = modelInst;
      this.segments.origObject3D = modelInst.object3D;
    }
  }
  //console.log('after restore',this.placedModels);
};

ScanModelAligner.prototype.launch = function () {
  this.viewer.launch();
  this.init();
};

ScanModelAligner.prototype.registerEvents = function () {
  var scope = this;

  this.viewer.renderer.domElement.addEventListener('mousedown', function (event) {
    // Turn off auto rotate
    scope.viewer.cameraControls.setAutoRotate(false);
    scope.setTransparency(true);
    if (event.button === 0) {
      scope.__mouseDown = true;
    }
  });

  this.viewer.renderer.domElement.addEventListener('mouseup', function (event) {
    if (event.button === 0 && scope.__mouseDown) {
      scope.__mouseDown = false;
      var intersect = scope.__intersectSegmentGroup(event);
      if (intersect && intersect.label !== undefined) {
        var idx = intersect.segmentIndex;
        scope.selectedSegmentIndex = idx;
        if (scope.placedModels[idx]) {
          console.log('already placed ' + idx);
        } else {
          scope.placedModels[idx] = intersect;
          scope.gotoSegmentGroup(idx);
        }
      }
    }
  });

  keymap({ on: 'left' },  function (event, context) {
    if (!this.viewer.editControls.selected) {
      this.viewer.cameraControlsPanel.orbitControls.left();
    }
  }.bind(this));
  keymap({ on: 'right' },  function (event, context) {
    if (!this.viewer.editControls.selected) {
      this.viewer.cameraControlsPanel.orbitControls.right();
    }
  }.bind(this));
  keymap({ on: 'up' },  function (event, context) {
    if (!this.viewer.editControls.selected) {
      this.viewer.cameraControlsPanel.orbitControls.up();
    }
  }.bind(this));
  keymap({ on: 'down' },  function (event, context) {
    if (!this.viewer.editControls.selected) {
      this.viewer.cameraControlsPanel.orbitControls.down();
    }
  }.bind(this));
};

ScanModelAligner.prototype.getIntersected = function (event) {
  var mouse = this.viewer.picker.getCoordinates(this.viewer.container, event);
  var pickables = [this.viewer.sceneState.debugNode];
  var intersect = this.viewer.picker.getFirstIntersected({
    x: mouse.x, y: mouse.y, camera: this.viewer.camera,
    objects: pickables, ignore: this.excludeFromPicking,
    allowAllModelInstances: true
  });
  return intersect;
};

ScanModelAligner.prototype.__intersectSegmentGroup = function (event) {
  var intersect = this.getIntersected(event);
  if (intersect) {
    var u = intersect.descendant.userData;
    if (u.label) {
      if (this.skipLabelSet.indexOf(u.label) >= 0) {
        return intersect;  // early out if in skipLabelSet
      }
      intersect.label = u.label;
      intersect.type = 'SegmentGroup';
      intersect.mesh = intersect.descendant;
      intersect.segmentIndex = u.index;
      u.segs = u.segs || [];
      u.segs[intersect.segmentIndex] = u.segs[intersect.segmentIndex] || {};
      intersect.userData = u.segs[intersect.segmentIndex];
      return intersect;
    }
  }
};

ScanModelAligner.prototype.setTransparency = function (flag) {
  var changed = this.isTransparent !== flag;
  if (changed) {
    this.isTransparent = flag;
    if (this.viewer.sceneState.debugNode) {
      Object3DUtil.setVisible(this.viewer.sceneState.debugNode, flag);
    }
    //this.labeler.showPart(flag);
  }
};

ScanModelAligner.prototype.getNumberOfObjects = function() {
  var placed = this.viewer.getSceneState().modelInstances.filter(function (mi) {
    return !mi.model.isScan();
  });
  return placed.length;
};

ScanModelAligner.prototype.check = function() {
  // Check if the scene is acceptable...
  var minObjects = this.__minObjects;

  var nObjects = this.getNumberOfObjects();
  if (nObjects >= minObjects) {
    return true;
  } else {
    if (nObjects < 1) {
      bootbox.alert("You haven't added anything to the scene yet.");
    } else {
      bootbox.alert('Are you sure you have included all objects in the scene?  Please check your scene.');
    }
    return false;
  }
};

ScanModelAligner.prototype.getAnnotationItemId = function () {
  return this.modelId;
};

ScanModelAligner.prototype.getAnnotations = function () {
  var placedModels = _.filter(this.placedModels, 'modelInstance');
  placedModels = _.map(placedModels, function (segGroup) {
      return {
        segGroupIndex: segGroup.segmentIndex,
        label: segGroup.label,
        mInstIndex: segGroup.modelInstance.object3D.index
      };
    });

  var data = {
    workerId: this.userId,
    condition: this.urlParams['condition'],
    itemId: this.modelId,
    results: {
      appId: this.appId,
      scene: this.viewer.sceneState.toJson(),
      segmentType: this.segmentType,
      segmentAnnotationId: this.segmentAnnotationId,
      startAnnotationId: this.startFrom,
      placedModels: placedModels,
      timings: this.timings.toJson()
      // ui_log: null
    },
    preview: this.viewer.getPreviewImageData()
  };

  return data;
};

ScanModelAligner.prototype.submitAnnotations = function (action) {
  this.__annotatorHelper.submitAnnotations(action);
};

ScanModelAligner.prototype.__submitAnnotations = function (action) {
  if (this.check()) {
    this.timings.mark('annotationSubmit');
    var data = this.getAnnotations();
    data.action = action;
    if (this.submitToParent) {
      var jsonString = JSON.stringify(data);
      if (parent) {
        console.log('SUBMIT TO PARENT');
        parent.postMessage(jsonString, '*');
      } else {
        console.log('NO PARENT TO SUBMIT');
        console.log(data);
      }
    } else {
      console.log('SUBMIT DIRECT');
      var annData = this.__annotatorHelper.prepareAnnotationData(this.modelId, _.omit(data.results, ['appId']), data.preview);
      annData.type = 'scan-model-align';
      annData.action = data.action;
      this.__annotatorHelper.submitAnnotationData(annData, this.modelId);
    }
  }
};

ScanModelAligner.prototype.__startFromExisting = function(startFrom) {
  var scope = this;
  this.__annotatorHelper.retrieveAnnotations({ format: 'json', id: this.startFrom }, function(err, results) {
    if (results && results.length > 0) {
      var result = results[0];
      var placedModels = result.data.placedModels;
      scope.segmentType = result.data.segmentType;
      scope.segmentAnnotationId = result.data.segmentAnnotationId;
      scope.__objectIndexToSegGroupIndex = {};
      if (placedModels) {
        for (var i = 0; i < placedModels.length; i++) {
          var placed = placedModels[i];
          scope.placedModels[placed.segGroupIndex] = {
            segmentIndex: placed.segGroupIndex,
            label: placed.label
          };
          scope.__objectIndexToSegGroupIndex[placed.mInstIndex] = placed.segGroupIndex;
        }
      }
      scope.viewer.clearAndLoadScene({ data: result.data.scene });
    } else {
      UIUtil.showAlert(null, 'Error loading existing annotation ' + startFrom);
      scope.viewer.loadModel(null, this.modelId);
    }
  });
};


module.exports = ScanModelAligner;
