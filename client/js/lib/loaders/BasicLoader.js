/**
 * Basic loader
 * @param params
 * @constructor
 * @memberOf loaders
 */
function Loader(params) {
  this.fs = params.fs;
  this.debug = params.debug;
  this.fileEncoding = params.fileEncoding || 'utf-8';
}

/**
 * Load and parses house file
 * @param file
 * @param callback {function(err, Object)}
 */
Loader.prototype.load = function(file, callback) {
  var filename = file.name || file;
  var scope = this;
  this.fs.readAsync(file, 'utf-8', function(err, data) {
    if (err) {
      callback(err);
    } else {
      try {
        var parsed = scope.parse(filename, data);
        callback(null, parsed);
      } catch(e) {
        callback(e);
      }
    }
  });
};

/**
 * Load and parses house file
 * @param filename
 * @param data
 * @returns Object
 */
Loader.prototype.parse = function(filename, data) {
  throw 'Unimplemented parse for ' + this.constructor.name;
};

module.exports = Loader;