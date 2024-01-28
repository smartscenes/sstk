const Constants = require('rlsd/RlsdConstants');
const SceneViewer = require('scene-viewer/SceneViewer');
const UILog = require('editor/UILog');
const keymap = require('controls/keymap');
const _ = require('util/util');

const RlsdToolbar = require('./RlsdToolbar');
const RlsdStatusBar = require('./RlsdStatusBar');
const ImageCameraControl = require('controls/ImageCameraControl');
const ImageMaskObjectPlacer = require('rlsd/ImageMaskObjectPlacer');
const MaskToObjectPanel = require('./MaskToObjectPanel');
const ViewpointRetriever = require('rlsd/ViewpointRetriever');

const AssetManager = require('assets/AssetManager');
const Object3DUtil = require('geo/Object3DUtil');
const SceneWizard = require('rlsd/SceneWizard');
const LabelManager = require('rlsd/LabelManager');
const ObjectInfoStore = require('rlsd/ObjectInfoStore');
const WizardSolrQueryProxy = require('search/WizardSolrQueryProxy');

const RenderHelper = require('rlsd/RenderHelper');
const FileUtil = require('io/FileUtil');

const Auth = require('util/Auth');

class RlsdSceneEditor extends SceneViewer {
  constructor(_params) {
    const defaults = {
      // good options for rlsd scene editor
      appId: 'RlsdSceneEditor.v1-20230726',
      addGround: false,  // shouldn't matter, but let's just set this to false
      allowEdit: true,
      editMode: false,
      showCeiling: true,
      allowScenePrevNext: false,
      allowHighlightMode: false,
      allowBBoxQuery: false,
      allowMaterialMode: false,
      allowMagicColors: false,
      allowSave: true,
      enableUILog: true,
      showSearchOptions: true,
      showSearchSourceOption: false,
      showInstructions: true,
      useOverlayMessages: true,
      imageMaskObjectPlacerOptions: {
        enabled: true,
        startPanoMaximized: false,
        autoPlace: true,
        bottomAttachmentAdjustmentEnabled: true,
        separatePanoOverlay: true,
        panoramaSizeRatio: 0.25,
        panoViewer: {
          overlayCanvas: '#panoramaViewer',
          backgroundCanvas: '#panoramaViewerBackground'
        },
        maskCommentUI: '#commentUI'
      },
      contextQueryOptions: { showPriorsViz: true, allowGroupExpansion: true },
      useAmbientOcclusion: true,
      useDatGui: false,
      restrictModels: '+datatags:rlsd',
      loadingIconUrl: Constants.defaultLoadingIconUrl,
      colorBy: 'splitColors',
      colorByOptions: { color: '#fef9ed', arch: { 'colorBy': 'original', color: '#b0c4de' }, 'object': { 'colorBy': 'color', color: '#fef9ed' } },
      // new options
      putOnArchOnly: false,
      restrictToSurface: false,
      allowFinish: true, // Allow save and finish.
      manipulatorSizeMultiplier: 1.5,
      //manipulatorFixedRotationAxis: new THREE.Vector3(0,1,0),
      rlsdSetPutOnArchBasedOnModelCategory: false,
      rlsdQueryModelsThroughWizard: false,
      rlsdAllowSearchSimilar: false,
      rlsdShowPutOnArchToggles: true,
      rlsdSeparatePanoOverlay: false,
      pixelThreshold: null,
      cameraControlTypes: ['orbitRightClickNoPanZoom', 'firstPersonClickDrag'],
      imageCameraControls: {
        container: $('#imageCameraControl')
      },
      maskAnnotationsPanel: {
        container: $('#maskObjectPanel')
      },
      searchOptions: {
        model: {
          previewImageIndex: 'neutral',
          showRecent: true,
          showCrumbs: true,
          rootCrumb: [],
          customSearchIcons: [
            {
              name: 'searchWithMask',
              glyphicon: 'search',
              help: 'Refine search using mask',
              isActive: (queryInfo) => {
                console.log('got queryInfo (check isActive)', queryInfo);
                const crumbEntry = _.get(queryInfo, ['searchDisplayOptions', 'crumbEntry']);
                return this.solrModelSearchQueryProxy.isActive && crumbEntry && crumbEntry.queryType === 'category';
              },
              onclick: (queryInfo) => {
                const crumbEntry = _.get(queryInfo, ['searchDisplayOptions', 'crumbEntry']);
                console.log('got queryInfo', queryInfo);
                if (crumbEntry) {
                  if (crumbEntry.queryType === 'category') {
                    const query = this.labelManager.lookupLinkedQuery(crumbEntry.source, crumbEntry.query.replace('category:', ''));
                    this.imageMaskObjectPlacer.__sendSearchQuery(query);
                  } else {
                    this.imageMaskObjectPlacer.__sendSearchQuery(crumbEntry);
                  }
                }
              }
            }
          ]
        }
      },
      sceneHierarchy: {
        allowLoadSave: false,
        allowOpenCloseAll: false
      }
    };
    const params = _.defaultsDeep(Object.create(null), _params, defaults);
    super(params);

    // const allParams = this.__options;

    this.config = Constants.config.rlsd;
    this.task = null;
    this.imageCameraControl = null;
    this.maskAnnotationsPanel = null;
    this.viewpointRetriever = null;
    this.sceneWizard = null;
    this.labelManager = null;

    /* RLSD */
    this.activeViewpoint = null;
    this.fovMultiplier = 1.7;
    this.fovMultiplierMin = 0;
    this.fovMultiplierMax = 2;
    this.defaultFov = 60;
    this.baseFov = this.defaultFov;
    this.sessionId = _.uuidv4();

    // RLSD
    this.__useOriginalObjectColors = false;
    this.__useArchTextures = true;
    this.__displayArch = false;
    this.__freeWalkMode = false;
    this.__modelSearchSortStrategy = 'basic';
    this.allowFinish = (params.allowFinish !== undefined) ? params.allowFinish: true;
    this.rlsdSetPutOnArchBasedOnModelCategory = params.rlsdSetPutOnArchBasedOnModelCategory;
    this.rlsdQueryModelsThroughWizard = params.rlsdQueryModelsThroughWizard;
    this.rlsdAllowSearchSimilar = params.rlsdAllowSearchSimilar;
    this.rlsdShowPutOnArchToggles = params.rlsdShowPutOnArchToggles;
    this.manipulatorSizeMultiplier = params.manipulatorSizeMultiplier;
    this.manipulatorFixedRotationAxis = params.manipulatorFixedRotationAxis;
    this.__pixelThreshold = this.__options.pixelThreshold;  // allows url override
    this.blockInserts = false;
    this.__renderHelper = new RenderHelper();

    this.proMode = (this.urlParams.proMode !== undefined) ? this.urlParams.proMode: false;
    if (this.proMode) {
      this.useDatGui = true;
    }

    /**
     * RLSD
     */
    this.__putOnArchOnly = (params.putOnArchOnly != undefined) ? params.putOnArchOnly : false;
    this.__restrictToSurface = (params.restrictToSurface != undefined) ? params.restrictToSurface : false;
    this.finished = false;
    this.solrModelSearchQueryProxy = null;

    // Enforce user id while saving annotations
    this.enforceUserId = true
  }

