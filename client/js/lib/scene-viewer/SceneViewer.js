'use strict';

var Constants = require('Constants');
var Viewer3D = require('Viewer3D');
// Camera and picking
var CameraControls = require('controls/CameraControls');
var Picker = require('controls/Picker');
var Renderer = require('gfx/Renderer');

// Assets
var AssetManager = require('assets/AssetManager');
var AssetGroups = require('assets/AssetGroups');
var SolrQuerySuggester = require('search/SolrQuerySuggester');
var ModelSchema = require('model/ModelSchema');
var SceneSchema = require('scene/SceneSchema');
var SearchController = require('search/SearchController');

// UI panels
var ColorsPanel = require('ui/ColorsPanel');
var ModelSearchPanelHelper = require('ui/ModelSearchPanelHelper');

// Scene editor functionality
var SceneOperations = require('scene/SceneOperations');
var SceneGenerator = require('scene/SceneGenerator');
var SceneAnnotate = require('ui/SceneAnnotate');
var SceneVoxels = require('scene/SceneVoxels');
var SceneState = require('scene/SceneState');
var SceneUtil = require('scene/SceneUtil');
var SceneEditControls = require('controls/SceneEditControls');
var SceneViewerToolbar = require('scene-viewer/SceneViewerToolbar');
var UndoStack = require('scene-viewer/SceneViewerUndoStack');
var UILog = require('editor/UILog');

// Scene hierarchy UI
var SceneHierarchyPanel = require('scene/SceneHierarchyPanel');
var BVHVisualizer = require('ui/BVHVisualizer');

// Query controls
var ContextQueryControls = require('controls/ContextQueryControls');
var OBBQueryControls = require('controls/OBBQueryControls');
var BBoxQueryControls = require('controls/BBoxQueryControls');
var BBoxQueryTutorial = require('controls/BBoxQueryTutorial');

// Camera controls
var CameraControlsPanel = require('controls/CameraControlsPanel');

// Model data structures
var Model = require('model/Model');
var ModelInstance = require('model/ModelInstance');
var ModelInfoFilter = require('model/ModelInfoFilter');

// Object3D functions
var Object3DUtil = require('geo/Object3DUtil');
var MeshHelpers = require('geo/MeshHelpers');
var OBJMTLExporter = require('exporters/OBJMTLExporter');

// Advanced functionality
var VisualizeParts = require('scene-viewer/VisualizeParts');
var ExportSceneForm = require('ui/modal/ExportSceneForm');
var ViewOptimizer = require('gfx/ViewOptimizer');
var Character = require('anim/Character');

// Util
var FileUtil = require('io/FileUtil');
var TabsControl = require('ui/TabsControl');
var UIUtil = require('ui/UIUtil');
var keymap = require('controls/keymap');
var _ = require('util/util');
var async = require('async');

require('jquery-console');
require('jquery-lazy');

SceneViewer.HighlightSelectedFalseBkOrig = 0;  // Selected object is false material, background orig material
SceneViewer.HighlightSelectedFalseBkFalse = 1;  // Selected object is false material, background false material
SceneViewer.HighlightSelectedOrigBkFalse = 2;  // Selected object is original material, background false material
SceneViewer.HighlightModesCount = 3;

SceneViewer.ControlTypes = ['orbitRightClick', 'firstPerson', 'pointerLock'];
SceneViewer.ControlTypesMap = _.invert(SceneViewer.ControlTypes);

SceneViewer.WAIT = Object.freeze({
  LOAD_MODEL: 'loadModel',
  LOAD_SCENE: 'loadScene'
});

/**
 * Default reasonable, context query control options for each context control.
 * @type {{one-click: {contextQueryControls: *, autoAdjustCamera: boolean, useScenePriors: boolean, useSuggestedPlacements: boolean, useOrientationPriors: boolean, showPriorsViz: boolean, groupCategories: boolean, allowGroupExpansion: boolean, representativeModelsFilter: string, source: string}, bbox: {contextQueryControls: *, autoAdjustCamera: boolean, useScenePriors: boolean, groupCategories: boolean, allowGroupExpansion: boolean, source: string}, obb: {contextQueryControls: *, autoAdjustCamera: boolean, useScenePriors: boolean, groupCategories: boolean, allowGroupExpansion: boolean, source: string}}}
 */
