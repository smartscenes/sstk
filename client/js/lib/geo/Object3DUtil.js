'use strict';

var base = require('base');
var BBox = require('geo/BBox');
var Colors = require('util/Colors');
var Constants = require('Constants');
var GeometryUtil = require('geo/GeometryUtil');
var Materials = require('materials/Materials');
var RNG = require('math/RNG');
var _ = require('util');

var Object3DUtil = {};
Object3DUtil.MaterialsAll = 1;
Object3DUtil.MaterialsCompatible = 2;
Object3DUtil.MaterialsAllNonRecursive = 3;

Object3DUtil.OutNormals = Object.freeze([
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(+1, 0, 0),
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, +1, 0),
  new THREE.Vector3(0, 0, -1),
  new THREE.Vector3(0, 0, +1)
]);
Object3DUtil.InNormals = Object.freeze([
  new THREE.Vector3(+1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, +1, 0),
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, +1),
  new THREE.Vector3(0, 0, -1)
]);
Object3DUtil.FaceCenters01 = Object.freeze([
  new THREE.Vector3(0.0, 0.5, 0.5),
  new THREE.Vector3(1.0, 0.5, 0.5),
  new THREE.Vector3(0.5, 0.0, 0.5),
  new THREE.Vector3(0.5, 1.0, 0.5),
  new THREE.Vector3(0.5, 0.5, 0.0),
  new THREE.Vector3(0.5, 0.5, 1.0)
]);
Object3DUtil.OppositeFaces = Object.freeze([1,0,3,2,5,4]);
// Rotation
Object3DUtil.PlaneToFaceRotationParams = Object.freeze([
  { axis: new THREE.Vector3(0, 1, 0), angle: Math.PI / 2 },
  { axis: new THREE.Vector3(0, 1, 0), angle: Math.PI / 2 },
  { axis: new THREE.Vector3(1, 0, 0), angle: Math.PI / 2 },
  { axis: new THREE.Vector3(1, 0, 0), angle: Math.PI / 2 },
  null,  // { axis: new THREE.Vector3(0,0,1), angle: 0 },
  null   //{ axis: new THREE.Vector3(0,0,1), angle: 0 }
]);

// Set the node material, keeping multimaterial
function setNodeMaterial(node, material, materialIndex) {
  if (!node.userData.origMaterial) {
    node.userData.origMaterial = node.material;
  }
  if (node.material instanceof THREE.MultiMaterial) {
    node.material = node.material.clone();
    if (materialIndex !== undefined) {
      var i = materialIndex;
      if (i < 0 || i >= node.material.materials.length) {
        console.warn('Invalid materialIndex ' + materialIndex + ' for node');
        console.log(node);
        return false;
      }
      node.material.materials[i] = material;
    } else {
      for (var i = 0; i < node.material.materials.length; i++) {
        node.material.materials[i] = material;
      }
    }
  } else {
    node.material = material;
  }
  return true;
}

Object3DUtil.setMaterial = function (object3D, materialOrMaterialFn, materialsToSet, saveOldMaterial, filterMeshFn) {
  if (!materialsToSet) {
    materialsToSet = Object3DUtil.MaterialsCompatible;
  }
  var skippedMeshes = 0;
  var totalMeshes = 0;
  var nonrecursive = materialsToSet === Object3DUtil.MaterialsAllNonRecursive;
  Object3DUtil.traverseMeshes(object3D,
    nonrecursive,
    function (node) {
      var material = (typeof materialOrMaterialFn === 'function')?
        materialOrMaterialFn(node) : materialOrMaterialFn;
      var applyMaterial = !!material;
      if (filterMeshFn) {
        applyMaterial = filterMeshFn(node, material);
      }
      if (applyMaterial && materialsToSet === Object3DUtil.MaterialsCompatible) {
        if (material.map) {
          if (!node.material.map) {
            applyMaterial = false;
          }
        }
      }
      if (applyMaterial) {
        if (saveOldMaterial) {
          if (node.origMaterials) {
            node.origMaterials.push(node.material);
          } else {
            node.origMaterials = [node.material];
          }
        }
        //  node.material = material;
        if (material instanceof THREE.Color) {
          // copy material and just set color
          var m = node.material.clone();
          m.color = material;
          node.material = m;
        } else {
          node.material = material;
        }
      } else {
        skippedMeshes++;
      }
      totalMeshes++;
    });
  if (skippedMeshes) {
    // console.log('Material not applied to all meshes: skipped ' + skippedMeshes + '/' + totalMeshes);
    // console.log('material', materialOrMaterialFn, materialsToSet);
    // console.log('node', object3D);
  }
  return { total: totalMeshes, skipped: skippedMeshes };
};

Object3DUtil.revertMaterials = function (object3D, nonrecursive, fullRevert) {
  var skippedMeshes = 0;
  var totalMeshes = 0;
  Object3DUtil.traverseMeshes(object3D,
    nonrecursive,
    function (node) {
      if (node.origMaterials && node.origMaterials.length > 0) {
        node.material = node.origMaterials.pop();
        if (fullRevert) {
          while (node.origMaterials.length > 0) {
            node.material = node.origMaterials.pop();
          }
        }
      } else {
        skippedMeshes++;
      }
      totalMeshes++;
    });
  return { total: totalMeshes, skipped: skippedMeshes };
};

Object3DUtil.setTransparency = function (object3D, transparency) {
  object3D.traverse(function (node) {
    if (node instanceof THREE.Mesh) {
      if (node.material) {
        Object3DUtil.setMaterialOpacity(node.material, 1.0 - transparency);
      }
    }
  });
};

Object3DUtil.setDoubleSided = function (object3D) {
  object3D.traverse(function (node) {
    if (node.material) {
      node.material.side = THREE.DoubleSide;
      if (node.material.materials) {
        for (var iMat = 0; iMat < node.material.materials.length; iMat++) {
          node.material.materials[iMat].side = THREE.DoubleSide;
        }
      }
    }
  });
};

Object3DUtil.countMirroringTransforms = function (object3D) {
  var numFlips = 0;
  object3D.traverseAncestors(function (node) {
    var s = node.scale;
    if (s.x * s.y * s.z < 0) { numFlips++; }
  });
  return numFlips;
};

// Flip normals/face vertices for mirrored geometry
Object3DUtil.flipForMirroring = function (object3D) {
  // console.time('flipNormals');
  object3D.traverse(function (node) {
    if (node instanceof THREE.Mesh) {
      if (node.geometry) {
        var geo = node.geometry;
        GeometryUtil.flipForMirroring(geo);
      }
    }
  });
  // console.timeEnd('flipNormals');
};

Object3DUtil.setMaterialOpacity = function (material, opacity) {
  Materials.setMaterialOpacity(material, opacity);
};

Object3DUtil.setDepthWrite = function (object3D, flag) {
  Object3DUtil.processMaterial(object3D, function (material) {
    material.depthWrite = flag;
  });
};

Object3DUtil.processMaterial = function (object3D, callback) {
  if (object3D instanceof THREE.Object3D) {
    object3D.traverse(function (node) {
      if (node instanceof THREE.Mesh) {
        if (node.material) {
          Object3DUtil.processMaterial(node.material, callback);
        }
      }
    });
  } else if (object3D instanceof THREE.MultiMaterial) {
    var material = object3D;
    for (var i = 0; i < material.materials.length; i++) {
      Object3DUtil.processMaterial(material.materials[i], callback);
    }
  } else if (object3D instanceof THREE.Material) {
    callback(object3D);
  }
};

Object3DUtil.createMaterial = function (params) {
  return Materials.createMaterial(params);
};

Object3DUtil.applyMaterialMappings = function (object3D, materialMappings) {
  console.log(materialMappings);
  var materials = {};
  for (var id in materialMappings.materials) {
    if (materialMappings.materials.hasOwnProperty(id)) {
      var mat = materialMappings.materials[id];
      if (!mat.replaced) {
        materials[id] = Object3DUtil.createMaterial(mat.material);
      }
    }
  }
  var meshes = {};
  for (var id in materialMappings.meshes) {
    if (materialMappings.meshes.hasOwnProperty(id)) {
      var mesh = materialMappings.meshes[id];
      meshes[mesh.name] = materials[mesh.materialId];
    }
  }
  var skippedMeshes = 0;
  var totalMeshes = 0;
  object3D.traverse(function (node) {
    if (node instanceof THREE.Mesh) {
      if (node.name) {
        var material = meshes[node.name];
        if (!material) {
          // hack to see if we replace the node specific name, we can get a match
          var newname = node.name.replace(/.*-/, 'mesh');
          material = meshes[newname];
        }
        if (material) {
          node.material = material;
        } else {
          skippedMeshes++;
        }
      }
      totalMeshes++;
    }
  });
  if (skippedMeshes) {
    console.log('Material not applied to all meshes: skipped ' + skippedMeshes + '/' + totalMeshes);
  }
  return { total: totalMeshes, skipped: skippedMeshes };
};

Object3DUtil.applyRandomMaterials = function (object3D, nonrecursive) {
  var id = 0;
  return Object3DUtil.applyMaterials(object3D,
    function (mesh) {
      return Object3DUtil.getSimpleFalseColorMaterial(id++);
    },
    nonrecursive);
};

Object3DUtil.applyIndexedMaterials = function (object3D, nonrecursive) {
  return Object3DUtil.applyMaterials(object3D,
    function (mesh) {
      var id = mesh.userData.index;
      return Object3DUtil.getSimpleFalseColorMaterial(id);
    },
    nonrecursive);
};

Object3DUtil.highlightMeshes = function (object3D, meshIndices, material, useIndexedMaterial) {
  function getMaterial(i) {
    if (material) {
      return material;
    } else if (useIndexedMaterial) {
      return Object3DUtil.getSimpleFalseColorMaterial(i);
    } else {
      return Object3DUtil.getSimpleFalseColorMaterial(0);
    }
  }

  return Object3DUtil.applyMaterials(object3D,
    function (mesh) {
      if (meshIndices.length) {
        for (var j = 0; j < meshIndices.length; j++) {
          if (mesh.userData.index === meshIndices[j]) {
            return getMaterial(mesh.userData.index);
          }
        }
        return Object3DUtil.ClearMat;
      } else if (mesh.userData.index === meshIndices) {
        return getMaterial(mesh.userData.index);
      } else {
        return Object3DUtil.ClearMat;
      }
    },
    true);
};

Object3DUtil.applyPartMaterial = function (part, material, nonrecursive, keepMultiMaterial) {
  if (part instanceof THREE.Object3D) {
    Object3DUtil.applyMaterial(part, material, nonrecursive, keepMultiMaterial);
  } else if (part instanceof Array) {
    for (var i = 0; i < part.length; i++) {
      Object3DUtil.applyPartMaterial(part[i], material, nonrecursive, keepMultiMaterial);
    }
  } else {
    var node = part['node'];
    var materialIndex = part['materialIndex'];
    var materialApplied = true;
    if (node) {
      if (materialIndex !== undefined) {
        if (node instanceof THREE.Mesh) {
          materialApplied = setNodeMaterial(node, material, materialIndex);
        }
      } else {
        Object3DUtil.applyPartMaterial(node, material, nonrecursive, keepMultiMaterial);
        materialApplied = true;
      }
    }
    if (!materialApplied) {
      console.warn('Cannot apply material to part');
      console.log(part);
    }
  }
};

Object3DUtil.applyMaterial = function (object3D, material, nonrecursive, keepMultiMaterial) {
  return Object3DUtil.applyMaterials(object3D,
    function (mesh) {
      return material;
    },
    nonrecursive, keepMultiMaterial);
};

Object3DUtil.applyMaterials = function (object3D, getMaterialCallback, nonrecursive, keepMultiMaterial) {
  var skippedMeshes = 0;
  var totalMeshes = 0;
  Object3DUtil.traverseMeshes(object3D,
    nonrecursive,
    function (node) {
      var material = getMaterialCallback(node);
      if (material) {
        if (keepMultiMaterial) {
          setNodeMaterial(node, material);
        } else {
          node.material = material;
        }
      } else {
        skippedMeshes++;
      }
      totalMeshes++;
    });
  if (skippedMeshes) {
    console.log('Material not applied to all meshes: skipped ' + skippedMeshes + '/' + totalMeshes);
  }
  return {total: totalMeshes, skipped: skippedMeshes};
};

Object3DUtil.detachFromParent = function (object3D, scene) {
  // Detach from parent while keeping same world transform
  if (object3D.parent) {
    Object3DUtil.clearCache(object3D.parent);
    object3D.parent.updateMatrixWorld();
    if (scene) {
      scene.updateMatrixWorld();
    }

    var objWorldTransform = new THREE.Matrix4();
    objWorldTransform.copy(object3D.matrixWorld);
    object3D.parent.remove(object3D);

    var objMinv = new THREE.Matrix4();
    objMinv.getInverse(object3D.matrix);
    var matrix = new THREE.Matrix4();
    matrix.multiplyMatrices(objWorldTransform, objMinv);

    // Add to scene...
    if (scene) {
      var sceneMinv = new THREE.Matrix4();
      sceneMinv.getInverse(scene.matrixWorld);
      matrix.multiplyMatrices(sceneMinv, matrix);
      object3D.applyMatrix(matrix);
      object3D.matrixWorldNeedsUpdate = true;
      scene.add(object3D);
    }
  }
};

