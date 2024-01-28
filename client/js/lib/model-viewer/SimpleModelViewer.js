const SingleModelCanvas = require('model-viewer/SingleModelCanvas');
const AssetManager = require('assets/AssetManager');
const SearchController = require('search/SearchController');
const _  = require('util/util');
require('jquery-lazy');

class SimpleModelViewer {
  constructor(params) {
    params = (params instanceof Element) ? {container: params} : params;
    const defaults = {
      supportArticulated: false,
      sources: ['models3d', 'wss', 'archive3d'],
      skipLoadInitialModel: false,
      instructionsPanel: '#instructions',
      modelSearchPanel: '#modelSearchPanel',
      instructionsHtml:
        'Left click = Orbit view<br>' +
        'Right click = Pan view<br>' +
        'Mouse wheel = Zoom view<br>' +
        'R = Reset camera'
    };
    params = _.defaults(Object.create(null), params, defaults);
    this.urlParams = _.getUrlParams();
    this.init(params);
  }

  onModelLoad(modelInstance) {
    // To be overriden by inheriting children
  }

  initPanels(params) {
    // To be overriden by inheriting children
  }

  init(params) {
    this.container = params.container;
    this.assetManager = new AssetManager({
      autoAlignModels: true,
      autoScaleModels: true,
      supportArticulated: params.supportArticulated
    });

    params.assetManager = this.assetManager;
    params.onModelLoadCallback = this.onModelLoad.bind(this);
    this.singleModelCanvas = new SingleModelCanvas(params);

    this.modelSearchController = new SearchController({
      searchSucceededCallback: this.searchSucceeded.bind(this),
      getImagePreviewUrlCallback: this.assetManager.getImagePreviewUrl.bind(this.assetManager),
      onClickResultCallback: this.singleModelCanvas.loadModel.bind(this.singleModelCanvas),
      restrictModelSources: true,
      loadImagesLazy: true,
      searchPanel: params.modelSearchPanel? $(params.modelSearchPanel): null
    });
    this.assetManager.setSearchController(this.modelSearchController);
    this.assetManager.watchDynamicAssets(this.singleModelCanvas, 'dynamicAssets');

    const instructions = params.instructionsPanel? $(params.instructionsPanel) : null;
    if (instructions) {
      instructions.html(params.instructionsHtml);
    }
    $(document).keydown(this.keyHandler.bind(this));
    if (!params.skipLoadInitialModel) {
      this.loadInitialModel();
    }
    this.initPanels(params);
    window.addEventListener('resize', this.onWindowResize.bind(this), false);
  }

  registerCustomAssets(assetFiles) {
    var scope = this;
    var p = new Promise(
      function(resolve, reject) {
        // Setup assetGroups
        if (assetFiles) {
          scope.assetManager.registerCustomAssetGroups({
            assetFiles: assetFiles,
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
  }

  loadInitialModel() {
    const params = _.getUrlParams();
    const modelId = params['modelId'] || params['fullId'];
    const autoRotate = params['autoRotate'];
    this.showModel(modelId, autoRotate);
  }

  showModel(modelId, autoRotate) {
    console.log('modelId=' + modelId + ', autoRotate=' + autoRotate);
    if (modelId) {
      const hasSearchTextBox = this.modelSearchController.setSearchText('fullId:' + modelId);
      if (hasSearchTextBox) {
        this.modelSearchController.startSearch();
      } else {
        var modelInfo = this.assetManager.getLoadModelInfo(null, modelId);
        this.singleModelCanvas.clearAndLoadModel(modelInfo);
      }
    }
    if (autoRotate) {
      this.singleModelCanvas.controls.setAutoRotate(autoRotate);
    }
  }

  onWindowResize() {
    this.modelSearchController.onResize();
  }

  searchSucceeded(source, resultList) {
    this.assetManager.cacheModelInfos(source, resultList);
    const sourceType = this.assetManager.getSourceDataType(source);
    if (sourceType === 'model') {
      // Pick top choice and load it!
      if (resultList.length > 0) {
        this.modelSearchController.searchPanel.selectOnPage(this.modelSearchController.searchPanel.curStart);
      }
    }
  }

  redisplay() {
    this.singleModelCanvas.redisplay();
  }

  keyHandler(event) {
    const tagName = (event.target || event.srcElement).tagName;
    if (tagName === 'INPUT' || tagName === 'SELECT' || tagName === 'TEXTAREA') {
      return true;
    }
    switch (String.fromCharCode(event.which)) {
      case 'R': {
        this.singleModelCanvas.controls.restoreCameraState();
        return false;
      }
      default: {
        return true;
      }
    }
  }
}

// Exports
module.exports = SimpleModelViewer;
