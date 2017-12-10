'use strict';

var Constants = require('Constants');
var PartViewer = require('part-annotator/ModelPartViewer');
var Object3DUtil = require('geo/Object3DUtil');
var OffscreenPicker = require('controls/OffscreenPicker');
var MeshHelpers = require('geo/MeshHelpers');
var SegmentLabeler = require('part-annotator/SegmentLabeler');
var SegmentAnnotationStats = require('./SegmentAnnotationStats');
var LabelViewer = require('controls/LabelViewer');
var PLYExporter = require('exporters/PLYExporter');
var _ = require('util');

/**
 * Viewer for looking at segment annotations
 * @param params Configuration for SegmentAnnotationViewer
 * @param [params.retrieveAnnotationsUrl=Constants.retrievePartAnnotationsURL] {string}
 * URL from which segment annotations are retrieved.
 * @param [params.showOBBs=false] {boolean} whether OBBs are displayed.
 * @param [params.useCleanAnnotations=false] {boolean} whether to use cleaned annotations (instead of raw)
 * @constructor
 * @extends ModelPartViewer
 */
function SegmentAnnotationViewer(params) {
  var params = _.defaultsDeep(Object.create(null), params, {
    appId: 'SegmentAnnotationViewer.v2',
    submitStatusUrl: Constants.submitSegmentsAnnotationsStatusURL,
    retrieveAnnotationsUrl:  Constants.retrieveSegmentsAnnotationsURL,
    showOBBs: false,
    labelsPanel: {
      includeAllButton: true,
      noTransparency: true,
      allowRemapLabels: true,
      labelToName: function(label, idx) { return label + ' (' + (idx+1) + ')'; }
    },
    defaultCameraSettings: {
      theta: Math.PI / 4,
      phi: 0
    },
    uihookups: _.keyBy([{
      name: 'showOBBs',
      click: function() { this.showOBBs = !this.showOBBs;}.bind(this),
      shortcut: 'o'
    }, {
      name: 'exportPLY',
      click: function() {
        var plyExporter = new PLYExporter();
        this.labeler.segments.exportRaw(plyExporter, this.modelId);
      }.bind(this),
      shortcut: 'ctrl-shift-m'
    }], 'name')
  });
  PartViewer.call(this, params);
  this.retrieveAnnotationsUrl = params.retrieveAnnotationsUrl;
  this._showOBBs = params.showOBBs;
  this.__useCleanAnnotations = (this.urlParams['clean'] != undefined)? this.urlParams['clean'] : params.useCleanAnnotations;
  if (this.__useCleanAnnotations && this.labelsPanelConfig.allowEditStatus) {
    this.labelsPanelConfig.allowEditLabels = true;
  }

  this.annotations = {};
  this.annotationsByLabel = {};
  this.annotationStats = new SegmentAnnotationStats();
  this.debugOBBsNode = new THREE.Group();
  this.debugOBBsNode.name = 'DebugOBBs';
  this.debugNode.add(this.debugOBBsNode);
  this.excludeFromPicking.push(this.debugOBBsNode);

  this.labelViewer = new LabelViewer({
    container: this.container,
    labeler: this.labeler,
    enabled: false
  });
}

SegmentAnnotationViewer.prototype = Object.create(PartViewer.prototype);
SegmentAnnotationViewer.prototype.constructor = SegmentAnnotationViewer;

SegmentAnnotationViewer.prototype.createLabeler = function() {
  var scope = this;
  var segmentType = Constants.getGlobalOrDefault('segmentType',
    this.urlParams['segmentType'] || this.__options.segmentType);
  var labeler = new SegmentLabeler({
    segmentType: segmentType,
    showNodeCallback: function (node) {
      scope.debugNode.add(node);
    },
    getIntersected: scope.getIntersected.bind(scope),
    onSegmentsLoaded: scope.onSegmentsLoaded.bind(scope),
    getDehighlightColor: function(part) {
      var partLabelInfo = (part.userData.labelInfo)? part.userData.labelInfo : null;
      var current = scope.labeler.currentLabelInfo;
      if (current === partLabelInfo || current == null || current.id > scope.labeler.labelInfos.length) {
        return partLabelInfo.colorMat;
      }
    }
  });
  labeler.segments.Subscribe('loadSegments', this, function() {
    scope.addWaiting('loadSegments');
  });
  labeler.segments.Subscribe('loadSegmentsDone', this, function() {
    scope.removeWaiting('loadSegments');
  });
  return labeler;
};

