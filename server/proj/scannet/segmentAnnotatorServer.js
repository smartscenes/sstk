var _ = require('lodash');
var base = require('../../lib/base');
var csv = require('papaparse');
var path = require('path');
var fs = require('fs');
var YAML = require('yamljs');
var Promise = require('promise');
var Logger = require('../../lib/logger');
var log = Logger('SegmentAnnotatorServer');
var taskFiles = require('./tasks/segment_annotation');

var SegmentAnnotatorServer = function (params) {
  this.sqlDB = params.sqlDB;
  this.app = params.app;
  this.config = params.config;

  // Initialize config and user states
  this.tasks = {}; // Task configurations by name
  this.userStates = {};
};

function loadFile(filename) {
  log.info('loading file ' + filename);
  var content = fs.readFileSync(filename, { encoding: 'utf8' });
  if (filename.endsWith('yml')) {
    return YAML.parse(content);
  } else if (filename.endsWith('json')) {
    return JSON.parse(content);
  } else if (filename.endsWith('csv')) {
    return csv.parse(content, { header: true }).data;
  } else if (filename.endsWith('tsv')) {
    return csv.parse(content, { header: true, delimiter: '\t', quoteChar: '\0' }).data;
  } else {
    log.error('Unsupported file format ' + filename);
  }
}

function loadFileIfString(v, basepath) {
  if (typeof v === 'string') {
    var filename = basepath? path.resolve(basepath, v) : v;
    return loadFile(filename);
  } else {
    return v;
  }
}

function preprocessScansToAnnotate(scans, taskConfig) {
  if (!scans[0].id) {
    scans = scans.map(function (id) { return { id:  id }; });
  }
  if (!scans[0].percentComplete) {  // fill in zero completion
    scans.forEach(function (s) { s.percentComplete = 0; });
  }
  _.forEach(scans, function (scan) {
    var prefix = taskConfig.idPrefix || 'scan-checked';
    if (scan.id.indexOf('.') < 0) {
      scan.id = prefix + '.' + scan.id;
    }
  });

  var scanIdToRec = _.keyBy(scans, 'id');
  var scansToAnnotate = _.values(scanIdToRec);
  scansToAnnotate = _.filter(scansToAnnotate, function (r) {
    return r.percentComplete < taskConfig.percCompleteThreshold;
  });
  scansToAnnotate = _.sortBy(scansToAnnotate, function (r) {
    return r.percentComplete;
  });
  //console.log(scansToAnnotate);
  return scansToAnnotate;
}

SegmentAnnotatorServer.prototype.__loadTaskConfig = function(filename) {
  log.info('loading task config ' + filename);
  filename = path.resolve(__dirname + '/tasks/segment_annotation', filename);
  var taskConfig = loadFile(filename);
  var task = {
    config: taskConfig
  };
  var basepath = path.dirname(filename);
  var scans =  loadFileIfString(taskConfig.scansToAnnotate, basepath);
  task.scansToAnnotate = preprocessScansToAnnotate(scans, taskConfig);
  task.annotationChecks = loadFileIfString(taskConfig.annotationChecks, basepath);
  task.labels = loadFileIfString(taskConfig.labels, basepath);
  task.surveys = loadFileIfString(taskConfig.surveys, basepath);
  var categoryParts = loadFileIfString(taskConfig.categoryParts, basepath);
  if (categoryParts) {
    task.categoryParts = _.keyBy(categoryParts, 'name');
  }
  return task;
};

SegmentAnnotatorServer.prototype.__getTaskInfo = function(taskName, taskCondition) {
  if (!this.tasks[taskCondition]) {
    var taskFile = taskFiles[taskCondition];
    if (!taskFile && taskCondition !== 'default') {
      log.warn('Unknown task: ' + taskCondition + ', using default task configuration');
      return this.__getTaskInfo(taskName, 'default');
    } else if (taskFile) {
      this.tasks[taskCondition] = this.__loadTaskConfig(taskFile);
    }
  }
  return this.tasks[taskCondition];
};


