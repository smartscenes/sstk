'use strict';

var Constants = require('Constants');
var DataSchema = require('data/DataSchema');
var SearchController = require('search/SearchController');
var _ = require('util');

// Defines fields we care about for scans
var fields = [
  { name: 'id', type: 'categorical', excludeFromFacet: false, description: 'Unique id of scan' },
  { name: 'datasets', type: 'categorical', description: 'Dataset that the scan belongs to' },
  { name: 'sceneName', type: 'categorical', description: 'Name of scene (some scenes are scanned multiple times and will have multiple scans)' },
  { name: 'sceneType', type: 'categorical', description: 'Type of scene',
    examples: [{ query: 'sceneType:Kitchen', description:'Scans labeled as Kitchen' }]
  },
  { name: 'labels', type: 'categorical', description: 'Object label',
    examples: [{ query: 'labels:chair', description:'Scans with objects identified as chairs' }]
  },
  { name: 'deviceId', type: 'categorical', description: 'Id of device used for scan' },
  { name: 'numColorFrames', type: 'numeric', description: 'Number of colored frames' },
  { name: 'numDepthFrames', type: 'numeric', description: 'Number of depth frames' },
  { name: 'numIMUMeasurements', type: 'numeric', description: 'Number of IMU measurements' },
  { name: 'annotatedSegments', type: 'numeric', description: 'Number of annotated segments' },
  { name: 'annotatedVertices', type: 'numeric', description: 'Number of annotated vertices' },
  { name: 'unannotatedSegments', type: 'numeric', description: 'Number of unannotated segments' },
  { name: 'unannotatedVertices', type: 'numeric', description: 'Number of unannotated vertices' },
  { name: 'totalSegments', type: 'numeric', description: 'Number of total segments' },
  { name: 'totalVertices', type: 'numeric', description: 'Number of total vertices' },
  { name: 'numLabels', type: 'numeric', description: 'Number of unique labels',
    examples: [{ query: 'numLabels:[5 TO *]', description: 'Scans with at least 5 unique labels'}]
  },
  { name: 'numObjects', type: 'numeric', description: 'Number of labeled objects',
    examples: [{ query: 'numObjects:[5 TO 10]', description: 'Scans with between 5 and 10 objects'}]
  },
  { name: 'percentComplete', type: 'numeric', description: 'Percent complete as percent of annotated vertices',
    examples: [{ query: 'percentComplete:[60 TO *]', description: 'Scans that are at least 60 percent annotated'}]
  },
  { name: 'floorArea', type: 'numeric', description: 'Floor area (unfilled) in m^2' },
  { name: 'floorAreaFilled', type: 'numeric', description: 'Floor area (with holes filled) in m^2',
    examples: [{ query: 'floorAreaFilled:[10 TO *]', description: 'Scans with floor area of at least 10 m^2'}]
  },
  { name: 'bbDimX', type: 'numeric', description: 'Bounding box size (of unaligned mesh) in x dimension'  },
  { name: 'bbDimY', type: 'numeric', description: 'Bounding box size (of unaligned mesh) in y dimension' },
  { name: 'bbDimZ', type: 'numeric', description: 'Bounding box size (of unaligned mesh) in z dimension (this is the up direction)' }
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
    source: 'scans',
    doQueryFields: true
  };
  params = _.defaultsDeep(params, dataSchemaParams);
  DataSchema.call(this, params);
}

ScanSchema.prototype = Object.create(DataSchema.prototype);
ScanSchema.prototype.constructor = ScanSchema;

Constants.assetTypes['scan'].schema = ScanSchema;

module.exports = ScanSchema;
