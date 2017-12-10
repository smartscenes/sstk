// Adapted from grid.js at http://www.redblobgames.com/pathfinding/
// Copyright 2014 Red Blob Games
// License: Apache v2
var PubSub = require('PubSub');
var TypeUtils = require('data/TypeUtils');
var _ = require('util');

function CellAttribute(name, type, opts) {
  opts = opts || {};
  if (_.isString(type)) {
    type = TypeUtils.nameToTypedArray(type) || type;
  }
  this.name = name;
  this.type = type || Float32Array;
  this.dataType = opts.dataType;
  this.compute = opts.compute || function(cellData) { return cellData[name]; };
}

/**
 * Graph class
 * Weights are assigned to *nodes* not *edges*, but the pathfinder
 * will need edge weights, so we treat an edge A->B as having the
 * weight of tile B. If a tile weight is Infinity we don't expose
 * edges to it.
 * @param numNodes {int} Number of nodes in the graph
 * @param [opts.useEdgeWeights=false] {boolean} Whether to use edge weights or not
 * @param [opts.precomputeEdges] {boolean} Whether edges are precomputed
 * @param [opts.metadata] {Object} Additional metadata stored with the graph
 * @constructor
 * @memberOf nav
 */
function Graph(numNodes, opts) {
  PubSub.call(this);
  opts = opts || {};
  this.metadata = opts.metadata; // Other metadata we want to store
  this.useEdgeWeights = opts.useEdgeWeights;
  this.numNodes = numNodes;
  this._edges = []; // node id to list of node ids
  this._edgeWeights = []; // node id to edge weight for that node
  this._weights = []; // node id to number (could be Infinity)
  this._tileAttributes = {};  // dense tile attributes (map of attribute name to dense vector)
  this._userData = {};        // sparse per tile user data (arbitrary objects)
  for (var id = 0; id < numNodes; id++) {
    this._weights[id] = 1;
    if (opts.precomputeEdges !== false) {
      this._edges[id] = [];
      if (this.useEdgeWeights) {
        this._edgeWeights[id] = [];
      }
    }
  }
}

Graph.prototype = Object.create(PubSub.prototype);
Graph.prototype.constructor = Graph;

Graph.prototype.createCellAttributes = function(key, cellAttr, force) {
  if (force || !this._tileAttributes[key]) {
    var type = cellAttr.type || Float32Array;
    this._tileAttributes[key] = new type(this.numNodes);
  }
};
Graph.prototype.setCellAttribute = function(id, key, value) {
  this._tileAttributes[key][id] = value;
};
Graph.prototype.getCellAttribute = function(id, key) {
  return this._tileAttributes[key]? this._tileAttributes[key][id] : undefined;
};
Graph.prototype.getCellAttributeStatistics = function(key) {
  var values = this._tileAttributes[key];
  if (key === 'tileWeight') { values = this._weights; }
  var min = Infinity, max = -Infinity, sum = 0, n = 0;
  for (var i = 0; i < values.length; i++) {
    var v = values[i];
    if (_.isFinite(v)) {
      min = Math.min(v, min);
      max = Math.max(v, max);
      sum+=v;
      n++;
    }
  }
  return { min: min, max: max, sum: sum, size: n };
};
// Weights are given to tiles, not edges, but the search interface
// will only ask about edges. Weight of edge id1->id2 is of tile id2.
Graph.prototype.getOrderedWeights = function () {
  var weightCounts = [];
  this._weights.forEach(function (w) {
    if (weightCounts[w])
      weightCounts[w] = weightCounts[w] + 1;
    else
      weightCounts[w] = 1;
  });
  var orderedWeights = Object.keys(this._weights).map(function (x) { return parseInt(x); });
  return orderedWeights;
};

Graph.prototype.setUserData = function (id, data) {
  var oldData = this._userData[id];
  this._userData[id] = data;
  this.Publish('tileUserDataUpdated', id, data, oldData);
};
Graph.prototype.getUserData = function(id) {
  return this._userData[id];
};
Graph.prototype.tileWeight = function (id) {
  return this._weights[id];
};
Graph.prototype.setTileWeight = function (id, w) {
  if (this._weights[id] !== w) {
    var oldWeight = this._weights[id];
    this._weights[id] = w;
    this.Publish('tileWeightUpdated', id, w, oldWeight);
  }
};
Graph.prototype.setTileWeights = function (ids, w) {
  var _this = this;
  ids.forEach(function (id) {
    if (_this._weights[id] !== w) {
      var oldWeight = _this._weights[id];
      _this._weights[id] = w;
      this.Publish('tileWeightUpdated', id, w, oldWeight);
    }
  });
};
Graph.prototype.tilesWithGivenWeight = function (w) {
  if (w === void 0) { w = Infinity; }
  var tiles = [];
  for (var i = 0; i < this.numNodes; i++) {
    if (this._weights[i] === w) {
      tiles.push(i);
    }
  }
  return tiles;
};
Graph.prototype.__addEdge = function(id1,id2,weight) {
  //console.log('addEdge', id1, id2, weight);
  var edgeIndex = this.edgeIndex(id1,id2);
  if (edgeIndex >= 0) {
    if (this.useEdgeWeights) {
      this._edgeWeights[id1][edgeIndex] = weight;
    }
  } else {
    this._edges[id1].push(id2);
    if (this.useEdgeWeights) {
      this._edgeWeights[id2].push(weight);
    }
  }
};

