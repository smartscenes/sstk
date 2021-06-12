const DSUtils = {};

/**
 * Compute which parts is connected to which other parts
 * @param partIndices {int[]}
 * @param isConnected {function(int, int): boolean} Function that returns if part i and part j are connected
 * @returns {Array<Array<int>>} Array of connected component (each represented as array of part ids)
 */
DSUtils.identifyConnectedComponents = function(partIndices, isConnected) {
  let components = [];
  let remaining = partIndices.slice();
  while (remaining.length > 0) {
    let connected = [remaining.shift()];
    let done = false;
    while (!done) {
      let rest = [];
      for (let i = 0; i < remaining.length; i++) {
        const di = remaining[i];
        let added = false;
        for (let j = 0; j < connected.length; j++) {
          const dj = connected[j];
          if (isConnected(di, dj)) {
            connected.push(di);
            added = true;
            break;
          }
        }
        if (!added) {
          rest.push(di);
        }
      }
      done = (rest.length === remaining.length); // Nothing was added
      remaining = rest;
    }
    components.push(connected);
  }

  return components;
};

/**
 * Compute which parts is connected to which other parts
 * @param partIndices {int[]}
 * @param distanceMatrix Array<Array[number]> Array where element i,j contains distance from part i to part j
 * @param distanceThreshold {number} Treat anything less than this as connected
 * @param getDistanceFn {function(x)} Extract distance from distance matrix
 * @returns {Array<Array<int>>} Array of connected component (each represented as array of part ids)
 */
DSUtils.identifyConnectedComponentsFromDistanceMatrix = function(partIndices, distanceMatrix, distanceThreshold, getDistanceFn) {
  return DSUtils.identifyConnectedComponents(partIndices, (di,dj) => {
    const dist = distanceMatrix.get(di, dj);
    if (getDistanceFn) {
      return (getDistanceFn(dist) < distanceThreshold);
    } else {
      return (dist < distanceThreshold);
    }
  });
};

/**
 * Compute which parts is connected to which other parts
 * @param parts {Array}
 * @param partIndices {int[]}
 * @param distanceMatrix Array<Array[number]> Array where element i,j contains distance from part i to part j
 * @param distanceThreshold {number} Treat anything less than this as connected
 * @param distanceFn {function(i,j)} Compute distance between part i and part j
 * @param getDistanceFn {function(x)} Extract distance from distance matrix
 * @returns {Array<Array<int>>} Array of connected component (each represented as array of part ids)
 */
DSUtils.identifyConnectedComponentsWithCachedDistanceMatrix = function(parts, partIndices, distanceMatrix,
                                                                       distanceThreshold, distanceFn, getDistanceFn) {
  return DSUtils.identifyConnectedComponents(partIndices, (di,dj) => {
    let dist = distanceMatrix.get(di, dj);
    if (dist == null) {
      dist = distanceFn(parts[di], parts[dj]);
      distanceMatrix.put(di,dj, dist);
    }
    if (getDistanceFn) {
      return (getDistanceFn(dist) < distanceThreshold);
    } else {
      return (dist < distanceThreshold);
    }
  });
};


module.exports = DSUtils;

