var RNG = require('math/RNG');
var BoundedBinaryHeap = require('ds/BoundedBinaryHeap');
var WeightedBinaryTree = require('ds/WeightedBinaryTree');
var _ = require('util');

/**
 * Sampler
 * @param opts.rng Random number generator
 * @constructor
 * @memberOf math
 */
function Sampler(opts) {
  opts = opts || {};
  this.rng = opts.rng || RNG.global;
}

/**
 * Super duper sampling function
 * @param [opts.elements] {Array<*>} Array of elements to sample from
 * @param [opts.nsamples=1] {int} Number of samples to take
 * @param [opts.withReplacement=false] {boolean} Whether sampling will be with or without replacement
 * @param [opts.scorer] {function(*): number} Weight to give an element
 * @returns {Array<*>|*} Array of samples if `opts.nsamples` is specified or single sample if `opts.nsamples` is not specified
 */
Sampler.prototype.sample = function(opts) {
  var isArray = _.isArray(opts.elements);
  if (opts.nsamples) {
    // Batch sampling
    if (opts.withReplacement) {
      if (opts.scorer) { //weighted
        return this.__sampleWeightedWithReplacement({});
      } else {
        return this.__sampleWithReplacement(opts.elements, opts.nsamples);
      }
    } else {
      if (opts.scorer) { //weighted
        if (isArray) {
          return this.__sampleWeightedWithoutReplacementWithTree(opts.elements, opts.nsamples, opts.scorer);
        } else {
          return this.__sampleWeightedStreamWithoutReplacement(opts.elements, opts.nsamples, opts.scorer);
        }
      } else {
        if (isArray) {
          return this.__sampleWithoutReplacement(opts.elements, opts.nsamples);
        } else {
          return this.__sampleStreamWithoutReplacement(opts.elements, opts.nsamples);
        }
      }
    }
  } else {
    // Sample single
    if (opts.scorer) { //weighted
      if (isArray) {
        return this.__sampleOneWeighted(opts.elements);
      } else {
        return this.__sampleOneWeightedStream(opts.elements, opts.scorer);
      }
    } else {
      if (isArray) {
        return this.__sampleOne(opts.elements);
      } else {
        return this.__sampleOneStream(opts.elements);
      }
    }
  }
};

/* Sample one */

Sampler.prototype.__sampleOne = function(samples) {
  if (samples.length > 0) {
    return this.rng.choice(samples);
  }
};

Sampler.prototype.__sampleOneWeighted = function(samples, scorer) {
  var sampled = this.__sampleWeightedWithReplacement(samples, 1, scorer);
  if (sampled.length > 0) {
    return sampled[0];
  }
};

Sampler.prototype.__sampleOneStream = function(stream) {
  var sampled = this.__sampleStreamWithoutReplacement(stream, 1);
  if (sampled.length > 0) {
    return sampled[0];
  }
};

Sampler.prototype.__sampleOneWeightedStream = function(stream, scorer) {
  var sampled = this.__sampleWeightedStreamWithoutReplacement(stream, 1, scorer);
  if (sampled.length > 0) {
    return sampled[0];
  }
};

/* sample batch */

Sampler.prototype.__sampleIndices = function(sampleSize, totalSize, shuffle) {
  var samples = [];
  if (sampleSize >= totalSize) {
    samples = _.range(0, totalSize);
  } else {
    var t = 0;  // # of total processed
    var m = 0;  // # of samples selected
    while (m < sampleSize && t < totalSize) {
      var r = this.rng.random();
      if ((totalSize - t)*r < sampleSize - m) {
        samples[m] = t;
        m = m+1;
      }
      t = t+1;
    }
  }
  if (shuffle) { this.rng.shuffle(samples, true); }
  return samples;
};

Sampler.prototype.__sampleWithoutReplacement = function(allSamples, nsamples) {
  if (nsamples < 10 || nsamples < allSamples.length/2) {
    var indices = this.__sampleIndices(nsamples, allSamples.length, true);
    return indices.map( function(i) { return allSamples[i]; });
  } else {
    var permutedList = this.rng.shuffle(allSamples);
    return permutedList.slice(0, nsamples);
  }
};

Sampler.prototype.__sampleWithReplacement = function(allSamples, nsamples) {
  var samples = [];
  for (var i = 0; i < nsamples; i++) {
    samples.push(this.rng.choice(allSamples));
  }
};

