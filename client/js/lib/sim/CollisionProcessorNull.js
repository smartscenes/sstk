var Constants = require('Constants');
var _ = require('util');

/**
 * Collision processor base class. Returns no collisions.
 * @constructor
 * @memberOf sim
 * @param opts Configuration parameters for collision processing
 * @param [opts.traversableHeight=0.25] {number} Ignore obstacles lower than this height
 **/
function CollisionProcessorNull(opts) {
  opts = _.defaultsDeep(Object.create(null), opts, {
    debug: false,
    traversableFloorHeight: 0.25  // obstacles up to this high off the floor are ignored
  });
  this.traversableFloorHeight = opts.traversableFloorHeight;
  this.debug = opts.debug;
}
CollisionProcessorNull.prototype.constructor = CollisionProcessorNull;

/**
 * Check whether agent collides with sceneState during step of dt from now
 */
CollisionProcessorNull.prototype.checkForCollision = function (sceneState, agent, dt) {
  return {
    collision: false,
    force: new THREE.Vector3(0, 0, 0)
  };
};

/**
 * Compute sensed forces by agent in sceneState during step of dt from now
 */
CollisionProcessorNull.prototype.computeSensorForces = function (sceneState, agent, dt) {
  // no collisions so no forces
};

CollisionProcessorNull.prototype.intersectsSphere = function(sceneState, sphere) {
  return false;
};

CollisionProcessorNull.prototype.intersectsBox = function(sceneState, box) {
  return false;
};

/**
 * Compute sensed forces by agent in sceneState during step of dt from now
 */
CollisionProcessorNull.prototype.isPositionAgentCanStandAt = function (sceneState, agent, pFeet, opts) {
  // no collisions = can stand anywhere
  return true;
};

/**
 * Return whether agent position pFeet is a position inside the scene
 */
CollisionProcessorNull.prototype.isPositionInsideScene = function(sceneState, pFeet) {
  var sceneBBox = sceneState.getBBox();
  return sceneBBox.contains(pFeet);
};

/**
 * Return cost of agent position pFeet in sceneState given baseCost
 */
CollisionProcessorNull.prototype.getPositionCost = function (sceneState, agent, pFeet, opts) {
  opts = opts || {};
  var baseCost = opts.baseCost || 1;
  // Perform check on whether the agent can stand at the given position
  var canStandAt = this.isPositionAgentCanStandAt(sceneState, agent, pFeet, opts);
  if (canStandAt) {
    return baseCost;
  }
};


module.exports = CollisionProcessorNull;
