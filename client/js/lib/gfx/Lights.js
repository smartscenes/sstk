var Lights = {};

Lights.getDefaultHemisphereLight = function(usePhysicalLights, lightsOn) {
  // There is actually three modes:
  //   usePhysicallyCorrectLights off
  //   usePhysicallyCorrectLights without lights enabled
  //   usePhysicallyCorrectLights with    lights enabled
  var ambientIntensity = usePhysicalLights ? (lightsOn? 0.5 : 2.0) : 1.0;
  if (THREE.REVISION < 80) {
    ambientIntensity = 1.0;
  }
  return new THREE.HemisphereLight(0xffffff, 0x202020, ambientIntensity);
};


Lights.addSimple2LightSetup = function (scene, position, doShadowMap) {
  position = position || new THREE.Vector3(-100, 100, 100);
  var ambient = new THREE.AmbientLight(0x050505);

  var light0 = new THREE.PointLight(0xdadacd, 0.85);
  var p0 = new THREE.Vector3();
  p0.copy(position);
  light0.position.copy(p0);
  var light1 = new THREE.PointLight(0x030309, 0.03);
  var p1 = new THREE.Vector3();
  p1.copy(position);
  p1.negate();
  light1.position.copy(p1);

  if (doShadowMap) {
    var light = Lights.createSpotLightShadowMapped(1000);
    light.position.copy(light0.position);
    light.onlyShadow = true;
    scene.add(light);
  }

  scene.add(ambient);
  scene.add(light0);
  scene.add(light1);
};

Lights.createSpotLightShadowMapped = function (lightBoxSize) {
  var light = new THREE.SpotLight(0xffffff, 1, 0, Math.PI, 1);
  light.target.position.set(0, 0, 0);

  light.castShadow = true;

  light.shadowCameraNear = 1;
  light.shadowCameraFar = lightBoxSize;
  light.shadowCameraRight = lightBoxSize;
  light.shadowCameraLeft = -lightBoxSize;
  light.shadowCameraTop = lightBoxSize;
  light.shadowCameraBottom = -lightBoxSize;
  light.shadowCameraFov = 50;

  light.shadowBias = 0.0001;
  light.shadowDarkness = 0.5;

  light.shadowMapWidth = 2048;
  light.shadowMapHeight = 2048;

  light.shadowCameraVisible = true;

  return light;
};


module.exports = Lights;
