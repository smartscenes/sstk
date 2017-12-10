// Modified version of KD tree from https://github.com/ubilabs/kd-tree-javascript

var BinaryHeap = require('ds/BinaryHeap');

/**
 * k-d Tree JavaScript - V 1.01
 *
 * https://github.com/ubilabs/kd-tree-javascript
 *
 * @author Mircea Pricop <pricop@ubilabs.net>, 2012
 * @author Martin Kleppe <kleppe@ubilabs.net>, 2012
 * @author Ubilabs http://ubilabs.net, 2012
 * @license MIT License <http://www.opensource.org/licenses/mit-license.php>
 * @constructor
 * @memberOf ds
 */

function KDTree(points, metric, dimensions) {
  // If points is not an array, assume we're loading a pre-built tree
  this.dimensions = dimensions;
  this.metric = metric;
  if (!Array.isArray(points)) this.loadTree(points, metric, dimensions);
  else this.root = this.buildTree(points, 0, null);
}

function Node(obj, dimension, parent) {
  this.obj = obj;
  this.left = null;
  this.right = null;
  this.parent = parent;
  this.dimension = dimension;
}

KDTree.prototype.buildTree = function (points, depth, parent) {
  var dimensions = this.dimensions;
  var dim = depth % dimensions.length,
    median,
    node;

  if (points.length === 0) {
    return null;
  }
  if (points.length === 1) {
    return new Node(points[0], dim, parent);
  }

  points.sort(function (a, b) {
    return a[dimensions[dim]] - b[dimensions[dim]];
  });

  median = Math.floor(points.length / 2);
  node = new Node(points[median], dim, parent);
  node.left = this.buildTree(points.slice(0, median), depth + 1, node);
  node.right = this.buildTree(points.slice(median + 1), depth + 1, node);

  return node;
};

  // Reloads a serialized tree
KDTree.prototype.loadTree = function(data) {
  var self = this;
  // Just need to restore the `parent` parameter
  self.root = data;

  function restoreParent (root) {
    if (root.left) {
      root.left.parent = root;
      restoreParent(root.left);
    }

    if (root.right) {
      root.right.parent = root;
      restoreParent(root.right);
    }
  }

  restoreParent(self.root);
};

// Convert to a JSON serializable structure; this just requires removing
// the `parent` property
KDTree.prototype.toJSON = function (src) {
  if (!src) src = this.root;
  var dest = new Node(src.obj, src.dimension, null);
  if (src.left) dest.left = this.toJSON(src.left);
  if (src.right) dest.right = this.toJSON(src.right);
  return dest;
};

KDTree.prototype.insert = function (point) {
  var dimensions = this.dimensions;
  function innerSearch(node, parent) {
    if (node === null) {
      return parent;
    }
    var dimension = dimensions[node.dimension];
    if (point[dimension] < node.obj[dimension]) {
      return innerSearch(node.left, node);
    } else {
      return innerSearch(node.right, node);
    }
  }

  var insertPosition = innerSearch(this.root, null),
    newNode,
    dimension;

  if (insertPosition === null) {
    this.root = new Node(point, 0, null);
    return;
  }

  newNode = new Node(point, (insertPosition.dimension + 1) % dimensions.length, insertPosition);
  dimension = dimensions[insertPosition.dimension];

  if (point[dimension] < insertPosition.obj[dimension]) {
    insertPosition.left = newNode;
  } else {
    insertPosition.right = newNode;
  }
};

