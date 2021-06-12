'use strict';

var d3 = require('d3');
var d3TipFactory = require('d3-tip');

var d3Tip = d3TipFactory(d3);
var DataUtils = require('data/DataUtils');
var _ = require('util/util');

function Chart(params) {
  this.type = this.constructor.name || 'Chart';
  this.name = params.name || this.type;
  this.__pinnedTips = []; // List of pinned tooltips
  this.__defaultColor = 'steelblue';
  this.__defaultHighlightColor = 'lightblue';
  this.__defaultTooltipLabelColor = 'red';
  this.__includeLabels = params.includeLabels;
  this.__xLabelPosition = params.xLabelPosition;
  if (!params.window && params.dom) {
    params.window = this.__createWindow(params.dom, params.width, params.height, params.margin);
  }
  //console.log(params);
  this.__window = params.window;
  this.__create(params);
  return this;
}

Chart.prototype.constructor = Chart;
Chart.d3Tip = d3Tip;

Chart.prototype.update = function(params) {
  if (this.__window) {
    this.__create(params);
  }
};

Chart.prototype.__createWindow = function (dom, graphWidth, graphHeight, margin) {
  var d3selector = d3.select(dom[0] || dom).select('svg');
  if (d3selector.empty()) {
    d3selector = d3.select(dom[0] || dom).append('svg');
  }
  margin = margin || { right: 0, left: 0, top: 0, bottom: 0 };
  var gWindow = d3selector;
  gWindow.html('');

  var width = graphWidth - margin.right - margin.left;
  var height = graphHeight - margin.top - margin.bottom;

  var svg = gWindow.attr('width', graphWidth)
    .attr('height', graphHeight)
    .append('g')
    .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

  return { svg: svg, width: width, height: height, margin: margin, selection: gWindow };
};

Chart.prototype.tipDataIdSame =  function (oldTipData, newTipData) {
  return (oldTipData.id === newTipData.id);
};

Chart.prototype.getPinnedTooltipById = function(id) {
  return _.find(this.__pinnedTips, function(x) { return x.data.id === id; });
};

// Pin the current tooltip to graph
Chart.prototype.pinTooltip = function (d, checkTipExists) {
  if (this.__tip) {
    if (checkTipExists) {
      var tip = _.find(this.__pinnedTips, function (x) {
        return checkTipExists(x.data, d);
      });
      if (tip) { return tip; }
    }
    var oldtip = this.__tip;
    // Pin current tip
    this.__pinnedTips.push(oldtip);
    // Give this tip an unique id
    var id = 'tip-' + _.generateRandomId(5);
    oldtip.attr('id', id);
    oldtip.show(d);
    oldtip.data = d;

    // Make closeable
    var closeButton = $('<button type="button" class="close">' +
      '<span>&times;</span>' +
    '</button>');
    var scope = this;
    closeButton.click(function() {
      var index = scope.__pinnedTips.indexOf(oldtip);
      if (index >= 0) {
        scope.__pinnedTips.splice(index, 1);
      }
      oldtip.hide();
      oldtip.destroy();
    });
    $('#' + id).prepend(closeButton);

    // Create new tooltip
    this.__tip = this.__createTooltip();
    return oldtip;
  }
};

Chart.prototype.__createTooltip = function () {
  var tip = d3Tip()
    .attr('class', 'd3-tip')
    .offset([-10, 0])
    .html(this.__tooltipHtmlFn);
  this.__window.svg.call(tip);
  return tip;
};

Chart.prototype.clearPinnedTooltips = function () {
  for (var i = 0; i < this.__pinnedTips.length; i++) {
    this.__pinnedTips[i].hide();
    this.__pinnedTips[i].destroy();
  }
  this.__pinnedTips = [];
};

Chart.prototype.getPinnedData = function () {
  var pinnedData = this.__pinnedTips.map( function(x) {
    return x.data;
  });
  return pinnedData;
};

Chart.prototype.__getDefaultTooltipHtmlFn = function (fieldArray, labelColor) {
  var scope = this;
  function getFormattedHtml(fieldArray, labelColor, d) {
    var str = '';
    for (var i = 0; i < fieldArray.length; i++) {
      var field = fieldArray[i];
      var attribute = scope.getLabel(field, d);
      var value = scope.getValue(field, d);
      if (str !== '') { str += '<br>'; }
      str += '<strong>' + attribute + ':</strong> <span style="color:' + labelColor + '">' + value + '</span>';
    }
    return str;
  }
  return function (d) {
    return getFormattedHtml(fieldArray, labelColor || scope.__defaultTooltipLabelColor, d);
  };
};

Chart.prototype.__getColorByCategoricalFieldFn = function (field) {
  var scope = this;
  var colorScale = d3.scale.category20b();
  return function (d) {
    // Default coloring by key
    var key = scope.getValue(field, d);
    return colorScale(key);
  };
};

Chart.prototype.__computeMin = function (field) {
  var scope = this;
  return d3.min(this.__data, function (d) { return scope.getValue(field, d); });
};

Chart.prototype.__computeMax = function (field) {
  var scope = this;
  return d3.max(this.__data, function (d) { return scope.getValue(field, d); });
};

Chart.prototype.getValue = function (field, d) {
  if (field) {
    return (field.getValue) ? field.getValue(d) : ((d instanceof Object) ? d[field.name || field.field] : d);
  } else {
    return d;
  }
};

Chart.prototype.getLabel = function (field) {
  return field.label || field.text || field.name || field.field;
};

//add labels to chart
Chart.prototype.addLabels = function (xLabel, yLabel) {
  var vizWindow = this.__window;
  if (xLabel) {
    if (this.__xLabelPosition === 'top') {
      var xText = vizWindow.svg.append('text')
        .attr('x', vizWindow.width / 2)
        .attr('y', 0)
        .attr('text-anchor', 'middle')
        .text(xLabel);
    } else {
      var xText = vizWindow.svg.append('text')
        .attr('x', vizWindow.width / 2)
        .attr('y', vizWindow.height)
        .attr('text-anchor', 'middle')
        .text(xLabel);
      var bb = xText.node().getBBox();
      xText.attr('y', vizWindow.height + bb.height + 2); // align it to top
    }
  }

  if (yLabel) {
    var text = vizWindow.svg.append('text').attr('text-anchor', 'start').text(yLabel).attr('transform', 'rotate(-90)');
    text.attr('x', 5).attr('y', 15);
  }
};

Chart.prototype.selectDateFormat = function(start, end) {
  var delta = Math.abs(start - end);
  if (delta > DataUtils.DAY_DURATION) {
    return d3.time.format('%Y-%m-%d');
  } else {
    return d3.time.format('%H:%M:%S');
  }
};

Chart.prototype.destroy = function () {
  this.clearPinnedTooltips();
  if (this.__tip) {
    this.__tip.hide();
    this.__tip.destroy();
    this.__tip = null;
  }
};

module.exports = Chart;



