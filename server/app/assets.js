var SolrQuerier = require('../lib/solr-querier');

var fs = require('fs');
var request = require('request');
var _ = require('lodash');
var log = require('../lib/logger')('assets');

var assetGroupsMain = require('../static/data/assets');
var assetGroupsScans = require('../static/data/assets-scans');

var config = require('../config');
var web_vars = { baseUrl: config.baseUrl, assetsDir: config.baseUrl  + '/resources/' };            // Variable for accessing via web
var fs_vars = { baseUrl: __dirname + '/../static/', assetsDir: __dirname + '/../static/' };        // Variables for accessing via file system
var local_web_vars = { baseUrl: "http://localhost:" + config.reverseProxyPort, assetsDir: "http://localhost:" + config.reverseProxyPort + '/resources/'};
var localBaseUrl = "http://localhost:" + config.reverseProxyPort;

_.replaceAll = function (str, find, replacement){
  var u;
  while (true) {
    u = str.replace(find, replacement);
    if (u === str) return str;
    str = u;
  }
};

_.replaceVars = function (str, vars) {
  if (str && _.isString(str)) {
    for (var v in vars) {
      if (vars.hasOwnProperty(v)) {
        str = _.replaceAll(str, '${' + v + '}', vars[v]);
      }
    }
  }
  return str;
};

_.replacePath = function (str, vars) {
  if (str && _.isString(str)) {
    str = _.replaceAll(_.replaceVars(str, vars), '([^:])//', '$1/');
  }
  return str;
};

_.appendVarPrefix = function (str, name) {
  if (str && _.isString(str)) {
    str = str.replace(/\$\{([a-zA-Z_0-9]+)\}/g, '${' + name + '.$1}');
  }
  return str;
};

function findVars(obj, vars) {
  if (obj) {
    if (_.isString(obj)) {
      var matched = obj.match(/\$\{([a-zA-Z_0-9.]+)\}/g);
      if (matched) {
        for (var i = 0; i < matched.length; i++) {
          vars.add(matched[i]);
        }
      }
    } else if (_.isPlainObject(obj) || _.isArray(obj)) {
      _.each(obj, function(v,k) {
        findVars(v, vars);
      });
    }
  }
  return vars;
};

_.findVars = function (obj) {
  var vars = findVars(obj, new Set());
  var res = [];
  vars.forEach(function(v) {
    res.push(v.substring(2,v.length-1));
  });
  return res;
};

_.createDefaultVars = function (obj, prefix) {
  prefix = prefix || '';
  var vars = _.findVars(obj);
  var defaults = {};
  for (var i = 0; i < vars.length; i++) {
    var path = vars[i];
    _.set(defaults, path, '${' + prefix + path + '}');
  }
  return defaults;
};

// Interpolate lodash templates with values in vars
_.interpolate = function(obj, vars, options) {
  // Default options to template
  var defaultOptions = { imports: { '_': _ }, strict: false };
  options = _.defaults(Object.create(null), options || {}, defaultOptions);
  // Default variables
  var defaultVars = options.defaults || {};
  vars = _.defaults(Object.create(null), vars, defaultVars);
  // Clone and replace!
  var cloned =  _.cloneDeepWith(obj, function (value, key, parent, stack) {
    var root = stack? stack.get(obj) : {};
    var parentVars = stack? stack.get(parent) : {};
    if (_.isString(value) && (!options.isPossibleTemplate || options.isPossibleTemplate(value))) {
      var v = _.merge(vars, root);
      v = _.defaults(Object.create(null), parentVars, v);
      var t = _.template(value, options);
      //console.log('resolving template ', value, v);
      var r = t(v);
      if (options.inferType) {
        if (r === 'true') {
          return true;
        } else if (r === 'false') {
          return false;
        }
      }
      return r;
    }
  });
  return cloned;
};

_.splitPrefixId = function(prefixLength, separator, id) {
  var prefix = id.substr(0,prefixLength);
  var rest = id.substr(prefixLength);
  var path = '';
  for (var i = 0; i < prefix.length; i++) {
    path = path + prefix.charAt(i) + separator;
  }
  path = path + rest;
  return path;
};

_.getPrefix = function(prefixLength, separator, id) {
  var prefix = id.substr(0,prefixLength);
  var rest = id.substr(prefixLength);
  var path = '';
  for (var i = 0; i < prefix.length; i++) {
    path = path + prefix.charAt(i) + separator;
  }
  return path;
};

var assetGroupsAll = _.concat(assetGroupsMain, assetGroupsScans);
_.each(assetGroupsAll, function(assetGroup) {
  if (assetGroup.metadata) {
    if (_.isString(assetGroup.metadata)) {
      assetGroup.metadataUrl = _.replacePath(assetGroup.metadata, local_web_vars);
      var filename = _.replacePath(assetGroup.metadata, fs_vars);
      if (fs.existsSync(filename)) {
        try {
          assetGroup.metadata = JSON.parse(fs.readFileSync(filename, 'utf8'));
          assetGroup.metadataFilename = filename;
        } catch (err) {
          log.warn('Error loading/parsing metadata for ' + assetGroup.name + ' from ' + filename, err);
        }
      }
    }
  }
  if (assetGroup.ids) {
    assetGroup.ids = _.replacePath(assetGroup.ids, local_web_vars);
  }
  if (assetGroup.queryIds) {
    assetGroup.queryIds = _.replacePath(assetGroup.queryIds, local_web_vars);
  }
});

