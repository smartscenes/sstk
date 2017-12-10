function __getCostFn(opts) {
  // Defaults
  var costFn = opts.cost || function(x,y) {
      return (x == y)? 0 : 1;
    };

  if (opts.cache) {
    var uncachedCostFn = costFn;
    var cache = new Map();
    costFn = function(x,y) {
      var key = opts.cacheKey(x) + ':' + opts.cacheKey(y);
      var v = cache.get(key);
      if (v == undefined) {
        cache.set(key, uncachedCostFn(x, y));
        v = cache.get(key);
      }
      //console.log('cost: ' + key + ' ' + v);
      return v;
    };
  }

  return costFn;
}

function levenshteinAlign(a1, a2, opts) {
  opts = opts || {};
  var defaultValue = opts.defaultValue || 0;
  var costOnly = opts.costOnly; // Only return cost
  var costFn = __getCostFn(opts);

  // Levenstein alignment
  var l1 = a1.length+1;
  //var l2 = a2.length+1;
  var d0 = new Float64Array(l1);
  var d1 = new Float64Array(l1);
  d0.fill(defaultValue);

  var align0 = [];
  var align1 = [];
  align0[0] = [];
  for (var i = 0; i < a1.length; i++) {
    var s = costFn(a1[i], null) + d0[i];
    d0[i+1] = s; // d[i,0] = s
    if (!costOnly) {
      align0[i + 1] = align0[i].concat([[i, -1]]);
    }
  }

  for (var j = 0; j < a2.length; j++) {
    if (opts.debug) {
      console.log(d0);
      console.log(align0[a1.length]);
    }
    var s = costFn(null, a2[j]) + d0[0];
    d1[0] = s;  // d[0,j+1] = s
    if (!costOnly) {
      align1[0] = align0[0].concat([[-1, j]]);
    }
    for (var i = 0; i < a1.length; i++) {
      var subCost0 = costFn(a1[i], a2[j]);
      var subCost = subCost0 + d0[i];  // d[i, j]
      var delCost0 = costFn(a1[i], null);
      var delCost = delCost0 + d1[i]; // d[i, j+1]
      var insCost0 = costFn(null, a2[j]);
      var insCost = insCost0 + d0[i+1]; // d[i+1, j]
      // Take min of del/ins/sub
      var s = subCost;
      if (s < delCost && s < insCost) {
        if (!costOnly) {
          align1[i + 1] = align0[i].concat([[i, j, subCost0]]);
        }
      } else if (delCost < insCost) {
        s = delCost;
        if (!costOnly) {
          align1[i+1] = align1[i].concat([[i,-1, delCost0]]);
        }
      } else {
        s = insCost;
        if (!costOnly) {
          align1[i + 1] = align0[i + 1].concat([[-1, j, insCost0]]);
        }
      }
      // Update d1
      d1[i+1] = s; // d[i+1, j+1] = s
    }
    for (var i = 0; i <= a1.length; i++) {
      d0[i] = d1[i];
      if (!costOnly) {
        align0[i] = align1[i];
      }
    }
  }
  if (opts.debug) {
    console.log(d1);
    console.log(align1[a1.length]);
  }
  var finalCost = d1[a1.length];
  if (costOnly) {
    return finalCost;
  } else {
    return {alignment: align1[a1.length], cost: finalCost};
  }
}

function greedyMatch(a1, a2, opts) {
  opts = opts || {};
  var defaultValue = opts.defaultValue || 0;
  var costOnly = opts.costOnly; // Only return cost
  var costFn = __getCostFn(opts);

  var alignment = [];
  var finalCost = defaultValue;
  for (var i = -1; i < a1.length; i++) {
    var bestCost = undefined;
    var bestCostIndex = -1;
    for (var j = -1; j < a2.length; j++) {
      var cost = costFn(i >= 0? a1[i] : null, j >= 0? a2[j] : null);
      if ((i >= 0 || j >= 0) && (bestCost == undefined || cost < bestCost)) {
        bestCost = cost;
        bestCostIndex = j;
      }
    }
    if (i >= 0 || bestCostIndex >= 0) {
      //console.log('cost: ' + bestCost + ', [i,j]' + i + ',' + bestCostIndex);
      alignment.push([i, bestCostIndex, bestCost]);
      finalCost += bestCost;
    }
  }

  if (costOnly) {
    return finalCost;
  } else {
    return {alignment: alignment, cost: finalCost};
  }
}

function getAlignment(a1, a2, opts) {
  opts = opts || {};
  if (opts.alignBy === 'greedy') {
    return greedyMatch(a1,a2,opts);
  } else if (opts.alignBy === 'levenshtein' || !opts.alignBy) {
    return levenshteinAlign(a1,a2,opts);
  } else {
    throw 'Unknown alignBy option: ' + opts.alignBy;
  }
}

module.exports = {
  getAlignment: getAlignment
};