'use strict';

var BBox = require('geo/BBox');
var GeometryUtil = require('geo/GeometryUtil');
var Object3DUtil = require('geo/Object3DUtil');
var _ = require('util/util');

var BVHNode = function (objects, params, parent) {
  this.id = _.uniqueId();
  this.parent = parent ? parent : null;
  this.depth = parent ? parent.depth + 1 : 0;
  if (!objects) { return; }
  this.objects = objects;
  var maxDepth = params.maxDepth;
  var maxObjects = params.maxObjects || 1;
  if (objects.length <= maxObjects || (maxDepth != null && this.depth >= maxDepth)) {  // base case
    var getBBox = params.getBoundingBox || getBoundingBox;
    this.bbox = getBBox(objects);
  } else {  // split according to strategy
    var split = doSplit(objects, params);
    this.splitAxis = params.splitAxis;  // save split axis
    this.left = new BVHNode(split.left, params, this);
    this.right = new BVHNode(split.right, params, this);
    this.bbox = this.left.bbox.union(this.right.bbox);
  }
};
BVHNode.prototype.constructor = BVHNode;

Object.defineProperty(BVHNode.prototype, 'isLeaf', {
  get: function () { return !this.left && !this.right; }
});

Object.defineProperty(BVHNode.prototype, 'children', {
  get: function () {
    var children = [];
    if (this.left) { children.push(this.left); }
    if (this.right) { children.push(this.right); }
    return children;
  }
});

BVHNode.fromChildren = function (left, right) {
  var parent = new BVHNode();
  parent.left = left;
  parent.right = right;
  left.parent = parent;
  right.parent = parent;
  parent.objects = left.objects.concat(right.objects);
  parent.bbox = new BBox();
  parent.bbox.includeBBox(left.bbox);
  parent.bbox.includeBBox(right.bbox);
  //parent.bbox = getBoundingBox(parent.objects);
  return parent;
};

// TODO: Provide well defined interface for intersectObject and intersectBBox
// TODO: Allow for other types of intersectors (other than raycaster)
BVHNode.prototype.intersects = function(intersector, options) {
  options = options || {};
  if (intersector instanceof THREE.Raycaster) {
    var raycaster = intersector;
    // Returns list of intersected objects
    options.intersectObject = options.intersectObject || function(object, recursive) { return raycaster.intersectObject(object, recursive); };
    // returns if bbox is intersected
    options.intersectBBox = options.intersectBBox || function(bbox) {
      var intersectedPoint = raycaster.ray.intersectBox(bbox, new THREE.Vector3());
      if (intersectedPoint) {
        var insideBBox = bbox.contains(raycaster.ray.origin);
        if (!insideBBox) {
          // TODO: filter based on both near and far
          // in computation of raycaster.ray.intersectBox - a tmin/tmax is computed
          // Should use those to filter
          // For now filter just based on far since we only get back tmin
          var distance = raycaster.ray.origin.distanceTo(intersectedPoint);
          return (distance <= raycaster.far);
        } else {
          return true;
        }
      }
    };
  }
  if (options.checkHasIntersectionOnly) {
    return this.__hasIntersected(options);
  } else {
    return this.__intersectsSorted(options);
  }
};

BVHNode.prototype.__intersectsSorted = function(options) {
  var filter = options.filter;
  var recursive = options.recursive;
  var limit = options.limit; // Limit to this number of intersections
  var intersectObjects = options.intersectObjects;
  var intersectObject = options.intersectObject;
  var intersectBBox = options.intersectBBox;

  function descSort(a, b) {
    return a.distance - b.distance;
  }

  var intersects = options.intersects || [];
  if (limit) {
    var BoundedBinaryHeap = require('ds/BoundedBinaryHeap');
    intersects = new BoundedBinaryHeap({
      maxSize: limit,
      scoreFunc: function (x) {
        return -x.distance;
      }
    });
  }
  this.traverse(function (bvhNode) {
    var nodeIntersected = intersectBBox(bvhNode.bbox);
    if (nodeIntersected && bvhNode.isLeaf) {
      if (intersectObjects) {
        var filteredObjects = filter? _.filter(bvhNode.objects, filter) : bvhNode.objects;
        intersectObjects(filteredObjects, recursive, intersects);
      } else {
        for (var i = 0; i < bvhNode.objects.length; i++) {
          var object = bvhNode.objects[i];
          if (!filter || filter(object)) {
            var objectIntersections = intersectObject(object, recursive);
            if (objectIntersections && objectIntersections.length) {
              intersects.push.apply(intersects, objectIntersections);
            }
          }
        }
      }
    }
    return nodeIntersected;
  }, null, true);
  if (limit) {
    intersects = intersects.getSorted().reverse();
  } else {
    intersects.sort(descSort);
  }
  return intersects;
};

