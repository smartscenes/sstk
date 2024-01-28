var GeometryUtil = require('geo/GeometryUtil');
var Object3DUtil = require('geo/Object3DUtil');
var SegmentationUtil = require('geo/seg/SegmentationUtil');
var _ = require('util/util');

// TODO: Make this just a Object3D
// Object3D that tracks vertex to segment, and segment to vertex
function SegmentedObject3DWrapper(object3D, elementType, elemToSegIndices, color) {
  this.elementType = SegmentationUtil.getCanonicalizedElementType(elementType);
  if (this.elementType === SegmentationUtil.ELEMENT_TYPES.TRIANGLES) {
    this.elementStride = 3; // number of vertices each element correspond to
    this.isTriSegments = true;
    this.isVertSegments = false;
  } else if (this.elementType === SegmentationUtil.ELEMENT_TYPES.VERTICES) {
    this.elementStride = 1; // number of vertices each element correspond to
    this.isTriSegments = false;
    this.isVertSegments = true;
  } else {
    throw 'Unsupported elementType: ' + this.elementType;
  }
  // Note that we make a copy of the original object3D
  // when we do so the vertices and triangle indices may changes
  // however for the segmentation to remain faithful, we assume that specified segmentation applies for
  // both the original and cloned object3D.  This is not guaranteed fo the other one.
  // So if it is a segmentation over triangles, then the vertex indices may have changes (this can happen if we go form index to nonindex or vice versa)
  // and if it is a segmentation over vertices, then the triangle indices may have changed (although there is less reason for this to happen)
  this.origObject3D = object3D;
  this.rawSegmentObject3D = __copyAndRecolorVertices(object3D, elemToSegIndices, this.elementStride, color);
  var segToElemIndices = SegmentationUtil.groupElemToSegIndicesBySeg(elemToSegIndices);
  this.useGeomIndex = this.elementStride > 1 && this.rawSegmentObject3D.geometry.index;
  this.rawSegmentObject3D.userData.segElementType = this.elementType;
  this.rawSegmentObject3D.userData.isTriSegments = this.isTriSegments;
  this.rawSegmentObject3D.userData.isVertSegments = this.isVertSegments;
  this.rawSegmentObject3D.userData.elemToSegIndices = elemToSegIndices;
  this.rawSegmentObject3D.userData.segToElemIndices = segToElemIndices;
}

Object.defineProperty(SegmentedObject3DWrapper.prototype, 'elemToSegIndices', {
  get: function () { return this.rawSegmentObject3D.userData.elemToSegIndices; }
});

Object.defineProperty(SegmentedObject3DWrapper.prototype, 'segToElemIndices', {
  get: function () { return this.rawSegmentObject3D.userData.segToElemIndices; }
});

function __copyAndRecolorVertices(object3D, elemToSegIndices, elemStride, color) {
  // Go over segment groups
  var meshes = Object3DUtil.getMeshList(object3D);
  var geometry;
  var matrixWorld;
  if (meshes.length > 1) {
    console.warn('Creating merged mesh.  Not tested.');
    var mesh = GeometryUtil.mergeMeshes(meshes);
    geometry = mesh.geometry;
    matrixWorld = mesh.matrixWorld;
  } else {
    geometry = meshes[0].geometry.clone();
    matrixWorld = meshes[0].matrixWorld;
  }
  if (this.isTriSegments) {
    // Note make the geometry non-indexed so that vertices for triangles are not shared
    // this is not good for some methods (such as the connectivity graph, that assumes vertices are shared)
    geometry = GeometryUtil.toNonIndexed(geometry);
  }
  var geometryWithColors = __createColoredGeometry(geometry, elemToSegIndices, elemStride, color);
  var colors = geometryWithColors.colors;

  var material = new THREE.MeshPhongMaterial({ vertexColors: true });
  var recolored = new THREE.Mesh(geometry, material);
  recolored.name = object3D.name + '-recolored';
  recolored.userData.segColors = colors;
  Object3DUtil.setMatrix(recolored, matrixWorld);
  return recolored;
}

