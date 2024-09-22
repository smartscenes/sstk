const ConnectivityGraphHelper = require('articulations/ConnectivityGraphHelper');
const PartConnectivityGraph = require('parts/PartConnectivityGraph');
const IndexedMeshPartsLoader = require('articulations/IndexedMeshPartsLoader');
const SegmentedPartsLoader = require('articulations/SegmentedPartsLoader');
const MeshHelpers = require('geo/MeshHelpers');
const ModelInfo = require('model/ModelInfo');
const Object3DUtil = require('geo/Object3DUtil');
const OBB = require('geo/OBB');
const Part = require('parts/Part');
const LabelParsers = require('part-annotator/LabelParsers');
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
   * @param params.labelParser {string}
   * @param params.connectivityOpts {Object}
   * @param params.debug {boolean} Whether to print debug messages
   */
  constructor(params) {
    this.assetManager = params.assetManager;
    this.labelParser = (params.labelParser != null)? LabelParsers.getLabelParser(params.labelParser) : null;
    this.autocomputeConnectivityGraph = true;
    this.__computeConnectivityGraphOptions = _.defaults(Object.create(null), params.connectivityOpts || {}, {
      useOBB: true, obbFitter: null, refitOBB: false,
      minDist: 0.01, maxDist: 0.1, minConnDist: 0.01, maxConnDist: 0.1
    });
    this.debug = params.debug;
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
      if (partsInfo == null) {
        if (partsField == null) {
          callback(`Missing partsField when looking up parts information for ${fullId}`);
        } else {
          callback(`Error looking up  ${partsField} for ${fullId}`);
        }
      } else {
        // get important asset information from modelInfo
        partsInfo.assetInfo = {
          front: ModelInfo.getFront(modelInfo),
          up: ModelInfo.getUp(modelInfo),
          unit: ModelInfo.getUnit(modelInfo)
        };
        callback(null, partsInfo);
      }
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

  partMeshesToParts(partMeshes, options) {
    const parts = partMeshes.map(mesh => {
      const partInfo = mesh.userData.partInfo;
      delete mesh.userData.partInfo;
      let obb = partInfo.obb? OBB.fromJSON(partInfo.obb) : null;
      if (options.obbFitter) {
        if (!obb || options.refitOBB) {
          obb = options.obbFitter(mesh);
        }
      }
      const part = new Part(partInfo.partId, mesh.userData.name, mesh.userData.label, obb, mesh);
      if (this.labelParser) {
        this.labelParser.parseLabel(mesh.userData.label, part, true);
      }
      //_.defaults(part, partInfo);
      return part;
    });
    return parts;
  }

  computeConnectivityGraph(partsData, assetInfo, options) {
    const parts = this.partMeshesToParts(partsData.parts, options);
    // compute connectivity graph
    const distances = ConnectivityGraphHelper.computeDistancesMatrixWithInfo(parts, options.minDist, options.maxDist,
      (p1, p2) => {
        const isValid = p1.label !== 'unknown' && p2.label !== 'unknown';
        if (isValid) {
          if (this.labelParser && this.labelParser.labelsObjectPart) {
            if (p1.isPart && p2.isPart) {
              return p1.objectInstId === p2.objectInstId;
            } else {
              return false;
            }
          } else {
            return true;
          }
        } else {
          return false;
        }
      },
      (p1, p2) => {
              if (options.useOBB) {
                if (p1.obbMesh == null) {
                  p1.obbMesh = new MeshHelpers.OBB(p1.obb, 'white');
                }
                if (p2.obbMesh == null) {
                  p2.obbMesh = new MeshHelpers.OBB(p2.obb, 'white');
                }
                return ConnectivityGraphHelper.computeMinDistanceWithInfo(p1.obbMesh, p2.obbMesh, options.minDist, options.maxDist);
              } else {
                return ConnectivityGraphHelper.computeMinDistanceWithInfo(p1.object3D, p2.object3D, options.minDist, options.maxDist);
              }
            });
    const distanceMatrix = distances.distances;
    //const closestPoints = distances.closestPoints;
    const connected = ConnectivityGraphHelper.computeConnectedParts(partsData.parts, distanceMatrix, options.minConnDist, options.maxConnDist);
    const connected2 = _.map(connected, (x,i) => Array.from(x));

    if (this.debug) {
      console.log('got parts', parts);
    }
    const connectivityGraph = new PartConnectivityGraph(connected2, parts, options);
    return connectivityGraph;
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
              connectivityGraph: partsData.connectivityGraph,
              metadata: partsInfo
            });
          } else {
            if (this.autocomputeConnectivityGraph) {
              const connectivityGraph = this.computeConnectivityGraph(partsData, partsInfo.assetInfo,
                this.__computeConnectivityGraphOptions);
              callback(null, {
                annId: partsData.annId,
                parts: connectivityGraph.parts,
                connectivityGraph: connectivityGraph,
                metadata: partsInfo
              });
            } else {
              const parts = this.partMeshesToParts(partsData.parts, this.__computeConnectivityGraphOptions);
              callback('Cannot load connectivity graph for ' + fullId,
                {
                  annId: partsData.annId,
                  parts: parts,
                  connectivityGraph: null,
                  metadata: partsInfo
                });
            }
          }
        } else {
          const precomputedFilename = partsInfo['files']['connectivity_graph'];
          _.getJSON(precomputedFilename, function(err, precomputedJson) {
            if (err) {
              callback(err);
            } else {
              const graph = PartConnectivityGraph.fromJson(precomputedJson);
              partsData.parts.forEach(m => {
                graph.parts[m.userData.pid].object3D = m;
              });
              callback(null, {
                annId: partsData.annId,
                parts: graph.parts,
                connectivityGraph: graph,
                metadata: partsInfo
              });
            }
          });
        }
      }
    });
  }

  /**
   * Load part meshes
   * @param fullId {string} Full model id
   * @param options {articulations.PartsLoader.LoadPartsOptions}
   * @param callback {articulations.PartsLoader.partsLoadedCallback}
   */
  loadPartsWithConnectivityGraphById(fullId, options, callback) {
    this.lookupPartsInfo(fullId, options? options.partsField : null, (err, partsInfo) => {
      if (err) {
        callback(err);
      } else {
        this.loadPartsWithConnectivityGraph(fullId, partsInfo, options, callback);
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
    this.__loadPartMeshesForPartsInfoSimple(fullId, partsInfo, (err, res) => {
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
  __loadPartMeshesForPartsInfoSimple(fullId, partsInfo, callback) {
    if (partsInfo && partsInfo.files.parts && partsInfo.partType != null) {
      if (partsInfo.partType === 'indexedSegmentation') {
        // TODO(AXC): remove support for this old prototype code path that supports only a very specific data format
        PartsLoader.loadIndexedPartMeshes(partsInfo.files.mesh, partsInfo.files.parts, callback);
      } else if (partsInfo.partType === 'annotated-segment-triindices') {
        const segPartsLoader = new SegmentedPartsLoader(this.assetManager, {format: 'triIndices'});
        segPartsLoader.loadPartMeshes(fullId, partsInfo, callback);
      } else if (partsInfo.partType === 'annotated-segment-ids') {
        const segPartsLoader = new SegmentedPartsLoader(this.assetManager, {format: 'segmentation'});
        segPartsLoader.loadPartMeshes(fullId, partsInfo, callback);
      } else {
        throw 'Unsupported partType: ' + partsInfo.partType;
      }
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
          callback(null, { parts: partMeshes, connectivityGraph: object3D.connectivityGraph });
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
    this.lookupPartsInfo(fullId, options? options.partsField : null, (err, partsInfo) => {
      if (err) {
        callback(err);
      } else {
        this.loadPartMeshesForPartsInfo(fullId, partsInfo, options, callback);
      }
    });
  }
}

/**
 * Information about paths to use for loading parts.
 * @typedef articulations.PartsLoader.LoadPartsInfo
 * @type {object}
 * @property {Map<string,string>} files - Paths of files for parts <br>
 *      `parts` - Path of json file defining the part segmentation <br>
 *      `mesh`- Path of mesh <br>
 *      `connectivity_graph` - Path of precomputed connectivity graph
 * @property {object} assetInfo - Information (up,front,unit) about the asset
 * @property {string} label - Label that is stored internally
 */

/**
 * Options about how to load parts.
 * @typedef articulations.PartsLoader.LoadPartsOptions
 * @type {object}
 * @property {string} partsField - Field to use for loading parts
 * @property {boolean} discardHierarchy - Whether to discard loaded part hierarchy
 * @property {articulations.PartsLoader.partsLoadedCallback|articulations.PartsLoader.partMeshesLoadedCallback} [callback]
 */

/**
 * Information about paths to use for loading parts.
 * @typedef articulations.PartsLoader.PartsData
 * @type {object}
 * @property {string} annId - Annotation id (of part segmentation)
 * @property {parts.Part[]} parts - Array of parts
 * @property {parts.PartConnectivityGraph} connectivityGraph - Connectivity graph for parts
 * @property {parts.LoadPartsInfo} metadata - metadata about how the part is loaded
 */

/**
 * Error first function callback for when parts are loaded
 * @callback articulations.PartsLoader.partsLoadedCallback
 * @param {string|*} error
 * @param {articulations.PartsLoader.PartsData} [partData]
 */

/**
 * Error first function callback for when part meshes are loaded
 * @callback articulations.PartsLoader.partMeshesLoadedCallback
 * @param {string|*} error
 * @param {{parts: THREE.Object3D[], connectivityGraph: parts.PartConnectivityGraph}} [partMeshData]
 */

module.exports = PartsLoader;