BVHNode.prototype.__hasIntersected = function(options) {
  var filter = options.filter;
  var recursive = options.recursive;
  var intersectObjects = options.intersectObjects;
  var intersectObject = options.intersectObject;
  var intersectBBox = options.intersectBBox;

  // We only care if there is any intersection (not in identifying the specific intersection)
  var intersects = [];
  var isIntersected = false;
  this.traverse(function (bvhNode) {
    var nodeIntersected = intersectBBox(bvhNode.bbox);
    if (nodeIntersected && bvhNode.isLeaf) {
      if (intersectObjects) {
        var filteredObjects = filter ? _.filter(bvhNode.objects, filter) : bvhNode.objects;
        intersectObjects(filteredObjects, recursive, intersects);
        if (intersects.length) {
          isIntersected = true;
        }
      } else {
        for (var i = 0; i < bvhNode.objects.length; i++) {
          var object = bvhNode.objects[i];
          if (!filter || filter(object)) {
            var objectIntersections = intersectObject(object, recursive);
            if (objectIntersections && objectIntersections.length) {
              isIntersected = true;
              break;
            }
          }
        }
      }
    }
    return !isIntersected && nodeIntersected;
  }, null, true);
  return isIntersected;
};

BVHNode.prototype.traverse = function (cbPre, cbPost, checkPre) {
  if (cbPre) {
    var traverseMore = cbPre(this);
    if (checkPre && !traverseMore) {
      return; // Stop traversal
    }
  }
  if (this.left)  {
    this.left.traverse(cbPre, cbPost, checkPre);
  }
  if (this.right) {
    this.right.traverse(cbPre, cbPost, checkPre);
  }
  if (cbPost) {
    cbPost(this);
  }
};

/**
 * Simple bounding volume hierarchy
 * @param objects
 * @param params Options for how to construct the BVH
 * @param [params.splitStrategy] {string|int} Strategy to use for splitting the BVH
 *   (`'AXIS_MIDPOINT'=0, 'AXIS_MEDIAN'=1, '  SURFACE_AREA_HEURISTIC'=2, 'CUBICITY_HEURISTIC'=3`, 'HAC'=4`)
 * @param [params.axisChoiceStrategy] {string|int} Strategy to use for selecting the axis to split along (`'FIXED'=0, 'LONGEST'=1, 'RANDOM'=2, 'OPTIMAL'=3`)
 * @param [params.splitAxis] {string} Must be provided if `axisChoiceStrategy` is `FIXED`.  Ignored otherwise.
 * @param [params.splittableAxes] {string[]} Which axes to consider for splitting (default is all axes `['x', 'y', 'z']`)
 * @param [params.maxDepth] {int} Max depth of BVH tree
 * @param [params.maxObjects=1] {int} Max number of objects per BVH node
 * @param [params.obstacles] {THREE.Object3D[]} Set of obstacles (used for `splitStrategy` of `HAC`) to penalize combining nodes with obstacles together.
 * @param [params.getBoundingBox] {function(object|object[]): BBox} Function returning the bounding of objects in a node
 * @constructor
 * @memberOf geo
 */
