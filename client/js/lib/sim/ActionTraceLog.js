var path = require('path');
var _ = require('util');

/**
 * Log trace of simulator actions
 * @constructor
 * @memberOf sim
 * @param params Configuration parameters for ActionTraceLog
 * @param [params.logfile.fields] {string} Array of fields that should be logged
 * @param [params.logfile.name] {string} Name of file for storing action trace
 * @param [params.logfile.format] {string} Format of file for storing action trace
 * @param [params.fs] {fs} Filesystem library for writing files
 */
function ActionTraceLog(params) {
  // For logging to file
  var logfile = params.logfile;
  this.fs = params.fs;
  // For smaller file sizes
  this.fixedPrecision = 4;
  this.useFillers = true;
  // Setup logfile settings
  if (typeof(logfile) === 'string') {
    this.logfile = { filename: logfile, type: 'file' };
  } else if (logfile) {
    this.logfile = _.defaults(Object.create(null), logfile, { type: 'file' });
  }
  if (this.logfile) {
    // get format from logfile extension
    //  ndjson = newline delimited json (see https://en.wikipedia.org/wiki/JSON_Streaming#Line_delimited_JSON, https://github.com/maxogden/ndjson)
    //  csv = common separated
    //  tsv = tab separated
    if (!this.logfile.format) {
      this.logfile.format = path.extname(this.logfile.filename);
      if (this.logfile.format && this.logfile.format.startsWith('.')) {
        this.logfile.format = this.logfile.format.substring(1);
      }
    }
    if (!this.logfile.delimiter) {
      if (this.logfile.format === 'csv') {
        this.logfile.delimiter = ',';
      } else if (this.logfile.format === 'tsv') {
        this.logfile.delimiter = '\t';
      }
    }
  }
  if (this.logfile) {
    if (this.logfile.fields) {
      this.logfile.fieldIndices = {};
      for (var i = 0; i < this.logfile.fields.length; i++) {
        var f = this.logfile.fields[i];
        this.logfile.fieldIndices[f] = i;
      }
    }
    var validFormats = ['ndjson', 'csv', 'tsv'];
    if (!this.logfile.delimiter && validFormats.indexOf(this.logfile.format) < 0) {
      throw 'Invalid logfile format: ' + this.logfile.format;
    }
    console.log('Created ActionTraceLog with logger', this.logfile);
  }
  this.constants = params.constants; // Constants that should apply to everything in this record
  this._data = [];
}

Object.defineProperty(ActionTraceLog.prototype, 'data', {
  get: function () {
    return this._data;
  }
});

ActionTraceLog.prototype.push = function(rec) {
  this._data.push(rec);
};

ActionTraceLog.prototype.updateLast = function(rec) {
  //console.log('updating', rec);
  if (this._data.length > 0) {
    var last = this._data[this._data.length-1];
    if (_.isArray(last)) {
      var fieldIndices = this.logfile.fieldIndices;
      _.forEach(rec, function(v,k) {
        var index = fieldIndices[k];
        if (index >= 0) {
          last[index] = v;
        }
      });
    } else {
      _.merge(last, rec);
    }
  }
};

ActionTraceLog.prototype.updateConstants = function(constants) {
  if (!this.constants) {
    this.constants = {};
  }
  this.constants = _.merge(this.constants, constants);
};

ActionTraceLog.prototype.clear = function(callback) {
  console.log('Clearing action trace', this._data.length, this.logfile);
  if (this._data.length && this.logfile) {
    // Flush data to file
    this.__writeRecords(callback);
  }
  this._data = [];
};

ActionTraceLog.prototype.isEmpty = function() {
  return this._data.length === 0;
};

