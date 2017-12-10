'use strict';

var dat = require('dat.gui');

/**
 * Config controls with dat gui
 * @param params
 * @constructor
 * @memberOf ui
 */
function DatConfigControls(params) {
  // Container in which config is displayed and configured
  this.container = params.container;
  this.options = params.options;
  this.config = {};
  this.init();
}

DatConfigControls.prototype.constructor = DatConfigControls;

DatConfigControls.prototype.init = function () {
  this.datgui = new dat.GUI({autoPlace: false});
  if (this.container) {
    for (var i = 0; i < this.options.length; i++) {
      var field = this.options[i];
      this.config[field.name] = field.defaultValue;
      var control = (field.min != undefined || field.max != undefined)?
        this.datgui.add(this.config, field.name, field.min, field.max).name(field.text || field.name) :
        this.datgui.add(this.config, field.name, field.values).name(field.text || field.name);
      if (field.step != undefined) {
        control.step(field.step);
      }
      if (field.onChange) {
        control.onChange(field.onChange);
      }
    }
    this.container.append($(this.datgui.domElement));
  }
};

DatConfigControls.prototype.getConfig = function () {
  return this.config;
};

DatConfigControls.prototype.getFieldValue = function (name) {
  return this.config[name];
};

// Exports
module.exports = DatConfigControls;
