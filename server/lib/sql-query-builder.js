const mysql = require("mysql2");
const _ = require("lodash");

const SQLQueryBuilder = {};

SQLQueryBuilder.OPMAP = {
  '$ne': '<>',
  '$eq': '=',
  '$gt': '>',
  '$lt': '<',
  '$gte': '>=',
  '$lte': '<=',
  '$in': 'IN',
  '$nin': 'NOT IN',
  '$nregex': 'NOT REGEXP',
  '$regex': 'REGEXP',
  '$like': 'LIKE',
  '$exists': 'IS NOT NULL',
  '$isnull': 'IS NULL'
};
SQLQueryBuilder.OPS = _.values(SQLQueryBuilder.OPMAP);

/**
 * Given input query parameters, and a set of valid parameter fields,
 * returns
 * @param log
 * @param params
 * @param validParamFields {Array<string|SqlFieldInfo>>} Valid parameters (with mappings to SQL column fields)
 * @param [tableName] {string} Optional name of table used to prefix field names
 * @returns {SqlQueryFilterInfo}
 */
SQLQueryBuilder.getQueryFilters = function(log, params, validParamFields, tableName) {
  var baseFilters = SQLQueryBuilder.__getConjQueryFilters(log, params, validParamFields, tableName);
  var ors = params['$or'];
  if (ors) {
    //console.log(ors);
    if (!_.isArray(ors)) {
      ors = [ors];
    }
    ors = ors.map(function(or) { return (typeof or === 'string')? JSON.parse(or) : or; });
    var orfs = ors.map(function(x) { return SQLQueryBuilder.__getConjQueryFilters(log, x, validParamFields, tableName); })
      .filter(function(x) { return x && x.filterString.length > 0; });
    if (orfs.length > 0) {
      var filters = [];
      _.each(orfs, function(f) { filters = _.concat(filters, f.filters); });
      var filterString = orfs.map(function(f) { return '(' + f.filterString + ')'; }).join(' OR ');
      //console.log(filters);
      if (baseFilters.filterString.length > 0) {
        return { filters: baseFilters.filters.concat(filters), filterString: '(' + baseFilters.filterString + ') AND (' + filterString + ')'};
      } else {
        return { filters: filters, filterString: filterString };
      }
    }
  } else {
    return baseFilters;
  }
  return baseFilters;
};

SQLQueryBuilder.__getConjQueryFilters = function(log, params, validParamFields, tableName) {
  var filters = [];
  var filterString = '';
  var gconj = 'AND';
  function toConj(str, dft) {
    if (str && str.toLowerCase() === 'or') {
      return 'OR';
    } else if (str && str.toLowerCase() === 'and') {
      return 'AND';
    }
    return dft;
  }
  function appendFilterConj(str, conj, fs, vs) {
    if (str.length > 0) {
      str = str + ' ' + conj + ' ' + fs;
    } else {
      str = fs;
    }
    if (vs) {
      for (var i = 0; i < vs.length; i++) {
        filters.push(vs[i]);
      }
    }
    return str;
  }
  function appendFilter(fs, vs) {
    filterString = appendFilterConj(filterString, gconj, fs, vs);
  }
  for (var i = 0; i < validParamFields.length; i++) {
    var pfield = validParamFields[i];
    if (typeof pfield === 'string') {
      pfield = { field: pfield, param: pfield, op: '=' };
    }
    var value = params[pfield.param];
    if (value !== undefined) {
      var fieldName = pfield.field;
      if (tableName) {
        fieldName = tableName + '.' + fieldName;
      }
      if (_.isArray(value)) {
        var values = value.map(function(x) { return mysql.escape(x); });
        appendFilter('?? IN (' + values.join(',') + ')', [fieldName]);
      } else if (_.isObject(value)) {
        var fconj = toConj(value['$conj'], gconj);
        var fFilterString = '';
        for (var k in value) {
          if (k === '$conj') { continue; }
          if (value.hasOwnProperty(k)) {
            var op = k;
            var v = value[k];
            if (SQLQueryBuilder.OPS.indexOf(op) < 0) {
              var op2 = SQLQueryBuilder.OPMAP[op];
              if (op2) {
                op = op2;
              } else {
                log.warn('Ignoring invalid operator for ' + fieldName + ' ' + op + ' ' + v);
                op = null;
              }
            }
            if (op) {
              var fs = '';
              if (op === 'IS NOT NULL') {
                if (typeof v === 'string' && v.toLowerCase() === 'false') { v = false; }
                fs = '?? ' + ((v == undefined || v || v === '')? op : 'IS NULL');
              } else if (op === 'IS NULL') {
                if (typeof v === 'string' && v.toLowerCase() === 'false') { v = false; }
                if (v === '') {
                  fs = '?? IS NULL OR ' + mysql.escapeId(fieldName) + " = ''";
                } else {
                  fs = '?? ' + ((v == undefined || v) ? op : 'IS NOT NULL');
                }
              } else if (op === 'IN' || op === 'NOT IN') {
                if (!_.isArray(v)) {
                  if (typeof v === 'string') {
                    v = v.split(',');
                  } else {
                    v = [v];
                  }
                }
                var values = v.map(function(x) { return mysql.escape(x); });
                fs = '?? ' + op + ' (' + values.join(',') + ')';
              } else {
                fs = '?? ' + op + ' ' + mysql.escape(v);
              }
              fFilterString = appendFilterConj(fFilterString, fconj, fs, [fieldName]);
            }
          }
        }
        if (fconj !== gconj) {
          filterString = appendFilterConj(filterString, gconj, '(' + fFilterString + ')');
        } else {
          appendFilter(fFilterString);
        }
      } else {
        appendFilter('?? ' + pfield.op + ' ?', [fieldName, value]);
      }
    }
  }
  return { filters: filters, filterString: filterString };
};

SQLQueryBuilder.appendQueryFilter = function(filters, column, op, value, appendValueDirectly) {
  if (filters.filterString.length > 0) {
    filters.filterString = filters.filterString + ' AND ';
  }
  filters.filterString = filters.filterString + ' ?? ' + op + ' ' + (appendValueDirectly? value:'?');
  filters.filters.push(column);
  if (!appendValueDirectly) {
    filters.filters.push(value);
  }
  return filters;
};

module.exports = SQLQueryBuilder;
