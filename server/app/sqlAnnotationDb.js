var _ = require('lodash');
var _log = require('../lib/logger')('SQLAnnotationDb');

var SQLQuerier = require('../lib/sql-querier');

function SQLAnnotationDb(params, log) {
  SQLQuerier.call(this, params, log || _log);
}


SQLAnnotationDb.prototype = Object.create(SQLQuerier.prototype);
SQLAnnotationDb.prototype.constructor = SQLAnnotationDb;

SQLAnnotationDb.prototype.queryScenes = function(res) {
  this.queryDb('select id, name from scenes', [], res);
};

SQLAnnotationDb.prototype.queryScene = function(sceneId, res) {
  if (sceneId.startsWith('mturk.')) {
    sceneId = sceneId.substring(6);
    // TODO: Query mturk completed items view...
    var query = 'select * from mt_completed_items where id = ?';
    var mturkItemCallback = function (rows) {
      var mturkData;
      if (rows.length && rows[0].data) {
        mturkData = JSON.parse(rows[0].data);
      }
      if (mturkData && mturkData.scene) {
        var obj = rows[0];
        obj.data = mturkData.scene;
        obj.mturkInfo = mturkData;
        delete mturkData.scene;
        res.json(obj);
      } else {
        res.status(400).json({'code': 400, 'status': 'No scene for ' + sceneId});
      }
    };
    this.queryDb(query, [sceneId], res, mturkItemCallback);
  } else if (sceneId.startsWith('db.ann-')) {
    sceneId = sceneId.substring(7);
    // TODO: Query annotations table...
    var query = 'select * from annotations where id = ?';
    var annItemCallback = function(rows) {
      var mturkData;
      if (rows.length && rows[0].data) {
        mturkData = JSON.parse(rows[0].data);
      }
      if (mturkData && mturkData.scene) {
        var obj = rows[0];
        obj.data = mturkData.scene;
        obj.mturkInfo = mturkData;
        delete mturkData.scene;
        res.json(obj);
      } else {
        res.status(400).json({'code': 400, 'status': 'No scene for ' + sceneId});
      }
    };
    this.queryDb(query, [sceneId], res, annItemCallback);
  } else {
    if (sceneId.startsWith('db.')) {
      sceneId = sceneId.substring(3);
    }
    var query = 'select * from scenes where id = ?';
    var callback = function(rows) {
      if (rows.length) {
        res.json(rows[0]);
      } else {
        res.status(400).json({'code': 400, 'status': 'No scene for ' + sceneId});
      }
    };
    this.queryDb(query, [sceneId], res, callback);
  }
};

SQLAnnotationDb.prototype.queryHandler = function(req,res) {
  var queryType = req.query['qt'];
  if (queryType == 'scene') {
    var sceneId = req.query['sceneId'];
    this.queryScene(sceneId, res);
  } else if (queryType == 'scenes') {
    this.queryScenes(res);
  } else if (queryType == 'parts') {
    this.queryParts(req.query, res);
  } else if (queryType == 'segments') {
    this.querySegmentAnnotations(req.query, res);
  } else if (queryType == 'annotations') {
    this.queryAnnotations(req.query, res);
  } else if (queryType == 'sym') {
    this.querySymmetryPlane(req.query, res);
  } else if (queryType == 'items') {
    this.queryCompletedItems(req.query, res);
  } else {
    res.status(400).json({'code': 400, 'status': 'Invalid query type'});
  }
};

