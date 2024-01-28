var BaseSegmentLabeler = require('part-annotator/BaseSegmentLabeler');
var Object3DUtil = require('geo/Object3DUtil');
var GeometryUtil = require('geo/GeometryUtil');
var ConnectivityGraph = require('geo/ConnectivityGraph2');
var BBox = require('geo/BBox');
var Index = require('ds/Index');
var _ = require('util/util');
require('three-modifiers');

/**
 * Class responsible for handling labeling of triangles.
 * @param params
 * @param params.minEdgeLength {float}
 * @param params.maxEdgeLength {float}
 * @param params.brushSize {float} Current brush size
 * @param params.mergeVertices {boolean} Whether vertices should be merged
 * @constructor
 * @extends BasePartLabeler
 */
function SegmentTriangleLabeler(params) {
  BaseSegmentLabeler.call(this, params);
  this.minEdgeLength = params.minEdgeLength;
  this.maxEdgeLength = params.maxEdgeLength;
  this.brushSize = params.brushSize;
  this.mergeVertices = params.mergeVertices;
//  this.defaultColor = Object3DUtil.ClearColor;
}

SegmentTriangleLabeler.prototype = Object.create(BaseSegmentLabeler.prototype);
SegmentTriangleLabeler.prototype.constructor = SegmentTriangleLabeler;

Object.defineProperty(SegmentTriangleLabeler.prototype, 'rawSegObject3DWrapper', {
  get: function ()   { return this.segments.rawSegmentObject3DWrapper; }
});

Object.defineProperty(SegmentTriangleLabeler.prototype, 'partsNode', {
  get: function ()   { return this.segments.rawSegmentObject3D; }
});

Object.defineProperty(SegmentTriangleLabeler.prototype, 'defaultColor', {
  get: function ()   { return this.segments.rawSegmentColor; }
});

SegmentTriangleLabeler.prototype.__getTriIndicesForLabelIndex = function(labelIndex) {
  var u = this.segments.rawSegmentObject3D.userData;
  var buffer = u.elemToLabelIndexBuffer;
  if (buffer) {
    var tris = [];
    for (var i = 0; i < buffer.length; i++) {
      if (buffer[i] === labelIndex) {
        tris.push(i);
      }
    }
    return tris;
  } else {
    return null;
  }
};

SegmentTriangleLabeler.prototype.__ensureUserData = function(part) {
  var u = part.mesh.userData;
  if (!u.elemToLabelIndexBuffer) {
    u.elemToLabelIndexBuffer = new Uint32Array(GeometryUtil.getGeometryFaceCount(part.mesh.geometry));
    u.elemToLabelIndexBuffer.fill(0);
  }
  return u;
};

function __getPartTriIndices(part) {
  if (part && part.triIndices && part.triIndices.length) {
    return part.triIndices;
  }
}

function __createPart(mesh, triIndices, labelInfo) {
  return { type: 'Triangle', triIndices: triIndices, mesh: mesh, userData: { labelInfo: labelInfo } };
}

SegmentTriangleLabeler.prototype.__removeTriIndices = function(buffer, triIndices, ignoreLabelIndices) {
  // remove from labelInfo.triIndices
  var labelInfos = this.labelInfos;
  var unlabelTris = new Map();
  for (var i = 0; i < triIndices.length; i++) {
    var li = buffer[triIndices[i]];
    if (li > 0 && ignoreLabelIndices.indexOf(li) < 0) {
      var labelInfo = labelInfos[li-1];
      if (labelInfo.triIndices) {
        _.pull(labelInfo.triIndices, triIndices[i]);
      }
      if (!unlabelTris.has(li)) {
        unlabelTris.set(li, []);
      }
      unlabelTris.get(li).push(triIndices[i]);
    }
  }
  return { updatedLabelIndices: Array.from(unlabelTris.keys()),
           removedLabelToTriIndices: unlabelTris,
           numUnlabeledTris: _.sumBy(Array.from(unlabelTris.values()), (v) => v.length)
         };
};

