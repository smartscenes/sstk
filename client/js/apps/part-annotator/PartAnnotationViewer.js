'use strict';

var Constants = require('Constants');
var PartViewer = require('part-annotator/ModelPartViewer');
var LabelViewer = require('controls/LabelViewer');
var _ = require('util/util');

function PartAnnotationViewer(params) {
  this.urlParams = _.getUrlParams();
  var selectedUrlParams = _.pick(this.urlParams, ['useSegments', 'segmentType', 'keepInstances']);
  params = _.defaultsDeep(Object.create(null), selectedUrlParams, params, {
    appId: 'PartAnnotationViewer.v2-20220901',
    addGround: true,
    retrieveAnnotationsUrl:  Constants.retrievePartAnnotationsURL,
    segmentType: 'surfaces',
    labelsPanel: {
      allowMultiSelect: true,
      noTransparency: false,
      includeAllButton: true
    }
  });
  this.useSegments = params.useSegments;
  this.segmentType = params.segmentType;
  this.keepInstances = params.keepInstances;
  PartViewer.call(this, params);
  this.retrieveAnnotationsUrl = params.retrieveAnnotationsUrl;
  this.rawAnnotations = null;  // raw annotations (direct from database, there may be multiple per partSetId)
  this.annotations = []; // label index -> {label: label, partId: [partIds], annotations: [annotations]}

  this.labelViewer = new LabelViewer({
    container: this.container,
    labeler: this.labeler,
    enabled: true
});}

PartAnnotationViewer.prototype = Object.create(PartViewer.prototype);
PartAnnotationViewer.prototype.constructor = PartAnnotationViewer;

PartAnnotationViewer.prototype.createLabeler = function() {
  var scope = this;
  var labeler;
  if (this.useSegments) {
    console.log('Use MeshSegmentHierarchyLabeler');
    var MeshSegmentHierarchyLabeler = require('part-annotator/MeshSegmentHierarchyLabeler');
    labeler = new MeshSegmentHierarchyLabeler({
      segmentType: scope.segmentType,
      getMeshId: function(m) { return m.userData.id; },
      showNodeCallback: function (node) {
        scope.debugNode.add(node);
      },
      onSegmentsLoaded:   function (segments) {
        scope.__updateAnnotations();
      },
      getIntersected: scope.getIntersectedMesh.bind(scope),
      getDehighlightColor: function (part) {
        var partLabelInfo = (part.userData.labelInfo) ? part.userData.labelInfo : null;
        var current = scope.labeler.currentLabelInfo;
        if (current === partLabelInfo || current == null || current.id > scope.labeler.labelInfos.length) {
          return partLabelInfo.colorMat;
        } else if (current) {
          if (part.userData.labelCounts[current.label]) {
            return current.colorMat;
          }
        }
      }
    });
    labeler.segments.Subscribe('loadSegments', this, function () {
      scope.addWaiting('loadSegments');
    });
    labeler.segments.Subscribe('loadSegmentsDone', this, function () {
      scope.removeWaiting('loadSegments');
    });
  } else {
    var MeshLabeler = require('part-annotator/MeshLabeler');
    labeler = new MeshLabeler({
      showNodeCallback: function (node) {
        scope.debugNode.add(node);
      },
      getIntersected: scope.getIntersectedMesh.bind(scope),
      getDehighlightColor: function (part) {
        var partLabelInfo = (part.userData.labelInfo) ? part.userData.labelInfo : null;
        var current = scope.labeler.currentLabelInfo;
        if (current === partLabelInfo || current == null || current.id > scope.labeler.labelInfos.length) {
          return partLabelInfo.colorMat;
        } else if (current) {
          if (part.userData.labelCounts[current.label]) {
            return current.colorMat;
          }
        }
      }
    });
  }
  return labeler;
};

// Register event handlers for mouse and keyboard interaction
PartAnnotationViewer.prototype.registerCustomEventListeners = function () {
  this.labelViewer.registerEventListeners(this.renderer.domElement);
};

// Create panel with icons and part names
PartAnnotationViewer.prototype.createPanel = function () {
  PartViewer.prototype.createPanel.call(this);
  this.labelAllParts();
};

PartAnnotationViewer.prototype.updateLabels = function () {
  PartViewer.prototype.updateLabels.call(this, this.annotations);
  this.labelAllParts();
};

PartAnnotationViewer.prototype.getInitialPartLabels = function () {
  var partLabels = [];
  for (var i = 0; i < this.annotations.length; i++) {
    partLabels.push(this.annotations[i].label);
  }
  return partLabels;
};

PartAnnotationViewer.prototype.onSelectLabel = function (labelInfos) {
  var labelInfo;
  if (Array.isArray(labelInfos)) {
    if (labelInfos.length === 1) {
      labelInfo = labelInfos[0];
    }
  } else if (labelInfos) {
    labelInfo = labelInfos;
    labelInfos = [labelInfo];
  }
  PartViewer.prototype.onSelectLabel.call(this, labelInfo);
  this.labelViewer.setLabelInfo(labelInfo);
  if (labelInfos) {
    var labelAll = _.find(labelInfos, function(info) {return info.isAll; });
    if (labelAll) { // ALL labelInfo
      this.labelAllParts();
      this.colorMeshesWithLabelInfos([labelAll]);
    } else {
      this.colorMeshesWithLabelInfos(labelInfos);
    }
  }
};

