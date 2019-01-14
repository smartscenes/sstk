var FileUtil = require('io/FileUtil');

function SceneStateExporter(options) {
  options = options || {};
  this.__fs = options.fs || FileUtil;
}
SceneStateExporter.prototype.export = function (sceneState, opts) {
  var fileutil = this.__fs;
  opts = opts || {};
  opts.name = (opts.name != undefined)? opts.name : 'scene';
  opts.dir = (opts.dir != undefined)? opts.dir + '/' : '';
  var filename = opts.dir + opts.name + '.json';
  var callback = opts.callback;

  var json = sceneState.toJson();
  fileutil.fsWriteToFile(filename, JSON.stringify(json), function () {
    fileutil.fsExportFile(filename, filename);
    console.log('finished processing ' + sceneState.getFullID());
    if (callback) { callback(); }
  });
};

module.exports = SceneStateExporter;