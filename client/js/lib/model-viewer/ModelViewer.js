'use strict';

var Constants = require('Constants');
var Viewer3D = require('Viewer3D');

// Camera and picking
var CameraControls = require('controls/CameraControls');
var Picker = require('controls/Picker');
var Renderer = require('gfx/Renderer');
var Lights = require('gfx/Lights');

// Assets
var AssetManager = require('assets/AssetManager');
var AssetGroups = require('assets/AssetGroups');
var SolrQuerySuggester = require('search/SolrQuerySuggester');
var ModelSchema = require('model/ModelSchema');
var SearchController = require('search/SearchController');

// UI panels
var ModelMaterialsPanel = require('ui/ModelMaterialsPanel');
var ImagesPanel = require('ui/ImagesPanel');
var ColorsPanel = require('ui/ColorsPanel');
var AlignPanel = require('ui/AlignPanel');
var PartsPanel = require('ui/PartsPanel');
var ArticulationsPanel = require('articulations/ui/ArticulationsPanel');
var AnnotationsPanel = require('ui/AnnotationsPanel');

// Object3D functions
var Object3DUtil = require('geo/Object3DUtil');
var BBox = require('geo/BBox');

// Advanced functionality
var ImportObject3DForm = require('ui/modal/ImportObject3DForm');
var ExportObject3DForm = require('ui/modal/ExportObject3DForm');
var ProjectAnnotationsForm = require('ui/modal/ProjectAnnotationsForm');
var MeshSampling = require('geo/MeshSampling');
var LightProbe = require('geo/LightProbe');
var SceneUtil = require('scene/SceneUtil');
// var ViewOptimizer = require('gfx/ViewOptimizer');


// Util
var TabsControl = require('ui/TabsControl');
var UIUtil = require('ui/UIUtil');
var keymap = require('controls/keymap');
var _ = require('util/util');

require('three-shaders');
require('jquery-lazy');

ModelViewer.SymmetryPlanes = [null, 'nd']; // 'X', 'Y', 'Z' ];

/**
 * Viewer for looking at a single 3D model
 * @param params {Object} Configuration
 * @param [params.sources]
 * @param [params.allowPrevNext]
 * @param [params.showSearchOptions]
 * @param [params.showSearchSimilar]
 * @param [params.showSearchSortOption]
 * @param [params.tabs] {string[]} Array of tab names
 * @param [params.tabsDiv] Jquery element or selector for tabs (default: '#tabs')
 * @param [params.includeTestModels]
 * @param [params.useNewImages]
 * @param [params.tooltipIncludeFields] {boolean}
 * @param [params.tooltipIncludeExtraFields] {boolean}
 * @param [params.partsPanel]
 * @param [params.nImagesPerModel] (url parameter)
 * @param [params.autoLoadVideo] {boolean} (url parameter)
 * @param [params.enableLights] {boolean} (url parameter)
 * @param [params.defaultLightState] {boolean} (url parameter)
 * @param [params.placeLightProbe] {boolean} (url parameter)
 * @param [params.enableMirrors] {boolean} (url parameter)
 * @param [params.useDirectionalLights] {boolean} (url parameter)
 * @param [params.action] {string} What tab to select (url parameter only)
 * @param [params.view] {string} What tab to select (url parameter only)
 * @param [params.partType] {string} (url parameter only)
 * @param [params.labelType] {string} (url parameter only)
 * @param [params.defaultPartType] {string} (url parameter only)
 * @param [params.defaultLabelType] {string} (url parameter only)
 * @param [params.allowVoxels] {boolean} (url parameter only)
 * @param [params.editHierarchy] {boolean} (url parameter only)
 * @param [params.format] {string} (url parameter only)
 * @param [params.modelId] {string} (url parameter only)
 * @param [params.modelUrl] {string} (url parameter only)
 * @param [params.modelQuery] {string} (url parameter only)
 * @param [params.modelOptions] (url parameter only)
 * @constructor ModelViewer
 * @extends Viewer3D
 * @public
 */
