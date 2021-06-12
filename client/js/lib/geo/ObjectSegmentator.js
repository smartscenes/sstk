const DistanceMatrix = require('parts/DistanceMatrix');
const Distances = require('geo/Distances');
const DSUtil = require('ds/util');
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
    var distances = new DistanceMatrix([], true);
    //console.log(distances);
    var connectedComponents = DSUtil.identifyConnectedComponentsWithCachedDistanceMatrix(nodes,
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

  segmentObject(object3D, opts) {
    var converted = Object3DUtil.deepConvert(object3D, node => {
      if (node instanceof THREE.Mesh) {
        var segmented = this.meshSegmentator.segment(node, opts);
        if (segmented.length > 1) {
          var newNode = new THREE.Object3D();
          newNode.matrix.copy(node.matrix);
          newNode.matrix.decompose(newNode.position, newNode.quaternion, newNode.scale);
          newNode.matrixWorldNeedsUpdate = true;
          for (var i = 0; i < segmented.length; i++) {
            var m = segmented[i].toMesh();
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
    var segmentationByMeshIndex = _.groupBy(segmentation, 'meshIndex');
    var converted = Object3DUtil.deepConvert(object3D, node => {
      if (node instanceof THREE.Mesh) {
        var segmented = segmentationByMeshIndex[node.userData.index];
        if (segmented.length > 1) {
          var newNode = new THREE.Object3D();
          newNode.matrix.copy(node.matrix);
          newNode.matrix.decompose(newNode.position, newNode.quaternion, newNode.scale);
          newNode.matrixWorldNeedsUpdate = true;
          for (var i = 0; i < segmented.length; i++) {
            var faceIndices = segmented[i].triIndex;
            var mf = new MeshFaces(node, faceIndices);
            var m = mf.toMesh();
            if (opts.includeFaceIndices) {
              m.userData.faceIndices = opts.condenseFaceIndices?
                _.toCondensedIndices(faceIndices) : faceIndices;
            }
            Object3DUtil.clearTransform(m);
            newNode.add(m);
            var segIndex = segmented[i].surfaceIndex;
            m.userData.segIndex = segIndex;
            m.userData.id = segIndex;
          }
          return newNode;
        } else {
          if (segmented[0].triIndex && segmented[0].triIndex.length) {
            console.warn('Ignored triIndex for single mesh', node);
          }
          var segIndex = segmented[0].surfaceIndex;
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