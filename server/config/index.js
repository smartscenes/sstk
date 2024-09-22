const config = exports;

// Ports
config.httpServerPort = process.env.HTTP_SERVER_PORT || 8010;
config.baseUrl = process.env.NODE_BASE_URL || '';
config.defaultRoute = 'http://127.0.0.1:' + config.httpServerPort;

// URLs
config.remoteHost = process.env.STK_REMOTE_HOST;
config.solrHost = process.env.SOLR_REMOTE_HOST || config.remoteHost;
config.useLocal = process.env.USE_LOCAL || process.env.remoteHost == null;
config.defaultSolrUrl = config.useLocal || process.env.USE_LOCAL_SOLR ? 'http://localhost:8798/solr/' : config.solrHost + '/solr/';
config.defaultAnnotationsSolrUrl = config.useLocal || process.env.USE_LOCAL_SOLR ? 'http://localhost:8799/solr/' : config.solrHost + '/annotations/solr/';
config.libsgUrl =  config.useLocal || process.env.USE_LOCAL_LIBSG ? 'http://localhost:5000/' : config.remoteHost + '/ws/libsg/';
config.modelsSolrQueryUrl = config.defaultSolrUrl + 'models3d/select';

// RLSD URLS
const rlsdRemostHost = process.env.RLSD_HOST || config.remoteHost;
const sceneManagerPort = process.env.SCENE_MANAGER_PORT || 8080;
const sceneWizardPort = process.env.SCENE_WIZARD_PORT || 8030;
config.rlsd = {
  sceneManagerUrl: process.env.RLSD_SCENE_MANAGER_SERVER_PROXY_TARGET ||
    (process.env.USE_LOCAL ? `http://localhost:${sceneManagerPort}/` : rlsdRemostHost + '/api/scene-manager/'), // Scene Manager backend
  sceneWizardUrl: process.env.RLSD_WIZARD_PROXY_TARGET ||
    (process.env.USE_LOCAL ? `http://localhost:${sceneWizardPort}/` : rlsdRemostHost + '/api/wizard/') // Scene Wizard backend
};

// Annotation URLS
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
