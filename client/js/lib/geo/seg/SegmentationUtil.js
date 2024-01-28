var GeometryUtil = require('geo/GeometryUtil');
var Object3DUtil = require('geo/Object3DUtil');
var _ = require('util/util');

var SegmentationUtil = {};

SegmentationUtil.ELEMENT_TYPES = {
  VERTICES: 'vertices',
  FACES: 'faces',
  TRIANGLES: 'triangles'
};

SegmentationUtil.SEG_FORMAT_TYPES = {
  TRIMESH: 'trimesh',                 // Segmentation is specified using mesh index and triangle index (used for wss surfaces)
  TRIMESH_HIER: 'trimeshHier',
  SEG_GROUP: 'segmentGroups',         // Segmentation is specified as array of elements (either vertices or triangles) to segment index
                                      // During annotation, segments are grouped together (used for ScanNet, Matterport3D)
  INDEXED_SEG: 'indexedSegmentation', // Segmentation is specified as a set of indices (array of elements to segment index)
                                      // at varying granularities (used for some internal part annotations)
};

SegmentationUtil.getCanonicalizedElementType = function(elementType, defaultElementType, message) {
  if (elementType == null && defaultElementType != null) {
    if (message) {
      console.log(message + ' assuming ' + defaultElementType);
    }
    elementType = defaultElementType;
  }
  if (elementType === SegmentationUtil.ELEMENT_TYPES.FACES) {
    elementType = SegmentationUtil.ELEMENT_TYPES.triangles;
  }
  return elementType;
};

//  elemToSegIndices is a mapping of element index to a mapped segment index, negative segment indices are not used
//  output segToElemIndices is a mapping of segment index to a array of element indices
SegmentationUtil.groupElemToSegIndicesBySeg = function(elemToSegIndices) {
  // Have map of segment to vertices
  var segToElemIndices = [];  // Note: Can use {} but then keys becomes strings so need to be careful
  for (var i = 0; i < elemToSegIndices.length; i++) {
    var si = elemToSegIndices[i];
    if (si < 0) continue;
    if (!segToElemIndices[si]) {
      segToElemIndices[si] = [i];
    } else {
      segToElemIndices[si].push(i);
    }
  }
  return segToElemIndices;
};


//  Each MeshTri segment can have one of the following formats:
//   a. array of meshTri: [...]
//   b. object with field meshTri: { meshTri: array of meshTri }
//   c. object with meshTri fields: {meshIndex: x, triIndex: [...] }
//  Each meshTri has following fields: {meshIndex: x, triIndex: [...] }
SegmentationUtil.__getMeshTris = function(segment) {
  // Takes the different cases and returns an array conforming to case c
  var meshTris = [segment];  // Default to case c)
  if (segment.hasOwnProperty('meshTri')) {
    // Case b
    meshTris = segment['meshTri'];
  } else if (segment.length) {
    // Case a
    meshTris = segment;
  }
  return meshTris;
};

SegmentationUtil.convertMaterialMeshTrisToMeshTris = function(segments, meshes) {
  // Convert mesh tris that assumes there is one material per mesh into appropriate mesh tri indices
  var remapMeshes = [];
  var triOffsets = [];
  var iMat = 0;
  for (var i = 0; i < meshes.length; i++) {
    var mesh = meshes[i];
    var matGroups = GeometryUtil.getMaterialGroups(mesh.geometry);
    if (matGroups) {
      for (var j = 0; j < matGroups.length; j++) {
        var group = matGroups[j];
        remapMeshes[iMat] = i;
        triOffsets[iMat] = group.start/3;
        iMat++;
      }
    } else {
      remapMeshes[iMat] = i;
      triOffsets[iMat] = 0;
      iMat++;
    }
  }
  segments = _.cloneDeep(segments);
  return segments.map(function(segment) {
    var meshTris = SegmentationUtil.__getMeshTris(segment);
    for (var i = 0; i < meshTris.length; i++) {
      var meshTri = meshTris[i];
      var origMeshIndex = meshTri.meshIndex;
      var triOffset = triOffsets[origMeshIndex];
      meshTri.meshIndex = remapMeshes[origMeshIndex];
      if (meshTri.meshIndex == null) {
        console.warn('Unknown meshIndex: ' + origMeshIndex);
      }
      if (meshTri.triIndex) {
        meshTri.triIndex = meshTri.triIndex.map(function(iTri) {
          return iTri+triOffset;
        });
      }
    }
    return segment;
  });
};

