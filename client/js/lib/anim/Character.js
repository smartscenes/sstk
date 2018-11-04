var _ = require('util/util');

function Character(json) {
  _.merge(this, json);
}

module.exports = Character;