var BVH = function (objects, params) {
  if (objects && Array.isArray(objects)) {
    objects = objects.filter(function(x) {
      if (x == null) {
        console.warn('Null object passed to BVH');
      }
      return x;
    });
  }
  // Parse parameters
  var p = params || {};
  p = _.defaults(p, BVH.DefaultOptions);
  if (typeof(p.splitStrategy) === 'string') {
    p.splitStrategy = _.getEnumValue(p.splitStrategy.toUpperCase(), 'splitStrategy', BVH.SplitStrategy);
  }
  if (typeof(p.axisChoiceStrategy) === 'string') {
    p.axisChoiceStrategy = _.getEnumValue(p.axisChoiceStrategy.toUpperCase(), 'axisChoiceStrategy', BVH.AxisChoiceStrategy);
  }
  if (objects && objects.length && (objects[0] instanceof THREE.Object3D || params.getBoundingBox)) {
    //console.log('BVH params', p);
    this.params = p;
    if (p.splitStrategy === BVH.SplitStrategy.HAC) {
      console.time('HAC');
      this.root = constructWithHAC(objects, p);
      console.timeEnd('HAC');
    } else {
      this.root = new BVHNode(objects, p);
    }
  } else {
    throw 'BVH requires objects = [THREE.Object3D] or getBoundingBox to be specified';
  }
};
BVH.prototype.constructor = BVH;

BVH.AxisChoiceStrategy = Object.freeze({
  FIXED: 0,
  LONGEST: 1,
  RANDOM: 2,
  OPTIMAL: 3
});

BVH.SplitStrategy = Object.freeze({
  AXIS_MIDPOINT: 0,
  AXIS_MEDIAN: 1,
  SURFACE_AREA_HEURISTIC: 2,
  CUBICITY_HEURISTIC: 3,
  HAC: 4
});

BVH.DefaultOptions = Object.freeze({
  axisChoiceStrategy: BVH.AxisChoiceStrategy.LONGEST,
  splitStrategy: BVH.SplitStrategy.HAC,
  splitAxis: 'x',
  splittableAxes: ['x', 'y', 'z']
});

function constructWithHAC(objects, params) {
  var f = function (bbox) {
    if (!bbox) return 0;
    var d = bbox.dimensions();
    var vol = d.x * d.z + d.y;
    if (!isFinite(vol)) { return 0; }
    return vol;
  };
  var raycaster = new THREE.Raycaster();
  var bvhnodes = new Set(objects.map(function (o) { return new BVHNode([o], params); }));

  var cachedDistances = {};
  var tempBB = new BBox();

  function combineBest(active) {
    // Find best and combine
    var bestD = Infinity;
    var left = null, right = null;
    active.forEach(function (a) {
      active.forEach(function (b) {
        if (a.id >= b.id) return; // Ignore these
        var dAB = cachedDistances[a.id + '-' + b.id];
        if (dAB == undefined) {
          var fa = f(a.bbox);
          var fb = f(b.bbox);
          var fu = f(tempBB.union2(a.bbox, b.bbox));
          var fi = f(tempBB.intersection2(a.bbox, b.bbox));
          dAB = fu + fi - (fa + fb);
          //var dist = a.bbox.distanceTo(b.bbox);
          //dAB = (1.0 + dist)*dAB;
          if (params.obstacles) {
            var ca = a.bbox.centroid();
            var aToB = b.bbox.centroid().sub(ca);
            var distAtoB = aToB.length();
            aToB.normalize();
            raycaster.set(ca, aToB);
            raycaster.far = distAtoB;
            var intersects = raycaster.intersectObjects(params.obstacles, true);
            if (intersects.length) {
              dAB += 1000000;
            }
          }
          cachedDistances[a.id + '-' + b.id] = dAB;
        }
        if ((a.id !== b.id) && dAB < bestD) {
          bestD = dAB;
          left = a;
          right = b;
        }
      });
    });
    //console.log(bestD);
    if (left && right) {
      var combined = BVHNode.fromChildren(left, right);
      return combined;
    } else {
      console.error('Missing left or right', left, right, active, cachedDistances);
    }
  }

  function constructFromBVHNodes(active) {
    //console.log('processing: ', active);
    while (active.size > 1) {
      var combined = combineBest(active);

      if (combined) {
        // Add combined into active and remove left/right
        var left = combined.left;
        var right = combined.right;
        active.forEach(function (a) {
          var key1 = a.id < left.id ? a.id + '-' + left.id : left.id + '-' + a.id;
          delete cachedDistances[key1];
          var key2 = a.id < right.id ? a.id + '-' + right.id : right.id + '-' + a.id;
          delete cachedDistances[key2];
        });
        active.delete(left);
        active.delete(right);
        active.add(combined);
        //console.log('combined ' + left.id + ', ' + right.id, combined);
      } else {
        break;
      }
    }
    var r = active.entries().next().value[0];  // only element is root
    return r;
  }

  var root = constructFromBVHNodes(bvhnodes);
  root.depth = 0;
  root.traverse(function (n) {
    if (n.parent) { n.depth = n.parent.depth + 1; }
  });
  return root;
}

