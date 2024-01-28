const ConnectivityGraph = require('geo/ConnectivityGraph2');
const BinaryHeap = require('ds/BinaryHeap');
const DisjointSet = require('ds/DisjointSet');
const MeshFaces = require('geo/MeshFaces');
const MeshColors = require('geo/MeshColors');
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
    } else if (opts.method === 'fwab-vert') {
      return this.segmentByFelzenszwalbVert(mesh, opts);
    } else if (opts.method === 'fwab-tri') {
      return this.segmentByFelzenszwalbTri(mesh, opts);
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
   * @param [opts.planarNormSimThreshold]
   * @returns {MeshFaces[]}
   */
  segmentByClustering(mesh, opts) {
    function getSimToAligned(tmpNormal) {
      return Math.max(Math.abs(tmpNormal.x), Math.abs(tmpNormal.y), Math.abs(tmpNormal.z));
    }
    // Greedy clustering
    // iterate through unclustered faces and grow each segment
    opts = opts || {};
    const adjFaceNormSimThreshold = opts.adjFaceNormSimThreshold || 0;
    const connectivityGraph = new ConnectivityGraph(mesh.geometry, true);
//    const unclustered = new BinaryHeap({ scoreFunc: x => { return -x.area; }});
    const unclustered = new BinaryHeap({ scoreFunc: x => { return -x.area*100 + getSimToAligned(x.normal); }});

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
        new PlanarMeshSegment(mesh, [], baseTriNormal.clone(), opts.planarNormSimThreshold) : new MeshFaces(mesh);
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

  segmentByFelzenszwalbVert(mesh, opts) {
    const points = mesh.geometry.getAttribute('position').array;
    if (!mesh.geometry.hasAttribute('normal')) {
      mesh.geometry.computeVertexNormals();
    }
    const normals = mesh.geometry.getAttribute('normal').array;
    const triAccessor = new TriangleAccessor(mesh);
    const nTris = triAccessor.numTriangles();
    const nEdges = 3 * nTris;
    const edges = new Array();

    let tri = new THREE.Triangle();
    for (let iTri =0; iTri < nTris; iTri++) {
      triAccessor.getTriangle(iTri, tri);
      const is = triAccessor.getTriangleVertexIndices(iTri);
      edges.push({a: is[0], b: is[1], w: 0})
      edges.push({a: is[0], b: is[2], w: 0})
      edges.push({a: is[2], b: is[1], w: 0})
    }

    for (let iEdge = 0; iEdge < nEdges; iEdge++) {
      const a = 3 * edges[iEdge].a;
      const b = 3 * edges[iEdge].b;
      const n1 = new THREE.Vector3(normals[a], normals[a+1], normals[a+2]);
      const n2 = new THREE.Vector3(normals[b], normals[b+1], normals[b+2]);
      const p1 = new THREE.Vector3(points[a], points[a+1], points[a+2]);
      const p2 = new THREE.Vector3(points[b], points[b+1], points[b+2]);
      edges[iEdge].w = felzenswalbEdgeNormalWeight(n1, n2, p1, p2);
    }

    // Segment!
    const nVerts = Math.floor(points.length / 3);
    let u = DisjointSet.segmentGraph(nVerts, edges, opts.kthr);
    DisjointSet.joinSmallSets(u, edges, opts.segMinVerts);
    const vertSets = u.getSets();

    // naively convert vertex segm to face segm
    let triSets = {};
    let vert2setId = new Array(nVerts);
    _.forEach(vertSets, (vertSet, setId) => {
      _.forEach(vertSet, (vertIndex) => {
        vert2setId[vertIndex] = setId;
      })
    });
    for (let iTri =0; iTri < nTris; iTri++) {
      triAccessor.getTriangle(iTri, tri);
      const triVertIndices = triAccessor.getTriangleVertexIndices(iTri);
      const setId = vert2setId[triVertIndices[0]];  // Naively pick 0th vert segm
      if (triSets.hasOwnProperty(setId)) {
        triSets[setId].push(iTri);
      } else {
        triSets[setId] = [iTri];
      }
    }

    const segments = _.map(triSets, (set) => new MeshFaces(mesh, set));
    return segments;
  }

  segmentByFelzenszwalbTri(mesh, opts) {
    if (!mesh.geometry.hasAttribute('normal')) {
      mesh.geometry.computeVertexNormals();
    }

    if (opts.colorWeight > 0) {
      // ensure vertex colors, or compute from uvs + textures
      if (!mesh.geometry.hasAttribute('color')) {
        if (mesh.geometry.hasAttribute('uv')) {
          MeshColors.populateMeshVertexColors(mesh);
        } else {
          console.error('[segmentByFelzenszwalbTri] requested color weights but no colors or uvs');
        }
      }
    }

    const connectivityGraph = new ConnectivityGraph(mesh.geometry, true);
    const triAccessor = new TriangleAccessor(mesh);
    const nTris = triAccessor.numTriangles();
    const n1 = new THREE.Vector3();
    const n2 = new THREE.Vector3();
    const p1 = new THREE.Vector3();
    const p2 = new THREE.Vector3();
    const c1 = new THREE.Color();
    const c2 = new THREE.Color();
    const aThird = 1 / 3;
    const colorWeight = opts.colorWeight || 0;
    const edges = new Array();

    for (let iTri = 0; iTri < nTris; iTri++) {
      const tri1 = triAccessor.get(iTri);
      const neighbors = connectivityGraph.getFaceNeighbors(iTri);
      if (!neighbors) { continue; }
      neighbors.forEach((jTri) => {
        const tri2 = triAccessor.get(jTri);
        n1.addVectors(tri1.na, tri1.nb).add(tri1.nc).multiplyScalar(aThird);
        n2.addVectors(tri2.na, tri2.nb).add(tri2.nc).multiplyScalar(aThird);
        p1.addVectors(tri1.va, tri1.vb).add(tri1.vc).multiplyScalar(aThird);
        p2.addVectors(tri2.va, tri2.vb).add(tri2.vc).multiplyScalar(aThird);
        const wn = felzenswalbEdgeNormalWeight(n1, n2, p1, p2);
        let wc = 0;
        if (colorWeight) {
          c1.addColors(tri1.ca, tri1.cb).add(tri1.cc).multiplyScalar(aThird);
          c2.addColors(tri2.ca, tri2.cb).add(tri2.cc).multiplyScalar(aThird);
          wc = felzenswalbEdgeColorWeight(c1, c2);
        }
        const w = (1 - colorWeight) * wn + colorWeight * wc;
        if (opts.verbose && Math.random() > 0.999) {
          console.log('w,wn,wc', w, wn, wc);
        }
        edges.push({a: iTri, b: jTri, w: w});
      })
    }

    // Segment!
    let u = DisjointSet.segmentGraph(nTris, edges, opts.kthr);
    DisjointSet.joinSmallSets(u, edges, opts.segMinVerts);
    const triSets = u.getSets();
    const segments = _.map(triSets, (set) => new MeshFaces(mesh, set));

    return segments;
  }
}

function felzenswalbEdgeNormalWeight(n1, n2, p1, p2) {
  let dx = p2.x - p1.x;
  let dy = p2.y - p1.y;
  let dz = p2.z - p1.z;
  const dd = Math.sqrt(dx * dx + dy * dy + dz * dz); dx /= dd; dy /= dd; dz /= dd;
  const dot = n1.x * n2.x + n1.y * n2.y + n1.z * n2.z;
  const dot2 = n2.x * dx + n2.y * dy + n2.z * dz;
  let w = 1.0 - dot;
  if (dot2 > 0) { w = w * w; } // diminish convex region normal difference
  return w;
}

function felzenswalbEdgeColorWeight(c1, c2) {
  // reference: [Toscana 2016](https://arxiv.org/pdf/1605.03746.pdf)
  c1.getHSL(c1);
  c2.getHSL(c2);
  const kdv = 4.5;
  const kds = 0.1;
  const dv = kdv * Math.abs(c1.l - c2.l);
  const dh = Math.abs(c1.h - c2.h);
  let theta = dh;
  if (dh >= 180) {
    theta = 360 - dh;
  }
  theta *= Math.PI / 180;
  const ds = kds * Math.sqrt(c1.s * c1.s + c2.s * c2.s - 2 * Math.cos(theta) * c1.s * c2.s);
  let w = Math.sqrt(dv * dv + ds * ds) / Math.sqrt(kdv * kdv + kds * kds);
  w = Math.log2(1 + w);
  return w;
}

module.exports = MeshSegmentator;