  init() {
    const imageCameraControlContainer = $(this.__options.imageCameraControls.container);
    if (imageCameraControlContainer.length) {
      this.setupImageCameraControl(imageCameraControlContainer);
    }
    super.init();
    if (this.imageMaskObjectPlacer) {
      this.statusbar.setShiftActionLabel(Constants.SELECT_MASK_ACTION);
    }
    if (this.sceneHierarchy) {
      //console.log('setTreeNodesVisibility', roomIds);
      const ignoreArchTypes = ['WallInside', 'WallOutside'];
      this.sceneHierarchy.setIsTreeNodeVisible((data, modelInstanceOrObject3D) => {
        const object3D = modelInstanceOrObject3D.object3D || modelInstanceOrObject3D;
        if (ignoreArchTypes.indexOf(object3D.userData.type) >= 0) {
          return false;
        }
        if (this.activeViewpoint) {
          const roomIds = this.activeViewpoint.roomIds;
          const node = Object3DUtil.findNode(object3D, function (node) {
            const roomId = node.userData.roomId;
            return roomIds == null || (roomIds.indexOf(roomId) >= 0) || Object3DUtil.getModelInstance(node, true);
          });
          return node != null;
        } else {
          return true;
        }
      });
    }
  }

  onReady() {
    const maskAnnotationsContainer = $(this.__options.maskAnnotationsPanel.container);
    if (maskAnnotationsContainer.length) {
      this.setupMaskAnnotationsPanel(maskAnnotationsContainer);
    }
    if (this.task) {
      this.task.loadEndTime = new Date().getTime();
    }
  }

  getTaskUrl(taskId) {
    return this.config.scene_manager.backend_url_prefix + 'tasks/' + taskId;
  }

  loadInitialScene() {
    const taskId = this.urlParams['taskId'];
    const sceneManagerId = this.urlParams['sceneManagerId'];
    const options = {};

    const scope = this;
    if (taskId) {
      console.log('Loading task ' + taskId);

      const taskURL = this.getTaskUrl(taskId);
      this.assetManager.assetLoader.load(taskURL, 'json',
        function (data) {
          scope.task = data;
          if (data.lastSessionId) {
            scope.uilog.prevSessionId = data.lastSessionId;
          }
          delete data.lastSessionId;
          scope.task.loadStartTime = new Date().getTime();
          scope.task.loadEndTime = new Date().getTime();
          scope.viewpointRetriever.source = data['sceneSpec.photoSource'];
          scope.imageMaskObjectPlacer.isPanoramaLocked = data.toggles.lock_panorama_orientation;
          scope.imageMaskObjectPlacer.poseSuggestorEnabled = data.toggles.pose_suggestor;

          // Configure shape sorter
          // TODO: this should not be a toggle (it should be a string)
          if (data.toggles.shape_sorter) {
            scope.modelSearchSortStrategy = 'lfd';
          } else {
            scope.modelSearchSortStrategy = 'basic';
          }

          if (scope.task.completed) {
            bootbox.alert('This task has been finished by the annotator.');
            scope.finished = true;
          }
          const sceneUrl = taskURL + '/json';
          scope.clearAndLoadScene({file: sceneUrl}, options);
          console.log({'LoadedTask': data});
        },
        undefined,
        function (err) {
          console.error('Error fetching task ' + taskURL);
          console.log(err);
        }
      );
    } else if (sceneManagerId) {
      let sceneUrl = this.config.scene_manager.backend_url_prefix + this.config.scene_manager.scene_json_endpoint.url;
      sceneUrl = sceneUrl.replace('sceneMangerId', sceneManagerId);
      this.clearAndLoadScene({ file: sceneUrl }, options);
      // TODO: Load object mask correspondances
      // console.log('TODO: Load object mask correspondances');
    } else {
      super.loadInitialScene();
    }
  }

  setupInstructions() {
    // TODO: just set instructions
    const instructions = $('#instructions');
    if (instructions && this.showInstructions) {
      const instructionsHtml = this.instructions ? this.instructions.html :
        (this.allowEdit ?
          '<b>Object Placement</b><br>'+
          'R - Toggle restrict movement to attachment plane<br>' +
          'V - Toggle placement of objects on other objects<br>' +
          '<b>View Adjustments</b><br>' +
          'A - Zoom In <br>'+
          'Z - Zoom Out<br>' +
          'X - Overlay photo<br>' +
          '<b>Editing Controls</b><br>' +
          'LEFT/RIGHT = Rotate highlighted model(s) around Z-axis<br>' +
          'DOWN/UP = Rescale highlighted model(s) by 0.9/1.1 <br>' +
          'Ctrl+S = Save current progress to console<br>' : '') +
        '<b>Mouse Control</b><br>' +
        'Right click = Rotate view<br>' +
        'Mouse wheel = Zoom view<br>' +
        'Ctrl-click = Add custom instance<br>' +
        '<b>Other controls</b><br>' +
        'C - Toggle comment<br>' +
        'W - Enter free walk (AWSD to move)<br>' +
        (this.allowLookAt ? 'Dblclick = Look at object<br>' : '');
      instructions.html(instructionsHtml);
    }
  }

