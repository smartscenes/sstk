'use strict';

var Constants = require('Constants');
var ModelPartViewer = require('part-annotator/ModelPartViewer');
var BasePartAnnotator = require('part-annotator/BasePartAnnotator')(ModelPartViewer);
var FileLoader = require('io/FileLoader');
var BBox = require('geo/BBox');
var Object3DUtil = require('geo/Object3DUtil');
var OffscreenPicker = require('controls/OffscreenPicker');
var SegmentLabeler = require('part-annotator/SegmentLabeler');
var SegmentAnnotationStats = require('./SegmentAnnotationStats');
var Survey = require('ui/Survey');
var UIUtil = require('ui/UIUtil');
var PLYExporter = require('exporters/PLYExporter');
var VideoTrajControls = require('controls/VideoTrajControls');
var _ = require('util/util');

/**
 * Annotator for labeling scan segmentations. The output is a labeling on vertex-based segmentations.
 * @param params Configuration
 * @param [params.checkLabelable=true] {boolean} Whether to enforce check if something can be labeled or not
 *   (i.e. the distance check constraints).
 *   Toggled using `ctrl-shift-o`.
 * @param [params.taskMode=new] {string} Task mode can be `new`, `coverage`, or `fixup`.
 *   Use `new` to start brand new annotation,
 *   `coverage` to get additional annotations (but the existing annotation is fixed and cannot be changed), and
 *   `fixup` to allow arbitrary changes on top of an existing annotation.
 *   Also url param.
 * @param [params.startFrom=latest] {string|integer} What annotation to start from (used if taskMode is `fixup` or `coverage`)
 *   Possible values are `latest` (fixup from latest fixup (if available), otherwise from aggregation),
 *   `aggr` (will use precomputed aggregated segmentation),
 *   or id (integer) specifying specific annotation from database.
 *   Also url param.
 * @param [params.segmentType=surfaces] {string} What segmentation to use.
 * @param [params.useVideoControls=false] {boolean} Whether to allow camera control using video or not (experimental). Also url param.
 * @param [params.video] Video element to use if useVideoControls is true (experimental)
 * @param [params.clearAnnotationOptions.clearLabels=true] {boolean} Set clearLabels to false to keep any predefined labels
 * @param [params.annotationChecks] {SegmentAnnotator.AnnotationChecks} Set of checks to perform for ensuring that the user provided good annotation
 * @param [params.messages] {Object.<string, string>}} Mapping of messages to display to the user.  The following set of messages can currently be configured:
 *   <ul>
 *     <li><tt>initialAlert</tt> The initial message that is displayed to the user when the annotation interface is ready</li>
 *     <li><tt>labelLargest</tt> Prompt for user to label largest unlabeled segment (set to false to disable this prompt)</li>
 *     <li><tt>checkOkFinal</tt> Final message to display to the user to double check their work before submission and ending the session</li>
 *   </ul>
 * @extends ModelPartViewer
 * @extends BasePartAnnotator
 * @constructor
 * @example
 * var annotator = new STK.SegmentAnnotator({
 *   container: document.getElementById('canvas'),
 *   delayedLoading: true,
 *   video: document.getElementById('video'),
 *   labelsPanel: {
 *     addNewLabelToTop: true
 *   },
 *   segmentType: '#{segmentType}',
 *   onCloseUrl: "#{nextUrl}",
 * });
 * annotator.start();
 * @memberOf scannet
 */
