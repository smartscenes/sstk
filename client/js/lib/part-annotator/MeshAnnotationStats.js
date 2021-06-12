var GeometryUtil = require('geo/GeometryUtil');
var Object3DUtil = require('geo/Object3DUtil');

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
 * @param [param.meshWeight=0] {number} Weight given to meshes annotated when computing percentComplete.
 * @param [param.faceWeight=0] {number} Weight given to faces annotated when computing percentComplete.
 * @param [param.faceAreaWeight=1] {number} Weight given to area of faces annotated when computing percentComplete.
 * @constructor
 */
function MeshAnnotationStats(params) {
  params = params || {};
  this.progressCounter = params.counter;
  this.meshWeight = (params.meshWeight != undefined)? params.meshWeight : 0.0;
  this.faceWeight = (params.faceWeight != undefined)? params.faceWeight : 0.0;
  this.faceAreaWeight = (params.faceAreaWeight != undefined)? params.faceAreaWeight : 1.0;
  this.snapshots = {};
  if (params.meshes) {
    this.compute(params.meshes);
  } else {
    this.meshes = null;
    this.stats = this.__create();
  }
}

Object.defineProperty(MeshAnnotationStats.prototype, 'percentComplete', {
  get: function () { return this.stats['percentComplete']; }
});

// Annotation stats
MeshAnnotationStats.prototype.__create = function () {
  return {
    'annotatedFaceArea': 0,
    'unannotatedFaceArea': 0,
    'annotatedFaces': 0,
    'unannotatedFaces': 0,
    'annotatedMeshes': 0,
    'unannotatedMeshes': 0,
    'totalMeshes': 0,
    'totalFaces': 0,
    'totalFaceArea': 0,
    'percentComplete': 0
  };
};

/**
 * Clears all statistics
 */
MeshAnnotationStats.prototype.clear = function () {
  this.stats = this.__create();
  this.__updateProgressCounter(this.stats, this.progressCounter);
};

/**
 * Save stats in snapshots with name
 */
MeshAnnotationStats.prototype.save = function (name) {
  // quick clone
  this.snapshots[name] = Object.assign({}, this.stats);
};

/**
 * Set current statistics and updates progress counter
 */
MeshAnnotationStats.prototype.set = function(stats) {
  this.stats = stats;
  this.__updateProgressCounter(this.stats, this.progressCounter);
  return stats;
};

/**
 * Returns requested statistics snapshot
 * @param [name=current] {string} Name of snapshot to retrieve.  Use 'current' to retrieve current statistics.
 */
MeshAnnotationStats.prototype.get = function (name) {
  if (name && name !== 'current') {
    return this.snapshots[name];
  } else {
    return this.stats;
  }
};

/**
 * Computes delta between two snapshots
 */
MeshAnnotationStats.prototype.getDelta = function(start, end) {
  var stats1 = this.get(start) || {};
  var stats2 = this.get(end) || {};
  var delta = Object.assign({}, stats2);
  for (var key in stats1) {
    delta[key] = (delta[key] || 0) - stats1[key];
  }
  return delta;
};

/**
 * Computes statistics for given set of meshes
 * @param [meshes[ {THREE.Mesh[]]
 * @returns {{annotatedFaces, unannotatedFaces, annotatedMeshes, unannotatedMeshes, totalMeshes, totalFaces, percentComplete}}
 */
MeshAnnotationStats.prototype.compute = function (meshes) {
  if (meshes) {
    this.meshes = meshes;
  }

  // See how many meshes are annotated
  //console.log(mesh.userData);
  var stats = this.__create();
  for (var i = 0; i < this.meshes.length; i++) {
    var mesh = this.meshes[i];
    if (mesh.geometry) {
      var nFaces = GeometryUtil.getGeometryFaceCount(mesh.geometry);
      var faceArea = Object3DUtil.getSurfaceArea(mesh);
      if (mesh && mesh.userData.labelInfo) {
        stats['annotatedMeshes']++;
        stats['annotatedFaces'] += nFaces;
        stats['annotatedFaceArea'] += faceArea;
      } else {
        stats['unannotatedMeshes']++;
        stats['unannotatedFaces'] += nFaces;
        stats['unannotatedFaceArea'] += faceArea;
      }
      stats['totalMeshes']++;
      stats['totalFaces'] += nFaces;
      stats['totalFaceArea'] += faceArea;
    } else {
      console.warn('Missing geometry for mesh');
    }
  }
  this.stats = stats;
  this.__updateProgressCounter(this.stats, this.progressCounter);
  return stats;
};

