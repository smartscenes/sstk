var WELL = require('well-rng');

var DEFAULT_SEED = [-73145273,-575333020,78223421,-75649942,97283626,1974487898,-1644093459,201800120,-2115906659,165918927,-351927079,-1995780997,-1821837288,-1884378861,502825323,1124314248,206222802,1973999199,-1212521702,619760979,-7423385,451025801,-1638878953,-535113523,-781706019,1903931134,-1075061703,-2020616308,1211246856,1483958096,2082487863,-1455167716];

/**
 * Random number generator that can be seeded
 * @param params
 * @constructor
 * @memberOf math
 */
function RNG(params) {
  params = params || {};
  var generator = params.generator || 'well-1024a';
  if (generator === 'well-1024a') {
    this.__rng = new WELL();
  } else {
    console.error('Unrecognized RNG type: ' + generator);
  }
  if (params.overrideMathRandom) {
    Math.random = this.__rng.random.bind(this.__rng);
  }
}

RNG.global = new RNG();

RNG.prototype.seed = function (s) {
  s = 0 | s;
  var state = new Array(32);
  for (var i = 0; i < 32; ++i) {
    state[i] = 0 | (DEFAULT_SEED[i] + s);
  }
  this.__rng.set_state(state);
};

RNG.prototype.random = function () {
  return this.__rng.random();
};

RNG.prototype.randInt = function (min, max) {
  return this.__rng.randInt(min, max);
};

RNG.prototype.randBits = function (bits) {
  return this.__rng.randBits(bits);
};

/**
 * Returns float point number in [min, max]
 * @param min {number}
 * @param max {number}
 * @returns {number}
 */
RNG.prototype.uniform = function (min, max) {
  return min + (this.random() * (max - min));
};

// Return a random number sampled from the mean of n random variables drawn from the uniform distribution from 0 to 1
// This is Bates distribution (https://en.wikipedia.org/wiki/Bates_distribution) and the final sample will be between 0-1
RNG.prototype.bates = function(n) {
  let r = 0;
  for (let i = 0; i < n; i++) {
    r += this.random();
  }
  return r / n;
};

/**
 * Returns element of arr chosen uniformly at random
 * @param arr
 * @returns {*}
 */
RNG.prototype.choice = function (arr) {
  return arr[this.randInt(0, arr.length - 1)];
};

/**
 * Return k unique elements from array
 * @param array
 * @param k
 */
RNG.prototype.sample = function (array, k) {
  var arr = array.slice();
  var j, tmp, ln = arr.length;
  for (var i = ln - 1; i > (ln - k - 1); i--) {
    j = this.randInt(0, i + 1);
    tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr.slice(ln - k);
};

/**
 * Shuffles the array
 * @param array
 * @param inplace
 * @returns {*}
 */
RNG.prototype.shuffle = function(array, inplace) {
  const length = array == null ? 0 : array.length;
  if (!length) {
    return [];
  }
  var index = -1;
  var lastIndex = length - 1;
  var result = inplace? array : array.slice();
  while (++index < length) {
    const rand = index + Math.floor(this.random() * (lastIndex - index + 1));
    const value = result[rand];
    result[rand] = result[index];
    result[index] = value;
  }
  return result;
};

module.exports = RNG;