const SimpleModelViewer = require('model-viewer/SimpleModelViewer');
const PartsPanel = require('ui/PartsPanel');
const AnnotationsPanel = require('ui/AnnotationsPanel');
const ImagesPanel = require('ui/ImagesPanel');
const _ = require('util/util');

class SimpleModelViewerWithControls extends SimpleModelViewer {
  constructor(params) {
    const defaults = {
      partsPanel: '#partsPanel',
      imagesPanel: '#imagesPanel',
      annotationsPanel: {
        container: '#annotationsPanel',
        readOnlyAttributes: [
          'fullId', 'name', 'description', 'tags', 'wnlemmas',
          'category', 'color', 'material', 'shape', 'depicts',
          'state', 'usedFor', 'foundIn', 'hasPart', 'attr', 'isSingleCleanObject',
          'hasMultipleObjects', 'isCollection', 'isContainerLike', 'weight',
          'volume', 'solidVolume', 'surfaceVolume', 'staticFrictionForce'
        /*, "aligned.dims" */]
      }
    };
    // Note: _.defaultsDeep will copy all array values... not desirable
    params = _.defaults(Object.create(null), params, defaults);
    super(params);
  }

  onModelLoad(modelInstance) {
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
  }

  initPanels(params) {
    const partsPanel = params.partsPanel? $(params.partsPanel) : null;
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
    const annotationsPanel = params.annotationsPanel? $(params.annotationsPanel.container) : null;
    if (annotationsPanel && annotationsPanel.length > 0) {
      const modelAttributes = [];
      const readOnlyAttributes = params.annotationsPanel.readOnlyAttributes;
      this.annotationsPanel = new AnnotationsPanel({
        container: annotationsPanel,
        hideEmptyFields: true,
        attributes: modelAttributes,
        attributesReadOnly: readOnlyAttributes,
        searchController: this.modelSearchController
      });
    }

    const imagesPanel = params.imagesPanel? $(params.imagesPanel) : null;
    if (imagesPanel && imagesPanel.length > 0) {
      this.modelImagesPanel = new ImagesPanel({
        container: imagesPanel
      });
    }
  }

  keyHandler(event) {
    if (super.keyHandler(event) === false) {
      return false;
    }
    let partOffset = null;
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
  }
}

// Exports
module.exports = SimpleModelViewerWithControls;
