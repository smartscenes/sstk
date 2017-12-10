var _ = require('util');

function Sounds() {
  // Index of sound files
  this.__soundsByModelId = {};
  this.__soundsByCategory = {};
}

Sounds.prototype.getModelSounds = function(modelInfo) {
  var modelId = modelInfo.id;
  var res = {};
  var categories = modelInfo.category;
  for (var i = 0; i < categories.length; i++) {
    var c = categories[i];
    var soundsForCategory = this.__soundsByCategory[c];
    if (soundsForCategory) {
      _.merge(res, soundsForCategory);
    }
  }
  var soundsForModel = this.__soundsByModelId[modelId];
  if (soundsForModel) {
    _.merge(res, soundsForModel);
  }
  return res;
};

Sounds.prototype.import = function(json) {
  this.__sounds = json;
  for (var i = 0; i < json.length; i++) {
    var s = json[i];
    //console.log('processing ', s);
    if (s.modelIds) {
      for (var j = 0; j < s.modelIds.length; j++) {
        this.__soundsByModelId[s.modelIds[j]] = s.sounds;
      }
    } else if (s.category) {
      if (Array.isArray(s.category)) {
        for (var j = 0; j < s.category.length; j++) {
          this.__soundsByCategory[s.category[j]] = s.sounds;
        }
      } else {
        this.__soundsByCategory[s.category] = s.sounds;
      }
    }
  }
  // console.log('soundsByModelId', this.__soundsByModelId);
  // console.log('soundsByCategory', this.__soundsByCategory);
};

module.exports = Sounds;