SQLAnnotationDb.prototype.reportAnnotations = function(params, res, onSuccess, onError) {
  var log = this.log;
  //console.log(params);
  // NOTE: condition is keyword in mysql (use backticks)
  var fields = '(type, task, taskMode, appId, sessionId, workerId, itemId, `condition`, progress, imported, data, preview_data)';
  var annArray = [];
  var data = params.data || params.stats;  // Accept either as the data field (older code used the stats)
  var itemId = params.itemId || params.modelId; // Accept either as the data field (older code used modelId)
  var progress = null;
  if (data && data.stats) {
    if (data.stats.total) {
      progress = data.stats.total.percentComplete;
    } else if (data.stats.percentComplete != null) {
      progress = data.stats.percentComplete;
    }
  }
  var ann = [
    params.type,
    params.task,
    params.taskMode,
    params.appId,
    params.sessionId,
    params.userId != null? params.userId : params.workerId,
    itemId,
    params.condition,
    progress,
    params.imported? true : false,
    JSON.stringify(data),
    params.screenshot
  ];
  annArray.push(ann);
  //console.log('Got annotation', annArray);
  log.info('Got annotation for ' + itemId + ', user ' + params.userId);
  if (annArray.length > 0) {
    var query = 'INSERT INTO annotations ' + fields + ' VALUES ?';
    this.queryDb(query, [annArray], res, onSuccess, onError);
    //res.json({'code': 400, 'status" : 'Test segment annotation for params: ' + JSON.stringify(params)});
  } else {
    res.status(400).json({'code': 400, 'status': 'Invalid annotation for params: ' + JSON.stringify(params)});
  }
};

SQLAnnotationDb.prototype.queryParts = function(params, res, onSuccess, onError) {
  if (params['$latest']) {
    this.queryCurrentParts(params, res, onSuccess, onError);
  } else {
    this.queryAllParts(params, res, onSuccess, onError);
  }
};

SQLAnnotationDb.prototype.queryCurrentParts = function(params, res, onSuccess, onError) {
  this.queryPartsTable('current_part_annotations', params, res, onSuccess, onError);
};

SQLAnnotationDb.prototype.queryAllParts = function(params, res, onSuccess, onError) {
  this.queryPartsTable('part_annotations', params, res, onSuccess, onError);
};

SQLAnnotationDb.prototype.queryPartsTable = function(tablename, params, res, onSuccess, onError) {
  var log = this.log;
  var validParamFields = [ 'id', 'appId', 'sessionId', 'workerId', 'modelId', 'annId', 'partSetId', 'partId', 'label', 'labelType', 'data'];
  var myOnSuccess = function(rows) {
    rows = rows.map(function (row) {
      if (row.data) {
        try {
          row.data = JSON.parse(row.data);
        } catch (err) {
          log.error('Error parsing data ' + row.id, err);
        }
      }
      return row;
    });
    if (onSuccess) { onSuccess(rows); }
    else {
      res.json(rows);
    }
  };
  if (params['$limitOnAnnotations']) {
    if (!params['itemId']) {
      params['itemId'] = params['modelId'];
    }
    var annParams = Object.assign({}, params);
    annParams['$columns'] = ['id'];
    var scope = this;
    scope.queryAnnotations(annParams, res, function (rows) {
      console.log('got rows', rows);
      if (rows && rows.length) {
        var annIds = rows.map(function (x) {
          return x.id;
        });
        var f = scope.getQueryFilters(validParamFields, params);
        scope.appendQueryFilter(f, 'annId', 'IN', '(' + annIds.join(',') + ')', true);
        f.filters.push(params.label);
        scope.queryTableByCreatedAt({
          table: tablename,
          queryFilters: f
        }, res, myOnSuccess, onError);
      } else {
        myOnSuccess([]);
      }
    }, onError);
  } else {
    this.queryTableByCreatedAt({
      table: tablename,
      validParamFields: validParamFields,
      params: params,
      limit: params['$limit']
    }, res, myOnSuccess, onError);
  }
};

