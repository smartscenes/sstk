var _ = require('lodash');

var AnnotationsServer = function (params) {
  this.sqlDB = params.sqlDB;
  this.config = params.config;
  this.log = params.log;
  this.__defaultQueryParams = params.defaultQueryParams || {};
  this.__defaultSubmitParams = params.defaultSubmitParams || {};
};

AnnotationsServer.prototype.registerRoutes = function(app, mountPath) {
  var scope = this;
  app.get(mountPath + '/preview/:id', function(req, res) { scope.getPreviewImage(req, res); });
  app.post(mountPath + '/submit', function (req, res) { scope.submit(req, res); });
  app.all(mountPath + '/list', function (req, res) { scope.list(req, res); });
  app.all(mountPath + '/list/latest', function (req, res) { scope.listLatest(req, res); });
  app.all(mountPath + '/list/latest/ids', function (req, res) { scope.listLatestIds(req, res); });
  app.all(mountPath + '/get/:id(\\d+)', function (req, res) { scope.get(req, res); });
  app.all(mountPath + '/latest', function (req, res) { scope.getLatest(req, res); });
  app.all(mountPath + '/edit', function (req, res) { scope.edit(req, res); });
};

// Fetch preview image
AnnotationsServer.prototype.getPreviewImage = function (req, res) {
  this.sqlDB.handleImageQuery(req, res, 'annotations', 'preview_data', 'id', req.params.id);
};

// Submit annotations
AnnotationsServer.prototype.submit = function (req, res) {
  var sqlDB = this.sqlDB;
  var submitParams = _.defaults({}, req.body, this.__defaultSubmitParams);
  if (submitParams.annotations && !submitParams.data) {
    submitParams.data = submitParams.annotations;
    delete submitParams.annotations;
  }
  sqlDB.reportAnnotations(submitParams, res, function(result) {
    res.json({
      annId: result.insertId,
      annCode: result.code,
      code: 200
    });
  });
};

// List annotations
AnnotationsServer.prototype.list = function (req, res) {
  var sqlDB = this.sqlDB;

  var queryParams = _.defaults({}, req.body, req.query);
  var format = queryParams.format;
  if (format === 'json') {
    // Query general annotations table for a summary of segment annotations
    sqlDB.queryAnnotations(queryParams, res, function (rows) {
      var processRow = null;
      if (queryParams.extractData) {
        var fields = queryParams.extractData.split(',');
        processRow = function(row) {
          if (row.data) {
            row.data = _.pick(row.data, fields);
          }
        };
      }
      rows = sqlDB.convertAnnotationRecords(rows, processRow);
      res.json(rows);
    });
  } else {
    // TODO: actually have a view!
    res.render('annotations', {
      ajaxOptions: {
        url: this.config.baseUrl + req.path + '?format=json',
        groupBy: queryParams['$groupBy'],
        data: queryParams,
        dataSrc: ''
      },
      baseUrl: this.config.baseUrl
    });
  }
};

AnnotationsServer.prototype.listLatest = function (req, res) {
  var sqlDB = this.sqlDB;
  var queryParams = _.defaults({'$latest': true}, req.body, req.query);
  // Query general annotations table for a summary of segment annotations
  sqlDB.queryAnnotations(queryParams, res, function (rows) {
    var processRow = null;
    if (queryParams.extractData) {
      var fields = queryParams.extractData.split(',');
      processRow = function(row) {
        if (row.data) {
          row.data = _.pick(row.data, fields);
        }
      };
    }
    rows = sqlDB.convertAnnotationRecords(rows, processRow);
    res.json(rows);
  });
};

AnnotationsServer.prototype.listLatestIds = function (req, res) {
  var sqlDB = this.sqlDB;
  var queryParams = _.defaults({'$latest': true}, req.body, req.query);
  if (queryParams['$columns'] == null) {
    queryParams['$columns'] = ['id', 'type', 'itemId'];
  } else {
    queryParams['$columns'] = _.union(['id', 'type', 'itemId'], queryParams['$columns']);
  }
  // Query general annotations table for a summary of segment annotations
  sqlDB.queryAnnotations(queryParams, res, function (rows) {
    rows = sqlDB.convertAnnotationRecords(rows);
    res.json(rows);
  });
};

