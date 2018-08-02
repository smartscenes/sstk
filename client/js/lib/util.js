/**
 * Provides various utility functions on top of existing functions already provided by lodash.
 * @module util
 * @extends lodash
 **/

var _ = require('lodash');

var JSONUtil = require('io/JSONUtil');
_.getJSON = JSONUtil.getJSON;

var Ajax = require('io/Ajax');
_.mixin(Ajax);

var RNG = require('math/RNG');
/** generate a random id of specified length */
function generateRandomId(charCount, charSet) {
  charCount = charCount || 5;
  charSet = charSet || 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  var charSetSize = charSet.length;
  var id = '';
  for (var i = 1; i <= charCount; i++) {
    var randPos = Math.floor(RNG.global.random() * charSetSize);
    id += charSet[randPos];
  }
  return id;
}

_.generateRandomId = generateRandomId;

function basicIterator(start, end, incr, getElement) {
  incr = incr || 1;
  getElement = getElement || function(i) { return i; };
  this.index = start;
  this.next = function() {
    if (this.index < end) {
      var res = getElement(this.index);
      this.index += incr;
      return { value: res, done: false };
    } else {
      return { done: true };
    }
  };
}

_.getIterator = function(start, end, incr, getElement) { return new basicIterator(start, end, incr, getElement); };

/**
 * Resolve relative path wrt to base path
 * @param basePath {string}
 * @param relPath {string}
 * @returns {string}
 * @static
 */
function getPath(basePath, relPath) {
  var base = basePath;
  var rel = relPath;
  while (rel.startsWith("../")) {
    rel = rel.substr(3);
    if (base.charAt(base.length-1) == "/") {
      base = base.substr(0, base.length-1);
    }
    var n = base.lastIndexOf("/");
    if (n > 0) {
      base = base.substr(0, n);
    } else {
      base = "";
    }
  }
  if (base.endsWith("/") || base === "")
    return base + rel;
  else return base + "/" + rel;
}
_.getPath = getPath;

_.getFileExtension = function(str) {
  var parts = str.split('.');
  if (parts.length > 1) {
    return parts[parts.length-1];
  } else {
    return '';
  }
};

// Take a string and returns ascii char codes
_.toCharCodes = function(s) {
  return _.map(s, function (x) {
    return x.charCodeAt(0);
  });
};

// Take a string and encode first 4 characters as int32
_.strToInt32 = function(s) {
  var c = _.toCharCodes(s);
  return c[0] << 24 ^ c[1] << 16 ^ c[2] << 8 ^ c[3] << 0;
};

_.getUrlParams = function () {
  var nestedParamRegex = /^(.+)\[(.+)\]$/;
  var vars = {}, hash;
  var hashes = window.location.href.slice(window.location.href.indexOf('?') + 1).split('&');
  for(var i = 0; i < hashes.length; i++) {
    hash = hashes[i].split('=');
    var name = decodeURIComponent(hash[0]);
    var value = decodeURIComponent(hash[1]);
    var lowercase = value.toLowerCase();
    if (lowercase === 'false') { value = false; }
    else if (lowercase === 'true') { value = true; }
    //vars.push(name);
    var m = name.match(nestedParamRegex);
    if (m) {
      var n1 = m[1];
      var n2 = m[2];
      if (!vars[n1]) { vars[n1] = {}; }
      vars[n1][n2] = value;
    } else {
      vars[name] = value;
    }
  }
  return vars;
};

_.getUrlParam = function (name, defaultValue) {
  var v = _.getUrlParams()[name];
  return (v != undefined)? v : defaultValue;
};

// Stuffs arguments into object
function processArguments(args, argNames) {
  if (args.length === 1) {
    // Assume single argument is object - return as is
    return args[0];
  } else {
    var res = {};
    var n = Math.min(argNames.length, args.length);
    for (var i = 0; i < n; i++) {
      res[argNames[i]] = args[i];
    }
    return res;
  }
}

_.processArguments = processArguments;