function SegmentAnnotator(params) {
  var scope = this;
  var defaults = {
    appId: 'SegmentAnnotator.v5',
    submitAnnotationsUrl: Constants.submitSegmentAnnotationsURL,
    retrieveAnnotationsUrl:  Constants.retrieveSegmentsAnnotationsURL,
    itemIdField: 'modelId',
    instructions: {
      html:
      'Step 1: Select a name on the right<br>' +
      'Step 2: Color in individual objects by left click and dragging the mouse<br><br>' +
      '<b>Controls</b><br>' +
      'Left click = Paint object<br>' +
      'Left click and drag = paint continuously<br>' +
      'SHIFT + left click on painted object = Unpaint object<br><br>' +
      'CTRL(CMD) + left click on painted object = Select paint from object<br><br>' +
      'Right click and drag or arrow keys = Orbit/rotate camera<br>' +
      'SHIFT + right click and drag = Pan view<br>' +
      'Mouse wheel = Zoom view<br>' +
      'CTRL-SHIFT-R = Reset camera<br>' +
      'R = label everything in box<br>' +
      'D = unlabel everything in box<br>' +
      'B = toggle boxes around painted objects<br>' +
      'S = show largest unlabeled region<br>' +
      'C = toggle colors and enable/disable annotation<br>' +
      'CTRL-SHIFT-O = toggle distance constraint<br>' +
      'CTRL-SHIFT-K = clear all annotations<br>' +
      'Number keys = Keyboard shortcut for part name<br>' +
      'CTRL(CMD)-Z/Y = Undo/Redo<br>' +
      'CTRL(CMD)-C = Copy selected label<br>'
    },
    enableLookAt: false,
    labelsPanel: {
      allowNewLabels: true,
      allowEditLabels: true,
      noTransparency: true,
      addEraseMat: true,
      labelToName: function (label, idx) { return label + ' (' + (idx + 1) + ')'; },
      allowMultiSelect: true,
      // see http://swisnl.github.io/jQuery-contextMenu/demo/input.html
      contextMenu: {
        items: {
          merge: {
            name: 'Merge',
            callback: function () {
              scope.mergeSelected();
            },
            accesskey: "M"
          },
          lookAt: {
            name: 'LookAt',
            callback: function () {
              scope.lookAtSelected();
            },
            accesskey: "L"
          },
          freeze: {
            name: 'Freeze',
            callback: function() {
              scope.freezeSelected(true);
            },
            accesskey: "F"
          },
          unfreeze: {
            name: 'Unfreeze',
            callback: function() {
              scope.freezeSelected(false);
            }
          }
        }
      }
    },
    clearAnnotationOptions: {
      clearLabels: true               // Whether to clear labels when all annotations are cleared
    },
    defaultCameraSettings: {
      theta: Math.PI / 4,
      phi: 0
    },
    undo: {
      enabled: true
    },
    uihookups: _.keyBy([
      {
        name: 'next',
        element: '#nextBtn',
        click: this.checkAndSubmit.bind(this),
        shortcut: 'shift-n'
      },
      {
        name: 'copyLabel',
        click: function () { this.labelsPanel.copySelected(); }.bind(this),
        shortcut: 'ctrl-c'
      },
      {
        name: 'showLargest',
        click: function () { this.__showLargestUnlabeledSegment(); }.bind(this),
        shortcut: 's'
      },
      {
        name: 'obb',
        click: function () {
          this.obbsVisible = !this.obbsVisible;
          if (this.obbsVisible) {
            this.annotate(true);
          } else {
            this.clearDebug();
          }
        }.bind(this),
        shortcut: 'b'
      },
      {
        name: 'debug',
        click: this.debugAnnotations.bind(this),
        shortcut: 'ctrl-shift-d'
      },
      {
        name: 'toggle-check-labelable',
        element: '#overrideBtn',
        click: function () {
          this.checkLabelable = !this.checkLabelable;
          console.log('Enforcing labelable constraints: ' + this.checkLabelable);
        }.bind(this),
        shortcut: 'ctrl-shift-o'
      },
      {
        name: 'label-obb',
        element: '#labelObbBtn',
        click: function() {
          this.fillSelected(true);
        }.bind(this),
        shortcut: 'r'
      },
      {
        name: 'unlabel-obb',
        element: '#unlabelObbBtn',
        click: function() {
          this.fillSelected(false);
        }.bind(this),
        shortcut: 'd'
      },
      {
        name: 'exportPLY',
        click: function() {
          var plyExporter = new PLYExporter();
          this.labeler.segments.exportRaw(plyExporter, this.modelId);
        }.bind(this),
        shortcut: 'ctrl-shift-m'
      },
      {
        name: 'showImages',
        click: function() {
          this.showImages();
        }.bind(this),
        shortcut: 'ctrl-shift-i'
      }
    ], 'name'),
    annotationChecks: {
      annotationTiers: null,
      hardMinimumLabelCount: 1,
      requiredLabels: null
    },
    obbsVisible: true,
    checkLabelable: true,
    video: null,
    startFrom: 'latest', // Fixup from latest fixup (if available), otherwise from aggregation
                         // Other options are 'aggr', or a annotationId (integer)
    taskMode: 'new',  // Options are 'new', 'fixup', 'coverage',
    messages: {
      // Initial message to show users
      initialAlert: 'Use arrow keys or right click and mouse wheel to control camera. Paint objects with left click.',
      // Prompt to label largest unlabeled segment
      labelLargest: 'Are you sure you want to continue to the next scene? You can make more progress by annotating the region in red. Click "Cancel" to go back, or "Ok" to submit.',
      // Final check before session ends
      checkOkFinal: 'Please check each painted region is a single object and that you carefully painted the floor, ceiling and walls. Your work may be rejected otherwise. Click "Cancel" to fix problems, or "Ok" to submit.'
    }
  };
  params = _.defaultsDeep(Object.create(null), params, defaults);
  BasePartAnnotator.call(this, params);
  this.checkLabelable = params.checkLabelable;
  this.obbsVisible = params.obbsVisible;
  this.video = params.video;
  this.useVideoControls = Constants.getGlobalOrDefault('useVideoControls',
    this.urlParams['useVideoControls'] || params.useVideoControls);
  this.startFrom = Constants.getGlobalOrDefault('startFrom',
    this.urlParams['startFrom'] || params.startFrom);

  this.annotations = [];
  this.annotationStats = new SegmentAnnotationStats();
  this.painter.enabled = false;
  this.painter.eraseMat = Object3DUtil.ClearColor;
  this.__shownDistanceHeuristicAlert = false;
  this.__annotationChecks = params.annotationChecks;
  this.__useCleanAnnotations = (this.urlParams['clean'] != undefined)? this.urlParams['clean'] : params.useCleanAnnotations;

  this.objectId = params.objectId; // Specify a specific object id if we are annotating subparts of an object
  this.__view = params.view; // View parameter including target: point to focus on and radius: how large a view radius to have
  this.labelType = params.labelType || 'category'; // What are we labeling?

  // Initialize messages
  this.messages = params.messages;
  // Initialize survey
  var surveyParams = params.surveys? params.surveys[this.taskMode] : null;
  if (surveyParams) {
    this.survey = new Survey(surveyParams);
  }

  this.Subscribe('modelLoadStart', this, function(modelInfo) {
    scope.__rawAnnotations = null;
    scope.__bestFixupAnnotation = null;
    if (scope.taskMode !== 'new') {
      console.log('preparing for taskMode ' + scope.taskMode + ' ' + scope.startFrom);
      if (scope.startFrom === 'latest') {
        scope.loadLatestAnnotation(modelInfo.fullId);
      } else if (scope.startFrom !== 'aggr'/* && _.isInteger(scope.startFrom)*/) {
        scope.loadRawAnnotations(modelInfo.fullId, scope.startFrom);
      }
    }
  });
}

