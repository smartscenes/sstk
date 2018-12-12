var self = {};

// TODO: Consolidate type definitions used in Grid, NRRDReader, PLYExporter/PLYLoader, sim/server

// Basic definition of numeric types with number of bytes and array type
var types = Object.freeze({
  'int8': { bytes: 1, array: Int8Array },
  'uint8': { bytes: 1, array: Uint8Array },
  'uchar': { bytes: 1, array: Uint8Array },
  'int16': { bytes: 2, array: Int16Array },
  'uint16': { bytes: 2, array: Uint16Array },
  'int32': { bytes: 4, array: Int32Array },
  'uint32': { bytes: 4, array: Uint32Array },
  'int64': { bytes: 8 },
  'uint64': { bytes: 8 },
  'float32': { bytes: 4, array: Float32Array },
  'float64': { bytes: 8, array: Float64Array }
});

var __typedArrayToType = {
  'Int8Array': 'int8',
  'Int16Array': 'int16',
  'Int32Array': 'int32',
  'Uint8Array': 'uint8',
  'Uint8ClampedArray': 'uint8',
  'Uint16Array': 'uint16',
  'Uint32Array': 'uint32',
  'Float32Array': 'float32',
  'Float64Array': 'float64'
};

function nameToTypedArray(name) {
  if (types[name]) {
    return types[name].array;
  }
  var t = __typedArrayToType[name];
  return t? types[t].array : undefined;
}
self.nameToTypedArray = nameToTypedArray;

function rle(array) {
  var data = [];
  if (array.length) {
    var curr = NaN;
    var count = 0;
    for (var i = 0; i < array.length; i++) {
      var d = array[i];
      if (d !== curr) {
        if (isNaN(d) && isNaN(curr)) {
          count++;
        } else {
          if (count > 0) {
            data.push(curr);
            data.push(count);
          }
          curr = d;
          count = 1;
        }
      } else {
        count++;
      }
    }
    if (count > 0) {
      data.push(curr);
      data.push(count);
    }
  }
  return data;
}

function arrayToJson(array, opts) {
  opts = opts || {};
  var encoding = opts.encoding || 'raw';
  var t = __typedArrayToType[array.constructor.name];
  if (t) {
    var data;
    if (encoding === 'raw') {
      data = new Array(array.length);
      for (var i = 0; i < array.length; i++) {
        data[i] = array[i];
      }
    } else if (encoding === 'rle') {
      data = rle(array);
    } else {
      throw 'Unknown encoding: ' + encoding;
    }
    return {type: 'array', datatype: t, length: array.length, encoding: encoding, data: data};
  } else if (Array.isArray(array)) {
    if (encoding === 'raw') {
      return array;
    } else if (encoding === 'rle') {
      var data = rle(array);
      return {type: 'array', length: array.length, encoding: encoding, data: data};
    } else {
      throw 'Unknown encoding: ' + encoding;
    }
  } else {
    throw 'Unsupported array type';
  }

}
self.arrayToJson = arrayToJson;

function jsonToArray(json, defaultValue) {
  if (Array.isArray(json)) {
    return json;
  } else if (json.type === 'array') {
    var datatype = types[json.datatype];
    var arrayType = datatype? (datatype.array || Array) : Array;
    var array = new arrayType(json.length);
    var encoding = json.encoding || 'raw';
    if (encoding === 'raw') {
      for (var i = 0; i < json.data.length; i++) {
        array[i] = json.data[i];
      }
    } else if (encoding === 'rle') {
      var ai = 0;
      for (var i = 0; i < json.data.length; i+=2) {
        var d = json.data[i];
        if (d === null) {
          d = defaultValue;
        }
        var c = json.data[i+1];
        array.fill(d, ai, ai + c);
        ai += c;
      }
    } else {
      throw 'Unknown encoding: ' + encoding;
    }
    return array;
  } else {
    throw 'Cannot convert from json to Array';
  }
}
self.jsonToArray = jsonToArray;

function getType(obj) {
  var t = typeof obj;
  if (t === 'object' && obj.constructor) {
    return obj.constructor.name || t;
  } else {
    return t;
  }
}
self.getType = getType;

function ensureDate(obj) {
  if (obj != undefined) {
    var t = getType(obj);
    if (t !== 'Date') {
      return new Date(obj);
    }
  }
  return obj;
}
self.ensureDate = ensureDate;

// Takes string and tries to guess the type of the string (
function convertString(str) {
  if (typeof str !== 'string') return str;  // not string
  var lowercase = str.toLowerCase();
  if (lowercase === 'true') {
    return true;
  } else if (lowercase === 'false') {
    return false;
  } else {
    var number = Number(str);
    if (!isNaN(number)) {
      return number;
    } else {
      // TODO: this date parsing is not very robust to different date formats
      var date = new Date(str);
      if (date !== "Invalid Date" && !isNaN(date)) {
        return date;
      } else {
        return str;
      }
    }
  }
}
self.convertString = convertString;

module.exports = self;
