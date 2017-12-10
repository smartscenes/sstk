'use strict';

var Constants = require('Constants');

function LightsLoader(params) {
  params = params || {};
  this.enableLights = params.enableLights;
  this.defaultLightState = params.defaultLightState;
  this.intensityScale = params.intensityScale || (1 / 60);  // TODO(MS): Properly map light unit
  this.shadowBias = params.shadowBias || 0.005;
  this.lights = {};
}

LightsLoader.prototype.__specToLight = function (s) {
  var light = null;

  var color = new THREE.Color(s.color);
  var position = new THREE.Vector3(s.position[0], s.position[1], s.position[2]);
  var intensity = s.power * this.intensityScale;
  var distance = 5*Constants.metersToVirtualUnit;
  var shadowMapSize = 512;

  if (s.type === 'PointLight') {
    light = new THREE.PointLight(color, intensity, distance, 2);
    light.position.copy(position);
  } else if (s.type === 'SpotLight') {
    light = new THREE.SpotLight(color, intensity, distance, s.cutoffAngle, 0.25, 2);
    light.position.copy(position);
    var direction = new THREE.Vector3(s.direction[0], s.direction[1], s.direction[2]);
    light.target.position.copy(position).add(direction);
  } else if (s.type === 'LineLight') {
    var p2 = new THREE.Vector3(s.position2[0], s.position2[1], s.position2[2]);
    var midpoint = position.add(p2).multiplyScalar(0.5);
    light = new THREE.SpotLight(color, intensity, distance, s.cutoffAngle, 0.25, 2);
    light.position.copy(midpoint);
    var direction = new THREE.Vector3(s.direction[0], s.direction[1], s.direction[2]);
    light.target.position.copy(midpoint).add(direction);
  }

  if (light) {
    light.name = s.type;
    light.power = s.power / 5;
    if (light.shadow) {
      light.shadow.bias = this.shadowBias;
      light.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    }
    // Should already be set by distance passed into the light
    //if (light.shadow.camera) { light.shadow.camera.far = distance; }
    light.userData.intensity = light.intensity;
    light.userData.isOn = this.defaultLightState;
    light.intensity = this.defaultLightState ? light.intensity : 0;
  }

  return light;
};

LightsLoader.prototype.createLights = function (modelInfo, object3D) {
  if (!this.enableLights || !modelInfo.lightSpecs) {
    return null;
  }

  var lights = [];

  var modelId = modelInfo.id;
  if (!this.lights[modelId]) {
    this.lights[modelId] = [];
  }
  var lightsBin = this.lights[modelId];

  var specs = modelInfo.lightSpecs.lights;
  if (!specs) { return null; }
  for (var i = 0; i < specs.length; ++i) {
    if (!lightsBin[i]) {
      lightsBin[i] = this.__specToLight(specs[i]);
    }
    lights[i] = lightsBin[i].clone();
  }
  // if object3D given, add lights and mark default light state
  if (object3D) {
    lights.forEach(function (light) { object3D.add(light);});
    object3D.userData.lightsOn = this.defaultLightState;
  }

  //console.log('Lights:', lights);
  return lights;
};

module.exports = LightsLoader;
