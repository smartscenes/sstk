const Object3DUtil = require('geo/Object3DUtil');
const Distances = require('geo/Distances');
const MeshIntersections = require('geo/MeshIntersections');
const MeshSampling = require('geo/MeshSampling');

class ConnectivityGraphHelper {
  /**
   * Compute minimum distance between two parts
   * @param part1 {THREE.Mesh}
   * @param part2 {THREE.Mesh}
   * @param minDist {number} Treat anything less than this as 0
   * @param maxDist {number} Treat anything more than this as too far
   * @returns {number} Return distance between the two parts
   */
  static computeMinDistance(part1, part2, minDist, maxDist) {
    const bbox1 = Object3DUtil.getBoundingBox(part1);
    const bbox2 = Object3DUtil.getBoundingBox(part2);
    const bbDist = bbox1.distanceTo(bbox2);
    if (bbDist <= maxDist) {
      let d = Distances.computeDistance(part1, part2, { shortCircuit: { minDistSq: minDist*minDist, maxDistSq: maxDist*maxDist } });
      return Math.sqrt(d.distanceSq);
    } else {
      return Infinity;
    }
  }

  /**
   * Compute minimum distance between two parts with additional information
   * @param part1 {THREE.Mesh}
   * @param part2 {THREE.Mesh}
   * @param minDist {number} Treat anything less than this as 0
   * @param maxDist {number} Treat anything more than this as too far
   * @returns { {distance: number} } Return distance information between the two parts
   */
  static computeMinDistanceWithInfo(part1, part2, minDist, maxDist) {
    const bbox1 = Object3DUtil.getBoundingBox(part1);
    const bbox2 = Object3DUtil.getBoundingBox(part2);
    const bbDist = bbox1.distanceTo(bbox2);
    if (bbDist <= maxDist) {
      let d = Distances.computeDistance(part1, part2, { shortCircuit: { minDistSq: minDist*minDist, maxDistSq: maxDist*maxDist }, all: true });
      d.distance = Math.sqrt(d.distanceSq);
      return d;
    } else {
      return { distance: Infinity };
    }
  }

  /**
   * Compute distance matrix between two parts
   * @param parts {THREE.Mesh[]}
   * @param minDist {number} Treat anything less than this as 0
   * @param maxDist {number} Treat anything more than this as too far
   * @returns {Array<Array<number>>} Return array where element i,j contains distance from part i to part j
   */
  static computeDistancesMatrix(parts, minDist, maxDist) {
    console.time('computeDistancesMatrix');
    // For every pair of parts, compute the distance between the two parts
    let distances = [];
    for (let i = 0; i < parts.length; i++) {
      distances[i] = [];
      for (let j = 0; j < i; j++) {
        if (parts[i] && parts[j]) {
          let name = 'distance-' + parts[i].name + '-' + parts[j].name;
          console.time(name);
          distances[i][j] = ConnectivityGraphHelper.computeMinDistance(parts[i], parts[j], minDist, maxDist);
          console.log(name, distances[i][j]);
          console.timeEnd(name);
        }
      }
    }
    console.timeEnd('computeDistancesMatrix');
    return distances;
  }

  /**
   * Compute distance matrix between two parts with additional information such as closest points between the two parts
   * @param parts {THREE.Mesh[]}
   * @param minDist {number} Treat anything less than this as 0
   * @param maxDist {number} Treat anything more than this as too far
   * @returns { {distances: Array<Array<number>>, closestPoints: Array<Array<THREE.Vector3, THREE.Vector3>>} }
   *   Return object where distances is array with element i,j contains distance from part i to part j
   *                 and closestPoints is array with element i,j contains closestPoints from part i to part j
   */
  static computeDistancesMatrixWithInfo(parts, minDist, maxDist) {
    console.time('computeDistancesMatrix');
    // For every pair of parts, compute the distance between the two parts
    let distances = [];
    let closestPoints = [];
    for (let i = 0; i < parts.length; i++) {
      distances[i] = [];
      closestPoints[i] = [];
      for (let j = 0; j < i; j++) {
        if (parts[i] && parts[j]) {
          let name = 'distance-' + parts[i].name + '-' + parts[j].name;
          console.time(name);
          let distInfo = ConnectivityGraphHelper.computeMinDistanceWithInfo(parts[i], parts[j], minDist, maxDist);
          distances[i][j] = distInfo.distance;
          if (distInfo.distance < Infinity) {
            closestPoints[i][j] = [ distInfo.closestPoint0, distInfo.closestPoint1 ];
          }
          console.log(name, distances[i][j]);
          console.timeEnd(name);
        }
      }
    }
    console.timeEnd('computeDistancesMatrix');
    return { distances: distances, closestPoints: closestPoints };
  }