SegmentationUtil.convertVertToSegIndices2FaceToSegIndices = function(object3D, vertToSegIndices) {
  var faceToSegIndices = [];
  var vertOffset = 0;
  var faceOffset = 0;
  Object3DUtil.traverseMeshes(object3D, false, function(mesh) {
    var geometry = mesh.geometry;
    GeometryUtil.forFaceVertexIndices(geometry, function(iFace, vertIndices) {
      var v0 = vertOffset + vertIndices[0];
      var v1 = vertOffset + vertIndices[1];
      var v2 = vertOffset + vertIndices[2];
      var fi = faceOffset + iFace;
      if (vertToSegIndices[v1] === vertToSegIndices[v2]) {
        faceToSegIndices[fi] = vertToSegIndices[v1];
      } else {
        faceToSegIndices[fi] = vertToSegIndices[v0];
      }
    });
    vertOffset += GeometryUtil.getGeometryVertexCount(geometry);
    faceOffset += GeometryUtil.getGeometryFaceCount(geometry);
  });
  return faceToSegIndices;
};

SegmentationUtil.convertFaceToSegIndices2VertToSegIndices = function(object3D, faceToSegIndices) {
  var vertToSegIndices = [];
  var vertOffset = 0;
  var faceOffset = 0;
  Object3DUtil.traverseMeshes(object3D, false, function(mesh) {
    var geometry = mesh.geometry;
    GeometryUtil.forFaceVertexIndices(geometry, function(iFace, vertIndices) {
      for (var i = 0; i < vertIndices.length; i++) {
        vertToSegIndices[vertOffset + vertIndices[i]] = faceToSegIndices[faceOffset + iFace];
      }
    });
    vertOffset += GeometryUtil.getGeometryVertexCount(geometry);
    faceOffset += GeometryUtil.getGeometryFaceCount(geometry);
  });
  return vertToSegIndices;
};

SegmentationUtil.remapVertToSegIndicesFromOriginalVertices = function(object, vertToSegIndices) {
  // Go over segment groups
  var meshes = Object3DUtil.getMeshList(object);
  // Assumes just one mesh
  var mesh = meshes[0];
  var geometry = mesh.geometry;
  var origVertIndices;
  if (geometry.faces) {
    // TODO: use original vert indices
  } else {
    // Set in OBJLoader (look for handling of geometry.origVertIndices)
    var attributes = geometry.attributes;
    if ( attributes.position ) {
      var positions = attributes.position.array;
      if (attributes.vertIndices) {
        origVertIndices = attributes.vertIndices.array;
      }
      if (origVertIndices) {
        var vcount = Math.floor(positions.length / 3);
        var remapped = [];
        for (var i = 0; i < vcount; i++) {
          remapped[i] = vertToSegIndices[origVertIndices[i]];
        }
        return remapped;
      }
    }
  }
  return vertToSegIndices;
};


/**
 * Remesh object
 * @param object {THREE.Object3D} Object to be remeshed
 * @param segments {Array} Array of TriMesh segments
 * @param material
 * @param options
 * @returns {Object3D}
 */
