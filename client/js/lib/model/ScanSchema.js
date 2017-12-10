'use strict';

var Constants = require('Constants');
var DataSchema = require('data/DataSchema');
var SearchController = require('search/SearchController');
var _ = require('util');

// Defines fields we care about for scans
var fields = [
  { name: 'id', type: 'categorical', excludeFromFacet: true },
  { name: 'datasets', type: 'categorical' },
  { name: 'sceneLabel', type: 'categorical' },
  { name: 'sceneName', type: 'categorical' },
  { name: 'sceneType', type: 'categorical' },
  { name: 'deviceId', type: 'categorical' },
  { name: 'deviceName', type: 'categorical' },
  { name: 'numColorFrames', type: 'numeric' },
  { name: 'annotatedSegments', type: 'numeric' },
  { name: 'annotatedVertices', type: 'numeric' },
  { name: 'unannotatedSegments', type: 'numeric' },
  { name: 'unannotatedVertices', type: 'numeric' },
  { name: 'totalSegments', type: 'numeric' },
  { name: 'totalVertices', type: 'numeric' },
  { name: 'numLabels', type: 'numeric' },
  { name: 'numObjects', type: 'numeric' },
  { name: 'percentComplete', type: 'numeric' },
  { name: 'numSegmentGroups', type: 'numeric' },
  { name: 'floorArea', type: 'numeric' },
  { name: 'floorAreaFilled', type: 'numeric' },
  { name: 'bbDimX', type: 'numeric' },
  { name: 'bbDimY', type: 'numeric' },
  { name: 'bbDimZ', type: 'numeric' }
];

function ScanSchema(params) {
  params = params || {};
  var searchController = new SearchController();
  searchController.enableFiltering(false);
  var dataSchemaParams = {
    name: 'scan',
    searchController: searchController,
    schemaUrl: params.schemaUrl,
    searchUrl: params.searchUrl,
    fields: fields,
    source: 'scan',
    doQueryFields: true
  };
  params = _.defaultsDeep(params, dataSchemaParams);
  DataSchema.call(this, params);
}

ScanSchema.prototype = Object.create(DataSchema.prototype);
ScanSchema.prototype.constructor = ScanSchema;

Constants.assetTypes['scan'].schema = ScanSchema;

module.exports = ScanSchema;
