'use strict';

var dat = require('ui/datGui');

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
  this.autoUpdate = params.autoUpdate;
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
      if (this.autoUpdate) {
        control.listen();
      }
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

DatConfigControls.prototype.hide = function() {
  this.datgui.hide();
};

DatConfigControls.prototype.show = function() {
  this.datgui.show();
};

DatConfigControls.prototype.close = function() {
  this.datgui.close();
};

DatConfigControls.prototype.open = function() {
  this.datgui.open();
};

DatConfigControls.prototype.reattach = function() {
  this.container.append($(this.datgui.domElement));
};

// Exports
module.exports = DatConfigControls;
