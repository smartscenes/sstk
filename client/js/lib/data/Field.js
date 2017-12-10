'use strict';

var _ = require('util');

function Field(params) {
  _.defaults(this, params);
}

Object.defineProperties(Field.prototype, {
  'label': {
    get: function() { return this.text || this.name; },
    set: function(label) { this.text = label; }
  }
});

Field.prototype.getValue = function (d) {
  return d[this.name];
};

Field.prototype.isInteger = function() {
  return this.solrtype === 'int' || this.solrtype === 'long';
};

//function SimpleField(params) {
//}
//
//function ComputedField(params) {
//}
//
//function AggregatedField(params) {
//}

module.exports = Field;
