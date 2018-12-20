var _ = require('util/util');

var sensors = {
  CameraSensor: require('sim/sensors/CameraSensor'),
  DepthSensor: require('sim/sensors/DepthSensor'),
  NormalSensor: require('sim/sensors/NormalSensor'),
  SemanticSensor: require('sim/sensors/SemanticSensor'),
  SemanticTextureSensor: require('sim/sensors/SemanticTextureSensor'),
  SensorGroup: require('sim/sensors/SensorGroup'),
  Sensor: require('sim/sensors/Sensor')
};

/**
 * Get renderer to use for camera sensors
 * @param sensorConfig
 * @param sensorConfig.name {string}
 * @param sensorConfig.renderer {string}
 * @param sensorConfig.resize {boolean} Whether the size of the sensor should be resized to match some specified height/width
 * @param sensorConfig.type {string}
 * @param sensorConfig.resolution {int[]} sensor resolution (width, height)
 * @param [sensorConfig.cameraArrayShape] {int[]}
 * @param opts
 * @param opts.rendererFactory {gfx.RendererFactory} Factory for creating sensors!
 * @returns {gfx.Renderer}
 * @private
 */
function getRenderer(sensorConfig, opts) {
  var rendererName = sensorConfig.renderer || sensorConfig.name;
  var configSetName = (sensorConfig.type === 'color') ? 'color' : 'simple';
  var rendererOpts = { configSet: configSetName, cameraArrayShape: sensorConfig.cameraArrayShape };
  if (!sensorConfig.resize && sensorConfig.resolution) {
    // Stick with the resolution that was specified for us
    rendererOpts['width'] = sensorConfig.resolution[0];
    rendererOpts['height'] = sensorConfig.resolution[1];
  }
  return opts.rendererFactory.getRenderer(rendererName, rendererOpts);
}


/**
 * Create the specified sensor
 * @param sensorConfig
 * @param sensorConfig.type {string} Sensor type (`color`, `depth`, `normal`, `semantic`, `semantic_texture`, `group`)
 * @param sensorConfig.encoding {string} Type of encoding to use
 * @param sensorConfig.position {THREE.Vector3[]}
 * @param opts
 * @param opts.colorEncoding {string} Encoding to use for color sensor
 * @returns {*}
 */
sensors.getSensor = function(sensorConfig, opts) {
  // TODO: Create new renderer for sensor based on sensor configuration instead of just reusing old prespecified
  opts = _.defaults(Object.create(null), opts, {
    getRenderer: getRenderer, getSensor: sensors.getSensor
  });
  // console.log('got sensorConfig', sensorConfig);
  if (sensorConfig.type === 'color') {
    // TODO: Clean override of encoding up
    // If opts.colorEncoding specified, has it override sensorConfig.encoding
    if (opts.colorEncoding) {
      console.warn('[sensors] colorEncoding ' + opts.colorEncoding + ' is set, overriding encoding ' + sensorConfig.encoding);
      sensorConfig.encoding = opts.colorEncoding;
    }
    return new sensors.CameraSensor(sensorConfig, opts);
  } else if (sensorConfig.type === 'depth') {
    return new sensors.DepthSensor(sensorConfig, opts);
  } else if (sensorConfig.type === 'normal') {
    return new sensors.NormalSensor(sensorConfig, opts);
  } else if (sensorConfig.type === 'semantic') {
    return new sensors.SemanticSensor(sensorConfig, opts);
  } else if (sensorConfig.type === 'semantic_texture') {
    return new sensors.SemanticTextureSensor(sensorConfig, opts);
  } else if (sensorConfig.type === 'group') {
    return new sensors.SensorGroup(sensorConfig, opts);
  } else {
    // Unknown sensor type
    console.error('Unknown sensor type', sensorConfig);
    return null;
    //return new sensors.Sensor(sensorConfig);
  }
};

sensors.getSensors = function(sensorConfig, opts) {
  var sensorConfigs;
  if (_.isArray(sensorConfig.position)) {
    var sz = sensorConfig.position.length;
    sensorConfigs = _.map(sensorConfig.position, function(p,i) {
      var index = (sz > 1 && i)? i : undefined;
      return _.defaults({ position: p, orientation: sensorConfig.orientation[i], index: index }, sensorConfig);
    });
  } else {
    sensorConfigs = [sensorConfig];
  }
  var res = _.map(sensorConfigs, function(sc) {
    return sensors.getSensor(sc, opts);
  });
  return res;
};

module.exports = sensors;
