'use strict';

var Colors = require('util/Colors');
var _ = require('util/util');

// Patch THREE.Triangle with convenience function
if (!_.isFunction(THREE.Triangle.prototype.getVertex)) {
  THREE.Triangle.prototype.getVertex = function (i) {
    if (i === 0) { return this.a; }
    else if (i === 1) { return this.b; }
    else if (i === 2) { return this.c; }
  };
}

/**
 * Utility functions for geometry processing
 * @memberOf geo
 */
var GeometryUtil = {};

// GeometryUtil.saveGeometryVertices = function (object3D) {
//   // Save vertices away (used to compute bounding boxes)
//   object3D.traverse(function (node) {
//     if (node instanceof THREE.Mesh) {
//       if (node.geometry instanceof THREE.BufferGeometry) {
//         node.geometry.verticesArray = node.geometry.attributes['position'].array;
//       }
//     }
//   });
// };

GeometryUtil.triangleNormal = (function () {
  var edge1 = new THREE.Vector3();
  var edge2 = new THREE.Vector3();
  return function (va, vb, vc, normal) {
    normal = normal || new THREE.Vector3();
    edge1.subVectors(vb, va).normalize();
    edge2.subVectors(vc, va).normalize();
    normal.crossVectors(edge1, edge2).normalize();
    return normal;
  };
}());

GeometryUtil.triangleArea = (function () {
  var vector1 = new THREE.Vector3();
  var vector2 = new THREE.Vector3();
  return function (va, vb, vc) {
    vector1.subVectors(vb, va);
    vector2.subVectors(vc, va);
    vector1.cross(vector2);
    return 0.5 * vector1.length();
  };
}());

GeometryUtil.triangleAreaWithTransform = (function () {
  var v1 = new THREE.Vector3();
  var v2 = new THREE.Vector3();
  var v3 = new THREE.Vector3();
  var vector1 = new THREE.Vector3();
  var vector2 = new THREE.Vector3();
  return function (va, vb, vc, transform) {
    va = v1.copy(va).applyMatrix4(transform);
    vb = v2.copy(vb).applyMatrix4(transform);
    vc = v3.copy(vc).applyMatrix4(transform);
    vector1.subVectors(vb, va);
    vector2.subVectors(vc, va);
    vector1.cross(vector2);
    return 0.5 * vector1.length();
  };
}());

/**
 * Colors vertices
 * @param geometry {THREE.Geometry|THREE.BufferGeometry} Geometry to color
 * @param color {THREE.Color} Color to given vertices
 * @param [vertices] {int[]} Array of vertex indices (all vertices are recolored if not specified)
 * @param alpha {float} Blend original color with specified color (alpha = amount of original color to use)
 */
GeometryUtil.colorVertices = function(geometry, color, vertices, alpha) {
  if (geometry instanceof THREE.Geometry) {
    if (vertices) {
      console.error('colorVertices for a specific subset of vertices not supported for THREE.Geometry');
    } else {
      var nfaces = GeometryUtil.getGeometryFaceCount(geometry);
      for (var i = 0; i < nfaces; i++) {
        var face = geometry.faces[i];
        face.vertexColors = [color, color, color];
      }
      geometry.colorsNeedUpdate = true;
    }
  } else if (geometry instanceof THREE.BufferGeometry) {
    var vcolors = geometry.attributes.color.array;
    // A set
    if (vertices) {
      for (var v = 0; v < vertices.length; v++) {
        var vi = vertices[v];
        var i = vi*3;
        if (alpha != null) {
          vcolors[i] = vcolors[i]*alpha + (1-alpha)*color.r;
          vcolors[i + 1] = vcolors[i+1]*alpha + (1-alpha)*color.g;
          vcolors[i + 2] = vcolors[i+2]*alpha + (1-alpha)*color.b;
        } else {
          vcolors[i] = color.r;
          vcolors[i + 1] = color.g;
          vcolors[i + 2] = color.b;
        }
      }
    } else {
      for (var i = 0; i < vcolors.length; i+=3) {
        if (alpha != null) {
          vcolors[i] = vcolors[i]*alpha + (1-alpha)*color.r;
          vcolors[i + 1] = vcolors[i+1]*alpha + (1-alpha)*color.g;
          vcolors[i + 2] = vcolors[i+2]*alpha + (1-alpha)*color.b;
        } else {
          vcolors[i] = color.r;
          vcolors[i + 1] = color.g;
          vcolors[i + 2] = color.b;
        }
      }
    }
    geometry.attributes.color.needsUpdate = true;
  } else {
    console.error('colorVertices not supported for geometry', geometry);
  }
};

/**
 * Colors vertices
 * @param geometry {THREE.Geometry|THREE.BufferGeometry} Geometry to color
 * @param colorFn {function(vertex)} Function that returns color to vertex
 * @param [vertices] {int[]} Array of vertex indices (all vertices are recolored if not specified)
 */
GeometryUtil.colorVerticesUsingFunction = function(geometry, colorFn, vertices, transform) {
  if (geometry instanceof THREE.BufferGeometry) {
    //console.log('color vertices with function');
    var pos = geometry.attributes['position'].array;
    var vcolors = geometry.attributes.color.array;
    var v = new THREE.Vector3();
    function getVertex(s) {
      v.set(pos[s], pos[s + 1], pos[s + 2]);
      if (transform) {
        v.applyMatrix4(transform);
      }
      return v;
    }

    // A set
    if (vertices) {
      for (var v = 0; v < vertices.length; v++) {
        var vi = vertices[v];
        var i = vi*3;
        var color = colorFn(getVertex(i));
        vcolors[i] = color.r;
        vcolors[i+1] = color.g;
        vcolors[i+2] = color.b;
      }
    } else {
      for (var i = 0; i < vcolors.length; i+=3) {
        var color = colorFn(getVertex(i));
        vcolors[i] = color.r;
        vcolors[i+1] = color.g;
        vcolors[i+2] = color.b;
      }
    }
    geometry.attributes.color.needsUpdate = true;
  } else {
    console.error('GeometryUtil.colorVerticesUsingFunction not supported for geometry');
  }
};

/**
 * Grays out vertices that are maxRadius away from the center point
 * @param mesh {THREE.Mesh} Mesh to color (requires mesh.geometry be THREE.BufferGeometry)
 * @param center {THREE.Vector3} - Center point (not grayed out)
 * @param maxRadius {number} - Distance from center at which everything is grayed out
 * @param [grayColor=gray] {THREE.Color} Color to use for gray out
 */
GeometryUtil.grayOutVertices = function(mesh, center, maxRadius, grayColor) {
  if (!(mesh.geometry instanceof THREE.BufferGeometry)) {
    console.error('grayOutVertices not supported if not BufferGeometry', mesh.geometry);
    return;
  }
  if (grayColor == undefined) { grayColor = 'gray'; }
  grayColor = Colors.toColor(grayColor);
  var currColor = new THREE.Color();
  var rSq = maxRadius*maxRadius;
  var geometry = mesh.geometry;
  var vcolors = geometry.attributes.color.array;
  GeometryUtil.forMeshVertices(mesh, function(p, attributes) {
    var distanceSq = center.distanceToSquared(p);
    var grayRatio = _.clamp(distanceSq/rSq, 0, 1);
    currColor.fromArray(attributes[0]);
    var c = Colors.interpolateColor(currColor, grayColor, { weight: grayRatio });
    var vi = attributes[1];
    var i = vi*3;
    vcolors[i] = c.r;
    vcolors[i+1] = c.g;
    vcolors[i+2] = c.b;
  }, [{name: 'color', stride: 3}, {name: 'index'}]);
  geometry.attributes.color.needsUpdate = true;
};

