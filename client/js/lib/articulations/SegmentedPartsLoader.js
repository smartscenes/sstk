const async = require('async');
const GeometryUtil = require('geo/GeometryUtil');
const Object3DUtil = require('geo/Object3DUtil');
const SegmentationUtil = require('geo/seg/SegmentationUtil');
const ElemToLabelIndexBuffer = require('geo/seg/ElemToLabelIndexBuffer');
const _ = require('util/util');

// Parts loader that loads an annotated mesh, and segments it into parts
class SegmentedPartsLoader {
  /**
   * Create a SegmentedPartsLoader
   * @param assetManager {AssetManager}
   * @param [options.skipUnlabeledSegment] Whether to create or skip parts that are not labeled
   */
  constructor(assetManager, options) {
    this.assetManager = assetManager;
    this.options = _.defaults(Object.create(null), options || {}, {
      skipUnlabeledSegment: false
    });
  }

  loadPartMeshes(modelId, partsInfo, callback) {
    console.time('loadPartMeshes');
    async.waterfall([
      (cb) => {
        const partsFilename = partsInfo.files.parts;
        _.getJSON(partsFilename, cb);
      },
      (partsJson, cb) => {
        const meshName =  _.get(partsJson, ['data', 'metadata', 'meshName']);
        const format = meshName != null? meshName :  _.get(partsInfo, ['createdFrom', 'name']);
        const meshFilename = partsInfo.files.mesh;
        const modelInfo = meshFilename? { file: meshFilename } : { fullId: modelId, format: format };
        // Use asset manager to load model mesh
        this.assetManager.loadModel(modelInfo, function (err, modelInstance) {
          if (err) {
            cb(err);
          } else {
            const object3D = modelInstance.object3D;
            cb(null, { partsJson: partsJson, object3D: object3D });
          }
        });
      },
      (res, cb) => {
        const segmentationFilename = partsInfo.files.segmentation;
        if (this.options.format === 'segmentation' && segmentationFilename) {
          _.getJSON(segmentationFilename, (err,seg) => {
            if (seg) {
              res.segmentation = seg;
            }
            cb(err, res);
          });
        } else {
          cb(null, res);
        }
      },
    ], (err, res) => {
      console.timeEnd('loadPartMeshes');
      if (err) {
        callback(err);
      } else {
        const object3D = res.object3D;
        const partsJson = res.partsJson;
        const partsData = SegmentedPartsLoader.parseParts(partsJson);
        const options = _.clone(this.options);
        options.segmentation = res.segmentation;
        const partMeshes = SegmentedPartsLoader.segmentObject(object3D, partsData.parts, options);
        callback(null, { id: partsData.id, annId: partsData.annId, parts: partMeshes });
      }
    });
  }

  static parseParts(json) {
    return {
      id: json.id,
      annId: json.id,
      parts: json.annotations || json.data.annotations || json.parts
    };
  }

  static parseIndexedSegParts(json) {
    const partSegIndex = _.findIndex(json.segmentation, seg => seg.name === "parts");
    if (partSegIndex < 0) {
      throw 'Segmentation does not contain parts';
    }
    const labels = json.segmentation[partSegIndex].labels;
    const indices = json.segmentation[partSegIndex].index;

    const parts = labels.map((label) => { return { label: label, faceIndices: [] }; });
    for (let i = 0; i < indices.length; i++) {
      const index = indices[i];
      parts[index].faceIndices.push(i);
    }
    const partCounts = {};
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const partCount = partCounts[part.label] || 0;
      part.name = part.label + ' ' + partCount;
      partCounts[part.label] = partCount + 1;
    }

