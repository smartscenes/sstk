var Constants = require('Constants');
var CanvasUtil = require('ui/CanvasUtil');
var PubSub = require('PubSub');
var Opentip = require('opentip');

var MODE_NONE = 0;
var MODE_PAINT = 1;
var MODE_ERASE = 2;
var MODE_PICK = 3;

/**
 * Controls for painting labels on meshes by clicking or dragging over parts of the mesh.
 * @param params Configuration parameters for LabelPainter
 * @param params.container Container in which the LabelPainter will operate
 * @param [params.tooltipContainer=#main] [string] Container in which the tooltip will be shown
 * @param params.labeler {BasePartLabeler} Labeler to use for labeling the parts
 * @param [params.selectMouseButton=Constants.LEFT_MOUSE_BTN] Which mouse button is used for painting
 * @param [params.enabled=true]{boolean} Whether the painting controls is enabled
 * @param [params.showPaintLabel=true]{boolean} Whether to show a tooltip indicating the label that will be used for painting
 * @param [params.showHoverLabel=true]{boolean} Whether to show a tooltip indicating the label of the part hovered over
 * @param [params.restrictPaintToFirstSelectedObject=false]{boolean} In drag mode, whether to allow painting of same object as original selection
 * @param [params.eraseMat]{THREE.Material} Material to use when label is erased
 * @constructor
 * @memberOf controls
 */
function LabelPainter(params) {
  PubSub.call(this);
  this.container = params.container;
  this.labeler = params.labeler;
  this.selectMouseButton = (params.selectMouseButton != undefined) ? params.selectMouseButton : Constants.LEFT_MOUSE_BTN;
  this.enabled = (params.enabled != undefined) ? params.enabled : true;
  this.showPaintLabel = (params.showPaintLabel != undefined) ? params.showPaintLabel : true;
  this.showHoverLabel = (params.showHoverLabel != undefined) ? params.showHoverLabel : true;
  this.restrictPaintToFirstSelectedObject = (params.restrictPaintToFirstSelectedObject != undefined) ? params.restrictPaintToFirstSelectedObject : false;
  this.tooltipContainer = $(params.tooltipContainer || '#main');
  this.eraseMat = params.eraseMat;

  // Mouse tips
  // Label of hovered area
  this.tooltip = new Opentip(this.tooltipContainer, { showOn: null });
  // Label of selected label that we plan to use to paint
  this.mouseTooltipSpan = $('#mouseToolTip');
  if (!this.showPaintLabel) {
    this.mouseTooltipSpan.hide();
  }
  this.cursors = [];
  this.__defaultPaintCursor = 'url(' + Constants.imagesDir + 'paint.cur' + '), auto';
  this.cursors[MODE_NONE] = 'auto';
  this.cursors[MODE_PAINT] = this.__defaultPaintCursor;
  this.cursors[MODE_ERASE] = //'url(' + Constants.imagesDir + 'eraser.png' + ') 5 5, ' +
    'url(' + Constants.imagesDir + 'eraser.cur' + '), auto';
  this.cursors[MODE_PICK] = //'url(' + Constants.imagesDir + 'picker.png' + ') 0 32, ' +
    'url(' + Constants.imagesDir + 'picker.cur' + '), auto';

  // Internal state
  this.__isMouseDown = false;
  this.__isDragging = false;
  this.__isMouseDownAny = false;  // some mouse button is down
  this.__firstSelectedPart = null;
  this.__firstSelectedLabel = null;
  this.__editStarted = false;
  this.__paintMode = MODE_NONE;
  this.__mouseClickTimeout = 0;  // max time to wait for dblclick (higher makes click lag)
}

LabelPainter.prototype = Object.create(PubSub.prototype);
LabelPainter.prototype.constructor = LabelPainter;

Object.defineProperty(LabelPainter.prototype, 'isMouseDown', {
  get: function () { return this.__isMouseDown; }
});

/**
 * Register event handlers for mouse and keyboard interaction
 * @function
 */
LabelPainter.prototype.registerEventListeners = function (domElement) {
  var scope = this;
  $(domElement).hover(
    function () {
      if (scope.showPaintLabel) {
        scope.mouseTooltipSpan.show();
      }
    },
    function () {
      scope.mouseTooltipSpan.hide();
    }
  );

  domElement.addEventListener('pointerdown', this.handleMouseDown.bind(this));
  domElement.addEventListener('pointermove', this.handleMouseMove.bind(this), false);
  document.addEventListener('pointerup', this.handleMouseUp.bind(this), false);
  domElement.addEventListener('pointerleave', this.handleMouseLeave.bind(this), false);
};

LabelPainter.prototype.setLabelInfo = function (labelInfo) {
  var name = (labelInfo) ? labelInfo.name : '';
  if (labelInfo && labelInfo.cssColor) {
    this.cursors[MODE_PAINT] = CanvasUtil.getColoredArrowCursor(labelInfo.cssColor, 32, this.__defaultPaintCursor);
  } else {
    this.cursors[MODE_PAINT] = this.__defaultPaintCursor;
  }
  this.__updateCursor();
  this.mouseTooltipSpan.text(name);
  if (this.labeler.highlightedPart) {  // Recolor highlighted part with current color
    this.labeler.highlightPart(this.labeler.highlightedPart, this.labeler.currentLabelInfo);
  }
};

