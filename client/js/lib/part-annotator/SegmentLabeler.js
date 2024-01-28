var BaseSegmentLabeler = require('part-annotator/BaseSegmentLabeler');
var Object3DUtil = require('geo/Object3DUtil');
var BBox = require('geo/BBox');
var _ = require('util/util');

/**
 * Class responsible for showing segments to be labeled and handling segment
 * label events. Used by other classes to determine when segments are to be
 * labeled, and also to keep track of labels for a set of segments.
 * @constructor
 * @param params Configuration
 * @param [params.segmentType='surfaces'] What kind of segment type to use.
 *   What you fill in here will depend on the segmentation types and names
 *   you specified in your metadata file for your asset.
 * @param [params.targetElementType] Whether to use vertices or triangles for elements
 * @param [params.updateAnnotationStats] Callback for adjust annotation statistics when something is labeled/unlabeled.
 * @param [params.onSegmentsLoaded] Callback for when segmentation was successfully loaded.
 * @extends BasePartLabeler
 */
function SegmentLabeler(params) {
  BaseSegmentLabeler.call(this, params);
}

SegmentLabeler.prototype = Object.create(BaseSegmentLabeler.prototype);
SegmentLabeler.prototype.constructor = SegmentLabeler;

SegmentLabeler.prototype.labelFromExisting = function(labels, options) {
  options = options || {};
  console.time('labelFromExisting');
  // Assume just one mesh
  var mesh = this.segments.rawSegmentObject3D;
  var segmentGroups = this.segments.segmentGroups;
  if (options.segmentGroups) {
    //console.log(options.segmentGroups);
    segmentGroups = options.segmentGroups;
  }
  //console.log(segmentGroups);
  for (var i = 0; i < segmentGroups.length; i++) {
    var segGroup = segmentGroups[i];
    if (segGroup.label === 'unknown') {
      continue; // Skip unknown
    }
    if (segGroup.segments && segGroup.segments.length > 0) {
      if (this.segments.dropMissingSegments) {
        var segToElemIndices = mesh.userData.segToElemIndices;
        var originalSize = segGroup.segments.length;
        _.remove(segGroup.segments , function(idx) {
          return !segToElemIndices[idx] || segToElemIndices[idx].length === 0;
        });
        var newSize = segGroup.segments.length;
        if (newSize !== originalSize) {
          console.log('Dropped ' + (originalSize - newSize) + ' missing segments from ' + segGroup.label + ' ' + i);
        }
      }
      var segs = segGroup.segments;
      var labelInfo = options.addLabels ?
        labels.addLabel(segGroup.label, {fixed: options.fixed}) :
        labels.createLabel(segGroup.label, {index: i, color: options.color, fixed: options.fixed});
      //console.log('Label ' + labelInfo.name + ' with segments ' + segs);
      for (var si = 0; si < segs.length; si++) {
        var part = this.__segIdxToPart(mesh, null, segs[si]);
        if (part.userData.labelInfo) {
          //console.log('Segment ' + si + ' already part of ' + labelInfo.name);
        }
        this.labelPart(part, labelInfo, {skipFitOBB: true});
      }
    }
  }
  // Fit OBB at end
  for (var i = 0; i < labels.labelInfos.length; i++) {
    var labelInfo = labels.labelInfos[i];
    if (labelInfo.segIndices) {
      labelInfo.obb = this.segments.fitOBB('Raw', labelInfo.segIndices);
    } else {
      console.warn('No segments for ' + labelInfo.label, labelInfo);
    }
  }
  this.updateLabels(labels.labelInfos);
  console.timeEnd('labelFromExisting');
};

SegmentLabeler.prototype.__restoreLabel = function(createdLabelInfo, savedLabelInfo, options) {
  var mesh = this.segments.rawSegmentObject3D;
  var segments = savedLabelInfo.segments || savedLabelInfo.segIndices;
  if (segments && segments.length > 0) {
    for (var si = 0; si < segments.length; si++) {
      var part = this.__segIdxToPart(mesh, null, segments[si]);
      this.labelPart(part, createdLabelInfo, {skipFitOBB: true});
    }
  }
};

