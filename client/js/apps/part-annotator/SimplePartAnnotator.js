'use strict';

var PartAnnotator = require('./PartAnnotator');
var _ = require('util');

require('physijs');

/**
 * Most basic {@link PartAnnotator}, really not any different.
 * @constructor
 * @extends PartAnnotator
 */
function SimplePartAnnotator(params) {
  var defaults = {
    allowEditLabels: false,
    useSegments: false
  };
  params = _.defaultsDeep(Object.create(null), params, defaults);
  PartAnnotator.call(this, params);
}

SimplePartAnnotator.prototype = Object.create(PartAnnotator.prototype);
SimplePartAnnotator.prototype.constructor = SimplePartAnnotator;

// Exports
module.exports = SimplePartAnnotator;