SegmentTriangleLabeler.prototype.__addTriIndices = function(labelInfo, triIndices) {
  // remove from labelInfo.triIndices
  if (!labelInfo.triIndices) {
    labelInfo.triIndices = [];
  }
  var added = [];
  for (var i = 0; i < triIndices.length; i++) {
    if (_.indexOf(labelInfo.triIndices, triIndices[i]) < 0) {
      labelInfo.triIndices.push(triIndices[i]);
      added.push(triIndices[i]);
    }
  }
  return added;
};

SegmentTriangleLabeler.prototype.__setLabelInfo = function(part, labelInfo, opts) {
  opts = opts || {};
  var partTriIndices = __getPartTriIndices(part);
  if (partTriIndices) {
    var u = this.__ensureUserData(part);
    var li = labelInfo? (labelInfo.index + 1) : 0;
    var removedInfo = this.__removeTriIndices(u.elemToLabelIndexBuffer, partTriIndices, [li]);
    //console.log('got removedInfo', removedInfo);
    var updatedLabelIndices = removedInfo.updatedLabelIndices;
    for (var i = 0; i < partTriIndices.length; i++) {
      var fi = partTriIndices[i];
      u.elemToLabelIndexBuffer[fi] = li;
    }
    var labeledTris = [];
    if (labelInfo) {
      // add to labelInfo.triIndices
      labeledTris = this.__addTriIndices(labelInfo, partTriIndices);
      if (labeledTris.length > 0) {
        updatedLabelIndices.push(li);
      }
    }
    if (updatedLabelIndices.length) {
      if (!opts.skipFitOBB) {
        for (var i = 0; i < updatedLabelIndices.length; i++) {
          var updatedLabelInfo = this.labelInfos[updatedLabelIndices[i] - 1];
          if (updatedLabelInfo.triIndices && updatedLabelInfo.triIndices.length) {
            updatedLabelInfo.obb = this.segments.fitOBB('triangles', updatedLabelInfo.triIndices);
          } else {
            updatedLabelInfo.obb = null;
          }
        }
      }
      if (this.updateAnnotationStats) {
        var unlabledTris = _.flatten(Array.from(removedInfo.removedLabelToTriIndices.values()));
        this.updateAnnotationStats({ mesh: part.mesh, triIndices: unlabledTris }, -1);
        this.updateAnnotationStats({ mesh: part.mesh, triIndices: labeledTris }, +1);
      }
    }
  }
};

SegmentTriangleLabeler.prototype.__label = function(part, labelInfo, opts) {
  this.__setLabelInfo(part, labelInfo, opts);
};

SegmentTriangleLabeler.prototype.__unlabel = function(part, opts) {
  if (part) {
    this.__setLabelInfo(part, null, opts);
  }
};

SegmentTriangleLabeler.prototype.unlabelParts = function (parts, labelInfo) {
  if (!parts) {
    parts = [__createPart(this.segments.rawSegmentObject3D, labelInfo.triIndices.slice(), labelInfo)];
  }
  BaseSegmentLabeler.prototype.unlabelParts.call(this, parts);
};

SegmentTriangleLabeler.prototype.__colorPart = function(part, color) {
  var partTriIndices = __getPartTriIndices(part);
  if (partTriIndices) {
    this.rawSegObject3DWrapper.colorTriVertices(partTriIndices, color);
  }
};

SegmentTriangleLabeler.prototype.colorPart = function(part, colorMaterial) {
  if (part) {
    var color = (colorMaterial instanceof THREE.Color)? colorMaterial : colorMaterial.color;
    this.__colorPart(part, color);
    this.showParts(true);
  }
};

