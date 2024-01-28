var _ = require('util/util');
var FileUtil = require('io/FileUtil');

function ExportObject3DForm(params) {
  this.callbacks = {
    warn: params.warn,
    export: params.export
  };
  this.formats = ['dae', 'gltf', 'glb', 'obj'];
  this.__config = {
    format: params.defaultFormat ||  'glb',
    visibleOnly: true,
    exportSegments: false
  };
}

ExportObject3DForm.prototype.__getQuestions = function() {
  var questions = [
    {
      'title': 'Format',
      'name': 'format',
      'inputType': 'select',
      'inputOptions':  _.map(this.formats, function(x) { return { value: x, text: x }; }),
      'value': this.__config.format
    },
    {
      'title': 'Visible only',
      'name': 'visibleOnly',
      'inputType': 'boolean',
      'value': this.__config.visibleOnly
    },
    // {
    //   'title': 'Export segments',
    //   'name': 'exportSegments',
    //   'inputType': 'boolean',
    //   'value': this.__config.exportSegments
    // }
  ];
  return questions;
};

ExportObject3DForm.prototype.show = function(target) {
  var questions = this.__getQuestions();
  var scope = this;
  bootbox.form({
    title: 'Export shape',
    inputs: questions,
    callback: function(results) {
      if (results) {
        _.each(questions, function(q,i) {
          scope.__config[q.name] = results[i];
        });
        scope.export(target, scope.__config);
      }
    }
  });
};

ExportObject3DForm.prototype.export = function(target, opts) {
  console.log('exportModel', opts);
  // parameters to export function
  var exportOpts = {
    exportSegments: opts.exportSegments,
    onlyVisible: opts.visibleOnly, // TODO: used in GLTFExporter and PLYExporter
    includeNotVisible: !opts.visibleOnly,  // TODO: used in OBJMTLExporter
    transform: opts.transform  // TODO: Supported by PLYExporter, OBJMTLExporter
  };
  // parameters for creating exporter
  var exporterOpts = {
    fs: FileUtil
  };
  var exporter;
  if (opts.format === 'ply') {
    var PLYExporter = require('exporters/PLYExporter');
    exporter = new PLYExporter(exporterOpts);
  } else if (opts.format === 'obj') {
    var OBJMTLExporter = require('exporters/OBJMTLExporter');
    exporter = new OBJMTLExporter(exporterOpts);
  } else if (opts.format === 'dae' || opts.format === 'kmz') {
    var ColladaExporter = require('exporters/ColladaExporter');
    exporter = new ColladaExporter(exporterOpts);
    exportOpts.compress = opts.format === 'kmz';
  } else if (opts.format === 'gltf' || opts.format === 'glb') {
    var GLTFExporter = require('exporters/GLTFExporter');
    exporter = new GLTFExporter(exporterOpts);
    exportOpts.binary = opts.format === 'glb';
    exportOpts.embedImages = true;
  } else {
    this.callbacks.warn('Unsupported export format ' + opts.format);
    return;
  }

  this.callbacks.export(target, exporter, exportOpts);
};


module.exports = ExportObject3DForm;
