var SegmentLabeler = require('part-annotator/SegmentLabeler');
var _ = require("util/util");

/**
 * Allows for labeling of meshes at different granularities
 * @constructor
 * @extends SegmentLabeler
 */
function SegmentHierarchyLabeler(params) {
  SegmentLabeler.call(this, params);
  this.hierarchyLevel = 0;  // 0 is leaf node, +1 as we go up in the hierarchy
  this.maxHierarchyLevel = 0;
}

SegmentHierarchyLabeler.prototype = Object.create(SegmentLabeler.prototype);
SegmentHierarchyLabeler.prototype.constructor = SegmentHierarchyLabeler;

Object.defineProperty(SegmentHierarchyLabeler.prototype, 'segmentHierarchy', {
  get: function () {
    return this.segments? this.segments.indexedSegmentationHier : null;
  }
});

// Set part based on hierarchy level
SegmentHierarchyLabeler.prototype.__findPart = function (event) {
  var intersect = SegmentLabeler.prototype.__findPart.call(this, event);
  // hierarchyLevels are 0 for elementType, 1, 2, etc for levels in the segmentHierarchy
  // -1 so that we are 0 indexed
  var currHierLevel = this.hierarchyLevel-1;
  if (intersect && 0 < currHierLevel) {
    var selectedIndex = [];
    selectedIndex[0] = intersect.segmentIndex;
    for (i = 0; i < currHierLevel; i++) {
      var fineToCoarseIndices = this.segmentHierarchy[i+1].index;
      selectedIndex[i+1] = fineToCoarseIndices[selectedIndex[i]];
    }
    var hierIndices = [];
    hierIndices[currHierLevel] = [selectedIndex[currHierLevel]];
    for (var i = currHierLevel-1; i >= 0; i--) {
      var coarseToFineIndices = this.segmentHierarchy[i+1].segToElements;
      hierIndices[i] = [];
      for (var j = 0; j < hierIndices[i+1].length; j++) {
        var ci = hierIndices[i+1][j];
        hierIndices[i].push.apply(hierIndices[i], coarseToFineIndices[ci]);
      }
      hierIndices[i] = _.uniq(hierIndices[i]);
    }
    intersect.fineSegmentIndex = intersect.segmentIndex;
    intersect.segmentIndex = hierIndices[0];
    intersect.level = this.hierarchyLevel;
  }
  // console.log('findPart', intersect);
  return intersect;
};

SegmentHierarchyLabeler.prototype.nextLevel = function(inc) {
  this.hierarchyLevel = this.hierarchyLevel + inc;
  if (this.hierarchyLevel < 0) {
    this.hierarchyLevel = 0;
  }
  if (this.maxHierarchyLevel && this.hierarchyLevel > this.maxHierarchyLevel) {
    this.hierarchyLevel = this.maxHierarchyLevel;
  }
  this.Publish('levelUpdated', this.hierarchyLevel);
  console.log('Set hierarchyLevel to ' + this.hierarchyLevel);
};

// Loading of segments
SegmentHierarchyLabeler.prototype.__onSegmentsLoaded = function(segments) {
  this.hierarchyLevel = 1;
  //console.log('segments', segments.indexedSegmentationHier);
  this.maxHierarchyLevel = segments.indexedSegmentationHier.length;
};


module.exports = SegmentHierarchyLabeler;

