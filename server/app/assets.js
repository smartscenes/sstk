var _ = require('lodash');
var assetsMain = require('../static/data/assets');
var assetsScans = require('../static/data/assets-scans');

var config = require('../config');
var vars = { baseUrl: config.baseUrl, assetsDir: config.baseUrl  + '/resources/' };
//var vars = { baseUrl: __dirname + '/../static/', assetsDir: __dirname + '/../static/' };

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
    str = _.replaceAll(_.replaceVars(str, vars), '//', '/');
  }
  return str;
};


var assetsAll = _.concat(assetsMain, assetsScans);
_.each(assetsAll, function(assetGroup) {
  var metadataFile;
  if (assetGroup.metadata) {
    assetGroup.metadata = _.replacePath(assetGroup.metadata, vars);
  }
  if (assetGroup.ids) {
    assetGroup.ids = _.replacePath(assetGroup.ids, vars);
  }
});
var assetsByName = _.keyBy(assetsAll, 'name');

module.exports = {
  get: function(name) {
    return assetsByName[name];
  },
  list: function() {
    return assetsAll;
  },
  registerRoutes: function(app) {
    app.get('/assets/metadata/:name', function(req, res, next) {
      var name = req.params['name'];
      var asset = assetsByName[name];
      if (asset) {
        if (asset.metadata) {
          if (_.isString(asset.metadata)) {
            //res.sendFile(asset.metadata);
            res.redirect(asset.metadata);
          } else {
            res.json(asset.metadata);
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
      var asset = assetsByName[name];
      if (asset) {
        var idsFile = asset.ids || asset.queryIds;
        if (idsFile) {
          if (_.isString(idsFile)) {
            //res.sendFile(idsFile);
            res.redirect(idsFile);
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
  }
};