SQLAnnotationDb.prototype.querySegmentAnnotations = function(params, res, onSuccess, onError) {
  var log = this.log;
  onSuccess = onSuccess || function(rows) {
    rows = rows.map( function (row) {
      try {
        row.segments = JSON.parse(row.segments);
      } catch (err) {
        log.error('Error retrieving segment annotation ' + row.id, err);
      }
      return row;
    });
    res.json(rows);
  };
  var validParamFields = [ 'id', 'appId', 'sessionId', 'workerId', 'modelId', 'annId', 'objectId', 'label',
    'labelType', 'condition', 'status', 'notes', 'verified' ];
  var partTable = (params['$clean'] || params['clean'])? 'segment_annotations_clean' : 'segment_annotations';
  if (params['$limitOnAnnotations']) {
    if (!params['itemId']) {
      params['itemId'] = params['modelId'];
    }
    var annParams = Object.assign({}, params);
    annParams['$columns'] = ['id'];
    var scope = this;
    scope.queryAnnotations(annParams, res, function(rows) {
      if (rows && rows.length) {
        var annIds = rows.map(function (x) {
          return x.id;
        });
        var f = scope.getQueryFilters(validParamFields, params);
        scope.appendQueryFilter(f, 'annId', 'IN', '(' + annIds.join(',') + ')', true);
        f.filters.push(params.label);
        scope.queryTableByCreatedAt({
          table: partTable,
          queryFilters: f
        }, res, onSuccess, onError);
      } else {
        onSuccess([]);
      }
    }, onError);
  } else {
    this.queryTableByCreatedAt({
      table: partTable,
      validParamFields: validParamFields,
      params: params,
      limit: params['$limit']
    }, res, onSuccess, onError);
  }
};

SQLAnnotationDb.prototype.queryAnnotations = function(params, res, onSuccess, onError) {
  if (params['$latest']) {
    this.queryCurrentAnnotations(params, res, onSuccess, onError);
  } else {
    this.queryAllAnnotations(params, res, onSuccess, onError);
  }
};

SQLAnnotationDb.prototype.queryCurrentAnnotations = function(params, res, onSuccess, onError) {
  this.queryAnnotationsTable('current_annotations', params, res, onSuccess, onError);

};

SQLAnnotationDb.prototype.queryAllAnnotations = function(params, res, onSuccess, onError) {
  this.queryAnnotationsTable('annotations', params, res, onSuccess, onError);
};

SQLAnnotationDb.prototype.queryAnnotationsTable = function(tablename, params, res, onSuccess, onError) {
  var log = this.log;
  var scope = this;
  function queryAnnotationColumns(columns) {
    if (typeof columns === 'string') {
      columns = columns.split(',');
    }
    var columnsNoPreview = columns.filter( function(x) { return x !== 'preview_data'; });
    var validParamFields = [ 'id', 'type', 'task', 'taskMode', 'appId', 'sessionId', 'workerId', 'itemId', 'condition',
      'progress', 'status', 'notes', 'verified' ];
    var validGroupByFields = validParamFields.concat('label');
    var groupBy = params['$groupBy'];
    if (groupBy) {
      if (validGroupByFields.indexOf(groupBy) < 0) {
        // Not valid
        log.warn('Invalid groupBy parameter: ' + groupBy);
        groupBy = null;
      }
    }
    var defaultAggregate = groupBy? 'COUNT_DISTINCT' : false;
    var aggregate = params['$aggr'];
    var table = tablename + ' AS ann';
    var f = scope.getQueryFilters(params, validParamFields, 'ann');
    var orderBy = 'created_at DESC';
    if ((params.type === 'segment' || params.type === 'part')) {
      var partTable = (params.type === 'segment') ? 'segment_annotations' : 'part_annotations';
      if (params['$clean'] && params.type === 'segment') {
        partTable = 'segment_annotations_clean';
      }
      if (params.label) {
        var labelFilter = scope.getQueryFilters(params, ['label']);
        var labelFilterString = scope.formatQuery(labelFilter.filterString, labelFilter.filters);
        scope.appendQueryFilter(f, 'ann.id', 'IN', '(SELECT annId from ' + partTable + '  where ' + labelFilterString + ')', true);
      }
      //if (params['$latest']) {
      //  scope.appendQueryFilter(f, 'ann.id', 'IN', '(SELECT MAX(id) from ' + tablename + ' GROUP BY itemId)', true);
      //}
      if (groupBy) {
        aggregate = _.defaults(Object.create(null), aggregate || {}, {
          'created_at_min': {op: 'MIN', field: 'created_at'},
          'created_at_max': {op: 'MAX', field: 'created_at'}
        });
        columnsNoPreview.push('created_at_min');
        columnsNoPreview.push('created_at_max');
      }
      if (!groupBy) {
        table += ' JOIN ' + partTable + ' AS parts ON parts.annId = ann.id ';
        groupBy = 'ann.id';
        aggregate = {
          'label': 'GROUP_CONCAT',
          'nlabels': { op: 'COUNT_DISTINCT', field: 'label' },
          'ninstances': { op: 'COUNT', field: 'label' }
        };
        columnsNoPreview = columnsNoPreview.map(function (x) {
          return 'ann.' + x;
        });
        columnsNoPreview.push('label');
        columnsNoPreview.push('nlabels');
        columnsNoPreview.push('ninstances');
        orderBy = 'ann.created_at DESC';
      } else if (groupBy === 'label') {
        table += ' JOIN ' + partTable + ' AS parts ON parts.annId = ann.id ';
        columnsNoPreview = columnsNoPreview.map(function (x) {
          return 'ann.' + x;
        });
        columnsNoPreview.push('label');
        orderBy = 'ann.created_at DESC';
      }
    }

    scope.queryTable({
      table: table,
      columns: columnsNoPreview,
      queryFilters: f,
      groupBy: groupBy,
      defaultAggregate: defaultAggregate,
      aggregate: aggregate,
      offset: params['$offset'],
      limit: params['$limit'],
      orderBy: orderBy
    }, res, onSuccess, onError);
  }
  if (params['$columns']) {
    queryAnnotationColumns(params['$columns']);
  } else {
    this.queryColumnNames(tablename, queryAnnotationColumns, onError || this.__getErrorCallback(res));
  }
};

