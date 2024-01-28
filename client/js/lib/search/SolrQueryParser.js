/* TODO: Develop this more, have assetsDb use this instead of its custom parsing */

const self = {};

const lucenequeryparser = require('lucene-query-parser');
const _ = require('util/util');

function simpleParse(query) {
  const queryTerms = query.split(' ');
  const queryFields = [];
  for (let i = 0; i < queryTerms.length; i++) {
    const p = queryTerms[i].split(':');
    queryFields.push({ name: p[0], value: p[1] });
  }
  return queryFields;
}
self.simpleParse = simpleParse;

function luceneParse(query, options) {
  const results = lucenequeryparser.parse(query, options);
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
  const fns = arguments;
  return function() {
    for (let i = 0; i < fns.length; i++) {
      if (fns[i].apply(null, arguments)) {
        return true;
      }
    }
    return false;
  };
}

function andFilter() {
  const fns = arguments;
  return function() {
    for (let i = 0; i < fns.length; i++) {
      if (!fns[i].apply(null, arguments)) {
        return false;
      }
    }
    return true;
  };
}

function termMatchFilterSingle(v, term) {
  if (term === '*') {
    if (v == undefined) {
      return false;
    } else {
      return true;
    }
  } else if (term.indexOf('*') >= 0) {
    const regex = new RegExp(term.replace('*', '.*'));
    return v && v.search(regex) >=0;
  } else if (term.startsWith('/') && term.endsWith('/')) {
    const regex = new RegExp(term.substring(0, term.length - 1));
    return v && v.search(regex) >= 0;
  } else if (term === 'true') {
    return !!v && v != undefined;
  } else if (term === 'false') {
    return !v && v != undefined;
  } else if (v !== term) {
    return false;
  } else {
    return true;
  }
}

function inclusiveRangeFilterSingle(v, min, max) {
  return ((v != undefined) &&
    (min === '*' || v >= min) &&
    (max === '*' || v <= max));
}

function exclusiveRangeFilterSingle(v, min, max) {
  return ((v != undefined) &&
    (min === '*' || v > min) &&
    (max === '*' || v < max));
}

function termMatchFilter(field, term) {
  return function(d) {
    const v = d[field];
    if (Array.isArray(v)) {
      return _.any(v, function(x) { return termMatchFilterSingle(x, term); });
    } else {
      return termMatchFilterSingle(v, term);
    }
  };
}

function rangeFilter(field, min, max, isInclusive) {
  if (isInclusive) {
    return function(d) {
      const v = d[field];
      if (Array.isArray(v)) {
        return _.any(v, function(x) { return inclusiveRangeFilterSingle(x, min, max); });
      } else {
        return inclusiveRangeFilterSingle(v, min, max);
      }
    };
  } else {
    return function(d) {
      const v = d[field];
      if (Array.isArray(v)) {
        return _.any(v, function(x) { return exclusiveRangeFilterSingle(x, min, max); });
      } else {
        return exclusiveRangeFilterSingle(v, min, max);
      }
    };
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
    let composeFn;
    if (parse.operator === 'AND') {
      composeFn = andFilter;
    } else if (parse.operator === 'OR') {
      composeFn = orFilter;
    } else {
      throw new Error('Unsupported operator ' + parse.operator);
    }
    const fl = parseToFilter(parse.left);
    const fr = parseToFilter(parse.right);
    return composeFn(fl, fr);
  } else if (parse.left) {
    // Only the left side
    const fl = parseToFilter(parse.left);
    return fl;
  } else {
    // Accept all
    return acceptAll;
  }
}

function getFilter(query) {
  const parse = luceneParse(query);
  return parseToFilter(parse);
}

self.getFilter = getFilter;

function getFilterCached(query) {
  if (!self.__queryCache) {
    const AssetCache = require('assets/AssetCache');
    self.__queryCache = new AssetCache(100);
  }
  return self.__queryCache.getOrElse(query, (q) => getFilter(q));
}

self.getFilterCached = getFilterCached;

module.exports = self;

