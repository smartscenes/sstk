const Constants = require('Constants');
const AssetManager = require('assets/AssetManager');
const Lights = require('gfx/Lights');
const Object3DUtil = require('geo/Object3DUtil');
const CameraControls = require('controls/CameraControls');
const Renderer = require('gfx/Renderer');

class SingleModelCanvas {
  constructor(params) {
    this.container = null;
    this.stats = null;
    this.controls = null;
    this.camera = null;
    this.scene = null;
    this.renderer = null;
    this.mouseX = 0;
    this.mouseY = 0;
    this.loaded = [];
    this.assetManager = params.assetManager;
    this.controlTypeIndex = 0;
    this.controlType = Constants.ControlTypes[this.controlTypeIndex];
    this.onModelLoadCallback = params.onModelLoadCallback;
    this.loadingIconUrl = (params.loadingIconUrl !== undefined) ? params.loadingIconUrl : Constants.defaultLoadingIconUrl;
    this.dynamicAssets = [];
    this.init(params.container, params);
  }

  init(container, options) {
    if (!this.assetManager) {
      this.assetManager = new AssetManager();
    }
    $(container).addClass('grayRadialBackground');
    this.container = container;

    if (this.loadingIconUrl) {
      this.loadingIcon = $('<img/>')
        .attr('src', this.loadingIconUrl);
      this.loadingIcon.hide();
      $(this.container).append(this.loadingIcon);
    }

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera = new THREE.PerspectiveCamera(45, width / height, 1, 2000);
    this.camera.position.z = 100;

    this.controls = new CameraControls({
      camera: this.camera,
      container: this.container,
      autoRotateCheckbox: $('#autoRotate'),
      renderCallback: this.render.bind(this)
    });

    this.scene = new THREE.Scene();
    this.scene.add(this.camera);

    this.scene.add(Lights.getDefaultHemisphereLight(options.usePhysicalLights));
    this.renderer = new Renderer({
      container: this.container,
      camera: this.camera,
      useAmbientOcclusion: options.useAmbientOcclusion,
      ambientOcclusionType: options.ambientOcclusionType,
      useEDLShader: options.useEDLShader,
      useShadows: options.useShadows,
      usePhysicalLights: options.usePhysicalLights,
      //useOutlineShader: true,
      //outlineHighlightedOnly: true
    });

    this.debugNode = new THREE.Object3D('debugNode');
    this.scene.add(this.debugNode);

    window.addEventListener('resize', this.onWindowResize.bind(this), false);
  }

  loadModel(source, id) {
    const sourceType = this.assetManager.getSourceDataType(source);
    if (sourceType === 'model') {
      const modelInfo = this.assetManager.getLoadModelInfo(source, id);
      this.clearAndLoadModel(modelInfo);
    } else if (source === 'textures') {
      const material = this.assetManager.getTexturedMaterial(source, id);
      for (let i = 0; i < this.loaded.length; i++) {
        this.loaded[i].setMaterial(material);
      }
    }
  }

  clear() {
    for (let prev = 0; prev < this.loaded.length; prev++) {
      this.scene.remove(this.loaded[prev].object3D);
    }
    this.scene.remove(this.debugNode);
    this.debugNode = new THREE.Object3D('debugNode');
    this.scene.add(this.debugNode);
    this.loaded = [];
  }

  __positionLoadingIcon() {
    if (this.loadingIcon && this.container) {
      this.loadingIcon.position({
        my: 'center',
        at: 'center',
        of: this.container
      });
    }
  }

  showLoadingIcon(isLoading) {
    this.isLoading = isLoading;
    if (this.loadingIcon) {
      this.__positionLoadingIcon();
      if (this.isLoading) {
        this.loadingIcon.show();
        this.__positionLoadingIcon();
      } else {
        this.loadingIcon.hide();
      }
    }
  }

  clearAndLoadModel(modelinfo) {
    this.clear();
    this.showLoadingIcon(true);
    this.start = new Date().getTime();
    this.assetManager.getModelInstanceFromLoadModelInfo(modelinfo, this.onModelLoad.bind(this));
  }

  onModelLoad(modelInstance) {
    this.showLoadingIcon(false);
    const end = new Date().getTime();
    const time = end - this.start;
    console.log('Load time for model: ' + time);
    this.resetCamera(modelInstance.model.info.options);
    this.controls.saveCameraState(true);
    Object3DUtil.centerAndRescaleObject3DToWorld(modelInstance.object3D);
    this.scene.add(modelInstance.object3D);
    this.loaded.push(modelInstance);
    if (this.onModelLoadCallback) {
      this.onModelLoadCallback(modelInstance);
    }
  }

  resetCamera(options) {
    this.camera.up.copy(Constants.worldUp);
    this.camera.position.copy(Constants.defaultCamera.position);
  }

  onWindowResize() {
    if (!this.renderer || !this.camera) return;

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);

    this.controls.handleResize();
    this.showLoadingIcon(this.isLoading);

    this.render();
  }

  toggleControlType() {
    // Changes camera controls
    this.controlTypeIndex = (this.controlTypeIndex + 1) % Constants.ControlTypes.length;
    this.controlType = Constants.ControlTypes[this.controlTypeIndex];
    this.controls.setControlType(this.controlType);
  }

  redisplay() {
    requestAnimationFrame(this.redisplay.bind(this));
    this.dynamicAssets.forEach(function (x) {
      x.update();
    });
    this.controls.update();
    this.render();
  }

  render() {
    if (!this.renderer) return;
    this.renderer.render(this.scene, this.camera);
  }
}

// Exports
module.exports = SingleModelCanvas;