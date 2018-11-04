'use strict';

var Constants = require('Constants');
var DataSchema = require('data/DataSchema');
var SearchController = require('search/SearchController');
var _ = require('util/util');

// Defines fields we care about for scenes
var fields = [
  { name: 'id', type: 'categorical', excludeFromFacet: false },
  { name: 'datasets', type: 'categorical' },
  { name: 'source', type: 'categorical' },
  { name: 'category', type: 'categorical' },
//  { name: 'wnhyperlemmas', text: 'hypersynset', type: 'categorical', excludeFromFacet: true, suggestMethod: 'solr' },
//  { name: 'wnlemmas', text: 'synset', type: 'categorical', excludeFromFacet: true, suggestMethod: 'solr' },
  { name: 'nlevels', text: '# of levels',  type: 'numeric', min: 0,
    examples: [{ query: 'nlevels:1', description: 'Scenes with just one level' },
      { query: 'nlevels:[2 TO *]', description: 'Scenes with multiple levels' }]
  },
  { name: 'nrooms', text: '# of rooms',  type: 'numeric', min: 0,
    examples: [{ query: 'nrooms:3', description: 'Scenes with three rooms' },
      { query: 'nrooms:[1 TO 50]', description: 'Scenes with one to 50 rooms' },
      { query: 'nrooms:[51 TO *]', description: 'Scenes with more than 50 rooms' }]
  },
  { name: 'nwalls', text: '# of walls',  type: 'numeric', min: 0,
    examples: [{ query: 'nwalls:4', description: 'Scenes with four walls' }]
  },
  { name: 'nwindows', text: '# of windows',  type: 'numeric', min: 0,
    examples: [{ query: 'nwindows:2', description: 'Scenes with two windows' }]
  },
  { name: 'ndoors', text: '# of doors',  type: 'numeric', min: 0,
    examples: [{ query: 'ndoors:1', description: 'Scenes with one door' }]
  },
  { name: 'npeople', text: '# of people',  type: 'numeric', min: 0,
    examples: [{ query: 'npeople:0', description: 'Scenes without people' },
      { query: 'npeople:[1 TO *]', description: 'Scenes with at least one person' }]
  },
  { name: 'nobjects', text: '# of objects',  type: 'numeric', min: 0,
    description: 'number of other objects (not people, windows, doors) in scenes',
    examples: [{ query: 'nobjects:0', description: 'Scenes without any other objects' }]
  },
  { name: 'nmisc', text: '# of other stuff',  type: 'numeric', min: 0,
    description: 'number of other procedurally generated items (e.g. boxes) in scenes',
    examples: [{ query: 'nmisc:0', description: 'Scenes with no boxes' },
      { query: 'nmisc:[1 TO *]', description: 'Scenes with at least one box' }]
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
      { query: 'modelCats:roof', description: 'Scenes with roof' },
      { query: 'modelCats:television OR modelCats:pet', description: 'Scenes with tvs or pets' },
      { query: '!modelCats:window', description: 'Scenes without any window' },
      { query: 'modelCats:*lamp OR modelCats:chandelier', description: 'Scenes with any lamp (wall_lamp, floor_lamp, etc.)' }]
  },
  { name: 'modelIds', type: 'categorical', excludeFromFacet: false,
    examples: [{ query: 'modelIds:122', description: 'Scenes with model 122 (a particular door)' },
      { query: 'modelIds:(122 OR 247)', description: 'Scenes with either model 122 or 247 (two different doors)' }]
  },
  { name: 'roomTypes', type: 'categorical',
    description: 'Best guess at whether to room is a Bedroom, Bathroom, etc by the SUNCG team (each room can have multiple room types)',
    examples: [{ query: 'roomTypes:Kitchen', description: 'Scenes with kitchens' },
      { query: '!roomTypes:*', description: 'Scenes with uncategorized rooms' }] },
  { name: 'origRoomTypes', type: 'categorical',
    description: 'Original room type from the initial data'
  },

  { name: 'levelRating', type: 'numeric',
    description: 'Rating (subject to change) given to individual levels in this scene',
    examples: [
      { query: 'levelRating:1', description: 'At least one level was rated as good by all turkers'},
      { query: 'levelRating:[0.5 TO *]', description: 'At least one level was rated as good by 50 percent of the turkers'},
      { query: 'levelRating:{0 TO *}', description: 'At least one level was rated as good by at least one turker'}]
  },
  { name: 'overallRating', type: 'numeric',
    description: 'Overall rating (average of the levelRatings) for the scene',
    examples: [
      { query: 'overallRating:1', description: 'All levels was rated as good by all turkers'}]
  },

  { name: 'dims_0_d', text: 'bbox dims x',  mainField: 'dims', type: 'numeric',
    description: 'Scene bounding box x (width) in meters',
    examples: [{ query: 'dims_0_d:[10 TO 20]', description: 'Scene with bounding box width of 10 to 20 meters'}]
  },
  { name: 'dims_1_d', text: 'bbox dims y',  mainField: 'dims', type: 'numeric',
    description: 'Scene bounding box y (height) in meters',
    examples: [{ query: 'dims_1_d:[3 TO *]', description: 'Scenes taller than 3 meters'}]
  },
  { name: 'dims_2_d', text: 'bbox dims z', mainField: 'dims', type: 'numeric',
    description: 'Scene bounding box z (depth) in meters',
    examples: [{ query: 'dims_2_d:[100 TO *]', description: 'Scene with bounding box depth of more than 100 meters (rare)'}]
  },

  { name: 'minPoint_0_d', text: 'bbox min x', mainField: 'minPoint', type: 'numeric',
    description: 'Scene bounding box min x'
  },
  { name: 'minPoint_1_d', text: 'bbox min y', mainField: 'minPoint', type: 'numeric',
    description: 'Scene bounding box min y'
  },
  { name: 'minPoint_2_d', text: 'bbox min z', mainField: 'minPoint', type: 'numeric',
    description: 'Scene bounding box min z'
  },

  { name: 'maxPoint_0_d', text: 'bbox max x', mainField: 'maxPoint', type: 'numeric',
    description: 'Scene bounding box max z'
  },
  { name: 'maxPoint_1_d', text: 'bbox max y', mainField: 'maxPoint', type: 'numeric',
    description: 'Scene bounding box max z'
  },
  { name: 'maxPoint_2_d', text: 'bbox max z', mainField: 'maxPoint', type: 'numeric',
    description: 'Scene bounding box max z'
  }
];

function SceneSchema(params) {
  params = params || {};
  var searchController = new SearchController({ sources: ['scenes'] });
  searchController.enableFiltering(false);
  var dataSchemaParams = {
    name: 'scene',
    searchController: searchController,
    schemaUrl: Constants.scenesFieldsUrl,
    searchUrl: Constants.scenesSearchUrl,
    fields: fields,
    source: 'scenes',
    doQueryFields: true
  };
  params = _.defaultsDeep(params, dataSchemaParams);
  DataSchema.call(this, params);
}

SceneSchema.prototype = Object.create(DataSchema.prototype);
SceneSchema.prototype.constructor = SceneSchema;

Constants.assetTypes['scene'].schema = SceneSchema;

module.exports = SceneSchema;
