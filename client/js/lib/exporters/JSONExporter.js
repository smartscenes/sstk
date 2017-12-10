var FileUtil = require('io/FileUtil');

/**
 * Export a mesh in json format
 * @param options
 * @param options.fs File system to use for exporting (defaults to FileUtil)
 * @constructor
 * @memberOf exporters
 */
function JSONExporter(options) {
  options = options || {};
  this.__fs = options.fs || FileUtil;
}

JSONExporter.prototype.export = function(obj, opts) {
  var fileutil = this.__fs;
  opts = opts || {};
  opts.name = opts.name || 'scene';
  opts.dir = opts.dir ? opts.dir + '/' : '';
  var filename = opts.dir + opts.name + '.js';
  var callback = opts.callback;

  function finishFile() {
    fileutil.fsExportFile(filename, filename);
    console.log('finished exporting mesh data to ' + filename);
    if (callback) { callback(); }
  }
  var blob = JSON.stringify(obj.toJSON(), null, 2);
  fileutil.fsWriteToFile(filename, blob, finishFile);
};

module.exports = JSONExporter;
