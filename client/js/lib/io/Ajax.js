// Helper methods for making ajax calls

var Ajax = {};

/**
 * Create a serialized representation of an array, a plain object, or a jQuery object suitable for use in a URL query string or Ajax request
 * Currently pass through to jquery {@link http://api.jquery.com/jQuery.param/|$.params}
 * @param opts {Object} Javascript object with options to encode as parameters
 */
Ajax.param = function(opts) {
  return $.param(opts);
};

/**
 * Perform an asynchronous HTTP (Ajax) request.
 * Currently pass through to jquery {@link http://api.jquery.com/jQuery.ajax/|$.ajax}
 * @param opts
 * @param opts.url {string}
 * @param opts.callback {callback} Optional error first callback
 * @param opts.data {string|Object|Array} Data to be set to the server for processing
 * @param opts.dataType {string} What to interpret the response as (`json|jsonp|text|xml|html`)
 * @param opts.jsonp {string|boolean} Override the callback function name in a JSONP request
 * @param opts.traditional {string} Set to true to use traditional parameter serialization.  Example, if field is array, it will become field=a1&field=a2 instead of field[0]=a1&field[1]=a2
 * @param opts.timeout {number} Timeout in milliseconds. With JSONP, this is the only way to get the error handler to fire.
 */
Ajax.ajax = function(opts) {
  opts = Ajax.__prepareAjaxOpts(opts);
  return $.ajax(opts);
};

/**
 * Perform an asynchronous HTTP (Ajax) request using post.
 * Currently pass through to jquery {@link http://api.jquery.com/jQuery.post/|$.post}
 * @param opts Option
 * @param opts.url {string}
 * @param callback {callback} Optional error first callback
 */
Ajax.post = function(opts) {
  opts = Ajax.__prepareAjaxOpts(opts);
  return $.post(opts);
};

// Creates suitable function that ensures that callback / params.success / params.error are called
function __getCallback(params, cb) {
  return function(err, res) {
    if (err) {
      // Error
      if (params && params.error) { params.error(err); }
    } else {
      // Success
      if (params && params.success) { params.success(res); }
    }
    if (cb) { cb(err, res); }
  };
}

function toAjaxSucceededCallback(cb) {
  return function(data, textStatus, jqXHR) {
    if (data.error) {
      cb(data, null);
    } else {
      cb(null, data);
    }
  };
}

function toAjaxFailedCallback(cb) {
  return function(jqXHR, textStatus, errorThrown) {
    cb(textStatus + ' ' + errorThrown, null);
  };
}

Ajax.getCallback = __getCallback;

Ajax.__prepareAjaxOpts = function(opts) {
  if (opts.callback) {
    var cb = __getCallback(opts, opts.callback);
    opts = Object.assign({}, opts);
    opts.success = toAjaxSucceededCallback(cb);
    opts.error = toAjaxFailedCallback(cb);
  }
  //console.log('opts', opts);
  return opts;
}

module.exports = Ajax;