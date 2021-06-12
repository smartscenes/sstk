'use strict';

define(['model-viewer/SimpleModelViewer', 'ui/PartsPanel', 'ui/AnnotationsPanel', 'ui/ImagesPanel'],
function (SimpleModelViewer, PartsPanel, AnnotationsPanel, ImagesPanel) {

  function SimpleModelViewerWithControls(container) {
    SimpleModelViewer.call(this, container);
    this.initPanels();
  }
  SimpleModelViewerWithControls.prototype = Object.create(SimpleModelViewer.prototype);
  SimpleModelViewerWithControls.prototype.constructor = SimpleModelViewerWithControls;

  SimpleModelViewerWithControls.prototype.onModelLoad = function (modelInstance) {
    if (this.partsPanel) {
      this.partsPanel.setTarget(modelInstance);
    }
    if (this.annotationsPanel) {
      this.annotationsPanel.setTarget(modelInstance);
    }
    if (this.modelImagesPanel) {
      if (modelInstance.model.info.fullId) {
        var urls = this.assetManager.getAllImageUrls(modelInstance.model.info.source, modelInstance.model.info.id, modelInstance.model.info);
        this.modelImagesPanel.setImageUrls(modelInstance.model.info.fullId, urls);
      } else {
        this.modelImagesPanel.setImageUrls('', []);
      }
    }
  };

  SimpleModelViewerWithControls.prototype.initPanels = function () {
    var partsPanel = $('#partsPanel');
    if (partsPanel && partsPanel.length > 0) {
      this.partsPanel = new PartsPanel({
        app: this,
        container: partsPanel,
        meshHierarchy: {
          filterEmptyGeometries: true,
          showMultiMaterial: true,
          collapseNestedPaths: true
        },
        getDebugNode: function () {
          return this.singleModelCanvas.debugNode;
        }.bind(this),
        showNodeCallback: function (node) {
          this.singleModelCanvas.debugNode.add(node);
        }.bind(this)
      });
    }
    var annotationsPanel = $('#annotationsPanel');
    if (annotationsPanel && annotationsPanel.length > 0) {
      var modelAttributes = [ ];
      var readOnlyAttributes = [
        'fullId', 'name', 'description', 'tags', 'wnlemmas',
        'category', 'color', 'material', 'shape', 'depicts',
        'state', 'usedFor', 'foundIn', 'hasPart', 'attr', 'isSingleCleanObject',
        'hasMultipleObjects', 'isCollection', 'isContainerLike', 'weight',
        'volume', 'solidVolume', 'surfaceVolume', 'staticFrictionForce'
        /*, "aligned.dims" */
      ];
      this.annotationsPanel = new AnnotationsPanel({
        container: annotationsPanel,
        hideEmptyFields: true,
        attributes: modelAttributes,
        attributesReadOnly: readOnlyAttributes,
        searchController: this.modelSearchController
      });
    }

    var imagesPanel = $('#imagesPanel');
    if (imagesPanel && imagesPanel.length > 0) {
      this.modelImagesPanel = new ImagesPanel({
        container: imagesPanel
      });
    }
  };

  SimpleModelViewerWithControls.prototype.keyHandler = function (event) {
    if (SimpleModelViewer.prototype.keyHandler(event) === false) {
      return false;
    }
    var partOffset = null;
    switch (event.which) {
      case 33:  // on page up code
        partOffset = +1;
        break;
      case 34:  // on page down code
        partOffset = -1;
        break;
    }
    if (partOffset) {
      this.partsPanel.nextPart(partOffset, event.shiftKey);
      event.stopPropagation();
      event.preventDefault();
      return false;
    } else {
      return true;
    }
  };

  // Exports
  return SimpleModelViewerWithControls;
});
