const Constants = require('Constants');
const Camera = require('gfx/Camera');
const CameraControls = require('controls/CameraControls');
const Colors = require('util/Colors');
const Lights = require('gfx/Lights');
const Materials = require('materials/Materials');
const _ = require('util/util');

class SceneSetupHelper {
  static createCameraControls(renderer, options) {
    const cameraConfig = _.defaults(Object.create(null), options.camera || {}, {
      type: 'perspective',
      fov: 50,
      near: 0.1 * Constants.metersToVirtualUnit,
      far: 400 * Constants.metersToVirtualUnit
    });
    const camera = Camera.fromJson(cameraConfig, options.width, options.height);
    const cameraControls = new CameraControls({
      camera: camera,
      container: renderer.canvas,
      controlType: 'none',
      cameraPositionStrategy: 'positionByCentroid' //'positionByCentroid'
    });
    return cameraControls;
  }

  static getEnvMap(renderer, path) {
    console.log('get envmap');
    if (path === 'neutral') {
      return Materials.getNeutralEnvMap(renderer.getPmremGenerator());
    } else {
      return Materials.getEquirectangularEnvMap(path, renderer.getPmremGenerator());
    }
  }
  static createScene(camera, options) {
    const scene = new THREE.Scene();
    scene.add(camera);
    SceneSetupHelper.setupLights(scene, camera, options);
    if (options.backgroundColor != null) {
      scene.background = Colors.toColor(options.backgroundColor);
    }
    return scene;
  }

  /**
   * Helper function that adds lights to a scene
   * @param scene {THREE.Scene}
   * @param camera {THREE.Camera}
   * @param options
   * @param [options.lights] {gfx.LightSpec[]} Exact lights to add to the scene
   * @param [options.useDirectionalLights] {boolean} Whether directional light should be added
   * @param [options.useAmbientLightOnly] {boolean} Whether an ambient light should be used
   * @param [options.usePhysicalLights] {boolean} Used for default case of dding hemisphere lights
   *  (whether we should use physically based lights)
   * @param [options.useLights] {boolean} Used for default case of dding hemisphere lights
   *  (whether there will be other lights that are on)
   */
  static setupLights(scene, camera, options) {
    // console.log('got options', options)
    if (options.useDirectionalLights) {
      Lights.addSimple2LightSetup(camera, new THREE.Vector3(0, 0, 0), true);
    } else if (options.lights) {
      const lights = STK.gfx.Lights.setupLights(options.lights);
      for (let i = 0; i < lights.length; i++) {
        scene.add(lights[i]);
      }
    } else if (options.useAmbientLightOnly) {
      scene.add(new THREE.AmbientLight());
    } else {
      const light = Lights.getDefaultHemisphereLight(options.usePhysicalLights, options.useLights);
      scene.add(light);
    }
  }

}

module.exports = SceneSetupHelper;