GeometryUtil.colorCylinderVertices = function(geometry, color1, color2) {
  if (geometry instanceof THREE.Geometry) {
    var nfaces = GeometryUtil.getGeometryFaceCount(geometry);
    var verts = geometry.vertices;
    for (var i = 0; i < nfaces; i++) {
      var face = geometry.faces[i];
      var ys = [verts[face.a].y, verts[face.b].y, verts[face.c].y];
      face.vertexColors = ys.map(function(x) { return x < 0? color1 : color2; });
    }
    geometry.colorsNeedUpdate = true;
  } else {
    console.log('colorCylinderVertices not supported for geometry', geometry);
  }
};

GeometryUtil.getGeometryVertexCount = function (geometry) {
  var verts = geometry.vertices;
  if (verts) {
    return verts.length;
  } else if (geometry instanceof THREE.BufferGeometry) {
    var pos = geometry.attributes['position'].array;
    if (pos) {
      return pos.length / 3;
    } else {
      console.warn('No vertices for BufferedGeometry');
    }
  } else {
    //console.warn('No vertices for geometry');
  }
  return 0;
};

GeometryUtil.copyGeometryVertex = function (vertex, geometry, index) {
  var verts = geometry.vertices;
  if (verts) {
    vertex.copy(verts[index]);
  } else if (geometry instanceof THREE.BufferGeometry) {
    var pos = geometry.attributes['position'].array;
    if (pos) {
      var s = index * 3;
      vertex.set(pos[s], pos[s + 1], pos[s + 2]);
    } else {
      console.warn('No vertices for BufferedGeometry');
    }
  } else {
    //console.warn('No vertices for geometry');
  }
};

GeometryUtil.getGeometryVertex = function (geometry, index, transform, out) {
  var v = out || new THREE.Vector3();
  GeometryUtil.copyGeometryVertex(v, geometry, index);
  if (transform) {
    v.applyMatrix4(transform);
  }
  return v;
};

// Convert vertices to world coordinates
GeometryUtil.forMeshVertices = function (mesh, callback, attributes, checkExit) {
  var transform = mesh.matrixWorld;
  return GeometryUtil.forMeshVerticesWithTransform(mesh, callback, transform, attributes, checkExit);
};

GeometryUtil.forMeshVerticesWithTransform = function (mesh, callback, transform, attributes, checkExit) {
  //Basic logic (rolled out for performance)
  //var v = new THREE.Vector3();
  //var nVerts = GeometryUtil.getGeometryVertexCount(mesh.geometry);
  //for(var i=0; i<nVerts; i++) {
  //   GeometryUtil.copyGeometryVertex(v, mesh.geometry, i);
  //   v.applyMatrix4(mesh.matrixWorld);
  //   callback(v);
  //}

  var v = new THREE.Vector3();
  var normal = new THREE.Vector3();
  var normalMatrix;
  if (transform) {
    normalMatrix = new THREE.Matrix3().getNormalMatrix(transform);
  }

  function getMaterialOrVertexColor(material, vc) {
    // TODO: Figure out color here...
    if (material.vertexColors === THREE.VertexColors && vc) {
      return vc;
    } else if (material.color) {
      var v = material.color;
      return [v.r, v.g, v.b];
    } else {
      return null;
    }
  }

  var geometry = mesh.geometry;
  //console.log(geometry);
  // TODO: geometry sometimes also have customVertexAttributes
  if (geometry) {
    var verts = geometry.vertices;
    if (verts) {
      for (var i = 0; i < verts.length; i++) {
        v.copy(verts[i]);
        if (transform) {
          v.applyMatrix4(transform);
        }
        if (attributes) {
          var values = [];
          for (var j = 0; j < attributes.length; j++) {
            var a = attributes[j];
            var attrValue = null;
            if (a.name === 'color') {
              attrValue = getMaterialOrVertexColor(mesh.material, attrValue);
            } else if (a.name === 'index') {
              attrValue = i;
            }
            if (attrValue == undefined) {
              if (mesh.userData.vertexAttributes && mesh.userData.vertexAttributes[a.name]) {
                attrValue = mesh.userData.vertexAttributes[a.name][i];
              }
            }
            if (attrValue == undefined) {
              if (mesh.userData.attributes) {
                attrValue = mesh.userData.attributes[a.name];
              }
            }
            values.push(attrValue);
          }
          callback(v, values);
        } else {
          callback(v);
        }
        if (checkExit && checkExit()) {
          break;
        }
      }
    } else if (geometry instanceof THREE.BufferGeometry) {
      var pos = geometry.attributes['position'].array;
      if (pos) {
        for (var s = 0, vi = 0; s < pos.length; s += 3, vi++) {
          v.set(pos[s], pos[s + 1], pos[s + 2]);
          if (transform) {
            v.applyMatrix4(transform);
          }
          if (attributes) {
            var values = [];
            for (var j = 0; j < attributes.length; j++) {
              var a = attributes[j];
              var attr = geometry.attributes[a.name];
              var attrValue = null;
              if (attr) {
                attrValue = attr.array.slice(vi * a.stride, (vi + 1) * a.stride);
                if (a.name === 'normal' && transform) {  // apply rotation to normal
                  var n = attrValue;
                  normal.set(n[0], n[1], n[2]);
                  normal.applyMatrix3(normalMatrix);
                  normal.normalize();
                  attrValue = [normal.x, normal.y, normal.z];
                }
              }
              if (a.name === 'color') {
                attrValue = getMaterialOrVertexColor(mesh.material, attrValue);
              } else if (a.name === 'index') {
                attrValue = vi;
              }
              if (attrValue == undefined) {
                if (mesh.userData.vertexAttributes && mesh.userData.vertexAttributes[a.name]) {
                  attrValue = mesh.userData.vertexAttributes[a.name][vi];
                }
              }
              if (attrValue == undefined) {
                if (mesh.userData.attributes) {
                  attrValue = mesh.userData.attributes[a.name];
                }
              }
              values.push(attrValue);
            }
            callback(v, values);
          } else {
            callback(v);
          }
          if (checkExit && checkExit()) {
            break;
          }
        }
      } else {
        console.warn('No vertices for BufferedGeometry');
      }
    } else {
      //console.warn('No vertices for geometry');
    }
  }
};

GeometryUtil.forFaceVerticesWithTransform = function (geometry, transform, callback) {
  GeometryUtil.forFaceVertexIndices(geometry, function (iFace, vIndices) {
    var v0 = GeometryUtil.getGeometryVertex(geometry, vIndices[0], transform);
    var v1 = GeometryUtil.getGeometryVertex(geometry, vIndices[1], transform);
    var v2 = GeometryUtil.getGeometryVertex(geometry, vIndices[2], transform);
    callback(v0, v1, v2, iFace);
  });
};

GeometryUtil.getVertices = function (root, verts) {
  var result = verts || [];
  root.updateMatrixWorld();
  if (root instanceof THREE.Mesh || root instanceof THREE.Line) {
    GeometryUtil.forMeshVertices(root, function (v) {
      result.push(v.clone());
    });
  }
  if (root.children) {
    for (var i = 0; i < root.children.length; i++) {
      GeometryUtil.getVertices(root.children[i], result);
    }
  }
  return result;
};

GeometryUtil.getGeometryFaceCount = function (geometry) {
  var faces = geometry.faces;
  if (faces) {
    return faces.length;
  } else {
    // No faces - assume triangles, divide number of vertices by 3
    var nVerts = GeometryUtil.getGeometryVertexCount(geometry);
    // Get actual number of vertices (indices)
    if (geometry.indices) {
      nVerts = geometry.indices.length;
    } else if (geometry instanceof THREE.BufferGeometry && geometry.index) {
      nVerts = geometry.index.array.length;
     }
    return nVerts / 3;
  }
};

