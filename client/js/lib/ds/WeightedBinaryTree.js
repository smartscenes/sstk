var BinaryTree = require('ds/BinaryTree');

/**
 * A weighted binary tree (not ordered)
 *
 * @author Angel Chang
 * @constructor
 * @memberOf ds
 */
function WeightedBinaryTree(opts) {
  BinaryTree.call(this, opts);
}

WeightedBinaryTree.prototype.createTreeNode = function(opts) {
  return new WeightedBinaryTree.TreeNode(opts);
};

WeightedBinaryTree.TreeNode = function(opts) {
  BinaryTree.TreeNode.call(this, opts);
  this.totalWeight = opts.totalWeight || 0;
};
WeightedBinaryTree.TreeNode.prototype = Object.create(BinaryTree.TreeNode.prototype);
WeightedBinaryTree.TreeNode.prototype.constructor = WeightedBinaryTree.TreeNode;

WeightedBinaryTree.TreeNode.prototype.clear = function() {
  BinaryTree.TreeNode.clear.call(this);
  this.totalWeight = 0;
};

WeightedBinaryTree.TreeNode.prototype.onValueAdded = function(target) {
  BinaryTree.TreeNode.onValueAdded.call(this, target);
  this.totalWeight = this.totalWeight + target.weight;
};

WeightedBinaryTree.TreeNode.prototype.onValueRemoved = function(target) {
  BinaryTree.TreeNode.onValueRemoved.call(this, target);
  this.totalWeight = this.totalWeight - target.weight;
};

WeightedBinaryTree.TreeNode.prototype.onCopyFrom = function(n) {
  BinaryTree.TreeNode.onCopyFrom.call(this, n);
  this.totalWeight = n.totalWeight;
};

WeightedBinaryTree.TreeNode.prototype.onChildrenChanged = function() {
  BinaryTree.TreeNode.onChildrenChanged.call(this);
  this.update();
};

WeightedBinaryTree.TreeNode.prototype.update = function() {
  var leftWeight = this.left? this.left.totalWeight:0.0;
  var rightWeight = this.right? this.right.totalWeight:0.0;
  this.totalWeight = leftWeight + this.value.weight + rightWeight;
};

WeightedBinaryTree.TreeNode.prototype.check = function() {
  BinaryTree.TreeNode.check.call(this);
  if (this.value != null) {
    var leftWeight = this.left? this.left.totalWeight:0.0;
    var rightWeight = this.right? this.right.totalWeight:0.0;
    var expectedTotal = leftWeight + rightWeight + this.value.weight;
    if (Math.abs((expectedTotal - this.totalWeight)/this.totalWeight) > 0.0001 ) {
      throw 'Total weight is not right';
    }
  } else {
    if (this.totalWeight !== 0.0) {
      throw 'Total weight is non zero';
    }
  }
};

// Sampling
function sampleNode(node, rng) {
  var n = node;
  while (n && !n.isEmpty()) {
    var v = rng.random() * n.totalWeight;
    var leftWeight = n.left ? n.left.totalWeight : 0.0;
    var rightWeight = n.right ? n.right.totalWeight : 0.0;
    if (v < leftWeight) {
      n = n.getLeft();
    } else if (v < leftWeight + n.value.weight) {
      return n;
    } else {
      n = n.getRight();
    }
  }
}

WeightedBinaryTree.TreeNode.prototype.sampleNode = function(rng) {
  return sampleNode(this.root, rng);
};

WeightedBinaryTree.TreeNode.prototype.sample = function(rng) {
  var sampled = this.sampleNode(this.root, rng);
  if (sampled) { return sampled.value; }
};

WeightedBinaryTree.prototype.add = function(value, weight) {
  return BinaryTree.prototype.add.call(this, { value: value, weight: weight });
};

WeightedBinaryTree.prototype.sample = function(rng) {
  return this.root? this.root.sample(rng) : undefined;
};

WeightedBinaryTree.prototype.sampleNode = function(rng) {
  return this.root? this.root.sampleNode(rng) : undefined;
};

module.exports = WeightedBinaryTree;