SegmentAnnotator.prototype = Object.create(BasePartAnnotator.prototype);
SegmentAnnotator.prototype.constructor = SegmentAnnotator;

/**
 * Returns state to be saved and restored for undo.
 * @param options
 * @returns {{annotations: Array, stats: *}}
 */
SegmentAnnotator.prototype.getState = function(options) {
  options = options || {};
  var labelInfos = this.labelsPanel? this.labelsPanel.getOrderedLabels() : [];
  var annotations = _.map(labelInfos, function(labelInfo) {
    var info = _.pick(labelInfo, ['color', 'id', 'index', 'label', 'name', 'fixed', 'frozen', 'obb', 'data', 'segIndices', 'initialPoint']);
    if (labelInfo.element && labelInfo.element.hasClass('active')) {
      info.active = true;
    }
    info.color = '#' + info.color.getHexString();
    info.obb = info.obb? info.obb.toJSON() : undefined;
    info.segIndices = _.clone(info.segIndices);
    return info;
  });
  var stats = _.clone(this.annotationStats.get());
  var selectedIndex = this.labeler.currentLabelInfo? this.labeler.currentLabelInfo.index : -1;
  //console.log('selectedIndex', selectedIndex);
  var state = { annotations: annotations, stats: stats, selectedIndex: selectedIndex };
  return state;
};

/**
 * Restores state (for undo)
 * @param saveState {Object} current save state
 * @param deltaState {string} Either "before" or "after" (restore to prevState for before, and saveState for after)
 * @param prevState {Object} last save state
 */
