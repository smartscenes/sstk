'use strict';

var Constants = require('Constants');
var Object3DUtil = require('geo/Object3DUtil');
var UIUtil = require('ui/UIUtil');
var PubSub = require('PubSub');
var _ = require('util');

/**
 * A pretty panel of annotation labels.  Each annotation label is automatically assigned a color.
 * The panel supports a variety of options for labeling.
 * @constructor
 * @memberOf ui
 * @param params Configuration parameters for LabelsPanel
 * @param params.container Container in which to instantiate the LabelsPanel
 * @param [params.labels=[]] {string[]} Array of labels for prepopulating the LabelsPanel
 * @param [params.labelColorIndex] {Map<string,int|THREE.Color|string>} Map of label to color
 * @param [params.labelColors] {Map<string,int|THREE.Color|string>} Alias for `params.labelColorIndex`
 * @param [params.suggestions=[]] {string[]} Array of autocomplete suggestions
 * @param [params.numShortCuts=9] {int} Number of labels to associate with a shortcut key
 * (default is 9 so that the first 9 labels are associated with 1-9)
 * @param [params.includeAllButton=false] {boolean} Whether a 'ALL' button should be included
 * @param [params.allowNewLabels=false] {boolean} Whether new labels can be added by the user.
 * If true, will need to set `addNewNameBtn` and `addNewNameTextbox` accordingly.
 * @param [params.addNewLabelToTop=false] {boolean} Whether to add new labels to top.
 * Only applicable if `allowNewLabels=true`.
 * @param [params.allowDelete=false] {boolean} Whether labels can be deleted by the user.
 * @param [params.checkedDelete=undefined] {ui.LabelsPanel.deleteCallback} Callback function when trying to delete a label
 * to see if it okay or not.  Only applicable if `allowDelete=true`.
 * @param [params.noTransparency=false] {boolean} If transparency is supported (`noTransparency=false`),
 * then the `colorMat` will be a bit transparent.
 * @param [params.labelToName=undefined] {ui.LabelsPanel.labelToNameCallback} Function to convert labels to names to display to the user.
 * @param [params.addNewNameBtn='#addNewNameBtn'] {string} Selector for the "Add" button.  Only applicable if `allowNewLabels=true`.
 * @param [params.addNewNameTextbox='#addNewNameTextbox'] {string} Selector for the text box to enter the new label.
 * Only applicable if `allowNewLabels=true`.
 * @param [params.checkNewLabel=undefined] {ui.LabelsPanel.checkNewLabelCallback} Function to check if a new label is a valid label.
 * Use 'inLabels' or 'inSuggestions' to restrict to set of labels or suggestions.  Use 'notInLabels' to ensure unique new labels.
 * Only applicable if `allowNewLabels=true`.
 * @param [params.allowMultiSelect=false] {boolean} Whether multiple labels can be selected at once
 * @param [params.contextMenuOptions=null] {Object} Options for context menu (see http://swisnl.github.io/jQuery-contextMenu/demo/input.html)
 * @param [params.allowEditLabels=false] {boolean} Whether labels can be edited (on double click)
 * @param [params.allowEditStatus=false] {boolean} Whether the status/notes/verified can be edited
 * @param [params.validStatuses=[]] {string[]} Array of valid statuses (for status dropdown)
 * @param [params.autoLowercase=true] {boolean} Whether to automatically lowercase the labels
 * @param [params.showAlert] {LabelsPanel.showAlertCallback} Function to show alert messages
 **/
var LabelsPanel = function (params) {
  PubSub.call(this);
  // NOTE: Previously, we used bootstrap's (data-toggle='buttons') on the container to maintain the toggling of input buttons
  // However, that has several undesirable side effects
  // 1) Any other embedded checkbox is automatically toggled (hence the use of the fancyCheckbox)
  // 2) Any other embedded input has change triggered automatically
  // 3) It was specified on the container in the html, so it is not ideal
  // We now handle it internally
  this.container = params.container? $(params.container) : undefined;
  this.labels = params.labels || [];
  this.labelColorIndex = params.labelColorIndex || params.labelColors;
  this.suggestions = params.suggestions || [];
  this.numShortCuts = (params.numShortCuts != undefined)? params.numShortCuts : 9;
  this.includeAllButton = params.includeAllButton;
  this.allowNewLabels = params.allowNewLabels;
  this.addNewLabelToTop = params.addNewLabelToTop;
  this.allowDelete = params.allowDelete;
  this.checkedDelete = params.checkedDelete;
  this.noTransparency = params.noTransparency;
  this.labelToName = params.labelToName;
  // Adding new label
  this.addNewNameBtn = $(params.addNewNameBtn || '#addNewNameBtn');
  this.addNewNameTextbox = $(params.addNewNameTextbox || '#addNewNameTextbox');
  this.defaultLabel = params.defaultLabel;
  // Callback for checking new label
  this.checkNewLabelFn = params.checkNewLabel;
  if (typeof this.checkNewLabelFn ===  'string') {
    var scope = this;
    if (this.checkNewLabelFn === 'inLabels') {
      this.checkNewLabelFn = function(label) {
        return LabelsPanel.CheckLabelInExisting(scope.labels, label);
      };
    } else if (this.checkNewLabelFn === 'inSuggestions') {
      this.checkNewLabelFn = function (label) {
        return LabelsPanel.CheckLabelInExisting(scope.suggestions, label);
      };
    } else if (this.checkNewLabelFn === 'notInLabels') {
      this.checkNewLabelFn = function(label) {
        return LabelsPanel.CheckLabelNotInExisting(scope.labels, label);
      };
    } else {
      throw new Error('Invalid checkNewLabel: ' + this.checkNewLabelFn);
    }
  }
  // Callback for customizing labels
  this.customizeLabel = params.customizeLabel;
  // How to show alert messages
  this.showAlert = params.showAlert || function(msg) {
    UIUtil.showAlert(null, msg);
  };

  // Whether multiselect is allowed (selection of more than one label)
  this.allowMultiSelect = params.allowMultiSelect;
  // Context menu options (see http://swisnl.github.io/jQuery-contextMenu/demo/input.html)
  this.contextMenuOptions = params.contextMenu;
  // Whether to allow editing of labels
  this.allowEditLabels = params.allowEditLabels;
  // Whether to allow editing of status
  this.allowEditStatus = params.allowEditStatus;
  this.validStatuses = params.validStatuses;
  // Whether to normalize to lowercase
  this.autoLowercase = (params.autoLowercase != undefined)? params.autoLowercase : true;
  // Whether to show remap button
  this.allowRemapLabels = params.allowRemapLabels;
  // Whether to have a erase material
  this.addEraseMat = params.addEraseMat;

  this.labelInfos = [];
  this.selectedLabelInfo = null;
  this.__panelId = 'labelsPanel_' + _.generateRandomId();
  if (this.container) {
    this.container[0].addEventListener('mousemove', function (e) {
      e.stopPropagation();
    }, false);
  }
  this.__labelMaterialOpacity = (this.noTransparency)? 1.0 : 0.6;
};