SegmentTriangleLabeler.prototype.decolorPart = function(part) {
  if (part) {
    var partTriIndices = __getPartTriIndices(part);
    if (partTriIndices) {
      var u = this.__ensureUserData(part);
      var buffer = u.elemToLabelIndexBuffer;
      var labelIndexToTriIndices = _.groupBy(partTriIndices, i => buffer[i]);
      _.forEach(labelIndexToTriIndices, (triIndices, labelIndex) => {
        if (labelIndex > 0) {
          var color = this.labelInfos[labelIndex-1].color;
          this.rawSegObject3DWrapper.colorTriVertices(triIndices, color);
        } else {
          this.rawSegObject3DWrapper.colorTriVertices(triIndices, this.defaultColor);
        }
      });
    }
  }
};

// Returns the intersected part given the mouse event. If no part selected, return false
SegmentTriangleLabeler.prototype.__findPart = function (event) {
  var intersect = this.getIntersected(event);
  if (intersect) {
    //console.log(intersect);
    intersect.type = 'Triangle';
    intersect.mesh = intersect.descendant;
    intersect.userData =  intersect.userData || {};
    var m = intersect.mesh;
    if (m.__searchHelper && m.userData.brushSizeSq) {
      // Look for close by triangles
      var g = m.__searchHelper;
      intersect.gathered = g.gatherFaces(intersect.faceIndex, m.userData.brushSizeSq, 0.95);
      var u = this.__ensureUserData(intersect);
      var labelIndex = u.elemToLabelIndexBuffer[intersect.faceIndex];
      intersect.triIndices = intersect.gathered.faceIndices.filter( function(f) {
        var fLabelIndex = u.elemToLabelIndexBuffer[f];
        return fLabelIndex === labelIndex;
      });
      //console.log('got labelIndex', labelIndex, intersect.gathered.faceIndices.length, intersect.triIndices.length);
      intersect.userData.labelInfo = (labelIndex > 0)? this.labelInfos[labelIndex-1] : null;
    }
    return intersect;
  }
};

SegmentTriangleLabeler.prototype.hasParts = function(labelInfo) {
  if (labelInfo.triIndices && labelInfo.triIndices.length) {
    return true;
  } else {
    return Object3DUtil.existsMesh(this.partsNode, false, function (mesh) {
      var u = mesh.userData;
      var targetLabelIndex = labelInfo ? labelInfo.index + 1 : 0;
      if (u && u.elemToLabelIndexBuffer) {
        return _.some(u.elemToLabelIndexBuffer, function (x) {
          return x === targetLabelIndex;
        });
      }
    });
  }
};

SegmentTriangleLabeler.prototype.unlabelAll = function() {
  if (this.partsNode) {
    this.__clearLabels(this.partsNode, this.defaultColor);
  }
};

SegmentTriangleLabeler.prototype.__clearLabels = function(partsNode, defaultColor) {
  // Clean labels from parts
  for (var i = 0; i < this.labelInfos.length; i++) {
    if (this.labelInfos[i]) {
      delete this.labelInfos[i].obb;
      delete this.labelInfos[i].triIndices;
    }
  }
  Object3DUtil.traverseMeshes(partsNode, false, function(mesh) {
    if (mesh.userData.elemToLabelIndexBuffer) {
      mesh.userData.elemToLabelIndexBuffer.fill(0);
    }
  });
  GeometryUtil.colorVertices(this.segments.rawSegmentObject3D.geometry, defaultColor);
};

SegmentTriangleLabeler.prototype.setBrushSize = function(brushSize) {
  this.brushSize = brushSize;
  console.log('setBrushSize=' + brushSize);

  var scope = this;
  Object3DUtil.traverseMeshes(this.partsNode, false, function(mesh) {
    if (brushSize) {
      // NOTE: Estimate of scale we need to multiply by
      var worldScale = new THREE.Vector3();
      mesh.getWorldScale(worldScale);
      // console.log(worldScale);
      var wsl = Math.min(worldScale.x, worldScale.y, worldScale.z) || 1.0;
      var worldToLocalScale = 1.0 / wsl;

      if (!mesh.__searchHelper) {
        mesh.__searchHelper = new ConnectivityGraph(mesh.geometry, scope.mergeVertices);
      }
      mesh.userData.brushSize = worldToLocalScale*brushSize;
      mesh.userData.brushSizeSq = mesh.userData.brushSize*mesh.userData.brushSize;
      //console.log(mesh.userData);
    } else {
      mesh.userData.brushSize = undefined;
      mesh.userData.brushSizeSq = undefined;
    }
      //console.log(mesh.userData);
  });
};