Object3DUtil.attachToParent = function (object3D, parent, scene) {
  // Attach to parent while keeping same world transform
  if (object3D.parent === parent) return;
  if (parent) {
    parent.updateMatrixWorld();
    object3D.updateMatrixWorld();

    var objWorldTransform = new THREE.Matrix4();
    objWorldTransform.copy(object3D.matrixWorld);
    var parentMinv = new THREE.Matrix4();
    parentMinv.getInverse(parent.matrixWorld);
    var objMinv = new THREE.Matrix4();
    objMinv.getInverse(object3D.matrix);

    var matrix = new THREE.Matrix4();
    matrix.multiplyMatrices(parentMinv, objWorldTransform);
    matrix.multiplyMatrices(matrix, objMinv);
    object3D.applyMatrix(matrix);
    object3D.matrixWorldNeedsUpdate = true;

    parent.add(object3D);
    Object3DUtil.clearCache(parent);
  } else {
    Object3DUtil.detachFromParent(object3D, scene);
  }
};

Object3DUtil.setCastShadow = function (object3D, flag) {
  object3D.traverse(function (node) {
    if (node.castShadow != undefined) {
      //console.log('castShadow');
      node.castShadow = flag;
    }
  });
};

Object3DUtil.setReceiveShadow = function (object3D, flag) {
  object3D.traverse(function (node) {
    if (node.receiveShadow != undefined) {
      //console.log('receiveShadow');
      node.receiveShadow = flag;
    }
  });
};

Object3DUtil.computeVertexMeanLocal = function (root, transform) {
  root.updateMatrixWorld();
  var modelInverse = new THREE.Matrix4();
  modelInverse.getInverse(root.matrixWorld);
  if (transform) {
    var m = new THREE.Matrix4();
    m.multiplyMatrices(transform, modelInverse);
    return Object3DUtil.computeVertexMean(root, m);
  } else {
    return Object3DUtil.computeVertexMean(root, modelInverse);
  }
};

Object3DUtil.computeVertexMean = function (root, transform) {
  var agg = new THREE.Vector3();
  var n = 0;
  Object3DUtil.traverseMeshes(root, false, function(mesh) {
    GeometryUtil.forFaceVerticesWithTransform(mesh.geometry, transform, function(v) {
      agg.add(v);
      n++;
    });
  });
  if (n > 0) {
    agg.multiplyScalar(1/n);
  }
  console.log('Computed mean vertex: ' + JSON.stringify(agg) + ', nvertices: ' + n);
  return agg;
};

Object3DUtil.getBoundingBox = function (objects, force) {
  if (Array.isArray(objects)) {
    var bbox = new BBox();
    for (var i = 0; i < objects.length; i++) {
      bbox.includeBBox(Object3DUtil.__getBoundingBox(objects[i], force));
    }
    return bbox;
  } else {
    return Object3DUtil.__getBoundingBox(objects, force);
  }
};

Object3DUtil.__getBoundingBox = function (root, force) {
  // Have cached world bounding box
  //var modelInstance = Object3DUtil.getModelInstance(root);
  if (!root.cached) {
    root.cached = {};
  }
  if (!root.cached.worldBoundingBox || force/* || !modelInstance */) {
    root.cached.worldBoundingBox = Object3DUtil.computeBoundingBox(root);
    //console.log(root.cached.worldBoundingBox);
  } else {
    //console.log("Recompute not needed");
  }
  return root.cached.worldBoundingBox;
};

Object3DUtil.computeBoundingBoxLocal = function (root, transform) {
  root.updateMatrixWorld();
  var modelInverse = new THREE.Matrix4();
  modelInverse.getInverse(root.matrixWorld);
  if (transform) {
    var m = new THREE.Matrix4();
    m.multiplyMatrices(transform, modelInverse);
    return Object3DUtil.computeBoundingBox(root, m);
  } else {
    return Object3DUtil.computeBoundingBox(root, modelInverse);
  }
};

Object3DUtil.computeBoundingBox = function (root, transform, filter) {
  var bbox = new BBox();
  //console.time("computeBoundingBox");
  //var start = Date.now();
  bbox.includeObject3D(root, transform, filter);
  //var end = Date.now();
  //console.log("Get bounding box took " + (end-start) + " ms");
  //console.timeEnd("computeBoundingBox");
  return bbox;
};

Object3DUtil.getBoundingBoxDims = function (model, bb) {
  if (!bb) bb = Object3DUtil.getBoundingBox(model);
  var bbSize = new THREE.Vector3();
  bbSize.subVectors(bb.max, bb.min);
  return bbSize;
};

Object3DUtil.getSizeByOptions = function () {
  return ['height', 'length', 'width', 'max', 'volumeCubeRoot', 'diagonal'];
};

Object3DUtil.convertBbDimsToSize = function (bbDims, sizeBy) {
  var size;
  if (bbDims instanceof THREE.Vector3) {
  } else if (bbDims instanceof Array) {
    bbDims = new THREE.Vector3(bbDims[0], bbDims[1], bbDims[2]);
  } else {
    console.error('Unsupported bbDims type');
    return undefined;
  }
  switch (sizeBy) {
    case 'height':
      size = bbDims.z;
      break;
    case 'length':
      size = bbDims.y;
      break;
    case 'width':
      size = bbDims.x;
      break;
    case 'max':
      size = Math.max(bbDims.x, bbDims.y, bbDims.z);
      break;
    case 'diagonal':
      size = bbDims.length();
      break;
    case 'volumeCubeRoot':
      size = bbDims.x * bbDims.y * bbDims.z;
      size = Math.pow(size, 1 / 3);
      break;
    default:
      console.error('Unknown sizeBy ' + size);
  }
  return size;
};

Object3DUtil.getObjectStats = function(object3D, includeChildModelInstance) {
  var nverts = 0;
  var nfaces = 0;
  var nmeshes = 0;
  Object3DUtil.traverseMeshes(object3D, !includeChildModelInstance, function(mesh) {
    nverts += GeometryUtil.getGeometryVertexCount(mesh.geometry);
    nfaces += GeometryUtil.getGeometryFaceCount(mesh.geometry);
    nmeshes += 1;
  });
  return { nverts: nverts, nfaces: nfaces, nmeshes: nmeshes };
};

Object3DUtil.getSurfaceArea = function(object3D, opts) {
  opts = opts || {};
  var includeChildModelInstance = opts.includeChildModelInstance;
  var transform = opts.transform;
  var meshFilter = opts.meshFilter;
  var triFilter = opts.triFilter;
  object3D.updateMatrixWorld();
  var area = 0;
  Object3DUtil.traverseMeshes(object3D, !includeChildModelInstance, function(mesh) {
    if (!meshFilter || meshFilter(mesh)) {
      var t = mesh.matrixWorld;
      if (transform) {
        t = transform.clone();
        t.multiply(mesh.matrixWorld);
      }
      area += GeometryUtil.getSurfaceAreaFiltered(mesh.geometry, t, triFilter);
    }
  });
  return area;
};

/**
 * Takes an object3D and rotates so that its two vectors front and up align with targetUp and targetFront.
 * Assumptions: objectUp perpendicular to objectFront, targetUp perpendicular to targetFront.
 * @param object3D Object to align
 * @param objectUp Object's semantic up vector
 * @param objectFront Object's semantic front vector
 * @param targetUp Target up vector
 * @param targetFront Target front vector
 */
Object3DUtil.alignToUpFrontAxes = function (object3D, objectUp, objectFront, targetUp, targetFront) {
  Object3DUtil.alignAxes(object3D, objectUp, objectFront, targetUp, targetFront);
};

/**
 * Takes an object3D and rotates so that its two vectors u and v align with u and v.
 * Assumptions: both sets of u and v are perpendicular.
 * @param object3D Object to align
 * @param objU Object's first vector
 * @param objV Object's second vector
 * @param tgtU Target first vector
 * @param tgtV Target second vector
 */
Object3DUtil.alignAxes = function (object3D, objU, objV, tgtU, tgtV) {
  // Unapply existing rotations  (does this work? does object position end up not quite what we want...?)
  object3D.rotation.set(0, 0, 0);
  object3D.updateMatrix();
  var transform = Object3DUtil.getAlignmentMatrix(objU, objV, tgtU, tgtV);
  // Apply this transform to matrix
  object3D.applyMatrix(transform);
  object3D.matrixWorldNeedsUpdate = true;  // make sure matrixWorldNeedsUpdate is set
  Object3DUtil.clearCache(object3D);
};

/**
 * Returns matrix to align from objectUp/objectFront to targetUp/targetFront
 * Assumptions: objectUp perpendicular to objectFront, targetUp perpendicular to targetFront.
 * @param objectUp Object's semantic up vector
 * @param objectFront Object's semantic front vector
 * @param targetUp Target up vector
 * @param targetFront Target front vector
 */
Object3DUtil.getAlignmentMatrix = function (objectUp, objectFront, targetUp, targetFront) {
  // Figure out what transform to apply to matrix
  var objM = Object3DUtil.axisPairToOrthoMatrix(objectUp, objectFront);
  var targetM = Object3DUtil.axisPairToOrthoMatrix(targetUp, targetFront);
  var transform = new THREE.Matrix4();
  var objMinv = new THREE.Matrix4();
  objMinv.getInverse(objM);
  transform.multiplyMatrices(targetM, objMinv);
  return transform;
};

/**
 * Returns matrix to align from objectUp/objectFront to targetUp/targetFront
 * Assumptions: objectUp perpendicular to objectFront, targetUp perpendicular to targetFront.
 * @param objectUp Object's semantic up vector
 * @param objectFront Object's semantic front vector
 * @param targetUp Target up vector
 * @param targetFront Target front vector
 */
Object3DUtil.getAlignmentQuaternion = function (objectUp, objectFront, targetUp, targetFront) {
  var m = Object3DUtil.getAlignmentMatrix(objectUp, objectFront, targetUp, targetFront);
  var position = new THREE.Vector3();
  var scale = new THREE.Vector3();
  var quaternion = new THREE.Quaternion();
  m.decompose( position, quaternion, scale );
  return quaternion;
};

Object3DUtil.axisPairToOrthoMatrix = function (_v1, _v2) {
  // Let's make a copy so we don't change the incoming vectors
  var v1 = new THREE.Vector3();
  v1.copy(_v1);
  v1.normalize();
  var v2 = new THREE.Vector3();
  v2.copy(_v2);
  v2.normalize();
  var v3 = new THREE.Vector3();
  v3.crossVectors(v1, v2);

  var m = new THREE.Matrix4();

  m.set(
    v1.x, v2.x, v3.x, 0,
    v1.y, v2.y, v3.y, 0,
    v1.z, v2.z, v3.z, 0,
    0, 0, 0, 1
  );

  return m;
};

/**
 * Takes the rotation for a rotated object3D that is aligned with targetUp and targetFront and returns the
 *   objectUp and objectFront that is needed to achieve that alignment
 * Assumptions: targetUp perpendicular to targetFront.
 * @param rotation Rotation of aligned object
 * @param targetUp Target up vector
 * @param targetFront Target front vector
 * @param epsilon Epsilon to use to snap to integers
 * @return "up": Object's semantic up vector
 * @return "front": Object's semantic front vector
 */
Object3DUtil.getObjUpFrontAxes = function (rotation, targetUp, targetFront, epsilon) {
  var targetM = Object3DUtil.axisPairToOrthoMatrix(targetUp, targetFront);
  var m = new THREE.Matrix4();
  if (rotation instanceof THREE.Vector3) {
    m.makeRotationFromEuler(new THREE.Euler(rotation.x, rotation.y, rotation.z));
  } else if (rotation instanceof THREE.Quaternion) {
    m.makeRotationFromQuaternion(rotation);
  }
  var mInv = new THREE.Matrix4();
  mInv.getInverse(m);
  var objM = new THREE.Matrix4();
  objM.multiplyMatrices(mInv, targetM);
  var up = new THREE.Vector3();
  up.setFromMatrixColumn(objM, 0);
  up = Object3DUtil.snapToInteger(up, epsilon);
  var front = new THREE.Vector3();
  front.setFromMatrixColumn(objM, 1);
  front = Object3DUtil.snapToInteger(front, epsilon);
  return { 'up': up, 'front': front };
};

Object3DUtil.getRotationForOrientingBBFace = function (unorientedBbFaceIndex, targetBbfaceIndex) {
  // Get rotation matrix that takes the unorientedBbFaceIndex to be oriented in world space as the bbfaceIndex
  var r = new THREE.Matrix3();
  if (unorientedBbFaceIndex !== targetBbfaceIndex) {
    if (unorientedBbFaceIndex >= 0 && targetBbfaceIndex >= 0) {
      console.debug('Need to orient ' + unorientedBbFaceIndex + ' to ' + targetBbfaceIndex);
      if (targetBbfaceIndex !== Constants.BBoxFaces.BOTTOM && targetBbfaceIndex !== Constants.BBoxFaces.TOP &&
        unorientedBbFaceIndex !== Constants.BBoxFaces.BOTTOM && unorientedBbFaceIndex !== Constants.BBoxFaces.TOP) {
        r = Object3DUtil.getAlignmentMatrix(
          Object3DUtil.OutNormals[Constants.BBoxFaces.TOP],
          Object3DUtil.OutNormals[unorientedBbFaceIndex],
          Object3DUtil.OutNormals[Constants.BBoxFaces.TOP],
          Object3DUtil.OutNormals[targetBbfaceIndex]
        );
      } else {
        r = Object3DUtil.getAlignmentMatrix(
          Object3DUtil.OutNormals[unorientedBbFaceIndex],
          Object3DUtil.OutNormals[(unorientedBbFaceIndex + 2) % 6],
          Object3DUtil.OutNormals[targetBbfaceIndex],
          Object3DUtil.OutNormals[(targetBbfaceIndex + 2) % 6]
        );
      }
    } else {
      if (unorientedBbFaceIndex < 0) {
        console.warn('Invalid unorientedBbFaceIndex: ' + unorientedBbFaceIndex);
      }
      if (targetBbfaceIndex < 0) {
        console.warn('Invalid targetBbfaceIndex: ' + targetBbfaceIndex);
      }
    }
  }
  return r;
};

