var webapp = require('../../webapp');

module.exports = webapp.util.merge(webapp, {
  ArticulationAnnotator: require('./ArticulationAnnotator'),
});
