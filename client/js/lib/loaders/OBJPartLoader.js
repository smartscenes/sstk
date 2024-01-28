const Constants = require('Constants');
const PartHierarchy = require('parts/PartHierarchy');
const async = require('async');
const _ = require('util/util');

class SimpleObjLoader {
  constructor() {}

  load(info, onsuccess, onerror) {
    if (info.loadMtl) {
      const objLoader = new THREE.OBJMTLLoader();
      objLoader.load(info.file, null, {}, onsuccess, onerror);
    } else {
      const objLoader = new THREE.OBJLoader();
      objLoader.load(info.file, onsuccess, onerror);
    }
  }
}

/**
 * Loader for part annotations that consists of a json file describing the part hierarchy with pointers to obj files
 * @param params
 * @constructor
 * @memberOf loaders
 */
function OBJPartLoader(params) {
  this.fs = params.fs;
  this.debug = params.debug;
  this.meshPath = params.meshPath;
  this.meshFilePattern = params.meshFilePattern;
  this.objectLoadOptions = params.objectLoadOptions || {};
  this.objectLoader = params.objectLoader || new SimpleObjLoader();
}

OBJPartLoader.prototype.constructor = OBJPartLoader;

OBJPartLoader.prototype.parse = function(data) {
  // TODO: implement parse
  const json = JSON.parse(data);
  const partHierarchy = new PartHierarchy(json);
  return partHierarchy;
};

OBJPartLoader.prototype.__getObjFilenames = function(objNode) {
  if (objNode.filename) {
    return Array.isArray(objNode.filename)? objNode.filename : [objNode.filename];
  }
};

/**
 * Load and parses object parts file
 * @param file
 * @param callback {function(err, PartHierarchy)}
 */
OBJPartLoader.prototype.loadPartHierarchy = function(file, metadata, callback) {
  const scope = this;
  const filename = file.name || file;
  this.fs.readAsync(file, 'utf-8', function (err, hierarchyData) {
    if (err) {
      callback(err);
    } else {
      var dirname = _.getPath(_.getDirname(filename), scope.meshPath);
      var partHierarchy;
      try {
        partHierarchy = scope.parse(hierarchyData);
      } catch(e) {
        callback(e);
        return;
      }

      scope.__loadHierarchyObjs(partHierarchy, dirname, callback);
    }
  });
};

/**
 * Loads articulated object
 * @param modelInfo
 * @param callback {function(err, Object)}
 */
OBJPartLoader.prototype.loadArticulated = function(modelInfo, options, callback) {
  const scope = this;
  this.loadPartHierarchy(modelInfo.file, modelInfo, function(err, partHierarchy) {
    if (err) {
      callback(err);
    } else {
      const res = {
        partHierarchy: partHierarchy
      }
      if (modelInfo.mobility && scope.loadMobility) {
        console.log('load mobility');
        scope.loadMobility(modelInfo.mobility, partHierarchy, (err2, articulations) => {
          if (err2) {
            console.error('Error loading mobility', err2);
          } else {
            res.articulated = scope.createArticulated(articulations, partHierarchy);
          }
          callback(null, res);
        });
      } else {
        res.articulated = scope.createArticulated(null, partHierarchy);
        callback(null, res);
      }
    }
  }, options);
};

OBJPartLoader.prototype.__loadHierarchyObjs = function(partHierarchy, dirname, callback) {
  const scope = this;
  var objNodes = partHierarchy.getNodes();
  async.mapLimit(objNodes, Constants.MAX_ASYNC_REQS, function(objNode, cb) {
    scope.__loadObjs(dirname, scope.__getObjFilenames(objNode), cb);
  }, function(err, results) {
    // Do some surgery on the results
    if (err) {
      callback(err);
    } else {
      try {
        for (let i = 0; i < objNodes.length; i++) {
          const objNode = objNodes[i];
          const objs = results[i];
          const g = partHierarchy.createObjectGroup(objNode, objs);
          objNode.object3D = g;
        }
        partHierarchy.attachChildObject3Ds();
      } catch(e) {
        callback(e);
        return;
      }
      callback(null, partHierarchy);
    }
  });
};

OBJPartLoader.prototype.__loadObjs = function(path, objnames, callback) {
  const loadOptions = this.objectLoadOptions;
  const objectLoader = this.objectLoader;
  async.mapLimit(objnames, Constants.MAX_ASYNC_REQS, function(objname, cb) {
    const objpath = _.getPath(path, objname.endsWith('.obj')? objname : objname + ".obj");
    const modelinfo = { file: objpath, format: 'obj', options: loadOptions };
    objectLoader.load(modelinfo, obj => { obj.userData.id = objname; return cb(null, obj); },
      err => {
        if (loadOptions.ignoreLoadErrors) {
          console.warn('Error loading ' + objpath + ', ignoring', err);
          cb(null);
        } else {
          console.error('Error loading ' + objpath, err);
          cb(err, null);
        }
      });
  }, callback);
};

OBJPartLoader.prototype.createArticulated = function(artData, partHierarchy) {
  const ArticulatedObject = require('articulations/ArticulatedObject');
  return new ArticulatedObject(null, null, partHierarchy);
};

module.exports = OBJPartLoader;