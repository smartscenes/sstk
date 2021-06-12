'use strict';

define(['model-viewer/SingleModelCanvas', 'assets/AssetManager', 'search/SearchController', 'util/util', 'jquery-lazy'],
function (SingleModelCanvas, AssetManager, SearchController, _) {

  function SimpleModelViewer(params) {
    params = (params instanceof Element) ? { container: params } : params;
    this.init(params);
  }
  SimpleModelViewer.prototype.constructor = SimpleModelViewer;

  SimpleModelViewer.prototype.onModelLoad = function (modelInstance) {
    // To be overriden by inheriting children
  };

  SimpleModelViewer.prototype.init = function (params) {
    this.container = params.container;
    this.assetManager = new AssetManager({
      autoAlignModels: true,
      autoScaleModels: true,
      useBuffers: true
    });

    params.assetManager = this.assetManager;
    params.onModelLoadCallback = this.onModelLoad.bind(this);
    this.singleModelCanvas = new SingleModelCanvas(params);

    this.modelSearchController = new SearchController({
      searchSucceededCallback: this.searchSucceeded.bind(this),
      getImagePreviewUrlCallback: this.assetManager.getImagePreviewUrl.bind(this.assetManager),
      onClickResultCallback: this.singleModelCanvas.loadModel.bind(this.singleModelCanvas),
      sources: ['models3d', 'wss', 'archive3d'],
      restrictModelSources: true,
      loadImagesLazy: true,
      searchPanel: $('#modelSearchPanel')
    });
    this.assetManager.setSearchController(this.modelSearchController);

    var instructions = $('#instructions');
    if (instructions) {
      instructions.html(
        'Left click = Orbit view<br>' +
        'Right click = Pan view<br>' +
        'Mouse wheel = Zoom view<br>' +
        'R = Reset camera'
      );
    }
    $(document).keydown(this.keyHandler.bind(this));
    this.handleUrlParams();
    window.addEventListener('resize', this.onWindowResize.bind(this), false);
  };

  SimpleModelViewer.prototype.handleUrlParams = function () {
    var params = _.getUrlParams();
    var modelId = params['modelId'];
    var autoRotate = params['autoRotate'];
    this.showModel(modelId, autoRotate);
  };

  SimpleModelViewer.prototype.showModel = function(modelId, autoRotate) {
    console.log('modelId=' + modelId + ', autoRotate=' + autoRotate);
    if (modelId) {
      var hasSearchTextBox = this.modelSearchController.setSearchText('fullId:' + modelId);
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
  };

  SimpleModelViewer.prototype.onWindowResize = function () {
    this.modelSearchController.onResize();
  };

  SimpleModelViewer.prototype.searchSucceeded = function (source, resultList) {
    this.assetManager.cacheModelInfos(source, resultList);
    var sourceType = this.assetManager.getSourceDataType(source);
    if (sourceType === 'model') {
      // Pick top choice and load it!
      if (resultList.length > 0) {
        this.modelSearchController.searchPanel.selectOnPage(this.modelSearchController.searchPanel.curStart);
      }
    }
  };

  SimpleModelViewer.prototype.redisplay = function () {
    this.singleModelCanvas.redisplay();
  };

  SimpleModelViewer.prototype.keyHandler = function (event) {
    var tagName = (event.target || event.srcElement).tagName;
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
  };

  // Exports
  return SimpleModelViewer;

});