SegmentTriangleLabeler.prototype.__onSegmentsLoaded = function(segments) {
  console.assert(this.rawSegObject3DWrapper.isTriSegments);
  this.setBrushSize(this.brushSize);

  // Set to neutral gray material
  // this.__clearLabels(this.partsNode, this.defaultColor);
};

SegmentTriangleLabeler.prototype.partOverlapsOBB = function (part, obb) {
  var partTriIndices = __getPartTriIndices(part);
  if (partTriIndices) {
    return this.rawSegObject3DWrapper.trisHasPointInOBB(partTriIndices, obb);
  } else {
    return false;
  }
};

SegmentTriangleLabeler.prototype.labelPartsInOBB = function (obb, labels, labelInfo) {
  var u = this.segments.rawSegmentObject3D.userData;
  if (u && u.elemToLabelIndexBuffer) {
    var nonFrozen = _.filter(this.labelInfos, info => info && !(info.fixed || info.frozen));
    var changebleLabelIndices = _.map(nonFrozen, info => info.index + 1);
    var changed = {};
    if (labelInfo) {
      changed[labelInfo.index] = labelInfo;
      changebleLabelIndices.unshift(0);
    }
    var triIndices = [];
    for (var i = 0; i < u.elemToLabelIndexBuffer.length; i++) {
      var li = u.elemToLabelIndexBuffer[i];
      var isChangeable = _.indexOf(changebleLabelIndices, li) >= 0;
      if (isChangeable) {
        if (this.rawSegObject3DWrapper.trisIsContainedInOBB([i], obb)) {
          triIndices.push(i);
          if (li > 0 && !changed[li - 1]) {
            changed[li - 1] = this.labelInfos[li - 1];
          }
        }
      }
    }
    if (triIndices.length) {
      var part = __createPart(this.segments.rawSegmentObject3D, triIndices, null);
      if (labelInfo) {
        this.labelPart(part, labelInfo, {skipFitOBB: true});
      } else {
        this.unlabelPart(part, {skipFitOBB: true});
      }
    }

    var scope = this;
    _.each(changed, function(info) {
      // Update OBBs
      if (info.triIndices.length > 0) {
        info.obb = scope.segments.fitOBB('triangles', info.triIndices);
      } else {
        // This label should be gone!
        labels.removeLabel(info);
      }
    });
  }
};

SegmentTriangleLabeler.prototype.getLabelOBB = function(labelInfo) {
  if (!labelInfo.triIndices) {
    labelInfo.triIndices = this.__getTriIndicesForLabelIndex(labelInfo.index + 1);
  }
  if (!labelInfo.obb && labelInfo.triIndices) {
    labelInfo.obb = this.segments.fitOBB('triangles', labelInfo.triIndices);
  }
  return labelInfo.obb;
};

SegmentTriangleLabeler.prototype.getPartOBB = function (part) {
  var labelInfo = (part.obb || part.triIndices)? part : part.userData.labelInfo;
  if (labelInfo) {
    if (!labelInfo.obb) {
      labelInfo.obb = this.segments.fitOBB('triangles', labelInfo.triIndices);
    }
    return labelInfo.obb;
  } else {
    var partTriIndices = __getPartTriIndices(part);
    return this.segments.fitOBB('triangles', partTriIndices);
  }
};

