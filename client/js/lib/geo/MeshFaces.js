const GeometryUtil = require('geo/GeometryUtil');
const OBBFitter = require('geo/OBBFitter');
const TriangleAccessor = require('geo/TriangleAccessor');
const _ = require('util/util');

class MeshFaces {
  constructor(mesh, faceIndices) {
    this.mesh = mesh;
    this.faceIndices = faceIndices || [];
    this.__triAccessor = new TriangleAccessor(mesh);
  }

  isCompatible(triangle) {
    return true;
  }

  add(faceIndex) {
    this.faceIndices.push(faceIndex);
  }

  area(transform) {
    _.sum(this.faceIndices, faceIndex => this.__triAccessor.getTriangleArea(faceIndex, transform));
  }

  obb(opts) {
    // TODO: Check Mesh.findOBB2D_Meshes actually accepts partial meshes
    return OBBFitter.fitMeshOBB(this, opts);
  }

  toMesh() {
    const extractedMesh = GeometryUtil.extractMesh(this.mesh, this.faceIndices, true);
    return extractedMesh;
  }
}

module.exports = MeshFaces;