SegmentAnnotator.prototype.restoreState = function(saveState, deltaState, prevState) {
  this.__trackUndo(false);
  var state = (deltaState === 'before')? prevState : saveState;
  var annotations = state.data.annotations;
  this.clearAnnotations({clearLabels: true});
  this.labeler.restore(this.labelsPanel, annotations);
  // Restore selected buttons and painting brush
  var selectedLabelInfo;
  if (state.data.selectedIndex >= 0) {
    selectedLabelInfo = this.labeler.labelInfos[state.data.selectedIndex];
  }
  if (selectedLabelInfo) {
    //console.log('restore selectedIndex', state.data.selectedIndex);
    this.labelsPanel.selectLabel(selectedLabelInfo);
  } else {
    // Make sure painter and labeler don't have a brush selected
    this.labeler.currentLabelInfo = selectedLabelInfo;
    this.painter.setLabelInfo(selectedLabelInfo);
  }
  var activeLabelInfos = this.labelsPanel.getAllSelected();
  this.selectedLabelInfos = activeLabelInfos;
  if (this.obbsVisible) {
    this.showPartOBBs(activeLabelInfos);
  }
  // Restore statistics
  this.annotationStats.set(state.data.stats);
  this.__trackUndo(true);
};

/**
 * Create labeler that will be used during for segment annotation
 * @protected
 */
SegmentAnnotator.prototype.createLabeler = function () {
  var scope = this;
  var segmentType = Constants.getGlobalOrDefault('segmentType',
    this.urlParams['segmentType'] || this.__options.segmentType);
  var labeler = new SegmentLabeler({
    // TODO: If loading from annotations, this need to match the segment type of the specified annotation
    segmentType: segmentType,
    showNodeCallback: function (node) {
      scope.debugNode.add(node);
    },
    updateAnnotationStats: function (segIndex, multiplier) {
      scope.annotationStats.update(segIndex, multiplier);
    },
    getIntersected: function (e) { return scope.getIntersected(e); },
    onSegmentsLoaded:   function (segments) {
      segments.colorSegments('Raw');
      scope.annotationStats.compute(segments);
      scope.__annotatorReady();
    },
    isLabelable: function (part, labelInfo) {
      if (!part || part.userData.labelInfo && (part.userData.labelInfo.fixed || part.userData.labelInfo.frozen)) {
        // No part, or part is already labeled with fixed label
        return false;
      }

      // If we are in permissive mode, just let it through
      if (!scope.checkLabelable) { return true; }
      // check part's segment against slightly expanded OBB of current label set
      if (!labelInfo || !labelInfo.obb) { return true; }
      var obb = labelInfo.obb.clone();
      obb.expandLengths(new THREE.Vector3(0.1, 0.1, 0.1));
      //console.time('checkLabelable');
      var labelable = scope.labeler.segments.segmentHasPointInOBB(part.segmentIndex, obb);
      //console.timeEnd('checkLabelable');
      if (scope.painter.isMouseDown && !labelable && !scope.__shownDistanceHeuristicAlert) {
        UIUtil.showAlert(null, 'Please label separate objects with different labels',
            'alert-danger', 5000);
        scope.__shownDistanceHeuristicAlert = true;
      }
      return labelable;
    }
  });
  labeler.segments.Subscribe('loadSegments', this, function () {
    scope.addWaiting('loadSegments');
  });
  labeler.segments.Subscribe('loadSegmentsDone', this, function () {
    scope.removeWaiting('loadSegments');
  });
  this.metadata = this.metadata || {};
  this.metadata['segmentType'] = labeler.segmentType;
  return labeler;
};


SegmentAnnotator.prototype.getIntersected = function(event) {
  if (!this.scene) {
    return;
  } // Not ready yet

  // make sure picker is initialized
  if (!this.offscreenPicker) {
    this.offscreenPicker = new OffscreenPicker({
      camera: this.camera,
      width: this.renderer.width,
      height: this.renderer.height
    });
  }

  var mesh = this.labeler.segments.rawSegmentObject3D;
  if (mesh) {
    return this.offscreenPicker.getIntersectedFromScreenPosition(this.container, event, this.camera, mesh);
  }
};

/**
 * Create panel of labels for use during annotation
 * @protected
 */
SegmentAnnotator.prototype.createPanel = function () {
  BasePartAnnotator.prototype.createPanel.call(this);

  var counterBox = $('#counterBox');
  if (counterBox && counterBox.length > 0) {
    var current = this.numItemsAnnotated + 1;
    var totalToAnnotate = this.numItemsTotal;
    this.overallProgressCounter = $('<div></div>').text('Scenes: ' + current + '/' + totalToAnnotate);
    counterBox.append(this.overallProgressCounter);
    this.modelProgressCounter = $('<div></div>');
    counterBox.append(this.modelProgressCounter);
    this.annotationStats.progressCounter = this.modelProgressCounter;
    this.scanInfoElem = $('<div></div>');
    counterBox.append(this.scanInfoElem);
  }
};