SegmentTriangleLabeler.prototype.getPartBoundingBox = function (part) {
  var obb = this.getPartOBB(part);
  var minmax = obb.getMinMax();
  return new BBox(minmax.min, minmax.max);
};

SegmentTriangleLabeler.prototype.merge = function(labelInfos, labels) {
  var mesh = this.segments.rawSegmentObject3D;
  if (labelInfos.length > 0) {
    var first = labelInfos[0];
    for (var i = 1; i < labelInfos.length; i++) {
      var labelInfo = labelInfos[i];
      if (labelInfo.triIndices && labelInfo.triIndices.length) {
        var triIndices = labelInfo.triIndices.slice();
        // console.log('Merge segments ' + segIndices + ' from label "' + labelInfo.name
        //   + '" into label "' + first.name + '"');
        var part = __createPart(mesh, triIndices, labelInfo);
        this.labelPart(part, first, { skipFitOBB: true });
        if (labelInfo.triIndices.length > 0) {
          console.warn('Not all segments removed from ' + labelInfo.name);
        }
      }
      labels.removeLabel(labelInfo);
    }
    first.obb = this.segments.fitOBB('triangles', first.triIndices);
    return first;
  }
};

SegmentTriangleLabeler.prototype.labelFromExisting = function(labelsPanel, options) {
  options = options || {};
  // console.log('label using', options);
  console.time('labelFromExisting');
  // Assume just one mesh
  var mesh = this.segments.rawSegmentObject3D;
  var annotations = options.annotations;
  // TODO: fix this naming of segmentGroups
  // if (!annotations) {
  //   if (options.segmentGroups) {
  //     //console.log(options.segmentGroups);
  //     annotations = options.segmentGroups;
  //   }
  // }
  //console.log(segmentGroups);
  if (annotations) {
    for (var i = 0; i < annotations.length; i++) {
      var ann = annotations[i];
      if (ann.label === 'unknown') {
        continue; // Skip unknown
      }
      if (ann.triIndices && ann.triIndices.length > 0) {
        var labelInfo = options.addLabels ?
          labelsPanel.addLabel(ann.label, {fixed: options.fixed}) :
          labelsPanel.createLabel(ann.label, {index: i, color: options.color, fixed: options.fixed});
        //console.log('Label ' + labelInfo.name + ' with segments ' + segs);
        var part = __createPart(mesh, ann.triIndices.slice(), null);
        this.labelPart(part, labelInfo, {skipFitOBB: true});
      }
    }
  }
  // Fit OBB at end
  for (var i = 0; i < labelsPanel.labelInfos.length; i++) {
    var labelInfo = labelsPanel.labelInfos[i];
    if (labelInfo.triIndices) {
      labelInfo.obb = this.segments.fitOBB('triangles', labelInfo.triIndices);
    } else {
      console.warn('No segments for ' + labelInfo.label, labelInfo);
    }
  }
  this.updateLabels(labelsPanel.labelInfos);
  console.timeEnd('labelFromExisting');
};

SegmentTriangleLabeler.prototype.__restoreLabel = function(createdLabelInfo, savedLabelInfo, options) {
  //console.log('restoreLabel', createdLabelInfo, savedLabelInfo);
  var mesh = this.segments.rawSegmentObject3D;
  var triIndices = savedLabelInfo.triIndices;
  if (triIndices && triIndices.length > 0) {
    var part = __createPart(mesh, triIndices.slice(), null);
    console.log('attempt to restore part', part);
    this.labelPart(part, createdLabelInfo, {skipFitOBB: true});
  }
};