LabelsPanel.prototype = Object.create(PubSub.prototype);
LabelsPanel.prototype.constructor = LabelsPanel;

Object.defineProperty(LabelsPanel.prototype, 'labelMaterialOpacity', {
  get: function () { return this.__labelMaterialOpacity; },
  set: function (v) {
    this.__labelMaterialOpacity = v;
    for (var i = 0; i < this.labelInfos.length; i++) {
      var labelInfo = this.labelInfos[i];
      if (labelInfo.colorMat) {
        Object3DUtil.setMaterialOpacity(labelInfo.colorMat, v);
      }
    }
  }
});

// Return error message if invalid, otherwise nothing

/**
 * Checks if a label is in a given set of labels
 * @param validLabels {string[]} Array of valid labels
 * @param label {string} Label to check
 * @returns {string} Error message if label is not a existing valid label
 */
LabelsPanel.CheckLabelInExisting = function(validLabels, label) {
  if (validLabels.indexOf(label) < 0) {
    return 'Invalid label: ' + label;
  }
};

/**
 * Checks if a label is in a given set of labels
 * @param existingLabels {string[]} Array of existing labels
 * @param label {string} Label to check
 * @returns {string} Error message if label is a duplicate of existing labels
 */
LabelsPanel.CheckLabelNotInExisting = function(existingLabels, label) {
  if (existingLabels.indexOf(label) >= 0) {
    return 'Duplicate label: ' + label;
  }
};

/**
 * Set the labels used.
 * @function
 * @param labels {string[]|LabelInfo[]} Array of labels or LabelInfos from which to initialize the UI
 * @param labelColorIndex
 */
LabelsPanel.prototype.setLabels = function (labels, labelColorIndex) {
  var inputLabelInfos = (labels.length && typeof(labels[0]) === 'object')? labels : null;
  labels = inputLabelInfos? _.map(inputLabelInfos, function(x) { return x.label; }): labels;
  this.labels = labels;
  this.labelInfos = [];
  this.labelColorIndex = labelColorIndex;
  this.lastSelectedIndex = -1;
  this.selectedLabelInfo = null;
  if (this.labelColorIndex) {
    if (this.labelColorIndex.__maxIndex == undefined) {
      var values = _.values(this.labelColorIndex).filter( function(x) { return _.isInteger(x); });
      this.labelColorIndex.__maxIndex = _.max(values) || 0;
    }
  }
  if (this.container) {
    this.container.empty();
  }
  this.createPanel(inputLabelInfos);
};

/**
 * Clears the labels panel (all labels are removed)
 * @function
 */
LabelsPanel.prototype.clear = function() {
  this.setLabels([]);
};

LabelsPanel.prototype.__toCssColor = function (color) {
  if (color) {
    var red = (color.r * 255).toFixed(0);
    var green = (color.g * 255).toFixed(0);
    var blue = (color.b * 255).toFixed(0);
    return 'rgb(' + red + ',' + green + ',' + blue + ')';
  }
};

/**
 * Create a new label info
 * @function
 * @param label {string} Label string
 * @param options {Object} Additional options on what to store in the LabelInfo
 * @param options.idx {int} Index of label
 * @param [options.name] {string} Unique name of label
 * @param [options.color] {THREE.Color|string|int} What color to use for the label (defaults to autogenerated color for `options.idx + 1`)
 * @param [options.data] {Object} Additional data associated with the label
 * @param [options.fixed] {boolean} Whether the label is fixed (cannot be changed)
 * @param [options.frozen] {boolean} Whether the label is temporarily frozen (cannot be changed for now)
 * @returns {LabelInfo}
 */
