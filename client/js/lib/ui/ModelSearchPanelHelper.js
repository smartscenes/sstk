var Constants = require('Constants');
var AssetManager = require('assets/AssetManager');

function ModelSearchPanelHelper(params) {
  this.includeExtraAssets = params.includeExtraAssets;
  this.segmentType = params.segmentType;
  this.allowSearchScenes = params.allowSearchScenes;
  this.sceneSource = params.sceneSource;
}

ModelSearchPanelHelper.prototype.openModelViewer = function(fullId, targetWindow) {
  var extra = this.includeExtraAssets;
  window.open(`model-viewer?extra=${extra}&modelId=${fullId}`, targetWindow);
};

ModelSearchPanelHelper.prototype.addModelViewIcons = function (source, id, result, elem) {
  // TODO: Only add these buttons if this asset is a model
  var extra = this.includeExtraAssets;
  var fullId = AssetManager.toFullId(source, id);
  var detailsButton = $('<button class="btn btn-default btn-xs"><i class="glyphicon glyphicon-new-window"></i></button>');
  detailsButton.click(function() {
    window.open(`${Constants.baseUrl}/model-viewer?extra=${extra}&modelId=${fullId}&useDatGui&editHierarchy&view=parts`);
  });
  var scaleButton = $('<button class="btn btn-default btn-xs"><i class="glyphicon glyphicon-resize-horizontal"></i></button>');
  scaleButton.click(function() {
    window.open(`${Constants.baseUrl}/model-scaler?extra=${extra}&modelId=${fullId}`);
  });
  var segmentButton = $('<button class="btn btn-default btn-xs"><i class="glyphicon glyphicon-pencil"></i></button>');
  var segmentParams = '';
  if (this.segmentType) {
    segmentParams = `&segmentType=${this.segmentType}&useSegments`;
  }
  segmentButton.click(function() {
    window.open(`${Constants.baseUrl}/part-annotator-single?extra=${extra}${segmentParams}&useDatGui&&modelId=${fullId}`);
  });
  var buttons = $('<span></span>');
  buttons.append(detailsButton);
  buttons.append(scaleButton);
  buttons.append(segmentButton);
  if (this.allowSearchScenes) {
    var searchScenesButton = $('<button class="btn btn-default btn-xs"><i class="glyphicon glyphicon-search"></i></button>');
    var sceneSource = '';
    if (this.sceneSource) {
      sceneSource = `&source=${this.sceneSource}`;
    }
    searchScenesButton.click(function () {
//      window.open(`${Constants.baseUrl}/scene-viewer.html?extra=${extra}&query=modelIds:${id}${sceneSource}`);
      window.open(`${Constants.baseUrl}/scene-querier.html?initialQuery=modelIds:${id}`);
    });
    buttons.append(searchScenesButton);
  }
  elem.prepend(buttons);
};

module.exports = ModelSearchPanelHelper;
