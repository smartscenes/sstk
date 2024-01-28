const Constants = require('Constants');
const FormUtil = require('ui/modal/FormUtil');
const _ = require('util/util');

class ImportObject3DForm {
  constructor(params)
  {
    this.callbacks = {
      warn: params.warn,
      import: params.import
    };
    this.__config = {
      //format: 'auto',
      up: Constants.worldUp,
      front: Constants.worldFront,
      unit: 1.0
    };
  }

  get config() {
    return this.__config;
  }

  __getQuestions() {
    const questions = [
      {
        'title': 'Up',
        'name': 'up',
        'inputType': 'text',
        'parse': FormUtil.Parsers.Vector3D.parse,
        'value': FormUtil.Parsers.Vector3D.toString(this.__config.up)
      },
      {
        'title': 'Front',
        'name': 'front',
        'inputType': 'text',
        'parse': FormUtil.Parsers.Vector3D.parse,
        'value': FormUtil.Parsers.Vector3D.toString(this.__config.front)
      },
      {
        'title': 'Unit',
        'name': 'unit',
        'inputType': 'number',
        'value': this.__config.unit
      },
    ];
    return questions;
  }

  show() {
    const questions = this.__getQuestions();
    const scope = this;
    const form = bootbox.form({
      title: 'Import shape',
      inputs: questions,
      callback: function (results) {
        if (results) {
          _.each(questions, function (q, i) {
            scope.__config[q.name] = results[i];
          });
          scope.callbacks.import(scope.__config);
        }
      }
    });
    return form;
  }
}


module.exports = ImportObject3DForm;
