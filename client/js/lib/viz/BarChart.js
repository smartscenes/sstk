'use strict';

var Chart = require('viz/Chart');
var Util = require('util/Util');

function BarChart(params) {
  Chart.call(this, params);
}

BarChart.prototype = Object.create(Chart.prototype);
BarChart.prototype.constructor = BarChart;

BarChart.prototype.__create = function (params) {
  var mappedParams = {};
  Util.copy(params, mappedParams);
  if (Array.isArray(params.data)) {

  } else if (params.data instanceof Object) {
    // Assume data is of the form { key: datum }
    var categories = Object.keys(params.data);
    mappedParams.data = categories;
    mappedParams.datamap = params.data;
  }

  if (mappedParams.bars === 'vertical') {
    this.__createVerticalBars(mappedParams);
  } else if (mappedParams.bars === 'radial') {
    this.__createRadialBars(mappedParams);
  } else {
    this.__createHorizontalBars(mappedParams);
  }
};

BarChart.prototype.__init = function (params) {
  var scope = this;

  this.__keyField = params.key || { label: 'Category' };
  this.__valueField = params.value || { label: 'Value' };
  this.__data = params.data;
  this.__datamap = params.datamap;
  this.__sort = params.sort;
  this.__sortOrder = params.sortOrder || 'desc';
  this.__sortField = params.sortField || this.__valueField;
  this.__minValue = this.__valueField.min || 0;
  this.__maxValue = this.__valueField.max || this.__computeMax(this.__valueField);

  this.__tooltipHtmlFn = params.tooltipHtmlFn || this.__getDefaultTooltipHtmlFn([this.__keyField, this.__valueField]);
  this.__onClickFn = params.onClickFn || function () {};
  this.__defaultColor = params.color || this.__defaultColor;
  this.__highlightColor = params.highlightColor || this.__defaultHighlightColor;
  this.__colorFn = params.colorFn || this.__defaultColor;

  //sort
  if (this.__sort) {
    if (scope.__sortOrder === 'desc') {
      this.__data = this.__data.sort(function (c1, c2) {
        return scope.getValue(scope.__sortField, c2) - scope.getValue(scope.__sortField, c1);
      });
    } else {
      this.__data = this.__data.sort(function (c1, c2) {
        return scope.getValue(scope.__sortField, c1) - scope.getValue(scope.__sortField, c2);
      });
    }
  }
  this.__categories = this.__data.map(function (d) { return scope.getValue(scope.__keyField, d); });

  //tooltip
  this.__tip = this.__createTooltip();
};

BarChart.prototype.__createHorizontalBars = function (params) {
  this.__init(params);

  var scope = this;

  var svg = this.__window.svg;
  var height = this.__window.height;
  var width = this.__window.width;

  //reset svg
  svg.html('');

  //scales
  var yScale = d3.scale.ordinal().domain(this.__categories).rangeBands([0, height], 0.1);
  var xScale = d3.scale.linear().domain([this.__minValue, this.__maxValue]).range([0, width]);

  //axes
  var yAxis = d3.svg.axis().scale(yScale).orient('left').outerTickSize(0);
  var xAxis = d3.svg.axis().scale(xScale).orient('bottom').outerTickSize(0);

  //no more zooming
  svg.on('.zoom', null);

  //append axes
  svg.append('g').attr('class', 'y axis').call(yAxis);
  svg.append('g').attr('class', 'x axis').call(xAxis).attr('transform', 'translate(0,' + height + ')');

  //add bars
  var bars = svg.selectAll('rect').data(this.__data)
    .enter().append('rect').attr('x', 0)
    .attr('y', function (d) {
      return yScale(scope.getValue(scope.__keyField, d)) || 0;
    })
    .attr('width', function (d) {
      return xScale(scope.getValue(scope.__valueField, d)) || 0;
    })
    .attr('height', yScale.rangeBand())
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
  if (this.__includeLabels) {
    this.addLabels(this.getLabel(this.__valueField),
      this.getLabel(this.__keyField));
  }
};