function ModelViewer(params) {
  params = (params instanceof Element) ? { container: params } : params;
  this.params = params;
  var defaults = {
    appId: 'ModelViewer.v1-20220206',
    useDatGui: true,
    useAmbientOcclusion: false,
    nImagesPerModel: 14,
    useShadows: true,
    allowCameraControlToggle: true,
    colorByOptions: { color: '#fef9ed' }
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

  // Tabs
  this.__tabsControl = new TabsControl({
    tabs: params.tabs,
    tabsDiv: params.tabsDiv,
    onTabActivated: tab => this.__onTabActivated(tab)
    //keymap: keymap
  });
  this.__tabsControl.hookupFunctions(this);

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
  // Debug Node (temporary/alternative views of the model/debug visualizations)
  this.debugNode = new THREE.Group();
  this.debugNode.name = 'debugNode';
  this.extraDebugNodes = {};
  // Additional meshes/nodes associated with the model (such as annotated contact points, symmetry planes, etc)
  // Have the same transform as the model and is meant to be show with the original model present
  this.modelNodesGroup = new THREE.Group();
  this.modelNodesGroup.name = 'modelNodes';
  this.modelNodes = {};
  this.bbSymmetryPlaneIndex = 0;
  this.bbSymmetryPlane = null;
  this._modelOpacity = 1.0;
  this.nImagesPerModel = allParams['nImagesPerModel'];
  this.autoLoadVideo = allParams['autoLoadVideo'];
  this.enableLights = allParams['enableLights'];
  this.defaultLightState = allParams['defaultLightState'];
  this.placeLightProbe = allParams['placeLightProbe'];
  this.enableMirrors = allParams['enableMirrors'];
  this.useDirectionalLights = allParams['useDirectionalLights'];
  this.supportArticulated = allParams.supportArticulated;
  this.allowCameraControlToggle = allParams.allowCameraControlToggle;
  this.saveImageModifierKey = allParams.saveImageModifierKey;
  this.allowMagicColors = (params.allowMagicColors !== undefined) ? params.allowMagicColors : false;
  this.colorBy = allParams['colorBy'] || 'original';
  this.colorByOptions = allParams.colorByOptions;
  this.defaultLoadOptions = _.defaults(Object.create(null),
    allParams['modelOptions'] || {},
    {
      skipLines: false,
      skipPoints: false,
      filterEmptyGeometries: false
    }
  );
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

Object.defineProperty(ModelViewer.prototype, 'colorBy', {
  get: function () { return this.__colorBy; },
  set: function (v) {
    this.__colorBy = v;
    this.refreshModelMaterials();
  }
});

ModelViewer.prototype.refreshModelMaterials = function() {
  var targetObject = this.getTargetObject3D();
  if (targetObject) {
    this.__revertObjectMaterials(targetObject, false);
  }
};

ModelViewer.prototype.__revertObjectMaterials = function (object3D, nonrecursive) {
  Object3DUtil.revertMaterials(object3D, nonrecursive, true);
  this.colorByOptions.colorBy = this.__colorBy;
  if (this.__colorBy) {
    SceneUtil.recolorObject(object3D);
    if (this.__colorBy !== 'original') {
      var ensureVertexColors = (this.__colorBy === 'faceIndex' || this.__colorBy === 'triuv');
      this.colorByOptions.ensureVertexColors = ensureVertexColors;
      SceneUtil.colorObject3D(object3D, this.colorByOptions);
    }
  }
};

ModelViewer.prototype.registerCustomModelAssetGroup = function(assetIdsFile, jsonFile, autoLoad) {
  this.registerCustomAssetGroup(this.modelSearchController, assetIdsFile, jsonFile, autoLoad);
};

ModelViewer.prototype.loadLocalModel = function (localFile, opts) {
  this.clearAndLoadModel(_.defaults({
    file: localFile,
    options: _.defaults({
      ignoreMtlError: true,
      autoAlign: this.assetManager.autoAlignModels,
      autoScale: this.assetManager.autoScaleModels
    }, this.defaultLoadOptions)
  }, opts || {}));
};

ModelViewer.prototype.selectAlignTab = function () {
  this.activateTab('align');
};

ModelViewer.prototype.selectPartsTab = function () {
  this.activateTab('parts');
};

ModelViewer.prototype.selectSearchTab = function (source) {
  if (source === 'textures') {
    this.activateTab('textures');
  } else {
    this.activateTab('models');
    if (source) {
      this.modelSearchController.selectSource(source);
    }
  }
};

ModelViewer.prototype.__onTabActivated = function(tab) {
  keymap.setScope(tab);
  switch (tab) {
    case 'models':
      this.modelSearchController.onResize();
      break;
    case 'textures':
      this.textureSearchController.onResize();
      break;
    case 'images':
      this.modelImagesPanel.onResize();
      break;
    case 'parts':
      if (_.get(this, ['partsPanel', 'meshHierarchy', 'isVisible'])) {
        keymap.setScope('parts.meshHierarchy');
      }
      break;
  }
};

// i.e. get full id
ModelViewer.prototype.getTargetModelId  = function () {
  return (this.loaded.length > 0) ? this.loaded[0].model.info.fullId : null;
};

ModelViewer.prototype.getTargetObject3D  = function () {
  return (this.loaded.length > 0 && this.loaded[0]) ? this.loaded[0].object3D : null;
};

ModelViewer.prototype.getTarget  = function () {
  return (this.loaded.length > 0) ? this.loaded[0] : null;
};

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

ModelViewer.prototype.setDefaultFormat = function(format) {
  console.log('Set default format ' + format);
  AssetGroups.setDefaultFormat(format);
};

ModelViewer.prototype.init = function () {
  this.setupLoadingIcon();
  this.assetManager = new AssetManager({
    autoAlignModels: true,
    autoLoadVideo: this.autoLoadVideo,
    enableLights: this.urlParams['enableLights'],
    defaultLightState: this.urlParams['defaultLightState'],
    supportArticulated: this.supportArticulated,
  });
  this.assetManager.watchDynamicAssets(this, '_dynamicAssets');
  this.modelSearchController = new SearchController({
    assetFilters: { model: { sourceFilter: '+source:(' + this.modelSources.join(' OR ') + ')' }},
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
    assetFilters: { texture: { sourceFilter: '+source:(' + Constants.assetSources.texture.join(' OR ') + ')' }},
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
    this.alignPanel.Subscribe('AlignmentUpdated', this, function(target) {
      target.object3D.updateMatrixWorld();
      Object3DUtil.setMatrix(this.modelNodesGroup, target.getObject3D('Model').matrixWorld);
      if (this.annotationsPanel) {
        this.annotationsPanel.updateTargetWorldBBox(Object3DUtil.getBoundingBox(target.object3D));
      }
    });
    // this.alignPanel.keysEnabled = false;
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
          allowAllSupportedParts: this.urlParams['allowAllSupportedParts'],
          includeDefaultLabelRemaps: this.urlParams['includeDefaultLabelRemaps'],
          skipSegmentedObject3D: this.urlParams['skipSegmentedObject3D'],
          targetElementType: this.urlParams['targetElementType'],
          obbAlignPartType: this.urlParams['obbAlignPartType'],
          obbAlignTask: this.urlParams['obbAlignTask'],
          meshHierarchy: {
            allowLabeling: this.urlParams['editHierarchy'],
            allowEditHierarchy: this.urlParams['editHierarchy'],
            useSemanticMaterials: this.urlParams['editHierarchy'],
            allowSelectMaterials: true,
            filterEmptyGeometries: false,
            showMultiMaterial: true,
            collapseNestedPaths: false
          }
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
    this.articulationsPanel = new ArticulationsPanel({
      container: $('#articulationsPanel'),
      assetManager: this.assetManager
    });
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
      // Use default preview images for textureSearchController
      this.textureSearchController.updatePreviewImages(-1);
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
    var editableAttributes = ['id', 'wnsynset', 'category', 'datatags',
      'motif', 'support', 'symType', 'contactPoint',
      'color', 'material', 'shape', 'depicts',
      'state', 'usedFor', 'foundIn', 'hasPart', 'attr',
      'needCleaning', 'isCornerPiece', 'isContainerLike',
      'isSingleCleanObject', 'hasMultipleObjects', 'hasNestedObjects',
      'isArrangement', 'isCollection',
      'modelQuality', 'geometryQuality', 'textureQuality', 'segmentationQuality', 'articulatabilityQuality',
      'baseVariantId' ];
    var readOnlyAttributes = ['id', 'datasets', 'isAligned', 'simClusterIds', 'isContainerLike', 'weight', 'volume', 'solidVolume', 'surfaceVolume',
      'staticFrictionForce' /*, "aligned.dims" */];
    var attributeInfos = {
      'modelQuality': { min: 0, max: 10, step: 1, description: 'overall quality of model (0 = no geometry, 10 = perfect)' },
      'geometryQuality': { min: 0, max: 10, step: 1 },
      'textureQuality': { min: 0, max: 10, step: 1 },
      'segmentationQuality': { min: 0, max: 10, step: 1 },
      'articulatabilityQuality': { min: 0, max: 10, step: 1 }
    };
    var attributeLinks = { "wnsynset": ModelSchema.ShapeNetSynsetAttributeLink };
    this.annotationsPanel = new AnnotationsPanel({
      container: annotationsPanel,
      attributes: editableAttributes,
      attributesReadOnly: readOnlyAttributes,  // readonly attributes
      attributeLinks: attributeLinks,
      attributeInfos: attributeInfos,
      searchController: this.modelSearchController,
      onSubmittedCallback: this.refreshModelInfo.bind(this),
      onActivateSelectPoint: this.activateSelectPoint.bind(this),
      cancelActivateSelectPoint: this.cancelSelectPoint.bind(this)
    });
    this.annotationsPanel.Subscribe('ToggleVisibility', this, function(field, isVisible) {
      if (field.name === 'contactPoint') {
        var cp = this.annotationsPanel.getAnnotation(field.name);
        if (cp != null) {
          this.showContactPoint(cp, isVisible);
        } else {
          this.showContactPoint(null, false);
        }
      }
    });
    this.annotationsPanel.Subscribe('FieldUpdated', this, function(field, value) {
      //console.log('got fieldUpdated', field, value);
      if (field.name === 'contactPoint') {
        if (value != null) {
          this.showContactPoint(value, true);
        } else {
          this.showContactPoint(null, false);
        }
      }
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
  this.scene.add(this.modelNodesGroup);
  this.scene.add(this.debugNode);
  this.scene.add(this.controlsNode);

  this.setupLocalLoading((file) => {
    var opts = this.__importObject3DForm? this.__importObject3DForm.config : null;
    this.loadLocalModel(file, opts);
  });

  var format = this.urlParams['format'];
  if (format) {
    this.setDefaultFormat(format);
  }

  if (!this.skipLoadInitialModel) {
    this.loadInitialModel();
  }
  this.__tabsControl.initTabs();
  var action = this.urlParams['action'];
  if (action === 'align') {
    this.selectAlignTab();
  } else {
    var view = this.urlParams['view'];
    if (view === 'parts') {
      this.selectPartsTab();
    }
  }
  if (this.useDirectionalLights) {
    this.lights = Lights.addSimple2LightSetup(this.camera, new THREE.Vector3(0, 0, 0), true);
  } else {
    var hemisphereLight = this.createDefaultLight();
    this.scene.add(hemisphereLight);
    this.lights = { hemisphere: hemisphereLight };
  }
  this.renderer = new Renderer({
    container: this.container,
    camera: this.camera,
    useAmbientOcclusion: this.useAmbientOcclusion,
    ambientOcclusionType: this.ambientOcclusionType,
    useEDLShader: this.useEDLShader,
    useShadows: this.useShadows,
    usePhysicalLights: this.usePhysicalLights,
    useOutlineShader: true,
    outlineHighlightedOnly: true
  });
  AssetManager.enableCompressedLoading(this.renderer.renderer);
  this.renderer.domElement.addEventListener('dblclick', this.selectMesh.bind(this), false);
  this.renderer.domElement.addEventListener('click', this.handleMouseClick.bind(this), false);
  this.renderer.domElement.addEventListener('mousemove', this.handleMouseMove.bind(this), false);
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

ModelViewer.prototype.loadInitialModel = function() {
  // Test models
  var defaultModel;
  if (this._includeTestModels) {
    defaultModel = this.setupTestModels();
  }

  var modelId = this.urlParams['modelId'];
  var modelUrl = this.urlParams['modelUrl'];
  var modelQuery = this.urlParams['modelQuery'];
  console.log('modelId=' + modelId);
  var defaultOptions = {};
  if (this.urlParams['modelOptions']) {
    console.log('modelOptions', this.urlParams['modelOptions']);
    defaultOptions = _.defaults(defaultOptions, this.urlParams['modelOptions']);
  }
  if (modelId) {
    if (modelId.startsWith('fs.')) {
      // Local filesystem override: assumes path to dae model file follows '.'
      // and that the path is relative to statically hosted directory
      var path = modelId.split('fs.')[1];
      var mInfo = { modelId: 'fs.' + path, format: 'collada', file: path, options: defaultOptions };
      this.clearAndLoadModel(mInfo);
    } else {
      this.modelSearchController.setSearchText('fullId:' + modelId);
      this.modelSearchController.startSearch();
    }
  } else if (modelUrl) {
    // TODO: Test this
    var modelInfo = { file: modelUrl, options: defaultOptions, format: this.urlParams['format'] };
    this.clearAndLoadModel(modelInfo);
  } else if (modelQuery) {
    this.modelSearchController.setSearchText(modelQuery);
    this.modelSearchController.startSearch();
  } else if (defaultModel) {
    this.clearAndLoadModel(defaultModel);
  }
};

ModelViewer.prototype.createLightProbe = function () {
  console.log('Creating light probe');
  this.lightProbe = new LightProbe(0.025, Constants.metersToVirtualUnit);
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
      (this.allowPrevNext? 'P = Previous model (in search results)<br>': '') +
      (this.allowPrevNext? 'N = Next model<br>':'') +
      (this.saveImageModifierKey? _.capitalize(this.saveImageModifierKey) + '-' : '') + 'I = Save image<br>' +
      (this.allowCameraControlToggle? 'T = Toggle controller mode<br>':'') +
      (this.alignPanel? 'Left/Right/Up/Down arrow key = Realign model<br>':'') +
      'PgUp/PgDown = Next/Prev part<br>' +
      'Dblclick = Select mesh<br>' +
      'Shift+dblclick = Toggle light<br>' +
      (this.supportArticulated? 'Shift+Meta+dblclick = Articulate<br>':'') +
      'Meta+dblclick = Highlight part<br>' +
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
    'sofa': { format: 'collada', file: 'resources/models/sofa/models/sofa.dae', options: defaultOptions },
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

    var showAll = !(this.useDatGui instanceof Object);
    var options = (this.useDatGui instanceof Object) ? this.useDatGui : {};
    if (showAll || options['lights'] && this.lights) {
      var lightsGui = this.datgui.getFolder('lights');
      if (this.lights.ambient) {
        lightsGui.add(this.lights.ambient, 'intensity', 0, 10).step(0.05).listen();
        lightsGui.addColor(this.lights.ambient, 'color').listen();
        lightsGui.addColor(this.lights.ambient, 'groundColor').listen();
      }
      if (this.lights.hemisphere) {
        lightsGui.add(this.lights.hemisphere, 'intensity', 0, 10).step(0.05).listen();
        lightsGui.addColor(this.lights.hemisphere, 'color').listen();
        lightsGui.addColor(this.lights.hemisphere, 'groundColor').listen();
      }
    }

    if (this.allowMagicColors) {
      if (showAll || options['showColors']) {
        // setup coloring submenu
        // TODO: allow reverting to original colors
        var supportedColorByTypes = ['original'].concat(SceneUtil.ColorByTypesObject);
        var colorsGui = this.datgui.getFolder('coloring');
        colorsGui.add(this, 'colorBy', supportedColorByTypes).listen();
        colorsGui.addColor(this.colorByOptions, 'color').listen().onChange(() => {
          if (this.colorBy === 'color') {
            this.refreshModelMaterials();
          }
        });
      }
    }

    if (showAll || options['loadOptions']) {
      var loadGui = this.datgui.getFolder('loading');
      loadGui.add(this.defaultLoadOptions, 'skipLines').listen();
      loadGui.add(this.defaultLoadOptions, 'skipPoints').listen();
      loadGui.add(this.defaultLoadOptions, 'filterEmptyGeometries').listen();
    }

    // Some debug utilities
    var scope = this;
    this.datgui.add({
      fitPartsOBB: function() {
        var target = scope.getTarget();
        if (target) {
          scope.fitPartsOBB(target, { checkAABB: true, debug: true });
        } else {
          scope.showWarning('Please load a model before attempting to fit part obbs');
        }
      }
    }, 'fitPartsOBB').listen();
    this.datgui.add({
      createVoxels: function() {
        var target = scope.getTarget();
        if (target) {
          scope.showCreateVoxelsPanel(target);
        } else {
          scope.showWarning('Please load a model before attempting to create voxels');
        }
      }
    }, 'createVoxels').listen();
    this.datgui.add({
      samplePoints: function() {
        var target = scope.getTarget();
        if (target) {
          scope.showSamplePointsPanel(target);
        } else {
          scope.showWarning('Please load a model before attempting to sample points');
        }
      }
    }, 'samplePoints').listen();
    this.datgui.add({
      segmentModel: function() {
        var target = scope.getTarget();
        if (target) {
          scope.showSegmentModelPanel(target);
        } else {
          scope.showWarning('Please load a model before attempting to segment model');
        }
      }
    }, 'segmentModel').listen();
    this.datgui.add({
      addGeometry: function() {
        var target = scope.getTarget();
        if (target) {
          var AddGeometryForm = require('ui/modal/AddGeometryForm');
          scope.__addGeometryForm = scope.__addGeometryForm || new AddGeometryForm({
            warn: function(msg) { scope.showWarning(msg); },
          });
          scope.__addGeometryForm.show(target, (err, object3D) => {
            if (err) {
              scope.showWarning('Error adding geometry');
            } else {
              scope.setExtraDebugNode('addedGeometry', object3D);
            }
          });
        } else {
          scope.showWarning('Please load a model before attempting to add geometry');
        }
      }
    }, 'addGeometry').listen();
    this.datgui.add({
      propagateSegmentAnnotations: function() {
        var target = scope.getTarget();
        if (target) {
          scope.__propagationAnnotationsForm = scope.__propagationAnnotationsForm || new ProjectAnnotationsForm({
            assetManager: scope.assetManager,
            allowExtraOptions: true,
            onProjected: function(projectedData) {
              scope.showMessage('Projection successful');
              // console.log(projectedData);
              if (projectedData.segmented) {
                Object3DUtil.applyRandomMaterials(projectedData.segmented);
                scope.setExtraDebugNode('segmentedObject', projectedData.segmented);
              }
            },
            warn: function(msg) { scope.showWarning(msg); }
          });
          scope.__propagationAnnotationsForm.show(target);
        } else {
          scope.showWarning('Please load a model before attempting to propagate annotations');
        }
      }
    }, 'propagateSegmentAnnotations').listen();
    this.datgui.add({
      importModel: function() {
        scope.__importObject3DForm = scope.__importObject3DForm || new ImportObject3DForm({
          import: function(opts) {
            UIUtil.popupFileInput(file => {
              scope.loadLocalModel(file, opts);
            });
          },
          warn: function(msg) { scope.showWarning(msg); }
        });
        scope.__importObject3DForm.show();
      }
    }, 'importModel').listen();
    this.datgui.add({
      exportModel: function() {
        var target = scope.getTarget();
        if (target) {
          scope.__exportObject3DForm = scope.__exportObject3DForm || new ExportObject3DForm({
            export: function(target, exporter, exportOpts) { scope.exportModel(target, exporter, exportOpts); },
            warn: function(msg) { scope.showWarning(msg); }
          });
          scope.__exportObject3DForm.show(target);
        } else {
          scope.showWarning('Please load a model before attempting to export model');
        }
      }
    }, 'exportModel').listen();
    this.datgui.add({
      showDisconnected: function() {
        var hasMeshHierarchy = scope.partsPanel && scope.partsPanel.meshHierarchy;
        var object3D = scope.getTargetObject3D();
        if (object3D) {
          object3D = object3D.children[0].children[0];
          var ObjectCleaner = require('geo/ObjectCleaner');
          var disconnected = ObjectCleaner.identifyDisconnectedPieces(object3D);
          if (disconnected.length && hasMeshHierarchy) {
            scope.partsPanel.meshHierarchy.selectObjectNodes(disconnected, object3D);
          } else {
            scope.showMessage(disconnected.length? 'Identified ' + disconnected.length + ' disconnected pieces'
              : 'No disconnected pieces');
          }
        }
      }
    }, 'showDisconnected').listen();
    this.datgui.add({
      showBillboards: function() {
        var hasMeshHierarchy = scope.partsPanel && scope.partsPanel.meshHierarchy;
        var object3D = scope.getTargetObject3D();
        if (object3D) {
          object3D = object3D.children[0].children[0];
          var ObjectCleaner = require('geo/ObjectCleaner');
          var billboards = ObjectCleaner.identifyBillboards(object3D);
          if (billboards.length && hasMeshHierarchy) {
            scope.partsPanel.meshHierarchy.selectObjectNodes(billboards, object3D);
          } else {
            scope.showMessage(billboards.length? 'Identified ' + billboards.length + ' billboards' : 'No billboards');
          }
        }
      }
    }, 'showBillboards').listen();
    this.datgui.add({
      showAttachmentCandidates: function() {
        var object3D = scope.getTargetObject3D();
        if (object3D) {
          var ModelUtil = require('model/ModelUtil');
          var modelInfo = scope.getTarget().model.info;
          var waitId = scope.addWaitingToQueue('compute');
          var attachments = ModelUtil.identifyObjectAttachments(object3D, modelInfo, { lineWidth: 1 });
          if (attachments.length > 0) {
            var group = new THREE.Group();
            for (var attachment of attachments) {
              group.add(attachment.vizNode);
            }
            scope.setExtraDebugNode('attachmentContactsBbox', group);
          }
          scope.removeWaiting(waitId,'compute');
        }
      }
    }, 'showAttachmentCandidates').listen();
    this.datgui.add({
      showSupportSurfaces: function() {
        var object3D = scope.getTargetObject3D();
        if (object3D) {
          var ModelUtil = require('model/ModelUtil');
          var waitId = scope.addWaitingToQueue('compute');
          var supportSurfaces = ModelUtil.identifySupportSurfaces(object3D, {},{ lineWidth: 1 });
          if (supportSurfaces.length > 0) {
            console.log('Support surfaces', supportSurfaces);
            console.log('Support surfaces json', supportSurfaces.map(s => s.toJSON()));
            var group = new THREE.Group();
            for (var supportSurface of supportSurfaces) {
              group.add(supportSurface.vizNode);
            }
            scope.setExtraDebugNode('supportSurface', group);
          }
          scope.removeWaiting(waitId,'compute');
        }
      }
    }, 'showSupportSurfaces').listen();
    this.datgui.add({
      clearExtra: function() {
        scope.clearExtraDebugNodes();
      }
    }, 'clearExtra').listen();
    this.datgui.add({
      showOriginal: function() {
        scope.showOriginal();
      }
    }, 'showOriginal').listen();
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
//  var modelInfo = this.assetManager.getLoadModelInfo(source, id, metadata);
  metadata.options = metadata.options || {};
  _.merge(metadata.options, this.defaultLoadOptions);
  this.clearAndLoadModel(metadata);
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
  var target = this.getTarget();
  if (!target) return;

  this.assetManager.refreshAssetInfo(null, target.model.getFullID());
};

ModelViewer.prototype.alignSubmitted = function () {
  var target = this.getTarget();
  if (!target) return;

  this.assetManager.refreshAssetInfo(null, target.model.getFullID());
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
  this.clearModelNodes();
  Object3DUtil.setMatrix(this.modelNodesGroup, new THREE.Matrix4());
  this.scene.remove(this.debugNode);
  this.clearExtraDebugNodes();
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
  var start = new Date().getTime();
  // TODO: Just have one model loading at a time (if there is another model that is loading, cancel it
  this.__currentLoadInfo = modelinfo;

  var scope = this;
  var modelIdOrName = (modelinfo.fullId != null)? modelinfo.fullId :
    (modelinfo.file != null)? modelinfo.file.name : modelinfo.file || '';
  this.assetManager.loadModel(modelinfo, function(err, modelInstance) {
    var end = new Date().getTime();
    var time = end - start;
    console.log('Load time for model: ' + modelIdOrName + ' ' + time);
    if (err) {
      console.error('Error loading model ' + modelIdOrName, err);
    }
    if (scope.__currentLoadInfo === modelinfo) {
      // Still loading this model
      scope.__currentLoadInfo = null;
      if (modelInstance) {
        scope.onModelLoad(modelInstance);
      } else {
        scope.showWarning('Error loading model');
      }
      scope.showLoadingIcon(false);
    } else {
      console.warn('Ignoring model ' + modelIdOrName);
    }
  });
};

ModelViewer.prototype.onModelLoad = function (modelInstance) {
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
    if (this.getActiveTab() === 'parts' && this.partsPanel.meshHierarchy.allowEditHierarchy) {
      this.partsPanel.meshHierarchy.showParts(true);
      Object3DUtil.setVisible(modelInstance.object3D, false);
      keymap.setScope('parts.meshHierarchy');
    }
  }
  if (this.articulationsPanel) {
    this.articulationsPanel.init(modelInstance.object3D);
  }
  if (this.annotationsPanel) {
    this.annotationsPanel.setTarget(modelInstance, false, Object3DUtil.getBoundingBox(modelInstance.object3D));
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
  Object3DUtil.setMatrix(this.modelNodesGroup, modelInstance.getObject3D('Model').matrixWorld);
  this.resetCamera({
    targetBBox: this.getSceneBoundingBox()
  });
  this.cameraControls.saveCameraState(true);
  this.onSceneChanged();
  console.log('Finished loading model', modelInstance.model.info);
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
    case 27: // esc
      if (this.mouseMode) {
        this.mouseMode = null;
      }
      return;
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
        var targetModel = this.getTarget();
        if (targetModel !== null) {
          targetModel.setMaterial(Object3DUtil.getSimpleFalseColorMaterial(this.idCounter++, null));
          console.log('False color id=' + this.idCounter);
        }
      }
      break;
    case 'M':
      if (event.shiftKey) {
        var targetModel = this.getTarget();
        if (targetModel !== null && this.modelMaterialsPanel) {
          this.modelMaterialsPanel.falseColorMaterials = !this.modelMaterialsPanel.falseColorMaterials;
          this.modelMaterialsPanel.update();
        }
      }
      break;
    case 'I':
      if (this.saveImageModifierKey == null || event[this.saveImageModifierKey + 'Key']) {
        this.saveImage();
      }
      break;
    case 'T':
      if (this.allowCameraControlToggle) {
        this.toggleControlType();
      }
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

ModelViewer.prototype.exportModel = function(targetModel, exporter, opts) {
  if (opts.exportSegments) {
    if (this.partsPanel && this.partsPanel.getSegments() && targetModel) {
      this.partsPanel.getSegments().export(exporter, targetModel.model.info.fullId);
    } else {
      this.showWarning('No segments to export');
    }
  } else {
    if (_.get(this, ['partsPanel', 'meshHierarchy', 'isVisible'])) {
      exporter.export(this.partsPanel.meshHierarchy.partsNode, opts);
    } else {
      exporter.export(targetModel.model.object3D, opts);
    }
  }
};

ModelViewer.prototype.showSamplePointsPanel = function(target) {
  this.__samplePointsConfig = this.__samplePointsConfig ||
    { numSamples: 1024 };

  // Requires special bootbox with form support
  var questions = [
    {
      "title": "Number of samples",
      "name": "numSamples",
      "inputType": "number",
      "value": this.__samplePointsConfig.numSamples
    },
  ];
  var scope = this;
  bootbox.form({
    title: 'Sample Points',
    inputs: questions,
    callback: function(results) {
      if (results) {
        _.each(questions, function(q,i) {
          scope.__samplePointsConfig[q.name] = results[i];
        });

        // sample points
        scope.samplePoints(target, scope.__samplePointsConfig);
      }
    }
  });
};

ModelViewer.prototype.showOriginal = function() {
  this.clearExtraDebugNodes();
  this.partsPanel.showOriginal();
};

ModelViewer.prototype.clearExtraDebugNodes = function() {
  _.each(this.extraDebugNodes, (node,name) => {
    this.setExtraDebugNode(name, null);
  });
};

ModelViewer.prototype.setExtraDebugNode = function(name, node) {
  if (this.extraDebugNodes[name] && node !== this.extraDebugNodes[name]) {
    this.debugNode.remove(this.extraDebugNodes[name]);
    Object3DUtil.dispose(this.extraDebugNodes[name]);
  }
  if (node) {
    this.debugNode.add(node);
  }
  this.extraDebugNodes[name] = node;
};

ModelViewer.prototype.clearModelNodes = function() {
  _.each(this.modelNodes, (node,name) => {
    this.setModelNode(name, null);
  });
};

ModelViewer.prototype.setModelNode = function(name, node) {
  if (this.modelNodes[name] && node !== this.modelNodes[name]) {
    this.modelNodesGroup.remove(this.modelNodes[name]);
    Object3DUtil.dispose(this.modelNodes[name]);
  }
  if (node) {
    this.modelNodesGroup.add(node);
  }
  this.modelNodes[name] = node;
};

ModelViewer.prototype.showContactPoint = function(p, visible) {
  var ball = this.modelNodes['contactPoint'];
  if (!ball) {
    var target = this.getTargetObject3D();
    if (target) {
      var color = 'blue';
      target.updateMatrixWorld(true);
      var transform = Object3DUtil.getModelMatrixWorldInverse(target);
      var bbox = Object3DUtil.computeBoundingBox(target, transform);
      var r = bbox.dimensions().length() * 0.01;
      ball = Object3DUtil.makeBall(new THREE.Vector3(), r, color);
      this.setModelNode('contactPoint', ball);
    }
  }
  if (p) {
    if (Array.isArray(p)) {
      ball.position.set(...p);
    } else {
      ball.position.copy(p);
    }
  }
  //console.log('ball position', ball.position, p, visible);
  Object3DUtil.setVisible(ball, visible);
};

ModelViewer.prototype.samplePoints = function(target, opts) {
  var mInstObject3D = target.getObject3D('Model');
  var meshes = Object3DUtil.getMeshList(mInstObject3D);
  var samples = MeshSampling.getMeshesSurfaceSamples(meshes, opts.numSamples);
  var flatSamples = _.flatten(samples);
  var pointSize = Object3DUtil.getBoundingBox(mInstObject3D).radius() / 50;
  //console.log(flatSamples);
  var sampledPoints = new THREE.Group();
  var sphere = new THREE.SphereGeometry(pointSize, 5, 5);
  flatSamples.forEach(function (s) {
    var material = new THREE.MeshPhongMaterial({ color: s.color });
    var m = new THREE.Mesh(sphere, material);
    m.position.copy(s.worldPoint);
    sampledPoints.add(m);
  });
  this.setExtraDebugNode('sampledPoints', sampledPoints);
};

ModelViewer.prototype.fitPartsOBB = function(target, opts) {
  //console.log('fitPartsOBB', opts);
  var OBBFitter = require('geo/OBBFitter');
  var MeshHelpers = require('geo/MeshHelpers');
  var partMeshes = target.getPartMeshes();
  var obbDebugNode = new THREE.Group();
  obbDebugNode.name = "PartObbs";
  for (var i = 0; i < partMeshes.length; i++) {
    var obb = OBBFitter.fitOBB(partMeshes[i], opts);
    obbDebugNode.add(new MeshHelpers.OBB(obb, 'blue').toWireFrame(0.1, 'blue'));
  }
  this.setExtraDebugNode('partObbs', obbDebugNode);
};

ModelViewer.prototype.showCreateVoxelsPanel = function(target) {
  var CreateVoxelsForm = require('ui/modal/CreateVoxelsForm');
  this.__createVoxelsForm = this.__createVoxelsForm || new CreateVoxelsForm({
    onVoxelsCreated: (colorVoxels) => {
      //colorVoxels.voxelGrid.__compare(partsPanel.colorVoxels.voxelGrid);
      if (this.partsPanel) {
        // Rely on parts panel to manage custom voxels
        this.partsPanel.addCustomVoxels('voxels-color-custom', colorVoxels);
      } else {
        // Track voxels on our own
        this.setExtraDebugNode('colorVoxels', colorVoxels.getVoxelNode());
      }
    }
  });
  this.__createVoxelsForm.show(target);
};

ModelViewer.prototype.showSegmentModelPanel = function(target) {
  var SegmentObjectForm = require('ui/modal/SegmentObjectForm');
  this.__segmentObjectForm = this.__segmentObjectForm || new SegmentObjectForm({
    config: {
      createSegmented: true
    },
    onSegmented: (segmented) => {
      Object3DUtil.applyRandomMaterials(segmented);
      this.setExtraDebugNode('segmentedObject', segmented);
    }
  });
  this.__segmentObjectForm.show(target);
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

ModelViewer.prototype.activateSelectPoint = function(callback, deactivateOnSelected) {
  this.mouseMode = 'selectPoint';
  this.resetMouseMode = deactivateOnSelected;
  if (callback) {
    this.__addEventBasedMouseModeCallback('selectPoint', 'SelectPoint', deactivateOnSelected, callback);
  }
};

ModelViewer.prototype.cancelSelectPoint = function() {
  this.mouseMode = null;
};

ModelViewer.prototype.handleMouseClick = function(event) {
  event.preventDefault();
  var target = this.getTarget();
  if (this.mouseMode === 'positionAgentCamera') {
    if (target) {
      this.positionCameraByAgentHeight(event, [target.object3D]);
    }
    this.mouseMode = null;
  } else if (this.mouseMode === 'selectPoint') {
    if (target) {
      var mouse = this.picker.getCoordinates(this.container, event);
      var intersects = this.picker.getIntersectedDescendants(mouse.x, mouse.y, this.camera, [target.object3D]);
      if (intersects.length > 0) {
        var modelObject3D = target.getObject3D('Model');
        if (modelObject3D) {
          var p = modelObject3D.worldToLocal(intersects[0].point.clone());
          console.log("modelCoordinates", p);
          this.Publish('SelectPoint', { world: intersects[0].point, local: p });
        }
      }
    }
    if (this.resetMouseMode) {
      this.mouseMode = null;
    }
  } else if (target) {
    this.__clickPart(event, target);
  }
};

ModelViewer.prototype.handleMouseMove = function(event) {
  event.preventDefault();
  var target = this.getTarget();
  if (target && this.mouseMode == null) {
    if (!target.object3D.visible && this.partsPanel && this.partsPanel.getDebugNode().visible) {
      var mouse = this.picker.getCoordinates(this.container, event);
      var intersects = this.picker.getIntersectedDescendants(mouse.x, mouse.y, this.camera, [this.partsPanel.getDebugNode()]);
      this.partsPanel.onPartHovered(intersects);
    }
  }
};

ModelViewer.prototype.__clickPart = function(event, target, mode) {
  if (!target.object3D.visible && this.partsPanel && this.partsPanel.getDebugNode().visible) {
    var mouse = this.picker.getCoordinates(this.container, event);
    var intersects = this.picker.getIntersectedDescendants(mouse.x, mouse.y, this.camera, [this.partsPanel.getDebugNode()]);
    if (intersects.length > 0) {
      if (mode == null) {
        mode = "new";
        if (event.ctrlKey || event.metaKey) {
          mode = "toggle";
        } else if (event.shiftKey) {
          mode = "add";
        }
      }
      this.partsPanel.onPartClicked(intersects, mode);
    }
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
        if (event.ctrlKey || event.metaKey) {
          this.articulateModelInstance(target, intersects[0].object);
        } else {
          var nLightsToggled = target.setLightState(!target.object3D.userData.lightsOn);
          console.log('Toggled ' + nLightsToggled + ' lights.');
        }
      } else if (this.partsPanel.meshHierarchy.partsNode && (event.ctrlKey || event.metaKey)) {
        // also select in partsPanel
        var partsMesh = intersects[0].object;
        this.partsPanel.meshHierarchy.selectObjectNodes(partsMesh, target.object3D.children[0].children[0]);
      } else {
        var mesh = intersects[0].object;
        //console.log('mesh bbox', Object3DUtil.getBoundingBox(mesh));
        if (this.modelMaterialsPanel) {
          this.modelMaterialsPanel.selectMesh(mesh, intersects[0].faceIndex);
        }
        console.log(intersects[0]);
        var modelObject3D = target.getObject3D('Model');
        if (modelObject3D) {
          var p = modelObject3D.worldToLocal(intersects[0].point.clone());
          console.log("modelCoordinates", p);
        }
      }
      return intersects[0];
    } else if (this.partsPanel.allowSelectParts) {
      this.__clickPart(event, target, 'select');
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

ModelViewer.prototype.articulateModelInstance = function (modelInstance, selectedMesh) {
  var selectedArticulated = null;
  if (selectedMesh) {
    var anc = Object3DUtil.findFirstAncestor(selectedMesh, n => n.userData.articulatablePartId != null, true);
    selectedArticulated = anc? anc.ancestor: null;
  }
  if (modelInstance) {
    if (this.articulationsPanel) {
      let widgets;
      if (selectedArticulated) {
        const pid = selectedArticulated.userData.articulatablePartId;
        widgets = this.articulationsPanel.getWidgetsForPart(pid);
      } else {
        widgets = this.articulationsPanel.getWidgets(0);
      }
      widgets.player.toggle();
    } else {
      const capabilities = modelInstance.queryCapabilities(this.assetManager);
      if (capabilities.articulation) {
        var cap = capabilities.articulation;
        //console.log('clicked', clickedMesh.userData);
        if (selectedArticulated) {
          const pid = selectedArticulated.userData.articulatablePartId;
          if (pid === cap.getActivePartId()) {
            cap.toggle();
          } else {
            if (cap.selectPart(pid) >= 0) {
              cap.turnOn();
            } else {
              cap.toggle();
            }
          }
        } else {
          cap.toggle();
        }
      }
    }
  }
};

// Exports
module.exports = ModelViewer;
