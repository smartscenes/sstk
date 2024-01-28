/**
 * Specifies what goes into select option (generic)
 * @typedef Option
 * @type {object}
 * @property {string} name
 * @property {string} label
 * @property {string} type
 * @property {*} value
 * @property {string} provenance (where did this option come from)
 **/
class Option {
  constructor(name, label, value, type, provenance) {
    this.name = name;
    this.label = label;
    this.value = value;
    this.type = type;
    this.provenance = provenance;
  }
}

/**
 * Specifies what goes into select option for axis (value specifies a axis)
 * @typedef AxisOption
 * @type {Option}
 * @property {string} type - must be 'axis'
 * @property {{x: number, y: number, z: number}} value
 */

const AxisOptions = {
  customAxisOptions: []
};

AxisOptions.addCustomAxisOption = function(axisOptions, customAxisOptions, axis) {
  const index = customAxisOptions.length;
  const option = new Option("c" + index, "Custom" + index, axis, "axis", "custom");
  customAxisOptions.push(option);
  axisOptions.push(option);
  return { index: axisOptions.length - 1, option: option };
};

AxisOptions.setCustomAxis = function(axisOptions, index, axis) {
  axisOptions[index].value.copy(axis);
};

AxisOptions.create = function(name, label, value, type, provenance) {
  return new Option(name, label, value, type, provenance);
};

module.exports = AxisOptions;

