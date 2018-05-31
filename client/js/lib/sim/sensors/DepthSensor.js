var Constants = require('Constants');
var CameraSensor = require('sim/sensors/CameraSensor');
var SceneUtil = require('scene/SceneUtil');
var ImageUtil = require('util/ImageUtil');

/**
 * Depth sensor (used for depth rendering and encoding)
 * @param config Sensor configuration
 * @param config.datatype {string} Output datatype ('uint16', 'uint32', or 'float32')
 * @param [config.metersToUnit=1000] {number} What unit to encode the depth values (1000 for millimeters)
 * @param [config.encoding='depth'] {string} Supported encodings are 'rgba|binned|depth'.  'depth' returns depths from camera in specified unit.
 * @param opts Additional options
 * @constructor
 * @extends {sim.sensors.CameraSensor}
 * @memberOf sim.sensors
 */
function DepthSensor(config, opts) {
  CameraSensor.call(this, config, opts);
}

DepthSensor.prototype = Object.create(CameraSensor.prototype);
DepthSensor.prototype.constructor = CameraSensor;

DepthSensor.prototype.__getFrame = function(scene) {
  var depthSensor = this;
  // TODO: pass encoding as parameter
  var config = depthSensor.config || {};
  var encoding = config.encoding || 'depth'; //'rgba|binned';
  var datatype = config.datatype || 'uint16';
  var useBasicPacking = encoding === 'binned';  // rgba packing preserves more bits
  var metersToUnit = config.metersToUnit || 1000;
  var elementSize = 4;

  // TODO: Ensuring rendering is done at resolution of the depthSensor
  var camera = depthSensor.camera;
  var renderer = depthSensor.renderer;
  var pixels = SceneUtil.renderWithMaterial(scene, {
    renderer: renderer,
    camera: camera,
    material: new THREE.MeshDepthMaterial({
      depthPacking: useBasicPacking ? THREE.BasicDepthPacking : THREE.RGBADepthPacking
    })
  });
  var npixels = pixels.length / 4;

  //console.log('far=' + camera.far + ', near='+camera.near);
  //console.log('pixels', pixels);
  switch (encoding) {
    case 'binned':
      var d = new Uint8Array(npixels);
      for (var i = 0; i < npixels; i++) {
        var b = i << 2;  // 4 * i
        d[i] = useBasicPacking? pixels[b] : pixels[b+3];
      }
      pixels = d;
      elementSize = 1;
      break;
    case 'rgba':
      // Just pass back whatever was encoded in the RGBA channels
      break;
    case 'depth':
    default:
      pixels = ImageUtil.unpackRGBAdepth(pixels, camera, datatype, metersToUnit, useBasicPacking);
      elementSize = 1;
      break;
  }

  return {
    type: 'depth',
    data: pixels,
    encoding: encoding,
    shape: [renderer.width, renderer.height, elementSize]
  };
};

DepthSensor.prototype.getShape = function() {
  var config = this.config || {};
  var encoding = config.encoding || 'depth'; //'rgba|binned';
  var elementSize = (encoding === 'rgba')? 4 : 1;
  return [this.renderer.width, this.renderer.height, elementSize];
};

DepthSensor.prototype.getDataRange = function() {
  var config = this.config || {};
  var encoding = config.encoding || 'depth'; //'rgba|binned';
  var metersToUnit = config.metersToUnit || 1000;
  var scaleFactor = metersToUnit*Constants.virtualUnitToMeters;
  return (encoding === 'depth')? [this.camera.near*scaleFactor,this.camera.far*scaleFactor] : [0,255];
};

module.exports = DepthSensor;