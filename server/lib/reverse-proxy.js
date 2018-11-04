var util = require('util');
var http = require('http');
//var http = require('follow-redirects').http;
var httpProxy = require('http-proxy');
var HttpProxyRules = require('http-proxy-rules');
var forwarded = require('forwarded-for');
var compression = require('compression');
var textBody = require('body');

/**
 * Exports a function that when invoked, starts a proxy server.
 * @param  {Object}   options Parameters includes: `port`, `rules`, `default`, and `log`.
 * @param  {Function} cb      Invokes the callback `cb` after server is listening.
 * @return {Function}         See description above.
 */
module.exports = function run(options, cb) {
  var log = options.log || console;
  // if `max-age` != 0 or `no-cache` is set,
  // it is OK to modify the `cache-control` header
  var dontModifyCCRe = /max\-age=[^0]|no\-cache/;
  var proxyRules = new HttpProxyRules({
    rules: options.rules,
    default: options.default
  });

  // Reverse proxy
  var proxy = httpProxy.createProxy();

  // Error-handling
  proxy.on('error', function (err, req, res) {
    var address = forwarded(req, req.headers);
    var json;

    if (err.code) { //&& err.code !== 'ECONNRESET') {
      log.error(util.format('[proxy error] %s | %s %s %s', address.ip, req.method, req.url, err.message));
    }

    if (!res.headersSent) {
      res.writeHead(500, {
        'content-type': 'application/json'
      });
    }

    json = {
      error: 'proxy_error',
      reason: err.message
    };
    log.error(util.format('[proxy error] %s %s %s %s', req.method, res.statusCode, address.ip, req.url));
    res.end(JSON.stringify(json));
  });

  proxy.on('proxyRes', function (proxyRes, req, res) {
    var address = forwarded(req, req.headers);
    log.info(util.format('[proxyRes] %s %s %s %s', req.method, proxyRes.statusCode, address.ip, req.url));
    if (process.env.NODE_ENV === 'prod') {
      var prevCCHeader = proxyRes.headers['cache-control'] || '';
      if (!dontModifyCCRe.test(prevCCHeader)) {
        // OK to modify `cache-control` header
        // set the `cache-control` header of response
        // so that all other responses are cached for a week
        proxyRes.headers['cache-control'] = 'public, max-age=604800';
      }
    }
    if (req.containsSolr) {
      compression()(req, res, function () {});
    }
  });

  // Create a reverse proxy server that proxies requests to different targets
  http.createServer(function (req, res) {
    req.containsSolr = req.url.indexOf('/solr/') !== -1;
    if (req.containsSolr) {
      textBody(req, function (err, body) {
        log.info('[SOLR] { url: "' + req.url + '", body: "' + body + '" }');
      });
    }
    var target = proxyRules.match(req);
    if (target) {
      return proxy.web(req, res, {
        changeOrigin: true,
        followRedirects: true,
        target: target
      });
    }

    res.writeHead(500, {
      'Content-Type': 'text/plain'
    });
    res.end('The request url and path did not match any of the listed rules!');
  }).listen(options.port, cb);
};
