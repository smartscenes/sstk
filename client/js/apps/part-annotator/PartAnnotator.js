'use strict';

var Constants = require('Constants');
var MeshAnnotationStats = require('part-annotator/MeshAnnotationStats');
var ModelPartViewer = require('part-annotator/ModelPartViewer');
var BasePartAnnotator = require('part-annotator/BasePartAnnotator')(ModelPartViewer);
var Object3DUtil = require('geo/Object3DUtil');
var _ = require('util/util');

/**
 * Annotation tool for labeling parts of meshes.  The output is a labeling on face-based segmentations.
 * @param params
 * @param [params.allowLevels=false] {boolean} Whether different resolution levels of painting are allowed.
 *   If so, can use pgup/pgdown and level slider control to adjust resolution level. Also url param.
 * @param [params.obbsVisible=false] {boolean} To show obbs of labeled segment groups or not. Toggle with 'b'.
 * @param [params.useSegments=false] {boolean} Whether custom segmentation should be used. Also url param.
 * @param [params.segmentType] {string} What segmentation to use (default='surfaces')
 * @param [params.allowEditLabels=false] {boolean} Whether label names can be changed and new labels added. Also url param.
 * @param [params.startFrom=latest] {string|integer} What annotation to start from (used if taskMode is `fixup` or `coverage`)
 *   Possible values are `latest` (fixup from latest fixup (if available), otherwise from aggregation),
 *   `aggr` (will use precomputed aggregated segmentation),
 *   or id (integer) specifying specific annotation from database.
 *   Also url param.
 * @param [params.breakItUp] {boolean} Whether to break up annotated parts
 * @constructor
 * @extends ModelPartViewer
 * @extends BasePartAnnotator
 * @example
 * var canvas = document.getElementById('canvas');
 * var partAnnotator = new PartAnnotator({
 *   container: canvas,
 *   levelSelector: {
 *      container: '#levelSelector',
 *      slider: '#levelSlider'
 *    },
 *   allowLevels: true,
 *   onCloseUrl: "#{nextUrl}"
 * });
 * partAnnotator.start();
 */
