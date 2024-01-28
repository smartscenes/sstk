var MeshHierarchyLabeler = require('part-annotator/MeshHierarchyLabeler');
var Segments = require('geo/Segments');

/**
 * {@link MeshHierarchyLabeler} with custom segmentation
 * @constructor
 * @extends MeshHierarchyLabeler
 */
function MeshSegmentHierarchyLabeler(params) {
  MeshHierarchyLabeler.call(this, params);
  this.onSegmentsLoaded = params.onSegmentsLoaded;
  this.segmentType = params.segmentType || 'surfaces';
  console.log('Segment type is ' + this.segmentType);
  this.segments = new Segments({
    skipSegmentedObject3D: false,
    skipUnlabeledSegment: true,
    createTrimeshHierarchical: true,
    segmentOptions: params.segmentOptions
  },  this.segmentType);
}

MeshSegmentHierarchyLabeler.prototype = Object.create(MeshHierarchyLabeler.prototype);
MeshSegmentHierarchyLabeler.prototype.constructor = MeshSegmentHierarchyLabeler;

MeshSegmentHierarchyLabeler.prototype.__segmentsUpdated = function(err, res) {
  if (this.segments.segmentedObject3DHierarchical) {
    this.meshHierarchy.setSegmented(this.segments.segmentedObject3DHierarchical);
    this.maxHierarchyLevel = this.meshHierarchy.maxHierarchyLevel;
    if (this.showNodeCallback) {
      this.showNodeCallback(this.meshHierarchy.partsNode);
    }
  }

  if (!err && this.onSegmentsLoaded) {
    this.onSegmentsLoaded(this.segments);
  }
};

MeshSegmentHierarchyLabeler.prototype.setTarget = function(modelInstance) {
  MeshHierarchyLabeler.prototype.setTarget.call(this, modelInstance);
  this.segments.init(modelInstance);
  this.segments.ensureSegments((err, res) => this.__segmentsUpdated(err, res));
};

MeshSegmentHierarchyLabeler.prototype.applySegmentAnnotation = function(annotation, cb) {
  this.segments.__setSegments((err, res) => {
    this.segments.isCustomSegmentation = true;
    this.segments.segmentsJson = annotation['segmentation'];
    this.__segmentsUpdated(err, res);
    if (cb) {
      cb(err, res);
    }
  }, 'segmentation', 'trimeshHier', annotation);
};

module.exports = MeshSegmentHierarchyLabeler;

