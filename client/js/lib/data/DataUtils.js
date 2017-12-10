'use strict';

var TypeUtils = require('data/TypeUtils.js');

var DataUtils = {};

DataUtils.DAY_DURATION = 1000*60*60*24;  // milliseconds to seconds to minutes to hours to days

var jsToVizTypeMap = Object.freeze({
  string: 'categorical',
  boolean: 'boolean',
  number: 'numeric'
});

//maximum value of a numeric field given raw query data
DataUtils.max = function (field, data) {
  return Math.max.apply(Math, data.map(function (d) {
    return d[field];
  }));
};

//minimum value of a numeric field given raw query data
DataUtils.min = function (field, data) {
  return Math.min.apply(Math, data.map(function (d) {
    return d[field];
  }));
};

//filters data, leaving only the elements that are defined for a specific attribute
DataUtils.filterData = function (field, data) {
  return data.filter(function (d) {
    return d[field] != undefined;
  });
};

DataUtils.filterNumbers = function (field, data) {
  return data.filter(function (d) {
    var v = d[field];
    var number = Number(v);
    return !isNaN(number);
  });
};

DataUtils.filterDates = function (field, data) {
  return data.filter(function (d) {
    var v = d[field];
    return TypeUtils.getType(v) === 'Date';
  });
};

//given a category field and a numeric field, returns the average numeric field count per category
//firstField must be categorical and secondField must be numeric
DataUtils.getAverageData = function (firstField, secondField, data) {
  var averageData = {}; //object that will hold all average information
  var averages = {}; //raw averages per category

  data.forEach(function (d) {
    var categories = d[firstField] || 'undefined'; //get category of each model
    if (!(categories instanceof Array)) {
      categories = [categories];
    }
    categories.forEach(function (category) {
      if (!averages[category]) {
        averages[category] = {  //create initial count for this category, to be averaged later
          sum: d[secondField] || 0,
          count: 1
        };
      } else {
        averages[category].sum += d[secondField] || 0; //add to sum, increment count
        averages[category].count += 1;
      }
    });
  });

  //average over all categories
  Object.keys(averages).forEach(function (category) {
    averages[category] = parseInt(averages[category].sum / averages[category].count);
  });

  averageData.counts = averages;
  averageData.field = secondField;
  averageData.maxCount = this.getMaxCount(averages);

  return averageData;
};

//returns count data in object form, with a field count mapping to how many models in data
//contain that field count, used on numeric data, supports binning
DataUtils.getCountData = function (field, data, numBins) {
  var countData = {};
  var counts = {};
  data = DataUtils.filterNumbers(field, data);
  var max = DataUtils.max(field, data);

  //set numBins to max if null, or if the number of bins exceeds the maximum number of categories
  if (!numBins || max / numBins === 0) {
    numBins = max;
  }

  var stepsize = Math.ceil(max / numBins);

  //set all fields to 0 initially
  for (var i = 0; i <= max; i += stepsize) {
    counts[i] = 0;
  }

  //console.log(counts);
  data.forEach(function (d) {
    var count = d[field];
    var bin = Math.floor(count / stepsize) * stepsize;
    if (!count) return;
    counts[bin]++;
  });

  countData.maxCount = DataUtils.getMaxCount(counts);
  countData.field = field;
  countData.counts = counts;

  return countData;
};

//get count of every category of a given dataset, must be categorical
DataUtils.getCategoryCounts = function (field, data) {
  var countData = {};
  var counts = {};

  data.forEach(function (d) {
    var values = d[field] || 'undefined';
    if (!(values instanceof Array)) {
      values = [values];
    }

    values.forEach(function (value) {
      if (!value) return;
      if (!counts[value]) {
        counts[value] = 1;
      } else {
        counts[value]++;
      }
    });
  });

  countData.maxCount = DataUtils.getMaxCount(counts);
  countData.field = field;
  countData.counts = counts;

  return countData;
};

//this function bins numeric data into numBins amount of range, returns data packet with distributions
//don't need this anymore
DataUtils.getBinnedData = function (countData, numBins) {
  var binnedCountMap = {};
  var binnedCounts = {};
  var max = countData.max;
  var stepsize = max / numBins;

  var counts = countData.counts;
  Object.keys(counts).forEach(function (count) {
    var bin = (count % numBins) * stepsize;

    if (!binnedCounts[bin]) binnedCounts[bin] = counts[count];
    else binnedCounts[bin] += counts[count];
  });

  //store various binning properties
  binnedCountMap.counts = binnedCounts;
  binnedCountMap.max = max;
  binnedCountMap.field = countData.field;
  binnedCountMap.numBins = numBins;
  binnedCountMap.maxCount = this.getMaxCount(binnedCounts);
  binnedCountMap.field = countData.field;

  return binnedCountMap;
};

//returns the max count of a categorical data form
DataUtils.getMaxCount = function (counts) {
  return Math.max.apply(Math, Object.keys(counts).map(function (count) {
    return counts[count];
  }));
};

DataUtils.extractFieldsFromData = function(data, options) {
  // Figure out fields from data
  options = options || {};
  var fields = {};
  for (var i = 0; i < data.length; i++) {
    var d = data[i];
    for (var attr in d) {
      var ignore = options.ignore && options.ignore.indexOf(attr) >= 0;
      if (d.hasOwnProperty(attr) && !ignore) {
        var v = d[attr];
        if (v == undefined || v === '') continue; // ignore empty fields
        if (!fields[attr]) {
          var jstype = typeof v;
          var type = null;
          if (options.fields && options.fields[attr]) {
            type = options.fields[attr].type;
          }
          if (!type) {
            type = jsToVizTypeMap[jstype];
          }
          fields[attr] = { name: attr, jstype: jstype, type: type};
          if (options.keepAllValues) {
            fields[attr].allValues = [v];
          }
          if (options.keepValues) {
            fields[attr].values = new Set();
            fields[attr].values.add(v);
          }
          if (options.keepCounts) {
            fields[attr].counts = { v: 1 };
          }
          if (options.keepStats) {
            fields[attr].stats = { count: 1, min: v, max: v, sum: v, sumOfSquares: v*v };
          }
        } else {
          var f = fields[attr];
          if (options.keepAllValues) {
            f.allValues.append(v);
          }
          if (options.keepValues) {
            f.values.add(v);
          }
          if (options.keepCounts) {
            if (f.counts[v]) {
              f.counts[v]++;
            } else {
              f.counts[v] = 1;
            }
          }
          if (options.keepStats && f.jstype === 'number') {
            f.stats.min = Math.min(f.stats.min, v);
            f.stats.max = Math.max(f.stats.max, v);
            f.stats.sum += v;
            f.stats.sumOfSquares += v*v;
            f.stats.count++;
          }
        }
      }
    }
  }
  if (options.keepValues) {
    // Turn values from Set into array
    for (var fn in fields) {
      if (fields.hasOwnProperty(fn)) {
        var f = fields[fn];
        if (f.values) {
          f.values = Array.from(f.values);
        }
      }
    }
  }
  return fields;
};

//exports
module.exports = DataUtils;