SQLAnnotationDb.prototype.queryAnnotationsWithPreview = function(params, res, onSuccess, onError) {
  var validParamFields = [ 'id', 'type', 'task', 'appId', 'sessionId', 'workerId', 'itemId', 'condition', 'status', 'notes', 'verified' ];
  this.queryTableByCreatedAt({
    table: 'annotations',
    validParamFields: validParamFields,
    params: params,
    limit: params['$limit']
  }, res, onSuccess, onError);
};

SQLAnnotationDb.prototype.convertAnnotationRecords = function(rows) {
  if (!rows) return;
  var log = this.log;
  //console.time('convertAnnotationRecords');
  var converted = rows.map(function(row) {
    if (row.data) {
      try {
        row.data = JSON.parse(row.data);
      } catch (err) {
        log.error('Error converting annotation data' + row.id, err);
      }
    }
    return row;
  });
  //console.timeEnd('convertAnnotationRecords');
  return converted;
};

SQLAnnotationDb.prototype.queryCompletedItems = function(params, res, onSuccess, onError) {
  var log = this.log;
  var myOnSuccess = function(rows) {
    rows = rows.map(function (row) {
      if (row.data && params['$data'] === 'json') {
        try {
          row.data = JSON.parse(row.data);
        } catch (err) {
          log.error('Error parsing data ' + row.id, err);
        }
      }
      return row;
    });
    if (onSuccess) { onSuccess(rows); }
    else {
      res.json(rows);
    }
  };
  var validParamFields = [ 'id', 'condition', 'item', 'status', 'taskId', 'taskController', 'taskName', 'hitId', 'assignmentId', 'workerId'];
  this.queryTableByCreatedAt({
    table: 'completed_items_view',
    validParamFields: validParamFields,
    params: params,
    limit: params['$limit']
  }, res, myOnSuccess, onError);
};

SQLAnnotationDb.prototype.querySymmetryPlane = function(params, res, onSuccess, onError) {
  var validParamFields = [ 'modelid' ];
  var f = this.getQueryFilters(params, validParamFields);
  // TODO pagination?
  var query;
  if (f.filters.length > 0) {
    var sql = 'SELECT * FROM symmetry_param where ' + f.filterString;
    query = this.formatQuery(sql, f.filters);
    this.queryDb(query, null, res, onSuccess, onError);
  } else {
    query = 'SELECT * FROM symmetry_param';
    this.queryDb(query, null, res, onSuccess, onError);
  }
};

module.exports = SQLAnnotationDb;
