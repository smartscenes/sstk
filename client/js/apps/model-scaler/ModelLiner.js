'use strict';

var Constants = require('lib/Constants');
var AssetManager = require('assets/AssetManager');
var AssetGroups = require('assets/AssetGroups');
var SearchController = require('search/SearchController');
var CameraControls = require('controls/CameraControls');
var Object3DUtil = require('geo/Object3DUtil');
var Lights = require('gfx/Lights');
var CanvasUtil = require('ui/CanvasUtil');
var UIUtil = require('ui/UIUtil');
var AssetLoader = require('assets/AssetLoader.js');
var IOUtil = require('io/IOUtil');
var Picker = require('controls/Picker.js');
var OBJMTLExporter = require('exporters/OBJMTLExporter');
var FileSaver = require('filesaverjs');
var dat = require('dat.gui');

function ModelLiner(container) {
  Constants.worldUp = new THREE.Vector3(0,0,1);
  // Set world front to -y so all models are aligned to that and our camera faces it
  Constants.worldFront = new THREE.Vector3(0,-1,0);

  this.modelScalesCsv = Constants.dataDir + '/sizes/CombAll.modelScales.csv'; // file of estimated scales we will use
  this.lineupModelIdsFile = Constants.dataDir + '/sizes/lineups4.json';
  this.container = null;
  this.camera = null;
  this.scene = null;
  this.renderer = null;
  this.mouseX = 0;
  this.mouseY = 0;
  this.assetManager = null;
  this.useShadows = false;
  this.grayMaterial = Object3DUtil.getSimpleFalseColorMaterial(0, new THREE.Color(0xa3a3a3));

  this.objExporter = new OBJMTLExporter();

  // The lineup model sets
  this.lineups = {};

  // Total number of lineups
  this.nLineups = -1;

  // Line up ids
  this.lineupIds = [];

  // Current lineup index into lineups
  this.currLineup = -1;

  // Load multiple lineups
  this.__multiLineup = false;
  this.__nRows = 0;

  // The set of models being shown
  this.models = [];
  // Set of models being shown (sorted)
  this.sortedModels = null;

  // Target model instance
  this.targetModelInstance = null;

  // Model scales map
  this.modelScales = null;

  // Are the models currently rescaled intelligently?
  this.__isModelsRescaled = true;

  // The ground plane
  this.groundModel = null;

  // Default camera params
  this.cameraPosition = new THREE.Vector3(0, -1000, 100);
  this.cameraTarget = new THREE.Object3D();
  this.cameraTarget.position.set(0, 0, 100);
  this.cameraNear = 2; // 0.1cm
  this.cameraFar = 400000; // 40m
  this.cameraFOV = 45;

  this.highlightColorId = 0;
  this.coloredModels = [];

  // Whether unscaled models will be indicated
  this.__indicateUnscaledModels = true;

  // Whether to use the man or not
  this.__useMan = false;
  this.__manId = 'archive3d.9c5c1480';
  this.__manModel = null;

  var c = new THREE.Color(0x7D9EE0);
  c.offsetHSL(-0.2, -0.3, 0);
  this.defaultModelMaterial = Object3DUtil.getSimpleFalseColorMaterial(0, c);

  this.layoutEpsilon = 10;
  this.picker = new Picker();

  AssetGroups.setDefaultFormat('utf8v2');
  this.init(container);

  var instructions = $('#instructions');
  if (instructions) {
    instructions.html(
        'Left click = Orbit view<br>' +
        'Right click = Pan view<br>' +
        'Mouse wheel = Zoom view<br>' +
        'E = Layout models in a line<br>' +
        'R = Toggle model Rescaling<br>' +
        'N = Next model set (lineup)<br>' +
        'S = Save screenshot<br>' +
        'T = Save lineup<br>' +
        'C = Switch camera (ortho/perspective)<br>' +
        'A = Switch ground visibility<br>' +
        'X = Toggle multiple line lineups<br>' +
        'Left/Right arrow key = Rotate target model<br>' +
        'H = Toggle target model color<br>' +
        'Y = Export target model to .OBJ<br>' +
        'Z = Export scene to .OBJ'
    );
  }
}

