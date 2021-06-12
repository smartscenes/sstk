'use strict';

var config = exports;

// Ports
config.httpServerPort = process.env.HTTP_SERVER_PORT || 8010;
config.baseUrl = process.env.NODE_BASE_URL || '';
config.defaultRoute = 'http://127.0.0.1:' + config.httpServerPort;

// URLs
config.defaultSolrUrl = 'http://localhost:8798/solr/';
config.defaultAnnotationsSolrUrl = 'http://localhost:8799/solr/';
config.modelsSolrQueryUrl = config.defaultSolrUrl + 'models3d/select';

config.alignmentAnnotationsUrl = config.defaultAnnotationsSolrUrl + 'alignments/update';
config.attributeAnnotationsUrl = config.defaultAnnotationsSolrUrl + 'attributes/update';
config.sizeAnnotationsUrl = config.defaultAnnotationsSolrUrl + 'sizes/update';
config.textureAnnotationsUrl = config.defaultAnnotationsSolrUrl + 'textures/update';
config.categoryAnnotationsUrl = config.defaultAnnotationsSolrUrl + 'categories/update';
config.modelsAnnotationsUrl = config.defaultAnnotationsSolrUrl + 'models3d/update';
config.scenesAnnotationsUrl = config.defaultAnnotationsSolrUrl + 'scenes/update';
config.modelsSolrUrl = config.defaultSolrUrl + 'models3d/update';
config.scenesSolrUrl = config.defaultSolrUrl + 'scenes/update';

config.annDb = { host: 'localhost', user: 'DBUSERNAME', password: 'DBPASSWORD', database: 'DBNAME' };

// Other
config.updateModels = true;
config.updateScenes = true;
