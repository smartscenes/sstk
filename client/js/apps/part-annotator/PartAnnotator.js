'use strict';

var Constants = require('Constants');
//var MeshAnnotationStats = require('./MeshAnnotationStats');
var ModelPartViewer = require('part-annotator/ModelPartViewer');
var BasePartAnnotator = require('part-annotator/BasePartAnnotator')(ModelPartViewer);
var Object3DUtil = require('geo/Object3DUtil');
var _ = require('util');

require('physijs');

/**
 * Annotation tool for labeling parts of meshes.  The output is a labeling on face-based segmentations.
 * Uses physijs to break apart parts that were already annotated (not working so well now).
 * @param params
 * @param [params.allowLevels=false] {boolean} Whether different resolution levels of painting are allowed.
 *   If so, can use pgup/pgdown and level slider control to adjust resolution level. Also url param.
 * @param [params.obbsVisible=false] {boolean} To show obbs of labeled segment groups or not. Toggle with 'b'.
 * @param [params.useSegments=false] {boolean} Whether custom segmentation should be used. Also url param.
 * @param [params.allowEditLabels=false] {boolean} Whether label names can be changed and new labels added. Also url param.
 * @param [params.startFrom=latest] {string|integer} What annotation to start from (used if taskMode is `fixup` or `coverage`)
 *   Possible values are `latest` (fixup from latest fixup (if available), otherwise from aggregation),
 *   `aggr` (will use precomputed aggregated segmentation),
 *   or id (integer) specifying specific annotation from database.
 *   Also url param.
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
  var uihookups = [];
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
  var useSegments = params.useSegments || this.urlParams['useSegments'];
  var allowEditLabels = !!(params.allowEditLabels || this.urlParams['allowEditLabels']);
  if (allowEditLabels) {
    uihookups.push({
      name: 'copyLabel',
      click: function () { this.labelsPanel.copySelected(); }.bind(this),
      shortcut: 'ctrl-c'
    });
  }
  var defaults = {
    appId: 'PartAnnotator.v3',
    submitAnnotationsUrl: Constants.submitPartAnnotationsURL,
    retrieveAnnotationsUrl: Constants.retrievePartAnnotationsURL,
    useClippingPlanes: true,
    addGround: true,
    itemIdField: 'modelId',
    expandObbAmount: 0.01*Constants.metersToVirtualUnit,
    breakItUp: {
      usePhysics: true,
      durationMillis: 1000
    },
    undo: {
      enabled: true
    },
    instructions: {
      html:
      'Step 1: Select a name on the right<br>' +
      'Step 2: Color in parts of the object using the mouse<br>' +
      'Step 3: Press BreakItUp! button (or Shift+B key) to remove colored parts and get to more parts!' +
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
      'CTRL(CMD)-C = Copy selected label<br>'
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
            accesskey: "M"
          },
          labelOBB: {
            name: 'Label box',
            callback: function () {
              scope.fillSelected(true);
            },
            accesskey: "E"
          },
          unlabelOBB: {
            name: 'Unlabel box',
            callback: function () {
              scope.fillSelected(false);
            }
          },
          // groupParts: {
          //   name: 'Group parts',
          //   callback: function () {
          //     scope.addGroup();
          //   },
          //   accesskey: "G"
          // },
          // markRelation: {
          //   name: 'Add relation',
          //   callback: function () {
          //     scope.addRelation();
          //   },
          //   accesskey: "R"
          // },
          renameLabel: {
            name: 'Rename',
            callback: function () {
              scope.renameLabels();
            },
            accesskey: "N"
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
    obbsVisible: false,
    useSegments: useSegments,
    uihookups: _.keyBy(uihookups, 'name')
  };
  params = _.defaultsDeep(Object.create(null), params, defaults);
  this.breakItUpSettings = params.breakItUp;
  this.startFrom = Constants.getGlobalOrDefault('startFrom',
    this.urlParams['startFrom'] || params.startFrom);

  this.allowLevels = params.allowLevels;
  this.useSegments = params.useSegments;
  BasePartAnnotator.call(this, params);

  // Map of labelId to { label: label, meshIds: [list of ids], data: {} }
  this.annotations = {};

  // List of parts that have already been removed from the model
  this.removedParts = [];

  var scope = this;
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
  //var stats = _.clone(this.annotationStats.get());
  var selectedIndex = this.labeler.currentLabelInfo? this.labeler.currentLabelInfo.index : -1;
  //console.log('selectedIndex', selectedIndex);
  var state = { annotations: annotations, /*stats: stats, */ selectedIndex: selectedIndex, removedPartIds: removedPartIds };
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
  //this.annotationStats.set(state.data.stats);
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
    console.log('Use SegmentHierarchyLabeler');
    var SegmentHierarchyLabeler = require('part-annotator/SegmentHierarchyLabeler');
    labeler = new SegmentHierarchyLabeler({
      segmentType: 'surfaces',
      getMeshId: function(m) { return m.userData.id; },
      showNodeCallback: function (node) {
        scope.debugNode.add(node);
      },
      onSegmentsLoaded:   function (segments) {
        scope.__annotatorReady();
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
      isLabelable: isLabelable
    });
  }
  labeler.Subscribe('levelUpdated', this, function(v) {
    if (scope.levelSlider) {
      scope.levelSlider.slider('option', 'max', scope.labeler.maxHierarchyLevel);
      scope.levelSlider.slider('option', 'value', scope.labeler.hierarchyLevel);
    }
  });
  return labeler;
};

/**
 * Create panel of labels for use during annotation
 * @protected
 */