GeometryUtil.getMaterialGroups = function(geometry) {
  if (geometry.groups) {
    return geometry.groups;
  } else if (geometry instanceof THREE.Geometry) {
    var groups = [];
    for (var i = 0; i < geometry.faces.length; i++) {
      var materialIndex = geometry.faces[i].materialIndex;
      groups[materialIndex] = groups[materialIndex] || { count: 0, materialIndex: materialIndex };
      groups[materialIndex].count+=3;
    }
    return groups;
  } else {
    return null;
  }
};

// TODO: dedup with triangleNormal
GeometryUtil.computeFaceNormal = function (vA, vB, vC) {
  var cb = new THREE.Vector3(), ab = new THREE.Vector3();
  cb.subVectors( vC, vB );
  ab.subVectors( vA, vB );
  cb.cross( ab );
  cb.normalize();
  return cb;
};

GeometryUtil.getSurfaceArea = function (geometry, transform) {
  var area = 0;
  GeometryUtil.forFaceVerticesWithTransform(geometry, transform, function (v0, v1, v2, iFace) {
    area += GeometryUtil.triangleArea(v0, v1, v2);
  });
  return area;
};

GeometryUtil.getSurfaceAreaFiltered = function (geometry, transform, filter) {
  var area = 0;
  GeometryUtil.forFaceVerticesWithTransform(geometry, transform, function (v0, v1, v2, iFace) {
    if (!filter || filter(v0, v1, v2, iFace)) {
      area += GeometryUtil.triangleArea(v0, v1, v2);
    }
  });
  return area;
};

GeometryUtil.getFaceMaterialIndex = function (geometry, iface) {
  // Assumes faces are basically triangles
  if (geometry.faces) {
    return geometry.faces[iface].materialIndex;
  } else if (geometry.groups) {
    var iv = iface*3;
    var group = _.find(geometry.groups, function (g) {
      return (iv >= g.start) && (iv < g.start + g.count);
    });
    return group? group.materialIndex : 0;
  } else {
    return 0;
  }
};

GeometryUtil.getFaceVertexIndices = function (geometry, iface) {
  // Assumes faces are basically triangles
  var faces = geometry.faces;
  if (faces) {
    var face = faces[iface];
    if (face instanceof THREE.Face3) {
      return [face.a, face.b, face.c];
    } else if (face instanceof THREE.Face4) {
      return [face.a, face.b, face.c, face.d];
    }
  } else if (geometry.indices) {
    var j = iface*3;
    var indices = geometry.indices;
    return [indices[j], indices[j + 1], indices[j + 2]];
  } else if (geometry instanceof THREE.BufferGeometry) {
    if (geometry.index) {
      var j = iface*3;
      var indices = geometry.index.array;
      return [indices[j], indices[j + 1], indices[j + 2]];
    } else if (geometry.attributes['position']) {
      var j = iface * 3;
      return [j, j + 1, j + 2];
    }
  }
};

GeometryUtil.forFaceVertexIndices = function (geometry, callback, attributes) {
  // Assumes faces are basically triangles
  var nfaces = GeometryUtil.getGeometryFaceCount(geometry);
  if (nfaces == 0) {
    console.warn('No faces found for geometry', geometry);
    return;
  }

  if (geometry.customFaceAttributes && attributes) {
    var cb = callback;
    var faceattrs = geometry.customFaceAttributes;
    //console.log(attributes, _.keys(faceattrs));
    callback = function(iface, verts) {
      var values = [];
      for (var j = 0; j < attributes.length; j++) {
        var a = attributes[j];
        var attrValue = faceattrs[a.name][iface];
        values.push(attrValue);
      }
      cb(iface, verts, values);
    };
  }

  var faces = geometry.faces;
  if (faces) {
    for (var i = 0; i < nfaces; i++) {
      var face = faces[i];
      if (face instanceof THREE.Face3) {
        callback(i, [face.a, face.b, face.c]);
      } else if (face instanceof THREE.Face4) {
        callback(i, [face.a, face.b, face.c, face.d]);
      }
    }
  } else if (geometry.indices) {
    var indices = geometry.indices;
    for (var i=0, j=0; i < nfaces; i++, j+=3) {
      callback(i, [indices[j], indices[j + 1], indices[j + 2]]);
    }
  } else if (geometry instanceof THREE.BufferGeometry) {
    if (geometry.index) {
      var indices = geometry.index.array;
      for (var i=0, j=0; i < nfaces; i++, j+=3) {
        callback(i, [indices[j], indices[j + 1], indices[j + 2]]);
      }
    } else if (geometry.attributes['position']) {
      for (var i=0, j=0; i < nfaces; i++, j+=3) {
        callback(i, [j, j+1, j+2]);
      }
    }
  }
};
// Utility functions
function createCropped(arrayType, nVerts, croppedToOrigIndex, origArray, stride) {
  var attrs = new arrayType(nVerts * stride);
  // Crops all entries unrelated to cropped
  var k = 0;
  for (var vi = 0; vi < nVerts; vi++) {
    var ovi = croppedToOrigIndex[vi];
    var start = stride * ovi;
    for (var j = 0; j < stride; j++) {
      if (start + j >= origArray.length) {
        console.warn('Invalid access of index at ' + (start+j));
      }
      attrs[k] = origArray[start + j];
      k++;
    }
  }
  return attrs;
}

function createCroppedFloat32(nVerts, croppedToOrigIndex, origArray, itemSize) {
  var attrs = createCropped(Float32Array, nVerts, croppedToOrigIndex, origArray, itemSize);
  return new THREE.BufferAttribute(attrs, itemSize);
}

function buildIndexMap(triIndices, origVertIndices) {
  // build up map of cropped vertex index to original vertex index and vs
  var nCropped = 0;
  var croppedToOrig = {}; //new Uint32Array(triIndices.length*3);
  var origToCropped = {}; //new Uint32Array(origVertIndices.length);
  for (var i in triIndices) {
    if (triIndices.hasOwnProperty(i)) {
      var s = triIndices[i]*3;
      for (var j = 0; j < 3; j++) {
        var ovi = origVertIndices ? origVertIndices[s + j] : (s + j);
        if (origToCropped[ovi] == undefined) {
          origToCropped[ovi] = nCropped;
          croppedToOrig[nCropped] = ovi;
          nCropped++;
        }
      }
    }
  }
  return {croppedToOrig: croppedToOrig, origToCropped: origToCropped, nCropped: nCropped};
}

function createCroppedIndexBuffer(triIndices, origVertIndices, map) {
  // Allocate
  var itemSize = 1;
  var nVerts = map.nCropped;
  var indexSize = triIndices.length * 3 * itemSize;
  var index = (nVerts < 65536) ?
      new Uint16Array(indexSize) : new Uint32Array(indexSize);
  // Populate
  var origToCroppedIndex = map.origToCropped;
  var k = 0;
  for (var i in triIndices) {
    if (triIndices.hasOwnProperty(i)) {
      var s = triIndices[i]*3;
      for (var j = 0; j < 3; j++) {
        var ovi = origVertIndices ? origVertIndices[s + j] : (s + j);
        index[k] = origToCroppedIndex[ovi];
        k++;
      }
    }
  }
  return new THREE.BufferAttribute(index, itemSize);
}

