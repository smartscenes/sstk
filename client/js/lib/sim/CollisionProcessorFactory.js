var CollisionProcessorNavGrid = require('sim/CollisionProcessorNavGrid');
var CollisionProcessorNull = require('sim/CollisionProcessorNull');
var CollisionProcessorRaycast = require('sim/CollisionProcessorRaycast');
var CollisionProcessorSampledPoints = require('sim/CollisionProcessorSampledPoints');
var _ = require('util');

/**
 * Collision processor factory class
 * @memberOf sim
 **/
function CollisionProcessorFactory() {
}

/**
 * Create new CollisionProcessor with given opts
 * @param opts Configuration parameters for collision processing
 * @param [opts.debug=false] {boolean} whether to turn on debug statements
 * @param [opts.mode=raycast] {string} mode of collision processing to use: "null|raycast|navgrid|physics"
 **/
CollisionProcessorFactory.createCollisionProcessor = function (opts) {
  opts = _.defaultsDeep(Object.create(null), opts, {
    debug: false,
    mode: 'raycast'
  });
  if (opts.mode === 'null') {
    return new CollisionProcessorNull(opts);
  } else if (opts.mode === 'raycast') {
    return new CollisionProcessorRaycast(opts);
  } else if (opts.mode === 'navgrid') {
    return new CollisionProcessorNavGrid(opts);
  } else if (opts.mode === 'samples') {
    return new CollisionProcessorSampledPoints(opts);
  } else if (opts.mode === 'physics') {
    console.error('physics CollisionProcessor unimplemented');
  } else {
    console.error('Unknown collisionDetectionMode: ' + opts.mode);
  }
};

module.exports = CollisionProcessorFactory;
