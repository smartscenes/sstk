var sensors = {
  CameraSensor: require('sim/sensors/CameraSensor'),
  DepthSensor: require('sim/sensors/DepthSensor'),
  NormalSensor: require('sim/sensors/NormalSensor'),
  SemanticSensor: require('sim/sensors/SemanticSensor'),
  SensorGroup: require('sim/sensors/SensorGroup'),
  Sensor: require('sim/sensors/Sensor')
};

/**
 *
 * @param sensorConfig
 * @param sensorConfig.type {string}
 * @param sensorConfig.width {int}
 * @param sensorConfig.height {int}
 * @param opts
 * @param opts.rendererFactory {gfx.RendererFactory} Factory for creating sensors!
 * @returns {gfx.Renderer}
 * @private
 */
function getRenderer(sensorConfig, opts) {
  var rendererName = sensorConfig.renderer || sensorConfig.name;
  var configSetName = (sensorConfig.type === 'color') ? 'color' : 'simple';
  var rendererOpts = { configSet: configSetName };
  if (!sensorConfig.resize && sensorConfig.resolution) {
    // Stick with the resolution that was specified for us
    rendererOpts['width'] = sensorConfig.resolution[0];
    rendererOpts['height'] = sensorConfig.resolution[1];
  }
  return opts.rendererFactory.getRenderer(rendererName, rendererOpts);
}


// TODO: Create new render for sensor based on sensor configuration instead of just reusing old prespecified
sensors.getSensor = function(sensorConfig, opts) {
  opts = _.defaults(Object.create(null), opts, {
    getRenderer: getRenderer, getSensor: sensors.getSensor
  });
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
  } else if (sensorConfig.type === 'group') {
    return new sensors.SensorGroup(sensorConfig, opts);
  } else {
    // Unknown sensor type
    console.error('Unknown sensor type', sensorConfig);
    return null;
    //return new sensors.Sensor(sensorConfig);
  }
};

module.exports = sensors;