function doSplit(objects, params) {
  var getBBox = params.getBoundingBox || getBoundingBox;
  // select axis
  switch (params.axisChoiceStrategy) {
    case BVH.AxisChoiceStrategy.FIXED:
      if (!params.splitAxis) { console.error('[BVH] splitAxis not specified'); }
      break;
    case BVH.AxisChoiceStrategy.LONGEST:
      params.splitAxis = getBBox(objects).maxDimAxisName();
      break;
    case BVH.AxisChoiceStrategy.RANDOM:
      params.splitAxis = _.sample(params.splittableAxes);
      break;
  }
  // select split strategy
  switch (params.splitStrategy) {
    case BVH.SplitStrategy.AXIS_MIDPOINT:
      return splitAxisMidpoint(objects, params);
    case BVH.SplitStrategy.AXIS_MEDIAN:
      return splitAxisMedian(objects, params);
    case BVH.SplitStrategy.SURFACE_AREA_HEURISTIC:
      return splitAxisSAH(objects, params);
    case BVH.SplitStrategy.CUBICITY_HEURISTIC:
      return splitAxisCubicity(objects, params);
  }
}

function getBoundingBox(objects) {
  var bbox;
  if (Array.isArray(objects)) {
    bbox = new BBox();
    objects.forEach(function (o) {
      var oBBox = getBoundingBox(o);
      if (oBBox && oBBox.valid()) {
        bbox.includeBBox(oBBox);
      }
    });
  } else if (objects instanceof THREE.Object3D) {
    bbox = Object3DUtil.getBoundingBox(objects);
  } else if (objects instanceof BBox) {
    bbox = objects;
  } else if (objects instanceof THREE.Box3) {
    bbox = new BBox(objects.min, objects.max);
  } else {
    console.error('Cannot compute bounding box for no objects!');
  }
  if (!bbox.valid()) {
    console.warn('Invalid bounding box for objects', bbox, objects);
  }
  return bbox;
}

function getLeftRightSplit(lr) {
  // handle degenerate splits by arbitrarily pushing element to other side
  if (lr[0].length === 0) {
    lr[0] = lr[1].slice(0,1);
    lr[1] = lr[1].slice(1);
  } else if (lr[1].length === 0) {
    lr[1] = lr[0].slice(0,1);
    lr[0] = lr[0].slice(1);
  }
  if (!lr[0].length || !lr[1].length) {
    console.error('Degenerate split: ', lr);
  }
  return { left: lr[0], right: lr[1] };
}

function splitAxisMedian(objects, params) {
  var getBBox = params.getBoundingBox || getBoundingBox;
  var sorted = _.sortBy(objects, function (o) {
    return getBBox(o).centroid()[params.splitAxis];
  });
  var mi = Math.floor(objects.length / 2);
  var lr = [sorted.slice(0, mi), sorted.slice(mi)];
  return getLeftRightSplit(lr);
}

function splitAxisMidpoint(objects, params) {
  var getBBox = params.getBoundingBox || getBoundingBox;
  var bbox = getBBox(objects);
  var mid = bbox.centroid()[params.splitAxis];
  var lr = _.partition(objects, function (o) {
    return getBBox(o).centroid()[params.splitAxis] <= mid;
  });
  return getLeftRightSplit(lr);
}

function calculateMinCostSplitAxis(objects, params, costFunction) {
  var getBBox = params.getBoundingBox || getBoundingBox;
  var bbox = getBBox(objects);
  var saNorm = 1 / bbox.surfaceArea();
  var sorted = _.sortBy(objects, function (o) {
    return getBBox(o).centroid()[params.splitAxis];
  });
  var sortedBBoxen = _.map(sorted, function (o) {
    return getBBox(o);
  });

  // compute cost for splitting after each object
  var i, j, cost = [];
  for (i = 0; i < sorted.length - 1; ++i) {
    var b0 = new BBox(), b1 = new BBox();
    var cnt0 = 0, cnt1 = 0;
    for (j = 0; j <= i; ++j) {
      b0 = b0.union(sortedBBoxen[j]);
      cnt0++;
    }
    for (j = i + 1; j < sorted.length; ++j) {
      b1 = b1.union(sortedBBoxen[j]);
      cnt1++;
    }
    cost[i] = costFunction(b0, b1, cnt0, cnt1, saNorm);
  }

  // find split that minimizes SAH metric
  var minCost = cost[0];
  var mi = 0;
  for (i = 1; i < sorted.length - 1; ++i) {
    if (cost[i] < minCost) {
      minCost = cost[i];
      mi = i;
    }
  }

  return {minCost: minCost, minIndex: mi, sorted: sorted, splitAxis: params.splitAxis};
}

