var webapp = require('../webapp');

module.exports = webapp.util.merge(webapp, {
  ModelScaler: require('./ModelScaler'),
  ModelScaler2: require('./ModelScaler2'),
  ModelLiner: require('./ModelLiner')
});
