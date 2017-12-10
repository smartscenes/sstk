'use strict';

var AssetManager = require('assets/AssetManager');
var DataUtils = require('data/DataUtils');
var FileSaver = require('filesaverjs');

var ScatterPlot = require('viz/ScatterPlot');
var PieChart = require('viz/PieChart');
var BarChart = require('viz/BarChart');
var Histogram = require('viz/Histogram');

// Chart types
Visualizer.SCATTER_PLOT = 'Scatterplot';
Visualizer.BAR_CHART_AVERAGE = 'Bar Chart-Average';
Visualizer.BAR_CHART_COUNTS = 'Bar Chart-Count';
Visualizer.PIE_CHART_AVERAGE = 'Pie Chart-Average';
Visualizer.PIE_CHART_COUNTS = 'Pie Chart-Count';

Visualizer.CATEGORICAL = 'categorical';
Visualizer.BOOLEAN = 'boolean';
Visualizer.NUMERIC = 'numeric';

// TODO: Remove
Visualizer.COUNTS = 'count';
Visualizer.AVERAGE = 'average';

Visualizer.AGGR_CNT = { name: 'CNT', fn: function (arr) { return arr.length; } };
Visualizer.AGGR_SUM = { name: 'SUM', fn: function (arr, acc) { return d3.sum(arr, acc); } };
Visualizer.AGGR_MIN = { name: 'MIN', fn: function (arr, acc) { return d3.min(arr, acc); } };
Visualizer.AGGR_MAX = { name: 'MAX', fn: function (arr, acc) { return d3.max(arr, acc); } };
Visualizer.AGGR_MEAN = { name: 'MEAN', fn: function (arr, acc) { return d3.mean(arr, acc); } };

// TODO: Use new Visualizer terminology
// NOTE: dataviz terminology is nominal(categorical/boolean), ordered, interval, ratio (0 meaningful)
Visualizer.NOMINAL = 'nominal';
Visualizer.ORDERED = 'ordered';
Visualizer.INTERVAL = 'interval';
Visualizer.RATIO = 'ratio';

Visualizer.ChartTypes = [
  {
    name: 'Bar Chart',
    // Overall options
    options: [
      { name: 'bars', type: 'string', values: ['vertical', 'horizontal', 'radial'] },
      { name: 'key', type: ['attribute:categorical'] },
      { name: 'value', type: ['attribute:numeric'] },
      { name: 'color', type: ['attribute', 'color'], optional: true },
      { name: 'sort', type: 'boolean'},
      { name: 'sortOrder', type: 'string', values: ['asc', 'desc'],
        precondition: function(options) { return options.sort; } },
      { name: 'sortField', type: ['attribute'], optional: true }
    ]
  },
  {
    name: 'Histogram',
    // Overall options
    options: [
      { name: 'bars', type: 'string', values: ['vertical', 'horizontal'] },
      { name: 'value', type: ['attribute'] },
      { name: 'color', type: ['attribute', 'color'], optional: true }
    ]
  },
  {
    name: 'Pie Chart',
    // Overall options
    options: [
      { name: 'key', type: ['attribute:categorical'] },
      { name: 'value', type: ['attribute:numeric'] },
      { name: 'color', type: ['attribute', 'color'], optional: true }
    ]
  },
  {
    name: 'Scatter Plot',
    // Overall options
    options: [
      { name: 'x', type: ['attribute:numeric'] },
      { name: 'y', type: ['attribute:numeric'] },
      { name: 'color', type: ['attribute', 'color'], optional: true }
    ]
  }
];

// TODO: Create visualization options
function VisualizationOptions(params) {
  // Options are chartType: BAR_CHART, PIE_CHART, SCATTER_PLOT
  // Chart specific options: e.g, vertical vs horizontal for BAR_CHART
  // List of fields (potentially computed/aggregated fields) and their encoding:
  // Possible encodings: color, size, shape, x/y/r dimensions
}

function Visualizer(params) {
  this.ui = params.ui;
  this.schema = params.schema;
  this.charts = [];
}

