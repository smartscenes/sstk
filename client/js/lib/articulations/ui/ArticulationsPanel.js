const PlaySliderWidget = require('ui/widget/PlaySliderWidget');
const ArticulationPlayer = require('articulations/ArticulationPlayer');
const Object3DUtil = require('geo/Object3DUtil');
const _ = require('util/util');

class ArticulationsPanel {
  constructor(params) {
    this.container = params.container;
    this.assetManager = params.assetManager;
    this.vizNode = params.vizNode; // node to which to attach display radar/axis widgets
    this.rootOject3D = null;
    this.articulatedObjects = [];
    this.__widgets = null;
  }

  get articulations() {
    if (this.articulatedObjects) {
      return _.flatMap(x => x.articulations);
    }
  }

  get articulationStates() {
    if (this.articulatedObjects) {
      return _.flatMap(x => x.articulationStates);
    }
  }

  __appendArticulation(parent, artIndex, artObject, objectArtIndex, artState) {
    const div = $('<div></div>');
    const art = artState.articulation;
    const part = artState.part;
    console.log('part', part);
    const partName = ((part.label != null)? part.label: 'part') + '(' + part.pid + ')'
    div.append(`${partName}: ${art.type}`);
    const isWidgetVisible = !!this.vizNode;
    const animateArticulationWidget = new PlaySliderWidget({
      isWidgetVisible: isWidgetVisible,
      getLabel: (p) => {
        const v = art.proportionToValue(p/100);
        if (art.isRotation) {
          return (v * 180/Math.PI).toFixed(1);
        } else {
          return v.toFixed(3);
        }
      }
    });
    animateArticulationWidget.appendTo(div);
    animateArticulationWidget.bindEvents();
    const articulationPlayer = new ArticulationPlayer({
      articulatedObject: artObject,
      assetManager: this.assetManager,
      playWidget: animateArticulationWidget,
      vizNode: this.vizNode,
      articulationIndex: objectArtIndex
    });
    articulationPlayer.isDisplayWidgetsVisible = false;
    articulationPlayer.playWidget.isWidgetVisible = articulationPlayer.isDisplayWidgetsVisible;
    parent.append(div);
    return { articulationIndex: artIndex, widget: animateArticulationWidget, player: articulationPlayer };
  }

  init(object3D) {
    const nArticulations = this.setObject3D(object3D);
    return nArticulations;
  }

  setObject3D(object3D) {
    this.clear();
    this.rootOject3D = object3D;
    this.articulatedObjects = Object3DUtil.findTopMostNodes(object3D, x => x.isArticulated && x.articulations.length);
    if (this.articulatedObjects.length) {
      this.__widgets = [];
      let artIndex = 0;
      for (let objIndex = 0; objIndex < this.articulatedObjects.length; objIndex++) {
        const obj = this.articulatedObjects[objIndex];
        for (let objArtIndex = 0; objArtIndex < obj.articulations.length; objArtIndex++) {
          const widgets = this.__appendArticulation(this.container, artIndex, obj, objArtIndex, obj.articulationStates[objArtIndex]);
          this.__widgets.push(widgets);
          artIndex++;
        }
      }
      return artIndex;
    } else {
      //console.log('Model is not articulated');
      this.container.append('No articulations');
      return 0;
    }
  }

  getWidgetsForPart(partId) {
    if (this.__widgets) {
      for (let w of this.__widgets) {
        if (w.player.getActivePartId() === partId) {
          return w;
        }
      }
    }
  }

  getWidgets(artIndex) {
    if (this.__widgets) {
      return this.__widgets[artIndex];
    }
  }

  clear() {
    if (this.__widgets) {
      // Dispose of widgets
      for (let w of this.__widgets) {
        w.player.destroy(true);
      }
      this.__widgets = null;
    }
    this.container.empty();
  }
}

module.exports = ArticulationsPanel;