SegmentAnnotatorServer.prototype.__getItemsToAnnotate = function (userState, items, opts) {
  var shuffled = _.shuffle(items);

  var queryParams = {
    status: { $ne: 'rejected', $isnull: true, $conj: 'OR' },
    $columns: ['itemId', 'id', 'created_at'],
    $groupBy: 'itemId'//,
    //condition: { $in: ['mpr-pilot-hq'] }
  };
  this.sqlDB.queryAnnotations(queryParams, null, function (rows) {
    log.info('records available:', rows.length);
    var done = _.map(_.filter(rows, function (r) { return r.id >= opts.thresh; }), function (r) { return r.itemId; });
    log.info('records done:', done.length);
    var filtered = _.filter(shuffled, function (rec) { return done.indexOf(rec.id) < 0; });
    log.info('records remaining:', filtered.length);
    opts.callback(null, filtered);
  }, function (err) {
    log.error('Error querying SQL for existing annotations', err);
    opts.callback(null, shuffled);
  });
};

SegmentAnnotatorServer.prototype.populateSegmentAnnotation = function(req, res, next) {
  var queryParams = _.defaults({}, req.body, req.query);
  this.sqlDB.querySegmentAnnotations({ id: queryParams.segAnnId}, null, function(rows) {
    if (rows && rows.length > 0) {
      var row = rows[0];
      if (typeof row.segments === 'string') {
        row.segments = JSON.parse(row.segments);
      }
      res.locals.segmentAnnotation = row;
      next();
    } else {
      // TODO: change to next with error message
      res.status(400).send("No annotation for id: " + queryParams.segAnnId);
    }
  }, function(err) {
    log.error('Error querying SQL for segment annotation ' + id, err);
    res.status(500).send("We are sorry!  There was an unexpected error.");
  });
};

SegmentAnnotatorServer.prototype.populateUserState = function(req, res, next) {
  this.__populateUserState(req, function(err, userState) {
    next();
  });
};

SegmentAnnotatorServer.prototype.__populateUserState = function (req, callback) {
  var userId = base.getUserId(req);
  var userStates = this.userStates;
  var userState = userStates[userId];
  if (!userState) {
    userState = {
      userId: userId,
      condition: req.query['condition'],
      task: req.query['task'],
      taskMode: req.query['taskMode'],
      instructionsGiven: false,
      //todoModelIds: _.shuffle(_.map(scansToAnnotate, 'id')),
      modelsAnnotated: 0,
      modelsPassed: 0,
      passIds: []
    };
    userStates[userId] = userState;
  } else {
    userState.condition = req.query['condition'] || userState.condition;
    userState.task = req.query['task'] || userState.task;
    userState.taskMode = req.query['taskMode'] || userState.taskMode;
  }
  var taskInfo = this.__getTaskInfo(userState.task, userState.condition);
  userState.taskInfo = taskInfo;
  userState.totalModelsToAnnotate = userState.taskInfo.config.annotationsPerWorker;

  req.session = req.session || {};
  req.session.userState = userState;
  if (!userState.todoModelIds) {  // need to populate items to annotate
    this.__getItemsToAnnotate(userState, taskInfo.scansToAnnotate, {
      thresh: taskInfo.config.doneThreshold,
      callback: function (err, selectedItems) {
        userState.todoModelIds = _.map(selectedItems, 'id');
        callback(err, userState);
      }
    });
  } else {  // already have selected items to annotate
    callback(null, userState);
  }
};

function getUserState(req) {
  return req.session.userState;
}

var pickModelToAnnotate = function(userState, mId) {
  return new Promise(function(resolve) {
    if (!mId) {  // Pick model from list based on modelsAnnotated
      mId = userState.todoModelIds[userState.modelsAnnotated + userState.modelsPassed];
    }
    resolve(mId);
  });
};

