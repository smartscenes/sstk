'use strict';

var Constants = require('Constants');
var AssetManager = require('assets/AssetManager');
var PubSub = require('PubSub');
var Picker = require('controls/Picker');
var SceneOperations = require('scene/SceneOperations');
var SceneEditControls = require('controls/SceneEditControls');
var ContextQueryControls = require('controls/ContextQueryControls');
var Object3DUtil = require('geo/Object3DUtil');
var OBBQueryControls = require('controls/OBBQueryControls');
var BBoxQueryControls = require('controls/BBoxQueryControls');
var BBoxQueryTutorial = require('controls/BBoxQueryTutorial');
var SceneViewerToolbar = require('scene-viewer/SceneViewerToolbar');
var UndoStack = require('scene-viewer/SceneViewerUndoStack');
var UILog = require('editor/UILog');
var SearchController = require('search/SearchController');
var SolrQuerySuggester = require('search/SolrQuerySuggester');
var ModelSchema = require('model/ModelSchema');
var ModelInstance = require('model/ModelInstance');
var keymap = require('controls/keymap');
var _ = require('util');

/**
 * Scene edit ui
 * @constructor
 */
function SceneEditUI(params) {
  PubSub.call(this);
  var defaults = {
    allowEdit: false,
    selectMode: false,
    supportSurfaceChange: Constants.EditStrategy.SupportSurfaceChange.SWITCH_ATTACHMENT,
    contextQueryType: SceneEditUI.DefaultContextQueryType,
    highlightMode: SceneEditUI.HighlightSelectedFalseBkOrig
  };
  params = _.defaults(Object.create(null), params, defaults);

  this.sceneState = null;

  this.app = params.app;
  this.editPanel = params.editPanel;
  this.assetManager = params.assetManager;
  this.modelSearchController = params.modelSearchController;
  //this.textureSearchController = params.textureSearchController;
  this.cameraControls = params.cameraControls;
  this.sceneOperations = new SceneOperations({ assetManager: this.assetManager });

  this.modelSources = params.modelSources;
  this.__restrictModels = params.restrictModels;

  // Main edit controls
  this.editControls = null;
  this.picker = null;
  // undo stack
  this.undoStack = null;
  // uilog
  this.uilog = null;
  this.enableUILog = params.enableUILog;

  this.selectMode = params.selectMode;
  this.checkSelectModeFn = params.checkSelectModeFn;
  this.objectSelectMode = false;  // TODO: Rename as insert object as selected
  this.allowEdit = params.allowEdit;
  this.editMode = (params.editMode != undefined)? params.editMode : params.allowEdit;
  this.supportSurfaceChange = params.supportSurfaceChange;

  this.allowSelectMode = (params.allowSelectMode !== undefined) ? params.allowSelectMode : false;
  this.allowBBoxQuery = (params.allowBBoxQuery !== undefined) ? params.allowBBoxQuery : false;
  this.allowHighlightMode = (params.allowHighlightMode !== undefined) ? params.allowHighlightMode : false;
  this.allowCopyPaste = (params.allowCopyPaste !== undefined) ? params.allowCopyPaste : true;
  this.allowRotation = (params.allowRotation !== undefined) ? params.allowRotation : true;
  this.allowScaling = (params.allowScaling !== undefined) ? params.allowScaling : true;
  this.allowSelectGroups = (params.allowSelectGroups !== undefined) ? params.allowSelectGroups : false;
  this.allowEditAny = (params.allowEditAny !== undefined) ? params.allowEditAny : false;
  this.rotateBy = params.rotateBy;

  this.restrictSelectToModels = params.restrictSelectToModels;

  // Options for context query
  this.__contextQueryType = params.contextQueryType;
  var defaultContextQueryOptions = SceneEditUI.DefaultContextQueryOptions[this.__contextQueryType];
  this.__contextQueryOptions = _.defaultsDeep(Object.create(null), params.contextQueryOptions, defaultContextQueryOptions);
  this.contextQueryIsEnabled = params.contextQueryIsEnabled || true;

  this.modelIsLoading = false;

  // Highlight modes and select materials
  // TODO: cleanup highlight vs select terminology
  // Material to use for a selected object
  // If not specified, a different color is used for each selected object
  this.selectedObjectMaterial = params.selectedObjectMaterial;
  this.highlightMode = SceneEditUI.HighlightSelectedFalseBkOrig;
  var c = new THREE.Color();
  c.setRGB(0.5, 0.5, 0.5);
  this.__falseBkMaterial = Object3DUtil.getSimpleFalseColorMaterial(0, c);
  this.__hiddenMaterial = Object3DUtil.ClearMat;

  this.__initialized = false;
}

SceneEditUI.DefaultContextQueryOptions = {
  // Defaults for one-click ContextQueryControls
  'one-click': {
    contextQueryControls: ContextQueryControls,
    autoAdjustCamera: false,
    useScenePriors: true,
    useSuggestedPlacements: true,
    useOrientationPriors: true,
    showPriorsViz: false,
    groupCategories: true,
    allowGroupExpansion: true,
    representativeModelsFilter: 'category:_StanfordSceneDBModels',
    source: 'wss'
  },
  // Defaults for simple BBoxQueryControls (no priors)
  'bbox': {
    contextQueryControls: BBoxQueryControls,
    autoAdjustCamera: false,
    useScenePriors: false,
    groupCategories: true,
    allowGroupExpansion: true,
    source: '3dw'
  },
  'obb': {
    contextQueryControls: OBBQueryControls,
    autoAdjustCamera: false,
    useScenePriors: false,
    groupCategories: true,
    allowGroupExpansion: true,
    source: '3dw'
  }
};

