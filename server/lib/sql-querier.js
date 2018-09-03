var mysql = require('mysql');
var async = require('async');
var _ = require('lodash');
var log = require('../lib/logger')('SQLQuerier');
var tables = {};


// NOTE: COUNT_DISTINCT is not true SQL function
var validAggrFunctions = ['AVG', 'COUNT', 'GROUP_CONCAT', 'MAX', 'MIN', 'STD', 'SUM', 'VAR', 'COUNT_DISTINCT'];

// Wrapper around mysql for communication with SQL databases
// params should contain members: host, user, password, database
function SQLQuerier(params) {
  if (params && params.host && params.user && params.password && params.database) {
    this.pool = mysql.createPool({
      connectionLimit : 100, //important
      host     : params.host,
      port     : params.port,
      user     : params.user,
      password : params.password,
      database : params.database,
      debug    : false
    });
  } else {
    throw new Error('Tried to create SQLQuerier with invalid params:' + params);
  }
}

SQLQuerier.prototype.execute = function(queryString, queryParams, callback) {
  this.pool.getConnection(function(err, connection) {
    if (err) {
      if (connection) connection.release();
      callback(err, null);
      return;
    }

    connection.query(queryString, queryParams, function(err, rows) {
      connection.release();
      callback(err, rows);
    });
    //connection.on('error', onError);
  });
};

SQLQuerier.prototype.__getErrorCallback = function(res) {
  return function(err) {
    log.error('Error querying database', err);
    res.status(500).json({"code" : 500, "status" : "Error in database connection: " + err});
  };
};


SQLQuerier.prototype.queryDb = function(queryString, queryParams, res, onSuccessCallback, onErrorCallback) {
  var onSuccess = onSuccessCallback || function(rows) { res.json(rows); };
  var onError = onErrorCallback || this.__getErrorCallback(res);

  this.execute(queryString, queryParams, function(err, rows) {
    if(!err) {
      onSuccess(rows);
    } else {
      onError(err);
    }
  });
};


SQLQuerier.prototype.updateById = function(table, fields, ids, callback) {
  var batchsize = 1000;
  var fieldsSetStmt = fields.map(function(f) { return "?? = ?"; });
  var queryBase = "UPDATE ?? SET " + fieldsSetStmt + " WHERE ";
  var queryParamsBase = [table].concat( _.flatten(fields.map(function(f) { return [f.name, f.value]; } )));

  var begin = 0;
  var end = 0;
  var scope = this;
  async.whilst(
    function() { return end < ids.length; },
    function(callback) {
      begin = end;
      end = Math.min(begin + batchsize, ids.length);
      var batchIds = ids.slice(begin, end);
      var query = queryBase + '(' + batchIds.map(function(f) { return "?"; }).join(',') + ')';
      var queryParams = queryParamsBase.concat(batchIds);
      scope.execute(query, queryParams, callback);
    },
    function (err, results) {
      callback(err, results);
    }
  );
};

/**
 * Update records in database
 * @param opts
 * @param opts.table {string} Table name
 * @param opts.data {Object.<string,Object<string,*>>[]} Map of id to map of field/value pairs to update for the id.
 * @param opts.validUpdateFields {string[]} List of valid fields for update
 * @param opts.idField=id {string} id field
 * @param opts.callback
 */
SQLQuerier.prototype.updateRecords = function(opts) {
  var table = opts.table;
  var idToUpdates = opts.data;
  var validUpdateFields = opts.updateFields;
  var idField = opts.idField || 'id';
  var callback = opts.callback;
  // Go through and update records
  this.pool.getConnection(function(err, connection) {
    if (err) {
      if (connection) connection.release();
      callback(err, null);
      return;
    }

    connection.beginTransaction(function (err) {
      if (err) {
        connection.release();
        callback(err, null);
      } else {
        async.forEachOfSeries(idToUpdates, function (allFields, id, cb) {
          var fields = _.pick(allFields, validUpdateFields);
          var fieldsSetStmt = _.map(fields, function (v, f) {
            return "?? = ?";
          });
          if (fieldsSetStmt.length > 0) {
            var queryString = "UPDATE ?? SET " + fieldsSetStmt + " WHERE " + idField + " = ?";
            var queryParams = [table].concat(_.flatten(
              _.map(fields, function (v, f) {
                return [f, v];
              }))).concat(id);

            log.info('update query:', queryString, queryParams);
            connection.query(queryString, queryParams, cb);
          } else {
            log.warn('nothing to update for ' + table + ', ' + idField + ' ' + id
              + ', allFields=' + JSON.stringify(allFields)
              + ', valid fields are ' + validUpdateFields);
            cb(null, null);
          }
        }, function (error, results) {
          if (error) {
            return connection.rollback(function() {
              connection.release();
              callback(error, results);
            });
          } else {
            console.log('Commit!');
            connection.commit(function (err) {
              if (err) {
                connection.rollback(function () {
                  connection.release();
                  callback(err, results);
                });
              } else {
                connection.release();
                callback(error, results);
              }
            });
          }
        });
      }
    });
  });
};

