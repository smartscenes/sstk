'use strict';

var Chart = require('viz/Chart');
var DataUtils = require('data/DataUtils');

// Creates a scatter plot from parameters
// Required parameters
//  window: { svg: ..., height: ..., width: ..., jdom: ... } // information about where to put the chart
//  data:   data array
//  x:  { field: <field to use to extract x value>, label: label to use }
//  y:  { field: <field to use to extract y value>, label: label to use }
// Optional
//  tooltipHtmlFn: html to use on hover
//  onClickFn: what to do when a point is clicked
//  colorFn: what attribute to use for color
//  color:   static color to use (overridden by colorFn)
function ScatterPlot(params) {
  Chart.call(this, params);
}

ScatterPlot.prototype = Object.create(Chart.prototype);
ScatterPlot.prototype.constructor = ScatterPlot;

ScatterPlot.prototype.onClick = function (fn) {
  this.__onClickFn = fn || function () {};
  if (!this.__zoomRectActive) {
    this.__chartBody.selectAll('circle').on('click', this.__onClickFn);
  }
};

//creates a scatterplot given two numeric field domains
ScatterPlot.prototype.__create = function (params) {
  this.__xField = params.x.field;
  this.__yField = params.y.field;
  this.__xLabel = params.x.label || params.x.field;
  this.__yLabel = params.y.label || params.y.field;
  this.__data = params.data;

  this.__tooltipHtmlFn = params.tooltipHtmlFn;
  this.__onClickFn = params.onClickFn || function () {};
  this.__defaultColor = params.color || this.__defaultColor;
  this.__colorFn = params.colorFn;

  var scope = this;

  // filter out data with undefined x,y fields
  var initialSize = this.__data.length;
  this.__data = DataUtils.filterData(this.__xField, this.__data);
  this.__data = DataUtils.filterData(this.__yField, this.__data);
  var finalSize = this.__data.length;
  console.log('Filtered ' + initialSize + ' down to ' + finalSize
    + ' for ' + this.__xField + ' ' + this.__yField);

  var svg = this.__window.svg;
  var height = this.__window.height;
  var width = this.__window.width;

  svg.html('');

  var xMax = DataUtils.max(this.__xField, this.__data);
  var yMax = DataUtils.max(this.__yField, this.__data);

  this.__yScale = d3.scale.linear().domain([0, yMax]).range([height, 0]);
  this.__xScale = d3.scale.linear().domain([0, xMax]).range([0, width]);

  this.__xAxis = d3.svg.axis().scale(this.__xScale).orient('bottom').outerTickSize(0);
  this.__yAxis = d3.svg.axis().scale(this.__yScale).orient('left').outerTickSize(0);

  //add logic for pan and zoom
  var zoom = d3.behavior.zoom().x(this.__xScale).y(this.__yScale).on('zoom', this.refresh.bind(this));
  this.__window.selection.call(zoom);
  svg = this.__addZoomRect(svg, width, height, this.__xScale, this.__yScale, zoom);
  this.__window.svg = svg;

  //add axes
  svg.append('g').attr('class', 'y axis').call(this.__yAxis);
  svg.append('g').attr('class', 'x axis').attr('transform', 'translate(0' + ',' + height + ')').call(this.__xAxis);

  //add labels
  svg.append('text').attr('x', width / 2).attr('y', height + 50).text(this.__xLabel);
  svg.append('text').attr('x', -height / 2).attr('y', -50).text(this.__yLabel).attr('transform', 'rotate(-90)');

  var clip = svg.append('svg:clipPath')
    .attr('id', 'clip')
    .append('svg:rect')
    .attr('x', 0)
    .attr('y', 0)
    .attr('width', width)
    .attr('height', height);

  this.__chartBody = svg.append('g')
    .attr('clip-path', 'url(#clip)');

  //tooltip
  this.__tip = this.__createTooltip();

  // plot points
  var points = scope.__chartBody.selectAll('circle').data(scope.__data).enter().append('circle')
    .attr('cx', function (d) {
      return scope.__xScale(0);
    })
    .attr('cy', function (d) {
      return scope.__yScale(0);
    })
    .attr('r', 3)
    .on('click', scope.__onClickFn)
    .on('mouseover', function (d) {
      if (!scope.__zoomRectActive) {
        scope.__tip.show(d);
      }
    })
    .on('mouseout', function (d) {
      scope.__tip.hide(d);
    })
    .transition().duration(2000)
    .attr('cx', function (d) {
      return scope.__xScale(d[scope.__xField] || 0);
    })
    .attr('cy', function (d) {
      return scope.__yScale(d[scope.__yField] || 0);
    })
    .attr('fill', scope.__defaultColor);

  if (scope.__colorFn) {
    points.attr('fill', scope.__colorFn);
  }
};

