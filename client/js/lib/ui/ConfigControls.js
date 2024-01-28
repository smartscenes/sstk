'use strict';

/**
 * @typedef {object} ConfigField
 * @property name {string} Name of the configuration
 * @property text {string} Label used for the field
 * @property type {string} Type of the field (`boolean|number')
 * @property [values] Set of values (if specified will be shown as select input)
 * @property [defaultValue] Default value to set the controls
 * @property [onchange] {function(event)} What to do when the input config changes
 * @property [input] Actual input field (populated by ui.ConfigControls)
 * @property [div] Div element containing input field (populated by ui.ConfigControls)
 */

/**
 * Creates a UI for configuration options
 * @param params.container Container in which config is displayed and configured
 * @param [params.prefix=''] {string} Prefix used to id fields
 * @param [params.options] {Array<ConfigField>} List of fields to be configured
 * @constructor
 * @memberOf ui
 */
function ConfigControls(params) {
  this.container = params.container;
  this.prefix = params.prefix || '';
  this.options = params.options;
  this.gui = $('<span></span>');
  this.init();
}

ConfigControls.prototype.constructor = ConfigControls;

ConfigControls.prototype.init = function () {
  if (this.container) {
    for (var i = 0; i < this.options.length; i++) {
      var field = this.options[i];
      var elem = this.__createFieldElement(field);
      this.gui.append(elem);
    }
    this.container.append(this.gui);
  }
};

ConfigControls.prototype.reattach = function() {
  this.container.append(this.gui);
};

ConfigControls.prototype.__createFieldElement = function (field) {
  var id = field.id;
  var fieldUi = $('<div></div>').attr('id', this.prefix + 'field_' + id);

  // Add label
  var label = (field.text != null)? field.text : field.name;
  var fieldLabel = $('<label></label>').text(label);
  fieldUi.append(fieldLabel);

  if (field['type'] == null && field['value'] != null) {
    // try to guess what field type should be
    if (typeof(field['value']) === 'boolean') {
      field['type'] = 'boolean';
    } else if (typeof(field('value')) === 'number') {
      field['type'] = 'number';
    }
  }

  // Add input field
  var inputType = 'text';
  if (field['type'] === 'boolean') {
    inputType = 'checkbox';
  }
  if (field['values']) {
    inputType = 'select';
  }
  var fieldInput;
  if (inputType === 'select') {
    fieldInput = $('<select/>').attr('id', this.prefix + id);
    var values = field['values'];
    if (Array.isArray(values)) {
      for (var i = 0; i < values.length; i++) {
        var name = values[i];
        var v = (field['type'] === 'number' && typeof name !== 'number')? i : name;
        fieldInput.append('<option value="' + v + '">' + name + '</option>');
      }
    } else {
      for (var key in values) {
        if (values.hasOwnProperty(key)) {
          fieldInput.append('<option value="' + values[key] + '">' + key + '</option>');
        }
      }
    }
  } else {
    fieldInput = $('<input/>').attr('id', this.prefix + id).attr('type', inputType);
  }
  if (field.hasOwnProperty('defaultValue')) {
    if (field['type'] === 'boolean') {
      fieldInput.prop('checked', field['defaultValue']);
    } else {
      fieldInput.val(field['defaultValue']);
    }
  }
  if (field['onchange']) {
    fieldInput.change(field['onchange']);
  }
  fieldUi.append(fieldInput);
  field.input = fieldInput;
  field.div = fieldUi;
  return fieldUi;
};

ConfigControls.prototype.getConfig = function (opts) {
  opts = opts || {};
  var config = {};
  for (var i = 0; i < this.options.length; i++) {
    var field = this.options[i];
    var fieldValue = this.__getFieldValue(field, opts);
    if (fieldValue != undefined) {
      config[field.name] = fieldValue;
    }
  }
  return config;
};

ConfigControls.prototype.getFieldValue = function (name, opts) {
  opts = opts || {};
  for (var i = 0; i < this.options.length; i++) {
    var field = this.options[i];
    if (name === field.name) {
      return this.__getFieldValue(field, opts);
    }
  }
};

ConfigControls.prototype.__getFieldValue = function(field, opts) {
  if (field.input) {
    var fieldInput = field.input;
    var fieldValue = fieldInput.val();
    if (field['type'] === 'boolean') {
      fieldValue = fieldInput.prop('checked');
      if (opts.stringify) {
        fieldValue = fieldValue.toString();
      }
    } else if (field['type'] === 'number') {
      fieldValue = Number(fieldValue);
    }
    return fieldValue;
  }
};

ConfigControls.prototype.setFieldValue = function(name, value) {
  for (var i = 0; i < this.options.length; i++) {
    var field = this.options[i];
    if (name === field.name) {
      return this.__setFieldValue(field, value);
    }
  }
};

ConfigControls.prototype.__setFieldValue = function(field, value) {
  if (field.input) {
    var oldValue = this.__getFieldValue(field);
    var fieldInput = field.input;
    if (field['type'] === 'boolean') {
      fieldInput.prop('checked', !!value);
    } else {
      fieldInput.val(value);
    }
    return oldValue;
  }
};

// Exports
module.exports = ConfigControls;
