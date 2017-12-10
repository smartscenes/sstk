var Constants = require('Constants');
var AssetLoader = require('assets/AssetLoader');
var AssetManager = require('assets/AssetManager');
var SceneState = require('scene/SceneState');
var SearchController = require('search/SearchController');
var Skeleton = require('anim/Skeleton');
var Viewer3D = require('Viewer3D');
var _ = require('util');

function InteractionViewer(params) {
  var defaults = {
    useDatGui: true,
    skeletonFile: Constants.assetsDir + '/data/pigraphs/skeleton.json',
    uihookups: _.keyBy([
      {
        name: 'saveImage',
        click: this.saveImage.bind(this),
        shortcut: 'i'
      }
    ])
  };
  Viewer3D.call(this, _.defaults(Object.create(null), params, defaults));
}

InteractionViewer.prototype = Object.create(Viewer3D.prototype);
InteractionViewer.prototype.constructor = InteractionViewer;

InteractionViewer.prototype.init = function() {
  var options = this.__options;
  this.setupUI();
  this.setupBasicRenderer();
  this.setupBasicScene();
  this.registerEventListeners();

  var scope = this;
  scope.__initAssets(options)
    .then(function(assetGroups) {
      scope.assetLoader.load(scope.__options.skeletonFile, 'json', function(data) {
        console.log(data);
        scope.skeleton = new Skeleton(data);
        console.log(scope.skeleton);
        scope.__initSearch(options, assetGroups);
      });
    });
};

InteractionViewer.prototype.__initAssets = function (options) {
  this.assetLoader = new AssetLoader();
  this.assetManager = new AssetManager({
    previewImageIndex: options.previewImageIndex,
    autoScaleModels: false,
    autoAlignModels: false
  });
  this.searchController = new SearchController();
  this.assetManager.setSearchController(this.searchController);

  var scope = this;
  var p = new Promise(
    function(resolve, reject) {
      // Setup assetGroups
      if (options.assetFiles) {
        scope.assetManager.registerCustomAssetGroups({
          assetFiles: options.assetFiles,
          callback: function(err, results) {
            resolve(results);
          }
        });
      } else {
        resolve([]);
      }
    }
  );
  return p;
};

InteractionViewer.prototype.__initSearch = function (options, assetGroups) {
};

InteractionViewer.prototype.setupBasicScene = function(options) {
  options = options || {};
  this.sceneState = new SceneState(null, {
    unit: options.unit || 1,
    up: options.up || Constants.worldUp,
    front: options.front || Constants.worldFront
  });
  this.light = this.createDefaultLight();
  this.sceneState.fullScene.add(this.light);
  this.sceneState.fullScene.add(this.camera);
  if (Constants.isBrowser) { window.scene = this.sceneState.fullScene; }  // export for THREE.js inspector
};

InteractionViewer.prototype.getRenderScene = function () {
  return this.sceneState.fullScene;
};

InteractionViewer.prototype.setupUI = function() {
};

module.exports = InteractionViewer;