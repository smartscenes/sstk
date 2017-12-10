/**
 * Basic implementation of a binary tree
 * Default implementation uses a scapegoat tree (a self balancing ordered binary tree)
 *  (each node keep track of the size and parent so it is a bit memory intensive)
 * @todo Debug and test
 * @author Angel Chang
 * @constructor
 * @memberOf ds
 */
function BinaryTree(opts) {
  this.root = null;
  this.compare = opts.compare;
  this.debug = opts.debug;
  this.alpha = (opts.alpha != undefined)? opts.alpha : 0.65;  // How balanced we want this tree (between 0.5 and 1.0)
}

BinaryTree.branches = {
  LEFT: -1,
  RIGHT: 1
};

Object.defineProperty(BinaryTree.prototype, 'isEmpty', {
  get: function () { return !this.root || this.root.isEmpty; }
});

Object.defineProperty(BinaryTree.prototype, 'size', {
  get: function () { return this.root? this.root.size : 0; }
});

// Basic tree operations
// Removes target from tree rooted at start
BinaryTree.prototype.remove = function(target, start) {
  start = start || this.root;
  return this.__remove(target, start);
};

// Finds target in tree rooted at start, returns tree node
BinaryTree.prototype.find = function(target, start) {
  start = start || this.root;

  var node = start;
  while (node && !node.isEmpty) {
    // TODO: change equals operator
    if (node.value.equals(target)) return node;
    if (this.compare(target, node.value) > 0) {
      // search right
      node = node.right;
    } else {
      node = node.left;
    }
  }
  return null;
};

// Create tree node
BinaryTree.prototype.createTreeNode = function(opts) {
  return new BinaryTree.TreeNode(opts);
};

// Add target to tree, return true if tree modified
BinaryTree.prototype.add = function(target) {
  return this.addAt(target, this.root);
};

// Add target to tree rooted at start, return true if tree modified
BinaryTree.prototype.addAt = function(target, start) {
  start = start || this.root;
  if (!start) {
    if (target != null) {
      this.root = this.createTreeNode({ value: target });
      return true;
    } else {
      return false;
    }
  } else {
    return this.__add(target, start, this.alpha);
  }
};

// Checks if tree rooted at start contains target value
BinaryTree.prototype.contains = function(target, start) {
  start = start || this.root;
  var node = this.find(start, target);
  return !!node; // Convert to boolean
};

// Empties the tree
BinaryTree.prototype.clear = function() {
  if (this.root) {
    this.root.clear();
  }
};

// Returns overall height of the tree
BinaryTree.prototype.height = function(node) {
  node = node || this.root;
  if (node.value == null) return 0;
  var lh = (node.left)? this.height(node.left):0;
  var rh = (node.right)? this.height(node.right):0;
  return Math.max(lh,rh) + 1;
};

// Checks that node is a proper descendant of ancestor on the given branch
BinaryTree.prototype.__check = function(ancestor, node, branch) {
  if (!node.isEmpty)  {
    var cmp = this.compare(node.value, ancestor.value);
    if (branch === BinaryTree.branches.LEFT) {
      // Check that node is less than or equal to the parent
      if (cmp  > 0) {
        throw "node is not on the correct side - cmp is " + cmp + " for left!!!";
      }
    } else if (branch === BinaryTree.branches.RIGHT) {
      // Check that node is greater than the parent
      if (cmp <= 0) {
        throw "node is not on the correct side - cmp is " + cmp + " for right!!!";
      }
    }
  }
};

// Add node into tree and self balances
BinaryTree.prototype.__add = function(target, node, alpha) {
  if (target == null) return false;
  var n = node;
  var depth = 0;
  var thresholdDepth = (node.size > 10)? (Math.floor(-Math.log(node.size)/Math.log(alpha)+1)):10;
  while (n) {
    depth++;
    if (n.value == null) {
      n.value = target;
      n.onValueAdded(target);
      n.size = 1;
      if (depth > thresholdDepth) {
        // Do rebalancing
        var p = n.parent;
        while (p) {
          if (p.size > 10 && !this.isAlphaBalanced(p,alpha)) {
            var newParent = this.balance(p);
            if (p === this.root) {
              this.root = newParent;
            }
            if (this.debug) {
              this.check();
            }
            break;
          }
          p = p.parent;
        }
      }
      return true;
    } else {
      n.size++;
      n.onValueAdded(target);
      if (this.compare(target, n.value) <= 0) {
        // Should go on left
        if (!n.left) {
          n.left = this.createTreeNode({});
          n.left.parent = n;
        }
        n = n.left;
      } else {
        // Should go on right
        if (!n.right) {
          n.right = this.createTreeNode({});
          n.right.parent = n;
        }
        n = n.right;
      }
    }
  }
  return false;
};

