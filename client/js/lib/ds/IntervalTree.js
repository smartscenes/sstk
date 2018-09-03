var BinaryTree = require('ds/BinaryTree');
var Interval = require('ds/Interval');

/**
 * An interval tree maintains a tree so that all intervals to the left start
 * before current interval and all intervals to the right start after.
 *
 * @author Angel Chang
 * @constructor
 * @memberOf ds
 */
function IntervalTree(opts) {
  opts = opts || {};
  opts.compare = function(a,b) {
    return a.getInterval().compareInterval(b.getInterval());
  };
  BinaryTree.call(this, opts);
}

IntervalTree.prototype = Object.create(BinaryTree.prototype);
IntervalTree.prototype.constructor = IntervalTree;

IntervalTree.prototype.createTreeNode = function(opts) {
  return new IntervalTree.TreeNode(opts);
};

IntervalTree.TreeNode = function(opts) {
  BinaryTree.TreeNode.call(this, opts);
  this.maxEnd = opts.maxEnd;
};
IntervalTree.TreeNode.prototype = Object.create(BinaryTree.TreeNode.prototype);
IntervalTree.TreeNode.prototype.constructor = IntervalTree.TreeNode;

IntervalTree.TreeNode.prototype.clear = function() {
  BinaryTree.TreeNode.clear.call(this);
  this.maxEnd = null;
};

IntervalTree.TreeNode.prototype.onValueAdded = function(target) {
  var tinterval = target.getInterval();
  this.maxEnd = tinterval.end;
  this.maxEnd = Interval.max(this.maxEnd, tinterval.end, tinterval.compare);
};

IntervalTree.TreeNode.prototype.onValueRemoved = function(target) {
  var tinterval = target.getInterval();
  this.maxEnd = Interval.max(this.left.maxEnd, this.right.maxEnd, tinterval.compare);
};

IntervalTree.TreeNode.prototype.onCopyFrom = function(n) {
  this.maxEnd = n.maxEnd;
};

IntervalTree.TreeNode.prototype.search = function(targetInterval, searchFn) {
  var todo = [];
  todo.push(this);

  while (!(todo.length > 0)) {
    var n = todo.pop();
    // Don't search nodes that don't exist
    if (!n || n.isEmpty) continue;

    // If target is to the right of the rightmost point of any interval
    // in this node and all targetInterval, there won't be any matches.
    if (targetInterval.compare(targetInterval.begin, n.maxEnd) > 0)
      continue;

    // Check this node
    if (searchFn(n)) {
      return true;
    }

    // Search left children
    if (n.left) {
      todo.push(n.left);
    }

    // If target is to the left of the start of this interval,
    // then it can't be in any child to the right.
    if (targetInterval.compare(targetInterval.end, n.value.getInterval().begin) < 0)  {
      continue;
    }

    if (n.right)  {
      todo.push(n.right);
    }
  }
  return false;
};

IntervalTree.TreeNode.prototype.getMatching = function(targetInterval, result, searchFn) {
  result = result || [];
  var todo = [];
  todo.push(this);
  while (todo.length > 0) {
    var n = todo.shift();
    // Don't search nodes that don't exist
    if (!n || n.isEmpty)
      continue;

    // If target is to the right of the rightmost point of any interval
    // in this node and all children, there won't be any matches.
    if (targetInterval.compare(targetInterval.begin, n.maxEnd) > 0)
      continue;

    // Search left children
    if (n.left) {
      todo.push(n.left);
    }

    // Check this node
    if (searchFn(n)) {
      result.push(n.value);
    }

    // If target is to the left of the start of this interval,
    // then it can't be in any child to the right.
    if (targetInterval.compare(targetInterval.end, n.value.getInterval().begin) < 0)  {
      continue;
    }

    // Otherwise, search right children
    if (n.right)  {
      todo.push(n.right);
    }
  }
  return result;
};

IntervalTree.TreeNode.prototype.overlaps = function(targetInterval) {
  this.search(targetInterval, function(n) {
    return n.value.getInterval().overlaps(targetInterval);
  });
};

IntervalTree.TreeNode.prototype.getOverlapping = function(targetInterval, result) {
  return this.getMatching(targetInterval, result, function(n) {
    return n.value.getInterval().overlaps(targetInterval);
  });
};

IntervalTree.TreeNode.prototype.containsInterval = function(targetInterval, exact) {
  if (exact) {
    return this.search(targetInterval, function(n) {
      return n.value.getInterval().equals(targetInterval);
    });
  } else {
    return this.search(targetInterval, function(n) {
      return n.value.getInterval().contains(targetInterval);
    });
  }
};


IntervalTree.prototype.addNonOverlapping = function(target) {
  if (this.overlapsInterval(target.getInterval())) return false;
  this.add(target);
  return true;
};

IntervalTree.prototype.addNonNested = function(target) {
  if (this.containsInterval(target, false)) return false;
  this.add(target);
  return true;
};

IntervalTree.prototype.overlapsInterval = function(targetInterval) {
  return this.root.overlaps(targetInterval);
};

IntervalTree.prototype.getOverlapping = function(targetInterval) {
  return this.root.getOverlapping(targetInterval);
};

module.exports = IntervalTree;