// Get a single annotation
AnnotationsServer.prototype.get = function (req, res) {
  var sqlDB = this.sqlDB;
  var log = this.log;
  // Query general annotations table for a summary of annotations
  sqlDB.queryAnnotations(req.params, res, function (rows) {
    var row = (rows && rows.length)? rows[0] : null;
    if (row) {
      if (row.data) {
        try {
          row.data = JSON.parse(row.data);
        } catch (err) {
          log.error('Error converting annotation data' + row.id, err);
        }
      }
      res.json(row);
    } else {
      res.status(400).json({'code': 400, 'status': 'No annotation for id ' + req.params.id});
    }
  });
};

// get the latest annotation
AnnotationsServer.prototype.getLatest = function (req, res) {
  var sqlDB = this.sqlDB;
  var queryParams = _.defaults({ '$latest': true }, req.body, req.query, this.__defaultQueryParams);
  var log = this.log;
  // Query general annotations table for a summary of annotations
  console.log('queryParams', queryParams);
  sqlDB.queryAnnotations(queryParams, res, function (rows) {
    var row = null;
    if (rows && rows.length) {
      row = rows[0];
      if (_.has(queryParams, 'startAnnotationId')) {
        // Filter rows to be rows that derived from given startAnnotationId
        var sid = parseInt(queryParams['startAnnotationId']);
        var filtered = [];
        var idsInSet = [];
        for (var i = rows.length - 1; i >= 0; i--) {
          row = rows[i];
          if (row.data) {
            try {
              row.data = JSON.parse(row.data);
            } catch (err) {
              log.error('Error converting annotation data' + row.id, err);
            }
          }
          var rsid = _.get(row, 'data.startAnnotationId');
          if (rsid === undefined) {
            rsid = _.get(row, 'data.metadata.startAnnotations');
          }
          if (_.isString(rsid)) { rsid = parseInt(rsid); }
          if (row.id === sid || idsInSet.indexOf(rsid) >= 0) {
            filtered.push(row);
            idsInSet.push(row.id);
          }
        }
        if (filtered && filtered.length) {
          row = filtered[filtered.length - 1];
        } else {
          row = undefined;
        }
      } else {
        if (row.data) {
          try {
            row.data = JSON.parse(row.data);
          } catch (err) {
            log.error('Error converting annotation data' + row.id, err);
          }
        }
      }
    }
    if (row) {
      res.json(row);
    } else {
      res.status(400).json({'code': 400, 'status': 'No matching annotation'});
    }
  });
};

AnnotationsServer.prototype.edit = function(req, res) {
  var queryParams = _.defaults({}, req.body, req.query);
  var scope = this;
  var log = this.log;
  var onFinalSuccess = function (rows) {
    rows = scope.sqlDB.convertAnnotationRecords(rows);
    res.json({
      code: 200,
      status: 'ok',
      data: rows
    });
  };
  var onError = function (err) {
    log.error('Error updating database annotations', err);
    res.status(400).json({'code': 500, 'status': 'Error in database: ' + err});
  };
  var onSuccess = function () {
    // Query for all ids
    scope.sqlDB.queryAnnotations({ id: _.keys(queryParams.data) }, res, onFinalSuccess, onError);
  };

  if (queryParams.action === 'edit') {
    try {
      if (queryParams.data && _.size(queryParams.data) > 0) {
        // Currently only allow update of notes and status
        var updateData = queryParams.data;
        var validFields = ['notes', 'status', 'verified', 'condition'];
        var sqlDB = this.sqlDB;
        sqlDB.updateRecords({
          table: 'annotations',
          data: updateData,
          updateFields: validFields,
          callback: function (err, results) {
            if (err) {
              onError(err);
            } else {
              onSuccess();
            }
          }
        });
      } else {
        log.error('Nothing to update');
        res.status(400).json({'code': 400, 'status': 'Nothing to update'});
      }
    } catch (e) {
      log.error('Error updating records', e);
      res.status(400).json({'code': 500, 'status': 'Error updating records'});
    }
  } else {
    res.status(400).json({'code': 400, 'status': 'Unsupported edit action: ' + queryParams.action});
  }
};


module.exports = AnnotationsServer;