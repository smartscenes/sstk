var CameraSensor = require('sim/sensors/CameraSensor');
var Constants = require('Constants');
var SceneUtil = require('scene/SceneUtil');
var ImageUtil = require('util/ImageUtil');
var LabelMapping = require('util/LabelMapping');

/**
 * Semantic sensor (used for object/room identification)
 * @param config Sensor configuration
 * @param opts Additional options
 * @constructor
 * @extends {sim.sensors.CameraSensor}
 * @memberOf sim.sensors
 */
function SemanticSensor(config, opts) {
  CameraSensor.call(this, config, opts);
  this.__useSemanticEncodings = false;
  if (opts.semanticEncodings) {
    var enc = opts.semanticEncodings[config.encoding];
    if (enc) {
      this.__labelMapping = (enc instanceof LabelMapping) ? enc : new LabelMapping(enc);
      this.__labelMapping.name = this.name;
      this.__useSemanticEncodings = true;
    } else if (this.config.encoding === 'objectId' || this.config.encoding === 'roomId') {
      this.__useSemanticEncodings = true;
    }
  }
  if (this.config.visualize) {
    this.__colorBuffer = this.createPixelBuffer();
    this.__palette = Constants.defaultPalette;  // TODO: use configured palette
  }
}

SemanticSensor.prototype = Object.create(CameraSensor.prototype);
SemanticSensor.prototype.constructor = CameraSensor;


SemanticSensor.prototype.__getFrame = function(sceneState) {
  var encoding = this.config.encoding || 'objectId';
  var colorBy = encoding;
  var index = null;
  if (this.__useSemanticEncodings) {
    var semencoding = SceneUtil.__precomputeSemanticEncoding(sceneState, encoding, this.__labelMapping);
    index = semencoding? semencoding.index : null;
    colorBy = 'index';
  }
  var options = {
    colorBy: colorBy,
    index: index,
    getId: function (x) {
      return x.userData.id;
    },
    getIndex: function (x) {
      if (x.userData.semanticEncoding) {
        return x.userData.semanticEncoding[this.__labelMapping? this.name : encoding];
      }
    },
    renderer: this.renderer,
    camera: this.camera
  };
  var pixelFrame = this.config.countPixels? SceneUtil.getPixelCounts(sceneState, options) : SceneUtil.renderIndexed(sceneState, options);
  var output = {
    type: this.config.type,
    data: pixelFrame.pixels.buffer,
    counts: pixelFrame.counts,
    encoding: encoding,
    shape: [this.renderer.width, this.renderer.height, 4]
  };
  if (this.config.includeIndex) {
    output.index = pixelFrame.index? pixelFrame.index.objects() : null
  }
  if (this.config.visualize) {
    // add data_color that converts from indexed to bright pretty colors
    ImageUtil.recolorIndexed(pixelFrame.pixels, this.__palette, this.__colorBuffer);
    output.data_viz = this.__colorBuffer.buffer;
  }
  return output;
};

SemanticSensor.prototype.setSize = function(width, height) {
  CameraSensor.prototype.setSize.call(this, width, height);
  if (this.config.visualize) {
    this.__colorBuffer = this.createPixelBuffer();
  }
};

module.exports = SemanticSensor;

/**
 * Semantic mask from a camera sensor
 * @typedef sim.sensors.Semantic.Frame
 * @type {object}
 * @extends {sim.sensors.CameraSensor.Frame}
 * @property type {string} Sensor type
 * @property data {Array|TypedArray} pixels from the camera sensor for semantic mask
 * @property encoding {string} Encoding indicating how the data should be interpreted
 * @property shape {Array} Array indicating the width, height, and number of channels of the data
 * @property counts {Map<int,int>} Mapping of semantic index to number of pixels.  Populated if `countPixels` is set.
 * @property index {Array} Array mapping index to semantic label (category or object id).  Populated if `includeIndex` is set.
 * @property data_viz {Array|TypedArray} Colored pixels for visualization.   Populated if `visualize` is set.
 */