BarChart.prototype.__createVerticalBars = function (params) {
  this.__init(params);

  var scope = this;

  var svg = this.__window.svg;
  var height = this.__window.height;
  var width = this.__window.width;

  //reset svg
  svg.html('');

  //scales
  var xScale = d3.scale.ordinal().domain(this.__categories).rangeBands([0, width], 0.1);
  var yScale = d3.scale.linear().domain([this.__minValue, this.__maxValue]).range([height, 0]);

  //axes
  var yAxis = d3.svg.axis().scale(yScale).orient('left').outerTickSize(0);
  var xAxis = d3.svg.axis().scale(xScale).orient('bottom').outerTickSize(0);

  //no more zooming
  svg.on('.zoom', null);

  //append axes
  svg.append('g').attr('class', 'y axis').call(yAxis);
  svg.append('g').attr('class', 'x axis').call(xAxis).attr('transform', 'translate(0,' + height + ')')
    .selectAll('text')
    .attr('y', 0)
    .attr('x', 9)
    .attr('dy', '.35em')
    .attr('transform', 'rotate(45)')
    .style('text-anchor', 'start');

  //add bars
  var bars = svg.selectAll('rect').data(this.__data)
    .enter().append('rect').attr('y', function (d) {
      return yScale(scope.getValue(scope.__valueField, d)) || 0;
    })
    .attr('x', function (d) {
      return xScale(scope.getValue(scope.__keyField, d)) || 0;
    })
    .attr('height', function (d) {
      return height - (yScale(scope.getValue(scope.__valueField, d)) || 0);
    })
    .attr('width', xScale.rangeBand())
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
  if (this.__includeLabels) {
    this.addLabels(this.getLabel(this.__keyField),
      this.getLabel(this.__valueField));
  }
};

