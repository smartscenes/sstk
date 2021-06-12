'use strict';

// Simple wrapper around keymage to register key callbacks and associated descriptions

var keymage = require('keymage');

var keyTable = {};

// Map key to handler and return unbinder.  keyOpts can be keychain string or
// Object of format {in: scopeString, on: keychainString, do: description}
function keymap(keyOpts, handler) {
  // parse args
  var isKeyString = typeof keyOpts === 'string';
  var key = isKeyString ? keyOpts : keyOpts.on;
  var target = isKeyString ? undefined : keyOpts.target;
  var scope = isKeyString ? undefined : keyOpts.in;
  var text = isKeyString ? undefined : keyOpts.do;

  // add text to table if given
  if (text) {
    var entry = scope ? keyTable[scope] : keyTable;
    entry = entry || {};
    entry[key] = text;
  }

  var filter = keyOpts.filter;
  if (!filter) {
    if (target) {
      if (Array.isArray(target)) {
        filter = function (event) {
          // Only process event if it is meant for us
          for (var i = 0; i < target.length; i++) {
            if (event.target === target[i]) {
              return true;
            }
          }
          return false;
        };
      } else {
        filter = function (event) {
          // Only process event if it is meant for us
          return (event.target === target);
        };
      }
    } else {
      filter = function (event) {
        // By default, for global bindings, don't associate special key binds for anything that is a text input
        var tagName = (event.target || event.srcElement).tagName;
        return !(tagName === 'INPUT' || tagName === 'SELECT' || tagName === 'TEXTAREA');
      };
    }
  }

  var wrapper = function (event, context) {
    if (filter(event)) {
      // TODO: Consider using handler return code to decide if we want to prevent default / propagate event up
      event.preventDefault();
      handler(event, context);
      return false;
    }
  };

  // bind key and return unbinder
  if (scope) {
    return keymage(scope, key, wrapper);
  } else {
    return keymage(key, wrapper);
  }
}

keymap.keyTable = function (scope) {
  return scope ? keyTable[scope] : keyTable;
};

keymap.unbind = function (key, handler) {
  return keymage.unbind(key, handler);
};

keymap.setScope = function (scope) {
  return keymage.setScope(scope);
};

keymap.pushScope = function (scope) {
  return keymage.pushScope(scope);
};

keymap.popScope = function (scope) {
  return keymage.popScope(scope);
};

module.exports = keymap;