LabelsPanel.prototype.createLabelInfo = function (label, options) {
  options = options || {};
  var idx = options.index;
  var colorIdx = (options.color != undefined)? options.color : idx + 1;
  // TODO: Cleanup weird color code here
  var colorMaterial = (colorIdx instanceof THREE.Color || typeof colorIdx === 'string')?
      Object3DUtil.getSimpleFalseColorMaterial(idx, colorIdx) : Object3DUtil.getSimpleFalseColorMaterial(colorIdx);
  var color = colorMaterial.color;
  var hoverMaterial = colorMaterial.clone();
  if (this.noTransparency) {
    //var hsl = color.getHSL();
    hoverMaterial.color.offsetHSL(0, +0.3, +0.1);
    //if (hsl.s >= 0.7) {
    //  colorMaterial.color.offsetHSL(0, -0.3, -0.1);
    //}
  } else {
    hoverMaterial.color.offsetHSL(0,-0.3, 0);
    Object3DUtil.setMaterialOpacity(colorMaterial, this.__labelMaterialOpacity);
  }
  var name = options.name || (this.labelToName ? this.labelToName(label, idx) : label);
  var cssColor = this.__toCssColor(color);
  var labelInfo = {
    index: idx,
    id: idx + 1,  // NOTE: So that we can easily map buttons to number keys
    name: name,
    label: label,
    color: color,
    cssColor: cssColor,
    colorMat: colorMaterial,
    hoverMat: hoverMaterial
  };
  if (options.data) {
    labelInfo.data = options.data;
  }
  if (options.fixed) {
    labelInfo.fixed = true;
  }
  if (options.frozen) {
    labelInfo.frozen = true;
  }
  if (this.addEraseMat) {
    labelInfo.eraseMat = colorMaterial.clone();
    if (this.noTransparency) {
      labelInfo.eraseMat.color.offsetHSL(0, -0.2, -0.1);
    } else {
      Object3DUtil.setMaterialOpacity(labelInfo.eraseMat, 0.3);
    }
  }
  return labelInfo;
};

/**
 * Finds labelInfo that has corresponding label
 * @param label {string}
 * @returns {LabelInfo} First labelInfo with given label
 */
LabelsPanel.prototype.getLabelInfo = function(label) {
  //console.log('getLabelInfo: ' + label);
  for (var i = 0; i < this.labelInfos.length; i++) {
    var labelInfo = this.labelInfos[i];
    if (labelInfo && labelInfo.label === label) {
      return labelInfo;
    }
  }
};

/**
 * Saves the labels as a HTML page
 * @param options Options for how labels are saved
 * @param [options.saveAll=false] {boolean} Save all known labels (versus what we display)
 * @function
 */
LabelsPanel.prototype.saveLegend = function (options) {
  var labelInfos = this.labelInfos;
  if (options.saveAll) {
    if (this.labelColorIndex) {
      labelInfos = [];
      for (var label in this.labelColorIndex) {
        if (this.labelColorIndex.hasOwnProperty(label) && label !== '__maxIndex') {
          var colorIdx = this.labelColorIndex[label];
          var labelInfo = this.createLabelInfo(label, { index: labelInfos.length, color: colorIdx } );
          labelInfos.push(labelInfo);
        }
      }
    }
  }

  var panel = $('<div></div>');
  for (var i = 0; i < labelInfos.length; i++) {
    var labelInfo = labelInfos[i];
    if (labelInfo) {
      var id = labelInfo.id;
      var name = labelInfo.name;
      var divId = this.__getElemId('div', id); //color icon
      var label = $('<label/>').attr('id', this.__getElemId('label', id)).addClass('btn btn-lg btn-default label-left');
      var colorDiv = $('<div/>').attr('id', divId).addClass('pull-left').html('&nbsp;');
      label.append(colorDiv).append(name);
      labelInfo.element = label;

      //Color the corresponding icon
      if (labelInfo.cssColor) {
        colorDiv.css('background-color', labelInfo.cssColor);
      }

      panel.append(label);
    }
  }

  var opened = window.open("");
//  opened.document.write("<html><head><title>My title</title></head><body>test</body></html>");
  $(opened.document.head).append(
    $('<link rel="stylesheet" type="text/css" href="https://maxcdn.bootstrapcdn.com/bootstrap/3.2.0/css/bootstrap.min.css">')
  );
  $(opened.document.head).append(
    $('<style>' +
        'label div { display: inline-block; width: 40px; text-align: center; margin-right: 10px; }' +
      '</style>')
  );
  $(opened.document.body).append(panel);
};

/**
 * Create the labels panel UI using our set of pre-initialized labels.
 * @param [inputLabelInfos] {LabelInfo[]} Optional array of label information (with one to one correspondence with the labels) to use when creating the UI
 */
