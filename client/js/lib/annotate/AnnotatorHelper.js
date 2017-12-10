'use strict';

var Constants = require('Constants');
var PubSub = require('PubSub');
var _ = require('util');
//var bootbox = require('bootbox');

// TODO: This duplicates the code in BasePartAnnotator (consolidate)

/**
 * Provides functions for helping to submission / retrieval of annotations
 * @param app Main annotator app.  The app should provide a getAnnotionData function to retrieve the annotation data to submit
 * @param params Configuration
 * @param params.submitAnnotationsUrl {string} URL to use for submitting annotations.
 * @param [params.retrieveAnnotationsUrl] {string} URL to use to retrieve partial annotations.
 * @param [params.enforceUserId] {boolean} If true, will ask user for user id (if not previously recorded)
 * @param [params.itemIdField=itemId] {string} What field is used for the item id (e.g. modelId, sceneId) when submitting annotations.
 * @param [params.onClose] {function} Function callback for when annotation is done.
 *   If not specified, the default behavior is to use `onCloseUrl` to go to some other location.
 * @param [params.onCloseUrl] {string} URL to go to when done annotating (typically when annotation submission is successful).
 *   Use `referrer` to go to referring document on close.  If not specified, a message will indicate that submission was successful.
 * @constructor AnnotatorHelper
 * @memberOf annotate
 */
function AnnotatorHelper(app, params) {
  this.app = app; // Actually annotation app
  this.enforceUserId = params.enforceUserId;
  this.submitAnnotationsUrl = params.submitAnnotationsUrl;
  this.retrieveAnnotationsUrl = params.retrieveAnnotationsUrl;
  this.itemIdField = params.itemIdField || 'itemId';

  // What to do when done with the annotator (typically called when submission is successful)
  this.onClose = params.onClose;
  this.onCloseUrl = params.onCloseUrl;
  if (!this.onClose) {
    var scope = this;
    this.onClose = function () {
      var onCloseUrl = scope.onCloseUrl;
      if (onCloseUrl === 'referrer') {
        onCloseUrl = document.referrer;
      }
      if (onCloseUrl) {
        gotoURL(onCloseUrl);
      } else {
        bootbox.alert('Thank you for annotating!');
      }
    };
  }
}

AnnotatorHelper.prototype = Object.create(PubSub.prototype);
AnnotatorHelper.prototype.constructor = AnnotatorHelper;

AnnotatorHelper.prototype.onSubmitSuccessful = function() {
  // Close the annotator
  this.onClose();
};

/**
 * Submit annotations
 * @param action {string} Use 'done' to indicate that annotation is complete, and 'save' to save current snapshot
 */
AnnotatorHelper.prototype.submitAnnotations = function (action) {
  var scope = this;
  if (this.enforceUserId) {
    this.authenticate(function() {
      scope.__submitAnnotations(action);
    });
  } else {
    scope.__submitAnnotations(action);
  }
};

// Basic submitAnnotations
AnnotatorHelper.prototype.__submitAnnotations = function (action) {
  var annData = this.app.getAnnotationData();
  annData.action = action;
  this.submitAnnotationData(annData, annData[this.itemIdField]);
};

// Helper function to prepare annotation data
AnnotatorHelper.prototype.prepareAnnotationData = function (itemId, data, screenshot) {
  var params = {
    appId: this.app.appId,
    sessionId: Constants.getGlobalOrDefault('sessionId', 'local-session', { dropEmpty: true }),
    condition: Constants.getGlobalOrDefault('condition', this.app.urlParams['condition'] || 'test', { dropEmpty: true }),
    task: Constants.getGlobalOrDefault('task', this.app.task, { dropEmpty: true }),
    taskMode: this.app.taskMode,
    userId: this.app.userId,  // This is set to workerId under mturk
    data: data,
    screenshot: screenshot
  };
  params[this.itemIdField] = itemId;
  return params;
};

AnnotatorHelper.prototype.submitAnnotationData = function (data, itemId) {
  $.ajax({
    type: 'POST',
    url: this.submitAnnotationsUrl,
    contentType: 'application/json;charset=utf-8',
    data: JSON.stringify(data),
    dataType: 'json',
    success: function (res) {
      console.log(res);
      if (res.code === 200) {
        console.log('Annotations successfully submitted for ' + itemId);
        this.onSubmitSuccessful();
      } else {
        console.error('Error submitting annotations: ' + res.status);
      }
    }.bind(this),
    error: function () {
      console.error('Error submitting annotations for ' + itemId);
    }
  });
};

// Enforce that we have a good userId
AnnotatorHelper.prototype.authenticate = function(cb) {
  // Most basic auth ever
  if (this.app.userId && !this.app.userId.startsWith('USER@')) {
    cb({ username: this.app.userId });
  }
  if (!this.auth) {
    var Auth = require('util/Auth');
    this.auth = new Auth();
  }
  this.auth.authenticate(function(user) {
    this.app.userId = user.username;
    cb(user);
  }.bind(this));
};

// Given parameters, retrieve appropriate annotations
AnnotatorHelper.prototype.retrieveAnnotations = function (params, callback) {
  var data = $.param(params);
  var scope = this;
  var waitingKey = 'retrieveAnnotations_' + _.generateRandomId();
  if (this.app.addWaiting) {
    this.app.addWaiting(waitingKey);
  }
  $.ajax({
    type: 'GET',
    url: this.retrieveAnnotationsUrl,
    data: data,
    dataType: 'json',
    success: function (res) {
      if (scope.app.removeWaiting) {
        scope.app.removeWaiting(waitingKey);
      }
      //console.log(res);
      callback(null, res);
    },
    error: function (jqXHR, textStatus, errorThrown) {
      if (scope.app.removeWaiting) {
        scope.app.removeWaiting(waitingKey);
      }
      console.error('Error retrieving annotations for '  + params.modelId);
      console.log(errorThrown);
      callback('Error retrieving annotations for '  + params.modelId, null);
    }
  });
};

module.exports = AnnotatorHelper;