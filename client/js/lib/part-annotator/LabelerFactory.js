var TriangleLabeler = require('part-annotator/TriangleLabeler');
var SegmentLabeler = require('part-annotator/SegmentLabeler');
var MeshLabeler = require('part-annotator/MeshLabeler');

function LabelerFactory() {
}

LabelerFactory.prototype.constructor = LabelerFactory;

LabelerFactory.prototype.createLabeler = function(params) {
  switch (params.type) {
      case 'triangle': return new TriangleLabeler(params);
      case 'segment': return new SegmentLabeler(params);
      case 'mesh': return new MeshLabeler(params);
      default: throw 'Unknown labeler type: ' + params.type;
  }
};

module.exports = LabelerFactory;

