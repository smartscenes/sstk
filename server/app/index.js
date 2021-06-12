'use strict';

var Logger = require('../lib/logger');
var base = require('../lib/base');
var cacheControl = require('cache-control');
var config = require('../config');
var express = require('express');
var compression = require('compression');
var path = require('path');
var bodyParser = require('body-parser');
var methodOverride = require('method-override');
var proxyRules = require('./routes/proxy-rules');
var proxySetup = require('../lib/http-proxy-setup');
var assets = require('./assets');
var _ = require('lodash');

var app = express();
var log = Logger();

app.use(log.expressLogger);

proxySetup({
  rules: proxyRules,
  baseUrl: config.baseUrl,
  default: config.defaultRoute,
  app: app,
  log: Logger('reverse-proxy')
});

// app configuration
app.set('views', path.join(__dirname, '../views'));
app.set('view engine', 'pug');
app.use(compression());
app.use(bodyParser.urlencoded({ extended: true, parameterLimit: 2000 }));  // extended can probably be false?
app.use(bodyParser.json({
  limit: '10mb'  // Limit on size of submissions (10mb is huge!!!)
}));
app.use(methodOverride());
//app.use(express.cookieParser('your secret here'));
//app.use(express.session());

if (process.env.NODE_ENV === 'prod') {
  app.use(cacheControl({
    // '/': 'public, no-cache',
    // '/**/*.html': 'public, no-cache',
    // TODO: cache JS, CSS files for an extended period
    // of time if long-term caching is needed
    // '/**/*.js': 'public, max-age=31536000',
    // '/**/*.css': 'public, max-age=31536000',
    // TODO: figure out how to deal w/ dynamic jade files
    // since they also get cached for a long time as well.
    // for now, cache all responses from Express for a day
    '/**': 'public, max-age=86400'
  }));
}

//app.use(app.router);
//app.use(express.directory(path.join(__dirname, '../../')));
app.use('/resources', express.static(path.join(__dirname, '../static/')));
app.use(express.static(path.join(__dirname, '../../')));
app.use(express.static(path.join(__dirname, '../static/html/')));
app.use(express.static(path.join(__dirname, '../../client/js/vendor/three/')));
app.use(express.static(path.join(__dirname, '../../client/build/')));
app.use(express.static(path.join(__dirname, '../static/')));

// Setup common local variables that are available in templates
app.locals._ = _;
app.locals.baseUrl = config.baseUrl;

/// LOAD SUBSERVERS AND HOOK UP HANDLER FUNCTIONS

// Model viewing
app.get('/model-viewer', function (req, res) { res.render('model-viewer'); });
app.get('/view-model', function (req, res) { res.render('view-model'); });

var SQLAnnotationDb = require('./sqlAnnotationDb');
var AnnotationsServer = require('./annotationsServer');

// Initialize MySQL DB connections
var annDb = new SQLAnnotationDb(config.annDb);
// Annotation server (handles all routes to /annotations
var annServer = new AnnotationsServer({ sqlDB: annDb, config: config, log: log });
annServer.registerRoutes(app, '/annotations');

// Query scenes and annotations
app.get('/query', function(req,res) { return annDb.queryHandler(req, res); });

// Add assets
assets.registerRoutes(app);

// SSC rendering
var SSCServer = require('./sscServer');
var sscServer = new SSCServer();
app.get('/ssc/render', function(req,res) { return sscServer.render(req, res); });

// Add projects
var projects = require('../proj');
for (var i = 0; i < projects.length; i++) {
  var project = projects[i];
  project.app.locals._ = app.locals._;
  project.app.locals.baseUrl = app.locals.baseUrl;
  project.app.locals.projUrl = app.locals.baseUrl + project.mountpath;
  app.use(project.mountpath, project.app);
}

/// START SERVER
//console.log(app.routes);
app.listen(config.httpServerPort, function () {
  console.log('STK running on localhost:' + config.httpServerPort);
});

module.exports = app;