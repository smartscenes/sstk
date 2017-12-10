/* TODO: Develop this more, have assetsDb use this instead of its custom parsing */

var self = {};

var lucenequeryparser = require('lucene-query-parser');

function simpleParse(query) {
  var queryTerms = query.split(' ');
  var queryFields = [];
  for (var i = 0; i < queryTerms.length; i++) {
    var p = queryTerms[i].split(':');
    queryFields.push({ name: p[0], value: p[1] });
  }
  return queryFields;
}
self.simpleParse = simpleParse;

function luceneParse(query, options) {
  var results = lucenequeryparser.parse(query, options);
  //console.log(results);
  return results;
}

self.luceneParse = luceneParse;

function getLeftmostNode(parse) {
  if (parse.right) {
    return getRightmostNode(parse.right);
  } else if (parse.left) {
    return getRightmostNode(parse.left);
  } else {
    return parse;
  }
}

self.getLeftmostNode = getLeftmostNode;

function getRightmostNode(parse) {
  if (parse.right) {
    return getRightmostNode(parse.right);
  } else if (parse.left) {
    return getRightmostNode(parse.left);
  } else {
    return parse;
  }
}

self.getRightmostNode = getRightmostNode;

function acceptAll() {
  return true;
}

function orFilter() {
  var fns = arguments;
  return function() {
    for (var i = 0; i < fns.length; i++) {
      if (fns[i].apply(null, arguments)) {
        return true;
      }
      return false;
    }
  };
}

function andFilter() {
  var fns = arguments;
  return function() {
    for (var i = 0; i < fns.length; i++) {
      if (!fns[i].apply(null, arguments)) {
        return false;
      }
      return true;
    }
  };
}

function termMatchFilter(field, term) {
  return function(d) {
    var v = d[field];
    if (term === '*') {
      if (v == undefined) {
        return false;
      }
    } else if (term.indexOf('*') >= 0) {
      var regex = new RegExp(term.replace('*', '.*'));
      return v.search(regex) >=0;
    } else if (term.startsWith('/') && term.endsWith('/')) {
      var regex = new RegExp(term.substring(0, term.length-1));
      return v.search(regex) >=0;
    } else if (v !== term) {
      return false;
    }
    return true;
  };
}

function inclusiveRangeFilter(field, min, max) {
  return function(d) {
    var v = d[field];
    return ((v != undefined) &&
    (min === '*' || v >= min) &&
    (max === '*' || v <= max));
  };
}

function exclusiveRangeFilter(field, min, max) {
  return function(d) {
    var v = d[field];
    return ((v != undefined) &&
    (min === '*' || v > min) &&
    (max === '*' || v < max));
  };
}

function rangeFilter(field, min, max, isInclusive) {
  if (isInclusive) {
    return inclusiveRangeFilter(field, min, max);
  } else {
    return exclusiveRangeFilter(field, min, max);
  }
}

function parseToFilter(parse) {
  if (parse.field) {
    if (parse.term != undefined ) {
      return termMatchFilter(parse.field, parse.term);
    } else if (parse.term_min != undefined && parse.term_max != undefined) {
      return rangeFilter(parse.field, parse.term_min, parse.term_max);
    } else {
      console.error('Cannot handle parse term');
      console.log(parse);
    }
  } else if (parse.operator) {
    var composeFn;
    if (parse.operator === 'AND') {
      composeFn = andFilter;
    } else if (parse.operator === 'OR') {
      composeFn = orFilter;
    } else {
      throw new Error('Unsupported operator ' + parse.operator);
    }
    var fl = parseToFilter(parse.left);
    var fr = parseToFilter(parse.right);
    return composeFn(fl, fr);
  } else if (parse.left) {
    // Only the left side
    var fl = parseToFilter(parse.left);
    return fl;
  } else {
    // Accept all
    return acceptAll;
  }
}

function getFilter(query) {
  var parse = luceneParse(query);
  return parseToFilter(parse);
}

self.getFilter = getFilter;

module.exports = self;