/**
 * Updates statistics incrementally
 * @param mesh {int|THREE.Mesh|THREE.Object3D} Mesh or index of mesh that that was updated
 * @param multiplier {number} Use +1 if mesh was labeled, -1 if mesh was unlabeled.
 * @returns {{annotatedFaces, unannotatedFaces, annotatedFaceArea, unannotatedFaceArea, annotatedMeshes, unannotatedMeshes,
 *  totalMeshes, totalFaces, totalFaceArea, percentComplete}|*}
 */
MeshAnnotationStats.prototype.update = function (mesh, multiplier) {
  if (arguments.length === 0) {
    this.__updateProgressCounter(this.stats, this.progressCounter);
    return;
  } else if (mesh instanceof THREE.Object3D && !(mesh instanceof THREE.Mesh)) {
    for (var i = 0; i < mesh.children.length; i++) {
      this.update(mesh.children[i], multiplier);
    }
    return;
  } else if (typeof (mesh) === 'number') {
    mesh = this.meshes[mesh];
  }
  var stats = this.stats;
  if (mesh && mesh instanceof THREE.Mesh) {
    var nMeshes = multiplier;
    var nFaces = multiplier * GeometryUtil.getGeometryFaceCount(mesh.geometry);
    var faceArea = multiplier * Object3DUtil.getSurfaceArea(mesh);
    stats['annotatedMeshes'] += nMeshes;
    stats['annotatedFaces'] += nFaces;
    stats['annotatedFaceArea'] += faceArea;
    stats['unannotatedMeshes'] -= nMeshes;
    stats['unannotatedFaces'] -= nFaces;
    stats['unannotatedFaceArea'] -= faceArea;
    this.__updateProgressCounter(stats, this.progressCounter);
  } else {
    console.log('no faces for mesh', mesh);
  }
  return stats;
};

MeshAnnotationStats.prototype.__updateComputedStats = function (stats) {
  if (stats) {
    var annotatedMeshes = stats['annotatedMeshes'];
    var totalMeshes = stats['totalMeshes'];
    var annotatedFaces = stats['annotatedFaces'];
    var totalFaces = stats['totalFaces'];
    var annotatedFaceArea = stats['annotatedFaceArea'];
    var totalFaceArea = stats['totalFaceArea'];
    var meshRatio = (totalMeshes > 0) ? annotatedMeshes / totalMeshes : 0;
    var faceRatio = (totalFaces > 0) ? annotatedFaces / totalFaces : 0;
    var faceAreaRatio = (totalFaceArea > 0) ? annotatedFaceArea / totalFaceArea : 0;
    stats['percentComplete'] = 100*(this.meshWeight*meshRatio + this.faceWeight*faceRatio + this.faceAreaWeight*faceAreaRatio);
  }
};

MeshAnnotationStats.prototype.__updateProgressCounter = function (stats, counter) {
  this.__updateComputedStats(stats);
  if (stats && counter) {
    var percentCompleteFixed = this.percentComplete.toFixed(2);
    var initialSnapshot = this.snapshots['initial'];
    if (initialSnapshot) {
      var delta = this.percentComplete - initialSnapshot['percentComplete'];
      var deltaFixed = delta.toFixed(2);
      counter.text('Annotated: ' + deltaFixed + "%, "+ " total: " + percentCompleteFixed + "%");
    } else {
      counter.text('Annotated: ' + percentCompleteFixed + "%");
    }
  }
};

module.exports = MeshAnnotationStats;