SceneEditUI.DefaultContextQueryType = 'one-click';

SceneEditUI.HighlightSelectedFalseBkOrig = 0;  // Selected object is false material, background orig material
SceneEditUI.HighlightSelectedFalseBkFalse = 1;  // Selected object is false material, background false material
SceneEditUI.HighlightSelectedOrigBkFalse = 2;  // Selected object is original material, background false material
SceneEditUI.HighlightModesCount = 3;

SceneEditUI.prototype = Object.create(PubSub.prototype);
SceneEditUI.prototype.constructor = SceneEditUI;

Object.defineProperty(SceneEditUI.prototype, 'restrictModels', {
  get: function () { return this.__restrictModels; },
  set: function (v) {
    this.__restrictModels = v;
    if (this.modelSearchController) {
      this.modelSearchController.setFilter(Constants.assetTypeModel, v);
    }
    if (this.contextQueryControls) {
      this.contextQueryControls.searchController.setFilter(Constants.assetTypeModel, v);
    }
  }
});

SceneEditUI.prototype.show = function() {
  if (this.toolbar) {
    this.toolbar.show();
  }
  if (this.editPanel) {
    this.editPanel.show();
  }
};

SceneEditUI.prototype.hide = function() {
  console.log('hide edit ui');
  if (this.toolbar) {
    this.toolbar.hide();
  }
  if (this.editPanel) {
    this.editPanel.hide();
  }
};

SceneEditUI.prototype.onResize = function(options) {
  this.modelSearchController.onResize(options);
};

SceneEditUI.prototype.createToolbar = function(opts) {
  // Hookup toolbar
  opts = _.defaults(Object.create(null), opts || {}, {
    container: $('#sceneToolbar'),
    iconsPath: Constants.toolbarIconsDir
  });
  var toolbar = new SceneViewerToolbar({
    app: this,
    container: opts.container,
    iconsPath: opts.iconsPath,
    allowEdit: this.allowEdit
  });
  toolbar.init();
  toolbar.applyOptions(opts);
  return toolbar;
};

SceneEditUI.prototype.createModelSearchController = function(opts) {
  var scope = this;
  opts = _.defaults(Object.create(null), opts || {}, {
    searchSucceededCallback: function(source, resultList) {
      scope.assetManager.cacheModelInfos(source, resultList);
    },
    getImagePreviewUrlCallback: this.assetManager.getImagePreviewUrl.bind(this.assetManager),
    onMousedownResultCallback: this.__modelSearchResultClickedCallback.bind(this),  // NOTE: instead of onClick to allow dragging into scene
    // Some reasonable defaults
    sources: this.modelSources || Constants.assetSources.model,
    restrictModels: this.restrictModels,
    allowGroupExpansion: true,
    searchPanel: $('#modelSearchPanel'),
    previewImageIndex: 13,
    panelType: 'side',
    tooltipIncludeAll: false,
    loadImagesLazy: true,
    showSearchOptions: true,
    showSearchSourceOption: true,
    showSearchSortOption: false,
    sortOrder: 'score desc',
    additionalSortOrder: 'id asc',
    entriesPerRow: 2
  });
  var modelSearchController = new SearchController(opts);
  modelSearchController.searchPanel.setAutocomplete(
    new SolrQuerySuggester({
      schema: new ModelSchema()
    })
  );
  if (opts.restrictModels) {
    modelSearchController.setFilter(Constants.assetTypeModel, opts.restrictModels);
  }
  modelSearchController.Subscribe('startSearch', this, function (query) {
    scope.uilog.log(UILog.EVENT.SEARCH_QUERY, null, { type: 'model', queryString: query });
  });
  return modelSearchController;
};

SceneEditUI.prototype.init = function () {
  if (!this.__initialized) {
    this.undoStack = new UndoStack(this, Constants.undoStackMaxSize);
    if (!this.uilog) {
      this.uilog = new UILog({ enabled: this.enableUILog });
    }
    var scope = this;

    //PICKER
    this.picker = new Picker({
      highlightMaterial: this.highlightMaterial,
      colorObject: function (object3D, highlighted, highlightMaterial) {
        // Recolor objects to indicate highlight or no highlight
        if (highlighted) {
          Object3DUtil.setMaterial(object3D, highlightMaterial, Object3DUtil.MaterialsAll, true);
        } else {
          scope.__revertObjectMaterials(object3D);
          scope.__updateObjectMaterial(object3D);
        }
      }
    });

    // Setup edit controls and event listeners
    this.__setupEditControls();
    this.__setupEventListeners(this.app.renderer.domElement);

    if (!this.modelSearchController) {
      this.modelSearchController = this.createModelSearchController();
    }
    if (!this.toolbar) {
      this.toolbar = this.createToolbar();
    }
    this.__initialized = true;
  }
};

/**
 * Setup the edit controls
 * @private
 */