LabelsPanel.prototype.createPanel = function (inputLabelInfos) {
  var panel = this.container;
  this.labelInfos = []; // clear in case we're recreating the panel
  for (var i = 0; i < this.labels.length; i++) {
    var label = this.labels[i];
    if (this.labelColorIndex) {
      if (this.labelColorIndex[label] == undefined) {
        this.labelColorIndex.__maxIndex++;
        this.labelColorIndex[label] = this.labelColorIndex.__maxIndex;
      }
    }
    var colorIdx = this.labelColorIndex? this.labelColorIndex[label] : i+1;
    var baseLabelInfo = { index: i, color: colorIdx };
    if (inputLabelInfos && inputLabelInfos[i]) {
      baseLabelInfo = _.defaults(baseLabelInfo, inputLabelInfos[i]);
    }
    this.labelInfos[i] = this.createLabelInfo(label, baseLabelInfo);
  }
  if (panel && panel.length > 0) {
    panel.empty();
    for (var i = 0; i < this.labels.length; i++) {
      this.appendButton(this.labelInfos[i]);
    }
    // Create "ALL" button
    if (this.includeAllButton) {
      this.allLabelInfo = { id: this.labelInfos.length + 1, name: 'ALL', isAll: true };
      this.appendButton(this.allLabelInfo);
    }
  }

  $(document).keypress(function (e) {
    // Don't handle event if from input/select/textarea
    var tagName = (e.target || e.srcElement).tagName;
    var process = !(tagName === 'INPUT' || tagName === 'SELECT' || tagName === 'TEXTAREA');
    if (process) {
      var keyCount = e.which - 48; // subtract ascii for "0" key number
      if (keyCount >= 0 && keyCount <= this.numShortCuts) {
        var button = $('#' + this.__getElemId('label', keyCount));
        if (button.length > 0) {
          button.click();
          return false;
        }
      }
    }
  }.bind(this));

  if (panel && panel.length > 0 && this.allowNewLabels) {
    var addNewNameBtn = this.addNewNameBtn;
    var addNewNameTextbox = this.addNewNameTextbox;
    addNewNameBtn.click(function () {
      var textbox = addNewNameTextbox;
      var input = this.__getNormalizedText(textbox.val());
      if (input) { //Do nothing on empty inputs
        // Check label
        if (this.checkNewLabelFn) {
          var errorMessage = this.checkNewLabelFn(input);
          if (errorMessage) {
            this.showAlert(errorMessage);
            return;
          }
        }
        this.addLabel(input, { prepend: this.addNewLabelToTop, autoClick: true });
        textbox.val(''); //Clear the textbox
      }
      // Make sure autosuggest goes away
      if (textbox.autocomplete) {
        textbox.autocomplete('close');
      }
    }.bind(this));

    if (this.suggestions) {
      addNewNameTextbox.autocomplete({
        source: this.suggestions,
        minLength: 0,
        delay: 0,
        select: function (event, ui) {
          if (ui) {
            addNewNameTextbox.val(ui.item.label);
            addNewNameBtn.click();
            return false;
          }
        }
      });
    }

    //So that typing into the textbox doesn't trigger other keyboard shortcuts:
    addNewNameTextbox.bind('keypress', null, function (event) {
      event.stopPropagation();
      if (event.keyCode == 13) {
        addNewNameBtn.click();
        return false;
      }
    });
  }

  if (this.contextMenuOptions) {
    if (this.contextMenuOptions.selector == undefined) {
      this.contextMenuOptions.selector = '#' + panel.attr('id');
    }
    //console.log('setup contextMenuOptions: ', this.contextMenuOptions);
    if ($.contextMenu) {
      $.contextMenu(this.contextMenuOptions);
    } else {
      console.error('No $.contextMenu: Please include jquery-contextmenu');
    }
    //panel.contextMenu(this.contextMenuOptions);
  }

  // Add reset and submit buttons
  var includeButtons = this.allowEditStatus || this.allowRemapLabels;
  if (includeButtons) {
    // Add submit and reset buttons
    var btnGroup = this.__controlButtons;
    if (!btnGroup) {
      btnGroup = $('<div></div>').attr('class','input-group');
      this.__controlButtons = btnGroup;
      panel.after(btnGroup);
    }
    if (this.allowEditStatus) {
      if (!this.resetButton) {
        var resetButton = $('<button></button>')
          .attr('class', 'btn btn-default')
          .text('Reset');
        this.resetButton = resetButton;
        var scope = this;
        resetButton.click(function () {
          scope.resetStatus();
        });
        btnGroup.append(resetButton);
      }

      if (!this.submitButton) {
        var submitButton = $('<button></button>')
          .attr('class', 'btn btn-success')
          .text('Submit');
        this.submitButton = submitButton;
        submitButton.click(function () {
          scope.submitStatus();
        });
        btnGroup.append(submitButton);
      }
    }
    if (this.allowRemapLabels) {
      if (!this.remapLabelsButton) {
        var remapLabelsButton = $('<button></button>')
          .attr('class', 'btn btn-default')
          .text('Remap');
        this.remapLabelsButton = remapLabelsButton;
        remapLabelsButton.click(function () {
          scope.showRemapLabelsPanel();
        });
        btnGroup.append(remapLabelsButton);
      }
    }
  }
};

LabelsPanel.prototype.__getNormalizedText = function(v) {
  if (this.autoLowercase) {
    v = v.toLowerCase();
  }
  return v.trim();
};

/**
 * Create label and add label to list of suggestions
 * @param label {string}
 * @param options {Object} See [createLabelInfo]{@link ui.LabelsPanel#createLabelInfo} for details
 * @returns {LabelInfo}
 */
LabelsPanel.prototype.createLabel = function(label, options) {
  if (this.suggestions && this.suggestions.indexOf(label) < 0) {
    this.suggestions.push(label);
  }
  return this.createLabelInfo(label, options);
};

/**
 * Add label to panel
 * @param label
 * @param options
 * @returns {LabelInfo}
 */
LabelsPanel.prototype.addLabel = function(label, options) {
  this.Publish(Constants.EDIT_OPSTATE.INIT, 'addLabel', { label: label });
  options = options || {};
  if (this.suggestions && this.suggestions.indexOf(label) < 0) {
    this.suggestions.push(label);
  }
  var idx = this.labelInfos.length;
  this.labelInfos[idx] = this.createLabelInfo(label, { index: idx, fixed: options.fixed } );
  var button = this.appendButton(this.labelInfos[idx], options);
  if (options.autoClick) {
    button.click(); // autoclick newly created button
  }
  this.Publish('labelAdded', this.labelInfos[idx]);
  this.Publish(Constants.EDIT_OPSTATE.DONE, 'addLabel', { labelInfo: this.labelInfos[idx] } );
  return this.labelInfos[idx];
};

LabelsPanel.prototype.__getElemId = function(type, id) {
  return this.__panelId + '_' + type + '_' + id;
};

function setFancyCheckboxChecked(checkbox, checked) {
  if (checked) {
    //console.log('CHECK');
    checkbox.html('&#x2713;');
    checkbox.addClass('marked');
  } else {
    //console.log('UNCHECK');
    checkbox.html('&#x274f;');
    checkbox.removeClass('marked');
  }
}

function isFancyCheckboxChecked(checkbox) {
  return checkbox.hasClass('marked');
}

