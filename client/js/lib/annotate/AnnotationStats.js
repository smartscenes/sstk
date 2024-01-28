/**
 * Statistics for how much of the annotation has been completed
 * This class will keep compute and take snapshots of the following statistics as requested.
 * The basic statistics is a map of names to number annotated/unannotated/total
 * <ul>
 *   <li>annotated: number of annotated elements</li>
 *   <li>unannotated: number of unannotated elements</li>
 *   <li>total: number of total elements</li>
 *   <li>percentComplete: percent complete (0-100) computed as weighted sum of annotation components
 * </ul>
 * @param params
 * @param [param.progressCounter] JQuery element to be updated with percentComplete
 * @param names {string[]} Array of annotation field names
 * @param weights {number[]} Array of weights
 * @constructor
 * @memberOf annotate
 */
function AnnotationStats(params) {
  params = params || {};
  this.progressCounter = params.counter;
  this.useNested = params.useNested;
  this.names = params.names;
  this.weights = params.weights;
  this.stats = this.__create();
  this.snapshots = {};
}

Object.defineProperty(AnnotationStats.prototype, 'percentComplete', {
  get: function () { return this.stats['percentComplete']; }
});

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function __getDelta(stats1, stats2) {
  var delta = Object.assign({}, stats2);
  for (var key in stats1) {
    delta[key] = (delta[key] || 0) - stats1[key];
  }
  return delta;
}

// Annotation stats
AnnotationStats.prototype.__create = function () {
  var stats = {};
  if (this.useNested) {
    for (var i = 0; i < this.names.length; i++) {
      stats[this.names[i]] = {annotated: 0, unannotated: 0, total: 0};
    }
  } else {
    var fieldnames = ['annotated', 'unannotated', 'total'];
    for (var i = 0; i < this.names.length; i++) {
      for (var j = 0; j < fieldnames.length; j++) {
        stats[fieldnames[j] + capitalize(this.names[i])] = 0;
      }
    }
  }
  stats['percentComplete'] = 0;
  return stats;
};

/**
 * Clears all statistics
 */
AnnotationStats.prototype.clear = function () {
  this.stats = this.__create();
  this.__updateProgressCounter(this.stats, this.progressCounter);
};

/**
 * Save stats in snapshots with name
 */
AnnotationStats.prototype.save = function (name) {
  // quick clone
  this.snapshots[name] = Object.assign({}, this.stats);
};

/**
 * Set current statistics and updates progress counter
 */
AnnotationStats.prototype.set = function(stats) {
  this.stats = stats;
  this.__updateProgressCounter(this.stats, this.progressCounter);
  return stats;
};

/**
 * Returns requested statistics snapshot
 * @param [name=current] {string} Name of snapshot to retrieve.  Use 'current' to retrieve current statistics.
 */
AnnotationStats.prototype.get = function (name) {
  if (name && name !== 'current') {
    return this.snapshots[name];
  } else {
    return this.stats;
  }
};

/**
 * Computes delta between two snapshots
 */
AnnotationStats.prototype.getDelta = function(start, end) {
  var stats1 = this.get(start) || {};
  var stats2 = this.get(end) || {};
  var delta;
  if (this.useNested) {
    delta = {};
    for (var i = 0; i < this.names.length; i++); {
      var name = this.names[i];
      delta[name] = __getDelta(stats1[name] || {}, stats2[name]  || {});
    }
    var autoFields = ['percentComplete'];
    for (var i = 0; i < autoFields.length; i++) {
      var key = autoFields[i];
      delta[key] = (stats2[key] || 0) - stats1[key];
    }
  } else {
    delta = __getDelta(stats1, stats2);
  }
  return delta;
};

/**
 * Computes statistics for given segmentation
 * @returns {*}
 */
AnnotationStats.prototype.compute = function (...args) {
  var stats = this.__create();
  this.__computeStats(stats, ...args);
  this.stats = stats;
  this.__updateProgressCounter(this.stats, this.progressCounter);
  return stats;
};

AnnotationStats.prototype.__computeStats = function (stats, ...args) {
  // TODO: Update by subclass
};

/**
 * Updates statistics incrementally
 * @param annInfo {*} Information about annotation element that that was updated
 * @param multiplier {number} Use +1 if segment was labeled, -1 if segment was unlabeled.
 * @returns {*}
 */
AnnotationStats.prototype.update = function (annInfo, multiplier) {
  // TODO: Update by subclass
};

AnnotationStats.prototype.__updateAnno = function(stats, name, annotated, unannotated, total) {
  if (this.useNested) {
    const s = stats[name];
    s.annotated += annotated;
    s.unannotated += unannotated;
    s.total += total;
  } else {
    stats['annotated' + capitalize(name)] += annotated;
    stats['unannotated' + capitalize(name)] += unannotated;
    stats['total' + capitalize(name)] += total;
  }
};

AnnotationStats.prototype.__updateComputedStats = function (stats) {
  if (stats) {
    var totalPercComplete = 0;
    for (var i = 0; i < this.names.length; i++) {
      var name = this.names[i];
      if (this.useNested) {
        var ratio = (stats[name].total > 0) ? stats[name].annotated / stats[name].total : 1;
        stats[name].percentComplete = 100 * ratio;
        totalPercComplete += this.weights[i] * stats[name].percentComplete;
      } else {
        var annotated = this.stats['annotated' + capitalize(name)];
        var total = this.stats['total' + capitalize(name)];
        var ratio = (total > 0) ? annotated / total : 1;
        var percentComplete = 100 * ratio;
        totalPercComplete += this.weights[i] * percentComplete;
      }
    }
    stats.percentComplete = totalPercComplete;
  }
};

AnnotationStats.prototype.__updateProgressCounter = function (stats, counter) {
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

module.exports = AnnotationStats;