var assetGroupsByName = _.keyBy(assetGroupsAll, 'name');
var solrUrls = {
  "model": localBaseUrl + '/solr/models3d',
  "scan": localBaseUrl + '/solr/models3d',
  "room": localBaseUrl + '/solr/rooms',
  "scene": localBaseUrl + '/solr/scenes',
  "texture": localBaseUrl + '/solr/textures'
};
var solrQuerier = new SolrQuerier({ url: solrUrls['model'] + '/select' });

function queryAssetInfo(solrUrl, id, cb) {
  var params = {
    q: 'fullId:' + id,
    wt: 'json'
  };
  solrQuerier.url = solrUrl;
  solrQuerier.queryDb(params, null,
    function(result) {
      if (result) {
        result = JSON.parse(result);
      }
      if (result.response  && result.response.numFound > 0) {
        cb(null, result.response.docs[0]);
      } else {
        cb("Asset " + id + " not found");
      }
    },
    function(err) {
      cb(err);
    }
  );
}

function getSearchUrl(assetType) {
  var solrUrl = solrUrls[assetType];
  return solrUrl? solrUrl + '/select' : null;
}

function getInterpolatedContext(assetGroupMetadata, interpolateOptions, defaultConstants) {
  var ignoreFields = ['assetInfoType', 'assetFields', 'data', 'dataByName', 'dataTypes'];
  var interpolated = _.pickBy(assetGroupMetadata, function(v,name) { return (ignoreFields.indexOf(name) < 0 && !name.startsWith('__')) && (_.isString(v) || _.isPlainObject(v))});
  var interpolateContext = _.interpolate(interpolated, defaultConstants, interpolateOptions);
  _.extend(interpolateContext, defaultConstants);
  return interpolateContext;
}

function interpolateAssetInfo(assetGroupMetadata, assetInfo, defaultConstants) {
  // TODO: interpolate assetGroup metadata (see AssetGroups)
  // HACK!!!! Make sure undefined vars are not replaced
  var defaultVars = _.createDefaultVars(assetGroupMetadata, 'vars.');
  // HACK!!!! Make sure ${xyz} becomes ${vars.xyz} for future interpolation
  assetGroupMetadata =  _.cloneDeepWith(assetGroupMetadata, function (x) {
    if (_.isString(x)) { return _.appendVarPrefix(x, 'vars'); }
  });
  var __interpolateOptions = { 'variable': 'vars',  'defaults': defaultVars,
    isPossibleTemplate: function(str) {
      // Lazy check for if a string is a template value
      return _.includes(str, '$') || _.includes(str, '<%');
    },
    inferType: true
  };

  var interpolateContext = getInterpolatedContext(assetGroupMetadata, __interpolateOptions, defaultConstants);
  var vars = _.defaults(Object.create(null), assetInfo, interpolateContext);
  // console.log('vars', vars, interpolateContext);
  if (assetGroupMetadata.assetFields) {
    var assetFields = _.interpolate(assetGroupMetadata.assetFields, vars, __interpolateOptions);
    vars = _.extend(vars, assetFields);
  }
  return _.interpolate(assetGroupMetadata, vars, __interpolateOptions);

  //return assetGroupMetadata;
}

function getAssetInfo(assetGroupName, assetId, defaultConstants, cb) {
  var assetGroup = assetGroupsByName[assetGroupName];
  if (assetGroup) {
    if (assetGroup.metadata) {
      var assetGroupMetadata = assetGroup.metadata;
      if (_.isPlainObject(assetGroupMetadata)) {
        // TODO: check if we have solr
        var solrUrl = assetGroupMetadata.solrUrl || getSearchUrl(assetGroupMetadata.assetType);
        var fullId = assetGroupName + '.' + assetId;
        var defaultAssetInfo = { id: assetId, source: assetGroupName, fullId: fullId };
        if (solrUrl) {
          // Fetch info from solr about asset
          queryAssetInfo(solrUrl, fullId, function(err, assetInfo) {
            try {
              var interpolated = interpolateAssetInfo(assetGroupMetadata, assetInfo || defaultAssetInfo, defaultConstants);
              cb(null, interpolated);
            } catch(ex) {
              cb(ex);
            }
          });
        } else {
          try {
            var interpolated = interpolateAssetInfo(assetGroupMetadata, defaultAssetInfo, defaultConstants);
            cb(null, interpolated);
          } catch(ex) {
            cb(ex);
          }
        }
      } else {
        cb("Cannot get asset data for " + assetGroupName);
      }
    } else {
      cb("No metadata for asset " + assetGroupName);
    }
  } else {
    cb("No asset matching name " + assetGroupName);
  }
}

