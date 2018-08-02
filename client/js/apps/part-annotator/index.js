var webapp = require('../webapp');

module.exports = webapp.util.merge(webapp, {
  PartAnnotator: require('./PartAnnotator'),
  SimplePartAnnotator: require('./SimplePartAnnotator'),
  SegmentPartAnnotator: require('./SegmentPartAnnotator'),
  PartAnnotationViewer: require('./PartAnnotationViewer'),
  GroupedAnnotationsViewer: require('./GroupedAnnotationsViewer')
});