function createFancyCheckbox () {
  return $('<span/>').html('&#x274f;').click(function() {  // UTF-8 empty box
    var checkbox = $(this);
    var newState = !isFancyCheckboxChecked(checkbox);
    setFancyCheckboxChecked(checkbox, newState);
  }).addClass('fancyCheckbox');
}

/**
 * Return labels in order displayed (due to the fact that sometimes labels are appended, and sometimes prepended,
 * order displayed can be different from labelInfos
 * @returns {Array}
 */
LabelsPanel.prototype.getOrderedLabels = function() {
  var labelElements = this.container.find('label.label-left');
  var scope = this;
  var ordered = [];
  labelElements.each(function(index, element) {
    ordered.push(scope.labelInfos[$(this).data('index')]);
  });
  return ordered;
};

LabelsPanel.prototype.setFrozen = function (labelInfo, flag) {
  //console.log('set frozen', labelInfo, flag);
  labelInfo.frozen = flag;
  if (flag) {
    labelInfo.frozenIndicator.show();
  } else {
    labelInfo.frozenIndicator.hide();
  }
};

/**
 * Creates a button in the panel with a color icon and label
 * @param labelInfo {LabelInfo}
 * @returns {jQuery}
 */
LabelsPanel.prototype.createButton = function (labelInfo) {
  var id = labelInfo.id;
  var name = labelInfo.name;
  var canMakeShortcut = id <= this.numShortCuts;
  var key = id;
  var divId = this.__getElemId('div', id);
  var label = $('<label/>').attr('id', this.__getElemId('label', id)).addClass('btn btn-lg btn-default label-left');
  var colorDiv = $('<div/>').attr('id', divId).addClass('pull-left').html(canMakeShortcut ? key : '&nbsp;');
  var radio = $('<input/>').attr('type','checkbox').attr('id', this.__getElemId('button', id)).attr('name','label').attr('value', name);
  radio.hide();  // Explicitly hide radio button
  radio.click(function(event) { event.stopPropagation(); return false; });
  var frozenIndicator = $('<span/>').text('*').hide();
  if (labelInfo.frozen) {
    frozenIndicator.show();
  }
  label.append(colorDiv).append(radio).append($('<span/>').addClass('labelText').text(name)).append(frozenIndicator);
  label.data('index', labelInfo.index);
  labelInfo.element = label;
  labelInfo.selectField = radio;  // Set selectField so we can set the property properly
  labelInfo.frozenIndicator = frozenIndicator;

  if (labelInfo.active) {
    labelInfo.element.addClass('active');
    labelInfo.selectField.prop('checked', true);
  }

  //Color the corresponding icon
  if (labelInfo.cssColor) {
    colorDiv.css('background-color', labelInfo.cssColor);
  }

  if (this.allowDelete && !labelInfo.fixed) {
    // Add delete icon
    var deleteIcon = $('<button></button>')
      .attr('class', 'btn btn-default pull-right')
      .append($('<i></i>').attr('class', 'glyphicon ' + 'glyphicon-remove'));
    deleteIcon.click(this.onDeleteButtonClick.bind(this, labelInfo));
    label.append(deleteIcon);
  }
  //Make button toggleable
  //label.click(this.onLabelButtonClick.bind(this, labelInfo));
  var scope = this;
  label.click(function(event) { scope.onLabelButtonClick(labelInfo, event); });
  //Make label editable
  if (this.allowEditLabels && !labelInfo.fixed) {
    // Double click to edit label
    var editField = $('<input/>').attr('type', 'text').attr('value', labelInfo.label).hide();
    labelInfo.editField = editField;
    label.append(editField);
    label.dblclick(this.onEditLabelClick.bind(this,labelInfo));
  }

  var inputGroup = $("<span></span>").addClass('pull-right');
  // Add status/notes/verify
  if (this.allowEditStatus) {
    var statusField;
    if (this.validStatuses) {
      statusField = $('<select/>').attr('type', 'text').addClass('labelStatus');
      for (var i = 0; i < this.validStatuses.length; i++) {
        var status = this.validStatuses[i];
        statusField.append($('<option></option>').attr('value', status).text(status));
      }
    } else {
      statusField = $('<input/>').attr('type', 'text').addClass('labelStatus');
    }
    var notesField = $('<input/>').attr('type', 'text').addClass('labelNotes');
    var verifyField = createFancyCheckbox().addClass('labelVerify').addClass('pull-right');
    inputGroup.append(statusField);
    inputGroup.append(notesField);
    inputGroup.append(verifyField);
    //label.append(verifyField);
    labelInfo.fields = {
      status: statusField,
      notes: notesField,
      verified: verifyField
    };
    if (labelInfo.isAll) {
      var scope = this;
      _.forEach(labelInfo.fields, function(v,k) {
        if (v.hasClass('fancyCheckbox')) {
          v.click(function () {
            for (var i = 0; i < scope.labelInfos.length; i++) {
              var li = scope.labelInfos[i];
              var value = isFancyCheckboxChecked(v);
              if (li && !li.isAll) {
                setFancyCheckboxChecked(li.fields[k], value);
              }
            }
          });
        } else {
          v.change(function () {
            for (var i = 0; i < scope.labelInfos.length; i++) {
              var li = scope.labelInfos[i];
              var value = v.val();
              if (li && !li.isAll) {
                li.fields[k].val(value);
              }
            }
          });
        }
      });
    }
  }
  label.append(inputGroup);
  if (this.customizeLabel) {
    this.customizeLabel(labelInfo);
  }
  return label;
};