Object.defineProperty(SegmentAnnotationViewer.prototype, 'showOBBs', {
  get: function () { return this._showOBBs; },
  set: function (v) {
    this._showOBBs = v;
    Object3DUtil.setVisible(this.debugOBBsNode, v);
  }
});

SegmentAnnotationViewer.prototype.onModelLoad = function (modelInstance) {
  PartViewer.prototype.onModelLoad.call(this, modelInstance);
  if (this.scanInfoElem) {
    var roomType = modelInstance.model.info.roomType;
    this.scanInfoElem.text(roomType? 'Room type: ' + roomType : '');
  }
};

// Register event handlers for mouse and keyboard interaction
SegmentAnnotationViewer.prototype.registerCustomEventListeners = function () {
  this.labelViewer.registerEventListeners(this.renderer.domElement);
  var scope = this;
  this.renderer.domElement.addEventListener('mousedown', function (event) {
    // Turn off auto rotate
    scope.cameraControls.setAutoRotate(false);
  });
};

SegmentAnnotationViewer.prototype.getIntersected = function(event) {
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

SegmentAnnotationViewer.prototype.createPanel = function () {
  PartViewer.prototype.createPanel.call(this);
  this.loadSegments();

  var counterBox = $('#counterBox');
  if (counterBox && counterBox.length > 0) {
    this.modelProgressCounter = $('<div></div>');
    counterBox.append(this.modelProgressCounter);
    this.annotationStats.progressCounter = this.modelProgressCounter;
    this.scanInfoElem = $('<div></div>');
    counterBox.append(this.scanInfoElem);
  }
};

SegmentAnnotationViewer.prototype.loadSegments = function(segmentType) {
  if (segmentType) {
    this.labeler.segmentType = segmentType;
  }
  this.labeler.segments.loadSegments(function(err, res) {
    if (!err) {
      this.labelAllParts();
      this.cameraControls.timedAutoRotate(10000, 10.0, function () {});
    }
  }.bind(this)); // Preload segments
};

SegmentAnnotationViewer.prototype.setupScene = function () {
  PartViewer.prototype.setupScene.call(this);
  if (this.__loadingModelInfo) {
    this.annotations = null; // Trigger to load annotations
  } else {
    // Nothing being loaded - check if there is id or annId
    var id = Constants.getGlobalOrDefault('id', this.urlParams['id']);
    var annotationId = Constants.getGlobalOrDefault('annotationId', this.urlParams['annotationId']);
    var modelId = Constants.getGlobalOrDefault('modelId', this.modelInstance? this.modelInstance.model.getFullID() : this.urlParams['modelId']);
    if (id != undefined || annotationId != undefined || modelId != undefined) {
      this.__queryAnnotations();
    }
  }
};

// Labels
SegmentAnnotationViewer.prototype.updateLabels = function () {
  PartViewer.prototype.updateLabels.call(this);
  this.labelAllParts();
};

SegmentAnnotationViewer.prototype.onRemapLabels = function () {
  PartViewer.prototype.onRemapLabels.call(this);
  this.labelAllParts();
};

SegmentAnnotationViewer.prototype.getInitialPartLabels = function () {
  var partLabels = [];
  for (var i = 0; i < this.annotations.length; i++) {
    partLabels.push(this.annotations[i].label);
  }
  return partLabels;
};

SegmentAnnotationViewer.prototype.onSelectLabel = function (labelInfo) {
  PartViewer.prototype.onSelectLabel.call(this, labelInfo);
  this.labelViewer.setLabelInfo(labelInfo);
  if (labelInfo) {
    if (labelInfo.id > this.labeler.labelInfos.length) {  // ALL labelInfo
      this.colorAllParts();
    } else {
      this.colorPartsForLabel(labelInfo);
    }
  }
};

SegmentAnnotationViewer.prototype.clearDebug = function () {
  Object3DUtil.removeAllChildren(this.debugOBBsNode);
};

SegmentAnnotationViewer.prototype.hasAnnotations = function () {
  return this.annotations && this.annotations.length > 0;
};

//Given the annotationId, queries the sql database for the
//matching annotations
SegmentAnnotationViewer.prototype.retrieveAnnotations = function (params) {
  var data = $.param(params);
  var that = this;
  this.addWaiting('retrieveAnnotations');
  $.ajax({
    type: 'GET',
    url: this.retrieveAnnotationsUrl,
    data: data,
    dataType: 'json',
    success: function (res) {
      that.removeWaiting('retrieveAnnotations');
      that.setAnnotations(res);
    },
    error: function (jqXHR, textStatus, errorThrown) {
      that.removeWaiting('retrieveAnnotations');
      console.error('Error retrieving annotations for '  + params.modelId);
      console.log(errorThrown);
    }
  });
};

SegmentAnnotationViewer.prototype.__applyAnnotations = function (annotations) {
  this.labelViewer.enabled = true;
  this.__setAnnotations(annotations);
  this.updateLabels();
  this.annotationStats.compute(this.labeler.segments);
  this.setTransparency(true);
};

function _ensureNumeric(array) {
  var n = 0;
  for (var i = 0; i < array.length; i++) {
    if (typeof array[i] === 'string') {
      array[i] = parseFloat(array[i]);
    }
    if (typeof array[i] === 'number') {
      n++;
    }
  }
  return n;
}

// Check OBB to make sure it is okay
// Some old OBBs were saved with a bad element
function __checkObb(obb) {
  var dn = _ensureNumeric(obb.dominantNormal);
  var c = _ensureNumeric(obb.centroid);
  var a = _ensureNumeric(obb.axesLengths);
  var n = _ensureNumeric(obb.normalizedAxes);
  obb.bad = !(dn === 3 && c === 3 && a === 3 && n === 9);
}

SegmentAnnotationViewer.prototype.__setAnnotations = function (annotations) {
  /* Each annotation  has the following format:
   {
     label: "part name"
     objectId: string
     segments:  {
      segments: [],
      obb: [],
      dominantNormal: []
     }
   } */
  // They can be combined to form segment groups
  this.annotations = annotations;
  for (var i in this.annotations) {
    if (!this.annotations.hasOwnProperty(i)) { continue; }
    var ann = this.annotations[i];
    ann.segments.obb.dominantNormal = ann.segments.dominantNormal;
    __checkObb(ann.segments.obb);
    if (this.annotationsByLabel[ann.label]) { //label already exists in map
      this.annotationsByLabel[ann.label].annotations.push(ann);
    } else { //label not yet present in map
      this.annotationsByLabel[ann.label] = {
        label: ann.label,
        annotations: [ann]
      };
    }
    //console.log(ann);
  }
  var opts = { fixed: false, addLabels: true };
  opts.segmentGroups = _.map(annotations, function(ann) {
    var segGroup = _.omit(ann, 'segments');
    _.assign(segGroup, ann.segments);
    return segGroup;
  });
  this.labeler.labelFromExisting(this.labelsPanel, opts);
};

SegmentAnnotationViewer.prototype.setAnnotations = function(annotations) {
  if (!this.modelInstance) {
    // No model loaded
    if (annotations.length > 0) {
      this.annotations = annotations;
      this.annotationsByLabel = {};
      this.annotationStats = new SegmentAnnotationStats();
      var modelInfo = this.assetManager.getLoadModelInfo(this.defaultSource, annotations[0].modelId);
      this.__loadingModelInfo = modelInfo;
      this.clearAndLoadModel(modelInfo);
    }
  } else {
    this.__applyAnnotations(annotations);
  }
};

SegmentAnnotationViewer.prototype.setAnnotation = function(annotation) {
  if (this.modelId !== annotation.modelId) {
    this.annotations = [annotation];
    this.annotationsByLabel = {};
    this.annotationStats = new SegmentAnnotationStats();
    var modelInfo = this.assetManager.getLoadModelInfo(this.defaultSource, annotation.modelId);
    this.__loadingModelInfo = modelInfo;
    this.clearAndLoadModel(modelInfo);
  } else {
    this.__applyAnnotations([annotation]);
  }
};

SegmentAnnotationViewer.prototype.onSegmentsLoaded = function(segments) {
  segments.colorSegments('Raw');
  if (!this.annotations) {
    this.__queryAnnotations();
  } else {
    this.__applyAnnotations(this.annotations);
  }
};

SegmentAnnotationViewer.prototype.__queryAnnotations = function() {
  var modelInstance = this.modelInstance;
  // Query annotation
  var id = Constants.getGlobalOrDefault('id', this.urlParams['id']);
  var modelId = Constants.getGlobalOrDefault('modelId', modelInstance? modelInstance.model.getFullID() : this.urlParams['modelId']);
  var workerId = Constants.getGlobalOrDefault('workerId', this.urlParams['workerId']);
  var sessionId = Constants.getGlobalOrDefault('sessionId', this.urlParams['sessionId']);
  var annotationId = Constants.getGlobalOrDefault('annotationId', this.urlParams['annotationId']);
  var condition = Constants.getGlobalOrDefault('condition', this.urlParams['condition']);
  var status = Constants.getGlobalOrDefault('status', this.urlParams['status']);
  var label = this.urlParams['label'];
  var labelType = this.urlParams['labelType'];
  var searchParams = {};
  if (id != undefined) searchParams.id = id;
  else if (annotationId != undefined) searchParams.annId = annotationId;
  else {
    if (modelId) searchParams.modelId = modelId;
    if (workerId) searchParams.workerId = workerId;
    if (sessionId) searchParams.sessionId = sessionId;
    if (label) searchParams.label = label;
    if (labelType) searchParams.labelType = labelType;
    if (condition) searchParams.condition = condition;
    if (status) searchParams.status = status;
  }
  if (this.__useCleanAnnotations) {
    searchParams['$clean'] = true;
  }
  this.retrieveAnnotations(searchParams);
};

SegmentAnnotationViewer.prototype.labelAllParts = function () {
  for (var i = 0; i < this.annotations.length; i++) {
    var labelInfo = this.labeler.labelInfos[i];
    labelInfo.segIndices = this.annotations[i].segments.segments;
    labelInfo.annotation = this.annotations[i];
    this.labelsPanel.updateStatus(labelInfo);
  }
  this.colorAllParts();
};

SegmentAnnotationViewer.prototype.showPartOBB = function (labelInfo) {
  var obb = labelInfo.annotation.segments.obb;
  if (obb) {
    if (obb.bad) {
      console.warn("Ignoring bad OBB");
      return;
    }
    var modelObject3D = this.modelInstance.getObject3D('Model');
    modelObject3D.updateMatrixWorld();
    var transformed = new THREE.Object3D();
    Object3DUtil.setMatrix(transformed, modelObject3D.matrixWorld);
    var mesh = new MeshHelpers.OBB(obb, labelInfo.colorMat);
    var meshwf = mesh.toWireFrame(1.0 / transformed.scale.length(), true);
    transformed.add(meshwf);
    this.debugOBBsNode.add(transformed);
  }
};

SegmentAnnotationViewer.prototype.colorAllParts = function () {
  // Assume just one mesh
  var mesh = this.labeler.segments.rawSegmentObject3D;
  if (!mesh) return;  // No mesh yet
  for (var partIdx in this.labeler.labelInfos) {
    if (!this.labeler.labelInfos.hasOwnProperty(partIdx)) { continue; }
    var labelInfo = this.labeler.labelInfos[partIdx];
    this.labeler.colorParts(null, labelInfo);
    this.showPartOBB(labelInfo);
  }
};

SegmentAnnotationViewer.prototype.colorPartsForLabel = function (labelInfo) {
  this.labeler.segments.colorRawSegments(Object3DUtil.ClearColor);
  Object3DUtil.removeAllChildren(this.debugOBBsNode);
  var mesh = this.labeler.segments.rawSegmentObject3D;
  if (!mesh) return;  // No mesh yet
  this.labeler.colorParts(null, labelInfo);
  this.showPartOBB(labelInfo);
};

SegmentAnnotationViewer.prototype.onWindowResize = function (options) {
  PartViewer.prototype.onWindowResize.call(this, options);
  if (this.offscreenPicker) {
    this.offscreenPicker.onResize(this.container);
  }
};

module.exports = SegmentAnnotationViewer;