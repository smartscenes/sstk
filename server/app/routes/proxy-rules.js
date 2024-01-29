var config = require('../../config');
// ROUTER RULES
// Paths checked in order they are specified, make sure to list them in MOST specific to LEAST specific order.
// Note: the old version of http-proxy (0.x.x) relied on the fact
// that keys of objects are ordered in the V8 engine, so this fact will also
// be relied on when implementing proxy table support in >=1.0.0
var proxyRules = {
  '[^?]*/resources/': config.defaultRoute + '/',
  '[^?]*/annotations/solr/': config.defaultAnnotationsSolrUrl,
  '[^?]*/solr/': config.defaultSolrUrl,
  //LIBSG
  '[^?]*/ws/libsg': config.libsgUrl,
  //RLSD
  '[^?]*/api/scene-manager': config.rlsd.sceneManagerUrl, // Scene Manager backend
  '[^?]*/api/wizard': config.rlsd.sceneWizardUrl // Scene Manager backend
};

module.exports = proxyRules;