SegmentAnnotatorServer.prototype.annotatorInstructions = function (req, res) {
  var userState = getUserState(req);
  var sessionId = base.getSessionId(req);
  userState.instructionsGiven = true;
  res.render('segment-annotator-instructions', {
    userId: userState.userId,
    sessionId: sessionId,
    condition: userState.condition,
    task: userState.task,
    taskMode: userState.taskMode
  });
};

SegmentAnnotatorServer.prototype.annotatorHandler = function (req, res) {
  var basePath = this.config.baseUrl + this.app.mountPath;

  var userState = getUserState(req);
  var sessionId = base.getSessionId(req);
  var totalToAnnotate = Math.min(userState.totalModelsToAnnotate, userState.todoModelIds.length);
  log.info("SegmentAnnotatorServer processing user " + userState.userId
    + " modelsAnnotated=" + userState.modelsAnnotated + "/" + userState.totalModelsToAnnotate);
  if (req.query['pass']) {
    var passId = req.query['pass'];
    if (userState.passIds.indexOf(passId) < 0) {
      userState.passIds.push(passId);
    }
    userState.modelsPassed++;
    log.info("SegmentAnnotatorServer user " + userState.userId
      + " passing " + passId + ', modelsPassed=' + userState.modelsPassed);
  }

  var taskInfo = userState.taskInfo;
  if (!userState.instructionsGiven) {  // First time so show instructions
    userState.instructionsGiven = true;
    res.render('segment-annotator-instructions', {
      userId: userState.userId,
      sessionId: sessionId,
      condition: userState.condition,
      task: userState.task,
      taskMode: userState.taskMode
    });
  } else if (userState.modelsAnnotated < totalToAnnotate) {
    var mid = req.query["modelId"];  // Parse modelId override param if it exists
    pickModelToAnnotate(userState, mid).then(function(mId) {  // Pick model id to annotate
      log.info("passing to client mId=" + mId);
      res.render('segment-annotator', {
        modelId: mId,
        modelsAnnotated: userState.modelsAnnotated,
        totalToAnnotate: totalToAnnotate,
        condition: userState.condition,
        task: userState.task,
        taskMode: userState.taskMode,
        userId: userState.userId,
        taskInfo: userState.taskInfo,
        segmentType: taskInfo.config.segmentType || 'surfaces',
        sessionId: sessionId,
        surveys: taskInfo.surveys,
        nextUrl: basePath + '/segment-annotator?userId=' + userState.userId + '&sessionId=' + sessionId
      });
    }).catch( function(err) {
      log.error("Segment Annotator Error: ", err);
      console.warn('error', err);  // previous log message doesn't print the err for some reason...
      res.status(500).send("We are sorry!  There was an unexpected error.");
    });
  } else {  // User is done so reset state and render end message
    userState.instructionsGiven = false;
    userState.modelsAnnotated = 0;
    userState.modelsPassed = 0;
    userState.todoModelIds = null;
    res.render('segment-annotator-end');
  }
};

SegmentAnnotatorServer.prototype.annotateSingle = function (req, res) {
  var userState = getUserState(req);
  var sessionId = base.getSessionId(req);
  log.info("SegmentAnnotatorServer annotateSingle processing user " + userState.userId);

  var category = req.query["category"];
  var mid = req.query["modelId"];  // Parse modelId override param if it exists
  // Annotating part
  var segmentAnnotation = res.locals.segmentAnnotation;
  var categoryInfo = {};
  if (segmentAnnotation) {
    // TODO: check that modelIds match
    mid = segmentAnnotation.modelId;
    // Look up parts for label
    if (userState.taskInfo && userState.taskInfo.categoryParts) {
      categoryInfo =  userState.taskInfo.categoryParts[segmentAnnotation.label] || {};
    }
  }
  pickModelToAnnotate(userState, mid).then(function(mId) {  // Pick model id to annotate
    log.info("passing to client mId=" + mId);
    res.render(res.locals.view || 'segment-annotator', {
      modelId: mId,
      category: category,
      modelsAnnotated: userState.modelsAnnotated,
      totalToAnnotate: userState.totalModelsToAnnotate,
      condition: req.query['condition'] || userState.condition,
      task: req.query['task'] || userState.task,
      userId: userState.userId,
      taskInfo: userState.taskInfo,
      categoryInfo: categoryInfo,
      segmentAnnotation: segmentAnnotation,
      sessionId: sessionId,
      //surveys: surveys,
      nextUrl: 'referrer'
    });
  }).catch( function(err) {
    log.error("Segment Annotator Error: ", err);
    console.warn('error', err);  // previous log message doesn't print the err for some reason...
    res.status(500).send("We are sorry!  There was an unexpected error.");
  });
};

