'use strict';

var GeometryUtil = require('geo/GeometryUtil');
var Object3DUtil = require('geo/Object3DUtil');
var _ = require('util/util');

/**
 * Helper for accessing faces of a mesh
 * @param mesh {THREE.Mesh}
 * @constructor
 * @private
 * @memberOf geo
 */
function TriangleAccessor(mesh) {
  this.mesh = mesh;
  this.geo = mesh.geometry;
  this.isBufferGeometry = mesh.geometry.isBufferGeometry;
  this.V = this.isBufferGeometry ? this.geo.attributes.position.array : this.geo.vertices;
  this.F = this.isBufferGeometry ? null : this.geo.faces;
}
TriangleAccessor.prototype.constructor = TriangleAccessor;

TriangleAccessor.prototype.numTriangles = function () {
  return GeometryUtil.getGeometryFaceCount(this.geo);
};

function getVertexAttr(attr, vidx, stride) {
  if (!attr) { return; }
  var i = vidx * stride;
  return attr.array.slice(i, i + stride);
}

/**
 * Returns the ith triangle of this mesh
 * @param i {int}
 * @returns {MeshSampling.Face}
 */
TriangleAccessor.prototype.get = function (i) {
  var face = { index: i };  // fields : va, vb, vc, na, nb, nc, ca, cb, cc, uva, uvb, uvc, materialIndex
  if (this.isBufferGeometry) {
    var vidxs = GeometryUtil.getFaceVertexIndices(this.geo, i);

    face.va = GeometryUtil.getGeometryVertex(this.geo, vidxs[0]);
    face.vb = GeometryUtil.getGeometryVertex(this.geo, vidxs[1]);
    face.vc = GeometryUtil.getGeometryVertex(this.geo, vidxs[2]);

    if (this.geo.groups) {  // material indices
      var vi = i*3;
      var group = _.find(this.geo.groups, function (g) {
        return (vi >= g.start) && (vi < g.start + g.count);
      });
      if (group) {
        face.materialIndex = group.materialIndex;
      }
    }

    var normals = this.geo.attributes['normal'];
    if (normals && (normals.count || normals.length)) {
      face.hasNormals = true;
      face.na = Object3DUtil.toVector3(getVertexAttr(normals, vidxs[0], 3));
      face.nb = Object3DUtil.toVector3(getVertexAttr(normals, vidxs[1], 3));
      face.nc = Object3DUtil.toVector3(getVertexAttr(normals, vidxs[2], 3));
    }

    var colors = this.geo.attributes['color'];
    if (colors && (colors.count || colors.length)) {
      face.hasVertexColors = true;
      face.ca = Object3DUtil.getColor(getVertexAttr(colors, vidxs[0], 3));
      face.cb = Object3DUtil.getColor(getVertexAttr(colors, vidxs[1], 3));
      face.cc = Object3DUtil.getColor(getVertexAttr(colors, vidxs[2], 3));
    }

    var uvs = this.geo.attributes['uv'];
    if (uvs && (uvs.count || uvs.length)) {
      face.hasUVs = true;
      face.uva = Object3DUtil.toVector2(getVertexAttr(uvs, vidxs[0], 2));
      face.uvb = Object3DUtil.toVector2(getVertexAttr(uvs, vidxs[1], 2));
      face.uvc = Object3DUtil.toVector2(getVertexAttr(uvs, vidxs[2], 2));
    }

  } else {
    var f = this.geo.faces[i];
    face.materialIndex = f.materialIndex;

    face.va = this.V[f.a];
    face.vb = this.V[f.b];
    face.vc = this.V[f.c];

    if (f.vertexNormals && f.vertexNormals.length === 3) {
      face.hasNormals = true;
      face.na = f.vertexNormals[0];
      face.nb = f.vertexNormals[1];
      face.nc = f.vertexNormals[2];
    }

    if (f.vertexColors && f.vertexColors.length === 3) {
      face.hasVertexColors = true;
      face.ca = f.vertexColors[0];
      face.cb = f.vertexColors[1];
      face.cc = f.vertexColors[2];
    }

    if (this.geo.faceVertexUvs && this.geo.faceVertexUvs[0]) {
      var vertexUVs = this.geo.faceVertexUvs[0][i];
      if (vertexUVs) {
        face.hasUVs = true;
        face.uva = vertexUVs[0];
        face.uvb = vertexUVs[1];
        face.uvc = vertexUVs[2];
      }
    }

  }

  return face;
};

TriangleAccessor.prototype.getTriangle = function(i, triangle, transform) {
  return GeometryUtil.getTriangle(this.geo, i, triangle, transform);
};

TriangleAccessor.prototype.getTriangleVertexIndices = function(i) {
  return GeometryUtil.getFaceVertexIndices(this.geo, i);
};

TriangleAccessor.prototype.getTriangleArea = (function() {
  var tri = new THREE.Triangle();
  return function(i, transform) {
    this.getTriangle(i, tri, transform);
    return tri.getArea();
  };
}());

// Extended triangle accessor will also handle partial meshes
function ExtendedTriangleAccessor(mesh) {
  if (mesh.mesh && mesh.faceIndices) {
    TriangleAccessor.call(this, mesh.mesh);
    this.faceIndices = mesh.faceIndices;
  } else {
    TriangleAccessor.call(this, mesh);
  }
}

ExtendedTriangleAccessor.prototype = Object.create(TriangleAccessor.prototype);
ExtendedTriangleAccessor.prototype.constructor = ExtendedTriangleAccessor;

ExtendedTriangleAccessor.prototype.numTriangles = function () {
  if (this.faceIndices) {
    return this.faceIndices.length;
  } else {
    return TriangleAccessor.prototype.numTriangles.call(this);
  }
};


ExtendedTriangleAccessor.prototype.get = function (i) {
  if (this.faceIndices) {
    var f = TriangleAccessor.prototype.get.call(this, this.faceIndices[i]);
    return f;
  } else {
    return TriangleAccessor.prototype.get.call(this, i);
  }
};

ExtendedTriangleAccessor.prototype.getTriangleVertexIndices = function(i) {
  if (this.faceIndices) {
    return TriangleAccessor.prototype.getTriangleVertexIndices.call(this, this.faceIndices[i]);
  } else {
    return TriangleAccessor.prototype.getTriangleVertexIndices.call(this, i);
  }
};

ExtendedTriangleAccessor.prototype.getTriangle = function(i, triangle, transform) {
  if (this.faceIndices) {
    var f = TriangleAccessor.prototype.getTriangle.call(this, this.faceIndices[i], triangle, transform);
    return f;
  } else {
    return TriangleAccessor.prototype.getTriangle.call(this, i, triangle, transform);
  }
};

module.exports = ExtendedTriangleAccessor;