  setupUILog() {
    super.setupUILog();
    this.uilog.addEnhancer((evt) => {
      if (this.activeViewpoint == null) {
        evt.data.activeViewpoint = null;
      } else {
        evt.data.activeViewpoint = this.activeViewpoint.getUILogInfo();
      }
    });
  }

  setupImageCameraControl(container) {
    const scope = this;
    this.imageCameraControl = new ImageCameraControl({
      container: container,
      onClickCallback: function (viewpoint) {
        if (scope.activeViewpoint) {
          if (scope.uilog) {
            scope.uilog.log(UILog.EVENT.VIEWPOINT_END, null, scope.activeViewpoint.getUILogInfo());
          }
        }
        scope.activeViewpoint = viewpoint;
        console.log('Selected viewpoint', viewpoint);
        scope.setCameraState(viewpoint.cameraState);
        const waitingKey = scope.addWaitingToQueue('viewpoints');
        scope.imageMaskObjectPlacer.setViewpoint(viewpoint, (err, res ) => {
          scope.removeWaiting(waitingKey, 'viewpoints');
          scope.__onViewpointSetFinalized(viewpoint);
        });
        scope.__onViewpointSet(viewpoint);
      }
    });
  }

  // A viewpoint is set
  __onViewpointSet(viewpoint) {
    this.setImageMaskObjectPlacerActive(true);

    if (this.maskAnnotationsPanel) {
      this.maskAnnotationsPanel.update({
        objectMaskInfos: null
      });
    }

    // Lock camera orbit controls if the panorama is maximized and panorama orbit is locked
    if (this.imageMaskObjectPlacer.panoMaximized) {
      if (this.imageMaskObjectPlacer.isPanoramaLocked) {
        this.cameraControls.controls.update();
        this.cameraControls.controls.enabled = false;
      }
    }

    // Toggle panorama overlay to the default configuration
    if (this.imageMaskObjectPlacer.startPanoMaximized) {
      if (!this.imageMaskObjectPlacer.panoMaximized) {
        this.togglePanoramaOverlayMode();
      }
    }

    this.__updateActiveViewpointRoomIds();

    // UILog Viewpoint Start
    this.activeViewpoint.lastStartTime = new Date().getTime();
    if (this.uilog) {
      this.uilog.log(UILog.EVENT.VIEWPOINT_START, null, this.activeViewpoint.getUILogInfo());
    }
  }

  __updateActiveViewpointRoomIds() {
    const showModelsFlag = this.showModels;
    this.showModels = false;
    const roomPixels = this.__renderHelper.getArchRoomPixels(this.sceneState, this.camera, true);
    this.showModels = showModelsFlag;
    // if (true) {
    //   const colorBuffer = new Uint8Array(4 * roomPixels.width * roomPixels.height);
    //   ImageUtil.recolorIndexed(roomPixels.pixels, null, colorBuffer);
    //   ImageUtil.flipPixelsY(colorBuffer, roomPixels.width, roomPixels.height);
    //   this.saveImageDataToPng({ data: colorBuffer, width: roomPixels.width, height: roomPixels.height }, 'test.png');
    // }
    console.log('got roomPixels', roomPixels);
    const minPixels = 0.1 * roomPixels.width * roomPixels.height;
    this.activeViewpoint.roomIds = _.keys(
      _.pickBy(roomPixels.counts, (count, roomId) => {
        return count > minPixels && roomId !== 'undefined';
      }));
    console.log(this.activeViewpoint.roomIds);
  }

  __onViewpointSetFinalized(viewpoint) {
    if (this.maskAnnotationsPanel) {
      if (this.imageMaskObjectPlacer.activeViewpointObjectInfoStore) {
        this.maskAnnotationsPanel.update({
          objectMaskInfos: this.imageMaskObjectPlacer.activeViewpointObjectInfoStore
        });
      }
    }

    this.sceneHierarchy.setTreeNodesVisibility();
  }

  setupMaskAnnotationsPanel(container) {
    const previewType = this.modelSearchController.searchPanel.previewImageIndex;
    this.maskAnnotationsPanel = new MaskToObjectPanel({
      container: container,
      annotations: this.imageMaskObjectPlacer.maskAnnotations,
      sceneState: this.sceneState,
      objectMaskInfos: this.imageMaskObjectPlacer.objectInfoStore,
      getObjectIconUrl: (object3d) => {
        const modelInstance = Object3DUtil.getModelInstance(object3d);
        const minfo = modelInstance.model.info;
        const screenshotUrl = this.assetManager.getImagePreviewUrl(minfo.source, minfo.id, previewType, minfo);
        return screenshotUrl;
      },
      onHoverLabel: (labelInfo, hovered) => {
        this.imageMaskObjectPlacer.hoverHighlightMaskById(hovered? labelInfo.id : null);
      },
      onClickLabel: (labelInfo, isDblClick) => {
        this.imageMaskObjectPlacer.selectMaskById(labelInfo.id);
        if (isDblClick) {
          this.imageMaskObjectPlacer.viewMaskById(labelInfo.id);
        }
      },
      onDeleteLabel: (labelInfo) => {
        this.imageMaskObjectPlacer.removeCustomInstance(labelInfo.id);
      },
      onHoverObject: (object3d, hovered) => {
        this.editControls.highlightObject(object3d, hovered);
      },
      onClickObject: (object3d, isDblClick) => {
        //console.log('clickObject', isDblClick);
        this.editControls.selectObject(object3d);
        if (isDblClick) {
          this.imageMaskObjectPlacer.viewObject(object3d);
        }
      },
      onDeleteObject: (object3d) => {
        this.deleteObject(object3d);
      },
      onSpecifyPoint: (labelInfo, object3d) => {
        this.imageMaskObjectPlacer.enterSpecifyPointLabelPositionMode(labelInfo);
      },
      contextMenu: {
        items: {
          lookAt: {
            name: "LookAt",
            labelCallback: (id, labelInfo) => {
              if (labelInfo) {
                this.imageMaskObjectPlacer.viewMaskById(labelInfo.id);
              }
            },
            objectCallback: (id, labelInfo, uuid, object3d) => {
              if (object3d) {
                this.imageMaskObjectPlacer.viewObject(object3d);
              }
            }
          },
          freeze: {
            name: 'Freeze',
            labelCallback: (id, labelInfo)=> {
              this.maskAnnotationsPanel.freezeLabelObjects(labelInfo,true);
            },
            objectCallback: (id, labelInfo, uuid, object3d) => {
              this.maskAnnotationsPanel.freezeObject(object3d,true);
            },
            accesskey: 'F'
          },
          unfreeze: {
            name: 'Unfreeze',
            labelCallback: (id, labelInfo)=> {
              this.maskAnnotationsPanel.freezeLabelObjects(labelInfo,false);
            },
            objectCallback: (id, labelInfo, uuid, object3d) => {
              this.maskAnnotationsPanel.freezeObject(object3d,false);
            }
          }
        }
      }
    });
    this.maskAnnotationsPanel.init();
  }

