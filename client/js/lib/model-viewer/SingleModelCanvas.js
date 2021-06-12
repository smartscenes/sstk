'use strict';

define(['Constants','assets/AssetManager','gfx/Lights', 'geo/Object3DUtil','controls/CameraControls','gfx/Renderer'],
  function (Constants, AssetManager, Lights, Object3DUtil, CameraControls, Renderer) {
    function SingleModelCanvas(params) {
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

      this.init(params.container);
    }

    SingleModelCanvas.prototype.init = function (container) {

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

      var width = this.container.clientWidth;
      var height = this.container.clientHeight;

      this.camera = new THREE.PerspectiveCamera(45, width / height, 1, 2000);
      this.camera.position.z = 100;

      this.controls = new CameraControls({
        camera: this.camera,
        container: this.container,
        autoRotateCheckbox: $('#autoRotate'),
        renderCallback: this.render.bind(this) });

      this.scene = new THREE.Scene();
      this.scene.add(this.camera);

      this.scene.add(Lights.getDefaultHemisphereLight(true));
      this.renderer = new Renderer({
        container: this.container,
        camera: this.camera,
        useAmbientOcclusion: this.useAmbientOcclusion,
        useShadows: this.useShadows,
        usePhysicalLights: this.usePhysicalLights
      });

      this.debugNode = new THREE.Object3D('debugNode');
      this.scene.add(this.debugNode);

      window.addEventListener('resize', this.onWindowResize.bind(this), false);
    };

    SingleModelCanvas.prototype.loadModel = function (source, id) {
      var sourceType = this.assetManager.getSourceDataType(source);
      if (sourceType === 'model') {
        var modelInfo = this.assetManager.getLoadModelInfo(source, id);
        this.clearAndLoadModel(modelInfo);
      } else if (source === 'textures') {
        var material = this.assetManager.getTexturedMaterial(source, id);
        for (var i = 0; i < this.loaded.length; i++) {
          this.loaded[i].setMaterial(material);
        }
      }
    };

    SingleModelCanvas.prototype.clear = function () {
      for (var prev = 0; prev < this.loaded.length; prev++) {
        this.scene.remove(this.loaded[prev].object3D);
      }
      this.scene.remove(this.debugNode);
      this.debugNode = new THREE.Object3D('debugNode');
      this.scene.add(this.debugNode);
      this.loaded = [];
    };

    SingleModelCanvas.prototype.__positionLoadingIcon = function () {
      if (this.loadingIcon && this.container) {
        this.loadingIcon.position({
          my: 'center',
          at: 'center',
          of: this.container
        });
      }
    };

    SingleModelCanvas.prototype.showLoadingIcon = function (isLoading) {
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
    };

    SingleModelCanvas.prototype.clearAndLoadModel = function (modelinfo) {
      this.clear();
      this.showLoadingIcon(true);
      this.start = new Date().getTime();
      this.assetManager.getModelInstanceFromLoadModelInfo(modelinfo, this.onModelLoad.bind(this));
    };

    SingleModelCanvas.prototype.onModelLoad = function (modelInstance) {
      this.showLoadingIcon(false);
      var end = new Date().getTime();
      var time = end - this.start;
      console.log('Load time for model: ' + time);
      this.resetCamera(modelInstance.model.info.options);
      this.controls.saveCameraState(true);
      Object3DUtil.centerAndRescaleObject3DToWorld(modelInstance.object3D);
      this.scene.add(modelInstance.object3D);
      this.loaded.push(modelInstance);
      if (this.onModelLoadCallback) {
        this.onModelLoadCallback(modelInstance);
      }
    };

    SingleModelCanvas.prototype.resetCamera = function (options) {
      this.camera.up.copy(Constants.worldUp);
      this.camera.position.copy(Constants.defaultCamera.position);
    };

    SingleModelCanvas.prototype.onWindowResize = function () {
      if (!this.renderer || !this.camera) return;

      var width = this.container.clientWidth;
      var height = this.container.clientHeight;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();

      this.renderer.setSize(width, height);

      this.controls.handleResize();
      this.showLoadingIcon(this.isLoading);

      this.render();

    };

    SingleModelCanvas.prototype.toggleControlType = function () {
      // Changes camera controls
      this.controlTypeIndex = (this.controlTypeIndex + 1) % Constants.ControlTypes.length;
      this.controlType = Constants.ControlTypes[this.controlTypeIndex];
      this.controls.setControlType(this.controlType);
    };

    SingleModelCanvas.prototype.redisplay = function () {
      requestAnimationFrame(this.redisplay.bind(this));
      this.controls.update();
      this.render();
    };

    SingleModelCanvas.prototype.render = function () {
      if (!this.renderer) return;
      this.renderer.render(this.scene, this.camera);
    };

    // Exports
    return SingleModelCanvas;

  });