SceneEditUI.prototype.__setupEditControls = function () {
  this.editControls = new SceneEditControls({
    app: this,
    container: this.app.container,
    picker: this.picker,
    cameraControls: this.cameraControls,
    scene: this.sceneState? this.sceneState.fullScene : null,
    enabled: this.editMode,
    useThreeTransformControls: false,
    supportSurfaceChange: this.supportSurfaceChange,
    uilog: this.uilog,
    allowRotation: this.allowRotation,
    allowScaling: this.allowScaling,
    rotateBy: this.rotateBy,
    allowAny: this.allowEditAny
  });
  this.__initContextQueryControls();
  this.app.addControl(this.editControls);
  this.Subscribe(Constants.EDIT_OPSTATE.INIT, this, this.onEditOpInit.bind(this));
  this.Subscribe(Constants.EDIT_OPSTATE.DONE, this, this.onEditOpDone.bind(this));
};

function __wrappedEventListener(cb) {
  return function(event) {
    var r = cb(event);
    if (r === false) {
      event.stopImmediatePropagation();
      event.stopPropagation();
    }
    return r;
  };
}

SceneEditUI.prototype.__setupEventListeners = function (domElement) {
  var scope = this;
  this.bindKeys(domElement);
  domElement.addEventListener('mouseup', __wrappedEventListener(function (event) {
      event.preventDefault();
      domElement.focus();
      if (event.which === Constants.LEFT_MOUSE_BTN) {
        if (scope.selectMode) {
          scope.selectClicked(event);
        } else if (scope.editMode) {
          if (scope.contextQueryIsEnabled && scope.contextQueryControls && event.shiftKey) {
            scope.setContextQueryActive(true);
            scope.contextQueryControls.onDocumentMouseUp(event);
            return false;
          } else {
            return scope.editControls.onMouseUp(event);
          }
        }
      }
    }),
    false
  );

  domElement.addEventListener('mousedown', __wrappedEventListener(function (event) {
      domElement.focus();
      if (event.which === Constants.LEFT_MOUSE_BTN) {
        if (scope.editMode) {
          if (scope.contextQueryIsEnabled && scope.contextQueryControls && event.shiftKey) {
            scope.contextQueryControls.onDocumentMouseDown(event);
            return false;
          } else {
            return scope.editControls.onMouseDown(event);
          }
        }
      }
    }),
    false
  );

  domElement.addEventListener('mousemove', __wrappedEventListener(function (event) {
      event.preventDefault();
      domElement.focus();
      if (event.which !== Constants.RIGHT_MOUSE_BTN) {
        if (scope.editMode) {
          if (scope.contextQueryIsEnabled && scope.contextQueryControls && event.shiftKey) {
            scope.container.style.cursor = scope.contextQueryControls.mouseMoveCursor;
            scope.contextQueryControls.onDocumentMouseMove(event);
            return false;
          } else {
            return scope.editControls.onMouseMove(event);
          }
        }
      }
    }),
    false
  );

  domElement.addEventListener('mouseleave', function (event) {
    if (scope.editMode) {
      scope.editControls.onMouseLeave(event);
    }
  });

  domElement.addEventListener('dblclick', function(event) {
    if (event.shiftKey) {
      scope.actOnClicked(event);
    } else {
      // Hack to keep stuff selected
      if (scope.selectMode) {
        scope.selectClicked(event);
      }
      // if (scope.allowLookAt) {
      //   // Look at clicked
      //   scope.lookAtClicked(event);
      // }
    }
  }, false);

  domElement.addEventListener('keyup', function (event) {
    scope.editControls.onKeyUp(event);
  });

  domElement.addEventListener('keydown', this.onKeyDown.bind(this), true);
};

SceneEditUI.prototype.toggleEditMode = function () {
  if (this.allowEdit) {
    this.editMode = !this.editMode;
    this.editControls.enabled = this.editMode;
    if (!this.editMode) {
      this.editControls.detach();
    }
    if (this.selectMode && this.editMode) {
      this.selectMode = false;
      this.toolbar.updateButtonState('Select');
    }
    this.toolbar.updateButtonState('Edit');
  }
};

SceneEditUI.prototype.isEditMode = function () {
  return this.editMode;
};

SceneEditUI.prototype.toggleSelectMode = function () {
  this.selectMode = !this.selectMode;
  if (this.allowEdit) {
    if (this.selectMode && this.editMode) {
      this.editMode = false;
      this.editControls.enabled = this.editMode;
      if (!this.editMode) {
        this.editControls.detach();
      }
      this.toolbar.updateButtonState('Edit');
    }
    this.toolbar.updateButtonState('Select');
  }
};

SceneEditUI.prototype.isSelectMode = function () {
  return this.selectMode;
};

SceneEditUI.prototype.toggleObjectSelectMode = function () {
  this.objectSelectMode = !this.objectSelectMode;
};

SceneEditUI.prototype.isObjectSelectMode = function () {
  return this.objectSelectMode;
};

SceneEditUI.prototype.__contextQueryControlsOnClickResult = function (source, id, result, elem, index) {
  this.uilog.log(UILog.EVENT.CONTEXT_QUERY_SELECT, null,
    { type: 'model', source: source, id: id, index: index }
  );
  this.loadModel(source, id);
};

