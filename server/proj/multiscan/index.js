var express = require('express');
var config = require('../../config');
var base = require('../../lib/base');
var app = module.exports = express();
var Logger = require('../../lib/logger');
const path = require("path");
var log = Logger('MultiScanServer');

var mountPrefix = '/multiscan';
app.use(mountPrefix, express.static(path.join(__dirname, './static/html/')));
app.use(mountPrefix, express.static(path.join(__dirname, './static/')));

app.set('views', __dirname + '/views');
app.set('view engine', 'pug');

function annotateRemeshed(req, res) {
  var sessionId = base.getSessionId(req);
  var userId = base.getUserId(req);
  var category = req.query['category'];
  var mid = req.query['modelId'];
  log.info('MultiScan annotating modelId=' + mid);
  res.render('part-annotator', {
    modelId: mid,
    category: category,
    modelsAnnotated: 0,
    totalToAnnotate: 1,
    condition: 'annotate',
    task: 'multiscan-annotate',
    userId: userId,
    taskInfo: {},
    categoryInfo: null,
    segmentAnnotation: null,
    sessionId: sessionId,
    nextUrl: 'referrer'
  });
}

function annotateSegment(req, res) {
  var sessionId = base.getSessionId(req);
  var userId = base.getUserId(req);
  var category = req.query['category'];
  var mid = req.query['modelId'];
  log.info('MultiScan annotating modelId=' + mid);
  res.render('segment-annotator', {
    modelId: mid,
    category: category,
    modelsAnnotated: 0,
    totalToAnnotate: 1,
    condition: 'manual',
    task: 'multiscan-annotate',
    userId: userId,
    taskInfo: {},
    categoryInfo: null,
    segmentAnnotation: null,
    sessionId: sessionId,
    nextUrl: 'referrer'
  });
}

function renderGrouped(req, res) {
  res.locals.assetGroup = {
    metadata: app.locals.baseUrl + '/assets/metadata/' + res.locals.assetName,
    ids: app.locals.baseUrl + '/assets/ids/' + res.locals.assetName,
    assetIdsFileFormat: 'csv'
  };
  if (req.query['annotate']) {
    res.render('grouped-annotator');
  } else {
    res.render('grouped-viewer');
  }
}

app.get(mountPrefix + '/grouped', function (req, res) {
  res.locals.assetName = 'multiscan';
  renderGrouped(req, res);
});

app.get(mountPrefix + '/part-annotator', annotateRemeshed);
app.get(mountPrefix + '/segment-annotator', annotateSegment);
app.get(mountPrefix + '/scan-obb-aligner', function (req, res) { res.render('scan-obb-aligner'); });