GeometryUtil.extractMesh = function (mesh, triIndices, keepMaterialGroups) {
  triIndices = _.sortBy(triIndices, x => x);
  //console.log('extractMesh ' + mesh.name + ' with ' + triIndices.length + ' triangles')
  //console.time('extractMesh');
  // Remesh with specific triangles
  var origGeom = mesh.__bufferGeometry || GeometryUtil.toBufferGeometry(mesh.geometry);
  mesh.__bufferGeometry = origGeom;
  var myGeometry = new THREE.BufferGeometry();

  // Set attributes for the new geometry to only include
  // triangles from surface.triIndex
  var origAttrs = origGeom.attributes;
  // If undefined, index is consecutive
  var origIndexArray = (origGeom.index) ? origGeom.index.array : undefined;

  //console.time('buildIndexMap');
  var indexMap = buildIndexMap(triIndices, origIndexArray);
  //console.timeEnd('buildIndexMap');
  myGeometry.setIndex(createCroppedIndexBuffer(triIndices, origIndexArray, indexMap));
  var attrs = [
    { name: 'position', size: 3 },
    { name: 'normal', size: 3 },
    { name: 'uv', size: 2 },
    { name: 'uv2', size: 2 },
    { name: 'color', size: 3 }
  ];
  for (var i = 0; i < attrs.length; i++) {
    var attr = attrs[i];
    if (origAttrs[attr.name]) {
      myGeometry.setAttribute(attr.name, createCroppedFloat32(
        indexMap.nCropped, indexMap.croppedToOrig,
        origAttrs[attr.name].array, attr.size));
    }
  }

  // Set non-attributes for new geometry
  var newIndexLength = myGeometry.index.array.length;
  var myMaterial = null;
  //console.log('keepMaterialGroups', keepMaterialGroups);
  if (keepMaterialGroups && origGeom.groups.length > 1) {
    var groups = _.cloneDeep(origGeom.groups);
    //console.log('groups1', groups);
    _.forEach(groups, function(g) { g.count = 0; });
    for (var i = 0; i < triIndices.length; i++) {
      var iv = triIndices[i]*3;
      var gi = origGeom.groups.findIndex(function (g) {
        return (iv >= g.start) && (iv < g.start + g.count);
      });
      if (gi < 0) {
        gi = 0;
      }
      groups[gi].count+=3;
    }
    var hasExtraMaterials = false;
    var start = 0;
    for (var i = 0; i < groups.length; i++) {
      var group = groups[i];
      group.start = start;
      start += group.count;
      if (group.count === 0) {
        hasExtraMaterials = true;
      }
    }

    if (hasExtraMaterials) {
      // Trim extra materials
      var trimmedGroups = [];
      var materials = [];
      var origMaterial  = (mesh.material instanceof THREE.MultiMaterial)?
        mesh.material.materials : mesh.material;
      for (var i = 0; i < groups.length; i++) {
        var group = groups[i];
        if (group.count > 0) {
          group.materialIndex = materials.length;
          trimmedGroups.push(group);
          if (Array.isArray(origMaterial)) {
            materials.push(origMaterial[i]);
          } else {
            materials.push(origMaterial);
          }
        }
      }
      groups = trimmedGroups;
      myMaterial = new THREE.MultiMaterial(materials);
      //console.log('Trimmed materials')
    }

    myGeometry.groups = groups;
    //console.log('groups2', groups);
  } else {
    myGeometry.groups[0] = {start: 0, count: newIndexLength, materialIndex: 0};   //very important!
  }
  //myGeometry.verticesArray = myGeometry.attributes['position'].array;
  myGeometry.computeBoundingSphere();

  // Make new mesh
  var myMesh = mesh.clone();
  myMesh.geometry = myGeometry;
  if (myMaterial) {
    myMesh.material = myMaterial;
  }
  //console.timeEnd('extractMesh');
  return myMesh;
};

GeometryUtil.vertIndicesToTriIndices = function (mesh, vertIndices) {
  // NOTE: maybe buggy...
  // Make vertIndices to be a set
  var vertIndicesSet = {};
  for (var i = 0; i < vertIndices.length; i++) {
    vertIndicesSet[vertIndices[i]] = 1;
  }

  function vertIncludes(a, b, c) {
    return vertIndicesSet[a] || vertIndicesSet[b] || vertIndicesSet[c];
  }

  // Convert from vertIndices to triIndices
  var triIndices = [];

  // Get triangle indices
  var origGeom = mesh.geometry;
  if (origGeom instanceof THREE.BufferGeometry) {
    var indexArray = (origGeom.index) ? origGeom.index.array : undefined;
    if (indexArray) {
      var nTris = 0;
      for (var i = 0; i < indexArray.length; i += 3) {
        // Check if all indices are in our vertIndices, if so add triIndex
        if (vertIncludes(indexArray[i], indexArray[i + 1], indexArray[i + 2])) {
          triIndices.push(nTris);
        }
        nTris++;
      }
    } else {
      var nVerts = GeometryUtil.getGeometryVertexCount(origGeom);
      var nTris = 0;
      for (var i = 0; i < nVerts; i += 3) {
        // Check if all indices are in our vertIndices, if so add triIndex
        if (vertIncludes(i, i + 1, i + 2)) {
          triIndices.push(nTris);
        }
        nTris++;
      }
    }
  } else {
    for (var nTri = 0; nTri < origGeom.faces.length; nTri++) {
      var tri = origGeom.faces[nTri];
      if (vertIncludes(tri.a, tri.b, tri.c)) {
        triIndices.push(nTri);
      }
    }
  }
  //console.log(vertIndices);
  //console.log(triIndices);
  return triIndices;
};

GeometryUtil.extractMeshVertIndices = function (mesh, vertIndices, keepMaterialGroups) {
  var triIndices = GeometryUtil.vertIndicesToTriIndices(mesh, vertIndices);
  var extracted = GeometryUtil.extractMesh(mesh, triIndices, keepMaterialGroups);
  return extracted;
};

// Convert segToVertIndices to segToTriIndices
GeometryUtil.segVertIndicesToSegTriIndices = function (mesh, vertToSegIndices) {
  // NOTE: maybe buggy...
  // Convert from vertIndices to triIndices
  var segToTriIndices = [];

  function add(iTri, a) {
    var iSeg = vertToSegIndices[a];
    if (iSeg != undefined) {
      if (!segToTriIndices[iSeg]) {
        segToTriIndices[iSeg] = [iTri];
      } else {
        segToTriIndices[iSeg].push(iTri);
      }
    }
  }

  function addTri(iTri, a, b, c) {
    add(iTri, a);
    add(iTri, b);
    add(iTri, c);
  }

  // Get triangle indices
  var origGeom = mesh.geometry;
  if (origGeom instanceof THREE.BufferGeometry) {
    var indexArray = (origGeom.index) ? origGeom.index.array : undefined;
    if (indexArray) {
      var nTris = 0;
      for (var i = 0; i < indexArray.length; i += 3) {
        // Check if all indices are in our vertIndices, if so add triIndex
        addTri(nTris, indexArray[i], indexArray[i + 1], indexArray[i + 2]);
        nTris++;
      }
    } else {
      var nVerts = GeometryUtil.getGeometryVertexCount(origGeom);
      var nTris = 0;
      for (var i = 0; i < nVerts; i += 3) {
        // Check if all indices are in our vertIndices, if so add triIndex
        addTri(nTris, i, i+1, i+2);
        nTris++;
      }
    }
  } else {
    for (var nTri = 0; nTri < origGeom.faces.length; nTri++) {
      var tri = origGeom.faces[nTri];
      addTri(nTri, tri.a, tri.b, tri.c);
    }
  }
  for (var i in segToTriIndices) {
    if (segToTriIndices.hasOwnProperty(i)) {
      segToTriIndices[i] = _.uniq(segToTriIndices[i]);
    }
  }
  return segToTriIndices;
};