//Given the model id, worker id, and session id, queries the sql database for the
//matching annotations
PartAnnotationViewer.prototype.retrieveAnnotations = function (params) {
  var data = $.param(params);
  var scope = this;
  $.ajax({
    type: 'GET',
    url: this.retrieveAnnotationsUrl,
    data: data,
    dataType: 'json',
    success: function (res) {
      scope.setAnnotations(res);
      scope.updateLabels();
    },
    error: function (jqXHR, textStatus, errorThrown) {
      console.error('Error retrieving annotations for '  + params.modelId);
      console.log(errorThrown);
    }
  });
};

PartAnnotationViewer.prototype.setAnnotations = function (annotations) {
  this.rawAnnotations = annotations;
  if (this.useSegments) {
    for (let ann of annotations) {
      ann.partId = ann.partId.map(x => (typeof x === 'string')? parseInt(x) : x);
    }
  }
  this.annotations = this.labeler.groupRawAnnotations({ annotations: annotations, keepInstances: this.keepInstances, keepLabelCounts: true });
};

PartAnnotationViewer.prototype.onModelLoad = function (modelInstance) {
  PartViewer.prototype.onModelLoad.call(this, modelInstance);
  if (!this.useSegments) {
    this.__updateAnnotations();
  }
};

PartAnnotationViewer.prototype.__updateAnnotations = function() {
  var modelInstance = this.modelInstance;
  var modelId = Constants.getGlobalOrDefault('modelId', modelInstance.model.getFullID());
  var workerId = Constants.getGlobalOrDefault('workerId', this.urlParams['workerId']);
  var sessionId = Constants.getGlobalOrDefault('sessionId', this.urlParams['sessionId']);
  var annotationId = this.urlParams['annotationId'];
  var condition = Constants.getGlobalOrDefault('condition', this.urlParams['condition']);
  var status = Constants.getGlobalOrDefault('status', this.urlParams['status']);
  var label = this.urlParams['label'];
  var labelType = this.urlParams['labelType'];
  var searchParams = { modelId: modelId };
  if (workerId) searchParams.workerId = workerId;
  if (sessionId) searchParams.sessionId = sessionId;
  if (label) searchParams.label = label;
  if (labelType) searchParams.labelType = labelType;
  if (annotationId !== undefined) searchParams.annId = annotationId;
  if (condition) searchParams.condition = condition;
  if (status) searchParams.status = status;
  this.retrieveAnnotations(searchParams);
  this.setTransparency(true);
};

PartAnnotationViewer.prototype.labelAllParts = function () {
  this.labeler.labelAll(this.annotations);
};

//Highlights all meshes with the given meshIds
PartAnnotationViewer.prototype.labelMeshes = function (labelInfo, meshIds) {
  this.labeler.labelMeshes(labelInfo, meshIds);
};

PartAnnotationViewer.prototype.colorMeshesWithLabelInfos = function (labelInfos) {
  var allMeshes = this.labeler.getMeshes();
  for (var i in allMeshes) {
    if (!allMeshes.hasOwnProperty(i)) { continue; }
    var mesh = allMeshes[i];
    var labelInfo = null;
    if (mesh.userData.labelInfo) {
      var found = _.find(labelInfos, function (x) { return x.isAll || mesh.userData.labelInfo.id === x.id; });
      if (found) { labelInfo = mesh.userData.labelInfo; }
    }
    if (labelInfo) {
      this.labeler.colorPart(mesh, labelInfo.colorMat);
    } else {
      this.labeler.decolorPart(mesh);
    }
  }
};

PartAnnotationViewer.prototype.colorMeshesWithLabelInfo = function (labelInfo) {
  var allMeshes = this.labeler.getMeshes();
  for (var i in allMeshes) {
    if (!allMeshes.hasOwnProperty(i)) { continue; }
    var mesh = allMeshes[i];
    if (mesh.userData.labelInfo && mesh.userData.labelInfo.id === labelInfo.id) {
      this.labeler.colorPart(mesh, labelInfo.colorMat);
    } else {
      this.labeler.decolorPart(mesh);
    }
  }
};

PartAnnotationViewer.prototype.colorMeshesWithLabel = function (labelInfo) {
  var allMeshes = this.labeler.getMeshes();
  for (var i in allMeshes) {
    if (!allMeshes.hasOwnProperty(i)) { continue; }
    var mesh = allMeshes[i];
    if (mesh.userData.labelCounts && mesh.userData.labelCounts[labelInfo.label]) {
      this.labeler.colorPart(mesh, labelInfo.colorMat);
    } else {
      this.labeler.decolorPart(mesh);
    }
  }
};

module.exports = PartAnnotationViewer;