  customizeModelResultElement(source, id, result, elem) {
    if (this.rlsdAllowSearchSimilar) {
      // TODO: have other ways to figure out if the result is for a model or category
      const buttons = $('<span class="searchOverlay"></span>').css('position', 'absolute').css('top', '2px').css('right', '2px');
      const searchButton = $('<button class="btn btn-default btn-xs"><i class="glyphicon glyphicon-search"></i></button>');
      let addButtons = false;
      if (result.hasModel) {
        const wizardQuerier = this.sceneWizard.getSimQuerier();
        const fullId = AssetManager.toFullId(source, id);
        searchButton.attr('title', 'Find similar');
        searchButton.click(() => {
          console.log('clicked similar', fullId);
          this.modelSearchController.initiateCustomSearch(wizardQuerier,
            {fullId: fullId, threshold: 0.7, limit: 40}, null, 'modelId');
        });
        addButtons = true;
      } else if (this.solrModelSearchQueryProxy.isActive) {
        const linkedQuery = this.labelManager.getLinkedQuery(result);
        if (linkedQuery) {
          // search with mask
          searchButton.attr('title', 'Refine search using mask');
          searchButton.click(() => {
            console.log('clicked linked', linkedQuery);
            this.imageMaskObjectPlacer.__sendSearchQuery(linkedQuery);
          });
          addButtons = true;
        }
      }
      if (addButtons) {
        searchButton.mousedown(() => {
          // Make sure the event is not propagated
          return false;
        });
        buttons.append(searchButton);
        elem.append(buttons);
      }
    }
  }

  setupAssets() {
    // setup solrModelSearchQueryProxy before modelSearchController is initialized in setupAssets
    if (this.rlsdQueryModelsThroughWizard) {
      this.solrModelSearchQueryProxy = new WizardSolrQueryProxy({timeout: 10000, sortStrategy: 'lfd',
        endpointUrl: this.config.scene_wizard.shape_suggestor_endpoint.url});
      // customize searchOptions for models
      this.searchOptions['model'].solrSearchQueryProxy = this.solrModelSearchQueryProxy;
    }
    super.setupAssets();
    this.sceneWizard = new SceneWizard(this.config.scene_wizard);
    this.labelManager = new LabelManager(this.config, this.assetManager);
  }

  setupCameraControlsPanel() {
    this.cameraControlsPanel = null;
    if (!(this.imageMaskObjectPlacer && !this.proMode)) {
      super.setupCameraControlsPanel();
    }
  }

  setupToolbar() {
    // Hookup toolbar
    this.toolbar = new RlsdToolbar({
      app: this,
      container: $('#sceneToolbar'),
      iconsPath: this.toolbarIconsDir,
      allowEdit: this.allowEdit,
      showPutOnArchToggles: this.rlsdShowPutOnArchToggles,
      finishEnabled: this.imageMaskObjectPlacer == null
    });
    this.toolbar.init();
    this.toolbar.applyOptions(this.toolbarOptions);
    this.statusbar = new RlsdStatusBar({
      element: $('#statusbar'),
      shiftAction: 'None',
      ctrlAction: 'Hold "ctrl" to add custom point',
      freeWalk: this.freeWalkMode,
      setRestrictToSurface: this.restrictToSurface
    });
  }

  setupDatGui() {
    super.setupDatGui();
    if (this.useDatGui) {
      const gui = this.datgui.getFolder('rlsd');
      gui.add(this, 'useOriginalObjectColors').name('Use object colors').listen();
      gui.add(this, 'useArchTextures').name('Use arch textures').listen();
      gui.add(this, 'restrictToSurface').name('Restrict to surface').listen();
      gui.add(this, 'freeWalkMode').name('Free walk').listen();
      if (this.rlsdQueryModelsThroughWizard) {
        gui.add(this, 'modelSearchSortStrategy', ['random', 'basic', 'lfd']).name('Sort order').listen();
      }
      gui.add(this.imageMaskObjectPlacer.poseSuggester, 'enabled').name('Pose suggester').listen();
      gui.add(this.imageMaskObjectPlacer, 'autoPlace').name('Auto place').listen();
      gui.add(this.imageMaskObjectPlacer, 'bottomAttachmentAdjustmentEnabled').name('Bottom adjustment').listen();
      gui.add(this, 'showGlassWalls').listen();
      gui.add(this, 'showRailing').listen();
      gui.add(this, 'importAnnotations');
      gui.add(this, 'exportAnnotations');
      // open folder by default
      gui.open();
    }
  }

