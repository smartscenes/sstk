const ObjectSegmentator = require('geo/ObjectSegmentator');
const Object3DUtil = require('geo/Object3DUtil');
const GeometryUtil = require('geo/GeometryUtil');
const _ = require('util/util');


/**
 * Identifies parts of the Object3D that is dubious and need to be cleaned
 * @namespace {geo}
 * @constructor
 */
function ObjectCleaner() {
}

function identifyDisconnectedPiecesForNodes(nodes, disconnectedPieces, segmentator, validDimLengthMin) {
  if (nodes.length > 1) {
    //console.log('checking',children);
    const connected = segmentator.identifyConnectedComponents(nodes, {
      minDist: validDimLengthMin,
      maxDist: validDimLengthMin * 10,
      //constrainVertical: true,
      //checkAABB: true,
      //minWidth: 0,
      method: 'bbox'
    });
    if (connected.components.length > 1) {
      let remaining = [];
      for (let indices of connected.components) {
        const connectedNodes = _.map(indices, i => nodes[i]);
        const bbox = Object3DUtil.getOrientedBoundingBox(connectedNodes);
        // Look for floating planes
        const ndims = bbox.getNumValidDimensions(validDimLengthMin);
        if (ndims < 3) {
          disconnectedPieces.push(...connectedNodes);
        } else {
          remaining.push({obb: bbox, size: bbox.volume(), nodes: connectedNodes});
        }
        //console.log(connectedNodes, bbox, ndims);
      }
      remaining = _.sortBy(remaining, x => -x.size);
      if (remaining.length > 1) {
        const mainBBox = Object3DUtil.toBBox(remaining[0].obb);
        for (let group of remaining.slice(1)) {
          if (group.obb.intersectsAABB(mainBBox)) {
            mainBBox.includeOBB(group.obb);
          } else if (group.size >= 0.25*remaining[0].size) {
            mainBBox.includeOBB(group.obb);
          } else {
            //console.log('isolated', group);
            disconnectedPieces.push(...group.nodes);
          }
        }
      }
      return true;
    }
  }
  return false;
}

function getValidDimLengthMin(object3D) {
  const overallBBox = Object3DUtil.getBoundingBox(object3D);
  //const minDimLength = overallBBox.minDim();
  const maxDimLength = overallBBox.maxDim();
  return maxDimLength/1000;
}

ObjectCleaner.identifyDisconnectedPiecesWithTraversal = function(object3D) {
  const disconnectedPieces = [];
  const segmentator = new ObjectSegmentator();
  const validDimLengthMin = getValidDimLengthMin(object3D);
  //console.log('validDimLengthMin:' + validDimLengthMin);
  Object3DUtil.traverse(object3D, node => {
    const children = _.filter(node.children, node => Object3DUtil.getBoundingBox(node).valid());
    const disconnectedPiecesIdentified = identifyDisconnectedPiecesForNodes(children, disconnectedPieces, segmentator, validDimLengthMin);
    return !disconnectedPiecesIdentified;
  });
  //console.log('disconnected', disconnectedPieces);
  return disconnectedPieces;
};

ObjectCleaner.identifyDisconnectedPieces = function(object3D) {
  const disconnectedPieces = [];
  const segmentator = new ObjectSegmentator();
  const validDimLengthMin = getValidDimLengthMin(object3D);
  //console.log('validDimLengthMin:' + validDimLengthMin);
  const meshes = Object3DUtil.getMeshList(object3D);
  identifyDisconnectedPiecesForNodes(meshes, disconnectedPieces, segmentator, validDimLengthMin);
  const finalDisconnected = Object3DUtil.getMinimalSpanningNodes(disconnectedPieces);
  // Traverse up the tree and identify ancestor nodes where all children are included
  //console.log('disconnected', finalDisconnected, finalDisconnected.length, disconnectedPieces.length);
  return finalDisconnected;
};

ObjectCleaner.identifyBillboards = function(object3D) {
  const overallBBox = Object3DUtil.getBoundingBox(object3D);
  //const minDimLength = overallBBox.minDim();
  const maxDimLength = overallBBox.maxDim();
  const validDimLengthMin = getValidDimLengthMin(object3D);
  const meshes = Object3DUtil.getMeshList(object3D);
  // Identify if the mesh is a plane
  const billboards = [];
  for (let mesh of meshes) {
    const obb = Object3DUtil.getOrientedBoundingBox(mesh);
    if (obb.getNumValidDimensions(validDimLengthMin) === 2) {
      if (obb.maxDim() > 0.05*maxDimLength) {
        // Check if it has a texture and what the uv looks like
        const mats = _.filter(GeometryUtil.getMaterials(mesh.material), mat => mat.map);
        //console.log(obb.maxDim(), maxDimLength, mats, mats.length);
        const nVerts = GeometryUtil.getGeometryVertexCount(mesh.geometry);
        if (mats.length === 1 && nVerts === 4) {
          billboards.push(mesh);
        }
      }
    }
  }
  //console.log('billboards', billboards);
  return billboards;
};

module.exports = ObjectCleaner;

