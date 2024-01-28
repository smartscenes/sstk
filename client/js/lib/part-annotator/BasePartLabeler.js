'use strict';

var PubSub = require('PubSub');
var OBB = require('geo/OBB');
var LabelParsers = require('part-annotator/LabelParsers');
var _ = require('util/util');

/**
 * Base class for labeling of parts of any whole.
 * Used by other classes to determine when parts are to be labeled.
 * Label information is stored in part.userData.labelInfo
 * Manages association of parts to labels.
 * @param params Configuration
 * @param params.showNodeCallback {BasePartLabeler.showNodeCallback} Callback function to display special parts node.
 * @param params.getIntersected {BasePartLabeler.getIntersectedFn} Function to use for getting intersected mesh/triangle
 * @param params.isLabelable {BasePartLabeler.isLabelableFn} Function to use for determining is a part can be labeled or not
 * @param params.getDehighlightColor {BasePartLabeler.getDehighlightColorFn} Function to use for determining the color to apply when a part is dehighlighted
 * @param params.labelParser {BasePartLabeler.LabelParser} Parses information from labels into LabelInfo
 * @param params.specialLabels = {string[]} List of special labels that is allowed and will not be checked
 * @param params.checkLabelsUnique {boolean} Whether to check if labels are unique
 * @constructor
 */
function BasePartLabeler(params) {
  PubSub.call(this, params);
  this.showNodeCallback = params.showNodeCallback;
  this.getIntersected = params.getIntersected;
  this.isLabelable = params.isLabelable;
  if (params.getDehighlightColor) {
    this.getDehighlightColor = params.getDehighlightColor;
  }
  this.labelParser = LabelParsers.getLabelParser(params.labelParser);
  this.specialLabels = params.specialLabels;
  this.checkLabelsUnique = params.checkLabelsUnique;

  this.highlightedPart = null; //The currently selected part
  this.currentLabelInfo = null;
  this.labelInfos = null;  // Object[] with LabelInfos for all available labels
}

BasePartLabeler.prototype = Object.create(PubSub.prototype);
BasePartLabeler.prototype.constructor = BasePartLabeler;

BasePartLabeler.prototype.getLabelInfo = function (part) {
  if (part && part.userData) {
    return part.userData.labelInfo;
  }
};

BasePartLabeler.prototype.getLabels = function () {
  var partLabels = [];
  for (var partInfoIdx in this.labelInfos) {
    if (this.labelInfos.hasOwnProperty(partInfoIdx)) {
      partLabels.push(this.labelInfos[partInfoIdx].name);
    }
  }
  return partLabels;
};

BasePartLabeler.prototype.updateLabels = function (labelInfos) {
  this.labelInfos = labelInfos;
};

BasePartLabeler.prototype.isValidLabel = function(labelInfo) {
  return labelInfo && !labelInfo.removed && this.hasParts(labelInfo);
};

BasePartLabeler.prototype.getValidLabels = function() {
  if (this.labelInfos) {
    var scope = this;
    return this.labelInfos.filter(function(x) { return scope.isValidLabel(x); });
  }
};

BasePartLabeler.prototype.hasParts = function (labelInfo) {
  console.warn('Please implement hasParts for ' + this.constructor.name);
  return false;
};

/**
 * Returns the part given the mouse event. If no part selected, return false
 * A part should have userData field that is used to store the associated label.
 * @param event
 */
BasePartLabeler.prototype.findPart = function (event) {
  return this.__findPart(event);
};

BasePartLabeler.prototype.findLabelablePart = function (event) {
  var part = this.__findPart(event);
  if (part) {
    if (!this.isLabelable || this.isLabelable(part, this.currentLabelInfo)) {
      return part;
    }
  }
};

BasePartLabeler.prototype.getPartStatus = function (part) {
  var labelable = !this.isLabelable || this.isLabelable(part, this.currentLabelInfo);
  return { isLabelable: labelable };
};

BasePartLabeler.prototype.__findPart = function (event) {
  return this.getIntersected(event);
};

