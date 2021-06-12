var GeometryUtil = require('geo/GeometryUtil');
var Object3DUtil = require('geo/Object3DUtil');

// TODO: Make this just a Object3D
// Object3D that tracks vertex to segment, and segment to vertex
function VertexSegmentedObject3DWrapper(object3D, vertToSegIndices, color) {
  this.rawSegmentObject3D = __copyAndRecolorVertices(object3D, vertToSegIndices, color);
  var segToVertIndices = __groupVertToSegIndicesBySeg(vertToSegIndices);

  this.rawSegmentObject3D.userData.vertToSegIndices = vertToSegIndices;
  this.rawSegmentObject3D.userData.segToVertIndices = segToVertIndices;
}

Object.defineProperty(VertexSegmentedObject3DWrapper.prototype, 'vertToSegIndices', {
  get: function () { return this.rawSegmentObject3D.userData.vertToSegIndices; }
});

Object.defineProperty(VertexSegmentedObject3DWrapper.prototype, 'segToVertIndices', {
  get: function () { return this.rawSegmentObject3D.userData.segToVertIndices; }
});

//  vertToSegIndices is a mapping of vertex index to a mapped segment index, negative segment indices are not used
//  output segToVertIndices is a mapping of segment index to a array of vertex indices
function __groupVertToSegIndicesBySeg(vertToSegIndices) {
  // Have map of segment to vertices
  var segToVertIndices = [];  // Note: Can use {} but then keys becomes strings so need to be careful
  for (var i = 0; i < vertToSegIndices.length; i++) {
    var si = vertToSegIndices[i];
    if (si < 0) continue;
    if (!segToVertIndices[si]) {
      segToVertIndices[si] = [i];
    } else {
      segToVertIndices[si].push(i);
    }
  }
  return segToVertIndices;
}

function __copyAndRecolorVertices(object3D, vertToSegIndices, color) {
  // Go over segment groups
  var meshes = Object3DUtil.getMeshList(object3D);
  // Assumes just one mesh
  var mesh = meshes[0];
  var geometryWithColors = __createColoredGeometry(mesh, vertToSegIndices, color);
  var geometry = geometryWithColors.geometry;
  var colors = geometryWithColors.colors;

  var material = new THREE.MeshPhongMaterial({ vertexColors: THREE.VertexColors });
  var recolored = new THREE.Mesh(geometry, material);
  recolored.name = object3D.name + '-recolored';
  recolored.userData.segColors = colors;
  Object3DUtil.setMatrix(recolored, mesh.matrixWorld);
  return recolored;
}

//  vertToSegIndices is a mapping of vertex index to a mapped segment index, negative segment indices are not used
function __createColoredGeometry(mesh, vertToSegIndices, color) {
  var geometry = mesh.geometry.clone();
  var gray = new THREE.Color(0.5, 0.5, 0.5);
  var colors = [];
  function getColor(vi) {
    var si = vertToSegIndices[vi];
    if (si == undefined) {
      return gray;
    } else {
      if (!colors[si]) {
        if (color) {
          colors[si] = color.clone();
        } else {
          colors[si] = (si >= 0) ? Object3DUtil.createColor(Math.abs(si)) : gray.clone();
        }
      }
      return colors[si];
    }
  }
  if (geometry.faces) {
    // Maintain array of colors for vertex (for easy update)
    // TODO: Do we need this in memory?
    // geometry.colors = [];
    // var nVertices = GeometryUtil.getGeometryVertexCount(geometry);
    // for (var i = 0; i < nVertices; i++) {
    //   geometry.colors.push(getColor(i));
    // }
    // Update face vertex
    for (var i = 0; i < geometry.faces.length; i++) {
      geometry.faces[i].vertexColors = [
        getColor(geometry.faces[i].a),
        getColor(geometry.faces[i].b),
        getColor(geometry.faces[i].c)
      ];
    }
    geometry.colorsNeedUpdate = true;
    geometry.elementsNeedUpdate = true;
  } else {
    var attributes = geometry.attributes;
    if (attributes.position) {
      var positions = attributes.position.array;
      if (attributes.color === undefined) {
        geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(positions.length), 3));
      }
      // Update vertex colors
      var vcolors = attributes.color.array;
      for (var i = 0; i < vcolors.length; i+=3) {
        var vi = i / 3;
        var c = getColor(vi);
        vcolors[i] = c.r;
        vcolors[i+1] = c.g;
        vcolors[i+2] = c.b;
      }
    }
  }
  geometry.computeFaceNormals();
  geometry.computeVertexNormals();
  return { geometry: geometry, colors: colors };
}

VertexSegmentedObject3DWrapper.prototype.getSegmentVerticesCount = function (segmentIndices) {
  var rawSegmentObject3D = this.rawSegmentObject3D;
  rawSegmentObject3D.updateMatrixWorld();
  var segToVertIndices = rawSegmentObject3D.userData.segToVertIndices;
  var n = 0;
  for (var i = 0; i < segmentIndices.length; i++) {
    var si = segmentIndices[i];
    var vis = segToVertIndices[si];
    if (vis) {
      n += vis.length;
    }
  }
  return n;
};

