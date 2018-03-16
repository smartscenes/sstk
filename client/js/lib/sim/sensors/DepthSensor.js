var Constants = require('Constants');
var CameraSensor = require('sim/sensors/CameraSensor');
var SceneUtil = require('scene/SceneUtil');

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
  function perspectiveDepthToViewZ(near, far, d) {
    return ( near * far ) / ( ( far - near ) * d - far );
  }
  // TODO: pass encoding as parameter
  var config = depthSensor.config || {};
  var encoding = config.encoding || 'depth'; //'rgba|binned';
  var datatype = config.datatype || 'uint16';
  var useBasicPacking = encoding === 'binned';  // rgba packing preserves more bits
  var typeToArray = {
    'float32': Float32Array,
    'uint16': Uint16Array,
    'uint32': Uint32Array
  };
  var metersToUnit = config.metersToUnit || 1000;
  var scaleFactor = metersToUnit*Constants.virtualUnitToMeters;
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
  var unpack_factors = [1.0/(256*256*256*256), 1.0/(256*256*256), 1.0/(256*256), 1.0/256];
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
      var arrayType = typeToArray[datatype];
      var d = new arrayType(npixels);
      var sum = 0;
      var sum_opaque = 0;
      var nopaque = 0;
      for (var i = 0; i < npixels; i++) {
        var b = i << 2;  // 4 * i
        var transparent = 0;
        var pd = 0;
        if (useBasicPacking) {
          pd = pixels[b]/255;
          transparent = (pixels[b+3] === 0);
        } else {
          for (var j = 0; j < 4; j++) {
            pd += pixels[b + j] * unpack_factors[j];
          }
        }

        // Convert and negate
        var v = - perspectiveDepthToViewZ(camera.near, camera.far, pd);
        v = scaleFactor * v;
        d[i] = v;
        sum += d[i];
        if (!transparent) {
          nopaque++;
          sum_opaque++;
        }
      }
      //console.log('min=' + _.min(d), 'max=' + _.max(d), 'ave=' + (sum/npixels), 'opaque_ave=' + (sum_opaque/nopaque), 'opaque=' + (nopaque/npixels));
      pixels = d;
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