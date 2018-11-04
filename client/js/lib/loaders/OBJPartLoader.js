var async = require('async');
var _ = require('util/util');

// Part hierarchy used by the OBJPartLoader
function PartHierarchy(json) {
  var children = _.isArray(json)? json : [json];
  this.root = {children: children, name: "root", text: "Root", id: -1};
}

PartHierarchy.prototype.traverse = function(cbPre, cbPost, checkPre) {
  this.traverseNode(this.root, cbPre, cbPost, checkPre);
};

PartHierarchy.prototype.traverseNode = function (node, cbPre, cbPost, checkPre) {
  if (cbPre) {
    var traverseMore = cbPre(node);
    if (checkPre && !traverseMore) {
      return; // Stop traversal
    }
  }
  if (node.children) {
    for (var i = 0; i < node.children.length; i++) {
      this.traverseNode(node.children[i], cbPre, cbPost, checkPre);
    }
  }
  if (cbPost) {
    cbPost(node);
  }
};

PartHierarchy.prototype.getObjNodes = function() {
  var objNodes = [];
  this.traverse(function(x) {
    if (x.objs) {
      objNodes.push(x);
    }
  });
  return objNodes;
};

PartHierarchy.prototype.createObjectGroup = function(node, objs) {
  var g = new THREE.Group();
  g.name = (node.id >= 0)? node.id + "_" + node.name : node.name;
  for (var j = 0; j < objs.length; j++) {
    g.add(objs[j]);
  }
  _.merge(g.userData, _.omit(node, ["children"]));
  return g;
};

/**
 * Loader for part annotations that consists of a json file describing the part hierarchy with pointers to obj files
 * @param params
 * @constructor
 * @memberOf loaders
 */
function OBJPartLoader(params) {
  this.fs = params.fs;
  this.debug = params.debug;
}

OBJPartLoader.prototype.constructor = OBJPartLoader;

/**
 * Load and parses house file
 * @param file
 * @param callback {function(err, Object)}
 */
OBJPartLoader.prototype.load = function(file, callback) {
  var filename = file.name || file;
  var scope = this;
  this.fs.readAsync(file, 'utf-8', function(err, data) {
    if (err) {
      callback(err);
    } else {
      try {
        var partHierarchy = new PartHierarchy(JSON.parse(data));
        var objNodes = partHierarchy.getObjNodes();
        var dirname = _.getPath(_.getDirname(filename), 'objs/');
        async.map(objNodes, function(objNode, cb) {
          scope.__loadObjs(dirname, objNode.objs, cb);
        }, function(err, results) {
          // Do some surgery on the results
          if (err) {
            callback(err);
          } else {
            try {
              for (var i = 0; i < objNodes.length; i++) {
                var objNode = objNodes[i];
                var objs = results[i];
                var g = partHierarchy.createObjectGroup(objNode, objs);
                objNode.object3D = g;
              }
              partHierarchy.traverse(null,
                function(node) {
                  if (!node.object3D && node.children) {
                    var objs = _.filter(_.map(node.children, 'object3D'));
                    var g = partHierarchy.createObjectGroup(node, objs);
                    node.object3D = g;
                  }
                }
              );
              callback(null, partHierarchy);
            } catch(e) {
              callback(e);
            }
          }
        });
      } catch(e) {
        callback(e);
      }
    }
  });
};

OBJPartLoader.prototype.__loadObjs = function(path, objnames, callback) {
  async.map(objnames, function(objname, cb) {
    var objpath = _.getPath(path, objname + ".obj");
    // TODO: Call generate Object3DLoader
    //console.log('load', objpath);
    var objLoader = new THREE.OBJLoader();
    objLoader.load(objpath, function(object3D) {
      cb(null, object3D);
    }, null, function(err) {
      cb(err);
    })
  }, callback);
};


module.exports = OBJPartLoader;