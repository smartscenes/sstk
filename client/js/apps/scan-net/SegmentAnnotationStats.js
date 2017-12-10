/**
 * Statistics for how much of the scan has been annotated.
 * This class will keep compute and take snapshots of the following statistics as requested.
 * The basic statistics is a map indicating:
 * <ul>
 *   <li>annotatedVertices: number of annotated vertices</li>
 *   <li>unannotatedVertices: number of unannotated vertices</li>
 *   <li>totalVertices: number of total vertices</li>
 *   <li>annotatedSegments: number of annotated segments</li>
 *   <li>unannotatedSegments: number of unannotated segments</li>
 *   <li>totalSegments: number of total segments</li>
 *   <li>percentComplete: percent complete (0-100) computed as
 *      <code>vertWeight*(annotatedVertices/totalVertices) + segsWeight*(annotatedSegments/totalSegments)</code>
 * </ul>
 * @param params
 * @param param.segments {Segments} Segmentation from which the annotation statistics will be computed
 * @param [param.progressCounter] JQuery element to be updated with percentComplete
 * @param [param.segsWeight=0] {number} Weight given to segments annotated when computing percentComplete.
 * @param [param.vertWeight=1] {number} Weight given to vertices annotated when computing percentComplete.
 * @constructor
 */
function SegmentAnnotationStats(params) {
  params = params || {};
  this.segments = params.segments;
  this.progressCounter = params.counter;
  this.segsWeight = (params.segsWeight != undefined)? params.segsWeight : 0.0;
  this.vertWeight = (params.vertWeight != undefined)? params.vertWeight : 1.0;
  this.stats = this.__create();
  this.snapshots = {};
}

Object.defineProperty(SegmentAnnotationStats.prototype, 'percentComplete', {
  get: function () { return this.stats['percentComplete']; }
});

// Annotation stats
SegmentAnnotationStats.prototype.__create = function () {
  return {
    'annotatedVertices': 0,
    'unannotatedVertices': 0,
    'annotatedSegments': 0,
    'unannotatedSegments': 0,
    'totalSegments': 0,
    'totalVertices': 0,
    'percentComplete': 0
  };
};

/**
 * Clears all statistics
 */
SegmentAnnotationStats.prototype.clear = function () {
  this.stats = this.__create();
  this.__updateProgressCounter(this.stats, this.progressCounter);
};

/**
 * Save stats in snapshots with name
 */
SegmentAnnotationStats.prototype.save = function (name) {
  // quick clone
  this.snapshots[name] = Object.assign({}, this.stats);
};

/**
 * Set current statistics and updates progress counter
 */
SegmentAnnotationStats.prototype.set = function(stats) {
  this.stats = stats;
  this.__updateProgressCounter(this.stats, this.progressCounter);
  return stats;
};

/**
 * Returns requested statistics snapshot
 * @param [name=current] {string} Name of snapshot to retrieve.  Use 'current' to retrieve current statistics.
 */
SegmentAnnotationStats.prototype.get = function (name) {
  if (name && name !== 'current') {
    return this.snapshots[name];
  } else {
    return this.stats;
  }
};

/**
 * Computes delta between two snapshots
 */
SegmentAnnotationStats.prototype.getDelta = function(start, end) {
  var stats1 = this.get(start) || {};
  var stats2 = this.get(end) || {};
  var delta = Object.assign({}, stats2);
  for (var key in stats1) {
    delta[key] = (delta[key] || 0) - stats1[key];
  }
  return delta;
};

/**
 * Computes statistics for given segmentation
 * @param [segments[ {Segments]
 * @returns {{annotatedVertices, unannotatedVertices, annotatedSegments, unannotatedSegments, totalSegments, totalVertices, percentComplete}}
 */
SegmentAnnotationStats.prototype.compute = function (segments) {
  if (segments) {
    this.segments = segments;
  }
  // Assume just one mesh
  var mesh = this.segments.rawSegmentObject3D;
  if (!mesh) {
    console.warn('segmented object not ready for computing annotation statistics');
    return;
  }

  // See how many segments are annotated
  var segs = mesh.userData.segs;
  var segToV = mesh.userData.segToVertIndices;
  //console.log(mesh.userData);
  var stats = this.__create();
  for (var i in segToV) {
    if (segToV.hasOwnProperty(i)) {
      var seg = segs ? segs[i] : undefined;
      if (seg && seg.labelInfo) {
        stats['annotatedSegments']++;
        stats['annotatedVertices'] += segToV[i].length;
      } else {
        stats['unannotatedSegments']++;
        stats['unannotatedVertices'] += segToV[i].length;
      }
      stats['totalSegments']++;
      stats['totalVertices'] += segToV[i].length;
    }
  }
  this.stats = stats;
  this.__updateProgressCounter(this.stats, this.progressCounter);
  return stats;
};

/**
 * Updates statistics incrementally
 * @param segIndex {int} Index of segment that that was updated
 * @param multiplier {number} Use +1 if segment was labeled, -1 if segment was unlabeled.
 * @returns {{annotatedVertices, unannotatedVertices, annotatedSegments, unannotatedSegments, totalSegments, totalVertices, percentComplete}|*}
 */
SegmentAnnotationStats.prototype.update = function (segIndex, multiplier) {
  if (arguments.length === 0) {
    this.__updateProgressCounter(this.stats, this.progressCounter);
    return;
  }
  // Assume just one mesh
  var mesh = this.segments.rawSegmentObject3D;
  var segToV = mesh.userData.segToVertIndices;
  var stats = this.stats;
  if (segToV[segIndex]) {
    var nSegs = multiplier;
    var nVertices = multiplier * segToV[segIndex].length;
    stats['annotatedSegments'] += nSegs;
    stats['annotatedVertices'] += nVertices;
    stats['unannotatedSegments'] -= nSegs;
    stats['unannotatedVertices'] -= nVertices;
    this.__updateProgressCounter(stats, this.progressCounter);
  } else {
    //console.log('no vertices for seg', segIndex);
  }
  return stats;
};

SegmentAnnotationStats.prototype.__updateComputedStats = function (stats) {
  if (stats) {
    var annotated = stats['annotatedSegments'];
    var total = stats['totalSegments'];
    var annotatedVertices = stats['annotatedVertices'];
    var totalVertices = stats['totalVertices'];
    var segsRatio = (total > 0) ? annotated / total : 0;
    var vertRatio = (totalVertices > 0) ? annotatedVertices / totalVertices : 0;
    stats['percentComplete'] = 100 * (this.segsWeight * segsRatio + this.vertWeight * vertRatio);
  }
};

SegmentAnnotationStats.prototype.__updateProgressCounter = function (stats, counter) {
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

module.exports = SegmentAnnotationStats;