ScatterPlot.prototype.__addZoomRect = function (svg, width, height, x, y, zoom) {
  var scope = this;
  var withZoomRect = svg.append('g')
    .on('mousedown', function() {
      //if (!scope.__zoomRect) return;
      scope.__zoomRectActive = true;
      var e = this,
        origin = d3.mouse(e),
        rect = svg.append('rect').attr('class', 'zoom');
      d3.select('body').classed('noselect', true);
      origin[0] = Math.max(0, Math.min(width, origin[0]));
      origin[1] = Math.max(0, Math.min(height, origin[1]));
      d3.select(window)
        .on('mousemove.zoomRect', function() {
          var m = d3.mouse(e);
          m[0] = Math.max(0, Math.min(width, m[0]));
          m[1] = Math.max(0, Math.min(height, m[1]));
          rect.attr('x', Math.min(origin[0], m[0]))
            .attr('y', Math.min(origin[1], m[1]))
            .attr('width', Math.abs(m[0] - origin[0]))
            .attr('height', Math.abs(m[1] - origin[1]));
        })
        .on('mouseup.zoomRect', function() {
          d3.select(window).on('mousemove.zoomRect', null).on('mouseup.zoomRect', null);
          d3.select('body').classed('noselect', false);
          var m = d3.mouse(e);
          m[0] = Math.max(0, Math.min(width, m[0]));
          m[1] = Math.max(0, Math.min(height, m[1]));
          if (m[0] !== origin[0] && m[1] !== origin[1]) {
            zoom.x(x.domain([origin[0], m[0]].map(x.invert).sort(function(a,b) {return a-b;})))
              .y(y.domain([origin[1], m[1]].map(y.invert).sort(function(a,b) {return a-b;})));
          }
          rect.remove();
          scope.refresh();
          scope.__zoomRectActive = false;
        }, true);
      d3.event.stopPropagation();
    });
  withZoomRect.append('rect')
    .attr('class', 'transparent')
    .attr('width', width)
    .attr('height', height);
  return withZoomRect;
};


ScatterPlot.prototype.refresh = function () {
  var scope = this;
  var svg = scope.__window.svg;
  svg.select('.x.axis').call(scope.__xAxis);
  svg.select('.y.axis').call(scope.__yAxis);
  var points = svg.selectAll('circle')
    .attr('r', 3)
    .attr('cx', function (d) {
      return scope.__xScale(d[scope.__xField] || 0);
    })
    .attr('cy', function (d) {
      return scope.__yScale(d[scope.__yField] || 0);
    })
    .attr('fill', scope.__defaultColor);

  // TODO: Update position of pinned tooltips to be next to new point positions
  // for (var i = 0; i < this.__pinnedTips.length; i++) {
  //   var tip = this.__pinnedTips[i];
  //   // TODO: move tip to around tip.circle;
  // }

  if (scope.__colorFn) {
    points.attr('fill', scope.__colorFn);
  }
};

module.exports = ScatterPlot;
