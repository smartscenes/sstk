var BasePartLabeler = require('part-annotator/BasePartLabeler');
var MeshHierarchyPanel = require('ui/MeshHierarchyPanel');
var _ = require('util');

/**
 * Class responsible for showing meshes to be labeled and handling mesh
 * label events.
 * @constructor
 * @param params Configuration
 * @param params.filterEmptyGeometries
 * @param params.showMultiMaterial
 * @param params.collapseNestedPaths
 * @extends BasePartLabeler
 */
function MeshLabeler(params) {
  BasePartLabeler.call(this, params);
  this.filterEmptyGeometries = params.filterEmptyGeometries;
  this.showMultiMaterial = params.showMultiMaterial;
  this.collapseNestedPaths = params.collapseNestedPaths;
  this.meshHierarchy = new MeshHierarchyPanel({
    filterEmptyGeometries: this.filterEmptyGeometries,
    showMultiMaterial: this.showMultiMaterial,
    collapseNestedPaths: this.collapseNestedPaths,
    getMeshId: params.getMeshId
  });
}

MeshLabeler.prototype = Object.create(BasePartLabeler.prototype);
MeshLabeler.prototype.constructor = MeshLabeler;

MeshLabeler.prototype.colorPart = function (part, colorMaterial) {
  this.meshHierarchy.colorPart(part, colorMaterial);
};

MeshLabeler.prototype.decolorPart = function (part) {
  this.meshHierarchy.decolorPart(part);
};

MeshLabeler.prototype.showParts = function(flag) {
  this.meshHierarchy.showParts(flag);
};

MeshLabeler.prototype.getMeshes = function() {
  return this.meshHierarchy.getMeshes();
};

MeshLabeler.prototype.getMeshId = function(mesh) {
  return this.meshHierarchy.getMeshId(mesh);
};

MeshLabeler.prototype.findMeshes = function(meshIds) {
  return this.meshHierarchy.findMeshes(meshIds);
};

MeshLabeler.prototype.unlabelAll = function() {
  var meshes = this.meshHierarchy.getMeshes();
  this.unlabelParts(meshes);
};

MeshLabeler.prototype.unlabelParts = function (parts, labelInfo) {
  if (!parts) {
    // Unlabel segments
    parts = this.getMeshesForLabel(labelInfo) || [];
    parts = _.filter(parts, function(x) { return !x.userData.removed; }); // Ignores removed parts
  }
  BasePartLabeler.prototype.unlabelParts.call(this, parts);
};

MeshLabeler.prototype.setTarget = function(m) {
  this.meshHierarchy.setTarget(m);
  if (this.showNodeCallback) {
    this.showNodeCallback(this.meshHierarchy.partsNode);
  }
};

MeshLabeler.prototype.__getMeshesByAnnId = function(options) {
  options = _.defaults(Object.create(null), options, {
    getMeshFn: function(mesh) { return mesh; }
  });
  var meshes = this.getMeshes();
  var annotations = {};
  meshes.forEach(function (mesh) {
    var data = mesh.userData;
    var meshInfo = options.getMeshFn(mesh);
    if (data.labelInfo) {
      var id = data.labelInfo.id;
      if (!annotations[id]) {//First time seeing this label
        annotations[id] = [meshInfo];
      } else {
        annotations[id].push(meshInfo);
      }
    }
  });
  return annotations;
};

MeshLabeler.prototype.getAnnotations = function(options) {
  var scope = this;
  options = _.defaults(Object.create(null), options, {
    getMeshFn: function(mesh) { return scope.getMeshId(mesh); }
  });
  return this.__getMeshesByAnnId(options);
};


MeshLabeler.prototype.getMeshesForLabel = function (labelInfo) {
  var meshes = this.__getMeshesByAnnId();
  var id = labelInfo.id;
  return meshes[id];
};

MeshLabeler.prototype.hasParts = function (labelInfo) {
  var meshes = this.getMeshesForLabel(labelInfo);
  return meshes && meshes.length;
};

MeshLabeler.prototype.labelFromExisting = function(labelsPanel, options) {
  var annotations = this.groupRawAnnotations(options);
  var labels = annotations.map(function(x) { return x.label; });
  labelsPanel.setLabels(labels);
  this.updateLabels(labelsPanel.labelInfos);
  //console.log('annotations', annotations, labels);
  this.labelAll(annotations);
};

MeshLabeler.prototype.groupRawAnnotations = function(options) {
  options = options || {};

  /* Each annotation  has the following format:
   {
   label: "part name"
   partSetId: number
   partId: SGPath-number
   } */
  var rawAnnotations = options.annotations;
  var annotationsByPartSetLabel = options.keepInstances?
    _.groupBy(rawAnnotations, function(ann) {
      return ann.partSetId + '-' + ann.label;
    }) :
    _.groupBy(rawAnnotations, function(ann) {
      return ann.label;
    });
  var annotations = [];
  for (var pid_label in annotationsByPartSetLabel) {
    if (!annotationsByPartSetLabel.hasOwnProperty(pid_label)) { continue; }
    var anns = annotationsByPartSetLabel[pid_label];

    var partIds = _.flatten(anns.map(function(x) {
      return x.partId.split(',');
    }));
    var ann = {
      label: anns[0].label,
      partIds: partIds,
      annotations: anns
    };
    annotations.push(ann);

    // Associate annotations to parts
    var matched = this.findMeshes(partIds);
    var label = ann.label;
    if (matched && options.keepLabelCounts) {
      for (var j = 0; j < matched.length; j++) {
        var mesh = matched[j];
        if (!mesh.userData.labelCounts) {
          mesh.userData.labelCounts = {};
        }
        var cnt = mesh.userData.labelCounts[label] || 0;
        mesh.userData.labelCounts[label] = cnt + 1;
      }
    }
  }
  return annotations;
};

MeshLabeler.prototype.labelAll = function (annotations) {
  for (var partIdx in this.labelInfos) {
    if (!this.labelInfos.hasOwnProperty(partIdx)) { continue; }
    var labelInfo = this.labelInfos[partIdx];
    this.labelMeshes(labelInfo, annotations[labelInfo.index].partIds);
  }
};

//Highlights all meshes with the given meshIds
MeshLabeler.prototype.labelMeshes = function (labelInfo, meshIds) {
  var matched = this.findMeshes(meshIds);
  for (var j in matched) {
    if (!matched.hasOwnProperty(j)) { continue; }
    var mesh = matched[j];
    this.labelPart(mesh, labelInfo);
  }
};

module.exports = MeshLabeler;

