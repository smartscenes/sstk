// A structure that accumulates counts
var RNG = require('math/RNG');
var _ = require('util/util');

function Counter(opts) {
  opts = opts || {};
  this.__defaultCount = opts.defaultCount || 0;
  if (opts.id) {
    if (_.isFunction(opts.id)) {
      this.__idFn = opts.id;
    } else if (_.isString(opts.id)) {
      this.__idFn = function(x) { return x[opts.id]; };
    } else {
      throw new TypeError('Unsupported id field: ' + opts.id);
    }
  } else {
    this.__idFn = function(x) { return x; };
  }
  this.clear();
}

Object.defineProperty(Counter.prototype, 'sum', {
  get: function () {
    if (this.__sum == undefined) {
      this.__sum = _.sum(_.values(this.__counts));
    }
    return this.__sum;
  }
});

Counter.prototype.clear = function() {
  this.__counts = {};
  this.__sum = undefined;
};

Counter.prototype.size = function() {
  return _.size(this.__counts);
};

Counter.prototype.set = function(obj, count) {
  var id = this.__idFn(obj);
  if (this.__sum != undefined) {
    this.__sum += (count - (this.__counts[id] || 0));
  }
  this.__counts[id] = count;
};

Counter.prototype.get = function(obj) {
  var id = this.__idFn(obj);
  return this.__counts[id] || this.__defaultCount;
};

Counter.prototype.getCounts = function() {
  return this.__counts;
};

Counter.prototype.getSorted = function() {
  var counts = _.map(this.__counts, (v,k) => { return { id: k, count: v }; });
  return _.sortBy(counts, (c) => { return -c.count; });
};

Counter.prototype.getMax = function() {
  return _.reduce(this.__counts, (result, v, k) => {
    if (result) {
      if (v > result.count) {
        return { id: k, count: v };
      } else {
        return result;
      }
    } else {
      return { id: k, count: v };
    }
  }, undefined);
};

Counter.prototype.add = function(obj, count) {
  count = count || 1;
  var id = this.__idFn(obj);
  this.__counts[id] = (this.__counts[id] || this.__defaultCount) + count;
  if (this.__sum != undefined) {
    this.__sum += count;
  }
};

Counter.prototype.update = function(counts) {
  if (Array.isArray(counts)) {
    for (var i = 0; i < counts.length; i++) {
      this.add(counts[i], 1);
    }
  } else {
    var scope = this;
    _.forEach(counts, function(v,k) {
      scope.add(k, v);
    });
  }
};

Counter.prototype.sample = function(opts) {
  opts = opts || {};
  var cumulativeWeights = [];
  var keys = [];
  var total = this.__defaultCount;
  var counts = this.__counts;
  _.each(counts, function(count, key) {
    if (!opts.filter || opts.filter(key)) {
      total += count;
      cumulativeWeights.push(total);
      keys.push(key);
    }
  });

  // pick random weighted
  var rng = opts.rng || RNG.global;
  var r = rng.random() * total;
  var index = _.sortedIndex(cumulativeWeights, r);
  //console.log('sample ' + keys[index] + ' with count ' + this.__counts[keys[index]]);
  return keys[index];
};

Counter.prototype.filterCounts = function(filter) {
  this.__counts = _.pickBy(this.__counts, filter);
  this.__sum = undefined;
};

Counter.prototype.filter = function(filter) {
  var c = new Counter();
  c.copy(this, filter);
  return c;
};

Counter.prototype.clone = function() {
  var c = new Counter();
  c.copy(this);
  return c;
};

Counter.prototype.copy = function(counter, filter) {
  this.__idFn = counter.__idFn;
  this.__defaultCount = counter.__defaultCount;
  if (filter) {
    this.__counts = _.pickBy(counter.__counts, filter);
    this.__sum = undefined;
  } else {
    this.__counts = _.clone(counter.__counts);
    this.__sum = counter.__sum;
  }
};

module.exports = Counter;