function PartAnnotator(params) {
  params = params || {};
  var scope = this;
  var uihookups = [];
  this.annPartIdField = 'partId';
  uihookups.push(
    {
      name: 'debug',
      click: this.debugAnnotations.bind(this),
      shortcut: 'ctrl-shift-d'
    }
  );
  uihookups.push(
    {
      name: 'obb',
      click: function () {
        this.obbsVisible = !this.obbsVisible;
        if (this.obbsVisible) {
          this.showPartOBBs(this.labelsPanel.getAllSelected());
        } else {
          this.clearDebug();
        }
      }.bind(this),
      shortcut: 'b'
    }
  );
  uihookups.push(
    {
      name: 'breakItUp',
      element: '#breakBtn',
      click: this.breakItUp.bind(this),
      shortcut: 'shift-b'
    }
  );
  // Do we allow annotation at different levels:
  if (params.allowLevels) {
    uihookups.push({
      name: 'nextLevel',
      click: function () {
        this.labeler.nextLevel(+1);
      }.bind(this),
      shortcut: 'pgup'
    });
    uihookups.push({
      name: 'prevLevel',
      click: function () {
        this.labeler.nextLevel(-1);
      }.bind(this),
      shortcut: 'pgdown'
    });
  }
  this.urlParams = _.getUrlParams();
  var selectedUrlParams = _.pick(this.urlParams, ['useSegments', 'segmentType']);
  var allowEditLabels = !!(params.allowEditLabels || this.urlParams['allowEditLabels']);
  if (allowEditLabels) {
    uihookups.push({
      name: 'copyLabel',
      click: function () { this.labelsPanel.copySelected(); }.bind(this),
      shortcut: 'ctrl-c'
    });
  }
  var defaults = {
    appId: 'PartAnnotator.v3-20220901',
    submitAnnotationsUrl: Constants.submitPartAnnotationsURL,
    retrieveAnnotationsUrl: Constants.retrievePartAnnotationsURL,
    useClippingPlanes: true,
    addGround: true,
    itemIdField: 'modelId',
    expandObbAmount: 0.01*Constants.metersToVirtualUnit,
    breakItUp: {
      usePhysics: false,
      durationMillis: 1000
    },
    undo: {
      enabled: true
    },
    instructions: {
      html:
      'Step 1: Select a name on the right<br>' +
      'Step 2: Color in parts of the object using the mouse<br>' +
      'Step 3: Press BreakItUp! button (or Shift+B key) to remove colored parts and get to more parts!<br>' +
      '<b>Controls</b><br>' +
      'Left click = Paint object<br>' +
      'Left click and drag = paint continuously<br>' +
      'SHIFT + left click on painted object = Unpaint object<br><br>' +
      'CTRL(CMD) + left click on painted object = Select paint from object<br><br>' +
      'Right click and drag or arrow keys = Orbit/rotate camera<br>' +
      'SHIFT + right click and drag = Pan view<br>' +
      'Mouse wheel = Zoom view<br>' +
      'CTRL-SHIFT-R = Reset camera<br>' +
      'B = toggle boxes around painted objects<br>' +
      'C = toggle colors and enable/disable annotation<br>' +
      'Number keys = Keyboard shortcut for part name<br>' +
      'CTRL(CMD)-Z/Y = Undo/Redo<br>' +
      'CTRL(CMD)-C = Copy selected label<br>' +
        ((this.debug)? 'CTRL-S = Save annotation to file<br>' : '') +
        ((this.debug)? 'CTRL-L = Load annotation from file<br>' : '')
    },
    labelsPanel: {
      allowNewLabels: true,
      allowEditLabels: allowEditLabels,
      allowDelete: allowEditLabels,
      allowMultiSelect: true,
      //noTransparency: false,
      // see http://swisnl.github.io/jQuery-contextMenu/demo/input.html
      contextMenu: {
        items: {
          merge: {
            name: 'Merge',
            callback: function () {
              scope.mergeSelected();
            },
            accesskey: 'M'
          },
          labelOBB: {
            name: 'Label box',
            callback: function () {
              scope.fillSelected(true);
            },
            accesskey: 'E'
          },
          unlabelOBB: {
            name: 'Unlabel box',
            callback: function () {
              scope.fillSelected(false);
            }
          },
          //groupParts: {
          //  name: 'Group parts',
          //  callback: function () {
          //    scope.addGroup();
          //  },
          //  accesskey: 'G'
          //},
          // decompose: {
          //   name: 'Decompose selected part',
          //   callback: function () {
          //     scope.decompose();
          //   },
          //   accesskey:'"D'
          // },
          // markRelation: {
          //   name: 'Add relation',
          //   callback: function () {
          //     scope.addRelation();
          //   },
          //   accesskey: 'R'
          // },
          renameLabel: {
            name: 'Rename',
            callback: function () {
              scope.renameLabels();
            },
            accesskey: 'N'
          },
          lookAt: {
            name: 'LookAt',
            callback: function () {
              scope.lookAtSelected();
            },
            accesskey: 'L'
          },
          freeze: {
            name: 'Freeze',
            callback: function() {
              scope.freezeSelected(true);
            },
            accesskey: 'F'
          },
          unfreeze: {
            name: 'Unfreeze',
            callback: function() {
              scope.freezeSelected(false);
            }
          },
          showItem: {
            name: 'Show selected',
            callback: function () {
              // Handle show item for multiple selected
              scope.showSelected();
            },
            accesskey: 'S'
          },
          hideItem: {
            name: 'Hide selected',
            callback: function () {
              // Handle show item for multiple selected
              scope.hideSelected();
            },
            accesskey: 'H'
          },
          showItemOnly: {
            name: 'Show selected only',
            callback: function () {
              // Handle show item for multiple selected
              scope.showSelectedOnly();
            }
          },
          showUnknown: {
            name: 'Show unknown',
            callback: function () {
              scope.showUnknown();
            },
            accesskey: 'U'
          },
          showAll: {
            name: 'Show all',
            callback: function () {
              scope.showAll();
            },
            accesskey: 'A'
          },
          selectAll: {
            name: 'Select all',
            callback: function () {
              scope.selectAll();
            },
            accesskey: 'L'
          },
          // Test functions for generating missing geometry
          generate: {
           name: 'Generate',
           callback: function() {
             scope.generateMissingGeometryForSelected();
           }
          },
        }
      }
    },
    obbsVisible: false,
    segmentType: 'surfaces',
    uihookups: _.keyBy(uihookups, 'name')
  };
  params = _.defaultsDeep(Object.create(null), selectedUrlParams, params, defaults);
  this.breakItUpSettings = params.breakItUp;
  this.startFrom = Constants.getGlobalOrDefault('startFrom',
    this.urlParams['startFrom'] || params.startFrom);

  this.allowLevels = params.allowLevels;
  this.useSegments = params.useSegments;
  this.segmentType = params.segmentType;
  this.segmentOptions = null;
  if (this.segmentType === 'connectivity') {
    this.segmentOptions = {
      method: 'connectivity',
      similarity: -1,
      includeFaceIndices: true,
      condenseFaceIndices: false
    };
  }
  BasePartAnnotator.call(this, params);

  // Map of labelId to { label: label, meshIds: [list of ids], data: {} }
  this.annotations = {};

  // List of parts that have already been removed from the model
  this.removedParts = [];

  this.Subscribe('modelLoadStart', this, function(modelInfo) {
    scope.__rawAnnotations = null;
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

PartAnnotator.prototype = Object.create(BasePartAnnotator.prototype);
PartAnnotator.prototype.constructor = PartAnnotator;

/**
 * Returns state to be saved and restored for undo.
 * @param options
 * @returns {{annotations: Array, stats: *}}
 */
PartAnnotator.prototype.getState = function(options) {
  options = options || {};
  var labelInfos = this.labelsPanel? this.labelsPanel.getOrderedLabels() : [];
  var rawAnnotations = this.labeler.getAnnotations({
    getMeshFn: function(mesh) { return mesh.userData.meshIndex; }
  });
  var annotations = _.map(labelInfos, function(labelInfo) {
    var info = _.pick(labelInfo, ['color', 'id', 'index', 'label', 'name', 'fixed', 'frozen', 'obb', 'data', /*'segIndices', */'initialPoint']);
    if (labelInfo.element && labelInfo.element.hasClass('active')) {
      info.active = true;
    }
    info.color = '#' + info.color.getHexString();
    info.obb = info.obb? info.obb.toJSON() : undefined;
    info.meshIds = rawAnnotations[info.id];
    //info.segIndices = _.clone(info.segIndices);
    return info;
  });
  var removedPartIds = _.map(this.removedParts, function(x) { return x.id; });
  var stats = _.clone(this.annotationStats.get());
  var selectedIndex = this.labeler.currentLabelInfo? this.labeler.currentLabelInfo.index : -1;
  //console.log('selectedIndex', selectedIndex);
  var state = { annotations: annotations, stats: stats,  selectedIndex: selectedIndex, removedPartIds: removedPartIds };
  return state;
};

/**
 * Restores state (for undo)
 * @param saveState {Object} current save state
 * @param deltaState {string} Either "before" or "after" (restore to prevState for before, and saveState for after)
 * @param prevState {Object} last save state
 */
PartAnnotator.prototype.restoreState = function(saveState, deltaState, prevState) {
  this.__trackUndo(false);
  var state = (deltaState === 'before')? prevState : saveState;
  var annotations = state.data.annotations;
  this.clearAnnotations({clearLabels: true});
  // Restore parts
  // for (var i = 0; i < nodes.length; i++) {
  //   var node = nodes[i];
  //   // Make sure node is added back
  //   this.restorePart(node);
  // }
  var meshes = this.__meshes;
  this.labeler.restore(this.labelsPanel, annotations, {
    getMeshFn: function(id) { return meshes[id]; }
  });
  // Restore set of removed parts
  var removedPartIds = new Set(state.data.removedPartIds);
  var removedParts = [];
  var nodes = this.labeler.getMeshes();
  //console.log('got removedPartIds', state, removedPartIds)
  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    var isRemoved = removedPartIds.has(node.id);
    if (isRemoved) {
      // Make sure node is removed
      this.removePart(node);
    } else {
      // Make sure node is added back
      this.restorePart(node);
    }
    node.userData.removed = isRemoved;
    if (isRemoved) {
      this.removedParts.push(node);
    }
  }
  this.removedParts = removedParts;
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

PartAnnotator.prototype.createLabeler = function () {
  function isLabelable(part, labelInfo) {
    if (!part || part.userData.labelInfo && (part.userData.labelInfo.fixed || part.userData.labelInfo.frozen)) {
      // No part, or part is already labeled with fixed label
      return false;
    }
    return true;
  }
  var scope = this;
  var labeler;
  if (this.useSegments) {
    console.log('Use MeshSegmentHierarchyLabeler');
    var MeshSegmentHierarchyLabeler = require('part-annotator/MeshSegmentHierarchyLabeler');
    labeler = new MeshSegmentHierarchyLabeler({
      segmentType: scope.segmentType,
      segmentOptions: scope.segmentOptions,
      getMeshId: function(m) { return m.userData.id; },
      showNodeCallback: function (node) {
        scope.debugNode.add(node);
      },
      onSegmentsLoaded:   function (segments) {
        scope.waitAll(function() {
          scope.__annotatorReady();
        });
      },
      updateAnnotationStats: function (part, multiplier) {
        scope.annotationStats.update(part, multiplier);
      },
      getIntersected: scope.getIntersectedMesh.bind(scope),
      isLabelable: isLabelable
    });
    labeler.segments.Subscribe('loadSegments', this, function () {
      scope.addWaiting('loadSegments');
    });
    labeler.segments.Subscribe('loadSegmentsDone', this, function () {
      scope.removeWaiting('loadSegments');
    });
  } else {
    var MeshLabeler = require('part-annotator/MeshHierarchyLabeler');
    labeler = new MeshLabeler({
      showNodeCallback: function (node) {
        scope.debugNode.add(node);
      },
      getIntersected: scope.getIntersectedMesh.bind(scope),
      updateAnnotationStats: function (part, multiplier) {
        scope.annotationStats.update(part, multiplier);
      },
      isLabelable: isLabelable
    });
  }
  labeler.Subscribe('levelUpdated', this, function(v) {
    if (scope.levelSlider) {
      scope.levelSlider.slider('option', 'max', scope.labeler.maxHierarchyLevel);
      scope.levelSlider.slider('option', 'value', scope.labeler.hierarchyLevel);
    }
  });
  this.metadata = this.metadata || {};
  this.metadata['useSegments'] = true;
  this.metadata['segmentType'] = labeler.segmentType;
  return labeler;
};

/**
 * Create panel of labels for use during annotation
 * @protected
 */
PartAnnotator.prototype.createPanel = function () {
  BasePartAnnotator.prototype.createPanel.call(this);

  var counterBox = $('#counterBox');
  if (counterBox && counterBox.length > 0) {
    var current = this.numItemsAnnotated + 1;
    var totalToAnnotate = this.numItemsTotal;
    this.overallProgressCounter = $('<div></div>').text('Objects: ' + current + '/' + totalToAnnotate);
    counterBox.append(this.overallProgressCounter);
    this.modelProgressCounter = $('<div></div>');
    counterBox.append(this.modelProgressCounter);
    if (this.annotationStats) {
      this.annotationStats.progressCounter = this.modelProgressCounter;
    }
    this.modelInfoElem = $('<div></div>');
    counterBox.append(this.modelInfoElem);
  }
};

PartAnnotator.prototype.__annotatorReady = function() {
  // Make sure meshes have a unique index
  this.__meshes = this.labeler.getMeshes().filter(function(m) {
    return !m.userData.level;
  });
  _.each(this.__meshes, function(m, i) {
    m.userData.meshIndex = i;
  });
  //console.log('meshes', this.__meshes);
  this.annotationStats = new MeshAnnotationStats({ meshes: this.__meshes, counter: this.modelProgressCounter });

  this.annotations = {};
  this.labeler.onReady(this.__options);
  this.initLevelSelector(this.__options['levelSelector']);

  if (this.taskMode === 'fixup') {
    // Transfer labels from existing annotation
    this.__labelFromExisting({ fixed: false, addLabels: true }); // allow change/delete of labels
    this.setTransparency(true);
  }

  this.timings.mark('annotatorReady');
  this.painter.enabled = true;
  if (this.undoStack) {
    this.initialState = this.undoStack.pushCurrentState(Constants.CMDTYPE.INIT);
  }

  if (this.allowCutting) {
    this.initMeshCutter();
  }
};

PartAnnotator.prototype.debugAnnotations = function () {
  this.annotate(true);
};

PartAnnotator.prototype.onModelLoad = function (modelInstance) {
  BasePartAnnotator.prototype.onModelLoad.call(this, modelInstance);
  if (!this.useSegments) {
    this.__annotatorReady();
  }
};

//Creates annotations for all annotated parts in the model
//Adds each part to the partsToBreakUp array
//{name -> [mesh ids], name2 -> [mesh ids], ...}
PartAnnotator.prototype.annotate = function (debug) {
  this.annotations = this.__computeAnnotations(debug);
  console.log('All annotations ', this.annotations);
};

PartAnnotator.prototype.__computeAnnotations = function (debug) {
  var meshes = this.labeler.getMeshes().filter(function(m) {
    return !m.userData.level;
  });
  var labeler = this.labeler;
  var annotations = {};
  meshes.forEach(function (mesh) {
    var data = mesh.userData;
    var meshId = labeler.getMeshId(mesh);
    if (data.labelInfo) { //Hasn't been removed yet, so annotate the mesh
      var id = data.labelInfo.id;
      if (!annotations[id]) {//First time seeing this label
        annotations[id] = {label: data.labelInfo.label, meshIds: [meshId], data: data.labelInfo.data};
      } else {
        annotations[id].meshIds.push(meshId);
      }
    }
  });
  var labelInfos = this.labeler.getValidLabels() || [];
  _.each(labelInfos, function(labelInfo, index) {
    var id = labelInfo.id;
    var annotation = annotations[id];
    if (annotation) {
      annotation.data = labelInfo.data;
    }
    if (labelInfo.obb) {
      annotations[id].obb = labelInfo.obb.toJSON();
    }
  });
  return annotations;
};

PartAnnotator.prototype.__getPartsToBreakUp = function() {
  var meshes = this.labeler.getMeshes().filter(function(m) {
    return !m.userData.level;
  });
  var partsToBreakUp = _.filter(meshes, function (mesh) {
    var data = mesh.userData;
    var frozen = data.labelInfo && (data.labelInfo.frozen);
    return (!data.removed && data.labelInfo && !frozen); //Hasn't been removed yet, and labeled
  });
  return partsToBreakUp;
};

// Annotates the model, then removes all annotated parts
PartAnnotator.prototype.breakItUp = function () {
  var partsToBreakUp = this.__getPartsToBreakUp();
  if (partsToBreakUp.length === 0) { return; }

  var scope = this;
  var breakUpIds = _.map(partsToBreakUp, function(x) { return scope.labeler.getMeshId(x); });
  this.onEditOpInit('breakItUp', { ids: breakUpIds });
  partsToBreakUp.forEach(function (mesh) {
    scope.removePart(mesh);
    scope.removedParts.push(mesh);
  });
  this.onEditOpDone('breakItUp', { ids: breakUpIds });
};

PartAnnotator.prototype.getAnnotationStats = function (statsType) {
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

PartAnnotator.prototype.saveAnnotations = function () {
  var annPartIdField = this.annPartIdField;
  if (this.useSegments /*&& this.labeler.segments.isCustomSegmentation*/) {
    this.annPartIdField = 'segments';
  }
  BasePartAnnotator.prototype.saveAnnotations.call(this);
  this.annPartIdField = annPartIdField;
};


/* Creates annotations and submits to backend */
PartAnnotator.prototype.__submitAnnotations = function (gotoNext) {
  this.annotate();
  var modelId = this.modelId;
  if (!modelId) {
    console.log('ERROR: model id is undefined or null');
    return;
  }

  // Check if there are annotations
  if (_.isEmpty(this.annotations)) {
    this.showAlert('Please annotate some parts before submitting!', 'alert-warning');
    return;
  }

  // NOTE: With the exception of this conversion of this.annotations to partAnnotations
  //  and the submission of a score (which is constant for now)
  //  and the missing annotation stats, this is pretty much identical to the base functions
  this.timings.mark('annotationSubmit');
  var params = this.getAnnotationsJson(this.annotations, true);
  this.__submitAnnotationData(params, modelId, gotoNext);
};

PartAnnotator.prototype.getAnnotationsJson = function(annotations, includeScreenshot) {
  var modelId = this.modelId;
  var partAnnotations = []; //All annotations to be submitted

  for (var id in annotations) {
    if (!annotations.hasOwnProperty(id)) {
      continue;
    }
    var rec = annotations[id];
    var ann = {
      modelId: modelId,
      partSetId: id,
      label: rec.label, //name of the part
      labelType: 'category',
      data: rec.data,
      obb: rec.obb
    };
    ann[this.annPartIdField] = rec.meshIds; //mesh ids
    partAnnotations.push(ann);
  }

  // Get part labels (in case user has added label)
  var partLabels = partAnnotations.map(ann => ann.label); 

  var screenshot = includeScreenshot?
    this.getImageData(this.screenshotMaxWidth, this.screenshotMaxHeight) : undefined;
  var params = {
    appId: this.appId,
    sessionId: Constants.getGlobalOrDefault('sessionId', 'local-session'),
    condition: Constants.getGlobalOrDefault('condition', 'test'),
    task: Constants.getGlobal('task'),
    taskMode: this.taskMode,
    userId: this.userId,  // This is set to workerId under mturk
  };
  params[this.itemIdField] = this.itemId;
  params = _.merge(params, {
    annotations: partAnnotations, //All parts
    screenshot: screenshot,
    parts: partLabels,
    score: 100 // Constant
  });

  var data = {};
  if (this.useSegments) {
    if (this.labeler.segments.isCustomSegmentation) {
      data.segmentation = this.labeler.segments.segmentationJson;
    }
  }

  var annStats = this.getAnnotationStats();
  if (annStats) {
    data['stats'] = annStats;
  }
  var totalStats = this.annotationStats.get();
  if (totalStats) {
    params['progress'] = totalStats.percentComplete;
  }
  var timings = this.timings.toJson();
  if (timings) {
    data['timings'] = timings;
  }
  if (this.metadata) {
    data['metadata'] = this.metadata;
  }
  if (this.form) {
    data['form'] = this.form;
  }
  params['data'] = data;
  return params;
};

PartAnnotator.prototype.__hasAnnotations = function (annotations) {
  return !_.isEmpty(annotations);
};

PartAnnotator.prototype.restorePart = function (mesh) {
  var index = mesh.parent.children.indexOf(mesh);
  if (index < 0) {
    mesh.parent.add(mesh);
    mesh.userData.removed = false;
  }
};

/* Removes the part from the model */
PartAnnotator.prototype.removePart = function (mesh) {
  // TODO: Removing mesh from parent will change the SGPath of the mesh
  // The SGPath of the mesh will need to be precomputed and stored
  var index = mesh.parent.children.indexOf(mesh);
  if (index >= 0) {
    //mesh.userData.parentId = mesh.parent.id;
    //mesh.userData.matrixWorld = mesh.matrixWorld.toArray();
    mesh.userData.removed = true;
    mesh.parent.children.splice(index, 1);
  }

  // if (mesh) {
  //   Object3DUtil.setVisible(mesh, false, true);
  //   mesh.userData.removed = true;
  // }
};

PartAnnotator.prototype.render = function () {
  if (!this.renderer || !this.scene) return;
  for (var i = 5; i < this.scene.children.length - 5; i++) {
    var obj = this.scene.children[i];

    if (obj.position.y <= -50) {
      this.scene.remove(obj);
    }
  }
  this.renderer.render(this.scene, this.camera);
};

PartAnnotator.prototype.animate = function () {
  requestAnimationFrame(this.animate.bind(this));
  this.render();
};

PartAnnotator.prototype.initLevelSelector = function (levelSelectorConfig) {
  if (this.allowLevels && this.labeler && levelSelectorConfig) {
    var scope = this;
    if (!this.levelSlider) {
      var levelSelector = $(levelSelectorConfig.container);
      levelSelector.show();
      var levelSlider = $(levelSelectorConfig.slider);
      this.levelSlider = levelSlider;
      levelSlider.slider({
        min: 0,
        max: scope.labeler.maxHierarchyLevel,
        value: scope.labeler.hierarchyLevel,
        step: 1,
        change: function (event, ui) {
          scope.labeler.hierarchyLevel = ui.value;
        }
      });
    } else {
      scope.levelSlider.slider('option', 'max', scope.labeler.maxHierarchyLevel);
      scope.levelSlider.slider('option', 'value', scope.labeler.hierarchyLevel);
    }
  }
};

PartAnnotator.prototype.loadRawAnnotations = function (modelId, annId) {
  var scope = this;
  this.__retrieveAnnotations({
    modelId: modelId,
    annId: annId
  }, function(err, anns) {
    if (anns) {
      scope.__rawAnnotations = anns;
    }
  });
};

PartAnnotator.prototype.loadLatestAnnotation = function (modelId) {
  var scope = this;
  //http://localhost:8010/annotations/latest?itemId=p5d.100
  this.__retrieveAnnotations({
    modelId: modelId,
//    taskMode: 'fixup',
    '$limitOnAnnotations': true,
    '$limit': 1
  }, function(err, anns) {
    if (anns) {
      scope.__bestFixupAnnotation = anns;
    }
  });
};

PartAnnotator.prototype.__labelFromExisting = function(opts) {
  var pastAnnotations = null;
  var partAnnotations = null;
  this.metadata = this.metadata || {};
  this.metadata['startFrom'] = this.startFrom;
  var hasFixupAnnotations = this.__bestFixupAnnotation && this.__bestFixupAnnotation.length > 0;
  if (this.startFrom === 'latest' && _.isPlainObject(this.__bestFixupAnnotation)) {
    pastAnnotations = [this.__bestFixupAnnotation];
    partAnnotations = this.__bestFixupAnnotation.parts;
    var ann = pastAnnotations[0];
    console.log('Using fixup annotations from ' + ann.workerId + ', created at ' + ann.created_at);
  } else if (this.startFrom === 'latest' && hasFixupAnnotations) {
    partAnnotations = this.__bestFixupAnnotation;
    var ann = partAnnotations[0];
    console.log('Using fixup annotations from ' + ann.workerId + ', created at ' + ann.created_at);
  } else if (this.startFrom === 'latest' || this.startFrom === 'aggr') {
    console.log('Using aggregated annotations');
  } else if (this.__rawAnnotations) {
    console.log('Using raw annotations ' + (this.__useCleanAnnotations ? 'cleaned' : ''));
    partAnnotations = this.__rawAnnotations;
  }
  var annIds;
  if (pastAnnotations && pastAnnotations.length) {
    annIds = _.uniq(_.map(pastAnnotations, function(ann) { return ann.id; }));
  } else if (partAnnotations && partAnnotations.length) {
    annIds = _.uniq(_.map(partAnnotations, function(ann) { return ann.annId; }));
  }
  if (annIds) {
    annIds.sort();
    this.metadata['startAnnotations'] = annIds.join(',');
  }
  if (partAnnotations) {
    opts.keepInstances = true;
    opts.annotations = partAnnotations;
    // convert from database
    if (this.useSegments) {
      for (let ann of partAnnotations) {
        ann.partId = ann.partId.map(x => (typeof x === 'string')? parseInt(x) : x);
      }
    }
    this.__applyAnnotations(pastAnnotations? pastAnnotations[0].data : null, opts);
  }
};

PartAnnotator.prototype.__applyAnnotations = function(data, opts) {
  // console.log('applyAnnotations', data, opts);
  var enforceChecks = !!data;
  data = data || {};
  var metadata = data.metadata || {};
  this.__trackUndo(false);
  if (data.segmentation) {
    this.labeler.applySegmentAnnotation(data, (err, res) => {
      this.waitAll(() => {
        this.labeler.labelFromExisting(this.labelsPanel, opts);
        this.__trackUndo(true);
      });
    });
  } else {
    // check the segmentType is the same
    if (!enforceChecks || metadata.segmentType === this.segmentType) {
      this.labeler.labelFromExisting(this.labelsPanel, opts);
    } else {
      this.showAlert('Incompatible segment type', 'alert-danger');
    }
    this.__trackUndo(true);
  }
};

PartAnnotator.prototype.generateMissingGeometry = function(labelInfo) {
  if (!this.__shapeGenerator) {
    var MissingGeometryGenerator = require('shape/MissingGeometryGenerator');
    this.__shapeGenerator = new MissingGeometryGenerator();
    this.__generatedByLabelId = this.__generatedByLabelId || {};
    this.__generatedGroup = this.__generatedGroup || new THREE.Group();
    this.scene.add(this.__generatedGroup);
  }
  console.log('generate', labelInfo);
  var scope = this;
  var geometryInfo = {
    label: labelInfo.label,
    obb: this.labeler.getLabelOBB(labelInfo),
    object3D: this.debugNode
  };
  this.__shapeGenerator.generateMissingGeometryForPart(geometryInfo, {},function(err, obj) {
    if (err) {
      console.error('Error generating shape', err);
    } else if (obj) {
      if (scope.__generatedByLabelId[labelInfo.id]) {
        scope.__generatedGroup.remove(scope.__generatedByLabelId[labelInfo.id]);
      }
      scope.__generatedByLabelId[labelInfo.id] = obj;
      scope.__generatedGroup.add(obj);
      console.log('generated', obj);
    } else {
      console.log('no missing geometry to generate')
    }
  });
};

PartAnnotator.prototype.generateMissingGeometryForSelected = function() {
  var selected = this.labelsPanel.getAllSelected();
  if (selected && selected.length) {
    //this.onEditOpInit('generate', { labelInfo: selected });
    //this.__trackUndo(false);
    for (var i = 0; i < selected.length; i++) {
      this.generateMissingGeometry(selected[i]);
    }
    //this.__trackUndo(true);
    //this.onEditOpDone('generate', { labelInfo: selected });
  }

};

PartAnnotator.prototype.showSelectedOnly = function () {
  var selected = this.labelsPanel.getAllSelected();
  if (selected && selected.length) {
    this.labeler.setPartsVisible(true, selected, true);
  }
};

PartAnnotator.prototype.showSelectedOnlyWithUnknown = function () {
  this.showUnknown();
  this.showSelected();
};

PartAnnotator.prototype.showSelected = function () {
  var selected = this.labelsPanel.getAllSelected();
  if (selected && selected.length) {
    this.labeler.setPartsVisible(true, selected);
  }
};

PartAnnotator.prototype.hideSelected = function () {
  var selected = this.labelsPanel.getAllSelected();
  if (selected && selected.length) {
    this.labeler.setPartsVisible(false, selected);
  }
};

PartAnnotator.prototype.showAll = function () {
  this.labeler.setPartsVisible(true);
};

PartAnnotator.prototype.showUnknown = function () {
  this.showAll();
  this.labeler.setPartsVisible(false, this.labelsPanel.labelInfos);
};

PartAnnotator.prototype.selectAll = function () {
  this.labelsPanel.selectAll();
};

PartAnnotator.prototype.initMeshCutter = function() {
  var MeshCutterControls = require('controls/MeshCutterControls');
  var meshCutterControls = new MeshCutterControls({
    container: this.container,
    picker: this.picker,
    camera: this.camera
    // tesselator
  });
  meshCutterControls.init();
  this.scene.add(meshCutterControls.stagingNode);
  //this.meshCutterControls = meshCutterControls;
  var scope = this;
  this.labelsPanel.Subscribe('labelSelected', this, function(selected) {
    if (meshCutterControls.enabled) {
      if (!Array.isArray(selected)) {
        selected = [selected];
      }
      scope.labeler.setPartsVisible(true, selected, true);
    }
  });
  this.__uis['cut'] = {
    controls: [meshCutterControls],
    panels: [this.labelsPanel],
    enter: function() {
      meshCutterControls.attach(scope.labeler.getMeshedObject3D());
      scope.setWireframeMode(true);
    },
    exit: function() {
      meshCutterControls.detach();
      scope.setWireframeMode(false);
    }
  };
};

PartAnnotator.prototype.__loadAnnotationsFromFile = function (json, options) {
  if (json.modelId !== this.modelId) {
    this.showAlert('Model id does not match!', 'alert-danger');
    return;
  }
  if (this.useSegments) {
    var anns = _.map(json.annotations, (ann) => {
      var res = _.clone(ann);
      if (res.segments) {
        res.partIds = res.segments;
        delete res.segments;
      }
      return res;
    });
    var data = json.data || {};
    this.__applyAnnotations(data, { keepInstance: true, annotations: anns, isGrouped: true });
  } else {
    this.showAlert('Does not support loading from file', 'alert-danger');
    console.log('Please implement support for loading annotations from file', json);
  }
};



// Exports
module.exports = PartAnnotator;