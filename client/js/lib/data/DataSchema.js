'use strict';

var Field = require('data/Field');
var PubSub = require('PubSub');
var _ = require('util');

var solrToVizTypeMap = Object.freeze({
  // Predefined schema types
  string: 'categorical',
  boolean: 'boolean',
  long: 'ordered',
  int: 'ordered',
  double: 'ratio'
});

// Schemaless types
var __solrTypeMap = Object.freeze({
  strings: 'string',
  booleans: 'boolean',
  tlongs: 'long',
  tlong: 'long',
  tdates: 'date',
  tdate: 'date',
  tdoubles: 'double',
  tdouble: 'double'
});

/**
 * Data schema (describes fields to our users).  It currently supports querying of field information from Solr.
 * @param params DataSchema configuration
 * @param params.name {string} Schema name
 * @param params.description {string} Schema description
 * @param [params.assetType] {string} Asset type (default to `name`)
 * @param [params.source] {string} Data source
 * @param [params.schemaUrl] {string} Url from which to fetch the schema
 * @param [params.searchUrl] {string} Url to use for searching the data source
 * @param [params.defaultFilters] {string} Default filter string
 * @param [params.defaultQuery] {string} Default query string
 * @param [params.fields] {data.FieldDef[]} List of fields of interest
 * @param [params.facetLimit=10000] {int} Maximum number of facet values to fetch
 * @param [params.includeAll] {boolean} Include all fields (not just the subset we have some predefined information about)
 * @param [params.doQueryFields=false] {boolean} Whether to query for field information
 * @constructor
 * @memberOf data
 */
function DataSchema(params) {
  PubSub.call(this);
  this.name = params.name;
  this.description = params.description;
  this.assetType = params.assetType || this.name;
  this.searchController = params.searchController;
  // Source and schemaUrl (for use with search controller)
  // TODO: schema url should be rolled into search controller
  this.source = params.source;
  this.schemaUrl = params.schemaUrl;
  this.searchUrl = params.searchUrl;
  // Filters data down to a subset
  this.defaultFilters = params.defaultFilters;
  this.defaultQuery = params.defaultQuery;
  // Map of all field name to field info for all fields
  // Populated with querying for field info
  this.allFields = null;
  // Array of fields we care about
  this.fields = params.fields;
  // Create map of fields
  this.fieldsByName = {};
  if (this.fields) {
    this.fields = this.fields.map( function(f) {
      if (f instanceof Field) {
        return f;
      } else {
        return new Field(f);
      }
    });
    this.__populateFieldsByName();
  }
  this.facetLimit = params.facetLimit || 10000;
  // Include all fields (not just the subset we have some predefined information about)
  this.includeAll = params.includeAll;
  // Whether Query solr for more info about the fields
  this.doQueryFields = params.doQueryFields;
  if (this.doQueryFields && this.schemaUrl) {
    this.queryFieldTypes();
  }
}

DataSchema.prototype = Object.create(PubSub.prototype);
DataSchema.prototype.constructor = DataSchema;

DataSchema.prototype.__populateFieldsByName = function () {
  for (var i = 0; i < this.fields.length; i++) {
    var field = this.fields[i];
    this.fieldsByName[field.name] = field;
  }
};

DataSchema.prototype.updateFields = function(fields) {
  // Add fields and information to our schema
  for (var fn in fields) {
    if (fields.hasOwnProperty(fn)) {
      var f = fields[fn];
      if (this.fieldsByName[fn]) {
        // Merge
        console.log('Need to merge field ' + fn);
      } else {
        this.fieldsByName[fn] = f;
        this.fields.push(f);
      }
    }
  }
};

DataSchema.prototype.setFields = function(fields) {
  // Add fields and information to our schema
  this.fields = [];
  this.fieldsByName = {};
  this.updateFields(fields);
};

//returns all fields
DataSchema.prototype.getFieldsByName = function () {
  return this.fieldsByName;
};

DataSchema.prototype.getField = function (fieldname, includeAll) {
  if (fieldname instanceof Object) {
    return fieldname;
  } else {
    var f = this.fieldsByName[fieldname];
    if (!f && includeAll && this.allFields) {
      return this.allFields[fieldname];
    } else {
      return f;
    }
  }
};