/**
 * Register event handlers for mouse and keyboard interaction
 * @protected
 */
SegmentAnnotator.prototype.registerCustomEventListeners = function () {
  BasePartAnnotator.prototype.registerCustomEventListeners.call(this);
  var scope = this;
  this.renderer.domElement.addEventListener('mousedown', function (event) {
    // Turn off auto rotate
    scope.cameraControls.setAutoRotate(false);
  });
  this.renderer.domElement.addEventListener('dblclick', function (event) {
    scope.handleLookAt(event);
  });

  if (this.video && this.useVideoControls) {
    this.__videoControls = new VideoTrajControls({ video: this.video, cameraControls: this.cameraControls });
    this.__videoControls.show(true);
  }
};

/**
 * Creates annotations for all annotated parts in the model
 *  (NOTE: the function should be renamed to something better)
 * @protected
 * @returns array of annotated segment groups
 */
SegmentAnnotator.prototype.annotate = function (debug) {
  this.clearDebug();
  this.annotations = [];
  var modelId = this.modelId;
  if (!modelId) {
    console.log('ERROR: model id is undefined or null');
    return;
  }

  var modelWorldInverse = new THREE.Matrix4();
  var modelObject3D = this.modelInstance.getObject3D('Model');
  modelObject3D.updateMatrixWorld();
  modelWorldInverse.getInverse(modelObject3D.matrixWorld);
  var validLabelInfos = this.labeler.getValidLabels();
  if (validLabelInfos) {
    var tmpPoint = new THREE.Vector3();
    for (var i = 0; i < validLabelInfos.length; i++) {
      var labelInfo = validLabelInfos[i];
      if (labelInfo.fixed) continue;  // Skip the fixed set (pre-annotated by someone else)

      // TODO: keep partId from original annotation (if appropriate)
      var partId = this.annotations.length + 1;  // Make sure our part ids are one based
      var objectId = (this.objectId != undefined)? this.objectId : partId; // Use prespecified objectId if given (otherwise, use partId)
      if (labelInfo.segIndices && labelInfo.segIndices.length > 0) {
        var obbWorld = this.labeler.segments.fitOBB('Raw', labelInfo.segIndices);
        var obb = obbWorld.clone();
        obb.applyMatrix(modelWorldInverse);
        if (debug) {
          this.__addOBB(obb, labelInfo.colorMat, modelObject3D.matrixWorld);
        }
        var initialPoint;
        if (labelInfo.initialPoint) {
          tmpPoint.fromArray(labelInfo.initialPoint);
          tmpPoint.applyMatrix4(modelWorldInverse);
          initialPoint = tmpPoint.toArray();
        }
        this.annotations.push({
          modelId: modelId,
          partId: partId,
          objectId: objectId,
          label: labelInfo.label,
          labelType: this.labelType,
          obb: obb.toJSON(),
          dominantNormal: obb.dominantNormal().toArray(),
          initialPoint: initialPoint,
          segments: labelInfo.segIndices
        });
      }
    }
  }//if labelInfos
  this.annotationStats.compute(this.labeler.segments);
  if (debug) {
    console.log('All annotations: ');
    console.log(this.annotations);
    console.log(this.getAnnotationStats());
  }
};

SegmentAnnotator.prototype.getAnnotationStats = function (statsType) {
  if (this.annotationStats) {
    if (statsType === 'delta') {
      return this.annotationStats.getDelta('initial');
    } else if (statsType) {
      return this.annotationStats.get(statsType);
    } else {
      if (this.taskMode === 'new') {
        return this.annotationStats.get();
      } else {
        var delta = this.annotationStats.getDelta('initial');
        var total = this.annotationStats.get();
        var initial = this.annotationStats.get('initial');
        return { initial: initial, delta: delta, total: total };
      }
    }
  }
};

SegmentAnnotator.prototype.getChanged = function() {
  console.log('computing changed');
  if (this.undoStack && this.initialState) {
    var current = this.undoStack.last();
    var alignment = this.labeler.compare(this.initialState.data.annotations, current.data.annotations);
    var changed = alignment.alignment.filter(function(x) { return x[2] !== 0 || x[3] !== 0; });
    console.log('Changed', changed, alignment, this.initialState, current);
  }
};

