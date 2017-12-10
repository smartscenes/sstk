/** Small class to manage my labels **/

'use strict';

var Constants = require('Constants');
var Colors = require('util/Colors');
var _ = require('util');

// Annotation labels (for tracking labels - without a panel)
var Labels = function (params) {
  // Array of label strings
  this.labels = params.labels || [];
  // Array of label infos
  this.labelInfos = params.labelInfos || [];

  // Label string to index
  this.labelToIndex = {};
};

Labels.prototype.constructor = Labels;

Labels.prototype.indexOf = function (label, add) {
  var i = this.labelToIndex[label];
  if (i === undefined && add) {
    this.labels.push(label);
    i = this.labels.length - 1;
    this.labelToIndex[label] = i;
    this.labelInfos[i] = this.createLabelInfo(label);
  }
  return i;
};

/**
 * Set the labels used.
 * @function
 * @param labels {string[]}
 */
Labels.prototype.setLabels = function (labels, labelColorIndex) {
  this.labels = labels;
  this.labelInfos = [];
  if (labelColorIndex) {
    if (this.labelColorIndex.__maxIndex == undefined) {
      var values = _.values(this.labelColorIndex).filter( function(x) { return _.isInteger(x); });
      var maxIndex = _.max(values) || 0;
    }
  }
  for (var i = 0; i < this.labels.length; i++) {
    var label = this.labels[i];
    var colorIdx = this.labelColorIndex? this.labelColorIndex[label] : i+1;
    this.labelInfos[i] = this.createLabelInfo(label, { index: i, color: colorIdx });
  }
};

Labels.prototype.__toCssColor = function (color) {
  if (color) {
    var red = (color.r * 255).toFixed(0);
    var green = (color.g * 255).toFixed(0);
    var blue = (color.b * 255).toFixed(0);
    return 'rgb(' + red + ',' + green + ',' + blue + ')';
  }
};


Labels.prototype.createLabelInfo = function (label, options) {
  options = options || {};
  var idx = options.index;
  var colorIdx = (options.color != undefined)? options.color : idx + 1;
  // TODO: Cleanup weird color code here
  var color = (colorIdx instanceof THREE.Color || typeof colorIdx === 'string')?
    Colors.toColor(colorIdx) : Colors.createColor(colorIdx, options.palette || Constants.defaultPalette);
  var name = this.labelToName ? this.labelToName(label, idx) : label;
  var cssColor = this.__toCssColor(color);
  var labelInfo = {
    index: idx,
    id: idx + 1,  // NOTE: So that we can easily map buttons to number keys
    name: name,
    label: label,
    color: color,
    cssColor: cssColor
  };
  if (options.fixed) {
    labelInfo.fixed = true;
  }
  return labelInfo;
};

Labels.prototype.getLabelInfo = function(label) {
  for (var i = 0; i < this.labelInfos.length; i++) {
    if (this.labelInfos[i].label === label) {
      return this.labelInfos[i];
    }
  }
};

/**
 * Information about a label.
 * @class LabelInfo
 * @param {int} index
 * @param {int} id - index + 1
 * @param {string} name - Text that is displayed to the user
 * @param {string} label - Label that is stored internally
 * @param {color} color - Color used to represent this label
 * @param {string} cssColor - String representing the color for use in CSS
 * @param {material} colorMat - Material to use on meshes to represent this label
 * @param {material} hoverMat - Material to use on meshes to represent this label when hovering
 */

module.exports = Labels;
