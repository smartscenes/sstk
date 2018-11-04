var async = require('async');
var Counter = require('ds/Counter');
var RNG = require('math/RNG');
var _ = require('util/util');

function IndexedCounters(opts) {
  this.name = opts.name;
  this.filename = opts.filename || opts.name;
  this.indices = opts.indices;
  if (opts.fieldnames) {
    this.fieldnames = _.map(this.indices, function(x,i) {
      var name = (opts.fieldnames[i] != undefined)? opts.fieldnames[i] : x.name;
      return name;
    });
  } else {
    this.fieldnames = _.map(this.indices, function(x) { return x.name; });
  }
  this.counters = {};   // TODO: Consider changing to be NestedCounter
  this.depth = this.indices.length;
}

IndexedCounters.prototype.sample = function(keys, opts) {
  opts = opts || {};
  var rng = opts.rng || RNG.global;
  var isIndexedKeys = opts.isIndexedKeys;
  var c = this.get(keys, isIndexedKeys);
  if (c) {
    var sampled = [];
    while (c && !(c instanceof Counter)) {
      var ckeys = _.keys(c);
      // TODO: Sampling here should be on aggregated weights (NOT uniform)
      var i = rng.random() * ckeys.length;
      var k = ckeys[i];
      if (isIndexedKeys) {
        sampled.push(k);
      } else {
        // Convert to meaningful values
        var v = this.indices[keys.length + sampled.length].get(k);
        sampled.push(v);
      }
      c = c[k];
    }
    if (c) {
      var s = c.sample(opts);
      if (isIndexedKeys) {
        sampled.push(s);
      } else {
        // Convert to meaningful values
        var v = this.indices[keys.length + sampled.length].get(s);
        sampled.push(v);
      }
    }
    return sampled;
  }
};

IndexedCounters.prototype.get = function(keys, isIndexedKeys) {
  var c = this.counters;
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var k = (this.indices && !isIndexedKeys)? this.indices[i].indexOf(key, true) : key;
    if (i === keys.length - 1) {
      return (c instanceof Counter)? c.get(k) : c[k];
    } else {
      c = c[k];
    }
  }
  return c;
};

IndexedCounters.prototype.filter = function(filter) {
  var indices = this.indices;
  function __filter(src, dest, keys) {
    if (src instanceof Counter) {
      var counter = src.filter(function(c,k) {
        return filter(c, _.concat(keys, [k]), indices);
      });
      //return (counter.size > 0)? counter : null;
      return counter;
    } else {
      _.each(src, function (c, k) {
        var ks = _.concat(keys, [k]);
        dest[k] = __filter(c, {}, ks);
      });
      return dest;
    }
  }
  var copy = new IndexedCounters({ indices: indices });
  __filter(this.counters, copy.counters, []);
  return copy;
};

IndexedCounters.prototype.add = function(keys, count, isIndexedKeys) {
  var c = this.counters;
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var k = (this.indices && !isIndexedKeys)? this.indices[i].indexOf(key, true) : key;
    if (i === keys.length - 1) {
      c.add(k, count);
    } else {
      if (i < keys.length - 2) {
        c[k] = c[k] || {};
      } else {
        c[k] = c[k] || new Counter();
      }
      c = c[k];
    }
  }
};

IndexedCounters.prototype.clear = function() {
  this.counters = {};
};

IndexedCounters.prototype.importCsv = function(opts) {
  var fs = opts.fs;
  var filename = opts.filename;
  var callback = opts.callback;

  var scope = this;
  fs.readAsync(filename, 'utf-8', function(err, data) {
    if (data) {
      scope.parse(data, opts);
    }
    callback(err, scope);
  });
};

IndexedCounters.prototype.parse = function(data, opts) {
  opts = opts || {};
  var useSavedIndex = opts.useSavedIndex;
  this.clear();
  var IOUtil = require('io/IOUtil');
  var parsed = IOUtil.parseDelimited(data, { header: true, skipEmptyLines: true, dynamicTyping: true });
  var keyFields = _.map(this.fieldnames, function(x) { return useSavedIndex? x + '_index':x; });
  for (var i = 0; i < parsed.data.length; i++) {
    var d = parsed.data[i];
    var keys = _.map(keyFields, function(f) { return d[f]; });
    this.add(keys, d.count, useSavedIndex);
  }
};

IndexedCounters.prototype.exportCsv = function(opts) {
  var fs = opts.fs;
  var outfilename = opts.filename;
  var callback = opts.callback;

  var scope = this;
  var header = _.flatMap(this.fieldnames, function(x) { return [x, x + '_index']; });
  header.push('count');

  function exportCounts(c, i, values, cb) {
    var index = scope.indices[i];
    if (c instanceof Counter) {
      var output = _.map(c.getCounts(), function(count,k) {
        var label = index.get(k);
        var row = _.concat(values, [label, k, count]);
        return row.map(function(x) { return _.escapeCsv(x); }).join(',');
      }).join('\n') + '\n';
      fs.fsAppendToFile(outfilename, output, function() {
        setTimeout(function() { cb(null, null); }, 0);
      }, function(err) {
        setTimeout(function() { cb(err, null); }, 0);
      });
    } else {
      async.forEachOfSeries(c, function(value, k, cb2) {
        var label = index.get(k);
        exportCounts(c[k], i+1, _.concat(values, [label, k]), cb2);
      }, function(err, results) {
        setTimeout(function() { cb(err, null); }, 0);
      });
    }
  }

  var labelsStr = header.map(function(x) { return _.escapeCsv(x); }).join(',') + '\n';
  var scope = this;
  fs.fsWriteToFile(outfilename, labelsStr, function() {
    exportCounts(scope.counters, 0, [], function() {
      fs.fsExportFile(outfilename, outfilename);
      console.log('Exported indexed counts to ' + outfilename);
      callback(null, null);
    });
  }, function(err) {
    console.warn('Error exporting indexed counts to ' + outfilename + ': ', err);
    callback(err, null);
  });
};

module.exports = IndexedCounters;