// Removes node from tree and self balances
BinaryTree.prototype.__remove = function(target, node) {
  if (target == null) return false;
  if (node.value == null) return false;
  if (target.equals(node.value)) {
    var leftSize = (node.left)? node.left.size:0;
    var rightSize = (node.right)? node.right.size:0;
    if (leftSize === 0) {
      if (rightSize === 0) {
        node.clear();
      } else {
        node.copyFrom(node.right);
      }
    } else if (rightSize === 0) {
      node.copyFrom(node.left);
    } else {
      // Rotate left up
      node.value = node.left.value;
      node.size--;
      node.onChildrenChanged();
      var origRight = node.right;
      node.right = node.left.right;
      node.left = node.left.left;
      if (node.left) node.left.parent = node;
      if (node.right) node.right.parent = node;

      // Attach origRight somewhere...
      var rightmost = this.getRightmostNode(node);
      rightmost.right = origRight;
      if (rightmost.right) {
        rightmost.right.parent = rightmost;
        // adjust maxEnd and sizes on the right
        this.adjustUpwards(rightmost.right,node);
      }
    }
    return true;
  } else {
    if (this.compare(target, node.value) <= 0) {
      // Should go on left
      if (!node.left) {
        return false;
      }
      var res = this.remove(node.left, target);
      if (res) {
        node.onChildrenChanged();
        node.size--;
      }
      return res;
    } else {
      // Should go on right
      if (!node.right) {
        return false;
      }
      var res = this.remove(node.right, target);
      if (res) {
        node.onChildrenChanged();
        node.size--;
      }
      return res;
    }
  }
};

BinaryTree.prototype.isAlphaBalanced = function(node, alpha) {
  var leftSize = (node.left)? node.left.size:0;
  var rightSize = (node.right)? node.right.size:0;
  var threshold = Math.floor((alpha*node.size) + 1);
  return (leftSize <= threshold) && (rightSize <= threshold);
};

// TODO: Review tree node interface now we are in javascript land
// Tree node
var id = 0;
BinaryTree.TreeNode = function(opts) {
  this.value = opts.value;
  this.size = opts.size || (opts.value != null? 1 : 0);
  this.left = opts.left || null;
  this.right = opts.right || null;
  this.parent = opts.parent || null;  // Parent for convenience
  this.depth = -1; // depth of node
  this.index = -1; // index of node
  this.id = id++;
};

Object.defineProperty(BinaryTree.TreeNode.prototype, 'isEmpty', {
  get: function () { return this.value == null; }
});

Object.defineProperty(BinaryTree.TreeNode.prototype, 'childCount', {
  get: function () { return (this.left? 1:0) + (this.right? 1:0); }
});

//public int getSize() { return this.size; }
//public int getDepth() { return this.depth; }
//public int getIndex() { return this.index; }

BinaryTree.TreeNode.prototype.getChild = function(i) {
  if (i === 0) {
    if (this.left) return this.left;
  } else {
    if (this.left) i--;
  }
  if (i === 0) {
    if (this.right) return this.right;
  }
  return null;
};

BinaryTree.TreeNode.prototype.clear = function() {
  this.value = null;
  this.size = 0;
  if (this.left && this.left.parent === this) {
    this.left.parent = null;
  }
  if (this.right && this.right.parent === this) {
    this.right.parent = null;
  }
  this.left = null;
  this.right = null;
};

BinaryTree.TreeNode.prototype.copy = function(other) {
  this.value = other.value;
  this.size = other.size;
  this.left = other.left;
  this.right = other.right;
  if (this.left) this.left.parent = this;
  if (this.right) this.right.parent = this;
  this.onCopyFrom(other);
};

