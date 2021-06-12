var UIUtil = require('ui/UIUtil');
var _ = require('util/util');

var AnnotatorUtil = {};

AnnotatorUtil.retrieveAnnotations = function(url, annotationType, itemId, callback) {
  var retrieveParams = {
    itemId: itemId,
    type: annotationType
  };
  _.postJSON(url, retrieveParams, {
    callback: (err, res) => {
      if (err) {
        if (res && res.status === 'No matching annotation') {
          console.log('No annotations for ' + itemId);
          UIUtil.showAlert('No annotations for ' + itemId, 'alert-warning');
        } else {
          console.error('Error retrieving annotations for ' + itemId);
          UIUtil.showAlert('Error retrieving annotations for ' + itemId);
        }
      } else {
        if (res.data && _.isArray(res.data)) {
          res.annotations = res.data;
          delete res.data;
        }
        console.log('Annotations successfully retrieved for ' + itemId);
      }
      callback(err, res);
    }
  });
};

AnnotatorUtil.submitAnnotations = function (url, data, itemId, callback) {
  _.postJSON(url, data, {
    callback: (err, res) => {
      if (err) {
        console.error('Error submitting annotations for '  + itemId);
        UIUtil.showAlert('Error submitting annotations', 'alert-danger');
      } else {
        if (res.code === 200) {
          console.log('Successfully submitted annotations for ' + itemId);
          UIUtil.showAlert('Successfully submitted annotations', 'alert-success');
        } else {
          console.error('Error submitting annotations for '  + itemId + ': ' + res.status);
          UIUtil.showAlert('Error submitting annotations', 'alert-danger');
        }
      }
      callback(err, res);
    }
  });
};

module.exports = AnnotatorUtil;