GeometryUtil.extractParts = function(geometry, segmentation, parts) {
  var partSegmentation = _.find(segmentation.segmentation, function(x) { return x.name === parts.name; });
  var partIndices = new Set();
  if (parts.indices) {
    for (var i = 0; i < parts.indices.length; i++) {
      partIndices.add(parts.indices[i]);
    }
  } else if (parts.labels) {
    for (var i = 0; i < partSegmentation.labels.length; i++) {
      var label = partSegmentation.labels[i];
      var li = parts.labels.indexOf(label);
      //console.log('label', label, i);
      if (li >= 0) {
        partIndices.add(i);
      }
    }
  }
  var elementOffset = parts.elementOffset || 0;

  var extracted = new THREE.Geometry();
  extracted.name = geometry.name;
  var vertexRemap = {};
  function getVertex(vi) {
    var vj = vertexRemap[vi];
    if (vj == undefined) {
      vj = extracted.vertices.length;
      extracted.vertices.push(geometry.vertices[vi]);
      vertexRemap[vi] = vj;
    }
    return vj;
  }

  var nuvs = geometry.faceVertexUvs? geometry.faceVertexUvs.length : 0;
  for (var i = 0; i < partSegmentation.index.length; i++) {
    var partIndex = partSegmentation.index[i];
    if (partIndices.has(partIndex)) {
      var iFace = elementOffset + i;
      var face = geometry.faces[iFace].clone();
      face.a = getVertex(face.a);
      face.b = getVertex(face.b);
      face.c = getVertex(face.c);
      extracted.faces.push(face);
      //console.log('material', face.materialIndex, partIndex, partSegmentation.labels[partIndex]);
      for (var j = 0; j < nuvs; j++) {
        extracted.faceVertexUvs[j].push(geometry.faceVertexUvs[j][iFace]);
      }
    }
  }
  return extracted;
};

GeometryUtil.getMaterials = function(material) {
  var materials;
  if (material instanceof THREE.MultiMaterial) {
    materials = material.materials;
  } else if (_.isArray(material)) {
    materials = material;
  } else {
    materials = [material];
  }
  return materials;
};

function updateSplitInfos(splitInfos, newSplitInfo, faceIndices) {
  if (faceIndices) {
    var lastSplitInfo = splitInfos.length? splitInfos[splitInfos.length - 1] : null;
    var lastFaceIndices = (lastSplitInfo)? lastSplitInfo.faceIndices : null;
    // Assume that there is faceIndices of this split should be remapped from faceIndices of lastFaceIndices
    if (lastFaceIndices) {
      newSplitInfo.faceIndices = _.map(faceIndices, (fi) => lastFaceIndices[fi]);
    } else {
      newSplitInfo.faceIndices = faceIndices;
    }
  }
  splitInfos.push(newSplitInfo);
}
GeometryUtil.updateSplitInfos = updateSplitInfos;

/**
 * Split mesh geometry by material
 * @param mesh
 * @param opts Segmentation options
 * @param [opts.getMeshId] {function(mesh): string}
 * @param [opts.includeFaceIndices} {boolean} Whether to include array of face indices in userData
 * @param [opts.validOnly] {boolean} Only include valid meshes with faces
 * @param [opts.keepDoubleFacesTogether] {boolean} Whether to keep double faces together
 * @returns {THREE.Mesh[]}
 */
GeometryUtil.splitByMaterial = function(mesh, opts) {
  opts = opts || {};
  var getMeshId = opts.getMeshId || function(mesh) { return mesh.userData.id; };
  var geometry = mesh.geometry;
  var materials = GeometryUtil.getMaterials(mesh.material);

  function createSplitMesh(mesh, faceIndices, i) {
    var newMesh = GeometryUtil.extractMesh(mesh, faceIndices, true);
    if (mesh.userData.sceneGraphPath) {
      newMesh.userData.sceneGraphPath = mesh.userData.sceneGraphPath + '/material[' + i + ']';
    } else if (mesh.userData.sgpath) {
      newMesh.userData.sgpath = mesh.userData.sgpath + '/material[' + i + ']';
    }
    newMesh.name = mesh.name + '/material_' + i;
    newMesh.userData.splitInfo = _.clone(mesh.userData.splitInfo || []);
    updateSplitInfos(newMesh.userData.splitInfo,
      { type: 'byMaterial', meshId: getMeshId(mesh), materialIndex: i },
      opts.includeFaceIndices? faceIndices : null
    );
    //console.log('splitmesh', newMesh, faceIndices);
    return newMesh;
  }

  //console.log('splitByMaterial ' + mesh.name);
  //console.time('splitByMaterial');
  if (materials.length > 1) {
    var splitInfos = [];
    if (geometry.faces) {
      for (var i = 0; i < materials.length; i++) {
        //console.log('processing material ' + (i+1) + '/' + materials.length);
        var triIndices = [];
        for (var iface = 0; iface < geometry.faces.length; iface++) {
          if (geometry.faces[iface].materialIndex === i) {
            triIndices.push(iface);
          }
        }
        splitInfos.push({ triIndices: triIndices, materialIndex: i });
      }
    } else {
      for (var i = 0; i < geometry.groups.length; i++) {
        //console.log('processing material ' + (i+1) + '/' + geometry.groups.length);
        var group = geometry.groups[i];
        var triIndices = (group && group.count)?
          _.range(group.start/3, group.start/3 + group.count/3) : [];
        splitInfos.push({ triIndices: triIndices, materialIndex: i });
      }
    }

    if (opts.keepDoubleFacesTogether) {
      var sorted = _.sortBy(splitInfos, function(info) { return info.triIndices.length; });
      var ConnectivityGraph = require('geo/ConnectivityGraph2');
      var connectivityGraph = new ConnectivityGraph(mesh.geometry, true);
      var reverseFaceMappings = connectivityGraph.getReverseFaceMappings(true);
      var faceToGroupMapping = [];
      for (var i=0; i < sorted.length; i++) {
        var splitInfo = sorted[i];
        //console.log('Initially got ' + splitInfo.triIndices.length + ' for material ' + (splitInfo.materialIndex+1));
        for (var j=0; j < splitInfo.triIndices.length; j++) {
          faceToGroupMapping[splitInfo.triIndices[j]] = i;
        }
      }
      for (var i = 0; i < sorted.length; i++) {
        var splitInfo = sorted[i];
        var addToSplit = [];
        for (var j = 0; j < splitInfo.triIndices.length; j++) {
          var ti = splitInfo.triIndices[j];
          var reverseFaces = reverseFaceMappings[ti];
          if (reverseFaces) {
            for (var k = 0; k < reverseFaces.length; k++) {
              var rfi = reverseFaces[k];
              var rfiGroup = faceToGroupMapping[rfi];
              if (rfiGroup > i) {
                addToSplit.push(rfi);
                _.pull(sorted[rfiGroup].triIndices, rfi);
              }
            }
          }
        }
        if (addToSplit.length > 0) {
          //console.log('adding', addToSplit.length, splitInfo.triIndices.length);
          splitInfo.triIndices.push(...addToSplit);
          splitInfo.triIndices = _.uniq(splitInfo.triIndices);
          //console.log('got', splitInfo.triIndices.length);
        }
      }
    }

    var splitNodes = [];
    for (var i=0; i < splitInfos.length; i++) {
      var splitInfo = splitInfos[i];
      var mi = splitInfo.materialIndex;
      //console.log('Got ' + splitInfo.triIndices.length + ' for material ' + (mi+1));
      if (splitInfo.triIndices.length > 0) {
        var newMesh = createSplitMesh(mesh,  splitInfo.triIndices, mi);
        //console.log('extracted vertices ' + newMesh.geometry.index.array.length + ' for material ' + (mi+1));
        splitNodes.push(newMesh);
      } else if (!opts.validOnly) {
        splitNodes.push(null);
      }
    }

    //console.timeEnd('splitByMaterial');
    return splitNodes;
  } else {
    //console.timeEnd('splitByMaterial');
    return [mesh];
  }
};

