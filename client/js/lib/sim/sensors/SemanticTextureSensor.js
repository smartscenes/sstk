var CameraSensor = require('sim/sensors/CameraSensor');
var SceneUtil = require('scene/SceneUtil');

/**
 * Semantic texture sensor (used for object/room identification)
 * @param config Sensor configuration
 * @param opts Additional options
 * @constructor
 * @extends {sim.sensors.CameraSensor}
 * @memberOf sim.sensors
 */
function SemanticTextureSensor(config, opts) {
  CameraSensor.call(this, config, opts);
}

SemanticTextureSensor.prototype = Object.create(CameraSensor.prototype);
SemanticTextureSensor.prototype.constructor = CameraSensor;

SemanticTextureSensor.prototype.__getFrame = function(sceneState) {
  var encoding = 'objectId';
  var options = {
    renderer: this.renderer,
    camera: this.camera,
    remapMaterialsKey: 'objectInstanceMaterials'
  };
  var pixelFrame = SceneUtil.renderWithRemappedMaterials(sceneState, options);
  var output = {
    type: this.config.type,
    data: pixelFrame.pixels.buffer,
    counts: pixelFrame.counts,
    encoding: encoding,
    shape: [this.renderer.width, this.renderer.height, 4]
  };
  return output;
};

SemanticTextureSensor.prototype.setSize = function(width, height) {
  CameraSensor.prototype.setSize.call(this, width, height);
  if (this.config.visualize) {
    this.__colorBuffer = this.createPixelBuffer();
  }
};

module.exports = SemanticTextureSensor;
