'use strict';

var Constants = require('Constants');
var DataSchema = require('data/DataSchema');
var SearchController = require('search/SearchController');
var _ = require('util');

// Defines fields we care about for rooms
var fields = [
  { name: 'id', type: 'categorical', excludeFromFacet: true },
  { name: 'datasets', type: 'categorical' },
  { name: 'source', type: 'categorical' },
//  { name: 'category', type: 'categorical' },

  { name: 'sceneId', type: 'categorical' },
  { name: 'level', type: 'numeric', min: 0,
    description: 'Index (0-based) of the level the room is in',
    examples: [{ query: 'level:0', description: 'Rooms on the first level' }]
  },
//  { name: 'wnhyperlemmas', text: 'hypersynset', type: 'categorical', excludeFromFacet: true, suggestMethod: 'solr' },
//  { name: 'wnlemmas', text: 'synset', type: 'categorical', excludeFromFacet: true, suggestMethod: 'solr' },
  { name: 'nwalls', text: '# of walls',  type: 'numeric', min: 0,
    examples: [{ query: 'nwalls:4', description: 'Rooms with exactly four walls' },
      { query: 'nwalls:[5 TO 20]', description: 'Rooms with 5 to 20 walls' },
      { query: 'nwalls:[21 TO *]', description: 'Rooms with more than 20 walls (not real houses)' }
    ]
  },
  { name: 'nwindows', text: '# of windows',  type: 'numeric', min: 0,
    examples: [{ query: 'nwindows:1', description: 'Rooms with one window' }]
  },
  { name: 'ndoors', text: '# of doors',  type: 'numeric', min: 0,
    examples: [{ query: 'ndoors:2', description: 'Rooms with two doors' }]
  },
  { name: 'npeople', text: '# of people',  type: 'numeric', min: 0,
    examples: [{ query: 'npeople:0', description: 'Rooms without people' },
      { query: 'npeople:[1 TO *]', description: 'Rooms with at least one person' }]
  },
  { name: 'nobjects', text: '# of objects',  type: 'numeric', min: 0,
    description: 'number of other objects (not people, windows, doors) in rooms',
    examples: [{ query: 'nobjects:0', description: 'Rooms without any other objects' }]
  },
  { name: 'nmisc', text: '# of other stuff',  type: 'numeric', min: 0,
    description: 'number of other procedurally generated items (e.g. boxes) in rooms',
    examples: [{ query: 'nmisc:0', description: 'Rooms with no boxes' },
      { query: 'nmisc:[1 TO *]', description: 'Rooms with at least one box' }]
  },
//  { name: 'popularity', type: 'numeric' },
//  { name: 'modelQuality', type: 'numeric' },
//  { name: 'unit', type: 'numeric' },
//  { name: 'unit.source', type: 'categorical' }
  { name: 'nmodels', text: '# of models', type: 'numeric', min: 0,
    description: 'total number of models (doors, windows, people, other objects) in scenes'
  },
  { name: 'modelCats', type: 'categorical',
    examples: [
      { query: 'modelCats:garage_door', description: 'Rooms with garage_door' },
      { query: '!modelCats:door', description: 'Rooms without any doors' }]
  },
  { name: 'modelIds', type: 'categorical', excludeFromFacet: true },
  { name: 'roomTypes', type: 'categorical',
    description: 'Best guess at whether to room is a Bedroom, Bathroom, etc by the SUNCG team (each room can have multiple room types)',
    examples: [{ query: 'roomTypes:Bedroom', description: 'Rooms that are bedrooms' },
      { query: '!roomTypes:*', description: 'Rooms with unknown types' }]
  },
  { name: 'origRoomTypes', type: 'categorical',
    description: 'Original room type from the initial data' },

  { name: 'floorArea', type: 'numeric',
    description: 'Room floor area in square meters',
    examples: [{ query: 'floorArea:[10 TO *]', description: 'Room with floor area of more than 10 sq meters'}]
  },

  { name: 'dims_0_d', text: 'bbox dims x',  mainField: 'dims', type: 'numeric',
    description: 'Room bounding box x (width) in meters',
    examples: [{ query: 'dims_0_d:[4 TO 10]', description: 'Room with bounding box width of 4 to 10 meters'}]
  },
  { name: 'dims_1_d', text: 'bbox dims y',  mainField: 'dims', type: 'numeric',
    description: 'Room bounding box y (height) in meters',
    examples: [{ query: 'dims_1_d:[3 TO *]', description: 'Rooms taller than 3 meters (rare)'}]
  },
  { name: 'dims_2_d', text: 'bbox dims z', mainField: 'dims', type: 'numeric',
    description: 'Room bounding box z (depth) in meters',
    examples: [{ query: 'dims_2_d:[0 TO 4]', description: 'Room with bounding box depth of up to 4 meters'}]
  },

  { name: 'minPoint_0_d', text: 'bbox min x', mainField: 'minPoint', type: 'numeric',
    description: 'Room bounding box min x'
  },
  { name: 'minPoint_1_d', text: 'bbox min y', mainField: 'minPoint', type: 'numeric',
    description: 'Room bounding box min y'
  },
  { name: 'minPoint_2_d', text: 'bbox min z', mainField: 'minPoint', type: 'numeric',
    description: 'Room bounding box min z'
  },

  { name: 'maxPoint_0_d', text: 'bbox max x', mainField: 'maxPoint', type: 'numeric',
    description: 'Room bounding box max z'
  },
  { name: 'maxPoint_1_d', text: 'bbox max y', mainField: 'maxPoint', type: 'numeric',
    description: 'Room bounding box max z'
  },
  { name: 'maxPoint_2_d', text: 'bbox max z', mainField: 'maxPoint', type: 'numeric',
    description: 'Room bounding box max z'
  }
];

function RoomSchema(params) {
  params = params || {};
  var searchController = new SearchController({ sources: ['rooms'] });
  searchController.enableFiltering(false);
  var dataSchemaParams = {
    name: 'room',
    searchController: searchController,
    schemaUrl: Constants.roomsFieldsUrl,
    searchUrl: Constants.roomsSearchUrl,
    fields: fields,
    source: 'rooms',
    doQueryFields: true
  };
  params = _.defaultsDeep(params, dataSchemaParams);
  DataSchema.call(this, params);
}

RoomSchema.prototype = Object.create(DataSchema.prototype);
RoomSchema.prototype.constructor = RoomSchema;

Constants.assetTypes['room'].schema = RoomSchema;

module.exports = RoomSchema;
