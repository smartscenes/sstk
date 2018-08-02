var CameraSensor = require('sim/sensors/CameraSensor');
var SceneUtil = require('scene/SceneUtil');

/**
 * Normal sensor (used for normal identification)
 * @param config Sensor configuration
 * @param opts Additional options
 * @constructor
 * @extends {sim.sensors.CameraSensor}
 * @memberOf sim.sensors
 */
function NormalSensor(config, opts) {
  CameraSensor.call(this, config, opts);
}

NormalSensor.prototype = Object.create(CameraSensor.prototype);
NormalSensor.prototype.constructor = CameraSensor;

NormalSensor.Material = new THREE.MeshNormalMaterial();

NormalSensor.prototype.__getFrame = function(scene) {
  var pixels = SceneUtil.renderWithMaterial(scene, {
//    colorBy: 'normal',
    renderer: this.renderer,
    camera: this.camera,
    material: NormalSensor.Material
  });
  // TODO: some conversion of normals into interpretable stuff
  //console.log('got pixels', pixels);
  return {
    type: 'normal',
    data: pixels.buffer,
    encoding: 'xyza',
    shape: [this.renderer.width, this.renderer.height, 4]
  };
};

module.exports = NormalSensor;

/**
 * Normals from a camera sensor
 * @typedef sim.sensors.NormalSensor.Frame
 * @type {object}
 * @extends {sim.sensors.CameraSensor.Frame}
 * @property type {string} Sensor type (`normal`)
 * @property data {Array|TypedArray} pixels from the camera sensor for normals
 * @property encoding {string} Encoding indicating how the data should be interpreted (`xyza`)
 * @property shape {Array} Array indicating the width, height, and number of channels of the data
 */