  exportAnnotations() {
    const data = this.getSceneRecord({ savePreview: false, stringify: false });
    const filename = (this.task)? this.task.taskId : this.activeViewpoint.id;
    FileUtil.saveJson(data, filename + '.json');
  }

  importAnnotations() {
    const UIUtil = require('ui/UIUtil');
    UIUtil.popupFileInput(file => {
      this.assetManager.assetLoader.load(file, 'json', (json) => {
        this.clearAndLoadScene({ data: json.sceneJson }, {});
      }, null, (err) => {
        console.warn('Error loading annotation');
      });
    });
  }

  __onTabActivated(tab) {
    super.__onTabActivated(tab);
    if (tab === 'cameraImages') {
      this.imageCameraControl.onResize();
    } else if (tab === 'maskObjectAnnotations') {
      if (this.maskAnnotationsPanel) {
        this.maskAnnotationsPanel.onResize();
      }
    }
  }

  bindKeys() {
    //const canvas = this.renderer.domElement;
    keymap({ on: 'c', do: 'Show mask comment UI'}, () => {
      if (this.imageMaskObjectPlacer && this.imageMaskObjectPlacer.active) {
        this.showMaskCommentUI();
      }
    });
    super.bindKeys();
  }

  onKeyDown(event) {
    const notHandled = super.onKeyDown(event);
    // Refactor some of this into bindKeys
    if (this.imageMaskObjectPlacer && this.imageMaskObjectPlacer.active) {
      // console.log(event.which);
      if (event.which === 27) {  // escape
        this.imageMaskObjectPlacer.exitSpecialMode();
      }

      // TODO: Pass these into image query controls
      if (event.which === 16) { // shift
        this.imageMaskObjectPlacer.maskAssignMode = true;
        this.statusbar.setShiftPressed(true);
      }

      if (event.which === 17) { // ctrl
        this.statusbar.setCtrlPressed(true);
      }

      if (event.which === 65) { // a
        if (!this.freeWalkMode) {
          // Only allow zoom if not in freeWalkMode
          this.rlsdZoomChange(-0.1);
        }
      }
      if (event.which === 90) { // z
        if (!this.freeWalkMode) {
          // Only allow zoom if not in freeWalkMode
          this.rlsdZoomChange(+0.1);
        }
      }

      if (event.which === 88) { // x
        this.togglePanoramaOverlayMode();
      }
      // if (event.which === 67) { // c
      //   this.showMaskCommentUI();
      // }
      if (event.which === 82) { // r
        this.restrictToSurface = !this.restrictToSurface;
      }
      if (event.which === 86) { // v
        this.putOnArchOnly = !this.putOnArchOnly;
      }
      if (event.which === 87) { // w
        this.freeWalkMode = true;
      }
    }
    return notHandled;
  }

  onKeyUp(event) {
    const notHandled = super.onKeyUp(event);
    if (event.which === 16) { // shift
      this.imageMaskObjectPlacer.maskAssignMode = false;
      this.statusbar.setShiftPressed(false);
    }
    if (event.which === 17) { // ctrl
      this.statusbar.setCtrlPressed(false);
    }
    if (notHandled) {
      if (event.which === 27) { // esc
        if (this.freeWalkMode) {
          this.freeWalkMode = false;
        }
      }
    }
    return notHandled;
  }

  setupEventListeners() {
    const scope = this;
    super.setupEventListeners();
    this.renderer.domElement.addEventListener('mousewheel', function(event) {
      if (!scope.imageMaskObjectPlacer) {
        return;
      }
      scope.rlsdZoomChange(event.deltaY / 500.0);
      console.log({mousewheel:event});
    });
  }

  setupEditControls() {
    super.setupEditControls();
    this.__initViewpointRetriever();
    this.__initImageMaskObjectPlacer(this.sceneWizard, this.labelManager);
  }

  updateEditControls() {
    super.updateEditControls();
    if (this.imageMaskObjectPlacer) {
      this.imageMaskObjectPlacer.reset({
        scene: this.sceneState.fullScene,
        sceneState: this.sceneState
      });
    }
  }

  onWindowResize(options) {
    super.onWindowResize(options);
    if (this.imageCameraControl) {
      this.imageCameraControl.onResize();
    }
    if (this.imageMaskObjectPlacer) {
      this.imageMaskObjectPlacer.onResize();
    }
  }

  removeAll() {
    super.removeAll();
    if (this.imageMaskObjectPlacer) {
      this.imageMaskObjectPlacer.reset();
    }
  }

  onSelectInstanceChanged(modelInstance) {
    this.updatePutOnArchUsingModel(modelInstance);
    super.onSelectInstanceChanged(modelInstance);
  }

  __onSceneLoadSuccessful(loadOptions, sceneState) {
    super.__onSceneLoadSuccessful(loadOptions, sceneState);
    if (this.imageCameraControl) {
      let archId = this.urlParams['archId'];
      if (!archId) {
        archId = this.sceneState.arch.ref;
        this.archName = archId.split('.')[1];
        this.viewpointRetriever.query = `sceneSpecId:${this.archName}`;
      }
      const scope = this;

      const waitingKey = this.addWaitingToQueue('viewpoints', archId);
      this.viewpointRetriever.retrieveViewpoints(this.task, (err, viewpoints) => {
        if (err) {
          scope.showWarning('Error fetching viewpoints');
          console.log('Error fetching viewpoints', err);
        }
        if (viewpoints && viewpoints.length) {
          // console.log('got viewpoints', viewpoints);
          scope.imageCameraControl.setImageViewpoints(archId, viewpoints);
          viewpoints.forEach((viewpoint) => {
            scope.imageCameraControl.updateThumbnail(viewpoint);
          });
        } else {
          scope.imageCameraControl.setImageViewpoints('', []);
        }

        if (scope.imageCameraControl.viewpoints.length === 1) {
          // Activate the viewpoint using the click callback
          const viewpoint = scope.imageCameraControl.viewpoints[0];
          scope.imageCameraControl.onClickCallback(viewpoint);
          scope.activateTab('models');
          scope.disableTab('cameraImages', true);
        }

        // Load object info json
        this.__retrieveObjectInfo(this.sceneState.arch.ref, (err, objectInfoStore) => {
          this.removeWaiting(waitingKey, 'viewpoints');
          if (objectInfoStore) {
            this.imageMaskObjectPlacer.setObjectInfoStore(objectInfoStore);
            console.log('objectInfoStore', objectInfoStore);
          }
          // Call on ready
          this.onReady();
        });
      });
    }

    if (this.task) {
      this.task.loadEndTime = new Date().getTime();
      if (this.uilog) {
        this.uilog.log(UILog.EVENT.TASK_LOADED, null, this.getTaskUILogInfo(this.task));
      }
    }
  }

