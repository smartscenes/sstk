const RendererFactory = require('gfx/RendererFactory');
const Camera = require('gfx/Camera');
const SceneUtil = require('scene/SceneUtil');

class RenderHelper {
  constructor() {
    this.__offscreenRenderers = {};
    this.__equirectangularCamera = new Camera();
    this.__equirectangularCamera.isEquirectangular = true;
  }

  getOffscreenRenderer(name, opts) {
    if (!this.__offscreenRenderers[name]) {
      this.__offscreenRenderers[name] = RendererFactory.createOffscreenRenderer({
        camera: opts.camera,
        width: opts.width,
        height: opts.height
      });
    }
    return this.__offscreenRenderers[name];
  }

  getEquirectangularRenderer() {
    const height = 100;
    const width = 200;
    const opts = {
      name: 'equirectangular-' + height + 'x' + width,
      height: height,
      width: width
    };
    return this.getOffscreenRenderer(opts.name, opts);
  }

  getArchRoomPixels(sceneState, camera, useEquirectangular) {
    const renderer = this.getEquirectangularRenderer();
    const opts = {
      camera: camera,
      renderer: renderer,
      colorBy: 'roomId'
    };
    const prevUseEquiRect = camera.isEquirectangular;
    camera.isEquirectangular = useEquirectangular;
    // hide objects
    const pixelCounts = SceneUtil.getPixelCounts(sceneState, opts);
    // restore objects
    camera.isEquirectangular = prevUseEquiRect;
    return pixelCounts;
  }
}

module.exports =  RenderHelper;