  /**
   * Compute which parts is connected to which other parts
   * @param parts {THREE.Mesh[]}
   * @param isConnected {function(int, int): boolean} Function that returns if part i and part j are connected
   * @returns {Array<Array<int>>} Array of connected component (each represented as array of part ids)
   */
  static identifyConnectedComponents(parts, isConnected) {
    console.time('identifyConnectedComponents');
    let components = [];
    let remaining = [];
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] && parts[i].name !== 'unknown') {
        remaining.push(i);
      }
    }
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

    console.timeEnd('identifyConnectedComponents');
    return components;
  }

  /**
   * Compute which parts is connected to which other parts
   * @param parts {THREE.Mesh[]}
   * @param distanceMatrix Array<Array[number]> Array where element i,j contains distance from part i to part j
   * @param distanceThreshold {number} Treat anything less than this as connected
   * @returns {Array<Array<int>>} Array of connected component (each represented as array of part ids)
   */
  static identifyConnectedComponentsFromDistanceMatrix(parts, distanceMatrix, distanceThreshold) {
    return ConnectivityGraphHelper.identifyConnectedComponents(parts, (di,dj) => {
      const dist = (di < dj) ? distanceMatrix[dj][di] : distanceMatrix[di][dj];
      return (dist < distanceThreshold);
    });
  }

  static getComponentDistance(c1, c2, distanceMatrix, distanceThreshold) {
    let result = { minDist: Infinity, closeParts: []};
    for (let i = 0; i < c1.length; i++) {
      const di = c1[i];
      for (let j = 0; j < c2.length; j++) {
        const dj = c2[j];
        const dist = (di < dj) ? distanceMatrix[dj][di] : distanceMatrix[di][dj];
        if (dist < distanceThreshold) {
          result.closeParts.push({ p1: di, p2: dj, dist: dist});
        }
        if (dist < result.minDist) {
          result.minDist = dist;
        }
      }
    }
    result.closeParts.sort(function(a, b) {return b.dist - a.dist} );
    return result;
  }

  static getComponentDistances(components, distanceMatrix, distanceThreshold) {
    let componentDists = [];
    for (let i = 0; i < components.length; i++) {
      componentDists[i] = [];
      for (let j = 0; j < i; j++) {
        componentDists[i][j] = this.getComponentDistance(components[i], components[j], distanceMatrix, distanceThreshold)
      }
    }
    return componentDists;
  }

  static getCheckInterveningPartsFn(parts, distanceMatrix, closestPoints) {
    // Does ray casting between the closest points to check if parts are directly connected
    // Returns part ids encountered between the two parts
    const raycaster = new THREE.Raycaster();
    const validParts = parts.filter(p => p);
    return function(i,j) {
      const dist = (i < j)? distanceMatrix[j][i] : distanceMatrix[i][j];
      const points = (i < j)? [closestPoints[j][i][1], closestPoints[j][i][0]] : closestPoints[i][j];
      const dir = points[1].clone().sub(points[0]).normalize();
      raycaster.set(points[0], dir);
      raycaster.far = dist;
      const intersected = raycaster.intersectObjects(validParts, true);
      const intersectedPids = [];
      const pid1 = parts[i].pid;
      const pid2 = parts[j].pid;
      for (let inter of intersected) {
        const pid = inter.object.pid;
        if (pid === pid2) {
          // Reached target
          break;
        } else if (pid !== pid1 && intersectedPids.indexOf(pid) < 0) {
          intersectedPids.push(pid);
        }
      }
      //console.log(intersectedPids);
      return intersectedPids;
    }
  }

  /**
   * Compute which parts is connected to which other parts
   * @param parts {THREE.Mesh[]}
   * @param distanceMatrix Array<Array[number]> Array where element i,j contains distance from part i to part j
   * @param distanceThreshold {number} Treat anything less than this as connected
   * @param maxConnectedDistance {number} Treat anything less than this as connected
   * @param [checkInterveningPartsFn] {function(i,j)} Extra check for whether part is connected or not
   * @returns {Array<Set<int>>} Array of partid to set of connected part ids
   */
  static computeConnectedParts(parts, distanceMatrix, distanceThreshold, maxConnectedDistance, checkInterveningPartsFn) {
    // Create connectivity graph from distance matrix
    console.log('computeConnectedParts', distanceThreshold, maxConnectedDistance);
    console.time('computeConnectedParts');
    let connectivityGraph = [];
    for (let i = 0; i < distanceMatrix.length; i++) {
      connectivityGraph[i] = new Set();
    }
    for (let i = 0; i < distanceMatrix.length; i++) {
      if (parts[i] && parts[i].name !== 'unknown') {
        for (let j = 0; j < i; j++) {
          if (j !== i && parts[j] && parts[j].name !== 'unknown') {
            const dist = (i < j)? distanceMatrix[j][i] : distanceMatrix[i][j];
            if (dist != null && dist < distanceThreshold) {
              let isConnected = true;
              if (checkInterveningPartsFn) {
                let interveningPartIds = checkInterveningPartsFn(i,j);
                if (interveningPartIds && interveningPartIds.length > 0) {
                  const interveningPartNames = interveningPartIds.map(pid => parts[pid].name);
                  console.log('Ignoring close parts ', parts[i].name, parts[j].name, 'intervening: ', interveningPartNames);
                  isConnected = false;
                }
              }
              if (isConnected) {
                // Add connections in both directions
                connectivityGraph[i].add(j);
                connectivityGraph[j].add(i);
              }
            }
          }
        }
      }
    }

    // Try to connect disconnected components
    let components = ConnectivityGraphHelper.identifyConnectedComponents(parts,
      (i,j) => connectivityGraph[i].has(j));
    console.log('Connected Components');
    components.forEach(component => {
      let cp = component.map(i => parts[i].name);
      console.log(cp.join(" -- "));
    });
    if (maxConnectedDistance && components.length > 1) {
      let componentDists = ConnectivityGraphHelper.getComponentDistances(components, distanceMatrix, maxConnectedDistance);
      for (let i = 0; i < componentDists.length; i++) {
        for (let j = 0; j < componentDists[i].length; j++) {
          const r = componentDists[i][j];
          if (r.closeParts) {
            for (let k = 0; k < r.closeParts.length; k++) {
              const a = r.closeParts[k].p1;
              const b = r.closeParts[k].p2;
              const dist = r.closeParts[k].dist;
              if (dist < r.minDist + distanceThreshold) {
                console.log('linking', parts[a].name, parts[b].name, dist, maxConnectedDistance);
                connectivityGraph[a].add(b);
                connectivityGraph[b].add(a);
              }
            }
          }
        }
      }
      let components2 = ConnectivityGraphHelper.identifyConnectedComponents(parts,
        (i,j) => connectivityGraph[i].has(j));
      console.log('Connected Components 2');
      components2.forEach(component => {
        let cp = component.map(i => parts[i].name);
        console.log(cp.join(" -- "));
      });
    }

    console.timeEnd('computeConnectedParts');
    return connectivityGraph;
  }

  static computeIntersectObbs(parts, connectivityGraph, distanceMatrix, distanceThreshold, nsamples, obbFitter) {
    console.log('computeIntersectObbs', distanceThreshold);
    console.time('computeIntersectObbs');
    const intersectObbs = {};
    for (let i = 0; i < connectivityGraph.length; i++) {
      for (let j of connectivityGraph[i]) {
        const dist = (i < j)? distanceMatrix[j][i] : distanceMatrix[i][j];
        if (_.isFinite(dist)) {
          const t = Math.max(dist, distanceThreshold);
          const o1 = (parts[i] instanceof THREE.Object3D)? parts[i] : parts[i].object3D;
          const o2 = (parts[j] instanceof THREE.Object3D)? parts[j] : parts[j].object3D;
          const m1 = Object3DUtil.getMeshList(o1);
          const m2 = Object3DUtil.getMeshList(o2);
          console.log(`computeIntersectObbs for ${m1.length} to ${m2.length} meshes with minDist=${dist}, thres=${t}`)
          const intersectPoints = MeshIntersections.MeshesMeshesIntersectionDirected(m1, m2,
            {threshold: t, sampler: MeshSampling.getDefaultSampler(), nsamples: nsamples});
          const key = `${i}-${j}`;
          console.log('Got ' + intersectPoints.length + ' for intersection ' + key);
          if (intersectPoints.length) {
            intersectObbs[key] = obbFitter(intersectPoints);
          }
        }
      }
    }
    console.timeEnd('computeIntersectObbs');
    return intersectObbs;
  }
}

module.exports = ConnectivityGraphHelper;