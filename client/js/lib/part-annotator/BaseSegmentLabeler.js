var BasePartLabeler = require('part-annotator/BasePartLabeler');
var Object3DUtil = require('geo/Object3DUtil');
var Segments = require('geo/Segments');

/**
 * Class responsible for loading segments for labeling
 * @constructor
 * @param params Configuration
 * @param [params.segmentType='surfaces'] What kind of segment type to use.
 *   What you fill in here will depend on the segmentation types and names
 *   you specified in your metadata file for your asset.
 * @param [params.targetElementType] Whether to use vertices or triangles for elements
 * @param [params.updateAnnotationStats] Callback for adjust annotation statistics when something is labeled/unlabeled.
 * @param [params.onSegmentsLoaded] Callback for when segmentation was successfully loaded.
 * @param [params.autoSegmentCheck] Callback for whether to continue with auto segmentation
 * @extends BasePartLabeler
 */
function BaseSegmentLabeler(params) {
  BasePartLabeler.call(this, params);
  this.updateAnnotationStats = params.updateAnnotationStats;
  this.onSegmentsLoaded = params.onSegmentsLoaded;
  this.autoSegmentCheck = params.autoSegmentCheck;

  this._segmentType = params.segmentType || 'surfaces';
  console.log('Segment type is ' + this._segmentType);
  this.segments = new Segments({
    showNodeCallback: this.showNodeCallback,
    skipSegmentedObject3D: true,
    skipUnlabeledSegment: true,
    targetElementType: params.targetElementType
  },  this._segmentType);
  this.segments.rawSegmentColor = Object3DUtil.ClearColor;
}

BaseSegmentLabeler.prototype = Object.create(BasePartLabeler.prototype);
BaseSegmentLabeler.prototype.constructor = BaseSegmentLabeler;

Object.defineProperty(BaseSegmentLabeler.prototype, 'segmentType', {
  get: function () {return this._segmentType; },
  set: function (v) {
    if (v != undefined) {
      this._segmentType = v;
      this.segments.segmentType = v;
    }
  }
});

BaseSegmentLabeler.prototype.setSegments = function(segments) {
  this.segments = segments;
  this.__onSegmentsLoaded(this.segments);
};

BaseSegmentLabeler.prototype.setTarget = function (modelInstance) {
  this.segments.init(modelInstance);
  this.segments.ensureSegments((err, res) => {
    if (!err) {
      console.log('onSegmentsLoaded', this.segments);
      this.__onSegmentsLoaded(this.segments);
      if (this.onSegmentsLoaded) {
        this.onSegmentsLoaded(this.segments);
      }
    }
  }, this.autoSegmentCheck);
};

BaseSegmentLabeler.prototype.showParts = function (flag) {
  this.segments.showSegments(flag);
};

BaseSegmentLabeler.prototype.__onSegmentsLoaded = function(segments) {
  // override to update necessary information when segments are loaded
};

module.exports = BaseSegmentLabeler;
