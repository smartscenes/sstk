var Object3DUtil = require('geo/Object3DUtil');
var _ = require('util');

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

module.exports = LabelRemap;