Sampler.prototype.__sampleWeightedWithReplacement = function(allSamples, nsamples, scorer) {
  var totalWeight = 0;
  var cumulativeWeights = [];
  for (var i = 0; i < allSamples.length; i++) {
    var weight = scorer(allSamples[i]);
    totalWeight += weight;
    cumulativeWeights.push(totalWeight);
  }
  var samples = [];
  for (var i = 0; i < nsamples; i++) {
    var r = this.rng.random() * totalWeight;
    var index = _.sortedIndex(cumulativeWeights, r);
    samples.push({ value: allSamples[index], weight: scorer(allSamples[index]) });
  }
  return samples;
};


Sampler.prototype.__sampleWeightedWithReplacementWithTree = function(allSamples, nsamples, scorer) {
  var weightedTree = new WeightedBinaryTree();
  for (var i = 0; i < allSamples.length; i++) {
    var s = allSamples[i];
    weightedTree.add(s, scorer[s]);
  }

  var samples = [];
  for (var i = 0; i < nsamples; i++) {
    samples.push(weightedTree.sample(this.__rng));
  }
  return samples;
};

Sampler.prototype.__sampleWeightedWithoutReplacementWithTree = function(allSamples, nsamples, scorer) {
  var WeightedBinaryTree = require('ds/WeightedBinaryTree');
  var weightedTree = new WeightedBinaryTree();
  for (var i = 0; i < allSamples.length; i++) {
    var s = allSamples[i];
    weightedTree.add(s, scorer[s]);
  }

  var samples = [];
  for (var i = 0; i < nsamples; i++) {
    samples.push(weightedTree.sample(this.__rng));
  }
  return samples;
};

/**
 * Samples a stream uniformly (potential very large) without replacement with one pass), there is no weighting of entries.
 * Samples are stored and assumed to be relatively small with respect to the number of entries in the stream
 * @param stream {{next: function(): {value: *, done: boolean}}} stream/iterator generating weighted samples
 * @param nsamples {int} number of samples to draw
 * @return {Array<*>} Array of samples
 * @private
 */
Sampler.prototype.__sampleStreamWithoutReplacement = function(stream, nsamples) {
  var selected = [];
  var n = 0;
  var next = stream.next();
  while (next && !next.done) {
    var sample = next.value;
    n = n + 1;
    if (selected.length >= nsamples) {
      var i = this.rng.randInt(0, n);
      if (i < nsamples) {
        selected[i] = sample;
      }

    } else {
      selected.push(sample);
    }
    next = stream.next();
  }
  return selected;
};


/**
 * Samples a weighted stream uniformly (potential very large) without replacement with one pass)
 * Samples are stored and assumed to be relatively small with respect to the number of entries in the stream
 * @param stream {{next: function(): {value: *, done: boolean}}} stream/iterator generating weighted samples
 * @param nsamples {int} number of samples to draw
 * @param scorer {function(Object): number} Function returning weight (positive) for sample
 * @return {Array<*>} Array of samples
 * @private
 */
Sampler.prototype.__sampleWeightedStreamWithoutReplacement = function(stream, nsamples, scorer) {
  // weighted random sampling with a reservoir (http://utopia.duth.gr/~pefraimi/research/data/2007EncOfAlg.pdf)
  var selected = new BoundedBinaryHeap({maxSize: nsamples, scoreFunc: function(x) { return x.priority; } });
  var n = 0;
  var next = stream.next();
  while (next && !next.done) {
    var sample = next.value;
    n = n + 1;
    var weight = scorer(sample);
    if (weight > 0) {
      var r = this.rng.random();
      // In the original algorithm the key is r ^ (1.0/weight) (here we use the log of this since it is only used for comparison)
      var k = 1.0 / weight * Math.log(r);  // priority in queue (represents chance of being replaced)
      if (selected.size() >= nsamples) {
        var peek = selected.peek();
        var swap = k > peek.priority;
        if (k === peek.priority) {
          swap = this.rng.random() > 0.5;
        }
        if (swap) {
          selected.pop();
          selected.add({ priority: k, value: sample, weight: weight });
        }
      } else {
        selected.add({ priority: k, value: sample, weight: weight });
      }
    } else if (selected.size() === 0) {
      // What's up with these negative weights (bad, but we can take one)
      selected.add({ priority: -Infinity, value: sample, weight: weight});
    }
    next = stream.next();
  }
  return selected.getSorted(function(x) { return _.omit(x, 'priority'); });
};

module.exports = Sampler;