Graph.prototype.__removeEdge = function(id1,id2) {
  var edgeIndex = this.edgeIndex(id1,id2);
  if (edgeIndex >= 0) {
    //console.log('removeEdge', id1, id2);
    this._edges = this._edges.splice(edgeIndex,1);
    if (this.useEdgeWeights) {
      this._edgeWeights = this._edgeWeights.splice(edgeIndex,1);
    }
  }
};

Graph.prototype.edgeWeight = function (id1, id2) {
  if (this.useEdgeWeights) {
    var edgeIndex = this.edgeIndex(id1, id2);
    return edgeIndex >= 0? this._edgeWeights[id1][edgeIndex] : Infinity;
  } else {
    if (!this.hasEdge(id1, id2)) {
      return Infinity;
    }
    if (this._weights[id2] === undefined) {
      return 1;
    }
    return this._weights[id2];
  }
};
Graph.prototype.distance = function (id1, id2) {
  // Assume edge weight is same as distance (not true!!!)
  return this.edgeWeight(id1, id2);
};
// Is there an edge from id1 to id2?
Graph.prototype.hasEdge = function (id1, id2) {
  // NOTE: Be careful of type of id2
  return this._edges[id1] && this._edges[id1].indexOf(id2) >= 0;
};
// Return index of edge between id1 and id2 (-1 if no edge)
Graph.prototype.edgeIndex = function (id1, id2) {
  // NOTE: Be careful of type of id2
  return this._edges[id1]? this._edges[id1].indexOf(id2) : -1;
};
// All edges from id
Graph.prototype.edgesFrom = function (id1) {
  var _this = this;
  var edges = this._edges[id1].filter(function (id2) { return _this.tileWeight(id2) !== Infinity; });
  return edges;
};
// All edges as a list of [id1, id2]
Graph.prototype.allEdges = function () {
  var all = [];
  for (var id1 = 0; id1 < this.numNodes; id1++) {
    this._edges[id1].forEach(function (id2) { return all.push([id1, id2]); });
  }
  return all;
};
// Represent this graph as a serializable json object
Graph.prototype.toJson = function () {
  var encoding = 'rle';
  var json = {
    type: 'Graph',
    metadata: this.metadata,
    edges: this._edges,
    weights: TypeUtils.arrayToJson(this._weights, { encoding: encoding}), //this._weights,
    userData: this._userData
  };
  if (this._tileAttributes) {
    json.tileAttributes = {};
    _.each(this._tileAttributes, function(array,key) {
      json.tileAttributes[key] = TypeUtils.arrayToJson(array, { encoding: encoding});
    })
  }
  return json;
};
Graph.prototype.fromJson = function (json, opts) {
  opts = opts || {};
  this.useEdgeWeights = opts.useEdgeWeights;
  this._edges = json.edges || [];
  this._weights = TypeUtils.jsonToArray(json.weights, Infinity);
  this._weights = this._weights.map(function (x) {
    if (x === null)
      return Infinity;
    else
      return x;
  });
  this._userData = json.userData;
  if (json.tileAttributes) {
    var tileAttributes = {};
    _.each(json.tileAttributes, function(array,key) {
      tileAttributes[key] = TypeUtils.jsonToArray(array, NaN);
    });
    this._tileAttributes = tileAttributes;
  }
  this.metadata = json.metadata;
  this.numNodes = this._weights.length;
};

// Returns active portion of this graph (by default, the whole graph!)
Graph.prototype.getActive = function() {
  return this;
};
// Make a proxy graph object, to share some things but override
// some methods for comparison diagrams
Graph.prototype.makeProxy = function () {
  var proxy = {};
  for (var field in this) {
    proxy[field] = this[field];
  }
  return proxy;
};

/**
 * A grid of squares, to be used as a graph.
 * The class creates the structure of the grid; the client can
 * directly set the weights on nodes.
 * @param W {int} Width of grid
 * @param H {int} Height of grid
 * @param opts.dirs What directions each cell has neighbors
 * @param opts.precomputeEdges {boolean} Whether edges should be precomputed (this is deprecated and to be removed)
 * @param opts.reverseEdgeOrder {boolean} Whether edge order should be reversed for nice alternativing stair case pattern
 * @extends nav.Graph
 * @constructor
 * @memberOf nav
 */