Visualizer.prototype.getPossibleVisualizations = function (firstField, secondField) {
  var d1 = (firstField === 'COUNT')? Visualizer.COUNTS : this.schema.getFieldType(firstField);
  var d2 = (secondField === 'COUNT')? Visualizer.COUNTS : this.schema.getFieldType(secondField);

  if (d1 === Visualizer.NUMERIC && d2 === Visualizer.NUMERIC) {
    return [Visualizer.SCATTER_PLOT];
  } else if ((d1 === Visualizer.CATEGORICAL || d1 === Visualizer.BOOLEAN) && d2 === Visualizer.NUMERIC) {
    return [Visualizer.BAR_CHART_AVERAGE, Visualizer.PIE_CHART_AVERAGE];
  } else if (d1 === Visualizer.NUMERIC && d2 === Visualizer.COUNTS) {
    return [Visualizer.BAR_CHART_COUNTS, Visualizer.PIE_CHART_COUNTS];
  } else if ((d1 === Visualizer.CATEGORICAL || d1 === Visualizer.BOOLEAN) && d2 === Visualizer.COUNTS) {
    return [Visualizer.BAR_CHART_COUNTS, Visualizer.PIE_CHART_COUNTS];
  }
};

Visualizer.prototype.clear = function () {
  for (var i = 0; i < this.charts.length; i++) {
    this.charts[i].destroy();
  }
  this.charts = [];
};

Visualizer.prototype.exportPinned = function(filename) {
  var allData = {};
  for (var i = 0; i < this.charts.length; i++) {
    var data = this.charts[i].getPinnedData();
    if (data && data.length > 0) {
      allData[this.charts[i].name] = data;
    }
  }
  var blob = new Blob([JSON.stringify(allData)], {type: "text/plain;charset=utf-8"});
  FileSaver.saveAs(blob, filename);
};

//creates a standard graphics window for rendering graphs
Visualizer.prototype.createGraphWindow = function (graphWidth, graphHeight, margin) {
  this.clear();
  if (!this.graphWindow) {
    this.graphWindow = d3.select(this.ui.graphWindow).append('svg');
  }
  var gWindow = this.graphWindow;

  gWindow.html('');

  var width = graphWidth - margin.right - margin.left;
  var height = graphHeight - margin.top - margin.bottom;

  var svg = gWindow.attr('width', graphWidth)
    .attr('height', graphHeight)
    .append('g')
    .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

  return { svg: svg, width: width, height: height, margin: margin, selection: gWindow };
};

Visualizer.prototype.createDefaultWindow = function () {
  return this.createGraphWindow(this.ui.defaultWidth, this.ui.defaultHeight, this.ui.defaultMargins);
};

//pie chart to visualize counts of 3D model properties
Visualizer.prototype.createPieChart = function (field, valueLabel, countData) {
  var window = this.createDefaultWindow();

  var pieChart = new PieChart({
    key: { field: field, label: this.schema.getDisplayText(field) },
    value: { label: valueLabel },
    data: countData.counts,
    window: window
  });
  this.charts.push(pieChart);
  return pieChart;
};

//horizontal bar charts for categories
Visualizer.prototype.createCategoryBarChart = function (field, countData, secondField, sort) {
  var minHeight = 15;
  var newHeight = this.ui.defaultHeight;
  var counts = countData.counts;

  //categories
  var categories = Object.keys(counts);

  //increase height if necessary to prevent label overlap
  if (newHeight / categories.length < minHeight) {
    newHeight = categories.length * minHeight;
  }

  var newMargin = this.ui.defaultMargins;

  //params
  var window = this.createGraphWindow(this.ui.defaultWidth, newHeight, newMargin);
  window.svg.style('overflow', 'auto');

  var barChart = new BarChart({
    key: { field: field, label: this.schema.getDisplayText(field) },
    value: { field: secondField, label: this.schema.getDisplayText(secondField), max: countData.maxCount },
    data: countData.counts,
    sort: sort,
    bars: 'horizontal',
    xLabelPosition: 'top',
    includeLabels: true,
    window: window
  });
  this.charts.push(barChart);
  return barChart;
};


//function to generate histogram of various field counts, field must be a numeric domain
Visualizer.prototype.createHistogram = function (field, data) {
  data = DataUtils.filterData(field, data);

  //settings
  var settings = this.ui.getSettings();
  var frequency = settings.histogram.frequency;

  var window = this.createDefaultWindow();
  var scope = this;
  var histogram = new Histogram({
    value: {field: field, label: this.schema.getDisplayText(field)},
//    value: { label: valueLabel },
    data: data,
    bars: 'vertical',
    frequency: frequency,
    numBins: settings.histogram.numBins,
    includeLabels: true,
    binTicks: 10,
    countTicks: 10,
    xLabelPosition: 'top',
    window: window,
    onClickFn: function(d) {
      if (d.length > 20) {
        scope.createHistogram(field, d);
      }
    }
  });
  this.charts.push(histogram);
  return histogram;
};