//  elemToSegIndices is a mapping of element index to a mapped segment index, negative segment indices are not used
function __createColoredGeometry(geometry, elemToSegIndices, elemStride, color) {
  var gray = new THREE.Color(0.5, 0.5, 0.5);
  var colors = [];
  function getColor(vi) {
    var ei = Math.floor(vi/elemStride);
    var si = elemToSegIndices[ei];
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
  geometry.computeVertexNormals();
  return { geometry: geometry, colors: colors };
}

SegmentedObject3DWrapper.prototype.getTriToSegIndices = function(useOrig) {
  if (this.isTriSegments) {
    return this.elemToSegIndices;
  } else {
    return SegmentationUtil.convertVertToSegIndices2FaceToSegIndices(useOrig? this.origObject3D : this.rawSegmentObject3D, this.elemToSegIndices);
  }
};

SegmentedObject3DWrapper.prototype.getSegToTriIndices = function(useOrig) {
  if (this.isTriSegments) {
    return this.segToElemIndices;
  } else {
    var triToSegIndices = this.getTriToSegIndices(useOrig);
    return SegmentationUtil.groupElemToSegIndicesBySeg(triToSegIndices);
  }
};

SegmentedObject3DWrapper.prototype.getTriIndicesForSegs = function(segmentIndices) {
  if (!this.segToTriIndices) {
    this.segToTriIndices = this.getSegToTriIndices(false);
  }
  if (Array.isArray(segmentIndices)) {
    return _.flatten(segmentIndices.map(segIndex => this.segToTriIndices[segIndex]));
  } else {
    return this.segToTriIndices[segmentIndices];
  }
};

SegmentedObject3DWrapper.prototype.getVertIndicesForSegs = function(segmentIndices) {
  var rawSegmentObject3D = this.rawSegmentObject3D;
  var segToElemIndices = rawSegmentObject3D.userData.segToElemIndices;
  var verts = [];
  for (var i = 0; i < segmentIndices.length; i++) {
    var si = segmentIndices[i];
    var eis = segToElemIndices[si];
    if (eis) {
      GeometryUtil.getVertIndicesForElemIndices(this.rawSegmentObject3D, eis, this.elementStride, this.useGeomIndex, verts);
    }
  }
};

SegmentedObject3DWrapper.prototype.getVertIndicesForTris = function(triIndices) {
  return GeometryUtil.getVertIndicesForTriIndices(this.rawSegmentObject3D, triIndices);
};

SegmentedObject3DWrapper.prototype.getSegmentElementsCount = function (segmentIndices) {
  var rawSegmentObject3D = this.rawSegmentObject3D;
  rawSegmentObject3D.updateMatrixWorld();
  var segToElemIndices = rawSegmentObject3D.userData.segToElemIndices;
  var n = 0;
  for (var i = 0; i < segmentIndices.length; i++) {
    var si = segmentIndices[i];
    var eis = segToElemIndices[si];
    if (eis) {
      n += eis.length;
    }
  }
  return n;
};

SegmentedObject3DWrapper.prototype.getSegmentVerticesCount = function (segmentIndices) {
  return this.getSegmentElementsCount(segmentIndices) * this.elementStride;
};

SegmentedObject3DWrapper.prototype.getSegmentVertices = function (segmentIndices, opts) {
  opts = opts || {};
  var rawSegmentObject3D = this.rawSegmentObject3D;
  rawSegmentObject3D.updateMatrixWorld();
  var segToElemIndices = rawSegmentObject3D.userData.segToElemIndices;
  var geom = rawSegmentObject3D.geometry;
  var worldMatrix = rawSegmentObject3D.matrixWorld;
  var points = [];
  var badSegs = [];
  for (var i = 0; i < segmentIndices.length; i++) {
    var si = segmentIndices[i];
    var eis = segToElemIndices[si];
    if (eis) {
      for (var e = 0; e < eis.length; e++) {
        var ei = eis[e];
        var viStart = ei*this.elementStride;
        for (var v = viStart; v < viStart + this.elementStride; v++) {
          var vi = (this.useGeomIndex)? geom.index[v] : v;
          points.push(GeometryUtil.getGeometryVertex(geom, vi, worldMatrix));
        }
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

/**
 * iterates over points until function return true
 * @param segmentIndices
 * @param fn
 * @returns {boolean}
 */
SegmentedObject3DWrapper.prototype.forSegmentVerticesUntil = function (segmentIndices, fn) {
  this.rawSegmentObject3D.updateMatrixWorld();
  var segToElemIndices = this.rawSegmentObject3D.userData.segToElemIndices;
  var badSegs = [];
  var pos = new THREE.Vector3();
  for (var i = 0; i < segmentIndices.length; i++) {
    var si = segmentIndices[i];
    var eis = segToElemIndices[si];
    if (eis) {
      var stop = GeometryUtil.forElemVerticesUntil(this.rawSegmentObject3D, eis, this.elementStride, this.useGeomIndex, fn, pos);
      if (stop) { return true; }
    } else {
      badSegs.push(si);
    }
  }
  if (badSegs.length) {
    console.error('No vertices for ' + badSegs.length + ' segments', badSegs);
  }
  return false;
};

SegmentedObject3DWrapper.prototype.trisHasPointInOBB = function (triIndices, obb) {
  // TODO: Update this for triangle / face based segmentation
  var hasPointInside = GeometryUtil.forTriVerticesUntil(this.rawSegmentObject3D, triIndices, function(p) {
    return obb.isPointContained(p);
  });
  return hasPointInside;
};

SegmentedObject3DWrapper.prototype.segmentHasPointInOBB = function (segmentIndex, obb) {
  // TODO: Update this for triangle / face based segmentation
  var segmentIndices = Array.isArray(segmentIndex)? segmentIndex : [segmentIndex];
  var hasPointInside = this.forSegmentVerticesUntil(segmentIndices, function(p) {
    return obb.isPointContained(p);
  });
  return hasPointInside;
};

SegmentedObject3DWrapper.prototype.trisIsContainedInOBB = function (triIndices, obb) {
  // TODO: Update this for triangle / face based segmentation
  var hasPointOutside = GeometryUtil.forTriVerticesUntil(this.rawSegmentObject3D, triIndices, function(p) {
    return !obb.isPointContained(p);
  });
  return !hasPointOutside;
};

SegmentedObject3DWrapper.prototype.segmentIsContainedInOBB = function (segmentIndex, obb) {
  // TODO: Update this for triangle / face based segmentation
  var segmentIndices = Array.isArray(segmentIndex)? segmentIndex : [segmentIndex];
  var hasPointOutside = this.forSegmentVerticesUntil(segmentIndices, function(p) {
    return !obb.isPointContained(p);
  });
  return !hasPointOutside;
};

/**
 * Color one segment a specific color
 * @param mesh Mesh with segments
 * @param segmentIndex index of segment to color
 * @param color
 */
SegmentedObject3DWrapper.prototype.colorSegment = function(mesh, segmentIndex, color) {
  mesh = mesh || this.rawSegmentObject3D;
  if (color) {
    color = (color instanceof THREE.Color)? color : color.color;
  }
  if (Array.isArray(segmentIndex)) {
    // allow for multiple segmentIndex
    for (var i = 0; i < segmentIndex.length; i++) {
      this.__colorSegment(mesh, segmentIndex[i], color);
    }
  } else {
    this.__colorSegment(mesh, segmentIndex, color);
  }
};

SegmentedObject3DWrapper.prototype.__colorSegment = function(mesh, segmentIndex, color) {
  var elements = mesh.userData.segToElemIndices[segmentIndex];
  if (elements) {
    mesh.userData.segColors[segmentIndex].set(color);
    //// make sure vertices have same segment color
    this.colorElems(elements, color);
    var geometry = mesh.geometry;
    geometry.colorsNeedUpdate = true;
    geometry.elementsNeedUpdate = true;
  }
};

/**
 * Colors all raw segments the same color!
 * @param color
 */
SegmentedObject3DWrapper.prototype.colorAllSegments = function(color) {
  var mesh = this.rawSegmentObject3D;
  if (color) {
    color = (color instanceof THREE.Color)? color : color.color;
  }
  var segColors = mesh.userData.segColors;
  for (var i in segColors) {
    if (segColors.hasOwnProperty(i)) {
      segColors[i].set(color);
      var elements = mesh.userData.segToElemIndices[i];
      this.colorElems(mesh, elements, color);
    }
  }
  var geometry = mesh.geometry;
  geometry.colorsNeedUpdate = true;
  geometry.elementsNeedUpdate = true;
};

/**
 * Colors all raw segments original color
 */
SegmentedObject3DWrapper.prototype.colorSegmentsOriginal = function(origObject3D) {
  var mesh = this.rawSegmentObject3D;
  var geometry = mesh.geometry;
  if (geometry.isBufferGeometry) {
    var origMeshes = Object3DUtil.getMeshList(origObject3D);
    if (origMeshes.length) {
      console.warn('Unsupported SegmentedObject3DWrapper.colorSegmentsOriginal for multiple meshes');
    }
    // Assumes just one mesh
    var origMesh = origMeshes[0];
    if (origMesh.geometry.attributes.color) {
      geometry.attributes.color.array.set(origMesh.geometry.attributes.color.array);
      geometry.attributes.color.needsUpdate = true;
    } else {
      console.log('No vertex color information');
    }
  }
  geometry.colorsNeedUpdate = true;
  geometry.elementsNeedUpdate = true;
};

SegmentedObject3DWrapper.prototype.colorTriVertices = function(triIndices, c) {
  GeometryUtil.colorTriVertices(this.rawSegmentObject3D, triIndices, c);
};

SegmentedObject3DWrapper.prototype.colorVertices = function(vertIndices, c) {
  GeometryUtil.colorElemVertices(this.rawSegmentObject3D, vertIndices, 1, false, c);
};

SegmentedObject3DWrapper.prototype.colorElems = function(elements, c) {
  GeometryUtil.colorElemVertices(this.rawSegmentObject3D, elements, this.elementStride, this.useGeomIndex, c);
};

module.exports = SegmentedObject3DWrapper;