SegmentationUtil.remeshObjectUsingMeshTriSegments = function (object, segments, material, options) {
  // Get remesh of the object
  // TODO: Have the meshIndex be consistent?  Sorted by userData.meshIndex?
  //       Some models have several different pieces that are loaded, meshIndex only makes sense within each one
  var origMeshes = Object3DUtil.getMeshList(object);

  var meshes = [];
  var idToMeshIndices = {};
  var needConsolidation = false;
  for (var i = 0; i < segments.length; i++) {
    var segment = segments[i];
    var meshTris = SegmentationUtil.__getMeshTris(segment);
    var componentMeshes = [];

    for (var j = 0; j < meshTris.length; j++) {
      var meshTri = meshTris[j];
      var meshIndex = meshTri.meshIndex;
      var origMesh = (meshTri.mesh) ? meshTri.mesh : origMeshes[meshIndex];

      var componentMesh;
      if (meshTri.triIndex) {
        // Remesh with specific triangles
        componentMesh = GeometryUtil.extractMesh(origMesh, meshTri.triIndex, material? false : true);
      } else {
        // Just my mesh
        componentMesh = origMesh.clone();
      }

      // Get world transform from our parent
      // TODO: if there is a scene transform, it needs to be undone by the viewer...
      var parent = origMesh.parent;
      if (parent) {
        componentMesh.applyMatrix4(parent.matrixWorld);
        componentMesh.matrixWorldNeedsUpdate = true;
      }
      //Object3DUtil.setMatrix(componentMesh, origMesh.matrixWorld);
      //console.log('component', componentMesh.matrix.determinant(), origMesh.matrixWorld.determinant());
      if (material) {
        componentMesh.material = material;
      }
      componentMeshes.push(componentMesh);
    }

    var myMesh = GeometryUtil.mergeMeshes(componentMeshes);
    myMesh.name = (segment.id != undefined)? segment.id.toString() : object.name + '-remeshed-' + i;
    myMesh.userData = {
      id: (segment.id != undefined)? segment.id : 'mesh' + i,
      index: i
    };
    meshes.push(myMesh);
    idToMeshIndices[myMesh.userData.id] = idToMeshIndices[myMesh.userData.id] || [];
    idToMeshIndices[myMesh.userData.id].push(i);
    if (idToMeshIndices[myMesh.userData.id].length > 1) {
      needConsolidation = true;
    }
  }
  if (needConsolidation) {
    // Need to consolidation some meshes
    //console.log('consolidating', idToMeshIndices);
    var newMeshes = [];
    var consolidated = new Set();
    for (var i = 0; i < meshes.length; i++) {
      var myMesh = meshes[i];
      var id = myMesh.userData.id;
      if (!consolidated.has(id)) {
        var indices = idToMeshIndices[id];
        if (indices.length > 1) {
          var componentMeshes = indices.map(idx => meshes[idx]);
          var merged = GeometryUtil.mergeMeshes(componentMeshes);
          merged.name = myMesh.name;
          merged.userData.id = myMesh.userData.id;
          myMesh = merged;
        }
        myMesh.userData.index = i;
        newMeshes.push(myMesh);
        consolidated.add(id);
      }
    }
    //console.log(newMeshes);
    meshes = newMeshes;
  }

  // Clone the relevant mesh
  var remeshedObj = new THREE.Object3D();
  remeshedObj.name = object.name + '-remeshed';
  for (var i = 0; i < meshes.length; i++) {
    var myMesh = meshes[i];
    remeshedObj.add(myMesh);
  }
  // Clear out any __bufferGeometry
  for (var i = 0; i < origMeshes.length; i++) {
    delete origMeshes[i].__bufferGeometry;
  }
  return remeshedObj;
};

/**
 * Assign different materials to segments
 * @param object {THREE.Object3D} Object to be remeshed
 * @param segments {Array} Array of TriMesh segments
 * @param material
 * @param options
 * @returns {Object3D}
 */
