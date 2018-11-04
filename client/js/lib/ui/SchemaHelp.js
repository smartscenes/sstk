var _ = require('util/util');

/**
 * Creates help UI for searching with solr a given schema
 * @param params
 * @param params.schema {data.DataSchema}
 * @param [params.useVisualSearch=false] {boolean} Whether visual search is supported
 * @param [params.allowSort=false] {boolean} Whether sorting is supported
 * @param [params.exampleLinkClicked] {function()} What should happen when an example link is clicked
 * @constructor
 * @memberOf ui
 */
var SchemaHelp = function(params) {
  this.schema = params.schema;
  this.useVisualSearch = params.useVisualSearch;
  this.allowSort = params.allowSort;
  this.exampleLinkClicked = params.exampleLinkClicked;
  this.__prefix = _.uniqueId('help');
};

/**
 * Generates help panel
 * @returns {jQuery}
 */
SchemaHelp.prototype.getHelp = function(opts) {
  opts = opts || {};
  // Generate help HTML from specified schema
  var helpDiv = $('<div></div>').attr('id', this.__prefix);
  helpDiv.append($('<h3></h3>').text('Query help for ' + this.schema.name));
  if (this.schema.description) {
    helpDiv.append($('<p></p>').text(this.schema.description));
  }
  helpDiv.append($('<p></p>').html('Each query consists of set of ' +
    '<a href="http://www.solrtutorial.com/solr-query-syntax.html" target="_blank">Solr</a>' +
    ' clauses joined by <code>AND</code> or <code>OR</code>.'));
  if (this.useVisualSearch) {
    helpDiv.append($('<p></p>').html('Use the filter bar to help discover what is in the database and to add filters to your queries.'));
  }
  if (this.allowSort) {
    helpDiv.append($('<p></p>').html('The sort order is specified by the field name followed by the sort order ' +
      '(<code>asc</code> or <code>desc</code>).' +
      'Use the sort dropdown for preset sort orders or define your own <code>custom</code> order.'));
  }
  helpDiv.append($('<h4></h4>').text('Query fields'));
  var fields = this.schema.fields;
  for (var i = 0; i < fields.length; i++) {
    var field = fields[i];
    var fieldDiv = $('<div></div>').attr('id', this.__prefix + 'S_' + field.name);
    fieldDiv.append($('<code></code>').text(field.name));
    if (field.text) {
      fieldDiv.append($('<span></span>').text(' (' + field.text + ')'));
    }
    if (field.description) {
      fieldDiv.append($('<span></span>').text(': ' + field.description));
    }
    if (field.examples && field.examples.length > 0) {
      var examplesDiv = $('<ul></ul>');
      for (var j = 0; j < field.examples.length; j++) {
        var ex = field.examples[j];
        var query = $('<code></code>').text(ex.query);
        // Link query
        if (this.exampleLinkClicked) {
          query = $('<a></a>').append(query.css('cursor', 'pointer'));
          query.click(function(ex) {
            this.exampleLinkClicked(ex);
          }.bind(this, ex));
        }
        examplesDiv.append($('<li></li>').text(ex.description + ' ').append(query));
      }
      fieldDiv.append(examplesDiv);
    }
    helpDiv.append(fieldDiv);
  }
  return helpDiv;
};

module.exports = SchemaHelp;