Object.defineProperty(ModelLiner.prototype, 'isModelsRescaled', {
  get: function () {return this.__isModelsRescaled; },
  set: function (v) {
    this.__isModelsRescaled = v;
    var models = this.__getModels();
    this.rescaleModels(models, v);
  }
});

Object.defineProperty(ModelLiner.prototype, 'indicateUnscaledModels', {
  get: function () {return this.__indicateUnscaledModels; },
  set: function (v) {
    this.__indicateUnscaledModels = v;
    this.colorModels(this.__getModels(), this.coloredModels);
  }
});

Object.defineProperty(ModelLiner.prototype, 'multiLineup', {
  get: function () {return this.__multiLineup; },
  set: function (v) {
    this.__multiLineup = v;
    this.clear();
    if (v) {
      this.loadAllLineups();
    } else {
      this.loadModels(this.currLineup);
    }
  }
});

Object.defineProperty(ModelLiner.prototype, 'nRows', {
  get: function () {return this.__nRows; },
  set: function (v) {
    this.__nRows = v;
    this.doLineup();
  }
});

Object.defineProperty(ModelLiner.prototype, 'useMan', {
  get: function () {return this.__useMan; },
  set: function (v) {
    this.__useMan = v;
    this.showMan(v);
  }
});

ModelLiner.prototype.init = function (container) {
  this.assetManager = new AssetManager({
    autoAlignModels: true
  });

  this.setupQueryPanel();
  this.setupLocalLoading();
  this.loadModelScalesCSV(false, this.modelScalesCsv);

  this.searchController = new SearchController();
  this.assetManager.setSearchController(this.searchController);

  this.targetUp = Constants.worldUp;
  this.targetFront = Constants.worldFront;
  this.defaultModelUp = Constants.defaultModelUp;

  this.container = container;
  var width = this.container.clientWidth;
  var height = this.container.clientHeight;

  this.camera = new THREE.CombinedCamera(width / 2, height / 2, this.cameraFOV,
      this.cameraNear, this.cameraFar, this.cameraNear, this.cameraFar);
  this.camera.toPerspective();

  this.controls = new CameraControls({
    camera: this.camera,
    container: this.container,
    renderCallback: this.render.bind(this),
    controlType: 'trackballNoOrbit'
  });
  this.resetCamera();

  this.scene = new THREE.Scene();
  this.scene.add(this.camera);

  Lights.addSimple2LightSetup(this.scene, new THREE.Vector3(-20000,-15000,10000), this.useShadows);

  // RENDERER
  this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  this.renderer.setSize(width, height);
  this.container.appendChild(this.renderer.domElement);
  if (this.useShadows) {
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  window.addEventListener('resize', this.onWindowResize.bind(this), false);
  $(document).keydown(this.keyHandler.bind(this));
  this.container.addEventListener('mousewheel', this.mouseWheelHandler.bind(this), false);
  this.container.addEventListener('mouseup', this.onMouseUp.bind(this), false);

  // Load ground
  this.makeGround(10000);

  var wallUp = new THREE.Vector3(0,-1,0);
  var wallFront = new THREE.Vector3(0,0,1);
  Object3DUtil.alignToUpFrontAxes(this.wallModel, wallUp, wallFront, Constants.defaultModelUp, Constants.defaultModelFront);

  this.isGroundVisible = false;
  if (this.isGroundVisible) {
    this.scene.add(this.groundModel);
    this.scene.add(this.wallModel);
  }

  this.setupDatGui();
  this.fetchLineups(this.lineupModelIdsFile);
};

ModelLiner.prototype.makeGround = function (size) {
  console.log('Making ground ' + size);
  this.groundModelSize = size;
  this.groundModel = Object3DUtil.makeGrid(size,size,10,10, 0xf0f0f0);
  this.groundModel.translateZ(-2);
  this.groundModel.receiveShadow = this.useShadows;
  this.wallModel = Object3DUtil.makeGrid(size,size,10,10, 0xffffff);
  this.wallModel.translateZ(-size);
  this.wallModel.receiveShadow = this.useShadows;
};

ModelLiner.prototype.setupDatGui = function () {
  var gui = new dat.GUI();
  gui.close();
  gui.add(this, 'useMan').listen();
  gui.add(this, 'isModelsRescaled').listen();
  gui.add(this, 'indicateUnscaledModels').listen();
  gui.add(this, 'multiLineup').listen();
  gui.add(this, 'nRows').min(0).max(10).listen();
  gui.getFolder = function (name) {
    return gui.__folders[name] || gui.addFolder(name);
  };
  this.datgui = gui;
};

ModelLiner.prototype.fetchLineups = function (file) {
  var scope = this;
  function onLineupLoaded(json) {
    scope.clearLineups();
    scope.lineups = json.lineups || json;
    scope.lineupIds = [];
    for (var key in scope.lineups) {
      if (scope.lineups.hasOwnProperty(key)) {
        scope.lineupIds.push(key);
      }
    }
    scope.nLineups = scope.lineupIds.length; //TODO: Just track lineupIds?
    scope.currLineup = 0;
    console.log('Fetched ' + scope.nLineups + ' lineups from ' + (file.name || file));
    scope.loadModels(scope.currLineup);
    scope.coloredModels = json.colors || [];
  }
  var loader = new AssetLoader();
  return loader.load(file, 'json', onLineupLoaded);
};

ModelLiner.prototype.addLineup = function (models, autoload) {
  this.nLineups++;
  var id = 'lineup' + this.nLineups;
  this.lineupIds.push(id);
  this.lineups[id] = models.map( function(x) {
    if (typeof x === 'string') return x;
    else return x.fullId;
  });
  if (autoload) {
    this.currLineup = this.lineupIds.length-1;
    this.loadModels(this.currLineup);
  }
};

ModelLiner.prototype.clearLineups = function () {
  this.clear();
  this.lineupIds = [];
  this.lineups = {};
  this.nLineups = 0;
  this.currLineup = -1;
  this.models = [];
};

ModelLiner.prototype.loadModels = function (lineupIndex, summary) {
  summary = summary || { ready: true };
  var lineupId = this.lineupIds[lineupIndex];
  console.log('Loading lineup: ' + lineupId + '(' + lineupIndex + ')');

  var modelIds = this.lineups[lineupId];
  summary['startTime'] = summary['startTime'] || new Date().getTime();
  summary['count'] = summary['count'] || 0;
  summary['total'] = (summary['total'] || 0) + modelIds.length;
  for (var i = 0; i < modelIds.length; i++) {
    // Check if model already loaded
    var m = this.getModelInstance(lineupIndex, i);
    var loadInfo = {
      lineupIndex: lineupIndex, index: i, startTime: new Date().getTime(), summary: summary
    };
    if (m) {
      console.log('Model at ' + lineupId + ',' + i + ' already loaded');
      this.onTargetModelLoad(loadInfo, m);
    } else {
      this.assetManager.getModelInstance(null, modelIds[i], this.onTargetModelLoad.bind(this, loadInfo));
    }
  }
};

ModelLiner.prototype.loadModelScalesCSV = function (setRescale, file) {
  var scope = this;
  function modelScalesLoaded(csvFile) {
    scope.modelScales = {};
    var parsed = IOUtil.parseDelimited(csvFile, { header: true, skipEmptyLines: true, dynamicTyping: false });
    for (var i = 0; i < parsed.data.length; i++) {
      var m = parsed.data[i];
      var isSizable = (m['isSizeable'] == undefined) || m['isSizeable'];
      scope.modelScales[m['fullId']] = (isSizable)? parseFloat(m['unit']) * Constants.metersToVirtualUnit : -1.0;
    }
    console.log('Loaded model scales file: nModels=' + parsed.data.length);
    if (setRescale) {
      scope.isModelsRescaled = scope.__isModelsRescaled;
    }
  }

  var loader = new AssetLoader();
  return loader.load(file, undefined, modelScalesLoaded);
};

ModelLiner.prototype.setupLocalLoading = function () {
  var loadingPanel = $('#customLoadingContents');
  var sizesDiv = UIUtil.createFileInput(
    { id: 'sizes', label: 'Sizes', loadFn: this.loadModelScalesCSV.bind(this, true),
      help: 'CSV of model (fullId) and unit (in meters)'});
  loadingPanel.append(sizesDiv.group);
  var lineupsDiv = UIUtil.createFileInput(
    { id:'lineups', label: 'Lineups', loadFn: this.fetchLineups.bind(this),
      help: 'JSON with map of lineup name to array of model ids'});
  loadingPanel.append(lineupsDiv.group);
};

ModelLiner.prototype.setupQueryPanel = function () {
  var scope = this;
  var queryField = $('#query');
  var limitField = $('#queryLimit');
  var randomizeField = $('#random');
  var searchButton = $('#searchButton');
  var clearButton = $('#clearButton');

  clearButton.click(function() {
    scope.clearLineups();
  });
  searchButton.click(function (){
    var query = queryField.val().trim();
    var limit = parseInt(limitField.val().trim());
    var sortOrder = randomizeField.prop('checked')?
      scope.searchController.getRandomSortOrder() : '';
    scope.searchController.query({ source: 'models3d', query: query, order: sortOrder, start: 0, limit: limit },
      function(err, res) {
        if (err) {
          console.error('Got error querying');
          console.log(err);
        } else if (res && res.response && res.response.docs) {
          var docs = res.response.docs;
          scope.assetManager.cacheModelInfos(null, docs);
          scope.addLineup(docs, true);
        } else {
          console.error('Unable to handle response');
          console.log(res);
        }
      });
  });
  queryField.keyup(function(e) {
    var code = (e.keyCode ? e.keyCode : e.which);
    if (code === 13) {
      searchButton.click();
    }
  });
};

ModelLiner.prototype.rescaleModels = function (models, doRescale) {
  console.log('Rescaling ' + models.length + ' models ' + doRescale);
  for (var i = 0; i < models.length; i++) {
    if (!models[i]) {
      console.warn("Skipping null model " + models[i]);
      continue;
    }
    models[i].setScaleToDefault();
    if (doRescale) {
      var id = models[i].model.getFullID();
      var unit = this.modelScales[id];
      models[i].hasUnit = (unit != null && unit > 0);
      if (models[i].hasUnit) models[i].convertScaleToNewUnit(unit);
      else { // Not sizeable so just gray out
        console.log('Cannot scale ' + id);
        models[i].setScale(1);
        models[i].setMaterial(this.grayMaterial);
      }
    }
  }
};

ModelLiner.prototype.colorModels = function (models, coloredModels) {
  for (var i = 0; i < models.length; i++) {
    var modelInst = models[i];
    var modelIndex = coloredModels.indexOf(modelInst.model.getFullID());
    var mat;
    if (modelIndex >= 0) { // Highlight
      mat = Object3DUtil.getSimpleFalseColorMaterial(0, null);
      //this.highlightColorId++;
    } else { // Default color
      if (this.indicateUnscaledModels) {
        mat = modelInst.hasUnit ? this.defaultModelMaterial : this.grayMaterial;
      } else {
        mat = this.defaultModelMaterial;
      }
    }
    Object3DUtil.setMaterial(modelInst.object3D, mat);
  }
};

ModelLiner.prototype.getModelInstance = function (lineupIndex, i) {
  if (this.models[lineupIndex]) {
    return this.models[lineupIndex][i];
  }
};

ModelLiner.prototype.onTargetModelLoad = function (loadInfo, modelInstance) {
  var end = new Date().getTime();
  var time = end - loadInfo.startTime;
  var totalTime = end - loadInfo.summary.startTime;
  loadInfo.summary.count++;
  console.log('Loaded model ' + loadInfo.summary.count + '/' + loadInfo.summary.total
    + ' time=' + time + ', total=' + totalTime);
  var lineupIndex = loadInfo.lineupIndex;
  var i = loadInfo.index;
  if (!this.models[lineupIndex]) {
    this.models[lineupIndex] = [];
  }
  this.models[lineupIndex][i] = modelInstance;
  this.targetModelInstance = modelInstance;
  modelInstance.setMaterial(this.defaultModelMaterial);
  modelInstance.setScaleToDefault();
  this.centerTargetModel();
  if (this.useShadows) {
    Object3DUtil.setCastShadow(modelInstance.object3D, true);
    Object3DUtil.setReceiveShadow(modelInstance.object3D, true);
  }
  this.scene.add(modelInstance.object3D);

  if (loadInfo.summary.ready && loadInfo.summary.count === loadInfo.summary.total) {
    console.log('Done loading lineup!');
    this.isModelsRescaled = this.__isModelsRescaled;
    this.doLineup();
  }
};

ModelLiner.prototype.clear = function () {
  if (this.models) {
    for (var prop in this.models) {
      if (this.models.hasOwnProperty(prop)) {
        var myModels = this.models[prop];
        for (var i = 0; i < myModels.length; i++) {
          if (myModels[i] && myModels[i].object3D) {
            this.scene.remove(myModels[i].object3D);
          }
        }
      }
    }
  }
  this.targetModelInstance = null;
  this.sortedModels = null;
  this.coloredModels = [];
};

ModelLiner.prototype.multilineLayoutModels = function (models, params) {

  var nRows = params.nRows || 1;
  var epsilon = params.epsilon || 10;
  var alpha = params.alpha || 1.3;

  var rows = [];

  // Partition into n lines, sorted by height
  var sortedModels = Object3DUtil.getSortedModels(models, 'height');
  var totalDims = Object3DUtil.getTotalDims(models);
  var rowWidth = (alpha === 1) ? totalDims.x / nRows : totalDims.x * (alpha - 1) / (Math.pow(alpha,nRows) - 1);

  var allowMoreInFront = true;
  var start = 0;
  var end = 0;
  for (var i = 0; i < nRows; i++) {
    if (i < nRows-1) {
      var curWidth = 0;
      while (end < sortedModels.length && curWidth < rowWidth) {
        var nextWidth = curWidth + sortedModels[end].getBBox().dimensions().x;
        if (allowMoreInFront || nextWidth <= rowWidth) {
          curWidth = nextWidth;
          end++;
        } else {
          break;
        }
      }
    } else {
      end = sortedModels.length;
    }
    rows[i] = sortedModels.slice(start, end);
    start = end;
    rowWidth *= alpha;
    epsilon *= alpha;
  }

  // Lineup each line pushing larger objects to the back
  var y = 0;
  for (var k = 0; k < rows.length; k++) {
    var lineup = Object3DUtil.lineup(rows[k], { y: y });
    y += lineup.maxDepth + epsilon;
  }
  this.sortedModels = sortedModels;
};

ModelLiner.prototype.showMan = function(flag) {
  var scope = this;
  function __showMan(m) {
    scope.__manModel = m;
    var centerPoint = new THREE.Vector3(0, 0, 0);
    var bbBoxRefPoint = new THREE.Vector3(0.5, 0.5, 0);
    Object3DUtil.placeObject3D(m.object3D, centerPoint, bbBoxRefPoint);
    Object3DUtil.setVisible(m.object3D, true);
    if (scope.__manModel.parent !== scope.scene) {
      scope.scene.add(scope.__manModel.object3D);
    }
  }
  if (flag) {
    if (!this.__manModel) {
      this.assetManager.getModelInstance(null, this.__manId, __showMan.bind(this));
    } else {
      __showMan(this.__manModel);
    }
  } else {
    if (this.__manModel) {
      Object3DUtil.setVisible(this.__manModel.object3D, false);
    }
  }
};

ModelLiner.prototype.centerTargetModel = function () {
  var modelInstance = this.targetModelInstance;
  var centerPoint = new THREE.Vector3(0, 0, 0);
  var bbBoxRefPoint = new THREE.Vector3(0.5, 0.5, 0);

  Object3DUtil.placeObject3D(modelInstance.object3D, centerPoint, bbBoxRefPoint);
};

ModelLiner.prototype.saveImage = function () {
  this.render();
  var dataUrl = CanvasUtil.getTrimmedCanvasDataUrl(this.renderer.domElement);
  var blob = CanvasUtil.dataUrlToBlob(dataUrl);
  FileSaver.saveAs(blob, 'myimage.png');
  //window.open(dataUrl);
};

ModelLiner.prototype.__getModels = function() {
  var models = [];
  if (this.sortedModels) {
    models = this.sortedModels;
  } else if (this.multiLineup) {
    models = this.models[0];
    for (var j = 1; j < this.nLineups; j++) {
      models = models.concat(this.models[j]);
    }
  } else {
    models = this.models[this.currLineup];
  }
  return models;
};

ModelLiner.prototype.keyHandler = function (event) {
  var tagName = (event.target || event.srcElement).tagName;
  var skip = (tagName === 'INPUT' || tagName === 'SELECT' || tagName === 'TEXTAREA');
  if (skip) return;

  var models = this.__getModels();

  switch (event.which) {
    case 37: // left
      // Rotate selected model
      if (this.targetModelInstance) {
        this.targetModelInstance.rotate(new THREE.Vector3(0, 0, -Math.PI / 4));
      }
      break;
    case 39: // right
      // Rotate selected model
      if (this.targetModelInstance) {
        this.targetModelInstance.rotate(new THREE.Vector3(0, 0, +Math.PI / 4));
      }
      break;
    case 69: // e
      // Line everything up by size (height)
      this.doLineup(models);
      break;
    case 82: // r
      // Rescales everything
      this.isModelsRescaled = !this.isModelsRescaled;
      break;
    case 78: // n
      // Selected next line up
      this.clear();
      this.currLineup = ((this.currLineup + 1) % this.nLineups);
      this.loadModels(this.currLineup);
      break;
    case 83: // s
      // Saves image
      this.saveImage();
      break;
    case 84: // t
      // Saves lineups
      this.saveLineups('lineups.json');
      break;
    case 67: // c
      this.switchCameraMode(this.camera, models);
      break;
    case 65: // a
      this.switchGroundVisibility();
      break;
    case 88: // x
      // Toggle multilineup
      this.multiLineup = !this.multiLineup;
      break;
    case 72: // h
      // Toggle color of selected model
      if (!this.targetModelInstance) return;
      var mat;
      if (event.shiftKey) {
        mat = this.defaultModelMaterial;
      } else {
        mat = Object3DUtil.getSimpleFalseColorMaterial(this.highlightColorId,null);
        this.highlightColorId++;
      }
      Object3DUtil.setMaterial(this.targetModelInstance.object3D, mat);
      break;
    case 89: // y
      // Export selected model to obj
      if (this.targetModelInstance) {
        this.objExporter.export(this.targetModelInstance.object3D);
      }
      break;
    case 90: // z
      // Export all models to obj
      var object3Ds = [];
      for (var i = 0; i < models.length; i++) {
        object3Ds.push(models[i].object3D);
      }
      this.objExporter.export(object3Ds);
      break;
    default:
      break;
  }
};

ModelLiner.prototype.doLineup = function(models) {
  models = models || this.__getModels();
  var nRows = 1;
  // Initialize appropriate vars
  if (this.multiLineup) {
    if (this.nRows > 0) {
      nRows = this.nRows;
    } else {
      nRows = this.nLineups > 1 ? this.nLineups : Math.floor(Math.sqrt(models.length)) || 1;
    }
  }
  this.multilineLayoutModels(models, { nRows: nRows, epsilon: this.layoutEpsilon });
  this.colorModels(models, this.coloredModels);
};

ModelLiner.prototype.saveLineups = function (filename) {
  var blob = new Blob([JSON.stringify(this.lineups)], {type: "text/plain;charset=utf-8"});
  FileSaver.saveAs(blob, filename);
};

ModelLiner.prototype.loadAllLineups = function () {
  var b = 0;
  var e = this.nLineups;
  var summary = {};
  for (var i = b; i < e; i++) {
    this.loadModels(i, summary);
  }
  summary.ready = true;
};

ModelLiner.prototype.switchGroundVisibility = function () {
  this.isGroundVisible = !this.isGroundVisible;
  if (this.isGroundVisible) {
    this.alignWalls();
    this.scene.add(this.groundModel);
    this.scene.add(this.wallModel);
  } else {
    this.scene.remove(this.groundModel);
    this.scene.remove(this.wallModel);
  }
};

ModelLiner.prototype.alignWalls = function () {
  var models = this.__getModels();
  var bbox = Object3DUtil.getBBoxForModelInstanceArray(models);
  var bbdims = bbox.dimensions();
  var m = Math.max(bbdims.x, bbdims.y);
  if (this.groundModelSize < m*2) {
    this.scene.remove(this.groundModel);
    this.scene.remove(this.wallModel);
    this.makeGround(m*2);
  }
  this.wallModel.position.set(0,bbox.max.y + 1,0);
  this.groundModel.position.set(0,bbox.max.y + 1,-2);
};

ModelLiner.prototype.switchCameraMode = function (cam, models) {
  if (!cam.inOrthographicMode) { // Switch to orthographic
    var r = Object3DUtil.getBBoxForModelInstanceArray(models);
    cam.position.x = 0;
    cam.position.y = -0.5 * r.depth;
    cam.position.z = r.height / 2;
    cam.far = r.depth;
    cam.near = 0.1;
    cam.toOrthographic();
  } else {
    cam.toPerspective();
  }
  this.resetCamera();
};

ModelLiner.prototype.resetCamera = function () {
  this.camera.up = new THREE.Vector3(0, 0, 1);

  if (this.camera.inOrthographicMode) {
    var targetH = (this.camera.top - this.camera.bottom) * 0.4;
    this.camera.position.set(0, -1000, targetH);
    var targetLook = new THREE.Vector3(0, 0, targetH);
    this.camera.lookAt(targetLook);
    if (this.controls) this.controls.controls.target.copy(targetLook);
  } else {
    this.camera.position.copy(this.cameraPosition);
    this.camera.lookAt(this.cameraTarget.position);
    if (this.controls) this.controls.controls.target.copy(this.cameraTarget.position);
  }

  this.camera.updateProjectionMatrix();
};

ModelLiner.prototype.onMouseUp = function (event) {
  var mouse = this.picker.getCoordinates(this.container, event);
  var models = this.__getModels();
  var objects = models.map( function(x) { return x.object3D; } );
  var selected = this.picker.getFirstIntersected(mouse.x, mouse.y, this.camera, objects);
  if (selected) {
    var modelInstance = Object3DUtil.getModelInstance(selected.object);
    if (modelInstance) {
      this.targetModelInstance = modelInstance;
      console.log('Selected ' + modelInstance.model.getFullID() +
        ' with bbdims ' + JSON.stringify(modelInstance.getBBoxDims()));
      console.log(modelInstance);
    }
  }
};

ModelLiner.prototype.mouseWheelHandler = function (event) {
  if (!this.camera.inOrthographicMode) return;

  event.preventDefault();
  event.stopPropagation();

  var isUp = (event.wheelDelta > 0);
  this.camera.zoom *= (isUp) ? 1.05 : 0.95;

  this.camera.updateProjectionMatrix();
};

ModelLiner.prototype.onWindowResize = function () {
  if (!this.renderer || !this.camera) return;

  var width = this.container.clientWidth;
  var height = this.container.clientHeight;
  this.camera.aspect = width / height;
  this.camera.updateProjectionMatrix();

  this.renderer.setSize(width, height);

  if (this.controls) this.controls.handleResize();

  this.render();
};
ModelLiner.prototype.redisplay = function () {
  requestAnimationFrame(this.redisplay.bind(this));
  if (this.controls) this.controls.update();
  this.render();
};
ModelLiner.prototype.render = function () {
  if (!this.renderer) return;
  this.renderer.render(this.scene, this.camera);
};

// Exports
module.exports = ModelLiner;
