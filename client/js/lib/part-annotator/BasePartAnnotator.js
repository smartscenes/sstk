'use strict';

var Constants = require('Constants');
var Object3DUtil = require('geo/Object3DUtil');
var UndoStack = require('editor/UndoStack');
var LabelPointer = require('controls/LabelPointer');
var LabelPainter = require('controls/LabelPainter');
var MeshHelpers = require('geo/MeshHelpers');
var Form = require('ui/Form');
var UIUtil = require('ui/UIUtil');
var FileUtil = require('io/FileUtil');
var _ = require('util/util');
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
   * @param [params.linkWordNet] Whether we should allow user to link to WordNet synsets
   * @param [params.labelPainter] {controls.LabelPainter} Instantiated LabelPainter to use
   * @param [params.useLabelPointer] {boolean} Whether to create a LabelPointer or LabelPainter (if labelPainter not specified)
   * @param [params.obbsVisible=false] {boolean} To show obbs of labeled segment groups or not.
   * @param [params.allowPass=false] {boolean} Whether passing of this item is allowed
   * @param [params.allowHierarchy=false] {boolean} Whether grouping of labels into hierarchy is allowed
   * @param [params.allowCutting=false] {boolean} Whether mesh cutting is allowed
   * @param [params.expandObbAmount=0] {number} Number of virtual unit to expand obb by with labeling obb
   * @param [params.taskMode] Annotator task mode (fixup, verify)
   * @param [params.annotationType] Annotation type (segment or segment-triindices)
   * @param [params.debug] Whether to enable debugging for the interface
   * @constructor BasePartAnnotator
   */
  function BasePartAnnotator(params) {
    // Default configuration
    this.isAnnotator = true;
    this.debug = params.debug || this.getUrlParams()['debug'];
    var uihookups = [];
    if (params.allowNext !== false) {
      uihookups.push(      {
          name: 'next',
          element: '#nextBtn',
          click: this.submitAnnotations.bind(this, true),
          shortcut: 'shift-n'
        }
      );
    } else {
      $('#nextBtn').hide();
    }
    if (params.allowSave) {
      uihookups.push({
        name: 'save',
        element: '#saveBtn',
        click: this.submitAnnotations.bind(this, false),
        shortcut: 'shift-s'
      });
    } else {
      $('#saveBtn').hide();
    }
    uihookups.push.apply(uihookups, [
      {
        name: 'clear',
        click: this.checkedClearAnnotations.bind(this),
        shortcut: 'ctrl-shift-k'
      },
      {
        name: 'toggleShowSelectedOnlyMode',
        click: function() {
          this.showSelectedOnlyMode = !this.showSelectedOnlyMode;
        }.bind(this),
        shortcut: 'ctrl-shift-t'
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
    ]);
    if (this.debug) {
      uihookups.push({
        name: 'saveAnnotation',
        click: function() { this.saveAnnotations(); }.bind(this),
        shortcut: 'ctrl-s'
      });
      uihookups.push({
        name: 'loadAnnotation',
        click: function() { this.loadAnnotationsWithForm(); }.bind(this),
        shortcut: 'ctrl-l'
      });
    };
    var defaults = {
      appId: 'BasePartAnnotator.v1',
      screenshotMaxWidth: 100,
      screenshotMaxHeight: 100,
      enforceUserId: true,
      expandObbAmount: 0,
      annoFileExt: 'parts.json',            // Extension to use when exporting annotations to file
      storeAnnotationsInDataField: false,   // Whether to store the annotations as part of the data field
      undo: {
        enabled: false,
        stackSize: 20
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
        allowNewLabels: true,
        allowDelete: true,
        checkedDelete: this.__checkedDeleteLabel.bind(this),
        noTransparency: true
      },
      clearAnnotationOptions: {
        clearLabels: false               // Whether to clear labels when all annotations are cleared
      },
      uihookups: _.keyBy(uihookups, 'name')
    };
    var annotationModes = ['label'];
    if (params.allowHierarchy) {
      annotationModes.push('group');
    }
    if (params.allowCutting) {
      annotationModes.push('cut');
    }
    if (annotationModes.length > 1) {
      defaults['uihookups']['toggleAnnotationMode'] = {
        name: 'toggleAnnotationMode',
        click: this.toggleAnnotationMode.bind(this),
        shortcut: 'ctrl-shift-a'
      };
    }
    params = _.defaultsDeep(Object.create(null), params, defaults);
    baseClass.call(this, params);

    this.annotationType = params.annotationType;
    this.allowPass = params.allowPass;
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

    this.annotationModes = annotationModes;
    this.__annotationModeIndex = 0;
    this.allowHierarchy = params.allowHierarchy;
    this.allowCutting = params.allowCutting;

    if (this.allowPass) {
      $('#passBtn').removeClass('hidden');
    } else {
      $('#passBtn').addClass('hidden');
    }

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
          _.gotoURL(onCloseUrl);
        } else {
          bootbox.alert('Thank you for annotating!');
        }
      };
    }

    // Other parameters
    this.__expandObbAmount = params.expandObbAmount;
    this.__mainModelOpacity = 1;

    // Did we successfully submit our annotations (if not there will be prompt asking if we want to leave this interface)
    this.__annotationsSubmitted = false;

    // mode to just show selected only
    this.__showSelectedOnlyMode = false;

    // Debug OBBs
    this.obbsVisible = params.obbsVisible;
    this.debugOBBsNode = new THREE.Group();
    this.debugOBBsNode.name = 'DebugOBBs';
    this.debugNode.add(this.debugOBBsNode);
    this.excludeFromPicking.push(this.debugOBBsNode);
  }

  BasePartAnnotator.prototype = Object.create(baseClass.prototype);
  BasePartAnnotator.prototype.constructor = BasePartAnnotator;

  Object.defineProperty(BasePartAnnotator.prototype, 'showSelectedOnlyMode', {
    get: function () {return this.__showSelectedOnlyMode; },
    set: function (v) {
      this.__showSelectedOnlyMode = v;
      if (this.__showSelectedOnlyMode) {
        this.showSelectedOnlyWithUnknown();
      } else {
        this.showAll();
      }
    }
  });

  Object.defineProperty(BasePartAnnotator.prototype, 'mainModelOpacity', {
    get: function () {return this.__mainModelOpacity; },
    set: function (v) {
      this.__mainModelOpacity = v;
      if (this.__modelInstance) {
        Object3DUtil.setOpacity(this.__modelInstance.object3D, v);
      }
    }
  });

  Object.defineProperty(BasePartAnnotator.prototype, 'mainModelVisible', {
    get: function () {return !!(this.__modelInstance && this.__modelInstance.object3D.visible); },
    set: function (v) {
      if (this.__modelInstance) {
        Object3DUtil.setVisible(this.__modelInstance.object3D, v);
      }
    }
  });

  Object.defineProperty(BasePartAnnotator.prototype, 'annotationMode', {
    get: function () {
      return this.__annotationModeIndex >= 0?
        this.annotationModes[this.__annotationModeIndex] : null; }
  });

  Object.defineProperty(BasePartAnnotator.prototype, 'annotationModeIndex', {
    get: function () {return this.__annotationModeIndex; },
    set: function (v) {
      if (this.__annotationModeIndex !== v) {
        if (this.__annotationModeIndex >= 0) {
          this.__exitAnnotationMode(this.__annotationModeIndex);
        }
        this.__enterAnnotationMode(v);
      }
    }
  });

  BasePartAnnotator.prototype.toggleAnnotationMode = function() {
    this.annotationModeIndex = (this.annotationModeIndex + 1) % this.annotationModes.length;
    //console.log('set annotationModeIndex ' + this.annotationModeIndex);
  };

  BasePartAnnotator.prototype.__enterAnnotationMode = function(index) {
    this.__annotationModeIndex = index;
    var mode = this.annotationMode;
    console.log('Entering annotation mode: ' + mode);
    this.__showUIs(mode);
    if (this.__uis[mode]) {
      var ui = this.__uis[mode];
      var controls = ui.controls;
      if (controls) {
        _.each(controls, function(c) {
          c.enabled = true;
        });
      }
      if (ui.enter) {
        ui.enter();
      }
    } else {
      this.showAlert('Unsupported annotation mode ' + mode, 'alert-warning');
    }
  };

  BasePartAnnotator.prototype.__exitAnnotationMode = function(index) {
    var mode = this.annotationModes[index];
    console.log('Exiting annotation mode: ' + mode);
    this.__showUIs(null);
    if (this.__uis[mode]) {
      var ui = this.__uis[mode];
      if (ui.exit) {
        ui.exit();
      }
      var controls = ui.controls;
      if (controls) {
        _.each(controls, function(c) {
          c.enabled = false;
        });
        console.log(controls);
      }
    }
    this.__annotationModeIndex = -1;
  };

  BasePartAnnotator.prototype.setupDatGui = function () {
    if (this.useDatGui) {
      baseClass.prototype.setupDatGui.call(this);
      this.datgui.add(this, 'mainModelOpacity', 0, 1).name('Reference opacity').listen();
      this.datgui.add(this, 'mainModelVisible').name('Reference visible').listen();
      this.datgui.add(this, '__expandObbAmount', 0, 0.1*Constants.metersToVirtualUnit).name('Expand OBB By').listen();
      this.datgui.add(this, 'saveAnnotations').name('Export annotations');
      this.datgui.add(this, 'loadAnnotationsWithForm').name('Import annotations');
    }
  };

  BasePartAnnotator.prototype.onSubmitSuccessful = function(gotoNext) {
    // Close the annotator
    this.__annotationsSubmitted = true;
    if (gotoNext) {
      this.onClose();
    }
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
      if (this.wordnetLinker) {
        this.wordnetLinker.Subscribe(Constants.EDIT_OPSTATE.INIT, this, this.onEditOpInit.bind(this));
        this.wordnetLinker.Subscribe(Constants.EDIT_OPSTATE.DONE, this, this.onEditOpDone.bind(this));
      }
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
    if (this.obbsVisible && this.selectedLabelInfos) {
      this.showPartOBBs(this.selectedLabelInfos);
    }
  };

  BasePartAnnotator.prototype.onSelectLabel = function (labelInfos) {
    var labelInfo;
    if (Array.isArray(labelInfos)) {
      if (labelInfos.length === 1) {
        labelInfo = labelInfos[0];
      }
    } else {
      labelInfo = labelInfos;
      labelInfos = [labelInfo];
    }
    baseClass.prototype.onSelectLabel.call(this, labelInfo);
    this.painter.setLabelInfo(labelInfo);
    this.selectedLabelInfos = labelInfos;
    if (this.obbsVisible) {
      this.showPartOBBs(labelInfos);
    }
    if (this.showSelectedOnlyMode && this.showSelectedOnlyWithUnknown) {
      this.showSelectedOnlyWithUnknown();
    }
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

  /**
   * Get array of annotated parts
   * @returns array of annotated parts
   */
  BasePartAnnotator.prototype.getPartAnnotations = function() {
    this.annotate();
    return this.annotations;
  };

  BasePartAnnotator.prototype.saveAnnotations = function () {
    if (this.labeler && this.labeler.checkLabels) {
      var messages = this.labeler.checkLabels();
      console.log('Check labels', messages);
    }

    // Save part annotations to file
    var annotations = this.getPartAnnotations();
    if (annotations.length === 0) {
      UIUtil.showAlert('Please provide some part annotations before saving', 'alert-warning');
      return;
    }

    this.timings.mark('annotationSave');
    var fileExt = this.__options.annoFileExt;
    var filename = (this.itemId != null)? this.itemId + '.' + fileExt : fileExt;
    if (this.enforceUserId) {
      this.authenticate(() => {
        var data = this.getAnnotationsJson(annotations);
        FileUtil.saveJson(data, filename);
      });
    } else {
      var data = this.getAnnotationsJson(annotations);
      FileUtil.saveJson(data, filename);
    }
  };

  BasePartAnnotator.prototype.__loadAnnotationsFromFile = function (data, options) {
    console.log('Please implement support for loading annotations from file', data);
  };

  BasePartAnnotator.prototype.loadAnnotationsFromFile = function (options) {
    FileUtil.readAsync(options.file || options.path, 'json', (err, data) => {
      if (err) {
        UIUtil.showAlert('Error loading part annotations');
        console.error('Error loading part annotations', err);
      } else {
        this.__loadAnnotationsFromFile(data, options);
      }
    });
  };

  BasePartAnnotator.prototype.loadAnnotationsWithForm = function () {
    UIUtil.popupFileInput(file => {
      this.loadAnnotationsFromFile({ file: file });
    });
  };

  BasePartAnnotator.prototype.hasAnnotations = function () {
    this.annotate();
    return this.__hasAnnotations(this.annotations);
  };

  BasePartAnnotator.prototype.__hasAnnotations = function (annotations) {
    return annotations && annotations.length > 0;
  };

  BasePartAnnotator.prototype.getAnnotationStats = function () {
  };

  /* Creates annotations and submits to backend */
  BasePartAnnotator.prototype.submitAnnotations = function (gotoNext) {
    var scope = this;
    if (this.enforceUserId) {
      this.authenticate(function() {
        scope.__submitAnnotations(gotoNext);
      });
    } else {
      scope.__submitAnnotations(gotoNext);
    }
  };

  // Implementation
  BasePartAnnotator.prototype.__submitAnnotations = function (gotoNext) {
    //console.log('got user ' + scope.userId);
    this.annotate();

    // Check if there are annotations
    if (!this.__hasAnnotations(this.annotations)) {
      this.showAlert('Please annotate some parts before submitting!', 'alert-warning');
      return;
    }

    this.timings.mark('annotationSubmit');
    var params = this.getAnnotationsJson(this.annotations, true);
    this.__submitAnnotationData(params, this.itemId, gotoNext);
  };

  BasePartAnnotator.prototype.__updateAnnotationHistory = function (annotations) {
    if (annotations && annotations.length) {
      console.log('annotations', annotations);
      this.annotationHistory = [];
      if (annotations[0].annotationHistory) {
        this.annotationHistory = annotations[0].annotationHistory.slice();
        this.annotationHistory.unshift({
          annId: annotations[0].id,
          timings: annotations[0].data.timings,
          stats: annotations[0].data.stats
        });
      } else {
        for (var i = 0; i < annotations.length; i++) {
          if (annotations[i].data) {
            this.annotationHistory.push({
              annId: annotations[i].id,
              timings: annotations[i].data.timings,
              stats: annotations[i].data.stats
            });
          }
        }
      }
    } else {
      this.annotationHistory = null;
    }
  };

  BasePartAnnotator.prototype.getAnnotationsJson = function(partAnnotations, includeScreenshot) {
    // Get part labels (in case user has added label)
    var partLabels = partAnnotations.map(ann => ann.label);

    var screenshot = includeScreenshot?
      this.getImageData(this.screenshotMaxWidth, this.screenshotMaxHeight) : undefined;
    var itemId = this.itemId;
    var params = {
      appId: this.appId,
      type: this.annotationType,
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
    if (this.__options.storeAnnotationsInDataField) {
      data.annotations = partAnnotations;
      delete params['annotations'];
    }
    if (this.annotationHistory) {
      data['annotationHistory'] = this.annotationHistory;
    }
    return params;
  };

  BasePartAnnotator.prototype.__submitAnnotationData = function (data, itemId, gotoNext) {
    $.ajax({
      type: 'POST',
      url: this.submitAnnotationsUrl,
      contentType: 'application/json;charset=utf-8',
      data: JSON.stringify(data),
      dataType: 'json',
      success: function (res) {
        console.log(res);
        if (res.code === 200) {
          UIUtil.showAlert('Part annotations successfully submitted', 'alert-success');
          console.log('Part annotations successfully submitted for ' + itemId);
          this.onSubmitSuccessful(gotoNext);
        } else {
          UIUtil.showAlert('Error submitting annotations', 'alert-danger');
          console.error('Error submitting annotations: ' + res.status);
        }
      }.bind(this),
      error: function () {
        UIUtil.showAlert('Error submitting annotations', 'alert-danger');
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
              UIUtil.showAlert('Unable to remove all parts for label ' + labelInfo.name, 'alert-warning');
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
      return;
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
        //console.log(res);
        callback(null, res);
        that.removeWaiting(waitingKey);
      },
      error: function (jqXHR, textStatus, errorThrown) {
        var itemId = params.modelId != null? params.modelId : params.itemId;
        var status = _.get(jqXHR.responseJSON, 'status');
        if (status === 'No matching annotation') {
          console.log('No annotations for ' + itemId);
          callback(null);
        } else {
          console.error('Error retrieving annotations for ' + itemId);
          console.log(errorThrown);
          callback('Error retrieving annotations for ' + itemId, null);
        }
        that.removeWaiting(waitingKey);
      }
    });
  };

  BasePartAnnotator.prototype.getAllSelectedWithParts = function() {
    var labeler = this.labeler;
    var selected = this.labelsPanel.getAllSelected();
    // filter out selected that don't have any parts
    selected = selected? selected.filter(function(x) { return labeler.hasParts(x); }) : null;
    return selected;
  };

  // Some helpful actions on labels
  BasePartAnnotator.prototype.fillSelected = function(fill) {
    // filter out selected that don't have any parts
    var selected = this.getAllSelectedWithParts();
    if (selected && selected.length) {
      this.onEditOpInit('fill', { labelInfo: selected, fill: fill });
      this.__trackUndo(false);
      for (var i = 0; i < selected.length; i++) {
        var obb = this.labeler.getPartOBB(selected[i]);
        if (this.__expandObbAmount) {
          var v = this.__expandObbAmount;
          obb = obb.clone().expandLengths(new THREE.Vector3(v,v,v));
        }
        this.labeler.labelPartsInOBB(obb, this.labelsPanel, fill? selected[i] : null);
      }
      this.__trackUndo(true);
      this.onEditOpDone('fill', { labelInfo: selected, fill: fill });
    } else {
      // Show alert...
      UIUtil.showAlert('Please select labels with painted regions that gives a bounding box to fill', 'alert-info', 2000, '10pt').css('bottom', '5px');
    }
  };

  BasePartAnnotator.prototype.mergeSelected = function () {
    // merges selected labels
    var selected = this.labelsPanel.getAllSelected();
    if (selected && selected.length > 1) {
      // Doing merge
      //console.log('Merging ' + selected.length);
      this.onEditOpInit('merge', { labelInfo: selected });
      this.__trackUndo(false);
      var merged = this.labeler.merge(selected, this.labelsPanel);
      this.labelsPanel.selectLabel(merged);
      this.__trackUndo(true);
      this.onEditOpDone('merge', { labelInfo: merged });
    }
  };

  BasePartAnnotator.prototype.addRelation = function (callback) {
    // merges selected labels
    var selected = this.labelsPanel.getAllSelected();
    if (selected && selected.length > 1) {
    }
  };

  BasePartAnnotator.prototype.addGroup = function (callback) {
    // merges selected labels
    var selected = this.labelsPanel.getAllSelected();
    if (selected && selected.length > 0) {
      var form = new Form("Please enter a label for the group", [{
        title: 'Group',
        name: 'group',
        inputType: 'text'
      }]);
      var scope = this;
      var dialog = form.form(
        function (results) {
          if (results) {
            var label = results['group'];
            scope.labelsPanel.groupLabels(selected, label);
          }
          if (callback) { callback(null, results); }
        }
      );
    }
  };

  BasePartAnnotator.prototype.renameLabels = function (callback) {
    // merges selected labels
    var selected = this.labelsPanel.getAllSelected();
    if (selected && selected.length > 0) {
      var form = new Form("Please enter a new label", [{
        title: 'Label',
        name: 'label',
        inputType: 'text'
      }]);
      var scope = this;
      var dialog = form.form(
        function (results) {
          if (results) {
            var label = results['label'];
            scope.labelsPanel.renameLabels(selected, label);
          }
          if (callback) { callback(null, results); }
        }
      );
    }
  };

  BasePartAnnotator.prototype.freezeSelected = function (flag) {
    // merges selected labels
    var selected = this.labelsPanel.getAllSelected();
    if (selected && selected.length) {
      this.onEditOpInit('freeze', { labelInfo: selected, flag: flag });
      this.__trackUndo(false);
      for (var i = 0; i < selected.length; i++) {
        this.labelsPanel.setFrozen(selected[i], flag);
      }
      this.__trackUndo(true);
      this.onEditOpDone('freeze', { labelInfo: selected, flag: flag });
    }
  };

  BasePartAnnotator.prototype.lookAtSelected = function () {
    // merges selected labels
    var selected = this.labelsPanel.getAllSelected();
    if (selected && selected.length) {
      this.lookAtParts(selected);
    }
  };

  // Following functions are to support display of part OBBs
  BasePartAnnotator.prototype.clearDebug = function () {
    Object3DUtil.removeAllChildren(this.debugOBBsNode);
  };

  BasePartAnnotator.prototype.__addOBB = function (obb, material, transform) {
    var obj3D = new THREE.Object3D();
    if (transform) {
      Object3DUtil.setMatrix(obj3D, transform);
    }
    var mesh = new MeshHelpers.OBB(obb, material);
    var meshwf = mesh.toWireFrame(2.0 / obj3D.scale.length(), true);
    obj3D.add(meshwf);
    this.debugOBBsNode.add(obj3D);
    return obj3D;
  };

  BasePartAnnotator.prototype.showPartOBBs = function(labelInfos) {
    this.clearDebug();
    if (!labelInfos) return;
    for (var i = 0; i < labelInfos.length; i++) {
      var labelInfo = labelInfos[i];
      // Ensure obb (do we need this?)
      if (labelInfo) {
        var obb = this.labeler.getLabelOBB(labelInfo);
        if (obb) {
          this.__addOBB(obb, labelInfo.colorMat);
        }
      }
    }
  };

  return BasePartAnnotator;
}

module.exports = BasePartAnnotatorFactory;