ActionTraceLog.prototype.__writeRecords = function(callback) {
  var filename = this.logfile.filename;
  var format = this.logfile.format;
  var delimiter = this.logfile.delimiter;
  var fields = this.logfile.fields;
  // include constants in output
  var constants = this.constants;
  var constantFieldNames = constants? _.keys(constants) : null;
  var constantFieldValues = constants? _.map(constantFieldNames, function(f) { return constants[f]; }) : null;
  var fillers = (this.useFillers && constants)? _.map(constantFieldNames, function(f) { return '-'; }) : constantFieldValues;
  var fixedPrecision = this.fixedPrecision;
  var formatter = (fixedPrecision != undefined)? function(x) {
    if (Number.isFinite(x) && !Number.isInteger(x)) {
      return x.toFixed(fixedPrecision);
    } else {
      return x;
    }}
   : null;
  if (format === 'ndjson') {
    console.info('Writing records to ' + filename + ': format ' + format);
    var content = _.map(this._data, function(x) {
      if (constants) {
        if (Array.isArray(x)) {
          x = _.concat(constantFieldValues, x);
        } else {
          x = _.defaults(Object.create(null), x, constants);
        }
      }
      return JSON.stringify(x);
    }).join('\n');
    this.fs.fsAppendToFile(filename, content, callback);
  } else if (delimiter) {
    console.info('Writing records to ' + filename + ': delimited format ' + format);
    // Write delimited...
    var content = _.map(this._data, function(x,i) {
      var cfv = (i === 0)? constantFieldValues : fillers;
      return _.toDelimitedString(x, delimiter, fields, cfv, formatter);
    }).join('\n') + '\n';
    var header = constantFieldNames.concat(fields).join(delimiter) + '\n';
    this.fs.writeToFile(filename, content, { append: true, initialContent: header, callback: callback });
  } else {
    console.error('Cannot write records to ' + filename + ': unknown format ' + format);
  }
};

ActionTraceLog.prototype.loadRecords = function(filename, callback) {
  var scope = this;
  this.fs.loadDelimited(filename, null, function(err, parsed) {
    if (err) {
      callback(err, null);
    } else if (parsed.error) {
      callback(parsed.error, null);
    } else {
      scope._data = parsed.data;
      for (var i = 1; i < parsed.data.length; i++) {
        var prev = parsed.data[i-1];
        var rec = parsed.data[i];
        _.each(rec, function(v,k) {
          if (v === '-') {
            rec[k] = prev[k];
          }
        });
        if (rec.forces) {
          rec.forces = rec.forces.split(',').map(function(f) { return parseFloat(f); });
        }
      }
      callback(null, scope._data);
    }
  });
};

ActionTraceLog.recordsToEpisodes = function(records, sceneState) {
  var Constants = require('Constants');
  var Object3DUtil = require('geo/Object3DUtil');

  var scaleBy = Constants.metersToVirtualUnit;
  var episodes = _.mapValues(_.groupBy(records, 'episode'), function(recs) {
    var goals = _.filter(recs, function(d) { return d.actions === 'goal'; } );
    var steps = _.filter(recs, function(d) { return d.actions !== 'goal'; } );
    var startStep = steps[0];
    var start = {
      position: new THREE.Vector3(startStep.px * scaleBy, startStep.py * scaleBy, startStep.pz * scaleBy ),
      angle: startStep.rotation
    };
    var isCorrectScene = sceneState && sceneState.getFullID() === recs[0].sceneId;
    // convert some of the goal and start info
    for (var i = 0; i < goals.length; i++) {
      var g = goals[i];
      g.position = new THREE.Vector3(g.px * scaleBy, g.py * scaleBy, g.pz * scaleBy);
      if (isCorrectScene && g.actionArgs) {
        // Try to get object
        g.object3D = sceneState.findNodeById(g.actionArgs);
        if (g.object3D) {
          g.bbox = Object3DUtil.getBoundingBox(g.object3D);
        }
      }
    }
    var episode = {
      task: recs[0].task,
      sceneId: recs[0].sceneId,
      episodeId: recs[0].episode,
      records: recs,
      goals: goals,
      steps: steps,
      start: start
    };
    return episode;
  });
  return episodes;
};

module.exports = ActionTraceLog;