LabelsPanel.prototype.updateStatus = function (labelInfo) {
  var ann = labelInfo.annotation;
  var fields = labelInfo.fields;
  if (ann && fields) {
    fields.status.val(ann.status);
    fields.notes.val(ann.notes);
    setFancyCheckboxChecked(fields.verified, ann.verified);
  }
  if (ann) {
    labelInfo.element.attr('title', JSON.stringify({ id: ann.id, annId: ann.annId, workerId: ann.workerId }, null, 2));
  }
};

LabelsPanel.prototype.resetStatus = function() {
  console.log('Reset status');
  this.resetButton.addClass('active');
  for (var i = 0; i < this.labelInfos.length; i++) {
    if (this.labelInfos[i]) {
      this.updateStatus(this.labelInfos[i]);
    }
  }
  this.resetButton.removeClass('active');
};

LabelsPanel.prototype.submitStatus = function() {
  console.log('Submit status');
  this.submitButton.addClass('active');
  this.submitButton.attr('disabled', 'disabled');
  var updates = {};
  for (var i = 0; i < this.labelInfos.length; i++) {
    var labelInfo = this.labelInfos[i];
    if (labelInfo) {
      var fields = labelInfo.fields;
      var ann = labelInfo.annotation;
      var annUpdate = {};
      var hasUpdate = false;
      if (ann && fields) {
        console.log(ann);
        _.forEach(fields, function (field, fieldname) {
          var value;
          if (field.hasClass('fancyCheckbox')) {
            value = isFancyCheckboxChecked(field) ? 1 : 0;
          } else {
            value = field.val();
          }
          if (value !== ann[fieldname]) {
            if ((ann[fieldname] == null || ann[fieldname] === "") && (value == null || value === "")) {
              // Ignore
            } else {
              annUpdate[fieldname] = value;
              hasUpdate = true;
            }
          }
        });
      }
      if (ann && this.allowEditLabels) {
        if (labelInfo.label !== ann['label']) {
          annUpdate['label'] = labelInfo.label;
          hasUpdate = true;
        }
      }
      if (hasUpdate) {
        updates[ann.id] = annUpdate;
      }
    }
  }
  console.log(updates);
  this.Publish('submitStatus', updates);
};

LabelsPanel.prototype.onSubmitFinished = function() {
  this.submitButton.removeClass('active');
  this.submitButton.removeAttr('disabled');
};

LabelsPanel.prototype.appendButton = function (labelInfo, options) {
  options = options || {};
  var panel = options.panel || this.container;

  var button = this.createButton(labelInfo);
  if (options.prepend) {
    panel.prepend(button);
  } else {
    panel.append(button);
  }
  return button;
};

LabelsPanel.prototype.copySelected = function(defaultLabel) {
  if (this.selectedLabelInfo) {
    var oldSelected = this.selectedLabelInfo;
    this.addNewNameTextbox.val(this.selectedLabelInfo.label);
    this.addNewNameBtn.click();
    if (oldSelected.data) {
      this.selectedLabelInfo.data = _.clone(oldSelected.data);
    }
    if (this.customizeLabel) {
      this.customizeLabel(this.selectedLabelInfo);
    }
    return this.selectedLabelInfo;
  } else if (defaultLabel) {
    // If nothing selected and there is defaultLabel, create default label
    this.addNewNameTextbox.val(defaultLabel);
    this.addNewNameBtn.click();
    return this.selectedLabelInfo;
  }
};

LabelsPanel.prototype.__renameLabel = function (labelInfo, newlabel) {
  labelInfo.label = newlabel;
  labelInfo.name = this.labelToName ? this.labelToName(newlabel, labelInfo.index) : newlabel;
  labelInfo.element.find('span.labelText').text(labelInfo.name);
  this.Publish('labelRenamed', labelInfo);
};

LabelsPanel.prototype.renameLabel = function (labelInfo, newlabel) {
  this.Publish(Constants.EDIT_OPSTATE.INIT, 'renameLabel', { labelInfo: labelInfo, label: newlabel });
  this.__renameLabel(labelInfo, newlabel);
  this.Publish(Constants.EDIT_OPSTATE.DONE, 'renameLabel', { labelInfo: labelInfo, label: newlabel });
};

LabelsPanel.prototype.renameLabels = function (labelInfos, newlabel) {
  if (!Array.isArray(labelInfos)) {
    labelInfos = [labelInfos];
  }
  this.Publish(Constants.EDIT_OPSTATE.INIT, 'renameLabels', { labelInfo: labelInfos, label: newlabel });
  for (var i = 0; i < labelInfos.length; i++) {
    this.__renameLabel(labelInfos[i], newlabel);
  }
  this.Publish(Constants.EDIT_OPSTATE.DONE, 'renameLabels', { labelInfo: labelInfos, label: newlabel });
};

LabelsPanel.prototype.removeLabel = function (labelInfo) {
  this.Publish(Constants.EDIT_OPSTATE.INIT, 'removeLabel', { labelInfo: labelInfo });
  labelInfo.removed = true;
  labelInfo.element.remove();
  this.Publish('labelDeleted', labelInfo);
  this.Publish(Constants.EDIT_OPSTATE.DONE, 'removeLabel', { labelInfo: labelInfo });
};

LabelsPanel.prototype.selectLabel = function (labelInfo) {
  labelInfo.element.click();
};

LabelsPanel.prototype.selectNextLabel = function (inc) {
  var selectedLabelInfo = this.selectedLabelInfo;
  var selectedIndex;
  if (selectedLabelInfo) {
    selectedIndex = (selectedLabelInfo.index + inc) % this.labelInfos.length;
    if (selectedIndex < 0) { selectedIndex = selectedIndex + this.labelInfos.length; }
  } else {
    selectedIndex = inc > 0? 0 : (this.labelInfos.length - 1);
  }
  this.selectLabel(this.labelInfos[selectedIndex]);
};