  /* Returns serialized JSON record for scene that can be saved */
  getSceneRecord(opts) {
    opts = opts || {};

    const completed = (this.task)? this.task.completed : null;

    let serialized = this.sceneState.toJson(false, true);
    if (this.imageMaskObjectPlacer) {
      serialized = this.imageMaskObjectPlacer.mergeAnnotationData(serialized);
    }
    var done = this.imageMaskObjectPlacer.countCompleted();
    var total = this.imageMaskObjectPlacer.activeViewpointObjectInfoStore? app.imageMaskObjectPlacer.activeViewpointObjectInfoStore.size : 0;

    const results = {
      sceneJson: opts.stringify? JSON.stringify(serialized) : serialized,
      ui_log: opts.stringify? this.uilog.stringify() : this.uilog,
      sessionId: this.sessionId,
      request_type: 'save',
      completed: completed,
      userId: this.userId,
      totalObjects: total,
      annotatedObjects: done,
      pixelThreshold: this.pixelThreshold == null ? 'None' : this.pixelThreshold
    };
    if (opts.savePreview) {
      results.preview = this.getPreviewImageData();
    }
    return results;
  }

  getTaskUILogInfo(task) {
    return {
      taskId: task.taskId,
      tags: task.tags,
      loadStartTime: task.loadStartTime,
      loadEndTime:task.loadEndTime,
      toggles: task.toggles
    };
  }


  // Enforce that we have a good userId
  authenticate(cb) {
    // Most basic auth ever
    if (this.userId && !this.userId.startsWith('USER@')) {
      cb({ username: this.userId });
      return;
    }
    if (!this.auth) {
      var Auth = require('util/Auth');
      this.auth = new Auth();
    }
    this.auth.authenticate(function(user) {
      this.userId = user.username;
      cb(user);
    }.bind(this));
  };

  saveScene(onSuccess, onError) {
    if (this.finished) {
      bootbox.alert('You will not be able to save to a finished task.');
      return;
    }

    console.log('Enforce User Id=',this.enforceUserId)
    if (this.enforceUserId) {
      this.authenticate(() => {
        console.log('User Id is ',this.userId)
        if (this.task) {
          console.log('Task saving...');
          if (this.uilog) {
            this.uilog.log(UILog.EVENT.TASK_SAVED, null, this.getTaskUILogInfo(this.task));
          }
          // Save to task
          const data = this.getSceneRecord({ savePreview: true, stringify: true });
          const taskSaveURL = this.getTaskUrl(this.task.taskId);
          
          const scope = this;
          this.__postData(taskSaveURL, data).error(onError).success(function(){
            console.log('Saved');
            if (onSuccess) {
              onSuccess(data);
            }
            scope.uilog.clear();
          });
        } else {
          super.saveScene(onSuccess, onError);
        }
      });
    } else {
      this.userId = 'default'
      if (this.task) {
        console.log('Task saving...');
        if (this.uilog) {
          this.uilog.log(UILog.EVENT.TASK_SAVED, null, this.getTaskUILogInfo(this.task));
        }
        // Save to task
        const data = this.getSceneRecord({ savePreview: true, stringify: true });
        const taskSaveURL = this.getTaskUrl(this.task.taskId);
  
        const scope = this;
        this.__postData(taskSaveURL, data).error(onError).success(function(){
          console.log('Saved');
          if (onSuccess) {
            onSuccess(data);
          }
          scope.uilog.clear();
        });
      } else {
        super.saveScene(onSuccess, onError);
      }
    }
  }

  // RLSD specific functions

  /**
   * Update putOnArchOnly based on the category of given modelInstance
   * @param {ModelInstance} modelInstance
   */
  updatePutOnArchUsingModel(modelInstance) {
    if (this.rlsdSetPutOnArchBasedOnModelCategory) {
      if (modelInstance != null){
        if (modelInstance.model.info.category) {
          // let category = modelInstance.model.info.category[0];
          let category = modelInstance.model.info.wnlemmas[0];
          console.log({category: category});
          if (this.config.putOnArchOnly.disable_wnlemmas.includes(category)) {
            this.putOnArchOnly = false;
          } else {
            this.putOnArchOnly = true;
          }
        }
      }
    }
  }

  /**
   * Update putOnArchOnly based on the type of selected mask
   * @param {ModelInstance} modelInstance
   */
  updatePutOnArchUsingMask(maskLabel) {
    if (this.rlsdSetPutOnArchBasedOnModelCategory) {
      if (maskLabel != null) {
        if (this.config.putOnArchOnly.disable_mask_labels.includes(maskLabel)) {
          this.putOnArchOnly = false;
        } else {
          this.putOnArchOnly = true;
        }
      }
    }
  }

  get pixelThreshold() {
    return this.__pixelThreshold;
  }

  get putOnArchOnly() {
    return this.__putOnArchOnly;
  }

  set putOnArchOnly(val) {
    this.__putOnArchOnly = val;
    console.log('Put on arch only: ' + val);
    this.editControls.setPutOnArchOnly(val);
    this.toolbar.updatePutOnArch(val);
  }

  get restrictToSurface() {
    return this.__restrictToSurface;
  }

