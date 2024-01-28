/* Simple Suggester for solr queries */
'use strict';

const SolrQueryParser = require('search/SolrQueryParser');
const fuzzyMatcher = require('fuzzy');

function SolrQuerySuggester(params) {
  this.schema = params.schema;
}

SolrQuerySuggester.prototype.getFields = function() {
  return this.schema.fields;
};

SolrQuerySuggester.prototype.__suggestAndFilter = function(text, node) {

  // Suggest based on node and text
  let suggestions;
  let prefix;
  let active;
  if (node.field === '<implicit>') {
    // Assume active is portion of string after last ' '
    const i = text.lastIndexOf(' ');
    prefix = text.substring(0,i+1);
    active = text.substring(i+1);

    // looking for field name, suggest new fields
    const fields = this.getFields();
    suggestions = fields.map(function (f) {
      return {
        label: f.name,
        value: prefix + f.name,
        field: f
      };
    });
  } else {
    // Assume active is portion of string after last ':'
    const i = text.lastIndexOf(':');
    prefix = text.substring(0,i+1);
    active = text.substring(i+1);

    // Suggest field values
    const field = this.schema.getField(node.field);
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
    const fuzzyMatches = fuzzyMatcher.filter(active, suggestions, {
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
  let node;
  try {
    // Get suggestions
    // NOTE: Investigate pegjs tracing for more info (https://gist.github.com/subfuzion/808f91bfdfb88c7d5ed7)
    //       But this is new pegjs feature, not yet in the lucene query parser
    const parse = SolrQueryParser.luceneParse(text);
    node = SolrQueryParser.getRightmostNode(parse);
  } catch (err) {
    //console.error(err);
    // Look for last ':'
    const simpleParse = SolrQueryParser.simpleParse(text);
    if (simpleParse && simpleParse.length > 0) {
      const last = simpleParse[simpleParse.length-1];
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