const ConnectivityGraph = require('geo/ConnectivityGraph2');
const BinaryHeap = require('ds/BinaryHeap');
const MeshFaces = require('geo/MeshFaces');
const TriangleAccessor = require('geo/TriangleAccessor');
const DSUtil = require('ds/util');
const _ = require('util/util');

class PlanarMeshSegment extends MeshFaces {
  constructor(mesh, faceIndices, normal, normSimThreshold = 0) {
    super(mesh, faceIndices);
    this.normal = normal;
    this.normSimThreshold = normSimThreshold;
  }
}

Object.assign(PlanarMeshSegment.prototype, {
  isCompatible: (function() {
    const triNormal = new THREE.Vector3();
    return function(triangle) {
      triangle.getNormal(triNormal);
      return this.normal.dot(triNormal) >= this.normSimThreshold;
    };
  }())
});

class MeshSegmentator {
  constructor() {
  }

  segment(mesh, opts) {
    opts = opts || {};
    if (opts.method === 'connectivity') {
      return this.segmentByConnectivity(mesh, opts);
    } else if (opts.method === 'clustering') {
      return this.segmentByClustering(mesh, opts);
    } else {
      throw 'Unsupported segmentation method: ' + opts.method;
    }
  }

  segmentByConnectivity(mesh, opts) {
    const connectivityGraph = new ConnectivityGraph(mesh.geometry, true);
    const triAccessor = new TriangleAccessor(mesh);
    const nTris = opts.indices? opts.indices.length : triAccessor.numTriangles();
    const indices = opts.indices? opts.indices : _.range(nTris);
    const components = DSUtil.identifyConnectedComponents(indices, (ti1, ti2) => {
      const neighbors = connectivityGraph.getFaceNeighbors(ti1);
      return neighbors.indexOf(ti2) >= 0;
    });
    return components.map(component => new MeshFaces(mesh, component));
  }

  /**
   * Segment mesh using clustering
   * @param mesh {THREE.Mesh}
   * @param opts
   * @param [opts.adjFaceNormSimThreshold]
   * @param [opts.restrictToPlanarSurfaces]
   * @returns {MeshFaces[]}
   */
  segmentByClustering(mesh, opts) {
    // Greedy clustering
    // iterate through unclustered faces and grow each segment
    opts = opts || {};
    const adjFaceNormSimThreshold = opts.adjFaceNormSimThreshold || 0;
    const connectivityGraph = new ConnectivityGraph(mesh.geometry, true);
    const unclustered = new BinaryHeap({ scoreFunc: x => { return x.area; }});

    const triAccessor = new TriangleAccessor(mesh);
    const nTris = triAccessor.numTriangles();
    const tmpTriangle = new THREE.Triangle();
    const faceInfos = [];
    for (let i = 0; i < nTris; i++) {
      triAccessor.getTriangle(i, tmpTriangle);
      const area = tmpTriangle.getArea();
      const normal = new THREE.Vector3();
      tmpTriangle.getNormal(normal);
      const faceInfo = { index: i, area:  area, normal: normal };
      unclustered.add(faceInfo);
      faceInfos[i] = faceInfo;
    }
    const clustered = new Set();   // List of clustered triangle indices
    const surfaces = [];
    //console.log(connectivityGraph);
    while (!unclustered.isEmpty) {
      // Start by grouping triangles with shared edges that have similar normals
      const baseTriInfo = unclustered.pop();
      if (opts.debug) {
        console.log("Cluster for " + baseTriInfo.index);
      }
      const baseTriNormal = baseTriInfo.normal;
      triAccessor.getTriangle(baseTriInfo.index, tmpTriangle);
      // TODO: surfaceId, parentSurfaceId, meshIndex
      const surface = (opts.restrictToPlanarSurfaces)?
        new PlanarMeshSegment(mesh, [], baseTriNormal.clone()) : new MeshFaces(mesh);
      surfaces.push(surface);
      const enqueued = new Set();   // List of triangle indices enqueued for processing
      const todo = [];
      todo.push(baseTriInfo.index);
      enqueued.add(baseTriInfo.index);
      while (todo.length > 0) {
        const triIndex = todo.shift();
        //const triVertexIndices = triAccessor.getTriangleVertexIndices(triIndex);
        triAccessor.getTriangle(triIndex, tmpTriangle);
        //if (opts.debug) {
        //  console.log("Consider " + triIndex + ", size=" + JmeUtils.area(triangle) + ", normal=" + triangle.getNormal)
        //}
        if (surface.isCompatible(tmpTriangle)) {
          surface.add(triIndex);
          clustered.add(triIndex);
          const removed = unclustered.removeWhere(info => info.index === triIndex);
          const currentTriNormal = faceInfos[triIndex].normal;

          // look at neighbors
          let adjacentFaces = connectivityGraph.getFaceNeighborTypes(triIndex);
          //console.log('a1', triIndex, adjacentFaces);
          adjacentFaces = _.filter(adjacentFaces,
              t => !enqueued.has(t.faceIndex) && !clustered.has(t.faceIndex)  &&
                  t.neighborType.index !== ConnectivityGraph.NeighborTypes.SHARED_VERTEX.index &&
                  currentTriNormal.dot(faceInfos[t.faceIndex].normal) >= adjFaceNormSimThreshold);
          adjacentFaces = _.sortBy(adjacentFaces, t => [t.neighborType.index, -faceInfos[t.faceIndex].area]);
          //console.log('a3', adjacentFaces);
          for (let f of adjacentFaces) {
            todo.push(f.faceIndex);
            enqueued.add(f.faceIndex);
          }
        }
      }
    }
    //console.log(surfaces);
    return surfaces;
  }
}

module.exports = MeshSegmentator;