DataSchema.prototype.getFieldByLabel = function (label) {
  for (var i = 0; i < this.fields.length; i++) {
    if (this.fields[i].label === label) {
      return this.fields[i];
    }
  }
};

//returns filtered fields
DataSchema.prototype.filterFieldsByType = function (domainType) {
  var fields = this.fields;
  return fields.filter(function (field) {
    return field.type === domainType;
  });
};

//gets domain type of field
DataSchema.prototype.getFieldType = function (fieldname) {
  var field = this.getField(fieldname);
  if (field) return field.type;
};

DataSchema.prototype.getFieldNames = function () {
  return Object.keys(this.fieldsByName);
};

//return all possible 3d model fields and what type of domain they correspond to
DataSchema.prototype.getQueriableFields = function () {
  return this.fields.filter(function (x) { return !x.compute || x.queryField; });
};

//get computed fields after data received
DataSchema.prototype.getComputedFields = function () {
  return this.fields.filter(function (x) { return x.compute; });
};

DataSchema.prototype.getQueryFieldNames = function () {
  var queriableFields = this.getQueriableFields();
  var queryFields = queriableFields.map(function (x) { return x.mainField || x.name; });
  return _.sortedUniq(_.sortBy(queryFields));
};

DataSchema.prototype.getComputedFieldNames = function () {
  var computedFields = this.getComputedFields();
  return computedFields.map(function (x) { return x.name; });
};

// functions for computed fields
DataSchema.prototype.computeAttribute = function (fieldname, d) {
  var field = this.getField(fieldname);
  if (field.compute) {
    return field.compute(d);
  } else {
    return d[field.name];
  }
};

DataSchema.prototype.getDisplayText = function (fieldname) {
  var field = this.getField(fieldname);
  if (field) {
    return field.label;
  } else {
    return fieldname;
  }
};

DataSchema.prototype.getQueryField = function (fieldname) {
  return fieldname;
};

DataSchema.prototype.processData = function (data) {
  // Add computed fields and such
  var computedFields = this.getComputedFieldNames();
  for (var j = 0; j < data.length; j++) {
    var d = data[j];
    // special handlings
    for (var p in d) {
      if (d.hasOwnProperty(p)) {
        // lookup p
        var f = this.allFields[p];
        if (f) {
          if (f.type === 'vector3') {
            // There is actually 3 fields (break it down)
            d[p] = d[p].split(',');
            for (var i = 0; i < 3; i++) {
              d[p][i] = parseFloat(d[p][i]);
              var subfield = p + '_' + i + '_d';
              d[subfield] = d[p][i];
            }
          }
        }
      }
    }
    // Computed fields
    for (var i = 0; i < computedFields.length; i++) {
      var name = computedFields[i];
      d[name] = this.computeAttribute(name, d);
    }
  }
};

DataSchema.prototype.__normalizeSolrType = function(t) {
  return __solrTypeMap[t] || t;
};

DataSchema.prototype.queryFieldTypes = function () {
  var saveFieldsCallback = function (err, data) {
    if (err) {
      console.error('Error looking up fields', err);
    } else if (data && data.fields) {
      // Get all the fields and stick them into our map
      var stringFields = [];
      var numberFields = [];
      var map = {};
      for (var i = 0; i < data.fields.length; i++) {
        var field = data.fields[i];
        map[field.name] = field;
        if (field.type === 'vector3') {
          // There is actually 3 fields (add them to our list)
          for (var j = 0; j < 3; j++) {
            var subfield = field.name + '_' + j + '_d';
            map[subfield] = {
              name: subfield,
              type: 'double'
            };
          }
        }
      }
      this.allFields = map;

      // Now let's see what fields we are really interested in...
      if (!this.fields || this.includeAll) {
        // Hmm, no explict set of fields of interest specified,
        // Or we have a subset of the fields, but we want to augment that with information about all the fields
        // Let's just populate from the solr query
        var fieldsByName = this.fieldsByName;
        this.fields = data.fields.map( function(f) {
          var f2 = fieldsByName[f.name];
          if (f2) return f2;
          else return { name: f.name, type: solrToVizTypeMap[f.type] };
        });
        this.__populateFieldsByName();
      }

      // Copy information from solr query to fields
      var fields = this.fields;
      for (var i = 0; i < fields.length; i++) {
        var field = fields[i];
        if (map[field.name]) {
          var m = map[field.name];
          //console.log(m);
          m.type = this.__normalizeSolrType(m.type);
          field.solrtype = m.type;
          if (m.type === 'string' || m.type.indexOf('text') >= 0) {
            if (!field.excludeFromFacet) {
              stringFields.push(field.name);
            }
          } else if (m.type === 'double' || m.type === 'long' || m.type == 'int') {
            numberFields.push(field.name);
          }
        }
      }
      this.stringFields = stringFields;
      //console.log('stringFields', stringFields);
      if (stringFields.length > 0) {
        this.queryFieldValues(this.getDefaultQueryOptions(stringFields));
      }
      this.numberFields = numberFields;
      //console.log('numberFields', numberFields);
      if (numberFields.length > 0) {
        this.queryFieldStats(this.getDefaultQueryOptions(numberFields));
      }
    }
    this.Publish('FieldTypesInitialized');
  }.bind(this);
  this.searchController.lookupFields(this.schemaUrl, saveFieldsCallback);
};

