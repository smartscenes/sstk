'use strict';

var BBox = require('geo/BBox');
var Colors = require('util/Colors');
var Constants = require('Constants');
var MatrixUtil = require('math/MatrixUtil');
var GeometryUtil = require('geo/GeometryUtil');
var BBoxUtil = require('geo/BBoxUtil');
var Materials = require('materials/Materials');
var RNG = require('math/RNG');
var _ = require('util/util');

var Object3DUtil = {};
Object3DUtil.MaterialsAll = 1;
Object3DUtil.MaterialsCompatible = 2;
Object3DUtil.MaterialsAllNonRecursive = 3;

Object3DUtil.OutNormals = BBoxUtil.OutNormals;
Object3DUtil.InNormals = BBoxUtil.InNormals;
Object3DUtil.FaceCenters01 = BBoxUtil.FaceCenters01;

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
          node.material = material.clone(); // material is cloned so rlsd architecture toggle can independently set the opacity.
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
  Object3DUtil.setOpacity(object3D, 1 - transparency);
};

Object3DUtil.setOpacity = function (object3D, opacity) {
  object3D.traverse(function (node) {
    if (node instanceof THREE.Mesh || node instanceof THREE.Line || node instanceof THREE.Points) {
      if (node.material) {
        Object3DUtil.setMaterialOpacity(node.material, opacity);
      }
    }
  });
};

Object3DUtil.setMaterialSide = function (object3D, side) {
  object3D.traverse(function (node) {
    if (node.material) {
      Materials.setMaterialSide(node.material, side);
    }
  });
};

Object3DUtil.setDoubleSided = function (object3D) {
  Object3DUtil.setMaterialSide(object3D, THREE.DoubleSide);
};

