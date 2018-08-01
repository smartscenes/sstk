// Adapted from search.js at http://www.redblobgames.com/pathfinding/
// Copyright 2014 Red Blob Games
// License: Apache v2
var _ = require('util');

function BinaryHeap(compare_fn, map) {
  this.content = [];
  this.compare_fn = compare_fn;
  this.map = map;
}

BinaryHeap.prototype = {
  push: function (element) {
    // Add the new element to the end of the array.
    this.content.push(element);
    // Allow it to bubble up.
    this.map[element].pos_in_heap = this.content.length - 1;
    this.bubbleUp(this.content.length - 1);
  },

  pop: function () {
    // Store the first element so we can return it later.
    var result = this.content[0];
    // Get the element at the end of the array.
    var end = this.content.pop();
    // If there are any elements left, put the end element at the
    // start, and let it sink down.
    if (this.content.length > 0) {
      this.content[0] = end;
      this.map[end].pos_in_heap = 0;
      this.sinkDown(0);
    }
    return result;
  },

  size: function () { return this.content.length; },

  bubbleUp: function (n) {
    // Fetch the element that has to be moved.
    var element = this.content[n];
    // When at 0, an element can not go up any further.
    while (n > 0) {
      // Compute the parent element's index, and fetch it.
      var parentN = Math.floor((n + 1) / 2) - 1,
        parent = this.content[parentN];
      // If the parent has a lesser score, things are in order and we
      // are done.
      if (this.compare_fn(parent, element) < 0)
        break;

      // Otherwise, swap the parent with the current element and
      // continue.
      this.content[parentN] = element;
      this.content[n] = parent;
      this.map[this.content[parentN]].pos_in_heap = parentN;
      this.map[this.content[n]].pos_in_heap = n;
      n = parentN;
    }
  },

  sinkDown: function (n) {
    // Look up the target element and its score.
    var length = this.content.length, element = this.content[n];

    while (true) {
      // Compute the indices of the child elements.
      var child2N = (n + 1) * 2, child1N = child2N - 1;
      // This is used to store the new position of the element,
      // if any.
      var swap = null;
      // If the first child exists (is inside the array)...
      var child1 = null;
      if (child1N < length) {
        // Look it up and compute its score.
        child1 = this.content[child1N];
        // If the score is less than our element's, we need to swap.
        if (this.compare_fn(child1, element) < 0)
          swap = child1N;
      }
      // Do the same checks for the other child.
      if (child2N < length) {
        var child2 = this.content[child2N];
        if ((swap != null && this.compare_fn(child2, child1) < 0) ||
          (swap == null && this.compare_fn(child2, element) < 0))
          swap = child2N;
      }

      // No need to swap further, we are done.
      if (swap == null)
        break;

      // Otherwise, swap and continue.
      this.content[n] = this.content[swap];
      this.content[swap] = element;
      this.map[this.content[n]].pos_in_heap = n;
      this.map[this.content[swap]].pos_in_heap = swap;

      n = swap;
    }
  }
};

function SearchState(steps, current, frontier, neighbors) {
  this.steps = steps;
  this.current = current;
  this.frontier = frontier;
  this.neighbors = neighbors;
}

function SearchOptions(starts, exit_now, sort_key, total_cost_fn) {
  if (starts === void 0) { starts = []; }
  this.starts = starts;
  this.exit_now = exit_now;
  this.sort_key = sort_key;
  // - starts (required) - list of start points
  // - exit_now function (optional) - return true if it's time to early exit
  // - sort_key (optional) - return a number for sorting the priority queue
  // - allow_reprioritize - true in general, but needs to be set to false for greedy best first search (ugly hack)
  this.allow_reprioritize = true;
  this.exit_now = this.exit_now || (function (_) { return false; });
  this.sort_key = this.sort_key || (function (id, node) { return node.cost_so_far; });
  this.total_cost_fn = total_cost_fn || compute_cost_basic;
}