SegmentAnnotator.prototype.clearAnnotations = function (opts) {
  BasePartAnnotator.prototype.clearAnnotations.call(this, opts);
  this.clearDebug();
  this.annotations = {};
  this.annotationStats.clear();
  this.annotationStats.compute(this.labeler.segments);
};

SegmentAnnotator.prototype.debugAnnotations = function () {
  this.clearDebug();
  this.annotate(true);
  this.getChanged();
};

SegmentAnnotator.prototype.__hasAnnotations = function (annotations) {
  return annotations && annotations.length > 0;
};

SegmentAnnotator.prototype.onModelLoad = function (modelInstance) {
  ModelPartViewer.prototype.onModelLoad.call(this, modelInstance);
  if (this.__videoControls) {
    this.__videoControls.attach(modelInstance);
  }
  if (this.scanInfoElem) {
    var roomType = modelInstance.model.info.roomType;
    this.scanInfoElem.text(roomType? 'Room type: ' + roomType : '');
  }
//  this.clearAnnotations({clearLabels: true});
  this.clearAnnotations(this.defaultClearAnnotationOptions);
  UIUtil.showAlert(null, this.messages['initialAlert'],
    'alert-warning', 15000);
};

// Series of checks before submission is allowed

SegmentAnnotator.prototype.checkAndSubmit = function() {
  // Check annotation quality and submit annotations
  var scope = this;
  scope.checkAnnotationPercentage(function() {
      scope.checkAnnotationQuality(function() {
        scope.showSubmitCheckDialog(function() {
          scope.showSurvey(function(form) {
            scope.form = form;
            //console.log('form', form);
            scope.submitAnnotations();
          });
        });
      });
    }
  );
};

SegmentAnnotator.prototype.checkAnnotationPercentage = function (next) {
  var stats = this.getAnnotationStats('current');
  var percStr = stats.percentComplete.toFixed(2);
  if (stats.percentComplete < this.__hardMinimumAnnotationPercent) {
    bootbox.alert('You have only annotated ' + percStr + '% of the scene.  Please annotate at least ' + this.__hardMinimumAnnotationPercent + '%.');
  } else if (stats.percentComplete < this.__softMinimumAnnotationPercent) {
    var minPercStr = this.__softMinimumAnnotationPercent + '%';
    var largest = this.__showLargestUnlabeledSegment();
    if (!largest || largest.vertIndices.length < 50 || largest.shownTimes > 1) {  // let pass if only small left, or asked twice for same
      bootbox.confirm('You have annotated ' + percStr + '%.  The recommended minimum is ' + minPercStr + '. Are you sure you want to continue to the next scene?',
        function (result) { if (result) { next(); } }
      );
    } else {  // else, ask for next largest seg to be annotated
      bootbox.alert('You have annotated ' + percStr + '%.  The recommended minimum is ' + minPercStr + '. Please annotate the region in the red box.');
    }
  } else {
    var largest = this.messages['labelLargest']? this.__showLargestUnlabeledSegment() : null;
    if (largest) {
      bootbox.confirm(this.messages['labelLargest'],
        function (result) {
          if (result) {
            next();
          }
        }
      );
    } else {
      next();
    }
  }
};

SegmentAnnotator.prototype.checkAnnotationQuality = function (next) {
  var validLabelInfos = this.labeler.getValidLabels();
  if (!validLabelInfos || validLabelInfos.length < this.__annotationChecks.hardMinimumLabelCount) {
    bootbox.alert('Your annotations are not correct.  Please double check your work.');
    return;
  }
  var requiredLabels = this.__annotationChecks.requiredLabels;
  var hasRequiredLabels = false;
  if (requiredLabels) {
    for (var i = 0; i < validLabelInfos.length; i++) {
      var labelInfo = validLabelInfos[i];
      if (requiredLabels && requiredLabels.indexOf(labelInfo.label) >= 0) {
        hasRequiredLabels = true;
      }
      //if (labelInfo.fixed) continue;  // Skip the fixed set (pre-annotated by someone else)
    }
  }
  if (requiredLabels && !hasRequiredLabels) {
    bootbox.confirm('Your annotations do not seem right. Are you sure you want to submit it? It may be rejected.',
      function (result) { if (result) { next(); } }
    );
  } else {
    next();
  }
};

SegmentAnnotator.prototype.showSubmitCheckDialog = function (next) {
  this.annotate(true);  // show bounding boxes
  this.cameraControls.setAutoRotate(true);
  bootbox.confirm(this.messages['checkOkFinal'],
    function (result) {
      this.cameraControls.setAutoRotate(false);
      this.clearDebug();
      if (result) {
        next();
      }
    }.bind(this)
  );
};

