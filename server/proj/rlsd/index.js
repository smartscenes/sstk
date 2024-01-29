// Express subapp
var express = require('express');
var path = require('path');

var app = module.exports = express();

app.use(express.static(path.join(__dirname, './static/html/')));
app.use(express.static(path.join(__dirname, './static/')));