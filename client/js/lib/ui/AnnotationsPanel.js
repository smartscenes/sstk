'use strict';

var Constants = require('Constants');

function AnnotationsPanel(params) {
  this.submitAnnotationsUrl = params.submitAnnotationsUrl || (Constants.baseUrl + '/submitModelAnnotations');
  if (params) {
    this.container = params.container;
    // List of settable attributes
    this.attributes = params.attributes;
    // List of readonly attributes
    this.attributesReadOnly = params.attributesReadOnly;
    // Whether to hide empty fields
    this.hideEmptyFields = params.hideEmptyFields;
    // What to use to lookup our attributes
    this.searchController = params.searchController;

    // Application callback indicating annotations submitted
    this.onSubmittedCallback = params.onSubmittedCallback;
  }
  // Fields initialized in init()
  // List of all attribute names (attributes + attributesReadOnly)
  this.allAttributes = [];
  // Map of attribute names to attribute info
  this.attributesMap = {};

  // Target specific fields
  // Model instance to annotate
  this.target = null;
  // Annotations on the model instance
  this.annotations = {};

  this.init();
}

AnnotationsPanel.prototype.init = function () {
  // Hook up clear button
  this.clearButton = $('#clearAnnotations');
  this.clearButton.click(this.clear.bind(this));
  // Hook up submit button
  this.submitButton = $('#submitAnnotations');
  this.submitButton.click(this.submit.bind(this));
  // Hook up preview button
  this.previewButton = $('#previewAnnotations');
  this.previewButton.click(this.preview.bind(this));
  // Hook up reset button
  this.resetButton = $('#resetAnnotations');
  this.resetButton.click(this.reset.bind(this));

  this.submitButtons = $().add(this.submitButton).add(this.resetButton).add(this.clearButton).add(this.previewButton);
  // Initialize map of attribute names to information about the attributes
  this.lookupAttributeFields();
};

AnnotationsPanel.prototype.setTarget = function (target) {
  this.target = target;
  this.annotations = {
    'orig': {},
    'new': {},
    'update': {}
  };
  var modelInfo = this.target.model.info;
  if (modelInfo) {
    // Display attributes
    // Display readwrite attributes
    for (var i = 0; i < this.attributes.length; i++) {
      var name = this.attributes[i];
      if (modelInfo.hasOwnProperty(name)) {
        this.annotations.orig[name] = modelInfo[name];
        this.setAnnotation(name, modelInfo[name]);
      } else {
        this.setAnnotation(name, undefined);
      }
    }
    // Display readonly attributes
    for (var i = 0; i < this.attributesReadOnly.length; i++) {
      var name = this.attributesReadOnly[i];
      if (modelInfo.hasOwnProperty(name)) {
        var field = this.attributesMap[name];
        var value = modelInfo[name];
        this.showAttribute(name, field, value, 'noedit');
      } else {
        if (this.hideEmptyFields) {
          var field = this.attributesMap[name];
          field.div.hide();
        }
      }
    }
  }
};

AnnotationsPanel.prototype.showAttribute = function (fieldName, field, value, update) {
  // Update the UI
  if (field && field.div) {
    var fieldInput = field.div.find('#anno_' + fieldName);
    if (this.hideEmptyFields) {
      var isEmpty = !value;
      if (isEmpty) {
        field.div.hide();
      } else {
        field.div.show();
      }
    }
    if (field.type === 'boolean') {
      fieldInput.prop('checked', value);
    } else {
      var multiValued = field.multiValued;
      if (multiValued) {
        var fieldValues = field.div.find('#annolist_' + fieldName);
        var updateMap = update;
        if (typeof (update) === 'string') {
          updateMap = {};
          for (var j = 0; j < value.length; j++) {
            updateMap[value[j]] = update;
          }
        }
        this.updateLabels(fieldValues, fieldName, updateMap);
      } else if (fieldInput.prop("tagName").toLowerCase() !== 'input') {
        fieldInput.text(value);
      } else {
        fieldInput.val(value);
      }
    }
  }
};