function SquareGrid(W, H, opts) {
  opts = opts || {};
  Graph.call(this, W * H, opts);
  this.width = W;
  this.height = H;
  this._dirs = opts.dirs || SquareGrid.DIRS;
  this._precomputeEdges = opts.precomputeEdges;
  this._reverseEdgeOrder = opts.reverseEdgeOrder;
  this.__populateEdges();
  if (this._precomputeEdges) {
    this.Subscribe('tileWeightUpdated', this, this.__onTileWeightUpdated.bind(this));
  }
}

SquareGrid.prototype = Object.create(Graph.prototype);
SquareGrid.constructor = SquareGrid;

SquareGrid.prototype.__populateEdges = function() {
  //console.time('SquareGrid.__populateEdges');
  var scope = this;
  this._dirIds = this._dirs.map(function(d) {
    return scope.toId(d[0],d[1]);
  });
  if (!this._precomputeEdges) return;

  var W = this.width;
  var H = this.height;
  if (!this._edges) {
    this._edges = []; // node id to list of node ids
    this._edgeWeights = []; // node id to list of edge weights
    for (var id = 0; id < this.numNodes; id++) {
      this._edges[id] = [];
      if (this.useEdgeWeights) {
        this._edgeWeights[id] = [];
      }
    }
  }
  for (var x = 0; x < W; x++) {
    for (var y = 0; y < H; y++) {
      var id = this.toId(x, y);
      scope._dirs.forEach(function (dir) {
        var x2 = x + dir[0], y2 = y + dir[1];
        if (scope.isTraversable(x2, y2)) {
          var id2 = scope.toId(x2, y2);
          scope._edges[id].push(id2);
          if (scope.useEdgeWeights) {
            scope._edgeWeights[id].push(scope.__computeEdgeWeight(dir, scope._weights[id2]));
          }
        }
      });
    }
  }
  //console.timeEnd('SquareGrid.__populateEdges');
};

SquareGrid.prototype.__computeEdgeWeight = function(dir, targetTileWeight) {
  return Math.sqrt((dir[0]*dir[0] + dir[1]*dir[1])*targetTileWeight);
};

SquareGrid.prototype.__onTileWeightUpdated = function(id, w, oldWeight) {
  var xy = this.fromId(id);
  //console.log('update tile weight', id, w, xy);
  if (!this.isValidCell(xy[0], xy[1])) {
    //console.log('Skipping invalid cell');
    return;
  }
  var scope = this;
  var cellIsOkay = this.isTraversable(xy[0], xy[1]);
  this._dirs.forEach(function (dir) {
    var x2 = xy[0] + dir[0], y2 = xy[1] + dir[1];
    // Update edges from (x2,y2) to (x1,y1)
    var id2 = scope.toId(x2,y2);
    if (scope.isValidCell(x2,y2)) {
      if (cellIsOkay) {
        scope.__addEdge(id2, id, scope.__computeEdgeWeight([-dir[0], -dir[1]], scope._weights[id2]));
      } else {
        scope.__removeEdge(id2, id);
      }
    }
  });
};

SquareGrid.prototype.__edgesFrom = function (id1) {
  var edges = [];
  var xy = this.fromId(id1);
  var scope = this;
  this._dirs.forEach(function (dir) {
    var x2 = xy[0] + dir[0], y2 = xy[1] + dir[1];
    if (scope.isTraversable(x2, y2)) {
      edges.push(scope.toId(x2,y2));
    }
  });
  return edges;
};