Object3DUtil.clearTransform = function(object3D) {
  object3D.rotation.set(0, 0, 0);
  object3D.scale.set(1, 1, 1);
  object3D.position.set(0, 0, 0);
  object3D.updateMatrix();
  Object3DUtil.clearCache(object3D);
};

Object3DUtil.normalize = function (object3D, alignmentMatrix, scaleVector) {
  // Unapply existing rotations  (does this work? does object position end up not quite what we want...?)
  object3D.rotation.set(0, 0, 0);
  object3D.scale.set(1, 1, 1);
  object3D.position.set(0, 0, 0);
  object3D.updateMatrix();
  var transform = alignmentMatrix;
  // Apply this transform to matrix
  object3D.applyMatrix(transform);
  object3D.updateMatrix();
  object3D.matrixWorldNeedsUpdate = true;

  // Get bounding box...
  var parentMatrixWorldInv;
  if (object3D.parent) {
    object3D.parent.updateMatrixWorld();
    parentMatrixWorldInv = new THREE.Matrix4();
    parentMatrixWorldInv.getInverse(object3D.parent.matrixWorld);
  }

  if (scaleVector) {
    object3D.scale.copy(scaleVector);
  }
  var bb = Object3DUtil.computeBoundingBox(object3D, parentMatrixWorldInv);
  // Scale to be unit?
//  var dims = bb.dimensions();
//  var maxDim = Math.max( dims.x, dims.y, dims.z );
//  object3D.scale.multiplyScalar(1.0/maxDim);
//  bb = Object3DUtil.computeBoundingBox(object3D, parentMatrixWorldInv);

  var shift = new THREE.Vector3();
  shift.addVectors(bb.min, bb.max);
  shift.multiplyScalar(-0.5);

  // Place object in center
  object3D.position.copy(shift);

  object3D.updateMatrix();
  Object3DUtil.clearCache(object3D);
};

Object3DUtil.setChildAttachmentPoint = function (parent, child, p, pointCoordFrame) {
  // Note: We want T1 * T2 = T1' T2' = T3
  //       So T1' = T1 * T2 * (T2')^-1
  //       For other child transforms:
  //         Want T1 * Tc = T1' * Tc'
  //         =>           = T1 * T2 * (T2')^-1 * Tc'
  //         =>   Tc' = T2' * (T2)^-1 * Tc
  var oldModelBaseMatrixInv = new THREE.Matrix4();
  oldModelBaseMatrixInv.getInverse(child.matrix);

  var matrix = new THREE.Matrix4();
  matrix.multiplyMatrices(parent.matrix, child.matrix);

  // TODO: Should we be clearing the transform of the child here?
  if (pointCoordFrame === 'worldBB') {
    var worldBB = Object3DUtil.computeBoundingBox(child);
    var wp = worldBB.getWorldPosition(p);
    var pm = new THREE.Matrix4();
    pm.getInverse(child.matrixWorld);
    var cp = wp.applyMatrix4(pm);

    Object3DUtil.clearTransform(child);
    child.position.set(-cp.x, -cp.y, -cp.z);
    child.updateMatrix();
  } else if (pointCoordFrame === 'parentBB') {
    // NOTE: Unchecked logic!!!
    var rot = new THREE.Matrix4();
    rot.makeRotationFromQuaternion(parent.quaternion);
    var modelBB = Object3DUtil.computeBoundingBoxLocal(child, rot);
    var cp = modelBB.getWorldPosition(p);

    Object3DUtil.clearTransform(child);
    child.quaternion.copy(parent.quaternion);
    child.position.set(-cp.x, -cp.y, -cp.z);
    child.updateMatrix();
  } else if (pointCoordFrame === 'childBB') {
    var modelBB = Object3DUtil.computeBoundingBoxLocal(child);
    var cp = modelBB.getWorldPosition(p);

    Object3DUtil.clearTransform(child);
    child.position.set(-cp.x, -cp.y, -cp.z);
    child.updateMatrix();
  } else {
    // Assume world coordinate frame
    if (pointCoordFrame !== 'child') {
      console.error('setChildAttachmentPoint invalid coord frame: ' + pointCoordFrame + ', using child');
      pointCoordFrame = 'child';
    }
    var wp = p.clone();

    child.position.set(-wp.x, -wp.y, -wp.z);
    child.updateMatrix();
  }

  // Convert this.modelBaseObject3D to use the specified attachmentPoint
  var modelBaseObject3DInv = new THREE.Matrix4();
  modelBaseObject3DInv.getInverse(child.matrix);
  matrix.multiply(modelBaseObject3DInv);

  Object3DUtil.setMatrix(parent, matrix);
  child.userData['attachmentPoint'] = p;
  child.userData['attachmentPointCoordFrame'] = pointCoordFrame;

  // Adjust other children of object3D
  matrix.multiplyMatrices(child.matrix, oldModelBaseMatrixInv);
  for (var i = 0; i < parent.children.length; i++) {
    var c = parent.children[i];
    if (child !== c) {
      c.applyMatrix(matrix);
      c.matrixWorldNeedsUpdate = true;
    }
  }
  //parent.updateMatrix();
  //parent.updateMatrixWorld();
};

Object3DUtil.setMatrix = function (obj, matrix) {
  obj.matrix = matrix;
  obj.matrix.decompose(obj.position, obj.quaternion, obj.scale);
  obj.matrixWorldNeedsUpdate = true;  // make sure matrixWorldNeedsUpdate is set
  Object3DUtil.clearCache(obj);
};

Object3DUtil.snapToInteger = function (v, epsilon) {
  if (epsilon) {
    if (v instanceof THREE.Vector3) {
      return new THREE.Vector3(
        Object3DUtil.snapToInteger(v.x, epsilon),
        Object3DUtil.snapToInteger(v.y, epsilon),
        Object3DUtil.snapToInteger(v.z, epsilon)
      );
    } else if (typeof v === 'number') {
      var rounded = Math.round(v);
      return (Math.abs(rounded - v) < epsilon) ? rounded : v;
    }
  }
  return v;
};

// Helper functions  for rotating objects
Object3DUtil.rotateObject3DEuler = function (obj, delta, order, stationaryBbBoxPoint) {
  obj.updateMatrixWorld();
  var bb = Object3DUtil.getBoundingBox(obj);
  var base = bb.getWorldPosition(stationaryBbBoxPoint);
  Object3DUtil.placeObject3D(obj, new THREE.Vector3(), stationaryBbBoxPoint);

  var q = new THREE.Quaternion();
  q.setFromEuler(new THREE.Euler(delta.x, delta.y, delta.z, order), true);
  obj.quaternion.multiply(q);
  obj.updateMatrix();

  Object3DUtil.clearCache(obj);
  Object3DUtil.placeObject3D(obj, base, stationaryBbBoxPoint);
};

Object3DUtil.rotateObject3DAboutAxis = function (obj, axis, delta, stationaryBbBoxPoint) {
  //console.time('rotateObject3DAboutAxis');
  obj.updateMatrixWorld();
  var bb = Object3DUtil.getBoundingBox(obj);
  var base = bb.getWorldPosition(stationaryBbBoxPoint);
  Object3DUtil.placeObject3D(obj, new THREE.Vector3(), stationaryBbBoxPoint);

  var qwi = obj.getWorldQuaternion().inverse();
  var localAxis = axis.clone().applyQuaternion(qwi);
  var q = new THREE.Quaternion();
  q.setFromAxisAngle(localAxis, delta);
  obj.quaternion.multiply(q);
  obj.updateMatrix();

  Object3DUtil.clearCache(obj);
  Object3DUtil.placeObject3D(obj, base, stationaryBbBoxPoint);
  //console.timeEnd('rotateObject3DAboutAxis');
};

Object3DUtil.rotateObject3DWrtBBFace = function (obj, axis, delta, bbface) {
  if (bbface === undefined) {
    bbface = Constants.BBoxFaceCenters.BOTTOM;
  }
  var stationaryBbBoxPoint = Object3DUtil.FaceCenters01[bbface];
  Object3DUtil.rotateObject3DAboutAxis(obj, axis, delta, stationaryBbBoxPoint);
};

Object3DUtil.rotateObject3DAboutAxisSimple = function (obj, axis, delta, isWorld) {
  //console.time('rotateObject3DAboutAxisSimple');
  var localAxis = axis;
  if (isWorld) {
    var qwi = obj.getWorldQuaternion().inverse();
    localAxis = axis.clone().applyQuaternion(qwi);
  }

  var q = new THREE.Quaternion();
  q.setFromAxisAngle(localAxis, delta);
  obj.quaternion.multiplyQuaternions(obj.quaternion, q);
  obj.updateMatrix();
  Object3DUtil.clearCache(obj);
  //console.timeEnd('rotateObject3DAboutAxisSimple');
};

// Helper functions  for rotating objects
Object3DUtil.applyAlignment = function (obj, alignment, stationaryBbBoxPoint) {
  obj.updateMatrixWorld();
  var bb = Object3DUtil.getBoundingBox(obj);
  var base = bb.getWorldPosition(stationaryBbBoxPoint);
  Object3DUtil.placeObject3D(obj, new THREE.Vector3(), stationaryBbBoxPoint);

  var transform = alignment;
  // Apply this transform to matrix
  obj.applyMatrix(transform);
  obj.matrixWorldNeedsUpdate = true;  // make sure matrixWorldNeedsUpdate is set
  Object3DUtil.clearCache(obj);

  Object3DUtil.placeObject3D(obj, base, stationaryBbBoxPoint);
};

// Helper functions for centering and rescaling object3ds
Object3DUtil.centerAndRescaleObject3DToWorld = function (obj, targetSize, centerTo, bbBoxPointToCenter) {
  targetSize = targetSize || 80;
  var bb = Object3DUtil.getBoundingBox(obj);
  var bbSize = bb.dimensions();
  var scale = targetSize / bbSize.length();
  obj.scale.x = obj.scale.y = obj.scale.z = scale;
  obj.updateMatrix();
  centerTo = centerTo || new THREE.Vector3();
  Object3DUtil.clearCache(obj);
  Object3DUtil.placeObject3D(obj, centerTo, bbBoxPointToCenter);
};


/* placeObject3D takes a THREE.Object3D, a target position (THREE.Vector3), and relative position
 (THREE.Vector3 in the object3D's world bbox coordinate frame with min = [0,0,0] and max = [1,1,1]) to position.
 The function places the object such that the bbBoxPointToPosition when transformed to world coordinates
 matches the specified position */
Object3DUtil.placeObject3D = function (obj, targetWorldPosition, bbBoxPointToPosition) {
  if (!targetWorldPosition) {
    targetWorldPosition = new THREE.Vector3(0, 0, 0);
  }
  if (!bbBoxPointToPosition) {
    bbBoxPointToPosition = new THREE.Vector3(0.5, 0.5, 0.5);
  }

  var bb = Object3DUtil.getBoundingBox(obj);
  var currentWorldPosition = bb.getWorldPosition(bbBoxPointToPosition);

  var shift;
  if (obj.parent) {
    obj.parent.updateMatrixWorld();
    var current = obj.parent.worldToLocal(currentWorldPosition.clone());
    var target = obj.parent.worldToLocal(targetWorldPosition.clone());
    shift = target.clone();
    shift.sub(current);
  } else {
    shift = targetWorldPosition.clone();
    shift.sub(currentWorldPosition);
  }
  obj.position.add(shift);
  obj.updateMatrix();
  Object3DUtil.clearCache(obj);
};

Object3DUtil.placeObject3DByOrigin = function (obj, targetWorldPosition) {
  var shift;
  var currentWorldPosition = obj.localToWorld(new THREE.Vector3());
  if (obj.parent) {
    obj.parent.updateMatrixWorld();
    var current = obj.parent.worldToLocal(currentWorldPosition.clone());
    var target = obj.parent.worldToLocal(targetWorldPosition.clone());
    shift = target.clone();
    shift.sub(current);
  } else {
    shift = targetWorldPosition.clone();
    shift.sub(currentWorldPosition);
  }
  obj.position.add(shift);
  obj.updateMatrix();
  Object3DUtil.clearCache(obj);
};

/* placeObject3DByBBFaceCenter takes a THREE.Object3D, a THREE.Vector3, and an int
 demarking the face of which the center will be used as a reference point for placement.
 Appropriate values can be found in the Constants.BBoxFaceCenters enum.  The function
 places the object such that the center of the chosen face is at the given location */
Object3DUtil.placeObject3DByBBFaceCenter = function (obj, targetWorldPosition, bboxFaceCenterIndex) {
  var bbBoxPointToPosition = Object3DUtil.FaceCenters01[bboxFaceCenterIndex];
  Object3DUtil.placeObject3D(obj, targetWorldPosition, bbBoxPointToPosition);
};

Object3DUtil.getBBoxFaceCenter = function (obj, bboxFaceCenterIndex) {
  // Clone center so it's okay in case it gets mutated.
  var centers = Object3DUtil.getBoundingBox(obj).getFaceCenters();
  return centers[bboxFaceCenterIndex].clone();
};

Object3DUtil.tumble = function (obj, bboxFaceCenterIndex) {
  if (!obj.userData) {
    obj.userData = {};
  }
  var tumbleIndex = (obj.userData['tumbleIndex'] + 1) % 3;
  var transform = Object3DUtil.getAlignmentMatrix(
    new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1));
  var bboxFaceCenter;
  if (bboxFaceCenterIndex !== undefined) {
    bboxFaceCenter = Object3DUtil.FaceCenters01[bboxFaceCenterIndex];
  } else {
    // TODO: Should we have this as the default?
    bboxFaceCenter = Object3DUtil.FaceCenters01[Constants.BBoxFaceCenters.BOTTOM];
  }
  Object3DUtil.applyAlignment(obj, transform, bboxFaceCenter);
  obj.userData['tumbleIndex'] = tumbleIndex;
};