SegmentationUtil.assignMultiMaterialToMeshTriSegments = function (object, segments, createMaterialFn, options) {
  if (!createMaterialFn) {
    createMaterialFn = function(index, segment) {
      var material = Object3DUtil.getSimpleFalseColorMaterial(index);
      return material;
    };
  }
  // Get remesh of the object
  // TODO: Have the meshIndex be consistent?  Sorted by userData.meshIndex?
  //       Some models have several different pieces that are loaded, meshIndex only makes sense within each one
  var origMeshes = Object3DUtil.getMeshList(object);

  // Clone the original meshes
  var materials = [];
  var multiMaterial = new THREE.MultiMaterial(materials);
  var remeshedObj = new THREE.Object3D();
  remeshedObj.name = object.name + '-remeshed';
  var clonedMeshes = _.map(origMeshes, function(x) {
    x.updateMatrixWorld();
    var cloned = x.clone();
    cloned.geometry = GeometryUtil.toGeometry(cloned.geometry);
    cloned.material = multiMaterial;
    cloned.matrix.copy(x.matrixWorld);
    cloned.matrix.decompose(cloned.position, cloned.quaternion, cloned.scale);
    cloned.matrixWorldNeedsUpdate = true;
    remeshedObj.add(cloned);
    return cloned;
  });

  for (var i = 0; i < segments.length; i++) {
    var segment = segments[i];
    materials[i] = createMaterialFn(i, segment);
    var meshTris = SegmentationUtil.__getMeshTris(segment);

    for (var j = 0; j < meshTris.length; j++) {
      var meshTri = meshTris[j];
      var meshIndex = meshTri.meshIndex;
      var clonedMesh = (meshTri.mesh) ? meshTri.mesh : clonedMeshes[meshIndex];

      // TODO: Try to handle Buffer Geometry too
      var faces = clonedMesh.geometry.faces;
      if (meshTri.triIndex) {
        var triIndices = meshTri.triIndex;
        for (var ti in triIndices) {
          if (triIndices.hasOwnProperty(ti)) {
            faces[ti].materialIndex = i;
          }
        }
      } else {
        for (var k = 0; k < faces.length; k++) {
          faces[k].materialIndex = i;
        }
      }
    }

  }
  return remeshedObj;
};

// segmentGroups is a array of segment groups
//  Each segmentGroup is a object with id, label, objectId, obb, and segments (optional)
//  segToTriIndices is a mapping of segment to array of tri indices
SegmentationUtil.remeshObjectUsingSegmentGroups = function (object, segmentGroups, segToTriIndices, quiet) {
  // Go over segment groups
  var origMeshes = Object3DUtil.getMeshList(object);
  // Assumes just one mesh
  var origMesh = origMeshes[0];
  // Convert to buffered geometry since extractMeshVertIndices works faster with buffered geometry
  var origMeshBuffered = origMesh.clone();
  origMeshBuffered.geometry = GeometryUtil.toBufferGeometry(origMesh.geometry);
  var remeshedObj = new THREE.Object3D();
  remeshedObj.name = object.name + '-remeshed';
  var noIndices = [];
  for (var i = 0; i < segmentGroups.length; i++) {
    var segGroup = segmentGroups[i];
    if (segGroup.segments && segGroup.segments.length > 0) {
      //console.time('triIndices');
      var segs = segGroup.segments;
      var triIndices = [];
      for (var si = 0; si < segs.length; si++) {
        var vis = segToTriIndices[segs[si]];
        if (vis) {
          for (var j = 0; j < vis.length; j++) {
            triIndices.push(vis[j]);
          }
          //Array.prototype.push.apply(triIndices, vis);
        } else {
          noIndices.push(segs[si]);
        }
      }
      //console.time('triIndicesUniq');
      triIndices = _.uniq(triIndices);
      //console.timeEnd('triIndicesUniq');
      //console.timeEnd('triIndices');
      var myMesh = GeometryUtil.extractMesh(origMeshBuffered, triIndices, true);
      var parent = origMesh.parent;
      if (parent) {
        myMesh.applyMatrix4(parent.matrixWorld);
        myMesh.matrixWorldNeedsUpdate = true;
      }
      myMesh.name = object.name + '-remeshed-' + i;
      myMesh.userData = segGroup;
      segGroup['index'] = i;
      remeshedObj.add(myMesh);
    }
  }
  if (!quiet && noIndices.length > 0) {
    console.error('No indices for ' + noIndices.length + ' segments', noIndices);
  }
  return remeshedObj;
};

