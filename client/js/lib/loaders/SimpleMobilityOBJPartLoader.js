const Part = require('parts/Part');
const PartHierarchy = require('parts/PartHierarchy');
const OBJPartLoader = require('loaders/OBJPartLoader');
const PartNetOBJPartLoader = require('loaders/PartNetOBJPartLoader');
const _ = require('util/util');

class SimpleMobilityOBJPartLoader extends OBJPartLoader {
  constructor(params) {
    super(params);
  }

  __createSimplePartHierarchy(numParts, meshFilePattern) {
    const children = [];
    for (let i = 0; i < numParts; i++) {
      const filename = _.interpolate(meshFilePattern, { vars: { partIdx: i} });
      const name = 'part-' + i;
      children[i] = new Part(i, name, name, null, null);
      children[i].filename = filename;
    }
    const root = new Part(children.length, 'root', 'root', null, null);
    root.children = children;
    return new PartHierarchy(root);
  }

  loadPartHierarchy(file, metadata, callback) {
    if (file) {
    } else {
      // TODO: rename to numParts?
      if (metadata.partCount && this.meshFilePattern) {
        var partHierarchy = this.__createSimplePartHierarchy(metadata.partCount, this.meshFilePattern);
        this.__loadHierarchyObjs(partHierarchy, this.meshPath, callback);
      } else {
        callback('PartHierarchy filename is not specified');
      }
    }
  }

  loadMobility(file, partHierarchy, callback) {
    this.fs.readAsync(file, 'json', (err, data) => {
      if (err) {
        callback(err);
      } else {
        try {
          const nodes = partHierarchy.getNodes();
          const nodesById = _.keyBy(nodes, 'pid');
          const articulations = [];
          if (this.objectLoadOptions.ignoreMapKeys) {
            console.log('Loading mobility: Ignoring map keys')
            if (_.isPlainObject(data)) {
              data = _.map(data, v => v);
            }
          }
          _.forEach(data, (d,k) => {
            const pid = (typeof k === 'string')? parseInt(k) : k;
            const part = nodesById[k];
            part.articulation = [];
            PartNetOBJPartLoader.__convertArticulation({ id: pid, jointData: d }, part.articulation);
            articulations.push(...part.articulation);
          });
          callback(null, { parts: _.sortBy(nodes, 'pid'), articulations: articulations });
        } catch(e) {
          callback(e);
        }
      }
    });
  }

  createArticulated(artData, partHierarchy) {
    const parts = artData.parts;
    for (let part of parts) {
      part.object3D.userData.pid = part.pid;
      part.object3D.userData.ids = [part.object3D.userData.id];
    }
    return super.createArticulated(artData, partHierarchy);
  }

}

module.exports = SimpleMobilityOBJPartLoader;