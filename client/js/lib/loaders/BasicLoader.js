/**
 * Basic loader
 * @param params
 * @constructor
 * @memberOf loaders
 */
function Loader(params) {
  this.fs = params.fs;
  this.debug = params.debug;
  this.fileEncoding = params.fileEncoding || params.encoding || 'utf-8';
  this.format = params.format;
}

/**
 * Load and parses file
 * @param file
 * @param callback {function(err, Object)}
 */
Loader.prototype.load = function(file, callback) {
  var filename = file.name || file;
  var scope = this;
  this.fs.readAsync(file, this.fileEncoding, function(err, data) {
    if (err) {
      callback(err);
    } else {
      try {
        var parsed = scope.parse(filename, data);
        callback(null, parsed);
      } catch(e) {
        console.error('Error parsing or calling callback for file', filename, e);
        callback(e);
      }
    }
  });
};

/**
 * Parses data
 * @param filename
 * @param data
 * @returns Object
 */
Loader.prototype.parse = function(filename, data) {
  if (this.format === 'json') {
    return JSON.parse(data);
  } else {
    return data;
  }
};

module.exports = Loader;