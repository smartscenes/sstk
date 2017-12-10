'use strict';

/**
 * A min heap (set scoreFunc to negative to turn into max heap)
 * @param options
 * @constructor
 * @memberOf ds
 */
function BinaryHeap(options){
  if (typeof(options) === 'function') {
    options = { scoreFunc: options };
  } else {
    options = options || {};
  }
  this.values = [];
  this.scoreFunc = options.scoreFunc || function (x) { return x; };
}
BinaryHeap.prototype.constructor = BinaryHeap;

BinaryHeap.prototype.clone = function() {
  var b = new BinaryHeap({ scoreFunc: this.scoreFunc });
  b.values = b.values.concat(this.values);
  return b;
};

BinaryHeap.prototype.push = function(element) {
  for (var i = 0; i < arguments.length; i++) {
    this.__push(arguments[i]);
  }
};

BinaryHeap.prototype.add = function(element) {
  for (var i = 0; i < arguments.length; i++) {
    this.__push(arguments[i]);
  }
};

BinaryHeap.prototype.__push = function(element) {
  this.values.push(element);
  this.bubbleUp(this.values.length - 1);
};

BinaryHeap.prototype.pop = function() {
  var result = this.values[0];
  var end = this.values.pop();
  if (this.values.length > 0) {
    this.values[0] = end;
    this.sinkDown(0);
  }
  return result;
};

// Returns elements in sorted order
BinaryHeap.prototype.getSorted = function(convertFn) {
 var sorted = [];
 var b = this.clone();
 while (b.size() > 0) {
   if (convertFn) {
     sorted.push(convertFn(b.pop()));
   } else {
     sorted.push(b.pop());
   }
 }
 return sorted;
};

BinaryHeap.prototype.peek = function() {
  return this.values[0];
};

BinaryHeap.prototype.remove = function(node) {
  var length = this.values.length;
  for (var i = 0; i < length; i++) {
    if (this.values[i] != node) { continue; }
    var end = this.values.pop();
    if (i == length - 1) { break; }
    this.values[i] = end;
    this.bubbleUp(i);
    this.sinkDown(i);
    break;
  }
};

BinaryHeap.prototype.size = function() {
  return this.values.length;
};

BinaryHeap.prototype.bubbleUp = function(n) {
  var element = this.values[n];
  var score = this.scoreFunc(element);
  while (n > 0) {
    var parentN = Math.floor((n + 1) / 2) - 1;
    var parent = this.values[parentN];
    if (score >= this.scoreFunc(parent)) { break; }
    this.values[parentN] = element;
    this.values[n] = parent;
    n = parentN;
  }
};

BinaryHeap.prototype.sinkDown = function(n) {
  var length = this.values.length;
  var element = this.values[n];
  var elemScore = this.scoreFunc(element);

  while(true) {
    var child2N = (n + 1) * 2, child1N = child2N - 1;
    var swap = null;
    var child1Score = null;
    if (child1N < length) {
      var child1 = this.values[child1N];
      child1Score = this.scoreFunc(child1);
      if (child1Score < elemScore) {
        swap = child1N;
      }
    }
    if (child2N < length) {
      var child2 = this.values[child2N];
      var child2Score = this.scoreFunc(child2);
      if (child2Score < (swap == null ? elemScore : child1Score)) {
        swap = child2N;
      }
    }

    if (swap == null) { break; }

    this.values[n] = this.values[swap];
    this.values[swap] = element;
    n = swap;
  }
};

module.exports = BinaryHeap;
