const PartConnectivityGraph = require('parts/PartConnectivityGraph');
const IndexedMeshPartsLoader = require('articulations/IndexedMeshPartsLoader');
const Object3DUtil = require('geo/Object3DUtil');
const _ = require('util/util');

/**
 * Provide functions for loading parts
 * @memberOf articulations
 */
class PartsLoader {
  /**
   * Creates a new PartsLoader
   * @param params
   * @param params.assetManager {assets.AssetManager}
   */
  constructor(params) {
    this.assetManager = params.assetManager;
  }

  static loadIndexedPartMeshes(model_filename, parts_filename, callback) {
    return IndexedMeshPartsLoader.loadPartMeshes(model_filename, parts_filename, callback);
  }

  /**
   * Looks up part info
   * @param fullId {string}
   * @param partsField {string}
   * @param callback {function(err, articulations.PartsLoader.LoadPartsInfo)}
   */
  lookupPartsInfo(fullId, partsField, callback) {
    this.assetManager.lookupModelInfo(null, fullId, (modelInfo) => {
      const partsInfo = (partsField != null) ? modelInfo[partsField] : null;
      callback(null, partsInfo);
    });
  }

  /**
   * Load precomputed connectivity graph json by itself
   * @param fullId
   * @param options
   * @param callback
   */
  loadPartConnectivityGraphJson(fullId, options, callback) {
    const partsField = options? options.partsField : null;
    this.assetManager.lookupModelInfo(null, fullId, (modelInfo) => {
      const partsInfo = modelInfo[partsField];
      const precomputedFilename = partsInfo['files']['connectivity_graph'];
      _.getJSON(precomputedFilename, callback);
    });
  }

  /**
   * Load parts with connectivity graph
   * @param fullId {string} Full model id
   * @param partsInfo {articulations.PartsLoader.LoadPartsInfo}
   * @param options {articulations.PartsLoader.LoadPartsOptions}
   * @param callback {articulations.PartsLoader.partsLoadedCallback}
   */
  loadPartsWithConnectivityGraph(fullId, partsInfo, options, callback) {
    // Load the precomputed connectivity graph and OBBs
    if (!callback && options) {
      if (typeof(options) === 'function') {
        callback = options;
        options = null;
      } else if (typeof(options) === 'object') {
        callback = options.callback;
      }
    }
    this.loadPartMeshesForPartsInfo(fullId, partsInfo, options, (err, partsData) => {
      if (err) {
        callback(err);
      } else {
        if (!partsInfo['files']['connectivity_graph']) {
          if (partsData.connectivityGraph) {
            callback(null, {
              annId: partsData.annId,
              parts: partsData.connectivityGraph.parts,
              connectivityGraph: partsData.connectivityGraph
            });
          } else {
            callback('Cannot load connectivity graph for ' + fullId);
          }
        } else {
          const precomputedFilename = partsInfo['files']['connectivity_graph'];
          _.getJSON(precomputedFilename, function(err, precomputedJson) {
            if (err) {
              callback(err)
            } else {
              const graph = PartConnectivityGraph.fromJson(precomputedJson);
              partsData.parts.forEach(m => {
                graph.parts[m.userData.pid].object3D = m;
              });
              callback(null, {
                annId: partsData.annId,
                parts: graph.parts,
                connectivityGraph: graph
              })
            }
          });
        }
      }
    });
  }

  /**
   * Load part meshes
   * @param fullId {string} Full model id
   * @param partsInfo {articulations.PartsLoader.LoadPartsInfo}
   * @param options {articulations.PartsLoader.LoadPartsOptions}
   * @param callback {articulations.PartsLoader.partMeshesLoadedCallback}
   */
  loadPartMeshesForPartsInfo(fullId, partsInfo, options, callback) {
    if (!callback && options) {
      if (typeof(options) === 'function') {
        callback = options;
        options = null;
      } else if (typeof(options) === 'object') {
        callback = options.callback;
      }
    }
    const discardHierarchy = options? options.discardHierarchy : false;
    this.loadPartMeshesForPartsInfoSimple(fullId, partsInfo, (err, res) => {
      if (discardHierarchy && res) {
        // TODO: account for part transforms?
        res.parts.forEach( p => {
          p.children = p.children.filter(c => c.userData.pid == null);
          p.parent = null;
        });
      }
      callback(err, res);
    });
  }