SegmentAnnotatorServer.prototype.listAnnotations = function (req, res) {
  req.body.type = 'segment';
  var queryParams = _.defaults(res.locals.defaults || {}, req.body, req.query);
  var format = queryParams.format;
  if (format === 'json') {
    // Query general annotations table for a summary of segment annotations
    var sqlDB = this.sqlDB;
    if (queryParams['$showAnnParts']) {
      sqlDB.querySegmentAnnotations(queryParams, res, function (rows) {
        //rows = convertAnnotationRows(rows);
        res.json(rows);
      });
    } else {
      sqlDB.queryAnnotations(queryParams, res, function (rows) {
        rows = sqlDB.convertAnnotationRecords(rows);
        res.json(rows);
      });
    }
  } else if (queryParams.ajax) {
    // Use ajax to get annotations
    res.render(res.locals.view || 'segment-annotations', {
      ajaxOptions:  {
        url: this.config.baseUrl + this.app.mountpath + req.path + '?format=json',
        groupBy: queryParams['$groupBy'],
        showAnnParts: queryParams['$showAnnParts'],
        data: queryParams,
        dataSrc: ''
      }
    });
  } else {
    var sqlDB = this.sqlDB;
    if (queryParams['$showAnnParts']) {
      sqlDB.querySegmentAnnotations(queryParams, res, function (rows) {
        //rows = convertAnnotationRows(rows);
        res.render(res.locals.view || 'segment-annotations', {
          annotations: rows,
          query: queryParams
        });
      });
    } else {
      sqlDB.queryAnnotations(queryParams, res, function (rows) {
        rows = sqlDB.convertAnnotationRecords(rows);
        res.render(res.locals.view || 'segment-annotations', {
          annotations: rows,
          query: queryParams
        });
      });
    }
  }
};

SegmentAnnotatorServer.prototype.getAggregatedSegmentLabelCounts = function (req, res) {
  req.body.type = 'segment';
  var queryParams = _.defaults({}, req.body, req.query);
  // Query general annotations table for a summary of segment annotations
  this.sqlDB.querySegmentAnnotations(queryParams, res, function(rows) {
    // Takes rows and aggregates them by scan (modelId) and segment
    var aggregated = {};
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (typeof row.segments === 'string') {
        row.segments = JSON.parse(row.segments);
      }
      var segs = row.segments.segments;
      if (segs) {
        if (!aggregated[row.modelId]) { aggregated[row.modelId] = {}; }
        var model = aggregated[row.modelId];
        for (var j = 0; j < segs.length; j++) {
          var iseg = segs[j];
          if (!model[iseg]) {
            model[iseg] = {};
          }
          var seg = model[iseg];
          if (seg[row.label]) {
            seg[row.label]++;
          } else {
            seg[row.label] = 1;
          }
        }
      } else {
        log.info('No segments for row', row);
      }
    }

    res.json(aggregated);
  });
};

