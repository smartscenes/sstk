var _ = require('util/util');

var loggers = {};

// Simple Logger class
var Logger = function(name) {
  console.log('Get logger: ' + name);
  //var log = log4javascript.getLogger(name);
  //_.extend(this, log);
};

// Global static function to get a logger
Logger.getLogger = function(name) {
  if (!loggers[name]) {
    loggers[name] = new Logger(name);
  }
  return loggers[name];
};

module.exports = Logger;
