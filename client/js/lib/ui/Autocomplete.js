var _ = require('lodash');

var Autocomplete = function(params) {
  this.input = params.input;
  this.suggester = params.suggester;
  this.options = _.defaults({}, params.options);
  this.__bind(this.input, this.suggester, this.options);
};

Autocomplete.prototype.__bind = function (input, suggester, options) {
  if (suggester) {
    options.source = function(request, response) {
      var suggestions = suggester.suggest(request.term);
      response(suggestions);
    };
    // What to do on select, return false to disable automatic replacement
    //options.select = function(event, ui) {
    //  return false;
    //};
  }
  input.autocomplete(options);
};

module.exports = Autocomplete;