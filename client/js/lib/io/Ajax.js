// Helper methods for making ajax calls

var Ajax = {};

// Create a serialized representation of an array, a plain object, or a jQuery object suitable for use in a URL query string or Ajax request
// Currently pass through to jquery $.params)
Ajax.param = function(opts) {
  return $.param(opts);
};

// Perform an asynchronous HTTP (Ajax) request.
// Currently passthrough to jquery $.ajax
Ajax.ajax = function(opts) {
  return $.ajax(opts);
};

Ajax.post = function(opts) {
  return $.post(opts);
};

module.exports = Ajax;