'use strict';

define(['lib/Constants','assets/AssetManager', 'assets/AssetGroups','search/SearchController','geo/Object3DUtil',
        'ui/ScaleLine','controls/CameraControls'],
function (Constants, AssetManager, AssetGroups, SearchController, Object3DUtil, ScaleLine, CameraControls) {
  function ModelScaler(container) {
    Constants.worldUp = new THREE.Vector3(0,0,1);
    // Set world front to -y so all models are aligned to that and our camera faces it
    Constants.worldFront = new THREE.Vector3(0,-1,0);

    this.submitSizeUrl = Constants.baseUrl + '/submitSize';
    this.container = null;
    this.controls = null;
    this.camera = null;
    this.scene = null;
    this.renderer = null;
    this.mouseX = 0;
    this.mouseY = 0;

    this.assetManager = null;
    this.searchController = null;
    this.sizeTextbox = null;
    this.scaleLine = null;

    // The ground plane
    this.groundModel = null;

    // The model to resize
    this.targetModelInstance = null;

    // Reference models to show next to the target model
    this.bracketingRefModels = {
      small: { name: 'car', modelInst: null, center: new THREE.Vector3(-200, 0, 0) },  // 2m to the left
      large: { name: 'man', modelInst: null, center: new THREE.Vector3(200, 0, 0) }   // 2m to the right
    };

    // TODO: Abstract this into some data structure
    this.targetObjectCenterPoint = new THREE.Vector3(0, 0, 0);
    this.defaultCameraPosition = new THREE.Vector3(0, -500, 200);       // 5m back, 2m up
    this.defaultCameraNear = 0.1; // 0.1cm
    this.defaultCameraFar = 2000; // 20m
    this.defaultCameraFOV = 45;

    this.sizeBy = 'height';

    // Does the reference models also need to be sized?
    // Set to false once they are stored in the database...
    this.sizeRefModels = false;

    // Report reference models on preload?
    // Used to do initial reporting of what units the reference objects should be in
    // Also requires this.sizeRefModels be true
    this.preloadAndReportRefSizes = false;

    AssetGroups.setDefaultFormat('utf8v2');
    this.init(container);
  }

  // Loads information needed to display reference objects (i.e. which models to use?)
  // Does not load actual models themselves
  ModelScaler.prototype.loadRefObjectInfo = function () {
    // TODO: Load reference objects from file
    // Dims are used to size reference objects if this.sizeRefModels is true
    this.refObjects = {
      'ring': { dim: [0.7, 1.82, 2], source: 'archive3d', id: 'f353432d' },
      'pen': { dim: [1, 2, 14.2], source: 'archive3d', id: 'cff4e585' },
      'sodacan': { dim: [6.4, 6.4, 12.2], source: 'archive3d', id: '5a0837f9' },
      'hand': { dim: [8.4, 4, 18.9], source: 'archive3d', id: '6ec53bd7' },
      'cat': { dim: [12, 46, 25], source: 'archive3d', id: 'f7de164c' },
      'computer': { dim: [60.8, 53.2, 35.7], source: 'archive3d', id: 'e288a2fb' },
      'man': { dim: [45.7, 29.8, 175.3], source: 'wss', id: '4a6b7b8de43bf3925c8e7963449f8577' },
      'bicycle': { dim: [61, 168, 110], source: 'archive3d', id: 'a696ebd4' },
      'car': { dim: [169.5, 467.5, 134], source: 'archive3d', id: '85a317ef' }, //c51d9857" },
      'house': { dim: [183.7, 609.9, 353.2], source: 'archive3d', id: 'fb5044a4' }
    };
  };

  // Reference model is preloaded
  ModelScaler.prototype.onRefModelPreload = function (deferredObj, refObjInfo, loadedModelInst) {
    if (this.sizeRefModels) {
      // Scale so physical size (e.g. height) of modelInstance equal
      // to reported refModel physical size (e.g. height)
      var refSize = Object3DUtil.convertBbDimsToSize(refObjInfo.dim, this.sizeBy);
      loadedModelInst.setToPhysicalSize(this.sizeBy, refSize);
      if (this.preloadAndReportRefSizes) {
        // Report sized reference model...
        this.submitSize(loadedModelInst);
      }
    }
    refObjInfo.modelInst = loadedModelInst;
    if (deferredObj) {
      deferredObj.resolve();
    }
  };

  // Preloads reference models
  // Sizes and report reference sizes (if this.sizeRefModels and this.preloadAndReportRefSizes are set)
  ModelScaler.prototype.preloadRefModels = function (callback) {
    var deferred = [];

    for (var name in this.refObjects) {
      if (this.refObjects.hasOwnProperty(name)) {
        var refObjInfo = this.refObjects[name];
        var func = $.Deferred(
                    function (refObjInfo, deferredObj) {
                      this.assetManager.getModelInstance(refObjInfo.source, refObjInfo.id,
                          this.onRefModelPreload.bind(this, deferredObj, refObjInfo)
                      );
                    }.bind(this, refObjInfo)
                ).promise();
        deferred.push(func);
      }
    }

    $.when.apply($, deferred).done(
            function () {
              if (callback) callback();
            }
        );
  };

  function isFiniteNumber(n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
  }

  ModelScaler.prototype.init = function (container) {

    this.assetManager = new AssetManager({
      autoAlignModels: true
    });

    this.searchController = new SearchController({
      searchSucceededCallback: this.searchSucceeded.bind(this),
      getImagePreviewUrlCallback: this.assetManager.getImagePreviewUrl.bind(this.assetManager),
      onClickResultCallback: this.loadModel.bind(this),
      sources: Constants.assetSources.model,
      searchPanel: $('#searchPanel')
    });
    this.assetManager.setSearchController(this.searchController);

    this.loadRefObjectInfo();

    this.container = container;
    var width = this.container.clientWidth;
    var height = this.container.clientHeight;

    this.camera = new THREE.PerspectiveCamera(this.defaultCameraFOV, width / height, this.defaultCameraNear, this.defaultCameraFar);
    this.resetCamera();

    this.controls = new CameraControls({
        camera: this.camera,
        container: this.container,
        autoRotateCheckbox: $('#autoRotate'),
        renderCallback: this.render.bind(this) });

    this.scene = new THREE.Scene();
    this.scene.add(this.camera);

    var ambient = new THREE.AmbientLight(0x998877);
    this.scene.add(ambient);

    var directionalLight = new THREE.DirectionalLight(0xffeedd);
    directionalLight.position.set(100, -100, 100);
    this.scene.add(directionalLight);

    // RENDERER
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(width, height);
    this.container.appendChild(this.renderer.domElement);

    window.addEventListener('resize', this.onWindowResize.bind(this), false);

    // Load reference models
    this.loadReferenceModels(this.bracketingRefModels);

    // Load ground
    this.groundModel = Object3DUtil.makeGrid(10000,10000,100,100);
    this.scene.add(this.groundModel);

    this.sizeByElem = $('#sizeBy');
    if (this.sizeByElem) {
      var sizeByOptions = Object3DUtil.getSizeByOptions();
      for (var i = 0; i < sizeByOptions.length; i++) {
        var s = sizeByOptions[i];
        this.sizeByElem.append('<option value="' + s + '">' + s + '</option>');
      }
      var that = this;
      this.sizeByElem.change(function () {
        that.sizeByElem.find('option:selected').each(function () {
          that.setSizeBy($(this).val());
        });
      });
    }

    this.scaleTo = $('#scaleTo');
    // Populate
    this.scaleTo.append('<option value="NONE">None</option>');
    this.scaleTo.append('<option value="INCHES">Inches</option>');
    this.scaleTo.append('<option value="CM">Centimeters</option>');
    this.scaleTo.append('<option value="M">Meters</option>');
    this.scaleTo.append('<option value="UNIT">Unit</option>');
    this.scaleTo.append('<option value="REF">Reference</option>');
    this.scaleTo.change(function () {
      if (this.targetModelInstance) {
        this.scaleAndPositionTargetModel();
      }
    }.bind(this));
    this.scaleTo.val('UNIT');

    this.submitButton = $('#submitSize');
    if (this.submitButton) {
      this.submitButton.click(function () {
        this.submitSize(this.targetModelInstance);
      }.bind(this));
    }

    this.sizeTextbox = $('#sizeTextbox');
    if (this.sizeTextbox) {
      this.sizeTextbox.change(function () {
        var val = this.sizeTextbox.val();
        if (isFiniteNumber(val)) {
          var f = parseFloat(val);
          this.scaleLine.setSize(f, 'textbox');
          this.rescaleToSize(f);
        } else {
          this.sizeTextbox.val('');
        }
      }.bind(this));
    }

    this.preloadRefModels(this.createScaleLine_.bind(this));
    this.repositionCamera();
  };

  ModelScaler.prototype.createScaleLine_ = function () {
    this.scaleLine = new ScaleLine(
        { container: $('#scaleLine'),
            resizeCallback: this.rescaleToSize.bind(this),
            refObjects: this.refObjects,
            sizeBy: this.sizeBy,
            useRefModelDims: !this.sizeRefModels
        }
    );
  };

  // Function to respond to clicks on ScaleLine and changed numerical value in sizeTextbox
  ModelScaler.prototype.rescaleToSize = function (size) {
    if (this.targetModelInstance) {
      var bbBoxRefPoint = new THREE.Vector3(0.5, 0.5, 0);
      this.targetModelInstance.setToPhysicalSize(this.sizeBy, size);
      Object3DUtil.placeObject3D(this.targetModelInstance.object3D, this.targetObjectCenterPoint, bbBoxRefPoint);
      this.updateBracketingRefModels();
      var newSize = this.targetModelInstance.getPhysicalSize(this.sizeBy);
      this.sizeTextbox.val(newSize);
    }
  };

  // Respond to change in sizeBy list
  ModelScaler.prototype.setSizeBy = function (sizeBy) {
    this.sizeBy = sizeBy;
    this.scaleLine.setSizeBy(sizeBy);
    var targetSize = this.targetModelInstance ? this.targetModelInstance.getPhysicalSize(this.sizeBy) : '';

    if (targetSize) {
      this.scaleLine.setSize(targetSize, null);
    }
    if (this.sizeTextbox) {
      this.sizeTextbox.val(targetSize);
    }
    this.updateBracketingRefModels();
  };

  // Figures out what the bracketing reference objects should be and loads them
  ModelScaler.prototype.updateBracketingRefModels = function () {
    if (this.targetModelInstance) {
      var size = this.targetModelInstance.getPhysicalSize(this.sizeBy);
      var refs = this.scaleLine.findBracketingRefModels(size);
      this.bracketingRefModels['small'].name = refs['min'];
      this.bracketingRefModels['large'].name = refs['max'];
      this.loadReferenceModels(this.bracketingRefModels);
    }
  };

  ModelScaler.prototype.searchSucceeded = function (source, resultList) {
    this.assetManager.cacheModelInfos(source, resultList);
    return { source: source, resultList: resultList };
  };

  ModelScaler.prototype.loadModel = function (source, id) {
    this.clear();
    this.start = new Date().getTime();
    this.assetManager.getModelInstance(source, id, this.onTargetModelLoad.bind(this));
  };

  ModelScaler.prototype.clear = function () {
    if (this.targetModelInstance) {
      this.scene.remove(this.targetModelInstance.object3D);
      this.targetModelInstance = null;
    }
  };


  /**
   * Load reference models - assumes that models has already been removed from scene
   * @param refModelEntry - contains information about which model to load, and where to position it
   * @param deferredObj - jquery deferred parameters (if this is was called as part of jquery wait for deferred objects)
   */
  ModelScaler.prototype.loadReferenceModel = function (refModelEntry, deferredObj) {
    if (!refModelEntry.name) {
      if (deferredObj) {
        // Part of jQuery.deferred chain...
        deferredObj.resolve();
      }
      return;
    }

    var refObjInfo = this.refObjects[refModelEntry.name];

    var refModelCenter = refModelEntry.center;
    var bbBoxRefPoint = new THREE.Vector3(0.5, 0.5, 0);

    var onRefModelLoaded = function (modelInstance) {
      if (this.sizeRefModels) {
        // Scale so physical size (e.g. height) of modelInstance equal to reported refModel physical size (e.g. height)
        var refSize = Object3DUtil.convertBbDimsToSize(refObjInfo.dim, this.sizeBy);
        modelInstance.setToPhysicalSize(this.sizeBy, refSize);
      }
      Object3DUtil.placeObject3D(modelInstance.object3D, refModelCenter, bbBoxRefPoint);
      this.scene.add(modelInstance.object3D);
      refModelEntry.modelInst = modelInstance;
      refObjInfo.modelInst = modelInstance;
      if (deferredObj) {
        // Part of jQuery.deferred chain...
        deferredObj.resolve();
      } else {
        // don't know when both reference models have been loaded... reposition now
        this.repositionRefModelsAndCamera();
      }
    }.bind(this);

    if (refObjInfo.modelInst) {
      onRefModelLoaded(refObjInfo.modelInst);
    } else {
      this.assetManager.getModelInstance(refObjInfo.source, refObjInfo.id, onRefModelLoaded);
    }
  };

  ModelScaler.prototype.loadReferenceModels = function (refModelsMap) {
    // Clear current ref models

    var deferred = [];
    for (var prop in refModelsMap) {
      if (refModelsMap.hasOwnProperty(prop)) {
        // Clear models from scene
        var refModelEntry = refModelsMap[prop];
        if (refModelEntry.modelInst) {
          this.scene.remove(refModelEntry.modelInst.object3D);
          refModelEntry.modelInst = null;
        }
      }
    }

    for (var prop in refModelsMap) {
      if (refModelsMap.hasOwnProperty(prop)) {
        // Push function onto deferred stack
        var refModelEntry = refModelsMap[prop];
        var func = $.Deferred(this.loadReferenceModel.bind(this, refModelEntry)).promise();
        deferred.push(func);
        // this.loadReferenceModel(refModelsMap[prop]);
      }
    }

    // Do deferred actions
    $.when.apply($, deferred).done(
            function () {
              // Wait for all models to be loaded and reposition them if needed
              this.repositionRefModelsAndCamera();
            }.bind(this)
        );
  };

  // Call onModelLoad and when changing scaleTo
  ModelScaler.prototype.scaleAndPositionTargetModel = function () {
    var modelInstance = this.targetModelInstance;
    var centerPoint = this.targetObjectCenterPoint;
    var bbBoxRefPoint = new THREE.Vector3(0.5, 0.5, 0);
    switch (this.scaleTo.val()) {
      case 'NONE':
        modelInstance.setScale(1 / modelInstance.model.getVirtualUnit());
        break;
      case 'INCHES':
        modelInstance.setScale(Constants.metersToVirtualUnit * Constants.modelUnitInches / modelInstance.model.getVirtualUnit());
        break;
      case 'CM':
        modelInstance.setScale(Constants.metersToVirtualUnit * Constants.modelUnitCentimeters / modelInstance.model.getVirtualUnit());
        break;
      case 'M':
        modelInstance.setScale(Constants.metersToVirtualUnit * Constants.modelUnitMeters / modelInstance.model.getVirtualUnit());
        break;
      case 'UNIT':
        modelInstance.setScale(1);
        break;
      case 'REF':
        var refModel = (this.bracketingRefModels['small'].modelInst) ?
            this.bracketingRefModels['small'].modelInst : this.bracketingRefModels['large'].modelInst;
        var refSize = refModel.getPhysicalSize(this.sizeBy);
        modelInstance.setToPhysicalSize(this.sizeBy, refSize);
        break;
      default:
        console.error('Unknown scaleTo option: ' + this.scaleTo.val());
    }
    Object3DUtil.placeObject3D(modelInstance.object3D, centerPoint, bbBoxRefPoint);
    var size = modelInstance.getPhysicalSize(this.sizeBy);
    this.scaleLine.setSize(size, 'scaleTo.' + this.scaleTo);
    if (this.sizeTextbox) {
      this.sizeTextbox.val(size);
    }
    this.updateBracketingRefModels();
  };

  ModelScaler.prototype.repositionRefModelsAndCamera = function () {
    this.repositionRefModels();
    this.repositionCamera();
  };

  // Repositions the bracketing reference models as appropriate
  ModelScaler.prototype.repositionRefModels = function () {
    var epsilon = 50;
    var bbBoxRefPoint = new THREE.Vector3(0.5, 0.5, 0);
    var focusWidth = (this.targetModelInstance) ? this.targetModelInstance.getPhysicalDims().x : null;
    if (this.bracketingRefModels.small.modelInst) {
      var smallWidth = this.bracketingRefModels.small.modelInst.getPhysicalDims().x;
      if (focusWidth != null) {
        this.bracketingRefModels.small.center.x = -(focusWidth / 2 + smallWidth / 2 + epsilon);
      }
      Object3DUtil.placeObject3D(this.bracketingRefModels.small.modelInst.object3D, this.bracketingRefModels.small.center, bbBoxRefPoint);
    }
    if (this.bracketingRefModels.large.modelInst) {
      var largeWidth = this.bracketingRefModels.large.modelInst.getPhysicalDims().x;
      if (focusWidth != null) {
        this.bracketingRefModels.large.center.x = (focusWidth / 2 + largeWidth / 2 + epsilon);
      }
      Object3DUtil.placeObject3D(this.bracketingRefModels.large.modelInst.object3D, this.bracketingRefModels.large.center, bbBoxRefPoint);
    }
  };

  ModelScaler.prototype.repositionCamera = function () {
    this.resetCamera();
    var arr = [];
    if (this.bracketingRefModels.small.modelInst) arr.push(this.bracketingRefModels.small.modelInst.object3D);
    if (this.bracketingRefModels.large.modelInst) arr.push(this.bracketingRefModels.large.modelInst.object3D);
    if (this.targetModelInstance) arr.push(this.targetModelInstance.object3D);
    if (arr.length > 0) this.controls.viewObject3DArray(arr);
  };

  ModelScaler.prototype.onTargetModelLoad = function (modelInstance) {
    var end = new Date().getTime();
    var time = end - this.start;
    console.log('Load time for model: ' + time);
    this.targetModelInstance = modelInstance;
    this.scaleAndPositionTargetModel();
    this.scene.add(modelInstance.object3D);
  };

  ModelScaler.prototype.resetCamera = function () {
    this.camera.up = new THREE.Vector3(0, 0, 1);
    this.camera.position.copy(this.defaultCameraPosition);
  };

  ModelScaler.prototype.onWindowResize = function () {
    if (!this.renderer || !this.camera) return;

    var width = this.container.clientWidth;
    var height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);

    this.controls.handleResize();

    this.render();

    this.searchController.onResize();
  };

  ModelScaler.prototype.redisplay = function () {
    requestAnimationFrame(this.redisplay.bind(this));
    this.controls.update();
    this.render();
  };

  ModelScaler.prototype.render = function () {
    if (!this.renderer) return;
    this.renderer.render(this.scene, this.camera);
  };

  ModelScaler.prototype.submitSize = function (modelInst) {
    if (!modelInst) modelInst = this.targetModelInstance;
    if (!modelInst) return;
    // Resize everything to meters for backend storage
    var modelId = modelInst.model.getFullID();
    var selected = this.scaleLine.getSelected();
    var params = {
      modelId: modelId,
      sizeBy: this.sizeBy,
      unit: modelInst.getVirtualUnit() * Constants.virtualUnitToMeters,
      // TODO: get from scaleline selected sizeTo and selected pickedRefId
      sizeTo: modelInst.getPhysicalSize(this.sizeBy) * Constants.virtualUnitToMeters,
      pickedRefId: selected.pickedRef.id,
      method: selected.method,
      //            userId: null
      updateMain: Constants.submitUpdateMain
    };
    var sizeData = jQuery.param(params);
    var inputs = this.submitButton;
    inputs.prop('disabled', true);
    $.ajax
            ({
              type: 'POST',
              url: this.submitSizeUrl,
              data: sizeData,
              success: function (response, textStatus, jqXHR) {
                console.log('Size successfully submitted for ' + modelId + '!!!');
              },
              error: function (jqXHR, textStatus, errorThrown) {
                console.error('Error submitting size for '  + modelId + '!!!');
              },
              complete: function () {
                // Re-enable inputs
                inputs.prop('disabled', false);
              }
            });

  };

  // Exports
  return ModelScaler;

});