SegmentAnnotatorServer.prototype.getAggregatedAnnotations = function (req, res) {
  req.body.type = 'segment';
  var queryParams = _.defaults({}, req.body, req.query);
  if (!queryParams.annId && !queryParams.modelId) {
    res.status(400).json({"code" : 400, "status" : "annId or modelId not specified in params: " + JSON.stringify(queryParams)});
    return;
  }
  // Query general annotations table for a summary of segment annotations
  this.sqlDB.querySegmentAnnotations(queryParams, res, function(rows) {
    var segGroups = [];
    var aggregated = { sceneId: undefined, appId: 'stk.v1', annId: queryParams.annId, segGroups: segGroups };
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (typeof row.segments === 'string') {
        row.segments = JSON.parse(row.segments);
      }

      var segs = row.segments.segments;
      if (segs) {
        if (aggregated.sceneId != undefined) {
          if (aggregated.sceneId !== row.modelId) {
            log.info('Tried to aggregate annotation for ' + row.modelId + ' into ' + aggregated.sceneId);
            continue;
          }
        } else {
          aggregated.sceneId = row.modelId;
        }
        var ann = {};
        ann.id = parseInt(row.objectId);  // unique id
        ann.objectId = parseInt(row.objectId);
        //console.log('appId', row.appId);
        if (row.appId.startsWith('SegmentAnnotator.v')) {
          var version = parseFloat(row.appId.split('.')[1].substring(1));
          //console.log('version', version);
          if (version < 5) {
            // Old annotations stored with objectId starting at 0 (now we start at 1)
            ann.id = ann.id + 1;
            ann.objectId = ann.objectId + 1;
          }
        }
        ann.label = row.label;
        _.merge(ann, row.segments);
        segGroups.push(ann);
      } else {
        log.info('No segments for row', row);
      }
    }

    res.json(aggregated);
  });
};

SegmentAnnotatorServer.prototype.getViewer = function (req, res) {
  var workerId = req.query["workerId"];
  var sessionId = req.query["sessionId"];
  var modelId = req.query["modelId"];
  var annotationId = req.query["annotationId"];

  res.render('segment-viewer', {
    workerId: workerId,
    sessionId: sessionId,
    modelId: modelId,
    annotationId: annotationId
  });
};

// For SegmentAnnotator UI -> table in SceneStudio db
SegmentAnnotatorServer.prototype.__reportSegmentAnnotations = function (params, res, onSuccess, onError) {
  //console.log(params);
  // NOTE: condition is keyword in mysql (use backticks)
  var fields = "(appId, sessionId, workerId, `condition`, annId, modelId, objectId, segments, label, labelType)";
  var annArray = [];
  params.annotations.forEach(function(m) {
    var segments = {
      segments: m.segments,
      obb: m.obb,
      dominantNormal: m.dominantNormal,
      initialPoint: m.initialPoint,
      partId: m.partId
    };
    var ann = [
      params.appId,
      params.sessionId,
      params.userId,
      params.condition,
      params.annId,
      m.modelId,
      m.objectId,
      JSON.stringify(segments),
      m.label,
      m.labelType
    ];
    annArray.push(ann);
  });
  //console.log(annArray);
  if (annArray.length > 0) {
    var query = "INSERT INTO segment_annotations " + fields + " VALUES ?";
    this.sqlDB.queryDb(query, [annArray], res, onSuccess, onError);
    //res.json({"code" : 400, "status" : "Test segment annotation for params: " + JSON.stringify(params)});
  } else {
    res.json({"code" : 400, "status" : "Invalid segment annotation for params: " + JSON.stringify(params)});
  }
};

SegmentAnnotatorServer.prototype.__submitAnnotations = function (req, res) {
  var userState = getUserState(req);

  var onSuccess = function () {
    //console.log(userState);
    userState.modelsAnnotated++;
    //userState.labels = req.body["labels"];
    res.json({
      code: 200
    });
  };

  req.body.type = 'segment';
  var scope = this;
  this.sqlDB.reportAnnotations(req.body, res, function(result) {
    req.body.annId = result.insertId;
    scope.__reportSegmentAnnotations(req.body, res, onSuccess);
  });
};

