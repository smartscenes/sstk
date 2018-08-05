var Agent = require('sim/Agent');

/*
 * A first person agent with actions that translate to camera manipulation
 */
function FirstPersonAgent(opts) {
  Agent.call(this, opts);
  var scope = this;
  ['forwards', 'backwards', 'turnLeft', 'turnRight',
   'strafeLeft', 'strafeRight', 'lookUp', 'lookDown'].forEach(function (act) {
    scope.__actions[act] = FirstPersonAgent.prototype[act].bind(scope);
  });
}

FirstPersonAgent.prototype = Object.create(Agent.prototype);
FirstPersonAgent.prototype.constructor = FirstPersonAgent;

FirstPersonAgent.prototype.forwards = function (a) {
  var v = this.__headingVector();
  this.force.addScaledVector(v, this.__stepForce);
};

FirstPersonAgent.prototype.backwards = function (a) {
  var v = this.__headingVector();
  v.negate();
  this.force.addScaledVector(v, this.__stepForce);
};

FirstPersonAgent.prototype.turnLeft = function (a) {
  this.torque += this.__turnForce;
};

FirstPersonAgent.prototype.turnRight = function (a) {
  this.torque -= this.__turnForce;
};

FirstPersonAgent.prototype.strafeLeft = function (a) {
  var v = this.__headingVector();
  v.applyAxisAngle(this.upAxis, this.__PI_2);
  this.force.addScaledVector(v, this.__stepForce);
};

FirstPersonAgent.prototype.strafeRight = function (a) {
  var v = this.__headingVector();
  v.applyAxisAngle(this.upAxis, -this.__PI_2);
  this.force.addScaledVector(v, this.__stepForce);
};

FirstPersonAgent.prototype.lookUp = function (a) {
  this.__tiltCameras(a.angle);
};

FirstPersonAgent.prototype.lookDown = function (a) {
  this.__tiltCameras(-a.angle);
};

module.exports = FirstPersonAgent;