SquareGrid.prototype.edgesFrom = function (id1) {
  var edges = (this._precomputeEdges)? Graph.prototype.edgesFrom.call(this, id1) : this.__edgesFrom(id1);
  var xy = this.fromId(id1);
  if (this._reverseEdgeOrder) {
    if ((xy[0] + xy[1]) % 2 === 0) {
      // This is purely for aesthetic purposes on grids -- using a
      // checkerboard pattern, flip every other tile's edges so
      // that paths along diagonal lines end up stair stepping
      // instead of doing all east/west movement first and then
      // all north/south.
      edges.reverse();
    }
  }
  return edges;
};
// Encode/decode grid locations (x,y) to integers (id)
SquareGrid.prototype.isValidCell = function (x, y) { return 0 <= x && x < this.width && 0 <= y && y < this.height; };
SquareGrid.prototype.isTraversable = function (x, y) { return this.isValidCell(x,y) && this.tileWeight(this.toId(x,y)) !== Infinity; };
SquareGrid.prototype.toId = function (x, y) { return x + y * this.width; };
SquareGrid.prototype.fromId = function (id) { return [id % this.width, Math.floor(id / this.width)]; };
// Represent this grid as a serializable json object
SquareGrid.prototype.toJson = function () {
  var json = Graph.prototype.toJson.call(this);
  json['type'] = 'SquareGrid';
  json['width'] = this.width;
  json['height'] = this.height;
  delete json['edges']; // Don't need to have edges (we can recompute them since they are computed from the grid structure)
  return json;
};
SquareGrid.prototype.fromJson = function (json, opts) {
  opts = opts || {};
  Graph.prototype.fromJson.call(this, json, opts);
  this.width = json.width;
  this.height = json.height;
  this._dirs = opts.dirs || SquareGrid.DIRS;
  this.__populateEdges();
};
// Encode this grid as a set of pixels
SquareGrid.prototype.toPixels = function(key) {
  if (key) {
    if (this._tileAttributes[key]) {
      return {data: this._tileAttributes[key], width: this.width, height: this.height}
    }
  } else {
    return {data: this._weights, width: this.width, height: this.height};
  }
};
// Read pixels and use it to initialize the grid
SquareGrid.prototype.fromPixels = function(pixels, opts) {
  this.width = pixels.width;
  this.height = pixels.height;
  this._weights = pixels.data;
  this._dirs = opts.dirs || SquareGrid.DIRS;
  this.__populateEdges();
};
// To encoded
SquareGrid.prototype.toEncodedPixels = function(key, encodeFn) {
  var pixels = this.toPixels(key);
  var data = new Uint8Array(pixels.width*pixels.height*4);
  for (var i = 0; i < pixels.data.length; i++) {
    var d = pixels.data[i];
    var v = encodeFn(d);
    var j = i*4;
    data[j] = v[0];
    data[j+1] = v[1];
    data[j+2] = v[2];
    data[j+3] = v[3];
  }
  pixels.data = data;
  pixels.shape = [pixels.width, pixels.height, 4];
  return pixels;
};


// Interface of SquareGrid that don't require precomputation of edges
SquareGrid.prototype.distance = function (id1, id2) {
  var xy1 = this.fromId(id1);
  var xy2 = this.fromId(id2);
  var dx = xy2[0] - xy1[0];
  var dy = xy2[1] - xy1[1];
  var dir = [dx, dy];
  return Math.sqrt(dir[0]*dir[0] + dir[1]*dir[1]);
};

SquareGrid.prototype.edgeWeight = function (id1, id2) {
  if (this.useEdgeWeights && !this._precomputeEdges) {
    var xy1 = this.fromId(id1);
    var xy2 = this.fromId(id2);
    if (this.__hasEdgeXY(xy1, xy2)) {
      var dx = xy2[0] - xy1[0];
      var dy = xy2[1] - xy1[1];
      return this.__computeEdgeWeight([dx,dy], this._weights[id2]);
    } else {
      return Infinity;
    }
  } else {
    return Graph.prototype.edgeWeight.call(this, id1, id2);
  }
};
SquareGrid.prototype.__hasEdgeXY = function (xy1, xy2) {
  var dx = xy2[0] - xy1[0];
  var dy = xy2[1] - xy1[1];
  return this._dirIds.indexOf(this.toId(dx,dy)) >= 0 && this.isTraversable(xy2[0], xy2[1]);
};
// Is there an edge from id1 to id2?
function __ensureInt(x) { if (typeof x === 'string') { return parseInt(x); }}
SquareGrid.prototype.hasEdge = function (id1, id2) {
  return (this._precomputeEdges)? Graph.prototype.hasEdge.call(this, __ensureInt(id1), __ensureInt(id2)) : this.__hasEdgeXY(this.fromId(id1), this.fromId(id2));
};
// Index of edge
SquareGrid.prototype.edgeIndex = function (id1, id2) {
  return Graph.prototype.edgeIndex.call(this, __ensureInt(id1), __ensureInt(id2))
};
// All edges as a list of [id1, id2]
SquareGrid.prototype.allEdges = function () {
  if (this._precomputeEdges) {
    return Graph.prototype.allEdges.call(this);
  } else {
    var all = [];
    var W = this.width;
    var H = this.height;
    var scope = this;
    for (var x = 0; x < W; x++) {
      for (var y = 0; y < H; y++) {
        var id = this.toId(x, y);
        this._dirs.forEach(function (dir) {
          var x2 = x + dir[0], y2 = y + dir[1];
          if (scope.isTraversable(x2, y2)) {
            all.push([id, scope.toId(x2,y2)]);
          }
        });
      }
    }
    return all;
  }
};


SquareGrid.DIRS4 = [[1, 0], [0, 1], [-1, 0], [0, -1]];
SquareGrid.DIRS8 = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]];
SquareGrid.DIRS = SquareGrid.DIRS4;

module.exports = { Graph: Graph, SquareGrid: SquareGrid, CellAttribute: CellAttribute };