/**
 * Split mesh geometry by material
 * @param mesh
 * @param opts MeshSegmentator options
 * @param opts.method {string} Segmentation method
 * @param [opts.getMeshId] {function(mesh): string}
 * @param [opts.includeFaceIndices} {boolean} Whether to include array of face indices in userData
 * @param [opts.validOnly] {boolean} Only include valid meshes with faces
 * @returns {THREE.Mesh[]}
 */
GeometryUtil.splitBySegmentator = function(mesh, opts) {
  opts = opts || {};
  var getMeshId = opts.getMeshId || function(mesh) { return mesh.userData.id; };

  function createSplitMesh(mesh, faceIndices, i) {
    var newMesh = GeometryUtil.extractMesh(mesh, faceIndices, true);
    if (mesh.userData.sceneGraphPath) {
      newMesh.userData.sceneGraphPath = mesh.userData.sceneGraphPath + '/component[' + i + ']';
    } else if (mesh.userData.sgpath) {
      newMesh.userData.sgpath = mesh.userData.sgpath + '/component[' + i + ']';
    }
    newMesh.name = mesh.name + '/component_' + i;
    newMesh.userData.splitInfo = _.clone(mesh.userData.splitInfo || []);
    updateSplitInfos(newMesh.userData.splitInfo,
      { type: 'by' + _.capitalize(opts.method), meshId: getMeshId(mesh) },
      opts.includeFaceIndices? faceIndices : null
    );
    console.log('splitmesh', newMesh, faceIndices);
    return newMesh;
  }

  var MeshSegmentator = require('geo/MeshSegmentator');
  var meshSegmentator = new MeshSegmentator();
  var segmentedList = meshSegmentator.segment(mesh, opts);
  if (segmentedList.length > 1) {
    var splitNodes = [];
    for (var i = 0; i < segmentedList.length; i++) {
      var segmented = segmentedList[i];
      if (segmented.faceIndices.length > 0) {
        var newMesh = createSplitMesh(segmented.mesh, segmented.faceIndices, i);
        splitNodes.push(newMesh);
      } else if (!opts.validOnly) {
        splitNodes.push(null);
      }
    }
    return splitNodes;
  } else {
    return [mesh];
  }
};

GeometryUtil.splitByConnectivity = function(mesh, opts) {
  return GeometryUtil.splitBySegmentator(mesh, _.defaults({method: 'connectivity'}, opts));
};

GeometryUtil.splitMesh = function(mesh, options) {
  var splitMeshes = (options.splitByMaterial)? GeometryUtil.splitByMaterial(mesh,
    { validOnly: true, getMeshId: options.getMeshId,
      keepDoubleFacesTogether: options.keepDoubleFacesTogether,
      includeFaceIndices: options.includeFaceIndices }) : [mesh];
  if (options.splitByConnectivity) {
    splitMeshes = _.flatten(
      _.map(splitMeshes, function(m) {
        return GeometryUtil.splitBySegmentator(m, {
          method: 'connectivity',
          validOnly: true, getMeshId: options.getMeshId,
          includeFaceIndices: options.includeFaceIndices });
      }));
  }
  if (options.splitByClustering) {
    splitMeshes = _.flatten(
      _.map(splitMeshes, function(m) {
        return GeometryUtil.splitBySegmentator(m, {
          method: 'clustering',
          adjFaceNormSimThreshold: options.adjFaceNormSimThreshold,
          restrictToPlanarSurfaces: options.restrictToPlanarSurfaces,
          validOnly: true, getMeshId: options.getMeshId,
          includeFaceIndices: options.includeFaceIndices,
        });
      }));
  }
  console.log('got splitMeshes', splitMeshes);
  if (options.includeFaceIndices && options.condenseFaceIndices) {
    for (var i = 0; i < splitMeshes.length; i++) {
      var splitMesh = splitMeshes[i];
      for (var j = 0; j < splitMesh.userData.splitInfo.length; j++) {
        var splitInfo = splitMesh.userData.splitInfo[j];
        if (splitInfo.faceIndices) {
          splitInfo.faceIndices = _.toCondensedIndices(splitInfo.faceIndices);
        }
      }
    }
  }
  return splitMeshes;
};

GeometryUtil.mergeMeshes = function (input) {
  if (input instanceof THREE.Mesh) {
    return input;
  } else if (input instanceof THREE.Object3D) {
    return GeometryUtil.mergeMeshes(input.children);
  } else if (Array.isArray(input)) {
    if (input.length > 1) {
      var mergedGeometry = new THREE.Geometry();
      var meshFaceMaterials = [];
      for (var i = 0; i < input.length; i++) {
        var mesh = GeometryUtil.mergeMeshes(input[i]);
        if (mesh instanceof THREE.Mesh) {
          var materials = GeometryUtil.getMaterials(mesh.material);
          var materialIndex = meshFaceMaterials.length;
          var geom = GeometryUtil.toGeometry(mesh.geometry);
          mergedGeometry.merge(geom, mesh.matrix, materialIndex);
          for (var j = 0; j < materials.length; j++) {
            meshFaceMaterials.push(materials[j]);
          }
        }
      }
      return new THREE.Mesh(mergedGeometry, new THREE.MultiMaterial(meshFaceMaterials));
    } else {
      return GeometryUtil.mergeMeshes(input[0]);
    }
  } else {
    console.warn('Cannot merge meshes for input');
    console.log(input);
  }
};

// TODO: Improved merge meshes (WIP, not yet working)
GeometryUtil.mergeMeshesWithTransform = function (input, opts) {
  opts = opts || {};
  var transform = opts.transform;
  if (!transform && !opts.clone) {
    if (input instanceof THREE.Mesh) {
      return input;
    } else if (Array.isArray(input) && input.length === 1 && input[0] instanceof THREE.Mesh) {
      return input[0];
    }
  }

  var toMerge = input;
  if (!Array.isArray(input)) {
    toMerge = [input];
  }
  var mergedGeometry = new THREE.Geometry();
  var meshFaceMaterials = [];
  //console.log('merging ', toMerge.length);
  for (var i = 0; i < toMerge.length; i++) {
    var m = toMerge[i];
    m.updateMatrixWorld();
    m.traverse(function(node) {
      if (node instanceof THREE.Mesh) {
        var materialIndex = meshFaceMaterials.length;
        var geom = GeometryUtil.toGeometry(node.geometry);
        var t = node.matrixWorld;
        if (transform) {
          t = node.transform.clone();
          t.multiply(node.matrixWorld);
        }
        mergedGeometry.merge(geom, t, materialIndex);
        if (Array.isArray(node.material)) {
          for (var j = 0; j < node.material.length; j++) {
            meshFaceMaterials.push(node.material[j]);
          }
        } else if (node.material instanceof THREE.MultiMaterial) {
          for (var j = 0; j < node.material.materials.length; j++) {
            meshFaceMaterials.push(node.material.materials[j]);
          }
        } else {
          meshFaceMaterials.push(node.material);
        }
      }
    });
  }
  //console.log('merged mesh', mergedGeometry, meshFaceMaterials);
  return new THREE.Mesh(mergedGeometry, new THREE.MultiMaterial(meshFaceMaterials));
};

// Flattens and merged nested objects into one mesh
GeometryUtil.flattenAndMergeMeshes = function (node) {
  var newNode = GeometryUtil.flatten(node);
  return GeometryUtil.mergeMeshes(newNode);
};

// Flattens nested objects into one layer of children with transforms
GeometryUtil.flatten = function (node, result) {
  var newNode = node.clone(result, false);
  GeometryUtil.__flatten(newNode, node, node.matrix);
  newNode.rotation.set(0, 0, 0);
  newNode.position.set(0, 0, 0);
  newNode.scale.set(1, 1, 1);
  newNode.updateMatrix();
  return newNode;
};