BarChart.prototype.__createRadialBars = function (params) {
  this.__init(params);

  var scope = this;

  var svg = this.__window.svg;
  var height = this.__window.height;
  var width = this.__window.width;
  var maxBarHeight = height / 2 - 5;

  //reset svg
  svg.html('');
  svg.attr("transform", "translate(" + this.__window.margin.left + width/2 + "," + this.__window.margin.top + height/2 + ")");

  //no more zooming
  svg.on('.zoom', null);

  //var extent = d3.extent(this.__data, function(d) { return scope.getValue(scope.__valueField, d); });
  var extent = [this.__minValue, this.__maxValue];

  //scales
  var barScale = d3.scale.linear().domain(extent).range([0, maxBarHeight]);
  var keys = this.__categories;
  var numBars = keys.length;

  //add bars
  var arc = d3.svg.arc()
    .startAngle(function(d,i) { return (i * 2 * Math.PI) / numBars; })
    .endAngle(function(d,i) { return ((i + 1) * 2 * Math.PI) / numBars; })
    .innerRadius(0);

  var bars = svg.selectAll('path').data(this.__data)
    .enter().append('path')
    .each(function(d) { d.outerRadius = 0; })
    .style("fill", scope.__colorFn )
    .attr("d", arc)
    .on('mouseover', function (d) {
      d3.select(this).attr('fill', scope.__highlightColor);
      scope.__tip.show(d);
    })
    .on('mouseout', function (d) {
      d3.select(this).transition().duration(350).attr('fill', scope.__colorFn);
      scope.__tip.hide(d);
    });
  bars.transition().ease("elastic").duration(1000).delay(function(d,i) {return (25-i)*100;})
    .attrTween("d", function(d,index) {
      var i = d3.interpolate(d.outerRadius, barScale(scope.getValue(scope.__valueField, d)));
      return function(t) { d.outerRadius = i(t); return arc(d,index); };
    });

  if (this.__onClickFn) {
    bars.on('click', scope.__onClickFn);
  }

  // Draw circles for grid
  if (scope.includeRadialCircles) {
    var nTicks = 3;
    var formatNumber = d3.format("s");
    var xScale = d3.scale.linear().domain(extent).range([0, -maxBarHeight]);
    var xAxis = d3.svg.axis().scale(xScale).orient("left").ticks(nTicks).tickFormat(formatNumber);

    var circles = svg.selectAll("circle")
      .data(x.ticks(nTicks))
      .enter().append("circle")
      .attr("r", function(d) {return barScale(d);})
      .style("fill", "none")
      .style("stroke", "black")
      .style("stroke-dasharray", "2,2")
      .style("stroke-width",".5px");

    // Big circle
    svg.append("circle")
      .attr("r", maxBarHeight)
      .classed("outer", true)
      .style("fill", "none")
      .style("stroke", "black")
      .style("stroke-width","1.5px");

    // append axes
    svg.append("g")
      .attr("class", "x axis")
      .call(xAxis);
  }

  // Draw lines for grid (angles)
  if (scope.includeRadialLines) {
    var lines = svg.selectAll("line")
      .data(keys)
      .enter().append("line")
      .attr("y2", - maxBarHeight - 20)
      .style("stroke", "black")
      .style("stroke-width",".5px")
      .attr("transform", function(d, i) { return "rotate(" + (i * 360 / numBars) + ")"; });
  }

  // Labels around the outside of the circle
  if (scope.__includeLabels) {
    var labelRadius = maxBarHeight * 1.025;

    var labels = svg.append("g")
      .classed("labels", true);

    labels.append("def")
      .append("path")
      .attr("id", "label-path")
      .attr("d", "m0 " + -labelRadius + " a" + labelRadius + " " + labelRadius + " 0 1,1 -0.01 0");

    labels.selectAll("text")
      .data(keys)
      .enter().append("text")
      .style("text-anchor", "middle")
      .style("font-weight","bold")
      .style("fill", function(d, i) {return "#3e3e3e";})
      .append("textPath")
      .attr("xlink:href", "#label-path")
      .attr("startOffset", function(d, i) {return i * 100 / numBars + 50 / numBars + '%';})
      .text(function(d) {return d.toUpperCase(); });
  }
};