SQLQuerier.prototype.__queryColumnNames = function(tablename, onSuccessCallback, onErrorCallback) {
  var query = "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME=?";
  this.queryDb(query, [tablename], null, function(rows) {
    onSuccessCallback(rows.map(function(x) { return x['COLUMN_NAME']; }));
  }, onErrorCallback);
};

SQLQuerier.prototype.queryColumnNames = function(tablename, onSuccessCallback, onErrorCallback) {
  var table = tables[tablename];
  if (table && table.columns) {
    onSuccessCallback(table.columns);
  } else {
    this.__queryColumnNames(tablename, function(columns) {
      if (!tables[tablename]) {
        tables[tablename] = {};
      }
      tables[tablename].columns = columns;
      onSuccessCallback(columns);
    }, onErrorCallback);
  }
};

SQLQuerier.prototype.queryImageData = function(tablename, field, idField, id, onSuccessCallback, onErrorCallback) {
  var query = "SELECT ?? from ?? where ?? = ?";
  this.queryDb(query, [field, tablename, idField, id], null, onSuccessCallback, onErrorCallback);
};

SQLQuerier.prototype.handleImageQuery = function(req, res, tablename, field, idField, id) {
  var errMessage = 'Error fetching image field ' + field + ' from table '
    + tablename + ' with ' + idField + '=' + id;
  this.queryImageData(tablename, field, idField, id,
    function (rows) {
      if (rows && rows.length > 0) {
        var data = rows[0][field];
        if (data && data.startsWith('data:')) {
          var i = data.indexOf(';base64,');
          if (i >= 0) {
            var contentStart = i + ';base64,'.length;
            var contentType = data.substring(5, i);
            res.contentType(contentType);
            res.send(new Buffer(data.substring(contentStart), 'base64'));
            return;
          }
        }
        if (data) {
          log.error(errMessage + ': Not a image', data);
          res.send('Not a image', 500);
        } else {
          res.send('Not found', 404);
        }
      } else {
        res.send('Not found', 404);
      }
    }, function (err) {
      log.warn(errMessage, err);
      res.send('ERROR', 500);
    }
  );
};


