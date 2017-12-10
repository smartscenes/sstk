'use strict';

var Chart = require('viz/Chart');
var DataUtils = require('data/DataUtils');

function Histogram(params) {
  Chart.call(this, params);
}

Histogram.prototype = Object.create(Chart.prototype);
Histogram.prototype.constructor = Histogram;

Histogram.prototype.__create = function (params) {
  if (params.bars === 'vertical') {
    this.__createVerticalBars(params);
  } else {
    this.__createHorizontalBars(params);
  }
};

Histogram.prototype.__init = function (params) {
  this.__valueField = params.value || { label: 'Value' };
  this.__data = params.data;
  // this.__sort = params.sort;
  this.__minValue = (this.__valueField.min != undefined)? this.__valueField.min : this.__computeMin(this.__valueField);
  this.__maxValue = (this.__valueField.max != undefined)? this.__valueField.max : this.__computeMax(this.__valueField);
  this.__frequency = params.frequency;

  this.__tooltipHtmlFn = params.tooltipHtmlFn;
  this.__onClickFn = params.onClickFn || function () {};  // not currently used
  this.__defaultColor = params.color || this.__defaultColor;
  this.__highlightColor = params.highlightColor || this.__defaultHighlightColor;
  this.__colorFn = params.colorFn || this.__defaultColor;
  this.__numBins = params.numBins;
  this.__binTicks = params.binTicks;
  this.__countTicks = params.countTicks;

  var field = this.__valueField.field;
  var isDate = (this.__valueField.type === 'Date');
  this.__data = isDate ? DataUtils.filterDates(field, this.__data) : DataUtils.filterNumbers(field, this.__data);

  var scope = this;
  //create histogram layout
  this.__histogramData = d3.layout.histogram()
    .range([scope.__minValue, scope.__maxValue])
    .frequency(this.__frequency)
    .bins(this.__numBins)
    .value(function (d) {
      return d[field] || 0;
    })(this.__data);
  //console.log(this.__data);
  //console.log(this.__histogramData);

  if (!this.__tooltipHtmlFn) {
    this.__tooltipHtmlFn = function (d) {
      var start = Math.round(d.x);
      var end = Math.round(d.x + d.dx);
      if (scope.__valueField.type === 'Date') {
        // Format as date
        var delta = end - start;
        // Have smart formatting based on range
        start = new Date(start);
        end = new Date(end);
        var format = scope.selectDateFormat(start, end);
        start = format(start);
        end = format(end);
      }
      return "<strong>Range:</strong> <span style='color:red'>" + start + ' to ' + end + '</span>' + '<br>' +
        '<strong>' + (scope.__frequency ? 'Count' : 'Percentage') + ":</strong> <span style='color:red'>" +
        (scope.__frequency ? d.y : d3.format('%')(d.y)) + '</span>';
    };
  }

  //tooltip
  this.__tip = this.__createTooltip();
};