SceneEditUI.prototype.__initContextQueryControls = function () {
  var options = _.assign(Object.create(null), this.__contextQueryOptions, {
    scene: this.sceneState? this.sceneState.fullScene : null,
    sceneState: this.sceneState,
    picker: this.picker,
    camera: this.cameraControls.camera,
    controls: this.cameraControls,
    uilog: this.uilog,
    container: this.container,
    onCloseCallback: function () { this.setContextQueryActive(false); }.bind(this),
    searchSucceededCallback: this.__searchSucceededContextQuery.bind(this),
    getImagePreviewUrlCallback: this.assetManager.getImagePreviewUrl.bind(this.assetManager),
    onClickResultCallback: this.__contextQueryControlsOnClickResult.bind(this)
  });
  this.contextQueryControls = new this.__contextQueryOptions.contextQueryControls(options);
  this.contextQueryControls.enabled = this.contextQueryIsEnabled;
  if (this.restrictModels) {
    this.contextQueryControls.searchController.setFilter(Constants.assetTypeModel, this.restrictModels);
  }
};

SceneEditUI.prototype.__searchSucceededContextQuery = function (source, resultList) {
  var sourceType = this.assetManager.getSourceDataType(source);
  if (sourceType === 'model') {
    this.assetManager.cacheModelInfos(source, resultList);
    // Pick top choice and load it!
    if (resultList.length > 0 && this.contextQueryControls) {
      if (this.contextQueryControls.isAutoLoadActive) {
        var searchPanel = this.contextQueryControls.searchController.searchPanel;
        searchPanel.selectOnPage(searchPanel.curStart);
      }
    }
  }
};

SceneEditUI.prototype.setIsModelLoading = function (flag) {
  this.modelIsLoading = flag;
  if (flag) {
    $('#loadingModel').css('visibility', 'visible');
  } else {
    $('#loadingModel').css('visibility', 'hidden');
  }
};

SceneEditUI.prototype.setCursorStyle = function (style) {
  this.editControls.setCursorStyle(style);
};

SceneEditUI.prototype.loadModel = function (source, id, opts) {
  this.setCursorStyle('wait');
  this.setIsModelLoading(true);
  var modelId = AssetManager.toFullId(source, id);
  this.uilog.log(UILog.EVENT.MODEL_LOAD, null, { modelId: modelId, progress: 'started' });
  var loadOptions = {
    loadTime: { start: new Date().getTime() }
  };
  if (opts) {
    _.defaults(loadOptions, opts);
  }
  this.assetManager.getModelInstance(source, id, this.onModelLoad.bind(this, loadOptions), this.onModelLoadError.bind(this, modelId));
};

SceneEditUI.prototype.__modelSearchResultClickedCallback = function (source, id, result, elem, index) {
  // Automatically enable editing
  if (this.allowEdit) {
    if (!this.editMode) {
      this.toggleEditMode();
    }
    this.uilog.log(UILog.EVENT.SEARCH_SELECT, null, {type: 'model', source: source, id: id, index: index});
    this.loadModel(source, id);
  }
};

SceneEditUI.prototype.detach = function() {
  // Clear controls
  this.editControls.detach();
  if (this.contextQueryControls) {
    this.contextQueryControls.reset();
  }
};

SceneEditUI.prototype.reset = function (opts) {
  this.sceneState = opts.sceneState || this.sceneState;
  this.cameraControls = opts.cameraControls || this.cameraControls;

  this.editControls.reset({
    scene: this.sceneState.fullScene,
    cameraControls: this.cameraControls
  });
  if (this.contextQueryControls) {
    this.contextQueryControls.reset({
      scene: this.sceneState.fullScene,
      sceneState: this.sceneState,
      sceneType: this.sceneType,
      camera: this.cameraControls.camera,
      controls: this.cameraControls
    });
  }
};

SceneEditUI.prototype.onModelLoadError = function (modelId) {
  this.setCursorStyle('initial');
  this.setIsModelLoading(false);
  this.uilog.log(UILog.EVENT.MODEL_LOAD, null, { modelId: modelId, progress: 'finished', status: 'ERROR' });
};

SceneEditUI.prototype.onShapeInsert = function (obj, opts) {
  var shapeName = opts.shape;
  var transform = opts.transform;
  // Let's create a special model instance for our box
  var model = new Model(obj, { id: shapeName, fullId: 'shape.' + shapeName, source: 'shape', unit: this.virtualUnitToMeters  });
  var modelInstance = model.newInstance(false);
  this.sceneOperations.prepareModelInstance(modelInstance, {
    transform: opts.transform,
    useShadows: this.app.renderer.useShadows,
    enableMirrors: this.enableMirrors,
    assetManager: this.assetManager,
    renderer: this.app.renderer,
    camera: this.cameraControls.camera
  });

  this.Publish("ShapeInserted", modelInstance, {});
  this.sceneState.addObject(modelInstance, true);
  if (this.editControls.enabled) {
    // Adjust using edit controls
    if (opts.enableEditControls) {
      this.editControls.onInsert(modelInstance.object3D);
    }
    obj.visible = true;
    if (this.objectSelectMode) {
      //set as selected
      modelInstance.object3D.userData.isSelected = true;
      this.__updateObjectSelection(modelInstance.object3D);
    }
    this.onSceneUpdated();
  } else {
    // Done
    var objInfo = modelInstance.getUILogInfo(true);
    this.uilog.log(UILog.EVENT.MODEL_INSERT, null, objInfo);
    obj.visible = true;
    this.onSceneUpdated();
  }
  return modelInstance;
};

