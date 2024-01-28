const GeometryUtil = require('geo/GeometryUtil');
const OBBFitter = require('geo/OBBFitter');
const BBox = require('geo/BBox');
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
    return _.sumBy(this.faceIndices, faceIndex => this.__triAccessor.getTriangleArea(faceIndex, transform));
  }

  areaWeightedNormal(transform) {
    var norm = new THREE.Vector3();
    var tri = new THREE.Triangle();
    var weightedNorm = new THREE.Vector3();
    for (var i = 0; i < this.faceIndices.length; i++) {
      var faceIndex = this.faceIndices[i];
      this.__triAccessor.getTriangle(faceIndex, tri, transform);
      var area = tri.getArea();
      tri.getNormal(norm);
      weightedNorm.addScaledVector(norm, area);
    }
    weightedNorm.normalize();
    return weightedNorm;
  }
  getAreaRatio(condition, transform) {
    var norm = new THREE.Vector3();
    var tri = new THREE.Triangle();
    var total = 0;
    var satisfied = 0;
    for (var i = 0; i < this.faceIndices.length; i++) {
      var faceIndex = this.faceIndices[i];
      this.__triAccessor.getTriangle(faceIndex, tri, transform);
      var area = tri.getArea();
      tri.getNormal(norm);
      total += area;
      if (condition(faceIndex, tri)) {
        satisfied += area;
      }
    }
    return { numerator: satisfied, denominator: total, value: satisfied/total };
  }

  aabb(transform) {
    var bbox = new BBox();
    var tri = new THREE.Triangle();
    for (var i = 0; i < this.faceIndices.length; i++) {
      var faceIndex = this.faceIndices[i];
      this.__triAccessor.getTriangle(faceIndex, tri, transform);
      bbox.includePoint(tri.a);
      bbox.includePoint(tri.b);
      bbox.includePoint(tri.c);
    }
    return bbox;
  }

  obb(opts) {
    // TODO: Check Mesh.findOBB2D_Meshes actually accepts partial meshes
    return OBBFitter.fitMeshOBB(this, opts);
  }

  toMesh(transform) {
    const extractedMesh = GeometryUtil.extractMesh(this.mesh, this.faceIndices, true);
    if (transform) {
      extractedMesh.geometry.applyMatrix4(transform);
    }
    return extractedMesh;
  }
}

module.exports = MeshFaces;