GeometryUtil.__flatten = function (root, node, matrix) {
  if (node.children && node.children.length > 0) {
    for (var i = 0; i < node.children.length; i++) {
      var m = new THREE.Matrix4();
      m.multiplyMatrices(matrix, node.children[i].matrix);
      GeometryUtil.__flatten(root, node.children[i], m);
    }
  } else {
    var newNode = node.clone(undefined, false);
    newNode.matrix.identity();
    newNode.applyMatrix4(matrix);
    root.add(newNode);
  }
};

GeometryUtil.toBufferGeometry = function (geom) {
  if (geom instanceof THREE.Geometry) {
    var newGeom = new THREE.BufferGeometry();
    newGeom.fromGeometry(geom);
    //newGeom.verticesArray = newGeom.attributes['position'].array;
    return newGeom;
  } else if (geom instanceof THREE.BufferGeometry) {
    return geom;
  } else {
    console.error('Cannot convert ' + geom + ' to BufferGeometry');
  }
};

GeometryUtil.toGeometry = function (geom) {
  if (geom instanceof THREE.Geometry) {
    return geom;
  } else if (geom instanceof THREE.BufferGeometry) {
    var newGeom = new THREE.Geometry();
    newGeom.fromBufferGeometry(geom);
    return newGeom;
  } else {
    console.error('Cannot convert ' + geom + ' to Geometry');
  }
};

function ensureArraySamePerTri(array) {
  var min = +Infinity;
  var max = -Infinity;
  for (var i = 0; i < array.length; i+=3) {
    if (array[i] !== array[i + 1] || array[i] !== array[i + 2] || array[i + 1] !== array[i + 2]) {
      if (array[i] == array[i + 1]) {
        array[i + 2] = array[i];
      } else if (array[i] == array[i + 2]) {
        array[i + 1] = array[i];
      } else if (array[i + 1] == array[i + 2]) {
        array[i] = array[i + 1];
      } else {
        array[i + 1] = array[i];
        array[i + 2] = array[i];
      }
    }
    min = Math.min(min, array[i]);
    max = Math.max(max, array[i]);
  }
  return { min: min, max: max };
}

GeometryUtil.ensureVertexAttributesSamePerTri = function(geom) {
  if (geom.index == null) {
    var vas = geom.customVertexAttributes;
    _.each(vas, function(array,key) {
      var res = ensureArraySamePerTri(array);
      console.log('Vertex attribute: key=' + key + ', min=' + res.min + ', max=' + res.max);
    });
  } else {
    console.error('GeometryUtil.ensureVertexAttributesSamePerTri not supported for indexed geometry');
  }
};

function ensureBufferSamePerTri(array, stride) {
  function isSame(i1, i2) {
    for (var j = 0; j < stride; j++) {
      if (array[i1 + j] != array[i2 + j]) {
        return false;
      }
    }
    return true;
  }
  function setValues(i1, i2) {
    for (var j = 0; j < stride; j++) {
      array[i1+j] = array[i2+j];
    }
  }
  for (var i = 0; i < array.length; i+=stride*3) {
    var i0 = i;
    var i1 = i0 + stride;
    var i2 = i1 + stride;
    var same01 = isSame(i0, i1);
    var same02 = isSame(i0, i2);
    var same12 = isSame(i1, i2);
    if (!same01 || !same02 || !same12) {
      if (same01) {
        setValues(i2, i0);
      } else if (same02) {
        setValues(i1, i0);
      } else if (same12) {
        setValues(i0, i1);
      } else {
        setValues(i1, i0);
        setValues(i2, i0);
      }
    }
  }
}

GeometryUtil.ensureVertexColorsSamePerTri = function(geom) {
  if (geom.index == null) {
    ensureBufferSamePerTri(geom.attributes.color.array, 3);
  } else {
    console.error('GeometryUtil.ensureVertexColorsSamePerTri not supported for indexed geometry');
  }
};

GeometryUtil.toNonIndexed = function (geom) {
  function convertCustomVertexAttributes(attributes) {
    var indices = geom.index.array;
    var itemSize = 1;
    var index = 0, index2 = 0;
    var array = attributes;
    var array2 = [];

    for (var i = 0, l = indices.length; i < l; i++) {
      index = indices[i] * itemSize;
      for (var j = 0; j < itemSize; j++) {
        array2[index2++] = array[index++];
      }
    }
    return array2;
  }

  if (geom instanceof THREE.BufferGeometry && geom.index) {
    var res = geom.toNonIndexed();
    res.customFaceAttributes = geom.customFaceAttributes;
    if (geom.customVertexAttributes) {
      res.customVertexAttributes = _.mapValues(geom.customVertexAttributes, convertCustomVertexAttributes);
      console.log(Object.keys(res.customVertexAttributes));
    }
    return res;
  } else {
    return geom;
  }
};

GeometryUtil.createBufferedGeometry = function(params) {
  var geom = new THREE.BufferGeometry();
  if (params.positions.length/3 < 65536) {
    geom.setIndex(new THREE.BufferAttribute(new Uint16Array(params.indices), 1));
  } else {
    geom.setIndex(new THREE.BufferAttribute(new Uint32Array(params.indices), 1));
  }
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(params.positions), 3));
  geom.groups[0] = { start: 0, count: params.indices.length, index: 0 };   //very important!
  geom.computeFaceNormals();
  geom.computeVertexNormals();
  geom.computeBoundingSphere();
  return geom;
};

GeometryUtil.clone = function(geometry) {
  var geom = geometry.clone();
  geom.isFlipped = geometry.isFlipped;
  return geom;
};

GeometryUtil.flipForMirroring = function(geometry) {
  GeometryUtil.__flipFaceVertices(geometry);
  geometry.isFlipped = !geometry.isFlipped;
  //GeometryUtil.__flipNormals(geometry);
  //geometry.computeFaceNormals();
  //geometry.computeVertexNormals();
  geometry.verticesNeedUpdate = false;
  geometry.elementsNeedUpdate = false;
  geometry.uvsNeedUpdate = false;
  geometry.normalsNeedUpdate = false;
  geometry.colorsNeedUpdate = false;
};

GeometryUtil.__flipNormals = function (geo) {
  if (geo instanceof THREE.Geometry) {
    geo.verticesNeedUpdate = true;
    geo.normalsNeedUpdate = true;
    for (var i = 0; i < geo.faces.length; i++) {
      var face = geo.faces[i];
      face.normal.negate();
      if (face.vertexNormals && face.vertexNormals.length) {
        face.vertexNormals[0].negate();
        face.vertexNormals[1].negate();
        face.vertexNormals[2].negate();
      }
    }
    //geo.computeFaceNormals();
    //geo.computeVertexNormals();
  } else {
    console.error('GeometryUtil.__flipNormals: Unsupported geometry ', geo);
  }
};

GeometryUtil.__flipFaceVertices = function(geometry) {
  if (geometry instanceof THREE.Geometry) {
    //console.log(geometry);
    for (var i = 0; i < geometry.faces.length; i++) {
      var face = geometry.faces[i];
      // Swap b and c
      var tmp = face.b;
      face.b = face.c;
      face.c = tmp;
      // Swap vertex normals and vertex colors
      if (face.vertexColors && face.vertexColors.length) {
        tmp = face.vertexColors[1];
        face.vertexColors[1] = face.vertexColors[2];
        face.vertexColors[2] = tmp;
      }
      if (face.vertexNormals && face.vertexNormals.length) {
        tmp = face.vertexNormals[1];
        face.vertexNormals[1] = face.vertexNormals[2];
        face.vertexNormals[2] = tmp;
      }
    }
    if (geometry.faceVertexUvs) {
      for (var j = 0; j < geometry.faceVertexUvs.length; j++) {
        var fuvs = geometry.faceVertexUvs[j];
        for (var i = 0; i < fuvs.length; i++) {
          var uvs = fuvs[i];
          if (uvs) {
            var tmp = uvs[1];
            uvs[1] = uvs[2];
            uvs[2] = tmp;
          }
        }
      }
    }
  } else if (geometry instanceof THREE.BufferGeometry) {
    if (!geometry.index) {
      // Make sure it is indexed
      var pos = geometry.attributes['position'].array;
      var nVerts = pos.length / 3;
      var indexSize = nVerts;
      var index = (nVerts < 65536) ?
        new Uint16Array(indexSize) : new Uint32Array(indexSize);
      for (var i = 0; i < indexSize; i++) {
        index[i] = i;
      }
      geometry.setIndex(new THREE.BufferAttribute(index, 1));
    }
    // Swap every 2nd/3rd index
    var indices = geometry.index.array;
    for (var i = 0; i < indices.length; i+=3) {
      var tmp = indices[i+1];
      indices[i+1] = indices[i+2];
      indices[i+2] = tmp;
    }
  } else {
    console.error('GeometryUtil.__flipFaceVertices: Unsupported geometry ', geometry);
  }
};