SceneEditUI.prototype.onModelLoad = function (loadOptions, modelInstance) {
  loadOptions.loadTime.end = new Date().getTime();
  loadOptions.loadTime.duration = loadOptions.loadTime.end - loadOptions.loadTime.start;
  // console.log('Load time for model: ' + loadOptions.loadTime.duration);
  if (loadOptions.useModelCoordFrame) {
    // Set sceneState up/front/unit to model
    this.sceneState.resetCoordFrame(modelInstance.model.getUp(), modelInstance.model.getFront(), modelInstance.model.getUnit());
  }

  this.setIsModelLoading(false);
  this.uilog.log(UILog.EVENT.MODEL_LOAD, null,
    { modelId: modelInstance.model.getFullID(), progress: 'finished', status: 'SUCCESS' });

  this.sceneOperations.prepareModelInstance(modelInstance, {
    alignTo: 'scene',
    sceneState: this.sceneState,
    useShadows: this.app.renderer.useShadows,
    enableMirrors: this.enableMirrors,
    assetManager: this.assetManager,
    renderer: this.app.renderer,
    camera: this.cameraControls.camera
  })
  if (modelInstance.model.getDatasets().length === 0) {
    var resizeTo = 0.25*Constants.metersToVirtualUnit;
    Object3DUtil.rescaleObject3DToFit(modelInstance.object3D, resizeTo, [0.1, 2]);
  }

  this.Publish("ModelLoaded", modelInstance, { loadTime: loadOptions.loadTime });

  // if (modelInstance.model.isScan()) {
  //   this.createSceneWithOneModel(modelInstance, { initModelInstance: false, clearUILog: true, clearUndoStack: true });
  //   return;
  // }

  var obj = modelInstance.object3D;
  var objInfo = modelInstance.getUILogInfo(true);
  if (this.contextQueryControls && this.contextQueryControls.active) {
    // sceneState is updated by the contextQueryControls (old selected modelInstance is removed and new one is added)
    this.contextQueryControls.onReplace(this.sceneState, modelInstance);
    if (this.sceneState.lights.length === 0) {
      // Do some lights and camera initialization for scene
      var sceneBBox = Object3DUtil.getBoundingBox(this.sceneState.scene);
      this.addDefaultLights(sceneBBox);
    }
    obj.visible = true;
    this.onSceneUpdated();

    this.uilog.log(UILog.EVENT.CONTEXT_QUERY_INSERT, null, objInfo);
    this.Publish(Constants.EDIT_OPSTATE.DONE, Constants.CMDTYPE.INSERT);

    if (this.editControlsStateBeforeContextQuery) {
      this.editControls.enabled = this.editControlsStateBeforeContextQuery.editControlsEnabled;
    }
    if (this.editControls.enabled) {
      this.editControls.attach(modelInstance, this.contextQueryControls.placementInfo.attachmentIndex);
    }
  } else {
    if (this.sceneState.getNumberOfObjects() === 0) {
      this.initSceneWithOneModel(modelInstance);
      this.undoStack.clear();
      this.undoStack.pushCurrentState(Constants.CMDTYPE.INIT);
      this.uilog.log(UILog.EVENT.MODEL_INSERT, null, objInfo);
      this.onSceneUpdated();
    } else {
      // Always put model in middle of scene
      var sceneBb = Object3DUtil.getBoundingBox(this.sceneState.scene);
      var center = sceneBb.centroid();
      var sceneCenter = this.sceneState.scene.worldToLocal(center);
      Object3DUtil.placeObject3D(modelInstance.object3D, sceneCenter);
      this.sceneState.addObject(modelInstance);
      if (this.editControls.enabled) {
        // Adjust using edit controls
        this.editControls.onInsert(modelInstance.object3D);
        obj.visible = true;
        if (this.objectSelectMode) {
          //set as selected
          modelInstance.object3D.userData.isSelected = true;
          this.__updateObjectSelection(modelInstance.object3D);
        }
        this.onSceneUpdated();
      } else {
        // Done
        this.uilog.log(UILog.EVENT.MODEL_INSERT, null, objInfo);
        obj.visible = true;
        this.onSceneUpdated();
      }
    }
  }

  this.setCursorStyle('initial');
};

SceneEditUI.prototype.highlightObjects = function (objects) {
  objects = objects || [];
  if (this.highlighted) {
    var unhighlight = this.highlighted.filter(function(x) {
      return objects.indexOf(x) < 0;
    });
    this.picker.unhighlightObjects(unhighlight);
  }
  this.highlighted = objects;
  if (objects) {
    this.picker.highlightObjects(objects);
  }
};

SceneEditUI.prototype.selectClicked = function (event) {
  if (this.checkSelectModeFn && !this.checkSelectModeFn(event)) {
    return;  // Only select if check succeeded
  }
  var clicked = null;
  if (this.restrictSelectToModels) {
    var modelInstance = this.getClickedModelInstance(event);
    if (modelInstance) {
      clicked = modelInstance.object3D;
    }
  } else {
    clicked = this.getClickedObject(event);
  }
  // Toggle whether this model is selected or not
  if (clicked) {
    clicked.userData.isSelected = !clicked.userData.isSelected;
    this.__updateObjectSelection(clicked);
  }
};

