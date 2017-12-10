var BinaryHeap = require('ds/BinaryHeap');

/**
 * Binary heap that is bounded in size.
 * Note: The binary heap has as the head the element with the lowest score (based on ordering)
 *       We only compare against the head, and so end up keeping the elements with the highest scores.
 * To get values out in lowest order to highest (use getSorted)
 *
 * This is a bit weird - really should use a MinMaxHeap (heap that is easy to get both min and max)
 * To keep lowest actual scores s: use scoreFunc = -s
 *                                 this will keep k highest -s (so lowest s)
 *                                 and then use getSorted.reverse to get k ordered from lowest to highest
 * @constructor
 * @memberOf ds
 */
function BoundedBinaryHeap(options) {
  BinaryHeap.call(this, options);
  this.maxSize = options.maxSize;
}

BoundedBinaryHeap.prototype = Object.create(BinaryHeap.prototype);
BoundedBinaryHeap.prototype.constructor = BoundedBinaryHeap;

Object.defineProperty(BoundedBinaryHeap.prototype, 'isFull', {
  get: function () { return this.values.length >= this.maxSize; }
});

BoundedBinaryHeap.prototype.clone = function() {
  var b = new BoundedBinaryHeap({ scoreFunc: this.scoreFunc, maxSize: this.maxSize });
  b.values = b.values.concat(this.values);
  return b;
};

BoundedBinaryHeap.prototype.__push = function(element) {
  if (this.values.length >= this.maxSize) {
    // keep maxSize highest scores...
    // compare against element with lowest priority, if we are higher add ourselves
    var head = this.peek();
    if (this.scoreFunc(element) > this.scoreFunc(head)) {
      this.pop();
      BinaryHeap.prototype.__push.call(this, element);
    }
  } else {
    BinaryHeap.prototype.__push.call(this, element);
  }
};

module.exports = BoundedBinaryHeap;
