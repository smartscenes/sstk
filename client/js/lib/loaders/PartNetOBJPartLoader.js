const BaseOBJPartLoader = require('loaders/OBJPartLoader');
const Part = require('parts/Part');
const PartHierarchy = require('parts/PartHierarchy');
const _ = require('util/util');

/**
 * Loader for part annotations that consists of a json file describing the part hierarchy with pointers to obj files
 * @param params
 * @constructor
 * @memberOf loaders
 */
function OBJPartLoader(params) {
  BaseOBJPartLoader.call(this, params);
}

OBJPartLoader.prototype = Object.create(BaseOBJPartLoader.prototype);
OBJPartLoader.prototype.constructor = OBJPartLoader;

OBJPartLoader.prototype.convert = function(data) {
  var json = JSON.parse(data);
  if (json.nodes) {
    // Convert from nodes
    var converted = _.map(json.nodes, function(node) {
      return {
        "id": node.id,
        "text": node.name,
        "name": node.name,
        // "transformation": node.transformation,
      }
    });
    var convertedById = _.keyBy(converted, 'id');
    for (var i = 0; i < converted.length; i++) {
      var node = json.nodes[i];
      var c = converted[i];
      if (node.children) {
        c['children'] = _.map(node.children, function(id) {
          return convertedById[id];
        });
      } else {
        c['objs'] = [node.id];
      }
      //if (node.meshes) {
      //c['objs'] = _.map(node.meshes, function(id) { return id; });
      //}
    }
    json = convertedById[0];
    if (this.meshPath == undefined) {
      this.meshPath = 'leaf_part_obj/';
    }
  } else {
    // Assume this format:
    // {
    //   "text": "xyz",
    //   "children": {
    //     "text": "abc",
    //     "name": "abc",
    //     "id": 11
    //     "objs": ["new-45"]
    //   }
    // }
    if (this.meshPath == undefined) {
      this.meshPath = 'objs/';
    }
  }
  return json;
};

OBJPartLoader.prototype.__getObjFilenames = function(objNode) {
  return objNode.objs;
};

OBJPartLoader.prototype.parse = function(data) {
  var json = this.convert(data);
  var children = _.isArray(json) ? json : [json];
  var root = {children: children, name: "root", text: "Root", id: -1};
  return new PartHierarchy(root);
};

OBJPartLoader.__convertArticulation = function() {
  const tmpVec3 = new THREE.Vector3();
  return function (d, articulations) {
    const toArticulationType = {
      "free": "free",
      "heavy": "none",
      "static": "none",
      "junk": "none",
      "hinge": "rotation",
      "slider": "translation",
      "revolute": "rotation",
      "prismatic": "translation"
    };
    const artType = toArticulationType[d.joint || d.jointData.type];
    const limitInfo = _.get(d, ['jointData', 'limit']);
    let range = (limitInfo && !limitInfo.noLimit) ? [limitInfo.a, limitInfo.b] : null;
    if (range && range[0] > range[1]) {
      range = [range[1], range[0]];
    }
    if (range && artType === 'rotation') {
      range = range.map(r => r * Math.PI / 180);
    }
    const origin = d.jointData.axis ? d.jointData.axis.origin : null;
    let axis = d.jointData.axis ? d.jointData.axis.direction : null;
    if (axis) {
      tmpVec3.fromArray(axis);
      if (Math.abs(tmpVec3.lengthSq() - 1) > 0.00000001) {
        // Not normalized (normalize)
        console.warn('Warning: Normalizing axis ', axis, d.joint);
        tmpVec3.normalize();
        axis = tmpVec3.toArray();
      }
    }
    articulations.push({
      "pid": d.id,
      "type": artType,
      "axis": axis,
      "origin": origin,
      "rangeMin": range ? range[0] : null,
      "rangeMax": range ? range[1] : null,
      "base": (d.parent >= 0) ? [d.parent] : null
    });
    if (limitInfo && limitInfo.rotates) {
      range = limitInfo.noRotationLimit ? null : [0, limitInfo.rotationLimit * Math.PI / 180];
      articulations.push({
        "pid": d.id,
        "type": "rotation",
        "axis": axis,
        "origin": origin,
        "rangeMin": range ? range[0] : null,
        "rangeMax": range ? range[1] : null,
        "base": (d.parent >= 0) ? [d.parent] : null
      });
    }
  };
}();

OBJPartLoader.prototype.loadMobility = function(file, partHierarchy, callback) {
  const scope = this;
  this.fs.readAsync(file, 'utf-8', function(err, data) {
    if (err) {
      callback(err);
    } else {
      try {
        const json = scope.convert(data);
        const articulations = [];
        const mobilityParts = _.map(json, (d) => {
          OBJPartLoader.__convertArticulation(d, articulations);
          return {
            "name": d.name,
            "pid": d.id,
            "nodeIds": d.parts.map(p => p.id)
          };
        });
        callback(null, { parts: mobilityParts, articulations: articulations });
      } catch(e) {
        callback(e);
      }
    }
  });
};

OBJPartLoader.prototype.createArticulated = function(artData, partHierarchy) {
  const ArticulatedObject = require('articulations/ArticulatedObject');
  const PartConnectivityGraph = require('parts/PartConnectivityGraph');
  const articulations = artData.articulations;
  const partInfos = artData.parts;
  const filteredArticulations = _.filter(articulations, art =>
    art.type === 'rotation' || art.type === 'translation'
  );
  const partNodes = partHierarchy.getNodes();
  const partNodesById = [];
  for (let p of partNodes) {
    if (p.id >= 0) {
      partNodesById[p.id] = p;
    }
  }
  const parts = [];
  //console.log('articulations', articulations);
  for (let art of partInfos) {
    if (art.nodeIds.length === 1) {
      const p = partNodesById[art.nodeIds[0]];
      parts[art.pid] = new Part(art.pid, art.name, art.name, null, p.object3D.clone());
      parts[art.pid].object3D.userData.pid = art.pid;
      parts[art.pid].object3D.userData.ids = [p.object3D.userData.id];
      delete parts[art.pid].object3D.userData.id;
    } else {
      console.log('Creating combined part', art.nodeIds);
      const ps = art.nodeIds.map(n => partNodesById[n].object3D? partNodesById[n].object3D.clone() : null).filter(x => x);
      const obj3D = new THREE.Group();
      const objs = [];
      const ids = [];
      for (let p of ps) {
        obj3D.add(p);
        ids.push(p.userData.id);
        if (p.userData.objs) {
          objs.push(...p.userData.objs);
        }
      }
      obj3D.userData.partId = art.pid;
      obj3D.userData.pid = art.pid;
      obj3D.userData.name = art.name;
      obj3D.userData.ids = ids;
      obj3D.userData.objs = objs;
      parts[art.pid] = new Part(art.pid, art.name, art.name, null, obj3D);
    }
  }
  const metadata = { modelId: partHierarchy.root.object3D.userData.modelId };
  const connectivityGraph = new PartConnectivityGraph([], parts, metadata);
  for (let art of articulations) {
    if (art.base) {
      for (let b of art.base) {
        connectivityGraph.add(art.pid, b, true);
      }
    }
  }
  return new ArticulatedObject(filteredArticulations, connectivityGraph);
};


module.exports = OBJPartLoader;