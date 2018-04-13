var webapp = require('../webapp');

module.exports = webapp.util.merge(webapp, {
  ImageAnnotator: require('./ImageAnnotator'),
  AssetLabeler: require('./AssetLabeler'),
  ModelCategorizer: require('./ModelCategorizer'),
  ModelAnnotator: require('./ModelAnnotator'),
  MultiLineTextForm: require('ui/MultiLineTextForm')
});