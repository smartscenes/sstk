var Constants = require('Constants');
var AssetManager = require('assets/AssetManager');

function ModelSearchPanelHelper(params) {
  this.includeExtraAssets = params.includeExtraAssets;
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
    window.open(`${Constants.baseUrl}/model-viewer?extra=${extra}&modelId=${fullId}&editHierarchy&view=parts`);
  });
  var scaleButton = $('<button class="btn btn-default btn-xs"><i class="glyphicon glyphicon-resize-horizontal"></i></button>');
  scaleButton.click(function() {
    window.open(`${Constants.baseUrl}/model-scaler?extra=${extra}&modelId=${fullId}`);
  });
  var segmentButton = $('<button class="btn btn-default btn-xs"><i class="glyphicon glyphicon-pencil"></i></button>');
  segmentButton.click(function() {
    window.open(`${Constants.baseUrl}/part-annotator-single?extra=${extra}&modelId=${fullId}`);
  });
  var buttons = $('<span></span>');
  buttons.append(detailsButton);
  buttons.append(scaleButton);
  buttons.append(segmentButton);
  elem.prepend(buttons);
};

module.exports = ModelSearchPanelHelper;