function getAssetDownloadInfo(assetGroupName, assetId, datatype, format, defaultConstants, cb) {
  getAssetInfo(assetGroupName, assetId, defaultConstants, function(err, assetGroupMetadata) {
    if (assetGroupMetadata) {
      var datatypeInfos = _.get(assetGroupMetadata, ["dataTypes", datatype]);
      if (datatypeInfos) {
        var datatypeInfo = format? _.find(datatypeInfos, function(x) { return x.name === format; }) : datatypeInfos[0];
        if (datatypeInfo) {
          cb(null, datatypeInfo);
        } else {
          cb("Unsupported format " + format + " for datatype " + datatype + " for asset " + assetGroupName);
        }
      } else {
        cb("Unsupported datatype " + datatype + " for asset " + assetGroupName);
      }
    } else {
      cb(err, null);
    }
  });
}

module.exports = {
  get: function(name) {
    return assetGroupsByName[name];
  },
  list: function() {
    return assetGroupsAll;
  },
  registerRoutes: function(app) {
    app.get('/assets/metadata/:name', function(req, res, next) {
      var name = req.params['name'];
      var assetGroup = assetGroupsByName[name];
      if (assetGroup) {
        if (assetGroup.metadataUrl) {
          //res.redirect(assetGroup.metadataUrl);
          req.pipe(request(assetGroup.metadataUrl)).pipe(res);
        } else if (assetGroup.metadata) {
          if (_.isString(assetGroup.metadata)) {
            // res.redirect(assetGroup.metadata);
            req.pipe(request(assetGroup.metadata)).pipe(res);
          } else {
            res.json(assetGroup.metadata);
          }
        } else {
          res.status(400).json({"code": 400, "status": "No asset metadata for " + name});
        }
      } else {
        res.status(400).json({"code": 400, "status": "No asset matching name " + name});
      }
    });

    app.get('/assets/ids/:name', function(req, res, next) {
      var name = req.params['name'];
      var assetGroup = assetGroupsByName[name];
      if (assetGroup) {
        var idsFile = assetGroup.ids || assetGroup.queryIds;
        if (idsFile) {
          if (_.isString(idsFile)) {
            // res.redirect(idsFile);
            req.pipe(request(idsFile)).pipe(res);
          } else {
            res.json(idsFile);
          }
        } else {
          res.status(400).json({"code": 400, "status": "No asset ids for " + name});
        }
      } else {
        res.status(400).json({"code": 400, "status": "No asset matching name " + name});
      }
    });

    app.get('/assets/info/:name/:datatype/:id/:format', function(req, res, next) {
      var name = req.params['name'];
      var id = req.params['id'];
      var datatype = req.params['datatype'];
      var format = req.params['format'];
      var vars = _.defaults(Object.create(null), web_vars, req.query);
      getAssetDownloadInfo(name, id, datatype, format, vars, function(err, info) {
        if (info) {
          res.json(info);
        } else {
          log.warn('Error getting for info for asset ' + name, err);
          res.status(400).json({"code": 400, "status": err || ("Error getting info for asset " + [name,id,datatype,format].join(' '))});
        }
      });
    });

    app.get('/assets/download/:name/:datatype/:id/:format', function(req, res, next) {
      var name = req.params['name'];
      var id = req.params['id'];
      var datatype = req.params['datatype'];
      var format = req.params['format'];
      var vars = _.defaults(Object.create(null), local_web_vars, req.query);
      getAssetDownloadInfo(name, id, datatype, format, vars, function(err, info) {
        if (info) {
          if (info.path) {
            //res.redirect(info.path);
            req.pipe(request(info.path)).pipe(res);
          } else {
            res.status(400).json({"code": 400, "status": "Error getting download path for asset " + [name,id,datatype,format].join(' ')});
          }
        } else {
          log.warn('Error getting download info for asset ' + [name,id,datatype,format].join(' '), err);
          res.status(400).json({"code": 400,
            "status": err || ("Error getting download info for asset " + [name,id,datatype,format].join(' '))});
        }
      });
    });

    app.get('/assets/download/:name/:datatype/:id.:format', function(req, res, next) {
      var name = req.params['name'];
      var id = req.params['id'];
      var datatype = req.params['datatype'];
      var format = req.params['format'];
      var vars = _.defaults(Object.create(null), local_web_vars, req.query);
      getAssetDownloadInfo(name, id, datatype, format, vars, function(err, info) {
        if (info) {
          if (info.path) {
            //res.redirect(info.path);
            req.pipe(request(info.path)).pipe(res);
          } else {
            res.status(400).json({"code": 400, "status": "Error getting download path for asset " + [name,id,datatype,format].join(' ')});
          }
        } else {
          log.error('Error getting download info for asset ' + [name,id,datatype,format].join(' '),{ test: 'what'}, err);
          res.status(400).json({"code": 400,
            "status": err || ("Error getting download info for asset " + [name,id,datatype,format].join(' '))});
        }
      });
    });
  }
};