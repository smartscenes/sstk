var SquareGrid = require('nav/Graph').SquareGrid;

/**
 * A grid of squares, to be used as a graph. Distance is in action space!
 * The class creates the structure of the grid; the client can directly set the weights on nodes.
 * @param W {int} Width of grid
 * @param H {int} Height of grid
 * @param opts.dirs What directions each cell has neighbors
 * @param opts.precomputeEdges {boolean} Whether edges should be precomputed (this is deprecated and to be removed)
 * @param opts.reverseEdgeOrder {boolean} Whether edge order should be reversed for nice alternating stair case pattern
 * @extends nav.Graph
 * @constructor
 * @memberOf nav
 */
function ActionGrid(W, H, opts) {
    opts = opts || {};
    SquareGrid.call(this, W, H, opts);
    this.dirs = this._dirs;
    this._n_dirs = this._dirs.length;
    this._rots = (opts.nrots !== undefined) ? opts.nrots : 40;

    this.refinement_factor =
        (opts.refinement_factor !== undefined) ? opts.refinement_factor : 6.0;

    this._cells_per_step = this.refinement_factor;

    this.lvl_stride = this.numNodes;
    this._lvl_stride = this.numNodes;
}

ActionGrid.prototype = Object.create(SquareGrid.prototype);
ActionGrid.constructor = ActionGrid;

ActionGrid.prototype.make_grid_finer = function () {
    new_weights = [];
    var W = this.width;
    var H = this.height;

    for (var y = 0; y < H * this.refinement_factor; y++) {
        var old_y = Math.floor(y / this.refinement_factor);
        for (var x = 0; x < W * this.refinement_factor; x++) {
            var old_x = Math.floor(x / this.refinement_factor);
            var old_id = old_x + old_y * W;
            new_weights.push(this._weights[old_id]);
        }
    }

    this._weights = new_weights;
    this.numNodes = this._weights.length;
    this.width *= this.refinement_factor;
    this.height *= this.refinement_factor;

    this.lvl_stride = this.numNodes;
    this._lvl_stride = this.numNodes;

    this.cellSize /= this.refinement_factor;
    console.log('CELL SIZE: ' + this.cellSize);

    var dirs = [];
    for (var r = 0; r < 2.0 * Math.PI; r += 2.0 * Math.PI / this._rots) {
        dirs.push([
            Math.round(Math.cos(r) * this._cells_per_step),
            Math.round(Math.sin(r) * this._cells_per_step)
        ]);
    }
    this.dirs = dirs;
    this._dirs = dirs;
    this._n_dirs = dirs.length;

    console.log('NUM DIRS: ' + this._n_dirs);
};

function _dot(d1, d2) {
    var v = 0.0;
    for (var i = 0; i < d1.length; i++) {
        v += d1[i] * d2[i];
    }
    return v;
}

function _mag(d) {
    var v = 0.0;
    for (var i = 0; i < d.length; i++) {
        v += d[i] * d[i];
    }
    return Math.sqrt(v);
}

var __eps = 1e-8;
var __1_minus_eps = 1.0 - __eps;
function _angular_distance(d1, d2) {
    var angle = Math.acos(
        Math.max(Math.min(_dot(d1, d2) / (_mag(d1) * _mag(d2)), __1_minus_eps),
            -__1_minus_eps));
    return angle / Math.PI;
}

ActionGrid.prototype.__computeEdgeWeight = function (id1, id2,
                                                     targetTileWeight) {
    return 1.0 * targetTileWeight;

    var xyd1 = this.fromId(id1);
    var xyd2 = this.fromId(id2);
    var trans = [xyd2[0] - xyd1[0], xyd2[1] - xyd1[1]];
    var angle_dist = _angular_distance(xyd1[2], xyd2[2]);
    console.assert(angle_dist >= 0.0 && angle_dist <= 1.0);

    return (_mag(trans) + angle_dist * this._rots / 2.0) * targetTileWeight;
};

ActionGrid.prototype.__edgesFrom = function (id1) {
    var edges = [];
    var lvl = Math.floor(id1 / this._lvl_stride);
    var xy_id = id1 % this._lvl_stride;

    var lvl1 = lvl - 1;
    if (lvl1 < 0) {
        lvl1 = this._n_dirs + lvl1;
    }
    edges.push(lvl1 * this._lvl_stride + xy_id);

    var lvl2 = lvl + 1;
    if (lvl2 >= this._n_dirs) {
        lvl2 = lvl2 - this._n_dirs;
    }
    edges.push(lvl2 * this._lvl_stride + xy_id);

    var xy = this.fromId(id1);
    var dir = xy[2];
    var x2 = xy[0] + dir[0], y2 = xy[1] + dir[1];
    if (this.isTraversable(x2, y2)) {
        edges.push(this.toId(x2, y2, dir));
    }

    /* edges = [];
    var scope = this;
    this._dirs.forEach(function(dir) {
        var x2 = xy[0] + dir[0], y2 = xy[1] + dir[1];
        if (scope.isTraversable(x2, y2)) {
            edges.push(scope.toId(x2, y2, dir));
        }
    }); */

    return edges;
};

ActionGrid.prototype.edgesFrom = function (id1) {
    var edges = this.__edgesFrom(id1);
    return edges;
};

ActionGrid.prototype.toId = function (x, y, dir) {
    var lvl = 0;
    if (dir == null) {
        lvl = 0;
    } else {
        var dists =
            _.map(this.dirs, function (d) { return _angular_distance(d, dir); });

        var best_dist = 1.0;
        for (var i = 0; i < dists.length; i++) {
            var d = dists[i];
            if (d < best_dist) {
                lvl = i;
                best_dist = d;
            }
        }
    }

    return lvl * this._lvl_stride + SquareGrid.prototype.toId.call(this, x, y);
};

ActionGrid.prototype.fromId = function (id) {
    var lvl = Math.floor(id / this._lvl_stride);

    console.assert(lvl >= 0 && lvl < this._n_dirs, lvl, this._n_dirs);

    id = id % this._lvl_stride;
    var xy = SquareGrid.prototype.fromId.call(this, id);
    xy[2] = this.dirs[lvl];
    return xy;
};

ActionGrid.prototype.fromJson = function (json, opts) {
    opts = opts || {};
    SquareGrid.prototype.fromJson.call(this, json, opts);

    this.dirs = this._dirs;
    this._n_dirs = this.dirs.length;

    this.lvl_stride = this.numNodes;
    this._lvl_stride = this.numNodes;
};
ActionGrid.prototype.tileWeight = function (id) {
    id = id % this._lvl_stride;
    return this._weights[id];
};
ActionGrid.prototype.setTileWeight = function (id, w) {
    id = id % this._lvl_stride;
    this._weights[id] = w;
};

// Interface of SquareGrid that don't require precomputation of edges
ActionGrid.prototype.distance = function (id1, id2) {
    var xy1 = this.fromId(id1);
    var xy2 = this.fromId(id2);
    var dx = xy2[0] - xy1[0];
    var dy = xy2[1] - xy1[1];
    var dir = [dx, dy];
    return Math.sqrt(dir[0] * dir[0] + dir[1] * dir[1]);
};

ActionGrid.prototype.edgeWeight = function (id1, id2) {
    return this.__computeEdgeWeight(id1, id2, this.tileWeight(id2));
};

module.exports = ActionGrid;
