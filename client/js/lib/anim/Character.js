var _ = require('util');

function Character(json) {
  _.merge(this, json);
}

module.exports = Character;