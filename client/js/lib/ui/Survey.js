var _ = require('util/util');
/**
 * Fancy survey that shows questions.
 * This survey uses a special version of [bootbox]{@link https://github.com/angelxuanchang/bootbox}
 *   that supports form (like prompt but with multiple inputs)
 *          and select with an optional custom input
 *
 * @param params Configuration parameters for Survey
 * @param params.name {string} Name of the survey (used to create survey id)
 * @param params.version {string} Version of the survey (used to create survey id)
 * @param params.title {string} Survey title (form title)
 * @param params.questions {ui.SurveyQuestion[]} Array of survey questions
 * @param [params.showAll=false] {boolean} Whether to show entire form at once or one question at a time
 * @constructor
 * @memberOf ui
 */
function Survey(params) {
  this.name = params.name;
  this.version = params.version;
  this.id = params.name + '-' + params.version;
  this.title = params.title;
  this.questions = params.questions;
  this.showAll = params.showAll;
}

Survey.prototype.showQuestions = function(callback) {
  var form = {
    id: this.id,
    responses: []
  };
  if (this.showAll) {
    this.__showAllQuestions(form, callback);
  } else {
    form.questionIndex = 0;
    this.__showNextQuestion(form, callback);
  }
};

Survey.prototype.__showAllQuestions = function(form, callback) {
  // Requires special bootbox with form support
  bootbox.form({
    title: this.title,
    inputs: this.questions,
    callback: function(results) {
      form.responses = results;
      callback(form);
    }
  });
};

Survey.prototype.__showNextQuestion = function(form, callback) {
  // Show questions one after the other
  var scope = this;
  if (form.questionIndex >= this.questions.length) {
    // Done!
    delete form.questionIndex;
    callback(form);
  } else {
    var question = this.questions[form.questionIndex];
    bootbox.prompt(_.merge(Object.create(null), question, {
      callback: function(result) {
        form.questionIndex++;
        if (result) {
          form.responses[form.questionIndex] = result;
          scope.__showNextQuestion(form, callback);
        }
      }
    }));
  }
};

module.exports = Survey;

/**
 * Survey question (see [bootbox prompt]{@link http://bootboxjs.com/documentation.html#bb-prompt-dialog} for input options) .
 * @class SurveyQuestion
 * @property value default value of input
 * @property inputType {string} `textbox|textarea|email|select|checkbox|date|time|number|password`
 * @property inputOptions {Object[]} Array of options for `select` and `checkbox`.
 * @property customInput {Object} custom input
 * @memberOf ui
 */
