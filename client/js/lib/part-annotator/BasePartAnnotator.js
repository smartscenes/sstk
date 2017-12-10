'use strict';

var Constants = require('Constants');
var Object3DUtil = require('geo/Object3DUtil');
var UndoStack = require('editor/UndoStack');
var LabelPointer = require('controls/LabelPointer');
var LabelPainter = require('controls/LabelPainter');
var UIUtil = require('ui/UIUtil');
var _ = require('util');
//var bootbox = require('bootbox');

/**
 * Factory for generating a basic part annotator
 * @param baseClass {Class} Name of class to use as base class (see {@link ModelPartViewer}, {@link BasePartViewer})
 * @constructor
 */
function BasePartAnnotatorFactory(baseClass) {
  /**
   * Base class for part annotators
   * @param params Configuration (see {@link ModelPartViewer}, {@link BasePartViewer} for additional parameters)
   * @param params.submitAnnotationsUrl {string} URL to use for submitting annotations.
   * @param [params.retrieveAnnotationsUrl] {string} URL to use to retrieve partial annotations.
   * @param [params.enforceUserId] {boolean} If true, will ask user for user id (if not previously recorded)
   * @param [params.itemIdField] {string} What field is used for the item id (e.g. modelId, sceneId) when submitting annotations.
   * @param [params.numItemsAnnotated=0] {int} How many items have already been annotated (show in progress)
   * @param [params.numItemsTotal=1] {int} How many total items need to be annotated (show in progress)
   * @param [params.onClose] {function} Function callback for when annotation is done.
   *   If not specified, the default behavior is to use `onCloseUrl` to go to some other location.
   * @param [params.onCloseUrl] {string} URL to go to when done annotating (typically when annotation submission is successful).
   *   Use `referrer` to go to referring document on close.  If not specified, a message will indicate that submission was successful.
   * @param [params.clearAnnotationOptions] Configuration of what to do when annotator is ready
   * @param [params.clearAnnotationOptions.clearLabels=true] {boolean} Set clearLabels to true to clear any predefined labels
   * @constructor BasePartAnnotator
   */
  function BasePartAnnotator(params) {
    // see http://swisnl.github.io/jQuery-contextMenu/demo/input.html
    var defaultContextMenuItems = {};
    if (params.linkWordNet || _.getUrlParam('linkWordNet')) {
      // create wordnetLinker who will do magic!
      var WordNetLinker = require('nlp/WordNetLinker');
      var wordnetLinker = new WordNetLinker({
        app: this,
        contextMenuItems: defaultContextMenuItems
      });
    }
    var defaultContextMenuOptions;
    if (_.size(defaultContextMenuItems)) {
      defaultContextMenuOptions = { items: defaultContextMenuItems };
    }
    // Default configuration
    var defaults = {
      appId: 'BasePartAnnotator.v1',
      screenshotMaxWidth: 100,
      screenshotMaxHeight: 100,
      enforceUserId: true,
      undo: {
        enabled: false,
        stackSize: 10
      },
      instructions: {
        html:
          'Left click = Select/Deselect part<br>' +
          'Left click and drag = select/deselect multiple parts<br>' +
          'Right click and drag or arrow keys = Orbit/rotate camera<br>' +
          'SHIFT + Right click and drag = Pan view<br>' +
          'Mouse wheel = Zoom view<br>' +
          'Number keys = Keyboard shortcut for part name<br><br>' +
          'C = toggle transparency and enable/disable annotation<br><br>' +
          'Step 1: Select a name on the right<br>' +
          'Step 2: Color in parts of the object using the mouse'
      },
      labelsPanel: {
        contextMenu: defaultContextMenuOptions,
        allowNewLabels: true,
        allowDelete: true,
        checkedDelete: this.__checkedDeleteLabel.bind(this),
        noTransparency: true
      },
      clearAnnotationOptions: {
        clearLabels: false               // Whether to clear labels when all annotations are cleared
      },
      uihookups: _.keyBy([
        {
          name: 'next',
          element: '#nextBtn',
          click: this.submitAnnotations.bind(this),
          shortcut: 'shift-n'
        },
        {
          name: 'clear',
          click: this.checkedClearAnnotations.bind(this),
          shortcut: 'ctrl-shift-k'
        },
        {
          name: 'pass',
          element: '#passBtn',
          click: this.pass.bind(this)
        },
        {
          name: 'undo',
          click: this.undo.bind(this),
          shortcut: 'defmod-z'
        },
        {
          name: 'redo',
          click: this.redo.bind(this),
          shortcut: 'defmod-y'
        }
      ], 'name')
    };
    params = _.defaultsDeep(Object.create(null), params, defaults);
    baseClass.call(this, params);

    this.defaultClearAnnotationOptions = params.clearAnnotationOptions;
    this.enforceUserId = params.enforceUserId;
    this.submitAnnotationsUrl = params.submitAnnotationsUrl;
    this.retrieveAnnotationsUrl = params.retrieveAnnotationsUrl;
    this.itemIdField = params.itemIdField;
    this.numItemsAnnotated = params.numItemsAnnotated || 0;
    this.numItemsTotal = params.numItemsTotal || 1;
    this.taskMode = Constants.getGlobal('taskMode');
    if (!this.taskMode) {
      this.taskMode = this.urlParams['taskMode'] || params.taskMode;
    }

    this.annotations = [];
    this.annotationStats = {};

    var scope = this;
    this.painter = params.labelPainter || new (params.useLabelPointer? LabelPointer : LabelPainter)({
      container: this.container,
      labeler: this.labeler,
      eraseMat: Object3DUtil.ClearMat
    });
    this.painter.Subscribe('LabelPart', this, function(part, labelInfo) {
      if (!labelInfo) {
        scope.showAlert('Select a part name or enter your own.');
      }
    });
    this.painter.Subscribe('PartChanged', this, function(part) {
      scope.onPartChanged(part);
    });
    this.painter.Subscribe('SelectPart', this, function(part) {
      if (part && part.userData.labelInfo) {
        scope.labelsPanel.selectLabel(part.userData.labelInfo);
      }
    });
    this.undoStack = null;

    // What to do when done with the annotator (typically called when submission is successful)
    this.onClose = params.onClose;
    this.onCloseUrl = params.onCloseUrl;
    if (!this.onClose) {
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

    // Did we successfully submit our annotations (if not there will be prompt asking if we want to leave this interface)
    this.__annotationsSubmitted = false;
  }

  BasePartAnnotator.prototype = Object.create(baseClass.prototype);
  BasePartAnnotator.prototype.constructor = BasePartAnnotator;

  BasePartAnnotator.prototype.onSubmitSuccessful = function() {
    // Close the annotator
    this.__annotationsSubmitted = true;
    this.onClose();
  };

  BasePartAnnotator.prototype.checkUnsavedChanges = function() {
    if (!this.__annotationsSubmitted) {
      return 'Are you sure you want to leave this page?  You may have unsaved annotations!';
    }
  };

  BasePartAnnotator.prototype.registerCustomEventListeners = function () {
    this.painter.registerEventListeners(this.renderer.domElement);
    if (this.__options.undo.enabled) {
      this.undoStack = new UndoStack(this, this.__options.undo.stackSize);
      this.labelsPanel.Subscribe(Constants.EDIT_OPSTATE.INIT, this, this.onEditOpInit.bind(this));
      this.labelsPanel.Subscribe(Constants.EDIT_OPSTATE.DONE, this, this.onEditOpDone.bind(this));
      this.painter.Subscribe(Constants.EDIT_OPSTATE.INIT, this, this.onEditOpInit.bind(this));
      this.painter.Subscribe(Constants.EDIT_OPSTATE.DONE, this, this.onEditOpDone.bind(this));
    }
  };

  // Undo/redo support
  BasePartAnnotator.prototype.undo = function() {
    if (this.undoStack) {
      this.undoStack.undo();
    }
  };

  BasePartAnnotator.prototype.redo = function() {
    if (this.undoStack) {
      this.undoStack.redo();
    }
  };

  BasePartAnnotator.prototype.__trackUndo = function(flag) {
    if (this.undoStack) {
      if (flag) {
        this.undoStack.enable();
      } else {
        this.undoStack.disable();
      }
    }
  };

  BasePartAnnotator.prototype.onEditOpInit = function (cmd, cmdParams) {
    if (this.undoStack) {
      this.undoStack.prepareDeltaState(cmd, cmdParams);
    }
  };

  BasePartAnnotator.prototype.onEditOpDone = function (cmd, cmdParams) {
    if (this.undoStack) {
      this.undoStack.pushCurrentState(cmd, cmdParams);
    }
  };

  BasePartAnnotator.prototype.onPartChanged = function (part) {
  };

  BasePartAnnotator.prototype.onSelectLabel = function (labelInfo) {
    baseClass.prototype.onSelectLabel.call(this, labelInfo);
    this.painter.setLabelInfo(labelInfo);
  };

  BasePartAnnotator.prototype.onRenameLabel = function (labelInfo) {
    baseClass.prototype.onRenameLabel.call(this, labelInfo);
    this.painter.updateTooltip(labelInfo);
  };

  BasePartAnnotator.prototype.setTransparency = function (flag) {
    baseClass.prototype.setTransparency.call(this, flag);
    this.painter.enabled = flag;
  };

  // Passes on this model (it doesn't count for the overall annotated
  BasePartAnnotator.prototype.pass = function () {
    var hasAnnotated = this.hasAnnotations();
    if (hasAnnotated) {
      bootbox.confirm('You have parts annotated.  Are you sure you want to pass on this?', function (result) {
        if (result) {
          this.__pass();
        }
      }.bind(this));
    } else {
      this.__pass();
    }
  };

  BasePartAnnotator.prototype.__pass = function () {
    var params = _.defaults( { pass: this.itemId }, this.urlParams );
    window.location.search = '?' + $.param(params);
//    this.reload();
  };

  BasePartAnnotator.prototype.reload = function () {
    // Let's just force a reload for now
    location.reload(true);
  };

  // Custom functions to be provided by child class!!!

  // Creates annotations for all annotated parts
  BasePartAnnotator.prototype.annotate = function (debug) {
  };

  BasePartAnnotator.prototype.hasAnnotations = function () {
    return this.annotations && this.annotations.length > 0;
  };

  BasePartAnnotator.prototype.getAnnotationStats = function () {
  };

  /* Creates annotations and submits to backend */
  BasePartAnnotator.prototype.submitAnnotations = function () {
    var scope = this;
    if (this.enforceUserId) {
      this.authenticate(function() {
        scope.__submitAnnotations();
      });
    } else {
      scope.__submitAnnotations();
    }
  };

  // Implementation
  BasePartAnnotator.prototype.__submitAnnotations = function () {
    //console.log('got user ' + scope.userId);
    this.annotate();

    // Check if there are annotations
    if (!this.hasAnnotations(this.annotations)) {
      this.showAlert('Please annotate some parts before submitting!', 'alert-warning');
      return;
    }

    var partAnnotations = this.annotations;
    // Get part labels (in case user has added label)
    var partLabels = this.labeler.getLabels();

    var screenshot = this.getImageData(this.screenshotMaxWidth, this.screenshotMaxHeight);
    var itemId = this.itemId;
    var params = {
      appId: this.appId,
      sessionId: Constants.getGlobalOrDefault('sessionId', 'local-session'),
      condition: Constants.getGlobalOrDefault('condition', 'test'),
      task: Constants.getGlobal('task'),
      taskMode: this.taskMode,
      userId: this.userId,  // This is set to workerId under mturk
      annotations: partAnnotations, // All parts
      screenshot: screenshot,
      labels: partLabels
    };
    params[this.itemIdField] = itemId;
    var data = {};
    var annStats = this.getAnnotationStats();
    if (annStats) {
      data['stats'] = annStats;
    }
    this.timings.mark('annotationSubmit');
    var timings = this.timings.toJson();
    if (timings) {
      data['timings'] = timings;
    }
    if (this.metadata) {
      data['metadata'] = this.metadata;
    }
    if (this.form) {
      data['form'] = this.form;
    }
    params['data'] = data;
    this.__submitAnnotationData(params, itemId);
  };

  BasePartAnnotator.prototype.__submitAnnotationData = function (data, itemId) {
    $.ajax({
      type: 'POST',
      url: this.submitAnnotationsUrl,
      contentType: 'application/json;charset=utf-8',
      data: JSON.stringify(data),
      dataType: 'json',
      success: function (res) {
        console.log(res);
        if (res.code === 200) {
          console.log('Part annotations successfully submitted for ' + itemId);
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

  BasePartAnnotator.prototype.__checkedDeleteLabel = function (labelInfo, deleteLabelFn) {
    if (this.labeler.hasParts(labelInfo)) {
      bootbox.confirm('You have annotations for "' + labelInfo.name + '".  Are you sure you want to delete this label?',
        function (result) {
          if (result) {
            // Unlabel parts
            this.labeler.unlabelParts(null, labelInfo);
            // Delete label
            if (this.labeler.hasParts(labelInfo)) {
              // Hmm, some parts still have this label - weird
              UIUtil.showAlert(null, 'Unable to remove all parts for label ' + labelInfo.name, 'alert-warning');
            } else {
              deleteLabelFn(labelInfo);
            }
          }
        }.bind(this));
    } else {
      deleteLabelFn(labelInfo);
    }
  };

  // Prompts user whether they want to clear annotations before clearing annotations
  BasePartAnnotator.prototype.checkedClearAnnotations = function () {
    bootbox.confirm('Are you sure you want to clear all annotations?',
      function (result) {
        if (result) {
          this.clearAnnotations(this.defaultClearAnnotationOptions);
        }
      }.bind(this)
    );
  };

  // Clears all annotations
  BasePartAnnotator.prototype.clearAnnotations = function(opts) {
    this.labeler.unlabelAll();
    if (opts && opts.clearLabels) {
      this.labelsPanel.clear();
    }
  };

  // Enforce that we have a good userId
  BasePartAnnotator.prototype.authenticate = function(cb) {
    // Most basic auth ever
    if (this.userId && !this.userId.startsWith('USER@')) {
      cb({ username: this.userId });
    }
    if (!this.auth) {
      var Auth = require('util/Auth');
      this.auth = new Auth();
    }
    this.auth.authenticate(function(user) {
      this.userId = user.username;
      cb(user);
    }.bind(this));
  };

  // Given parameters, retrieve appropriate annotations
  BasePartAnnotator.prototype.__retrieveAnnotations = function (params, callback) {
    var data = $.param(params);
    var that = this;
    var waitingKey = 'retrieveAnnotations_' + _.generateRandomId();
    this.addWaiting(waitingKey);
    $.ajax({
      type: 'GET',
      url: this.retrieveAnnotationsUrl,
      data: data,
      dataType: 'json',
      success: function (res) {
        that.removeWaiting(waitingKey);
        //console.log(res);
        callback(null, res);
      },
      error: function (jqXHR, textStatus, errorThrown) {
        that.removeWaiting(waitingKey);
        console.error('Error retrieving annotations for '  + params.modelId);
        console.log(errorThrown);
        callback('Error retrieving annotations for '  + params.modelId, null);
      }
    });
  };

  return BasePartAnnotator;
}

module.exports = BasePartAnnotatorFactory;