Object3DUtil.rescaleObject3D = function (obj, scale) {
  obj.scale.x = obj.scale.y = obj.scale.z = scale;
  obj.updateMatrix();
  Object3DUtil.clearCache(obj);
};

Object3DUtil.rescaleObject3DToFit = function (obj, dim) {
  var bbSize = Object3DUtil.getBoundingBoxDims(obj);
  var scale;
  if ((typeof dim) === 'number') {
    scale = dim / bbSize.length();
  } else {
    var scaleV = new THREE.Vector3();
    scaleV.copy(dim);
    scaleV.divide(bbSize);
    scale = Math.min(scaleV.x, scaleV.y, scaleV.z);
  }
  obj.scale.multiplyScalar(scale);
  //obj.scale.x = obj.scale.y = obj.scale.z = scale;
  obj.updateMatrix();
  Object3DUtil.clearCache(obj);
};

Object3DUtil.makeSymmetryPlane = function (bb, planeType, normal, dist, planeColor, transparency) {
  var c = (planeColor !== undefined) ? planeColor : 0x0000A0;
  var faceMat = new THREE.MeshPhongMaterial({
    color: c,
    specular: c,
    //ambient:  c,
    emissive: c,
    side: THREE.DoubleSide,
    opacity: 1
  });
  if (transparency === undefined) {
    transparency = 0.6;
  }
  if (transparency > 0.0) {
    faceMat.opacity = 1 - transparency;
    faceMat.transparent = true;
  }
  var dims = bb.dimensions();
  var width, height, u, v;
  switch (planeType) {
    case 'X':
      width = dims.y;
      height = dims.z;
      v = new THREE.Vector3(0, 0, 1);
      u = new THREE.Vector3(1, 0, 0);
      break;
    case 'Y':
      width = dims.x;
      height = dims.z;
      v = new THREE.Vector3(0, 0, 1);
      u = new THREE.Vector3(0, 1, 0);
      break;
    case 'Z':
      width = dims.x;
      height = dims.y;
      v = new THREE.Vector3(0, 1, 0);
      u = new THREE.Vector3(0, 0, 1);
      break;
    case 'nd':
      // TODO(MS): Unhack
      width = 10 * dims.x;
      height = 10 * dims.y;
      var w = normal.clone();
      // Get random perpendicular to normal
      var rand = new THREE.Vector3(RNG.global.random(), RNG.global.random(), RNG.global.random());
      rand = rand.normalize();
      var randLengthInNormalDir = rand.dot(normal);
      var randPartInNormalDir = w.multiplyScalar(randLengthInNormalDir);
      u = normal;
      v = rand.clone();
      v.sub(randPartInNormalDir);
      v.normalize();
      //v = new THREE.Vector3();
      //v = v.crossVectors(normal, u);
      //console.log(normal);
      //console.log(u);
      //console.log(v);
      break;
    default:
      return null;
  }

  var planeU = new THREE.Vector3(0, 0, 1);
  var planeV = new THREE.Vector3(0, 1, 0);
  var geometryPlane = new THREE.PlaneGeometry(width, height, 1, 1);
  var meshPlane = new THREE.Mesh(geometryPlane, faceMat);
  Object3DUtil.alignToUpFrontAxes(meshPlane, planeU, planeV, u, v);
  Object3DUtil.placeObject3D(meshPlane, bb.centroid());
  return meshPlane;
};

Object3DUtil.makeGrid = function (width, height, numHGridLines, numVGridLines, faceColor) {

  var c = faceColor;
  if (!c) c = 0xdadada;

  var MAX_X = width / 2;
  var MIN_X = 0 - (width / 2);
  var MAX_Y = height / 2;
  var MIN_Y = 0 - (height / 2);

  var blockSizeH = height / numHGridLines;
  var blockSizeV = width / numVGridLines;

  var epsilon = 2;

  var geometryH = new THREE.Geometry();
  geometryH.vertices.push(new THREE.Vector3(MIN_X, MAX_Y, epsilon));
  geometryH.vertices.push(new THREE.Vector3(MAX_X, MAX_Y, epsilon));

  var geometryV = new THREE.Geometry();
  geometryV.vertices.push(new THREE.Vector3(MIN_X, MIN_Y, epsilon));
  geometryV.vertices.push(new THREE.Vector3(MIN_X, MAX_Y, epsilon));

  var lineMat = new THREE.LineBasicMaterial({
    color: 0xa0a0a0,
    opacity: 1
  });

  var faceMat = new THREE.MeshBasicMaterial({
    color: c, //0x575145,
    opacity: 1
  });
  var geometryPlane = new THREE.PlaneBufferGeometry(width, height, 1, 1);
  var meshPlane = new THREE.Mesh(geometryPlane, faceMat);

  var object3D = new THREE.Object3D();

  for (var iy = 0; iy <= numHGridLines; iy++) {
    var lineX = new THREE.Line(geometryH, lineMat);
    lineX.position.y = -iy * blockSizeH;
    object3D.add(lineX);
  }
  for (var ix = 0; ix <= numVGridLines; ix++) {
    var lineY = new THREE.Line(geometryV, lineMat);
    lineY.position.x = ix * blockSizeV;
    object3D.add(lineY);
  }

  object3D.add(meshPlane);
  object3D.name = 'Grid';
  object3D.userData.totalWidth = width;
  object3D.userData.totalHeight = height;
  object3D.userData.gridWidth = blockSizeV;
  object3D.userData.gridHeight = blockSizeH;
  object3D.userData.gridColor = faceColor;

  return object3D;
};

Object3DUtil.makeAxes = function (axisLength) {

  if (!axisLength) axisLength = 1*Constants.metersToVirtualUnit;

  var axes = new THREE.Object3D();

  //Shorten the vertex function
  function v(x, y, z) {
    return new THREE.Vector3(x, y, z);
  }

  //Create axis (point1, point2, colour)
  function createAxis(p1, p2, color) {
    var line, lineGeometry = new THREE.Geometry(),
      lineMat = new THREE.LineBasicMaterial({color: color, linewidth: 10});
    lineGeometry.vertices.push(p1, p2);
    line = new THREE.Line(lineGeometry, lineMat);
    axes.add(line);
  }

  createAxis(v(0, 0, 0), v(axisLength, 0, 0), 0xFF0000);
  createAxis(v(0, 0, 0), v(0, axisLength, 0), 0x00FF00);
  createAxis(v(0, 0, 0), v(0, 0, axisLength), 0x0000FF);

  return axes;
};

Object3DUtil.makeGround = function (width, height, color) {
  var geometry = new THREE.PlaneBufferGeometry(width, height);
  //geometry.verticesArray = geometry.attributes['position'].array;
  geometry.computeFaceNormals();
  var planeMaterial = new THREE.MeshBasicMaterial({ color: color || 0xffffff });
  //planeMaterial.ambient = planeMaterial.color;
  //planeMaterial.side = THREE.DoubleSide;
  var ground = new THREE.Mesh(geometry, planeMaterial);
  ground.castShadow = false;
  ground.receiveShadow = true;

  var object3D = new THREE.Object3D();
  object3D.add(ground);

  Object3DUtil.alignToUpFrontAxes(object3D, new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), Constants.worldUp, Constants.worldFront);

  return object3D;
};

Object3DUtil.makePickingPlane = function (width, height) {
  var geometry = new THREE.PlaneBufferGeometry(width, height);
  geometry.computeFaceNormals();
  var planeMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, visible: false });
  var ground = new THREE.Mesh(geometry, planeMaterial);
  ground.name = 'PickingPlane';
  ground.userData.width = width;
  ground.userData.heigth = height;
  Object3DUtil.alignToUpFrontAxes(ground, new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), Constants.worldUp, Constants.worldFront);
  return ground;
};

Object3DUtil.createGroundAndFog = function (scene) {
  var geometry = new THREE.PlaneBufferGeometry(100, 100);
  var planeMaterial = new THREE.MeshPhongMaterial({color: 0xffdd99});
  planeMaterial.color.offsetHSL(0, 0, 0.9);
  //planeMaterial.ambient = planeMaterial.color;
  var ground = new THREE.Mesh(geometry, planeMaterial);
  ground.scale.set(100, 100, 100);
  ground.castShadow = false;
  ground.receiveShadow = true;
  scene.add(ground);

  scene.fog = new THREE.Fog(0xffaa55, 1000, 3000);
  scene.fog.color.offsetHSL(0.02, -0.15, -0.65);
};

Object3DUtil.getBBoxForModelInstanceArray = function (models) {
  var r = new BBox();
  for (var i = 0; i < models.length; i++) {
    r.includeObject3D(models[i].model.object3D);
  }
  r.bboxDims = r.dimensions();
  r.width = r.bboxDims.x;
  r.height = r.bboxDims.z;
  r.depth = r.bboxDims.y;

  return r;
};

Object3DUtil.getColor = function (value) {
  return Colors.toColor(value);
};

Object3DUtil.createColor = function (id, palette) {
  return Colors.createColor(id, palette || Constants.defaultPalette);
};

Object3DUtil.getBasicMaterial = function (color, alpha) {
  return Materials.getBasicMaterial(color, alpha);
};

Object3DUtil.getMaterial = function (mat) {
  return Materials.toMaterial(mat);
};

Object3DUtil.getStandardMaterial = function (color, alpha) {
  return Materials.getStandardMaterial(color, alpha);
};

Object3DUtil.getSimpleFalseColorMaterial = function (id, color, palette) {
  return Materials.getSimpleFalseColorMaterial(id, color, palette);
};

Object3DUtil.addSimple2LightSetup = function (scene, position, doShadowMap) {
  position = position || new THREE.Vector3(-100, 100, 100);
  var ambient = new THREE.AmbientLight(0x050505);

  var light0 = new THREE.PointLight(0xdadacd, 0.85);
  var p0 = new THREE.Vector3();
  p0.copy(position);
  light0.position.copy(p0);
  var light1 = new THREE.PointLight(0x030309, 0.03);
  var p1 = new THREE.Vector3();
  p1.copy(position);
  p1.negate();
  light1.position.copy(p1);

  if (doShadowMap) {
    var light = Object3DUtil.createSpotLightShadowMapped(1000);
    light.position.copy(light0.position);
    light.onlyShadow = true;
    scene.add(light);
  }

  scene.add(ambient);
  scene.add(light0);
  scene.add(light1);
};

Object3DUtil.createSpotLightShadowMapped = function (lightBoxSize) {
  var light = new THREE.SpotLight(0xffffff, 1, 0, Math.PI, 1);
  light.target.position.set(0, 0, 0);

  light.castShadow = true;

  light.shadowCameraNear = 1;
  light.shadowCameraFar = lightBoxSize;
  light.shadowCameraRight = lightBoxSize;
  light.shadowCameraLeft = -lightBoxSize;
  light.shadowCameraTop = lightBoxSize;
  light.shadowCameraBottom = -lightBoxSize;
  light.shadowCameraFov = 50;

  light.shadowBias = 0.0001;
  light.shadowDarkness = 0.5;

  light.shadowMapWidth = 2048;
  light.shadowMapHeight = 2048;

  light.shadowCameraVisible = true;

  return light;
};

Object3DUtil.getTotalDims = function (models) {

  var total = new THREE.Vector3(0, 0, 0);

  for (var k = 0; k < models.length; k++) {
    var dims = models[k].getBBox().dimensions();
    total.add(dims);
  }

  return total;
};

Object3DUtil.getSortedModels = function (models, sizeBy) {
  if (!sizeBy) sizeBy = 'height';

  var sizes = [];
  for (var k = 0; k < models.length; k++) {
    var dims = models[k].getBBox().dimensions();
    sizes[k] = Object3DUtil.convertBbDimsToSize(dims, sizeBy);
  }
  var sortedIndices = _.sortWithIndices(sizes).sortedIndices;
  var sortedModels = [];
  for (var i = 0; i < sortedIndices.length; i++) {
    sortedModels[i] = models[sortedIndices[i]];
  }
  return sortedModels;
};

Object3DUtil.lineup = function (models, params) {
  params = params || {};
  var y = params.y || 0;
  // Spacing between objects
  var objectSpacing = params.objectSpacing || 0.00;
  // Ratio for computing spacing between objects (as parameter of total width)
  var objectSpacingRatio = params.objectSpacingRatio || 0.05;

  // Initialize
  var l = {};
  l.nModels = models.length;
  var bbBoxRefPoint = new THREE.Vector3(0.5, 0.5, 0);
  l.widths = [];
  l.heights = [];
  l.depths = [];
  l.maxDepth = 0;
  l.medianHeight = -1;
  l.sumWidth = 0;
  l.sumWidthWithGaps = 0;

  // Sort models by height
  var sizes = [];
  for (var k = 0; k < models.length; k++) {
    var dims = models[k].getBBox().dimensions();
    sizes[k] = dims.z;
  }
  l.sortedIndices = _.sortWithIndices(sizes).sortedIndices;

  // Loop over models and save dims
  for (var i = 0; i < l.nModels; i++) {
    var bbox = models[l.sortedIndices[i]].getBBox();
    var w = bbox.dimensions().x;
    var d = bbox.dimensions().y;
    var h = bbox.dimensions().z;
    l.widths[i] = w;
    l.heights[i] = h;
    l.depths[i] = d;
    if (d > l.maxDepth) l.maxDepth = d;
    l.sumWidth += w;
  }

  l.medianHeight = _.sortWithIndices(l.heights)[Math.round(models.length / 2)];
  var gapx = Math.max( l.sumWidth*objectSpacingRatio, objectSpacing );
  var sumWidthWithGaps = l.sumWidth + (l.nModels - 1)*gapx;
  var epsilon = l.sumWidth * 0.01;
  var startX = -sumWidthWithGaps / 2;
  var currCenter = new THREE.Vector3(startX, y + l.maxDepth / 2, 0);

  // Lineup in order from left to right
  for (var j = 0; j < l.nModels; j++) {
    var model = models[l.sortedIndices[j]];
    var halfWidthPlus = (l.widths[j] + epsilon) / 2;
    currCenter.x += halfWidthPlus;
    Object3DUtil.placeObject3D(model.object3D, currCenter, bbBoxRefPoint);
    currCenter.x += halfWidthPlus;
  }

  return l;
};

