'use strict';

var Constants = require('Constants');
var DataSchema = require('data/DataSchema');
var SearchController = require('search/SearchController');
var _ = require('util/util');

// Defines fields we care about for models
var fields = [
  { name: 'fullId', type: 'categorical', excludeFromFacet: true },
  { name: 'id', type: 'categorical', excludeFromFacet: false },
  { name: 'datasets', type: 'categorical',
    description: 'Dataset that the model belongs to' },
  { name: 'datatags', type: 'categorical',
    description: 'Additional tags for organizing the data' },
  { name: 'source', type: 'categorical',
    description: 'Prefix indicating where the model originated from'},
  { name: 'category', type: 'categorical',
    description: 'Category of an object' +
      '(available for ShapeNetSem only, for ShapeNetCore, use wnhyperlemmas or wnlemmas).' +
      'Not restricted to words in WordNet (includes common modern electronics such as iPad, Xbox, etc.',
    examples: [{ query: 'category:Xbox', description: 'Xbox', filters: '+datasets:ShapeNetSem' }]
  },
  { name: 'pcaDim', type: 'categorical',
    description: 'object shape is a pole (1D), a plane (2D), or 3D',
    examples: [{ query: 'pcaDim:1D', description: 'Long, thin objects such as pencils (available for ShapeNetSem only)' },
      { query: 'pcaDim:2D', description: 'Flat objects such as paintings, whiteboards, etc.' },
      { query: 'pcaDim:3D', description: 'Other more 3D objects' }]
  },
  { name: 'wnhyperlemmas', text: 'hypersynset', type: 'categorical', excludeFromFacet: false,
    suggestMethod: 'solr',
    description: 'WordNet lemma (includes objects belonging to child WordNet synsets)',
    examples: [{ query: 'wnhyperlemmas:chair', description: 'Objects identified as chairs' }]
  },
  { name: 'wnlemmas', text: 'synset', type: 'categorical', excludeFromFacet: false,
    suggestMethod: 'solr',
    description: 'WordNet lemma (exact synset)',
    examples: [{ query: 'wnlemmas:chair', description: 'Objects identified as chairs' }]
  },
  { name: 'nvertices', text: '# of vertices', type: 'numeric', min: 0,
    description: 'Number of vertices'
  },
  { name: 'nmaterials', text: '# of materials',  type: 'numeric', min: 0,
    description: 'Number of materials'
  },
  { name: 'nfaces', text: '# of faces',  type: 'numeric', min: 0,
    description: 'Number of faces'
  },
  { name: 'popularity', type: 'numeric' },
  { name: 'modelQuality', type: 'numeric' },
  { name: 'hasModel', type: 'boolean',
    description: 'Whether a mesh exists for the model or not'
  },
  { name: 'isAligned', text: 'aligned', type: 'boolean',
    description: 'Whether the model has been canonically aligned'
  },
  { name: 'aligned.dims_0_d', text: 'width',  mainField: 'aligned.dims', type: 'numeric',
    description: 'aligned object width in centimeters',
    examples: [{ query: 'aligned.dims_0_d:[0 TO 100]', description: 'Object with width of up to 100 centimeters'}]
  },
  { name: 'aligned.dims_1_d', text: 'height',  mainField: 'aligned.dims', type: 'numeric',
    description: 'aligned object height in centimeters',
    examples: [{ query: 'aligned.dims_1_d:[100 TO *]', description: 'Object taller than 100 centimeters'}]
  },
  { name: 'aligned.dims_2_d', text: 'depth', mainField: 'aligned.dims', type: 'numeric',
    description: 'aligned object depth in centimeters',
    examples: [{ query: 'aligned.dims_2_d:[10 TO 50]', description: 'Object with depth of 10 to 50 centimeters'}]
  },
  { name: 'unit', type: 'numeric',
    description: 'Estimated unit (in meters) that the model is represented in (e.g. 0.01 indicates that the model is represented in centimeters)'
  },
  { name: 'unit.source', type: 'categorical' },
  { name: 'weight', type: 'numeric',
    description: 'Estimated weight of model in kg'
  },

  // computed fields
  { name: 'volume', type: 'numeric',
    compute: function (d) {
      var dimsArray = d['aligned.dims'] || [0,0,0];
      return (dimsArray[0]) * (dimsArray[1]) * (dimsArray[2]);
    }
  },
  { name: 'fatness', type: 'numeric',
    compute: function (d) {
      var dimsArray = d['aligned.dims'] || [0,0,0];
      return (dimsArray[0] / dimsArray[1]);
    }
  }
];

function ModelSchema(params) {
  params = params || {};
  var searchController = new SearchController();
  searchController.enableFiltering(false);
  var dataSchemaParams = {
    name: 'model',
    searchController: searchController,
    schemaUrl: Constants.models3dFieldsUrl,
    searchUrl: Constants.models3dSearchUrl,
    fields: fields,
    source: 'models3d',
    doQueryFields: true
  };
  params = _.defaultsDeep(params, dataSchemaParams);
  DataSchema.call(this, params);
}

ModelSchema.prototype = Object.create(DataSchema.prototype);
ModelSchema.prototype.constructor = ModelSchema;

ModelSchema.ShapeNetSynsetAttributeLink = {
  solrUrl: Constants.shapenetSearchUrl,
  taxonomy: 'shapenet',
  linkType: 'wordnet',
  displayField: 'wnsynsetkey',  // Field to display
  // Mapping from our field names to linked fields
  // These are also fields that we should populate if the wnsynset changes
  fieldMappings: {
    wnsynsetkey: 'wn30synsetkey',
    wnlemmas: 'words',
    wnsynset: 'synsetid',
    shapenetCoreSynset: 'shapenetcoresynsetid',
    //wnsynset: "wn30synsetid"
    // Special fields
    wnhyperlemmas: 'wnhyperlemmas', //"ancestors.words",
    wnhypersynsets: 'wnhypersynsets', //"ancestors.synsetid"
  }
};

Constants.assetTypes['model'].schema = ModelSchema;

module.exports = ModelSchema;
