const Constants = require('Constants');
const Part = require('parts/Part');
const PartHierarchy = require('parts/PartHierarchy');
const async = require('async');
const _ = require('util/util');

class SimpleObjLoader {
  constructor() {}

  load(info, callback) {
    if (info.loadMtl) {
      const objLoader = new THREE.OBJMTLLoader();
      objLoader.load(info.file, null, {}, function (object3D) {
        callback(null, object3D);
      }, null, function (err) {
        console.error('Error loading path ' + info.file);
        callback(err);
      });
    } else {
      const objLoader = new THREE.OBJLoader();
      objLoader.load(info.file, function (object3D) {
        callback(null, object3D);
      }, null, function (err) {
        console.error('Error loading path ' + info.file);
        callback(err);
      });
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
  this.meshPath = params.meshPath || 'part_objs/';
  this.objectLoadOptions = params.objectLoadOptions || {};
  this.objectLoader = params.objectLoader || new SimpleObjLoader();
}

OBJPartLoader.prototype.constructor = OBJPartLoader;

OBJPartLoader.prototype.parse = function(data) {
  const json = JSON.parse(data);
  const tree = new PartHierarchy(json);
  let index = 0;
  const partHierarchy = tree.convert(n => {
    const part = new Part(index, null, n.dof_name, null, null);
    part.filename = (n.dof_name === 'dof_rootd')? 'none_motion' : n.dof_name;
    // motion_type is translation, rotation, spiral, and none
    if (n.motion_type && n.motion_type !== 'none') {
      const articulation = {type: n.motion_type, axis: n.direction, origin: n.center};
      // AXS: Arbitrary ranges for shape2motion based on javascript code
      if (n.motion_type === 'translation') {
        articulation.rangeMin = 0;
        articulation.rangeMax = 0.005*60;
        part.articulation = [articulation];
      } else if (n.motion_type === 'rotation') {
        articulation.rangeMin = 0;
        articulation.rangeMax = 60*Math.PI/180;
        part.articulation = [articulation];
      } else if (n.motion_type === 'spiral') {
        const art2 = _.clone(articulation);
        articulation.type = 'translation';
        articulation.rangeMin = 0;
        articulation.rangeMax = 0.005*60;
        art2.type = 'rotation';
        art2.rangeMin = 0;
        art2.rangeMax = 60*Math.PI/180;
        part.articulation = [articulation, art2];
      }
    }
    index++;
    return part;
  });
  return partHierarchy;
};

/**
 * Load and parses object parts file
 * @param file
 * @param callback {function(err, Object)}
 */
OBJPartLoader.prototype.load = function(file, callback) {
  const filename = file.name || file;
  const scope = this;
  this.fs.readAsync(file, 'utf-8', function(err, data) {
    if (err) {
      callback(err);
    } else {
      try {
        var partHierarchy = scope.parse(data);
        var objNodes = partHierarchy.getNodes();
        var dirname = _.getPath(_.getDirname(filename), scope.meshPath);
        async.mapLimit(objNodes, Constants.MAX_ASYNC_REQS, function(objNode, cb) {
          scope.__loadObjs(dirname, [objNode.filename], cb);
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
  const loadOptions = this.objectLoadOptions;
  const objectLoader = this.objectLoader;
  async.mapLimit(objnames, Constants.MAX_ASYNC_REQS, function(objname, cb) {
    const objpath = _.getPath(path, objname + ".obj");
    const modelinfo = { file: objpath, format: 'obj', options: loadOptions };
    objectLoader.load(modelinfo, obj => { obj.userData.id = objname; return cb(null, obj); }, err => callback(err, null));
  }, callback);
};

module.exports = OBJPartLoader;