SQLQuerier.OPMAP = {
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
SQLQuerier.OPS = _.values(SQLQuerier.OPMAP);

SQLQuerier.prototype.getQueryFilters = function(params, validParamFields, tableName) {
  var baseFilters = this.__getConjQueryFilters(params, validParamFields, tableName);
  var ors = params['$or'];
  if (ors) {
    //console.log(ors);
    if (!_.isArray(ors)) {
      ors = [ors];
    }
    var scope = this;
    ors = ors.map(function(or) { return (typeof or === 'string')? JSON.parse(or) : or; });
    var orfs = ors.map(function(x) { return scope.__getConjQueryFilters(x, validParamFields, tableName); })
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

SQLQuerier.prototype.__getConjQueryFilters = function(params, validParamFields, tableName) {
  var filters = [];
  var filterString = "";
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
    if (typeof pfield === "string") {
      pfield = { field: pfield, param: pfield, op: "=" };
    }
    var value = params[pfield.param];
    if (value !== undefined) {
      var fieldName = pfield.field;
      if (tableName) {
        fieldName = tableName + '.' + fieldName;
      }
      if (_.isArray(value)) {
        var values = value.map(function(x) { return mysql.escape(x); });
        appendFilter("?? IN (" + values.join(',') + ")", [fieldName]);
      } else if (_.isObject(value)) {
        var fconj = toConj(value['$conj'], gconj);
        var fFilterString = '';
        for (var k in value) {
          if (k === '$conj') { continue; }
          if (value.hasOwnProperty(k)) {
            var op = k;
            var v = value[k];
            if (SQLQuerier.OPS.indexOf(op) < 0) {
              var op2 = SQLQuerier.OPMAP[op];
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
        appendFilter("?? " + pfield.op + " ?", [fieldName, value]);
      }
    }
  }
  return { filters: filters, filterString: filterString };
};

SQLQuerier.prototype.appendQueryFilter = function(filters, column, op, value, appendValueDirectly) {
  if (filters.filterString.length > 0) {
    filters.filterString = filters.filterString + " AND ";
  }
  filters.filterString = filters.filterString + " ?? " + op + " " + (appendValueDirectly? value:"?");
  filters.filters.push(column);
  if (!appendValueDirectly) {
    filters.filters.push(value);
  }
  return filters;
};

SQLQuerier.prototype.formatQuery = function(sql, filters) {
  return mysql.format(sql, filters);
};

SQLQuerier.prototype.queryTableByCreatedAt = function(options, res, onSuccess, onError) {
  options.orderBy = 'created_at DESC';
  this.queryTable(options, res, onSuccess, onError);
};

SQLQuerier.prototype.queryTable = function(options, res, onSuccess, onError) {
  // Get queryFilters
  if (!options.queryFilters) {
    if (options.params && options.validParamFields) {
      options.queryFilters = this.getQueryFilters(options.params, options.validParamFields);
    }
  }

  var f = options.queryFilters;
  var pool = this.pool;
  var columns = (options.columns && options.columns.length)?
    options.columns.map( function(x) { return pool.escapeId(x); }) : ['*'];
  var groupById = options.groupBy? pool.escapeId(options.groupBy) : null;
  if (groupById) {
    // Trying to do groupBy
    if (options.columns && options.columns.length) {
      var hasGroupById = false;
      for (var i = 0; i < options.columns.length; i++) {
        var columnRaw = options.columns[i];
        if (columnRaw === options.groupBy) {
          hasGroupById = true;
        } else {
          var aggr = (options.aggregate)? options.aggregate[columnRaw] : options.defaultAggregate;
          if (aggr == undefined) {
            aggr = options.defaultAggregate;
          }
          if (aggr) {
            var aggrFn = aggr;
            var aggrName = _.last(columns[i].split('.'));
            var aggrField = columns[i];
            if (typeof aggr !== 'string') {
              if (aggr.op != undefined) { aggrFn = aggr.op; }
              if (aggr.field != undefined) { aggrField = aggr.field; }
              if (aggr.name != undefined) { aggrName = aggr.name; }
            }
            if (aggrFn && validAggrFunctions.indexOf(aggrFn) < 0) {
              // Invalid aggregation function
              log.warn('Invalid aggregation function ' + aggrFn + ' for '
                + aggrName + ' over ' + ' field ' + aggrField
                + ', using ' + options.defaultAggregate + ' instead');
              aggrFn = options.defaultAggregate;
            }
            if (aggrFn === 'COUNT_DISTINCT') {
              columns[i] = 'COUNT(DISTINCT(' + aggrField + ')) as ' + aggrName;
            } else {
              columns[i] = aggrFn + '(' + aggrField + ') as ' + aggrName;
            }
          }
        }
      }
      if (!hasGroupById) {
        columns.push(groupById);
      }
    } else {
      columns = [groupById, 'COUNT(*)'];
    }
  }
  var columnsStr = columns.join(',');

  var tableName = options.table;
  var limitTo = (options.limit)? parseInt(options.limit) : null;
  var offset = (options.offset)? parseInt(options.offset) : null;
  var query;
  if (f.filters.length > 0) {
    var sql = "SELECT " + columnsStr + " FROM " + tableName + " where " + f.filterString;
    log.info('query filters', f.filters);
    query = mysql.format(sql, f.filters);
  } else {
    query = "SELECT " + columnsStr + " FROM " + tableName;
  }
  if (groupById) {
    query += ' GROUP BY ' + groupById;
  }
  if (options.orderBy) {
    query += ' ORDER BY ' + options.orderBy;
  }
  if (limitTo) {
    query += ' LIMIT ' + limitTo;
  }
  if (offset) {
    query += ' OFFSET ' + offset;
  }
  log.info('query', query);
  this.queryDb(query, null, res, onSuccess, onError);
};

module.exports = SQLQuerier;