SegmentAnnotator.prototype.showSurvey = function(next) {
  if (this.survey) {
    this.survey.showQuestions(function(surveyResults) {
      next(surveyResults);
    });
  } else {
    next();
  }
};

SegmentAnnotator.prototype.loadLatestAnnotation = function (modelId) {
  var scope = this;
  this.__retrieveAnnotations({
    modelId: modelId,
    taskMode: 'fixup',
    '$clean': this.__useCleanAnnotations,
    '$limitOnAnnotations': true,
    '$limit': 1
  }, function(err, anns) {
    if (anns) {
      scope.__bestFixupAnnotation = anns;
    }
  });
};

SegmentAnnotator.prototype.loadRawAnnotations = function (modelId, annId) {
  var scope = this;
  this.__retrieveAnnotations({
    modelId: modelId,
    annId: annId,
    '$clean': this.__useCleanAnnotations
  }, function(err, anns) {
    if (anns) {
      scope.__rawAnnotations = anns;
    }
  });
};

SegmentAnnotator.prototype.__labelFromExisting = function(opts) {
  var anns = null;
  this.metadata = this.metadata || {};
  this.metadata['startFrom'] = this.startFrom;
  var hasFixupAnnotations = this.__bestFixupAnnotation && this.__bestFixupAnnotation.length > 0;
  if (this.startFrom === 'latest' && hasFixupAnnotations) {
    anns = this.__bestFixupAnnotation;
    console.log('Using fixup annotations from ' + anns[0].workerId + ', created at ' + anns[0].created_at);
  } else if (this.startFrom === 'latest' || this.startFrom === 'aggr') {
    // TODO: track aggregation version (annId)
    this.metadata['startAnnotations'] = 'aggr';
    console.log('Using aggregated annotations');
  } else if (this.__rawAnnotations) {
    console.log('Using raw annotations ' + (this.__useCleanAnnotations ? 'cleaned' : ''));
    anns = this.__rawAnnotations;
  }
  if (anns) {
    opts.segmentGroups = _.map(anns, function(ann) {
      var segGroup = _.omit(ann, 'segments');
      _.assign(segGroup, ann.segments);
      // convert indices that are mistakenly encoded as strings
      var segs = segGroup.segments;
      for (var j = 0; j < segs.length; j++) {
        var v = segs[j];
        if (typeof v === 'string') {
          segs[j] = parseInt(v);
        }
      }
      return segGroup;
    });
    var annIds = _.uniq(_.map(anns, function(ann) { return ann.annId; }));
    annIds.sort();
    this.metadata['startAnnotations'] = annIds.join(',');
  }
  this.__trackUndo(false);
  this.labeler.labelFromExisting(this.labelsPanel, opts);
  this.__trackUndo(true);
};

SegmentAnnotator.prototype.__annotatorReady = function() {
  if (this.__view) {
    // some view parameters, let's use those
    // view model (assume view target point and radius given)
    var targetBBox = new BBox();
    // Assume coordinate frame is target object coordinate frame
    var matrixWorld = this.modelInstance.getObject3D('Model').matrixWorld;
    var targetPoint = Object3DUtil.toVector3(this.__view.targetPoint);
    var r = this.__view.radius || 1.0;
    targetPoint = targetPoint.clone().applyMatrix4(matrixWorld);
    r = r * matrixWorld.getMaxScaleOnAxis();
    targetBBox.fromCenterRadius(targetPoint.x, targetPoint.y, targetPoint.z, r, r, r);
    var cameraParams = _.defaults( { targetBBox: targetBBox }, this.defaultCameraSettings );
    this.resetCamera(cameraParams);
    this.cameraControls.saveCameraState(true);
    if (this.__view.grayColor) {
      Object3DUtil.grayOutVertices(this.modelInstance.object3D, targetPoint, r, this.__view.grayColor);
    }
  }

  if (this.taskMode === 'fixup') {
    // Transfer labels from existing annotation
    this.__labelFromExisting({ fixed: false, addLabels: true }); // allow change/delete of labels
    this.setTransparency(true);
    this.annotationStats.save('initial');
    this.annotationStats.update();
  } else if (this.taskMode === 'coverage') {
    this.__labelFromExisting({ fixed: true, addLabels: false, color: '#bfa772' }); // don't allow change/delete of labels
    this.setTransparency(true);
    this.annotationStats.save('initial');
    this.annotationStats.update();
  }

  // Set hard and soft minimum annotation thresholds based on total vertices
  var annotationTiers = this.__annotationChecks.annotationTiers;
  this.__hardMinimumAnnotationPercent = null;
  this.__softMinimumAnnotationPercent = null;
  if (annotationTiers) {
    for (var i = 0; i < annotationTiers.length; i++) {
      var tier = annotationTiers[i];
      var numVerts = this.annotationStats.get().totalVertices;
      // Treat maxVerts as infinity if not defined, JSON does not allow Infinity
      if (tier.maxVerts == null) { tier.maxVerts = Infinity; }
      if (numVerts >= tier.minVerts && numVerts <= tier.maxVerts) {
        this.__hardMinimumAnnotationPercent = tier.minPerc;
        this.__softMinimumAnnotationPercent = tier.maxPerc;
      }
    }
  }

  this.form = null;
  this.timings.mark('annotatorReady');
  this.painter.enabled = true;
  this.cameraControls.timedAutoRotate(10000, 10.0, function () {});
  if (this.undoStack) {
    this.initialState = this.undoStack.pushCurrentState(Constants.CMDTYPE.INIT);
  }
};

