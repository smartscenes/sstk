var Sensor = require('sim/sensors/Sensor');
var _ = require('util');

/**
 * Sensor group that is captures several types of modalities from by rendering at the same location/resolution
 * @param config Sensor configuration
 * @param opts Additional options
 * @constructor
 * @extends {sim.sensors.Sensor}
 * @memberOf sim.sensors
 */
function SensorGroup(config, opts) {
  Sensor.call(this, config, opts);
  this.__sensors = _.map(config.modes, function(mode) {
    var modeConfig = _.defaults(Object.create(null), mode, _.omit(config, 'modes'));
    console.log('modeConfig', modeConfig);
    return opts.getSensor(modeConfig, opts);
  });
}

SensorGroup.prototype = Object.create(Sensor.prototype);
SensorGroup.prototype.constructor = Sensor;


SensorGroup.prototype.getFrame = function(scene) {
  var frames = _.map(this.__sensors, function(sensor) {
    return sensor.getFrame(scene);
  });
  this.numFramesRendered++;
  return frames;
};

SensorGroup.prototype.getSensors = function() {
  return this.__sensors;
};


module.exports = SensorGroup;