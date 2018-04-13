var Constants = require('Constants');
var Sensor = require('sim/sensors/Sensor');
var Camera = require('gfx/Camera');
var _ = require('util');

/**
 * Camera based sensor (used for color/depth/objects) view renderings.  Default is RGB color renderings.
 * @param config Sensor configuration
 * @param config.name {string} sensor name
 * @param config.position {THREE.Vector3} sensor position
 * @param config.width {int} width of camera sensor resolution
 * @param config.height {int} height of camera sensor resolution
 * @param config.encoding {string} output encoding of sensor
 * @param [config.fov=45] {number} Vertical field of view (in degrees)
 * @param opts Additional options
 * @param opts.getRenderer {function({config, opts): gfx.Renderer}
 * @constructor
 * @memberOf sim.sensors
 */
function CameraSensor(config, opts) {
  Sensor.call(this, config);
  this.renderer = opts.getRenderer(config, opts);
  this.showDebugNode = !!opts.showDebugNode;  // Coerce into boolean
  var aspectRatio = this.renderer.width / this.renderer.height;
  var fov = config.fov || 45;
  var cam = new Camera(fov, aspectRatio,
    ((config.near != undefined)? config.near : 0.001)*Constants.metersToVirtualUnit,
    ((config.far != undefined)? config.far : 20)*Constants.metersToVirtualUnit);  // TODO: consider near/far parameters
  var camPos = config.position[0];
  cam.position.copy(camPos);
  //cam.lookAt(sensor.orientation[0]); // TODO(MS): verify orientation is set correctly
  cam.name = config.name;  // Store sensor name as camera name
  this.camera = cam;
  this.numFramesRendered = 0;
}

CameraSensor.prototype = Object.create(Sensor.prototype);
CameraSensor.prototype.constructor = Sensor;

CameraSensor.prototype.getFrame = function(sceneState) {
  var debugNodeVisibility;
  if (sceneState.debugNode) {
    debugNodeVisibility = sceneState.debugNode.visible;
    sceneState.debugNode.visible = this.showDebugNode;
  }
  var result = this.__getFrame(sceneState);
  this.numFramesRendered++;

  if (sceneState.debugNode) {
    sceneState.debugNode.visible = debugNodeVisibility;
  }

  return result;
}

// Override this function to have custom frames
CameraSensor.prototype.__getFrame = function(sceneState) {
  scene = sceneState.fullScene || sceneState;
  var pixels = null;
  var numChannels = 4;
  var renderer = this.renderer;
  var encoding = this.config.encoding;
  var sceneId = scene.name;
  var camera = this.camera;

  // TODO: consider encoding
  switch (encoding) {
    case 'rgba':
      pixels = renderer.renderToRawPixels(scene, camera).buffer;
      break;
    case 'gray':
      var p = renderer.renderToRawPixels(scene, camera);
      var ngraypixels = p.length / 4;
      for (var i = 0; i < ngraypixels; i++) {
        var b = i << 2;  // 4 * i
        p[i] = 0.2126 * p[b] + 0.7152 * p[b+1] + 0.0722 * p[b+2];
      }
      pixels = p.slice(0, ngraypixels).buffer;
      numChannels = 1;
      break;
    case 'pngbuf':
      pixels = renderer.renderToBuffer(scene, camera);
      break;
    case 'pngfile':
      var pngfile = sceneId + '_' + this.name + '.png';
      pixels = renderer.renderToPng(scene, camera, pngfile);
      break;
    case 'pngseq':
      var pngseq = sceneId + '_' + this.name + '_' + _.padStart(this.numFramesRendered, 5, '0') + '.png';
      pixels = renderer.renderToPng(scene, camera, pngseq);
      break;
    case 'screen':
      pixels = renderer.render(scene, camera);
      break;
    default:
      console.error('Invalid encoding: ' + encoding);
  }

  return {
    type: 'color',
    data: pixels,
    encoding: encoding,
    shape: [this.renderer.width, this.renderer.height, numChannels]
  };
};

CameraSensor.prototype.getShape = function() {
  return [this.renderer.width, this.renderer.height, 4];
};

CameraSensor.prototype.getDataRange = function() {
  return [0,255];
};

CameraSensor.prototype.getMetadata = function() {
  return {
    name: this.name,
    type: this.config.type,
    shape: this.getShape(),
    dataType: this.config.datatype || 'uint8',
    dataRange: this.getDataRange()
  }
};

CameraSensor.prototype.setSize = function(width, height) {
  console.log('resize sensor ' + this.name + ' to ' + width + 'x' + height);
  this.camera.aspect = width / height;
  this.camera.updateProjectionMatrix();
  this.renderer.setSize(width, height);
};

CameraSensor.prototype.createPixelBuffer = function() {
  return new Uint8Array(4 * this.renderer.width * this.renderer.height);
};

module.exports = CameraSensor;

/**
 * Frame of 2D data from a camera sensor
 * @typedef sim.sensors.CameraSensor.Frame
 * @type {object}
 * @property type {string} Sensor type
 * @property data {Array|TypedArray} pixels from the camera sensor (can be color, depth, semantic mask)
 * @property encoding {string} Encoding indicating how the data should be interpreted
 * @property shape {Array} Array indicating the width, height, and number of channels of the data
 */