    return {
      id: json.id,
      annId: json.annId,
      parts: parts
    };
  }

  /**
   * Segments object into parts and returns the segmented object and parts
   *
   * @param object3D {THREE.Object3D} Threejs object
   * @param parts {Array} Parts
   * @param options {Object}
   * @param options.format {string} What format is the part specified in (triIndices|segmentation)
   * @param [options.segmentation] {{ segmentation: Map<segId,triIndices>, metadata: { condenseFaceIndices: boolean }} If format is segmentation, specifies information about the segmentation
   * @param [options.skipUnlabeledSegment] {boolean}
   * @returns {{segmentedObject3D: THREE.Object3D, partMeshes: Array<THREE.Mesh>}}
   */
  static getSegmentedObjectAndParts(object3D, parts, options) {
    options = options || {};
    console.time('segmentObject');
    // Get buffer of triIndices
    let meshTris = null;
    let indexByPartId = false;
    const meshes = Object3DUtil.getMeshList(object3D);
    let remeshOptions = null;
    if (options.skipUnlabeledSegment && meshes.lengths === 1) {
      meshTris = parts.map((part) => {
        return part ? {id: part.partId, meshIndex: 0, triIndex: part.triIndices} : null;
      });
      indexByPartId = true;
    } else if (options.format === 'triIndices') {
      let totalFaceCount = 0;
      for (let i = 0; i < meshes.length; i++) {
        totalFaceCount += GeometryUtil.getGeometryFaceCount(meshes[i].geometry);
      }
      const triIndexedSegmentation = new ElemToLabelIndexBuffer(totalFaceCount);
      triIndexedSegmentation.fromGroupedElemIndices(parts, 'partId', 'triIndices');
      meshTris = SegmentationUtil.convertTriIndexedSegmentationToMeshTriSegments(meshes, triIndexedSegmentation.buffer);
      indexByPartId = false;
    } else if (options.format === 'segmentation') {
      if (options.segmentation) {
        remeshOptions = options.segmentation.metadata;
        if (options.segmentation.metadata.format === 'trimesh') {
          parts.forEach((part,i) => {
            if (part.partSetId != null) {
              let partIds = part.partId;
              part.segmentIds = (typeof(partIds) === 'string')? partIds.split(',') : partIds;
              part.partId = part.partSetId;
            }
            const partMeshTris = part.segmentIds.map(partId => options.segmentation.segmentation[partId]);
            part.meshTri = partMeshTris;
          });
          if (!options.skipUnlabeledSegment) {
            const unkPart = SegmentationUtil.findUnannotatedSegments(parts, options.segmentation.segmentation, 'segmentIds');
            if (unkPart.segmentIds.length) {
              unkPart.id = 0;
              unkPart.partId = 0;
              const partMeshTris = unkPart.segmentIds.map(partId => options.segmentation.segmentation[partId]);
              unkPart.meshTri = partMeshTris;
              parts.push(unkPart);
            }
          }
          meshTris = parts.map((part,i) => {
            let partMeshTris = part.meshTri;
            if (options.segmentation.metadata.condenseFaceIndices) {
              partMeshTris = partMeshTris.map(meshTri => {
                const copy = _.clone(meshTri);
                copy.triIndex = _.fromCondensedIndices(meshTri.triIndex);
                return copy;
              });
            }
            return { id: part.partId, surfaceIndex: i, meshTri: partMeshTris };
          });
          indexByPartId = true;
        } else {
          throw 'Unsupported segmentation format ' + options.segmentation.format;
        }
      } else {
        throw 'Segmentation not provided';
      }
    } else {
      throw 'Unsupported format ' + options.format;
    }
    const remeshed = SegmentationUtil.remeshObjectUsingMeshTriSegments(object3D, meshTris, null, remeshOptions);
    // console.log('remeshed', remeshed, meshTris, parts);
    const partMeshes = [];
    const partsById = _.keyBy(parts.filter(x => x), 'partId');
    // Note: remeshed children may not be guaranteed to have same ordering as the partIds
    for (let i = 0; i < remeshed.children.length; i++) {
      const mesh = remeshed.children[i];
      let part = null;
      if (indexByPartId) {
        // TODO: do we use id of 0 to indicate "unknown"?
        part = partsById[mesh.userData.id];
      } else {
        const partIndex = mesh.userData.id - 1;
        if (options.skipUnlabeledSegment && partIndex < 0) continue;
        part = partIndex >= 0? parts[partIndex] : { partId: 0, label: 'unknown' };
        if (partIndex >= 0 && part.partId === 0) {
          console.warn('Part has partId 0 and partIndex >= 0', part);
        }
      }

      // Assumes that partId 0 is not used and can be allocated to unknown
      mesh.pid = part.partId;
      mesh.name = part.label;
      mesh.userData.pid = part.partId;
      mesh.userData.name = part.label;
      mesh.userData.label = part.label;
      mesh.userData.type = 'Part';
      mesh.userData.partInfo = part;
      partMeshes[part.partId] = mesh;
    }
    // console.log(remeshed);
    console.timeEnd('segmentObject');
    return { segmentedObject3D: remeshed, partMeshes: partMeshes };
  }

  /**
   * Segments object into parts and adds each part to scene.
   *
   * @param object3D {THREE.Object3D} Threejs object
   * @param parts {Array} Parts
   * @param options {Object}
   * @param [options.skipUnlabeledSegment] {boolean}
   * @returns {Array<THREE.Mesh>}
   */
  static segmentObject(object3D, parts, options) {
    const segmented = SegmentedPartsLoader.getSegmentedObjectAndParts(object3D, parts, options);
    return segmented.partMeshes;
  }

  static partMeshesToGroupedObject3D(partMeshes) {
    const group = new THREE.Group();
    const groupedByObjectId = _.groupBy(partMeshes, 'userData.partInfo.objectId');
    _.each(groupedByObjectId, (grouped, objectId) => {
      const object3D = new THREE.Object3D();
      object3D.name = 'Object-' + objectId;
      for (let i = 0; i < grouped.length; i++) {
        object3D.add(grouped[i]);
      }
      object3D.userData.label = grouped[0].userData.label.split(':')[0];
      object3D.userData.objectId = objectId;
      group.add(object3D);
    });
    return group;
  }

}

module.exports = SegmentedPartsLoader;
