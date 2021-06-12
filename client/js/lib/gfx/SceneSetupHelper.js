const Constants = require('Constants');
const Camera = require('gfx/Camera');
const CameraControls = require('controls/CameraControls');
const Colors = require('util/Colors');
const Lights = require('gfx/Lights');

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

  static createScene(camera, options) {
    const scene = new THREE.Scene();
    scene.add(camera);
    if (options.useDirectionalLights) {
      Lights.addSimple2LightSetup(camera, new THREE.Vector3(0, 0, 0), true);
    } else {
      const light = Lights.getDefaultHemisphereLight(options.usePhysicalLights, options.useLights);
      scene.add(light);
    }
    if (options.backgroundColor != null) {
      scene.background = Colors.toColor(options.backgroundColor);
    }
    return scene;
  }
}

module.exports = SceneSetupHelper;