LabelsPanel.prototype.onDeleteButtonClick = function (labelInfo) {
  if (this.checkedDelete) {
    this.checkedDelete(labelInfo, this.removeLabel.bind(this));
  } else {
    this.removeLabel(labelInfo);
  }
};

LabelsPanel.prototype.onLabelButtonClick = function (labelInfo, event) {
  var lastSelectedIndex = this.lastSelectedIndex;
  var selectedIndex = -1;
  var labelInfos = this.labelInfos;
  if (this.allLabelInfo) {
    labelInfos = labelInfos.concat(this.allLabelInfo);
  }
  if (this.allowMultiSelect) {
    for (var i = 0; i < labelInfos.length; i++) {
      var other = labelInfos[i];
      if (other && other.id === labelInfo.id) {
        selectedIndex = i;
        break;
      }
    }
  }
  if (this.allowMultiSelect && event && (event.ctrlKey || event.metaKey || event.shiftKey)) {
    if (event.shiftKey) {
      if (lastSelectedIndex >= 0 && selectedIndex >= 0) {
        // Make sure everything between what is selected and this one is selected
        var i1 = Math.min(lastSelectedIndex, selectedIndex);
        var i2 = Math.max(lastSelectedIndex, selectedIndex);
        for (var i = i1; i <= i2; i++) {
          var other = labelInfos[i];
          if (other) {
            other.element.addClass('active');
            other.selectField.prop('checked', true);
          }
        }
      }
    } else {
      if (labelInfo.element.hasClass('active')) {
        console.log('make inactive');
        labelInfo.element.removeClass('active');
        labelInfo.selectField.prop('checked', false);
      } else {
        console.log('make active');
        labelInfo.element.addClass('active');
        labelInfo.selectField.prop('checked', true);
        this.lastSelectedIndex = selectedIndex;  // Update last selected index
      }
    }
    this.Publish('labelSelected', this.getAllSelected());
  } else {
    labelInfo.element.addClass('active');
    labelInfo.selectField.prop('checked', true);
    // Make sure other labelInfos are not active
    for (var i = 0; i < labelInfos.length; i++) {
      var other = labelInfos[i];
      if (other && other.id !== labelInfo.id) {
        other.element.removeClass('active');
        other.selectField.prop('checked', false);
      }
    }
    this.lastSelectedIndex = selectedIndex;  // Update last selected index
    this.selectedLabelInfo = labelInfo;
    //console.log('Clicked ' + labelInfo.name, labelInfo);
    this.Publish('labelSelected', this.selectedLabelInfo);
  }
};

LabelsPanel.prototype.onEditLabelClick = function (labelInfo, event) {
  this.__enterEditLabelMode(labelInfo);
};


LabelsPanel.prototype.__enterEditLabelMode = function (labelInfo) {
  // Set editField up for input
  // So that typing into the textbox doesn't trigger other keyboard shortcuts:
  var editField = labelInfo.editField;
  editField.off();

  var scope = this;
  function onLabelChanged() {
    var input = scope.__getNormalizedText(editField.val());
    if (input) { //Do nothing on empty inputs
      scope.renameLabel(labelInfo, input);
      scope.__exitEditLabelMode(labelInfo);
    }
  }
  editField.on('keyup', null, function(event) {
    event.stopPropagation();
    if (event.which == 13) {
      onLabelChanged();
    } else if (event.which == 27) {
      scope.__exitEditLabelMode(labelInfo);
    }
  });
  editField.on('blur', null, function(event) {
    scope.__exitEditLabelMode(labelInfo);
  });

  if (this.suggestions) {
    if (editField.data('ui-autocomplete') == undefined) {
      editField.autocomplete({
        source: this.suggestions,
        minLength: 0,
        select: function (event, ui) {
          if (ui) {
            editField.val(ui.item.label);
            onLabelChanged();
            return false;
          }
        }
      });
    }
  }

  // Make the labelInfo info editable
  labelInfo.element.find('span.labelText').hide();
  editField.show();
  editField.focus();
};

LabelsPanel.prototype.__exitEditLabelMode = function (labelInfo) {
  var editField = labelInfo.editField;
  editField.off();
  if (editField.data('ui-autocomplete') != undefined) {
    editField.autocomplete('destroy');
  }
  // Hide edit input
  editField.hide();
  labelInfo.element.find('span.labelText').show();
};

LabelsPanel.prototype.disableButtons = function() {
  for (var i = 0; i < this.labelInfos.length; i++) {
    var labelInfo = this.labelInfos[i];
    if (labelInfo) {
      labelInfo.element.addClass('disabled');
    }
  }
};

LabelsPanel.prototype.clearSelected = function() {
  for (var i = 0; i < this.labelInfos.length; i++) {
    var labelInfo = this.labelInfos[i];
    if (labelInfo) {
      labelInfo.element.removeClass('active');
    }
  }
  this.selectedLabelInfo = null;
  this.Publish('labelSelected', this.selectedLabelInfo);
};

LabelsPanel.prototype.setHighlighted = function(highlighted) {
  for (var i = 0; i < this.labelInfos.length; i++) {
    var labelInfo = this.labelInfos[i];
    if (labelInfo) {
      var highlight = highlighted.indexOf(labelInfo) >= 0;
      if (highlight) {
        labelInfo.element.addClass('highlight');
      } else {
        labelInfo.element.removeClass('highlight');
      }
    }
  }
};

LabelsPanel.prototype.getAllSelected = function() {
  var selected = this.labelInfos.filter( function(x) { return x && !x.removed && x.element.hasClass('active'); });
  return selected;
};