SegmentTriangleLabeler.prototype.getAnnotations = function(options) {
  var annotations = [];
  var modelWorldInverse = new THREE.Matrix4();
  var modelObject3D = this.segments.modelInstance.getObject3D('Model');
  modelObject3D.updateMatrixWorld();
  modelWorldInverse.copy(modelObject3D.matrixWorld).invert();
  var validLabelInfos = this.getValidLabels();
  if (validLabelInfos) {
    var tmpPoint = new THREE.Vector3();
    var useObjectIdIndex = false;
    // Figure out if we should useObjectIdIndex
    if (options.objectId == null) {
      for (var i = 0; i < validLabelInfos.length; i++) {
        var labelInfo = validLabelInfos[i];
        if (labelInfo.fixed) continue;  // Skip the fixed set (pre-annotated by someone else)

        if (labelInfo.triIndices && labelInfo.triIndices.length > 0) {
          if (labelInfo.data && labelInfo.data.objectLabelInstId != null) {
            useObjectIdIndex = true;
            break;
          }
        }
      }
    }
    var objectIdIndex = useObjectIdIndex? new Index() : null;
    for (var i = 0; i < validLabelInfos.length; i++) {
      var labelInfo = validLabelInfos[i];
      if (labelInfo.fixed) continue;  // Skip the fixed set (pre-annotated by someone else)

      // TODO: keep partId from original annotation (if appropriate)
      var partId = annotations.length + 1;  // Make sure our part ids are one based
      if (labelInfo.triIndices && labelInfo.triIndices.length > 0) {
        var obbWorld = this.segments.fitOBB('triangles', labelInfo.triIndices);
        var obb = obbWorld.clone();
        obb.applyMatrix4(modelWorldInverse);
        if (options.debug && options.addOBB) {
          options.addOBB(obb, labelInfo.colorMat, modelObject3D.matrixWorld);
        }
        var initialPoint;
        if (labelInfo.initialPoint) {
          tmpPoint.fromArray(labelInfo.initialPoint);
          tmpPoint.applyMatrix4(modelWorldInverse);
          initialPoint = tmpPoint.toArray();
        }
        // Use prespecified objectId if given (otherwise, use partId)
        var objectId = (options.objectId != undefined)? options.objectId : partId;
        if (useObjectIdIndex) {
          var objidKey = partId;
          if (labelInfo.data && labelInfo.data.objectLabelInstId != null) {
            objidKey = labelInfo.data.objectLabel + '.' + labelInfo.data.objectLabelInstId;
          }
          objectId = objectIdIndex.indexOf(objidKey, true) + 1;
        }
        var annRec = {
          //modelId: options.modelId,
          partId: partId,
          objectId: objectId,
          label: labelInfo.label,
          labelType: this.labelType,
          obb: obb.toJSON(),
          dominantNormal: obb.dominantNormal.toArray(),
          initialPoint: initialPoint,
          triIndices: labelInfo.triIndices
        };
        annotations.push(annRec);
      }
    }
  }//if labelInfos
  return annotations;
};

SegmentTriangleLabeler.prototype.onReady = function (options) {
  this.__initBrushSizeSelector(options);
};

SegmentTriangleLabeler.prototype.__initBrushSizeSelector = function (options) {
  var scope = this;
  var brushSizeSelectorConfig = options['brushSizeSelector'];
  var brushSize = options['brushSize'];
  // console.log('__initBrushSizeSelector', options);
  if (brushSizeSelectorConfig) {
    if (!this.brushSizeSlider) {
      var brushSizeSelector = $(brushSizeSelectorConfig.container);
      brushSizeSelector.show();
      var brushSizeSlider = $(brushSizeSelectorConfig.slider);
      this.brushSizeSlider = brushSizeSlider;
      brushSizeSlider.slider({
        min: brushSize.min,
        max: brushSize.max,
        value: brushSize.value,
        change: function (event, ui) {
          brushSize.value = ui.value;
          scope.setBrushSize(ui.value);
        }
      });
    } else {
      scope.brushSizeSlider.slider('option', 'min', brushSize.min);
      scope.brushSizeSlider.slider('option', 'max', brushSize.max);
      scope.brushSizeSlider.slider('option', 'value', brushSize.value);
    }
  }
};

module.exports = SegmentTriangleLabeler;