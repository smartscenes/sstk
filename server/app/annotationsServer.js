var _ = require('lodash');

var AnnotationsServer = function (params) {
  this.sqlDB = params.sqlDB;
  this.config = params.config;
};

AnnotationsServer.prototype.registerRoutes = function(app, mountPath) {
  var scope = this;
  app.get(mountPath + '/preview/:id', function(req, res) { scope.getPreviewImage(req, res); });
  app.post(mountPath + '/submit', function (req, res) { scope.submit(req, res); });
  app.all(mountPath + '/list', function (req, res) { scope.list(req, res); });
  app.all(mountPath + '/get/:id(\\d+)', function (req, res) { scope.get(req, res); });
  app.all(mountPath + '/latest', function (req, res) { scope.getLatest(req, res); });
};

// Fetch preview image
AnnotationsServer.prototype.getPreviewImage = function (req, res) {
  this.sqlDB.handleImageQuery(req, res, 'annotations', 'preview_data', 'id', req.params.id);
};

// Submit annotations
AnnotationsServer.prototype.submit = function (req, res) {
  var sqlDB = this.sqlDB;
  sqlDB.reportAnnotations(req.body, res, function(result) {
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
  function convertAnnotationRows(rows) {
    if (!rows) return;
    //console.time('convertAnnotationRows');
    var converted = rows.map( function(row) {
      if (row.data) {
        try {
          row.data = JSON.parse(row.data);
        } catch (err) {
          log.error('Error converting annotation data' + row.id, err);
        }
      }
      return row;
    });
    //console.timeEnd('convertAnnotationRows');
    return converted;
  }

  var queryParams = _.defaults({}, req.body, req.query);
  var format = queryParams.format;
  if (format === 'json') {
    // Query general annotations table for a summary of segment annotations
    sqlDB.queryAnnotations(queryParams, res, function (rows) {
      rows = sqlDB.convertAnnotationRecords(rows);
      res.json(rows);
    });
  } else {
    // TODO: actualy have a view!
    res.render('annotations', {
      ajaxOptions:  {
        url: this.config.baseUrl + req.path + '?format=json',
        groupBy: queryParams['$groupBy'],
        data: queryParams,
        dataSrc: ''
      },
      baseUrl: this.config.baseUrl
    });
  }
};

// Get a single annotation
AnnotationsServer.prototype.get = function (req, res) {
  var sqlDB = this.sqlDB;
  // Query general annotations table for a summary of segment annotations
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
      res.status(400).json({"code": 400, "status": "No annotation for id " + req.params.id});
    }
  });
};

// get the latest annotation
AnnotationsServer.prototype.getLatest = function (req, res) {
  var sqlDB = this.sqlDB;
  var queryParams = _.defaults({}, req.body, req.query);
  // Query general annotations table for a summary of segment annotations
  sqlDB.queryAnnotations(queryParams, res, function (rows) {
    if (rows && rows.length) {
      var row = rows[0];
      if (_.has(queryParams, 'startAnnotationId')) {
        // Filter rows to be rows that derived from given startAnnotationId
        var sid = parseInt(queryParams['startAnnotationId']);
        var filtered = [];
        var idsInSet = [];
        for (var i = rows.length-1; i >= 0; i--) {
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
      res.status(400).json({"code": 400, "status": "No matching annotation"});
    }
  });
};

module.exports = AnnotationsServer;