SegmentAnnotator.prototype.__showLargestUnlabeledSegment = function() {
  if (!this.__largestColorMat) {
    this.__largestColorMat = Object3DUtil.getSimpleFalseColorMaterial(0, '#ff0000');
  }
  this.largestUnlabeledShown = this.largestUnlabeledShown || {};
  this.clearDebug();
  var largest = this.labeler.getLargestUnlabeled();
  if (largest) {
    this.__addOBB(largest.obb, this.__largestColorMat);
    this.largestUnlabeledShown[largest.segId] = this.largestUnlabeledShown[largest.segId] || 0;
    this.largestUnlabeledShown[largest.segId]++;
    largest.shownTimes = this.largestUnlabeledShown[largest.segId];
  }
  this.largestUnlabeledSeg = largest;
  return largest;
};

SegmentAnnotator.prototype.onWindowResize = function (options) {
  ModelPartViewer.prototype.onWindowResize.call(this, options);
  if (this.offscreenPicker) {
    this.offscreenPicker.onResize(this.container);
  }
};

SegmentAnnotator.prototype.handleLookAt = function (event) {
  var intersected = this.getIntersected(event);
  if (intersected) {
    this.cameraControls.viewTarget({
      target: intersected.point,
      position: this.cameraControls.camera.position
    });
  }
};

SegmentAnnotator.prototype.showImages = function() {
  console.log('show images');
  this.processCameraPoses(function(err, poses) {
    if (err) {
      console.error('Error processing camera poses', err);
    } else {
      console.log('poses', poses);
    }
  });
};

SegmentAnnotator.prototype.processCameraPoses = function(callback) {
  if (this.cameraPoses) {
    callback(null, this.cameraPoses);
  } else if (this.modelInstance) {
    var posesFile = this.modelInstance.model.info.camera_poses;
    if (posesFile) {
      this.__loadCameraPoses(posesFile, callback);
    } else {
      callback('No camera poses file');
    }
  } else {
    callback('No model loaded');
  }
};

SegmentAnnotator.prototype.__loadCameraPoses = function(filename, callback) {
  var fileLoader = new FileLoader();
  fileLoader.loadErrorFirst(filename, 'utf-8', function(err, data) {
    if (err) {
      callback(err, null);
    } else {
      var lines = data.split('\n');
      var poses = {};
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (line) {
          var pieces = line.split(',');
          var id = pieces[0];
          var array = pieces[1].split(' ');
          var transform = new THREE.Matrix4();
          transform.set.apply(transform, array);
          poses[id] = transform;
        }
      }
      callback(null, poses);
    }
  });
};

module.exports = SegmentAnnotator;

/**
 * Set of checks to perform
 * @typedef SegmentAnnotator.AnnotationChecks
 * @type {object}
 * @property [annotationTiers] {Array.<{ minVerts: number, maxVerts: number, minPerc: number, maxPerc: number }>}
 *    Depending on the size of the mesh (between `minVerts` and `maxVerts`),
 *    what is the hard minimum (`minPerc`) and recommended minimum (`maxPerc`) that the user should annotate.
 * @property [hardMinimumLabelCount=1] {int} Number of labels the user must annotate
 * @property [requiredLabels] {string[]} Set of labels that the user must provide
 */
