/* Simple Suggester for solr queries */
'use strict';

var SolrQueryParser = require('search/SolrQueryParser');
var fuzzyMatcher = require('fuzzy');

function SolrQuerySuggester(params) {
  this.schema = params.schema;
}

SolrQuerySuggester.prototype.getFields = function() {
  return this.schema.fields;
};

SolrQuerySuggester.prototype.__suggestAndFilter = function(text, node) {

  // Suggest based on node and text
  var suggestions;
  var prefix;
  var active;
  if (node.field === '<implicit>') {
    // Assume active is portion of string after last ' '
    var i = text.lastIndexOf(' ');
    prefix = text.substring(0,i+1);
    active = text.substring(i+1);

    // looking for field name, suggest new fields
    var fields = this.getFields();
    suggestions = fields.map(function (f) {
      return {
        label: f.name,
        value: prefix + f.name,
        field: f
      };
    });
  } else {
    // Assume active is portion of string after last ':'
    var i = text.lastIndexOf(':');
    prefix = text.substring(0,i+1);
    active = text.substring(i+1);

    // Suggest field values
    var field = this.schema.getField(node.field);
    if (field && field.values) {
      suggestions = field.values.map(function (v) {
        return {
          label: v,
          value: prefix + v
        };
      });
    }
  }

  // Filter suggestions based on prefix match
  if (suggestions) {
    var fuzzyMatches = fuzzyMatcher.filter(active, suggestions, {
      extract: function(el) { return el.label; }
    });
    //console.log(fuzzyMatches);
    if (fuzzyMatches) {
      suggestions = fuzzyMatches.map( function(x) { return x.original; });
    }
  }

  return suggestions;
};

SolrQuerySuggester.prototype.suggest = function(text) {
  var node;
  try {
    // Get suggestions
    // NOTE: Investigate pegjs tracing for more info (https://gist.github.com/subfuzion/808f91bfdfb88c7d5ed7)
    //       But this is new pegjs feature, not yet in the lucene query parser
    var parse = SolrQueryParser.luceneParse(text);
    node = SolrQueryParser.getRightmostNode(parse);
  } catch (err) {
    //console.error(err);
    // Look for last ':'
    var simpleParse = SolrQueryParser.simpleParse(text);
    if (simpleParse && simpleParse.length > 0) {
      var last = simpleParse[simpleParse.length-1];
      node = {
        field: last.name,
        term: last.value
      };
    }
  }

  if (node) {
    //console.log(node);
    return this.__suggestAndFilter(text, node);
  }
};

module.exports = SolrQuerySuggester;