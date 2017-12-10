'use strict';
var RNG = require('math/RNG');

// Various utility functions

var self = {};

// TODO: remove (unused)
function arrayToMap(arr, field) {
  var map = {};
  for (var i = 0; i < arr.length; i++) {
    map[arr[i][field]] = arr[i];
  }
  return map;
}

self.arrayToMap = arrayToMap;

// TODO: remove (unused)
function arrayToGrouped(arr, field) {
  var map = {};
  for (var i = 0; i < arr.length; i++) {
    var f = arr[i][field];
    if (map[f]) {
      map[f].push( arr[i] );
    } else {
      map[f] = [arr[i]];
    }
  }
  return map;
}

self.arrayToGrouped = arrayToGrouped;

// TODO: remove (unused)
function getFirstLinesFromString(str, count) {
  var lines = [];
  var start = 0;
  while (lines.length < count) {
    var i = str.indexOf('\n', start);
    if (i >= 0) {
      lines.push(str.substring(start, i));
      start = i + 1;
    } else {
      break;
    }
  }
  return lines;
}

self.getFirstLinesFromString = getFirstLinesFromString;

// Copy properties from src to dest
function copy(src, dest, props) {
  dest = dest || {};
  if (props) {
    // Predefined set of properties
    for (var i = 0; i < props.length; i++) {
      var prop = props[i];
      if (src.hasOwnProperty(prop) && src[prop] != null) {
        dest[prop] = src[prop];
      }
    }
  } else {
    // All properties
    for (var prop in src) {
      if (src.hasOwnProperty(prop) && src[prop] != null) {
        dest[prop] = src[prop];
      }
    }
  }
  return dest;
}

self.copy = copy;

// TODO: remove (unused)
// create merged
function createMerged() {
  var res = {};
  for (var i = 0; i < arguments.length; i++) {
    var src = arguments[i];
    for (var prop in src) {
      if (src.hasOwnProperty(prop) && src[prop] != null) {
        res[prop] = src[prop];
      }
    }
  }
  return res;
}

self.createMerged = createMerged;

// TODO: remove (unused)
function getMapValues(map) {
  var values = [];
  for (var prop in map) {
    if (map.hasOwnProperty(prop) && map[prop] != null) {
      values.push(map[prop]);
    }
  }
  return values;
}

self.getMapValues = getMapValues;

// TODO: remove (unused)
function pickRandomProperty(obj) {
  var result;
  var count = 0;
  for (var prop in obj) {
    if (obj.hasOwnProperty(prop)) {
      if (RNG.global.random() < 1 / ++count) {
        result = prop;
      }
    }
  }
  return result;
}

self.pickRandomProperty = pickRandomProperty;

// TODO: remove (unused)
function toIndexMap(arr) {
  var map = {};
  for (var i = 0; i < arr.length; i++) {
    map[arr[i]] = i;
  }
  return map;
}

self.toIndexMap = toIndexMap;

// TODO: remove (unused)
function getRoughSizeOfObject(object) {
  var objectList = [];

  var recurse = function (value) {
    var bytes = 0;

    if (typeof value === 'boolean') {
      bytes = 4;
    } else if (typeof value === 'string') {
      bytes = value.length * 2;
    } else if (typeof value === 'number') {
      bytes = 8;
    } else if (typeof value === 'object' && ($.inArray(value, objectList) === -1)) {
      objectList[ objectList.length ] = value;

      for (var prop in value) {
        bytes += 8; // an assumed existence overhead
        bytes += recurse(value[prop]);
      }
    }

    return bytes;
  };

  return recurse(object);
}

self.getRoughSizeOfObject = getRoughSizeOfObject;

function isFiniteNumber(n) {
  return !isNaN(parseFloat(n)) && isFinite(n);
}

self.isFiniteNumber = isFiniteNumber;

module.exports = self;