Object3DUtil.matrix4ToProto = function (m) {
  var array = [];
  for (var j = 0; j < 16; j++) {
    array.push(m.elements[j]);
  }
  var transform = {
    rows: 4,
    cols: 4,
    data: array
  };
  return transform;
};

Object3DUtil.vectorToString = function (v) {
  return v.x + ',' + v.y + ',' + v.z;
};

Object3DUtil.quaternionToString = function (v) {
  return v.x + ',' + v.y + ',' + v.z + "," + v.w;
};

Object3DUtil.toVector2 = function (v) {
  if (v) {
    if (v instanceof THREE.Vector2) {
      return v;
    } else if (typeof v === 'string') {
      // parse 0,0 into two pieces
      v = v.trim();
      if (v) {
        if ((v.startsWith('[') && v.endsWith(']')) || (v.startsWith('(') && v.endsWith(')'))) {
          v = v.substring(1, v.length - 1);
        }
        v = _.replaceAll(v, '\\,', ',');
        var p = v.split(/\s*,\s*/, 2).map( function(x) { return parseFloat(x); });
        if (p.length === 2) {
          return new THREE.Vector2(p[0], p[1]);
        } else {
          console.error('Cannot convert object to Vector2', v);
          return null;
        }
      }
    } else if (v.x != undefined && v.y != undefined) {
      return new THREE.Vector2(v.x, v.y);
    } else if (v.count || v.length) {
      return new THREE.Vector2(v[0], v[1]);
    } else {
      console.error('Cannot convert object to Vector2', v);
      return null;
    }
  }
};

Object3DUtil.toVector3 = function (v) {
  if (v) {
    if (v instanceof THREE.Vector3) {
      return v;
    } else if (typeof v === 'string') {
      // parse 0,0,0 into three pieces
      v = v.trim();
      if (v) {
        if ((v.startsWith('[') && v.endsWith(']')) || (v.startsWith('(') && v.endsWith(')'))) {
          v = v.substring(1, v.length - 1);
        }
        v = _.replaceAll(v, '\\,', ',');
        var p = v.split(/\s*,\s*/, 3).map( function(x) { return parseFloat(x); });
        if (p.length === 3) {
          return new THREE.Vector3(p[0], p[1], p[2]);
        } else {
          console.error('Cannot convert object to Vector3', v);
          return null;
        }
      }
    } else if (v.x != undefined && v.y != undefined && v.z != undefined) {
      return new THREE.Vector3(v.x, v.y, v.z);
    } else if (v.count || v.length) {
      return new THREE.Vector3(v[0], v[1], v[2]);
    } else {
      console.error('Cannot convert object to Vector3', v);
      return null;
    }
  }
};

Object3DUtil.toQuaternion = function (v) {
  if (v) {
    if (v instanceof THREE.Quaternion) {
      return v;
    } else if (typeof v === 'string') {
      // parse 0,0,0,0 into four pieces
      v = v.trim();
      if (v) {
        if ((v.startsWith('[') && v.endsWith(']')) || (v.startsWith('(') && v.endsWith(')'))) {
          v = v.substring(1, v.length - 1);
        }
        v = _.replaceAll(v, '\\,', ',');
        var p = v.split(/\s*,\s*/, 4).map( function(x) { return parseFloat(x); });
        if (p.length === 3) {
          return new THREE.Quaternion(p[0], p[1], p[2], p[3]);
        } else {
          console.error('Cannot convert object to Quaternion', v);
          return null;
        }
      }
    } else if (v.x != undefined && v.y != undefined && v.z != undefined && v.w != undefined) {
      return new THREE.Quaternion(v.x, v.y, v.z, v.w);
    } else if (v.count || v.length) {
      return new THREE.Quaternion(v[0], v[1], v[2], v[3]);
    } else {
      console.error('Cannot convert object to Quaternion', v);
      return null;
    }
  }
};

Object3DUtil.toBBox = function(b) {
  if (b) {
    if (b instanceof BBox) {
      return b;
    } else if (b.min && b.max) {
      return new BBox(Object3DUtil.toVector3(b.min), Object3DUtil.toVector3(b.max));
    } else {
      console.error('Cannot convert object to BBox', b);
      return null;
    }
  }
}

Object3DUtil.toBox2 = function(b) {
  if (b) {
    if (b instanceof THREE.Box2) {
      return b;
    } else if (b.min && b.max) {
      return new BBox(Object3DUtil.toVector3(b.min), Object3DUtil.toVector3(b.max));
    } else {
      console.error('Cannot convert object to Box2', b);
      return null;
    }
  }
}


Object3DUtil.toBox3 = function(b) {
  if (b) {
    if (b instanceof THREE.Box3) {
      return b;
    } else if (b.min && b.max) {
      return new BBox(Object3DUtil.toVector2(b.min), Object3DUtil.toVector2(b.max));
    } else {
      console.error('Cannot convert object to Box3', b);
      return null;
    }
  }
}

Object3DUtil.arrayToMatrix4 = function(m, isRowMajor) {
  var matrix = new THREE.Matrix4();
  if (m.length === 16) {
    if (isRowMajor) {
      matrix.set(
        m[0], m[1], m[2], m[3],
        m[4], m[5], m[6], m[7],
        m[8], m[9], m[10], m[11],
        m[12], m[13], m[14], m[15]);
    } else {
      matrix.set(
        m[0], m[4], m[8], m[12],
        m[1], m[5], m[9], m[13],
        m[2], m[6], m[10], m[14],
        m[3], m[7], m[11], m[15]);
    }
  } else if (m.length === 9) {
    if (isRowMajor) {
      matrix.set(
        m[0], m[1], m[2], 0,
        m[3], m[4], m[5], 0,
        m[6], m[7], m[8], 0,
        0, 0, 0, 1);
    } else {
      matrix.set(
        m[0], m[3], m[6], 0,
        m[1], m[4], m[7], 0,
        m[2], m[5], m[8], 0,
        0, 0, 0, 1);
    }
  } else {
    console.warn('Invalid array length: ' + m.length);
  }
  return matrix;
};

Object3DUtil.isColinearVec2 = function(p1,p2,p3) {
  var a = Math.abs((p1.y - p2.y) * (p1.x - p3.x) - (p1.y - p3.y) * (p1.x - p2.x));
  return (a < 0.00000001);
};

Object3DUtil.isColinearVec3 = function(p1,p2,p3) {
  // Check if cross product is 0
  var v12 = new THREE.Vector3();
  v12.subVectors(p1, p2);
  var v13 = new THREE.Vector3();
  v13.subVectors(p1, p3);
  var z = new THREE.Vector3();
  z.crossVectors(v12, v13);
  return (z.lengthSq() < 0.00000001);
};

Object3DUtil.stringifyReplacer = function (key, value) {
  if (value instanceof THREE.Material) {
    return Materials.getMaterialParams(value);
  } else if (value instanceof THREE.Texture) {
    return Materials.getTextureParams(value);
  } else if (value instanceof THREE.Color) {
    return value.getHex().toString(16);
  } else {
    return value;
  }
};

Object3DUtil.toObjStr = function (prefix, v) {
  var p = prefix;
  if (v instanceof THREE.Vector3) {
    return p + ' ' + v.x + ' ' + v.y + ' ' + v.z;
  } else if (v instanceof Array) {
    return p + ' ' + v.join(' ');
  } else {
    return null;
  }
};


Object3DUtil.loadTexture = function (url, mapping, onLoad, onError) {
  return Materials.loadTexture({ url: url, mapping: mapping, onLoad: onLoad, onError: onError });
};

// DFS traversal of node
// callback1 is applied before children are visited (children are visited only if callback1 returns true)
// callback2 is applied after children are visited
Object3DUtil.traverse = function (node, callback1, callback2) {
  var processChildren = callback1(node);
  if (processChildren) {
    for (var i = 0, l = node.children.length; i < l; i++) {
      Object3DUtil.traverse(node.children[i], callback1, callback2);
    }
  }
  if (callback2) {
    callback2(node);
  }
};

Object3DUtil.traverseMeshes = function (object3D, nonrecursive, callback) {
  Object3DUtil.traverse(
    object3D,
    function (node) {
      if (node instanceof THREE.Mesh) {
        callback(node);
        return true;
      } else if (node instanceof THREE.Object3D) {
        if (object3D === node) return true;
        else if (nonrecursive) {
          // Skip if has modelInstance
          if ((node.metadata && node.metadata.modelInstance) || (node.userData && node.userData.hasOwnProperty('objectIndex'))) {
            return false;
          }
        }
      }
      return true;
    });
};

Object3DUtil.traverseVisibleMeshes = function (object3D, nonrecursive, callback) {
  Object3DUtil.traverse(
    object3D,
    function (node) {
      if (node instanceof THREE.Mesh) {
        if (node.visible) {
          callback(node);
          return true;
        }
      } else if (node instanceof THREE.Object3D) {
        if (object3D === node) return node.visible;
        else if (nonrecursive) {
          // Skip if has modelInstance
          if ((node.metadata && node.metadata.modelInstance) || (node.userData && node.userData.hasOwnProperty('objectIndex'))) {
            return false;
          }
        }
      }
      return node.visible;
    });
};

Object3DUtil.existsMesh = function (object3D, nonrecursive, callback) {
  var exists = false;
  Object3DUtil.traverse(
    object3D,
    function (node) {
      if (node instanceof THREE.Mesh) {
        exists = callback(node);
        return !exists;
      } else if (node instanceof THREE.Object3D) {
        if (object3D === node) return true;
        else if (nonrecursive) {
          // Skip if has modelInstance
          if ((node.metadata && node.metadata.modelInstance) || (node.userData && node.userData.hasOwnProperty('objectIndex'))) {
            return false;
          }
        }
      }
      return !exists;
    });
  return exists;
};

Object3DUtil.getIndexedObject3Ds = function (object3D) {
  var objects = [];
  Object3DUtil.traverse(
    object3D,
    function (node) {
      if (node instanceof THREE.Object3D) {
        if (node.userData && node.userData.hasOwnProperty('objectIndex')) {
          objects[node.userData['objectIndex']] = node;
        }
      }
      return true;
    });
  return objects;
};

Object3DUtil.traverseModelInstances = function (modelInstance, callback) {
  Object3DUtil.traverse(
    modelInstance.object3D,
    function (node) {
      if (node instanceof THREE.Object3D) {
        if (modelInstance.object3D === node) return true;
        if (node.metadata && node.metadata.modelInstance) {
          callback(node.metadata.modelInstance);
        }
      }
      return true;
    });
};

Object3DUtil.isDescendantOf = function (candidate, object3D) {
  var isDesc = false;
  if (object3D instanceof Array) {
    for (var i = 0; i < object3D.length; i++) {
      isDesc = Object3DUtil.isDescendantOf(candidate, object3D[i]);
      if (isDesc) {
        break;
      }
    }
  } else {
    Object3DUtil.traverse(
      object3D,
      function (node) {
        if (candidate === node) {
          isDesc = true;
          return false;
        } else {
          return true;
        }
      }
    );
  }
  return isDesc;
};

Object3DUtil.deepClone = function(object3D) {
  // Deep clone that makes a copy of the geometry as well
  var clone = object3D.clone();
  clone.traverse(function (node) {
    if (node instanceof THREE.Mesh) {
      var newGeom = GeometryUtil.clone(node.geometry);
      node.geometry = newGeom;
    }
  });
  return clone;
};

Object3DUtil.copyObjectWithModelInstances = function (origObject, modelInstances, keepOldIndices, indexField) {
  indexField = indexField || 'objectIndex';
  // Clone object
  Object3DUtil.revertMaterials(origObject);
  origObject.updateMatrixWorld();
  var clonedObject = origObject.clone();

  // we want the cloned object to be detached, so set its matrix transform to its matrixWorld
  // and update position, quaternion and scale so the matrix is retained.
  clonedObject.matrix = clonedObject.matrixWorld.clone();
  clonedObject.matrix.decompose(clonedObject.position, clonedObject.quaternion, clonedObject.scale);
  clonedObject.updateMatrixWorld();

  // Make sure attached model instance information is properly copied as well
  var clonedModelInstances = [];
  Object3DUtil.traverse(clonedObject, function (node) {
    if (node.userData.type === 'ModelInstance') {
      var objectIndex = node.userData[indexField];
      var modelInstance = modelInstances[objectIndex].clone(node);
      node.metadata = {modelInstance: modelInstance};

      var nextIndex = (keepOldIndices)? objectIndex : clonedModelInstances.length;
      modelInstance.index = nextIndex;
      node.index = nextIndex;
      node.userData[indexField] = nextIndex;
      clonedModelInstances[nextIndex] = modelInstance;
    }
    return true;
  });

  return {
    object: clonedObject,
    modelInstances: clonedModelInstances
  };
};

Object3DUtil.findModelInstances = function (object3D, modelInstances, indexField) {
  modelInstances = modelInstances || [];

  Object3DUtil.traverse(object3D, function (node) {
    if (node.userData.type === 'ModelInstance') {
      if (indexField) {
        node.userData[indexField] = modelInstances.length;
      }
      modelInstances.push(node.metadata.modelInstance);
    }
    return true;
  });

  return modelInstances;
};

