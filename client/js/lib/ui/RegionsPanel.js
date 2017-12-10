var UIUtil = require('ui/UIUtil');
var MeshHierarchyPanel = require('ui/MeshHierarchyPanel');

function RegionsPanel(params) {
  this.container = $(params.container);
  this.fileTypes = params.fileTypes;
  this.fileType = this.fileTypes[0];
  this.allowLocalLoading = (params.allowLocalLoading !== undefined)? params.allowLocalLoading : true;
  this.autoLoadDefault = (params.autoLoadDefault !== undefined)? params.autoLoadDefault : false;
  this.app = params.app;
}

RegionsPanel.prototype.loadAnnotations = function(file, fileType) {
  var app = this.app;
  if (app.hasAnnotations && app.hasAnnotations()) {
    bootbox.confirm('You have existing annotations.  Are you sure you want to use loaded annotations?', function(result) {
      if (result) {
        app.loadAnnotations(file, fileType);
      }
    });
  } else {
    app.loadAnnotations(file, fileType);
  }
};

RegionsPanel.prototype.setTarget = function(modelInstance) {
  this.modelInstance = modelInstance;
  if (this.modelInstance) {
    this.loadDefaultButton.removeClass('disabled');
  } else {
    this.loadDefaultButton.addClass('disabled');
  }
  this.meshHierarchy.clear();
  if (this.autoLoadDefault) {
    this.loadDefaultButton.click();
  }
};

RegionsPanel.prototype.init = function () {
  // Load from local button
  var scope = this;
  var loadingPanel = this.container;
  if (this.allowLocalLoading) {
    // Setup local loading
    var loadLocalInput = UIUtil.createFileInput({
      id: 'loadAnnotations', label: 'Load Annotations',
      loadFn: function (file, fileType) {
        scope.loadAnnotations(file, fileType);
      },
      allowMultiple: false,
      fileTypes: this.fileTypes
    });
    this.loadLocalInput = loadLocalInput;
    if (loadLocalInput.group) {
      loadingPanel.append(loadLocalInput.group);
    }
  }

  // Add button to load stored annotations
  var loadDefaultButton = $('<button></button>')
    .attr('class', 'btn btn-default')
    .attr('type', 'button')
    .attr('title', 'Load default regions').text('Show default regions');
  loadDefaultButton.click(function() {
    if (scope.modelInstance) {
      console.log(scope.modelInstance.model.info);
      if (scope.loadLocalInput && scope.loadLocalInput.fileTypes) {
        scope.fileType = loadLocalInput.fileTypes.val();
      }
      var fileType = scope.fileType;
      var filename = scope.modelInstance.model.info[fileType];
      if (filename && typeof filename !== 'string') {
        fileType = filename.assetType || fileType;
        filename = filename.path;
      }
      if (filename) {
        scope.loadAnnotations(filename, fileType);
      } else {
        UIUtil.showAlert(null, 'No ' + fileType + ' for model');
      }
    }
  });
  loadDefaultButton.addClass('disabled');
  loadingPanel.append(loadDefaultButton);
  this.loadDefaultButton = loadDefaultButton;
  // Set up regions
  var regionsPanel = $('<div></div>').addClass('regionTree').resizable(); // jquery ui
  var treePanel = $('<div></div>');
  regionsPanel.append(treePanel);
  loadingPanel.append(regionsPanel);
  this.meshHierarchy = new MeshHierarchyPanel({
    treePanel: treePanel,
    highlightByHidingOthers: true,
    app: this.app
  });
};

RegionsPanel.prototype.setRegions = function(partsNode) {
  this.meshHierarchy.setPartsNode(partsNode);
};

module.exports = RegionsPanel;