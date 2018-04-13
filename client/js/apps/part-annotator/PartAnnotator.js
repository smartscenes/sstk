'use strict';

var Constants = require('Constants');
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
    addGround: true,
    itemIdField: 'modelId',
    instructions: {
      html:
        'Left click = Select/Deselect part<br>' +
        'Left click and drag = select/deselect multiple parts<br>' +
        'Right click and drag or arrow keys = Orbit Model<br>' +
        'SHIFT + Right click and drag = Pan view<br>' +
        'Mouse wheel = Zoom view<br>' +
        'Number keys = Keyboard shortcut for part name<br><br>' +
        'C = toggle transparency and enable/disable annotation<br><br>' +
        'B = toggle display of bounding boxes<br><br>' +
        'Step 1: Select a name on the right<br>' +
        'Step 2: Color in parts of the object using the mouse<br>' +
        'Step 3: Press BreakItUp! button (or B key) to remove colored parts and get to more parts!'
    },
    labelsPanel: {
      allowNewLabels: true,
      allowEditLabels: allowEditLabels,
      allowDelete: allowEditLabels,
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
          labelOBB: {
            name: 'Label box',
            callback: function () {
              scope.fillSelected(true);
            }
          },
          unlabelOBB: {
            name: 'Unlabel box',
            callback: function () {
              scope.fillSelected(false);
            }
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
  this.startFrom = Constants.getGlobalOrDefault('startFrom',
    this.urlParams['startFrom'] || params.startFrom);

  this.allowLevels = params.allowLevels;
  this.useSegments = params.useSegments;
  BasePartAnnotator.call(this, params);

  this.annotations = {};

  this.partsToBreakUp = [];
  this.removedParts = []; //Parts that have been removed from the model

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

PartAnnotator.prototype.__annotatorReady = function() {
  this.annotations = {};
  this.initLevelSelector(this.__options['levelSelector']);

  if (this.taskMode === 'fixup') {
    // Transfer labels from existing annotation
    this.__labelFromExisting({ fixed: false, addLabels: true }); // allow change/delete of labels
    this.setTransparency(true);
  }

  this.timings.mark('annotatorReady');
  this.painter.enabled = true;
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
  var meshes = this.labeler.getMeshes().filter(function(m) {
    return !m.userData.level;
  });
  meshes.forEach(function (mesh) {
    var data = mesh.userData;
    var meshId = this.labeler.getMeshId(mesh);
    if (!data.removed && data.labelInfo) { //Hasn't been removed yet, so annotate the mesh
      var id = data.labelInfo.id;
      if (!this.annotations[id]) {//First time seeing this label
        this.annotations[id] = { label: data.labelInfo.label, meshIds: [meshId], data: data.labelInfo.data };
      } else {
        this.annotations[id].meshIds.push(meshId);
      }
      this.partsToBreakUp.push(mesh);
    }
  }.bind(this));
  console.log('All annotations: ');
  console.log(this.annotations);
};

// Annotates the model, then removes all annotated parts
PartAnnotator.prototype.breakItUp = function () {
  this.annotate();

  this.partsToBreakUp.forEach(function (mesh) {
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
    physmesh.matrix.copy(mesh.matrixWorld.clone());
    physmesh.matrixWorld.copy(mesh.matrixWorld.clone());
    Object3DUtil.attachToParent(physmesh, this.scene, this.scene);
    this.removePart(mesh);
    this.removedParts.push(mesh);

    setTimeout(function (physmesh) {
      this.scene.remove(physmesh);
    }.bind(this, physmesh), 2000);
  }.bind(this));

  this.partsToBreakUp = [];
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
  if ($.isEmptyObject(this.annotations)) {
    showAlert('Please annotate some parts before submitting!', 'alert-warning');
    return;
  }

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
  params['data'] = data;

  this.__submitAnnotationData(params, modelId);
};

PartAnnotator.prototype.hasAnnotations = function () {
  var hasAnnotated = !$.isEmptyObject(this.annotations);
  if (hasAnnotated) return true;
  var meshes = this.labeler.getMeshes();
  for (var i in meshes) {
    if (!meshes.hasOwnProperty(i)) {
      continue;
    }
    var mesh = meshes[i];
    var data = mesh.userData;
    if (!data.removed && data.labelInfo) {
      hasAnnotated = true;
      break;
    }
  }
  return hasAnnotated;
};

/* Removes the part from the model */
PartAnnotator.prototype.removePart = function (mesh) {
  // TODO: Removing mesh from parent will change the SGPath of the mesh
  // The SGPath of the mesh will need to be precomputed and stored
  var index = mesh.parent.children.indexOf(mesh);
  if (index > -1) {
    mesh.parent.children.splice(index, 1);
    mesh.userData.removed = true;
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
    this.labeler.labelFromExisting(this.labelsPanel, opts);
  }
};

// Exports
module.exports = PartAnnotator;