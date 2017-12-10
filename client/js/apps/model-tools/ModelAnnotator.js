'use strict';

define(['Constants','assets/AssetManager','search/SearchController','geo/Object3DUtil','controls/CameraControls'],
    function (Constants, AssetManager, SearchController, Object3DUtil, CameraControls) {
      function ModelAnnotator(container) {
        this.container = null;
        this.stats = null;
        this.controls = null;
        this.camera = null;
        this.scene = null;
        this.renderer = null;
        this.mouseX = 0;
        this.mouseY = 0;
        this.loaded = [];
        //this.ground = null;
        this.assetManager = null;
        this.userId = null;

        this.init(container);
      }

      ModelAnnotator.prototype.init = function (container) {

        this.scene = new THREE.Scene();

        this.assetManager = new AssetManager();

        this.container = container;
        var width = this.container.clientWidth;
        var height = this.container.clientHeight;

        this.camera = new THREE.PerspectiveCamera(45, width / height, 1, 2000);
        this.camera.position.z = 100;

        this.controls = new CameraControls({
            camera: this.camera,
            container: this.container,
            renderCallback: this.render.bind(this) });

        this.scene.add(this.camera);

        this.createLight();
        //this.createGroundAndFog();

        var mId = (window.globals) ? window.globals.modelId : 'f0b4f696e91f59af18b14db3b83de9ff'; // Default Cat
        var modelInfo = this.assetManager.getLoadModelInfo('wss', mId);
        this.clearAndLoadModel(modelInfo);
        this.userId = (window.globals) ? window.globals.userId : 'USER';

        // RENDERER
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(width, height);
        this.renderer.shadowMapEnabled = true;
        this.renderer.shadowMapSoft = true;

        this.container.appendChild(this.renderer.domElement);

        window.addEventListener('resize', this.onWindowResize.bind(this), false);
      };

      ModelAnnotator.prototype.loadModel = function (source, id) {
        var modelInfo = this.assetManager.getLoadModelInfo(source, id);
        this.clearAndLoadModel(modelInfo);
      };

      ModelAnnotator.prototype.clear = function () {
        for (var prev in this.loaded) {
          if (this.loaded.hasOwnProperty(prev)) this.scene.remove(this.loaded[prev].object3D);
        }
        this.loaded.length = 0;
      };

      ModelAnnotator.prototype.clearAndLoadModel = function (modelinfo) {
        this.clear();
        this.start = new Date().getTime();
        this.assetManager.getModelInstanceFromLoadModelInfo(modelinfo, this.onModelLoad.bind(this));
      };

      ModelAnnotator.prototype.onModelLoad = function (modelInstance) {
        var end = new Date().getTime();
        var time = end - this.start;
        console.log('Load time for model ' + modelInstance.model.getFullID() + ': ' + time);
        this.resetCamera();
        Object3DUtil.centerAndRescaleObject3DToWorld(modelInstance.object3D);
        //this.ground.position.z = modelInstance.getBBox().min.z;
        //Object3DUtil.setCastShadow(modelInstance.object3D);
        this.scene.add(modelInstance.object3D);
        this.loaded.push(modelInstance);
        // TODO: These are actually part of the MultiLineTextForm
        $('#modelId').val(modelInstance.model.getFullID());
        $('#userId').val(this.userId);
      };

      ModelAnnotator.prototype.resetCamera = function () {
        this.camera.up = new THREE.Vector3(0, 0, 1);
        this.camera.position.x = 50;
        this.camera.position.y = -100;
        this.camera.position.z = 20;
      };

      ModelAnnotator.prototype.createLight = function () {
        var ambient = new THREE.AmbientLight(0x444444);
        this.scene.add(ambient);

        var light = new THREE.DirectionalLight(0xffeedd);
        light.position.set(-50, -50, 50);
        light.target.position.set(0, 0, 0);

        this.scene.add(light);
      };

      ModelAnnotator.prototype.onWindowResize = function () {
        if (!this.renderer || !this.camera) return;

        var width = this.container.clientWidth;
        var height = this.container.clientHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);

        this.controls.handleResize();

        this.render();
      };

      ModelAnnotator.prototype.redisplay = function () {
        requestAnimationFrame(this.redisplay.bind(this));
        this.controls.update();
        if (this.loaded[0] && $('#autoRotate').is(':checked')) {
          this.loaded[0].rotate(new THREE.Vector3(0,0,Constants.autoRotateSpeed));
        }
        this.render();
      };

      ModelAnnotator.prototype.render = function () {
        if (!this.renderer) return;
        this.renderer.render(this.scene, this.camera);
      };

      // Exports
      return ModelAnnotator;

    });