  set restrictToSurface(val) {
    this.__restrictToSurface = val;
    console.log('Restrict to surface ' + val);
    this.editControls.setRestrictToSurface(val);
    this.statusbar.setRestrictToSurface(val);
  }

  updateFov(fov) {
    this.cameraControls.camera.setFov(fov);
    this.imageMaskObjectPlacer.onCameraUpdate(this.cameraControls.camera);
  }

  rlsdZoomChange(amount) {
    this.fovMultiplier = _.clamp(this.fovMultiplier + amount, this.fovMultiplierMin, this.fovMultiplierMax);
    this.updateFov(this.baseFov * this.fovMultiplier);
    console.log({'fovMultiplier': this.fovMultiplier});
  }

  get panoMaximized() {
    return this.imageMaskObjectPlacer.panoMaximized;
  }

  set panoMaximized(flag) {
    if (flag) {
      // Disable freewalk model if we go maximize the panorama
      if (this.freeWalkMode) {
        this.freeWalkMode = false;
      }
      // Maximize panorama
      this.imageMaskObjectPlacer.setPanoOverlay(true);
      this.__hideArch();
    } else {
      // Minimize panorama
      this.imageMaskObjectPlacer.setPanoOverlay(false);
      this.__showArch();
      this.cameraControls.controls.enabled = true;
    }
    this.toolbar.setFinishEnabled(!flag);
  }

  togglePanoramaOverlayMode() {
    this.panoMaximized = !this.panoMaximized;
  }

  /**
   * Toggle between original colors and single color rendering.
   */
  get useOriginalObjectColors() {
    return this.__useOriginalObjectColors;
  }

  set useOriginalObjectColors(flag) {
    this.__useOriginalObjectColors = flag;
    const archHidden = this.displayArch;
    if (archHidden) {
      // Temporary show arch so color can be updated on them.
      this.__showArch();
    }
    this.colorByOptions.object.colorBy = flag? 'original' : 'color';
    this.refreshSceneMaterials();
    if (archHidden) {
      // Hide arch again
      this.__hideArch();
    }
  }

  /**
   * Toggle between architecture textures and single color rendering.
   */
  get useArchTextures() {
    return this.__useArchTextures;
  }

  set useArchTextures(flag) {
    this.__useArchTextures = flag;
    const archHidden = this.displayArch;
    if (archHidden) {
      // Temporary show arch so color can be updated on them.
      this.__showArch();
    }
    this.colorByOptions.arch.colorBy = flag? 'original' : 'color';
    this.refreshSceneMaterials();
    if (archHidden) {
      // Hide arch again
      this.__hideArch();
    }
  }

  get displayArch() {
    return this.__displayArch;
  }

  set displayArch(flag) {
    this.__displayArch = flag;
    if (flag) {
      this.__showArch();
    } else {
      this.__hideArch();
    }
  }

  get freeWalkMode() {
    return this.__freeWalkMode;
  }

  set freeWalkMode(flag) {
    this.__freeWalkMode = flag;
    this.statusbar.setFreeWalkMode(flag);
    if (flag) {
      // when we enter free walk, we want to minimize the panorama
      // TODO: do we really want to touch the isPanoramaLocked flag?
      this.imageMaskObjectPlacer.isPanoramaLocked = true;
      this.panoMaximized = false;
      this.cameraControls.controlType = 'firstPersonClickDrag';
      this.cameraControls.setControls();
      // Disable click and drag
      this.cameraControls.controls.keyMappings = {
        //'ArrowUp': 'moveForward',
        'KeyW': 'moveForward',
        //'ArrowDown': 'moveBackward',
        'KeyS': 'moveBackward',
        //'ArrowRight': 'moveRight',
        'KeyD': 'moveRight',
        //'ArrowLeft': 'moveLeft',
        'KeyA': 'moveLeft'
      };

    } else {
      this.imageMaskObjectPlacer.isPanoramaLocked = false;
      this.panoMaximized = true;
      this.cameraControls.controlType = 'orbitRightClickNoPanZoom';
      this.cameraControls.setControls();
      // TODO: specify look direction
      this.setCameraToPanoramaView();
    }
  }

  get modelSearchSortStrategy() {
    return this.__modelSearchSortStrategy;
  }

  set modelSearchSortStrategy(strategy) {
    console.assert(this.solrModelSearchQueryProxy);
    this.__modelSearchSortStrategy = strategy;
    if (strategy === 'random') {
      this.solrModelSearchQueryProxy.sortStrategy = 'direct';
      this.modelSearchController.primarySortOrder = this.modelSearchController.searchPanel.searchModule.getRandomSortOrder();
    } else if (strategy === 'basic') {
      this.solrModelSearchQueryProxy.sortStrategy = 'direct';
      this.modelSearchController.primarySortOrder = '';
    } else {
      this.solrModelSearchQueryProxy.sortStrategy = strategy;
    }
  }

  __showArch(){
    const sceneState = this.sceneState;
    const archObjects = sceneState.getArchObject3Ds();
    archObjects.forEach((arch) => {
      const meshes = Object3DUtil.getMeshList(arch, false);
      meshes.forEach((surface) => {
        const materials = (surface.material instanceof Array)? surface.material : [surface.material];
        materials.forEach((material) => {
          if (material && material.opacityBackup != null) {
            material.opacity = material.opacityBackup;
            delete material.opacityBackup;
          }
        });
      });
    });
  }

  __hideArch() {
    const sceneState = this.sceneState;
    const archObjects = sceneState.getArchObject3Ds();
    archObjects.forEach((arch) => {
      const meshes = Object3DUtil.getMeshList(arch, false);
      meshes.forEach((surface) => {
        const materials = (surface.material instanceof Array)? surface.material : [surface.material];
        materials.forEach((material) => {
          if (material && material.opacityBackup == null) {
            material.opacityBackup = material.opacity;
            material.opacity = 0;
          }
        });
      });
    });
  }