Object3DUtil.detachModelInstances = function (modelInstance, detachAll, scene) {
  var modelInstances = Object3DUtil.findModelInstances(modelInstance.object3D);
  var detached = [];
  for (var i = 0; i < modelInstances.length; i++) {
    var mi = modelInstances[i];
    if (mi.index !== modelInstance.index) {
      var parent = mi.object3D.parent;
      var parentInstance = Object3DUtil.getModelInstance(parent);
      var detach = detachAll || parentInstance.index === mi.index;
      if (detach) {
        Object3DUtil.detachFromParent(mi.object3D, scene);
        detached.push(mi);
      }
    }
  }
  return detached;
};


Object3DUtil.clearCache = function (object3D) {
  Object3DUtil.traverse(
    object3D,
    function (node) {
      delete node.cached;
      return true;
    });
};

Object3DUtil.dispose = function(parentObject) {
  parentObject.traverse(function (node) {
    if (node instanceof THREE.Mesh) {
      if (node.geometry) {
        node.geometry.dispose();
      }

      if (node.material) {

        if (node.material instanceof THREE.MultiMaterial) {
          node.material.materials.forEach(function (mtrl, idx) {
            if (mtrl.map) mtrl.map.dispose();
            if (mtrl.lightMap) mtrl.lightMap.dispose();
            if (mtrl.bumpMap) mtrl.bumpMap.dispose();
            if (mtrl.normalMap) mtrl.normalMap.dispose();
            if (mtrl.specularMap) mtrl.specularMap.dispose();
            if (mtrl.envMap) mtrl.envMap.dispose();

            mtrl.dispose();    // disposes any programs associated with the material
          });
        }
        else {
          if (node.material.map) node.material.map.dispose();
          if (node.material.lightMap) node.material.lightMap.dispose();
          if (node.material.bumpMap) node.material.bumpMap.dispose();
          if (node.material.normalMap) node.material.normalMap.dispose();
          if (node.material.specularMap) node.material.specularMap.dispose();
          if (node.material.envMap) node.material.envMap.dispose();

          node.material.dispose();   // disposes any programs associated with the material
        }
      }
    }
  });
};

Object3DUtil.getModelInstance = function (object3D, searchAncestors) {
  if (!object3D) return;
  if (object3D.metadata && object3D.metadata.modelInstance) {
    return object3D.metadata.modelInstance;
  }
  if (searchAncestors) {
    var modelInstance = undefined;
    Object3DUtil.traverseAncestors(object3D, function(obj) {
      if (obj.metadata && obj.metadata.modelInstance) {
        modelInstance = obj.metadata.modelInstance;
        return false;
      } else {
        return true;
      }
    });
    return modelInstance;
  }
};

Object3DUtil.traverseAncestors = function(object3D, callback) {
  var parent = object3D.parent;
  if ( parent != null ) {
    var continueTraversal = callback( parent );
    if (continueTraversal) {
      Object3DUtil.traverseAncestors(parent, callback);
    }
  }
};

// Find nodes that returns true for the given filter
Object3DUtil.findNodes = function(object3D, filter) {
  var nodes = [];
  Object3DUtil.traverse(
    object3D,
    function (node) {
      if (filter(node)) {
        nodes.push(node);
      }
      return true;
  });
  return nodes;
};

Object3DUtil.removeNodes = function(node, filter) {
  var matches = Object3DUtil.findNodes(node, filter);
  for (var i = 0; i < matches.length; i++) {
    var match = matches[i];
    match.parent.remove(match);
  }
  return matches;
};


// Return object with minimum distance
Object3DUtil.getMinDistanceToObjectBBoxes = function(object3Ds, points, opt) {
  var minDist = Infinity;
  var index = null;
  //console.log('length', object3Ds.length);
  for (var i = 0; i < object3Ds.length; i++) {
    var o = object3Ds[i];
    var bbox = Object3DUtil.getBoundingBox(o);
    var dists = _.map(points, function(point) { return bbox.distanceToPoint(point, opt); });
    //console.log('dists', dists);
    var dist = _.min(dists);
    if (dist < minDist) {
      //console.log('dist ', dist, o.userData);
      minDist = dist;
      index = i;
    }
  }
  return { dist: minDist, index: i };
};

Object3DUtil.removeAllChildren = function (object3D) {
  while (object3D.children.length > 0) {
    object3D.remove(object3D.children[0]);
  }
};

Object3DUtil.setVisible = function (object, visible, recursive) {
  if (object) {
    object.visible = visible;
    if (recursive) {
      object.traverse(function(x) {
        x.visible = visible;
      });
    }
  }
};

Object3DUtil.setChildrenVisible = function (object, isVisible) {
  if (object) {
    for (var i = 0; i < object.children.length; i++) {
      var c = object.children[i];
      c.visible = isVisible(c);
    }
  }
};

Object3DUtil.setState = function (object, field, value, filter) {
  if (object) {
    Object3DUtil.traverse(object, function (node) {
      if (!filter || filter(node)) {
        node.userData[field] = value;
        return true;
      }
    });
  }
};

Object3DUtil.getMeshList = function (object, recursive, meshes) {
  meshes = meshes || [];
  Object3DUtil.traverseMeshes(
    object,
    !recursive,
    function (mesh) {
      meshes.push(mesh);
    }
  );
  return meshes;
};

Object3DUtil.getVisibleMeshList = function (object, recursive, meshes) {
  meshes = meshes || [];
  Object3DUtil.traverseVisibleMeshes(
    object,
    !recursive,
    function (mesh) {
      meshes.push(mesh);
    }
  );
  return meshes;
};

// Be careful when using function below....
Object3DUtil.getMeshes = function (object, recursive) {
  var meshes = {
    list: [],
    map: {}
  };
  Object3DUtil.traverseMeshes(
    object,
    !recursive,
    function (mesh) {
      if (mesh.userData && mesh.userData.hasOwnProperty('index')) {
        meshes.list[mesh.userData.index] = mesh;
      } else {
        meshes.list.push(mesh);
      }
      meshes.map[mesh.id] = mesh;
    }
  );
  return meshes;
};

Object3DUtil.findClosestBBFaceByOutNormal = function (outNorm, threshold) {
  if (threshold === undefined) {
    threshold = 0.99;
  }
  for (var i = 0; i < Object3DUtil.OutNormals.length; i++) {
    var norm = Object3DUtil.OutNormals[i];
    if (outNorm.dot(norm) >= threshold) {
      return i;
    }
  }
  return -1;
};

Object3DUtil.findClosestBBFaceByInNormal = function (inNorm, threshold) {
  if (threshold === undefined) {
    threshold = 0.99;
  }
  for (var i = 0; i < Object3DUtil.InNormals.length; i++) {
    var norm = Object3DUtil.InNormals[i];
    if (inNorm.dot(norm) >= threshold) {
      return i;
    }
  }
  return -1;
};

// segments is a array of segments
//  Each segment can have one of the following formats:
//   a. array of meshTri: [...]
//   b. object with field meshTri: { meshTri: array of meshTri }
//   c. object with meshTri fields: {meshIndex: x, triIndex: [...] }
//  Each meshTri has following fields: {meshIndex: x, triIndex: [...] }
Object3DUtil.remeshObject = function (object, segments, material) {
  // Get remesh of the object
  var origMeshes = Object3DUtil.getMeshes(object);
  origMeshes = origMeshes.list;

  // Clone the relevant mesh
  var remeshedObj = new THREE.Object3D();
  remeshedObj.name = object.name + '-remeshed';
  for (var i = 0; i < segments.length; i++) {
    var segment = segments[i];
    var meshTris = [segment];  // Default to case c)
    if (segment.hasOwnProperty('meshTri')) {
      // Case b
      meshTris = segment['meshTri'];
    } else if (segment.length) {
      // Case a
      meshTris = segment;
    }
    var componentMeshes = [];

    for (var j = 0; j < meshTris.length; j++) {
      var meshTri = meshTris[j];
      var meshIndex = meshTri.meshIndex;
      var origMesh = (meshTri.mesh) ? meshTri.mesh : origMeshes[meshIndex];

      var componentMesh;
      if (meshTri.triIndex) {
        // Remesh with specific triangles
        componentMesh = GeometryUtil.extractMesh(origMesh, meshTri.triIndex);
      } else {
        // Just my mesh
        componentMesh = origMesh.clone();
      }

      // Get world transform from our parent
      // TODO: if there is a scene transform, it needs to be undone by the viewer...
      var parent = origMesh.parent;
      if (parent) {
        componentMesh.applyMatrix(parent.matrixWorld);
        componentMesh.matrixWorldNeedsUpdate = true;
      }
      if (material) {
        componentMesh.material = material;
      }
      componentMeshes.push(componentMesh);
    }

    var myMesh = GeometryUtil.mergeMeshes(componentMeshes);
    myMesh.name = (segment.id != undefined)? segment.id : object.name + '-remeshed-' + i;
    myMesh.userData = {
      id: (segment.id != undefined)? segment.id : 'mesh' + i,
      index: i
    };
    remeshedObj.add(myMesh);
  }
  // Clear out any __bufferGeometry
  for (var i = 0; i < origMeshes.length; i++) {
    delete origMeshes[i].__bufferGeometry;
  }
  return remeshedObj;
};