/**
 * Convert indexed segmentation (triangles from 0) to array of segments
 * @param index {int[]}  overall triangle index to segment index
 * @param [meshIndex] {int[]} overall triangle index to mesh
 * @param [meshTriIndex] {int[]} overall triangle index to triangle index within a particular mesh
 * @returns {Array}
 * @private
 */
SegmentationUtil.triIndexedSegmentationToMeshTriSegments = function(index, meshIndex, meshTriIndex) {
  var segmentsByKey = {};
  var segments = [];
  for (var i = 0; i < index.length; i++) {
    var sIndex = index[i];
    var mIndex = meshIndex? meshIndex[i] : 0;
    var triIndex = meshTriIndex? meshTriIndex[i] : i;
    var key = mIndex + '-' + sIndex;
    if (!segmentsByKey[key]) {
      segmentsByKey[key] = { id: sIndex, surfaceIndex: segments.length, meshIndex: mIndex, triIndex: [triIndex]};
      segments.push(segmentsByKey[key]);
    } else {
      segmentsByKey[key].triIndex.push(triIndex);
    }
  }
  // try to have segments be in order
  segments = _.sortBy(segments, 'id');
  return segments;
};

/**
 * Given an array of meshes, return object with various mesh indices
 * @param meshes {THREE.Mesh[]}
 * @returns {{meshTriCounts: int[], meshIndex: int[], meshTriIndex: int[]}}
 */
SegmentationUtil.createMeshIndicesFromMeshes = function (meshes) {
  var meshIndex = [];      // triangle index to mesh index
  var meshTriCounts = [];  // mesh index to number of triangles in mesh
  var meshTriIndex = [];   // triangle index to triangle index for mesh
  var totalTris = 0;
  for (var mi = 0; mi < meshes.length; mi++) {
    var mesh = meshes[mi];
    var ntris = GeometryUtil.getGeometryFaceCount(mesh.geometry);
    meshTriCounts[mi] = ntris;
    for (var i = 0; i < ntris; i++) {
      meshTriIndex.push(i);
      meshIndex.push(mi);
    }
    totalTris += ntris;
  }
  return { meshIndex: meshIndex, meshTriIndex: meshTriIndex, meshTriCounts: meshTriCounts };
};

SegmentationUtil.convertTriIndexedSegmentationToMeshTriSegments = function(meshes, indexedSeg, meshIndices) {
  let converted = null;
  if (meshes.length > 1) {
    // Need to create new mesh to tri indices (whatever is saved is not necessarily how our loader separated into meshes)
    if (!meshIndices) {
      meshIndices = SegmentationUtil.createMeshIndicesFromMeshes(meshes);
    }
    converted = SegmentationUtil.triIndexedSegmentationToMeshTriSegments(indexedSeg, meshIndices.meshIndex, meshIndices.meshTriIndex);
  } else {
    converted = SegmentationUtil.triIndexedSegmentationToMeshTriSegments(indexedSeg);
  }
  return converted;
};

SegmentationUtil.findUnannotatedSegments = function(segGroups, segs, segmentsField) {
  var segsToSegGroup = new Object(null);
  for (var i = 0; i < segGroups.length; i++) {
    var segGroup = segGroups[i];
    for (var j = 0; j < segGroup[segmentsField].length; j++) {
      segsToSegGroup[segGroup[segmentsField][j]] = i;
    }
  }
  var segIndices = []; //_.keys(segs);
  for (var i in segs) {
    if (segs.hasOwnProperty(i)) {
      segIndices.push(i);
    }
  }
  var segIndicesForSegGroups = _.keys(segsToSegGroup);
  var unkSegGroup = { 'label': 'unknown' };
  unkSegGroup[segmentsField] = _.difference(segIndices, segIndicesForSegGroups);
  return unkSegGroup;
};

module.exports = SegmentationUtil;