// // DO Extra adjustments
BinaryTree.TreeNode.prototype.check = function() {};
BinaryTree.TreeNode.prototype.onChildrenChanged = function() {};
BinaryTree.TreeNode.prototype.onValueAdded = function(v) {};
BinaryTree.TreeNode.prototype.onCopyFrom = function(other) {};

BinaryTree.TreeNode.prototype.traverseAll = function(cb) {
  if (this.left) {
    this.left.traverseAll(cb);
  }
  if (this.value != null) {
    cb(this);
  }
  if (this.right) {
    this.right.traverseAll(cb);
  }
};

BinaryTree.prototype.indexNodesWithDepth = function(node, depth, i) {
  node = node || this.root;
  depth = depth || 0;
  i = i || 0;
  var next = i+1;
  if (node) {
    node.index = i;
    node.depth = depth;
    for (var ci = 0; ci < node.childCount; ci++) {
      var child = node.getChild(ci);
      next = this.indexNodesWithDepth(child, depth+1, next);
    }
  }
  return next;
};

BinaryTree.prototype.indexNodes = function(node, i) {
  node = node || this.root;
  i = i || 0;
  var next = i+1;
  if (node) {
    node.index = i;
    for (var ci = 0; ci < node.childCount; ci++) {
      var child = node.getChild(ci);
      next = this.indexNodes(child, next);
    }
  }
  return next;
};

BinaryTree.prototype.traverseAll = function(node, cb) {
  node = node || this.root;
  node.traverseAll(cb);
};

// Checks this tree starting at node
BinaryTree.prototype.check = function(treeNode) {
  treeNode = treeNode || this.root;
  var todo = [];
  todo.push(treeNode);
  while (todo.length > 0) {
    var node = todo.pop();
    if (node === node.parent) {
      throw "node is same as parent!!!";
    }
    if (node.isEmpty) {
      if (node.left) throw "Empty node shouldn't have left branch";
      if (node.right) throw "Empty node shouldn't have right branch";
      continue;
    }
    var leftSize = (node.left)? node.left.size:0;
    var rightSize = (node.right)? node.right.size:0;
    node.check();
    if (node.size !== leftSize + rightSize + 1) {
      throw "node size is not one plus the sum of left and right!!!";
    }
    if (node.left) {
      if (node.left.parent !== node) {
        throw "node left parent is not same as node!!!";
      }
    }
    if (node.right) {
      if (node.right.parent !== node) {
        throw "node right parent is not same as node!!!";
      }
    }
    if (node.parent) {
      // Go up parent and make sure we are on correct side
      var n = node;
      while (n && n.parent) {
        // Check we are either right or left
        if (n === n.parent.left) {
          this.__check(n.parent, node, BinaryTree.branches.LEFT);
        } else if (n === n.parent.right) {
          this.__check(n.parent, node, BinaryTree.branches.RIGHT);
        } else {
          throw "node is not parent's left or right child!!!";
        }
        n = n.parent;
      }
    }
    if (node.left) todo.push(node.left);
    if (node.right) todo.push(node.right);
  }
};

BinaryTree.prototype.getLeft = function(node) {
  return node? node.left : null;
};

BinaryTree.prototype.getRight = function(node) {
  return node? node.right : null;
};

BinaryTree.prototype.getLeftmostNode = function(node) {
  var n = node;
  while (n.left) {
    n = n.left;
  }
  return n;
};

BinaryTree.prototype.getRightmostNode = function(node) {
  var n = node;
  while (n.right) {
    n = n.right;
  }
  return n;
};

// Returns ith node
BinaryTree.prototype.getNode = function(node, nodeIndex) {
  var i = nodeIndex;
  var n = node;
  while (n) {
    if (i < 0 || i >= n.size) return null;
    var leftSize = n.left? n.left.size:0;
    if (i === leftSize) {
      return n;
    } else if (i > leftSize) {
      // Look for in right side of tree
      n = n.right;
      i = i - leftSize - 1;
    } else {
      n = n.left;
    }
  }
  return null;
};

// Tree rotation

