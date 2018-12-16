var CollisionProcessorNull = require('sim/CollisionProcessorNull');
var Constants = require('Constants');
var _ = require('util/util');

/**
 * Collision processor using navgrid to determine collisions
 * @constructor
 * @extends CollisionProcessorNull
 * @memberOf sim
 * @param opts Configuration parameters for collision processing
 **/
function CollisionProcessorNavGrid(opts) {
  CollisionProcessorNull.call(this, opts);
  opts = _.defaultsDeep(Object.create(null), opts, {
  });
  this.__p = new THREE.Vector3(0, 0, 0);
  this.__d = new THREE.Vector3(0, 0, 0);
  this.__f = new THREE.Vector3(0, 0, 0);
}
CollisionProcessorNavGrid.prototype = Object.create(CollisionProcessorNull.prototype);
CollisionProcessorNavGrid.prototype.constructor = CollisionProcessorNavGrid;

CollisionProcessorNavGrid.prototype.checkForCollision = function (sceneState, agent, dt) {
  var navscene = this.__ensureNavScene(sceneState);

  // check predicted agent position
  //var dist = (agent.velocity.length() * dt + agent.radius + 0.01) * Constants.metersToVirtualUnit;
  this.__p.copy(agent.position).addScaledVector(agent.velocity, dt * Constants.metersToVirtualUnit);
  var didCollide = !navscene.checkLinePathUnoccupied(agent.position, this.__p, agent.radius);
  this.__f.copy(agent.velocity).multiplyScalar(agent.mass * dt).negate();
  return {
    collision: didCollide,
    force: this.__f.clone()
  };
};

CollisionProcessorNavGrid.prototype.computeSensorForces = function (sceneState, agent, dt) {
  var forceSensors = agent.getSensors('force');
  var scope = this;
  _.forEach(forceSensors, function (sensorConfig) {
    if (sensorConfig.encoding.includes('contact')) {
      scope.__computeSensorForcesContact(sensorConfig, sceneState, agent, dt);
    } else {
      //TODO implement
      console.error('computeSensorForces collision mode not implemented for NavGrid');
    }
  });
};

CollisionProcessorNavGrid.prototype.isPositionInsideScene = function(sceneState, pFeet) {
  var navscene = this.__ensureNavScene(sceneState);
  var sceneBBox = sceneState.getBBox();
  if (sceneBBox.contains(pFeet)) {
    // TODO: decide if this is the correct check to use
    if (navscene.hasCellAttribute('floorHeight')) {
      return _.isFinite(navscene.getCellAttribute(pFeet, 'floorHeight'));
    } else {
      return true;
    }
  } else {
    return false;
  }
};

CollisionProcessorNavGrid.prototype.isPositionAgentCanStandAt = function (sceneState, agent, pFeet, opts) {
  var navscene = this.__ensureNavScene(sceneState);
  return navscene.checkPositionUnoccupied(pFeet, agent.radius);
};

CollisionProcessorNavGrid.prototype.__ensureNavScene = function(sceneState) {
  // Make sure navgrid is available for sceneState
  if (sceneState.navscene) {
    // TODO check that cell size is smaller than agent radius
    return sceneState.navscene;
  } else {
    console.error('CollisionProcessorNavGrid requires SceneState NavScene member to be initialized.');
  }
};

CollisionProcessorNavGrid.prototype.__computeSensorForcesContact = function (sensorConfig, sceneState, agent, dt) {
  var dist = (agent.radius + 0.1) * Constants.metersToVirtualUnit;

  var forces = sensorConfig.force;
  forces.fill(0);  // zero out initially
  var positions = sensorConfig.position;
  var orientations = sensorConfig.orientation;
  for (var i = 0; i < forces.length; i++) {
    agent.localToWorldDirection(orientations[i], this.__d);
    agent.localToWorldPosition(positions[i], this.__p);
    var checkPos = this.__p.addScaledVector(this.__d, dist);
    if (!this.isPositionAgentCanStandAt(sceneState, agent, checkPos)) {
      forces[i] = 1.0;
    }
  }
};


module.exports = CollisionProcessorNavGrid;
