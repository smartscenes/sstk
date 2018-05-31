'use strict';

var Constants = require('Constants');
var Object3DUtil = require('geo/Object3DUtil');
var UndoStack = require('editor/UndoStack');
var LabelPointer = require('controls/LabelPointer');
var LabelPainter = require('controls/LabelPainter');
var MeshHelpers = require('geo/MeshHelpers');
var Form = require('ui/Form');
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
   * @param [params.linkWordNet] Whether we should allow user to link to WordNet synsets
   * @param [params.obbsVisible=false] {boolean} To show obbs of labeled segment groups or not.
   * @param [params.allowPass=false] {boolean} Whether passing of this item is allowed
   * @param [params.allowHierarchy=false] {boolean} Whether grouping of labels into hierarchy is allowed
   * @param [params.expandObbAmount=0] {number} Number of virtual unit to expand obb by with labeling obb
   * @constructor BasePartAnnotator
   */
  function BasePartAnnotator(params) {
    // Default configuration
    this.isAnnotator = true;
    var defaults = {
      appId: 'BasePartAnnotator.v1',
      screenshotMaxWidth: 100,
      screenshotMaxHeight: 100,
      enforceUserId: true,
      expandObbAmount: 0,
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
    var annotationModes = ['label'];
    if (params.allowHierarchy) {
      annotationModes.push('group');
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
          gotoURL(onCloseUrl);
        } else {
          bootbox.alert('Thank you for annotating!');
        }
      };
    }

    // Other parameters
    this.__expandObbAmount = params.expandObbAmount;

    // Did we successfully submit our annotations (if not there will be prompt asking if we want to leave this interface)
    this.__annotationsSubmitted = false;

    // Debug OBBs
    this.obbsVisible = params.obbsVisible;
    this.debugOBBsNode = new THREE.Group();
    this.debugOBBsNode.name = 'DebugOBBs';
    this.debugNode.add(this.debugOBBsNode);
    this.excludeFromPicking.push(this.debugOBBsNode);
  }

  BasePartAnnotator.prototype = Object.create(baseClass.prototype);
  BasePartAnnotator.prototype.constructor = BasePartAnnotator;

  Object.defineProperty(BasePartAnnotator.prototype, 'annotationMode', {
    get: function () {return this.annotationModes[this.__annotationModeIndex]; }
  });

  Object.defineProperty(BasePartAnnotator.prototype, 'annotationModeIndex', {
    get: function () {return this.__annotationModeIndex; },
    set: function (v) {
      this.__enterAnnotationMode(v);
    }
  });

  BasePartAnnotator.prototype.toggleAnnotationMode = function() {
    this.annotationModeIndex = (this.annotationModeIndex + 1) % this.annotationModes.length;
    //console.log('set annotationModeIndex ' + this.annotationModeIndex);
  };

  BasePartAnnotator.prototype.__enterAnnotationMode = function(index) {
    this.__annotationModeIndex = index;
    var mode = this.annotationMode;
    this.__showUIs(mode);
    if (mode === 'label') {
      // Show labels panel
    } else if (mode === 'group') {
      // Show hierarchy panel
    } else if (mode === 'decompose') {
      // Show decomposition panel
    } else {
      this.showAlert('Unsupported annotation mode ' + mode, 'alert-warning');
    }
  };

  BasePartAnnotator.prototype.setupDatGui = function () {
    if (this.useDatGui) {
      baseClass.prototype.setupDatGui.call(this);
      this.datgui.add(this, '__expandObbAmount', 0, 0.1*Constants.metersToVirtualUnit).name('Expand OBB By').listen();
    }
  };

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
    this.annotate();
    return this.__hasAnnotations(this.annotations);
  };

  BasePartAnnotator.prototype.__hasAnnotations = function (annotations) {
    return annotations && annotations.length > 0;
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
    if (!this.__hasAnnotations(this.annotations)) {
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

  BasePartAnnotator.prototype.getAllSelectedWithParts = function() {
    var labeler = this.labeler;
    var selected = this.labelsPanel.getAllSelected();
    // filter out selected that don't have any parts
    selected = selected? selected.filter(function(x) { return labeler.hasParts(x) }) : null;
    return selected;
  };

  // Some helpful actions on labels
  BasePartAnnotator.prototype.fillSelected = function(fill) {
    // filter out selected that don't have any segIndices
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
      UIUtil.showAlert(null, 'Please select labels with painted regions that gives a bounding box to fill', 'alert-info', 2000, '10pt').css('bottom', '5px');
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
          if (callback) { callback(null, results) };
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
          if (callback) { callback(null, results) };
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