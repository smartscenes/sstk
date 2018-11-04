'use strict';

var ModelSchema = require('model/ModelSchema');
var DataModel = require('data/DataModel');
var DataUtils = require('data/DataUtils');
var VisualSchemaSearch = require('ui/VisualSchemaSearch');
var AssetManager = require('assets/AssetManager');
var AssetsDb = require('assets/AssetsDb');
var keymap = require('controls/keymap');
var UIUtil = require('ui/UIUtil');
var _ = require('util/util');

function DataVizUI(params) {
}

DataVizUI.prototype.loadCustomAttributes = function (file) {
  var scope = this;
  this.assetsDb.loadAssetInfo(undefined, file, function(err, assets) {
//    scope.schema.updateFields(assets.fields);
    scope.schema.setFields(assets.fields);
    scope.onSchemaUpdated();
    console.log(assets);
  });
};

DataVizUI.prototype.initialize = function (params) {
  this.schema = params.schema || new ModelSchema();

  this.graphWindow = params.graphView;  // NOTE: name difference is important

  //link visualizer to UI
  this.__Visualizer = require('viz/DataVisualizer');
  this.viz = new this.__Visualizer({
    ui: this,
    schema: this.schema
  });

  // Custom loading options
  var fileInput = UIUtil.createFileInput({
    id: 'csv', label: 'CSV',
    loadFn: this.loadCustomAttributes.bind(this),
    help: 'CSV with model id (fullId) and fields'
  });
  $(params.customLoading).append(fileInput.group);

  // Add graphview
  this.graphView = $(params.graphView);

  this.defaultWidth = Math.max(this.graphView.width() - 50, 500);
  this.defaultHeight = Math.max(this.graphView.height() - 50, 500);
  this.defaultMargins = { top: 50, bottom: 50, right: 50, left: 200 };

  //asset manager
  this.assetManager = new AssetManager({
    autoAlignModels: true,
    autoScaleModels: true,
    useBuffers: true,
    useDynamic: true, // set dynamic to be true so our picking will work
    previewImageIndex: 13
  });
  this.assetsDb = new AssetsDb({
    fieldOptions: { keepValues: true, keepCounts: true, keepStats: true }
  });
  this.assetManager.registerAssetsDb(this.assetsDb);

  // add data constraints gui
  this.visualSearch = new VisualSchemaSearch({
    container: $(params.filterPanel),
    filters: params.filters,
    schema: this.schema
  });

  //constraints
  this.queryString = ''; //default query string
  this.initializeWidgets();
  this.bindKeys();

  this.onAttributeChange();
};

DataVizUI.prototype.bindKeys = function () {
  var scope = this;
  keymap({on: 'ctrl-e', do: 'Export pinned data'}, function () {
    scope.viz.exportPinned("pinned.json");
  });
};

DataVizUI.prototype._createFieldOption = function (fieldname) {
  return $('<option>').attr('value', fieldname).text(this.schema.getDisplayText(fieldname));
};

DataVizUI.prototype._createOption = function (value, text) {
  return $('<option>').attr('value', value).text(text);
};

DataVizUI.prototype.initializeWidgets = function () {
  var scope = this;
  scope.onSchemaUpdated();
  $('#vizAttr1').val('aligned.dims_0_d');
  $('#vizAttr2').val('aligned.dims_1_d');

  $('.selectVizAttr').selectmenu({
    position: { my: 'left bottom', at: 'left top', collision: 'none' },
    change: function () {
      scope.onAttributeChange();
    }
  });
  // Have some reasonable default setting
  $('.selectVisualization').selectmenu({
    position: { my: 'left bottom', at: 'left top', collision: 'none' }
  });

  //submit button
  $('#visualizeButton').click(function () {
    scope.visualize();
  });

  //scatterplot model viewer
  $('.itemViewerDialog').dialog({
    autoOpen: false,
    width: 600,
    height: 650
  });
  $('#viewerTabs').tabs();

  scope.initializeSettings();
};

DataVizUI.prototype.onSchemaUpdated = function () {
  var scope = this;
  var attributes = this.schema.getFieldNames();
  $('.selectVizAttr').empty();
  $('#selectColorField').empty();
  attributes.forEach(function (attribute) {
    $('.selectVizAttr').append(scope._createFieldOption(attribute));
    $('#selectColorField').append(scope._createFieldOption(attribute));
  });
  $('.selectVizAttr').append(scope._createOption('COUNT', 'COUNT'));  // Add specify field for now (to be removed)
};


DataVizUI.prototype.initializeSettings = function () {
  var scope = this;
  $('.settingsDialog').dialog({
    autoOpen: false,
    width: 500,
    height: 250
  });

  $('.settingsButton').click(function () {
    $('.settingsDialog').dialog('open');
  });

  $('#countDisplay').buttonset();
  $('#settingsTabs').tabs();
  $('#binSpinner').spinner();
  $('#binSpinner').spinner('value', 20);

  var attributes = this.schema.getFieldNames();
  attributes.forEach(function (attribute) {
    $('#selectColorField').append(scope._createFieldOption(attribute));
  });

  $('#selectColorField').append('<option selected="selected">' + 'none' + '</option>');

  $('#selectColorType').buttonset();

  $('#selectColorType :radio:checked + label').text();
};