PartAnnotator.prototype.createPanel = function () {
  BasePartAnnotator.prototype.createPanel.call(this);

  // var counterBox = $('#counterBox');
  // if (counterBox && counterBox.length > 0) {
  //   var current = this.numItemsAnnotated + 1;
  //   var totalToAnnotate = this.numItemsTotal;
  //   this.overallProgressCounter = $('<div></div>').text('Objects: ' + current + '/' + totalToAnnotate);
  //   counterBox.append(this.overallProgressCounter);
  //   this.modelProgressCounter = $('<div></div>');
  //   counterBox.append(this.modelProgressCounter);
  //   this.annotationStats.progressCounter = this.modelProgressCounter;
  //   this.modelInfoElem = $('<div></div>');
  //   counterBox.append(this.modelInfoElem);
  // }
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
  //this.annotationStats = new MeshAnnotationStats({ meshes: this.__meshes });

  this.annotations = {};
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

  if (scope.breakItUpSettings.usePhysics) {
    partsToBreakUp.forEach(function (mesh) {
      var physmesh = new Physijs.BoxMesh(// Physijs mesh
        mesh.geometry,
        Physijs.createMaterial(// Physijs material
          mesh.material,
          0.4, // friction
          0.8 // restitution
        ),
        10 // weight, 0 is for zero gravity
      );

      //Break up parts
      Object3DUtil.setMatrix(physmesh, mesh.matrixWorld);
      Object3DUtil.attachToParent(physmesh, scope.scene, scope.scene);
      scope.removePart(mesh);
      scope.removedParts.push(mesh);

      setTimeout(function () {
        scope.scene.remove(physmesh);
      }, scope.breakItUpSettings.durationMillis);
    });
  } else {
    partsToBreakUp.forEach(function (mesh) {
      scope.removePart(mesh);
      scope.removedParts.push(mesh);
    });
  }
  this.onEditOpDone('breakItUp', { ids: breakUpIds });
};

/* Creates annotations and submits to backend */
PartAnnotator.prototype.__submitAnnotations = function () {
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
  var partAnnotations = []; //All annotations to be submitted

  for (var id in this.annotations) {
    if (!this.annotations.hasOwnProperty(id)) {
      continue;
    }
    var rec = this.annotations[id];
    var ann = {
      modelId: modelId,
      partSetId: id,
      partId: rec.meshIds,  //mesh ids
      label: rec.label, //name of the part
      labelType: 'category',
      data: rec.data
    };
    partAnnotations.push(ann);
  }

  // Get part labels (in case user has added label)
  var partLabels = this.labeler.getLabels();

  var screenshot = this.getImageData(this.screenshotMaxWidth, this.screenshotMaxHeight);
  var params = {
    appId: this.appId,
    sessionId: Constants.getGlobalOrDefault('sessionId', 'local-session'),
    condition: Constants.getGlobalOrDefault('condition', 'test'),
    task: Constants.getGlobal('task'),
    taskMode: this.taskMode,
    userId: this.userId,  // This is set to workerId under mturk
    annotations: partAnnotations, //All parts
    screenshot: screenshot,
    parts: partLabels,
    score: 100 // Constant
  };
  params[this.itemIdField] = this.itemId;
  var data = {};
  // var annStats = this.getAnnotationStats();
  // if (annStats) {
  //   stats['stats'] = annStats;
  // }
  this.timings.mark('annotationSubmit');
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

  this.__submitAnnotationData(params, modelId);
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

PartAnnotator.prototype.makeGround = function(dims) {
  return new Physijs.BoxMesh(
    new THREE.BoxGeometry(dims.x, dims.y, dims.z, 10, 10), // Three.js geometry
    Physijs.createMaterial(Object3DUtil.ClearMat, 0.4, 0.8),
    0 // weight, 0 is for zero gravity
  );
};

PartAnnotator.prototype.createScene = function() {
  Physijs.scripts.worker = Constants.baseUrl + '/client/js/vendor/physijs/physijs_worker.js';
  Physijs.scripts.ammo = 'ammo.js';
  this.scene = new Physijs.Scene();
  this.scene.setGravity(new THREE.Vector3(0, -100, 0));
  this.scene.name = 'scene';
  this.scene.add(this.camera);
  this.scene.add(this.debugNode);
  this.scene.addEventListener('update', function () {
    this.scene.simulate(undefined, 2);
  }.bind(this));
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
  if (this.scene) {
    this.scene.simulate();
  }
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
  var anns = null;
  this.metadata = {'startFrom': this.startFrom};
  var hasFixupAnnotations = this.__bestFixupAnnotation && this.__bestFixupAnnotation.length > 0;
  if (this.startFrom === 'latest' && hasFixupAnnotations) {
    anns = this.__bestFixupAnnotation;
    console.log('Using fixup annotations from ' + anns[0].workerId + ', created at ' + anns[0].created_at);
  } else if (this.startFrom === 'latest' || this.startFrom === 'aggr') {
    console.log('Using aggregated annotations');
  } else if (this.__rawAnnotations) {
    console.log('Using raw annotations ' + (this.__useCleanAnnotations ? 'cleaned' : ''));
    anns = this.__rawAnnotations;
  }
  if (anns) {
    var annIds = _.uniq(_.map(anns, function(ann) { return ann.annId; }));
    annIds.sort();
    this.metadata['startAnnotations'] = annIds.join(',');
    opts.keepInstances = true;
    opts.annotations = anns;
    this.__trackUndo(false);
    this.labeler.labelFromExisting(this.labelsPanel, opts);
    this.__trackUndo(true);
  }
};

// Exports
module.exports = PartAnnotator;