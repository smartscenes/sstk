// Express subapp
var express = require('express');
var path = require('path');
var config = require('../../config');

var app = module.exports = express();

app.use(express.static(path.join(__dirname, './static/html/')));
app.use(express.static(path.join(__dirname, './static/')));

// set views for sim
app.set('views', __dirname + '/views');
app.set('view engine', 'pug');