// Adjust upwards starting at this node until stopAt
BinaryTree.prototype.adjustUpwards = function(node, stopAt) {
  var n = node;
  while (n && n !== stopAt) {
    var leftSize = n.left? n.left.size:0;
    var rightSize = n.right? n.right.size:0;
    node.onChildrenChanged();
    n.size = leftSize + 1 + rightSize;
    if (n === n.parent) {
      throw "node is same as parent!!!";
    }
    n = n.parent;
  }
};

BinaryTree.prototype.adjust = function(node) {
  this.adjustUpwards(node, node.parent);
};

// Moves this node up the tree until it replaces the target node
BinaryTree.prototype.rotateUp = function(node, target) {
  var n = node;
  var done = false;
  while (n && n.parent && !done) {
    // Check if we are the left or right child
    done = (n.parent === target);
    if (n === n.parent.left) {
      n = this.rightRotate(n.parent);
    } else if (n === n.parent.right) {
      n = this.leftRotate(n.parent);
    } else {
      throw "Not on parent's left or right branches.";
    }
    if (this.debug) {
      this.check(n);
    }
  }
};

// Moves this node to the right and the left child up and returns the new root
BinaryTree.prototype.rightRotate = function(oldRoot) {
  if (!oldRoot || oldRoot.isEmpty || !oldRoot.left) return oldRoot;

  var oldLeftRight = oldRoot.left.right;

  var newRoot = oldRoot.left;
  newRoot.right = oldRoot;
  oldRoot.left = oldLeftRight;

  // Adjust parents and such
  newRoot.parent = oldRoot.parent;
  newRoot.onCopyFrom(oldRoot);
  newRoot.size = oldRoot.size;
  if (newRoot.parent) {
    if (newRoot.parent.left === oldRoot) {
      newRoot.parent.left = newRoot;
    } else if (newRoot.parent.right === oldRoot) {
      newRoot.parent.right = newRoot;
    } else {
      throw "Old root not a child of its parent";
    }
  }

  oldRoot.parent = newRoot;
  if (oldLeftRight) oldLeftRight.parent = oldRoot;
  this.adjust(oldRoot);
  this.adjust(newRoot);
  if (this.debug) {
    this.check(newRoot);
  }
  return newRoot;
};

// Moves this node to the left and the right child up and returns the new root
BinaryTree.prototype.leftRotate = function(oldRoot) {
  if (!oldRoot || oldRoot.isEmpty || !oldRoot.right) return oldRoot;

  var oldRightLeft = oldRoot.right.left;

  var newRoot = oldRoot.right;
  newRoot.left = oldRoot;
  oldRoot.right = oldRightLeft;

  // Adjust parents and such
  newRoot.parent = oldRoot.parent;
  newRoot.onCopyFrom(oldRoot);
  newRoot.size = oldRoot.size;
  if (newRoot.parent) {
    if (newRoot.parent.left === oldRoot) {
      newRoot.parent.left = newRoot;
    } else if (newRoot.parent.right === oldRoot) {
      newRoot.parent.right = newRoot;
    } else {
      throw "Old root not a child of its parent";
    }
  }

  oldRoot.parent = newRoot;
  if (oldRightLeft) oldRightLeft.parent = oldRoot;
  this.adjust(oldRoot);
  this.adjust(newRoot);
  if (this.debug) {
    this.check(newRoot);
  }
  return newRoot;
};

// Balances the tree rooted at node
BinaryTree.prototype.balance = function(node) {
  node = node || this.root;
  if (this.debug) this.check(node);
  var todo = [];
  todo.push(node);
  var newRoot = null;
  while (todo.length > 0) {
    var n = todo.pop();
    // Balance tree between this node
    // Select median nodes and try to balance the tree
    var medianAt = Math.floor(n.size/2);
    var median = this.getNode(n, medianAt);
    // Okay, this is going to be our root
    if (median && median !== n) {
      // Yes, there is indeed something to be done
      this.rotateUp(median, n);
    }
    if (!newRoot) {
      newRoot = median;
    }
    if (median.left) todo.push(median.left);
    if (median.right) todo.push(median.right);
  }
  if (!newRoot) { newRoot = node; }
  if (node === this.root) {
    this.root = newRoot; // Update root
  }
  return newRoot;
};

module.exports = BinaryTree;