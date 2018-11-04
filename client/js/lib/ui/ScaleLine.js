'use strict';

define(['geo/Object3DUtil', 'Constants', 'util/util'],
function (Object3DUtil, Constants, _) {

  function ScaleLine(params) {
    // Callback on what to do on a resize
    this.resizeCallback = params.resizeCallback;
    this.refObjects = params.refObjects;
    this.useRefModelDims = params.useRefModelDims;
    this.init(params.container,params.sizeBy);
  }

  ScaleLine.prototype.init = function (container, sizeBy) {
    this.container = container;
    // Put an div in the container in which we will do everything
    // This is so the draggable arrow will be properly contained
    this.elem = $('<div></div>');
    this.container.append(this.elem);
    this.refObjectElems = {};

    // Size selection arrow div element
    this.arrowDiv = null;

    // Data structure holding size information for all elements in scaleLine
    this.refSizes = [];

    //this.loadImages();
    this.setSizeBy(sizeBy);
    window.addEventListener('resize', this.onResize.bind(this), false);

    // Information about selected size
    this.selected = {
      method: null,
      index: null,
      elem: null,
      size: null
    };

    this.doResizeCallback = true;
  };

  ScaleLine.prototype.getSelected = function () {
    return this.selected;
  };

  ScaleLine.prototype.loadImages = function () {
    if (this.refObjects) {
      for (var name in this.refObjects) {
        if (!this.refObjects.hasOwnProperty(name)) {
          continue;
        }
        var ref = this.refObjects[name];
        var imageSrc = Constants.scaleLineImageDir + name + '.svg';
        var img = new Image();
        img.src = imageSrc;
        ref.image = img;
      }
    }
  };

  ScaleLine.prototype.snapToMiddle = function (dragger, target) {
    //var topMove = target.position().top - dragger.data('position').top + (target.outerHeight(true) - dragger.outerHeight(true)) / 2;
    var s = this.container.scrollLeft();
    var leftMove = s + target.position().left - dragger.data('position').left  + (target.outerWidth(true) - dragger.outerWidth(true)) / 2 ;
    dragger.animate({/*top:topMove, */left: leftMove },{ duration: 600,easing: 'easeOutBack' });
  };

  ScaleLine.prototype.createArrow = function () {
    this.arrowDiv = $('<div class="scaleLineArrowDiv"></div>');
    var arrowImg = $('<img height="10" src="' + Constants.scaleLineImageDir + 'arrowDown.svg' + '" />');
    this.arrowDiv.append(arrowImg);
    this.elem.prepend(this.arrowDiv);

    var container = this.container;
    this.arrowDiv.draggable({
      containment: 'parent',
      create: function () {$(this).data('position',$(this).position());},
      axis: 'x',
      stack: '.refObject *',
      start: function (e, ui) {console.log('start ' + normalizedPositionInParent(container, $(this))); },
      drag: function (e, ui) {},
      stop: function (e, ui) {console.log('end ' + normalizedPositionInParent(container, $(this)));}
    });

    var scaleLine = this;
    this.elem.find('.refObject').droppable({
      drop: function (event, ui) {
        //                tolerance: "touch",
        scaleLine.snapToMiddle(ui.draggable,$(this));
        $(this).click();
      }
    });
    this.elem.find('.bar').droppable({
      //            tolerance: "touch",
      drop: function (event, ui) {
        scaleLine.snapToMiddle(ui.draggable,$(this));
        $(this).click();
      }
    });
  };

  ScaleLine.prototype.setSizeBy = function (sizeBy) {
    this.sizeBy = sizeBy;
    if (this.refObjects) {
      for (var name in this.refObjects) {
        if (!this.refObjects.hasOwnProperty(name)) {
          continue;
        }
        var ref = this.refObjects[name];
        var dims = (this.useRefModelDims) ? ref.modelInst.getPhysicalDims() : ref.dim;
        ref.name = name;
        ref.size = Object3DUtil.convertBbDimsToSize(dims, this.sizeBy);
      }
      this.refObjectKeys = Object.keys(this.refObjects);
      this.refObjectKeys.sort(_.dynamicCompareMap(this.refObjects, 'size'));
    }
    this.populate();
  };

  ScaleLine.prototype.findBracketingRefModels = function (rangeMin, rangeMax) {
    if (rangeMax === undefined) rangeMax = rangeMin;

    var refKeySmall, refKeyLarge;
    for (var i = 0; i < this.refObjectKeys.length; i++) {
      var key = this.refObjectKeys[i];
      var refObj = this.refObjects[key];
      if (refObj.size <= rangeMin) {
        refKeySmall = key;
      } else if (refObj.size > rangeMax) {
        refKeyLarge = key;
        break;
      }
    }
    return { min: refKeySmall, max: refKeyLarge };
  };

  ScaleLine.prototype.setSize = function (size, method) {
    var lastSize = null;
    var curSize = null;
    var i;
    for (i = 0; i < this.refSizes.length; i++) {
      curSize = this.refSizes[i];
      if (curSize.size > size) {
        break;
      }
      lastSize = curSize;
    }
    // Pick which of the curSize/lastSize is the closest
    if (lastSize) {
      if (Math.abs(lastSize.size - size) < Math.abs(curSize.size - size)) {
        // Pick previous size
        i--;
        curSize = lastSize;
      }
    }
    if (i >= this.refSizes.length) {
      i = this.refSizes.length - 1;
    }

    // Find element and pretend to click on it
    // Don't do resize callback though size our sizes may not be accurate
    this.doResizeCallback = false;
    var elem = $('#sl_' + i);
    elem.click();
    this.selected.size = size;
    this.selected.method = method;
    this.doResizeCallback = true;
  };

  ScaleLine.prototype.getRescaleCallback_ = function (size) {
    return this.resizeCallback.bind(this, size);
  };

  ScaleLine.prototype.populate = function () {
    var factor = this.elem.width() / 100;
    var ratio = factor / 13;
    var minDisplayHeight = ratio * 10;
    var maxDisplayHeight = ratio * 100;
    var refMinSize = 0.1; // 1 mm
    var refMaxSize = 1000;  // 10 m
    var minBars = 3;

    this.refSizes.length = 0;
    this.elem.empty();
    if (this.refObjects) {
      var prevRef = null;
      var prevDisplayHeight = minDisplayHeight;
      var index = 0;
      var nBars = 0;
      var barSizes = [];
      for (var i = 0; i < this.refObjectKeys.length; i++) {
        var name = this.refObjectKeys[i];
        var ref = this.refObjects[name];
        var displayHeight = Math.min(factor * Math.max(Math.log(ref.size),0) + minDisplayHeight, maxDisplayHeight);
        nBars = (prevRef) ? Math.round(Math.log(ref.size - prevRef.size) + minBars) : minBars;
        barSizes = this.getInterpolateSizes_(nBars, (prevRef) ? prevRef.size : refMinSize, ref.size);
        this.addBars(index, nBars, prevDisplayHeight, displayHeight, barSizes);
        this.addRefObject(index + nBars, name, name, name + '.svg', displayHeight, this.getRescaleCallback_(ref.size));

        for (var j = 0; j < nBars; j++) {
          this.refSizes[index] = {
            size: barSizes[j],
            id: ((prevRef) ? prevRef.name : '') + ':' + (j + 1) + '/' + nBars + ':' + name
          };
          index++;
        }
        this.refSizes[index] = {
          refObject: ref,
          id: name,
          size: ref.size
        };
        index++;

        prevDisplayHeight = displayHeight;
        prevRef = ref;
      }
      nBars = minBars;
      barSizes = this.getInterpolateSizes_(nBars, (prevRef) ? prevRef.size : refMinSize, refMaxSize);
      this.addBars(index, nBars, prevDisplayHeight, maxDisplayHeight, barSizes);
      for (var j = 0; j < nBars; j++) {
        this.refSizes[index] = {
          size: barSizes[j],
          id: ((prevRef) ? prevRef.name : '') + ':' + (j + 1) + '/' + nBars + ':'
        };
        index++;
      }
    }
    this.createArrow();
  };

  function normalizedPositionInParent(container, elem) {
    var parent = elem.parent();
    var myPos = elem.position();
    var s = container.scrollLeft();
    var normPos = { x: (myPos.left + s) / parent[0].scrollWidth, y: myPos.top / parent.height() };
    normPos.toString = function () {return '[' + this.x.toFixed(2) + ',' + this.y.toFixed(2) + ']';};
    return normPos;
  }

  ScaleLine.prototype.onResize = function () {
    this.populate();
  };

  ScaleLine.prototype.getInterpolateSizes_ = function (nSizes, startSize, endSize)  {
    var sfactor = Math.pow(endSize / startSize, 1 / (nSizes + 2));
    var curSize = startSize;
    var sizes = [];
    for (var j = 0; j < nSizes; j++) {
      curSize = curSize * sfactor;
      sizes[j] = curSize;
    }
    return sizes;
  };

  ScaleLine.prototype.addBars = function (index, nBars, startDisplayHeight, endDisplayHeight, sizes) {
    var delta = (endDisplayHeight - startDisplayHeight) / nBars;
    this.addSpacer();
    for (var i = 0; i < nBars; i++) {
      var displayHeight = startDisplayHeight + i * delta;
      var size = (sizes) ? sizes[i] : displayHeight;
      this.addBar(index, displayHeight, size.toFixed(2), this.getRescaleCallback_(size));
      this.addSpacer();
      index++;
    }
  };

  ScaleLine.prototype.addRefObject = function (index, name, tooltip, iconName, size, callback) {
    var dims = this.refObjects[name].dim;
    if (this.useRefModelDims) {
      var v = this.refObjects[name].modelInst.getPhysicalDims();
      dims = [v.x.toFixed(2), v.y.toFixed(2), v.z.toFixed(2)];
    }
    var refObject = $('<div class="refObject"></div>');
    refObject.attr('id', 'sl_' + index);
    refObject.attr('title', tooltip + ', dims: [' + dims + ']');
    refObject.append('<img height="' + size + '" src="' + Constants.scaleLineImageDir + iconName + '" />');
    refObject.prepend('<div align="center">' + this.refObjects[name].size.toFixed(2) + '</div>');

    // Click callback
    var scaleLine = this;
    refObject.click(function (event) {
      if (!refObject.hasClass('disabled')) {
        scaleLine.selected.method = 'scaleline';
        scaleLine.selected.elem = $(this);
        scaleLine.selected.index = index;
        scaleLine.selected.size = null;
        if (index) {
          scaleLine.selected.pickedRef = scaleLine.refSizes[index];
        }
        scaleLine.snapToMiddle(scaleLine.arrowDiv, $(this));
        if (scaleLine.doResizeCallback && callback) {
          callback(event);
        } else {
          console.log('clicked ' + event.target);
        }
      }
    });

    this.elem.append(refObject);
    this.refObjectElems[name] = refObject;
  };

  ScaleLine.prototype.addSpacer = function () {
    this.elem.append($('<div class="spacer"></div>'));
  };

  ScaleLine.prototype.addBar = function (index, size, tooltip, callback) {
    var barDiv = $('<div class="bar"></div>').css('height', size + 'px');
    barDiv.attr('title', tooltip);
    barDiv.attr('id', 'sl_' + index);
    this.elem.append(barDiv);
    // Click callback
    var scaleLine = this;
    barDiv.click(function (event) {
      if (!barDiv.hasClass('disabled')) {
        scaleLine.selected.method = 'scaleline';
        scaleLine.selected.elem = $(this);
        scaleLine.selected.index = index;
        scaleLine.selected.size = null;
        if (index) {
          scaleLine.selected.pickedRef = scaleLine.refSizes[index];
        }
        scaleLine.snapToMiddle(scaleLine.arrowDiv, $(this));
        if (scaleLine.doResizeCallback && callback) {
          callback(event);
        } else {
          console.log('clicked ' + event.target);
        }
      }
    });
  };

  ScaleLine.prototype.hide = function () {
    this.elem.hide();
  };

  ScaleLine.prototype.show = function () {
    this.elem.show();
  };

  // Exports
  return ScaleLine;

});
