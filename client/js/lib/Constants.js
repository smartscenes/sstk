'use strict';

define([],
function () {

  var Constants = {};

  Constants.VERSION = VERSION;
  Constants.BUILD = BUILD;
  Constants.assets = ASSETS;
  Constants.config = CONFIG;
  Constants.pkgname = "SSTK version " + Constants.VERSION;
  Constants.buildname = Constants.pkgname + " (build "  +  Constants.BUILD + ")";

  // Where global vars are stored
  Constants.isBrowser = typeof window !== 'undefined';
  Constants.globals = (Constants.isBrowser && window.globals) ? window.globals : {};

  // Returns whether global var with given name is available
  Constants.hasGlobal = function (name) {
    return Constants.globals && (Constants.globals[name] != undefined);
  };

  // Returns value of global var with given name or undefined if unavailable
  Constants.getGlobal = function (name) {
    return Constants.hasGlobal(name) ? Constants.globals[name] : undefined;
  };

  // Returns value of global var with given name or given value if unavailable
  Constants.getGlobalOrDefault = function (name, def, opts) {
    var value = Constants.hasGlobal(name) ? Constants.globals[name] : def;
    if (Array.isArray(def) && typeof value === 'string') {
      // Try to convert value to array
      value = value.split(',');
      if (opts && opts.dropEmpty) {
        value = value.filter( function(x) { return x.length > 0; });
      }
    } else {
      if (opts && opts.dropEmpty) {
        if (value === '' && def !== '') {
          value = def;
        }
      }
    }
    return value;
  };

  Constants.setVirtualUnit = function(virtualUnitToMeters) {
    Constants.virtualUnitToMeters = virtualUnitToMeters;
    Constants.metersToVirtualUnit = 1/virtualUnitToMeters;
  };

  Constants.setWorldUpFront = function(worldUp, worldFront) {
    if (worldUp) {
      Constants.worldUp.copy(worldUp);
    }
    if (worldFront) {
      Constants.worldFront.copy(worldFront);
    }
    Constants.worldDown.copy(Constants.worldUp).negate();
  };

  Constants.defaultPalette = null;

  // Mouse buttons (event.which)
  Constants.LEFT_MOUSE_BTN = 1;
  Constants.RIGHT_MOUSE_BTN = 3;

  //    Constants.worldUp = new THREE.Vector3(0,0,1);
  //    Constants.worldFront = new THREE.Vector3(0,1,0);
  Constants.worldUp = new THREE.Vector3(0,1,0);
  Constants.worldDown = new THREE.Vector3(0,-1,0);
  Constants.worldFront = new THREE.Vector3(0,0,-1);
  Constants.shapenetUp = new THREE.Vector3(0,1,0);
  Constants.shapenetFront = new THREE.Vector3(1,0,0);
  Constants.defaultModelUp = new THREE.Vector3(0,0,1);
  Constants.defaultModelFront = new THREE.Vector3(0,-1,0);
  Constants.defaultSceneUp = new THREE.Vector3(0,0,1);
  Constants.defaultSceneFront = new THREE.Vector3(0,-1,0);

  Constants.defaultCamera = {
    position: new THREE.Vector3(-50, 20, -100),
    near: 10,
    far: 10000,
    nearFarMultiplier: 1000  // used to divide near and multiply far when setting wrt view target bbox
  };

  Constants.ControlTypes = ['orbit', 'firstPerson'];

  // We will work assuming 1 virtual unit = 1 cm
  //  (most of the objects we are concerned with are best measured in cms)

  // How much to multiply stored units (in meters) by to get virtual units (cms)
  //  and vice versa
  Constants.metersToVirtualUnit = 100;
  Constants.virtualUnitToMeters = 1 / Constants.metersToVirtualUnit;
  Constants.modelUnitInches = 0.0254;
  Constants.modelUnitCentimeters = 0.01;
  Constants.modelUnitMeters = 1.0;

  // Assume input model data is modeled in inches (WSS COLLADA mostly declares this)
  // Assume units are always stored in meters
  Constants.defaultModelUnit = Constants.modelUnitInches;
  Constants.defaultSceneUnit = Constants.defaultModelUnit;

  // TODO: Populate with stuff!
  Constants.assetTypes = {
    'model': { defaults: { defaultDataType: "mesh", defaultUp: Constants.defaultModelUp, defaultFront: Constants.defaultModelFront, defaultUnit: Constants.defaultModelUnit },
               arrayFields: ['datasets', 'category', 'variantIds', 'componentIds', 'setIds', 'wnsynset','wnsynsetkey'] },
    'scan':  { defaults: { defaultDataType: "mesh", defaultUp: Constants.defaultModelUp, defaultFront: Constants.defaultModelFront, defaultUnit: Constants.defaultModelUnit } },
    'room':  { defaults: { defaultDataType: "mesh", defaultUp: Constants.defaultSceneUp, defaultFront: Constants.defaultSceneFront, defaultUnit: Constants.defaultSceneUnit } },
    'scene': { defaults: { defaultDataType: "mesh", defaultUp: Constants.defaultSceneUp, defaultFront: Constants.defaultSceneFront, defaultUnit: Constants.defaultSceneUnit },
               arrayFields: ['datasets', 'modelIds', 'modelCats', 'modelNames', 'modelTags', 'roomIds', 'roomTypes', 'origRoomTypes'] },
    'texture': { defaults: { defaultDataType: "image" } }
  };
  Constants.assetTypeModel = 'model';
  Constants.assetTypeScan = 'scan';
  Constants.assetTypeRoom = 'room';
  Constants.assetTypeScene = 'scene';
  Constants.assetTypeTexture = 'texture';

  Constants.assetSources = {
    'scan': [/*'scans'*/],
    'model': ['models3d'],
    'scene': ['scenes'],
    'texture': ['textures']
  };
  Constants.assetsFile = 'resources/data/assets.json';
  Constants.scanAssetsFile = 'resources/data/assets-scans.json';

  Constants.maxModelSize = 10000000;
  Constants.defaultModelSource = 'models3d';

  // Preview constants
  Constants.previewMaxWidth = 500;
  Constants.previewMaxHeight = 500;

  // Base URL
  Constants.baseUrl = Constants.getGlobalOrDefault('base_url', process.env.NODE_BASE_URL || '');
  // TODO: Consolidate assets/resources
  Constants.assetsDir = Constants.getGlobalOrDefault('assets_url', Constants.baseUrl + '/resources/');
  Constants.screenShotDir = Constants.baseUrl + '/text2scene/screenshots/';
  Constants.defaultVideo = 'videos/sintel.ogv';

  //Rails asset urls
  //Constants.imageDir = Constants.baseUrl + '/data/image/';

  // Combined models 3D database
  Constants.models3dSearchUrl = Constants.baseUrl + '/solr/models3d/select';
  Constants.models3dFieldsUrl = Constants.baseUrl + '/solr/models3d/schema/fields';
  Constants.models3dSimilaritySearchUrl = Constants.baseUrl + '/ws/models3d/search';
  Constants.models3dTextSearchUrl = Constants.baseUrl + '/ws/models3d/search';

  Constants.texturesDataDir = Constants.baseUrl + '/data/textures/';
  Constants.texturesSearchUrl = Constants.baseUrl + '/solr/textures/select';

  Constants.wordnetSearchUrl = Constants.baseUrl + '/solr/wordnet/select';
  Constants.shapenetSearchUrl = Constants.baseUrl + '/solr/shapenet-synsets/select';
  Constants.taxonomyUrl = Constants.baseUrl + '/taxonomy'; // shows shapenet taxonomy
  Constants.imagenetUrl = Constants.baseUrl + '/imagenet';

  // Data
  Constants.dataDir = Constants.getGlobalOrDefault('data_url', Constants.assetsDir + '/data/');
  // Images
  Constants.imagesDir = Constants.getGlobalOrDefault('images_url', Constants.assetsDir + '/images/');
  // Loading icon
  Constants.manipulatorImagesDir = Constants.imagesDir + '/manipulator/';
  Constants.cameraControlIconsDir = Constants.imagesDir + '/camera_icons/';
  Constants.toolbarIconsDir = Constants.imagesDir + '/toolbar_icons/';
  Constants.scaleLineImageDir = Constants.imagesDir + '/scaleline/';
  Constants.defaultLoadingIconUrl = Constants.imagesDir + '/loading.gif';

  // Scenes searching
  Constants.scenesSearchUrl = Constants.baseUrl + '/solr/scenes/select';
  Constants.scenesFieldsUrl = Constants.baseUrl + '/solr/scenes/schema/fields';

  // Rooms searching
  Constants.roomsSearchUrl = Constants.baseUrl + '/solr/rooms/select';
  Constants.roomsFieldsUrl = Constants.baseUrl + '/solr/rooms/schema/fields';

  Constants.autoRotateSpeed = 0.001;

  // PartAnnotator
  Constants.meshPrefix = 'SGPath-';
  // Annotations
  Constants.submitUpdateMain = true;
  Constants.submitPartAnnotationsURL = Constants.baseUrl + '/part-annotations/submit';
  Constants.retrievePartAnnotationsURL = Constants.baseUrl + '/query?qt=parts';
  Constants.retrieveSegmentsAnnotationsURL = Constants.baseUrl + '/query?qt=segments';
  Constants.retrieveAnnotationsURL = Constants.baseUrl + '/annotations/list';
  Constants.submitAnnotationsURL = Constants.baseUrl + '/annotations/submit';
  Constants.submitSegmentsAnnotationsStatusURL = Constants.baseUrl + '/scans/segment-annotations/edit';
  Constants.submitSegmentAnnotationsURL = Constants.baseUrl + '/scans/segment-annotations/submit';

  // TODO: Reorganize these under shapenet
  // ShapeNet MySQL query URL
  Constants.shapenetQueryUrl = Constants.baseUrl + '/queryShapeNet';

  // Scene generation
  Constants.text2sceneDataUrl = Constants.baseUrl + '/text2scene/';
  Constants.sceneGenerationUrl = Constants.baseUrl + '/ws/scenes/interact';

  // Visualizing parts
  Constants.getPartsUrl = Constants.baseUrl + '/ws/scenes/getParts';

  // Get scene priors
  Constants.getScenePriorsUrl = Constants.baseUrl + '/ws/scenes/getScenePriors';

  // Similarity layout
  Constants.simLayoutUrl = Constants.baseUrl + '/ws/sim/layout';
  Constants.similaritiesUrl = Constants.baseUrl + '/ws/sim/similarities';

  // Camera widget settings
  Constants.cameraWidgetSettings = {
    orbitLeftAmt: Math.PI / 8,
    orbitUpAmt: Math.PI / 12,
    dollyAmt: 20,
    zoomAmt: 30,
    orbitDuration: 250,
    dollyDuration: 250,
    zoomDuration: 250,
    resetDuration: 750
  };

  // Undo stack settings
  Constants.undoStackMaxSize = 100;

  // Edit event operation status
  Constants.EDIT_OPSTATE = Object.freeze({
    INIT: 'EDIT_INIT',
    PROGRESS: 'EDIT_PROGRESS',
    DONE: 'EDIT_DONE'
  });

  // Command Type enum for UndoStack
  Constants.CMDTYPE = Object.freeze({
      INSERT: 'INSERT',
      DELETE: 'DELETE',
      MOVE: 'MOVE',
      ROTATE: 'ROTATE',
      SCALE: 'SCALE',
      SWITCHFACE: 'SWITCHFACE',
      INIT: 'INIT',
      TEXT2SCENE: 'TEXT2SCENE',
      TUTORIAL_START: 'TUTORIAL_START',
      NULL: 'NULL'
    });

  // Query events
  Constants.QUERY_OP = Object.freeze({
    START: 'QUERY_START',
    SELECT: 'QUERY_SELECT',
    SELECT_GROUP: 'QUERY_SELECT_GROUP',
    GO_BACK: 'QUERY_GO_BACK',
    DONE: 'QUERY_DONE'
  });

  Constants.BBoxFaces = Object.freeze({
    LEFT:    0,
    RIGHT:   1,
    BOTTOM:  2,
    TOP:     3,
    FRONT:   4,
    BACK:    5
  });

  Constants.BBoxFaceCenters = Constants.BBoxFaces;

  Constants.BBoxFacesThetaPhi = [
    [0, -Math.PI/2],
    [0, Math.PI/2],
    [-Math.PI/2, 0],
    [+Math.PI/2, 0],
    [0, 0],
    [0, Math.PI]
  ];

  Constants.EmptyArray = Object.freeze([]);

  Constants.EditStrategy = Object.freeze({
    // Strategy for getting attachment point
    //DragDrop.ATTACH_BBCENTER = 1;
    //DragDrop.ATTACH_BBCENTER_PRIORS = 2;

    // Strategy for dealing with support surface change
    SupportSurfaceChange: {
      NONE: 0,
      SWITCH_ATTACHMENT: 1,
      REORIENT_CHILD: 2
    }
  });

  Constants.tutorialModelId = 'wss.f6bcb75ed0132a2bd99fe055da4bc66c';
  Constants.tutorialCameraPosition = [-145, 240, -72];

  // Experimental features
  Constants.enableThumbnail = true;
  Constants.thumbnailPostfix = '_thumb.png';
  Constants.AssetGroup = Object.freeze({
      'ROTATING_IMAGE_INDEX': -10
    });

  Constants.defaultTexturedObjects = ['WallInside', 'WallOutside', 'Floor', 'Ceiling'];

  // Exports
  return Constants;

});