SearchOptions.getSearchOptions = function(graph, starts, exit, algorithm, early_stop, heuristic) {
  var searchOpts;
  var stopCondition = (early_stop && exit) ? function (ss) { return exit.id === ss.current; } : null;
  switch (algorithm) {
    case 'BFS':
      searchOpts = new SearchOptions(starts, stopCondition, function (id, node) {
        return node.visit_order;
      });
      searchOpts.allow_reprioritize = false;
      break;
    case 'DFS':
      searchOpts = new SearchOptions(starts, stopCondition, function (id, node) {
        return graph.numNodes - node.visit_order;
      });
      searchOpts.allow_reprioritize = false;
      break;
    case 'Dijkstra':
      searchOpts = new SearchOptions(starts, stopCondition);
      break;
    case 'GreedyBest':
      heuristic = heuristic || manhattan_grid_heuristic;
      searchOpts = new SearchOptions(starts, stopCondition, function (id, node) {
        node.h = heuristic(graph, exit.id, id);
        node.h_exit = exit.id; // for debugging
        return node.h;
      });
      searchOpts.allow_reprioritize = false;
      break;
    case 'A*':
      heuristic = heuristic || manhattan_grid_heuristic;
      searchOpts = new SearchOptions(starts, stopCondition, function (id, node) {
        node.h = heuristic(graph, exit.id, id);
        node.h_exit = exit.id; // for debugging
        return node.cost_so_far + 1.01 * node.h;
      });
      break;
    case 'theta*':
      heuristic = heuristic || manhattan_grid_heuristic;
      searchOpts = new SearchOptions(starts, stopCondition, function (id, node) {
        node.h = heuristic(graph, exit.id, id);
        node.h_exit = exit.id; // for debugging
        return node.cost_so_far + 1.00 * node.h;
      }, compute_cost_theta_star);
      break;
    default:
      console.error("Unsupported search algorithm: " + algorithm);
  }
  return searchOpts;
};

// Predefined distance heuristics (lower bound on distance)
function manhattan_grid_heuristic(graph, goal, current) {
  var xy0 = graph.fromId(goal);
  var xy1 = graph.fromId(current);
  var sum = 0;
  for (var i = 0; i < xy0.length; i++) {
    sum += Math.abs(xy0[i] - xy1[i]);
  }
  return sum;
}

function manhattan_grid2d_heuristic(graph, goal, current) {
  var xy0 = graph.fromId(goal);
  var xy1 = graph.fromId(current);
  var dx = Math.abs(xy0[0] - xy1[0]);
  var dy = Math.abs(xy0[1] - xy1[1]);
  //console.log('h', xy0, xy1, dx, dy, dx+dy);
  return dx + dy;
}

var sqrt2minus1 = Math.sqrt(2) - 1;
function octile_grid2d_heuristic(graph, goal, current) {
  var xy0 = graph.fromId(goal);
  var xy1 = graph.fromId(current);
  var dx = Math.abs(xy0[0] - xy1[0]);
  var dy = Math.abs(xy0[1] - xy1[1]);
  //console.log('h', xy0, xy1, dx, dy, Math.max(dx,dy) + sqrt2minus1*Math.min(dx,dy));
  return Math.max(dx,dy) + sqrt2minus1*Math.min(dx,dy);
}

function euclidean_grid_heuristic(graph, goal, current) {
  var xy0 = graph.fromId(goal);
  var xy1 = graph.fromId(current);
  var sum = 0;
  for (var i = 0; i < xy0.length; i++) {
    var d = xy0[i] - xy1[i];
    sum += d*d;
  }
  return Math.sqrt(sum);
}

function manhattan_heuristic(graph, goal, current) {
  var pos1 = graph.idToPosition(goal);
  var pos2 = graph.idToPosition(current);
  return Math.abs(pos1[0] - pos2[0]) + Math.abs(pos1[1] - pos2[1]) + Math.abs(pos1[2] - pos2[2]);
}

function euclidean_heuristic(graph, goal, current) {
  var pos1 = graph.idToPosition(goal);
  var pos2 = graph.idToPosition(current);
  var dx = pos1[0] - pos2[0];
  var dy = pos1[1] - pos2[1];
  var dz = pos1[2] - pos2[2];
  return Math.sqrt(dx*dx + dy*dy + dz*dz);
}

// When considering cell si, compute the cost of going from start to its neighbor ni by going through si
function compute_cost_basic(graph, map, si, ni) {
  var new_cost_so_far = map[si].cost_so_far + graph.edgeWeight(si, ni);
  return new_cost_so_far;
}

