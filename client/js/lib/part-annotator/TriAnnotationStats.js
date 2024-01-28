var GeometryUtil = require('geo/GeometryUtil');
var AnnotationStats = require('annotate/AnnotationStats');

/**
 * Statistics for how much of the scan has been annotated.
 * This class will keep compute and take snapshots of the following statistics as requested.
 * The basic statistics is a map indicating:
 * <ul>
 *   <li>annotatedFaces: number of annotated faces</li>
 *   <li>unannotatedFaces: number of unannotated faces</li>
 *   <li>totalFaces: number of total faces</li>
 *   <li>annotatedMeshes: number of annotated meshes</li>
 *   <li>unannotatedMeshes: number of unannotated meshes</li>
 *   <li>totalMeshes: number of total meshes</li>
 *   <li>percentComplete: percent complete (0-100) computed as
 *      <code>faceWeight*(annotatedFaces/totalFaces) + meshWeight*(annotatedMeshes/totalMeshes)</code>
 * </ul>
 * @param params
 * @param param.meshes {THREE.Mesh[]} meshes from which the annotation statistics will be computed
 * @param [param.progressCounter] JQuery element to be updated with percentComplete
 * @param [param.faceWeight=0] {number} Weight given to faces annotated when computing percentComplete.
 * @param [param.faceAreaWeight=1] {number} Weight given to area of faces annotated when computing percentComplete.
 * @constructor
 */
function TriAnnotationStats(params) {
  params = params || {};
  params.names = ['faces', 'faceArea'];
  params.weights = [
    params.faceWeight != null? params.faceWeight : 1,
    params.faceAreaWeight != null? params.faceAreaWeight : 0];
  AnnotationStats.call(this, params);
}

TriAnnotationStats.prototype = Object.create(AnnotationStats.prototype);
TriAnnotationStats.prototype.constructor = TriAnnotationStats;


TriAnnotationStats.prototype.__computeStats = function (stats, meshes) {
  for (var i = 0; i < meshes.length; i++) {
    var mesh = meshes[i];
    var totalTris = GeometryUtil.getGeometryFaceCount(mesh.geometry);
    var totalTriArea = GeometryUtil.getSurfaceArea(mesh.geometry, mesh.matrixWorld);
    var buffer = mesh.userData.elemToLabelIndexBuffer;
    if (buffer) {
      var annTris = 0;
      var annTriArea = GeometryUtil.getSurfaceAreaFiltered(mesh.geometry, mesh.matrixWorld,
        (v0, v1, v2, iFace) => { buffer[iFace] > 0});
      for (var i = 0; i < buffer.length; i++) {
        if (buffer[i]) {
          annTris++;
        }
      }
      this.__updateAnno(stats, 'faces',  annTris, totalTris - annTris, totalTris);
      this.__updateAnno(stats, 'faceArea',  annTriArea, totalTriArea - annTriArea, totalTriArea);
    } else {
      this.__updateAnno(stats, 'faces',  0, totalTris, totalTris);
      this.__updateAnno(stats, 'faceArea',  0, totalTriArea, totalTriArea);
    }
  }
  return stats;
};

/**
 * Updates statistics incrementally
 * @param annInfo.mesh {*} mesh that were annotated
 * @param annInfo.triIndices {*} tris that were annotated
 * @param multiplier {number} Use +1 if segment was labeled, -1 if segment was unlabeled.
 * @returns {*}
 */
TriAnnotationStats.prototype.update = function (annInfo, multiplier) {
  if (arguments.length === 0) {
    this.__updateProgressCounter(this.stats, this.progressCounter);
    return;
  }
  var triIndices = annInfo.triIndices;
  var triArea = GeometryUtil.getSurfaceAreaTriIndices(annInfo.mesh.geometry, triIndices, annInfo.mesh.matrixWorld);
  // console.log('before update', annInfo, _.cloneDeep(this.stats), multiplier);
  this.__updateAnno(this.stats, 'faces',  multiplier*triIndices.length, -multiplier*multiplier*triIndices.length, 0);
  this.__updateAnno(this.stats, 'faceArea',  multiplier*triArea, -multiplier*multiplier*triArea, 0);
  // console.log('after update', annInfo, _.cloneDeep(this.stats), multiplier);
  this.__updateProgressCounter(this.stats, this.progressCounter);
};

module.exports = TriAnnotationStats;