SegmentLabeler.prototype.partOverlapsOBB = function (part, obb) {
  return this.segments.segmentHasPointInOBB(part.segmentIndex, obb);
};

SegmentLabeler.prototype.labelPartsInOBB = function (obb, labels, labelInfo) {
  // Find all parts in obb and label them!
  //console.log('label parts in OBB');
  var mesh = this.segments.rawSegmentObject3D;
  var scope = this;
  var changed = {};
  if (labelInfo) {
    changed[labelInfo.index] = labelInfo;
  }
  var segToE = mesh.userData.segToElemIndices;
  for (var si in segToE) {
    if (segToE.hasOwnProperty(si)) {
      var elemIndices = segToE[si];
      if (!elemIndices || elemIndices.length === 0) {
        continue;
      } // skip weird empty segments

      si = parseInt(si); // Make sure integer
      // Check if inOBB
      var inOBB = scope.segments.segmentIsContainedInOBB(si, obb);

      // inOBB
      if (inOBB) {
        var part = scope.__segIdxToPart(mesh, null, si);
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
    }
  }
  _.each(changed, function(li) {
    // Update OBBs
    if (li.segIndices.length > 0) {
      li.obb = scope.segments.fitOBB('Raw', li.segIndices);
    } else {
      // This label should be gone!
      labels.removeLabel(li);
    }
  });
};

SegmentLabeler.prototype.__label = function (part, labelInfo, opts) {
  opts = opts || {};
  var segsChanged = [];
  // segmentIndex can be array - why? to allow for special parts with multiple segments (good for hierarchical labeling)
  var sis = Array.isArray(part.segmentIndex)? part.segmentIndex : [part.segmentIndex];
  if (labelInfo.segIndices) {
    for (var j = 0; j < sis.length; j++) {
      var si = sis[j];
      if (labelInfo.segIndices.indexOf(si) < 0) {
        labelInfo.segIndices.push(si);
        segsChanged.push(si);
      }
    }
  } else {
    labelInfo.segIndices = sis;
    if (part.point) {
      labelInfo.initialPoint = part.point.toArray();
    }
    segsChanged = sis;
  }
  if (segsChanged.length) {
    if (!opts.skipFitOBB) {
      labelInfo.obb = this.segments.fitOBB('Raw', labelInfo.segIndices);
    }
    if (this.updateAnnotationStats) {
      this.updateAnnotationStats(sis, +1);
    }
  }
};

SegmentLabeler.prototype.getLabelOBB = function(labelInfo) {
  if (!labelInfo.obb && labelInfo.segIndices && labelInfo.segIndices.length) {
    labelInfo.obb = this.segments.fitOBB('Raw', labelInfo.segIndices);
  }
  return labelInfo.obb;
};

SegmentLabeler.prototype.getPartOBB = function (part) {
  var labelInfo = (part.obb || part.segIndices)? part : part.userData.labelInfo;
  if (labelInfo) {
    if (!labelInfo.obb) {
      labelInfo.obb = this.segments.fitOBB('Raw', labelInfo.segIndices);
    }
    return labelInfo.obb;
  } else {
    return this.segments.fitOBB('Raw', [part.segmentIndex]);
  }
};

SegmentLabeler.prototype.getPartBoundingBox = function (part) {
  var obb = this.getPartOBB(part);
  var minmax = obb.getMinMax();
  return new BBox(minmax.min, minmax.max);
};

SegmentLabeler.prototype.unlabelParts = function (parts, labelInfo) {
  if (!parts) {
    // Unlabel segments
    // Assume just one mesh
    var mesh = this.segments.rawSegmentObject3D;
    parts = labelInfo.segIndices.map(this.__segIdxToPart.bind(this, mesh, null));
  }
  BaseSegmentLabeler.prototype.unlabelParts.call(this, parts);
};

SegmentLabeler.prototype.__unlabel = function (part, opts) {
  if (part) {
    opts = opts || {};
    var labelInfo = part.userData.labelInfo;
    // segmentIndex can be array - why? to allow for special parts with multiple segments (good for hierarchical labeling)
    var sis = Array.isArray(part.segmentIndex)? part.segmentIndex : [part.segmentIndex];
    if (labelInfo && labelInfo.segIndices) {
      //console.log('Removing ' + part.segmentIndex + ' from ' + labelInfo.name);
      var removed = [];
      for (var j = 0; j < sis.length; j++) {
        var si = sis[j];
        var i = labelInfo.segIndices.indexOf(si);
        if (i >= 0) {
          labelInfo.segIndices.splice(i, 1);
          removed.push(si);
        }
      }
      if (removed.length > 0) {
        if (this.updateAnnotationStats) {
          this.updateAnnotationStats(removed, -1);
        }
        if (labelInfo.segIndices.length > 0) {
          if (!opts.skipFitOBB) {
            labelInfo.obb = this.segments.fitOBB('Raw', labelInfo.segIndices);
          }
        } else {
          labelInfo.obb = null;  // delete stale OBB so we can start from scratch
        }
      } else {
        // console.log('Segment ' + part.segmentIndex + ' ' + typeof(part.segmentIndex) + ' not part of ' + labelInfo.name, labelInfo);
      }
    }
  }
};

SegmentLabeler.prototype.unlabelAll = function() {
  // Clean labels from parts
  for (var i = 0; i < this.labelInfos.length; i++) {
    if (this.labelInfos[i]) {
      delete this.labelInfos[i].obb;
      delete this.labelInfos[i].segIndices;
    }
  }
  var mesh = this.segments.rawSegmentObject3D;
  if (mesh) {
    delete mesh.userData.segs;
    this.segments.colorRawSegments(Object3DUtil.ClearColor);
  }
};

SegmentLabeler.prototype.colorParts = function (parts, labelInfo) {
  if (!parts) {
    var mesh = this.segments.rawSegmentObject3D;
    parts = labelInfo.segIndices.map(this.__segIdxToPart.bind(this, mesh, null));
  }
  BaseSegmentLabeler.prototype.colorParts.call(this, parts, labelInfo);
};

SegmentLabeler.prototype.colorPart = function (part, colorMaterial) {
  if (part) {
    var color = (colorMaterial instanceof THREE.Color) ? colorMaterial : colorMaterial.color;
    this.segments.colorRawSegment(part.mesh, part.segmentIndex, color);
    Object3DUtil.setVisible(this.segments);
  }
};

SegmentLabeler.prototype.decolorPart = function (part) {
  if (part) {
    this.segments.colorRawSegment(part.mesh, part.segmentIndex, Object3DUtil.ClearColor);
  }
};

//Returns the mesh given the mouse event. If no part selected, return false
SegmentLabeler.prototype.__findPart = function (event) {
  var intersect = this.getIntersected(event);
  if (intersect) {
    //console.log(intersect);
    var u = intersect.descendant.userData;
    if (u.elemToSegIndices) {
      intersect.type = 'RawSegment';
      intersect.mesh = intersect.descendant;
      if (u.isVertSegments) {
        intersect.segmentIndex = u.elemToSegIndices[intersect.face.a];
      } else {
        intersect.segmentIndex = u.elemToSegIndices[intersect.faceIndex];
      }
      u.segs = u.segs || [];
      u.segs[intersect.segmentIndex] = u.segs[intersect.segmentIndex] || {};
      intersect.userData = u.segs[intersect.segmentIndex];
      return intersect;
    }
  }
};

SegmentLabeler.prototype.__segIdxToPart = function (mesh, labelInfo, segIdx) {
  var u = mesh.userData;
  u.segs = u.segs || [];
  u.segs[segIdx] = u.segs[segIdx] || {};
  if (labelInfo && !u.segs[segIdx].labelInfo) {
    u.segs[segIdx].labelInfo = labelInfo;
  }
  return {
    type: 'RawSegment',
    mesh: mesh,
    segmentIndex: segIdx,
    userData: u.segs[segIdx]
  };
};

SegmentLabeler.prototype.hasParts = function (labelInfo) {
  //console.log(labelInfo);
  return labelInfo.segIndices && labelInfo.segIndices.length > 0;
};

SegmentLabeler.prototype.merge = function(labelInfos, labels) {
  if (labelInfos.length > 0) {
    // Assume just one mesh
    var mesh = this.segments.rawSegmentObject3D;
    var first = labelInfos[0];
    for (var i = 1; i < labelInfos.length; i++) {
      var labelInfo = labelInfos[i];
      if (labelInfo.segIndices && labelInfo.segIndices.length) {
        var segIndices = labelInfo.segIndices.slice();
        // console.log('Merge segments ' + segIndices + ' from label "' + labelInfo.name
        //   + '" into label "' + first.name + '"');
        for (var j = 0; j < segIndices.length; j++) {
          var p = this.__segIdxToPart(mesh, null, segIndices[j]);
          this.labelPart(p, first, { skipFitOBB: true });
        }
        if (labelInfo.segIndices.length > 0) {
          console.warn('Not all segments removed from ' + labelInfo.name);
        }
      }
      labels.removeLabel(labelInfo);
    }
    first.obb = this.segments.fitOBB('Raw', first.segIndices);
    return first;
  }
};

SegmentLabeler.prototype.getLargestUnlabeled = function() {
  var mesh = this.segments.rawSegmentObject3D;
  var segs = mesh.userData.segs;
  var segToElemIndices = mesh.userData.segToElemIndices;
  var max = null;
  for (var segId in segToElemIndices) {
    if (!segToElemIndices.hasOwnProperty(segId)) { continue; }
    if (segs && segs[segId] && segs[segId].labelInfo) { continue; }
    if (!max || max.elemIndices.length < segToElemIndices[segId].length) {
      max = { segId: segId, elemIndices: segToElemIndices[segId] };
    }
  }
  if (max) {
    max.obb = this.segments.fitOBB('Raw', [max.segId]);
  }
  //console.log('largest unlabeled', max);
  return max;
};

SegmentLabeler.prototype.compare = function(sg1, sg2) {
  return this.segments.compare(sg1, sg2);
};

SegmentLabeler.prototype.getAnnotations = function(options) {
  var annotations = [];
  var modelWorldInverse = new THREE.Matrix4();
  var modelObject3D = this.segments.modelInstance.getObject3D('Model');
  modelObject3D.updateMatrixWorld();
  modelWorldInverse.copy(modelObject3D.matrixWorld).invert();
  var validLabelInfos = this.getValidLabels();
  if (validLabelInfos) {
    var tmpPoint = new THREE.Vector3();
    for (var i = 0; i < validLabelInfos.length; i++) {
      var labelInfo = validLabelInfos[i];
      if (labelInfo.fixed) continue;  // Skip the fixed set (pre-annotated by someone else)

      // TODO: keep partId from original annotation (if appropriate)
      var partId = annotations.length + 1;  // Make sure our part ids are one based
      var objectId = (options.objectId != undefined)? options.objectId : partId; // Use prespecified objectId if given (otherwise, use partId)
      if (labelInfo.segIndices && labelInfo.segIndices.length > 0) {
        var obbWorld = this.segments.fitOBB('Raw', labelInfo.segIndices);
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
        annotations.push({
          modelId: options.modelId,
          partId: partId,
          objectId: objectId,
          label: labelInfo.label,
          labelType: this.labelType,
          obb: obb.toJSON(),
          dominantNormal: obb.dominantNormal.toArray(),
          initialPoint: initialPoint,
          segments: labelInfo.segIndices
        });
      }
    }
  }//if labelInfos
  return annotations;
};

module.exports = SegmentLabeler;
