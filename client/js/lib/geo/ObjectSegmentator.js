const DistanceMatrix = require('parts/DistanceMatrix');
const Distances = require('geo/Distances');
const DSUtil = require('ds/util');
const ElemToLabelIndexBuffer = require('geo/seg/ElemToLabelIndexBuffer');
const GeometryUtil = require('geo/GeometryUtil');
const Object3DUtil = require('geo/Object3DUtil');
const MeshSegmentator = require('geo/MeshSegmentator');
const MeshFaces = require('geo/MeshFaces');

const _ = require('util/util');

class ObjectSegmentator {
  constructor() {
    this.meshSegmentator = new MeshSegmentator();
  }

  identifyConnectedComponents(nodes, opts) {
    opts = opts || {};
    if (opts.method === 'bbox') {
      return this.identifyConnectedAxisAlignedBoundingBoxes(nodes, opts);
    } else if (opts.method === 'obb') {
      return this.identifyConnectedOrientedBoundingBoxes(nodes, opts);
    } else {
      return this.identifyConnectedComponentsByDistance(nodes, opts);
    }
  }

  identifyConnectedAxisAlignedBoundingBoxes(nodes, opts) {
    // Similar to identifyConnectedComponentsByDistance but just use bounding boxes (instead of exact distance)
    const bboxes = _.map(nodes, node => Object3DUtil.getBoundingBox(node));
    return this.identifyConnectedComponentsByDistance(bboxes, opts);
  }

  identifyConnectedOrientedBoundingBoxes(nodes, opts) {
    // Similar to identifyConnectedComponentsByDistance but just use bounding boxes (instead of exact distance)
    const obbs = _.map(nodes, node => Object3DUtil.getOrientedBoundingBox(node, opts));
    return this.identifyConnectedComponentsByDistance(obbs, opts);
  }

  identifyConnectedComponentsByDistance(nodes, opts) {
    opts = opts || {};
    opts.minDist = opts.minDist || 0.000000001;
    opts.maxDist = opts.maxDist || 0.1;
    const minDist = opts.minDist;
    const maxDistSq = opts.maxDist*opts.maxDist;
    if (opts.debug) {
      console.time('identifyConnectedComponentsByDistance');
    }
    const distances = new DistanceMatrix([], true);
    //console.log(distances);
    const connectedComponents = DSUtil.identifyConnectedComponentsWithCachedDistanceMatrix(nodes,
      _.range(0, nodes.length), distances, minDist,
      (m1, m2) => {
        return Distances.computeDistance(m1, m2, {all: true, shortCircuit: {maxDistSq: maxDistSq}});
      },
      d => {
        return d ? d.distanceSq : Infinity;
      });

    if (opts.debug) {
      console.timeEnd('identifyConnectedComponentsByDistance');
    }
    return { nodes: nodes, components: connectedComponents };
  }

  getSegmentation(object3D, opts) {
    let segmented = null;
    if (opts.ignoreMeshGroups) {
      const combinedMesh = GeometryUtil.mergeMeshesWithTransform(object3D);
      segmented = [{mesh: combinedMesh, meshSegs: this.meshSegmentator.segment(combinedMesh, opts)}];
    } else {
      const meshes = Object3DUtil.getMeshList(object3D);
      segmented = meshes.map(mesh => {
        return {mesh: mesh, meshSegs: this.meshSegmentator.segment(mesh, opts)};
      });
    }
    if (opts.format === 'trimesh') {
      // each segment should be of the form {meshIndex: x, triIndex: [...] }
      segmented = segmented.map((m, meshIndex) =>
        _.flatten(m.meshSegs.map((meshFaces, i) => {
          const faceIndices = opts.condenseFaceIndices?
            _.toCondensedIndices(meshFaces.faceIndices) : meshFaces.faceIndices;
          return {meshIndex: meshIndex, triIndex: faceIndices};
        })));
    } else if (opts.format === 'triIndexToSeg') {
      // provide one buffer with triangle index to segment index
      segmented = segmented.map((m, meshIndex) => {
        const nTris = GeometryUtil.getGeometryFaceCount(m.mesh.geometry);
        const buffer = new ElemToLabelIndexBuffer(nTris);
        buffer.fromGroupedElemIndices(m.meshSegs, (g, i) => i, 'faceIndices');
        return buffer;
      });
    } else if (opts.format === 'meshSegs') {
      // segmented already in this format
    } else {
      console.error('Cannot convert to unsupported mesh segmentation format', opts.format);
    }
    return segmented;
  }

  segmentObject(object3D, opts) {
    const converted = Object3DUtil.deepConvert(object3D, node => {
      if (node instanceof THREE.Mesh) {
        const segmented = this.meshSegmentator.segment(node, opts);
        if (segmented.length > 1) {
          const newNode = new THREE.Object3D();
          newNode.matrix.copy(node.matrix);
          newNode.matrix.decompose(newNode.position, newNode.quaternion, newNode.scale);
          newNode.matrixWorldNeedsUpdate = true;
          for (let i = 0; i < segmented.length; i++) {
            const m = segmented[i].toMesh();
            if (opts.includeFaceIndices) {
              m.userData.faceIndices = opts.condenseFaceIndices?
                _.toCondensedIndices(segmented[i].faceIndices) : segmented[i].faceIndices;
            }
            Object3DUtil.clearTransform(m);
            newNode.add(m);
          }
          return newNode;
        } else {
          return node;
        }
      } else {
        return node;
      }
    });
    return converted;
  }

  applyTriMeshSegmentation(object3D, segmentation, opts) {
    opts = opts || {};
    const meshes = Object3DUtil.getMeshList(object3D);
    for (let i = 0; i < meshes.length; i++) {
      meshes[i].userData.meshIndex = i;
    }
    const segIndexField = opts.segIndexField || 'segIndex';
    const segmentationByMeshIndex = _.groupBy(segmentation, 'meshIndex');
    const converted = Object3DUtil.deepConvert(object3D, node => {
      if (node instanceof THREE.Mesh) {
        // TODO: use meshIndex vs this vague variable index
        const meshIndex = (node.userData.index != null)? node.userData.index : node.userData.meshIndex;
        const segmented = segmentationByMeshIndex[meshIndex];
        if (segmented && segmented.length > 1) {
          const newNode = new THREE.Object3D();
          newNode.matrix.copy(node.matrix);
          newNode.matrix.decompose(newNode.position, newNode.quaternion, newNode.scale);
          newNode.matrixWorldNeedsUpdate = true;
          for (let i = 0; i < segmented.length; i++) {
            const faceIndices = segmented[i].triIndex;
            const mf = new MeshFaces(node, faceIndices);
            const m = mf.toMesh();
            if (opts.includeFaceIndices) {
              m.userData.faceIndices = opts.condenseFaceIndices?
                _.toCondensedIndices(faceIndices) : faceIndices;
            }
            Object3DUtil.clearTransform(m);
            newNode.add(m);
            const segIndex = segmented[i][segIndexField];
            m.userData.segIndex = segIndex;
            m.userData.id = segIndex;
          }
          return newNode;
        } else {
          if (segmented[0].triIndex && segmented[0].triIndex.length) {
            console.warn('Ignored triIndex for single mesh', node);
          }
          const segIndex = segmented[0][segIndexField];
          node.userData.segIndex = segIndex;
          node.userData.id = segIndex;
          return node;
        }
      } else {
        return node;
      }
    });
    return converted;
  }
}

module.exports = ObjectSegmentator;