BasePartLabeler.prototype.labelParts = function (parts, labelInfo, opts) {
  if (!Array.isArray(parts)) {
    parts = [parts];
  }
  for (var i = 0; i < parts.length; i++) {
    this.labelPart(parts[i], labelInfo, opts);
  }
};

BasePartLabeler.prototype.labelPart = function (part, labelInfo, opts) {
  // Clear if label information is saved in both the labelInfo and the part.userData
  if (part && part.userData.labelInfo !== labelInfo) {
    var isFixed = part.userData.labelInfo && (part.userData.labelInfo.fixed || part.userData.labelInfo.frozen);
    if (!isFixed) {
      if (part && part.userData.labelInfo) {
        this.__unlabel(part, opts);
      }
      this.colorPart(part, labelInfo.colorMat);
      part.userData.labelInfo = labelInfo;
      this.__label(part, labelInfo, opts);
    }
  }
};

BasePartLabeler.prototype.__label = function (part, labelInfo, opts) {
  // TODO: Override with your implementation
};

BasePartLabeler.prototype.unlabelParts = function (parts, labelInfo) {
  if (!Array.isArray(parts)) {
    parts = [parts];
  }
  for (var i = 0; i < parts.length; i++) {
    this.unlabelPart(parts[i]);
  }
};

BasePartLabeler.prototype.unlabelPart = function (part, opts) {
  this.__unlabel(part, opts);
  this.decolorPart(part);
  part.userData.labelInfo = null;
};

BasePartLabeler.prototype.__unlabel = function (part, opts) {
  // TODO: Override with your implementation
};

BasePartLabeler.prototype.unlabelAll = function() {
  // Clean labels from parts
  for (var i = 0; i < this.labelInfos.length; i++) {
    this.unlabelParts(null, this.labelInfos[i]);
  }
};

/**
 * Colors one or more parts of the model
 * @param parts {Object|Object[]} Array of parts or a single part
 * @param labelInfo {LabelInfo} What label to color the parts in with
 */
BasePartLabeler.prototype.colorParts = function (parts, labelInfo, opts) {
  if (!Array.isArray(parts)) {
    parts = [parts];
  }
  for (var i = 0; i < parts.length; i++) {
    this.colorPart(parts[i], labelInfo, opts);
  }
};

/**
 * Colors a particular part of the model.  Implement in subclasses.
 * @param part
 * @param colorMaterial {THREE.Color|Object} Color or object with color field.
 */
BasePartLabeler.prototype.colorPart = function (part, colorMaterial) {
  console.error(this.constructor.name + '.colorPart - Please implement me!!!');
};

BasePartLabeler.prototype.colorLabelablePart = function (part, colorMaterial) {
  this.colorPart(part, colorMaterial, {
    filter: function (p) {
      var info = p.userData.labelInfo;
      var isFixed = info && (info.fixed || info.frozen);
      return !isFixed;
    }
  });
};

/**
 * Decolors one or more parts of the model
 * @param parts {Object|Object[]} Array of parts or a single part
 */
BasePartLabeler.prototype.decolorParts = function (parts) {
  if (!Array.isArray(parts)) {
    parts = [parts];
  }
  for (var i = 0; i < parts.length; i++) {
    this.decolorPart(parts[i]);
  }
};

/**
 * Decolors a particular part of the model.  Implement in subclasses.
 * @param parts
 */
BasePartLabeler.prototype.decolorPart = function (part) {
  console.error(this.constructor.name + '.decolorPart - Please implement me!!!');
};

BasePartLabeler.prototype.showParts = function (flag) {
  console.error(this.constructor.name + '.showParts - Please implement me!!!');
};

BasePartLabeler.prototype.highlightPart = function (part, labelInfo, highlightMat) {
  // Restore the last highlighted part to its original color
  if (part !== this.highlightPart) {
    this.dehighlightPart();
  }
  if (part && labelInfo) {
    // Highlight part
    this.colorLabelablePart(part, highlightMat || labelInfo.hoverMat);
    this.highlightedPart = part;
  }
};