DataVizUI.prototype.getSettings = function () {
  var settingsObject = {
    histogram: {
      numBins: $('#binSpinner').spinner('value'),
      frequency: $('#countDisplay :radio:checked + label').text() === 'Frequency'
    },

    scatterplot: {
      colorDomain: $('#selectColorField').val(),
      diverging: $('#selectColorType :radio:checked + label').text() === 'Diverging'
    },

    pieChart: {}
  };

  return settingsObject;
};

DataVizUI.prototype.onAttributeChange = function () {
  var attr1 = $('#vizAttr1').val();
  var attr2 = $('#vizAttr2').val();

  var possibleVisualizations = this.viz.getPossibleVisualizations(attr1, attr2);
  $('.selectVisualization').html(''); //refresh options

  if (possibleVisualizations) {
    possibleVisualizations.forEach(function (vis) {
      $('.selectVisualization').append('<option>' + vis + '</option>');
    });
    $('#visualizeButton').prop('disabled', false);
  } else {
    $('.selectVisualization').append('<option>None</option>');
    $('#visualizeButton').prop('disabled', true);
  }

  $('.selectVisualization').selectmenu('refresh');
};

DataVizUI.prototype.visualize = function () {
  var scope = this;
  this.firstField = $('#vizAttr1').val();
  this.secondField = $('#vizAttr2').val();

  var chartType = $('.selectVisualization').val();

  if (!chartType) return;

  if (chartType === this.__Visualizer.SCATTER_PLOT) this.callback = this.generateScatterPlot;
  else if (chartType === this.__Visualizer.BAR_CHART_AVERAGE) this.callback = this.generateAverageBarChart;
  else if (chartType === this.__Visualizer.BAR_CHART_COUNTS) this.callback = this.generateCountsBarChart;
  else if (chartType === this.__Visualizer.PIE_CHART_AVERAGE) this.callback = this.generateAveragePieChart;
  else if (chartType === this.__Visualizer.PIE_CHART_COUNTS) this.callback = this.generateCountsPieChart;

  var queryString = this.visualSearch.getQueryString();
  // Check if constraints changed
  if (this.queryString !== queryString || !this.data) {
    if (scope.assetsDb.assetInfos.length > 0) {
      scope.assetsDb.query({ query: queryString, start: 0, limit: -1 }, function(err, resp) {
        if (resp && resp.response && resp.response.docs) {
          scope.data = resp.response.docs;
          for (var i = 0; i < scope.data.length; i++) {
            var d = scope.data[i];
            if (!d.datasets) {d.datasets = ['ShapeNetCore'];}  // HACK!!!
          }
          scope.callback(scope.data);
        }
      });
    } else {
      // TODO: Only query for relevant fields
      var query = new DataModel(scope.schema.searchUrl, queryString, scope.schema.getQueryFieldNames(),
        function (data) {
          scope.data = data;
          // Augment with our data in assets
          if (data) {
            for (var i = 0; i < data.length; i++) {
              var d = data[i];
              var assetInfo = scope.assetsDb.getAssetInfo(d.fullId);
              if (assetInfo) {
                _.merge(d, assetInfo);
              }
            }
            return scope.callback(data);
          } else {
            console.error('Error getting data for query: ' + queryString);
          }
        });
      query.schema = this.schema;
      query.queryData();
    }
  } else {
    scope.callback(scope.data);
  }
  this.queryString = queryString;
};

//graphing methods
DataVizUI.prototype.generateScatterPlot = function (data) {
  this.viz.createScatterPlot({
    x: this.firstField,
    y: this.secondField,
    data: data
  });
};

DataVizUI.prototype.generateAverageBarChart = function (data) {
  var countData = DataUtils.getAverageData(this.firstField, this.secondField, data);
  this.viz.createCategoryBarChart(this.firstField, countData, this.secondField, true);
};

DataVizUI.prototype.generateCountsBarChart = function (data) {
  if (this.schema.getFieldType(this.firstField) === 'numeric') {
    this.viz.createHistogram(this.firstField, data);
  } else {
    var countData = DataUtils.getCategoryCounts(this.firstField, data);
    this.viz.createCategoryBarChart(this.firstField, countData, null, true);
  }
};

DataVizUI.prototype.generateAveragePieChart = function (data) {
  var countData = DataUtils.getAverageData(this.firstField, this.secondField, data);
  this.viz.createPieChart(this.firstField, this.__Visualizer.AVERAGE, countData);
};

DataVizUI.prototype.generateCountsPieChart = function (data) {
  if (this.schema.getFieldType(this.firstField) === 'numeric') {
    var countData = DataUtils.getCountData(this.firstField, data, 20);
    this.viz.createPieChart(this.firstField, this.__Visualizer.COUNTS, countData);
  } else {
    var countData = DataUtils.getCategoryCounts(this.firstField, data);
    this.viz.createPieChart(this.firstField, this.__Visualizer.COUNTS, countData);
  }
};

module.exports = DataVizUI;
