var BasePartLabeler = require('part-annotator/BasePartLabeler');
var BBox = require('geo/BBox');
var GeometryUtil = require('geo/GeometryUtil');
var MeshHierarchyPanel = require('ui/MeshHierarchyPanel');
var OBB = require('geo/OBB');
var OBBFitter = require('geo/OBBFitter');
var Object3DUtil = require('geo/Object3DUtil');
var _ = require('util/util');

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
    useSpecialMaterial: true,
    getMeshId: params.getMeshId
  });
}

MeshLabeler.prototype = Object.create(BasePartLabeler.prototype);
MeshLabeler.prototype.constructor = MeshLabeler;

MeshLabeler.prototype.colorPart = function (part, colorMaterial, opts) {
  var filter = opts? opts.filter : null;
  this.meshHierarchy.colorPart(part, colorMaterial, filter);
};

MeshLabeler.prototype.decolorPart = function (part) {
  this.meshHierarchy.decolorPart(part);
};

MeshLabeler.prototype.showParts = function(flag) {
  this.meshHierarchy.showParts(flag);
};

MeshLabeler.prototype.getMeshes = function() {
  return this.meshHierarchy.getNodes();
};

MeshLabeler.prototype.getMeshId = function(mesh) {
  return this.meshHierarchy.getMeshId(mesh);
};

MeshLabeler.prototype.findMeshes = function(meshIds) {
  return this.meshHierarchy.findNodes(meshIds);
};

MeshLabeler.prototype.unlabelAll = function() {
  var meshes = this.meshHierarchy.getNodes();
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
    if (meshInfo != undefined && data.labelInfo) {
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
  labelsPanel.setLabels(annotations);
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
      data: anns[0].data,
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
    this.labelPart(mesh, labelInfo, {skipFitOBB: true});
  }
  if (labelInfo) {
    this.__updateLabelOBB(labelInfo);
  }
};

MeshLabeler.prototype.merge = function(labelInfos, labels) {
  if (labelInfos.length > 0) {
    var first = labelInfos[0];
    var meshes = this.__getMeshesByAnnId();
    for (var i = 1; i < labelInfos.length; i++) {
      var labelInfo = labelInfos[i];
      // Find all parts for this label
      var parts = meshes[labelInfo.id];
      if (parts && parts.length > 0) {
        for (var j = 0; j < parts.length; j++) {
          var p = parts[j];
          this.labelPart(p, first, {skipFitOBB: true});
        }
      }
      labels.removeLabel(labelInfo);
    }
    this.__updateLabelOBB(first);
    return first;
  }
};

MeshLabeler.prototype.__label = function (part, labelInfo, opts) {
  if (part && labelInfo) {
    opts = opts || {};
    if (!opts.skipFitOBB) {
      this.__updateLabelOBB(labelInfo);
    }
  }
};

MeshLabeler.prototype.__unlabel = function (part, opts) {
  if (part && part.userData.labelInfo) {
    opts = opts || {};
    if (!opts.skipFitOBB) {
      this.__updateLabelOBB(part.userData.labelInfo, [part]);
    }
  }
};

MeshLabeler.prototype.__fitOBB = function(meshes) {
  return OBBFitter.fitMeshOBB(meshes, { constrainVertical: true });
};

MeshLabeler.prototype.__updateLabelOBB = function(labelInfo, excludeParts) {
  var parts = this.getMeshesForLabel(labelInfo);
  if (excludeParts) {
    parts = _.filter(parts, function(p) {
      return !Object3DUtil.isDescendantOf(p, excludeParts);
    });
  }
  if (parts && parts.length) {
    labelInfo.obb = this.__fitOBB(parts);
  }
  return labelInfo.obb;
};

MeshLabeler.prototype.getLabelOBB = function(labelInfo) {
  if (!labelInfo.obb) {
    var parts = this.getMeshesForLabel(labelInfo);
    if (parts && parts.length) {
      labelInfo.obb = this.__fitOBB(parts);
    }
  }
  return labelInfo.obb;
};

MeshLabeler.prototype.getPartOBB = function (part) {
  var labelInfo = (part && part.userData)? part.userData.labelInfo : part;
  if (labelInfo) {
    return this.getLabelOBB(labelInfo);
  } else if (part) {
    if (part.userData) {
      part.userData.obb = part.userData.obb || this.__fitOBB([part]);
      return part.userData.obb;
    }
  }
};

MeshLabeler.prototype.getPartBoundingBox = function (part) {
  var obb = this.getPartOBB(part);
  if (obb) {
    var minmax = obb.getMinMax();
    return new BBox(minmax.min, minmax.max);
  }
};

MeshLabeler.prototype.labelPartsInOBB = function (obb, labels, labelInfo) {
  // Find all parts in obb and label them!
  //console.log('label parts in OBB');
  var scope = this;
  var changed = {};
  if (labelInfo) {
    changed[labelInfo.index] = labelInfo;
  }
  var meshes = this.getMeshes();
  meshes = _.filter(meshes, function(x) { return x.geometry; });
  _.each(meshes, function(mesh) {
    var inOBB = GeometryUtil.isMeshInOBB(mesh, obb);
    // inOBB
    if (inOBB) {
      var part = mesh;
      var oldLabelInfo = part.userData.labelInfo;
      var changeOldLabelInfo = oldLabelInfo && !(oldLabelInfo.fixed || oldLabelInfo.frozen);
      if (changeOldLabelInfo) {
        changed[oldLabelInfo.index] = oldLabelInfo;
      }
      if (labelInfo) {
        if (!oldLabelInfo || (changeOldLabelInfo && oldLabelInfo.id !== labelInfo.id)) {
          scope.labelPart(part, labelInfo, {skipFitOBB: true});
        }
      } else {
        if (changeOldLabelInfo) {
          scope.unlabelPart(part, {skipFitOBB: true});
        }
      }
    }
  });
  var meshesByAnnId = this.__getMeshesByAnnId();
  _.each(changed, function(li) {
    // Update OBBs
    if (meshesByAnnId[li.id] && meshesByAnnId[li.id].length) {
      scope.__updateLabelOBB(li);
    } else {
      // This label should be gone!
      labels.removeLabel(li);
    }
  });
};

MeshLabeler.prototype.restore = function(labels, savedLabelInfos, options) {
  options = options || {};
  console.time('restore');
  if (!options.getMeshFn) {
    var meshes = this.getMeshes();
    options.getMeshFn = function(id) {
      return meshes[id];
    };
  }
  for (var i = 0; i < savedLabelInfos.length; i++) {
    var savedLabelInfo = savedLabelInfos[i];
    var labelInfo = labels.createLabelInfo(savedLabelInfo.label, savedLabelInfo );
    labels.appendButton(labelInfo);
    labels.labelInfos[labelInfo.index] = labelInfo;
    if (savedLabelInfo.initialPoint) {
      labelInfo.initialPoint = savedLabelInfo.initialPoint;
    }
    if (savedLabelInfo.obb) {
      labelInfo.obb = new OBB();
      labelInfo.obb.fromJSON(savedLabelInfo.obb);
    }

    var labelMeshes = savedLabelInfo.meshIds;
    if (labelMeshes && labelMeshes.length > 0) {
      for (var mi = 0; mi < labelMeshes.length; mi++) {
        var part = options.getMeshFn(labelMeshes[mi]);
        this.labelPart(part, labelInfo, {skipFitOBB: true});
      }
    }
  }
  this.updateLabels(labels.labelInfos);
  console.timeEnd('restore');
};


module.exports = MeshLabeler;