SceneEditUI.prototype.actOnClicked = function (event) {
  var selectedModelInstance = this.getClickedModelInstance(event);
  if (selectedModelInstance) {
    var variantId = selectedModelInstance.useNextModelVariant(this.assetManager);
    if (variantId) return; // success!

    // See what else we can do (TODO: precheck)
    var scope = this;
    var object3D = selectedModelInstance.object3D;
    // check if light and toggle
    var nLightsToggled = selectedModelInstance.setLightState(!object3D.userData.lightsOn, this.assetManager);
    console.log('Toggled ' + nLightsToggled + ' lights.');
    if (nLightsToggled) {
      return;  // success!
    }

    // Check for video capability
    var videoCapability = Object3DUtil.getCapability(object3D,
      'video', function() {
        return Object3DUtil.addVideoPlayer(object3D, { assetManager: scope.assetManager });
      });
    if (videoCapability) {
      object3D.videoPlayer.toggle();
    }
  }
};

SceneEditUI.prototype.getClickedModelInstance = function (event) {
  var selectedObject = this.editControls.select(event);
  if (selectedObject) {
    var modelInstance = Object3DUtil.getModelInstance(selectedObject);
    if (modelInstance) {
      return modelInstance;
    }
  }
};

SceneEditUI.prototype.getClickedObject = function (event) {
  var selectedObject = this.editControls.select(event);
  return selectedObject;
};

SceneEditUI.prototype.onEditOpInit = function (command, cmdParams) {
  this.setContextQueryActive(false);
  this.undoStack.prepareDeltaState(command, cmdParams);
};

SceneEditUI.prototype.onEditOpDone = function (command, cmdParams) {
  this.undoStack.pushCurrentState(command, cmdParams);
};

SceneEditUI.prototype.deleteObject = function (obj, event) {
  this.editControls.detach();
  var mInst = Object3DUtil.getModelInstance(obj);
  var index = this.sceneState.modelInstances.indexOf(mInst);
  this.sceneState.removeObjects([index]);
  this.onSceneUpdated();

  var objInfo = mInst.getUILogInfo(true);
  this.uilog.log(UILog.EVENT.MODEL_DELETE, event, objInfo);
  this.undoStack.pushCurrentState(Constants.CMDTYPE.DELETE);
  this.Publish('DeleteObject', obj, mInst);
};

SceneEditUI.prototype.tumbleObject = function (obj, event) {
  var mInst = Object3DUtil.getModelInstance(obj);

  var cmdParams = { object: mInst, tumble: true };
  this.Publish(Constants.EDIT_OPSTATE.INIT, Constants.CMDTYPE.SWITCHFACE, cmdParams);
  Object3DUtil.tumble(obj);
  this.Publish(Constants.EDIT_OPSTATE.DONE, Constants.CMDTYPE.SWITCHFACE, cmdParams);
  var objInfo = mInst.getUILogInfo();
  this.uilog.log(UILog.EVENT.MODEL_TUMBLE, event, objInfo);
};

SceneEditUI.prototype.__revertObjectMaterials = function(object3D, nonrecursive) {
  Object3DUtil.revertMaterials(object3D, nonrecursive, true);
  // if (this.__colorBy && this.__colorBy !== 'original') {
  //   SceneUtil.recolorObject(object3D);
  // }
};

// Object selection
SceneEditUI.prototype.__updateObjectMaterial = function (object3D, material) {
  var useFalseMaterial;
  var m = material;
  switch (this.highlightMode) {
    case SceneEditUI.HighlightSelectedFalseBkFalse:
      useFalseMaterial = true;
      if (!object3D.userData.isSelected) m = this.__falseBkMaterial;
      break;
    case SceneEditUI.HighlightSelectedOrigBkFalse:
      useFalseMaterial = !object3D.userData.isSelected;
      if (!object3D.userData.isSelected) m = this.__falseBkMaterial;
      break;
    case SceneEditUI.HighlightSelectedFalseBkOrig:
      useFalseMaterial = object3D.userData.isSelected;
      break;
  }
  var nonrecursive = !this.allowSelectGroups;
  if (useFalseMaterial) {
    if (!(m instanceof THREE.Material)) {
      m = this.selectedObjectMaterial || Object3DUtil.getSimpleFalseColorMaterial(m);
    }
    this.__revertObjectMaterials(object3D, nonrecursive);
    Object3DUtil.setMaterial(object3D, m,
      nonrecursive? Object3DUtil.MaterialsAllNonRecursive : Object3DUtil.MaterialsAll, true,
      function(node) {
        return !node.userData.isHidden;  // don't set material for hidden objects
      });
  } else {
    this.__revertObjectMaterials(object3D, nonrecursive);
  }
  // Use clear material for hidden objects
  Object3DUtil.setMaterial(object3D, this.__hiddenMaterial, Object3DUtil.MaterialsAll, true,
    function(node) {
      return node.userData.isHidden;  // set material hidden for hidden objects
    });
};

SceneEditUI.prototype.__updateObjectSelection = function (object3D) {
  var i = this.sceneState.selectedObjects.indexOf(object3D);
  // TODO: Make sure material is not used before...
  if (object3D.userData.isSelected) {
    // Make sure it is in list of selected models
    if (i < 0) {
      i = this.sceneState.selectedObjects.length;
      this.sceneState.selectedObjects.push(object3D);
    }
    this.__updateObjectMaterial(object3D, i + 1);
  } else {
    // Remove from list of selected models
    if (i >= 0) {
      this.sceneState.selectedObjects.splice(i, 1);
    }
    this.__updateObjectMaterial(object3D, this.__falseBkMaterial);
  }
  // Notify scene hierarchy of change in selection
  if (this.sceneHierarchy) {
    this.sceneHierarchy.updateObjectSelection(object3D, object3D.userData.isSelected);
  }
};

