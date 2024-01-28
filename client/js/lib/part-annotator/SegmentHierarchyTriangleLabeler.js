var SegmentTriangleLabeler = require('part-annotator/SegmentTriangleLabeler');
var SegmentHierarchyLabeler = require('part-annotator/SegmentHierarchyLabeler');
var BaseSegmentLabeler = require('part-annotator/BaseSegmentLabeler');
var _ = require('util/util');

/**
 * Allows for labeling of meshes at different granularities
 * @constructor
 * @extends SegmentLabeler
 */
function SegmentHierarchyTriangleLabeler(params) {
  BaseSegmentLabeler.call(this, params);
  this.brushSize = params.brushSize;
  this.triLabeler = this.__createTriLabeler(params);
  this.segLabeler = new SegmentHierarchyLabeler(params);
  this.__partToLabeler = {
    'Triangle': this.triLabeler,
    'RawSegment': this.segLabeler
  };
}

SegmentHierarchyTriangleLabeler.prototype = Object.create(BaseSegmentLabeler.prototype);
SegmentHierarchyTriangleLabeler.prototype.constructor = SegmentHierarchyTriangleLabeler;

Object.defineProperty(SegmentHierarchyTriangleLabeler.prototype, 'hierarchyLevel', {
  get: function ()   { return this.segLabeler.hierarchyLevel; },
  set: function (n)  { this.segLabeler.hierarchyLevel = n; }
});

Object.defineProperty(SegmentHierarchyTriangleLabeler.prototype, 'maxHierarchyLevel', {
  get: function ()   { return this.segLabeler.maxHierarchyLevel; }
});

Object.defineProperty(SegmentHierarchyTriangleLabeler.prototype, 'rawSegObject3DWrapper', {
  get: function ()   { return this.segments.rawSegmentObject3DWrapper; }
});

SegmentHierarchyTriangleLabeler.prototype.updateLabels = function (labelInfos) {
  BaseSegmentLabeler.prototype.updateLabels.call(this, labelInfos);
  this.triLabeler.updateLabels(labelInfos);
  this.segLabeler.updateLabels(labelInfos);
};

SegmentHierarchyTriangleLabeler.prototype.__findPart = function (event) {
  if (this.hierarchyLevel === 0) {
    return this.triLabeler.__findPart(event);
  } else {
    var part = this.segLabeler.__findPart(event);
    if (part) {
      // get triangles for part
      part.triIndices = this.rawSegObject3DWrapper.getTriIndicesForSegs(part.segmentIndex);
    }
    return part;
  }
};

SegmentHierarchyTriangleLabeler.prototype.__label = function (part, labelInfo, opts) {
  this.triLabeler.__label(part, labelInfo, opts);
};

SegmentHierarchyTriangleLabeler.prototype.__unlabel = function (part, opts) {
  this.triLabeler.__unlabel(part, opts);
};

SegmentHierarchyTriangleLabeler.prototype.colorPart = function (part, colorMaterial) {
//  return this.__partToLabeler[part.type].colorPart(part, colorMaterial);
  return this.triLabeler.colorPart(part, colorMaterial);
};

SegmentHierarchyTriangleLabeler.prototype.decolorPart = function (part) {
//  return this.__partToLabeler[part.type].decolorPart(part);
  return this.triLabeler.decolorPart(part);
};

SegmentHierarchyTriangleLabeler.prototype.nextLevel = function(inc) {
  return this.segLabeler.nextLevel(inc);
};

SegmentHierarchyTriangleLabeler.prototype.hasParts = function(labelInfo) {
  return this.triLabeler.hasParts(labelInfo);
};

SegmentHierarchyTriangleLabeler.prototype.unlabelAll = function() {
  return this.triLabeler.unlabelAll();
};

SegmentHierarchyTriangleLabeler.prototype.unlabelParts = function (parts, labelInfo) {
  return this.triLabeler.unlabelParts(parts, labelInfo);
};

SegmentHierarchyTriangleLabeler.prototype.partOverlapsOBB = function (part, obb) {
  return this.__partToLabeler[part.type].partOverlapsOBB(part, obb);
};

SegmentHierarchyTriangleLabeler.prototype.labelPartsInOBB = function (obb, labels, labelInfo) {
  return this.triLabeler.labelPartsInOBB(obb, labels, labelInfo);
};

SegmentHierarchyTriangleLabeler.prototype.getLabelOBB = function(labelInfo) {
  return this.triLabeler.getLabelOBB(labelInfo);
};

SegmentHierarchyTriangleLabeler.prototype.getPartOBB = function (part) {
  var labeler = (part.type)? this.__partToLabeler[part.type] : this.triLabeler;
  return labeler.getPartOBB(part);
};

SegmentHierarchyTriangleLabeler.prototype.getPartBoundingBox = function (part) {
  var labeler = (part.type)? this.__partToLabeler[part.type] : this.triLabeler;
  return labeler.getPartBoundingBox(part);
};

SegmentHierarchyTriangleLabeler.prototype.merge = function(labelInfos, labels) {
  return this.triLabeler.merge(labelInfos, labels);
};

SegmentHierarchyTriangleLabeler.prototype.labelFromExisting = function(labels, options) {
  return this.triLabeler.labelFromExisting(labels, options);
};

SegmentHierarchyTriangleLabeler.prototype.restore = function(labels, savedLabelInfos, options) {
  return this.triLabeler.restore(labels, savedLabelInfos, options);
};

SegmentHierarchyTriangleLabeler.prototype.getAnnotations = function(options) {
  return this.triLabeler.getAnnotations(options);
};

// Loading of segments
SegmentHierarchyTriangleLabeler.prototype.__onSegmentsLoaded = function(segments) {
  this.triLabeler.setSegments(segments);
  this.segLabeler.setSegments(segments);
};

/**
 * Create labeler that will be used during for triangle based annotation
 */
SegmentHierarchyTriangleLabeler.prototype.__createTriLabeler = function (params) {
  var scope = this;
  var brushSize = this.brushSize;
  return new SegmentTriangleLabeler({
    maxEdgeLength: brushSize.min,  // TODO: Check unit
    brushSize: brushSize.value,    // TODO: Check unit
    mergeVertices: true,
    updateAnnotationStats: params.updateAnnotationStats,
    getIntersected: scope.getIntersected.bind(scope)
  });
};

SegmentHierarchyTriangleLabeler.prototype.onReady = function(options) {
  this.triLabeler.onReady(options);
  this.segLabeler.onReady(options);
};

module.exports = SegmentHierarchyTriangleLabeler;