DataSchema.prototype.queryFieldValues = function (options) {
  //console.log('queryFieldValues', options);
  this.searchController.facetFieldSearch({
    url: this.searchUrl,
    source: options.source,
    query: options.query,
    filter: options.filter,
    facetField: options.fieldNames,
    facetLimit: options.facetLimit,
    facetMinCount: 1,
    success: function (data) {
      var results = data.facet_counts.facet_fields;
      for (var p in results) {
        if (results.hasOwnProperty(p)) {
          var counts = results[p];
          var fieldValues = [];
          var countsMap = {};
          for (var i = 0; i < counts.length; i += 2) {
            var v = counts[i];
            countsMap[v] = counts[i+1];
            fieldValues.push(v);
          }
          if (options.filterValuesFn) {
            fieldValues = _.filter(fieldValues, function(v) {
              return options.filterValuesFn(options.fieldsByName[p], v);
            });
          }
          options.fieldsByName[p].values = fieldValues;
          options.fieldsByName[p].counts = countsMap;
        }
      }
      if (options.callback) {
        options.callback('QueryFieldValues', 'OK');
      }
    }
  });
};

DataSchema.prototype.queryFieldStats = function (options) {
  //console.log('queryFieldStats', options);
  this.searchController.getStats({
    url: this.searchUrl,
    source: options.source,
    query: options.query,
    filter: options.filter,
    field: options.fieldNames,
    success: function (data) {
      var results = data.stats.stats_fields;
      for (var p in results) {
        if (results.hasOwnProperty(p)) {
          var stats = results[p];
          options.fieldsByName[p].stats = stats;
        }
      }
      if (options.callback) {
        options.callback('QueryFieldStats', 'OK');
      }
    }
  });
};

DataSchema.prototype.getDefaultQueryOptions = function(fieldNames) {
  return {
    source: this.source,
    query: this.defaultQuery,
    filter: this.defaultFilters,
    fieldsByName: this.fieldsByName,
    fieldNames: fieldNames,
    facetLimit: this.facetLimit
  };
};

DataSchema.prototype.getFieldMetadata = function (options) {
  var stringFieldsOpts =
    _.assign(this.getDefaultQueryOptions(this.stringFields), options);
  this.queryFieldValues(stringFieldsOpts);
  var numberFieldsOpts =
    _.assign(this.getDefaultQueryOptions(this.numberFields), options);
  this.queryFieldStats(numberFieldsOpts);
};

module.exports = DataSchema;

/**
 * Data field filter
 * @typedef data.FieldFilter
 * @type {object}
 * @property field {string} field name
 * @property values {Array} List of possible values
 * @property value {string|number} initial value
 * @property required {boolean} Whether this filter is required
 * @property limited {boolean}
 */

/**
 * Data field definition
 * @typedef data.FieldDef
 * @type {object}
 * @property name {string} field name
 * @property type {string} field type (`categorical`,`numeric`,`boolean`)
 * @property [text] {string} text label for field
 * @property [mainField] {string} main fieldname in solr
 * @property [min] {number} Minimum value for numeric field
 * @property [max] {number} Maximum value for numeric field
 * @property [description] {string} field description
 * @property [examples] {data.QueryExample[]} List of examples for this field
 */