  /**
   * Load part meshes
   * @param fullId {string} Full model id
   * @param partsInfo {articulations.PartsLoader.LoadPartsInfo}
   * @param callback {articulations.PartsLoader.partMeshesLoadedCallback}
   */
  loadPartMeshesForPartsInfoSimple(fullId, partsInfo, callback) {
    if (partsInfo && partsInfo.files.parts && partsInfo.files.mesh) {
      //if (partsInfo.partType === 'indexedSegmentation') {
      PartsLoader.loadIndexedPartMeshes(partsInfo.files.mesh, partsInfo.files.parts, callback);
      //}
    } else {
      this.assetManager.loadModel({fullId: fullId}, function (err, modelInstance) {
        if (err) {
          callback(err);
        } else {
          const object3D = modelInstance.getObject3D('Model').children[0];
          let partMeshes = null;
          if (object3D.type === 'ArticulatedObject') {
            console.log('Got ' + object3D.parts.length + ' parts from ArticulatedObject');
            partMeshes = object3D.parts.map(p => p.object3D);
          } else {
            // Have parts be individual meshes
            const meshes = Object3DUtil.getMeshList(object3D);
            for (let mesh of meshes) {
              const pid = mesh.userData.index;
              mesh.userData.pid = pid;
              mesh.userData.name = mesh.name;
              delete mesh.userData.index;
            }
            partMeshes = meshes;
          }
          callback(null, { parts: partMeshes, connectivityGraph: object3D.connectivityGraph })
        }
      });
    }
  }

  /**
   * Load part meshes
   * @param fullId {string} Full model id
   * @param options {articulations.PartsLoader.LoadPartsOptions}
   * @param callback {articulations.PartsLoader.partMeshesLoadedCallback}
   */
  loadPartMeshesById(fullId, options, callback) {
    const partsField = options? options.partsField : null;
    this.assetManager.lookupModelInfo(null, fullId, (modelInfo) => {
      const partsInfo = (partsField != null) ? modelInfo[partsField] : null;
      this.loadPartMeshesForPartsInfo(fullId, partsInfo, options, callback);
    });
  };
}

/**
 * Information about paths to use for loading parts.
 * @typedef articulations.PartsLoader.LoadPartsInfo
 * @type {object}
 * @property {Map<string,string>} files - Paths of files for parts <br>
 *      `parts` - Path of json file defining the part segmentation <br>
 *      `mesh`- Path of mesh <br>
 *      `connectivity_graph` - Path of precomputed connectivity graph
 * @property {string} label - Label that is stored internally
 */

/**
 * Options about how to load parts.
 * @typedef articulations.PartsLoader.LoadPartsOptions
 * @type {object}
 * @property {string} partsField - Label that is stored internally
 * @property {boolean} discardHierarchy - Whether to discard loaded part hierarchy
 * @property {articulations.PartsLoader.partsLoadedCallback|articulations.PartsLoader.partMeshesLoadedCallback} [callback]
 */

/**
 * Error first function callback for when parts are loaded
 * @callback articulations.PartsLoader.partsLoadedCallback
 * @param {string|*} error
 * @param {{annId: string, parts: parts.Part[], connectivityGraph: parts.PartConnectivityGraph}} [partData]
 */

/**
 * Error first function callback for when part meshes are loaded
 * @callback articulations.PartsLoader.partMeshesLoadedCallback
 * @param {string|*} error
 * @param {{parts: THREE.Object3D[], connectivityGraph: parts.PartConnectivityGraph}} [partMeshData]
 */

module.exports = PartsLoader;