KDTree.prototype.remove = function (point) {
  var node;
  var self = this;
  var dimensions = this.dimensions;

  function nodeSearch(node) {
    if (node === null) {
      return null;
    }

    if (node.obj === point) {
      return node;
    }

    var dimension = dimensions[node.dimension];

    if (point[dimension] < node.obj[dimension]) {
      return nodeSearch(node.left, node);
    } else {
      return nodeSearch(node.right, node);
    }
  }

  function removeNode(node) {
    var nextNode,
      nextObj,
      pDimension;

    function findMin(node, dim) {
      var dimension,
        own,
        left,
        right,
        min;

      if (node === null) {
        return null;
      }

      dimension = dimensions[dim];

      if (node.dimension === dim) {
        if (node.left !== null) {
          return findMin(node.left, dim);
        }
        return node;
      }

      own = node.obj[dimension];
      left = findMin(node.left, dim);
      right = findMin(node.right, dim);
      min = node;

      if (left !== null && left.obj[dimension] < own) {
        min = left;
      }
      if (right !== null && right.obj[dimension] < min.obj[dimension]) {
        min = right;
      }
      return min;
    }

    if (node.left === null && node.right === null) {
      if (node.parent === null) {
        self.root = null;
        return;
      }

      pDimension = dimensions[node.parent.dimension];

      if (node.obj[pDimension] < node.parent.obj[pDimension]) {
        node.parent.left = null;
      } else {
        node.parent.right = null;
      }
      return;
    }

    // If the right subtree is not empty, swap with the minimum element on the
    // node's dimension. If it is empty, we swap the left and right subtrees and
    // do the same.
    if (node.right !== null) {
      nextNode = findMin(node.right, node.dimension);
      nextObj = nextNode.obj;
      removeNode(nextNode);
      node.obj = nextObj;
    } else {
      nextNode = findMin(node.left, node.dimension);
      nextObj = nextNode.obj;
      removeNode(nextNode);
      node.right = node.left;
      node.left = null;
      node.obj = nextObj;
    }

  }

  node = nodeSearch(self.root);

  if (node === null) { return; }

  removeNode(node);
};

KDTree.prototype.nearest = function(point, maxNodes, maxDistance) {
  var dimensions = this.dimensions;
  var metric = this.metric;
  var self = this;
  var i,
    result,
    bestNodes;

  bestNodes = new BinaryHeap(
    function (e) { return -e[1]; }
  );

  function nearestSearch(node) {
    var bestChild,
      dimension = dimensions[node.dimension],
      ownDistance = metric(point, node.obj),
      linearPoint = {},
      linearDistance,
      otherChild,
      i;

    function saveNode(node, distance) {
      bestNodes.push([node, distance]);
      if (bestNodes.size() > maxNodes) {
        bestNodes.pop();
      }
    }

    for (i = 0; i < dimensions.length; i += 1) {
      if (i === node.dimension) {
        linearPoint[dimensions[i]] = point[dimensions[i]];
      } else {
        linearPoint[dimensions[i]] = node.obj[dimensions[i]];
      }
    }

    linearDistance = metric(linearPoint, node.obj);

    if (node.right === null && node.left === null) {
      if (bestNodes.size() < maxNodes || ownDistance < bestNodes.peek()[1]) {
        saveNode(node, ownDistance);
      }
      return;
    }

    if (node.right === null) {
      bestChild = node.left;
    } else if (node.left === null) {
      bestChild = node.right;
    } else {
      if (point[dimension] < node.obj[dimension]) {
        bestChild = node.left;
      } else {
        bestChild = node.right;
      }
    }

    nearestSearch(bestChild);

    if (bestNodes.size() < maxNodes || ownDistance < bestNodes.peek()[1]) {
      saveNode(node, ownDistance);
    }

    if (bestNodes.size() < maxNodes || Math.abs(linearDistance) < bestNodes.peek()[1]) {
      if (bestChild === node.left) {
        otherChild = node.right;
      } else {
        otherChild = node.left;
      }
      if (otherChild !== null) {
        nearestSearch(otherChild);
      }
    }
  }

  if (maxDistance) {
    for (i = 0; i < maxNodes; i += 1) {
      bestNodes.push([null, maxDistance]);
    }
  }

  if(self.root)
    nearestSearch(self.root);

  result = [];

  for (i = 0; i < Math.min(maxNodes, bestNodes.content.length); i += 1) {
    if (bestNodes.content[i][0]) {
      result.push([bestNodes.content[i][0].obj, bestNodes.content[i][1]]);
    }
  }
  return result;
};

KDTree.prototype.balanceFactor = function () {
  var self = this;
  function height(node) {
    if (node === null) {
      return 0;
    }
    return Math.max(height(node.left), height(node.right)) + 1;
  }

  function count(node) {
    if (node === null) {
      return 0;
    }
    return count(node.left) + count(node.right) + 1;
  }

  return height(self.root) / (Math.log(count(self.root)) / Math.log(2));
};

module.exports = KDTree;