// Prepares str for csv encoding for escaping it
function escapeCsv(str, formatter) {
  if (str == undefined) { str = ''; }
  if (formatter) {
    str = formatter(str);
  }
  var result = str.toString().replace(/"/g, '""');
  if (result.search(/("|,|\n)/g) >= 0) {
    result = '"' + result + '"';
  }
  return result;
}

_.escapeCsv = escapeCsv;

function toDelimitedString(rec, delimiter, fields, constants, formatter) {
  var list = rec;
  if (!_.isArray(list)) {
    list = _.map(fields, function(f) { return list[f]; });
  }
  if (delimiter === ',') {
    list = _.map(list, function(x) { return escapeCsv(x, formatter); } );
  }
  if (constants) {
    list = _.concat(constants, list);
  }
  return list.join(delimiter);
}

_.toDelimitedString = toDelimitedString;

/**
 * Takes a string and returns a hash using letters [0-9a-b]
 * @static
 */
function strhash( str ) {
  if (str.length % 32 > 0) str += Array(33 - str.length % 32).join("z");
  var hash = '';
  var bytes = [];
  var i = 0;
  var j = 0;
  var k = 0;
  var a = 0;
  var dict = ['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','1','2','3','4','5','6','7','8','9'];
  for (i = 0; i < str.length; i++ ) {
    var ch = str.charCodeAt(i);
    bytes[j++] = (ch < 127) ? ch & 0xFF : 127;
  }
  var chunk_len = Math.ceil(bytes.length / 32);
  for (i=0; i<bytes.length; i++) {
    j += bytes[i];
    k++;
    if ((k == chunk_len) || (i == bytes.length-1)) {
      a = Math.floor( j / k );
      if (a < 32)
        hash += '0';
      else if (a > 126)
        hash += 'z';
      else
        hash += dict[  Math.floor( (a-32) / 2.76) ];
      j = k = 0;
    }
  }
  return hash;
}
_.strhash = strhash;

function snapTo(n, d) {
  var i = Math.round(n/d);
  return i*d;
}

_.snapTo = snapTo;

/**
 * Invert map of arrays: `{ string: [k1, k2...], ...}  to { k1: string, k2: string,...}`
 * @static
 */
function invertMulti(map, iteratee) {
  var res = {};
  if (typeof iteratee === 'string') {
    var field = iteratee;
    iteratee = function(v, k) { return _.get(v, field); };
  }
  _.each(map, function(v,k) {
    var els = iteratee? iteratee(v,k) : v;
    for (var i = 0; i < els.length; i++) {
      res[els[i]] = k;
    }
  });
  return res;
}

_.invertMulti = invertMulti;

/**
 * Group by array element.
 * @param collection
 * @param iteratee
 * @example
 * // returns { k1: [ {id: 1, ...}, ... ],
 * //           k2: [ {id: 1, ...}, ... ],
 * //           k3: [ {id: 2, ...}, ... ],
 * //           k4: [ {id: 2, ...}, ...],
 * //           ...}
 * groupByMulti([ { id: 1, a: [k1, k2...], ...}, { id: 2, a: [k3, k4],...},... ])
 * @static
 */
function groupByMulti(collection, iteratee) {
  var res = {};
  if (typeof iteratee === 'string') {
    var field = iteratee;
    iteratee = function(v, k) { return v[field]; };
  }
  _.each(collection, function(v,k) {
    var keys = iteratee(v,k);
    if (!Array.isArray(keys)) {
      keys = [keys];
    }
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (res[key]) {
        res[key].push(v);
      } else {
        res[key] = [v];
      }
    }
  });
  return res;
}

_.groupByMulti = groupByMulti;

/**
 * Count by array element.
 * @param collection
 * @param iteratee
 * @example
 * // returns { k1: c1 ],
 * //           k2: c2 ],
 * //           k3: c3 ],
 * //           k4: c4 ],
 * //           ...}
 * countByMulti([ { id: 1, a: [k1, k2...], ...}, { id: 2, a: [k3, k4],...},... ])
 * @static
 */
function countByMulti(collection, iteratee, aggrFn, countFn) {
  var res = {};
  if (typeof iteratee === 'string') {
    var field = iteratee;
    iteratee = function(v, k) { return v[field]; };
  }
  aggrFn = aggrFn || function(aggr, d) {
    //console.log('aggregating', aggr, d);
    if (aggr == undefined) { return d; }
    else { return d + aggr; }
  };
  countFn = countFn || function(v,k) { return 1; };
  _.each(collection, function(v,k) {
    var keys = iteratee(v,k);
    //console.log('processing', v, k, keys);
    if (!Array.isArray(keys)) {
      keys = [keys];
    }
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      res[key] = aggrFn(res[key], countFn(v,k));
    }
  });
  return res;
}

_.countByMulti = countByMulti;

/**
 * Sort array and returns sorted array along with sortedIndices indicating the indices of the original array
 * @static
 */
function sortWithIndices(toSort) {
  var result = [];
  for (var i = 0; i < toSort.length; i++) {
    result[i] = [toSort[i], i];
  }
  result.sort(function(left, right) {
    return (left[0] < right[0]) ? -1 : 1;
  });
  result.sortedIndices = [];
  for (var j = 0; j < toSort.length; j++) {
    result.sortedIndices.push(result[j][1]);
    result[j] = result[j][0];
  }
  return result;
}

_.sortWithIndices = sortWithIndices;

/**
 * Clamp value to between min and max
 * @param value {number} Value to clamp
 * @param min {number} Minimum value
 * @param max {number} Maximum value
 * @returns {number}
 * @static
 */
function clamp(value, min, max) {
  return Math.max( min, Math.min( max, value ) );
}

_.clamp = clamp;

function safeDivide(n, d, defaultValue) {
  if (d === 0) {
     return defaultValue;
  } else {
    return n/d;
  }
}

_.safeDivide = safeDivide;


function parseBoolean(string) {
  if (string) {
    string = string.toLowerCase().trim();
    return (string === 'true' || string === 'yes' || string === '1');
  } else {
    return false;
  }
}

_.parseBoolean = parseBoolean;

function parseList(string, delimiter) {
  delimiter = delimiter || ',';
  if (string) {
    var list = string.split(delimiter).map(function(x) { return x.trim(); });
    return list;
  }
}

_.parseList = parseList;

function parseVector(string, delimiter) {
  delimiter = delimiter || ',';
  if (string) {
    var list = string.split(delimiter).map(function(x) { return parseFloat(x.trim()); });
    return list;
  }
}

_.parseVector = parseVector;

_.cmd = {
  parseBoolean: function(x, accum) { return parseBoolean(x); },
  parseList: function(x, accum) { return parseList(x); },
  parseFloat: function(x, accum) { return parseFloat(x); },
  parseInt: function(x, accum) { return parseInt(x); },
  parseVector: function(x, accum) { return parseVector(x); },
  collect: function(x, accum) {
    accum.push(x);
    return accum;
  }
};

_.replaceVars = function (str, vars) {
  if (str && _.isString(str)) {
    for (var v in vars) {
      if (vars.hasOwnProperty(v)) {
        str = _.replaceAll(str, '${' + v + '}', vars[v]);
      }
    }
  }
  return str;
};

_.cloneDeepWithReplaceVars = function (obj, vars, opts) {
  if (opts && opts.optionalPrefix) {
    var extraVars = {};
    _.each(vars, function(v,k) {
      extraVars[k] = v;
      extraVars[opts.optionalPrefix + '.' + k] = v;
    });
    //console.log('extraVars', extraVars)
    vars = extraVars;
  }
  var cloned =  _.cloneDeepWith(obj, function (x) {
    if (_.isString(x)) { return _.replaceVars(x, vars); }
  });
  return cloned;
};

_.appendVarPrefix = function (str, name) {
  if (str && _.isString(str)) {
    str = str.replace(/\$\{([a-zA-Z_0-9]+)\}/g, '${' + name + '.$1}');
  }
  return str;
};

function findVars(obj, vars) {
  if (obj) {
    if (_.isString(obj)) {
      var matched = obj.match(/\$\{([a-zA-Z_0-9.]+)\}/g);
      if (matched) {
        for (var i = 0; i < matched.length; i++) {
          vars.add(matched[i]);
        }
      }
    } else if (_.isPlainObject(obj) || _.isArray(obj)) {
      _.each(obj, function(v,k) {
        findVars(v, vars);
      });
    }
  }
  return vars;
};

_.findVars = function (obj) {
  var vars = findVars(obj, new Set());
  var res = [];
  vars.forEach(function(v) {
    res.push(v.substring(2,v.length-1));
  });
  return res;
};

_.createDefaultVars = function (obj, prefix) {
  prefix = prefix || '';
  var vars = _.findVars(obj);
  var defaults = {};
  for (var i = 0; i < vars.length; i++) {
    var path = vars[i];
    _.set(defaults, path, '${' + prefix + path + '}');
  }
  return defaults;
};

// Interpolate lodash templates with values in vars
_.interpolate = function(obj, vars, options) {
  // Default options to template
  var defaultOptions = { imports: { '_': _ }, strict: false };
  options = _.defaults(Object.create(null), options || {}, defaultOptions);
  // Default variables
  var defaultVars = options.defaults || {};
  vars = _.defaults(Object.create(null), vars, defaultVars);
  // Clone and replace!
  var cloned =  _.cloneDeepWith(obj, function (value, key, parent, stack) {
    var root = stack? stack.get(obj) : {};
    var parentVars = stack? stack.get(parent) : {};
    if (_.isString(value) && (!options.isPossibleTemplate || options.isPossibleTemplate(value))) {
      var v = _.merge(vars, root);
      v = _.defaults(Object.create(null), parentVars, v);
      var t = _.template(value, options);
      //console.log('resolving template ', value, v);
      var r = t(v);
      if (options.inferType) {
        if (r === 'true') {
          return true;
        } else if (r === 'false') {
          return false;
        }
      }
      return r;
    }
  });
  return cloned;
};

_.splitPrefixId = function(prefixLength, separator, id) {
  var prefix = id.substr(0,prefixLength);
  var rest = id.substr(prefixLength);
  var path = '';
  for (var i = 0; i < prefix.length; i++) {
    path = path + prefix.charAt(i) + separator;
  }
  path = path + rest;
  return path;
};

_.getPrefix = function(prefixLength, separator, id) {
  var prefix = id.substr(0,prefixLength);
  var rest = id.substr(prefixLength);
  var path = '';
  for (var i = 0; i < prefix.length; i++) {
    path = path + prefix.charAt(i) + separator;
  }
  return path;
};

// Lodash product/permutation (https://gist.github.com/wassname/a882ac3981c8e18d2556)
/**
 * Lodash mixins for combinatorics
 * Inspired by python itertools: https://docs.python.org/2.7/library/itertools.html
 *
 * Usage:
 *   permutations([0,1,2],2)                 // [[0,1],[0,2],[1,0],[1,2],[2,0],[2,1]]
 *   combinations([0,1,2],2)                 // [[0,1],[0,2],[1,2]]
 *   combinations_with_replacement([0,1,2],2)// [[0,0],[0,1],[0,2],[1,1],[1,2],[2,2]]
 *   product([0,1,2],[0,1,2])                // [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2],[2,0],[2,1],[2,2]]
 *
 * Multiple input types:
 *   product('me','hi')
 *   product({who:['me','you'],say:['hi','by']})
 *   product(['me','you'],['hi','by'])
 *   product(['me','hi'])
 *   combinations([0,1,2,3],2)
 *   permutations([1,2,3],2)
 *   permutations('cat',2)
 */

/**
 * Generate all combination of arguments when given arrays or strings
 * e.g. [['Ben','Jade','Darren'],['Smith','Miller']] to [['Ben','Smith'],[..]]
 * e.g. 'the','cat' to [['t', 'c'],['t', 'a'], ...]
 * @private
 **/
function _cartesianProductOf(args) {
  if (arguments.length>1) args=_.toArray(arguments);

  // strings to arrays of letters
  args=_.map(args, function(opt) { return typeof opt==='string'?_.toArray(opt):opt; } );

  return _.reduce(args, function(a, b) {
    return _.flatten(_.map(a, function(x) {
      return _.map(b, function(y) {
        return _.concat(x,[y]);
      });
    }), true);
  }, [ [] ]);
}

/** Generate all combination of arguments from objects
 *  {Object} opts    - An object or arrays with keys describing options  {firstName:['Ben','Jade','Darren'],lastName:['Smith','Miller']}
 *  {Array}        - An array of objects e.g. [{firstName:'Ben',LastName:'Smith'},{..]
 * @private
 * @static
 **/
function _cartesianProductObj(optObj){
  var keys = _.keys(optObj);
  var opts = _.values(optObj);
  var combs = _cartesianProductOf(opts);
  return _.map(combs,function(comb){
    return _.zipObject(keys,comb);
  });
}

/**
 * Generate the cartesian product of input objects, arrays, or strings
 *
 * @example
 * product('me','hi')
 * // => [["m","h"],["m","i"],["e","h"],["e","i"]]
 *
 * @example
 * product([1,2,3],['a','b','c']
 * // => [[1,"a"],[1,"b"],[1,"c"],[2,"a"],[2,"b"],[2,"c"],[3,"a"],[3,"b"],[3,"c"]]
 *
 * @example
 * product({who:['me','you'],say:['hi','by']})
 * // => [{"who":"me","say":"hi"},{"who":"me","say":"by"},{"who":"you","say":"hi"},{"who":"you","say":"by"}]
 *
 * @example
 * // It also takes in a single array of args
 * product(['me','hi'])
 * // => [["m","h"],["m","i"],["e","h"],["e","i"]]
 * @static
 */
function product(opts){
  if (arguments.length===1 && !_.isArray(opts))
    return _cartesianProductObj(opts);
  else if (arguments.length===1)
    return _cartesianProductOf(opts);
  else
    return _cartesianProductOf(arguments);
}

/**
 * Generate permutations, in all possible orderings, with no repeat values
 *
 * @example
 * permutations([1,2,3],2)
 * // => [[1,2],[1,3],[2,1],[2,3],[3,1],[3,2]
 *
 * @example
 * permutations('cat',2)
 * // => [["c","a"],["c","t"],["a","c"],["a","t"],["t","c"],["t","a"]]
 * @static
 */
function permutations(obj, n){
  if (typeof obj=='string') obj = _.toArray(obj);
  n = n?n:obj.length;
  // make n copies of keys/indices
  for (var j = 0, nInds=[]; j < n; j++) {
    nInds.push(_.keys(obj));
  }
  // get product of the indices, then filter to remove the same key twice
  var arrangements = product(nInds).filter(function(pair) { return pair[0]!==pair[1]; });
  return _.map(arrangements, function(indices) { return _.map(indices, function(i) { return obj[i]; }); });
}



/**
 * Generate n combinations of an object with no repeat values in each combination.
 *
 * @example
 * combinations([0,1,2,3],2)
 * // => [[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]]
 * @static
 */
function combinations(obj,n){
  /* filter out keys out of order, e.g. [0,1] is ok but [1,0] isn't */
  function isSorted(arr) {
    return _.every(arr, function (value, index, array) {
      return index === 0 || String(array[index - 1]) <= String(value);
    });
  }
  // array with n copies of the keys of obj
  return _(permutations(_.keys(obj),n))
      .filter(isSorted)
      .map(function(indices) { return _.map(indices, function(i) { return obj[i]; }); })
      .value();
}

/**
 * Generate n combinations with repeat values.
 *
 * @example
 * combinations_with_replacement([0,1,2,3],2)
 * // => [[0,0],[0,1],[0,2],[0,3],[1,1],[1,2],[1,3],[2,2],[2,3],[3,3]]
 * @static
 */
function combinations_with_replacement(obj,n){
  if (typeof obj=='string') obj = _.toArray(obj);
  n = n?n:obj.length;
  // make n copies of keys/indices
  for (var j = 0, nInds=[]; j < n; j++) {nInds.push(_.keys(obj)); }
  // get product of the indices, then filter to keep elements in order
  var arrangements = product(nInds).filter(function(pair) { return pair[0] <= pair[1]; });
  return _.map(arrangements,function(indices) { return _.map(indices, function(i) { return obj[i]; }); });
}

_.combinations_with_replacement = combinations_with_replacement;
_.combinations = combinations;
_.product = product;
_.permutations = permutations;

_.dynamicCompare = function (property) {
  return function (a,b) {
    return (a[property] < b[property]) ? -1 : (a[property] > b[property]) ? 1 : 0;
  };
};

_.dynamicCompareMap = function (map, property) {
  return function (a,b) {
    return (map[a][property] < map[b][property]) ? -1 : (map[a][property] > map[b][property]) ? 1 : 0;
  };
};

// We could use underscore.string/replaceAll but unfortunately,
// it uses regular expressions so strings need to be escaped
//var replaceAll = require('underscore.string/replaceAll');
_.replaceAll = function (str, find, replacement){
  var u;
  while (true) {
    u = str.replace(find, replacement);
    if (u === str) return str;
    str = u;
  }
};

// Add to array unique
_.addUnique = function(array, element) {
  if (array.indexOf(element) < 0) {
    array.push(element);
  }
};

_.mapKeysDeep = function(object, iteratee) {
  iteratee = iteratee || _.identity;
  if (_.isPlainObject(object)) {
    var remapped = _.mapKeys(object, iteratee);
    remapped = _.mapValues(remapped, function (v) {
      return _.mapKeysDeep(v, iteratee);
    });
    return remapped;
  } else {
    return object;
  }
};

// Put back aliases that were removed in lodash 4
// (https://github.com/lodash/lodash/wiki/Changelog#notable-changes)
// These are useful for modules using older version of underscore/lodash
// Notably visualsearch
_.all = _.every;
_.any = _.some;
_.backflow = _.flowRight;
_.callback = _.iteratee;
_.collect = _.map;
_.compose = _.flowRight;
_.contains = _.includes;
_.detect = _.find;
_.foldl = _.reduce;
_.foldr = _.reduceRight;
_.include = _.includes;
_.inject = _.reduce;
_.methods = _.functions;
//_.object = _.fromPairs or _.zipObject
//_#run = _#value;
_.select = _.filter;
_.unique = _.uniq;

//console.log(_());
module.exports = _;
