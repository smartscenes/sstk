const MissingGeometryGenerator = require('shape/MissingGeometryGenerator');
const _ = require('util/util');

class AddGeometryForm {
  constructor(params)
  {
    this.callbacks = {
      warn: params.warn
    };
    this.geometryTypes = ['top'];
    this.__config = {
      type: 'top'
    };
    this.__generator = new MissingGeometryGenerator();
  }

  get config() {
    return this.__config;
  }

  __getQuestions() {
    const questions = [
      {
        'title': 'Type',
        'name': 'type',
        'inputType': 'select',
        'inputOptions':  _.map(this.geometryTypes, function(x) { return { value: x, text: x }; }),
        'value': this.__config.type
      },
    ];
    return questions;
  }

  show(tgtModelInst, cb) {
    const questions = this.__getQuestions();
    const scope = this;
    const form = bootbox.form({
      title: 'Add geometry',
      inputs: questions,
      callback: (results) => {
        if (results) {
          _.each(questions, function (q, i) {
            scope.__config[q.name] = results[i];
          });
          const object = {
            partMesh: tgtModelInst.object3D
          };
          this.__generator.generateMissingGeometryForSpec(scope.__config, object, cb);
        }
      }
    });
    return form;
  }
}


module.exports = AddGeometryForm;