AnnotationsPanel.prototype.setAnnotation = function (fieldName, value) {
  this.annotations['new'][fieldName] = value;
  // Update UI
  var field = this.attributesMap[fieldName];
  if (field) {
    var multiValued = field.multiValued;
    // Figure out the changes...
    var update = {};
    if (multiValued) {
      if (this.annotations['new'][fieldName]) {
        for (var i = 0; i < this.annotations['new'][fieldName].length; i++) {
          update[ this.annotations['new'][fieldName][i] ] = 'add';
        }
      }
      if (this.annotations.orig[fieldName]) {
        for (var i = 0; i < this.annotations.orig[fieldName].length; i++) {
          var v = this.annotations.orig[fieldName][i];
          if (update[v] === 'add') {
            update[v] = '';
          } else {
            update[v] = 'del';
          }
        }
      }
    } else {
      if (this.annotations['new'][fieldName] !== this.annotations.orig[fieldName]) {
        if (this.annotations['new'][fieldName]) {
          update[ this.annotations['new'][fieldName] ] = 'add';
        }
        if (this.annotations.orig[fieldName]) {
          update[ this.annotations.orig[fieldName] ] = 'del';
        }
      }
    }
    this.annotations.update[fieldName] = update;
    // Update the UI
    this.showAttribute(fieldName, field, value, update);
  }
};

AnnotationsPanel.prototype.clearAnnotation = function (fieldName) {
  var value = '';
  var field = this.attributesMap[fieldName];
  if (field) {
    var multiValued = field.multiValued;
    if (multiValued) {
      value = [];
    } else {
      if (field.type === 'boolean') {
        value = false;
      }
    }
    this.setAnnotation(fieldName, value);
  }
};

AnnotationsPanel.prototype.removeAnnotation = function (fieldName, value) {
  var current = this.annotations['new'][fieldName];
  if (current) {
    var filtered = current.filter(function (x) { return x !== value; });
    if (current.length !== filtered.length) {
      this.setAnnotation(fieldName, filtered);
    }
  }
};

AnnotationsPanel.prototype.addAnnotation = function (fieldName, value) {
  var current = this.annotations['new'][fieldName];
  if (current) {
    var found = false;
    for (var i = 0; i < current.length; i++) {
      if (current[i] === value) {
        found = true;
      }
    }
    if (!found) {
      current.push(value);
      this.setAnnotation(fieldName, current);
    }
  } else {
    this.setAnnotation(fieldName, [value]);
  }
};

AnnotationsPanel.prototype.updateLabels = function (labels, fieldName, updateMap) {
  labels.empty();
  for (var fieldValue in updateMap) {
    if (updateMap.hasOwnProperty(fieldValue)) {
      var update = updateMap[fieldValue];
      var label = this.createLabel(fieldName, fieldValue, update);
      labels.append(label);
    }
  }
};

// Creates a label for annotation
//   .searchResultLabel = no change,
//   .searchResultLabel_noedit = no change and not editable,
//   .searchResultLabel_add = added,
//   .searchResultLabel_del = deleted
AnnotationsPanel.prototype.createLabel = function (attrname, attrvalue, update) {
  var catClass = 'searchResultLabel';
  if (update) {
    catClass = catClass + ' ' + catClass + '_' + update;
  }
  var label = $('<div></div>')
    .attr('class', 'roundBorder ' + catClass)
    .text(attrvalue);
  var change = $('<img/>');
  if (update === 'del') {  // Have add button
    label.click(function (e) {
      this.addAnnotation(attrname, attrvalue);
      e.stopPropagation();
    }.bind(this));
    label.append(change);
  } else if (update === 'add' || update === '') {  // Have delete button
    label.click(function (e) {
      this.removeAnnotation(attrname, attrvalue);
      e.stopPropagation();
    }.bind(this));
    label.append(change);
  }
  return label;
};

AnnotationsPanel.prototype.initPanel = function () {
  for (var i = 0; i < this.allAttributes.length; i++) {
    var name = this.allAttributes[i];
    var field = this.attributesMap[name];
    if (field) {
      var fieldUi = $('<div></div>').attr('id', 'field_' + name).attr('class','annotation');
      var multiValued = field.multiValued;
      var inputType = 'text';
      if (field.type === 'boolean') {
        inputType = 'checkbox';
      }
      if (field.isReadOnly) {
        var fieldLabel = $('<label></label>').text(name);
        fieldUi.append(fieldLabel);
        fieldUi.append('&nbsp;');
        if (multiValued) {
          var fieldValues = $('<span></span>').attr('id', 'annolist_' + name);
          fieldUi.append(fieldValues);
        } else if (inputType === 'text') {
          var fieldInput = $('<span></span>').attr('id', 'anno_' + name);
          fieldUi.append(fieldInput);
        } else {
          var fieldInput = $('<input/>').attr('id', 'anno_' + name).attr('type', inputType).attr('disabled', true);
          fieldUi.append(fieldInput);
        }
      } else {
        var fieldInput = $('<input/>').attr('id', 'anno_' + name).attr('type', inputType);
        var fieldLabel = $('<label></label>').attr('for', 'anno_' + name).text(name);
        fieldUi.append(fieldLabel);
        fieldUi.append('&nbsp;');
        if (multiValued) {
          var fieldValues = $('<span></span>').attr('id', 'annolist_' + name);
          fieldUi.append(fieldValues);
          fieldUi.append(fieldInput);
          // TODO: Make into add icon
          var addButton = $('<input/>').attr('type', 'button').attr('value', 'Add');
          addButton.click(function (field) {
            var fieldName = field.name;
            var fieldInput = field.div.find('#anno_' + fieldName);
            var fieldValue = fieldInput.val();
            this.addAnnotation(fieldName, fieldValue);
          }.bind(this, field));
          fieldUi.append(addButton);
        } else {
          fieldInput.change(function (field) {
            var fieldName = field.name;
            var fieldInput = field.div.find('#anno_' + fieldName);
            if (field.type === 'boolean') {
              this.setAnnotation(fieldName, fieldInput.prop('checked'));
            } else {
              this.setAnnotation(fieldName, fieldInput.val());
            }
          }.bind(this, field));
          fieldUi.append(fieldInput);
        }
      }
      field.div = fieldUi;
      this.container.append(fieldUi);
    }
  }
};