//creates a scatterplot given two numeric field domains
Visualizer.prototype.createScatterPlot = function (params) {
  var xField = params.x;
  var yField = params.y;
  var xLabel = this.schema.getDisplayText(xField);
  var yLabel = this.schema.getDisplayText(yField);
  var data = params.data;

  var scope = this;
  var fieldArray = ['id', 'source', xField, yField, 'wnlemmas'];
  var tooltipHtmlFn = function (d) {
    return scope.generateTooltipText(fieldArray, d);
  };
  var showItemFn = function (d) {
    var fullId = AssetManager.toFullId(d.source, d.id);
    var url = 'simple-model-viewer2.html?modelId=' + fullId;
    d3.select('#itemFrame').property('src', url);
    var imgURL = scope.ui.assetManager.getImagePreviewUrl(d.source, d.id, undefined, d);
    d3.select('#itemImage').property('src', imgURL);
    $('.itemViewerDialog').dialog('open');
  };
  var colorFn = params.colorFn;
  //rudimentary color visualization based on triangle count
  if (params.testColorFn) {
    var normalizedScale = d3.scale.linear().domain([0, 20]).range([0, 1]);
    colorFn = function (d, i) {
      var quality = normalizedScale(Math.log(d['nfaces'] * d['nmaterials']));
      return d3.rgb(255 - quality * 255, 255 - quality * 255, 255 - quality * 255);
    };
  }
  if (!colorFn) {
    colorFn = this.getColorFnFromData(data);
  }

  var window = this.createDefaultWindow();

  var scatterPlot = new ScatterPlot({
    x: { field: xField, label: xLabel },
    y: { field: yField, label: yLabel },
    data: data,
    colorFn: colorFn,
    //onClickFn: onClickFn,
    tooltipHtmlFn: tooltipHtmlFn,
    window: window
  });
  scatterPlot.onClick(function (d) {
    var tooltip = scatterPlot.pinTooltip(d);
    var id = tooltip.attr('id');
    var s = d3.select(this);
    var color = s.style('fill');
    s.style('fill', 'red');
    $('#' + id + ' .close').click( function() {
      s.style('fill', color);
    });
    // Make clicking on image open 3D view
    d3.select('#' + id).select(' img.tooltipImage')
      .on('click', function () { showItemFn(d); });
  });
  this.charts.push(scatterPlot);
  return scatterPlot;
};

//use for numeric field
Visualizer.prototype.getColorFnFromData = function (data) {

  var settings = this.ui.getSettings();
  var diverging = settings.scatterplot.diverging;
  var field = settings.scatterplot.colorDomain;
  var fieldType = this.schema.getFieldType(field);
  var color;

  if (field === 'none') {
    return;
  }

  if (fieldType === 'numeric') {
    var max = DataUtils.max(field, data);
    var min = DataUtils.min(field, data);
    var step = Math.floor((max - min) / 5);
    color = d3.scale.linear();

    if (diverging) {
      color
        .domain([min, min + step, min + 2 * step, min + step * 3, max])
        .range(['blue', 'green', 'yellow', 'orange', 'red']);
    } else {
      color.domain([min, max]).range(['white', '#000073']);
    }
    return function (d, i) {
      return color(d[field]);
    };
  } else {
    color = d3.scale.category20b();
    return function (d, i) {
      return color(d[field]);
    };
  }
};

Visualizer.prototype.generateTooltipText = function (fieldArray, d) {
  var scope = this;
  var str = '';
  fieldArray.forEach(function (fieldname) {
    var attribute = scope.schema.getDisplayText(fieldname);
    var value = d[fieldname];
    str += '<strong>' + attribute + ':</strong> <span style="color:red">' + value + '</span> <br>';
  });

  str += '<img class="tooltipImage" src="' + this.ui.assetManager.getImagePreviewUrl(d.source, d.id, undefined, d) + '">';
  return str;
};

//exports
module.exports = Visualizer;
