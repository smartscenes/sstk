const ExportObject3DForm = require('ui/modal/ExportObject3DForm');
const FileUtil = require('io/FileUtil');

class ExportArticulatedObject3DForm extends ExportObject3DForm {
  constructor(params) {
    super(params);
    this.formats = ['urdf', 'gltf', 'glb'];
    this.__config['useTextured'] = true;
  }

  __getQuestions() {
    const questions = super.__getQuestions();
    questions.push({
      "title": "Use original textures",
      "name": "useTextured",
      "inputType": "boolean",
      "value": this.__config.useTextured
    });
    return questions;
  }

  export(target, opts) {
    // TODO: urdf / glft handling?
    if (opts.format === 'urdf') {
      const exportOpts = {
        exportSegments: opts.exportSegments,
        onlyVisible: opts.visibleOnly, // TODO: used in GLTFExporter and PLYExporter
        includeNotVisible: !opts.visibleOnly,  // TODO: used in OBJMTLExporter
        transform: opts.transform  // TODO: Supported by PLYExporter, OBJMTLExporter
      };
      // parameters for creating exporter
      const exporterOpts = {
        fs: FileUtil
      };

      const URDFExporter = require('exporters/URDFExporter');
      const exporter = new URDFExporter(exporterOpts);
      this.callbacks.export(target, exporter, exportOpts);
    } else {
      return super.export(target, opts);
    }
  }
}


module.exports = ExportArticulatedObject3DForm;
