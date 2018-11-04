// Adapted from search.js at http://www.redblobgames.com/pathfinding/
// Copyright 2014 Red Blob Games
// License: Apache v2
var _ = require('util/util');

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
    case 'Theta*':
      // See http://aigamedev.com/open/tutorial/lazy-theta-star/
      heuristic = heuristic || manhattan_grid_heuristic;
      searchOpts = new SearchOptions(starts, stopCondition, function (id, node) {
        node.h = heuristic(graph, exit.id, id);
        node.h_exit = exit.id; // for debugging
        return node.cost_so_far + 1.01 * node.h;
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

function PathFinder(options) {
}

PathFinder.heuristics = {
  'manhattan': manhattan_heuristic,
  'euclidean': euclidean_heuristic,
  'manhattan_grid': manhattan_grid_heuristic,
  'euclidean_grid': euclidean_grid_heuristic,
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
  while (s.frontier.length > 0) {
    if (!s._earlyExit) {
      s.steps++;
    } else {
      delete s._earlyExit;
    }
    // TODO: is this sort needed very time? can be expensive if frontier large...
    s.frontier.sort(function (a, b) {
      return map[a].sort_key === map[b].sort_key
        ? map[a].visit_order - map[b].visit_order
        : map[a].sort_key - map[b].sort_key;
    });
    s.current = s.frontier.shift();
    s.neighbors = graph.edgesFrom(s.current);
    if (options.exit_now && options.exit_now(s)) {
      // Early exit for state - set so we can restart from this state
      s._earlyExit = true;
      break;
    }
    s.neighbors.forEach(function (next) {
      //var new_cost_so_far = (map[s.current].cost_so_far + graph.edgeWeight(s.current, next));
      var new_cost_so_far = options.total_cost_fn(graph, map, s.current, next);
      if (!map[next]) {
        map[next] = { id: next };
      }
      if (!map[next].visited
        || (options.allow_reprioritize && map[next].visited && new_cost_so_far < map[next].cost_so_far)) {
        if (s.frontier.indexOf(next) < 0) {
          s.frontier.push(next);
        }
        map[next].steps = map[s.current].steps + 1;
        map[next].cost_so_far = new_cost_so_far;
        map[next].distance = map[s.current].distance + graph.distance(s.current, next);
        map[next].parent = s.current;
        map[next].visited = true;
        map[next].visit_order = visit_order++;
        map[next].sort_key = options.sort_key(next, map[next]);
      }
    });
  }
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
    path.push(cid);
    var cell = map[cid];
    if (cell) {
      cid = cell.parent;
    } else {
      cid = undefined;
    }
  }
  return path;
};

module.exports = PathFinder;