LabelPainter.prototype.updateTooltip = function(labelInfo) {
  if (labelInfo === this.labeler.currentLabelInfo) {
    this.mouseTooltipSpan.text(labelInfo.name);
  }
};

LabelPainter.prototype.__updateCursor = function () {
  $('canvas').css('cursor', this.cursors[this.__paintMode]);
};

LabelPainter.prototype.handleMouseDown = function (e) {
  var scope = this;
  if (this.__mouseClickTimeout) {
    this.__pressTimer = setTimeout(function () {
      scope.__handleMouseDown(e);
    }, scope.__mouseClickTimeout);
  } else {
    scope.__handleMouseDown(e);
  }
};

LabelPainter.prototype.__handleMouseDown = function (e) {
  if (!this.enabled)
    return;
  this.__isDragging = false;
  //Left mouse button is down
  if (e.which === this.selectMouseButton) {
    this.__isMouseDown = true;
    var part = this.labeler.findLabelablePart(e);
    if (part) {
      var labelInfo = this.labeler.getLabelInfo(part);
      this.__firstSelectedPart = part;
      this.__firstSelectedLabel = labelInfo;
    }
  }
  this.__isMouseDownAny = true;
};

LabelPainter.prototype.handleMouseUp = function (e) {
  if (this.__pressTimer) {
    clearTimeout(this.__pressTimer);
    this.__pressTimer = null;
  }

  this.__firstSelectedPart = null;
  var wasDragging = this.__isDragging;
  var wasMouseDown = this.__isMouseDown;

  if (this.__editStarted) {
    this.__editStarted = false;
    this.Publish(Constants.EDIT_OPSTATE.DONE, 'paint', { paintMode: this.__paintMode });
  }

  if (wasMouseDown && e.which === this.selectMouseButton) {
    //Part was clicked on
    if ((this.__paintMode === MODE_PICK || !wasDragging) && this.enabled) {
      this.selectPart(e, false);
    }
  }

  this.__isMouseDownAny = false;
  this.__isMouseDown = false;
  this.__isDragging = false;
  this.__firstSelectedPart = null;
  this.__firstSelectedLabel = null;
};

LabelPainter.prototype.handleMouseLeave = function (e) {
  this.labeler.dehighlightPart();
  this.tooltip.prepareToHide();
  this.tooltip.deactivate();
};

LabelPainter.prototype.handleMouseMove = function (e) {
  //Can only color when enabled
  if (!this.enabled) {
    this.tooltip.deactivate();
    return;
  }

  // Set position of mouse tooltip
  var rect = this.container.getBoundingClientRect();
  this.mouseTooltipSpan.css({
    //bottom: (rect.bottom - e.clientY) + 'px',
    //right: (rect.right - e.clientX) + 'px'
    top: (e.clientY - rect.top + 30) + 'px',
    left: (e.clientX - rect.left + 30) + 'px'
  });
  this.__lastMousePosition = {clientX: e.clientX, clientY: e.clientY};

  var overPart = this.labeler.findPart(this.__lastMousePosition);
  var partStatus = this.labeler.getPartStatus(overPart);
  var partToLabel = partStatus.isLabelable? overPart : undefined;
  var paintMode = this.__getPaintMode(partToLabel, e);
  var part = (paintMode === MODE_PICK)? overPart : partToLabel;
  // When dragging, keep same cursor as before...
  if (!this.__isDragging && this.__paintMode !== paintMode) {
    this.__paintMode = paintMode;
    this.__updateCursor();
  }
  if (this.__isMouseDown) {  // User is dragging the mouse -> select or deselect or parts touched
    this.__isDragging = true;

    if (partToLabel) {
      if (!this.__editStarted) {
        this.__editStarted = true;
        this.Publish(Constants.EDIT_OPSTATE.INIT, 'paint', { paintMode: this.__paintMode });
      }
      if (paintMode === MODE_PAINT) {
        this.labeler.labelPart(part, this.labeler.currentLabelInfo);
        this.Publish('LabelPart', part, this.labeler.currentLabelInfo);
        this.Publish('PartChanged', part);
      } else if (paintMode === MODE_ERASE) {
        this.Publish('UnlabelPart', part);
        this.labeler.unlabelPart(part);
        this.Publish('PartChanged', part);
      }
    }
    this.tooltip.prepareToHide();
    this.tooltip.deactivate();
  } else {  // User not dragging mouse, simply highlight the parts
    if (part) {
      if (paintMode === MODE_PICK) {
      } else {
        if (part !== this.labeler.highlightedPart) {
          // Highlight the part that is currently hovered over
          var partLabelInfo = this.labeler.getLabelInfo(part);
          var highlightMat = (paintMode === MODE_ERASE)?
            ((partLabelInfo && partLabelInfo.eraseMat)? partLabelInfo.eraseMat : this.eraseMat)
            : null;
          this.labeler.highlightPart(part, this.labeler.currentLabelInfo, highlightMat);
        }
      }
    } else {
      this.labeler.dehighlightPart();
    }
    if (overPart) {
      var partLabelInfo = this.labeler.getLabelInfo(overPart);
      if (partLabelInfo) {
        if (this.showHoverLabel) {
          var text = partLabelInfo.name;
          if (partLabelInfo.frozen || partLabelInfo.fixed) {
            text = text + '*';
          }
          this.tooltip.activate();
          this.tooltip.setContent(text);
          this.tooltip.show();
        }
      } else {
        this.tooltip.prepareToHide();
        this.tooltip.deactivate();
      }
    } else { //No part, clear the tooltip
      this.tooltip.prepareToHide();
      this.tooltip.deactivate();
    }
  }
};

