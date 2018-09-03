var util = require('util');
var winston = require('winston');
var expressWinston = require('express-winston');

var expressLogger = expressWinston.logger({
  transports: [
    new (winston.transports.File)({ filename: 'logs/express.log' })
  ],
  meta: true, // optional: control whether you want to log the meta data about the request (default to true)
  msg: 'HTTP {{res.statusCode}} {{req.method}} {{res.responseTime}}ms {{req.url}}', // optional: customize the default logging message.
  //expressFormat: true, // Use the default Express/morgan request formatting, with the same colors. Enabling this will override any msg and colorStatus if true. Will only output colors on transports with colorize set to true
  //colorStatus: true, // Color the status code, using the Express/morgan color palette (default green, 3XX cyan, 4XX yellow, 5XX red). Will not be recognized if expressFormat is true
  //ignoreRoute: function (req, res) { return false; } // optional: allows to skip some log messages based on request and/or response
});

function createBaseLogger(name) {
  if (winston.loggers.has(name)) {
    return winston.loggers.get(name);
  }

  var transports = [
    new (winston.transports.Console)({
      timestamp: true,
      label: name,
      // timestamp: function () { return Date.now(); },
      // formatter: function (options) {
      //   // - Return string will be passed to logger.
      //   // - Optionally, use options.colorize(options.level, <string>) to
      //   //   colorize output based on the log level.
      //   console.log(options);
      //   return new Date(options.timestamp()).toISOString() + ' ' +
      //     winston.config.colorize(options.level, options.level.toUpperCase()) + ' - ' +
      //     (name? '[' + name + '] ' : '' ) +
      //     (options.message ? options.message : '') +
      //     (options.meta && Object.keys(options.meta).length ? '\n\t' + util.inspect(options.meta) : '');
      // },
      colorize: true,
      handleExceptions: true
    }),
    new (winston.transports.File)({
      filename: 'logs/server.log',
      label: name,
      handleExceptions: true
    })
  ];

  var logger = winston.loggers.add(name);
  logger.configure({
    level: 'info',
    transports: transports,
    exitOnError: false
  });
  return logger;
}

var defaultLogger = createBaseLogger();

var myloggers = {};
function createNamedLogger(name) {
  var logger = myloggers[name];
  if (logger) {
    return logger;
  }

  if (winston.loggers.has(name)) {
    logger = winston.loggers.get(name);
    myloggers[name] = logger;
    return logger;
  }

  // Weird hack to set name of logger so we can have one global logger with multiple labels
  var logProps = ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly', 'log'];
  var proxy = new Proxy(defaultLogger, {
    get: function(target, propKey) {
      if (logProps.indexOf(propKey) >= 0) {
        return function() {
          var transportKeys = Object.keys(target.transports);
          var oldLabels = {};
          transportKeys.forEach(function (key) {
            var transport = target.transports[key];
            oldLabels[key] = transport.label;
            transport.label = name;
          });
          target[propKey].apply(target, arguments);
          transportKeys.forEach(function (key) {
            var transport = target.transports[key];
            transport.label = oldLabels[key];
          });
        };
      } else {
        return target[propKey];
      }
    }
  });
  myloggers[name] = proxy;
  return proxy;
}


// winston.add(winston.transports.File, {
//   filename: 'logs/server.log',
//   handleExceptions: true
// });
// winston.exitOnError = false;

winston.loggers.add('reverse-proxy', {
  file: { filename: 'logs/reverse-proxy.log' }
});
// TODO: This is automatic in winston >= 3.0 so remove when updated
winston.loggers.get('reverse-proxy').remove(winston.transports.Console);

var Logger = function(name) {
  //console.log('Get logger: ' + name);
  var logger = (name != undefined)? createNamedLogger(name) : defaultLogger;
  logger.expressLogger = expressLogger;
  return logger;
};

module.exports = Logger;