SegmentAnnotatorServer.prototype.submitAnnotations = function (req, res) {
  var scope = this;
  this.__populateUserState(req, function (err, userState) {
    scope.__submitAnnotations(req, res);
  });
};

SegmentAnnotatorServer.prototype.editAnnotations = function(req, res) {
  var queryParams = _.defaults({}, req.body, req.query);
  var scope = this;
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
    res.status(400).json({"code" : 500, "status" : "Error in database: " + err});
  };
  var onSuccess = function () {
    // Query for all ids
    scope.sqlDB.queryAnnotations({ id: _.keys(queryParams.data), type: 'segment' }, res, onFinalSuccess, onError);
  };

  if (queryParams.action === 'edit') {
    try {
      if (queryParams.data && _.size(queryParams.data) > 0) {
        // Currently only allow update of notes and status
        var updateData = queryParams.data;
        var validFields = ['notes', 'status', 'verified', 'condition'];
        var segmentFields = ['condition']; // Fields that requires updating of segments table as well
        var segmentFieldsData = _.pickBy(updateData, function(v,k) {
          return _.find(segmentFields, function(f) { return v[f]; });
        });
        var sqlDB = this.sqlDB;
        sqlDB.updateRecords({
          table: 'annotations',
          data: updateData,
          updateFields: validFields,
          callback: function (err, results) {
            if (err) {
              onError(err);
            } else {
              if (_.size(segmentFieldsData) > 0) {
                console.log('Update segment_annotations');
                sqlDB.updateRecords({
                  table: 'segment_annotations',
                  data: segmentFieldsData,
                  updateFields: segmentFields,
                  idField: 'annId',
                  callback: function(err2, res2) {
                    if (err) {
                      onError(err2);
                    } else {
                      onSuccess();
                    }
                  }
                });
              } else {
                onSuccess();
              }
            }
          }
        });
      } else {
        log.error('Nothing to update');
        res.status(400).json({"code" : 400, "status" : "Nothing to update"});
      }
    } catch (e) {
      log.error('Error updating records', e);
      res.status(400).json({"code" : 500, "status" : "Error updating records"});
    }
  } else {
    res.status(400).json({"code" : 400, "status" : "Unsupported edit action: " + queryParams.action});
  }
};

SegmentAnnotatorServer.prototype.editSegmentAnnotations = function(req, res) {
  var queryParams = _.defaults({}, req.body, req.query);

  var onFinalSuccess = function (rows) {
    //rows = convertAnnotationRows(rows);
    res.json({
      code: 200,
      status: 'ok',
      data: rows
    });
  };
  var isClean = queryParams['$clean'] || queryParams['clean'];
  var scope = this;
  var onError = function (err) {
    log.error('Error updating database annotations', err);
    res.json({"code" : 500, "status" : "Error in database: " + err});
  };
  var onSuccess = function () {
    // Query for all ids
    scope.sqlDB.querySegmentAnnotations({ id: _.keys(queryParams.data), clean: isClean }, res, onFinalSuccess, onError);
  };

  var tableName = (isClean)? 'segment_annotations_clean' : 'segment_annotations';
  if (queryParams.action === 'edit') {
    try {
      // Currently only allow update of notes and status
      if (queryParams.data && _.size(queryParams.data) > 0) {
        var validFields = ['notes', 'status', 'verified'];
        if (isClean) {
          validFields.push('label');
        }
        this.sqlDB.updateRecords({
          table: tableName,
          data: queryParams.data,
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
        res.status(400).json({"code" : 400, "status" : "Nothing to update"});
      }
    } catch (e) {
      log.error('Error updating records', e);
      res.status(400).json({"code" : 400, "status" : "Error updating records"});
    }
  } else {
    res.status(400).json({"code" : 400, "status" : "Unsupported edit action: " + queryParams.action});
  }
};

module.exports = SegmentAnnotatorServer;