Object3DUtil.assignMultiMaterialToSegments = function (object, segments, createMaterialFn) {
  if (!createMaterialFn) {
    createMaterialFn = function(index, segment) {
      var material = Object3DUtil.getSimpleFalseColorMaterial(index);
      return material;
    };
  }
  // Get remesh of the object
  var origMeshes = Object3DUtil.getMeshes(object);

  // Clone the original meshes
  var materials = [];
  var multiMaterial = new THREE.MultiMaterial(materials);
  var remeshedObj = new THREE.Object3D();
  remeshedObj.name = object.name + '-remeshed';
  var clonedMeshes = _.map(origMeshes.list, function(x) {
    x.updateMatrixWorld();
    var cloned = x.clone();
    cloned.geometry = GeometryUtil.toGeometry(cloned.geometry);
    cloned.material = multiMaterial;
    cloned.matrix.copy(x.matrixWorld);
    cloned.matrixWorldNeedsUpdate = true;
    remeshedObj.add(cloned);
    return cloned;
  });

  for (var i = 0; i < segments.length; i++) {
    var segment = segments[i];
    materials[i] = createMaterialFn(i, segment);
    var meshTris = [segment];  // Default to case c)
    if (segment.hasOwnProperty('meshTri')) {
      // Case b
      meshTris = segment['meshTri'];
    } else if (segment.length) {
      // Case a
      meshTris = segment;
    }

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
//  vertToSegIndices is a mapping of vertex to segment index
Object3DUtil.remeshObjectUsingSegmentGroups = function (object, segmentGroups, vertToSegIndices, quiet) {
  // Go over segment groups
  var origMeshes = Object3DUtil.getMeshes(object);
  // Assumes just one mesh
  var origMesh = origMeshes.list[0];
  var segToTriIndices = GeometryUtil.segVertIndicesToSegTriIndices(origMesh, vertToSegIndices);
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
      var myMesh = GeometryUtil.extractMesh(origMeshBuffered, triIndices);
      var parent = origMesh.parent;
      if (parent) {
        myMesh.applyMatrix(parent.matrixWorld);
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

//  vertToSegIndices is a mapping of vertex index to a mapped segment index, negative segment indices are not used
Object3DUtil.copyAndRecolorVertices = function (object, vertToSegIndices, color) {
  // Go over segment groups
  var meshes = Object3DUtil.getMeshes(object);
  // Assumes just one mesh
  var mesh = meshes.list[0];
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
    if ( attributes.position ) {
      var positions = attributes.position.array;
      if (attributes.color === undefined) {
        geometry.addAttribute('color', new THREE.BufferAttribute(new Float32Array(positions.length), 3));
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
  var material = new THREE.MeshPhongMaterial({ vertexColors: THREE.VertexColors });
  var recolored = new THREE.Mesh(geometry, material);
  recolored.name = object.name + '-recolored';
  recolored.userData.segColors = colors;
  Object3DUtil.setMatrix(recolored, mesh.matrixWorld);
  return recolored;
};

Object3DUtil.getMeshMaterials = function(object3D) {
  // Returns a list of materials with mesh and material index;
  var materials = [];
  Object3DUtil.traverseMeshes(object3D, true, function (node) {
    if (node instanceof THREE.Mesh && node.material) {
      if (node.material instanceof THREE.MultiMaterial) {
        // Actual material definition is embedded in geometry...
        var mats = node.material.materials;
        for (var j = 0; j < mats.length; j++) {
          var m = mats[j];
          materials.push({ mesh: node, material: m, index: j });
        }
      } else {
        materials.push({ mesh: node, material: node.material, index: node.material.index });
      }
    }
  });
  return materials;
};

Object3DUtil.getMaterials = function (object3D) {
  // each entry of materials holds
  //   name: name of material
  //   material: actual material
  //   meshes: meshes with which the material is associated
  var materials = {};
  var count = 0;
  var allMeshes = [];
  var allMeshesWithTexture = [];
  var allMaterials = [];
  var allMaterialsWithTexture = [];

  function addMaterial(mesh, material) {
    var id = material.id;
    var name = material.name;
    if (id === undefined) {
      //noinspection JSUnresolvedVariable
      if (THREE.MaterialCount === undefined) {
        THREE.MaterialCount = 0;
      }
      id = THREE.MaterialCount++;
      material.id = id;
      console.log('Material without id (assigned id ' + id + ')');
    }
    if (name === undefined) {
      name = 'mat' + count;
      material.name = name;
      console.log('Material ' + id + ' without name (assigned name ' + name + ')');
    }
    var old = materials[id];
    if (old) {
      old.meshes.push(mesh);
    } else {
      materials[id] = {
        id: id,
        name: name,
        material: material,
        meshes: [mesh],
        type: 'material'
      };
    }
    allMaterials.push(id);
    allMeshes.push(mesh);
    if (material.map) {
      allMeshesWithTexture.push(mesh);
      allMaterialsWithTexture.push(id);
    }
    count++;
  }

  object3D.traverse(function (node) {
    if (node instanceof THREE.Mesh && node.material) {
      if (node.material instanceof THREE.MultiMaterial) {
        // Actual material definition is embedded in geometry...
        var meshFaceMaterial = node.material;
        var meshFaces = [];
        // Break down materials into individual faces...
        // TODO: Same as geometryGroups/geometryGroupsList in geometry?
        // If so, just use materialIndex instead of tracking the faceIndices...
        if (node.geometry.faces) {
          for (var j = 0; j < node.geometry.faces.length; j++) {
            var face = node.geometry.faces[j];
            var materialIndex = face.materialIndex;
            if (!meshFaces[materialIndex]) {
              meshFaces[materialIndex] = [j];
            } else {
              meshFaces[materialIndex].push(j);
            }
          }
        } else {
          var nFaces = GeometryUtil.getGeometryFaceCount(node.geometry);
          for (var j = 0; j < nFaces; j++) {
            var group = _.find(node.geometry.groups, function (g) {
              return (j >= g.start) && (j < g.start + g.count);
            });
            var materialIndex = group? group.materialIndex : 0;
            if (!meshFaces[materialIndex]) {
              meshFaces[materialIndex] = [j];
            } else {
              meshFaces[materialIndex].push(j);
            }
          }
        }
        for (var i = 0; i < meshFaceMaterial.materials.length; i++) {
          if (meshFaces.length > 0) {
            addMaterial({mesh: node, faceIndices: meshFaces[i], materialIndex: i}, meshFaceMaterial.materials[i]);
          }
        }
      } else {
        addMaterial(node, node.material);
      }
    }
  });
  materials['all'] = {
    id: 'all', name: 'All', type: 'material_set',
    meshes: allMeshes, materials: allMaterials
  };
  materials['textured'] = {
    id: 'textured', name: 'Textured', type: 'material_set',
    meshes: allMeshesWithTexture, materials: allMaterialsWithTexture
  };
  return materials;
};

Object3DUtil.getSceneGraphPath = function (node, parentRoot) {
  // Follow up to parents
  var path = [];
  var parent = node;
  var child;
  while (parent && parent !== parentRoot) {
    var name = parent.id;
    if (parent['userData']) {
      var userdata = parent.userData;
      if (userdata.hasOwnProperty('id')) {
        name = userdata['id'];
      }
    }
    if (child) {
      name = name + '[' + parent.children.indexOf(child) + ']';
    }
    path.push(name);
    // Go up
    child = parent;
    parent = parent.parent;
  }
  path.reverse();
  if (path.length > 0) {
    return '/' + path.join('/');
  } else {
    return '';
  }
};

Object3DUtil.getNodeFromSceneGraphPath = function (parentRoot, path) {
  if (typeof (path) === 'string') {
    path = path.split('/');
  }
  if (path[0] === '') {
    path.shift();
  }
  var parent = parentRoot.children[0];
  var regex = /^(.*)\[(\d+)\]$/;
  for (var i = 0; i < path.length; i++) {
    var userdata = parent.userData;
    var name = '';
    if (userdata.hasOwnProperty('id')) {
      name = userdata['id'];
    }
    var matched = regex.exec(path[i]);
    if (matched) {
      var ci = matched[2];
      var child = parent.children[ci];
      if (!child) {
        console.warn('Cannot find child ' + path[i]);
        break;
      }
      if (matched[1] !== name) {
        console.warn('Name does not match: expected ' + matched[1] + ', actual ' + name);
      }
      parent = child;
    } else {
      if (i < path.length - 1) {
        console.warn('Exiting search for ' + path);
      }
      break;
    }
  }
  if (i >= path.length - 1) {
    return parent;
  } else {
    return null;
  }
};

Object3DUtil.findMaterials = function(object3D, nonrecursive, materialFilter) {
  var materials = [];
  Object3DUtil.traverseMeshes(object3D, nonrecursive, function(mesh) {
    //console.log('traverse', mesh);
    var material = mesh.material;
    if (material instanceof THREE.MultiMaterial) {
      for (var i = 0; i < material.materials.length; i++) {
        var mat = material.materials[i];
        if (materialFilter(mat)) {
          materials.push({
            mesh: mesh,
            material: mat,
            setMaterial: function(index, newMat) {
              material.materials[index] = newMat;
            }.bind(mesh, i)
          });
        }
      }
    } else {
      if (materialFilter(material)) {
        materials.push({
          mesh: mesh,
          material: material,
          setMaterial: function(newMat) {
            mesh.material = newMat;
          }.bind(mesh)
        });
      }
    }
  });
  return materials;
};

Object3DUtil.addMirrors = function(object3D, opts) {
  var mirrors = [];
  Object3DUtil.traverseMeshes(object3D, false, function(mesh) {
    //console.log('Check for mirror material', object3D);
    // Find materials with mirror
    var mirrorMatName = opts.mirrorMaterialName || 'mirror';
    var mirrorMats = Object3DUtil.findMaterials(mesh, true, opts.filterMaterial || function (m) {
        //console.log('check ' + m.name, m);
        return m.name === mirrorMatName && !m.map;
      });

    // Check if it has material with name video
    var hasMirror = mirrorMats.length > 0;
    if (hasMirror) {
      var Mirror = require('capabilities/Mirror');
      _.each(mirrorMats, function(mat) {
        mesh.mirror = new Mirror(_.defaults({object3D: mesh, mirrorMaterials: [mat], color: mat.material.color}, opts));
        mirrors.push(mesh.mirror);
      });
    }
  });
  return mirrors;
};

Object3DUtil.addVideoPlayer = function(object3D, opts) {
  //console.log('Check for video capability', object3D);
  // Find materials with video
  var videoMatName = opts.videoMaterialName || 'video';
  var videoMats = Object3DUtil.findMaterials(object3D, true, opts.filterMaterial || function(m) {
    //console.log('check ' + m.name, m);
    return m.name === videoMatName;
  });

  // Check if it has material with name video
  var hasVideo = videoMats.length > 0;
  if (hasVideo) {
    var VideoPlayer = require('capabilities/VideoPlayer');
    object3D.videoPlayer = new VideoPlayer({
      object3D: object3D,
      videoMaterials: videoMats,
      assetManager: opts.assetManager
    });
  }
  return object3D.videoPlayer;
};

// TODO(MS): Experimental function to push transform to leaf-like nodes
Object3DUtil.pushWorldTransformToMeshes = function (object3D) {
  Object3DUtil.traverse(object3D, function (node) {
    if (node instanceof THREE.Mesh || node instanceof THREE.Light) {
      Object3DUtil.setMatrix(node, node.matrixWorld);
      return false;
    }
    return true;
  }, function (node) {
    var isStop = node instanceof THREE.Mesh || node instanceof THREE.Light;
    if (!isStop) {
      Object3DUtil.setMatrix(node, new THREE.Matrix4());
    }
  });
};

Object3DUtil.findLights = function(object3D) {
  return Object3DUtil.findNodes(object3D, function (node) {
    return node instanceof THREE.Light;
  });
};

Object3DUtil.setLights = function (object3D, flag) {
  var lights = Object3DUtil.findLights(object3D);
  for (var i = 0; i < lights.length; ++i) {
    var l = lights[i];
    l.userData.isOn = flag;
    if (l.userData.isOn) {
      l.intensity = l.userData.intensity;
    } else {
      l.intensity = 0;
    }
  }
  return lights.length;
};

Object3DUtil.setMaterialState = function (object3D, matOverrides, flag) {
  if (!matOverrides) { return; }
  // overrides for emissive surfaces and shade transparency
  function setMatState(meshMaterial, matIndex) {
    //console.log(matIndex);
    if (matOverrides.emissive && matOverrides.emissive.indexOf(matIndex) >= 0) {
      //console.log('emissive', matIndex);
      if (flag) {
        meshMaterial.emissive.set(0xFFFF00);
        meshMaterial.emissiveIntensity = 5;
      } else {
        meshMaterial.emissive.set(0x000000);
        meshMaterial.emissiveIntensity = 0;
      }
    }
    if (matOverrides.shade && matOverrides.shade.indexOf(matIndex) >= 0) {
      if (!meshMaterial.defaults) {
        meshMaterial.defaults = {
          opacity: meshMaterial.opacity, transparent: meshMaterial.transparent
        };
      }
      if (flag) {
        meshMaterial.transparent = true;
        meshMaterial.opacity = 0.9;
      } else {
        meshMaterial.transparent = meshMaterial.defaults.transparent;
        meshMaterial.opacity = meshMaterial.defaults.opacity;
      }
    }
  }

  Object3DUtil.traverseMeshes(object3D, true, function (mesh) {
    if (mesh.material instanceof THREE.MultiMaterial) {
      for (var i = 0, l = mesh.material.materials.length; i < l; i++) {
        var meshMaterial = mesh.material.materials[i];
        setMatState(meshMaterial, i);
      }
    } else if (mesh.material.index != undefined) {
      setMatState(mesh.material, mesh.material.index);
    }
  });
};

Object3DUtil.setCapability = function(object3D, name, flag) {
  if (!object3D.userData.capabilities) {
    object3D.userData.capabilities = {};
  }
  object3D.userData.capabilities[name] = flag;
};

Object3DUtil.getCapability = function(object3D, name, defaultValue) {
  var v;
  if (object3D.userData.capabilities) {
    v = object3D.userData.capabilities[name];
    if (v != undefined) {
      return v;
    }
  }
  if (defaultValue != undefined) {
    if (typeof defaultValue === "function") {
      v = defaultValue();
    } else {
      v = defaultValue;
    }
    Object3DUtil.setCapability(object3D, name, v || false);
    return v;
  }
};

Object3DUtil.getCapabilities = function(object3D) {
  return object3D.userData.capabilities;
};

Object3DUtil.addSphere = function (scene, centerTo, size, materialOrColor) {
  size = size || 10;
  var sphereGeo = new THREE.SphereGeometry(size);
  var material = Object3DUtil.getMaterial(materialOrColor);
  var mesh = new THREE.Mesh(sphereGeo, material);
  mesh.position.copy(centerTo);
  scene.add(mesh);
};

Object3DUtil.setCylinderDirection = function (obj, dir) {
  // Assumes dir is normalized
  if (dir.y > 0.99999) {
    obj.quaternion.set(0, 0, 0, 1);
  } else if (dir.y < -0.99999) {
    obj.quaternion.set(1, 0, 0, 0);
  } else {
    var axis = new THREE.Vector3();
    axis.set(dir.z, 0, -dir.x).normalize();
    var radians = Math.acos(dir.y);
    obj.quaternion.setFromAxisAngle(axis, radians);
  }
};

Object3DUtil.makeColumn = function (basePoint, columnDir, height, width, materialOrColor) {
  width = width || 10;
  var cylinderGeo = new THREE.CylinderGeometry(width, width, height);
  var material = Object3DUtil.getMaterial(materialOrColor);
  var mesh = new THREE.Mesh(cylinderGeo, material);
  mesh.name = 'Column';
  var centerTo = basePoint.clone().add(columnDir.clone().multiplyScalar(height / 2));
  Object3DUtil.setCylinderDirection(mesh, columnDir);
  mesh.position.copy(centerTo);
  return mesh;
};

Object3DUtil.addColumn = function (scene, basePoint, columnDir, height, width, materialOrColor) {
  var column = Object3DUtil.makeColumn(basePoint, columnDir, height, width, materialOrColor);
  scene.add(column);
};

Object3DUtil.makeCylinder = function (start, end, width, materialOrColor) {
  var columnDir = end.clone().sub(start).normalize();
  var height = start.distanceTo(end);
  var cylinderGeo = new THREE.CylinderGeometry(width, width, height);
  var material = Object3DUtil.getMaterial(materialOrColor);
  var mesh = new THREE.Mesh(cylinderGeo, material);
  mesh.name = 'Cylinder';
  var centerTo = start.clone().add(end).multiplyScalar(0.5);
  Object3DUtil.setCylinderDirection(mesh, columnDir);
  mesh.position.copy(centerTo);
  return mesh;
};

Object3DUtil.makeBall = function (origin, radius, materialOrColor) {
  var ballGeo = new THREE.SphereBufferGeometry(radius);
  var material = Object3DUtil.getMaterial(materialOrColor);
  var mesh = new THREE.Mesh(ballGeo, material);
  mesh.name = 'Ball';
  mesh.position.copy(origin);
  return mesh;
};

Object3DUtil.makeBalls = function (points, radius, materialOrColor, name, group) {
  name = name || 'Ball';
  group = group || new THREE.Group();
  for (var i = 0; i < points.length; i++) {
    var ball = Object3DUtil.makeBall(points[i], radius, materialOrColor);
    ball.name = name + i;
    group.add(ball);
  }
  return group;
};

Object3DUtil.makeBoxFromToOrientation = function (from, to, orientation, size, materialOrColor) {
  var dist = to.distanceTo(from); // * 0.5;
  var center = from.clone().add(to).multiplyScalar(0.5);

  var boxGeo = new THREE.BoxGeometry(dist, size, size);
  var material = Object3DUtil.getMaterial(materialOrColor);
  var mesh = new THREE.Mesh(boxGeo, material);
  mesh.setRotationFromQuaternion(orientation);
  mesh.position.copy(center);
  return mesh;
};

Object3DUtil.makeWall = function (baseStart, baseEnd, wallUpDir, height, depth, materialOrColor) {
  depth = depth || 10;
  var width = baseEnd.distanceTo(baseStart);
  // x = width, y = height, z = depth
  // Build box geo
  var boxGeo = new THREE.BoxGeometry(width, height, depth);
  var material = Object3DUtil.getMaterial(materialOrColor);
  var mesh = new THREE.Mesh(boxGeo, material);
  mesh.name = 'Wall';

  // Take start --> end to be right, front to be normal
  var startToEnd = baseEnd.clone().sub(baseStart).normalize();
  var wallFrontDir = new THREE.Vector3();
  wallFrontDir.crossVectors(startToEnd, wallUpDir).normalize();
  var alignMatrix = Object3DUtil.getAlignmentMatrix(new THREE.Vector3(0,1,0), new THREE.Vector3(0,0,1),
    wallUpDir, wallFrontDir);

  var centerTo = baseStart.clone().add(baseEnd).multiplyScalar(0.5);
  centerTo.add(wallUpDir.clone().multiplyScalar(height / 2));
  alignMatrix.setPosition(centerTo);

  Object3DUtil.setMatrix(mesh, alignMatrix);
  return mesh;
};

// Make geometry for one pieces of a wall
Object3DUtil.__makeWallWithHolesGeometry = function(opts) {
  var holes = opts.holes;
  var height = opts.height;
  var depth = opts.depth;
  var width = opts.width;

  var initialHeight = opts.initialHeight;
  var initialWidth = opts.initialWidth;

  var wdelta = (width - initialWidth) / 2;

  // Assume holes are disjoint
  // Split holes into outside (on border) and inside holes (inside wall)
  var outsideHoles = [];
  var leftHoles = [], rightHoles = [], topHoles = [], bottomHoles = [];
  var insideHoles = [];
  if (holes) {
    for (var iHole = 0; iHole < holes.length; iHole++) {
      var hole = holes[iHole];
      if (hole.min.x <= 0 && hole.max.x < initialWidth) {
        leftHoles.push(hole);
        outsideHoles.push(hole);
      } else if (hole.min.x > 0 && hole.max.x >= initialWidth) {
        rightHoles.push(hole);
        outsideHoles.push(hole);
      } else if (hole.min.y <= 0 && hole.max.y < initialHeight) {
        bottomHoles.push(hole);
        outsideHoles.push(hole);
      } else if (hole.min.y > 0 && hole.max.y >= initialHeight) {
        topHoles.push(hole);
        outsideHoles.push(hole);
      } else {
        insideHoles.push(hole);
      }
    }
  }

  var wallShape = new THREE.Shape();
  if (outsideHoles.length > 0) {
    //console.log('processing outside holes', bottomHoles, rightHoles, topHoles, leftHoles);
    bottomHoles = _.sortBy(bottomHoles, function(hole) { return hole.min.x; });
    rightHoles = _.sortBy(rightHoles, function(hole) { return hole.max.y; });
    topHoles = _.sortBy(topHoles, function(hole) { return -hole.max.x; });
    leftHoles = _.sortBy(leftHoles, function(hole) { return -hole.max.y; });

    // Start at lower left
    wallShape.moveTo(0, 0);

    // Process bottom holes
    for (var i = 0; i < bottomHoles.length; i++) {
      var hole = bottomHoles[i];
      wallShape.lineTo(wdelta + hole.min.x, 0);
      wallShape.lineTo(wdelta + hole.min.x, hole.max.y);
      wallShape.lineTo(wdelta + hole.max.x, hole.max.y);
      wallShape.lineTo(wdelta + hole.max.x, 0);
    }
    wallShape.lineTo(width, 0);

    // Process right holes
    for (var i = 0; i < rightHoles.length; i++) {
      var hole = rightHoles[i];
      wallShape.lineTo(width, hole.min.y);
      wallShape.lineTo(wdelta + hole.min.x, hole.min.y);
      wallShape.lineTo(wdelta + hole.min.x, hole.max.y);
      wallShape.lineTo(width, hole.max.y);
    }
    // Go to top
    if (!hole || hole.max.y < height) {
      wallShape.lineTo(width, height);
    }

    // Process top holes
    for (var i = 0; i < topHoles.length; i++) {
      var hole = topHoles[i];
      wallShape.lineTo(wdelta + hole.max.x, height);
      wallShape.lineTo(wdelta + hole.max.x, hole.min.y);
      wallShape.lineTo(wdelta + hole.min.x, hole.min.y);
      wallShape.lineTo(wdelta + hole.min.x, height);
    }
    wallShape.lineTo(0, height);

    // Process left holes
    for (var i = 0; i < leftHoles.length; i++) {
      var hole = leftHoles[i];
      wallShape.lineTo(0, hole.max.y);
      wallShape.lineTo(wdelta + hole.max.x, hole.max.y);
      wallShape.lineTo(wdelta + hole.max.x, hole.min.y);
      wallShape.lineTo(0, hole.min.y);
    }

    if (!hole || hole.min.y > 0) {
      wallShape.lineTo(0, 0);
    }
  } else {
    wallShape.moveTo(0, 0);
    wallShape.lineTo(width, 0);
    wallShape.lineTo(width, height);
    wallShape.lineTo(0, height);
    wallShape.lineTo(0, 0);
  }

  if (insideHoles.length) {
    for (var iHole = 0; iHole < insideHoles.length; iHole++) {
      var hole = insideHoles[iHole];
      var holePath = new THREE.Path();
      // Make sure holes are inside wall...
      var minx = Math.max(wdelta + hole.min.x, 0.000);
      var maxx = Math.min(wdelta + hole.max.x, width - 0.000);
      var miny = Math.max(hole.min.y, 0.000);
      var maxy = Math.min(hole.max.y, height - 0.000);

      holePath.moveTo(minx, miny);
      holePath.lineTo(maxx, miny);
      holePath.lineTo(maxx, maxy);
      holePath.lineTo(minx, maxy);
      holePath.lineTo(minx, miny);
      wallShape.holes.push(holePath);
    }
  }

  var extrudeSettings = { amount: depth / 2, bevelEnabled: false };
  var geo = new THREE.ExtrudeGeometry(wallShape, extrudeSettings);
  return geo;
};

Object3DUtil.makeWallWithHoles = function (baseStart, baseEnd, wallUpDir, wallHeight, extraHeight,
                                           depth, holes, materials) {
  depth = depth || 10;
  var height = wallHeight + extraHeight;
  var wallDir = baseEnd.clone().sub(baseStart).normalize();
  var wallFrontDir = new THREE.Vector3();
  wallFrontDir.crossVectors(wallDir, wallUpDir).normalize();
  var wallEndOffset = wallDir.clone().multiplyScalar(depth / 2 - depth / 10);

  var p0 = baseStart.clone().sub(wallEndOffset);
  var p1 = baseEnd.clone().add(wallEndOffset);
  var width = p1.distanceTo(p0);

  // Account for slight difference in original width and extended width
  var initialWidth = baseStart.distanceTo(baseEnd);

  var geo = Object3DUtil.__makeWallWithHolesGeometry({
    holes: holes,
    height: height,
    depth: depth,
    width: width,
    initialWidth: initialWidth,
    initialHeight: wallHeight
  });

  var materialBetween = Object3DUtil.getBasicMaterial('gray');
  var materialIn  = new THREE.MultiMaterial([materials[0], materialBetween]);
  var materialOut = new THREE.MultiMaterial([materials[1], materialBetween]);
  var meshIn = new THREE.Mesh(geo, materialIn);
  var meshOut = new THREE.Mesh(geo, materialOut);
  meshIn.name = 'WallInside';
  meshOut.name = 'WallOutside';

  var alignMatrix = Object3DUtil.getAlignmentMatrix(
    new THREE.Vector3(0,1,0), new THREE.Vector3(0,0,1),
    wallUpDir, wallFrontDir);
  alignMatrix.setPosition(p0);
  Object3DUtil.setMatrix(meshIn, alignMatrix);

  var offset = wallFrontDir.clone().multiplyScalar(-depth / 2 + depth / 19);  // NOTE: d/19 offset to avoid z-fighting
  alignMatrix.setPosition(p0.clone().add(offset));
  Object3DUtil.setMatrix(meshOut, alignMatrix);

  var merged = new THREE.Object3D('DoubleSidedWall');
  merged.add(meshIn);
  merged.add(meshOut);
  merged.name = 'DoubleSidedWall';

  return merged;
};

Object3DUtil.addWall = function (scene, baseStart, baseEnd, wallUpDir, height, depth, color) {
  var wall = Object3DUtil.makeWall(baseStart, baseEnd, wallUpDir, height, depth, color);
  scene.add(wall);
};

function mergeHoles(holeBBoxes) {
  var mergedHoleIndices = [];
  var finalHoleBoxes = [];
  for (var i = 0; i < holeBBoxes.length; i++) {
    if (mergedHoleIndices.indexOf(i) >= 0) {
      continue;
    }
    var iHoleBBox = holeBBoxes[i];
    for (var j = i + 1; j < holeBBoxes.length; j++) {
      var jHoleBBox = holeBBoxes[j];
      if (iHoleBBox.intersects(jHoleBBox)) {
        mergedHoleIndices.push(j);
        //console.log('Merging ' + jHoleBBox.toString() + ' to ' + iHoleBBox.toString());
        iHoleBBox.includeBBox(jHoleBBox);
        //console.log('Got ' + iHoleBBox.toString());
      }
    }
    finalHoleBoxes.push(iHoleBBox);
  }
  return { holeBBoxes: finalHoleBoxes, mergedHoleIndices: mergedHoleIndices };
}

function repeatedMergeHoles(holeBBoxes) {
  var m = mergeHoles(holeBBoxes);
  while (m.mergedHoleIndices.length > 0) {
    m = mergeHoles(m.holeBBoxes);
  }
  return m.holeBBoxes;
}

Object3DUtil.mergeHoles = repeatedMergeHoles;

Object3DUtil.getVisibleWidthHeight = function (camera, dist) {
  var vFOV = camera.fov * Math.PI / 180;   // convert vertical fov to radians
  var height = 2 * Math.tan(vFOV / 2) * dist;   // visible height
  var width = height * camera.aspect;
  return new THREE.Vector2(width, height);
};

Object3DUtil.makeCameraFrustum = function (origCamera) {
  var camera = origCamera.clone();
  camera.near = 50;
  camera.far = 100;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return new THREE.CameraHelper(camera);
};

Object3DUtil.decomposeMatrix4 = function(matrix) {
  var scale = new THREE.Vector3();
  var position = new THREE.Vector3();
  var orientation = new THREE.Quaternion();
  matrix.decompose(position, orientation, scale);
  return {
    position: position,
    orientation: orientation,
    scale: scale
  };
};

Object3DUtil.transferFaceAttributeToVertexColor = function(object3D, attribute, convertAttrFn) {
  var color = new THREE.Color();
  Object3DUtil.colorVerticesUsingFaceAttribute(object3D, attribute, function(x) {
    var v = convertAttrFn? convertAttrFn(x) : x;
    color.setHex(v);
    return color;
  });
};

Object3DUtil.colorVerticesUsingFaceAttribute = function(object3D, attribute, colorIndexOrFn) {
  var colorFn = null;
  if (colorIndexOrFn) {
    if (_.isFunction(colorIndexOrFn)) {
      colorFn = colorIndexOrFn;
    } else {
      colorFn = function(x) { return colorIndexOrFn[x]; };
    }
  }
  Object3DUtil.traverseMeshes(object3D, false, function(mesh) {
    var geometry = mesh.geometry;
    if (geometry.customFaceAttributes) {
      var faceAttributes = geometry.customFaceAttributes[attribute];
      var vertexColorBuffer = geometry.attributes['color'].array;
      console.log('got faceAttributes ' + attribute + ': ' + faceAttributes.length /*, _.min(faceAttributes), _.max(faceAttributes)*/);
      GeometryUtil.forFaceVertexIndices(geometry, function(iFace, vertIndices) {
        var v = faceAttributes[iFace];
        //console.log('got face attribute ' + v + ', vertices ' + JSON.stringify(vertIndices));
        var c = colorFn? colorFn(v) : v;
        if (c == undefined) {
          c = v || 0;
        }
        c = _.isInteger(c)? Object3DUtil.createColor(c) : Object3DUtil.getColor(c);
        for (var i = 0; i < vertIndices.length; i++) {
          var ci = vertIndices[i]*3;
          vertexColorBuffer[ci] = c.r;
          vertexColorBuffer[ci+1] = c.g;
          vertexColorBuffer[ci+2] = c.b;
        }
      });
    }
  });
};

Object3DUtil.grayOutVertices = function(object3D, center, maxRadius, grayColor) {
  Object3DUtil.traverseMeshes(object3D, false, function (mesh) {
    GeometryUtil.grayOutVertices(mesh, center, maxRadius, grayColor);
  });
};

Object3DUtil.BlackMatParams = {
  type: 'phong',
  opacity: 1,
  color: 0,
  emissive: 0x000000,
  specular: 0x000000,
  side: THREE.DoubleSide,
  name: 'black'
};

Object3DUtil.BlackMat = Object3DUtil.createMaterial(Object3DUtil.BlackMatParams);

Object3DUtil.ClearMatParams = {
  type: 'basic',
  opacity: 0.1,
  color: 0,
  side: THREE.DoubleSide,
  name: 'clear'
};

Object3DUtil.ClearMat = Object3DUtil.createMaterial(Object3DUtil.ClearMatParams);
Object3DUtil.ClearColor = new THREE.Color('gray');

Object3DUtil.TransparentMatParams = {
  type: 'basic',
  opacity: 0.4,
  color: 0x111111,
  side: THREE.DoubleSide,
  name: 'transparent'
};

Object3DUtil.TransparentMat = Object3DUtil.createMaterial(Object3DUtil.TransparentMatParams);

Object3DUtil.InvisibleMat = Object3DUtil.createMaterial({
  type: 'basic',
  visible: false,
  name: 'invisible'
});

// Exports
module.exports = Object3DUtil;
