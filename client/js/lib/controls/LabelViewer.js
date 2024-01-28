var Constants = require('Constants');
var CanvasUtil = require('ui/CanvasUtil');
var PubSub = require('PubSub');
var Opentip = require('opentip');

/**
 * Controls for viewing annotated labels on meshes
 * @param params Configuration parameters for LabelViewer
 * @param params.container Container in which to the LabelViewer will operate
 * @param [params.tooltipContainer=#main] [string] Container in which the tooltip will be shown
 * @param params.labeler {BaseLabeler} Labeler to use for labeling the parts
 * @param [params.selectMouseButton=Constants.LEFT_MOUSE_BTN] Which mouse button is used for selecting
 * @param [params.enabled=true]{boolean} Whether the viewing controls is enabled
 * @param [params.showHoverLabel=true]{boolean} Whether to show a tooltip indicating the label of the part hovered over
 * @constructor
 * @memberOf controls
 */
function LabelViewer(params) {
  PubSub.call(this);
  this.container = params.container;
  this.labeler = params.labeler;
  this.selectMouseButton = (params.selectMouseButton != undefined)? params.selectMouseButton : Constants.LEFT_MOUSE_BTN;
  this.enabled = (params.enabled != undefined)? params.enabled : true;
  this.showHoverLabel = (params.showHoverLabel != undefined)? params.showHoverLabel : true;
  this.tooltipContainer = $(params.tooltipContainer || '#main');

  // Mouse tip
  this.tooltip = new Opentip(this.tooltipContainer, {showOn: null});
}

LabelViewer.prototype = Object.create(PubSub.prototype);
LabelViewer.prototype.constructor = LabelViewer;

// Register event handlers for mouse and keyboard interaction
LabelViewer.prototype.registerEventListeners = function (domElement) {
  $(domElement).click( function(event) {
    if (!this.enabled) {
      return;
    }
    this.selectPart(event);
  }.bind(this));

  domElement.addEventListener('pointerdown', this.handleMouseDown.bind(this));
  domElement.addEventListener('pointermove', this.handleMouseMove.bind(this), false);
  domElement.addEventListener('pointerup', this.handleMouseUp.bind(this), false);
};

LabelViewer.prototype.setLabelInfo = function(labelInfo) {
  if (labelInfo && labelInfo.cssColor) {
    var str = CanvasUtil.getColoredArrowCursor(labelInfo.cssColor, 32);
    $('canvas').css('cursor', str);
  } else {
    $('canvas').css('cursor', 'initial');
  }
  if (this.labeler.highlightedPart) {  // Recolor highlighted part with current color
    this.labeler.highlightPart(this.labeler.highlightedPart, this.labeler.currentLabelInfo);
  }
};

LabelViewer.prototype.handleMouseDown = function (e) {
};

LabelViewer.prototype.handleMouseUp = function (e) {
};

LabelViewer.prototype.handleMouseMove = function (e) {
  //Can only color when enabled
  if (!this.enabled) {
    this.tooltip.deactivate();
    return;
  }

  var part = this.labeler.findPart(e);
  if (part) {
    if (part !== this.labeler.highlightedPart) {
      // Highlight the part that is currently hovered over
      var partLabelInfo = this.labeler.getLabelInfo(part);
      if (partLabelInfo) {
        this.labeler.highlightPart(part, partLabelInfo);
        if (this.showHoverLabel) {
          this.tooltip.activate();
          this.tooltip.setContent(partLabelInfo.name);
          this.tooltip.show();
        }
      } else {
        this.tooltip.prepareToHide();
      }
    }
  } else { //No mesh, clear the tooltip
    this.labeler.dehighlightPart();
    this.tooltip.deactivate();
  }
};

LabelViewer.prototype.handleMouseLeave = function (e) {
  this.labeler.dehighlightPart();
  this.tooltip.deactivate();
};

// Shows information about the part selected
LabelViewer.prototype.selectPart = function (event) {
  event.preventDefault();
  var part = this.labeler.findPart(event);
  if (part) {
    // Indicate what labels were given to this part
    console.log(part.userData);
  } else {
    console.log('No selectable part at this point');
  }
  return part;
};


module.exports = LabelViewer;