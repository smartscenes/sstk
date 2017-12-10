'use strict';

var BBoxCreator               = require('controls/BBoxCreator');
var ContextQueryControls      = require('controls/ContextQueryControls');
var Object3DUtil              = require('geo/Object3DUtil');
var UILog                     = require('editor/UILog');

/**
 * Controls for making a model query by drawing a bounding box in 3D scene
 * @constructor
 * @extends controls.ContextQueryControls
 * @memberOf controls
 */
function BBoxQueryControls(params) {
  this.useSize = (params.useSize != undefined) ? params.useSize : true;
  this.searchTolerance = params.searchTolerance || 0.4;
  this.bboxCreator = new BBoxCreator(params);
  this.bboxCreator.Subscribe('BBoxStarted', this, this.onBBoxStarted);
  this.bboxCreator.Subscribe('BBoxCompleted', this, this.onBBoxCompleted);

  ContextQueryControls.call(this, params);
  this.__activeCursor = 'initial';
  this.__mouseMoveCursor = 'crosshair';
}

BBoxQueryControls.prototype = Object.create(ContextQueryControls.prototype);
BBoxQueryControls.prototype.constructor = BBoxQueryControls;

BBoxQueryControls.prototype.reset = function (params) {
  ContextQueryControls.prototype.reset.call(this, params);
  this.bboxCreator.reset(params);
};

BBoxQueryControls.prototype.onDocumentMouseDown = function (event) {
  if (this.isActive) {
    this.bboxCreator.onDocumentMouseDown(event);
  }
};

BBoxQueryControls.prototype.onDocumentMouseMove = function (event) {
  if (this.isActive) {
    this.bboxCreator.onDocumentMouseMove(event);
  }
};

BBoxQueryControls.prototype.onDocumentMouseUp = function (event) {
  if (this.isActive) {
    this.bboxCreator.onDocumentMouseUp(event);
  }
};

BBoxQueryControls.prototype.onBBoxStarted = function (event) {
  this.uilog.log(UILog.EVENT.CONTEXT_QUERY_STARTED, event, {});
};

BBoxQueryControls.prototype.onBBoxCompleted = function () {
  this.placementInfo = this.bboxCreator.placementInfo;
  this.Publish('BBoxCompleted');
  this.onQueryRegionMarked();
};

BBoxQueryControls.prototype.getQueryRegionPoints = function () {
  return this.bboxCreator.getBoxCorners();
};

BBoxQueryControls.prototype.__constructQueryString = function (categories) {
  var queryString = ContextQueryControls.prototype.__constructQueryString.call(this, categories);
  if (this.useSize) {
    var and = ' AND ';
    var minWidth = this.bboxCreator.width * (1 - this.searchTolerance);
    var maxWidth = this.bboxCreator.width * (1 + this.searchTolerance);
    var minDepth = this.bboxCreator.depth * (1 - this.searchTolerance);
    var maxDepth = this.bboxCreator.depth * (1 + this.searchTolerance);
    var minHeight = this.bboxCreator.height * (1 - this.searchTolerance);
    var maxHeight = this.bboxCreator.height * (1 + this.searchTolerance);

    var alignedDimsWidth = 'aligned.dims_0_d:[' + minWidth + ' TO ' + maxWidth + ']';
    var alignedDimsDepth = 'aligned.dims_2_d:[' + minDepth + ' TO ' + maxDepth + ']';
    var alignedDimsHeight = 'aligned.dims_1_d:[' + minHeight + ' TO ' + maxHeight + ']';
    var isAligned = 'isAligned:true';
    var sizeQuery = alignedDimsHeight + and + alignedDimsDepth + and + alignedDimsWidth + and + isAligned;
    queryString += and + sizeQuery;
  }
  return queryString;
};

module.exports = BBoxQueryControls;
