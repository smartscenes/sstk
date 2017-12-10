'use strict';

// Segmented part annotator

var PartAnnotator = require('./PartAnnotator');
var _ = require('util');

require('physijs');

/**
 * Annotation tool for labels meshes using custom segmentation.
 * Really the same as {@link PartAnnotator} but with better defaults for custom segmentation.
 * @param [params.useSegments=true] {boolean} Whether custom segmentation should be used. Also url param.
 * @param [params.allowEditLabels=true] {boolean} Whether label names can be changed and new labels added. Also url param.
 * @constructor
 * @extends PartAnnotator
 */
function SegmentPartAnnotator(params) {
  var defaults = {
    allowEditLabels: true,
    useSegments: true
  };
  params = _.defaultsDeep(Object.create(null), params, defaults);
  PartAnnotator.call(this, params);
}

SegmentPartAnnotator.prototype = Object.create(PartAnnotator.prototype);
SegmentPartAnnotator.prototype.constructor = SegmentPartAnnotator;

// Exports
module.exports = SegmentPartAnnotator;