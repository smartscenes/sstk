var _ = require('util');

function Sensor(config) {
  this.config = config;     // Sensor config
  this.name = config.name;  // Sensor name
}

Sensor.prototype.getSensors = function() {
  return [this];
};

module.exports = Sensor;