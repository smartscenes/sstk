var webapp = require('../../webapp');

module.exports = webapp.util.merge(webapp, {
  MultiModelView: require('./MultiModelView.js')
});
