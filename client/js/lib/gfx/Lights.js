const Lights = {};

/**
 * Information about a light (see https://threejs.org/docs/#api/en/lights/Light)
 * @typedef LightSpec
 * @type {object}
 * @memberOf gfx
 */

Object.defineProperty(THREE.Light.prototype, 'colorHex', {
  get: function () { return this.color.getHex(); },
  set: function (v) {
    this.color.setHex(v);
  }
});

/**
 * Parses light specification and returns THREE.Light object
 * @param lightSpec {LightSpec}
 * @param objectLoader {THREE.ObjectLoader}
 * @returns {THREE.Light}
 */
Lights.setupLight = function(lightSpec, objectLoader) {
  objectLoader = objectLoader || new THREE.ObjectLoader(THREE.DefaultLoadingManager);
  const obj = objectLoader.parseObject(lightSpec);
  if (obj instanceof THREE.Light) {
    return obj;
  } else {
    throw 'Invalid light spec';
  }
};

/**
 * Parses light specification and returns THREE.Light object
 * @param lightSpecs {LightSpec[]}
 * @param objectLoader {THREE.ObjectLoader}
 * @returns {THREE.Light[]}
 */
Lights.setupLights = function(lightSpecs, objectLoader) {
  objectLoader = objectLoader || new THREE.ObjectLoader(THREE.DefaultLoadingManager);
  return lightSpecs.map(x => Lights.setupLight(x, objectLoader));
};

Lights.getDefaultHemisphereLight = function(usePhysicalLights, otherLightsOn) {
  // There is actually three modes:
  //   usePhysicallyCorrectLights off
  //   usePhysicallyCorrectLights without other lights enabled  (other lights not enabled = hemisphere lights high)
  //   usePhysicallyCorrectLights with    other lights enabled  (other lights enabled = hemisphere lights low)
  let ambientIntensity = usePhysicalLights ? (otherLightsOn? 0.5 : 2.0) : 1.0;
  if (THREE.REVISION < 80) {
    ambientIntensity = 1.0;
  }
  return new THREE.HemisphereLight(0xffffff, 0x202020, ambientIntensity);
};


Lights.addSimple2LightSetup = function (scene, position, doShadowMap) {
  position = position || new THREE.Vector3(-100, 100, 100);
  const ambient = new THREE.AmbientLight(0x050505);

  const light0 = new THREE.PointLight(0xdadacd, 0.85);
  const p0 = new THREE.Vector3();
  p0.copy(position);
  light0.position.copy(p0);
  const light1 = new THREE.PointLight(0x030309, 0.03);
  const p1 = new THREE.Vector3();
  p1.copy(position);
  p1.negate();
  light1.position.copy(p1);

  if (doShadowMap) {
    const light = Lights.createSpotLightShadowMapped(1000);
    light.position.copy(light0.position);
    // light.onlyShadow = true;  // Removed https://github.com/mrdoob/three.js/issues/7825
    scene.add(light);
    //var helper = new THREE.CameraHelper( light.shadow.camera );
    //scene.add( helper );
  }

  scene.add(ambient);
  scene.add(light0);
  scene.add(light1);
  return { ambient: ambient, directional: [light0, light1] };
};

Lights.createSpotLightShadowMapped = function (lightBoxSize) {
  const light = new THREE.SpotLight(0xffffff, 1, 0, Math.PI, 1);
  light.target.position.set(0, 0, 0);

  light.castShadow = true;

  light.shadow.camera.near = 1;
  light.shadow.camera.far = lightBoxSize;
  light.shadow.camera.right = lightBoxSize;
  light.shadow.camera.left = -lightBoxSize;
  light.shadow.camera.top = lightBoxSize;
  light.shadow.camera.bottom = -lightBoxSize;
  light.shadow.camera.fov = 50;

  light.shadow.bias = 0.0001;
  //light.shadowDarkness = 0.5; // Removed https://github.com/mrdoob/three.js/issues/8238

  light.shadow.mapSize.width = 2048;
  light.shadow.mapSize.height = 2048;

  //light.shadowCameraVisible = true; // Removed

  return light;
};


module.exports = Lights;