// When considering cell si, compute the cost of going from start to its neighbor ni by
//  going through si         (path1)
//  going through parent(si) (path2)
function compute_cost_theta_star(graph, map, si, ni) {
  var new_cost_so_far;
  var pi = map[si].parent;
  var lineOfSightInfo = (pi != undefined)? graph.getLinePathInfoById(pi, ni) : null;
  if (lineOfSightInfo && lineOfSightInfo.isTraversable) {
    new_cost_so_far = map[pi].cost_so_far + lineOfSightInfo.weight;
  } else {
    new_cost_so_far = map[si].cost_so_far + graph.edgeWeight(si, ni);
  }
  return new_cost_so_far;
}

function grid2d_straight_line_heuristic(graph, goal, current) {
  var xy0 = graph.fromId(goal);
  var xy1 = graph.fromId(current);
  var sum = 0;
  for (var i = 0; i < 2; i++) {
    var d = xy0[i] - xy1[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

function PathFinder(options) {
}

PathFinder.heuristics = {
  'manhattan': manhattan_heuristic,
  'euclidean': euclidean_heuristic,
  'manhattan_grid': manhattan_grid_heuristic,
  'euclidean_grid': euclidean_grid_heuristic,
  'grid2d_straight_line' : grid2d_straight_line_heuristic,
  'manhattan_grid2d': manhattan_grid2d_heuristic,
  'octile_grid2d': octile_grid2d_heuristic
};

PathFinder.prototype.search = function(starts, end, graph, map, searchState, heuristic) {
  var options = SearchOptions.getSearchOptions(graph, starts, { id: end }, 'A*', true, heuristic);
  options['searchState'] = searchState;
  return this.__search(options, graph, map);
};

// graph is immutable graph with edges and costs
// map is updated during the search to keep track of the costs
PathFinder.prototype.__search = function(options, graph, map) {
  var s = options.searchState;
  if (!s) {
    // Create new search state (don't start from previous search state)
    //console.log('Creating new search state');
    _.forEach(map, function(mentry,id) {
      if (mentry) {
        mentry.visited = false;
      }
    });
    s = new SearchState(0, -1, options.starts.concat(), []);
    s.frontier.forEach(function (id, i) {
      if (!map[id]) {
        map[id] = {id: id};
      }
      map[id].steps = 0;
      map[id].cost_so_far = 0;
      map[id].distance = 0;
      map[id].visited = true;
      map[id].visit_order = i;
      map[id].sort_key = options.sort_key(id, map[id]);
    });
    s.visit_order = s.frontier.length;
  } else {
    //console.log('Starting from previous search state');
    // Need to adjust previous search state if our exit id has changed...
    // Recompute frontier sort_key....
    s.frontier.forEach(function (id, i) {
      map[id].sort_key = options.sort_key(id, map[id]);
    });
  }
  if (options.exit_now && options.exit_now(s)) {
    return s;
  }
  // For stable sorting, we keep a counter for the elements inserted into the frontier;
  // this is used for breaking ties in the priority queue key
  var visit_order = s.visit_order;
  var heap = new BinaryHeap(function (a, b) {
    return map[a].sort_key === map[b].sort_key
      ? map[a].visit_order - map[b].visit_order
      : map[a].sort_key - map[b].sort_key;
  }, map);
  s.frontier.forEach(function (e) {
    heap.push(e);
    map[e].in_heap = true;
  });

  while (heap.size() > 0) {
    if (!s._earlyExit) {
      s.steps++;
    } else {
      delete s._earlyExit;
    }

    s.current = heap.pop();
    map[s.current].in_heap = false;
    s.neighbors = graph.edgesFrom(s.current);
    if (options.exit_now && options.exit_now(s)) {
      // Early exit for state - set so we can restart from this state
      s._earlyExit = true;
      break;
    }
    s.neighbors.forEach(function (next) {
      var new_cost_so_far = (map[s.current].cost_so_far + graph.edgeWeight(s.current, next));
      if (!map[next]) {
        map[next] = { id: next, in_heap: false };
      }
      if (!map[next].visited
        || (options.allow_reprioritize && map[next].visited && new_cost_so_far < map[next].cost_so_far)) {

        map[next].steps = map[s.current].steps + 1;
        map[next].cost_so_far = new_cost_so_far;
        map[next].distance = map[s.current].distance + graph.distance(s.current, next);
        map[next].parent = s.current;
        map[next].visited = true;
        map[next].visit_order = visit_order++;
        map[next].sort_key = options.sort_key(next, map[next]);
        if (map[next].in_heap !== true) {
          heap.push(next);
          map[next].in_heap = true;
        } else {
          heap.bubbleUp(map[next].pos_in_heap);
        }
      }
    });
  }
  s.frontier = heap.content;

  s.visit_order = visit_order;
  if (s.frontier.length === 0 && s.steps > 1) {
    // Clear internal state
    s.current = -1;
    s.neighbors = [];
  }
  return s;
};

/* http://aigamedev.com/open/tutorials/theta-star-any-angle-paths/ */
PathFinder.prototype.theta_star_search = function (starts, end, graph, map,
  searchState, heuristic) {
  var options = SearchOptions.getSearchOptions(
    graph, starts, { id: end }, 'theta*', true,
    PathFinder.heuristics.grid2d_straight_line);
  options['searchState'] = searchState;
  return this.__theta_star(options, graph, map);
};

/* http://eugen.dedu.free.fr/projects/bresenham/ */
function use_vision_line(grid, x1, y1, x2, y2) {
  var xstep = 1, ystep = 1;
  var error, errorprev;
  var y = y1, x = x1;
  var ddy, ddx;
  var dx = x2 - x1;
  var dy = y2 - y1;

  if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
    return true;
  }

  if (dy < 0) {
    dy = -dy;
    ystep = -1;
  }

  if (dx < 0) {
    dx = -dx;
    xstep = -1;
  }

  ddy = 2 * dy;
  ddx = 2 * dx;

  if (ddx >= ddy) {
    errorprev = dx;
    error = dx;
    for (var i = 0; i < dx; i++) {
      x += xstep;
      error += ddy;
      if (error > ddx) {
        y += ystep;
        error -= ddx;

        if (error + errorprev < ddx) {
          if (!grid.isTraversable(x, y - ystep)) {
            return false;
          }
        } else if (error + errorprev > ddx) {
          if (!grid.isTraversable(x - xstep, y)) {
            return false;
          }
        } else {
          if (!grid.isTraversable(x, y - ystep)) {
            return false;
          }

          if (!grid.isTraversable(x - xstep, y)) {
            return false;
          }
        }
      }

      if (!grid.isTraversable(x, y)) {
        return false;
      }

      errorprev = error;
    }
  } else {
    errorprev = dy;
    error = dy;
    for (var i = 0; i < dy; i++) {
      y += ystep;
      error += ddx;
      if (error > ddy) {
        x += xstep;
        error -= ddy;

        if (error + errorprev < ddy) {
          if (!grid.isTraversable(x - xstep, y)) {
            return false;
          }
        } else if (error + errorprev > ddy) {
          if (!grid.isTraversable(x, y - ystep)) {
            return false;
          }
        } else {
          if (!grid.isTraversable(x - xstep, y)) {
            return false;
          }

          if (!grid.isTraversable(x, y - ystep)) {
            return false;
          }
        }
      }

      if (!grid.isTraversable(x, y)) {
        return false;
      }

      errorprev = error;
    }
  }

  return true;
}

function line_of_sight(graph, s, sprime) {
  var xy0 = graph.fromId(s);
  var xy1 = graph.fromId(sprime);

  var x0 = xy0[0], y0 = xy0[1];
  var x1 = xy1[0], y1 = xy1[1];

  return use_vision_line(graph, x0, y0, x1, y1);
}

// graph is immutable graph with edges and costs
// map is updated during the search to keep track of the costs
PathFinder.prototype.__theta_star = function (options, graph, map) {
  var s = options.searchState;
  if (!s) {
    // Create new search state (don't start from previous search state)
    // console.log('Creating new search state');
    _.forEach(map, function (mentry, id) {
      if (mentry) {
        mentry.in_open = false;
        mentry.in_closed = false;
      }
    });
    s = new SearchState(0, -1, options.starts.concat(), []);
    s.frontier.forEach(function (id, i) {
      if (!map[id]) {
        map[id] = { id: id };
      }
      map[id].steps = 0;
      map[id].cost_so_far = 0;
      map[id].distance = 0;
      map[id].visited = true;
      map[id].visit_order = i;
      map[id].sort_key = options.sort_key(id, map[id]);
      map[id].parent = id;
    });
    s.visit_order = s.frontier.length;
  } else {
    // console.log('Starting from previous search state');
    // Need to adjust previous search state if our exit id has changed...
    // Recompute frontier sort_key....
    s.frontier.forEach(function (id, i) {
      map[id].sort_key = options.sort_key(id, map[id]);
    });
  }
  if (options.exit_now && options.exit_now(s)) {
    return s;
  }
  // For stable sorting, we keep a counter for the elements inserted into the
  // frontier;
  // this is used for breaking ties in the priority queue key
  var visit_order = s.visit_order;
  var openset = new BinaryHeap(function (a, b) {
    return map[a].sort_key === map[b].sort_key
      ? map[a].visit_order - map[b].visit_order
      : map[a].sort_key - map[b].sort_key;
  }, map);
  s.frontier.forEach(function (e) {
    openset.push(e);
    map[e].in_open = true;
  });

  while (openset.size() > 0) {
    if (!s._earlyExit) {
      s.steps++;
    } else {
      delete s._earlyExit;
    }
    s.current = openset.pop();
    map[s.current].in_open = false;
    map[s.current].in_closed = true;
    s.neighbors = graph.edgesFrom(s.current);

    if (!line_of_sight(graph, map[s.current].parent, s.current)) {
      var _best_cost = Infinity;
      var _parent = null;
      s.neighbors.forEach(function (sprime) {
        if (map[sprime] && map[sprime].in_closed === true) {
          var _cost = map[sprime].cost_so_far +
            graph.edgeWeight(sprime, s.current);
          if (_cost < _best_cost) {
            _best_cost = _cost;
            _parent = sprime;
          }
        }
      });
      map[s.current].steps = map[_parent].steps + 1;
      map[s.current].cost_so_far = _best_cost;
      map[s.current].distance =
        map[_parent].distance + graph.distance(_parent, s.current);
      map[s.current].parent = _parent;
      map[s.current].sort_key =
        options.sort_key(s.current, map[s.current]);
    }

    if (options.exit_now && options.exit_now(s)) {
      // Early exit for state - set so we can restart from this state
      s._earlyExit = true;
      break;
    }

    s.neighbors.forEach(function (next) {
      if (!map[next] || !map[next].in_closed) {
        if (!map[next] || !map[next].in_open) {
          map[next] = {
            id: next,
            parent: undefined,
            cost_so_far: Infinity,
            in_open: false,
            in_closed: false
          };
        }
        // update_vertex
        var _parent = map[s.current].parent;
        var new_cost =
          map[_parent].cost_so_far + graph.edgeWeight(_parent, next);

        if (map[next].in_open === false ||
          new_cost < map[next].cost_so_far) {
          map[next].steps = map[_parent].steps + 1;
          map[next].cost_so_far = new_cost;
          map[next].distance =
            map[_parent].distance + graph.distance(_parent, next);
          map[next].parent = _parent;
          map[next].visit_order = visit_order++;
          map[next].sort_key = options.sort_key(next, map[next]);

          if (map[next].in_open === false) {
            openset.push(next);
            map[next].in_open = true;
          } else {
            openset.bubbleUp(map[next].pos_in_heap);
          }
        }
      }
    });
  }
  s.frontier = openset.content;

  s.visit_order = visit_order;
  if (s.frontier.length === 0 && s.steps > 1) {
    // Clear internal state
    s.current = -1;
    s.neighbors = [];
  }

  return s;
};

// Returns path using map from cell
PathFinder.prototype.getPath = function(map, cellId) {
  var path = [];
  var cid = cellId;
  while (cid !== undefined) {
    var cell = map[cid];
    if (cell === undefined) {
      break;
    }
    path.push(cid);
    var _parent = cell.parent;
    if (_parent !== cid) {
      cid = _parent;
    } else {
      cid = undefined;
    }
  }
  return path;
};

module.exports = PathFinder;
