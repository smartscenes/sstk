'use strict';

var Chart = require('viz/Chart');
var _ = require('util/util');

// Creates a pie chart from parameters
// Required parameters
//  window: { svg: ..., height: ..., width: ..., jdom: ... } // information about where to put the chart
//  data:   data array or map of key to value
// Optional if data is map of key to count
//  value:  { field: <field to use to extract value>, label: label to use }
// Optional if data is map of key to value
//  key:    { field: <field to use to extract key>, label: label to use }
// Optional
//  tooltipHtmlFn: html to use on hover
//  colorFn: what attribute to use for color
function PieChart(params) {
  Chart.call(this, params);
}

PieChart.prototype = Object.create(Chart.prototype);
PieChart.prototype.constructor = PieChart;

PieChart.prototype.__create = function (params) {
  if (params.data instanceof Object) {
    // Assume data is of the form { key: datum }
    this.__createFromKeyValueMap(params);
  } else {
    // Just a bunch of data
    this.__createFromArray(params);
  }
};

PieChart.prototype.__createFromArray = function (params) {
  this.__createFromData(params);
};

PieChart.prototype.__createFromKeyValueMap = function (params) {
  var categories = Object.keys(params.data);

  var mappedParams = {};
  _.merge(mappedParams, params);
  mappedParams.data = categories;
  mappedParams.datamap = params.data;
  this.__createFromData(mappedParams);
};

PieChart.prototype.__createFromData = function (params) {
  var scope = this;

  this.__keyField = params.key || { label: 'Category' };
  this.__valueField = params.value || { label: 'Value' };
  this.__data = params.data;
  this.__datamap = params.datamap;

  this.__tooltipHtmlFn = params.tooltipHtmlFn || this.__getDefaultTooltipHtmlFn([this.__keyField, this.__valueField]);
  this.__onClickFn = params.onClickFn || function () {};  // not currently used
  this.__colorFn = params.colorFn || this.__getColorByCategoricalFieldFn(this.__keyField);

  var svg = this.__window.svg;
  var height = this.__window.height;
  var width = this.__window.width;
  var radius = Math.min(width, height) / 2;

  //reset svg to render new graph
  svg.html('');

  svg = svg.append('g').attr('transform', 'translate(' + width / 2 + ',' + height / 2 + ')');

  // chart
  var arc = d3.svg.arc().outerRadius(radius).innerRadius(Math.max(0, radius - 50));
  var pie = d3.layout.pie().value(function (d) {
    // data field (d is directly from our data array)
    return scope.getValue(scope.__valueField, d);
  }).sort(null);

  //tooltip
  this.__tip = this.__createTooltip();

  var path = svg.selectAll('path').data(pie(this.__data)).enter()
    .append('path').attr('d', arc).attr('fill', this.__colorFn)
    .on('mouseover', this.__tip.show)
    .on('mouseout', this.__tip.hide);

  if (this.__keyField) {
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', height + this.__window.margin.bottom)
      .text(scope.getLabel(this.__keyField));
  }
};

PieChart.prototype.getValue = function (field, d) {
  // NOTE: in many cases, this function will be called after the pie() chart and so
  //       our data will be located inside d.data
  if (d instanceof Object && d.data) {
    d = d.data;
  }

  if (this.__datamap) {
    // d is a string (from our category), so we need to use the datamap to look it up
    if (field == undefined || field === this.__keyField) {
      return d;
    } else {
      var datum = this.__datamap[d];
      return Chart.prototype.getValue.call(this, field, datum);
    }
  } else {
    // d is a entry from the data array, can be used directly
    return Chart.prototype.getValue.call(this, field, d);
  }
};

module.exports = PieChart;