GeometryUtil.createVPTreeVertex = function (geometry, transform) {
  var VPTreeFactory = require('ds/VPTree');
  return VPTreeFactory.build(GeometryUtil.getGeometryVertexCount(geometry), function(a,b) {
    var v1 = GeometryUtil.getGeometryVertex(geometry, a, transform);
    var v2 = GeometryUtil.getGeometryVertex(geometry, b, transform);
    return v1.distanceTo(v2);
  });
};

GeometryUtil.getVertexMapping = function (srcGeo, tgtGeo, maxDist) {
  maxDist = maxDist || 1e-2;

  var tgtVPtree = GeometryUtil.createVPTreeVertex(tgtGeo);
  var distFun = function(q, v) {
    var v1 = GeometryUtil.getGeometryVertex(srcGeo, q);
    var v2 = GeometryUtil.getGeometryVertex(tgtGeo, v);
    return v1.distanceTo(v2);
  };

  var srcNumVerts = GeometryUtil.getGeometryVertexCount(srcGeo);
  var vertexMapping = [];
  for (var i = 0; i < srcNumVerts; i++) {
    var results = tgtVPtree.search(i, 1, maxDist, distFun);
    if (results.length) {
      vertexMapping[i] = results[0].i;
    }
  }
  return vertexMapping;
};

GeometryUtil.isMeshInOBB = function(mesh, obb) {
  var nVerts = GeometryUtil.getGeometryVertexCount(mesh.geometry);
  //console.log('check mesh in obb', mesh, obb, nVerts);
  if (nVerts) {
    var vert = new THREE.Vector3();
    var transform = mesh.matrixWorld;
    for (var i = 0; i < nVerts; i++) {
      GeometryUtil.getGeometryVertex(mesh.geometry, i, transform, vert);
      if (!obb.isPointContained(vert)) {
        return false;
      }
    }
    return true;
  } else {
    return false;
  }
};

function getClosestVertexSimple(mesh, point) {
  // Let's just do raw lookup for now
  var nVerts = GeometryUtil.getGeometryVertexCount(mesh.geometry);
  var vert = new THREE.Vector3();
  var closestVertIndex = -1;
  var closestDistSq = Infinity;
  for (var i = 0; i < nVerts; i++) {
    GeometryUtil.getGeometryVertex(mesh.geometry, i, null, vert);
    var distSq = point.distanceToSquared(vert);
    //console.log('distSq', distSq, closestDistSq);
    if (distSq < closestDistSq) {
      closestVertIndex = i;
      closestDistSq = distSq;
    }
  }
  if (closestVertIndex >= 0) {
    GeometryUtil.getGeometryVertex(mesh.geometry, closestVertIndex, null, vert);
    return { index: closestVertIndex, position: vert };
  }
}

GeometryUtil.getClosestVertexLocal = function(mesh, point) {
  return getClosestVertexSimple(mesh, point);
};

GeometryUtil.getClosestVertexWorld = function(mesh, point) {
  var localPoint = point.clone();
  mesh.worldToLocal(localPoint);
  var vertex = GeometryUtil.getClosestVertexLocal(mesh, localPoint);
  if (vertex) {
    mesh.localToWorld(vertex.position);
  }
  return vertex;
};

var ZERO_TOLERANCE = 0.0000000001;

GeometryUtil.trianglesShareEdge = (function() {
  var t1Edge = new THREE.Vector3();
  var t2Edge = new THREE.Vector3();
  return function(t1, t2, opts) {
    opts = opts || {};
    // TODO: can compare vertex distance
    function vertexSame(v1, v2) {
      return v1.equals(v2);
    }
    var edges = [[0,1], [1,2], [2,0]];
    for (var ei1 = 0; ei1 < edges.length; ei1++) {
      var t1e = edges[ei1];
      for (var ei2 = 0; ei2 < edges.length; ei2++) {
        var t2e = edges[ei2];
        // check if any of the vertices are the same
        var v11 = t1.getVertex(t1e[0]);
        var v12 = t1.getVertex(t1e[1]);
        var v21 = t2.getVertex(t2e[0]);
        var v22 = t2.getVertex(t2e[1]);
        if (vertexSame(v11,v21) || vertexSame(v11,v22) || vertexSame(v12, v21) || vertexSame(v12, v22)) {
          // See if any two overlaps
          t1Edge.subVectors(v12, v11).normalize();
          t2Edge.subVectors(v22, v21).normalize();
          if (Math.abs(t1Edge.dot(t2Edge)) > 1.0 - ZERO_TOLERANCE) {
            // Check for overlap (to handle |><| cases )
            // project vertices on to edge and see if there is an overlap (other than just at the vertex)
            var pv11 = t1Edge.dot(v11);
            var pv12 = t1Edge.dot(v12);
            var pv21 = t1Edge.dot(v21);
            var pv22 = t1Edge.dot(v22);
            var t1range = (pv11 < pv12)? [pv11,pv12] : [pv12, pv11];
            var t2range = (pv21 < pv22)? [pv21,pv22] : [pv22, pv21];
            if (t2range[0] >= t1range[1] || t1range[0] >= t2range[1]) {
              // No overlap
            } else {
              // close enough
              // |-------------|
              // |----------------|
              if (opts.debug) {
                var omin = Math.max(t1range[0], t2range[0]);
                var omax = Math.min(t1range[1], t2range[1]);
                console.log("Overlap is " + (omax - omin) + ", intervals are " + (t2max-t2min) + " and " + (t1max-t1min));
              }
              return true;
            }
          }
        }
        // TODO: check if there are shared edge without exact shared vertex
      }
    }
    return false;
  };
}());

GeometryUtil.getTriangle = function(geo, i, triangle, transform) {
  triangle = triangle || new THREE.Triangle();

  var vidxs = GeometryUtil.getFaceVertexIndices(geo, i);
  GeometryUtil.getGeometryVertex(geo, vidxs[0], transform, triangle.a);
  GeometryUtil.getGeometryVertex(geo, vidxs[1], transform, triangle.b);
  GeometryUtil.getGeometryVertex(geo, vidxs[2], transform, triangle.c);
  return triangle;
};

function signedVolumeOfTriangle(p1, p2, p3) {
  return p1.dot(p2.cross(p3)) / 6.0;
}

GeometryUtil.getVolume = (function() {
  var triangle = new THREE.Triangle();
  return function(geo, transform) {
    var nfaces = GeometryUtil.getGeometryFaceCount(geo);
    var volume = 0;
    for (var i = 0; i < nfaces; i++) {
      GeometryUtil.getTriangle(geo, i, triangle, transform);
      volume += signedVolumeOfTriangle(triangle.a, triangle.b, triangle.c);
    }
    return volume;
  };
})();

module.exports = GeometryUtil;
