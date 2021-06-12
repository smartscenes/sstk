// Utility functions for measuring timings
// A structure that maps from objects to integers
var _ = require('util/util');

function TimeRecord(start) {
  this.start = start;
}

TimeRecord.prototype.setEnd = function(end) {
  this.end = end;
  this.duration = end - this.start;
};

TimeRecord.prototype.toJson = function() {
  return {
    start: this.start,
    end: this.end,
    duration: this.duration
  };
};

function Timings() {
  this.__times = {};
  this.mark('initial');
}

Timings.prototype.__getTime = function() {
  return new Date().getTime();
};


Timings.prototype.start = function(name) {
  this.__times[name] = new TimeRecord(this.__getTime());
};

Timings.prototype.stop = function(name) {
  if (this.__times[name]) {
    this.__times[name].setEnd(this.__getTime());
    console.log('Timing for ' + name + ' is ' + this.getDuration(name));
  }
};

Timings.prototype.mark = function(name) {
  this.__times[name] = this.__getTime();
  console.log('Timing for ' + name + ' is ' + this.getDuration(name));
};

Timings.prototype.get = function(name) {
  return this.__times[name];
};

Timings.prototype.getEndTime = function(name) {
  if (this.__times[name] != undefined) {
    var t = this.__times[name];
    return isFinite(t)? t : t.end;
  }
};

Timings.prototype.getDuration = function(name, start) {
  if (this.__times[name] != undefined) {
    var t = this.__times[name];
    if (!(t instanceof TimeRecord)) {
      start = start || 'initial';
    }
    if (start) {
      var endTime = isFinite(t)? t : t.end;
      var startTime = this.getEndTime(start);
      return endTime - startTime;
    }
    if (t.duration != undefined) {
      return t.duration;
    }
  }
};

Timings.prototype.toJson = function() {
  var res = {};
  res.times = _.mapValues(this.__times, function(x) {
    return (x instanceof TimeRecord)? x.toJson():x;
  });
  res.durations = {};
  for (var name in res.times) {
    if (res.times.hasOwnProperty(name) && name !== 'initial') {
      res.durations[name] = this.getDuration(name);
    }
  }
  return res;
};

module.exports = Timings;
