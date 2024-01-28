const ExportObject3DForm = require('ui/modal/ExportObject3DForm');
const SceneStateExporter = require('exporters/SceneStateExporter');
const FileUtil = require('io/FileUtil');

class ExportSceneForm extends ExportObject3DForm {
  constructor(params) {
    super(params);
    this.formats.unshift('sceneState');
  }

  __getQuestions() {
    const questions = super.__getQuestions();
    questions.push({
      "title": "Original scene space",
      "name": "origSceneSpace",
      "inputType": "boolean",
      "value": this.__config.origSceneSpace
    });
    return questions;
  }

  export(target, opts) {
    if (opts.format === 'sceneState') {
      const exporterOpts = {
        fs: FileUtil
      };
      const exporter = new SceneStateExporter(exporterOpts);
      this.callbacks.export(target, exporter, exporterOpts);
    } else {
      opts.transform = null;
      if (this.__config.origSceneSpace) {
        var transform = new THREE.Matrix4();
        transform.copy(target.scene.matrixWorld).invert();
        opts.transform = transform;
      }
      return super.export(target.scene, opts);
    }
  }
}


module.exports = ExportSceneForm;
