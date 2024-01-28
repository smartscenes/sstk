/**
 * Statistics for how much of the scan has been annotated.
 * This class will keep compute and take snapshots of the following statistics as requested.
 * The basic statistics is a map indicating:
 * <ul>
 *   <li>annotatedElements: number of annotated elements</li>
 *   <li>unannotatedElements: number of unannotated elements</li>
 *   <li>totalElements: number of total elements</li>
 *   <li>annotatedSegments: number of annotated segments</li>
 *   <li>unannotatedSegments: number of unannotated segments</li>
 *   <li>totalSegments: number of total segments</li>
 *   <li>percentComplete: percent complete (0-100) computed as
 *      <code>elemWeight*(annotatedElements/totalElements) + segsWeight*(annotatedSegments/totalSegments)</code>
 * </ul>
 * @param params
 * @param param.segments {Segments} Segmentation from which the annotation statistics will be computed
 * @param [param.progressCounter] JQuery element to be updated with percentComplete
 * @param [param.segsWeight=0] {number} Weight given to segments annotated when computing percentComplete.
 * @param [param.elemWeight=1] {number} Weight given to elements annotated when computing percentComplete.
 * @param [param.elemName=Elements] {string} Name given to stats on annotated elements
 * @constructor
 * @memberOf scannet
 */
function SegmentAnnotationStats(params) {
  params = params || {};
  this.segments = params.segments;
  this.progressCounter = params.counter;
  this.segsWeight = (params.segsWeight != undefined)? params.segsWeight : 0.0;
  this.elemWeight = (params.elemWeight != undefined)? params.elemWeight : 1.0;
  this.elemName = (params.elemName != undefined)? params.elemName : 'Elements';
  this.stats = this.__create();
  this.snapshots = {};
}

Object.defineProperty(SegmentAnnotationStats.prototype, 'percentComplete', {
  get: function () { return this.stats['percentComplete']; }
});

Object.defineProperty(SegmentAnnotationStats.prototype, 'annotatedElemName', {
  get: function () { return 'annotated' + this.elemName; }
});

Object.defineProperty(SegmentAnnotationStats.prototype, 'unannotatedElemName', {
  get: function () { return 'unannotated' + this.elemName; }
});

Object.defineProperty(SegmentAnnotationStats.prototype, 'totalElemName', {
  get: function () { return 'total' + this.elemName; }
});

// Annotation stats
SegmentAnnotationStats.prototype.__create = function () {
  var fields = [this.annotatedElemName, this.unannotatedElemName, 'annotatedSegments', 'unannotatedSegments',
    this.totalElemName, 'totalSegments', 'percentComplete'];
  var stats = {};
  for (var i = 0; i < fields.length; i++) {
    stats[fields[i]] = 0;
  }
  return stats;
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
  var segToE = mesh.userData.segToElemIndices;
  //console.log(mesh.userData);
  var stats = this.__create();
  for (var i in segToE) {
    if (segToE.hasOwnProperty(i)) {
      var seg = segs ? segs[i] : undefined;
      if (seg && seg.labelInfo) {
        stats['annotatedSegments']++;
        stats[this.annotatedElemName] += segToE[i].length;
      } else {
        stats['unannotatedSegments']++;
        stats[this.unannotatedElemName] += segToE[i].length;
      }
      stats['totalSegments']++;
      stats[this.totalElemName] += segToE[i].length;
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
  var segToE = mesh.userData.segToElemIndices;
  var stats = this.stats;
  var nSegs = multiplier;
  var segIndices = Array.isArray(segIndex)? segIndex : [segIndex];
  for (var i = 0; i < segIndices.length; i++) {
    var si = segIndices[i];
    if (segToE[si]) {
      var nElements = multiplier * segToE[si].length;
      stats['annotatedSegments'] += nSegs;
      stats[this.annotatedElemName] += nElements;
      stats['unannotatedSegments'] -= nSegs;
      stats[this.unannotatedElemName] -= nElements;
    } else {
      //console.log('no vertices for seg', segIndex);
    }
  }
  this.__updateProgressCounter(stats, this.progressCounter);
  return stats;
};

SegmentAnnotationStats.prototype.__updateComputedStats = function (stats) {
  if (stats) {
    var annotated = stats['annotatedSegments'];
    var total = stats['totalSegments'];
    var annotatedElements = stats[this.annotatedElemName];
    var totalElements = stats[this.totalElemName];
    var segsRatio = (total > 0) ? annotated / total : 0;
    var elemRatio = (totalElements > 0) ? annotatedElements / totalElements : 0;
    stats['percentComplete'] = 100 * (this.segsWeight * segsRatio + this.elemWeight * elemRatio);
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
