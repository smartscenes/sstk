var _ = require('util');

/**
 * Bootbox form (meant to pop in as a modal and have people fill it out)
 * The form uses a special version of [bootbox]{@link https://github.com/angelxuanchang/bootbox}
 * @param title {string} Form title
 * @param questions {ui.SurveyQuestion[]} Array of survey questions
 * @param [config] {object} Optional responses by name to store with this form
 * @constructor
 * @memberOf ui
 */
function Form(title, questions, config) {
  if (!config) {
    config = {};
    _.each(questions, function(q,i) {
      config[q.name] = q.value;
    });
  }
  this.title = title;
  this.config = config;
  this.questions = questions;
}

/**
 * Prompt user to complete form
 */
Form.prototype.form = function(cb) {
  var scope = this;
  _.each(this.questions, function(q,i) {
    q.value = scope.config[q.name];
  });
  return bootbox.form({
    title: this.title,
    inputs: this.questions,
    callback: function(results) {
      if (results) {
        _.each(scope.questions, function(q,i) {
          scope.config[q.name] = results[i];
        });
        cb(scope.config);
      } else {
        cb();
      }
    }
  });
};

module.exports = Form;