LabelPainter.prototype.__getPaintMode = function (part, event) {
  if (event.ctrlKey || event.metaKey) {
    return MODE_PICK;
  }

  if (part) {
    // Identify if we should be in PAINT or ERASE mode
    // drag and coloring: check the label of the first selected label
    // hovering: check the label of the current part
    var partLabelInfo = this.labeler.getLabelInfo(part);
    var selectedLabel = (this.__isMouseDown) ? this.__firstSelectedLabel : partLabelInfo;
    if (this.__isMouseDown) {
      // Mouse was not originally pressed down on a selectable mesh or
      // not in paint mode
      if (!this.__firstSelectedPart || !this.labeler.currentLabelInfo) {
        return MODE_NONE;
      }
      if (this.restrictPaintToFirstSelectedObject) {
        if (this.__firstSelectedPart.object !== part.object) {
          return MODE_NONE;
        }
      }
    } else if (this.__isMouseDownAny) {
      // Some key is down... not sure what
      return MODE_NONE;
    }

    if (event.shiftKey) {
      return MODE_ERASE;
    } else {
      var recolor = selectedLabel && selectedLabel !== this.labeler.currentLabelInfo;
      if (recolor || (!selectedLabel && !partLabelInfo)) {
        return MODE_PAINT;
      } else {
        return MODE_NONE;
      }
    }
  }
  return MODE_NONE;
};

// NOTE: Auto-erase behavior toggles between erase and paint depending on clicked part state
LabelPainter.prototype.__getPaintModeAutoErase = function (part, event) {
  if (event.ctrlKey || event.metaKey) {
    return MODE_PICK;
  }

  if (part) {
    // Identify if we should be in PAINT or ERASE mode
    // drag and coloring: check the label of the first selected label
    // hovering: check the label of the current part
    var partLabelInfo = this.labeler.getLabelInfo(part);
    var selectedLabel = (this.__isMouseDown) ? this.__firstSelectedLabel : partLabelInfo;
    if (this.__isMouseDown) {
      // Mouse was not originally pressed down on a selectable mesh or
      // not in paint mode
      if (!this.__firstSelectedPart || !this.labeler.currentLabelInfo) {
        return MODE_NONE;
      }
      if (this.restrictPaintToFirstSelectedObject) {
        if (this.__firstSelectedPart.object !== part.object) {
          return MODE_NONE;
        }
      }
    }

    var recolor = selectedLabel && selectedLabel !== this.labeler.currentLabelInfo;
    if (recolor || (!selectedLabel && !partLabelInfo)) {
      return MODE_PAINT;
    } else if (selectedLabel && partLabelInfo) {
      return MODE_ERASE;
    } else {
      return MODE_NONE;
    }
  }
  return MODE_NONE;
};

//Paints the selected part of the model
//De-colors it if it is already the current color
//If not in paint mode, displays error msg and returns false
LabelPainter.prototype.selectPart = function (event) {
  event.preventDefault();
  if (this.__paintMode === MODE_PICK) {
    // Pick mode
    var part = this.labeler.findPart(event);
    if (part) {
      this.Publish('SelectPart', part);
    }
  } else {
    var part = this.labeler.findLabelablePart(event);
    if (part) {
      if (!this.labeler.currentLabelInfo) { // no button has been pressed
        this.Publish('LabelPart', part, null);
        return false;
      }
      this.Publish(Constants.EDIT_OPSTATE.INIT, 'paint', { paintMode: this.__paintMode });
      var labelInfo = this.labeler.getLabelInfo(part);
      if (labelInfo && labelInfo === this.labeler.currentLabelInfo && event.shiftKey) {
        console.log('unlabeling the part');
        this.Publish('UnlabelPart', part);
        this.labeler.unlabelPart(part);
        this.Publish('PartChanged', part);
      } else { //not colored with current part
        console.log('Labeling the part');
        this.labeler.labelPart(part, this.labeler.currentLabelInfo);
        this.Publish('LabelPart', part, this.labeler.currentLabelInfo);
        this.Publish('PartChanged', part);
      }
      this.Publish(Constants.EDIT_OPSTATE.DONE, 'paint', { paintMode: this.__paintMode });
    } else {
      console.log('No selectable part at this point');
    }
  }
};

LabelPainter.prototype.getLastMousePosition = function() {
  return this.__lastMousePosition;
};

module.exports = LabelPainter;
