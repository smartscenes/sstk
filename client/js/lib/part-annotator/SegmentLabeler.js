var BasePartLabeler = require('part-annotator/BasePartLabeler');
var GeometryUtil = require('geo/GeometryUtil');
var Object3DUtil = require('geo/Object3DUtil');
var Segments = require('geo/Segments');
var BBox = require('geo/BBox');
var OBB = require('geo/OBB');
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
 * @param [params.updateAnnotationStat] Callback for adjust annotation statistics when something is labeled/unlabeled.
 * @param [params.onSegmentsLoaded] Callback for when segmentation was successfully loaded.
 * @extends BasePartLabeler
 */
function SegmentLabeler(params) {
  BasePartLabeler.call(this, params);
  this.updateAnnotationStats = params.updateAnnotationStats;
  this.onSegmentsLoaded = params.onSegmentsLoaded;

  this._segmentType = params.segmentType || 'surfaces';
  console.log('Segment type is ' + this.__segmentType);
  this.segments = new Segments({
    showNodeCallback: this.showNodeCallback,
    skipSegmentedObject3D: true,
    skipUnlabeledSegment: true
  },  this._segmentType);
  this.segments.rawSegmentColor = Object3DUtil.ClearColor;
}

SegmentLabeler.prototype = Object.create(BasePartLabeler.prototype);
SegmentLabeler.prototype.constructor = SegmentLabeler;

Object.defineProperty(SegmentLabeler.prototype, 'segmentType', {
  get: function () {return this._segmentType; },
  set: function (v) {
    if (v != undefined) {
      this._segmentType = v;
      this.segments.segmentType = v;
    }
  }
});

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
        var segToVertIndices = mesh.userData.segToVertIndices;
        var originalSize = segGroup.segments.length;
        _.remove(segGroup.segments , function(idx) {
          return !segToVertIndices[idx] || segToVertIndices[idx].length === 0;
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

SegmentLabeler.prototype.restore = function(labels, savedLabelInfos, options) {
  options = options || {};
  console.time('restore');
  // Assume just one mesh
  var mesh = this.segments.rawSegmentObject3D;
  for (var i = 0; i < savedLabelInfos.length; i++) {
    var savedLabelInfo = savedLabelInfos[i];
    var segments = savedLabelInfo.segments || savedLabelInfo.segIndices;
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
    if (segments && segments.length > 0) {
      for (var si = 0; si < segments.length; si++) {
        var part = this.__segIdxToPart(mesh, null, segments[si]);
        this.labelPart(part, labelInfo, {skipFitOBB: true});
      }
    }
  }
  this.updateLabels(labels.labelInfos);
  console.timeEnd('restore');
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
  var vert = new THREE.Vector3();
  var segToV = mesh.userData.segToVertIndices;
  var transform = mesh.matrixWorld;
  for (var si in segToV) {
    if (segToV.hasOwnProperty(si)) {
      var vertIndices = segToV[si];
      if (!vertIndices || vertIndices.length === 0) {
        continue;
      } // skip weird empty segments

      si = parseInt(si); // Make sure integer
      // Check if inOBB
      var inOBB = _.all(vertIndices, function (vi) {
        GeometryUtil.getGeometryVertex(mesh.geometry, vi, transform, vert);
        return obb.isPointContained(vert);
      });

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
  var segsChanged = false;
  if (labelInfo.segIndices) {
    if (labelInfo.segIndices.indexOf(part.segmentIndex) < 0) {
      labelInfo.segIndices.push(part.segmentIndex);
      segsChanged = true;
    }
  } else {
    labelInfo.segIndices = [part.segmentIndex];
    if (part.point) {
      labelInfo.initialPoint = part.point.toArray();
    }
    segsChanged = true;
  }
  if (segsChanged) {
    if (!opts.skipFitOBB) {
      labelInfo.obb = this.segments.fitOBB('Raw', labelInfo.segIndices);
    }
    if (this.updateAnnotationStats) {
      this.updateAnnotationStats(part.segmentIndex, +1);
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
  BasePartLabeler.prototype.unlabelParts.call(this, parts);
};

SegmentLabeler.prototype.__unlabel = function (part, opts) {
  if (part) {
    opts = opts || {};
    var labelInfo = part.userData.labelInfo;
    if (labelInfo && labelInfo.segIndices) {
      //console.log('Removing ' + part.segmentIndex + ' from ' + labelInfo.name);
      var i = labelInfo.segIndices.indexOf(part.segmentIndex);
      if (i >= 0) {
        labelInfo.segIndices.splice(i,1);
        if (this.updateAnnotationStats) {
          this.updateAnnotationStats(part.segmentIndex, -1);
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
  BasePartLabeler.prototype.colorParts.call(this, parts, labelInfo);
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

SegmentLabeler.prototype.showParts = function (flag) {
  this.segments.showSegments(flag);
};

//Returns the mesh given the mouse event. If no part selected, return false
SegmentLabeler.prototype.__findPart = function (event) {
  var intersect = this.getIntersected(event);
  if (intersect) {
    //console.log(intersect);
    var u = intersect.descendant.userData;
    if (u.vertToSegIndices) {
      intersect.type = 'RawSegment';
      intersect.mesh = intersect.descendant;
      intersect.segmentIndex = u.vertToSegIndices[intersect.face.a];
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

SegmentLabeler.prototype.setTarget = function (modelInstance) {
  this.segments.init(modelInstance);
  this.segments.ensureSegments(function (err, res) {
    if (!err && this.onSegmentsLoaded) {
      this.onSegmentsLoaded(this.segments);
    }
  }.bind(this));
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
  var segToVertIndices = mesh.userData.segToVertIndices;
  var max = null;
  for (var segId in segToVertIndices) {
    if (!segToVertIndices.hasOwnProperty(segId)) { continue; }
    if (segs && segs[segId] && segs[segId].labelInfo) { continue; }
    if (!max || max.vertIndices.length < segToVertIndices[segId].length) {
      max = { segId: segId, vertIndices: segToVertIndices[segId] };
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

module.exports = SegmentLabeler;
