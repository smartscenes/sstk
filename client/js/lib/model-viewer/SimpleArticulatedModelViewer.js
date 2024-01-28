const SimpleModelViewer = require('model-viewer/SimpleModelViewerWithControls');
const ArticulationsPanel = require('articulations/ui/ArticulationsPanel');
const Object3DUtil = require('geo/Object3DUtil');
const UIUtil = require('ui/UIUtil');
const _ = require('util/util');

class SimpleArticulatedModelViewer extends SimpleModelViewer {
  constructor(params) {
    const defaults = {
      supportArticulated: true,
      articulationsPanel: '#articulationsPanel'
    };
    params = _.defaults(Object.create(null), params, defaults);
    super(params);
  }

  onModelLoad(modelInstance) {
    super.onModelLoad(modelInstance);
    this.singleModelCanvas.debugNode.add(this.widgetsVizNode);
    this.initArticulationPlayer(modelInstance);
  }

  initArticulationPlayer(modelInstance) {
    modelInstance.object3D.updateMatrixWorld();
    Object3DUtil.setMatrix(this.widgetsVizNode, modelInstance.getOriginalModelToWorld());
    if (this.articulationsPanel) {
      const nArticulations = this.articulationsPanel.init(modelInstance.object3D);
      if (nArticulations === 0) {
        UIUtil.showAlert({ message: 'Model is not articulated', style: 'alert-warning', overlay: true });
      }
    } else {
      const capabilities = modelInstance.queryCapabilities(this.assetManager);
      console.log('capabilities', capabilities);
      if (capabilities.articulation) {
        const cap = capabilities.articulation;
        cap.selectArticulation(0);
        cap.play();
      } else {
        UIUtil.showAlert({ message: 'Model is not articulated', style: 'alert-warning', overlay: true });
      }
    }
  }

  initPanels(params) {
    super.initPanels(params);
    const articulationsPanel = (params.articulationsPanel)? $(params.articulationsPanel) : null;
    if (articulationsPanel && articulationsPanel.length > 0) {
      const widgetsVizNode = new THREE.Group();
      widgetsVizNode.name = 'widgetsVizNode';
      this.widgetsVizNode = widgetsVizNode;
      this.articulationsPanel = new ArticulationsPanel({
        container: articulationsPanel,
        vizNode: widgetsVizNode,
        assetManager: this.assetManager
      });
    }
  }
}

module.exports = SimpleArticulatedModelViewer;