SceneViewer.DefaultContextQueryOptions = {
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

SceneViewer.DefaultContextQueryType = 'one-click';

/**
 * An SceneViewer supports viewing and editing of scenes
 * Many functions of the SceneViewer can be turned on/off by setting the appropriate boolean flag (or url parameter).
 * TODO: Make editing functionality part of a SceneEditor (a subclass of SceneViewer)
 *
 * The SceneViewer publishes the following events
 * <ul>
 *   <li>SceneLoaded: sceneState, {loadTime: number}, scene was loaded</li>
 *   <li>SceneRestore: sceneState, {loadTime: number}, scene was restored (after undo/redo)</li>
 *   <li>ModelLoaded: modelInstance, {loadTime: number}, scene was loaded</li>
 *   <li>ShapeInserted: modelInstance, shape was inserted</li>
 *   <li>ObjectPlaced: modelInstance, {opType: string}, object was placed (due to either MOVE or INSERT)</li>
 *   <li>CopyCompleted: copy completed</li>
 *   <li>PasteCompleted: paste completed</li>
 *   <li>EDIT_INIT: edit operation started</li>
 *   <li>EDIT_DONE: edit operation finished</li>
 *   <li>ObjectInsertCancelled: Object insert operation has been cancelled</li>
 *   <li>SelectedInstanceChanged: An object has been selected by the SceneEditControls.</li>
 *   <li>HighlightChanged: An object has been highlighted/unhighlighted by mouse hover</li>
 * </ul>
 * @param params Configuration
 * @param [params.allowEdit=false] {boolean} Whether to allow editor functionality.  Set to false to for view only mode.
 * @param [params.allowEditHierarchy=false] {boolean} Whether to allow editing of scene hierarchy as tree from scene hierarchy panel.
 * @param [params.allowScaling=true] {boolean} If allowEdit is true, whether to allow scaling of objects.
 * @param [params.allowRotation=true] {boolean} If allowEdit is true, Whether to allow rotation of objects.
 * @param [params.rotateBy=Math.PI/32] {number} Amount to rotate by (when using key presses) in radians (used if allowEdit and allowRotation).
 * @param [params.freezeObjects=false] {boolean} If allowEdit is tree, whether existing objects in the scene are frozen.
 *    If set to true, then new objects can be added and positioned, but initial objects are fixed in place.
 * @param [params.supportSurfaceChange=Constants.EditStrategy.SupportSurfaceChange.SWITCH_ATTACHMENT] What to do when the support surface changes.
 *   The scene viewer supports the following:
 *     NONE (attachment point remains unchanged),
 *     SWITCH_ATTACHMENT (attachment point automatically switches to contacting surface)
 *     REORIENT_CHILD (attachment point remains unchanged, child object - the object being moved - is automatically reoriented for the new contact surface)
 *
 * @param [params.allowBBoxQuery=false] {boolean} Whether to allow context queries support (TODO: rename to allowContextQuery)
 * @param [params.contextQueryType='one-click'] {string} Type of context query to use
 *   The scene viewer supports the following:
 *     'one-click' - Basic context based query control using {@link controls.ContextQueryControls} that is initiated with one-click (shift-left-click).
 *     'bbox' - Query control using user draw bounding box {@link controls.BBoxQueryControls}
 *     'obb' - Query control using existing OBB {@link controls.OBBQueryControls}
 * @param [params.contextQueryOptions] {Object} Additional options for context query support
 *   (see specific ContextQueryControls for options, and {@link SceneViewer.DefaultContextQueryOptions} for defaults)
 * @param [params.contextQueryIsEnabled=true} {boolean} If context queries supported, whether it is enabled.
 *
 * @param [params.allowSelectMode=false] {boolean} Whether a special select mode where objects can be clicked and explicitly selected and colored in is supported.
 * @param [params.selectMode=false] {boolean} If allowSelectMode, whether selectMode is active.
 *
 * @param [params.allowConsole=false] {boolean} Whether console (for text to scene) is supported.
 * @param [params.allowSave=false] {boolean} Whether hooks for saving is supported.
 * @param [params.allowClose=false] {boolean} Whether hooks for closing is supported.
 * @param [params.allowScenePrevNext=false] {boolean} Whether shortcuts for going to previous/next scene is supported.
 * @param [params.allowHighlightMode=false] {boolean}
 * @param [params.allowMagicColors=true] {boolean}
 * @param [params.allowLookAt=true] {boolean} Whether look at object on double click is supported.
 * @param [params.allowSelectGroups=true] {boolean}
 * @param [params.allowCopyPaste=true] {boolean} Whether copy/paste is allowed.
 *
 * @param [params.defaultSceneFormat=wss] {string} Default loading format for scenes
 * @param [params.format=params.defaultSceneFormat] {string} Loading format for scenes (url parameter)
 * @param [params.defaultModelFormat=utf8v2] {string} Default loading format for models
 * @param [params.modelFormat=params.defaultModelFormat] {string} Loading format for models (url parameter)
 * @param [params.showSceneVoxels=false] {boolean} Whether scene voxels are shown
 * @param [params.isScanSupport=false] {boolean} Whether a scan is allowed to be a support object
 *
 * @param [params.emptyRoom=false] {boolean} Load just the empty room (only walls, ceilings, floors, windows, doors)
 * @param [params.archOnly=false] {boolean} Load the architectural elements (includes columns, partitions, stairs, etc)
 * @param [params.replaceDoors=false] {boolean} Replace doors with just door frames
 * @param [params.useVariants=false] {boolean} Use appropriate variants of models
 * @param [params.includeCeiling=true] {boolean} Include ceiling
 * @param [params.showCeiling=false] {boolean} Show ceiling
 * @param [params.keepInvalid=false] {boolean} Also load nodes that are marked as invalid (typically not needed)
 * @param [params.keepHidden=false] {boolean} Also load nodes that are marked as hidden (typically not needed)
 * @param [params.keepParse=false] {boolean} Keep extra parse information associated with each node (used for debugging)
 * @param [params.loadAll=false] {boolean} Whether all levels/rooms should be loaded even if specific level/room specified.
 * @param [params.attachWallsToRooms=true] {boolean} Associated walls with rooms in scene hierarchy.
 * @param [params.textureSet='all'] {string} Texture set used in retexturing.
 * @param [params.texturedObjects=Constants.defaultTexturedObjects] {string[]} Array of categories that should be retextured with a texture (instead of just a color)
 *
 * @param [params.viewMode] {string} Specify '2d' to use top down orthographic view
 * @param [params.colorBy='original'] {string} Special coloring to use
 * @param [params.autoLoadScene=false] {boolean} Whether to automatically load first search result
 * @param [params.autoLoadVideo=false] {boolean} Whether to automatically load video textures (used on TVs)
 * @param [params.enableLights=false] {boolean} Whether to enable scene lights.  // TODO: Rename to enableSceneLights
 * @param [params.defaultLightState=false] {boolean} If enableLights, initial state of states (set to true to turn on all lights).  TODO: Will not display correctly if too many lights are on at once.
 * @param [params.enableMirrors=false] {boolean} Whether to enable mirrors.
 *
 * @param [params.useSidePanelSearch=true] {boolean} Whether to show search panel on the side.
 * @param [params.showSearchOptions=true] {boolean} Whether to show advanced search options (TODO: refactor into nested options)
 * @param [params.showSearchSourceOption=false] {boolean} Whether search source should be shown (TODO: refactor into nested options)
 * @param [params.restrictScenes] {string} Filter queries (e.g. +datasets:xxx ) for restricting what scenes are shown in the search panel
 * @param [params.restrictModels] {string} Filter queries (e.g. +category:xxx ) for restricting what models are shown in the search panel
 * @param [params.restrictTextures] {string} Filter queries (e.g. +category:xxx ) for restricting what textures are shown in the search panel
 * @param [params.restrictScans] {string} Filter queries (e.g. +category:xxx ) for restricting what scans are shown in the search panel
 * @param [params.restrictArch] {string} Filter queries (e.g. +category:xxx ) for restricting what arch are shown in the search panel
 * @param [params.loadModelFilter] {function} Filter function takes modelinfo and returns whether to load model
 *
 * @param [params.cameraControlIconsDir=Constants.cameraControlIconsDir] {string}
 * @param [params.toolbarIconsDir=Constants.toolbarIconsDir] {string}
 * @param [params.toolbarOptions=Constants.toolbarOptions] {Object}
 * @param [params.selectedObjectMaterial] Material to use for a selected object
 *   If not specified, a different color is used for each selected object
 * @param [params.restrictSelectToModels]
 * @param [params.centerFirstModel=true] {boolean} Whether the first model should be positioned at 0,0,0
 * 
 * @param [params.tabs] {string[]} Array of tab names
 * @param [params.tabsDiv] Jquery element or selector for tabs (default: '#tabs')
 *
 * @constructor SceneViewer
 * @extends Viewer3D
 * @public
 */
function SceneViewer(params) {
  var defaults = {
    appId: 'SceneViewer@0.0.1',
    allowEdit: false,
    selectMode: false,
    materialMode: false,
    includeCeiling: true,
    attachWallsToRooms: true,
    createArch: true,
    supportSurfaceChange: Constants.EditStrategy.SupportSurfaceChange.SWITCH_ATTACHMENT,
    contextQueryType: SceneViewer.DefaultContextQueryType,
    textureSet: 'all',
    texturedObjects: Constants.defaultTexturedObjects,
    centerFirstModel: true,
    colorByOptions: { color: '#fef9ed' },
    allowUndoStack: true,
    useContextQueryControls: false,
    cameraControlTypes: undefined
  };
  this.urlParams = _.getUrlParams();
  if (this.urlParams.config) {
    var sceneConfigs = Constants.config.scene || {};
    if (sceneConfigs[this.urlParams.config]) {
      console.warn('Using config', this.urlParams.config);
      defaults = _.defaultsDeep(Object.create(null), sceneConfigs[this.urlParams.config], defaults);
    } else {
      console.warn('Unknown config', this.urlParams.config);
    }
  }
  params = _.defaultsDeep(Object.create(null), params, defaults);
  var allParams = _.defaultsDeep(Object.create(null), this.urlParams, params);
  Viewer3D.call(this, allParams);

  this.userId = Constants.getGlobalOrDefault('userId', this.urlParams['userId']);
  this.defaultSceneId = allParams.defaultSceneId;
  
  this.sceneState = null;

  this.assetManager = null;
  this.sceneSearchController = null;
  this.modelSearchController = null;
  this.__modelSearchControlers = [];
  this.textureSearchController = null;
  this.scanSearchController = null;
  this.archSearchController = null;
  this.searchControllers = {};

  this.sceneGenerator = null;
  this.sceneHierarchy = null;
  this.bvhVisualizer = null;
  this.picker = null;
  this.selectMode = allParams.selectMode;
  this.centerFirstModel = allParams.centerFirstModel;
  this.checkSelectModeFn = params.checkSelectModeFn;
  this.objectSelectMode = false;
  this.allowEdit = allParams.allowEdit;
  this.editMode = (allParams.editMode != undefined) ? allParams.editMode : allParams.allowEdit;
  this.addInspectModelResultButtons = allParams.inspect;
  this.supportSurfaceChange = allParams.supportSurfaceChange;
  this.supportArticulated = allParams.supportArticulated;
  this.uilog = null;
  this.archName = null;
  
  this.showInstructions = params.showInstructions;
  this.modelViewerUrl = params.modelViewerUrl;
  
  this.onLoadUrl = params.onLoadUrl;
  this.onSaveUrl = params.onSaveUrl;
  this.onCloseUrl = params.onCloseUrl;
  
  this.enableUILog = params.enableUILog;
  
  this.sceneSources = params.sceneSources || Constants.assetSources.scene;
  this.modelSources = params.modelSources;
  this.defaultLoadOptions = allParams['defaultLoadOptions'];
  
  this.useContextQueryControls = (params.useContextQueryControls !== undefined) ? params.useContextQueryControls: false;
  
  this.allowUndoStack = (params.allowUndoStack !== undefined) ? params.allowUndoStack: false;
  this.colorBy = allParams['colorBy'] || 'original';
  this.colorByOptions = allParams.colorByOptions;

  this.allowSave = (params.allowSave !== undefined) ? params.allowSave : false;
  this.allowClose = (params.allowClose !== undefined) ? params.allowClose : false;
  this.allowSelectMode = (params.allowSelectMode !== undefined) ? params.allowSelectMode : false;
  this.allowMaterialMode = (params.allowMaterialMode !== undefined) ? params.allowMaterialMode : false;
  this.allowConsole = (params.allowConsole !== undefined) ? params.allowConsole : false;
  this.allowBBoxQuery = (params.allowBBoxQuery !== undefined) ? params.allowBBoxQuery : false;
  this.allowScenePrevNext = (params.allowScenePrevNext !== undefined) ? params.allowScenePrevNext : false;
  this.allowHighlightMode = (params.allowHighlightMode !== undefined) ? params.allowHighlightMode : false;
  this.allowMagicColors = (params.allowMagicColors !== undefined) ? params.allowMagicColors : true;
  this.allowLookAt = (params.allowLookAt !== undefined) ? params.allowLookAt : true;
  this.allowCopyPaste = (params.allowCopyPaste !== undefined) ? params.allowCopyPaste : true;
  this.useSidePanelSearch = (params.useSidePanelSearch !== undefined) ? params.useSidePanelSearch : true;
  this.showSearchOptions = (params.showSearchOptions !== undefined) ? params.showSearchOptions : true;
  // Override showSearchOptions using urlParams
  if (this.urlParams['showSearchOptions']){
    this.showSearchOptions = true;
  }
  this.showSearchSourceOption = (params.showSearchSourceOption !== undefined) ? params.showSearchSourceOption : false;
  // Custom search options (specified by user)
  this.__customSearchOptions = _.mapValues(Constants.assetTypes, (opts, assetType) => {
    return _.merge({name: assetType}, allParams.searchOptions? allParams.searchOptions[assetType] : {});
  });
  // Actual search options (will include default values)
  this.searchOptions = _.mapValues(this.__customSearchOptions, (opts, assetType) => {
    return _.clone(opts);
  });
  this.cameraControlIconsDir = params.cameraControlIconsDir || Constants.cameraControlIconsDir;
  this.toolbarIconsDir = params.toolbarIconsDir || Constants.toolbarIconsDir;
  this.toolbarOptions = params.toolbarOptions;
  this.allowRotation = (params.allowRotation !== undefined) ? params.allowRotation : true;
  this.allowScaling = (params.allowScaling !== undefined) ? params.allowScaling : true;
  this.allowSelectGroups = (params.allowSelectGroups !== undefined) ? params.allowSelectGroups : false;
  this.allowEditAny = (params.allowEditAny !== undefined) ? params.allowEditAny : false;
  this.rotateBy = params.rotateBy;
  // Filter queries (e.g. +category:xxx ) for restricting what model/scenes are shown the search panel
  this.restrictScenes = params.restrictScenes;
  this.__restrictModels = params.restrictModels;
  this.restrictTextures = params.restrictTextures;
  this.restrictScans = params.restrictScans;
  this.restrictArch = params.restrictArch;
  // Are existing objects in the scene frozen?
  this.freezeObjects = params.freezeObjects;
  // Material to use for a selected object
  // If not specified, a different color is used for each selected object
  this.selectedObjectMaterial = params.selectedObjectMaterial;
  this.restrictSelectToModels = params.restrictSelectToModels;
  // Tabs
  this.__tabsControl = new TabsControl({
    tabs: params.tabs,
    tabsDiv: params.tabsDiv,
    onTabsActivate: params.onTabsActivate,
    onTabActivated: tab => this.__onTabActivated(tab),
    keymap: keymap });
  this.__tabsControl.hookupFunctions(this);

  // filter function takes modelinfo and returns whether to load model
  this.loadModelFilter = params.loadModelFilter;
  if (allParams.loadModelFilter && !_.isFunction(allParams.loadModelFilter)) {
    this.loadModelFilter = ModelInfoFilter.getFilter(allParams);
  }

  // Options for context query
  this.__contextQueryType = allParams.contextQueryType;
  var defaultContextQueryOptions = SceneViewer.DefaultContextQueryOptions[this.__contextQueryType];
  this.__contextQueryOptions = _.defaultsDeep(Object.create(null), params.contextQueryOptions, defaultContextQueryOptions);
  this.contextQueryIsEnabled = params.contextQueryIsEnabled || true;

  this._showModels = true;
  this._showScene = true;
  this._showScan = true;
  this._archOpacity = 1.0;
  this._isScanSupport = allParams.isScanSupport || false;
  this._scanOpacity = 0.5;
  this.isAutoCreateSceneForScan = (allParams.isAutoCreateSceneForScan != null)? allParams.isAutoCreateSceneForScan : true;

  this._showSceneVoxels = (params.showSceneVoxels !== undefined) ? params.showSceneVoxels : false;
  this.controlTypes = (params.cameraControlTypes !== undefined) ? params.cameraControlTypes: SceneViewer.ControlTypes;
  // this.controlTypes = SceneViewer.ControlTypes;

  this.controlTypesMap = SceneViewer.ControlTypesMap;
  this.controlType = this.controlTypes[this._controlTypeIndex];

  this.sceneVoxels = null;

  this.modelIsLoading = false;
  this.loadingQueue = []; // Queue of loading requests

  this.sceneOptions = {};
  this.highlightMode = SceneViewer.HighlightSelectedFalseBkOrig;
  var c = new THREE.Color();
  c.setRGB(0.5, 0.5, 0.5);
  this.falseBkMaterial = Object3DUtil.getSimpleFalseColorMaterial(0, c);
  this.hiddenMaterial = Object3DUtil.ClearMat;
  this.addGround = allParams.addGround || false;
  this.editControls = null;
  this.characterMode = false;

  this.allowEditHierarchy = allParams.allowEditHierarchy;
  this.debugArch = allParams['debugArch'] || false;
  this.isHighlightArchMode = this.debugArch;
  this.highlightSupportArchOnly = false;
  this.autoLoadScene = allParams['autoLoadScene'];
  this.autoLoadVideo = allParams['autoLoadVideo'];
  this.enableLights = allParams['enableLights'];
  this.enableMirrors = allParams['enableMirrors'];
  this.defaultLightState = allParams['defaultLightState'];
  this.defaultViewMode = allParams['viewMode'];
  this.defaultModelFormat = allParams['modelFormat'] || params.defaultModelFormat || 'utf8v2';
  this.defaultSceneFormat = allParams['format'] || params.defaultSceneFormat /* || 'wss' */;
  this.localLoadingFiletypes = allParams['localLoadingFiletypes'] ||
    ['scene', 'model', 'actionTrace', 'navmap', 'wall', 'arch'];
  this.loadAll = allParams['loadAll'];
  this.includeCeiling = allParams['includeCeiling'];
  // Internal flags for showing / hiding certain architectural elements
  this.__showCeiling = allParams.showCeiling || false;
  this.__showGlassWalls = true;
  this.__showRailing = true;
  this.keepInvalid = allParams['keepInvalid'];
  this.keepHidden = allParams['keepHidden'];
  this.keepParse = allParams['keepParse'];
  this.useVariants = allParams['useVariants'];
  this.emptyRoom = allParams['emptyRoom'];
  this.hideCategories = allParams['hideCategories'];
  if (this.hideCategories) {
    this.hideCategories = this.hideCategories.split(',');
  }
  this.archOnly = allParams['archOnly'];
  if (allParams['replaceModels']) {
    if (_.isPlainObject(allParams['replaceModels'])) {
      this.replaceModels = allParams['replaceModels'];
    } else {
      var simConfig = Constants.config.sim || {};
      this.replaceModels = simConfig.replaceModels;
    }
  }
  this.attachWallsToRooms = allParams['attachWallsToRooms'];
  this.createArch = allParams['createArch'];
  this.floor = this.urlParams['floor'];
  if (this.floor === 'all') {
    this.floor = undefined;
  }
  this.loadFloor = this.loadAll ? undefined : this.floor;
  this.room = this.urlParams['room'];
  if (this.room === 'all') {
    this.room = undefined;
  }
  this.loadRoom = this.loadAll ? undefined : this.room;
  this.retexture = {
    textureSet: allParams.textureSet,
    texturedObjects: allParams.texturedObjects
  };

  // navmap stuff
  this.navmapModes = ['tileWeight', 'roomIndex', 'floorHeight'];
  this.navmapModesMap = _.invert(this.navmapModes);
  this.__navmapMode = 0;
  AssetGroups.setDefaultFormat(this.defaultModelFormat);

  // checkboxes in texture panel
  this.floorSelected = false;
  this.wallSelected = false;
  this.ceilingSelected = false;

  this.selectedTextureMaterial = null;
  this.selectedColorMaterial = null;

  // view optimizaer
  this.__viewOptimizer = null;
}


SceneViewer.prototype = Object.create(Viewer3D.prototype);
SceneViewer.prototype.constructor = SceneViewer;

Object.defineProperty(SceneViewer.prototype, 'navmapMode', {
  get: function () { return this.__navmapMode; },
  set: function (v) {
    this.__navmapMode = v;
    if (this.navscene) {
      this.navscene.showMap(this.navmapModes[this.__navmapMode]);
    }
  }
});

Object.defineProperty(SceneViewer.prototype, 'isScanSupport', {
  get: function () { return this._isScanSupport; },
  set: function (v) {
    this._isScanSupport = v;
    // TODO: dynamically change scan to be support object
    // if (this.sceneState) {
    // }
  }
});

Object.defineProperty(SceneViewer.prototype, 'scanOpacity', {
  get: function () { return this._scanOpacity; },
  set: function (v) {
    this._scanOpacity = v;
    this.applyScanOpacity();
  }
});

Object.defineProperty(SceneViewer.prototype, 'showModels', {
  get: function () { return this._showModels; },
  set: function (v) {
    this._showModels = v;
    this.setModelVisibility(function (m) { return !m.model.isScan(); }, v);
  }
});

Object.defineProperty(SceneViewer.prototype, 'showScene', {
  get: function () { return this._showScene; },
  set: function (v) {
    this._showScene = v;
    if (this.sceneState) {
      this.sceneState.scene.visible = v;
    }
  }
});

Object.defineProperty(SceneViewer.prototype, 'showGround', {
  get: function () { return !!(this.ground && this.ground.visible); },
  set: function (v) {
    if (this.ground) {
      this.ground.visible = v;
    }
  }
});

Object.defineProperty(SceneViewer.prototype, 'showScan', {
  get: function () { return this._showScan; },
  set: function (v) {
    this._showScan = v;
    this.setModelVisibility(function (m) { return m.model.isScan(); }, v);
  }
});

Object.defineProperty(SceneViewer.prototype, 'showCeiling', {
  get: function () { return this.__showCeiling; },
  set: function (v) {
    this.__showCeiling = v;
    if (this.sceneState) {
      const nodes = Object3DUtil.findNodes(this.sceneState.scene, function (node) {
        return node.userData.type === 'Ceiling' || node.userData.archType === 'Ceiling';
      });
      for (let node of nodes) {
        const recursive = node.userData.type === 'ModelInstance';
        Object3DUtil.setVisible(node, v, recursive);
      }
    }
  }
});

Object.defineProperty(SceneViewer.prototype, 'showGlassWalls', {
  get: function () { return this.__showGlassWalls; },
  set: function (v) {
    this.__showGlassWalls = v;
    if (this.sceneState) {
      const nodes = Object3DUtil.findNodes(this.sceneState.scene, function (node) {
        return node.userData.type === 'Wall' && node.userData.material === 'Glass';
      });
      for (let node of nodes) {
        Object3DUtil.setVisible(node, v, true);
      }
    }
  }
});

Object.defineProperty(SceneViewer.prototype, 'showRailing', {
  get: function () { return this.__showRailing; },
  set: function (v) {
    this.__showRailing = v;
    if (this.sceneState) {
      const nodes = Object3DUtil.findNodes(this.sceneState.scene, function (node) {
        return node.userData.type === 'Railing';
      });
      for (let node of nodes) {
        Object3DUtil.setVisible(node, v, true);
      }
    }
  }
});

Object.defineProperty(SceneViewer.prototype, 'archOpacity', {
  get: function () { return this._archOpacity; },
  set: function (v) {
    this._archOpacity = v;
    this.__applyArchOpacity(v);
  }
});

Object.defineProperty(SceneViewer.prototype, 'showSceneVoxels', {
  get: function () { return this._showSceneVoxels; },
  set: function (v) {
    this._showSceneVoxels = v;
    if (v) {
      this.sceneVoxels.ensureVoxels();
    }
    Object3DUtil.setVisible(this.scene, !v);
    this.sceneVoxels.setVisible(v);
  }
});

Object.defineProperty(SceneViewer.prototype, 'restrictModels', {
  get: function () { return this.__restrictModels; },
  set: function (v) {
    this.__restrictModels = v;
    this.__modelSearchControllers.forEach(s => {
      s.setFilter(Constants.assetTypeModel, v);
    });
  }
});

Object.defineProperty(SceneViewer.prototype, 'colorBy', {
  get: function () { return this.__colorBy; },
  set: function (v) {
    this.__colorBy = v;
    this.refreshSceneMaterials();
  }
});

Object.defineProperty(SceneViewer.prototype, 'hemisphereLight', {
  get: function () { return this._ambientLights ? _.find(this._ambientLights, x => x.isHemisphereLight) : null; }
});

Object.defineProperty(SceneViewer.prototype, 'ambientLight', {
  get: function () { return this._ambientLights ? _.find(this._ambientLights, x => x.isAmbientLight) : null; }
});

Object.defineProperty(SceneViewer.prototype, 'ambientLightIntensity', {
  get: function () {
    const light = this.ambientLight;
    return light ? light.intensity : 0;
  },
  set: function (v) {
    const light = this.ambientLight;
    if (light) {
      light.intensity = v;
    }
  }
});

Object.defineProperty(SceneViewer.prototype, 'ambientLightColor', {
  get: function () {
    const light = this.ambientLight;
    return light ? light.color.getHexString() : '#ffffff';
  },
  set: function (v) {
    const light = this.ambientLight;
    if (light) {
      light.color.setStyle(v);
    }
  }
});

Object.defineProperty(SceneViewer.prototype, 'hemisphereLightIntensity', {
  get: function () {
    const hemiLight = this.hemisphereLight;
    return hemiLight ? hemiLight.intensity : 0;
  },
  set: function (v) {
    const hemiLight = this.hemisphereLight;
    if (hemiLight) {
      hemiLight.intensity = v;
    }
  }
});

Object.defineProperty(SceneViewer.prototype, 'hemisphereLightColor', {
  get: function () {
    const hemiLight = this.hemisphereLight;
    return hemiLight ? hemiLight.color.getHexString() : '#ffffff';
  },
  set: function (v) {
    const hemiLight = this.hemisphereLight;
    if (hemiLight) {
      hemiLight.color.setStyle(v);
    }
  }
});

Object.defineProperty(SceneViewer.prototype, 'hemisphereLightGround', {
  get: function () {
    const hemiLight = this.hemisphereLight;
    return hemiLight ? hemiLight.groundColor.getHexString() : '#ffffff';
  },
  set: function (v) {
    const hemiLight = this.hemisphereLight;
    if (hemiLight) {
      hemiLight.groundColor.setStyle(v);
    }
  }
});

Object.defineProperty(SceneViewer.prototype, 'characterMode', {
  get: function () { return this.__characterMode; },
  set: function (v) {
    // Create the user's character
    this.__characterMode = v;
    if (this.__characterMode) {
      // Create the user's character
      if (!this.character)
        this.character = new Character({
          material: {
            color: 0x7A43B6
          }
        });
      this.sceneState.fullScene.add(this.character.mesh);
    } else {
      if (this.character) {
        this.sceneState.fullScene.remove(this.character.mesh);
      }
    }
  }
});

SceneViewer.prototype.blockInsert = function(){
  this.blockInserts = true;
};

SceneViewer.prototype.unblockInsert = function(){
  this.blockInserts = false;
};

SceneViewer.prototype.__onTabActivated = function(tab) {
  switch (tab) {
    case 'scenes':
      this.sceneSearchController.onResize();
      break;
    case 'models':
      this.modelSearchController.onResize();
      break;
    case 'textures':
      this.textureSearchController.onResize();
      break;
    case 'arch':
      this.archSearchController.onResize();
      break;
    case 'scans':
      this.scanSearchController.onResize();
      break;
    case 'sceneHierarchy':
      if (this.sceneHierarchy) {
        this.sceneHierarchy.onActivate();
      }
      break;
    case 'bvh':
      if (this.bvhVisualizer) {
        this.bvhVisualizer.onActivate();
      }
      break;
  }
};

SceneViewer.prototype.updateCameraControl = function (index) {
  Viewer3D.prototype.updateCameraControl.call(this, index);
  this.updateEditControls();
};

SceneViewer.prototype.setupDatGui = function () {
  var scope = this;
  if (this.useDatGui) {
    Viewer3D.prototype.setupDatGui.call(this);

    var showAll = !(this.useDatGui instanceof Object);
    var options = (this.useDatGui instanceof Object) ? this.useDatGui : {};
    // Set up dat gui;
    var gui = this.datgui.getFolder('view');
    if (showAll || options['showGround']) gui.add(this, 'showGround').listen();
    if (showAll || options['isScanSupport']) gui.add(this, 'isScanSupport').listen();
    if (showAll || options['isAutoCreateSceneForScan']) {
      gui.add(this, 'isAutoCreateSceneForScan').name('createScanScene').listen();
    }
    if (showAll || options['scanOpacity']) gui.add(this, 'scanOpacity', 0, 1.0).listen();
    if (showAll || options['showScan']) gui.add(this, 'showScan').listen();
    if (showAll || options['archOpacity']) gui.add(this, 'archOpacity', 0, 1.0).listen();
    if (showAll || options['showModels']) gui.add(this, 'showModels').listen();
    if (showAll || options['showScene']) gui.add(this, 'showScene').listen();
    if (showAll || options['showSceneVoxels']) gui.add(this, 'showSceneVoxels').listen();
    if (this.allowMagicColors) {
      if (showAll || options['showColors']) {
        // setup coloring submenu
        // TODO: allow reverting to original colors
        var supportedColorByTypes = ['original'].concat(SceneUtil.ColorByTypes);
        var allowSplitColors = this.colorByOptions.object && this.colorByOptions.arch;
        if (allowSplitColors) {
          supportedColorByTypes.push('splitColors');
        }
        var colorsGui = this.datgui.getFolder('coloring');
        colorsGui.add(this, 'colorBy', supportedColorByTypes).listen();
        colorsGui.addColor(this.colorByOptions, 'color').listen().onChange(() => {
          if (this.colorBy === 'color') {
            this.refreshSceneMaterials();
          }
        });
        if (allowSplitColors) {
          colorsGui.addColor(this.colorByOptions.object, 'color').name('object color').listen().onChange(() => {
            if (this.colorBy === 'splitColors' && this.colorByOptions.object.colorBy === 'color') {
              this.refreshSceneMaterials();
            }
          });
          colorsGui.addColor(this.colorByOptions.arch, 'color').name('arch color').listen().onChange(() => {
            if (this.colorBy === 'splitColors' && this.colorByOptions.arch.colorBy === 'color') {
              this.refreshSceneMaterials();
            }
          });
        }
      }
    }
    if (showAll || options['showWalls']) gui.add(this, 'visualizeWalls').listen();
    if (showAll || options['showNavmap']) gui.add(this, 'visualizeNavmap').listen();
    if (showAll || options['showNavmap']) gui.add(this, 'navmapMode', this.navmapModesMap).listen();
    if (showAll || options['lights']) {
      var lightsGui = this.datgui.getFolder('lights');
      // lightsGui.add(this, 'ambientLightIntensity', 0, 5).step(0.05).listen();
      // lightsGui.addColor(this, 'ambientLightColor').listen();
      lightsGui.add(this, 'hemisphereLightIntensity', 0, 5).step(0.05).listen();
      lightsGui.addColor(this, 'hemisphereLightColor').listen();
      lightsGui.addColor(this, 'hemisphereLightGround').listen();
      lightsGui.add(this, 'useHeadlight').listen();
      lightsGui.add(this._headlights['point'], 'intensity', 0, 2).step(0.05).name('pointLightIntensity').listen();
      lightsGui.addColor(this._headlights['point'], 'colorHex').name('color').listen();
      lightsGui.add(this._headlights['directional'], 'intensity', 0, 2).step(0.05).name('directionalLightIntensity').listen();
      lightsGui.addColor(this._headlights['directional'], 'colorHex').name('color').listen();
    }
    if (showAll || options['controls']) {
      var controls = this.editControls.updateDatGui(this.datgui);
      controls.add(this, 'isHighlightArchMode').name('highlightArch').listen();
      controls.add(this, 'highlightSupportArchOnly').listen();
    }
    if (showAll || options['picker']) {
      var pickerGui = this.datgui.getFolder('picker');
      pickerGui.add(this.picker, 'useHighlightMaterial').listen();
      pickerGui.addColor(this.picker.highlightMaterial, 'colorHex').name('color').listen();
    }
    this.datgui.add({
      exportScene: function() {
        var sceneState = scope.sceneState;
        if (sceneState) {
          scope.__exportSceneForm = scope.__exportSceneForm || new ExportSceneForm({
            export: function(target, exporter, exportOpts) { exporter.export(target, exportOpts); },
            warn: function(msg) { scope.showWarning(msg); }
          });
          scope.__exportSceneForm.show(sceneState);
        }
      }
    }, 'exportScene').listen();
    this.datgui.add({
      createVoxels: function() {
        var sceneState = scope.sceneState;
        if (sceneState) {
          scope.showCreateVoxelsPanel(sceneState);
        } else {
          scope.showWarning('Please load a scene before attempting to create voxels');
        }
      }
    }, 'createVoxels').listen();
    this.datgui.add({
      identifyExteriorDoors: function() {
        var sceneState = scope.sceneState;
        var debug = false;
        if (sceneState) {
          // if (debug) {
          //   var doors = sceneState.findModelInstances(function (mi) {
          //     return mi.model.isDoor();
          //   });
          //   for (var i = 0; i < doors.length; i++) {
          //     var door = doors[i];
          //     var doorObb = door.getSemanticOBB('world');
          //     scope.sceneState.debugNode.add(new MeshHelpers.OBB(doorObb, 'yellow'));
          //   }
          // }
          var exteriorDoors = SceneUtil.identifyExteriorDoors(sceneState, {
            sampleCallback: function(ray, intersects) {
              if (debug) {
                scope.sceneState.debugNode.add(Object3DUtil.makeBall(ray.origin, 0.1, 'green'));
                scope.sceneState.debugNode.add(new MeshHelpers.FatArrow(ray.direction, ray.origin,
                  0.5, 1, 0.25, 0.25,'green'));
                //console.log('check', ray, intersects);
              }
            }
          });
          console.log('got exterior doors', exteriorDoors);
          console.log('got exterior door ids', exteriorDoors.map(x => x.object3D.userData.id));
          scope.setSelectedObjects(exteriorDoors.map(x => x.object3D));
        }
      }
    }, 'identifyExteriorDoors').listen();
    //if (showAll || options['showCharacterMode']) gui.add(this, 'characterMode').name('character').listen();
  }
};

SceneViewer.prototype.showCreateVoxelsPanel = function(target) {
  var CreateVoxelsForm = require('ui/modal/CreateVoxelsForm');
  this.__createVoxelsForm = this.__createVoxelsForm || new CreateVoxelsForm({
    onVoxelsCreated: (colorVoxels) => {
      // Track voxels on our own
      this.sceneState.setExtraDebugNode('colorVoxels', colorVoxels.getVoxelNode());
    }
  });
  this.__createVoxelsForm.show(target);
};


SceneViewer.prototype.registerCustomSceneAssetGroup = function (assetIdsFile, jsonFile, autoLoad) {
  this.registerCustomAssetGroup(this.sceneSearchController, assetIdsFile, jsonFile, autoLoad);
};

SceneViewer.prototype.registerCustomModelAssetGroup = function (assetIdsFile, jsonFile, autoLoad) {
  this.registerCustomAssetGroup(this.modelSearchController, assetIdsFile, jsonFile, autoLoad);
};

SceneViewer.prototype.registerAssets = function (assetFiles, callback) {
  var sceneViewer = this;
  var assetTypes = ['scene', 'scan', 'model', 'texture', 'arch'];
  sceneViewer.assetManager.registerCustomAssetGroups({
    assetFiles: assetFiles,
    filterByType: assetTypes,
    searchController: Constants.NONE,
    callback: function (err, res) {
      var registeredByType = {};
      for (var i = 0; i < assetTypes.length; i++) {
        registeredByType[assetTypes[i]] = [];
      }
      if (res.length) {
        for (var i = 0; i < res.length; i++) {
          var assetGroup = res[i];
          if (assetGroup) {
            var registeredType = assetGroup.type;
            sceneViewer.assetManager.registerAssetGroupWithSearchController(assetGroup, sceneViewer.searchControllers[registeredType]);
            registeredByType[registeredType].push(assetGroup.name);
            console.log('add to ' + registeredType, assetGroup.name);
          }
        }
      }
      for (var i = 0; i < assetTypes.length; i++) {
        console.log('Registered ' + assetTypes[i] + ' ' + registeredByType[assetTypes[i]]);
      }
      if (callback) {
        callback();
      }
    }
  });
};

SceneViewer.prototype.init = function () {
  var scope = this;
  this.setupAssets();
  this.initHeadlights();

  var sceneAnnotateElem = $('#sceneAnnotate');
  if (sceneAnnotateElem.length) {
    this.sceneAnnotate = new SceneAnnotate({
      container: sceneAnnotateElem,
      nextTargetCallback: this.loadNextScene.bind(this),
      onAnnotationSubmittedCallback: this.loadNextScene.bind(this)
    });
  }

  this.sceneGenerator = new SceneGenerator({
    configContainer: $('#sceneGenConfig'),
    succeededCallback: this.generateSucceededCallback.bind(this),
    progressCallback: this.handleSceneGenerateProgress.bind(this),
    failedCallback: this.showError.bind(this)
  });
  this.partVisualizer = new VisualizeParts({});
  this.setupSceneTemplateViewer();
  var generateSceneButton = $('#createSceneButton');
  if (generateSceneButton) {
    // Hook up generate scene description with button
    var sceneDescriptionText = $('#sceneDescription');
    generateSceneButton.click(function () {
      this.sceneGenerator.generate(sceneDescriptionText.val(), this.sceneState);
    }.bind(this));
  }
  var sceneHierarchyContainer = $('#sceneHierarchy');
  if (sceneHierarchyContainer.length) {
    var markNodes;
    if (this.debugArch) {
      markNodes = {
        fields: ['id', 'roomId', 'wallId', 'holeIndex', 'box'],
        marks: [
          { name: 'remove', color: 'gray', shortcut: 'r' },
          { name: 'check', label: 'check needed', color: 'orange', shortcut: 'c' },
          { name: 'good', color: 'green', shortcut: 'g' }
        ],
        additionalMarkFields: [
          // {
          //   "title": "Mark",
          //   "name": "mark",
          //   "inputType": "text"
          // },
          {
            "title": "Label",
            "name": "label",
            "inputType": "text"
          },
          {
            "title": "Note",
            "name": "note",
            "inputType": "text"
          },
          {
            "title": "Object Ids",
            "name": "ids",
            "inputType": "text"
          }
        ],
        action: (object3D, mark) => {
          if (object3D.userData.isWallHole) {
            Object3DUtil.traverse(object3D, function(node) {
              if (node.material) {
                if (mark) {
                  if (!node.material.originalColor) {
                    node.material.originalColor = node.material.color.clone();
                  }
                  node.material.color.set(mark.color);
                } else {
                  if (node.material.originalColor) {
                    node.material.color.copy(node.material.originalColor);
                  }
                }
                return false;
              } else {
                return true;
              }
            });
          }
        }
      };
    }
    var sceneHierarchyOpts = _.defaults(Object.create(null), this.__options.sceneHierarchy,
    {
      container: sceneHierarchyContainer,
      assetManager: this.assetManager,
      tooltipIncludeFields: this.modelSearchController.searchPanel.tooltipIncludeFields,
      getObjectIconUrl: function(source, id, metadata) {
        return scope.assetManager.getImagePreviewUrl(source, id, scope.modelSearchController.searchPanel.previewImageIndex, metadata);
      },
      onhoverCallback: function (node, objects) {
        scope.highlightObjects(objects);
      },
      allowEditScene: this.allowEdit,
      allowEditHierarchy: this.allowEditHierarchy,
      useIcons: true,
      useSort: true,
      autoCreateTree: true,
      markNodes: markNodes,
      app: this
    });
    this.sceneHierarchy = new SceneHierarchyPanel(sceneHierarchyOpts);
  }
  var bvhVisualizerContainer = $('#sceneBVH');
  if (bvhVisualizerContainer.length) {
    this.bvhVisualizer = new BVHVisualizer({
      container: bvhVisualizerContainer,
      tooltipIncludeFields: this.modelSearchController.searchPanel.tooltipIncludeFields,
      onhoverCallback: function (node, objects) {
        scope.highlightObjects(objects);
      },
      useIcons: true,
      useSort: false,
      autoCreateTree: false,
      app: this
    });
  }
  this.setupLoadingIcon();

  this.__tabsControl.initTabs();

  // create empty scene
  this.sceneState = new SceneState();
  this.sceneVoxels = new SceneVoxels();
  this.sceneVoxels.init(this.sceneState, this.showSceneVoxels);
  this.sceneState.fullScene.add(this.sceneVoxels.voxelNode);
  this.addDefaultCameras(); //AndLights();
  //this.cameraControls.saveCameraState();

  this.showAxes = this._drawAxes;

  // Setup undo stack and UI log
  this.setupUndoStack();
  this.setupUILog();

  // Test Scenes
  this.setupTestScenes();

  // Setup local loading buttons
  this.setupLocalLoading(this.loadFromLocal.bind(this), {
    "model": true,
  }, this.localLoadingFiletypes);

  // RENDERER
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
  this.assetManager.maxAnisotropy = this.renderer.getMaxAnisotropy();
  AssetManager.enableCompressedLoading(this.renderer.renderer);

  //PICKER
  this.picker = new Picker({
    camera: this.camera,
    width: this.renderer.width,
    height: this.renderer.height,
    useHighlightMaterial: false,
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
  this.setupEditControls();
  this.setupEventListeners();

  // Setup instructions
  this.setupInstructions();

  this.setupConsole();

  // Hookup camera control panel
  this.setupCameraControlsPanel();

  // Hookup toolbar
  this.setupToolbar();

  // Scene loading
  if (!this.skipLoadInitialScene) {
    this.loadInitialScene();
  }

  var showConsole = this.urlParams['showConsole'];
  if (showConsole) {
    $('#console').show();
  }

  if (this.addGround) {
    this.addGroundToScene();
  }

  window.addEventListener('resize', this.onWindowResize.bind(this), false);
  this.setupDatGui();
  if (this.defaultViewMode === '2d') {
    this.useOrthographicCamera = true;
    this.viewIndex = this.viewNamesMap['top'];
  }
};

SceneViewer.prototype.setupCameraControlsPanel = function() {
  this.cameraControlsPanel = new CameraControlsPanel({
    app: this,
    container: $('#cameraControls'),
    controls: this.cameraControls,
    iconsPath: this.cameraControlIconsDir,
    cameraWidgetSettings: Constants.cameraWidgetSettings
  });
};

SceneViewer.prototype.setupToolbar = function() {
  // Hookup toolbar
  this.toolbar = new SceneViewerToolbar({
    app: this,
    container: $('#sceneToolbar'),
    iconsPath: this.toolbarIconsDir,
  });
  this.toolbar.init();
  this.toolbar.applyOptions(this.toolbarOptions);
};

SceneViewer.prototype.setupUndoStack = function() {
  this.undoStack = null;
  if (this.allowUndoStack) {
    this.undoStack = new UndoStack(this, Constants.undoStackMaxSize);
  }
};

SceneViewer.prototype.setupUILog = function() {
  this.uilog = new UILog({ enabled: this.enableUILog, sessionId: this.sessionId });
  this.uilog.log(UILog.EVENT.SCENE_CREATE, null, {});
};

SceneViewer.prototype.loadInitialScene = function () {
  var sceneId = this.urlParams['sceneId'] || this.defaultSceneId;
  var sceneUrl = this.urlParams['sceneUrl'];
  var query = this.urlParams['query'];
  var source = this.urlParams['source'];
  var skipSearch = this.urlParams['skipSearch'];
  var archId = this.urlParams['archId'];
  var archFormat = this.urlParams['archFormat'];

  if (sceneId || archId || sceneUrl || query) {
    var options = {};
    var highlightMode = this.urlParams['hl'];
    if (highlightMode !== undefined) {
      this.highlightMode = parseInt(highlightMode);
    }
    var selectedModelIds = this.urlParams['selectedModels'];
    if (selectedModelIds) {
      options['selectedModels'] = selectedModelIds.split(',');
    }

    var targetIds = this.urlParams['targetObjectIds'];
    if (targetIds) {
      options['targetObjectIds'] = Array.isArray(targetIds) ? targetIds : targetIds.split(',');
    }

    if (archId) {
      var sid = AssetManager.toSourceId('s3dArch', archId);
      var assetInfo = this.assetManager.getAssetInfo(archId);
      if (archFormat) {
        assetInfo['format'] = archFormat;
      }
      var loadInfo = this.assetManager.getLoadInfo(sid.source, archId, assetInfo);
      this.loadArch(loadInfo);
    } else if (sceneUrl) {
      this.clearAndLoadScene({file: sceneUrl}, options);
    } else if (query) {
      this.setSourceAndSearch(this.sceneSearchController, source || 'scenes', query,
        this.initialSceneSearchSucceeded.bind(this, options));
    } else {
      var sid = AssetManager.toSourceId('scenes', sceneId);
      if (sid.source === 'db' || sid.source === 'mturk' || skipSearch) {
        this.clearAndLoadScene({ fullId: sceneId }, options);
      } else {
        // TODO: Add db/mturk search to search controller...
        var sid = AssetManager.toSourceId(null, sceneId);
        this.sceneOptions[sceneId] = options;
        this.setSourceAndSearch(this.sceneSearchController, sid.source, 'fullId:' + sceneId,
          this.initialSceneSearchSucceeded.bind(this, options));
      }
    }
  }
};

SceneViewer.prototype.setupAssets = function () {
  var scope = this;
  this.assetManager = new AssetManager({
    assetCacheSize: 50,
    autoAlignModels: false,
    autoScaleModels: false,
    autoLoadVideo: this.autoLoadVideo,
    autoLoadLights: !!this.defaultLightState,
    enableLights: this.enableLights,
    defaultLightState: this.defaultLightState,
    supportArticulated: this.supportArticulated,
    useColladaScale: false,
    modelFilter: _.isFunction(scope.loadModelFilter) ? scope.loadModelFilter : null
  });
  this.assetManager.watchDynamicAssets(this, '_dynamicAssets');
  // Hack so we recolor room wss.room01
  this.assetManager.addMaterialBinding('wss.room01', {
    'materials': [
      { name: 'floor', textureId: 'a3dTexture.47237', encoding: THREE.sRGBEncoding },
      { name: 'wall', color: 'aad4ff' },
      { name: 'trim', color: '617991' }],
    'materialMappings': {
      'm0': 'floor',
      'm2': 'wall',
      'm5': 'wall',
      'm6': 'wall',
      'm3': 'trim'
    }
  });
  this.sceneOperations = new SceneOperations({ assetManager: this.assetManager });

  //sceneSearchController
  this.sceneSearchController = new SearchController(_.defaults(this.searchOptions['scene'], {
    assetFilters: { scene: { sourceFilter: '+source:(' + this.sceneSources.join(' OR ') + ')' }},
    searchSucceededCallback: this.sceneSearchSucceeded.bind(this),
    getImagePreviewUrlCallback: this.assetManager.getImagePreviewUrl.bind(this.assetManager),
    onClickResultCallback: function (source, id, sceneinfo) {
      this.clearAndLoadScene(sceneinfo, this.defaultLoadOptions);
    }.bind(this),
    sources: this.sceneSources,
    searchPanel: $('#sceneSearchPanel'),
    loadImagesLazy: true,
    nRows: 33,
    panelType: 'side'
  }));
  this.sceneSearchController.searchPanel.setAutocomplete(
    new SolrQuerySuggester({
      schema: new SceneSchema()
    })
  );
  if (this.restrictScenes) {
    this.sceneSearchController.setFilter(Constants.assetTypeScene, this.restrictScenes);
  }
  this.sceneSearchController.Subscribe('SearchSucceededPreparePanel', null, function () {
    scope.activateTab('scenes');
  });
  this.sceneSearchController.Subscribe('startSearch', this, function (query) {
    scope.uilog.log(UILog.EVENT.SEARCH_QUERY, null, { type: 'scene', queryString: query });
  });
  this.searchControllers['scene'] = this.sceneSearchController;

  // modelSearchController
  this.__modelSearchControlers = [];
  this.modelSources = this.modelSources || _.concat(Constants.assetSources.model);
  this.modelSearchPanelHelper = new ModelSearchPanelHelper({
    includeExtraAssets: this.urlParams.extra
  });

  this.modelSearchController = new SearchController(_.defaults(this.searchOptions['model'], {
    assetFilters: { model: { sourceFilter: '+source:(' + this.modelSources.join(' OR ') + ')' }},
    searchSucceededCallback: this.modelSearchSucceeded.bind(this),
    getImagePreviewUrlCallback: this.assetManager.getImagePreviewUrl.bind(this.assetManager),
    onMousedownResultCallback: this.modelSearchResultClickedCallback.bind(this),  // NOTE: instead of onClick to allow dragging into scene
    appendResultElemCallback: this.customizeModelResultElement.bind(this),
    allowTextEmbeddingSearch: true,
    allowGroupExpansion: true,
    sources: this.modelSources,
    previewImageIndex: 13,
    loadImagesLazy: true,
    searchPanel: $('#modelSearchPanel'),
    panelType: 'side',
    tooltipIncludeAll: false,
    showSearchOptions: this.showSearchOptions,
    showSearchSourceOption: this.showSearchSourceOption,
    showSearchSortOption: false,
    sortOrder: 'score desc',
    // sortOrder: 'random_840783942 desc',
    additionalSortOrder: 'id asc',
    entriesPerRow: 2
  }));
  this.__modelSearchControlers.push(this.modelSearchController);
  this.modelSearchController.searchPanel.setAutocomplete(
    new SolrQuerySuggester({
      schema: new ModelSchema()
    })
  );
  if (this.restrictModels) {
    this.modelSearchController.setFilter(Constants.assetTypeModel, this.restrictModels);
  }
  // this.modelSearchController.Subscribe('SearchSucceededPreparePanel', null, function () {
  //   scope.activateTab('models');
  // });
  this.modelSearchController.Subscribe('startSearch', this, function (searchDetails) {
    scope.uilog.log(UILog.EVENT.SEARCH_QUERY, null, { type: 'model', searchDetails: searchDetails });
  });
  this.modelSearchController.Subscribe('ResultsPanelMouseEnter', this, function (searchDetails) {
    scope.uilog.log(UILog.EVENT.SEARCH_RESULTS_PANEL_FOCUS, null, { type: 'model', searchDetails: searchDetails });
  });
  this.modelSearchController.Subscribe('ResultsPanelMouseLeave', this, function (searchDetails) {
    scope.uilog.log(UILog.EVENT.SEARCH_RESULTS_PANEL_UNFOCUS, null, { type: 'model', searchDetails: searchDetails });
  });
  this.modelSearchController.Subscribe('SearchContainerMouseEnter', this, function (searchDetails) {
    scope.uilog.log(UILog.EVENT.SEARCH_CONTAINER_FOCUS, null, { type: 'model', searchDetails: searchDetails });
  });
  this.modelSearchController.Subscribe('SearchContainerMouseLeave', this, function (searchDetails) {
    scope.uilog.log(UILog.EVENT.SEARCH_CONTAINER_UNFOCUS, null, { type: 'model', searchDetails: searchDetails });
  });
  this.searchControllers['model'] = this.modelSearchController;

  // Scan search controller
  this.scanSources = this.scanSources || _.concat(Constants.assetSources.scan);
  this.scanSearchController = new SearchController(_.defaults(this.searchOptions['scan'], {
    searchSucceededCallback: this.modelSearchSucceeded.bind(this),
    getImagePreviewUrlCallback: this.assetManager.getImagePreviewUrl.bind(this.assetManager),
    onClickResultCallback: this.modelSearchResultClickedCallback.bind(this),
    allowGroupExpansion: true,
    sources: this.scanSources,
    previewImageIndex: 13,
    loadImagesLazy: true,
    searchPanel: $('#scanSearchPanel'),
    panelType: 'side',
    tooltipIncludeAll: false,
    showSearchOptions: this.showSearchOptions,
    showSearchSourceOption: this.showSearchSourceOption,
    showSearchSortOption: false,
    sortOrder: 'score desc',
    additionalSortOrder: 'id asc',
    entriesPerRow: 2
  }));
  if (this.restrictScans) {
    this.scanSearchController.setFilter(Constants.assetTypeScan, this.restrictScans);
  }
  this.scanSearchController.Subscribe('SearchSucceededPreparePanel', null, function () {
    scope.activateTab('scans');
  });
  this.scanSearchController.Subscribe('startSearch', this, function (query) {
    scope.uilog.log(UILog.EVENT.SEARCH_QUERY, null, { type: 'scan', queryString: query });
  });
  this.searchControllers['scan'] = this.scanSearchController;

  // archSearchController
  this.archSearchController = new SearchController(_.defaults(this.searchOptions['arch'], {
    searchSucceededCallback: this.archSearchSucceeded.bind(this),
    getImagePreviewUrlCallback: this.assetManager.getImagePreviewUrl.bind(this.assetManager),
    onClickResultCallback: function (source, id, archinfo) {
      var loadInfo = this.assetManager.getLoadInfo(source, id, archinfo);
      this.loadArch(loadInfo);
    }.bind(this),
    sources: [],
    searchPanel: $('#archSearchPanel'),
    panelType: 'side'
  }));
  if (this.restrictArch) {
    this.archSearchController.setFilter(Constants.assetTypeArch, this.restrictArch);
  }
  this.archSearchController.Subscribe('SearchSucceededPreparePanel', null, function () {
    scope.activateTab('arch');
  });
  this.archSearchController.Subscribe('startSearch', this, function (query) {
    scope.uilog.log(UILog.EVENT.SEARCH_QUERY, null, { type: 'arch', queryString: query });
  });
  this.searchControllers['arch'] = this.archSearchController;

  // textureSearchController
  var textureContainer = $('#textureSearchPanel');
  this.createCheckboxes(textureContainer, ['floorSelected', 'wallSelected', 'ceilingSelected'], ['Floor', 'Wall', 'Ceiling'], [false, false, false]);
  this.textureSearchController = new SearchController(_.defaults(this.searchOptions['texture'], {
    assetFilters: { texture: { sourceFilter: '+source:(' + Constants.assetSources.texture.join(' OR ') + ')' }},
    searchSucceededCallback: this.textureSearchSucceeded.bind(this),
    getImagePreviewUrlCallback: this.assetManager.getImagePreviewUrl.bind(this.assetManager),
    onClickResultCallback: this.loadTexture.bind(this),
    sources: Constants.assetSources.texture,
    searchPanel: $('#textureSearchPanel'),
    panelType: 'side'
  }));

  if (this.restrictTextures) {
    this.textureSearchController.setFilter(Constants.assetTypeTexture, this.restrictTextures);
  }
  this.textureSearchController.Subscribe('SearchSucceededPreparePanel', null, function () {
    scope.activateTab('textures');
  });
  this.textureSearchController.Subscribe('startSearch', this, function (query) {
    scope.uilog.log(UILog.EVENT.SEARCH_QUERY, null, { type: 'texture', queryString: query });
  });
  this.searchControllers['texture'] = this.textureSearchController;

  // colorsPanelController
  var colorsPanel = $('#colorsPanel');
  if (colorsPanel && colorsPanel.length > 0) {
    this.colorsPanel = new ColorsPanel({
      container: colorsPanel,
      toolbar: $('#colorsToolbar'),
      onClickColorCallback: function (color) {
        var options = null;
        var material = this.assetManager.getColoredMaterial(color.name, color.hex, options);
        this.selectedColorMaterial = material;
      }.bind(this)
    });
  }

  // AXC: Do we need this?
  this.assetManager.setSearchController(this.modelSearchController);
};

SceneViewer.prototype.setupSceneTemplateViewer = function () {
  var scope = this;
  var SceneTemplateViewer = require('scene-viewer/SceneTemplateViewer');
  this.sceneTemplateViewer = new SceneTemplateViewer({
    selector: '#graph',
    showModelImages: true,
    onClickObjectCallback: function (objIndex) {
      // object index can be multiple
      var objIndices = [];
      if (objIndex !== undefined) {
        if (objIndex.length) {
          objIndices = objIndex;
        } else if (objIndex >= 0) {
          objIndices.push(objIndex);
        }
      }
      scope.setSelectedModels(objIndices);
    },
    getObjectImageUrl: function (objIndex) {
      // object index is single objIndex...
      var modelInstance = scope.sceneState.modelInstances[objIndex];
      if (modelInstance && modelInstance.model && modelInstance.model.info) {
        var info = modelInstance.model.info;
        return scope.assetManager.getImagePreviewUrl(info.source, info.id, undefined, info);
      }
    }
  });
};

SceneViewer.prototype.setupInstructions = function () {
  var instructions = $('#instructions');
  if (instructions && this.showInstructions) {
    var instructionsHtml = this.instructions ? this.instructions.html :
      (this.allowEdit ?
        '<b>Editing Controls</b><br>' +
        'LEFT/RIGHT = Rotate highlighted model(s) around Z-axis<br>' +
        'DOWN/UP = Rescale highlighted model(s) by 0.9/1.1 <br>' +
        'Ctrl+S = Save current progress to console<br>' : '') +
      '<b>Trackball Controller</b>><br>' +
      'Right click = Orbit view<br>' +
      'Shift + Right click = Pan view<br>' +
      'Mouse wheel = Zoom view<br>' +
      '<b>First Person Controller</b><br>' +
      'W/S/A/D = Forward/Back/Left/Right<br>' +
      'R/F = Up/Down<br>' +
      '<b>Other Controls</b><br>' +
      (this.allowLookAt ? 'Dblclick = Look at object<br>' : '') +
      'Shift+Dblclick = Act on object (turn on video/light or open/close door)<br>' +
      'Ctrl/Cmd+Dblclick = Articulate object (for supported objects)<br>' +
      (this.allowScenePrevNext ? 'Shift+P = Previous scene (in search results)<br>' : '') +
      (this.allowScenePrevNext ? 'Shift+N = Next scene<br>' : '') +
      'Ctrl+I = Save image<br>' +
      'Shift+T = Toggle controller mode<br>' +
      'Ctrl+O = Reset camera<br>' +
      (this.allowHighlightMode? 'Ctrl+U = Toggle highlight mode<br>' : '') +
      'Shift+Ctrl+V = Toggle voxels<br>' +
      'Shift+A = Toggle axis';
    if (this.allowMagicColors) {
      instructionsHtml += '<br>' +
        '<b>Magic Colors</b>><br>' +
        'Shift+G = Color by model id<br>' +
        'Ctrl+G = Color by object category<br>' +
        'Ctrl+Alt+G = Color by object id<br>' +
        'Ctrl+Shift+G = Color by room type';
    }
    instructions.html(instructionsHtml);
  }
};

SceneViewer.prototype.setupEditControls = function () {
  this.editControls = new SceneEditControls({
    app: this,
    container: this.container,
    picker: this.picker,
    cameraControls: this.cameraControls,
    scene: this.sceneState.fullScene,
    enabled: this.editMode,
    useThreeTransformControls: false,
    supportSurfaceChange: this.supportSurfaceChange,
    uilog: this.uilog,
    allowRotation: this.allowRotation,
    allowScaling: this.allowScaling,
    rotateBy: this.rotateBy,
    allowAny: this.allowEditAny,
    putOnArchOnly: this.putOnArchOnly,
    restrictToSurface: this.restrictToSurface,  // TODO: check how this is different from support surface change
    manipulatorSizeMultiplier: this.manipulatorSizeMultiplier,
    manipulatorFixedRotationAxis: this.manipulatorFixedRotationAxis
  });
  this.addControl(this.editControls);
  if (this.useContextQueryControls) {
    this.__initContextQueryControls();
  }

  this.Subscribe(Constants.EDIT_OPSTATE.INIT, this, this.onEditOpInit.bind(this));
  this.Subscribe(Constants.EDIT_OPSTATE.DONE, this, this.onEditOpDone.bind(this));
  this.Subscribe(Constants.EDIT_OPSTATE.CANCEL, this, this.onEditOpCancel.bind(this));
  this.editControls.Subscribe("HighlightChanged", this, function(object3d, isHighlight){
    this.Publish("HighlightChanged", object3d, isHighlight);
  });
};

function __wrappedEventListener(cb) {
  return function (event) {
    var r = cb(event);
    if (r === false) {
      event.stopImmediatePropagation();
      event.stopPropagation();
    }
    return r;
  };
}

SceneViewer.prototype.setupEventListeners = function () {
  var scope = this;
  this.registerEventListeners();
  this.bindKeys();
  this.renderer.domElement.addEventListener('pointerup', __wrappedEventListener(function (event) {
      event.preventDefault();
      scope.renderer.domElement.focus();
      if (event.which === Constants.LEFT_MOUSE_BTN) {
        if (scope._mouseMode === 'positionAgentCamera') {
          scope.positionCameraByAgentHeight(event, scope.sceneState.getObject3Ds());
          scope.mouseMode = null;
        } else if (scope.selectMode || scope.materialMode) {
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

  this.renderer.domElement.addEventListener('pointerdown', __wrappedEventListener(function (event) {
      scope.renderer.domElement.focus();
      if (event.which === Constants.LEFT_MOUSE_BTN) {
        if (scope.editMode && !scope.isHighlightArchMode) {
          if (scope.contextQueryIsEnabled && scope.contextQueryControls && event.shiftKey) {
            scope.contextQueryControls.onDocumentMouseDown(event);
            return false;
          } else {
            var notHandled = true;
            var priorityInverted = event.shiftKey;
            // TODO: consider if we need to have separate _mousecontrols
            for (var i = 0; i < scope._controls.length; i++) {
              var ci = priorityInverted? scope._controls.length-i-1 : i;
              var control = scope._controls[ci];
              if (control.enabled) {
                notHandled = control.onMouseDown(event);
                if (!notHandled) {
                  break;
                }
              }
            }
            return notHandled;
          }
        } else if (scope.isHighlightArchMode) {
          if (scope.__lastHovered) {
            if (event.shiftKey) {
              // Print in console information about the point that is being clicked
              var mouse = scope.picker.getCoordinates(scope.container, event);
              var arch = scope.__lastHovered;
              var intersects = scope.picker.getIntersectedDescendants(mouse.x, mouse.y, scope.camera, [arch]);
              if (intersects.length > 0) {
                var intersected = intersects[0];
                var worldPoint = intersected.point;
                var scenePoint = scope.sceneState.scene.worldToLocal(worldPoint.clone());
                var archObject3D = (arch.userData.type === 'Wall')? arch.children[0] : arch;
                var archPoint = archObject3D.worldToLocal(worldPoint.clone());
                console.log('intersected', scenePoint, archPoint, arch.userData);
              }
            } else {
              scope.sceneHierarchy.selectObject(scope.__lastHovered, true, true);
              if (scope.debugArch) {
                scope.__sceneHierarchyContextMenuActivated = {object3D: scope.__lastHovered};
              }
            }
          }
        }
      }
    }),
    false
  );

  this.renderer.domElement.addEventListener('pointermove', __wrappedEventListener(function (event) {
      event.preventDefault();
      scope.renderer.domElement.focus();
      var rightMouseButtonPressed = UIUtil.isRightMouseButtonPressed(event);
      // console.log('pointermove', rightMouseButtonPressed);
      if (!rightMouseButtonPressed) {
        if (scope.editMode && !scope.isHighlightArchMode) {
          if (scope.contextQueryIsEnabled && scope.contextQueryControls && event.shiftKey) {
            scope.container.style.cursor = scope.contextQueryControls.mouseMoveCursor;
            scope.contextQueryControls.onDocumentMouseMove(event);
            return false;
          } else {
            var notHandled = true;
            var priorityInverted = event.shiftKey;
            // TODO: consider if we need to have separate _mousecontrols
            for (var i = 0; i < scope._controls.length; i++) {
              var ci = priorityInverted? scope._controls.length-i-1 : i;
              var control = scope._controls[ci];
              if (control.enabled) {
                notHandled = control.onMouseMove(event);
                if (!notHandled) {
                  break;
                }
              }
            }
            return notHandled;
          }
        } else if (scope.isHighlightArchMode) {
          var archObjects = scope.sceneState.getArchObject3Ds();
          var visibleArchObjects = Object3DUtil.filterVisible(archObjects);
          if (scope.highlightSupportArchOnly) {
            visibleArchObjects = visibleArchObjects.filter(x => x.userData.isSupportObject);
          }
          scope.__lastHovered = scope.highlightHovered(event, visibleArchObjects, 'object');
          if (scope.__sceneHierarchyContextMenuActivated && scope.__lastHovered !== scope.__sceneHierarchyContextMenuActivated.object3D) {
            scope.sceneHierarchy.hideContextMenu( scope.__sceneHierarchyContextMenuActivated.object3D);
            scope.__sceneHierarchyContextMenuActivated = null;
          }
        }
      }
    }),
    false
  );

  this.renderer.domElement.addEventListener('pointerleave', function (event) {
    if (scope.editMode && !scope.isHighlightArchMode) {
      scope.editControls.onMouseLeave(event);
    } else if (scope.isHighlightArchMode) {
      scope.highlightHovered(null);
    }
  });

  this.renderer.domElement.addEventListener('dblclick', function (event) {
    if (event.shiftKey) {
      scope.actOnClicked(event);
    } else if (event.ctrlKey || event.metaKey) {
      scope.articulateClicked(event);
    } else {
      // Hack to keep stuff selected
      if (scope.selectMode || scope.materialMode) {
        scope.selectClicked(event);
      }
      if (scope.allowLookAt) {
        // Look at clicked
        scope.lookAtClicked(event);
      }
    }
  }, false);
};

SceneViewer.prototype.setupConsole = function () {
  var textConsole = $('#console');
  if (textConsole) {
    var controller = textConsole.console({
      promptLabel: 'Text2Scene> ',
      commandValidate: function (line) {
        if (line === '') {
          return false;
        } else {
          return true;
        }
      },
      commandHandle: function (line) {
        try {
          return this.handleTextCommand(line);
        } catch (e) {
          console.error(e.stack);
          return e.toString();
        }
      }.bind(this),
      //          Javascript console
      //            commandHandle:function(line){
      //              try { var ret = eval(line);
      //                if (typeof ret != 'undefined') return ret.toString();
      //                else return true; }
      //              catch (e) { return e.toString(); }
      //            },
      animateScroll: true,
      promptHistory: true,
      welcomeMessage: 'Enter scene interaction commands.'
    });
    controller.promptText('generate a room with a desk and a lamp');
    this.console = controller;
  }
};

SceneViewer.prototype.setupTestScenes = function () {
  // Test Scenes
  var selectSceneElem = $('#selectScene');
  if (selectSceneElem && selectSceneElem.length) {
    var scenes = {
      // Test scenes from Web Scene Studios
      'testThreeJsScene': { format: 'three.js', file: 'resources/scenes/test_scene.json', hasSupport: true },
      'testWssScene1': { format: 'wss', file: 'resources/scenes/testWssScene1.json', hasSupport: true },
      'testWssScene2': { format: 'wss', file: 'resources/scenes/testWssScene2.json', hasSupport: false }
    };
    for (var name in scenes) {
      if (scenes.hasOwnProperty(name)) {
        selectSceneElem.append('<option value="' + name + '">' + name + '</option>');
      }
    }
    var that = this;
    selectSceneElem.change(function () {
      $('#selectScene option:selected').each(function () {
        var m = scenes[$(this).val()];
        that.clearAndLoadScene(m);
      });
    });
  }
};

SceneViewer.prototype.addGroundToScene = function (center) {
  if (!this.ground) {
    console.log('Adding ground');
    var planeGeo = new THREE.PlaneGeometry(10 * Constants.metersToVirtualUnit, 10 * Constants.metersToVirtualUnit);
    // Set depthWrite to false so the other objects always appear on top
    var planeMaterial = new THREE.MeshBasicMaterial({color: 'grey', depthWrite: true});
    var ground = new THREE.Mesh(planeGeo, planeMaterial);
    ground.name = 'Ground';
    ground.castShadow = false;
    ground.receiveShadow = true;

    Object3DUtil.alignToUpFrontAxes(ground, new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1), Constants.worldUp, Constants.worldFront);
    ground.isPickable = true;
    ground.isSelectable = false;
    ground.isEditable = false;
    ground.isSupportObject = true;
    ground.userData.type = 'Ground';
    this.ground = ground;
  }
  this.sceneState.fullScene.add(this.ground);
  this.sceneState.addExtraObject(this.ground);
  if (center) {
    Object3DUtil.placeObject3DByBBFaceCenter(this.ground, center, Constants.BBoxFaceCenters.TOP);
  }
};

SceneViewer.prototype.help = function () {
  $('#instructionsPanel').toggle();
};

SceneViewer.prototype.isHelpVisible = function () {
  return $('#instructionsPanel').is(':visible');
};

SceneViewer.prototype.toggleConsole = function () {
  $('#console').toggle();
};

SceneViewer.prototype.isConsoleVisible = function () {
  return $('#console').is(':visible');
};

SceneViewer.prototype.setEditMode = function(flag) {
  if (this.editMode != flag) {
    this.toggleEditMode();
  }
};

SceneViewer.prototype.toggleEditMode = function () {
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

SceneViewer.prototype.isEditMode = function () {
  return this.editMode;
};

SceneViewer.prototype.setSelectMode = function(flag) {
  if (this.selectMode != flag) {
    this.toggleSelectMode();
  }
};

SceneViewer.prototype.toggleSelectMode = function () {
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
    if (this.selectMode && this.materialMode) {
      this.materialMode = false;
      this.toolbar.updateButtonState('Material');
    }
    this.toolbar.updateButtonState('Select');
  }
};

SceneViewer.prototype.isSelectMode = function () {
  return this.selectMode;
};

SceneViewer.prototype.toggleObjectSelectMode = function () {
  this.objectSelectMode = !this.objectSelectMode;
};

SceneViewer.prototype.isObjectSelectMode = function () {
  return this.objectSelectMode;
};

SceneViewer.prototype.updateEditControls = function () {
  this.editControls.reset({
    scene: this.sceneState.fullScene,
    cameraControls: this.cameraControls
  });
  if (this.contextQueryControls) {
    this.contextQueryControls.reset({
      scene: this.sceneState.fullScene,
      sceneState: this.sceneState,
      sceneType: this.sceneType,
      camera: this.camera,
      controls: this.cameraControls
    });
  }
};

SceneViewer.prototype.toggleMaterialMode = function () {
  this.materialMode = !this.materialMode;
  if (this.allowEdit) {
    if (this.selectMode && this.materialMode) {
      this.selectMode = false;
      this.toolbar.updateButtonState('Select');
    }
    this.toolbar.updateButtonState('Material');
  }
};

SceneViewer.prototype.isMaterialMode = function () {
  return this.materialMode;
};

SceneViewer.prototype.__contextQueryControlsOnClickResult = function (source, id, result, elem, index) {
  this.uilog.log(UILog.EVENT.CONTEXT_QUERY_SELECT, null,
    { type: 'model', source: source, id: id, index: index }
  );
  this.loadModel(source, id, result);
};

SceneViewer.prototype.__initContextQueryControls = function () {
  var options = _.assign(Object.create(null), this.__contextQueryOptions, {
    scene: this.sceneState.fullScene,
    sceneState: this.sceneState,
    picker: this.picker,
    camera: this.camera,
    controls: this.cameraControls,
    uilog: this.uilog,
    container: this.container,
    onCloseCallback: function () { this.setContextQueryActive(false); }.bind(this),
    searchSucceededCallback: this.searchSucceededContextQuery.bind(this),
    getImagePreviewUrlCallback: this.assetManager.getImagePreviewUrl.bind(this.assetManager),
    onClickResultCallback: this.__contextQueryControlsOnClickResult.bind(this)
  });
  this.contextQueryControls = new this.__contextQueryOptions.contextQueryControls(options);
  this.contextQueryControls.enabled = this.contextQueryIsEnabled;
  this.__modelSearchControlers.push(this.contextQueryControls.searchController);
  if (this.restrictModels) {
    this.contextQueryControls.searchController.setFilter(Constants.assetTypeModel, this.restrictModels);
  }
};

SceneViewer.prototype.onSceneUpdated = function () {
  if (this.sceneState) {
    // Scene was updated, update scene hierarchy
    this.sceneState.assignObjectIndices();
    if (this.sceneHierarchy) { this.sceneHierarchy.setSceneState(this.sceneState); }
    if (this.bvhVisualizer) { this.bvhVisualizer.setSceneState(this.sceneState); }
    if (this.showSceneVoxels) {
      this.sceneVoxels.ensureVoxels();
    }
  }
};

SceneViewer.prototype.handleTextCommand = function (text) {
  var re = /\s+/;
  var fields = text.split(re);
  text = text.trim();
  if (text === 'help') {
    var message = 'Please type in a scene interaction command.\n' +
      'clear - clears debug state\n' +
      'remove all - removes all objects from scene\n' +
      'search - Find a model\n' +
      'show - Visualize part\n' +
      'generate - Generates a scene from text\n';
    return message;
  } else if (text === 'clear') {
    this.sceneState.clearGhostScene();
    Object3DUtil.setVisible(this.sceneState.scene, true);
    return true;
  } else if (fields[0] === 'remove' && fields[1] === 'all') {
    this.removeAll();
    return true;
  } else if (text.startsWith('search')) {
    var ss = this.sceneState.toJsonString();
    this.modelSearchController.modelTextSearch(text, ss, 20);
    return 'search...';
  } else if (text.startsWith('show')) {
    this.partVisualizer.visualizeParts(text, this.sceneState);
    return 'visualize...';
  } else {
    this.sceneGenerator.generate(text, this.sceneState);
    return 'generate...';
  }
  return 'Unknown command';
};

SceneViewer.prototype.handleSceneGenerateProgress = function (status) {
  if (status === 'START') {
    this.showLoadingIcon(true);
  } else {
    this.showLoadingIcon(false);
  }
};

SceneViewer.prototype.initialSceneSearchSucceeded = function (options, source, resultList) {
  if (resultList.length > 0) {
    this.sceneSearchController.searchPanel.selectOnPage(this.sceneSearchController.searchPanel.curStart);
  }
};

SceneViewer.prototype.addDefaultCameras = function (sceneBBox) {
  var fullScene = this.sceneState.fullScene;

  // Adds default cameras and lights to scene
  var width = this.container.clientWidth;
  var height = this.container.clientHeight;
  this.camera = new THREE.CombinedCamera(width, height, 45, 1, 4000, 1, 4000);

  if (this._useHeadlight) {
    _.each(this._headlights, (light, k) => {
      this.camera.add(light);
    });
  }

  //this.camera = new THREE.PerspectiveCamera(45, this.getAspectRatio(), 1, 4000);
  this.camera.position.z = 100;
  this.camera.updateMatrix();
  this.camera.updateProjectionMatrix();
  let scope = this;
  this.cameraControls = new CameraControls({
    controlType: this.controlType,
    camera: this.camera,
    container: this.container,
    autoRotateCheckbox: $('#autoRotate'),
    orbitStartCallback: (orbitDetails)=>{
      if (scope.uilog) {
        scope.uilog.log(UILog.EVENT.CAMERA_ORBIT_START, null, orbitDetails);
      }
    },
    orbitEndCallback: (orbitDetails)=>{
      if (scope.uilog) {
        scope.uilog.log(UILog.EVENT.CAMERA_ORBIT_END, null, orbitDetails);
      }
    }
  });
  this.sceneState.setCurrentCameraControls(this.cameraControls);

  fullScene.add(this.camera);
};

SceneViewer.prototype.addDefaultLights = function (sceneBBox) {
  // set low if interior lights turned on
  var intensity = this.usePhysicalLights ? (this.lightsOn? 0.1 : 0.5) : 1.0;
  var lights = this.sceneState.addDefaultLights(sceneBBox, this.camera.position, intensity);
  this._ambientLights = lights;
};

SceneViewer.prototype.addDefaultCamerasAndLights = function (sceneBBox) {
  this.addDefaultCameras(sceneBBox);
  this.addDefaultLights(sceneBBox);
};

SceneViewer.prototype.sceneSearchSucceeded = function (source, resultList) {
  if (this.autoLoadScene && resultList.length > 0) {
    this.sceneSearchController.searchPanel.selectOnPage(this.sceneSearchController.searchPanel.curStart);
  }
};

SceneViewer.prototype.modelSearchSucceeded = function (source, resultList) {
  this.assetManager.cacheModelInfos(source, resultList);
};

SceneViewer.prototype.textureSearchSucceeded = function (source, resultList) {
};

SceneViewer.prototype.archSearchSucceeded = function (source, resultList) {
};

SceneViewer.prototype.searchSucceededContextQuery = function (source, resultList) {
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

SceneViewer.prototype.createCheckboxes = function (container, ids, text, defaultValues) {
  var num = ids.length;
  var scope = this;
  for (let i = 0; i < num; i++) {
    var fieldInput = $('<input/>').attr('id', ids[i]).attr('type', 'checkbox');
    fieldInput.click(function () {
      if ($(this).attr('id') === 'floorSelected') {
        scope.floorSelected = $(this).is(':checked');
      } else if ($(this).attr('id') === 'wallSelected') {
        scope.wallSelected = $(this).is(':checked');
      } else {
        scope.ceilingSelected = $(this).is(':checked');
      }
    });
    var fieldLabel = $('<label></label>').attr('for', ids[i]).text(text[i]);
    fieldInput.prop('checked', defaultValues[i]);
    container.append(fieldInput);
    container.append(fieldLabel);
    container.append('&nbsp;&nbsp;');
  }
  container.append('<br>');
};

SceneViewer.prototype.loadTexture = function (source, id, metadata) {
  var material = this.assetManager.getTexturedMaterial(source, id, { metadata: metadata });
  var objects = [];
  if (this.floorSelected) {
    var floors = Object3DUtil.findNodes(this.sceneState.scene, function (node) {
      return node.userData.type === 'Floor' || node.userData.type === 'Ground';
    });
    objects = objects.concat(floors);
  }

  if (this.wallSelected) {
    var walls = Object3DUtil.findNodes(this.sceneState.scene, function (node) {
      return node.userData.type === 'Wall';
    });
    objects = objects.concat(walls);
  }

  if (this.ceilingSelected) {
    var ceilings = Object3DUtil.findNodes(this.sceneState.scene, function (node) {
      return node.userData.type === 'Ceiling' || node.userData.archType === 'Ceiling';
    });
    objects = objects.concat(ceilings);
  }

  if (this.floorSelected || this.wallSelected || this.ceilingSelected) {
    this.applyMaterial(objects, material);
  }

  this.selectedTextureMaterial = material;
};

SceneViewer.prototype.applyMaterial = function (objects, material) {
  var m = material;
  //console.log('applyMaterial', material);
  if (!(m instanceof THREE.Material)) {
    m = this.selectedObjectMaterial || Object3DUtil.getSimpleFalseColorMaterial(m);
  }

  for (let i = 0; i < objects.length; i++) {
    Object3DUtil.applyMaterial(objects[i], material, true);
  }
};

SceneViewer.prototype.setIsModelLoading = function (flag) {
  this.modelIsLoading = flag;
  if (flag) {
    $('#loadingModel').css('visibility', 'visible');
  } else {
    $('#loadingModel').css('visibility', 'hidden');
  }
};

SceneViewer.prototype.setCursorStyle = function (style) {
  this.editControls.setCursorStyle(style);
};

SceneViewer.prototype.getCursorStyle = function() {
  return this.editControls.getCursorStyle();
};

SceneViewer.prototype.loadModel = function (source, id, metadata, opts) {
  var waitingKey = this.addWaitingToQueue(SceneViewer.WAIT.LOAD_MODEL);
  var modelId = AssetManager.toFullId(source, id);
  this.uilog.log(UILog.EVENT.MODEL_LOAD, null, { modelId: modelId, progress: 'started' });
  var loadOptions = {
    loadTime: { start: new Date().getTime() }
  };
  if (opts) {
    _.defaults(loadOptions, opts);
  }
  var modelInfo = _.defaults(Object.create(null), { fullId: modelId, source: source, id: id }, metadata);
  var scope = this;
  this.assetManager.loadModel(modelInfo,
    function (err, modelInstance) {
      scope.removeWaiting(waitingKey, SceneViewer.WAIT.LOAD_MODEL);
      if (err) {
        console.error('Error loading model', modelId, err);
        scope.onModelLoadError(modelId);
      } else {
        scope.onModelLoad(loadOptions, modelInstance);
      }
    });
};

SceneViewer.prototype.modelSearchResultClickedCallback = function (source, id, result, elem, index, searchDetails) {
  // if (this.contextQueryControls.active) {
  //   this.toggleContextQueryMode();
  // }
  // Automatically enable editing
  if (this.allowEdit) {
    if (!this.editMode) {
      this.toggleEditMode();
    }
    // NOTE: Custom grouping for RLSD
    if (result.is_link) {
      this.modelSearchController.searchPanel.expandLinkResult(result);
    } else {
      this.uilog.log(UILog.EVENT.SEARCH_SELECT, null, { type: 'model', source: source, id: id, index: index, searchDetails: searchDetails });
      this.modelSearchController.addRecent(result);
      this.loadModel(source, id, result);
    }
  }
};

SceneViewer.prototype.customizeModelResultElement = function (source, id, result, elem) {
  if (this.addInspectModelResultButtons) {
    this.modelSearchPanelHelper.addModelViewIcons(source, id, result, elem);
  }
};

SceneViewer.prototype.removeAll = function () {
  this.sceneState.removeAll();
  this.sceneState.clearGhostScene();
  Object3DUtil.setVisible(this.sceneState.scene, true);
  if (this.sceneHierarchy) { this.sceneHierarchy.setSceneState(this.sceneState); }
  if (this.bvhVisualizer) { this.bvhVisualizer.setSceneState(this.sceneState); }
  this.sceneVoxels.init(this.sceneState, this.showSceneVoxels);
  this.sceneState.fullScene.add(this.sceneVoxels.voxelNode);

  // Clear controls
  this.editControls.detach();
  if (this.contextQueryControls) {
    this.contextQueryControls.reset();
  }
};

SceneViewer.prototype.clear = function (completeClear) {
  // TODO: What should go here?
  this.clearAssets();
  if (completeClear && this.sceneState) {
    //Object3DUtil.dispose(this.sceneState.scene);
    this.sceneState = new SceneState();
  }
};

// Clears and loads a new scene
SceneViewer.prototype.clearAndLoadScene = function (sceneinfo, loadOptions) {
  if (this.isLoading) {
    console.log('Loading is in progress...');
    return;
  }
  var waitingKey = this.addWaitingToQueue(SceneViewer.WAIT.LOAD_SCENE);
  this.clear();
  var defaults = {
    defaultSceneFormat: this.defaultSceneFormat,
    freezeObjects: this.freezeObjects,
    floor: this.loadFloor,
    room: this.loadRoom,
    includeCeiling: this.includeCeiling,
    attachWallsToRooms: this.attachWallsToRooms,
    createArch: this.createArch,
    archOnly: this.archOnly,
    emptyRoom: this.emptyRoom,
    hideCategories: this.hideCategories,
    useVariants: this.useVariants,
    keepInvalid: this.keepInvalid,
    keepHidden: this.keepHidden,
    keepParse: this.keepParse,
    // TODO: Lazy compute attachments for editMode
    precomputeAttachments: this.allowEdit,
    replaceModels: this.replaceModels
  };
  loadOptions = loadOptions || {};
  loadOptions = _.defaults(loadOptions, defaults);
  loadOptions.keepCurrentCamera = false;
  loadOptions.clearUndoStack = true;
  loadOptions.pushToUndoStack = true;
  loadOptions.loadKey = waitingKey;
  loadOptions.loadTime = { start: new Date().getTime() };
  // Make sure some information is pushed through to assetManager loadScene
  sceneinfo = _.merge(sceneinfo, _.pick(loadOptions, _.keys(defaults)));
  var scope = this;
  this.assetManager.loadAssetAsScene(sceneinfo, function (err, sceneState) {
    scope.onSceneLoad(loadOptions, sceneState, err);
  });
};

// Restores scene from undo stack
SceneViewer.prototype.restoreScene = function (sceneinfo) {
  if (this.isLoading) {
    console.log('Loading is in progress...');
    return;
  }
  var waitingKey = this.addWaitingToQueue(SceneViewer.WAIT.LOAD_SCENE);
  this.clear();
  var loadOptions = {
    keepCurrentCamera: true,
    clearUndoStack: false,
    pushToUndoStack: false,
    sceneRestore: true,
    loadKey: waitingKey,
    loadTime: { start: new Date().getTime() }
  };
  var scope = this;
  this.assetManager.loadScene(sceneinfo, function (err, sceneState) {
    scope.onSceneLoad(loadOptions, sceneState, err);
  });
};

SceneViewer.prototype.loadModelFromLocal = function (file) {
  if (bootbox && bootbox.form) {
    this.__loadModelConfig = this.__loadModelConfig ||
      { unit: 1, up: Constants.worldUp, front: Constants.worldFront, placement: "center" };

    var vector3Input = {
      name: 'vector3',
      parse: function (s) {
        return Object3DUtil.toVector3(s);
      },
      toString: function (v) {
        return Object3DUtil.vectorToString(v);
      }
    };

    // Requires special bootbox with form support
    var questions = [
      {
        "title": "Unit in meters",
        "name": "unit",
        "inputType": "number",
        "value": this.__loadModelConfig.unit
      },
      {
        "title": "Up",
        "name": "up",
        "inputType": 'text',
        "parse": vector3Input.parse,
        "value": vector3Input.toString(this.__loadModelConfig.up)
      },
      {
        "title": "Front",
        "name": "front",
        "inputType": 'text',
        "parse": vector3Input.parse,
        "value": vector3Input.toString(this.__loadModelConfig.front)
      },
      {
        "title": "Place object",
        "name": "placement",
        "inputType": 'select',
        "inputOptions":  _.map(["center", "none"], function(x) { return { value: x, text: x }; }),
        "value": this.__loadModelConfig.placement
      }
    ];
    var scope = this;
    bootbox.form({
      title: 'Load model',
      inputs: questions,
      callback: function (results) {
        if (results) {
          _.each(questions, function (q, i) {
            scope.__loadModelConfig[q.name] = results[i];
          });
          scope.__loadModelsFromLocal(file, scope.__loadModelConfig);
        }
      }
    });
  } else {
    this.__loadModelsFromLocal(file);
  }
};

SceneViewer.prototype.__loadModelFromLocal = function (file, opts, cb) {
  if (file) {
    opts = opts || {};
    var waitingKey = this.addWaitingToQueue(SceneViewer.WAIT.LOAD_MODEL);
    var modelId = 'file.' + file.name;
    this.uilog.log(UILog.EVENT.MODEL_LOAD, null, { modelId: modelId, progress: 'started' });
    var loadOptions = {
      loadTime: { start: new Date().getTime() }
    };
    _.merge(loadOptions, _.pick(opts, ["placement"]));
    var scope = this;
    this.assetManager.loadModel(_.defaults({ file: file }, opts), function(err, res) {
      res.model.info.name = file.name;
      res.object3D.name = file.name;
      scope.removeWaiting(waitingKey, SceneViewer.WAIT.LOAD_MODEL);
      if (err) {
        console.error('Error loading model', modelId, err);
        scope.onModelLoadError(modelId);
        cb(err);
      } else {
        scope.onModelLoad(loadOptions, res);
        cb(null, res);
      }
    });
  } else {
    console.log('Cannot load model from local file: No file specified');
    cb('Cannot load model from local file: No file specified');
  }
};

SceneViewer.prototype.__loadModelsFromLocal = function (files, opts, cb) {
  if (!cb) {
    cb = function(err, res) {};
  }
  if (files.length == null) {
    files = [files];
  }
  var scope = this;
  async.mapSeries(files, function (file, __cb) {
    console.log('load file', file);
    scope.__loadModelFromLocal(file, opts, __cb);
  }, cb);
};

SceneViewer.prototype.loadSceneFromLocal = function (file) {
  if (file) {
    var info = { file: file };
    if (this.__options.assetInfo) {
      info = _.defaults(info, this.__options.assetInfo);
    }
    this.clearAndLoadScene(info);
  } else {
    console.log('Cannot load scene from local file: No file specified');
  }
};

SceneViewer.prototype.loadFromLocal = function (file, fileType) {
  console.log('load', fileType, file);
  if (fileType === 'actionTrace') {
    var scope = this;
    var ActionTraceLog = require('sim/ActionTraceLog');
    var ActionTraceVisualizer = require('sim/ActionTraceVisualizer');
    var actionTrace = new ActionTraceLog({ fs: FileUtil });
    actionTrace.loadRecords(file, function (err, records) {
      if (err) {
        console.error(err);
      } else {
        var visualizer = new ActionTraceVisualizer();
        visualizer.visualize(scope.sceneState, [records]);
      }
    });
  } else if (fileType === 'arch') {
    this.loadArch({ file: file });
  } else if (fileType === 'wall') {
    this.visualizeWalls(file);
  } else if (fileType === 'navmap') {
    this.visualizeNavmap(file);
  } else if (fileType === 'model') {
    this.loadModelFromLocal(file);
  } else {
    this.loadSceneFromLocal(file);
  }
};

SceneViewer.prototype.loadArch = function (info) {
  if (this.isLoading) {
    console.log('Loading is in progress...');
    return;
  }
  var waitingKey = this.addWaitingToQueue(SceneViewer.WAIT.LOAD_SCENE);
  this.clear();
  var scope = this;
  var loadOptions = {
    keepCurrentCamera: false,
    clearUndoStack: true,
    pushToUndoStack: true,
    loadKey: waitingKey,
    loadErrorMessage: 'Error loading arch file',
    loadTime: { start: new Date().getTime() }
  };

  info.debugArch = this.debugArch;
  this.assetManager.loadArch(info, function (err, sceneState) {
    scope.onSceneLoad(loadOptions, sceneState, err);
  }, true);
};

SceneViewer.prototype.visualizeWalls = function (filename) {
  if (!filename) {
    filename = this.sceneState.info.wall.path;
    if (!filename) {
      this.showError('No walls path');
      return;
    }
  }
  var scope = this;
  var WallLoader = require('loaders/WallLoader');
  var wallLoader = new WallLoader({ fs: FileUtil });
  wallLoader.load(filename, function (err, walls) {
    if (err) {
      scope.showError(err);
    } else {
      SceneUtil.visualizeWallLines(scope.sceneState, walls);
    }
  });
};

SceneViewer.prototype.visualizeNavmap = function (filename) {
  var navmapField = this.sceneState.info.defaultNavmap || 'navmap';
  if (!filename) {
    filename = this.sceneState.info[navmapField].path;
    if (!filename) {
      console.error('No navmap path');
      return;
    }
  }
  var NavScene = require('nav/NavScene');
  var scope = this;
  _.getJSON(filename, function (err, json) {
    if (err) {
      console.error(err);
    } else {
      scope.sceneState.info = scope.sceneState.info || {};
      scope.sceneState.info[navmapField] = scope.sceneState.info[navmapField] || {};
      scope.sceneState.info[navmapField].data = json;
      scope.navscene = new NavScene({
        sceneState: scope.sceneState
      });
      if (_.isString(filename)) {
        scope.navscene.gridFile = filename;
      }
      scope.navscene.showMap(scope.navmapModes[scope.navmapMode]);
    }
  });
};

SceneViewer.prototype.createSceneWithOneModel = function (modelInstance, options) {
  this.removeAll();
  this.applyScanOpacity([modelInstance]);
  this.sceneType = modelInstance.model.getCategory();
  if (options && options.initModelInstance) {
    modelInstance.alignAndScale(this.sceneState.getUp(), this.sceneState.getFront(), this.sceneState.getVirtualUnit());
    modelInstance.ensureNormalizedModelCoordinateFrame();
    modelInstance.object3D.metadata = {
      modelInstance: modelInstance
    };
  }

  this.initSceneWithOneModel(modelInstance, options);
  if (this.addGround) {
    var sceneBBox = Object3DUtil.getBoundingBox(modelInstance.object3D);
    this.addGroundToScene(sceneBBox.getWorldPosition(new THREE.Vector3(0.5, 0, 0.5)));
  }

  //this.setCursorStyle('initial');
  if (options && options.clearUndoStack) {
    if (this.undoStack) {
      this.undoStack.clear();
    }
  }
  if (options && options.clearUILog) {
    this.uilog.clear();
  }
  if (this.undoStack) {
    this.undoStack.pushCurrentState(Constants.CMDTYPE.INIT);
  }
  var objInfo = modelInstance.getUILogInfo(true);
  this.uilog.log(UILog.EVENT.SCENE_CREATE, null, objInfo);
  this.onSceneUpdated();
};

SceneViewer.prototype.initSceneWithOneModel = function (modelInstance, options) {
  // TODO: Make more reasonable positioning of first object
  // Just put object with centroid at (0,0,0)
  if (options.placement === 'center' || ((options.placement == null) && this.centerFirstModel)) {
    var center = new THREE.Vector3(0, 0, 0);
    //var sceneCenter = this.sceneState.scene.worldToLocal( center );
    Object3DUtil.placeObject3D(modelInstance.object3D, center, new THREE.Vector3(0.5, 0, 0.5));
  }

  var sceneBBox = Object3DUtil.getBoundingBox(modelInstance.object3D);
  var sceneBBoxDims = sceneBBox.dimensions();
  var viewBBox = sceneBBox;
  if (sceneBBoxDims.length() < 2 * Constants.metersToVirtualUnit) {
    viewBBox = sceneBBox.scaleBy(4);
  }
  this.resetCamera({
    viewIndex: this.viewIndex,
    targetBBox: viewBBox
  });
  this.addDefaultLights(viewBBox);  // Set default lights before adding first object (otherwise, object is black!)
  this.sceneState.addObject(modelInstance);
  this.sceneState.setCurrentCameraControls(this.cameraControls, 'current');
  console.log('initSceneWithOneModel', sceneBBox, viewBBox, this.cameraControls.camera.position);

  this.onSceneChanged();
};

SceneViewer.prototype.onSceneChanged = function () {
  Viewer3D.prototype.onSceneChanged.call(this);
  if (Constants.isBrowser) { window.scene = this.sceneState.fullScene; }  // export for THREE.js inspector

  // Update our edit controls for the updated scene
  this.updateEditControls();
  this.cameraControls.saveCameraState(true);
};

SceneViewer.prototype.onModelLoadError = function (modelId) {
  this.uilog.log(UILog.EVENT.MODEL_LOAD, null, { modelId: modelId, progress: 'finished', status: 'ERROR' });
};

SceneViewer.prototype.onShapeInsert = function (obj, opts) {
  var shapeName = opts.shape;
  var transform = opts.transform;
  // Let's create a special model instance for our box
  var model = new Model(obj, { id: shapeName, fullId: 'shape.' + shapeName, source: 'shape', unit: this.virtualUnitToMeters });
  var modelInstance = model.newInstance(false);
  this.sceneOperations.prepareModelInstance(modelInstance, {
    transform: opts.transform,
    useShadows: this.useShadows,
    enableMirrors: this.enableMirrors,
    assetManager: this.assetManager,
    renderer: this.renderer,
    camera: this.camera
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

SceneViewer.prototype.onModelLoad = function (loadOptions, modelInstance) {
  loadOptions.loadTime.end = new Date().getTime();
  loadOptions.loadTime.duration = loadOptions.loadTime.end - loadOptions.loadTime.start;
  // console.log('Load time for model: ' + loadOptions.loadTime.duration);
  if (loadOptions.useModelCoordFrame) {
    // Set sceneState up/front/unit to model
    this.sceneState.resetCoordFrame(modelInstance.model.getUp(), modelInstance.model.getFront(), modelInstance.model.getUnit());
  }

  this.uilog.log(UILog.EVENT.MODEL_LOAD, null,
    { modelId: modelInstance.model.getFullID(), progress: 'finished', status: 'SUCCESS' });

  this.sceneOperations.prepareModelInstance(modelInstance, {
    alignTo: 'scene',
    sceneState: this.sceneState,
    useShadows: this.useShadows,
    enableMirrors: this.enableMirrors,
    assetManager: this.assetManager,
    renderer: this.renderer,
    camera: this.camera
  });

  this.Publish("ModelLoaded", modelInstance, { loadTime: loadOptions.loadTime });
  if (!this.blockInserts) {
    // TODO: Apply coloring scene to newly loaded modelInstance
    if (this.colorBy === 'splitColors' && this.colorByOptions.object) {
      SceneUtil.applyColorSchemeToNewModel(modelInstance, this.colorByOptions.object.colorBy, this.colorByOptions.object);
    } else {
      SceneUtil.applyColorSchemeToNewModel(modelInstance, this.colorBy, this.colorByOptions);
    }

    if (modelInstance.model.isScan()) {
      modelInstance.object3D.userData.isSupportObject = this.isScanSupport;
      if (this.isAutoCreateSceneForScan) {
        this.createSceneWithOneModel(modelInstance, {initModelInstance: false, clearUILog: true, clearUndoStack: true});
        return;
      }
    }

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
      this.Publish(Constants.EDIT_OPSTATE.DONE, Constants.CMDTYPE.INSERT, { object: obj });

      if (this.editControlsStateBeforeContextQuery) {
        this.editControls.enabled = this.editControlsStateBeforeContextQuery.editControlsEnabled;
      }
      if (this.editControls.enabled) {
        this.editControls.attach(modelInstance, this.contextQueryControls.placementInfo.attachmentIndex);
      }
    } else {
      if (this.sceneState.isEmpty()) {
        this.initSceneWithOneModel(modelInstance, loadOptions);
        if (this.undoStack) {
          this.undoStack.clear();
          this.undoStack.pushCurrentState(Constants.CMDTYPE.INIT);
        }
          
        this.uilog.log(UILog.EVENT.MODEL_INSERT, null, objInfo);
        this.onSceneUpdated();
      } else {
        // Always put model in middle of scene
        if (loadOptions.placement === 'center' || loadOptions.placement == null) {
          var sceneBb = Object3DUtil.getBoundingBox(this.sceneState.scene);
          var center = sceneBb.centroid();
          var sceneCenter = this.sceneState.scene.worldToLocal(center);
          console.log("sceneCenter", sceneCenter);
          Object3DUtil.placeObject3D(modelInstance.object3D, sceneCenter);
        }
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
          this.Publish('ObjectPlaced', modelInstance, { object3D: modelInstance.object3D, opType: "INSERT" });

          this.uilog.log(UILog.EVENT.MODEL_INSERT, null, objInfo);
          obj.visible = true;
          this.onSceneUpdated();
        }
      }
    }
  }
};

SceneViewer.prototype.toggleVoxels = function () {
  this.showSceneVoxels = !this.showSceneVoxels;
};

SceneViewer.prototype.setModelVisibility = function (filter, flag) {
  for (var i = 0; i < this.sceneState.modelInstances.length; i++) {
    var modelInstance = this.sceneState.modelInstances[i];
    if (filter(modelInstance)) {
      Object3DUtil.setVisible(modelInstance.object3D, flag);
    }
  }
};

SceneViewer.prototype.applyScanOpacity = function (modelInstances, transparency) {
  if (modelInstances === undefined) {
    modelInstances = this.sceneState.modelInstances;
  }
  if (transparency === undefined) {
    transparency = 1.0 - this.scanOpacity;
  }
  for (var i = 0; i < modelInstances.length; i++) {
    var modelInstance = modelInstances[i];
    if (modelInstance && modelInstance.model.isScan()) {
      // Make semi transparent
      Object3DUtil.setTransparency(modelInstance.object3D, transparency);
      // Set depthWrite to false so the other objects always appear on top
      // if very transparent
      Object3DUtil.setDepthWrite(modelInstance.object3D, transparency < 0.75);
    }
  }
};

SceneViewer.prototype.__applyArchOpacity = function (opacity) {
  const sceneState = this.sceneState;
  const archObjects = sceneState.getArchObject3Ds();
  archObjects.forEach((arch) => {
    const meshes = Object3DUtil.getMeshList(arch, false);
    meshes.forEach((surface) => {
      const materials = (surface.material instanceof Array) ? surface.material : [surface.material];
      materials.forEach((material) => {
        if (material) {
          if (material.opacityBackup == null) {
            material.opacityBackup = material.opacity;
          }
          material.opacity = Math.min(material.opacityBackup, opacity);
          material.transparent = material.opacity < 1;
        }
      });
    });
  });
};

SceneViewer.prototype.toggleVfModelVisibility = function () {
  this.showScan = !this.showScan;
};

SceneViewer.prototype.toggleNonVfModelVisibility = function () {
  this.showModels = !this.showModels;
};

SceneViewer.prototype.highlightObjects = function (objects) {
  objects = objects || [];
  if (this.highlighted) {
    var unhighlight = this.highlighted.filter(function (x) {
      return objects.indexOf(x) < 0;
    });
    this.picker.unhighlightObjects(unhighlight);
  }
  this.highlighted = objects;
  if (objects) {
    this.picker.highlightObjects(objects);
  }
};

SceneViewer.prototype.__createDebugOBBMeshes = function(obbs) {
  var MeshHelpers = require('geo/MeshHelpers');
  var debugOBBs = new THREE.Group();
  for (var i = 0; i < obbs.length; i++) {
    var obb = obbs[i];
    if (obb) {
      var mat = Object3DUtil.getSimpleFalseColorMaterial(i);
      var mobb = new MeshHelpers.OBB(obb, mat);
      debugOBBs.add(mobb.toWireFrame(0, mat, false, true));
    }
  }
  return debugOBBs;
};

SceneViewer.prototype.onSceneLoad = function(loadOptions, sceneState, err) {
  this.removeWaiting(loadOptions.loadKey, 'loadScene');
  loadOptions.loadTime.end = new Date().getTime();
  loadOptions.loadTime.duration = loadOptions.loadTime.end - loadOptions.loadTime.start;
  console.log('Load time for scene: ' + loadOptions.loadTime.duration);

  if (err || !sceneState) {
    // Errored abort!!!
    if (err) {
      console.error('Error loading scene', err);
    }
    if (loadOptions.onError) {
      loadOptions.onError();
    }
    this.showError(loadOptions.loadErrorMessage || 'Error loading scene');
  } else {
    this.__onSceneLoadSuccessful(loadOptions, sceneState);
  }
};

SceneViewer.prototype.__onSceneLoadSuccessful = function (loadOptions, sceneState) {
  //console.log(sceneState);
  console.time('onSceneLoad');
  var oldLights = this.sceneState.lights;
  this.sceneState = sceneState;
  this.applyScanOpacity();
  var basicScene = sceneState.scene;
  // Debugging
  //var obbs = this.__createDebugOBBMeshes(sceneState.getSavedOBBs());
  //basicScene.add(obbs);
  this.sceneType = sceneState.sceneType ? sceneState.sceneType : this.sceneType;
  var sceneBBox = Object3DUtil.getBoundingBox(basicScene);
  var bbdims = sceneBBox.dimensions();
  console.log('Scene ' + sceneState.getFullID() +
    ' bbdims: [' + bbdims.x + ',' + bbdims.y + ',' + bbdims.z + ']');
  console.log(sceneBBox);

  if (loadOptions.addGround) {
    this.addGroundToScene(sceneBBox.getWorldPosition(new THREE.Vector3(0.5, 0, 0.5)));
  }

  this.sceneState.compactify();  // Make sure that there are no missing models
  if (this.sceneHierarchy) { this.sceneHierarchy.setSceneState(this.sceneState); }
  if (this.bvhVisualizer) { this.bvhVisualizer.setSceneState(this.sceneState); }
  // if (this.imageCameraControl) { this.imageCameraControl.setSceneState(this.sceneState); }
  //        this.modelInstances = scene.modelInstances;
  this.sceneVoxels.init(this.sceneState, this.showSceneVoxels);
  this.sceneState.fullScene.add(this.sceneVoxels.voxelNode);

  if (this.sceneState.selectedObjects) {
    this.setSelectedObjects(this.sceneState.selectedObjects.slice());
    // for (var i = 0; i < this.sceneState.selectedObjects.length; i++) {
    //   this.__updateObjectSelection(this.sceneState.selectedObjects[i]);
    // }
  }

  var sceneId = sceneState.getFullID();
  if (this.sceneAnnotate) {
    this.sceneAnnotate.setSceneId(sceneId);
  }

  // Update camera
  this.__keepCurrentView = false;
  if (loadOptions.keepCurrentCamera) {
    console.log('Use current camera and lights');
    this.__keepCurrentView = sceneState.setCurrentCameraControls(this.cameraControls, 'current');
    sceneState.addLights(oldLights);
  }
  if (sceneState.currentCameraControls) {
    //console.log('Using current camera controls');
    this.sceneState.fullScene.add(this.camera);
  } else if (sceneState.currentCamera) {
    // If there is a scene camera - use that camera
    console.log('Setting camera to scene state camera');
    this.camera = sceneState.currentCamera;
    if (this.camera instanceof THREE.PerspectiveCamera) {
      this.camera.aspect = this.getAspectRatio();
      this.camera.updateProjectionMatrix();
    } else if (THREE.CombinedCamera && this.camera instanceof THREE.CombinedCamera) {
      var width = this.container.clientWidth;
      var height = this.container.clientHeight;
      this.camera.setSize(width, height);
      this.camera.updateProjectionMatrix();
    }
    this.cameraControls = new CameraControls({
      controlType: this.controlType,
      camera: this.camera,
      container: this.container,
      autoRotateCheckbox: $('#autoRotate'),
      renderCallback: () => {
        this.render();
      }
    });
    this.__keepCurrentView = sceneState.setCurrentCameraControls(this.cameraControls);
  } else {
    console.log('Adding default cameras and lights');
    this.addDefaultCamerasAndLights(sceneBBox);
    this.resetCamera({
      viewIndex: this.viewIndex,
      targetBBox: sceneBBox
    });
    this.__keepCurrentView = sceneState.setCurrentCameraControls(this.cameraControls, 'current');
  }

  if (this.cameraControlsPanel) {
    this.cameraControlsPanel.setControls(this.cameraControls);
  }
  // Make sure things are displayed properly
  this.showCeiling = this.__showCeiling; // Make sure ceiling state is good...
  this.showScene = this._showScene;
  this.showModels = this._showModels;
  this.showScan = this._showScan;
  this.showSceneVoxels = this._showSceneVoxels;
  this.onSceneChanged();

  if (this.undoStack) {
    this.undoStack.sceneState = this.sceneState;
  }
  

  if (this.colorBy) {
    this.colorBy = this.colorBy;  // Make sure scene is recolored
  }
  if (this.loadAll && this.floor != null) {
    // Find node
    var id = (this.room != null) ? this.floor + '_' + this.room : this.floor;
    // Use ==, since floor is often represented just as a integer
    var node = sceneState.findNode(function (x) { return x.userData.id == id; });
    if (node) {
      this.showOnly(node);
      if (this.sceneHierarchy) {
        this.sceneHierarchy.selectObject(node, true);
      }
    }
  }

  var options = this.sceneOptions[sceneId];
  if (options && options['selectedModels']) {
    this.setSelectedModels(options['selectedModels']);
  } else {
    if (loadOptions && loadOptions['selectedModels']) {
      this.setSelectedModels(loadOptions['selectedModels']);
    } else {
      this.setSelectedModels(sceneState.getSelectedModelIndices());
    }
  }

  if (options && options.targetObjectIds) {
    var targets = this.sceneState.findNodes(function (x) {
      return options.targetObjectIds.indexOf(x.userData.id) >= 0;
    });
    this.lookAt(targets);
  }

  if (this.sceneTemplateViewer) {
    var sceneJson = sceneState.getSceneJson();
    if (sceneJson) {
      this.sceneTemplateViewer.showSceneParse(sceneJson);
    }
  }

  if (loadOptions.clearUndoStack) {
    if (this.undoStack) {
      this.undoStack.clear();
    }
  }
  if (loadOptions.clearUILog) {
    this.uilog.clear();
  }
  if (loadOptions.pushToUndoStack) { //only push if load was not triggered by undo/redo
    if (this.undoStack) {
      this.undoStack.pushCurrentState(Constants.CMDTYPE.INIT);
    }
    this.uilog.log(UILog.EVENT.SCENE_LOAD, null, {});
  }

  if (loadOptions.onSuccess) {
    loadOptions.onSuccess(sceneState);
  }
  
  if (loadOptions.sceneRestore) {
    this.Publish("SceneRestore", sceneState, { loadTime: loadOptions.loadTime });
  } else {
    this.Publish("SceneLoaded", sceneState, { loadTime: loadOptions.loadTime });
  }

  // Update shadows
  if (this.useShadows) {
    console.log('using shadows');
    Object3DUtil.setCastShadow(this.sceneState.fullScene, true);
    Object3DUtil.setReceiveShadow(this.sceneState.fullScene, true);
  }

  // Whether to have mirrors
  if (this.enableMirrors) {
    var scope = this;
    Object3DUtil.addMirrors(this.sceneState.scene, {
      ignoreSelfModel: true,
      renderer: scope.renderer.renderer,
      assetManager: scope.assetManager,
      camera: scope.camera,
      width: scope.renderer.width,
      height: scope.renderer.height
    });
  }
  console.timeEnd('onSceneLoad');
};


SceneViewer.prototype.generateSucceededCallback = function (scenes) {
  if (scenes.length > 0) {
    // Load first scene
    // Use special load options for text2scene (don't clearUndoStack)
    var loadOptions = {
      keepCurrentCamera: false,
      clearUndoStack: false,
      pushToUndoStack: true
    };
    this.clearAndLoadScene(scenes[0], loadOptions);
  }
};

SceneViewer.prototype.getSceneState = function () {
  return this.sceneState;
};

SceneViewer.prototype.getRenderScene = function () {
  return this.sceneState.fullScene;
};

SceneViewer.prototype.resetCamera = function (options) {
  if (options) {
    if (options.theta === undefined) options.theta = 0;
    if (options.phi === undefined) options.phi = 0;
  }
  Viewer3D.prototype.resetCamera.call(this, options);
};

SceneViewer.prototype.refreshSceneMaterials = function() {
  if (this.sceneState) {
    this.__revertSceneMaterials();
  }
};

SceneViewer.prototype.__revertObjectMaterials = function (object3D, nonrecursive) {
  Object3DUtil.revertMaterials(object3D, nonrecursive, true);
  if (this.__colorBy && this.__colorBy !== 'original') {
    SceneUtil.recolorObject(object3D);
  }
};

SceneViewer.prototype.__revertSceneMaterials = function (showAll) {
  // No highlighting
  this.highlightObjects(null);
  // Revert materials to original materials (not hidden)
  Object3DUtil.revertMaterials(this.sceneState.scene, false, true);
  if (showAll != undefined) {
    Object3DUtil.setState(this.sceneState.scene, 'isHidden', !showAll);
  }
  // Save scene materials
  if (this.__colorBy && this.__colorBy !== 'original') {
    SceneUtil.colorScene(this.sceneState, this.__colorBy, this.colorByOptions);
  } else {
    this.sceneState.hideObjectSegmentation();
  }
  // Keep selection...
  if (this.highlightMode != undefined) {
    this.__toggleHighlightMode(this.highlightMode);
  }
};

SceneViewer.prototype.showOnly = function (objs) {
  // Revert materials to original materials
  this.__revertSceneMaterials(true);
  if (!objs) return;
  if (!Array.isArray(objs)) {
    objs = [objs]; // Make sure objs is array
  }
  // Set materials to clear if NOT descendant of target objs
  Object3DUtil.setMaterial(this.sceneState.scene, this.hiddenMaterial, Object3DUtil.MaterialsAll, true, function (x) {
    return !Object3DUtil.isDescendantOf(x, objs);
  });
  Object3DUtil.setState(this.sceneState.scene, 'isHidden', true, function (x) {
    return !Object3DUtil.isDescendantOf(x, objs);
  });
};

SceneViewer.prototype.showObject = function (obj, flag) {
  Object3DUtil.setState(obj, 'isHidden', !flag);
  this.__updateObjectSelection(obj);
};

SceneViewer.prototype.showAll = function () {
  this.__revertSceneMaterials(true);
};

SceneViewer.prototype.lookAt = function (objects) {
  if (!this.__viewOptimizer || this.__viewOptimizer.cameraControls !== this.cameraControls) {
    this.__viewOptimzer = new ViewOptimizer({
      cameraControls: this.cameraControls,
      maxWidth: 300, maxHeight: 300,
      width: this.renderer.width,
      height: this.renderer.height
    });
  }
  var opt = this.__viewOptimzer.lookAt(this.sceneState, objects);
  this.cameraControls.viewTarget(opt);
};

SceneViewer.prototype.getSceneBoundingBox = function () {
  var scene = this.sceneState.scene;
  var bbox = Object3DUtil.getBoundingBox(scene);
  return bbox;
};

SceneViewer.prototype.onWindowResize = function (options) {
  Viewer3D.prototype.onWindowResize.call(this, options);

  if (this.picker && this.picker.onResize) {
    this.picker.onResize(this.container);
  }

  this.sceneSearchController.onResize(options);
  this.modelSearchController.onResize(options);
  this.textureSearchController.onResize(options);
  this.archSearchController.onResize(options);

  this.sceneTemplateViewer.onResize();
  if (this.sceneHierarchy) {
    this.sceneHierarchy.onResize();
  }
  if (this.bvhVisualizer) {
    this.bvhVisualizer.onResize();
  }
};

SceneViewer.prototype.redisplay = function () {
  requestAnimationFrame(this.redisplay.bind(this));
  if (this.__perfStats) { this.__perfStats.begin(); }
  this.cameraControls.update();
  this.sceneVoxels.update();
  this.updateAndRender();
  if (this.__perfStats) { this.__perfStats.end(); }
};

SceneViewer.prototype.highlightHovered = function(event, pickables, targetType) {
  // console.log('highlight', event);
  var highlightControls = this.editControls.dragdrop.highlightControls;
  if (event) {
    highlightControls.highlightIntersected(event, pickables, targetType);
    return highlightControls.intersected;
  } else {
    highlightControls.clear();
  }
};

SceneViewer.prototype.selectClicked = function (event) {
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
    if (this.selectMode) {
      clicked.userData.isSelected = !clicked.userData.isSelected;
      this.__updateObjectSelection(clicked);
    } else if (this.materialMode) {
      if (this.selectedTextureMaterial) {
        this.applyMaterial([clicked], this.selectedTextureMaterial);
      }
      if (this.selectedColorMaterial) {
        this.applyMaterial([clicked], this.selectedColorMaterial);
      }
    }
  }
};

SceneViewer.prototype.lookAtClicked = function (event) {
  var selectedObject = this.editControls.select(event);
  if (selectedObject) {
    if (this.sceneHierarchy) {
      // Deselect other objects unless in selectMode
      this.sceneHierarchy.selectObject(selectedObject, !this.selectMode);
    }
    this.lookAt(selectedObject);
  } else {
    var pickedObject = this.editControls.pick(event);
    if (pickedObject) {
      this.lookAt(pickedObject);
    }
  }
};

SceneViewer.prototype.articulateClicked = function (event) {
  var selectedModelInstance = this.getClickedModelInstance(event);
  if (selectedModelInstance) {
    var capabilities = selectedModelInstance.queryCapabilities(this.assetManager);
    if (capabilities.articulation) {
      var cap = capabilities.articulation;
      var clickedMesh = this.editControls.selectMesh(event);
      //console.log('clicked', clickedMesh.userData);
      if (clickedMesh) {
        let pid = clickedMesh.userData.articulatablePartId;
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
};

SceneViewer.prototype.actOnClicked = function (event) {
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
      'video', function () {
        return Object3DUtil.addVideoPlayer(object3D, { assetManager: scope.assetManager });
      });
    if (videoCapability) {
      object3D.videoPlayer.toggle();
    }
  }
};

SceneViewer.prototype.getClickedModelInstance = function (event) {
  var selectedObject = this.editControls.select(event);
  if (selectedObject) {
    var modelInstance = Object3DUtil.getModelInstance(selectedObject);
    if (modelInstance) {
      return modelInstance;
    }
  }
};

SceneViewer.prototype.getClickedObject = function (event) {
  var selectedObject = this.editControls.select(event);
  return selectedObject;
};

SceneViewer.prototype.onEditOpInit = function (command, cmdParams) {
  this.setContextQueryActive(false);
  if (this.undoStack) {
    this.undoStack.prepareDeltaState(command, cmdParams);
  }
};

SceneViewer.prototype.onSelectedInstanceChanged = function (modelInstance) {
  this.Publish('SelectedInstanceChanged', modelInstance);
};

SceneViewer.prototype.onEditOpCancel = function (command, cmdParams) {
  // console.log({"event": "onEditOpDone", "command": command, "cmdParams": cmdParams});

  if (command === Constants.CMDTYPE.INSERT) {
    var object = cmdParams.object;
    var modelInstance = object? Object3DUtil.getModelInstance(object) : null;
    this.Publish('ObjectInsertCancelled', modelInstance, { object3D: object, opType: command });
    // console.log({"event": "ObjectInsertCancelled", "modelInstance": modelInstance, "cmdParams":  { object3D: object, opType: command }});
  }
};

SceneViewer.prototype.onEditOpDone = function (command, cmdParams) {
  // console.log({"event": "onEditOpDone", "command": command, "cmdParams": cmdParams});

  if (command === Constants.CMDTYPE.INSERT || command === Constants.CMDTYPE.MOVE) {
    var object = cmdParams.object;
    var modelInstance = object? Object3DUtil.getModelInstance(object) : null;
    this.Publish('ObjectPlaced', modelInstance, { object3D: object, opType: command });
  }
  if (this.undoStack) {
    this.undoStack.pushCurrentState(command, cmdParams);
  }
};

SceneViewer.prototype.deleteObject = function (obj, event) {
  this.editControls.detach();
  var mInst = Object3DUtil.getModelInstance(obj);
  var index = this.sceneState.modelInstances.indexOf(mInst);
  this.sceneState.removeObjects([index]);
  this.onSceneUpdated();

  var objInfo = mInst.getUILogInfo(true);
  this.uilog.log(UILog.EVENT.MODEL_DELETE, event, objInfo);
  if (this.undoStack) {
    this.undoStack.pushCurrentState(Constants.CMDTYPE.DELETE);
  }
  this.Publish('DeleteObject', obj, mInst);
};

SceneViewer.prototype.tumbleObject = function (obj, event) {
  var mInst = Object3DUtil.getModelInstance(obj);

  var cmdParams = { object: mInst, tumble: true };
  this.Publish(Constants.EDIT_OPSTATE.INIT, Constants.CMDTYPE.SWITCHFACE, cmdParams);
  Object3DUtil.tumble(obj);
  this.Publish(Constants.EDIT_OPSTATE.DONE, Constants.CMDTYPE.SWITCHFACE, cmdParams);
  var objInfo = mInst.getUILogInfo();
  this.uilog.log(UILog.EVENT.MODEL_TUMBLE, event, objInfo);
};

// Object selection
SceneViewer.prototype.__updateObjectMaterial = function (object3D, material) {
  var useFalseMaterial;
  var m = material;
  switch (this.highlightMode) {
    case SceneViewer.HighlightSelectedFalseBkFalse:
      useFalseMaterial = true;
      if (!object3D.userData.isSelected) m = this.falseBkMaterial;
      break;
    case SceneViewer.HighlightSelectedOrigBkFalse:
      useFalseMaterial = !object3D.userData.isSelected;
      if (!object3D.userData.isSelected) m = this.falseBkMaterial;
      break;
    case SceneViewer.HighlightSelectedFalseBkOrig:
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
      nonrecursive ? Object3DUtil.MaterialsAllNonRecursive : Object3DUtil.MaterialsAll, true,
      function (node) {
        return !node.userData.isHidden;  // don't set material for hidden objects
      });
  } else {
    this.__revertObjectMaterials(object3D, nonrecursive);
  }
  // Use clear material for hidden objects
  Object3DUtil.setMaterial(object3D, this.hiddenMaterial, Object3DUtil.MaterialsAll, true,
    function (node) {
      return node.userData.isHidden;  // set material hidden for hidden objects
    });
};

SceneViewer.prototype.__updateObjectSelection = function (object3D) {
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
    this.__updateObjectMaterial(object3D, this.falseBkMaterial);
  }
  // Notify scene hierarchy of change in selection
  if (this.sceneHierarchy) {
    this.sceneHierarchy.updateObjectSelection(object3D, object3D.userData.isSelected);
  }
  if (this.sceneState.selectedObjects.length) {
    console.log('selected: ' + this.sceneState.selectedObjects.map(obj => obj.userData.id));
  }
};

SceneViewer.prototype.groupSelected = function () {
  // Select using scene hierarchy and group!
  var selected = this.sceneState.getSelectedObjects();
  if (selected.length > 0) {
    // Drop any nodes that are already children of selected nodes (so we can keep internal structure)
    var selectedNoChildren = _.filter(selected, function (node) {
      var anc = Object3DUtil.findFirstAncestor(node, function (anc) {
        return _.contains(selected, anc);
      });
      return !anc;
    });
    this.sceneHierarchy.selectAndGroup(selectedNoChildren);
  }
};

SceneViewer.prototype.clearSelectedObjects = function (opts) {
  this.setSelectedObjects([], opts);
};

// Private clear selected objects
SceneViewer.prototype.__clearSelectedObjects = function () {
  // Clear the selected models list
  for (var i = 0; i < this.sceneState.selectedObjects.length; i++) {
    var object3D = this.sceneState.selectedObjects[i];
    object3D.userData.isSelected = false;
    this.__updateObjectMaterial(object3D, this.falseBkMaterial);
  }
  this.sceneState.selectedObjects = [];
};

SceneViewer.prototype.setSelectedObjects = function (objects, opts) {
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
SceneViewer.prototype.__setSelectedObjects = function (objects) {
  this.__clearSelectedObjects();
  for (var i = 0; i < objects.length; i++) {
    var obj = objects[i];
    obj.userData.isSelected = true;
    this.sceneState.selectedObjects.push(obj);
    this.__updateObjectMaterial(obj, i + 1);
  }
};

SceneViewer.prototype.setSelectedModels = function (modelIds) {
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

SceneViewer.prototype.__toggleHighlightMode = function (mode) {
  if (mode !== undefined) {
    this.highlightMode = mode;
  } else {
    this.highlightMode = (this.highlightMode + 1) % SceneViewer.HighlightModesCount;
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

SceneViewer.prototype.generateUrl = function () {
  //        if (!this.modelInstanceMap) {
  //            this.modelInstanceMap = this.sceneState.createModelIdToInstanceMap();
  //        }
  // Generate URL for recreating this scene (at least relevant aspects)
  var sceneId = this.sceneState.getFullID();
  var selected = this.sceneState.selectedObjects.map(
    function (obj) {
      return '#' + obj.name;
    }).join();
  // camera far, near, position, lookat
  var camera = this.camera;
  var params = $.param({
    sceneId: sceneId,
    selectedModels: selected,
    hl: this.highlightMode
  });
  var url = window.location.pathname + '?' + params;
  console.log(selected);
  console.log(url);
};

SceneViewer.prototype.loadPrevScene = function () {
  // Loads prev scene (from scenes in search list)
  this.sceneSearchController.searchPanel.selectPrev();
};

SceneViewer.prototype.loadNextScene = function () {
  // Loads next scene (from scenes in search list)
  this.sceneSearchController.searchPanel.selectNext();
};

SceneViewer.prototype.rotateModels = function (modelInstances, axis, delta, bbfaceIndex) {
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
    objInfo['rotateBy'] = { axis: axis, rotateBy: delta };
    this.uilog.log(UILog.EVENT.MODEL_ROTATE, null, objInfo);
    //Object3DUtil.attachToParent(mInst.object3D, parent, this.sceneState.fullScene);
  }
};

SceneViewer.prototype.scaleModels = function (modelInstances, scaleBy, bbfaceIndex) {
  for (var i = 0; i < modelInstances.length; i++) {
    var mInst = modelInstances[i];
    mInst.scaleBy(scaleBy, bbfaceIndex);
    var objInfo = mInst.getUILogInfo();
    objInfo['scaleBy'] = scaleBy;
    this.uilog.log(UILog.EVENT.MODEL_SCALE, null, objInfo);
  }
};

SceneViewer.prototype.onKeyUp = function(event){
  return this.editControls.onKeyUp(event);
};

SceneViewer.prototype.onKeyDown = function (event) {
  if (event.target.type && (event.target.type === 'text' || event.target.type === 'textarea')) return;
  if (this.__sceneHierarchyContextMenuActivated) {
    if (event.which === 27) {  // escape
      this.sceneHierarchy.hideContextMenu();
      this.__sceneHierarchyContextMenuActivated = null;
    } else {
      this.sceneHierarchy.contextMenuKeyPressed(event);
    }
  }
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


SceneViewer.prototype.bindKeys = function () {
  var scope = this;
  var canvas = scope.renderer.domElement;
  keymap('esc', function () {
    if (scope.mouseMode) {
      scope.mouseMode = null;
    }
  });
  keymap({ on: 'ctrl-i', do: 'Take screenshot', target: canvas }, function () {
    scope.saveImage();
  });
  keymap({ on: 'ctrl-o', do: 'Reset camera', target: canvas }, function () {
    scope.cameraControls.restoreCameraState();
  });
  keymap({ on: 'shift-t', do: 'Toggle control type', target: canvas }, function () {
    scope.toggleControlType();
  });
  keymap({ on: 'ctrl-u', do: 'Toggle highlight mode', target: canvas }, function () {
    if (scope.allowHighlightMode) {
      scope.__toggleHighlightMode();
    }
  });
  keymap({ on: 'shift-a', do: 'Show coordinate axes', target: canvas }, function () {
    scope.showAxes = !scope.showAxes;
  });
  keymap({ on: 'defmod-s', do: 'Save scene', target: canvas }, function () {
    console.log('Save scene');
    scope.saveScene(function (json) {
      FileUtil.saveJson(json, 'scene.json');
    }.bind(scope));
  });
  // Main UI functions
  keymap({ on: 'defmod-z', do: 'Undo', target: canvas }, function (event) {
    scope.undo(event);
  });
  keymap({ on: 'defmod-y', do: 'Redo', target: canvas }, function (event) {
    scope.redo(event);
  });
  if (scope.allowCopyPaste) {
    keymap({ on: 'defmod-c', do: 'Copy', target: canvas }, function (event) {
      scope.copy(event);
    });
    keymap({ on: 'defmod-x', do: 'Cut', target: canvas }, function (event) {
      scope.cut(event);
    });
    keymap({ on: 'defmod-v', do: 'Paste', target: canvas }, function (event) {
      scope.paste(event);
    });
  }
  keymap({ on: 'shift-r', do: 'Replace', target: canvas }, function (event) {
    scope.replace(event);
  });
  keymap({ on: 'ctrl-m', do: 'Tumble orientation', target: canvas }, function (event) {
    scope.tumble(event);
  });
  this.__bindSpecialKeys(keymap);

  this.renderer.domElement.addEventListener('keyup', this.onKeyUp.bind(this), true);
  this.renderer.domElement.addEventListener('keydown', this.onKeyDown.bind(this), true);
};

SceneViewer.prototype.__bindSpecialKeys = function(keymap) {
  var scope = this;
  var canvas = scope.renderer.domElement;
  keymap({ on: 'shift-s', do: 'Set scene type', target: canvas }, function (event) {
    if (scope.allowBBoxQuery) {
      scope.contextQueryControls.showSceneTypeDialog();
    }
  });
  keymap('o', function () {
    var clusters = SceneUtil.clusterObjectsByBoundingBoxes(scope.sceneState.modelInstances);
    _.map(clusters, function (c) {
      var mesh = new MeshHelpers.BoxMinMax(c.bbox.min, c.bbox.max, Object3DUtil.TransparentMat);
      scope.sceneState.debugNode.add(mesh);
    });
  });
  keymap('shift-defmod-s', function () {
    var exp = new OBJMTLExporter();
    exp.export(scope.sceneState.scene, { name: scope.sceneState.info.fullId, texturePath: '../texture/' });
  });
  keymap({ on: 'shift-p', do: 'Previous Scene', target: canvas }, function () {
    if (scope.allowScenePrevNext) {
      scope.loadPrevScene();
    }
  });
  keymap({ on: 'shift-n', do: 'Next Scene', target: canvas }, function () {
    if (scope.allowScenePrevNext) {
      scope.loadNextScene();
    }
  });
  keymap({ on: 'ctrl-shift-v', do: 'Toggle showing voxels', target: canvas }, function () {
    scope.toggleVoxels();
  });
  keymap({ on: 'ctrl-b', do: 'Toggle context query mode', target: canvas }, function () {
    scope.toggleContextQueryMode();
  });
  keymap({ on: 'g', do: 'Group selected models', target: canvas }, function () {
    if (scope.selectMode) {
      scope.groupSelected();
    }
  });
  keymap({ on: 'shift-m', do: 'Retexture scene', target: canvas }, function () {
    scope.changeMaterials();
  });
  keymap({ on: 'shift-space', do: 'Toggle scan mesh', target: canvas }, function () {
    scope.toggleVfModelVisibility();
  });
  if (this.allowMagicColors) {
    keymap({ on: 'ctrl-g', do: 'Color by category', target: canvas }, function () {
      scope.colorBy = 'category';
    });
    keymap({ on: 'ctrl-shift-g', do: 'Color by room type', target: canvas }, function () {
      scope.colorBy = 'roomType';
    });
    keymap({ on: 'shift-g', do: 'Color by model id', target: canvas }, function () {
      scope.colorBy = 'modelId';
    });
    keymap({ on: 'ctrl-alt-g', do: 'Color by object id', target: canvas }, function () {
      scope.colorBy = 'objectId';
    });
  }
};

SceneViewer.prototype.changeMaterials = function () {
  this.__cache = this.__cache || {};
  var scope = this;
  SceneUtil.getAggregatedSceneStatistics(this.__cache, function (err, aggregatedSceneStatistics) {
    scope.colorBy = 'original';
    scope.__colorBy = 'custom';
    SceneUtil.recolorWithCompatibleMaterials(scope.sceneState, {
      randomize: true,
      textureOnly: false,
      texturedObjects: scope.retexture.texturedObjects,
      textureSet: scope.retexture.textureSet,
      assetManager: scope.assetManager,
      aggregatedSceneStatistics: aggregatedSceneStatistics
    });
  }, { fs: FileUtil });
};

SceneViewer.prototype.isContextQueryModeActive = function () {
  return this.contextQueryControls && this.contextQueryControls.active;
};

SceneViewer.prototype.toggleContextQueryMode = function () {
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

SceneViewer.prototype.setContextQueryActive = function (flag) {
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

SceneViewer.prototype.addWaiting = function(id, obj, queueName) {
  this._waiting.addWaiting(id, obj, queueName);
  this.setCursorStyle('wait');
  if (this._waiting.hasWaiting(SceneViewer.WAIT.LOAD_SCENE)) {
    this.showLoadingIcon(true);
  }
  if (this._waiting.hasWaiting(SceneViewer.WAIT.LOAD_MODEL)) {
    this.setIsModelLoading(true);
  }
};

SceneViewer.prototype.removeWaiting = function(id, queueName) {
  this._waiting.removeWaiting(id, queueName);
  if (this._waiting.isAllEmpty) {
    this.setCursorStyle('initial');
  }
  if (this._waiting.isQueueEmpty(SceneViewer.WAIT.LOAD_SCENE)) {
    this.showLoadingIcon(false);
  }
  if (this._waiting.isQueueEmpty(SceneViewer.WAIT.LOAD_MODEL)) {
    this.setIsModelLoading(false);
  }
};

SceneViewer.prototype.showLoadingIcon = function (isLoading) {
  Viewer3D.prototype.showLoadingIcon.call(this, isLoading);
  if (this.isLoading) {
    $('#loadingScene').css('visibility', 'visible');
  } else {
    $('#loadingScene').css('visibility', 'hidden');
  }
};

SceneViewer.prototype.addModels = function (objects) {
  // Objects are array of modelIds and transforms
  for (var i = 0; i < objects.length; i++) {
    var modelId = objects[i].modelId;
    this.assetManager.getModelInstance(undefined, modelId,
      function (metadata, modelInstance) {
        var transform = metadata.transform;
        // TODO: Also handle parent?
        modelInstance.applyTransform(transform);
        modelInstance.ensureNormalizedModelCoordinateFrame();
        modelInstance.object3D.metadata = {
          modelInstance: modelInstance
        };
        this.sceneState.addObject(modelInstance);
      }.bind(this, objects[i]),
      function () {
        console.error('Error loading model ' + modelId);
      }
    );
  }
};

//COPY + PASTE
SceneViewer.prototype.copy = function (event) {
  if (this.editControls.selected) {
    var object = this.editControls.selected;
    this.sceneState.assignObjectIndices();
    this.copiedObjectInfo = Object3DUtil.copyObjectWithModelInstances(object, this.sceneState.modelInstances);
    var objInfo = ModelInstance.getUILogInfo(object, true);
    this.uilog.log(UILog.EVENT.MODEL_COPY, event, objInfo);
    this.Publish('CopyCompleted');
  }
};

SceneViewer.prototype.cut = function (event) {
  // Equivalent to a copy and a delete
  this.copy(event);
  this.delete(event);
};

SceneViewer.prototype.paste = function (event) {
  if (this.blockInserts) {
    return;
  }

  var copiedObjectInfo = this.copiedObjectInfo;
  if (copiedObjectInfo) {
    var pastedObjectInfo = Object3DUtil.copyObjectWithModelInstances(copiedObjectInfo.object, copiedObjectInfo.modelInstances);
    this.sceneState.pasteObject(pastedObjectInfo.object, pastedObjectInfo.modelInstances);

    var newModelInst = Object3DUtil.getModelInstance(pastedObjectInfo.object);
    
    if (this.editControls.enabled) {
      this.editControls.onInsert(pastedObjectInfo.object);
    }
    // this.Publish('PasteStarted', newModelInst);
    
    // Logging
    var objInfo = newModelInst.getUILogInfo(true);
    this.uilog.log(UILog.EVENT.MODEL_PASTE, event, objInfo);
    this.Publish('PasteCompleted', newModelInst);
  }
};

SceneViewer.prototype.__postData = function(url, data) {
  //var token = $("meta[name='csrf-token']").attr('content');
  return $.ajax({
    type: 'PUT',
    url: url,
    data: JSON.stringify(data),
    dataType: 'json',
    timeout: 10000,
    // beforeSend: function (xhr) {
    // xhr.setRequestHeader('X-CSRF-Token', token);
    // }X
  });
};

SceneViewer.prototype.saveScene = function (onSuccess, onError) {
  if (this.onSaveUrl) {
    var data = this.getSceneRecord({savePreview: true, stringify: true});
    if (window.globals.assignmentId) {
      data.assignmentId = window.globals.assignmentId;
    }
    if (window.globals.task_id) {
      data.task_id = window.globals.task_id;
    }
    //console.log(data);
    if (this.onSaveUrl === 'window.parent') {
      window.parent.postMessage(data, "*");
    } else {
      this.__postData(this.onSaveUrl, data).error(onError).success(onSuccess);
    }
  } else {
    if (onSuccess) {
      var sceneStateJson = this.sceneState.toJson(false, true);
      onSuccess(sceneStateJson);
      //window.parent.postMessage(JSON.stringify(sceneStateJson), '*');
    } else {
      this.showError('Cannot save scene: No save url');
    }
  }
};

/* Returns serialized JSON record for scene that can be saved */
SceneViewer.prototype.getSceneRecord = function (opts) {
  opts = opts || {};

  var serialized = this.sceneState.toJson(false, true);
  var results = {
    sceneJson: opts.stringify? JSON.stringify(serialized) : serialized,
    ui_log: opts.stringify? this.uilog.stringify() : this.uilog,
    sessionId: this.sessionId
  };
  if (opts.savePreview) {
    results.preview = this.getPreviewImageData();
  }
  return results;
};

SceneViewer.prototype.close = function () {
  this.saveScene();
  if (this.onCloseUrl) {
    window.onbeforeunload = null;
    _.gotoURL(this.onCloseUrl);
  }
};

SceneViewer.prototype.undo = function (event) {
  if (this.undoStack) {
    this.undoStack.undo();
    if (this.editControls) {
      this.editControls.update();
    }
    this.uilog.log(UILog.EVENT.UNDOSTACK_UNDO, event, {});
  }
};

SceneViewer.prototype.redo = function (event) {
  if (this.undoStack) {
    this.undoStack.redo();
    if (this.editControls) {
      this.editControls.update();
    }
    this.uilog.log(UILog.EVENT.UNDOSTACK_REDO, event, {});
  }
};

SceneViewer.prototype.delete = function (event) {
  this.editControls.deleteSelected(event);
};

SceneViewer.prototype.tumble = function (event) {
  this.editControls.tumbleSelected(event);
};

SceneViewer.prototype.replace = function (event) {
  if (this.editControls.selected) {
    this.contextQueryControls.replace(this.editControls.selected,
      { event: event, restrictCategories: true });
    this.setContextQueryActive(true);
  }
};

SceneViewer.prototype.getTutorial = function (tutorialName, params) {
  params = params || {};
  params.app = this;
  if (tutorialName === 'BBoxQueryTutorial') {
    return new BBoxQueryTutorial(params);
  }

  console.error('Unknown tutorial: ' + tutorialName);
  return null;
};

// Exports
module.exports = SceneViewer;