//function to generate histogram of various field counts, field must be a numeric domain
Histogram.prototype.__createVerticalBars = function (params) {
  this.__init(params);

  var scope = this;

  var svg = this.__window.svg;
  var height = this.__window.height;
  var width = this.__window.width;

  svg.html('');

  //no more zooming
  svg.on('.zoom', null);

  // Variables to be used later
  var frequency = this.__frequency;

  //scales
  var isDate = (this.__valueField.type === 'Date');
  var min = (this.__valueField.min != undefined)? this.__valueField.min : d3.min(this.__histogramData, function (d) {
    return d.x;
  });
  var max = (this.__valueField.max != undefined)? this.__valueField.max : d3.max(this.__histogramData, function (d) {
    return d.x + d.dx + 1;
  });
  var xScale = isDate?
    d3.time.scale()
      .domain([min, max])
      .range([0, width]) :
    d3.scale.linear()
      .domain([min, max])
      .range([0, width]);

  var yScale = d3.scale.linear()
    .domain([0, d3.max(this.__histogramData, function (d) {
      return d.y;
    })])
    .range([height, 0]);

  //axes
  if (this.__countTicks > 0) {
    var yAxis = d3.svg.axis().scale(yScale).orient('left').outerTickSize(1).ticks(this.__countTicks).tickFormat(frequency ? null : d3.format('%'));
    svg.append('g').attr('class', 'y axis').call(yAxis);
  }

  if (this.__binTicks > 0) {
    var format = null;//isDate? this.selectDateFormat(min, max) : null;
    var xAxis = d3.svg.axis().scale(xScale).orient('bottom').outerTickSize(1).ticks(this.__binTicks).tickFormat(format);
    svg.append('g').attr('class', 'x axis').attr('transform', 'translate(0,' + height + ')').call(xAxis);
  }

  //add bars
  var bars = svg.selectAll('.bar')
    .data(this.__histogramData)
    .enter()
    .append('rect')
    .attr('class', 'bar')
    .attr('x', function (d) {
      return xScale(d.x);
    })
    .attr('y', function (d) {
      return yScale(d.y);
    })
    .attr('width', function (d) {
      return xScale(d.x + d.dx) - xScale(d.x) - 1;
    })
    .attr('height', function (d) {
      return height - yScale(d.y);
    })
    .attr('fill', scope.__colorFn)
    .on('mouseover', function (d) {
      d3.select(this).attr('fill', scope.__highlightColor);
      scope.__tip.show(d);
    })
    .on('mouseout', function (d) {
      d3.select(this).transition().duration(350).attr('fill', scope.__colorFn);
      scope.__tip.hide(d);
    });
  if (this.__onClickFn) {
    bars.on('click', scope.__onClickFn);
  }

  //add text
  if (this.__includeLabels) {
    this.addLabels(this.getLabel(this.__valueField), frequency? 'count' : '%');
  }
};

Histogram.prototype.__createHorizontalBars = function (params) {
  this.__init(params);

  var scope = this;

  var svg = this.__window.svg;
  var height = this.__window.height;
  var width = this.__window.width;

  svg.html('');

  //no more zooming
  svg.on('.zoom', null);

  // Variables to be used later
  var frequency = this.__frequency;

  //scales
  var isDate = (this.__valueField.type === 'Date');
  var min = (this.__valueField.min != undefined)? this.__valueField.min : d3.min(this.__histogramData, function (d) {
    return d.x;
  });
  var max = (this.__valueField.max != undefined)? this.__valueField.max : d3.max(this.__histogramData, function (d) {
    return d.x + d.dx + 1;
  });
  var yScale = isDate?
    d3.time.scale()
      .domain([min, max])
      .range([height, 0])
    :
    d3.scale.linear()
      .domain([min, max])
      .range([height, 0]);

  var xScale = d3.scale.linear()
    .domain([0, d3.max(this.__histogramData, function (d) {
      return d.y;
    })])
    .range([0, width]);

  //axes
  if (this.__countTicks > 0) {
    var xAxis = d3.svg.axis().scale(xScale).orient('bottom').outerTickSize(1).ticks(this.__countTicks).tickFormat(frequency ? null : d3.format('%'));
    svg.append('g').attr('class', 'x axis').attr('transform', 'translate(0,' + height + ')').call(xAxis);
  }

  if (this.__binTicks > 0) {
    var format = null;//(this.__valueField.type === 'Date')? this.selectDateFormat(min, max) : null;
    var yAxis = d3.svg.axis().scale(yScale).orient('left').outerTickSize(1).ticks(this.__binTicks).tickFormat(format);
    svg.append('g').attr('class', 'y axis').call(yAxis);
  }

  //add bars
  var bars = svg.selectAll('.bar')
    .data(this.__histogramData)
    .enter()
    .append('rect')
    .attr('class', 'bar')
    .attr('x', function (d) {
      return 0;
    })
    .attr('y', function (d) {
      return yScale(d.x + d.dx);
    })
    .attr('width', function (d) {
      return xScale(d.y);
    })
    .attr('height', function (d) {
      return yScale(d.x) - yScale(d.x + d.dx);
    })
    .attr('fill', scope.__colorFn)
    .on('mouseover', function (d) {
      d3.select(this).attr('fill', scope.__highlightColor);
      scope.__tip.show(d);
    })
    .on('mouseout', function (d) {
      d3.select(this).transition().duration(350).attr('fill', scope.__colorFn);
      scope.__tip.hide(d);
    });
  if (this.__onClickFn) {
    bars.on('click', scope.__onClickFn);
  }

  //add text
  if (this.__includeLabels) {
    this.addLabels(frequency? 'count' : '%', this.getLabel(this.__valueField));
  }
};

module.exports = Histogram;