VertexSegmentedObject3DWrapper.prototype.getSegmentVertices = function (segmentIndices, opts) {
  opts = opts || {};
  var rawSegmentObject3D = this.rawSegmentObject3D;
  rawSegmentObject3D.updateMatrixWorld();
  var segToVertIndices = rawSegmentObject3D.userData.segToVertIndices;
  var geom = rawSegmentObject3D.geometry;
  var worldMatrix = rawSegmentObject3D.matrixWorld;
  var points = [];
  var badSegs = [];
  for (var i = 0; i < segmentIndices.length; i++) {
    var si = segmentIndices[i];
    var vis = segToVertIndices[si];
    if (vis) {
      for (var vi = 0; vi < vis.length; vi++) {
        points.push(GeometryUtil.getGeometryVertex(geom, vis[vi], worldMatrix));
      }
    } else {
      badSegs.push(si);
    }
  }
  if (opts.warn && badSegs.length) {
    console.error('No vertices for ' + badSegs.length + ' segments', badSegs);
  }
  return points;
};

VertexSegmentedObject3DWrapper.prototype.forSegmentVertices = function (segmentIndices, fn) {
  this.rawSegmentObject3D.updateMatrixWorld();
  var segToVertIndices = this.rawSegmentObject3D.userData.segToVertIndices;
  var geom = this.rawSegmentObject3D.geometry;
  var worldMatrix = this.rawSegmentObject3D.matrixWorld;
  var badSegs = [];
  for (var i = 0; i < segmentIndices.length; i++) {
    var si = segmentIndices[i];
    var vis = segToVertIndices[si];
    if (vis) {
      for (var vi = 0; vi < vis.length; vi++) {
        var v = GeometryUtil.getGeometryVertex(geom, vis[vi], worldMatrix);
        var stop = fn(v);
        if (stop) { return false; }
      }
    } else {
      badSegs.push(si);
    }
  }
  if (badSegs.length) {
    console.error('No vertices for ' + badSegs.length + ' segments', badSegs);
  }
  return true;
};

VertexSegmentedObject3DWrapper.prototype.segmentHasPointInOBB = function (segmentIndex, obb) {
  var allOutside = this.forSegmentVertices([segmentIndex], function(p) {
    return obb.isPointContained(p);
  });
  return !allOutside;
  // var points = this.getRawSegmentVertices([segmentIndex]);
  // for (var i = 0; i < points.length; i++) {
  //   if (obb.isPointContained(points[i])) {
  //     return true;
  //   }
  // }
  // return false;
};

/**
 * Color one segment a specific color
 * @param mesh Mesh with segments
 * @param segmentIndex index of segment to color
 * @param color
 */
VertexSegmentedObject3DWrapper.prototype.colorSegment = function(mesh, segmentIndex, color) {
  mesh = mesh || this.rawSegmentObject3D;
  if (color) {
    color = (color instanceof THREE.Color)? color : color.color;
  }
  var vertices = mesh.userData.segToVertIndices[segmentIndex];
  if (vertices) {
    mesh.userData.segColors[segmentIndex].set(color);
    //// make sure vertices have same segment color
    this.__colorVertices(mesh, vertices, color);
    var geometry = mesh.geometry;
    geometry.colorsNeedUpdate = true;
    geometry.elementsNeedUpdate = true;
  }
};

/**
 * Colors all raw segments the same color!
 * @param color
 */
VertexSegmentedObject3DWrapper.prototype.colorSegments = function(color) {
  var mesh = this.rawSegmentObject3D;
  if (color) {
    color = (color instanceof THREE.Color)? color : color.color;
  }
  var segColors = mesh.userData.segColors;
  for (var i in segColors) {
    if (segColors.hasOwnProperty(i)) {
      segColors[i].set(color);
      var vertices = mesh.userData.segToVertIndices[i];
      this.__colorVertices(mesh, vertices, color);
    }
  }
  var geometry = mesh.geometry;
  geometry.colorsNeedUpdate = true;
  geometry.elementsNeedUpdate = true;
};

/**
 * Colors all raw segments original color
 */
VertexSegmentedObject3DWrapper.prototype.colorSegmentsOriginal = function(origObject3D) {
  var mesh = this.rawSegmentObject3D;
  var geometry = mesh.geometry;
  if (geometry instanceof THREE.BufferGeometry) {
    var origMeshes = Object3DUtil.getMeshList(origObject3D);
    // Assumes just one mesh
    var origMesh = origMeshes[0];
    if (origMesh.geometry.attributes.color) {
      geometry.attributes.color.array.set(origMesh.geometry.attributes.color.array);
    } else {
      console.log('No vertex color information');
    }
  }
  geometry.colorsNeedUpdate = true;
  geometry.elementsNeedUpdate = true;
};

VertexSegmentedObject3DWrapper.prototype.__colorVertices = function(mesh, vertices, c) {
  var geometry = mesh.geometry;
  if (geometry instanceof THREE.BufferGeometry) {
    var vcolors = geometry.attributes.color.array;
    for (var v = 0; v < vertices.length; v++) {
      var vi = vertices[v];
      var i = vi*3;
      vcolors[i] = c.r;
      vcolors[i+1] = c.g;
      vcolors[i+2] = c.b;
    }
    geometry.attributes.color.needsUpdate = true;
  }
};

module.exports = VertexSegmentedObject3DWrapper;