BasePartLabeler.prototype.dehighlightPart = function () {
  if (this.highlightedPart) {
    this.__dehighlightPart(this.highlightedPart);
    this.highlightedPart = null;
  }
};

BasePartLabeler.prototype.__dehighlightPart = function(part) {
  var origColor = this.getDehighlightColor(part);
  if (origColor) {
    this.colorPart(part, origColor);
  } else {
    this.decolorPart(part);
  }
};

BasePartLabeler.prototype.getDehighlightColor = function (part) {
  if (part && part.userData.labelInfo) {
    return part.userData.labelInfo.colorMat;
  }
};

BasePartLabeler.prototype.onReady = function(options) {
};

BasePartLabeler.prototype.restore = function(labels, savedLabelInfos, options) {
  options = options || {};
  console.time('restore');
  // Assume just one mesh
  for (var i = 0; i < savedLabelInfos.length; i++) {
    var savedLabelInfo = savedLabelInfos[i];
    var labelInfo = labels.createLabelInfo(savedLabelInfo.label, savedLabelInfo );
    labels.appendButton(labelInfo);
    labels.labelInfos[labelInfo.index] = labelInfo;
    if (savedLabelInfo.initialPoint) {
      labelInfo.initialPoint = savedLabelInfo.initialPoint;
    }
    if (savedLabelInfo.obb) {
      labelInfo.obb = new OBB();
      labelInfo.obb.fromJSON(savedLabelInfo.obb);
    }
    this.__restoreLabel(labelInfo, savedLabelInfo, options);
  }
  this.updateLabels(labels.labelInfos);
  console.timeEnd('restore');
};

BasePartLabeler.prototype.__restoreLabel = function(createdLabelInfo, savedLabelInfo, options) {
  console.error(this.constructor.name + '.__restoreLabel - Please implement me!!!');
};

BasePartLabeler.prototype.__isSpecialLabel = function(label) {
  return this.specialLabels && (this.specialLabels.indexOf(label) >= 0);
};

BasePartLabeler.prototype.checkLabels = function() {
  var statusMessages = [];
  var validLabels = this.getValidLabels();
  if (this.labelParser) {
    var invalidIndices = [];
    for (var i = 0; i < validLabels.length; i++) {
      var labelInfo = validLabels[i];
      if (this.__isSpecialLabel(labelInfo.label)) {
        // Okay, special label
      } else {
        var parsed = this.labelParser.parse(labelInfo);
        if (!parsed) {
          var index = labelInfo.index;
          statusMessages.push({'message': `Label "${labelInfo.label} (${index})" is invalid`, labelIndex: [index]});
          invalidIndices.push(index);
        }
      }
    }
    if (invalidIndices.length > 0) {
      statusMessages.unshift({ 'message': `There are ${invalidIndices.length} invalid labels.` +
          'Labels should be of the form ' + this.labelParser.description, labelIndex: invalidIndices });
    }
  }
  if (this.checkLabelsUnique) {
    var labels = _.groupBy(validLabels, (labelInfo) => labelInfo.label);
    _.forEach(labels, (labelInfos, label) => {
      if (this.__isSpecialLabel(label)) {
        // Okay
      } else if (labelInfos.length > 1) {
        var labelIndices = labelInfos.map(li => li.index);
        statusMessages.push({ 'message': `Label ${label} is duplicated ${labelInfos.length} times`,
          labelIndex: labelIndices });
      }
    });
  }
  return statusMessages;
};

module.exports = BasePartLabeler;

/**
 * Callback function when trying to delete a label to see if it okay or not.
 * @callback BasePartLabeler.showNodeCallback
 * @param {THREE.Object3D} node to show
 */

/**
 * Function to use for getting intersected mesh/triangle.
 * @callback BasePartLabeler.getIntersectedFn
 * @param {Event} event
 */

/**
 * Function to use for determining is a part can be labeled or not.
 * @callback BasePartLabeler.isLabelableFn
 * @param {Part} part
 * @param {LabelInfo} current active label
 */

/**
 * Function to use for determining the color to apply when a part is dehighlighted.
 * @callback BasePartLabeler.getDehighlightColorFn
 * @param {Part} part
 */

