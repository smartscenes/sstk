var Object3DUtil = require('geo/Object3DUtil');
var _ = require('util/util');

/**
 * Simple remapping of one label set to another
 * @param opts
 * @param opts.mapping {Map<string,Object>} Map of label to objects (object should contain `index` field)
 * @param [opts.name] {string} Name for mapping
 * @param [opts.maxIndex] {int} Max value of index
 * @param [opts.defaultIndex] {int} Default index to return for a label if label not found
 * @constructor
 * @memberOf util
 */
function LabelMapping(opts) {
  this.name = opts.name;
  this.mapping = opts.mapping;
  this.indices = _.uniq(_.map(this.mapping, function(m) { return m.index; }));
  this.maxIndex = (opts.maxIndex != undefined)? opts.maxIndex : _.max(this.indices);
  this.defaultIndex = opts.defaultIndex;
}

LabelMapping.prototype.index = function(label) {
  return _.get(this.mapping, [label, 'index'], this.defaultIndex);
};

LabelMapping.prototype.indexOneOf = function(label) {
  if (_.isArray(label)) {
    for (var i = 0; i < label.length; i++) {
      var m = this.mapping[label[i]];
      if (m) { return m.index; }
    }
    return this.defaultIndex;
  } else {
    return this.index(label);
  }
};

function Loader(params) {
  this.opts = params;
  this.fs = params.fs;
}

Loader.prototype.load = function(file, callback) {
  var filename = file.name || file;
  var scope = this;
  this.fs.readAsync(file, 'utf-8', function(err, data) {
    if (err) {
      callback(err);
    } else {
      callback(null, scope.parse(filename, data));
    }
  });
};

Loader.prototype.parse = function(filename, data) {
  var opts = _.defaults(Object.create(null), { filename: filename }, this.opts);
  if (opts.fields && !opts.remapFields) {
    opts.remapFields = _.invert(opts.fields);
  }
  if (!opts.keyBy) {
    opts.keyBy = _.get(opts, 'remapFields.label', 'label');
  }
  var IOUtil = require('io/IOUtil');
  var parsed = IOUtil.parseDelimited(data, opts);
  return new LabelMapping({ name: opts.name || filename, mapping: parsed.data, defaultIndex: opts.defaultIndex, maxIndex: opts.maxIndex });
};

LabelMapping.Loader = Loader;

module.exports = LabelMapping;