const Distances = require('geo/Distances');
const GeometryUtil = require('geo/GeometryUtil');
const _ = require('util/util');

class MeshIntersections {
  /**
   * Computes a set of points that belong to the intersection of the two meshes
   * @param meshes1 {Array<THREE.Mesh|geo.PartialMesh>}
   * @param meshes2 {Array<THREE.Mesh|geo.PartialMesh>}
   * @param opts
   * @param opts.threshold {number} Distance below which intersections would be counted
   * @param opts.results {THREE.Vector3[]} Intersecting points
   * @param opts.sampler {{sampleMeshes: function(Array<THREE.Mesh|geo.PartialMesh>, int)}} Sampler for sampling meshes
   * @param opts.nsamples {int}: Number of samples to produce
   * @returns {*}
   * @constructor
   */
  static MeshesMeshesIntersectionDirected(meshes1, meshes2, opts) {
    console.time('MeshesMeshesIntersectionDirected');
    const thresholdSq = opts.threshold*opts.threshold;
    const innerOpts = { shortCircuit: { maxDistSq:  thresholdSq }};
    const results = opts.results || [];
    const tmpPoint = new THREE.Vector3();
    for (let i = 0; i < meshes1.length; i++) {
      const mesh1 = meshes1[i];
      if (mesh1 instanceof THREE.Mesh) {
        GeometryUtil.forMeshVertices(mesh1, function (v) {
            const r = Distances.PointMeshesDistanceSquared(v, meshes2, innerOpts);
            if (r.distanceSq < thresholdSq) {
              results.push(v.clone());
            }
          },
          null);
      } else if (mesh1.mesh && mesh1.faceIndices) {
        const transform = mesh1.mesh.matrixWorld;
        const checkedIVerts = new Set();
        for (let k = 0; k < mesh1.faceIndices.length; k++) {
          const iTri = mesh1.faceIndices[k];
          const iVerts = GeometryUtil.getFaceVertexIndices(mesh1.mesh.geometry, iTri);
          for (let j = 0; j < iVerts.length; j++) {
            const iVert = iVerts[j];
            if (checkedIVerts.has(iVert)) {
              continue;
            }
            checkedIVerts.add(iVert);
            GeometryUtil.getGeometryVertex(mesh1.mesh.geometry, iVert, transform, tmpPoint);
            const r = Distances.PointMeshesDistanceSquared(tmpPoint, meshes2, innerOpts);
            if (r.distanceSq < thresholdSq) {
              results.push(tmpPoint.clone());
            }
          }
        }
      } else {
        throw "Unsupported mesh type";
      }
    }
    // Sample more points on surfaces to test
    if (opts.sampler && opts.nsamples) {
      // Let's try to sample some points and check them
      let samples = opts.sampler.sampleMeshes(meshes1, opts.nsamples);
      samples = _.flatten(samples);
      for (let i = 0; i < samples.length; i++) {
        const r = Distances.PointMeshesDistanceSquared(samples[i].worldPoint, meshes2, innerOpts);
        if (r.distanceSq < thresholdSq) {
          results.push(samples[i].worldPoint.clone());
        }
      }
    }
    console.timeEnd('MeshesMeshesIntersectionDirected');
    return results;
  }

  static MeshesMeshesIntersection(meshes1, meshes2, opts) {
    const results = [];
    const fullOpts = _.clone(opts);
    fullOpts.results = results;
    MeshIntersections.MeshesMeshesIntersectionDirected(meshes1, meshes2, fullOpts);
    MeshIntersections.MeshesMeshesIntersectionDirected(meshes2, meshes1, fullOpts);
    return results;
  }
}

module.exports = MeshIntersections;