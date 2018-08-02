'use strict';

var Picker = require('controls/Picker');
var PubSub = require('PubSub');

/**
 * Controls for highlighting objects
 * @param params
 * @constructor
 * @memberOf controls
 */
var HighlightControls = function (params) {
  PubSub.call(this);
  this.container = params.container;
  this.picker = params.picker;
  this.camera = params.camera;
  this.scene = params.scene;
  this.acceptCallback = params.acceptCallback;
  this.highlightCallback = params.highlightCallback;
  this.intersected = null;
};

HighlightControls.prototype = Object.create(PubSub.prototype);
HighlightControls.prototype.constructor = HighlightControls;

HighlightControls.prototype.onMouseMove = function (event) {
  // Highlight model on mouseover
  var pickables = (this.scene.pickables) ? this.scene.pickables : this.scene.children;
  var intersected = this.picker.pick({
    targetType: 'object',
    container: this.container,
    position: { clientX: event.clientX, clientY: event.clientY },
    camera: this.camera,
    objects: pickables,
    scene: this.scene
  });
  //return intersects;

  //this.mouse = this.picker.getCoordinates(this.container, event);
  //var intersected = this.picker.getFirstIntersected(this.mouse.x, this.mouse.y, this.camera, pickables);

  if (intersected) {
    if (this.intersected !== intersected.object) {
      this.unhighlight(this.intersected);
    }
    if (this.accept(intersected)) {
      this.intersected = intersected.object;
      this.highlight(this.intersected);
    } else {
      this.intersected = null;
    }
  } else {
    this.unhighlight(this.intersected);
    this.intersected = null;
  }
};

HighlightControls.prototype.onMouseLeave = function (event) {
  this.clear();
};

HighlightControls.prototype.clear = function () {
  if (this.intersected) {
    this.unhighlight(this.intersected);
    this.intersected = null;
  }
};

HighlightControls.prototype.accept = function (intersected) {
  if (this.acceptCallback) {
    return this.acceptCallback(intersected);
  } else {
    return true;
  }
};

HighlightControls.prototype.highlight = function (object3D) {
  if (object3D) {
    if (this.highlightCallback) {
      this.highlightCallback(object3D, 1);
    } else {
      this.picker.highlightObject(object3D);
    }
  }
};

HighlightControls.prototype.unhighlight = function (object3D) {
  if (object3D) {
    if (this.highlightCallback) {
      this.highlightCallback(object3D, 0);
    } else {
      this.picker.unhighlightObject(object3D);
    }
  }
};

module.exports = HighlightControls;
