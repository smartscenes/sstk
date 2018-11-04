'use strict';

define(['lib/Constants','assets/AssetManager','assets/AssetGroups','search/SearchController', 'math/RNG',
  'controls/CameraControls','geo/Object3DUtil', 'gfx/Lights', 'util/util'],
function (Constants, AssetManager, AssetGroups, SearchController, RNG, CameraControls, Object3DUtil, Lights, _) {
  function ModelScaler2(container) {
    Constants.worldUp = new THREE.Vector3(0,0,1);
    // Set world front to -y so all models are aligned to that and our camera faces it
    Constants.worldFront = new THREE.Vector3(0,-1,0);

    this.submitSizeUrl = Constants.baseUrl + '/submitSize';
    this.container = null;
    this.camera = null;
    this.scene = null;
    this.renderer = null;
    this.mouseX = 0;
    this.mouseY = 0;

    this.assetManager = null;
    this.counterBox = null;

    // The ground plane and wall
    this.rootGround = null;
    this.wallModel = null;

    // The model to resize
    this.targetModelInstance = null;
    this.targetObjectCenterPoint = new THREE.Vector3(0, 1000, 0);

    this.defaultCameraPosition = new THREE.Vector3(0, -1000, 170);
    this.defaultCameraTarget = new THREE.Object3D();
    this.defaultCameraTarget.position.set(0, 0, 170);
    this.defaultCameraNear = 0.1;
    this.defaultCameraFar = 10000;
    this.defaultCameraFOV = 60;
    this.defaultCameraScreenWidth = 400;

    this.sizeBy = 'diagonal';
    this.sizeSlider = null;

    // Tag for solr records
    this.methodTag = 'DEBUG';

    AssetGroups.setDefaultFormat('utf8v2');
    this.init(container);
  }

  // Loads information needed to display reference objects (i.e. which models to use?)
  // Does not load actual models themselves
  ModelScaler2.prototype.loadRefObjectInfo = function () {
    // Dims are used to size reference objects if this.sizeRefModels is true
    this.refObjects = {
      'ring': { dim: [0.7, 1.82, 2], source: 'archive3d', id: 'f353432d' },
      //"pen": { dim: [ 1, 2, 14.2 ], source: "archive3d", id: "cff4e585" },
      'sodacan': { dim: [6.4, 6.4, 12.2], source: 'wss', id: '3a7d8f866de1890bab97e834e9ba876c' },
      //"cat": { dim: [ 12, 46, 25 ], source: "archive3d", id: "f7de164c" },
      //"keyboard" : {dim: [45.8, 16.3, 2.5], source: "wss", id: "56794ac8b1257d0799fcd1563ba74ccd" },
      'chair': { dim: [63.5, 67.3, 110], source: 'wss', id: '94e289c89059106bd8f74b0004a598cd' },
      'desk': { dim: [137, 66, 74], source: 'wss', id: '5ce562e0632b7e81d8e3889d90601dd1' },
      'computer': { dim: [60.8, 53.2, 35.7], source: 'archive3d', id: 'e288a2fb' },
      'man': { dim: [45.7, 29.8, 175.3], source: 'archive3d', id: '9c5c1480' }//,
      //"bicycle": { dim: [ 61, 168, 110 ], source: "archive3d", id: "a696ebd4" },
      //"car": { dim: [ 169.5, 467.5, 134 ], source: "archive3d", id: "85a317ef" } //c51d9857" },
      //"house": { dim: [ 183.7, 609.9, 353.2 ], source: "archive3d", id: "fb5044a4" }
    };

    for (var prop in this.refObjects) {
      if (this.refObjects.hasOwnProperty(prop)) {
        var refModel = this.refObjects[prop];
        refModel.size = Object3DUtil.convertBbDimsToSize(refModel.dim, 'height');
      }
    }

    this.refObjectKeys = Object.keys(this.refObjects);
    this.refObjectKeys = this.refObjectKeys.filter(function (x) {return (x !== 'man');});

    this.refObjectKeys.sort(_.dynamicCompareMap(this.refObjects, 'size'));

    console.log(this.refObjectKeys);
    // Reference model to show next to the target model
    this.refModel = {
      small: { name: 'sodacan', modelInst: null, center: new THREE.Vector3(-200, 0, 0) },  // 2m to the left
      large: { name: 'chair', modelInst: null, center: new THREE.Vector3(200, 0, 0) },  // 2m to the left
      man: { name: 'man', modelInst: null, center: new THREE.Vector3(300, 0, 0) }
    };
  };

  ModelScaler2.prototype.init = function (container) {

    this.assetManager = new AssetManager({
      autoAlignModels: true
    });

    this.searchController = new SearchController();
    this.assetManager.setSearchController(this.searchController);

    this.targetUp = Constants.worldUp;
    this.targetFront = Constants.worldFront;
    this.defaultModelUp = Constants.defaultModelUp;

    this.loadRefObjectInfo();

    this.container = container;
    var width = this.container.clientWidth;
    var height = this.container.clientHeight;

    //this.camera = new THREE.PerspectiveCamera( this.defaultCameraFOV, width/height, this.defaultCameraNear, this.defaultCameraFar);
    this.camera = new THREE.OrthographicCamera(
        width / -2, width / 2,
        height / 2, height / -2,
        this.defaultCameraNear, this.defaultCameraFar);
    //        this.camera = new THREE.CombinedCamera(
    //            width / -2, width / 2, 45,
    //            this.defaultCameraNear, this.defaultCameraFar,
    //            this.defaultCameraNear, this.defaultCameraFar);
    //        this.camera.toOrthographic();
    this.resetCamera();

    this.scene = new THREE.Scene();
    this.scene.add(this.camera);

    Lights.addSimple2LightSetup(this.scene, new THREE.Vector3(-2000,-1500,1000), false);

    // RENDERER
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(width, height);
    this.container.appendChild(this.renderer.domElement);

    window.addEventListener('resize', this.onWindowResize.bind(this), false);
    $(document).keydown(this.arrowKeyHandler.bind(this));
    this.container.addEventListener('mousewheel', this.mouseWheelHandler.bind(this), false);
    addDragHandler(container, this.mouseDragHandler.bind(this));

    // Load reference models
    this.loadReferenceModels(this.refModel);

    // Load ground
    this.rootGround = Object3DUtil.makeGrid(10000,10000,2,1, 0xd0a0a0);
    this.rootGround.translateZ(-2);
    //this.rootGround.receiveShadow = true;
    this.scene.add(this.rootGround);

    this.wallModel = Object3DUtil.makeGrid(10000,10000,2,1, 0xa0a0d0);
    this.wallModel.translateZ(-1500);
    var wallUp = new THREE.Vector3(0,-1,0);
    var wallFront = new THREE.Vector3(0,0,1);
    Object3DUtil.alignToUpFrontAxes(this.wallModel, wallUp, wallFront, Constants.defaultModelUp, Constants.defaultModelFront);
    //this.wallModel.receiveShadow = true;
    this.scene.add(this.wallModel);

    // Hook up submit button and enter key
    this.submitButton = $('#buttonDone');
    if (this.submitButton) {
      this.submitButton.click(function () {
        this.submitSize(this.targetModelInstance);
      }.bind(this));
    }
    $(document).keydown(function (e) { if (e.which === 13) $('#buttonDone').click(); });

    var mId = (window.globals) ? window.globals.modelId : 'f0b4f696e91f59af18b14db3b83de9ff'; // Default Cat
    this.loadModel(null, mId);

    this.createSizeSlider();

    var totalModels = (window.globals) ? window.globals.totalModels : '0';
    var modelNum = (window.globals) ? window.globals.modelNum : '0';
    this.counterBox = $('#counterBox');
    if (this.counterBox) this.counterBox.text(modelNum + '/' + totalModels);

    this.instructionsBox = $('#instructionsBox');
    this.instructionsBox.html('Drag to size, arrow keys to rotate<BR>DONE or ENTER to move on.');
  };

  // Figures out what the bracketing reference objects should be and loads them
  ModelScaler2.prototype.updateBracketingRefModels = function () {
    if (this.targetModelInstance) {
      var size = this.targetModelInstance.getBBoxDims().z; // Get current height
      var refs = this.findBracketingRefModels(size);

      if (refs['min'] !== this.refModel['small'].name || refs['max'] !== this.refModel['large'].name) {
        this.refModel['small'].name = refs['min'];
        this.refModel['large'].name = refs['max'];
        this.loadReferenceModels(this.refModel);
      }
    }
  };

  ModelScaler2.prototype.findBracketingRefModels = function (rangeMin, rangeMax) {
    if (rangeMax === undefined) rangeMax = rangeMin;

    var refKeySmall, refKeyLarge;
    for (var i = 0; i < this.refObjectKeys.length; i++) {
      var key = this.refObjectKeys[i];
      var refObj = this.refObjects[key];
      if (refObj.size <= rangeMin) {
        refKeySmall = key;
      } else if (refObj.size > rangeMax) {
        refKeyLarge = key;
        break;
      }
    }
    return { min: refKeySmall, max: refKeyLarge };
  };

  // Function to respond to size changes
  ModelScaler2.prototype.rescaleToSize = function (size) {
    if (this.targetModelInstance) {
      var bbBoxRefPoint = new THREE.Vector3(0.5, 0.5, 0);
      this.targetModelInstance.setToPhysicalSize(this.sizeBy, size);
      Object3DUtil.placeObject3D(this.targetModelInstance.object3D, this.targetObjectCenterPoint, bbBoxRefPoint);
    }
  };

  ModelScaler2.prototype.loadModel = function (source, id) {
    this.clear();
    this.start = new Date().getTime();
    this.assetManager.getModelInstance(source, id, this.onTargetModelLoad.bind(this));
  };

  ModelScaler2.prototype.clear = function () {
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
  ModelScaler2.prototype.loadReferenceModel = function (refModelEntry, deferredObj) {
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

      // Align model's semantic up & front to world up and front
      if (refObjInfo.up && refObjInfo.front) {
        Object3DUtil.alignToUpFrontAxes(modelInstance.object3D, refObjInfo.up, refObjInfo.front, this.targetUp, this.targetFront);
      }

      // Scale so physical size (e.g. height) of modelInstance equal to reported refModel physical size (e.g. height)
      var refSize = Object3DUtil.convertBbDimsToSize(refObjInfo.dim, 'height');
      modelInstance.setToPhysicalSize('height', refSize);

      refModelEntry.modelInst = modelInstance;
      refObjInfo.modelInst = modelInstance;

      this.scene.add(modelInstance.object3D);
      Object3DUtil.placeObject3D(modelInstance.object3D, refModelCenter, bbBoxRefPoint);

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
      if (refObjInfo.isLoading) {} else {
        refObjInfo.isLoading = true;
        this.assetManager.getModelInstance(refObjInfo.source, refObjInfo.id, onRefModelLoaded);
      }
    }
  };

  ModelScaler2.prototype.loadReferenceModels = function (refModelsMap) {
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
        //this.loadReferenceModel(refModelEntry, null);
      }
    }

    // Do deferred actions
    $.when.apply($, deferred).done(
            function () {
              // Wait for all models to be loaded and reposition them if needed
              this.repositionRefModelsAndCamera(true);
            }.bind(this)
        );
  };

  // Call onModelLoad and when changing scaleTo
  ModelScaler2.prototype.scaleAndPositionTargetModel = function (doRescale) {
    var modelInstance = this.targetModelInstance;
    var centerPoint = this.targetObjectCenterPoint;
    var bbBoxRefPoint = new THREE.Vector3(0.5, 0.5, 0);

    // Adjust target model to be same size as ref Model
    if (doRescale) {
      var refSize = Object3DUtil.convertBbDimsToSize(this.refObjects.man.dim, 'height');
      var r = RNG.global.random() * 2 + 0.1;
      modelInstance.setToPhysicalSize('diagonal', refSize * r);
    }

    Object3DUtil.placeObject3D(modelInstance.object3D, centerPoint, bbBoxRefPoint);
    var size = modelInstance.getPhysicalSize(this.sizeBy);

    if (this.sizeSlider) {
      this.sizeSlider.slider('value', size);
    }

    this.updateBracketingRefModels();

    this.repositionRefModelsAndCamera();
  };

  ModelScaler2.prototype.repositionRefModelsAndCamera = function (repositionRefModels) {
    if (repositionRefModels) {
      this.repositionRefModels();
    }
    if (this.targetModelInstance) {
      this.repositionCamera();
    }
  };

  // Repositions the bracketing reference models as appropriate
  ModelScaler2.prototype.repositionRefModels = function () {
    var bbBoxRefPoint = new THREE.Vector3(0.5, 0.5, 0);
    var targetWidth = (this.targetModelInstance) ? this.targetModelInstance.getBBoxDims().x : null;
    if (this.refModel.small.modelInst) {
      var smallWidth = this.refModel.small.modelInst.getBBoxDims().x;
      if (targetWidth != null) {
        var epsilon = targetWidth * 0.05;
        this.refModel.small.center.x = -(targetWidth / 2 + smallWidth / 2 + epsilon);
      }
      Object3DUtil.placeObject3D(this.refModel.small.modelInst.object3D, this.refModel.small.center, bbBoxRefPoint);
    }
    if (this.refModel.large.modelInst) {
      var largeWidth = this.refModel.large.modelInst.getBBoxDims().x;
      if (targetWidth != null) {
        var epsilon = targetWidth * 0.05;
        this.refModel.large.center.x = (targetWidth / 2 + largeWidth / 2 + epsilon);
      }
      Object3DUtil.placeObject3D(this.refModel.large.modelInst.object3D, this.refModel.large.center, bbBoxRefPoint);
    }
  };

  ModelScaler2.prototype.repositionCameraTargetFixed = function () {

    //        this.defaultCameraScreenWidth = bboxDims.x;

    var bboxHeight = this.targetModelInstance.getBBoxDims().z;
    var bboxWidth = this.targetModelInstance.getBBoxDims().x;

    var width = this.container.clientWidth;
    var height = this.container.clientHeight;

    var camMult = Math.min(width / (bboxWidth), height / (bboxHeight * 0.6));
    this.camera.left = width / -camMult;
    this.camera.right = width / camMult;
    this.camera.top = height / camMult;
    this.camera.bottom = height / -camMult;

    var targetH = (this.camera.top - this.camera.bottom) * 0.4;

    this.camera.position.set(0, -1000, targetH);
    var targetLook = new THREE.Vector3(0, 0, targetH);
    this.camera.lookAt(targetLook);

    this.camera.updateProjectionMatrix();
  };

  ModelScaler2.prototype.repositionCamera = function () {

    var bboxHeight = this.targetModelInstance.getBBoxDims().z;
    //var bboxWidth = this.targetModelInstance.getBBoxDims().x;

    if (bboxHeight < 30) {
      var width = this.container.clientWidth;
      var height = this.container.clientHeight;

      var camMult = width / 80; //Math.min(width / (bboxWidth), height / (bboxHeight * 0.6));
      this.camera.left = width / -camMult;
      this.camera.right = width / camMult;
      this.camera.top = height / camMult;
      this.camera.bottom = height / -camMult;

      var targetH = (this.camera.top - this.camera.bottom) * 0.4;

      this.camera.position.set(0, -1000, targetH);
      var targetLook = new THREE.Vector3(0, 0, targetH);
      this.camera.lookAt(targetLook);

      this.camera.updateProjectionMatrix();
    } else if (bboxHeight > 50) {
      this.resetCamera();
    }

  };

  ModelScaler2.prototype.onTargetModelLoad = function (modelInstance) {
    var end = new Date().getTime();
    var time = end - this.start;
    console.log('Load time for model: ' + time);
    this.targetModelInstance = modelInstance;
    //Object3DUtil.setMaterial(modelInstance.object3D, Object3DUtil.getSimpleFalseColorMaterial(0));
    //Object3DUtil.setTransparency(modelInstance.object3D, 0.1);
    this.scaleAndPositionTargetModel(true);
    this.scene.add(modelInstance.object3D);
    this.nameBox = $('#nameBox');
    this.nameBox.text(this.targetModelInstance.model.info.name);
    this.img = $('#targetImg');
    this.img.attr('src',this.assetManager.getImagePreviewUrl(null, this.targetModelInstance.model.getFullID()));
  };

  ModelScaler2.prototype.resetCamera = function () {
    this.camera.up = new THREE.Vector3(0, 0, 1);
    this.camera.position.copy(this.defaultCameraPosition);
    this.camera.lookAt(this.defaultCameraTarget.position);

    var width = this.container.clientWidth;
    var height = this.container.clientHeight;

    var camMult = width / this.defaultCameraScreenWidth;
    this.camera.left = width / -camMult;
    this.camera.right = width / camMult;
    this.camera.top = height / camMult;
    this.camera.bottom = height / -camMult;

    this.camera.updateProjectionMatrix();
  };

  ModelScaler2.prototype.mouseWheelHandler = function (event) {
    event.preventDefault();
    event.stopPropagation();

    var isUp = (event.wheelDelta > 0);
    this.defaultCameraScreenWidth *= (isUp) ? 0.75  : 1.25;

    this.repositionRefModelsAndCamera();
  };

  ModelScaler2.prototype.mouseDragHandler = function (x, y) {
    event.preventDefault();
    event.stopPropagation();

    var currSize = this.targetModelInstance.getPhysicalSize(this.sizeBy);
    var newSize = currSize + (x - y);
    if (newSize > 0) {
      if (this.sizeSlider) {
        this.sizeSlider.slider('value', newSize);
      }
    }

    this.repositionRefModelsAndCamera();
  };

  ModelScaler2.prototype.arrowKeyHandler = function (event) {
    switch (event.which) {
      case 37: // left
        this.targetModelInstance.rotate(new THREE.Vector3(0,0,-Math.PI / 4));
        this.repositionRefModelsAndCamera();
        break;
      case 38: // up
        this.targetModelInstance.rotate(new THREE.Vector3(-Math.PI / 4,0,0));
        this.scaleAndPositionTargetModel(false);
        break;
      case 39: // right
        this.targetModelInstance.rotate(new THREE.Vector3(0,0,+Math.PI / 4));
        this.repositionRefModelsAndCamera();
        break;
      case 40: // down
        this.targetModelInstance.rotate(new THREE.Vector3(+Math.PI / 4,0,0));
        this.scaleAndPositionTargetModel(false);
        break;
      default:
        break;
    }
  };

  ModelScaler2.prototype.onWindowResize = function () {
    if (!this.renderer || !this.camera) return;

    var width = this.container.clientWidth;
    var height = this.container.clientHeight;

    if (this.targetModelInstance) this.repositionCamera();
    else this.resetCamera();

    this.renderer.setSize(width, height);

    if (this.controls) this.controls.handleResize();

    this.render();
  };

  ModelScaler2.prototype.redisplay = function () {
    requestAnimationFrame(this.redisplay.bind(this));
    if (this.controls) this.controls.update();
    this.render();
  };

  ModelScaler2.prototype.render = function () {
    if (!this.renderer) return;
    this.renderer.render(this.scene, this.camera);
  };

  ModelScaler2.prototype.submitSize = function (modelInst) {
    if (!modelInst) modelInst = this.targetModelInstance;
    if (!modelInst) return;
    // Resize everything to meters for backend storage
    var modelId = modelInst.model.getFullID();
    var smallId = (this.refModel.small.modelInst) ? this.refModel.small.modelInst.model.getFullID() : '';
    var largeId = (this.refModel.large.modelInst) ? this.refModel.large.modelInst.model.getFullID() : '';
    var params = {
      modelId: modelId,
      sizeBy: this.sizeBy,
      unit: modelInst.getVirtualUnit() * Constants.virtualUnitToMeters,
      sizeTo: modelInst.getPhysicalSize(this.sizeBy) * Constants.virtualUnitToMeters,
      pickedRefId: smallId + '-' + largeId,
      method: this.methodTag,
      userId: (window.globals) ? window.globals.userId : 'unknown',
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
                // Also refresh to next model
                var href = window.location.href;
                window.location.href = href;
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

  ModelScaler2.prototype.createSizeSlider = function () {
    var sliderFunc = function (event, ui) {
      this.rescaleToSize(ui.value);
      //$( "#amount" ).val( ui.value );
      this.updateBracketingRefModels();
      this.repositionRefModelsAndCamera();
    }.bind(this);

    this.sizeSlider = $('#slider');
    this.sizeSlider.slider({
      orientation: 'horizontal',
      range: 'min',
      min: 1,
      max: 1000,
      value: 100,
      slide: sliderFunc,
      change: sliderFunc
    });
  };

  function addListeners(dom, listeners) {
    // TODO: handle event capture, object binding.
    for (var key in listeners) {
      if (listeners.hasOwnProperty(key)) {
        dom.addEventListener(key, listeners[key]);
      }
    }
  }

  function removeListeners(dom, listeners) {
    // TODO: handle event capture, object binding.
    for (var key in listeners) {
      if (listeners.hasOwnProperty(key)) {
        dom.removeEventListener(key, listeners[key]);
      }
    }
  }

  // drag(dx, dy, evt)
  function addDragHandler(dom, drag) {
    var prevX_, prevY_;

    var LISTENERS = {
      mousemove: function(evt) {
        drag(evt.screenX - prevX_, evt.screenY - prevY_, evt);
        prevX_ = evt.screenX;
        prevY_ = evt.screenY;
      },
      mouseup: function() {
        drag(0, 0);
        removeListeners(document, LISTENERS);
      }
    };

    dom.addEventListener('mousedown', function(evt) {
      prevX_ = evt.screenX;
      prevY_ = evt.screenY;
      addListeners(document, LISTENERS);
    });
  }

  // Exports
  return ModelScaler2;

});
