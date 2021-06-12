require('loaders/OBJLoader');
const Part = require('parts/Part');
const async = require('async');
const _ = require('util/util');

class PartsLoader {

  static loadPartMeshes(model_filename, parts_filename, callback) {
    console.time('loadPartMeshes');
    async.parallel([
      function (cb) {
        const loader = new THREE.OBJLoader();
        loader.load(model_filename, (object) => cb(null, object), null, (err) => cb(err));
      },
      function (cb) {
        _.getJSON(parts_filename, cb);
      }
    ], function (err, res) {
      console.timeEnd('loadPartMeshes');
      if (err) {
        callback(err);
      } else {
        let object = res[0];
        let partsJson = res[1];
        let partsData = PartsLoader.parseParts(partsJson);
        let partMeshes = PartsLoader.segmentObject(object, partsData.labels, partsData.indices, partsData.partNames, PartsLoader.MESH_OPACITY);
        callback(null, { id: partsData.id, annId: partsData.annId, parts: partMeshes });
      }
    });
  }

  static loadPartsWithConnectivityGraph(partsFilesInfo, callback) {
    // Load the precomputed connectivity graph and OBBs
    const meshFilename = partsFilesInfo['mesh'];
    const precomputedFilename = partsFilesInfo['connectivity_graph'];
    const partsFilename = partsFilesInfo['parts'];
    async.parallel([
      (cb) => {
        _.getJSON(precomputedFilename, cb);
      },
      (cb) => {
        PartsLoader.loadPartMeshes(meshFilename, partsFilename, cb);
      }
    ], (err, res) => {
      if (err) {
        callback(err);
      } else {
        // Convert these into Part objects
        const precomputedJson = res[0];
        const partsData = res[1];
        const graph = precomputedJson.connectivityGraph;
        const parts = precomputedJson.parts.map(p => p? Part.fromJson(p):null);
        const partMeshes = partsData.parts;
        for (let i = 0; i < partMeshes.length; i++) {
          const part = parts[i];
          if (part) {
            part.object3D = partMeshes[i];
          }
        }
        callback(null, { annId: partsData.annId, parts: parts, connectivityGraph: graph});
      }
    });
  }

  static parseParts(json) {
    const labels = json.segmentation[6].labels;
    const indices = json.segmentation[6].index;

    // Create map from labels -> PIDs (part IDs)
    const partIndices = {};
    for (let i = 0; i < labels.length; i++) {
      const label = labels[i];

      if (!partIndices[label]) {
        partIndices[label] = [];
      }

      partIndices[label].push(i);
    }

    // Generate part "names" to be displayed in sidebar (i.e. "wheel 1", "wheel 2", etc.)
    // Generate part "types" to be used to group annotation autocompleting
    const partNames = [];
    const partTypes = [];
    Object.keys(partIndices).forEach(key => {
      if (key !== 'unknown') {
        let count = 1;
        partIndices[key].forEach(pid => {
          partNames[pid] = `${key} ${count}`;
          partTypes[pid] = key;
          count++;
        });
      }
    });

    return {
      id: json.id,
      annId: json.annId,
      labels: labels,
      indices: indices,
      partIndices: partIndices,
      partNames: partNames,
      partTypes: partTypes
    };
  }

  /**
   * Segments object into parts and adds each part to scene.
   *
   * @param object {Object} Parsed object (in the geometric sense)
   * @param labels {Array<String>} Part segmentation labels
   * @param indices {Array<number>} Part segmentation indices
   * @param partNames {Array<String>} PIDs -> part name ("wheel 1", "wheel 2", etc.)
   * @returns {Array<THREE.Mesh>}
   */
  static segmentObject(object, labels, indices, partNames, opacity) {
    console.time('segmentObject');
    const color = new THREE.Color(0xaaaaaa);

    // Map face index -> all triangles (indices) in face
    const faces = PartsLoader.groupFaces(indices);
    //const faces = _.groupByMulti(indices, x => x);

    // Load entire object geometry
    const objGeometry = new THREE.Geometry();
    objGeometry.fromBufferGeometry(object.children[0].geometry);

    // Create geometry from faces for each part
    let parts = [];
    for (let i = 1; i < faces.length; i++) {
      const partVertices = new Float32Array(9 * faces[i].length);

      for (let j = 0; j < faces[i].length; j++) {
        const face = objGeometry.faces[faces[i][j]];

        const a = face.a;
        const b = face.b;
        const c = face.c;

        partVertices[9*j] = objGeometry.vertices[a].x;
        partVertices[9*j + 1] = objGeometry.vertices[a].y;
        partVertices[9*j + 2] = objGeometry.vertices[a].z;

        partVertices[9*j + 3] = objGeometry.vertices[b].x;
        partVertices[9*j + 4] = objGeometry.vertices[b].y;
        partVertices[9*j + 5] = objGeometry.vertices[b].z;

        partVertices[9*j + 6] = objGeometry.vertices[c].x;
        partVertices[9*j + 7] = objGeometry.vertices[c].y;
        partVertices[9*j + 8] = objGeometry.vertices[c].z;
      }

      // Convert buffer geometry to geometry for ease of pre-processing
      const bufferGeometry = new THREE.BufferGeometry();
      bufferGeometry.setAttribute('position', new THREE.BufferAttribute(partVertices, 3));
      const geometry = new THREE.Geometry().fromBufferGeometry(bufferGeometry);

      // Create part mesh
      const mesh = new THREE.Mesh(geometry, new THREE.MeshPhongMaterial({
        side: THREE.DoubleSide,
        color: color,
        transparent: true,
        opacity: opacity,
      }));

      mesh.pid = i;
      mesh.name = partNames[i];
      mesh.userData.pid = i;
      mesh.userData.name = partNames[i];
      mesh.userData.label = labels[i];

      parts[i] = mesh;
    }
    console.timeEnd('segmentObject');
    return parts;
  }

  /**
   * Maps each face (index) to triangle indices in face.
   *
   * @param indices {Array<number>} part segmentation indices
   * @return {Array<number>}
   */
  static groupFaces(indices) {
    const faces = [];
    for (let i = 0; i < indices.length; i++) {
      if (!faces[indices[i]]) {
        faces[indices[i]] = [];
      }

      faces[indices[i]].push(i);
    }

    return faces;
  }

}

PartsLoader.MESH_OPACITY = 0.5;

module.exports = PartsLoader;