Object3DUtil.setTextureProperty = function (object3D, propName, propValue) {
  object3D.traverse(function (node) {
    if (node.material) {
      Materials.setTextureProperty(node.material, propName, propValue);
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

Object3DUtil.flipMirroredNodes = function(root) {
  var mirrored = {};
  Object3DUtil.traverseMeshes(root, false, function(mesh) {
    var nflips = Object3DUtil.countMirroringTransforms(mesh);
    if (nflips % 2 === 1) {
      var geo = mesh.geometry;
      var m = mirrored[geo.uuid];
      if (!m) {
        m = GeometryUtil.clone(geo);
        GeometryUtil.flipForMirroring(m);
        mirrored[geo.uuid] = m;
      }
      mesh.geometry = m;
    }
  });
};

Object3DUtil.getMeshMaterials = function(mesh) {
  return Materials.toMaterialArray(mesh.material);
};

Object3DUtil.setMaterialOpacity = function (material, opacity) {
  Materials.setMaterialOpacity(material, opacity);
};

Object3DUtil.setWireframe = function (object3D, flag) {
  Object3DUtil.processMaterial(object3D, function (material) {
    material.wireframe = flag;
  });
};

Object3DUtil.setDepthWrite = function (object3D, flag) {
  Object3DUtil.processMaterial(object3D, function (material) {
    material.depthWrite = flag;
  });
};

Object3DUtil.setDepthTest = function (object3D, flag) {
  Object3DUtil.processMaterial(object3D, function (material) {
    material.depthTest = flag;
  });
};

Object3DUtil.processMaterial = function (object3D, callback) {
  if (object3D instanceof THREE.Object3D) {
    object3D.traverse(function (node) {
      if (node instanceof THREE.Mesh || node instanceof THREE.Line) {
        if (node.material) {
          Object3DUtil.processMaterial(node.material, callback);
        }
      }
    });
  } else if (Array.isArray(object3D) && object3D.length) {
    var material = object3D;
    for (var i = 0; i < material.length; i++) {
      Object3DUtil.processMaterial(material[i], callback);
    }
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

Object3DUtil.highlightMeshes = function (object3D, meshIndices, material, useIndexedMaterial, useOutlineHighlight, indexField) {
  if (indexField == null) {
    indexField = 'index';
  }
  function getMaterial(i, mesh) {
    if (mesh.userData.isAxis  || mesh.userData.isOrientationArrow) {
      if (mesh.axisMaterial) {
        return mesh.axisMaterial;
      }
    }
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
      if (useOutlineHighlight) {
        mesh.isHighlighted = false;
      }
      if (meshIndices.length) {
        for (var j = 0; j < meshIndices.length; j++) {
          if (mesh.userData[indexField] === meshIndices[j]) {
            if (useOutlineHighlight) {
              mesh.isHighlighted = true;
            }
            // console.log('highlight mesh', mesh);
            return getMaterial(mesh.userData[indexField], mesh);
          }
        }
        return Object3DUtil.ClearMat;
      } else if (mesh.userData[indexField] === meshIndices) {
        if (useOutlineHighlight) {
          mesh.isHighlighted = true;
        }
        // console.log('highlight mesh', mesh);
        return getMaterial(mesh.userData[indexField], mesh);
      } else {
        return Object3DUtil.ClearMat;
      }
    },
    true);
};

Object3DUtil.applyPartMaterial = function (part, materialOrFn, nonrecursive, keepMultiMaterial, filter) {
  if (filter && !filter(part)) {
    return; // Don't apply material to this part
  }
  if (part instanceof THREE.Object3D) {
    Object3DUtil.applyMaterial(part, materialOrFn, nonrecursive, keepMultiMaterial, filter);
  } else if (part instanceof Array) {
    for (var i = 0; i < part.length; i++) {
      Object3DUtil.applyPartMaterial(part[i], materialOrFn, nonrecursive, keepMultiMaterial, filter);
    }
  } else {
    var node = part['node'] || part['mesh'];
    var materialIndex = part['materialIndex'];
    var materialApplied = true;
    if (node) {
      if (materialIndex !== undefined) {
        if (node instanceof THREE.Mesh) {
          var material = (_.isFunction(materialOrFn))? materialOrFn(node) : materialOrFn;
          materialApplied = Materials.setNodeMaterial(node, material, materialIndex);
        }
      } else {
        Object3DUtil.applyPartMaterial(node, materialOrFn, nonrecursive, keepMultiMaterial, filter);
        materialApplied = true;
      }
    }
    if (!materialApplied) {
      console.warn('Cannot apply material to part');
      console.log(part);
    }
  }
};

Object3DUtil.applyMaterial = function (object3D, materialOrFn, nonrecursive, keepMultiMaterial, filter) {
  return Object3DUtil.applyMaterials(object3D,
    function (mesh) {
      if (filter && !filter(mesh)) {
        return;
      }
      if (_.isFunction(materialOrFn)) {
        return materialOrFn(mesh);
      } else {
        return materialOrFn;
      }
    },
    nonrecursive, keepMultiMaterial);
};

Object3DUtil.saveMaterials = function(object3D, nonrecursive, matField) {
  if (matField == null) {
    matField = 'origMaterial';
  }
  Object3DUtil.traverseMeshes(object3D,
    nonrecursive,
    function (node) {
      node.cachedData = node.cachedData || {};
      node.cachedData[matField] = node.material;
    });
};

Object3DUtil.__applyMaterials = function (object3D, getMaterialCallback, nonrecursive, keepMultiMaterial, stats) {
  Object3DUtil.traverseMeshes(object3D,
    nonrecursive,
    function (node) {
      var material = getMaterialCallback(node);
      if (material) {
        if (keepMultiMaterial) {
          Materials.setNodeMaterial(node, material);
        } else {
          node.material = material;
        }
      } else {
        stats.skippedMeshes++;
      }
      stats.totalMeshes++;
    });
};

Object3DUtil.applyMaterials = function (object3D, getMaterialCallback, nonrecursive, keepMultiMaterial) {
  var stats =  { skippedMeshes: 0, totalMeshes: 0};
  // Handle array
  if (Array.isArray(object3D)) {
    for (var i = 0; i < object3D.length; i++) {
      Object3DUtil.__applyMaterials(object3D[i], getMaterialCallback, nonrecursive, keepMultiMaterial, stats);
    }
  } else {
    Object3DUtil.__applyMaterials(object3D, getMaterialCallback, nonrecursive, keepMultiMaterial, stats);
  }
  if (stats.skippedMeshes) {
    console.log('Material not applied to all meshes: skipped ' + stats.skippedMeshes + '/' + stats.totalMeshes);
  }
  return stats;
};

Object3DUtil.findChildIndex = function (parent, match) {
  var iMatch;
  for (var i = 0; i < parent.children.length; i++) {
    var c = parent.children[i];
    if (match(c)) {
      iMatch = i;
      break;
    }
  }
  return iMatch;
};

Object3DUtil.findAndReplaceChild = function (newChild, parent, match, disposeOld) {
  var iMatch = Object3DUtil.findChildIndex(parent, match);
  if (iMatch != null) {
    Object3DUtil.replaceChild(parent.children[iMatch], newChild, iMatch, disposeOld);
  }
  return (iMatch != null);
};

Object3DUtil.replaceChild = function (oldChild, newChild, iOldChild, disposeOld) {
  if (oldChild.parent) {
    var parent = oldChild.parent;
    var iChild = iOldChild;
    if (iChild != null && iChild >= 0 && parent.children[iChild] === oldChild) {
      // Okay
    } else {
      iChild = parent.children.indexOf(oldChild);
    }
    parent.children[iChild] = newChild;
    newChild.parent = parent;
    oldChild.parent = null;
    if (disposeOld) {
      Object3DUtil.dispose(oldChild);
    }
  }
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
    objMinv.copy(object3D.matrix).invert();
    var matrix = new THREE.Matrix4();
    matrix.multiplyMatrices(objWorldTransform, objMinv);

    // Add to scene...
    if (scene) {
      var sceneMinv = new THREE.Matrix4();
      sceneMinv.copy(scene.matrixWorld).invert();
      matrix.multiplyMatrices(sceneMinv, matrix);
      object3D.applyMatrix4(matrix);
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
    parentMinv.copy(parent.matrixWorld).invert();
    var objMinv = new THREE.Matrix4();
    objMinv.copy(object3D.matrix).invert();

    var matrix = new THREE.Matrix4();
    matrix.multiplyMatrices(parentMinv, objWorldTransform);
    matrix.multiplyMatrices(matrix, objMinv);
    object3D.applyMatrix4(matrix);
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
  modelInverse.copy(root.matrixWorld).invert();
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

Object3DUtil.getOrientedBoundingBox = function (objects, opts, force) {
  if (Array.isArray(objects)) {
    for (var i = 0; i < objects.length; i++) {
      Object3DUtil.__getOrientedBoundingBox(objects[i], opts, force);
    }
    return Object3DUtil.__getOrientedBoundingBox(objects, opts, force);
  } else {
    return Object3DUtil.__getOrientedBoundingBox(objects, opts, force);
  }
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
  if (!root.cached) {
    root.cached = {};
  }
  if (!root.cached.worldBoundingBox || force) {
    root.cached.worldBoundingBox = Object3DUtil.computeBoundingBox(root);
    //console.log(root.cached.worldBoundingBox);
  } else {
    //console.log("Recompute not needed");
  }
  return root.cached.worldBoundingBox;
};

Object3DUtil.__getOrientedBoundingBox = function (root, opts, force) {
  // Have cached world bounding box
  if (!root.cached) {
    root.cached = {};
  }
  if (!root.cached.worldOrientedBoundingBox || force) {
    var OBBFitter = require('geo/OBBFitter');
    root.cached.worldOrientedBoundingBox = OBBFitter.fitObjectOBB(root, opts);
    //console.log(root.cached.worldOrientedBoundingBox);
  } else {
    //console.log("Recompute not needed");
  }
  return root.cached.worldOrientedBoundingBox;
};

Object3DUtil.computeBoundingBoxLocal = function (root, transform) {
  root.updateMatrixWorld();
  var modelInverse = new THREE.Matrix4();
  modelInverse.copy(root.matrixWorld).invert();
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

Object3DUtil.cacheWorldBoundingBoxes = function(root) {
  root.updateMatrixWorld();
  Object3DUtil.traverse(root, function(node) {
    return true;
  }, function(node) {
    var bbox = new BBox();
    var transform = null;
    if (node instanceof THREE.Mesh) {
      bbox.includeMesh(node, transform);
    } else if (node instanceof THREE.Line) {
      bbox.includeLine(node, transform);
    } else if (node instanceof THREE.Points) {
      bbox.includePoints(node, transform);
    }
    if (node.children) {
      for (var i = 0; i < node.children.length; i++) {
        bbox.includeBBox(node.children[i].cached.worldBoundingBox);
      }
    }
    node.cached = node.cached || {};
    node.cached.worldBoundingBox = bbox;
  });
  return root.cached.worldBoundingBox;
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

Object3DUtil.computeNodeStatistics = function(root, splitOnMaterial) {
  // Compute number of faces at each node
  Object3DUtil.traverse(root, function (node) {
    return true;
  }, function (node) {
    var nfaces = 0;
    var nleafs = 0;
    var nvertices = 0;
    if (node instanceof THREE.Mesh) {
      nfaces = GeometryUtil.getGeometryFaceCount(node.geometry);
      nvertices = GeometryUtil.getGeometryVertexCount(node.geometry);
      nleafs = 1;
      if (splitOnMaterial) {
        var nmats = Materials.getNumMaterials(node.material);
        nleafs = nmats;
      }
    } else if (node instanceof THREE.Line) {
      nvertices = GeometryUtil.getGeometryVertexCount(node.geometry);
      nleafs = 1;
    } else if (node instanceof THREE.Points) {
      nvertices = GeometryUtil.getGeometryVertexCount(node.geometry);
      nleafs = 1;
    } else if (node.children && node.children.length > 0) {
      for (var i = 0; i < node.children.length; i++) {
        nfaces += node.children[i].userData.nfaces || 0;
        nleafs += node.children[i].userData.nleafs || 0;
        nvertices += node.children[i].userData.nvertices || 0;
      }
    }
    node.userData.nfaces = nfaces;
    node.userData.nleafs = nleafs;
    node.userData.nvertices = nvertices;
  });
};

Object3DUtil.removeLines = function(root) {
  return Object3DUtil.removeNodes(root, function(node) { return node instanceof THREE.Line; });
};

Object3DUtil.removePoints = function(root) {
  return Object3DUtil.removeNodes(root, function(node) { return node instanceof THREE.Points; });
};

Object3DUtil.removeEmptyGeometries = function(root, options) {
  options = _.defaults(Object.create(null), options || {}, {
    splitOnMaterial: false,
    minFaces: 1,
    minVertices: 0
  });

  Object3DUtil.computeNodeStatistics(root, options.splitOnMaterial);
  var allRemoved = [];
  Object3DUtil.traverse(root, function(node) {
    return node.userData.nfaces > 0;
  }, function(node) {
    // Remove any children that doesn't have enough faces or vertices
    var removeList = [];
    for (var i = 0; i < node.children.length; i++) {
      var c = node.children[i].userData;
      if (c.nfaces < options.minFaces || c.nvertices < options.minVertices) {
        removeList.push(node.children[i]);
      }
    }
    for (var i = 0; i < removeList.length; i++) {
      console.log('Removing node ' + removeList[i].id);
      node.remove(removeList[i]);
      allRemoved.push(removeList[i]);
    }
  });
  Object3DUtil.clearCache(root);
  return allRemoved;
};

Object3DUtil.collapseNestedPaths = function(root, options) {
  // Collapse nodes that have just one child
  var queue = [root];
  var newRoot = root;
  while (queue.length > 0) {
    var node = queue.pop();
    if (node instanceof THREE.Group && node.children.length === 1) {
      var collapseNodes = [node];
      var n = node;
      while (n.children.length === 1) {
        n = n.children[0];
        collapseNodes.push(n);
      }
      var finalNode = collapseNodes[collapseNodes.length-1];
      // Fold transforms into this node
      var finalTransform = finalNode.matrix;
      for (var i = collapseNodes.length-2; i >= 0; i--) {
        var n = collapseNodes[i];
        finalTransform.premultiply(n.matrix);
      }
      Object3DUtil.setMatrix(finalNode, finalTransform);
      // Figure out name
      var labels = _.map(collapseNodes, function(n) { return n.name || (n.userData && n.userData.id != null) || ("node" + n.index); });
      finalNode.name = labels.join('/');
      // Replace current node with this node
      if (node.parent) {
        //var parent = node.parent;
        //parent.remove(node);
        //parent.add(finalNode);

        var index = node.parent.children.indexOf(node);
        node.parent.children[index] = finalNode;
        finalNode.parent = node.parent;
        node.parent = null;
        if (node === root) {
          newRoot = finalNode;
        }
      }
      node = finalNode;
      console.log('Consolidated ' + finalNode.name);
    }
    for (var i = 0; i < node.children.length; i++) {
      queue.push(node.children[i]);
    }
  }
  newRoot.updateMatrixWorld();
  return newRoot;
};


Object3DUtil.getObjectStats = function(object3D, includeChildModelInstance) {
  var nverts = 0;
  var nfaces = 0;
  var nmeshes = 0;
  Object3DUtil.traversePrimitives(object3D, !includeChildModelInstance, function(mesh) {
    nverts += GeometryUtil.getGeometryVertexCount(mesh.geometry);
    if (mesh instanceof THREE.Mesh) {
      nfaces += GeometryUtil.getGeometryFaceCount(mesh.geometry);
    }
    nmeshes += 1;
  });
  return { nverts: nverts, nfaces: nfaces, nmeshes: nmeshes };
};

/**
 * Returns surfaces area of the object3D
 * @param object3D {THREE.Object3D}
 * @param [opts] Additional options
 * @param [opts.transform] {THREE.Matrix4} Additional transform to apply to vertices
 * @param [opts.meshFilter] {function(THREE.Mesh): boolean} Whether to include mesh in surface area computation
 * @param [opts.triFilter] {function(v0,v1,v2,iFace): boolean} Whether to include triangle in surface area computation
 * @returns {number}
 */
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
  object3D.applyMatrix4(transform);
  object3D.matrixWorldNeedsUpdate = true;  // make sure matrixWorldNeedsUpdate is set
  Object3DUtil.clearCache(object3D);
};

Object3DUtil.getAlignmentMatrix = MatrixUtil.getAlignmentMatrix;
Object3DUtil.getAlignmentQuaternion = MatrixUtil.getAlignmentQuaternion;
Object3DUtil.axisPairToOrthoMatrix = MatrixUtil.axisPairToOrthoMatrix;

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
  mInv.copy(m).invert();
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

Object3DUtil.clearPositionRotation = function(object3D) {
  object3D.rotation.set(0, 0, 0);
  object3D.position.set(0, 0, 0);
  object3D.updateMatrix();
  Object3DUtil.clearCache(object3D);
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
  object3D.applyMatrix4(transform);
  object3D.updateMatrix();
  object3D.matrixWorldNeedsUpdate = true;

  // Get bounding box...
  var parentMatrixWorldInv;
  if (object3D.parent) {
    object3D.parent.updateMatrixWorld();
    parentMatrixWorldInv = new THREE.Matrix4();
    parentMatrixWorldInv.copy(object3D.parent.matrixWorld).invert();
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
  oldModelBaseMatrixInv.copy(child.matrix).invert();

  var matrix = new THREE.Matrix4();
  matrix.multiplyMatrices(parent.matrix, child.matrix);

  // TODO: Should we be clearing the transform of the child here?
  if (pointCoordFrame === 'worldBB') {
    var worldBB = Object3DUtil.computeBoundingBox(child);
    var wp = worldBB.getWorldPosition(p);
    var pm = new THREE.Matrix4();
    pm.copy(child.matrixWorld).invert();
    var cp = wp.applyMatrix4(pm);

    Object3DUtil.clearPositionRotation(child);
    child.position.set(-cp.x, -cp.y, -cp.z);
    child.updateMatrix();
  } else if (pointCoordFrame === 'parentBB') {
    // NOTE: Unchecked logic!!!
    var rot = new THREE.Matrix4();
    rot.makeRotationFromQuaternion(parent.quaternion);
    var modelBB = Object3DUtil.computeBoundingBoxLocal(child, rot);
    var cp = modelBB.getWorldPosition(p);

    Object3DUtil.clearPositionRotation(child);
    child.quaternion.copy(parent.quaternion);
    child.position.set(-cp.x, -cp.y, -cp.z);
    child.updateMatrix();
  } else if (pointCoordFrame === 'childBB') {
    var modelBB = Object3DUtil.computeBoundingBoxLocal(child);
    var cp = modelBB.getWorldPosition(p);

    Object3DUtil.clearPositionRotation(child);
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
  modelBaseObject3DInv.copy(child.matrix).invert();
  matrix.multiply(modelBaseObject3DInv);

  //console.log('scale before', parent.scale.clone(), child.scale.clone());
  Object3DUtil.setMatrix(parent, matrix, true);
  //console.log('scale after', parent.scale.clone(), child.scale.clone());
  child.userData['attachmentPoint'] = p;
  child.userData['attachmentPointCoordFrame'] = pointCoordFrame;

  // Adjust other children of object3D
  matrix.multiplyMatrices(child.matrix, oldModelBaseMatrixInv);
  for (var i = 0; i < parent.children.length; i++) {
    var c = parent.children[i];
    if (child !== c) {
      c.applyMatrix4(matrix);
      c.matrixWorldNeedsUpdate = true;
    }
  }
  //parent.updateMatrix();
  //parent.updateMatrixWorld();
};

Object3DUtil.setMatrix = function (obj, matrix, keepScale) {
  obj.matrix.copy(matrix);
  // Sometime the decomposition would cause the scale to be changed
  if (keepScale) {
    var tmpScale = new THREE.Vector3();
    obj.matrix.decompose(obj.position, obj.quaternion, tmpScale);
    obj.updateMatrix();
  } else {
    obj.matrix.decompose(obj.position, obj.quaternion, obj.scale);
  }
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

Object3DUtil.getReflectionMatrix = function(component, matrix) {
  matrix = matrix || new THREE.Matrix4();
  if (component === 'x' || component === 'yz') {
    matrix.set(
      -1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    );
  } else if (component === 'y' || component == 'xz') {
    matrix.set(
      1, 0, 0, 0,
      0, -1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    );
  } else if (component === 'z' || component == 'xy') {
    matrix.set(
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, -1, 0,
      0, 0, 0, 1
    );
  } else {
    throw "Invalid reflection parameter: " + component;
  }
  return matrix;
};

/**
 * Applies operations on the geometry to normalize it (either by removing empty geometry or converting it)
 * @param object3D {THREE.Object3D}
 * @param opts
 * @param [opts.assetName] {string} Asset name to use in debug messages
 * @param [opts.removeEmptyGeometries] {boolean} Whether to remove empty geometries
 * @param [opts.toGeometry] {boolean} Ensure that all geometries are of type THREE.Geometry
 * @param [opts.toNonindexed] {boolean} Ensure that all buffer geometries are nonindexed
 * @param [opts.toIndexed] {boolean} Ensure that all buffer geometries are indexed
 * @param [opts.debug] {boolean} Whether to output debug log messages
 * @param [opts.bbox] {BBox} Precomputed bounding box information for the object
 * @param [opts.bboxes] {BBox[]} Array of bboxes sizes that is updated (for debugging)
 * @returns {{bbdims, bbox}}
 */
Object3DUtil.normalizeGeometry = function(object3D, opts) {
  var assetName = opts.assetName || '';
  var bbox = opts.bbox || Object3DUtil.getBoundingBox(object3D);
  var bbdims = bbox.dimensions();
  var bboxes = opts.bboxes || [];
  if (opts.removeEmptyGeometries) {
    //STK.geo.Object3DUtil.removeLines(sceneState.scene);
    //STK.geo.Object3DUtil.removePoints(sceneState.scene);
    Object3DUtil.removeEmptyGeometries(object3D);
    Object3DUtil.clearCache(object3D);
    bbox = Object3DUtil.getBoundingBox(object3D);
    bbdims = bbox.dimensions();
    if (opts.debug) {
      console.log('Removed empty geometry, lines, points ' + assetName +
        ' bbdims: [' + bbdims.x + ',' + bbdims.y + ',' + bbdims.z + ']');
    }
    bboxes.push(bbox.toJSON('cleaned'));
  }
  if (opts.toGeometry) {
    if (opts.debug) {
      console.time('toGeometry');
    }
    Object3DUtil.traverseMeshes(object3D, false, function (m) {
      m.geometry = GeometryUtil.toGeometry(m.geometry);
    });
    if (opts.debug) {
      console.timeEnd('toGeometry');
    }
  } else if (opts.toNonindexed) {
    if (opts.debug) {
      console.time('toNonIndexed');
    }
    Object3DUtil.traverseMeshes(object3D, false, function (m) {
      m.geometry = GeometryUtil.toNonIndexed(m.geometry);
      GeometryUtil.ensureVertexAttributesSamePerTri(m.geometry);
    });
    if (opts.debug) {
      console.timeEnd('toNonIndexed');
    }
  } else if (opts.toIndexed) {
    if (opts.debug) {
      console.time('toIndexed');
    }
    Object3DUtil.traverseMeshes(object3D, false, function (m) {
      if (m.geometry.isBufferGeometry) {
        m.geometry = GeometryUtil.toIndexedBufferGeometry(m.geometry);
      }
    });
    if (opts.debug) {
      console.timeEnd('toIndexed');
    }
  }
  return { bbox: bbox, bbdims: bbdims };
};

/**
 * Apply transforms to object3D
 * @param object3D {THREE.Object3D}
 * @param opts
 * @param [opts.assetName] {string} Asset name to use in debug messages
 * @param [opts.hasTransforms] {boolean} Initial setting of whether transforms has been applied
 * @param [opts.normalizeSize] {string} Whether/how to normalize the object3D size (`max`|`diagonal`)
 * @param [opts.normalizeSizeTo] {number} What size to normalize th3 object3D to (required if `normalizeSize` is specified)
 * @param [opts.center] {boolean} Whether to center the object to 0,0,0
 * @param [opts.debug] {boolean} Whether to output debug log messages
 * @param [opts.bbox] {BBox} Precomputed bounding box information for the object
 * @param [opts.bboxes] {BBox[]} Array of bboxes sizes that is updated (for debugging)
 * @returns {{bbdims, hasTransforms: boolean, bbox}}
 */
Object3DUtil.applyTransforms = function(object3D, opts) {
  var assetName = opts.assetName || '';
  var hasTransforms = opts.hasTransforms;
  var bbox = opts.bbox || Object3DUtil.getBoundingBox(object3D);
  var bbdims = bbox.dimensions();
  var bboxes = opts.bboxes || [];
  if (opts.normalizeSize) {
    Object3DUtil.rescaleObject3DToFit(object3D,
      { rescaleBy: opts.normalizeSize, rescaleTo: opts.normalizeSizeTo });
    bbox = Object3DUtil.getBoundingBox(object3D);
    bbdims = bbox.dimensions();
    if (opts.debug) {
      console.log('After rescaling ' + assetName +
        ' bbdims: [' + bbdims.x + ',' + bbdims.y + ',' + bbdims.z + ']', bbdims.length());
    }
    bboxes.push(bbox.toJSON('rescaled'));
    hasTransforms = true;
  }
  if (opts.center) {
    if (opts.debug) {
      console.log('Before centering ' + assetName, bbox.toString());
    }
    Object3DUtil.placeObject3D(object3D);
    bbox = Object3DUtil.getBoundingBox(object3D);
    bbdims = bbox.dimensions();
    if (opts.debug) {
      console.log('After centering ' + assetName, bbox.toString());
    }
    bboxes.push(bbox.toJSON('centered'));
    hasTransforms = true;
  }
  return {
    hasTransforms: hasTransforms,
    bbdims: bbdims,
    bbox: bbox,
    matrix: object3D.matrixWorld.toArray()
  };
};

Object3DUtil.normalizeGeometryAndApplyTransforms = function(object3D, opts) {
  opts = opts || {};
  var res = Object3DUtil.normalizeGeometry(object3D, opts);
  opts.bbdims = res.bbdims;
  opts.bbox = res.bbox;
  res = Object3DUtil.applyTransforms(object3D, opts);
  return res;
};

Object3DUtil.reflect = (function() {
  var transform = new THREE.Matrix4();
  return function(object3D, component) {
    Object3DUtil.getReflectionMatrix(component, transform);
    object3D.applyMatrix4(transform);
  }
})();

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

Object3DUtil.rotateObject3DAboutAxis = function() {
  var origin = new THREE.Vector3();
  var q = new THREE.Quaternion();
  var v = new THREE.Vector3();
  return function (obj, axis, delta, stationaryBbBoxPoint) {
      //console.time('rotateObject3DAboutAxis');
      obj.updateMatrixWorld();
      var bb = Object3DUtil.getBoundingBox(obj);
      var base = bb.getWorldPosition(stationaryBbBoxPoint);
      Object3DUtil.placeObject3D(obj, origin, stationaryBbBoxPoint);

      var qwi = obj.getWorldQuaternion(q).invert();
      v.copy(axis);
      var localAxis = v.applyQuaternion(qwi);
      q.setFromAxisAngle(localAxis, delta);
      obj.quaternion.multiply(q);
      obj.updateMatrix();

      Object3DUtil.clearCache(obj);
      Object3DUtil.placeObject3D(obj, base, stationaryBbBoxPoint);
      //console.timeEnd('rotateObject3DAboutAxis');
  };
}();

Object3DUtil.rotateObject3DWrtBBFace = function (obj, axis, delta, bbface) {
  if (bbface === undefined) {
    bbface = Constants.BBoxFaceCenters.BOTTOM;
  }
  var stationaryBbBoxPoint = Object3DUtil.FaceCenters01[bbface];
  Object3DUtil.rotateObject3DAboutAxis(obj, axis, delta, stationaryBbBoxPoint);
};

Object3DUtil.rotateObject3DAboutAxisSimple = function() {
  var q = new THREE.Quaternion();
  var v = new THREE.Vector3();
  return function (obj, axis, delta, isWorld) {
      //console.time('rotateObject3DAboutAxisSimple');
      var localAxis = axis;
      if (isWorld) {
          var qwi = obj.getWorldQuaternion(q).invert();
          v.copy(axis);
          localAxis = v.applyQuaternion(qwi);
      }

      q.setFromAxisAngle(localAxis, delta);
      obj.quaternion.multiplyQuaternions(obj.quaternion, q);
      obj.updateMatrix();
      Object3DUtil.clearCache(obj);
      //console.timeEnd('rotateObject3DAboutAxisSimple');
  };
}();

Object3DUtil.alignObjectObbUpFront = (function() {
  var t1 = new THREE.Vector3();
  var t2 = new THREE.Vector3();
  var t3 = new THREE.Vector3();
  return function(object3D, obb, targetUp, targetFront) {
    targetUp = targetUp || Constants.worldUp;
    targetFront = targetFront || Constants.worldFront;
    if (obb.isAxisAligned()) {
      console.log('OBB is already axis aligned');
    } else {
      // chose minimum change
      obb.extractBasis(t1, t2, t3);
      var ts = [t1,t2,t3];
      var indices = [0,1,2];
      var upAxisIndex = _.maxBy(indices, function(i) { return Math.abs(ts[i].dot(targetUp)); });
      indices = indices.filter(function(i) { return i != upAxisIndex; });
      var frontAxisIndex = _.maxBy(indices, function(i) { return Math.abs(ts[i].dot(targetFront)); });
      var upAxis = ts[upAxisIndex];
      var frontAxis = ts[frontAxisIndex];
      if (upAxis.dot(targetUp) <  0) {
        upAxis.negate();
      }
      if (frontAxis.dot(targetFront) < 0) {
        frontAxis.negate();
      }
      //console.log(upAxis, frontAxis, targetUp, targetFront);
      // Like Object3DUtil.alignToUpFront but doesn't clear initial rotation
      var transform = Object3DUtil.getAlignmentMatrix(upAxis, frontAxis, targetUp, targetFront);
      // Apply this transform to matrix
      object3D.applyMatrix4(transform);
      object3D.matrixWorldNeedsUpdate = true;  // make sure matrixWorldNeedsUpdate is set
      Object3DUtil.clearCache(object3D);
    }
  };
})();


// Helper functions  for rotating objects
Object3DUtil.applyAlignment = function (obj, alignment, stationaryBbBoxPoint) {
  obj.updateMatrixWorld();
  var bb = Object3DUtil.getBoundingBox(obj);
  var base = bb.getWorldPosition(stationaryBbBoxPoint);
  Object3DUtil.placeObject3D(obj, new THREE.Vector3(), stationaryBbBoxPoint);

  var transform = alignment;
  // Apply this transform to matrix
  obj.applyMatrix4(transform);
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
  if (obj.parent) {
    obj.parent.updateMatrixWorld();
  } else {
    obj.updateMatrixWorld();
  }
  var currentWorldPosition = obj.localToWorld(new THREE.Vector3());
  if (obj.parent) {
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

/**
 * Information about how to performance a rescale.
 * @typedef RescaleInfo
 * @type {object}
 * @property {string} rescaleBy - What to scale by ('max'|'diagonal')
 * @property {number} rescaleTo - Size to rescale to
 */

/**
 * Rescale the object to the specified size
 * @param obj
 * @param dim {number|RescaleInfo|Vector3D} - How much to scale by
 * @param tolRange Tolerance of amount to scale by
 */
Object3DUtil.rescaleObject3DToFit = function (obj, dim, tolRange) {
  var bbSize = Object3DUtil.getBoundingBoxDims(obj);
  var scale;
  if ((typeof dim) === 'number') {
    scale = dim / bbSize.length();
  } else if (dim.rescaleBy) {
    if (!dim.rescaleTo) {
      throw "Missing rescaleTo";
    }
    if (dim.rescaleBy === 'max') {
      scale = dim.rescaleTo / Math.max(bbSize.x, bbSize.y, bbSize.z);
    } else if (dim.rescaleBy === 'diagonal') {
      scale = dim.rescaleTo / bbSize.length();
    } else {
      throw "Unsupported rescaleBy " + dim.rescaleBy;
    }
  } else {
    var scaleV = new THREE.Vector3();
    scaleV.copy(dim);
    scaleV.divide(bbSize);
    scale = Math.min(scaleV.x, scaleV.y, scaleV.z);
  }
  if (tolRange && tolRange[0] <= scale && tolRange[1] >= scale) {
    return;
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

  var geometryH = new THREE.BufferGeometry();
  geometryH.setAttribute( 'position', new THREE.Float32BufferAttribute( [MIN_X, MAX_Y, epsilon, MAX_X, MAX_Y, epsilon], 3 ) );

  var geometryV = new THREE.BufferGeometry();
  geometryV.setAttribute( 'position', new THREE.Float32BufferAttribute( [MIN_X, MIN_Y, epsilon, MIN_X, MAX_Y, epsilon], 3 ) );

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

  //Create axis ([p1x, p1y, p1z, p2x, p2y, p2z], colour)
  function createAxis(points, color) {
    var lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute( 'position', new THREE.Float32BufferAttribute(points, 3 ) );
    var lineMat = new THREE.LineBasicMaterial({color: color, linewidth: 10});
    var line = new THREE.Line(lineGeometry, lineMat);
    axes.add(line);
  }

  createAxis([0, 0, 0, axisLength, 0, 0], 0xFF0000);
  createAxis([0, 0, 0, 0, axisLength, 0], 0x00FF00);
  createAxis([0, 0, 0, 0, 0, axisLength], 0x0000FF);

  return axes;
};

Object3DUtil.makeGround = function (width, height, color) {
  var geometry = new THREE.PlaneBufferGeometry(width, height);
  //geometry.verticesArray = geometry.attributes['position'].array;
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

Object3DUtil.getStandardMaterial = function (color, alpha, side) {
  return Materials.getStandardMaterial(color, alpha, side);
};

Object3DUtil.getSimpleFalseColorMaterial = function (id, color, palette, side) {
  return Materials.getSimpleFalseColorMaterial(id, color, palette, side);
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
      v = v.map(function(x) { return typeof x === 'string'? parseFloat(x) : x; });
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
      v = v.map(function(x) { return typeof x === 'string'? parseFloat(x) : x; });
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
      v = v.map(function(x) { return typeof x === 'string'? parseFloat(x) : x; });
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
};

Object3DUtil.toBox2 = function(b) {
  if (b) {
    if (b instanceof THREE.Box2) {
      return b;
    } else if (b.min && b.max) {
      return new BBox(Object3DUtil.toVector2(b.min), Object3DUtil.toVector2(b.max));
    } else {
      console.error('Cannot convert object to Box2', b);
      return null;
    }
  }
};


Object3DUtil.toBox3 = function(b) {
  if (b) {
    if (b instanceof THREE.Box3) {
      return b;
    } else if (b.min && b.max) {
      return new BBox(Object3DUtil.toVector3(b.min), Object3DUtil.toVector3(b.max));
    } else {
      console.error('Cannot convert object to Box3', b);
      return null;
    }
  }
};

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

Object3DUtil.traversePrimitives = function (object3D, nonrecursive, callback) {
  Object3DUtil.traverse(
    object3D,
    function (node) {
      if (node instanceof THREE.Mesh || node instanceof THREE.Line || node instanceof THREE.Points) {
        callback(node);
        return true;
      } else if (node instanceof THREE.Object3D) {
        if (object3D === node) return true;
        else if (nonrecursive) {
          if (typeof(nonrecursive) === 'function') {
            return nonrecursive(node);
          } else {
            // Skip if has modelInstance
            if ((node.metadata && node.metadata.modelInstance) || (node.userData && node.userData.hasOwnProperty('objectIndex'))) {
              return false;
            }
          }
        }
      }
      return true;
    });
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
          if (typeof(nonrecursive) === 'function') {
            return nonrecursive(node);
          } else {
            // Skip if has modelInstance
            if ((node.metadata && node.metadata.modelInstance) || (node.userData && node.userData.hasOwnProperty('objectIndex'))) {
              return false;
            }
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
          if (typeof(nonrecursive) === 'function') {
            return nonrecursive(node);
          } else {
            // Skip if has modelInstance
            if ((node.metadata && node.metadata.modelInstance) || (node.userData && node.userData.hasOwnProperty('objectIndex'))) {
              return false;
            }
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
          if (typeof(nonrecursive) === 'function') {
            return nonrecursive(node);
          } else {
            // Skip if has modelInstance
            if ((node.metadata && node.metadata.modelInstance) || (node.userData && node.userData.hasOwnProperty('objectIndex'))) {
              return false;
            }
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

Object3DUtil.hasDirectLineage = function(candidate, object3D) {
  if (object3D instanceof Array) {
    return object3D.indexOf(candidate) >= 0 || Object3DUtil.isAncestorOf(candidate, object3D) || Object3DUtil.isDescendantOf(candidate, object3D);
  } else {
    return object3D === candidate || Object3DUtil.isAncestorOf(candidate, object3D) || Object3DUtil.isDescendantOf(candidate, object3D);
  }
};

Object3DUtil.isAncestorOf = function (candidate, object3D, includeSelf) {
  // Is candidate ancestor of object3D?
  var isAnc = false;
  if (object3D instanceof Array) {
    for (var i = 0; i < object3D.length; i++) {
      isAnc = Object3DUtil.isAncestorOf(candidate, object3D[i], includeSelf);
      if (isAnc) {
        break;
      }
    }
  } else {
    var anc = Object3DUtil.findFirstAncestor(object3D, function(node) {
      return node === candidate;
    }, includeSelf);
    isAnc = (anc != null);
  }
  return isAnc;
};

Object3DUtil.isDescendantOf = function (candidate, object3D, includeSelf) {
  // Is candidate descendant of object3D?
  var isDesc = false;
  if (object3D instanceof Array) {
    for (var i = 0; i < object3D.length; i++) {
      isDesc = Object3DUtil.isDescendantOf(candidate, object3D[i], includeSelf);
      if (isDesc) {
        break;
      }
    }
  } else {
    var anc = Object3DUtil.findFirstAncestor(candidate, function(node) {
      return node === object3D;
    }, includeSelf);
    isDesc = (anc != null);
  }
  return isDesc;
};

Object3DUtil.deepClone = function(object3D) {
  // Deep clone that makes a copy of the geometry as well
  var clone = object3D.clone();
  clone.traverse(function (node) {
    if (node instanceof THREE.Mesh || node instanceof THREE.Line || node instanceof THREE.Points) {
      var newGeom = GeometryUtil.clone(node.geometry);
      node.geometry = newGeom;
    }
  });
  return clone;
};

Object3DUtil.deepConvert = function(object3D, convertFn) {
  Object3DUtil.traverse(object3D, function(node) {
    return true;
  }, function(node) {
    var converted = _.map(node.children, convertFn);
    Object3DUtil.removeAllChildren(node);
    for (var i = 0; i < converted.length; i++) {
      node.add(converted[i]);
    }
  });
  return convertFn(object3D);
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

/**
 * Finds and returns all ModelInstances attached to this object3D
 * @param object3D {THREE.Object3D}
 * @param [modelInstances] {ModelInstance[]} Optional array of ModelInstances to append to
 * @param [indexField] {string} Optional field indicating the position in the returned modelInstances array that a found modelInstance will be at
 * @returns {ModelInstance[]}
 */
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

/**
 * Detaches child/descendant modelInstances from the provided modelInstance
 * @param modelInstance {ModelInstance} ModelInstance from which to detach child modelInstances
 * @param detachAll {boolean} Whether to detach all descendants
 * @param scene {THREE.Object3D} Scene to reparent detached instances to
 * @returns {ModelInstance[]}
 */
Object3DUtil.detachModelInstances = function (modelInstance, detachAll, scene) {
  var modelInstances = Object3DUtil.findModelInstances(modelInstance.object3D);
  var detached = [];
  for (var i = 0; i < modelInstances.length; i++) {
    var mi = modelInstances[i];
    if (mi.index !== modelInstance.index) {
      var parent = mi.object3D.parent;
      var parentInstance = Object3DUtil.getModelInstance(parent);
      var detach = detachAll || parentInstance.index === modelInstance.index;
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
    // TODO: properly dispose of materials, textures and lights
    if (node instanceof THREE.Mesh || node instanceof THREE.Line || node instanceof THREE.Points) {
      if (node.geometry) {
        node.geometry.dispose();
      }

      if (node.material) {
        var materials = Array.isArray(node.material)? node.material: [node.material];
        materials.forEach(function (mat, idx) {
          // dispose of material textures
          if (mat.map) mat.map.dispose();
          if (mat.lightMap) mat.lightMap.dispose();
          if (mat.bumpMap) mat.bumpMap.dispose();
          if (mat.normalMap) mat.normalMap.dispose();
          if (mat.specularMap) mat.specularMap.dispose();
          if (mat.envMap) mat.envMap.dispose();

          mat.dispose();    // disposes any programs associated with the material
        });
      }
    }
  });
};

/**
 * Finds and returns the ModelInstance associated with this object3D
 * @param object3D {THREE.Object3D}
 * @param searchAncestors {boolean} Whether ancestors should be searched while looking for the ModelInstance
 * @returns {ModelInstance}
 */
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

Object3DUtil.findFirstAncestor = function(object3D, filter, includeSelf, stopFunc) {
  var node = includeSelf? object3D : object3D.parent;
  var n = includeSelf? 0 : 1;
  while (node != null) {
    if (stopFunc && stopFunc(node)) {
      break;
    }
    var matched = filter(node);
    if (matched) {
      return { ancestor: node, pathLength: n };
    } else {
      node = node.parent;
      n = n+1;
    }
  }
};

Object3DUtil.getMinimalSpanningNodes = function(nodes) {
  var roots = [];
  var spanning = [];
  var toProcess = [];
  // use temporary variable to mark nodes
  for (var i = 0; i < nodes.length; i++) {
    toProcess.push(nodes[i]);
    nodes[i].userData.__isMarked = true;
  }
  // http://localhost:8010/model-viewer?modelId=3dw.b82b59df5afc875e414442b3db8c133
  // Collect nodes that span these nodes
  while (toProcess.length > 0) {
    var node = toProcess.pop();
    //console.log('processing', node.userData.__isMarked, node);
    // skip if we already got ancestor of this node
    if (Object3DUtil.isDescendantOf(node, spanning, true)) {
      continue;
    }
    if (node.userData.__isMarked && node.parent != null) {
      var parent = node.parent;
      Object3DUtil.traverse(parent, function (n) {
        if (n.userData.__isMarked === true || n.userData.__isMarked === false) {
          return false; // No need to traverse down
        } else {
          return true;  // Make sure that __isMarked is set
        }
      }, function (n) {
        if (n.userData.__isMarked == undefined) {
          var hasMarked = _.any(n.children, function (c) {
            return c.userData.__isMarked;
          });
          if (hasMarked) {
            n.userData.__isMarked = _.all(n.children, function (c) {
              return c.userData.__isMarked || !Object3DUtil.getBoundingBox(c).valid();
            });
          } else {
            n.userData.__isMarked = false;
          }
        }
      });
      toProcess = _.filter(toProcess, function(n) { return !Object3DUtil.isAncestorOf(parent, n, true); });
      toProcess.push(parent);
    } else {
      roots.push(node);
      Object3DUtil.traverse(node, function(n) {
        if (n.userData.__isRoot) {
          return false;
        } else if (n.userData.__isMarked) {
          spanning.push(n);
          return false; // No need to traverse down
        } else {
          return true;  // Check children
        }
      });
      node.userData.__isRoot = true;
    }
  }

  // Clear temporary variable
  _.each(roots, function(root) {
    root.traverse(function(node) {
      delete node.userData.__isMarked;
      delete node.userData.__isRoot;
    });
  });

  return spanning;
};

Object3DUtil.filterVisible = function(objects3Ds) {
  return objects3Ds.filter(object3D => Object3DUtil.isVisible(object3D));
};

// Find nodes that returns true for the given filter
Object3DUtil.findNodes = function(object3D, filter, visibleOnly, limit) {
  var nodes = [];
  if (visibleOnly && !object3D.visible) {
    return nodes;
  }
  Object3DUtil.traverse(
    object3D,
    function (node) {
      if (filter(node)) {
        nodes.push(node);
      }

      if (visibleOnly) {
        return node.visible;
      } else {
        return (limit != null)? nodes.length < limit : true;
      }
  });
  return nodes;
};

Object3DUtil.findNode = function(object3D, filter, visibleOnly) {
  // Finds and returns first node satisfying filter
  var nodes = Object3DUtil.findNodes(object3D, filter, visibleOnly, 1);
  if (nodes.length) {
    return nodes[0];
  }
};

Object3DUtil.findTopMostNodes = function(object3D, filter) {
  var nodes = [];
  Object3DUtil.traverse(
    object3D,
    function (node) {
      if (filter(node)) {
        nodes.push(node);
        return false;
      } else {
        return true;
      }
   });
  return nodes;
};

Object3DUtil.removeNodes = function(node, filterOrNodes) {
  var matches = _.isArray(filterOrNodes)? filterOrNodes : Object3DUtil.findTopMostNodes(node, filterOrNodes);
  for (var i = 0; i < matches.length; i++) {
    var match = matches[i];
    match.parent.remove(match);
  }
  if (matches.length) {
    //console.log("Removed " + matches.length + ' nodes');
    Object3DUtil.clearCache(node);
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

Object3DUtil.setVisibleForType = function(object, type, visible) {
  if (object) {
    object.traverse(function(x) {
      if ((x instanceof THREE.Line && type === 'line') ||
          (x instanceof THREE.Points && type === 'point') ||
          (x instanceof THREE.Mesh && type === 'mesh')) {
        x.visible = visible;
      }
    });
  }
};

Object3DUtil.setVisible = function (object, visible, recursive) {
  // Handle array
  if (Array.isArray(object)) {
    for (var i = 0; i < object.length; i++) {
      Object3DUtil.setVisible(object[i], visible, recursive);
    }
    return;
  }
  // Handle normal case
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

Object3DUtil.setPartsVisible = function(root, parts, flag, recursive) {
  parts = Array.isArray(parts)? parts : [parts];
  if (flag) {
    // Make sure root to part is visible
    _.each(parts, function (part) {
      Object3DUtil.traverseAncestors(part, function (p) {
        Object3DUtil.setVisible(p, flag, false);
        return (p !== root);
      });
      Object3DUtil.setVisible(part, flag, recursive);
    });
  } else {
    _.each(parts, function (part) {
      Object3DUtil.setVisible(part, flag, recursive);
    });
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

Object3DUtil.createObject3DAndReplaceNode = function(oldNode, iOldNode, disposeOld) {
  var newNode = new THREE.Object3D();
  newNode.name = oldNode.name;
  _.assign(newNode.userData, oldNode.userData);

  Object3DUtil.setMatrix(newNode, oldNode.matrix);
  Object3DUtil.replaceChild(oldNode, newNode, iOldNode, disposeOld);
  return newNode;
};

Object3DUtil.splitAndReplaceMesh = function(mesh, options) {
  var splitMeshes = GeometryUtil.splitMesh(mesh, options);
  if (splitMeshes.length > 1) {
    // Merge node into results
    var newNode = Object3DUtil.createObject3DAndReplaceNode(mesh);
    for (var j = 0; j < splitMeshes.length; j++) {
      var childNode = splitMeshes[j];
      // Add child to parent
      newNode.add(childNode);
    }
    newNode.updateMatrixWorld();
    return newNode;
  } else {
    return mesh;
  }
};

/**
 * Traverses the scene graph with given root and orders nodes, geometries, materials for serialization
 * Each node, geometry, material will have their `userData.nodeIndex`, `userData.geometryIndex`, or `userData.materialIndex` field set appropriately.
 * @param object3D {THREE.Object3D} Root object to with nodes to index
 * @param [options] Additional options
 * @param [options.splitByMaterial=false] Whether to split nodes with Material into separate multiple meshes.
 *   The old mesh in the scene graph is replaced with the split up meshes.
 * @param [options.splitByConnectivity=false] Whether to split disconnected triangles into separate meshes.
 *   The old mesh in the scene graph is replaced with the split up meshes.
 * @param [options.keepDoubleFacesTogether=false] Whether to keep double faces together.
 * @returns {{nodes: THREE.Object3D[], geometries: THREE.Geometry[], materials: THREE.Material[], leafNodes: THREE.Mesh[]}}
 */
Object3DUtil.getIndexedNodes = function (object3D, options) {
  options = options || {};
  var result = options.result || {
    nodes: [],
    geometries: [],
    materials: []
  };
  object3D.traverse(function (node) {
    node.userData.nodeIndex = result.nodes.length;
    result.nodes.push(node);
    if (node instanceof THREE.Mesh) {
      var geometry = node.geometry;
      if (!geometry.userData) {
        geometry.userData = {};
      }
      if (geometry.userData.geometryIndex == undefined || result.geometries[geometry.userData.geometryIndex] !== geometry) {
        geometry.userData.geometryIndex = result.geometries.length;
        result.geometries.push(geometry);
      }
      var materials = Materials.toMaterialArray(node.material);
      for (var i = 0; i < materials.length; i++) {
        var m = materials[i];
        if (!m.userData) {
          m.userData = {};
        }
        if (m.userData.materialIndex == undefined || result.materials[m.userData.materialIndex] !== m) {
          m.userData.materialIndex = result.materials.length;
          result.materials.push(m);
        }
      }
    }
  });
  // Split multi material
  var meshNodes = _.filter(result.nodes, function(x) { return x instanceof THREE.Mesh; });
  if (options.splitByMaterial || options.splitByConnectivity) {
    var splitGeometries = _.clone(result.geometries);
    var leafNodes = [];
    for (var i = 0; i < meshNodes.length; i++) {
      var mesh = meshNodes[i];
      var nodeIndex = mesh.userData.nodeIndex;
      var splitMeshes = GeometryUtil.splitMesh(mesh, options);
      if (splitMeshes.length > 1) {
        console.log('splitting mesh ' + nodeIndex + ' for ' + object3D.name);
        // Update geometry index
        for (var j = 0; j < splitMeshes.length; j++) {
          var geometry = splitMeshes[j].geometry;
          if (!geometry.userData) {
            geometry.userData = {};
          }
        }

        var origGeomIndex = mesh.geometry.userData.geometryIndex;
        splitMeshes[0].geometry.userData.geometryIndex = origGeomIndex;
        splitGeometries[origGeomIndex] = splitMeshes[0].geometry;
        for (var j = 1; j < splitMeshes.length; j++) {
          splitMeshes[j].geometry.userData.geometryIndex = splitGeometries.length;
          splitGeometries.push(splitMeshes[j].geometry);
        }

        // Merge node into results
        var newNode = new THREE.Object3D();
        newNode.name = mesh.name;
        _.assign(newNode.userData, mesh.userData);

        Object3DUtil.setMatrix(newNode, mesh.matrix);
        Object3DUtil.replaceChild(mesh, newNode);
        result.nodes[nodeIndex] = newNode;
        for (var j = 0; j < splitMeshes.length; j++) {
          var childNode = splitMeshes[j];
          childNode.userData.nodeIndex = result.nodes.length;
          result.nodes.push(childNode);
          leafNodes.push(childNode);
          // Add child to parent
          newNode.add(childNode);
        }
        newNode.updateMatrixWorld();
      } else {
        splitGeometries.push(mesh.geometry);
        leafNodes.push(mesh);
      }
    }
    result.geometries = splitGeometries;
    result.leafNodes = leafNodes;
    //console.log('got result', result.nodes.length, result.geometries.length);
  } else {
    result.leafNodes = meshNodes;
  }
  result.root = result.nodes[0];
  return result;
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

Object3DUtil.getPrimitives = function (object, recursive, meshes) {
  meshes = meshes || [];
  Object3DUtil.traversePrimitives(
    object,
    !recursive,
    function (mesh) {
      meshes.push(mesh);
    }
  );
  return meshes;
};

Object3DUtil.getFilteredMeshList = function (object, filter, meshes) {
  meshes = meshes || [];
  Object3DUtil.traverseMeshes(
      object,
      filter,
      function (mesh) {
        meshes.push(mesh);
      }
  );
  return meshes;
};

Object3DUtil.getVisibleMeshList = function (object, recursive, meshes, filter) {
  meshes = meshes || [];
  Object3DUtil.traverseVisibleMeshes(
    object,
    !recursive,
    function (mesh) {
      if (!filter || filter(mesh)) {
        meshes.push(mesh);
      }
    }
  );
  return meshes;
};

Object3DUtil.findClosestVector = function (query, candidates, threshold) {
  var maxIndex = -1;
  var maxDot = -1;
  for (var i = 0; i < candidates.length; i++) {
    var norm = candidates[i];
    var dot = query.dot(norm);
    if (dot >= maxDot && (threshold == null || dot >= threshold)) {
      maxDot = dot;
      maxIndex = i;
    }
  }
  return maxIndex;
};

Object3DUtil.findClosestBBFaceByOutNormal = function (outNorm, threshold) {
  return Object3DUtil.findClosestVector(outNorm, Object3DUtil.OutNormals, threshold);
};

Object3DUtil.findClosestBBFaceByInNormal = function (inNorm, threshold) {
  return Object3DUtil.findClosestVector(inNorm, Object3DUtil.InNormals, threshold);
};

Object3DUtil.findNodesToExtract = function(root, nodeIds) {
  var nonSGIds = [];
  var matchedNodes = [];
  for (var i = 0; i < nodeIds.length; i++) {
    var nodeId = nodeIds[i];

    if (nodeId.toUpperCase().startsWith('SGPATH-')) {
      var node = Object3DUtil.getNodeFromSceneGraphPath(root, nodeId.substr(7));
      if (node) {
        matchedNodes.push(node);
      }
    } else {
      nonSGIds.push(nodeId);
    }
  }
  if (nonSGIds.length > 0) {
    var additionalNodes = Object3DUtil.findNodes(root, function(node) {
      return nonSGIds.indexOf(node.userData.id) >= 0;
    });
    matchedNodes.push.apply(matchedNodes, additionalNodes);
  }
  return matchedNodes;
}

Object3DUtil.extractNodes = function(root, operation, nodeIds) {
  var matchedNodes = Object3DUtil.findNodesToExtract(root, nodeIds);
  if (matchedNodes.length === 0) {
    throw "No nodes matched!";
  }
  if (operation === 'keep') {
    Object3DUtil.removeNodes(root, function(node) {
      var keep = Object3DUtil.hasDirectLineage(node, matchedNodes);
      return !keep;
    });
    return root;
  } else if (operation === 'remove') {
    Object3DUtil.removeNodes(root, matchedNodes);
    return root;
  } else {
    throw "Unknown operation: " + operation;
  }
};

Object3DUtil.ensureVertexColors = function(object3D, toNonindexed) {
  Object3DUtil.traverseMeshes(object3D, false, function (m) {
    if (toNonindexed) {
      m.geometry = GeometryUtil.toNonIndexed(m.geometry);
    }
    GeometryUtil.ensureVertexColors(m.geometry);
  });
};

Object3DUtil.ensureVertexColorsSamePerTri = function(object3D) {
  Object3DUtil.traverseMeshes(object3D, false, function (m) {
    m.geometry = GeometryUtil.toNonIndexed(m.geometry);
    GeometryUtil.ensureVertexColorsSamePerTri(m.geometry);
  });
};

Object3DUtil.ensureVertexNormals = function(object3d) {
  object3d.traverse((node) => {
    if (node.type === 'Mesh') {
      const geo = node.geometry;
      if (geo instanceof THREE.Geometry) {
        console.warn('Deprecated Geometry');
        if (geo.faces[0].vertexNormals.length !== 3) {
          geo.computeVertexNormals();
        }
      } else {  // usually a BufferGeometry
        if (!geo.hasAttribute('normal')) {
          geo.computeVertexNormals();
        }
      }
    }
  });
};

Object3DUtil.getAllMeshMaterials = function(object3D) {
  // Returns a list of materials with mesh and material index;
  var materials = [];
  Object3DUtil.traverseMeshes(object3D, true, function (node) {
    if (node instanceof THREE.Mesh && node.material) {
      if (Array.isArray(node.material)) {
        // Actual material definition is embedded in geometry...
        var mats = node.material;
        for (var j = 0; j < mats.length; j++) {
          var m = mats[j];
          materials.push({mesh: node, material: m, index: j});
        }
      } else if (node.material instanceof THREE.MultiMaterial) {
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

/**
 * Represents a subset of a mesh
 * @typedef PartialMesh
 * @type {object}
 * @property {THREE.Mesh} mesh
 * @property {int[]} List of face indices to include
 * @property {int} materialIndex Index of material
 * @memberOf geo
 */


/**
 * Information about a material
 * @typedef MaterialSetMeshInfo
 * @type {object}
 * @property {string} id
 * @property {string} name
 * @property {string} type material
 * @property {THREE.Material} material - Material
 * @property {Array<THREE.Mesh|PartialMesh>} meshes - Meshes associated with this material
 * @memberOf geo
 */

/**
 * Information about a set of material
 * @typedef MaterialMeshInfo
 * @type {object}
 * @property {string} id
 * @property {string} name
 * @property {string} type material_set
 * @property {Array<THREE.Material>} materials - Set of materials
 * @property {Array<THREE.Mesh|PartialMesh>} meshes - Meshes associated with a material in this set of materials
 * @memberOf geo
 */

/**
 * Returns map of material id to material-mesh info
 * @param object3D {THREE.Object3D}
 * @return Map<string, MaterialMeshInfo|MaterialSetMeshInfp>
 * @memberOf geo
 */
Object3DUtil.getMaterialsMap = function (object3D) {
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
      if (Array.isArray(node.material) || node.material instanceof THREE.MultiMaterial) {
        // Actual material definition is embedded in geometry...
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
            var iv = j*3;
            var group = _.find(node.geometry.groups, function (g) {
              return (iv >= g.start) && (iv < g.start + g.count);
            });
            var materialIndex = group? group.materialIndex : 0;
            if (!meshFaces[materialIndex]) {
              meshFaces[materialIndex] = [j];
            } else {
              meshFaces[materialIndex].push(j);
            }
          }
        }
        var mats = node.material.materials || node.material;
        for (var i = 0; i < mats.length; i++) {
          if (meshFaces.length > 0) {
            addMaterial({mesh: node, faceIndices: meshFaces[i], materialIndex: i}, mats[i]);
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


Object3DUtil.populateSceneGraphPath = function (node, parentRoot) {
  node.traverse(function(n) {
    n.userData.sceneGraphPath = Object3DUtil.getSceneGraphPath(n, parentRoot);
  });
};

Object3DUtil.getSceneGraphPath = function (node, parentRoot) {
  // Follow up to parents
  var path = [];
  var parent = node;
  var child;
  while (parent && parent !== parentRoot) {
    var name = parent.id;
    var parentUserDataId = _.get(parent, ['userData', 'id']);
    if (parentUserDataId == null) {
      parentUserDataId = _.get(parent, ['userData', 'partId']);
    }
    if (parentUserDataId != null) {
      name = parentUserDataId;
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
  var parent = parentRoot;
  var regex = /^(.*)\[(\d+)\]$/;
  for (var i = 0; i < path.length; i++) {
    var matched = regex.exec(path[i]);
    var expectedName = (matched != null)? matched[1] : path[i];
    if (i === 0) {
      for (var ci = 0; ci < parent.children.length; ci++) {
        if (parent.children[ci].userData.id === expectedName) {
          parent = parent.children[ci];
          break;
        }
      }
    }

    var userdata = parent.userData;
    var name = '';
    if (userdata.hasOwnProperty('id')) {
      name = userdata['id'];
    } else if (userdata.hasOwnProperty('partId')) {
      name = userdata['partId'];
    }
    if (expectedName !== name) {
      console.warn('Name does not match: expected ' + expectedName + ', actual ' + name);
    }
    if (matched) {
      var ci = matched[2];
      var child = parent.children[ci];
      if (!child) {
        console.warn('Cannot find child ' + path[i]);
        break;
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
    if (Array.isArray(material) || material instanceof THREE.MultiMaterial) {
      var mats = material.materials || material;
      for (var i = 0; i < mats.length; i++) {
        var mat = mats[i];
        if (materialFilter(mat)) {
          materials.push({
            mesh: mesh,
            material: mat,
            setMaterial: function(index, newMat) {
              mats[index] = newMat;
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

Object3DUtil.addArticulationPlayer = function(object3D, opts) {
  var articulatable = Object3DUtil.findNodes(object3D, n => n.isArticulated && n.articulations.length);
  if (articulatable.length > 0) {
    // find first articulatable that has articulations, others will be skipped
    var ArticulationPlayer = require('articulations/ArticulationPlayer');
    object3D.articulationPlayer = new ArticulationPlayer({
      articulatedObject: articulatable[0],
      assetManager: opts.assetManager
    });
  }
  return object3D.articulationPlayer;
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
    if (Array.isArray(mesh.material) || mesh.material instanceof THREE.MultiMaterial) {
      var mats = mesh.material.materials || mesh.material;
      for (var i = 0, l = mats.length; i < l; i++) {
        var meshMaterial = mats[i];
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
  return mesh;
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

Object3DUtil.makeCylinderStartDir = function (basePoint, columnDir, height, width, materialOrColor, radialSegments) {
  var cylinderGeo = new THREE.CylinderGeometry(width, width, height, radialSegments);
  var material = Object3DUtil.getMaterial(materialOrColor);
  var mesh = new THREE.Mesh(cylinderGeo, material);
  mesh.name = 'Cylinder';
  var centerTo = basePoint.clone().add(columnDir.clone().multiplyScalar(height / 2));
  Object3DUtil.setCylinderDirection(mesh, columnDir);
  mesh.position.copy(centerTo);
  return mesh;
};

Object3DUtil.makeCylinderStartEnd = function (start, end, width, materialOrColor, radialSegments) {
  var columnDir = end.clone().sub(start).normalize();
  var height = start.distanceTo(end);
  var cylinderGeo = new THREE.CylinderBufferGeometry(width, width, height, radialSegments);
  var material = Object3DUtil.getMaterial(materialOrColor);
  var mesh = new THREE.Mesh(cylinderGeo, material);
  mesh.name = 'Cylinder';
  var centerTo = start.clone().add(end).multiplyScalar(0.5);
  Object3DUtil.setCylinderDirection(mesh, columnDir);
  mesh.position.copy(centerTo);
  return mesh;
};

Object3DUtil.updateCylinderEndpoints = function (mesh, start, end) {
  var columnDir = end.clone().sub(start).normalize();
  var height = start.distanceTo(end);
  var centerTo = start.clone().add(end).multiplyScalar(0.5);
  Object3DUtil.setCylinderDirection(mesh, columnDir);
  mesh.position.copy(centerTo);
  var cylinderHeight = mesh.geometry.parameters.height;
  var s = height/cylinderHeight;
  mesh.scale.set(1, s, 1);
  mesh.matrixWorldNeedsUpdate = true;
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

function getColorFn(colorIndexOrFn) {
  var colorFn = null;
  console.log('interpret colorIndexOrFn ' + colorIndexOrFn);
  if (colorIndexOrFn) {
    if (_.isFunction(colorIndexOrFn)) {
      colorFn = colorIndexOrFn;
    } else if (typeof(colorIndexOrFn) === 'string') {
      if (colorIndexOrFn === 'useRawAttribute') {
        var colors = [];
        colorFn = function(x) {
          var c = colors[x];
          if (!c) {
            c = new THREE.Color();
            c.setHex(x);
            colors[x] = c;
          }
          return c;
        };
      } else {
        throw 'Unsupported colorFunction ' + colorIndexOrFn;
      }
    } else {
      colorFn = function(x) { return colorIndexOrFn[x]; };
    }
  }
  return colorFn;
}

Object3DUtil.colorVertices = function(object3D, color, alpha) {
  color = Colors.toColor(color);
  Object3DUtil.traversePrimitives(object3D, false, function(mesh) {
    GeometryUtil.colorVertices(mesh.geometry, color, null, alpha);
  });
};

// color vertex 0 as R, vertex 1 as G and vertex 2 as B
Object3DUtil.colorVerticesAsRGB = function(object3D) {
  Object3DUtil.traverseMeshes(object3D, false, function(mesh) {
    var geometry = mesh.geometry;
    var vertexColorBuffer = geometry.attributes['color'].array;
    GeometryUtil.forFaceVertexIndices(geometry, function(iFace, vertIndices) {
      for (var i = 0; i < vertIndices.length; i++) {
        var ci = vertIndices[i]*3;
        vertexColorBuffer[ci] = 0;
        vertexColorBuffer[ci+1] = 0;
        vertexColorBuffer[ci+2] = 0;
        vertexColorBuffer[ci + (i % 3)] = 1;
      }
    });
  });
};

Object3DUtil.colorVerticesUsingFaceIndex = function(object3D, colorIndexOrFn) {
  var colorFn = getColorFn(colorIndexOrFn);
  var startFace = 0;
  Object3DUtil.traverseMeshes(object3D, false, function(mesh) {
    var geometry = mesh.geometry;
    var vertexColorBuffer = geometry.attributes['color'].array;
    var nfaces = GeometryUtil.getGeometryFaceCount(geometry);
    GeometryUtil.forFaceVertexIndices(geometry, function(iFace, vertIndices) {
      var v = iFace + startFace;
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
    startFace += nfaces;
    //console.log('got nfaces', nfaces);
  });
  //console.log('got total', startFace);
};

Object3DUtil.colorVerticesUsingFaceAttribute = function(object3D, attribute, colorIndexOrFn) {
  var colorFn = getColorFn(colorIndexOrFn);
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
    } else {
      console.log('No custom face attributes');
    }
  });
};

Object3DUtil.transferVertexAttributeToVertexColor = function(object3D, attribute, convertAttrFn) {
  var color = new THREE.Color();
  Object3DUtil.colorVerticesUsingVertexAttribute(object3D, attribute, function(x) {
    var v = convertAttrFn? convertAttrFn(x) : x;
    color.setHex(v);
    return color;
  });
};

Object3DUtil.colorVerticesUsingVertexAttribute = function(object3D, attribute, colorIndexOrFn) {
  var colorFn = getColorFn(colorIndexOrFn);
  Object3DUtil.traverseMeshes(object3D, false, function(mesh) {
    var geometry = mesh.geometry;
    if (geometry.customVertexAttributes) {
      var vertexAttributes = geometry.customVertexAttributes[attribute];
      var vertexColorBuffer = geometry.attributes['color'].array;
      //console.log('got vertexAttributes ' + attribute + ': ' + vertexAttributes.length, _.min(vertexAttributes), _.max(vertexAttributes));
      var nvertices = vertexColorBuffer.length/3;
      for (var iVert = 0; iVert < nvertices; iVert++) {
        var v = vertexAttributes[iVert];
        //console.log('got vertex attribute ' + v + ', vertex ' + iVert);
        var c = colorFn? colorFn(v) : v;
        if (c == undefined) {
          c = v || 0;
        }
        c = _.isInteger(c)? Object3DUtil.createColor(c) : Object3DUtil.getColor(c);
        var ci = iVert*3;
        vertexColorBuffer[ci] = c.r;
        vertexColorBuffer[ci+1] = c.g;
        vertexColorBuffer[ci+2] = c.b;
      }
    } else {
      console.log('No custom vertex attributes');
    }
  });
};

Object3DUtil.createFaceAttributes = function(object3D, faceAttributeSpecs) {
  Object3DUtil.traverseMeshes(object3D, false, function(mesh) {
    var geometry = mesh.geometry;
    var customFaceAttributes = geometry.customFaceAttributes || {};
    for (var i = 0; i < faceAttributeSpecs.length; i++) {
      customFaceAttributes[faceAttributeSpecs[i].name] = [];
    }
    GeometryUtil.forFaceVertexIndices(geometry, function(iFace, vertIndices) {
      for (var i = 0; i < faceAttributeSpecs.length; i++) {
        var v = customFaceAttributes[faceAttributeSpecs[i].name];
        v[iFace] = faceAttributeSpecs[i].compute(iFace, v);
      }
    });
    geometry.customFaceAttributes = customFaceAttributes;
  });
};

Object3DUtil.colorVerticesUsingFunction = function(object3D, colorFn) {
  Object3DUtil.traverseMeshes(object3D, false, function(mesh) {
    GeometryUtil.colorVerticesUsingFunction(mesh.geometry, colorFn, null, mesh.matrixWorld);
  });
};

Object3DUtil.colorVerticesInBox = function(object3D, bbox, inBboxColor, outBboxColor) {
  inBboxColor = Colors.toColor(inBboxColor);
  outBboxColor = Colors.toColor(outBboxColor);
  //console.log(inBboxColor, outBboxColor);
  Object3DUtil.colorVerticesUsingFunction(object3D, function(v) {
    return (bbox.contains(v))? inBboxColor : outBboxColor;
  });
};

Object3DUtil.colorVerticesInBoxes = function(object3D, bboxes, outBboxColor) {
  var sortedBboxes = _.sortBy(bboxes, function(box) {
    return box.bbox.volume();
  });
  outBboxColor = Colors.toColor(outBboxColor);
  Object3DUtil.colorVerticesUsingFunction(object3D, function(v) {
    for (var i = 0; i < sortedBboxes.length; i++) {
      var box = sortedBboxes[i];
      if (box.bbox.contains(v)) {
        return box.color;
      }
    }
    return outBboxColor;
  });
};

Object3DUtil.grayOutVertices = function(object3D, center, maxRadius, grayColor) {
  Object3DUtil.traverseMeshes(object3D, false, function (mesh) {
    GeometryUtil.grayOutVertices(mesh, center, maxRadius, grayColor);
  });
};

Object3DUtil.getIntersectingPoints = function(object1, object2, threshold, nsamples, directed) {
  const MeshIntersections = require('geo/MeshIntersections');
  const MeshSampling = require('geo/MeshSampling');
  object1.updateMatrixWorld(true);
  object2.updateMatrixWorld(true);
  const m1 = Object3DUtil.getMeshList(object1);
  const m2 = Object3DUtil.getMeshList(object2);
  const intersectPoints = MeshIntersections.MeshesMeshesIntersection(m1, m2,
    {threshold: threshold, sampler: MeshSampling.getDefaultSampler(), nsamples: nsamples, directed: directed});
  return intersectPoints;
};

Object3DUtil.filterByCategory = function(node, categories, includeNonModelInstances) {
  var modelInstance = Object3DUtil.getModelInstance(node);
  if (modelInstance) {
    return modelInstance.model.hasCategoryIn(categories, true);
  } else {
    if (includeNonModelInstances && node.userData.type) {
      var t = node.userData.type.toLowerCase();
      return _.any(categories, function(cat) { return t === cat.toLowerCase(); });
    } else {
      return false;
    }
  }
};

Object3DUtil.getModelMatrixWorld = function(object3D) {
  object3D.updateMatrixWorld();
  var matrix = object3D.matrixWorld;
  var mi = Object3DUtil.getModelInstance(object3D);
  if (mi) {
    var modelObj = mi.getObject3D('Model');
    matrix = modelObj.matrixWorld;
  }
  return matrix;
};

Object3DUtil.getModelMatrixWorldInverse = function(object3D) {
  var inverseMatrix = new THREE.Matrix4();
  inverseMatrix.copy(Object3DUtil.getModelMatrixWorld(object3D)).invert();
  return inverseMatrix;
};

Object3DUtil.isHidden = function(node) {
  return !Object3DUtil.isVisible(node);
};

Object3DUtil.isVisible = function(node) {
  var visible = node.visible;
  while (node != null) {
    if (!node.visible) {
      visible = false;
      break;
    }
    node = node.parent;
  }
  return visible;
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

Object3DUtil.NeutralMatParams = {
  type: 'phong',
  opacity: 1,
  color: 0xfef9ed,
  side: THREE.DoubleSide,
  name: 'neutral'
};

Object3DUtil.NeutralMat = Object3DUtil.createMaterial(Object3DUtil.NeutralMatParams);

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
