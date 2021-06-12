const proxy = require('http-proxy-middleware');
const url = require('url');
const rewrite = require('express-urlrewrite');

function setupProxy(options) {
  const log = options.log || console;
  const proxyRules = options.rules;
  const wildcardStart = '[^?]*';

  for (let prefix in proxyRules) {
    const targetUrl = proxyRules[prefix];
    if (prefix.startsWith(wildcardStart)) {
      prefix = prefix.substr(wildcardStart.length);
    }
    if (options.default && targetUrl.startsWith(options.default)) {
      const rewriteUrl = targetUrl.substr(options.default.length) + '$1';
      options.app.use(rewrite(prefix + '*', rewriteUrl));
      log.info('rewriting ' + prefix + ' to ' + rewriteUrl);
    } else {
      // Real proxying
      log.info('proxying ' + prefix + ' to ' + targetUrl);
      const proxyUrl = url.parse(targetUrl);
      //console.log('proxying ' + prefix + ' to ' + targetUrl, proxyUrl.path, proxyUrl.host);
      //const rewritePrefix = (options.baseUrl? '^' + options.baseUrl + '/': '^/');
      const pathRewrite = {};
      pathRewrite[wildcardStart + prefix] = proxyUrl.path;
      options.app.use(prefix, proxy.createProxyMiddleware({
        target: proxyUrl.protocol + '//' + proxyUrl.host,
        pathRewrite: pathRewrite,
        logProvider: (provider) => log,
        followRedirects: true,
        changeOrigin: true
      }));
    }
  }
}

module.exports = setupProxy;