BarChart.prototype.getValue = function (field, d) {
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


// TODO: Consolidate into the main BarChart class
BarChart.makeHorizontalBarChart = function (params) {

  var data = params.data;
  if (params.sort) { //sort data based on count
    data = data.sort(function (a, b) { return b.count - a.count; });
  }

  var canvasSelector = params.canvas; //get the canvas, div element containing the graph
  var defaultColor = params.color || 'steelblue';
  var categories = data.map(function (x) { //create an array containing the category names
    return x.name;
  });

  var paddedCategories = [''].concat(categories); //add empty string to the front
  var fontSize = '14px'; //parameters for the graph
  var barHeight = 19;
  var barHeightPadded = 30;
  var chartOffsetX = 150;

  var maxX = params.width; //dimensions of the graph
  var maxY = (categories.length + 1) * barHeightPadded;
  var canvasWidth = maxX + chartOffsetX + 25;
  var canvasHeight = maxY + 70;

  var counts = data.map(function (x) { //map counts to an array, now we have counts and categories
    return x.count;
  });
  var maxCount = Math.max.apply(Math, counts);
  var minCount = Math.min.apply(Math, counts);
  var tickInterval = Math.pow(10, maxCount.toString().length - 1);
  var tickCount = Math.ceil(maxCount / tickInterval);

  if (tickCount > 5) {
    tickInterval = tickInterval * 2;
    tickCount = Math.ceil(maxCount / tickInterval);
  }
  var maxDomainX = tickCount * tickInterval;
  var gridXCount = tickCount * 4;
  var gridX = maxX / gridXCount;

  var colors = data.map(function (x) {
    if (x.color) return x.color;
    else return defaultColor;
  });

  var grid = d3.range(gridXCount + 1).map(function (i) {
    return { 'x1': 0, 'y1': 0, 'x2': maxX, 'y2': maxY };
  });

  var tickVals = grid.map(function (d, i) {
    if (i > 0) {
      return i * tickInterval;
    } else if (i === 0) {
      return '0';
    }
  });

  var canvas = d3.select(canvasSelector)
    .append('svg')
    .attr({ 'width': canvasWidth, 'height': canvasHeight });

  var xscale = d3.scale.linear() //find out what scale is
    .domain([0, maxDomainX])
    .range([0, maxX]);


  var yscale = d3.scale.linear()
    .domain([0, paddedCategories.length])
    .range([0, maxY]);

  var colorScale = d3.scale.quantize()
    .domain([0, paddedCategories.length])
    .range(colors);

  var grids = canvas.append('g')
    .attr('id', 'grid')
    .attr('transform', 'translate(' + chartOffsetX + ',10)')
    .selectAll('line')
    .data(grid)
    .enter()
    .append('line')
    .attr({
      'x1': function (d, i) {
        return i * gridX;
      },
      'y1': function (d) {
        return d.y1;
      },
      'x2': function (d, i) {
        return i * gridX;
      },
      'y2': function (d) {
        return d.y2;
      }
    })
    .style({ 'stroke': '#adadad', 'stroke-width': '1px' });

  var xAxis = d3.svg.axis();
  xAxis
    .orient('bottom')
    .scale(xscale)
    .tickValues(tickVals);

  var yAxis = d3.svg.axis();
  yAxis //construct yAxis
    .orient('left')
    .scale(yscale)
    .tickSize(2)
    .tickFormat(function (d, i) {
      var str = paddedCategories[i];
      if (str.length > 17) {
        return str.substr(0, 15) + '\u2026';
      } else {
        return str;
      }
    })
    .tickValues(d3.range(paddedCategories.length));

  var yAxisG = canvas.append('g')
    .attr('transform', 'translate(' + chartOffsetX + ',0)')
    .attr('id', 'yaxis')
    .call(yAxis);

  var tip = Chart.d3Tip()
    .attr('class', 'd3-tip')
    .offset([-10, 0])
    .html(function (d,i) {
      return paddedCategories[i];
    });
  canvas.call(tip);
  yAxisG.selectAll(".tick")  
    .on('mouseover', function (d,i) {
      tip.show(d,i);
    })
    .on('mouseout', function (d,i) {
      tip.hide(d,i);
    });

  var xAxisG = canvas.append('g')
    .attr('transform', 'translate(' + chartOffsetX + ',' + maxY + ')')
    .attr('id', 'xaxis')
    .call(xAxis);

  var chart = canvas.append('g')
    .attr('transform', 'translate(' + chartOffsetX + ',0)')
    .attr('id', 'bars')
    .selectAll('rect')
    .data(counts)
    .enter()
    .append('rect')
    .attr('height', barHeight)
    .attr({
      'x': 0, 'y': function (d, i) {
        return yscale(i) + barHeight;
      }
    })
    .style('fill', function (d, i) {
      return colorScale(i);
    })
    .on('click', params.onClick || function (d, i) {
        var link = data[i].link;
        if (link) {
          window.location = link;
        }
      })
    .attr('width', function (d) {
      return 0;
    });

  var transit = d3.select('svg').selectAll('rect')
    .data(counts)
    .transition()
    .duration(1000)
    .attr('width', function (d) {
      return xscale(d);
    });

  var transitext = d3.select('#bars')
    .selectAll('text')
    .data(counts)
    .enter()
    .append('text')
    .attr({
      'x': function (d) {
        return xscale(d) / 2;
      }, 'y': function (d, i) {
        return yscale(i) + barHeightPadded + 5;
      }
    })
    .text(function (d) {
      return d;
    }).style({ 'fill': '#fff', 'font-size': fontSize });
};

// Exports
module.exports = BarChart;
