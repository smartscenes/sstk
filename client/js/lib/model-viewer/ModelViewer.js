'use strict';

define(['Constants','controls/Picker','assets/AssetManager','assets/AssetGroups',
    'search/SolrQuerySuggester', 'model/ModelSchema',
    'search/SearchController','ui/ModelMaterialsPanel', 'ui/ImagesPanel',
    'ui/ColorsPanel','ui/AlignPanel','ui/PartsPanel', 'ui/AnnotationsPanel',
    'controls/CameraControls','geo/Object3DUtil','gfx/Renderer',
    'geo/BBox','exporters/PLYExporter', 'Viewer3D', 'geo/MeshSampling', 'model/ModelInstanceVoxels',
    'gfx/ViewOptimizer',
    'util','three-shaders','jquery-lazy'],
  function (Constants, Picker, AssetManager, AssetGroups,
            SolrQuerySuggester, ModelSchema,
            SearchController, ModelMaterialsPanel, ImagesPanel,
            ColorsPanel, AlignPanel, PartsPanel, AnnotationsPanel,
            CameraControls, Object3DUtil, Renderer,
            BBox, PLYExporter, Viewer3D, MeshSampling, ModelInstanceVoxels, ViewOptimizer, _) {
    ModelViewer.SymmetryPlanes = [null, 'nd']; // 'X', 'Y', 'Z' ];

    /**
     * Viewer for looking at a single 3D model
     * @param params {Object} Configuration
     * @constructor ModelViewer
     * @extends Viewer3D
     * @public
     */
    function ModelViewer(params) {
      params = (params instanceof Element) ? { container: params } : params;
      this.params = params;
      this.urlParams = _.getUrlParams();
      var defaults = {
        useDatGui: true,
        useAmbientOcclusion: false,
        nImagesPerModel: 14,
        useShadows: true,
        useLights: false
      };
      var allParams = _.defaultsDeep(Object.create(null), this.urlParams, params, defaults);

      // Make sure assetgroups are registered....
      var assetGroups = AssetGroups.getAssetGroups();
      this.modelSources = params.sources || _.concat(Constants.assetSources.model, Constants.assetSources.scan);
      this.allowPrevNext = params.allowPrevNext;
      this.__restrictModels = params.restrictModels;
      this.showSearchOptions = (params.showSearchOptions != undefined)? params.showSearchOptions : true;
      this.showSearchSimilar = params.showSearchSimilar;
      this.showSearchSortOption = params.showSearchSortOption || false;

      this._tabs = params.tabs;
      this._tabsElement = $('#tabs');
      this._includeTestModels = params.includeTestModels;
      this._useNewImages = params.useNewImages;
      Viewer3D.call(this, allParams);
      this.scene = null;
      this.mouseX = 0;
      this.mouseY = 0;
      this.loaded = [];
      this.assetManager = null;
      this.modelSearchController = null;
      this.textureSearchController = null;
      this.picker = null;
      this.lightProbe = null;
      this.idCounter = -1;
      this.controlsNode = new THREE.Group();
      this.controlsNode.name = 'controls';
      this.debugNode = new THREE.Group();
      this.debugNode.name = 'debugNode';
      this.bbSymmetryPlaneIndex = 0;
      this.bbSymmetryPlane = null;
      this._modelOpacity = 1.0;
      this.nImagesPerModel = allParams['nImagesPerModel'];
      this.autoLoadVideo = allParams['autoLoadVideo'];
      this.enableLights = allParams['enableLights'];
      this.defaultLightState = allParams['defaultLightState'];
      this.placeLightProbe = allParams['placeLightProbe'];
      this.enableMirrors = allParams['enableMirrors'];
    }

    ModelViewer.prototype = Object.create(Viewer3D.prototype);
    ModelViewer.prototype.constructor = ModelViewer;

    Object.defineProperty(ModelViewer.prototype, 'modelOpacity', {
      get: function () {return this._modelOpacity; },
      set: function (v) {
        this._modelOpacity = v;
        var target = this.getTarget();
        if (target) {
          // Make semi transparent
          var transparency = 1.0 - this._modelOpacity;
          Object3DUtil.setTransparency(target.object3D, transparency);
        }
      }
    });

    ModelViewer.prototype.registerCustomModelAssetGroup = function(assetIdsFile, jsonFile, autoLoad) {
      this.registerCustomAssetGroup(this.modelSearchController, assetIdsFile, jsonFile, autoLoad);
    };

    ModelViewer.prototype.loadLocalModel = function (localFile) {
      this.clearAndLoadModel({
        file: localFile
      });
    };

    ModelViewer.prototype.__getTabIndex = function (name, defaultIndex) {
      var i = this._tabs? this._tabs.indexOf(name) : undefined;
      if (i >= 0) return i;
      else return defaultIndex;
    };

    ModelViewer.prototype.selectAlignTab = function () {
      this._tabsElement.tabs({ active: this.__getTabIndex('align') });
    };

    ModelViewer.prototype.selectPartsTab = function () {
      this._tabsElement.tabs({ active: this.__getTabIndex('parts') });
    };

    ModelViewer.prototype.selectSearchTab = function (source) {
      if (source === 'textures') {
        this._tabsElement.tabs({ active: this.__getTabIndex('textures') });
      } else {
        this._tabsElement.tabs({ active: this.__getTabIndex('models') });
        if (source) {
          this.modelSearchController.selectSource(source);
        }
      }
    };

    // i.e. get full id
    ModelViewer.prototype.getTargetModelId  = function () {
      return (this.loaded.length > 0) ? this.loaded[0].model.info.fullId : null;
    };

    ModelViewer.prototype.getTarget  = function () {
      return (this.loaded.length > 0) ? this.loaded[0] : null;
    };

    Object.defineProperty(ModelViewer.prototype, 'showLocalPanel', {
      get: function () { return $('#customLoadingPanel').is(':visible'); },
      set: function (v) {
        if (v) { $('#customLoadingPanel').show(); }
        else { $('#customLoadingPanel').hide(); }
      }
    });

    Object.defineProperty(ModelViewer.prototype, 'restrictModels', {
      get: function () { return this.__restrictModels; },
      set: function (v) {
        this.__restrictModels = v;
        if (this.modelSearchController) {
          this.modelSearchController.setFilter(Constants.assetTypeModel, v);
          this.modelSearchController.setFilter(Constants.assetTypeScan, v);
        }
      }
    });

    ModelViewer.prototype.init = function () {
      this.setupLoadingIcon();
      this.assetManager = new AssetManager({
        autoAlignModels: true,
        autoLoadVideo: this.autoLoadVideo,
        enableLights: this.urlParams['enableLights'],
        defaultLightState: this.urlParams['defaultLightState'],
        useDynamic: true // set dynamic to be true so our picking will work
      });
      this.assetManager.Subscribe('dynamicAssetLoaded', this, function(d) {
        this._dynamicAssets.push(d);
      }.bind(this));
      this.modelSearchController = new SearchController({
        searchSucceededCallback: this.modelSearchSucceeded.bind(this),
        getImagePreviewUrlCallback: this.assetManager.getImagePreviewUrl.bind(this.assetManager),
        onClickResultCallback: this.loadModel.bind(this),
        searchSimilarGetModelIdCallback: (this.showSearchSimilar)? this.getTargetModelId.bind(this) : undefined,
        sources: this.modelSources,
        searchPanel: $('#searchPanel'),
        showSearchOptions: this.showSearchOptions,
        showSearchSortOption: this.showSearchSortOption,
        loadImagesLazy: true,
        showLoadFile: true,
        tooltipIncludeFields: this.params.tooltipIncludeFields,
        tooltipIncludeExtraFields: this.params.tooltipIncludeExtraFields
      });
      this.modelSearchController.searchPanel.setAutocomplete(
        new SolrQuerySuggester({
          schema: new ModelSchema()
        })
      );
      if (this.restrictModels) {
        this.modelSearchController.setFilter(Constants.assetTypeModel, this.restrictModels);
        this.modelSearchController.setFilter(Constants.assetTypeScan, this.restrictModels);
      }
      this.textureSearchController = new SearchController({
        searchSucceededCallback: this.textureSearchSucceeded.bind(this),
        getImagePreviewUrlCallback: this.assetManager.getImagePreviewUrl.bind(this.assetManager),
        onClickResultCallback: this.loadTexture.bind(this),
        sources: Constants.assetSources.texture,
        searchPanel: $('#textureSearchPanel'),
        loadImagesLazy: true
      });
      this.assetManager.setSearchController(this.modelSearchController);
      var textureSearchButton = $('#textureSearch');
      if (textureSearchButton && textureSearchButton.length > 0) {
        textureSearchButton.click(
          function () {
            this.selectSearchTab('textures');
          }.bind(this)
        );
      }

      var materialsPanel = $('#materialsPanel');
      if (materialsPanel && materialsPanel.length > 0) {
        this.modelMaterialsPanel = new ModelMaterialsPanel(materialsPanel);
      }
      var imagesPanel = $('#imagesPanel');
      if (imagesPanel && imagesPanel.length > 0) {
        this.modelImagesPanel = new ImagesPanel({
          container: imagesPanel
        });
      }
      var colorsPanel = $('#colorsPanel');
      if (colorsPanel && colorsPanel.length > 0) {
        this.colorsPanel = new ColorsPanel({
          container: colorsPanel,
          toolbar: $('#colorsToolbar'),
          onClickColorCallback: function (color) {
            var options = (this.loaded.length > 0) ? this.loaded[0].model.info.options : null;
            var material = this.assetManager.getColoredMaterial(color.name, color.hex, options);
            this.applyMaterial(material);
          }.bind(this)
        });
      }

      var alignPanel = $('#alignPanel');
      if (alignPanel && alignPanel.length > 0)  {
        this.alignPanel = new AlignPanel({
          container: alignPanel,
          onAlignSubmittedCallback: this.alignSubmitted.bind(this),
          nextTargetCallback: this.loadNextModel.bind(this),
          addControlCallback: function(control) {
            this.controlsNode.add(control);
            this.addControl(control);
          }.bind(this),
          app: this
        });
      }

      var partsPanel = $('#partsPanel');
      if (partsPanel && partsPanel.length > 0) {
        var partsPanelParams = _.defaultsDeep(Object.create(null),
            {
              app: this,
              partType: this.urlParams['partType'],
              labelType: this.urlParams['labelType'],
              defaultPartType: this.urlParams['defaultPartType'],
              defaultLabelType: this.urlParams['defaultLabelType'],
              allowVoxels: this.urlParams['allowVoxels'],
              filterEmptyGeometries: false,
              showMultiMaterial: true,
              collapseNestedPaths: false,
            },
            this.params.partsPanel || {},
            {
              container: partsPanel,
              labelsPanel: {
                container: $('#nameButtonsDiv'),
                includeAllButton: true,
                labels: []
              },
              getDebugNode: function () {
                return this.debugNode;
              }.bind(this),
              showNodeCallback: function (node) {
                this.debugNode.add(node);
              }.bind(this)
            }
         );
        this.partsPanel = new PartsPanel(partsPanelParams);
      }
      var imageIndexElem = $('#imageIndex');
      if (imageIndexElem) {
        var scope = this;
        for (var i = 0; i < this.nImagesPerModel; i++) {
          imageIndexElem.append('<option value="' + i + '">' + i + '</option>');
        }
        imageIndexElem.val('13');
        var selectImagePreviewFunc = function () {
          if (scope._useNewImages) {
            this.assetManager.previewImageIndex = imageIndexElem.val();
            imageIndexElem.show();
          } else {
            this.assetManager.previewImageIndex = -1;
            imageIndexElem.hide();
          }
          this.modelSearchController.updatePreviewImages(this.assetManager.previewImageIndex);
        }.bind(this);
        imageIndexElem.change(selectImagePreviewFunc);

        var newImagesCheckbox = $('#newImages');
        newImagesCheckbox.prop('checked', scope._useNewImages);
        newImagesCheckbox.change(function() {
          scope._useNewImages = newImagesCheckbox.prop('checked');
          selectImagePreviewFunc();
        });

        selectImagePreviewFunc();
      }

      var annotationsPanel = $('#annotationsPanel');
      if (annotationsPanel && annotationsPanel.length > 0) {
        var modelAttributes = ['id', 'wnsynset', 'category', 'color', 'material', 'shape', 'depicts',
          'state', 'usedFor', 'foundIn', 'hasPart', 'attr', 'isSingleCleanObject', 'hasMultipleObjects', 'isCollection', 'modelQuality', 'baseVariantId' ];
        var readOnlyAttributes = ['id', 'datasets', 'datatags', 'isAligned', 'isContainerLike', 'weight', 'volume', 'solidVolume', 'surfaceVolume',
          'staticFrictionForce' /*, "aligned.dims" */];
        var attributeInfos = {
          "modelQuality": { min: 0, max: 7, step: 1 }
        };
        var attributeLinks = { "wnsynset": {
            solrUrl: Constants.shapenetSearchUrl,
            taxonomy: "shapenet",
            linkType: "wordnet",
            displayField: "wnsynsetkey",  // Field to display
            // Mapping from our field names to linked fields
            // These are also fields that we should populate if the wnsynset changes
            fieldMappings: {
              wnsynsetkey: "wn30synsetkey",
              wnlemmas: "words",
              wnsynset: "synsetid",
              shapenetCoreSynset: "shapenetcoresynsetid",
              //wnsynset: "wn30synsetid"
              // Special fields
              wnhyperlemmas: "wnhyperlemmas", //"ancestors.words",
              wnhypersynsets: "wnhypersynsets", //"ancestors.synsetid"
            }
          }};
        this.annotationsPanel = new AnnotationsPanel({
          container: annotationsPanel,
          attributes: modelAttributes,
          attributesReadOnly: readOnlyAttributes,  // readonly attributes
          attributeLinks: attributeLinks,
          attributeInfos: attributeInfos,
          searchController: this.modelSearchController,
          onSubmittedCallback: this.refreshModelInfo.bind(this)
        });
      }
      var width = this.container.clientWidth;
      var height = this.container.clientHeight;

      //this.camera = new THREE.PerspectiveCamera(45, width / height, 1, 4000);
      this.camera = new THREE.CombinedCamera(width, height, 45, 1, 4000, 1, 4000);
      this.camera.position.z = 100;

      this.cameraControls = new CameraControls({
        camera: this.camera,
        controlType: this.controlType,
        container: this.container,
        autoRotateCheckbox: $('#autoRotate'),
        renderCallback: this.render.bind(this) });
      this.cameraControls.saveCameraState(true);

      this.scene = new THREE.Scene();
      this.scene.name = 'scene';
      this.scene.add(this.camera);
      this.scene.add(this.debugNode);
      this.scene.add(this.controlsNode);

      // Test models
      var defaultModel;
      if (this._includeTestModels) {
        defaultModel = this.setupTestModels();
      }
      this.setupLocalLoading(this.loadLocalModel.bind(this));
      this.setupRegisterCustomAssetGroupUI(this.modelSearchController);

      var format = this.urlParams['format'];
      if (format) {
        console.log('Set default format ' + format);
        AssetGroups.setDefaultFormat(format);
      }

      var modelId = this.urlParams['modelId'];
      var modelUrl = this.urlParams['modelUrl'];
      var modelQuery = this.urlParams['modelQuery'];
      console.log('modelId=' + modelId);
      var defaultOptions = {};
      if (modelId) {
        if (modelId.startsWith('yobi3d.')) {
          // Hack to load yobi3d models until they are indexed...
          var modelInfo = this.assetManager.getLoadModelInfo(null, modelId);
          console.log(modelInfo);
          this.clearAndLoadModel(modelInfo);
        } else if (modelId.startsWith('fs.')) {
          // Local filesystem override: assumes path to dae model file follows '.'
          // and that the path is relative to statically hosted directory
          var path = modelId.split('fs.')[1];
          var mInfo = { modelId: 'fs.' + path, format: 'collada', file: path, options: defaultOptions };
          this.clearAndLoadModel(mInfo);
        } else {
          this.modelSearchController.setSearchText('fullId:' + modelId);
          this.modelSearchController.startSearch();
        }
        //var modelInfo = this.assetManager.getLoadModelInfo(null, modelId);
        //this.clearAndLoadModel(modelInfo);
      } else if (modelUrl) {
        // TODO: Test this
        var modelInfo = { file: modelUrl, options: defaultOptions };
        this.clearAndLoadModel(modelInfo);
      } else if (modelQuery) {
        this.modelSearchController.setSearchText(modelQuery);
        this.modelSearchController.startSearch();
      } else if (defaultModel) {
        this.clearAndLoadModel(defaultModel);
      }
      var action = this.urlParams['action'];
      if (action === 'align') {
        this.selectAlignTab();
      } else {
        var view = this.urlParams['view'];
        if (view === 'parts') {
          this.selectPartsTab();
        }
      }

      this.scene.add(this.createDefaultLight());
      this.renderer = new Renderer({
        container: this.container,
        camera: this.camera,
        useAmbientOcclusion: this.useAmbientOcclusion,
        ambientOcclusionType: this.ambientOcclusionType,
        useEDLShader: this.useEDLShader,
        useShadows: this.useShadows,
        useLights: this.useLights
      });
      this.renderer.domElement.addEventListener('dblclick', this.selectMesh.bind(this), false);
      this.picker = new Picker();

      if (Constants.isBrowser) {
        window.scene = this.scene;  // Export for THREE.js inspector debugging
        window.addEventListener('resize', this.onWindowResize.bind(this), false);
        $(document).keydown(this.keyHandler.bind(this));
        this.setupDatGui();
        this.setupInstructions();
      }

      if (this.placeLightProbe) {
        this.createLightProbe();
      }
    };

    function LightProbe() {
      this._x = 0;
      this._y = 0;
      this._z = 0;
      this._radius = 0;
      this.defaultRadius = 0.025;
      var sphere = new THREE.SphereGeometry(1, 20, 10);
      var material = new THREE.MeshPhongMaterial({ color: 0xffff00, emissive: 0xffff00 });
      this.mesh = new THREE.Mesh(sphere, material);
      this.light = new THREE.PointLight();
      this.mesh.add(this.light);
      var R = this.defaultRadius * Constants.metersToVirtualUnit;
      this.mesh.scale.set(R, R, R);
    }
    Object.defineProperty(LightProbe.prototype, 'x', {
      get: function () { return this._x; },
      set: function (v) {
        this._x = v;
        this.mesh.position.x = v;
      }
    });
    Object.defineProperty(LightProbe.prototype, 'y', {
      get: function () { return this._y; },
      set: function (v) {
        this._y = v;
        this.mesh.position.y = v;
      }
    });
    Object.defineProperty(LightProbe.prototype, 'z', {
      get: function () { return this._z; },
      set: function (v) {
        this._z = v;
        this.mesh.position.z = v;
      }
    });
    Object.defineProperty(LightProbe.prototype, 'radius', {
      get: function () { return this._radius; },
      set: function (v) {
        this._radius = v;
        this.light.intensity = v * v / (this.defaultRadius * this.defaultRadius);
        this.mesh.scale.set(v, v, v);
      }
    });

    ModelViewer.prototype.createLightProbe = function () {
      console.log('Creating light probe');
      this.lightProbe = new LightProbe();
      if (this.datgui) {
        var gui = this.datgui.getFolder('Light Probe');
        console.log(this.lightProbe);
        gui.add(this.lightProbe, 'x', -2.5, 2.5).step(0.001);
        gui.add(this.lightProbe, 'y', -2.5, 2.5).step(0.001);
        gui.add(this.lightProbe, 'z', -2.5, 2.5).step(0.001);
        gui.add(this.lightProbe, 'radius', 0.001, 0.20).step(0.001);
      }
    };

    ModelViewer.prototype.setupInstructions = function () {
      var instructions = $('#instructions');
      if (instructions) {
        instructions.html(
          'Left click = Orbit view<br>' +
          'Right click = Pan view<br>' +
          'Mouse wheel = Zoom view<br>' +
          'P = Previous model (in search results)<br>' +
          'N = Next model<br>' +
          'I = Save image<br>' +
          'T = Toggle controller mode<br>' +
          'Left/Right/Up/Down arrow key = Realign model<br>' +
          'PgUp/PgDown = Next/Prev part<br>' +
          'Shift+R = Reset camera<br>' +
          'Shift+H = Submit current alignment<br>' +
          'Shift+A = Toggle coordinate axes<br>' +
          'Shift+G = Toggle bounding box symmetry plane<br>' +
          'Shift+W = Toggle wireframe<br>' +
          'Shift+V = Toggle show voxels<br>' +
          'Shift+B = Toggle show segments<br>' +
          'Shift+C = Assign simple color material to model<br>' +
          'Shift+M = Assign simple color to each material'
        );
      }
    };

    ModelViewer.prototype.setupTestModels = function () {
      var defaultOptions = { autoAlign: true };
      var models = {
        'sofa': { format: 'collada', file: 'resources/models/sofa/models/sofa.dae', options: defaultOptions }
      };

      var selectModelElem = $('#selectModel');
      for (var name in models) {
        if (models.hasOwnProperty(name)) {
          selectModelElem.append('<option value="' + name + '">' + name + '</option>');
        }
      }
      var that = this;
      selectModelElem.change(function () {
        $('#selectModel option:selected').each(function () {
          var m = models[$(this).val()];
          that.clearAndLoadModel(m);
        });
      });
      selectModelElem.val('sofa');
      return models['sofa'];
    };

    ModelViewer.prototype.setupDatGui = function () {
      if (this.useDatGui) {
        Viewer3D.prototype.setupDatGui.call(this);
        this.datgui.add(this, 'modelOpacity', 0, 1).name('Model opacity').listen();
      }
    };

    ModelViewer.prototype.modelSearchSucceeded = function (source, resultList) {
      this.assetManager.cacheModelInfos(source, resultList);
      var sourceType = this.assetManager.getSourceDataType(source);
      // Pick top choice and load it!
      if (resultList.length > 0) {
        this.modelSearchController.searchPanel.selectOnPage(this.modelSearchController.searchPanel.curStart);
      }
    };

    ModelViewer.prototype.textureSearchSucceeded = function (source, resultList) {
      // TODO: do something with textures
    };

    ModelViewer.prototype.applyMaterial = function (material) {
      if (this.modelMaterialsPanel) {
        this.modelMaterialsPanel.setMaterial(material);
      } else {
        for (var i in this.loaded) {
          if (this.loaded.hasOwnProperty(i)) {
            this.loaded[i].setMaterial(material);
          }
        }
      }
    };

    ModelViewer.prototype.loadModel = function (source, id, metadata) {
      var modelInfo = this.assetManager.getLoadModelInfo(source, id, metadata);
      this.clearAndLoadModel(modelInfo);
    };

    ModelViewer.prototype.loadTexture = function (source, id, metadata) {
      var material = this.assetManager.getTexturedMaterial(source, id, { metadata: metadata });
      this.applyMaterial(material);
    };

    ModelViewer.prototype.loadPrevModel = function () {
      // Loads prev models (from models in search list)
      this.modelSearchController.searchPanel.selectPrev();
    };

    ModelViewer.prototype.loadNextModel = function () {
      // Loads next models (from models in search list)
      this.modelSearchController.searchPanel.selectNext();
    };

    ModelViewer.prototype.refreshModelInfo = function () {
      var target = (this.loaded.length > 0) ? this.loaded[0] : null;
      if (!target) return;

      this.assetManager.refreshModelInfo(null, target.model.getFullID());
    };

    ModelViewer.prototype.alignSubmitted = function () {
      var target = (this.loaded.length > 0) ? this.loaded[0] : null;
      if (!target) return;

      this.assetManager.refreshModelInfo(null, target.model.getFullID());
      this.loadNextModel();
    };

    ModelViewer.prototype.clear = function () {
      for (var prev in this.loaded) {
        if (this.loaded.hasOwnProperty(prev)) {
          this.scene.remove(this.loaded[prev].object3D);
          Object3DUtil.dispose(this.loaded[prev].object3D);
        }
      }
      if (this.mirror) {
        this.scene.remove(this.mirror);
        Object3DUtil.dispose(this.mirror);
        this.mirror = null;
      }
      this.scene.remove(this.debugNode);
      Object3DUtil.dispose(this.debugNode);
      this.debugNode = new THREE.Group();
      this.debugNode.name = 'debugNode';
      this.scene.add(this.debugNode);
      this.loaded.length = 0;
      this.clearAssets();
    };

    ModelViewer.prototype.clearAndLoadModel = function (modelinfo) {
      this.clear();
      this.showLoadingIcon(true);
      this.start = new Date().getTime();
      this.assetManager.getModelInstanceFromLoadModelInfo(modelinfo, this.onModelLoad.bind(this), function() {
        this.showLoadingIcon(false);
      }.bind(this));
    };

    ModelViewer.prototype.onModelLoad = function (modelInstance) {
      var end = new Date().getTime();
      var time = end - this.start;
      console.log('Load time for model: ' + time);
      if (this.useShadows) {
        console.log('useShadows');
        Object3DUtil.setCastShadow(modelInstance.object3D, true);
        Object3DUtil.setReceiveShadow(modelInstance.object3D, true);
      }
      var mirror;
      if (this.enableMirrors) {
        var bboxDims = Object3DUtil.getBoundingBoxDims(modelInstance.object3D);
        Object3DUtil.addMirrors(modelInstance.object3D, {
          ignoreSelfModel: false,
          renderer: this.renderer.renderer,
          assetManager: this.assetManager,
          camera: this.camera,
          width: this.renderer.width,
          height: this.renderer.height
        });

        // Add ground mirror
        mirror = Object3DUtil.makeGround((bboxDims.z + bboxDims.y)*1.5, bboxDims.x*1.5, 'gray');
        Object3DUtil.addMirrors(mirror, {
          filterMaterial: function (x) {
            return true;
          },
          renderer: this.renderer.renderer,
          assetManager: this.assetManager,
          camera: this.camera,
          width: this.renderer.width,
          height: this.renderer.height
        });
        this.scene.add(mirror);
        this.mirror = mirror;
      }
      this.scene.add(modelInstance.object3D);
      this.scene.userData.id = modelInstance.model.info.id;
      this.scene.userData.fullId = modelInstance.model.info.fullId;
      this.scene.name = modelInstance.model.info.id;
      this.loaded.push(modelInstance);
      if (this.enableMirrors) {
        Object3DUtil.placeObject3DByBBFaceCenter(modelInstance.object3D, null, Constants.BBoxFaceCenters.BOTTOM);
        Object3DUtil.placeObject3DByBBFaceCenter(mirror, null, Constants.BBoxFaceCenters.BOTTOM);
      } else {
        Object3DUtil.placeObject3DByBBFaceCenter(modelInstance.object3D);
      }
      if (this.modelMaterialsPanel) {
        this.modelMaterialsPanel.setObject3D(modelInstance.object3D);
      }
      if (this.modelImagesPanel) {
        if (modelInstance.model.info.fullId) {
          var urls = this.assetManager.getAllImageUrls(modelInstance.model.info.source, modelInstance.model.info.id, modelInstance.model.info);
          this.modelImagesPanel.setImageUrls(modelInstance.model.info.fullId, urls);
        } else {
          this.modelImagesPanel.setImageUrls('', []);
        }
      }
      if (this.alignPanel) {
        this.alignPanel.setTarget(modelInstance);
      }
      if (this.partsPanel) {
        this.partsPanel.setTarget(modelInstance);
      }
      if (this.annotationsPanel) {
        this.annotationsPanel.setTarget(modelInstance);
      }
      if (this.placeLightProbe) {
        var modelObject3D = modelInstance.getObject3D('Model');
        this.lightProbe.x = 0;
        this.lightProbe.y = 0;
        this.lightProbe.z = 0;
        this.lightProbe.radius = this.lightProbe.defaultRadius * modelInstance.model.getUnit();
        modelObject3D.add(this.lightProbe.mesh);
        this.updateDatGui();
      }
      this.resetCamera({
        targetBBox: this.getSceneBoundingBox()
      });
      this.cameraControls.saveCameraState(true);
      this.onSceneChanged();
      console.log('Finished loading model', modelInstance.model.info);
      this.showLoadingIcon(false);
      this.Publish("ModelLoaded", modelInstance);
    };

    ModelViewer.prototype.toggleBbSymmetryPlanes = function () {
      // rotate through bb planes
      this.bbSymmetryPlaneIndex = (this.bbSymmetryPlaneIndex + 1) % ModelViewer.SymmetryPlanes.length;
      var planeType = ModelViewer.SymmetryPlanes[this.bbSymmetryPlaneIndex];
      var bb = this.getTarget().getBBox();
      var meshPlane = Object3DUtil.makeSymmetryPlane(bb, planeType);
      if (this.bbSymmetryPlane) {
        this.debugNode.remove(this.bbSymmetryPlane);
      }
      this.bbSymmetryPlane = meshPlane;
      if (this.bbSymmetryPlane) {
        this.debugNode.add(meshPlane);
      }
    };

    // Queries ShapeNet MySQL db for symmetry plane info and creates symmetry plane if available
    ModelViewer.prototype.getSymmetryPlane = function () {
      var target = this.getTarget();
      if (!target) { return; }
      var params = { qt: 'sym', modelid: target.model.getFullID().split('.')[1] }; // TODO: MySQL db uses id, not fullID :(
      var data = jQuery.param(params);
      $.ajax({
        type: 'GET',
        url: Constants.shapenetQueryUrl,
        data: data,
        success: function (res, textStatus, jqXHR) {
          if (res && res[0]) {
            var r = res[0];
            var normal = new THREE.Vector3(r.nx, r.ny, r.nz);
            this.createSymmetryPlaneFromNormalDist(target, normal, r.dist);
          }
        }.bind(this),
        error: function (jqXHR, textStatus, err) {
          console.error('Error querying symmetry plane: ' + err);
        },
        complete: function () {
        }
      });
    };

    // Takes a normal,dist symmetry parameterization and creates a symmetry plane in world space
    ModelViewer.prototype.createSymmetryPlaneFromNormalDist = function (modelInstance, normal, dist) {
      console.log(normal);
      console.log(dist);
      if (this.bbSymmetryPlane) { this.debugNode.remove(this.bbSymmetryPlane); }
      //var M = modelInstance.model.object3D.matrix;  // Alignment transform from model space to viewer world space
      var M = Object3DUtil.getAlignmentMatrix(Constants.shapenetUp, Constants.shapenetFront,
        Constants.worldUp, Constants.worldFront);
      //console.log(shapenet2world);
      normal.transformDirection(M);
      console.log(normal);
      var bb = modelInstance.getBBox();
      this.bbSymmetryPlane = Object3DUtil.makeSymmetryPlane(bb, 'nd', normal, dist);
      this.debugNode.add(this.bbSymmetryPlane);
    };

    ModelViewer.prototype.keyHandler = function (event) {
      //        console.log("Key pressed: " + event.which + ", " + String.fromCharCode(event.which));
      //        console.log(event.target);
      var tagName = (event.target || event.srcElement).tagName;
      if (tagName === 'INPUT' || tagName === 'SELECT' || tagName === 'TEXTAREA') {
        return;
      }
      switch (event.which) {
        case 33:
          // on page up code
          this.partsPanel.nextPart(+1, event.shiftKey);
          event.stopPropagation();
          event.preventDefault();
          return;

        case 34:
          // on page down code
          this.partsPanel.nextPart(-1, event.shiftKey);
          event.stopPropagation();
          event.preventDefault();
          return;
      }
      switch (String.fromCharCode(event.which)) {
        case 'Q':
          var target = this.getTarget();
          if (target) {
            var scope = this;
            scope.showCreateVoxelsPanel(target);

            // var mInstObject3D = target.getObject3D('Model');
            // var meshes = Object3DUtil.getMeshes(mInstObject3D);
            // var samples = MeshSampling.getMeshesSurfaceSamples(meshes.list, 1024);
            // var flatSamples = _.flatten(samples);
            // //console.log(flatSamples);
            // var sphere = new THREE.SphereGeometry(1, 5, 5);
            // flatSamples.forEach(function (s) {
            //   var material = new THREE.MeshPhongMaterial({ color: s.color });
            //   var m = new THREE.Mesh(sphere, material);
            //   m.position.copy(s.worldPoint);
            //   scope.debugNode.add(m);
            // });

            //var partsPanel = this.partsPanel;
          }
          break;
        case 'P':
          if (this.allowPrevNext) { this.loadPrevModel(); }
          break;
        case 'N':
          if (this.allowPrevNext) { this.loadNextModel(); }
          break;
        case 'R':
          if (event.shiftKey) {
            this.cameraControls.restoreCameraState();
          }
          break;
        case 'H':
          if (this.alignPanel && event.shiftKey) {
            this.alignPanel.submit();
          }
          break;
        case 'A':
          if (event.shiftKey) {
            this.showAxes = !this.showAxes;
          }
          break;
        case 'C':
          if (event.shiftKey) {
            var targetModel = (this.loaded.length > 0) ? this.loaded[0] : null;
            if (targetModel !== null) {
              targetModel.setMaterial(Object3DUtil.getSimpleFalseColorMaterial(this.idCounter++, null));
              console.log('False color id=' + this.idCounter);
            }
          }
          break;
        case 'M':
          if (event.shiftKey && (event.ctrlKey || event.metaKey)) {
            var targetModel = (this.loaded.length > 0) ? this.loaded[0] : null;
            if (this.partsPanel && this.partsPanel.getSegments() && targetModel) {
              var plyExporter = new PLYExporter();
              this.partsPanel.getSegments().export(plyExporter, targetModel.model.info.fullId);
            } else {
              console.warn('No segments to export');
            }
          } else if (event.shiftKey) {
            var targetModel = (this.loaded.length > 0) ? this.loaded[0] : null;
            if (targetModel !== null && this.modelMaterialsPanel) {
              this.modelMaterialsPanel.falseColorMaterials = !this.modelMaterialsPanel.falseColorMaterials;
              this.modelMaterialsPanel.update();
            }
          }
          break;
        case 'I':
          this.saveImage();
          break;
        case 'T':
          this.toggleControlType();
          break;
        case 'G':
          if (event.shiftKey) {
            //this.toggleBbSymmetryPlanes();
            this.getSymmetryPlane();
          }
          break;
        case 'W':
          if (event.shiftKey) {
            this.toggleWireframe();
          }
          break;
        case 'V':
          if (event.shiftKey) {
            this.partsPanel.toggleVoxelization();
          }
          break;
        case 'B':
          if (event.shiftKey) {
            this.partsPanel.toggleSegmentation();
          }
          break;
        case 'L':
          if (event.shiftKey) {
            this.partsPanel.saveLabels();
          }
          break;
        default:
          break;
      }
    };

    ModelViewer.prototype.showCreateVoxelsPanel = function(target) {
      this.__createVoxelConfig = this.__createVoxelConfig ||
          { voxelsField: 'none', downsampleBy: 1, numSamples: 100000, samplesPerVoxel: 0, dim: 32,
            limitToVisible: true, useTwoPass: true, center: true, useMaterialScores: true, exportToFile: false};

      // Requires special bootbox with form support
      var questions = [
        {
          "title": "Voxels to use",
          "name": "voxelsField",
          "inputType": "select",
          "inputOptions": _.map(['none', 'voxels-surface', 'voxels-solid'], function(x) { return { text: x, value: x }; }),
          "value": this.__createVoxelConfig.voxelsField
        },
        {
          "title": "Number of samples",
          "name": "numSamples",
          "inputType": "number",
          "value": this.__createVoxelConfig.numSamples
        },
        {
          "title": "Number of samples to ensure for each voxel (used when working with existing voxelization)",
          "name": "samplesPerVoxel",
          "inputType": "number",
          "value": this.__createVoxelConfig.samplesPerVoxel
        },
        {
          "title": "Resolution",
          "name": "dim",
          "inputType": "number",
          "value": this.__createVoxelConfig.dim
        },
        {
          "title": "Downsample by",
          "name": "downsampleBy",
          "inputType": "number",
          "value": this.__createVoxelConfig.downsampleBy
        },
        {
          "title": "Limit to visible triangles",
          "name": "limitToVisible",
          "inputType": "boolean",
          "value": this.__createVoxelConfig.limitToVisible
        },
        {
          "title": "Use two pass",
          "name": "useTwoPass",
          "inputType": "boolean",
          "value": this.__createVoxelConfig.useTwoPass
        },
        {
          "title": "Export NRRD",
          "name": "exportToFile",
          "inputType": "boolean",
          "value": this.__createVoxelConfig.exportToFile
        }
      ];
      var scope = this;
      bootbox.form({
        title: 'Create voxels',
        inputs: questions,
        callback: function(results) {
          if (results) {
            _.each(questions, function(q,i) {
              scope.__createVoxelConfig[q.name] = results[i];
            });
            scope.createVoxels(target, scope.__createVoxelConfig);
          }
        }
      });
    };

    ModelViewer.prototype.createVoxels = function(target, opts) {
      console.log('createVoxels', opts);
      var scope = this;
      target.voxels = new ModelInstanceVoxels({ name: 'custom-voxels', voxelsField: opts.voxelsField });
      target.voxels.init(target);
      target.voxels.createColorVoxels(opts, function (colorVoxels) {
        //colorVoxels.voxelGrid.__compare(partsPanel.colorVoxels.voxelGrid);
        if (scope.partsPanel) {
          // Rely on parts panel to manage custom voxels
          scope.partsPanel.addCustomVoxels('voxels-color-custom', colorVoxels);
        } else {
          // Track voxels on our own
          if (scope.__colorVoxels) {
            var node = scope.__colorVoxels.getVoxelNode();
            scope.debugNode.remove(node);
            Object3DUtil.dispose(node);
          }
          scope.debugNode.add(colorVoxels.getVoxelNode());
          scope.__colorVoxels = colorVoxels;
        }
        if (opts.exportToFile) {
          var NRRDExporter = require('exporters/NRRDExporter');
          var nrrdexp = new NRRDExporter();
          nrrdexp.export(colorVoxels.getVoxelGrid(), {content: target.model.info.fullId + '_rgb.vox', name: target.model.info.fullId});
        }
      });
    };

    ModelViewer.prototype.lookAt = function (scene, objects) {
      // var viewOptimizer = new ViewOptimizer({cameraControls: this.cameraControls, width: this.renderer.width, height: this.renderer.height});
      // var opt = viewOptimizer.lookAt(scene, objects);
      // this.cameraControls.viewTarget(opt);
      var bbox = Object3DUtil.getBoundingBox(objects);
      if (bbox.valid()) {
        this.cameraControls.viewTarget({
          targetBBox: bbox,
          viewIndex: 0,
          distanceScale: 1.5
        });
        if (this.clippingBox && this.clipOnLookAt) {
          this.clippingBox.init(bbox);
        }
      } else {
        console.warn('Invalid bounding box', objects);
      }
    };

    ModelViewer.prototype.resetCamera = function (options) {
      //if (options) {
      //  options.theta = Math.PI / 6;
      //  options.phi = -Math.PI / 10;
      //  options.fitRatio = 1.5;
      //}
      //Viewer3D.prototype.resetCamera.call(this, options);
      var pos = Constants.defaultCamera.position;
      if (options.targetBBox) {
        var d = options.targetBBox.maxDim();
        pos = pos.clone().multiplyScalar(d / 80);
      }
      this.camera.up.copy(Constants.worldUp);
      this.cameraControls.viewTarget({
        position: pos,
        target: new THREE.Vector3()
      });
    };

    ModelViewer.prototype.setView = function (index) {
      var target = this.getTarget();
      if (target) {
        var bbox = Object3DUtil.getBoundingBox(target.object3D);
        var pos = Constants.defaultCamera.position;
        var d = bbox.maxDim();
        pos = pos.clone().multiplyScalar(d / 80);
        var options = {
          targetBBox: bbox,
          viewIndex: index,
          defaultPosition: pos,
          distanceScale: 1.5
        };
        this.cameraControls.viewTarget(options);
      } else {
        console.log('No models loaded');
      }
    };

    ModelViewer.prototype.onWindowResize = function () {
      Viewer3D.prototype.onWindowResize.call(this);

      this.modelSearchController.onResize();
      this.textureSearchController.onResize();
      if (this.modelImagesPanel) {
        this.modelImagesPanel.onResize();
      }
    };

    ModelViewer.prototype.selectMesh = function (event) {
      event.preventDefault();
      var target = this.getTarget();
      if (target) {
        var mouse = this.picker.getCoordinates(this.container, event);
        var intersects = this.picker.getIntersectedDescendants(mouse.x, mouse.y, this.camera, [target.object3D]);
        if (intersects.length > 0) {
          if (event.shiftKey) {
            var nLightsToggled = target.setLightState(!target.object3D.userData.lightsOn);
            console.log('Toggled ' + nLightsToggled + ' lights.');
          } else {
            var mesh = intersects[0].object;
            //console.log('mesh bbox', Object3DUtil.getBoundingBox(mesh));
            if (this.modelMaterialsPanel) {
              this.modelMaterialsPanel.selectMesh(mesh, intersects[0].faceIndex);
            }
            console.log(intersects[0]);
          }
          return intersects[0];
        }
      }
    };

    ModelViewer.prototype.getRenderScene = function () {
      return this.scene;
    };

    ModelViewer.prototype.getSceneBoundingBox = function () {
      var target = this.getTarget();
      if (target) {
        return Object3DUtil.getBoundingBox(target.object3D);
      } else {
        var bbox = new BBox();
        bbox.includePoint(new THREE.Vector3());
      }
    };

    // Exports
    return ModelViewer;
  });