function minCostSplitAxis(objects, params, costFunction) {
  var minCostInfo;
  if (params.axisChoiceStrategy === BVH.AxisChoiceStrategy.OPTIMAL) {
    var costInfos = _.map(params.splittableAxes, function(splitAxis) {
      params.splitAxis = splitAxis;
      return calculateMinCostSplitAxis(objects, params, costFunction);
    });
    minCostInfo = _.minBy(costInfos, 'minCost');
    params.splitAxis = minCostInfo.splitAxis;
  } else {
    minCostInfo = calculateMinCostSplitAxis(objects, params, costFunction);
  }
  // return split
  var mi = minCostInfo.minIndex;
  var sorted = minCostInfo.sorted;
  var lr = [sorted.slice(0, mi + 1), sorted.slice(mi + 1)];
  return getLeftRightSplit(lr);
}

function splitAxisSAH(objects, params) {
  function costSAH(bbox0, bbox1, count0, count1, normalization) {
    normalization = normalization || 1;
    return 1 + (count0 * bbox0.surfaceArea() + count1 * bbox1.surfaceArea()) * normalization;
  }
  return minCostSplitAxis(objects, params, costSAH);
}

function splitAxisCubicity(objects, params) {
  function costCubicity(bbox0, bbox1, count0, count1, normalization) {
    normalization = normalization || 1;
    var cost0 = count0 * (1 - bbox0.isoperimetricQuotient()) * bbox0.surfaceArea();
    var cost1 = count1 * (1 - bbox1.isoperimetricQuotient()) * bbox1.surfaceArea();
    var cost = (cost0 + cost1) * normalization;
    return cost;
  }
  return minCostSplitAxis(objects, params, costCubicity);
}

BVH.prototype.traverse = function (cbPre, cbPost, checkPre) {
  this.root.traverse(cbPre, cbPost, checkPre);
};

BVH.prototype.intersects = function(intersector, options) {
  return this.root.intersects(intersector, options);
};

BVH.prototype.getNodeArray = function () {
  var nodes = [];
  this.root.traverse(function (node) {
    nodes.push(node);
  });
  return nodes;
};

BVH.prototype.getInternalNodes = function () {
  var nodes = [];
  this.root.traverse(function (node) {
    if (!node.isLeaf) {
      nodes.push(node);
    }
  });
  return nodes;
};

BVH.prototype.getLeaves = function () {
  var nodes = [];
  this.root.traverse(function (node) {
    if (node.isLeaf) {
      nodes.push(node);
    }
  });
  return nodes;
};


BVH.buildFromTriangles = function(mesh) {
  var nFaces = GeometryUtil.getGeometryFaceCount(mesh.geometry);
  var indices = _.range(nFaces);
  var v = new THREE.Vector3();
  mesh.updateMatrixWorld();
  var toWorld = mesh.matrixWorld;
  var bvh = new BVH(indices, {
    splitStrategy: BVH.SplitStrategy.AXIS_MEDIAN,
    getBoundingBox: function(triIndices) {
      var bbox = new BBox();
      for (var i = 0; i < triIndices.length; i++) {
        var triIndex = triIndices[i];
        var faceVertexIndices = GeometryUtil.getFaceVertexIndices(mesh.geometry, triIndex);
        for (var j = 0; j < faceVertexIndices.length; j++) {
          GeometryUtil.getGeometryVertex(mesh.geometry, faceVertexIndices[j], toWorld, v);
          bbox.includePoint(v);
        }
      }
      return bbox;
    },
    maxDepth: 50, // Try not to have depth beyond 50
    maxObjects: 500 // Can have up to 500 triangles in leaf
  });
  return bvh;
};

module.exports = BVH;