  __initImageMaskObjectPlacer(sceneWizard, labelManager) {
    const scope = this;
    const options = _.assign(Object.create(null), this.__options.imageMaskObjectPlacerOptions, {
      scene: this.sceneState.fullScene,
      sceneState: this.sceneState,
      picker: this.picker,
      camera: this.camera,
      uilog: this.uilog,
      searchController: this.modelSearchController,
      defaultSource: Constants.defaultModelSource,
      sceneEditControls: this.editControls,
      viewer: this,
      sceneWizard: sceneWizard,
      labelManager: labelManager,
      onCameraOrbitCallback: function(lookDir) {
        // Updated 3D view to match panorama look direction
        scope.setCameraToPanoramaView(lookDir);
      }
    });
    this.imageMaskObjectPlacer = new ImageMaskObjectPlacer(options);
    this.imageMaskObjectPlacer.Subscribe('maskSelected', this, function(newMaskAddress, maskLabel) {
      if (newMaskAddress) {
        scope.solrModelSearchQueryProxy.selectedMask = newMaskAddress;
      }
      scope.updatePutOnArchUsingMask(maskLabel);
      // update maskAnnotationPanel selectedMaskIds if no object selected
      if (scope.maskAnnotationsPanel && !scope.imageMaskObjectPlacer.selectedObject3d) {
        scope.maskAnnotationsPanel.selectedMaskIds = newMaskAddress? newMaskAddress.maskId : null;
      }
    });
    this.imageMaskObjectPlacer.Subscribe('objectSelected', this, function(newObject, associatedMasks) {
      if (associatedMasks) {
        scope.solrModelSearchQueryProxy.selectedMask = associatedMasks[0];
      }
      if (scope.maskAnnotationsPanel) {
        scope.maskAnnotationsPanel.selectedObject3d = newObject;
        scope.maskAnnotationsPanel.selectedMaskIds = associatedMasks? associatedMasks.map(m => m.maskId) : null;
      }
      if (newObject == null) {
        scope.statusbar.setShiftActionLabel(Constants.SELECT_MASK_ACTION);
      } else {
        scope.statusbar.setShiftActionLabel(Constants.TOGGLE_MASK_ASSIGNMENT_ACTION);
      }
    });
    this.imageMaskObjectPlacer.Subscribe('maskAnnotationUpdated', this, function(maskAddresses) {
      if (scope.maskAnnotationsPanel) {
        for (let maskAddress of maskAddresses) {
          scope.maskAnnotationsPanel.updateAnnotation(maskAddress.maskId);
        }
      }
    });
    this.imageMaskObjectPlacer.Subscribe('customInstancesUpdated', this, function() {
      if (scope.maskAnnotationsPanel) {
        scope.maskAnnotationsPanel.update();
      }
    });
    this.__modelSearchControlers.push(this.imageMaskObjectPlacer.searchController);
    this.addControl(this.imageMaskObjectPlacer);
  }

  showMaskCommentUI() {
    this.imageMaskObjectPlacer.displayMaskComment();
    //this.statusbar.setMaskCommentActive(true);
  }

  __initViewpointRetriever() {
    const archId = this.urlParams['archId'];
    if (archId) {
      this.archName = archId.split('.')[1];
    }
    const viewpointSource = this.urlParams['viewpointSource'];
    this.viewpointRetriever = new ViewpointRetriever({
      assetManager: this.assetManager,
      query: `sceneSpecId:${this.archName}`,
      sort: function(list) { return _.sortBy(list, 'roomId'); },
      source: viewpointSource
    });
  }

  __retrieveObjectInfo(archId, callback) {
    const assetInfo = this.assetManager.getAssetInfo(archId);
    const objectJsonPath = _.get(assetInfo, ['objectInfo', 'path']);
    if (objectJsonPath) {
      console.log('Loading object info for ' + archId + ' from ' + objectJsonPath);
      _.getJSON(objectJsonPath, (err, objectInfoJson) => {
        let objectInfoStore;
        if (err) {
          console.error('Error loading object info from ' + objectJsonPath, err);
        } else {
          const showAllLabels = this.urlParams.showAllMasks;
          objectInfoStore = new ObjectInfoStore(this.config.object_info_store, objectInfoJson, !showAllLabels);
        }
        if (callback) {
          callback(err, objectInfoStore);
        }
      });
    } else {
      console.warn('No path for object info for ' + archId);
      callback('No path for object info for ' + archId);
    }
  }

  lookAt(objects) {
    this.imageMaskObjectPlacer.viewObject(objects);
  }

  setCameraToPanoramaView(lookDir) {
    // Ensure 3D scene view matches panorama
    console.log('setCameraToPanoramaView', lookDir);
    if (lookDir) {
      this.activeViewpoint.updateLookDirection(lookDir);
    }
    this.setCameraState(this.activeViewpoint.cameraState);
    this.cameraControls.update();
  }

  setCameraState(camState) {
    console.log('setCameraState', camState);
    if (camState.fov) {
      this.baseFov = camState.fov;
    }
    this.sceneState.useCameraState(camState);
    // Apply FOV multiplier
    // TODO: check if we should call this updateFov function or something else
    this.updateFov(this.baseFov * this.fovMultiplier);
  }

  isImageMaskObjectPlacerActive() {
    return this.imageMaskObjectPlacer && this.imageMaskObjectPlacer.active;
  }

  setImageMaskObjectPlacerActive(flag) {
    console.log('setImageMaskObjectPlacerActive', flag);
    if (this.imageMaskObjectPlacer && this.editMode) {
      if (flag === this.imageMaskObjectPlacer.active) {
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
      this.imageMaskObjectPlacer.active = flag;
    }
  }

  finish(onSuccess, onError) {
    if (this.task) {
      this.task.completed = true;
      this.close();
      this.finished = true;
      // this.saveScene(()=>{ scope.finished = true; onSuccess(); scope.close(); }, onError);
    } else{
      console.error('No task loaded to mark completed.');
    }
  }

}

module.exports = RlsdSceneEditor;