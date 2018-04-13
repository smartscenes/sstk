var Object3DUtil = require('geo/Object3DUtil');
var _ = require('util');

/**
 * Mapping of one label set to several other label sets
 * @param opts
 * @param opts.mappings {Map<string,Object>} Map of main label to labels belonging to different label sets.
 *   The field of label to remap from is specified by `mappingKeyField`.  Other fields are specified in the `labelSets`
 * @param opts.labelSets {Map<string,util.LabelRemap.LabelSetDef>} Map of label set name to label set
 * @param opts.mappingKeyField {string} Field name of main label to remap
 * @constructor
 * @memberOf util
 */
function LabelRemap(opts) {
  this.mappings = opts.mappings;
  this.labelSets = opts.labelSets;
  this.mappingKeyField = opts.mappingKeyField;

  var mappings = this.mappings;
  _.forEach(this.labelSets, function(labelSet, name) {
    labelSet.byId = _.keyBy(labelSet.data, labelSet.id);
    labelSet.byLabel = _.keyBy(labelSet.data, labelSet.label);

    labelSet.unlabeledColor = new THREE.Color(labelSet.byLabel[labelSet.unlabeled].hex);
    labelSet.unlabeledId = labelSet.byLabel[labelSet.unlabeled][labelSet.id];
    //console.log('unlabeled id ', name, labelSet.unlabeled, labelSet.unlabeledId);
    labelSet.otherColor = new THREE.Color(labelSet.byLabel[labelSet.other].hex);
    labelSet.otherId = labelSet.byLabel[labelSet.other][labelSet.id];

    labelSet.labelToId = function (label) {
      var r = labelSet.byLabel[label];
      return r? r[labelSet.id] : labelSet.otherId;
    };

    labelSet.rawLabelToLabel = function (rawlabel) {
      var mapping = mappings[rawlabel];
      if (mapping) {
        var remap = mapping[labelSet.label];
        return (remap === '')? labelSet.other : remap;
      } else {
        return labelSet.unlabeled;
      }
    };

    labelSet.idToColor = function (idx) {
      var color = labelSet.byId[idx].hex;
      return color;
    };

    labelSet.getMaterial = function (idx, color) {
      if (color == undefined) {
        color = labelSet.byId[idx].hex;
      }
      return Object3DUtil.getSimpleFalseColorMaterial(idx, color);
    };
  });
}

LabelRemap.prototype.getLabelSet = function(name) {
  return this.labelSets[name];
};

/**
 * A set of labels
 * @typedef util.LabelRemap.LabelSetDef
 * @type {object}
 * @property data {Object[]} Array of label information (with id field, label field, hex color field)
 * @property id {string} Field name for id (typically an integer)
 * @property label {string} Field name for label (typically a string)
 * @property unlabeled {string} Label value indicating not labeled
 * @property empty {string} Label value indicating empty
 * @property other {string} Label value indicating other
 */

/**
 * A set of labels
 * @typedef util.LabelRemap.LabelSet
 * @type {object}
 * @extends {util.LabelRemap.LabelSetDef}
 * @property byId {Map<string,Object>} field name
 * @property byLabel {Map<string,Object>} List of possible values
 * @property labelToId {Map<string,string>} initial value
 * @property rawLabelToLabel {Map<string,string>} initial value
 * @property getMaterial {function(index,color)} initial value
 * @property unlabeledColor {THREE.Color} initial value
 * @property unlabeledId {string} Whether this filter is required
 * @property otherColor {THREE.Color} initial value
 * @property otherId {string} Whether this filter is required
 */

module.exports = LabelRemap;