SceneEditUI.prototype.clearSelectedObjects = function (opts) {
  this.setSelectedObjects([], opts);
};

// Private clear selected objects
SceneEditUI.prototype.__clearSelectedObjects = function () {
  // Clear the selected models list
  for (var i = 0; i < this.sceneState.selectedObjects.length; i++) {
    var object3D = this.sceneState.selectedObjects[i];
    object3D.userData.isSelected = false;
    this.__updateObjectMaterial(object3D, this.__falseBkMaterial);
  }
  this.sceneState.selectedObjects = [];
};

SceneEditUI.prototype.setSelectedObjects = function (objects, opts) {
  opts = opts || {};
  this.__setSelectedObjects(objects);
  // Notify scene hierarchy of change in selection
  // By default will need to update scene hierarchy about selected object
  if (!opts.suppressNotify) {
    if (this.sceneHierarchy) {
      this.sceneHierarchy.setSelectedObjects(objects);
    }
  }
};
SceneEditUI.prototype.__setSelectedObjects = function (objects) {
  this.__clearSelectedObjects();
  for (var i = 0; i < objects.length; i++) {
    var obj = objects[i];
    obj.userData.isSelected = true;
    this.sceneState.selectedObjects.push(obj);
    this.__updateObjectMaterial(obj, i + 1);
  }
};

SceneEditUI.prototype.setSelectedModels = function (modelIds) {
  // Find first models in scene with specified modelIds and add them to our selectedModels
  var selected = [];
  var modelIdPatt = /(.*)#(\d+)/;
  var indexPatt = /(\d+)/;
  for (var i = 0; i < modelIds.length; i++) {
    var modelId = modelIds[i];
    // If modelId ends with #i then that indicates it is the ith instance
    var match = modelIdPatt.exec(modelId);
    var index = 0;
    if (match) {
      modelId = match[1];
      index = match[2];
    } else {
      var indMatch = indexPatt.exec(modelId);
      if (indMatch) {
        modelId = '';
        index = indMatch[1];
      }
    }
    var modelInstances = this.sceneState.findModelInstances(modelId);
    if (index >= modelInstances.length) {
      console.log('No instance ' + index + ' for model ' + modelId);
      index = 0;
    }
    if (modelInstances.length > 0) {
      var modelInstance = modelInstances[index];
      selected.push(modelInstance.object3D);
    }
  }
  this.setSelectedObjects(selected);
  if (this.highlightMode != undefined) {
    this.__toggleHighlightMode(this.highlightMode);
  }
};

SceneEditUI.prototype.__toggleHighlightMode = function (mode) {
  if (mode !== undefined) {
    this.highlightMode = mode;
  } else {
    this.highlightMode = (this.highlightMode + 1) % SceneEditUI.HighlightModesCount;
  }
  for (var i = 0; i < this.sceneState.modelInstances.length; i++) {
    var modelInstance = this.sceneState.modelInstances[i];
    var si = this.sceneState.selectedObjects.indexOf(modelInstance.object3D);
    this.__updateObjectMaterial(modelInstance.object3D, si + 1);
  }
  for (var i = 0; i < this.sceneState.extraObjects.length; i++) {
    var object3D = this.sceneState.extraObjects[i];
    var si = this.sceneState.selectedObjects.indexOf(object3D);
    this.__updateObjectMaterial(object3D, si + 1);
  }
};

SceneEditUI.prototype.rotateModels = function (modelInstances, axis, delta, bbfaceIndex) {
  for (var i = 0; i < modelInstances.length; i++) {
    var mInst = modelInstances[i];
    var parent = mInst.object3D.parent;
    //Object3DUtil.detachFromParent(mInst.object3D, this.sceneState.fullScene);
    if (bbfaceIndex != undefined) {
      mInst.rotateWrtBBFace(axis, delta, bbfaceIndex);
    } else {
      mInst.rotateAboutAxisSimple(axis, delta, true);
    }
    var objInfo = mInst.getUILogInfo();
    objInfo['rotateBy'] = { axis: axis, rotateBy: delta};
    this.uilog.log(UILog.EVENT.MODEL_ROTATE, null, objInfo);
    //Object3DUtil.attachToParent(mInst.object3D, parent, this.sceneState.fullScene);
  }
};

SceneEditUI.prototype.scaleModels = function (modelInstances, scaleBy, bbfaceIndex) {
  for (var i = 0; i < modelInstances.length; i++) {
    var mInst = modelInstances[i];
    mInst.scaleBy(scaleBy, bbfaceIndex);
    var objInfo = mInst.getUILogInfo();
    objInfo['scaleBy'] = scaleBy;
    this.uilog.log(UILog.EVENT.MODEL_SCALE, null, objInfo);
  }
};

SceneEditUI.prototype.onKeyDown = function (event) {
  if (event.target.type && (event.target.type === 'text' || event.target.type === 'textarea')) return;
  if (this.contextQueryControls && this.contextQueryControls.active) {
    if (event.which === 27) {  // escape
      this.contextQueryControls.reset();
    }
  }
  if (this.editControls) {
    var notHandled = this.editControls.onKeyDown(event);
    if (!notHandled) {
      // Was handled by edit controls
      event.preventDefault();
      return notHandled;
    }
  }
};

