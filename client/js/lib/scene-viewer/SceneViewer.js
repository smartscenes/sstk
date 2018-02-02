'use strict';

define(['Constants', 'scene/SceneGenerator', 'scene/SceneHierarchyPanel',
    'controls/SceneEditControls', 'controls/Picker', 'ui/SceneAnnotate',
    'assets/AssetGroups', 'assets/AssetManager', 'search/SearchController',
    'search/SolrQuerySuggester', 'model/ModelSchema', 'scene/SceneSchema',
    'scene/SceneState', 'scene/SceneVoxels', 'scene-viewer/VisualizeParts',
    'model/Model', 'model/ModelInstance', 'geo/Object3DUtil', 'geo/GeometryUtil',
    'gfx/ViewOptimizer', 'controls/CameraControls', 'Viewer3D',
    'gfx/Renderer', 'anim/StubbyCharacter',
    'editor/UILog', 'scene-viewer/SceneViewerUndoStack', 'scene-viewer/SceneViewerToolbar',
    'controls/ContextQueryControls', 'controls/OBBQueryControls', 'controls/BBoxQueryControls', 'controls/BBoxQueryTutorial',
    'controls/CameraControlsPanel', 'scene/SceneUtil', 'io/FileUtil',
    'geo/MeshHelpers', 'exporters/OBJMTLExporter',
    'geo/BVH', 'ui/BVHVisualizer',
    'util/Auth', 'controls/keymap', 'util',
    'physijs', 'jquery-console', 'jquery-lazy'],
  function (Constants, SceneGenerator, SceneHierarchyPanel,
            SceneEditControls, Picker, SceneAnnotate,
            AssetGroups, AssetManager, SearchController,
            SolrQuerySuggester, ModelSchema, SceneSchema,
            SceneState, SceneVoxels, VisualizeParts,
            Model, ModelInstance, Object3DUtil, GeometryUtil,
            ViewOptimizer, CameraControls, Viewer3D,
            Renderer, Character,
            UILog, UndoStack, SceneViewerToolbar,
            ContextQueryControls, OBBQueryControls,
            BBoxQueryControls, BBoxQueryTutorial,
            CameraControlsPanel, SceneUtil, FileUtil,
            MeshHelpers, OBJMTLExporter, BVH, BVHVisualizer,
            Auth, keymap, _) {
    SceneViewer.HighlightSelectedFalseBkOrig = 0;  // Selected object is false material, background orig material
    SceneViewer.HighlightSelectedFalseBkFalse = 1;  // Selected object is false material, background false material
    SceneViewer.HighlightSelectedOrigBkFalse = 2;  // Selected object is original material, background false material
    SceneViewer.HighlightModesCount = 3;

    SceneViewer.ControlTypes = ['orbitRightClick', 'firstPerson'];
    SceneViewer.ControlTypesMap = _.invert(SceneViewer.ControlTypes);

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
     *   <li>CopyCompleted: copy completed</li>
     *   <li>PasteCompleted: paste completed</li>
     *   <li>EDIT_INIT: edit operation started</li>
     *   <li>EDIT_DONE: edit operation finished</li>
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
     * @param [params.enableLights=false] {boolean} Whether to enable lights.
     * @param [params.defaultLightState=false] {boolean} If enableLights, initial state of states (set to true to turn on all lights).  TODO: Will not display correctly if too many lights are on at once.
     * @param [params.enableMirrors=false] {boolean} Whether to enable mirrors.
     *
     * @param [params.useSidePanelSearch=true] {boolean} Whether to show search panel on the side.
     * @param [params.showSearchOptions=true] {boolean} Whether to show advanced search options (TODO: refactor into nested options)
     * @param [params.showSearchSourceOption=false] {boolean} Whether search source should be shown (TODO: refactor into nested options)
     * @param [params.restrictScenes] {string} Filter queries (e.g. +datasets:xxx ) for restricting what scenes are shown the search panel
     * @param [params.restrictModels] {string} Filter queries (e.g. +category:xxx ) for restricting what models are shown the search panel
     * @param [params.restrictTextures] {string} Filter queries (e.g. +category:xxx ) for restricting what textures are shown the search panel
     *
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
     * @constructor SceneViewer
     * @extends Viewer3D
     * @public
     */
    function SceneViewer(params) {
      var defaults = {
        appId: 'SceneViewer@0.0.1',
        allowEdit: false,
        useLights: true,
        selectMode: false,
        includeCeiling: true,
        attachWallsToRooms: true,
        createArch: true,
        supportSurfaceChange: Constants.EditStrategy.SupportSurfaceChange.SWITCH_ATTACHMENT,
        contextQueryType: SceneViewer.DefaultContextQueryType,
        textureSet: 'all',
        texturedObjects: Constants.defaultTexturedObjects,
        centerFirstModel: true
      };
      this.urlParams = _.getUrlParams();
      var allParams = _.defaultsDeep(Object.create(null), this.urlParams, params, defaults);
      Viewer3D.call(this, allParams);

      this.userId = Constants.getGlobalOrDefault('userId', this.urlParams['userId']);
      this.defaultSceneId = allParams.defaultSceneId;

      this.sceneState = null;
      this.categoryList = new Set();
      this.mouseX = 0;
      this.mouseY = 0;
      this.assetManager = null;
      this.sceneSearchController = null;
      this.modelSearchController = null;
      this.textureSearchController = null;
      this.sceneGenerator = null;
      this.sceneHierarchy = null;
      this.bvhVisualizer = null;
      this.picker = null;
      this.selectMode = allParams.selectMode;
      this.centerFirstModel = allParams.centerFirstModel;
      this.checkSelectModeFn = params.checkSelectModeFn;
      this.objectSelectMode = false;
      this.allowEdit = allParams.allowEdit;
      this.editMode = (allParams.editMode != undefined)? allParams.editMode : allParams.allowEdit;
      this.supportSurfaceChange = allParams.supportSurfaceChange;
      this.uilog = null;

      this.showInstructions = params.showInstructions;
      this.modelViewerUrl = params.modelViewerUrl;

      this.onLoadUrl = params.onLoadUrl;
      this.onSaveUrl = params.onSaveUrl;
      this.onCloseUrl = params.onCloseUrl;

      this.enableUILog = params.enableUILog;

      this.sceneSources = params.sceneSources || Constants.assetSources.scene;
      this.modelSources = params.modelSources;
      this.defaultLoadOptions = allParams['defaultLoadOptions'];

      this.allowSave = (params.allowSave !== undefined) ? params.allowSave : false;
      this.allowClose = (params.allowClose !== undefined) ? params.allowClose : false;
      this.allowSelectMode = (params.allowSelectMode !== undefined) ? params.allowSelectMode : false;
      this.allowConsole = (params.allowConsole !== undefined) ? params.allowConsole : false;
      this.allowBBoxQuery = (params.allowBBoxQuery !== undefined) ? params.allowBBoxQuery : false;
      this.allowScenePrevNext = (params.allowScenePrevNext !== undefined) ? params.allowScenePrevNext : false;
      this.allowHighlightMode = (params.allowHighlightMode !== undefined) ? params.allowHighlightMode : false;
      this.allowMagicColors = (params.allowMagicColors !== undefined) ? params.allowMagicColors : true;
      this.allowLookAt = (params.allowLookAt !== undefined) ? params.allowLookAt : true;
      this.allowCopyPaste = (params.allowCopyPaste !== undefined) ? params.allowCopyPaste : true;
      this.useSidePanelSearch = (params.useSidePanelSearch !== undefined) ? params.useSidePanelSearch : true;
      this.showSearchOptions = (params.showSearchOptions !== undefined) ? params.showSearchOptions : true;
      this.showSearchSourceOption = (params.showSearchSourceOption !== undefined) ? params.showSearchSourceOption : false;
      this.cameraControlIconsDir = params.cameraControlIconsDir || Constants.cameraControlIconsDir;
      this.toolbarIconsDir = params.toolbarIconsDir || Constants.toolbarIconsDir;
      this.toolbarOptions = params.toolbarOptions;
      this.allowRotation = (params.allowRotation !== undefined) ? params.allowRotation : true;
      this.allowScaling = (params.allowScaling !== undefined) ? params.allowScaling : true;
      this.allowSelectGroups = (params.allowSelectGroups !== undefined) ? params.allowSelectGroups : false;
      this.allowAny = (params.allowAny !== undefined) ? params.allowAny : false;
      this.rotateBy = params.rotateBy;
      // Filter queries (e.g. +category:xxx ) for restricting what model/scenes are shown the search panel
      this.restrictScenes = params.restrictScenes;
      this.__restrictModels = params.restrictModels;
      this.restrictTextures = params.restrictTextures;
      // Are existing objects in the scene frozen?
      this.freezeObjects = params.freezeObjects;
      // Material to use for a selected object
      // If not specified, a different color is used for each selected object
      this.selectedObjectMaterial = params.selectedObjectMaterial;
      this.restrictSelectToModels = params.restrictSelectToModels;

      // filter function takes modelinfo and returns whether to load model
      this.loadModelFilter = params.loadModelFilter;

      // Options for context query
      this.__contextQueryType = allParams.contextQueryType;
      var defaultContextQueryOptions = SceneViewer.DefaultContextQueryOptions[this.__contextQueryType];
      this.__contextQueryOptions = _.defaultsDeep(Object.create(null), params.contextQueryOptions, defaultContextQueryOptions);
      this.contextQueryIsEnabled = params.contextQueryIsEnabled || true;

      this._showModels = true;
      this._showScene = true;
      this._showScan = true;
      this._scanOpacity = 0.5;
      this._headlight = false;

      this._showSceneVoxels = (params.showSceneVoxels !== undefined) ? params.showSceneVoxels : false;
      this.controlTypes = SceneViewer.ControlTypes;
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
      this.usePhysijs = false;
      this.addGround = allParams.addGround || false;
      this.editControls = null;
      this.characterMode = false;

      this.allowEditHierarchy = allParams.allowEditHierarchy;
      this.autoLoadScene = allParams['autoLoadScene'];
      this.autoLoadVideo = allParams['autoLoadVideo'];
      this.enableLights = allParams['enableLights'];
      this.enableMirrors = allParams['enableMirrors'];
      this.defaultLightState = allParams['defaultLightState'];
      this.colorBy = allParams['colorBy'] || 'original';
      this.defaultViewMode = allParams['viewMode'];
      this.defaultModelFormat = allParams['modelFormat'] || params.defaultModelFormat || 'utf8v2';
      this.defaultSceneFormat = allParams['format'] || params.defaultSceneFormat || 'wss';
      this.localLoadingFiletypes = allParams['localLoadingFiletypes'] || ['scene', 'model', 'actionTrace', 'navmap', 'wall'];
      this.loadAll = allParams['loadAll'];
      this.includeCeiling = allParams['includeCeiling'];
      this._showCeiling = allParams.showCeiling || false;
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
          var simConfig = Constants.config.sim || {};
          this.replaceModels = simConfig.replaceModels;
      }
      this.attachWallsToRooms = allParams['attachWallsToRooms'];
      this.createArch = allParams['createArch'];
      this.floor = this.urlParams['floor'];
      if (this.floor === 'all') {
        this.floor = undefined;
      }
      this.loadFloor = this.loadAll? undefined : this.floor;
      this.room = this.urlParams['room'];
      if (this.room === 'all') {
        this.room = undefined;
      }
      this.loadRoom = this.loadAll? undefined : this.room;
      this.retexture = {
        textureSet: allParams.textureSet,
        texturedObjects: allParams.texturedObjects
      };

      // navmap stuff
      this.navmapModes = ['tileWeight','roomIndex','floorHeight'];
      this.navmapModesMap = _.invert(this.navmapModes);
      this.__navmapMode = 0;
      AssetGroups.setDefaultFormat(this.defaultModelFormat);
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

    Object.defineProperty(SceneViewer.prototype, 'scanOpacity', {
      get: function () {return this._scanOpacity; },
      set: function (v) {
        this._scanOpacity = v;
        this.applyVfTransparency();
      }
    });

    Object.defineProperty(SceneViewer.prototype, 'showModels', {
      get: function () {return this._showModels; },
      set: function (v) {
        this._showModels = v;
        this.setModelVisibility(function (m) { return !m.model.isScan(); }, v);
      }
    });

    Object.defineProperty(SceneViewer.prototype, 'showScene', {
      get: function () {return this._showScene; },
      set: function (v) {
        this._showScene = v;
        if (this.sceneState) {
          this.sceneState.scene.visible = v;
        }
      }
    });

    Object.defineProperty(SceneViewer.prototype, 'showScan', {
      get: function () {return this._showScan; },
      set: function (v) {
        this._showScan = v;
        this.setModelVisibility(function (m) { return m.model.isScan(); }, v);
      }
    });

    Object.defineProperty(SceneViewer.prototype, 'showCeiling', {
      get: function () {return this._showCeiling; },
      set: function (v) {
        this._showCeiling = v;
        if (this.sceneState) {
          var ceilings = Object3DUtil.findNodes(this.sceneState.scene, function(node) {
            return node.userData.type === 'Ceiling' || node.userData.archType === 'Ceiling';
          });
          for (var i = 0; i < ceilings.length; i++) {
            var recursive = ceilings[i].userData.type === 'ModelInstance';
            Object3DUtil.setVisible(ceilings[i], v, recursive);
          }
        }
      }
    });

    Object.defineProperty(SceneViewer.prototype, 'showSceneVoxels', {
      get: function () {return this._showSceneVoxels; },
      set: function (v) {
        this._showSceneVoxels = v;
        if (v) {
          this.sceneVoxels.ensureVoxels();
        }
        Object3DUtil.setVisible(this.scene, !v);
        this.sceneVoxels.setVisible(v);
      }
    });

    Object.defineProperty(SceneViewer.prototype, 'showLocalPanel', {
      get: function () { return $('#customLoadingPanel').is(':visible'); },
      set: function (v) {
        if (v) { $('#customLoadingPanel').show(); }
        else { $('#customLoadingPanel').hide(); }
      }
    });

    Object.defineProperty(SceneViewer.prototype, 'restrictModels', {
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

    Object.defineProperty(SceneViewer.prototype, 'colorBy', {
      get: function () { return this.__colorBy; },
      set: function (v) {
        this.__colorBy = v;
        if (this.sceneState) {
          this.__revertSceneMaterials();
        }
      }
    });

    Object.defineProperty(SceneViewer.prototype, 'ambientLightIntensity', {
      get: function () { return this._ambientLights ? this._ambientLights[0].intensity : 0; },
      set: function (v) {
        if (this._ambientLights && this._ambientLights[0]) {
          this._ambientLights[0].intensity = v;
        }
      }
    });

    Object.defineProperty(SceneViewer.prototype, 'headlight', {
      get: function () { return this._headlight; },
      set: function (v) {
        this._headlight = v;
        if (this.camera.children[0]) {
          this.camera.children[0].intensity = this._headlight ? 1 : 0;
        }
      }
    });

    Object.defineProperty(SceneViewer.prototype, 'characterMode', {
      get: function() { return this.__characterMode; },
      set: function(v) {
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

    SceneViewer.prototype.authenticate = function(cb) {
      // Most basic auth ever
      if (this.userId) {
        cb({ username: this.userId });
      }
      if (!this.auth) {
        this.auth = new Auth();
      }
      this.auth.authenticate(function(user) {
        this.userId = user.username;
        cb(user);
      }.bind(this));
    };

    SceneViewer.prototype.updateCameraControl = function (index) {
      Viewer3D.prototype.updateCameraControl.call(this, index);
      this.updateEditControls();
    };

    SceneViewer.prototype.setupDatGui = function () {
      if (this.useDatGui) {
        Viewer3D.prototype.setupDatGui.call(this);

        var showAll = !(this.useDatGui instanceof Object);
        var options = (this.useDatGui instanceof Object) ? this.useDatGui : {};
        // Set up dat gui;
        var gui = this.datgui.getFolder('view');
        if (showAll || options['scanOpacity']) gui.add(this, 'scanOpacity', 0, 1.0).listen();
        if (showAll || options['showScan']) gui.add(this, 'showScan').listen();
        if (showAll || options['showModels']) gui.add(this, 'showModels').listen();
        if (showAll || options['showScene']) gui.add(this, 'showScene').listen();
        if (showAll || options['showSceneVoxels']) gui.add(this, 'showSceneVoxels').listen();
        if (this.allowMagicColors) {
          if (showAll || options['showColors']) {
            // TODO: allow reverting to original colors
            gui.add(this, 'colorBy', ['original'].concat(SceneUtil.ColorByOptions)).listen();
          }
        }
        if (showAll || options['showWalls']) gui.add(this, 'visualizeWalls').listen();
        if (showAll || options['showNavmap']) gui.add(this, 'visualizeNavmap').listen();
        if (showAll || options['showNavmap']) gui.add(this, 'navmapMode', this.navmapModesMap).listen();
        if (showAll || options['lights']) {
          var lightsGui = this.datgui.getFolder('lights');
          lightsGui.add(this, 'ambientLightIntensity', 0, 5).step(0.05).listen();
          lightsGui.add(this, 'headlight').listen();
        }
        if (showAll || options['controls']) {
          this.editControls.updateDatGui(this.datgui);
        }
        //if (showAll || options['showCharacterMode']) gui.add(this, 'characterMode').name('character').listen();
      }
    };

    SceneViewer.prototype.registerCustomSceneAssetGroup = function(assetIdsFile, jsonFile, autoLoad) {
      this.registerCustomAssetGroup(this.sceneSearchController, assetIdsFile, jsonFile, autoLoad);
    };

    SceneViewer.prototype.registerCustomModelAssetGroup = function(assetIdsFile, jsonFile, autoLoad) {
      this.registerCustomAssetGroup(this.modelSearchController, assetIdsFile, jsonFile, autoLoad);
    };

    SceneViewer.prototype.init = function () {
      var scope = this;
      this.setupAssets();

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
        progressCallback: this.handleSceneGenerateProgress.bind(this)
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
        this.sceneHierarchy = new SceneHierarchyPanel({
          container: sceneHierarchyContainer,
          assetManager: this.assetManager,
          tooltipIncludeFields: this.modelSearchController.searchPanel.tooltipIncludeFields,
          onhoverCallback: function (node, objects) {
            scope.highlightObjects(objects);
          },
          allowEditScene: this.allowEdit,
          allowEditHierarchy: this.allowEditHierarchy,
          useIcons: true,
          useSort: true,
          autoCreateTree: true,
          app: this
        });
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

      // create empty scene
      this.sceneState = new SceneState();
      this.sceneVoxels = new SceneVoxels();
      this.sceneVoxels.init(this.sceneState, this.showSceneVoxels);
      this.sceneState.fullScene.add(this.sceneVoxels.voxelNode);
      this.addDefaultCameras(); //AndLights();
      //this.cameraControls.saveCameraState();


      this.showAxes = this._drawAxes;

      this.undoStack = new UndoStack(this, Constants.undoStackMaxSize);
      this.uilog = new UILog({ enabled: this.enableUILog });
      this.uilog.log(UILog.EVENT.SCENE_CREATE, null, {});

      // Setup local loading buttons
      this.setupLocalLoading(this.loadFromLocal.bind(this), false, this.localLoadingFiletypes);

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

      // RENDERER
      this.renderer = new Renderer({
        container: this.container,
        camera: this.camera,
        useAmbientOcclusion: this.useAmbientOcclusion,
        useShadows: this.useShadows,
        useLights: this.useLights
      });
      this.assetManager.maxAnisotropy = this.renderer.getMaxAnisotropy();

      // Setup edit controls and event listeners
      this.setupEditControls();
      this.setupEventListeners();

      // Setup instructions
      this.setupInstructions();

      this.setupConsole();

      // Hookup camera control panel
      this.cameraControlsPanel = new CameraControlsPanel({
        app: this,
        container: $('#cameraControls'),
        controls: this.cameraControls,
        iconsPath: this.cameraControlIconsDir,
        cameraWidgetSettings: Constants.cameraWidgetSettings
      });

      // Hookup toolbar
      this.toolbar = new SceneViewerToolbar({
        app: this,
        container: $('#sceneToolbar'),
        iconsPath: this.toolbarIconsDir,
        allowEdit: this.allowEdit
      });
      this.toolbar.init();
      this.toolbar.applyOptions(this.toolbarOptions);

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

    SceneViewer.prototype.loadInitialScene = function() {
      var sceneId = this.urlParams['sceneId'] || this.defaultSceneId;
      var sceneUrl = this.urlParams['sceneUrl'];
      var skipSearch = this.urlParams['skipSearch'];
      // console.log("sceneId=" + sceneId);
      // console.log(urlParams);
      if (sceneId || sceneUrl) {
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

        if (sceneUrl) {
          this.clearAndLoadScene({ file: sceneUrl }, options);
        } else {
          var sid = AssetManager.toSourceId('scenes', sceneId);
          if (sid.source === 'db' || sid.source === 'mturk' || skipSearch) {
            this.clearAndLoadScene({ fullId: sceneId }, options);
          } else {
            // TODO: Add db/mturk search to search controller...
            this.sceneOptions[sceneId] = options;
            this.sceneSearchController.setSearchText('fullId:' + sceneId);
            this.sceneSearchController.startSearch(
              this.initialSceneSearchSucceeded.bind(this, options)
            );
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
        useBuffers: !this.usePhysijs,   // physijs doesn't like the buffered geometry
        useDynamic: true, // set dynamic to be true so our picking will work
        useColladaScale: false,
        modelFilter: scope.loadModelFilter
      });
      this.assetManager.Subscribe('dynamicAssetLoaded', this, function(d) {
        console.log('adding to dynamic assets', d);
        this._dynamicAssets.push(d);
      }.bind(this));
      // Hack so we recolor room wss.room01
      this.assetManager.addMaterialBinding('wss.room01', {
        'materials': [
          { name: 'floor', textureId: 'textures.47237' },
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

      //sceneSearchController
      this.sceneSearchController = new SearchController({
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
      });
      this.sceneSearchController.searchPanel.setAutocomplete(
        new SolrQuerySuggester({
            schema: new SceneSchema()
        })
      );
      if (this.restrictScenes) {
        this.sceneSearchController.setFilter(Constants.assetTypeScene, this.restrictScenes);
      }
      this.sceneSearchController.Subscribe('startSearch', this, function (query) {
        scope.uilog.log(UILog.EVENT.SEARCH_QUERY, null, { type: 'scene', queryString: query });
      });

      //modelSearchController
      this.modelSources = this.modelSources || _.concat(Constants.assetSources.model, ['vf']);
      this.modelSearchController = new SearchController({
        searchSucceededCallback: this.modelSearchSucceeded.bind(this),
        getImagePreviewUrlCallback: this.assetManager.getImagePreviewUrl.bind(this.assetManager),
        onMousedownResultCallback: this.modelSearchResultClickedCallback.bind(this),  // NOTE: instead of onClick to allow dragging into scene
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
        additionalSortOrder: 'id asc',
        entriesPerRow: 2
      });
      this.modelSearchController.searchPanel.setAutocomplete(
          new SolrQuerySuggester({
            schema: new ModelSchema()
          })
      );
      if (this.restrictModels) {
        this.modelSearchController.setFilter(Constants.assetTypeModel, this.restrictModels);
      }
      this.modelSearchController.Subscribe('startSearch', this, function (query) {
        scope.uilog.log(UILog.EVENT.SEARCH_QUERY, null, { type: 'model', queryString: query });
      });

      //textureSearchController
      this.textureSearchController = new SearchController({
        searchSucceededCallback: this.textureSearchSucceeded.bind(this),
        getImagePreviewUrlCallback: this.assetManager.getImagePreviewUrl.bind(this.assetManager),
        sources: ['textures'],
        searchPanel: $('#textureSearchPanel'),
        panelType: 'side'
      });
      if (this.restrictTextures) {
        this.textureSearchController.setFilter(Constants.assetTypeTexture, this.restrictTextures);
      }
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
        var instructionsHtml = this.instructions? this.instructions.html :
          (this.allowEdit?
          '------Editing Controls_-----------<br>' +
          'LEFT/RIGHT = Rotate highlighted model(s) around Z-axis<br>' +
          'DOWN/UP = Rescale highlighted model(s) by 0.9/1.1 <br>' +
          'Ctrl+S = Save current scene to console<br>' : '') +
          '------Trackball Controller--------<br>' +
          'Right click = Orbit view<br>' +
          'Shift + Right click = Pan view<br>' +
          'Mouse wheel = Zoom view<br>' +
          '------First Person Controller--------<br>' +
          'W/S/A/D = Forward/Back/Left/Right<br>' +
          'R/F = Up/Down<br>' +
          '-------------------------------------<br>' +
          (this.allowLookAt? 'Dblclick = Look at object<br>' : '') +
          (this.allowScenePrevNext? 'Shift+P = Previous scene (in search results)<br>' : '') +
          (this.allowScenePrevNext? 'Shift+N = Next scene<br>' : '') +
          'Ctrl+I = Save image<br>' +
          'Shift+T = Toggle controller mode<br>' +
          'Ctrl+O = Reset camera<br>' +
  //          'G = Generate URL<br>' +
          (this.allowHighlightMode? 'Ctrl+U = Toggle highlight mode<br>' : '') +
          'Shift+Ctrl+V = Toggle voxels<br>' +
          'Shift+A = Toggle axis';
        if (this.allowMagicColors) {
          instructionsHtml += '<br>' +
            '------Magic Colors--------<br>' +
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
        allowAny: this.allowAny
      });
      this.initContextQueryControls();
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

    SceneViewer.prototype.setupEventListeners = function () {
      var scope = this;
      this.registerEventListeners();
      this.bindKeys();
      this.renderer.domElement.addEventListener('mouseup', __wrappedEventListener(function (event) {
          event.preventDefault();
          scope.renderer.domElement.focus();
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

      this.renderer.domElement.addEventListener('mousedown', __wrappedEventListener(function (event) {
          scope.renderer.domElement.focus();
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

      this.renderer.domElement.addEventListener('mousemove', __wrappedEventListener(function (event) {
          event.preventDefault();
          scope.renderer.domElement.focus();
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

      this.renderer.domElement.addEventListener('mouseleave', function (event) {
        if (scope.editMode) {
          scope.editControls.onMouseLeave(event);
        }
      });

      this.renderer.domElement.addEventListener('dblclick', function(event) {
        if (event.shiftKey) {
          scope.actOnClicked(event);
        } else {
          // Hack to keep stuff selected
          if (scope.selectMode) {
            scope.selectClicked(event);
          }
          if (scope.allowLookAt) {
            // Look at clicked
            scope.lookAtClicked(event);
          }
        }
      }, false);

      this.renderer.domElement.addEventListener('keyup', function (event) {
        scope.editControls.onKeyUp(event);
      });

      this.renderer.domElement.addEventListener('keydown', this.onKeyDown.bind(this), true);
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

    SceneViewer.prototype.addGroundToScene = function (center) {
      console.log('Adding ground');
      var planeGeo = new THREE.PlaneGeometry(10 * Constants.metersToVirtualUnit, 10 * Constants.metersToVirtualUnit);
      // Set depthWrite to false so the other objects always appear on top
      var planeMaterial = new THREE.MeshBasicMaterial({ color: 'grey', depthWrite: true });
      var ground = new THREE.Mesh(planeGeo, planeMaterial);
      ground.name = 'Ground';
      ground.castShadow = false;
      ground.receiveShadow = true;

      Object3DUtil.alignToUpFrontAxes(ground, new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), Constants.worldUp, Constants.worldFront);
      ground.isPickable = true;
      ground.isSelectable = false;
      ground.isEditable = false;
      ground.isSupportObject = true;
      ground.userData.type = 'Ground';
      this.sceneState.fullScene.add(ground);
      this.sceneState.addExtraObject(ground);
      if (center) {
        Object3DUtil.placeObject3DByBBFaceCenter(ground, center, Constants.BBoxFaceCenters.TOP);
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

    SceneViewer.prototype.contextQueryControlsOnClickResult = function (source, id, result, elem, index) {
      this.uilog.log(UILog.EVENT.CONTEXT_QUERY_SELECT, null,
        { type: 'model', source: source, id: id, index: index }
      );
      this.loadModel(source, id);
    };

    SceneViewer.prototype.initContextQueryControls = function () {
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
          onClickResultCallback: this.contextQueryControlsOnClickResult.bind(this)
        });
      this.contextQueryControls = new this.__contextQueryOptions.contextQueryControls(options);
      this.contextQueryControls.enabled = this.contextQueryIsEnabled;
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

      var headlight = new THREE.PointLight(new THREE.Color('#fff'), 0, 0, 2);
      headlight.position.y = .2;
      headlight.position.x = .2;
      headlight.shadow.bias = -0.02;
      headlight.shadow.mapSize = new THREE.Vector2(1024, 1024);
      this.camera.add(headlight);

      //this.camera = new THREE.PerspectiveCamera(45, this.getAspectRatio(), 1, 4000);
      this.camera.position.z = 100;
      this.camera.updateMatrix();
      this.camera.updateProjectionMatrix();

      this.cameraControls = new CameraControls({
        controlType: this.controlType,
        camera: this.camera,
        container: this.container,
        autoRotateCheckbox: $('#autoRotate'),
        renderCallback: this.render.bind(this)
      });
      this.sceneState.setCurrentCameraControls(this.cameraControls);

      fullScene.add(this.camera);
    };

    SceneViewer.prototype.addDefaultLights = function (sceneBBox) {
      var intensity = this.enableLights ? 0.5 : 2.0;  // set low if interior lights turned on
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

    SceneViewer.prototype.loadModel = function (source, id, opts) {
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

    SceneViewer.prototype.modelSearchResultClickedCallback = function (source, id, result, elem, index) {
      // if (this.contextQueryControls.active) {
      //   this.toggleContextQueryMode();
      // }
      // Automatically enable editing
      if (this.allowEdit) {
        if (!this.editMode) {
          this.toggleEditMode();
        }
        this.uilog.log(UILog.EVENT.SEARCH_SELECT, null, {type: 'model', source: source, id: id, index: index});
        this.loadModel(source, id);
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

    SceneViewer.prototype.clear = function () {
      // TODO: What should go here?
      this.clearAssets();
    };

    // Clears and loads a new scene
    SceneViewer.prototype.clearAndLoadScene = function (sceneinfo, loadOptions) {
      if (this.isLoading) {
        console.log('Loading is in progress...');
        return;
      }
      this.clear();
      this.showLoadingIcon(true);
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
      loadOptions.loadTime = { start: new Date().getTime() };
      // Make sure some information is pushed through to assetManager loadScene
      sceneinfo = _.merge(sceneinfo, _.pick(loadOptions, _.keys(defaults)));
      var scope = this;
      this.assetManager.loadAssetAsScene(sceneinfo, function(err, sceneState) {
        scope.onSceneLoad(loadOptions, sceneState);
      });
    };

    // Restores scene from undo stack
    SceneViewer.prototype.restoreScene = function (sceneinfo) {
      if (this.isLoading) {
        console.log('Loading is in progress...');
        return;
      }
      this.clear();
      this.showLoadingIcon(true);
      var loadOptions = {
        keepCurrentCamera: true,
        clearUndoStack: false,
        pushToUndoStack: false,
        sceneRestore: true,
        loadTime: { start: new Date().getTime() }
      };
      var scope = this;
      this.assetManager.loadScene(sceneinfo, function(err, sceneState) {
        scope.onSceneLoad(loadOptions, sceneState);
      });
    };

    SceneViewer.prototype.loadModelFromLocal = function(file) {
      if (bootbox && bootbox.form) {
        this.__loadModelConfig = this.__loadModelConfig ||
          {unit: 1, up: Constants.worldUp, front: Constants.worldFront};

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
              scope.__loadModelFromLocal(file, scope.__loadModelConfig);
            }
          }
        });
      } else {
        this.__loadModelFromLocal(file);
      }
    };

    SceneViewer.prototype.__loadModelFromLocal = function (file, opts) {
      if (file) {
        this.setCursorStyle('wait');
        this.setIsModelLoading(true);
        var modelId =  'file.' + file.name;
        this.uilog.log(UILog.EVENT.MODEL_LOAD, null, { modelId: modelId, progress: 'started' });
        var loadOptions = {
          loadTime: { start: new Date().getTime() }
        };
        var scope = this;
        this.assetManager.loadModel(_.defaults({ file: file }, opts || {}), function(err, res) {
          if (err) {
            console.error('Error loading model', modelId, err);
            scope.onModelLoadError(modelId);
          } else {
            scope.onModelLoad(loadOptions, res);
          }
        });
      } else {
        console.log('Cannot load model from local file: No file specified');
      }
    };

    SceneViewer.prototype.loadSceneFromLocal = function (file) {
      if (file) {
        this.clearAndLoadScene({ file: file });
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
        var actionTrace = new ActionTraceLog({fs: FileUtil});
        actionTrace.loadRecords(file, function (err, records) {
          if (err) {
            console.error(err);
          } else {
            var visualizer = new ActionTraceVisualizer();
            visualizer.visualize(scope.sceneState, [records]);
          }
        });
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

    SceneViewer.prototype.visualizeWalls = function(filename) {
      if (!filename) {
        filename = this.sceneState.info.wall.path;
        if (!filename) {
          console.error('No walls path');
          return;
        }
      }
      var scope = this;
      var WallLoader = require('loaders/WallLoader');
      var wallLoader = new WallLoader({fs: FileUtil});
      wallLoader.load(filename, function(err, walls) {
        if (err) {
          console.error(err);
        } else {
          SceneUtil.visualizeWallLines(scope.sceneState, walls);
        }
      });
    };

    SceneViewer.prototype.visualizeNavmap = function(filename) {
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
      _.getJSON(filename, function(err, json) {
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
      this.applyVfTransparency([modelInstance]);
      this.sceneType = modelInstance.model.getCategory();
      if (options && options.initModelInstance) {
        modelInstance.alignAndScale(this.sceneState.getUp(), this.sceneState.getFront(), this.sceneState.getVirtualUnit());
        modelInstance.ensureNormalizedModelCoordinateFrame();
        modelInstance.object3D.metadata = {
          modelInstance: modelInstance
        };
      }

      this.initSceneWithOneModel(modelInstance);
      if (this.addGround) {
        var sceneBBox = Object3DUtil.getBoundingBox(modelInstance.object3D);
        this.addGroundToScene(sceneBBox.getWorldPosition(new THREE.Vector3(0.5,0,0.5)));
      }

      this.setCursorStyle('initial');
      if (options && options.clearUndoStack) {
        this.undoStack.clear();
      }
      if (options && options.clearUILog) {
        this.uilog.clear();
      }
      this.undoStack.pushCurrentState(Constants.CMDTYPE.INIT);
      var objInfo = modelInstance.getUILogInfo(true);
      this.uilog.log(UILog.EVENT.SCENE_CREATE, null, objInfo);
      this.onSceneUpdated();
    };

    SceneViewer.prototype.initSceneWithOneModel = function (modelInstance) {
      // TODO: Make more reasonable positioning of first object
      // Just put object with centroid at (0,0,0)
      if (this.centerFirstModel) {
        var center = new THREE.Vector3(0, 0, 0);
        //var sceneCenter = this.sceneState.scene.worldToLocal( center );
        Object3DUtil.placeObject3D(modelInstance.object3D, center, new THREE.Vector3(0.5, 0, 0.5));
      }

      var sceneBBox = Object3DUtil.getBoundingBox(modelInstance.object3D);
      var sceneBBoxDims = sceneBBox.dimensions();
      var viewBBox = sceneBBox;
      if (sceneBBoxDims.length() < 2*Constants.metersToVirtualUnit) {
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
      this.setCursorStyle('initial');
      this.setIsModelLoading(false);
      this.uilog.log(UILog.EVENT.MODEL_LOAD, null, { modelId: modelId, progress: 'finished', status: 'ERROR' });
    };

    SceneViewer.prototype.onShapeInsert = function (obj, opts) {
      var shapeName = opts.shape;
      var transform = opts.transform;
      // Let's create a special model instance for our box
      var model = new Model(obj, { id: shapeName, fullId: 'shape.' + shapeName, source: 'shape', unit: this.virtualUnitToMeters  });
      var modelInstance = model.newInstance(false);
      if (transform) {
        Object3DUtil.setMatrix(modelInstance.object3D, transform);
      }
      modelInstance.ensureNormalizedModelCoordinateFrame();
      var objInfo = modelInstance.getUILogInfo(true);

      // Update shadows
      if (this.useShadows) {
        Object3DUtil.setCastShadow(modelInstance.object3D, true);
        Object3DUtil.setReceiveShadow(modelInstance.object3D, true);
      }
      // Whether to have mirrors
      if (this.enableMirrors) {
        var scope = this;
        Object3DUtil.addMirrors(modelInstance.object3D, {
          ignoreSelfModel: true,
          renderer: scope.renderer.renderer,
          assetManager: scope.assetManager,
          camera: scope.camera,
          width: scope.renderer.width,
          height: scope.renderer.height
        });
      }

      modelInstance.object3D.metadata = {
        modelInstance: modelInstance
      };

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

      this.setIsModelLoading(false);
      this.uilog.log(UILog.EVENT.MODEL_LOAD, null,
        { modelId: modelInstance.model.getFullID(), progress: 'finished', status: 'SUCCESS' });

      var obj = modelInstance.object3D;
      modelInstance.alignAndScale(this.sceneState.getUp(), this.sceneState.getFront(), this.sceneState.getVirtualUnit());
      modelInstance.ensureNormalizedModelCoordinateFrame();
      // Update shadows
      if (this.useShadows) {
        Object3DUtil.setCastShadow(modelInstance.object3D, true);
        Object3DUtil.setReceiveShadow(modelInstance.object3D, true);
      }
      // Whether to have mirrors
      if (this.enableMirrors) {
        var scope = this;
        Object3DUtil.addMirrors(modelInstance.object3D, {
          ignoreSelfModel: true,
          renderer: scope.renderer.renderer,
          assetManager: scope.assetManager,
          camera: scope.camera,
          width: scope.renderer.width,
          height: scope.renderer.height
        });
      }

      modelInstance.object3D.metadata = {
        modelInstance: modelInstance
      };

      this.Publish("ModelLoaded", modelInstance, { loadTime: loadOptions.loadTime });

      if (modelInstance.model.isScan()) {
        this.createSceneWithOneModel(modelInstance, { initModelInstance: false, clearUILog: true, clearUndoStack: true });
        return;
      }

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

    SceneViewer.prototype.applyVfTransparency = function (modelInstances, transparency) {
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

    SceneViewer.prototype.toggleVfModelVisibility = function () {
      this.showScan = !this.showScan;
    };

    SceneViewer.prototype.toggleNonVfModelVisibility = function () {
      this.showModels = !this.showModels;
    };

    SceneViewer.prototype.highlightObjects = function (objects) {
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

    // TODO: Clean up
    SceneViewer.prototype.convertToPhysijsMeshes = function (node) {
      // Go through children and convert meshes to physijs meshes
      if (node instanceof THREE.Mesh) {
        var newMesh = new Physijs.ConvexMesh(node.geometry, node.material, 10);
        // Clones information from the old mesh into the new one
        node.clone(newMesh);
        return newMesh;
      } else {
        // Clone the node too (instead of just replacing the children...)
        var newNode = node.clone(undefined, false);
        if (node.children) {
          for (var i = 0; i < node.children.length; i++) {
            var newChild = this.convertToPhysijsMeshes(node.children[i]);
            //node.children[i] = newChild;
            newNode.add(newChild);
          }
        }
        return newNode;
      }
    };

    // TODO: Clean up
    SceneViewer.prototype.convertToPhysijsMergedMeshes = function (node) {
      // Go through children and convert meshes to physijs meshes
      if (node instanceof THREE.Mesh) {
        var newMesh = new Physijs.ConvexMesh(node.geometry, node.material, 10);
        // Clones information from the old mesh into the new one
        node.clone(newMesh);
        return newMesh;
      } else {
        // Clone the node too (instead of just replacing the children...)
        var newNode = new Physijs.ConvexMesh(new THREE.Geometry());
        node.clone(newNode, false);
        if (node.children) {
          var mergedGeometry = null;
          var meshFaceMaterials = new THREE.MultiMaterial();
          for (var i = 0; i < node.children.length; i++) {
            if (node.children[i] instanceof THREE.Mesh) {
              var materialIndex = meshFaceMaterials.materials.length;
              if (!mergedGeometry) {
                mergedGeometry = new THREE.Geometry();
              }
              THREE.GeometryUtils.merge(mergedGeometry, node.children[i], materialIndex);
              meshFaceMaterials.materials.push(node.children[i].material);
            } else {
              var newChild = this.convertToPhysijsMergedMeshes(node.children[i]);
              //node.children[i] = newChild;
              newNode.add(newChild);
            }
          }
          if (mergedGeometry) {
            var newChild = new Physijs.ConvexMesh(mergedGeometry, meshFaceMaterials, 10);
            newNode.add(newChild);
          }
        }
        return newNode;
      }
    };

    // TODO: Clean up
    // Experiment with physijs
    // Not quite working.
    // - Physijs doesn't like nested objects (we flatten the object and convert to Physijis Mesh
    //     Can experiment with having Physijs meshes with dummy geometries
    // - Physijs doesn't like shapes with lots of vertices (too slow)
    //     Try to have BoxMesh (much faster)
    SceneViewer.prototype.wrapScene = function (scene, roots, sceneBBox) {
      if (this.usePhysijs) {
        // Convert scene to physijs scene if using physijs

        // Create physijs scene
        var physijsScene = new Physijs.Scene({ fixedTimeStep: 1 / 120 });
        physijsScene.setGravity(new THREE.Vector3(0, -50, 0));
        physijsScene.addEventListener(
          'update',
          function () {
            physijsScene.simulate(undefined, 2);
            //  physics_stats.update();
          }
        );

        // Add objects in scene to physijsScene
        for (var i = 0; i < scene.children.length; i++) {
          var metadata = scene.children[i].metadata;
          var modelId = metadata.modelInstance.model.info.fullId;
          //newChild = this.convertToPhysijsMergedMeshes(newChild);
          var newChild = scene.children[i];
          if (!modelId.startsWith('wss.room')) {
            // TODO: id/name is lost
            var flattened = GeometryUtil.flattenAndMergeMeshes(scene.children[i]);
            console.log('id = ' + modelId + ', name = ' + metadata.modelInstance.model.info.name +
              ', faces = ' + flattened.geometry.faces.length);
            newChild = flattened;
            //newChild = new Physijs.ConvexMesh(flattened.geometry, flattened.material, 10);
          } else {
            console.log('Skipping: ' + modelId);
          }

          // Now make selected models attached to physijs

          // If tide (~5000 faces), make higher so it can drop
          if (modelId === 'wss.c76add9451236ff190f95382f0ffdfb5') {
            // folded towels - ~20000 faces, doesn't move (probably too slow)
            //                if (modelId === "wss.1ee777624ac8375025009b04306ab688" ) {
            // vacuum cleaner = ~1000 faces, will drop (not stable)
            //                if (modelId === "wss.d4623c0713397098566636e42679cc7f") {
            //                if (flattened && flattened.geometry.faces.length < 6000) {
            newChild = new Physijs.ConvexMesh(newChild.geometry, newChild.material, 10);
            newChild.position.y = newChild.position.y + 10;
            newChild.position.__dirtyPosition = true;
            console.log(newChild);
          }

          newChild.metadata = metadata;
          physijsScene.add(newChild);
        }

        // For now, make a flat box geometry as the overall ground
        // Materials
        if (sceneBBox) {
          var groundMaterial = Physijs.createMaterial(
            Object3DUtil.getSimpleFalseColorMaterial(1),
            0.8, // high friction
            0.4 // low restitution
          );

          // Ground
          var bbdims = sceneBBox.dimensions();
          var centroid = sceneBBox.centroid();
          var ground = new Physijs.BoxMesh(
            new THREE.CubeGeometry(bbdims.x, bbdims.y, 1),
            groundMaterial,
            0 // mass
          );
          ground.position.set(centroid.x, centroid.y, sceneBBox.min.z);
          //ground.receiveShadow = true;
          physijsScene.add(ground);

          var material = Object3DUtil.getSimpleFalseColorMaterial(2);
          var boxGeometry = new THREE.CubeGeometry(5, 5, 5);
          var shape = new Physijs.BoxMesh(
            boxGeometry,
            material
          );
          // Physijs can't handle shape nested in Object3D
          // Create a dummy Physijs mesh with just place holder geometry (seems okay)
          var nestedShape = new Physijs.ConvexMesh(
            new THREE.Geometry(),
            material
          );
          //                nestedShape.position.copy( centroid );
          nestedShape.add(shape);
          shape.position.copy(centroid);
          physijsScene.add(shape);
        }

        if (roots) {
          // TODO: Make the roots stationary
          //                for (var i = 0; i < roots.length; i++) {
          //                    var r = roots[i];
          //                    var modelInstance = r.metadata.modelInstance;
          //
          //                }
        }

        // Start simulation (without this, things don't happen)
        physijsScene.simulate();
        physijsScene.selectables = scene.selectables;

        return physijsScene;
      } else {
        return scene;
      }
    };

    SceneViewer.prototype.onSceneLoad = function (loadOptions, sceneState) {
      this.showLoadingIcon(false);
      loadOptions.loadTime.end = new Date().getTime();
      loadOptions.loadTime.duration = loadOptions.loadTime.end - loadOptions.loadTime.start;
      console.log('Load time for scene: ' + loadOptions.loadTime.duration);
      
      // Errored abort!!!
      if (!sceneState) {
        if (loadOptions.onError) {
          loadOptions.onError();
        }
        return;
      }
      //console.log(sceneState);
      console.time('onSceneLoad');
      var oldLights = this.sceneState.lights;
      this.sceneState = sceneState;
      this.applyVfTransparency();
      var basicScene = sceneState.scene;
      var fullScene = sceneState.fullScene;
      this.sceneType = sceneState.sceneType ? sceneState.sceneType : this.sceneType;
      var sceneBBox = Object3DUtil.getBoundingBox(basicScene);
      var bbdims = sceneBBox.dimensions();
      console.log('Scene ' + sceneState.getFullID() +
        ' bbdims: [' + bbdims.x + ',' + bbdims.y + ',' + bbdims.z + ']');
      console.log(sceneBBox);

      if (loadOptions.addGround) {
        this.addGroundToScene(sceneBBox.getWorldPosition(new THREE.Vector3(0.5,0,0.5)));
      }

      this.sceneState.compactify();  // Make sure that there are no missing models
      if (this.sceneHierarchy) { this.sceneHierarchy.setSceneState(this.sceneState); }
      if (this.bvhVisualizer) { this.bvhVisualizer.setSceneState(this.sceneState); }
      //        this.modelInstances = scene.modelInstances;
      if (this.sceneHierarchy) {
        var wrappedScene = this.wrapScene(fullScene, this.sceneHierarchy.getRoots(), sceneBBox);
        sceneState.fullScene = wrappedScene;
      }
      this.sceneVoxels.init(this.sceneState, this.showSceneVoxels);
      this.sceneState.fullScene.add(this.sceneVoxels.voxelNode);

      // TODO: Clean this up!!!
      // for (var i = 0; i < this.sceneState.wrappedThreeObjects.length; i++) {
      //   this.sceneState.addWrappedThreeObjectToScene(this.sceneState.wrappedThreeObjects[i]);
      // }
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
          renderCallback: this.render.bind(this)
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

      this.cameraControlsPanel.setControls(this.cameraControls);
      // Make sure things are displayed properly
      this.showCeiling = this._showCeiling; // Make sure ceiling state is good...
      this.showScene = this._showScene;
      this.showModels = this._showModels;
      this.showScan = this._showScan;
      this.showSceneVoxels = this._showSceneVoxels;
      this.onSceneChanged();

      this.undoStack.sceneState = this.sceneState;

      if (this.colorBy) {
        this.colorBy = this.colorBy;  // Make sure scene is recolored
      }
      if (this.loadAll && this.floor != null) {
        // Find node
        var id = (this.room != null)? this.floor + '_' + this.room : this.floor;
        // Use ==, since floor is often represented just as a integer
        var node = sceneState.findNode(function(x) { return x.userData.id == id; });
        if (node) {
          this.showOnly(node);
          if (this.sceneHierarchy) {
            this.sceneHierarchy.selectObject(node,true);
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
        this.undoStack.clear();
      }
      if (loadOptions.clearUILog) {
        this.uilog.clear();
      }
      if (loadOptions.pushToUndoStack) {//only push if load was not triggered by undo/redo
        this.undoStack.pushCurrentState(Constants.CMDTYPE.INIT);
        this.uilog.log(UILog.EVENT.SCENE_LOAD, null, {});
      }

      this.populateCategoryList();
      if (loadOptions.onSuccess) {
        loadOptions.onSuccess(sceneState);
      }

      if (loadOptions.sceneRestore) {
        this.Publish("SceneRestore", sceneState, {loadTime: loadOptions.loadTime});
      } else {
        this.Publish("SceneLoaded", sceneState, {loadTime: loadOptions.loadTime});
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

    SceneViewer.prototype.__revertObjectMaterials = function(object3D, nonrecursive) {
      Object3DUtil.revertMaterials(object3D, nonrecursive, true);
      if (this.__colorBy && this.__colorBy !== 'original') {
        SceneUtil.recolorObject(object3D);
      }
    };

    SceneViewer.prototype.__revertSceneMaterials = function(showAll) {
      // No highlighting
      this.highlightObjects(null);
      // Revert materials to original materials (not hidden)
      Object3DUtil.revertMaterials(this.sceneState.scene, false, true);
      if (showAll != undefined) {
        Object3DUtil.setState(this.sceneState.scene, 'isHidden', !showAll);
      }
      // Save scene materials
      if (this.__colorBy && this.__colorBy !== 'original') {
        SceneUtil.colorScene(this.sceneState, this.__colorBy, { color: '#fef9ed'});
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
    
    SceneViewer.prototype.showObject = function(obj, flag) {
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

      this.sceneSearchController.onResize(options);
      this.modelSearchController.onResize(options);
      this.textureSearchController.onResize(options);

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
      if (this.editControls) {
        this.editControls.update();
      }
      this.updateAndRender();
      if (this.__perfStats) { this.__perfStats.end(); }
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
        clicked.userData.isSelected = !clicked.userData.isSelected;
        this.__updateObjectSelection(clicked);
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
          'video', function() {
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
      this.undoStack.prepareDeltaState(command, cmdParams);
    };

    SceneViewer.prototype.onEditOpDone = function (command, cmdParams) {
      this.undoStack.pushCurrentState(command, cmdParams);
    };

    SceneViewer.prototype.deleteSelectedObjects = function () {
      this.sceneState.removeSelected();
      this.onSceneUpdated();
    };

    SceneViewer.prototype.deleteHighlightedModels = function () {
      var removeIndices = [];
      for (var i = 0; i < this.sceneState.modelInstances.length; i++) {
        var mInst = this.sceneState.modelInstances[i];
        if (mInst.object3D.isHighlighted) {
          removeIndices.push(i);
          var objInfo = mInst.getUILogInfo(true);
          this.uilog.log(UILog.EVENT.MODEL_DELETE, null, objInfo);
        }
      }
      this.sceneState.removeObjects(removeIndices);
      this.onSceneUpdated();
    };

    SceneViewer.prototype.deleteObject = function (obj, event) {
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
          nonrecursive? Object3DUtil.MaterialsAllNonRecursive : Object3DUtil.MaterialsAll, true,
          function(node) {
            return !node.userData.isHidden;  // don't set material for hidden objects
          });
      } else {
        this.__revertObjectMaterials(object3D, nonrecursive);
      }
      // Use clear material for hidden objects
      Object3DUtil.setMaterial(object3D, this.hiddenMaterial, Object3DUtil.MaterialsAll, true,
        function(node) {
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
    };

    SceneViewer.prototype.groupSelected = function () {
      // Select using scene hierarchy and group!
      var selected = this.sceneState.getSelectedObjects();
      if (selected.length > 0) {
        this.sceneHierarchy.selectAndGroup(selected);
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

    SceneViewer.prototype.getHighlightedModels = function () {
      var highlighted = [];
      for (var i = 0; i < this.sceneState.modelInstances.length; i++) {
        var mInst = this.sceneState.modelInstances[i];
        if (mInst.object3D.isHighlighted) {
          highlighted.push(mInst);
        }
      }
      return highlighted;
    };

    SceneViewer.prototype.rotateHighlightedModels = function (axis, delta, bbfaceIndex) {
      var highlighted = this.getHighlightedModels();
      this.rotateModels(highlighted, axis, delta, bbfaceIndex);
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
        objInfo['rotateBy'] = { axis: axis, rotateBy: delta};
        this.uilog.log(UILog.EVENT.MODEL_ROTATE, null, objInfo);
        //Object3DUtil.attachToParent(mInst.object3D, parent, this.sceneState.fullScene);
      }
    };

    SceneViewer.prototype.scaleHighlightedModels = function (scaleBy, bbfaceIndex) {
      //console.time('scale');
      var highlighted = this.getHighlightedModels();
      this.scaleModels(highlighted, scaleBy, bbfaceIndex);
      //console.timeEnd('scale');
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

    SceneViewer.prototype.onKeyDown = function (event) {
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

    SceneViewer.prototype.bindKeys = function () {
      var scope = this;
      var canvas = scope.renderer.domElement;
      keymap('o', function () {
        var clusters = SceneUtil.clusterObjectsByBoundingBoxes(scope.sceneState.modelInstances);
        _.map(clusters, function (c) {
          var mesh = new MeshHelpers.BoxMinMax(c.bbox.min, c.bbox.max, Object3DUtil.TransparentMat);
          scope.sceneState.debugNode.add(mesh);
        });
      });
      keymap('shift-defmod-s', function () {
        var exp = new OBJMTLExporter();
        exp.export(scope.sceneState.scene, { name: scope.sceneState.info.fullId, textureDir: '../texture/' });
      });
      keymap({ on: 'shift-p', do: 'Previous Scene', target: canvas }, function () {
        if (scope.allowScenePrevNext) {
          scope.loadPrevScene();
        }
      });
      keymap({ on: 'shift-n', do: 'Next Scene', target: canvas } , function () {
        if (scope.allowScenePrevNext) {
          scope.loadNextScene();
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
        scope.saveScene(function () {
          var json = scope.sceneState.toJson();
          FileUtil.saveJson(json, 'scene.json');
        }.bind(scope));
      });
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
        keymap({on: 'ctrl-g', do: 'Color by category', target: canvas}, function () {
          scope.colorBy = 'category';
        });
        keymap({on: 'ctrl-shift-g', do: 'Color by room type', target: canvas}, function () {
          scope.colorBy = 'roomType';
        });
        keymap({on: 'shift-g', do: 'Color by model id', target: canvas}, function () {
          scope.colorBy = 'modelId';
        });
        keymap({on: 'ctrl-alt-g', do: 'Color by object id', target: canvas}, function () {
          scope.colorBy = 'objectId';
        });
      }
    };

    SceneViewer.prototype.changeMaterials = function() {
      this.__cache = this.__cache || {};
      var scope = this;
      SceneUtil.getAggregatedSceneStatistics(this.__cache, function(err, aggregatedSceneStatistics) {
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
      return this.contextQueryControls.active;
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

    SceneViewer.prototype.showLoadingIcon = function (isLoading) {
      Viewer3D.prototype.showLoadingIcon.call(this, isLoading);
      if (this.isLoading) {
        $('#loadingScene').css('visibility', 'visible');
      } else {
        $('#loadingScene').css('visibility', 'hidden');
      }
    };

    SceneViewer.prototype.populateCategoryList = function () {
      var modelInstances = this.sceneState.modelInstances;
      this.categoryList.clear();
      for (var i = 0; i < modelInstances.length; i++) {
        var categories = modelInstances[i].model.info.category;
        if (categories && categories.length > 0) {
          var isRoom = modelInstances[i].model.hasCategory('Room');
          var isScan = modelInstances[i].model.isScan();
          if (!(isRoom || isScan)) {
            this.categoryList.add(categories[0]);
          }
        }
      }
    };

    SceneViewer.prototype.addModels = function(objects) {
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

    SceneViewer.prototype.saveScene = function (onSuccess, onError) {
      function putViaJQuery(url, data) {
        data = data || {};
        if (window.globals.assignmentId) {
          data.assignmentId = window.globals.assignmentId;
        }
        if (window.globals.task_id) {
          data.task_id = window.globals.task_id;
        }
        var token = $("meta[name='csrf-token']").attr('content');
        return $.ajax({
          type: 'PUT',
          url: url,
          data: data,
          dataType: 'json',
          timeout: 10000,
          beforeSend: function (xhr) {
            xhr.setRequestHeader('X-CSRF-Token', token);
          }
        });
      }

      if (this.onSaveUrl) {
        var data = this.getSceneRecord({savePreview: true});
        putViaJQuery(this.onSaveUrl, data).error(onError).success(onSuccess);
      } else {
        this.showError('Cannot save scene: No save url');
        if (onSuccess) {
          var sceneStateJson = this.sceneState.toJson();
          onSuccess(sceneStateJson);
        }
      }
    };

    /* Returns serialized JSON record for scene that can be saved */
    SceneViewer.prototype.getSceneRecord = function(opts) {
      opts = opts || {};
      var serialized = this.sceneState.toJson();
      var results = {
        scene: JSON.stringify(serialized),
        ui_log: this.uilog.stringify()
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
        gotoURL(this.onCloseUrl);
      }
    };

    SceneViewer.prototype.undo = function (event) {
      this.undoStack.undo();
      if (this.editControls) {
        this.editControls.update();
      }
      this.uilog.log(UILog.EVENT.UNDOSTACK_UNDO, event, {});
    };

    SceneViewer.prototype.redo = function (event) {
      this.undoStack.redo();
      if (this.editControls) {
        this.editControls.update();
      }
      this.uilog.log(UILog.EVENT.UNDOSTACK_REDO, event, {});
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
          { event: event, restrictCategories: true } );
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
    return SceneViewer;
  });