LabelsPanel.prototype.getMatching = function(pattern, matchEntireLabel) {
  if (matchEntireLabel) {
    if (!pattern.startsWith('^')) { pattern = '^' + pattern; }
    if (!pattern.endsWith('$')) { pattern = pattern + '$'; }
  }
  var regex = new RegExp(pattern);
  var selected = this.labelInfos.filter( function(x) { return x && !x.removed && x.label.match(regex); });
  return selected;
};

/**
 * Shows the LabelsPanel.
 * @function
 */
LabelsPanel.prototype.show = function () {
  this.container.show();
};

/**
 * Hides the LabelsPanel.
 * @function
 */
LabelsPanel.prototype.hide = function () {
  this.container.hide();
};

/**
 * is labels panel visible?
 * @function
 */
LabelsPanel.prototype.isVisible = function () {
  return !this.container.is(':hidden');
};

// Extra stuff
LabelsPanel.prototype.remapLabels = function(labelMapping) {
  console.log(labelMapping);
  var mapping = labelMapping.mappings;
  var colors = labelMapping.colors;
  var labels = [];
  for (var i = 0; i < this.labelInfos.length; i++) {
    var labelInfo = this.labelInfos[i];
    if (labelInfo) {
      var label = mapping[labelInfo.label] || 'unknown';
      labels.push(label);
      labelInfo.label = label;
    }
  }
  this.setLabels(labels, colors);
  this.Publish('labelsRemapped', this.labelInfos);
};

LabelsPanel.prototype.__createRemapLabelsPanel = function() {
  var AssetLoader = require('assets/AssetLoader');
  var IOUtil = require('io/IOUtil');
  var panel = $('<div></div>');
  var assetLoader = new AssetLoader();
  var scope = this;
  var labelField = 'category';
  var targetLabelField = 'mpcat40';
  var colorField = 'hex';
  var mappingInput = UIUtil.createFileInput({
    id: this.__panelId + '__remapFile',
    label: 'Label mappings',
    loadFn: function(file) {
      assetLoader.load(file, 'utf-8', function(data) {
        var parsed = IOUtil.parseDelimited(data, { header: true, skipEmptyLines: true, dynamicTyping: false });
        //scope.__labelMappingsData = parsed;
        scope.__labelMappings = {};
        for (var i = 0; i < parsed.data.length; i++) {
          scope.__labelMappings[parsed.data[i][labelField]] = parsed.data[i][targetLabelField];
        }
        console.log('loaded label mappings', scope.__labelMappings);
      });
    }
  });
  panel.append(mappingInput.group);
  var colorsInput = UIUtil.createFileInput({
    id: this.__panelId + '__labelColorsFile',
    label: 'Label colors',
    loadFn: function(file) {
      assetLoader.load(file, 'utf-8', function(data) {
        var parsed = IOUtil.parseDelimited(data, { header: true, skipEmptyLines: true, dynamicTyping: false });
        //scope.__labelColorsData = parsed;
        scope.__labelColors = {};
        for (var i = 0; i < parsed.data.length; i++) {
          scope.__labelColors[parsed.data[i][targetLabelField]] = parsed.data[i][colorField];
        }
        console.log('loaded label colors', scope.__labelColors);
      });
    }
  });
  panel.append(colorsInput.group);
  return {
    panel: panel,
    mappingInput: mappingInput,
    colorsInput: colorsInput
  };
};

LabelsPanel.prototype.showRemapLabelsPanel = function() {
  var scope = this;
  var remapLabelsPanel = this.__createRemapLabelsPanel();
  bootbox.confirm({
    message: remapLabelsPanel.panel,
    callback: function(result) {
      if (result) {
        scope.remapLabels({
          mappings: scope.__labelMappings,
          colors: scope.__labelColors
        });
      }
    }
  });
};

LabelsPanel.prototype.hide = function() {
  this.container.hide();
};

LabelsPanel.prototype.show = function() {
  this.container.show();
};

module.exports = LabelsPanel;

/**
 * Callback function when trying to delete a label to see if it okay or not.
 * @callback ui.LabelsPanel.deleteCallback
 * @param {LabelInfo} labelInfo
 * @param {function} deleteLabelFn
 */

/**
 * Function to automatically convert a label to a name.
 * @callback ui.LabelsPanel.labelToNameCallback
 * @param {string} label
 * @param {int} index
 */

/**
 * Function to check if a new label is valid
 * @callback ui.LabelsPanel.checkNewLabelCallback
 * @param {string} label
 * @param {string} Error message if invalid, undefined otherwise
 */

/**
 * Function to show alert message
 * @callback ui.LabelsPanel.showAlertCallback
 * @param {string} message
 */

/**
 * Event indicating a label was deleted.
 * @event ui.LabelsPanel#labelDeleted
 * @param {LabelInfo} labelInfo The label being deleted.
 */

/**
 * Event indicating a label was added.
 * @event ui.LabelsPanel#labelAdded
 * @param {LabelInfo} labelInfo The label being added.
 */


/**
 * Event indicating a label was selected.
 * @event ui.LabelsPanel#labelSelected
 * @param {LabelInfo} labelInfo The label being selected.
 */

/**
 * Information about a label.
 * @typedef LabelInfo
 * @type {object}
 * @property {int} index
 * @property {int} id - index + 1
 * @property {string} name - Text that is displayed to the user
 * @property {string} label - Label that is stored internally
 * @property {color} color - Color used to represent this label
 * @property {string} cssColor - String representing the color for use in CSS
 * @property {material} colorMat - Material to use on meshes to represent this label
 * @property {material} hoverMat - Material to use on meshes to represent this label when hovering
 * @property {boolean} fixed - Whether the label can be changed or not
 * @property {boolean} frozen - Whether the label is temporarily frozen (should not be changed for now)
 * @property {Object} data - Arbitrary data associated with the label
 */