SceneEditUI.prototype.bindKeys = function (canvas) {
  var scope = this;
  keymap({ on: 'defmod-z', do: 'Undo', target: canvas }, function (event) {
    scope.undo(event);
  });
  keymap({ on: 'defmod-y', do: 'Redo', target: canvas }, function (event) {
    scope.redo(event);
  });
  if (scope.allowCopyPaste) {
    keymap({on: 'defmod-c', do: 'Copy', target: canvas}, function (event) {
      scope.copy(event);
    });
    keymap({on: 'defmod-x', do: 'Cut', target: canvas}, function (event) {
      scope.cut(event);
    });
    keymap({on: 'defmod-v', do: 'Paste', target: canvas}, function (event) {
      scope.paste(event);
    });
  }
  keymap({ on: 'shift-r', do: 'Replace', target: canvas }, function (event) {
    scope.replace(event);
  });
  keymap({ on: 'shift-s', do: 'Set scene type', target: canvas }, function (event) {
    if (scope.allowBBoxQuery) {
      scope.contextQueryControls.showSceneTypeDialog();
    }
  });
  keymap({ on: 'ctrl-m', do: 'Tumble orientation', target: canvas }, function (event) {
    scope.tumble(event);
  });

  keymap({ on: 'ctrl-b', do: 'Toggle context query mode', target: canvas }, function () {
    scope.toggleContextQueryMode();
  });
};

SceneEditUI.prototype.isContextQueryModeActive = function () {
  return this.contextQueryControls.active;
};

SceneEditUI.prototype.toggleContextQueryMode = function () {
  if (this.contextQueryControls) {
    var flag = !this.contextQueryControls.active;
    if (flag) {
      if (this.allowEdit && !this.editMode) {
        this.toggleEditMode();
      }
    }
    this.setContextQueryActive(flag);
  }
};

SceneEditUI.prototype.setContextQueryActive = function (flag) {
  // TODO: Move some of this logic into contextQueryControls
  if (this.allowBBoxQuery && this.contextQueryControls && this.editMode) {
    if (flag === this.contextQueryControls.active) {
      return;
    }
    if (flag) {
      this.editControls.detach();
      this.editControlsStateBeforeContextQuery = {
        editControlsEnabled: this.editControls.enabled,
        controlsEnabled: this.cameraControls.controls.enabled
      };
      this.editControls.enabled = false;
      this.cameraControls.controls.enabled = false;
    } else {
      if (this.editControlsStateBeforeContextQuery) {
        this.editControls.enabled = this.editControlsStateBeforeContextQuery.editControlsEnabled;
        this.cameraControls.controls.enabled = this.editControlsStateBeforeContextQuery.controlsEnabled;
      }
    }
    this.contextQueryControls.active = flag;
  }
};

//COPY + PASTE
SceneEditUI.prototype.copy = function (event) {
  if (this.editControls.selected) {
    var object = this.editControls.selected;
    this.sceneState.assignObjectIndices();
    this.copiedObjectInfo = Object3DUtil.copyObjectWithModelInstances(object, this.sceneState.modelInstances);
    var objInfo = ModelInstance.getUILogInfo(object, true);
    this.uilog.log(UILog.EVENT.MODEL_COPY, event, objInfo);
    this.Publish('CopyCompleted');
  }
};

SceneEditUI.prototype.cut = function (event) {
  // Equivalent to a copy and a delete
  this.copy(event);
  this.delete(event);
};

SceneEditUI.prototype.paste = function (event) {
  var copiedObjectInfo = this.copiedObjectInfo;
  if (copiedObjectInfo) {
    var pastedObjectInfo = Object3DUtil.copyObjectWithModelInstances(copiedObjectInfo.object, copiedObjectInfo.modelInstances);
    this.sceneState.pasteObject(pastedObjectInfo.object, pastedObjectInfo.modelInstances);
    if (this.editControls.enabled) {
      this.editControls.onInsert(pastedObjectInfo.object);
    }
    var newModelInst = Object3DUtil.getModelInstance(pastedObjectInfo.object);
    var objInfo = newModelInst.getUILogInfo(true);
    this.uilog.log(UILog.EVENT.MODEL_PASTE, event, objInfo);
    this.Publish('PasteCompleted');
  }
};

SceneEditUI.prototype.undo = function (event) {
  this.undoStack.undo();
  if (this.editControls) {
    this.editControls.update();
  }
  this.uilog.log(UILog.EVENT.UNDOSTACK_UNDO, event, {});
};

SceneEditUI.prototype.redo = function (event) {
  this.undoStack.redo();
  if (this.editControls) {
    this.editControls.update();
  }
  this.uilog.log(UILog.EVENT.UNDOSTACK_REDO, event, {});
};

SceneEditUI.prototype.delete = function (event) {
  this.editControls.deleteSelected(event);
};

SceneEditUI.prototype.tumble = function (event) {
  this.editControls.tumbleSelected(event);
};

SceneEditUI.prototype.replace = function (event) {
  if (this.editControls.selected) {
    this.contextQueryControls.replace(this.editControls.selected,
      { event: event, restrictCategories: true } );
    this.setContextQueryActive(true);
  }
};

SceneEditUI.prototype.getTutorial = function (tutorialName, params) {
  params = params || {};
  params.app = this.app;
  if (tutorialName === 'BBoxQueryTutorial') {
    return new BBoxQueryTutorial(params);
  }

  console.error('Unknown tutorial: ' + tutorialName);
  return null;
};

SceneEditUI.prototype.onSceneUpdated = function() {

};


// Exports
module.exports = SceneEditUI;