AnnotationsPanel.prototype.reset = function () {
  var target = this.target;
  if (!target) {
    return;
  }
  var orig = this.annotations.orig;
  for (var i = 0; i < this.attributes.length; i++) {
    var name = this.attributes[i];
    if (orig.hasOwnProperty(name)) {
      this.setAnnotation(name, orig[name]);
    } else {
      this.setAnnotation(name, undefined);
    }
  }
};

AnnotationsPanel.prototype.saveNew = function () {
  var target = this.target;
  if (!target) {
    return;
  }
  var newAnno = this.annotations['new'];
  this.annotations = {
    'orig': newAnno,
    'new': {},
    'update': {}
  };
  this.reset();
};

AnnotationsPanel.prototype.lookupAttributeFields = function () {
  var saveFieldsCallback = function (err, data) {
    if (err) {
      console.error('Error looking up fields', err);
    } else if (data && data.fields) {
      var map = {};
      for (var i = 0; i < data.fields.length; i++) {
        var field = data.fields[i];
        map[field.name] = field;
      }
      this.attributesMap = map;
      // Populate all attributes and isReadOnly flag
      this.allAttributes = [];
      for (var i = 0; i < this.attributes.length; i++) {
        var name = this.attributes[i];
        if (this.attributesMap.hasOwnProperty(name)) {
          this.allAttributes.push(name);
          this.attributesMap[name].isReadOnly = false;
        }
      }
      for (var i = 0; i < this.attributesReadOnly.length; i++) {
        var name = this.attributesReadOnly[i];
        if (this.attributesMap.hasOwnProperty(name)) {
          this.allAttributes.push(name);
          this.attributesMap[name].isReadOnly = true;
        }
      }
      this.initPanel();
    }
  }.bind(this);
  this.searchController.lookupFields(Constants.models3dFieldsUrl, saveFieldsCallback);
};

AnnotationsPanel.prototype.clear = function () {
  for (var i = 0; i < this.attributes.length; i++) {
    var name = this.attributes[i];
    this.clearAnnotation(name);
  }
};

AnnotationsPanel.prototype.preview = function () {
  console.log(this.annotations['new']);
};

AnnotationsPanel.prototype.submit = function () {
  var target = this.target;
  if (!target) {
    return;
  }
  // Resize everything to meters for backend storage
  var modelId = target.model.getFullID();
  var params = {
    modelId: modelId,
    // userId: (window.globals)? window.globals.userId : "unknown",
    updateMain: Constants.submitUpdateMain
  };
  var newAnno = this.annotations['new'];
  for (var i = 0; i < this.attributes.length; i++) {
    var name = this.attributes[i];
    if (newAnno.hasOwnProperty(name) && newAnno[name] !== undefined) {
      params[name] = newAnno[name];
    }
  }
  var data = jQuery.param(params);
  var inputs = this.submitButtons;
  inputs.prop('disabled', true);
  $.ajax({
    type: 'POST',
    url: this.submitAnnotationsUrl,
    data: data,
    success: function (response, textStatus, jqXHR) {
      console.log('Annotations successfully submitted for ' + modelId + '!!!');
      this.saveNew();
      // Callback
      if (this.onSubmittedCallback) {
        this.onSubmittedCallback();
      }
    }.bind(this),
    error: function (jqXHR, textStatus, errorThrown) {
      console.error('Error submitting annotations for '  + modelId + '!!!');
    },
    complete: function () {
      // Re-enable inputs
      inputs.prop('disabled', false);
    }
  });
};

module.exports = AnnotationsPanel;
