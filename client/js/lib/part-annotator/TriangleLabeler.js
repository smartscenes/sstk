var BasePartLabeler = require('part-annotator/BasePartLabeler');
var Object3DUtil = require('geo/Object3DUtil');
var GeometryUtil = require('geo/GeometryUtil');
var TessellateModifier = require('geo/TessellateModifier');
var ConnectivityGraph = require('geo/ConnectivityGraph2');
var _ = require('util');
require('three-modifiers');

/**
 * Class responsible for handling labeling of triangles.
 * @param params
 * @param params.minEdgeLength {float}
 * @param params.maxEdgeLength {float}
 * @param params.brushSize {float}
 * @constructor
 * @extends BasePartLabeler
 */
function TriangleLabeler(params) {
  BasePartLabeler.call(this, params);
  this.minEdgeLength = params.minEdgeLength;
  this.maxEdgeLength = params.maxEdgeLength;
  this.brushSize = params.brushSize;
  this.defaultColor = new THREE.Color(0.5, 0.5, 0.5);
}

TriangleLabeler.prototype = Object.create(BasePartLabeler.prototype);
TriangleLabeler.prototype.constructor = TriangleLabeler;

TriangleLabeler.prototype.__setLabelInfo = function(part, labelInfo) {
  if (part.gathered && part.gathered.faceIndices.length > 1) {
    var u = part.mesh.userData;
    u.faces = u.faces || {};
    for (var i = 0; i < part.gathered.faceIndices.length; i++) {
      var fi = part.gathered.faceIndices[i];
      u.faces[fi] = u.faces[fi] || {};
      u.faces[fi].labelInfo = labelInfo;
    }
  }
};

TriangleLabeler.prototype.labelPart = function (part, labelInfo, opts) {
  if (part && part.userData.labelInfo) {
    this.__unlabel(part);
  }
  BasePartLabeler.prototype.labelPart.call(this, part, labelInfo, opts);
  this.__label(part, labelInfo);
  this.__setLabelInfo(part, labelInfo);
};

TriangleLabeler.prototype.__label = function(part, labelInfo) {
  //if (labelInfo.triIndices) {
  //  if (labelInfo.triIndices.indexOf(part.triIndex) < 0) {
  //    labelInfo.triIndices.push(part.triIndex);
  //  }
  //} else {
  //  labelInfo.triIndices = [part.triIndex];
  //}
  // TODO: keep track of mesh/tri
};

TriangleLabeler.prototype.unlabelPart = function (part) {
  this.__unlabel(part);
  this.__setLabelInfo(part, null);
  BasePartLabeler.prototype.unlabelPart.call(this, part);
};

TriangleLabeler.prototype.unlabelParts = function(parts, labelInfo) {
  if (!parts) {
    // Unlabel segments
    // Assume just one mesh
    //var mesh = this.segments.rawSegmentObject3D;
    //parts = labelInfo.segIndices.map( this.__segIdxToPart.bind(this, mesh, null) );
  }
  BasePartLabeler.prototype.unlabelParts.call(this, parts);
};

TriangleLabeler.prototype.__unlabel = function(part) {
  if (part) {
    var labelInfo = part.userData.labelInfo;
    if (labelInfo && labelInfo.segIndices) {
      //var i = labelInfo.segIndices.indexOf(part.segmentIndex);
      //if (i >= 0) {
      //  labelInfo.segIndices.splice(i,1);
      //}
    }
  }
};

TriangleLabeler.prototype.colorParts = function(parts, labelInfo) {
  if (!parts) {
    //var mesh = this.segments.rawSegmentObject3D;
    //parts = labelInfo.segIndices.map(this.__segIdxToPart.bind(this, mesh, labelInfo));
  }
  BasePartLabeler.prototype.colorParts.call(this, parts, labelInfo);
};

TriangleLabeler.prototype.__colorPart = function(part, color) {
  part.face.color.copy(color);
  if (part.gathered && part.gathered.faceIndices.length > 1) {
    for (var i = 0; i < part.gathered.faceIndices.length; i++) {
      var fi = part.gathered.faceIndices[i];
      part.mesh.geometry.faces[fi].color.copy(color);
    }
  }
  part.mesh.geometry.colorsNeedUpdate = true;
};

TriangleLabeler.prototype.colorPart = function(part, colorMaterial) {
  if (part) {
    var color = (colorMaterial instanceof THREE.Color)? colorMaterial : colorMaterial.color;
    this.__colorPart(part, color);
    this.showParts(true);
  }
};

TriangleLabeler.prototype.decolorPart = function(part) {
  if (part) {
    this.__colorPart(part, this.defaultColor);
  }
};

TriangleLabeler.prototype.showParts = function(flag) {
  Object3DUtil.setVisible(this.partsNode, flag);
};

//Returns the mesh given the mouse event. If no part selected, return false
TriangleLabeler.prototype.__findPart = function (event) {
  var intersect = this.getIntersected(event);
  if (intersect) {
    //console.log(intersect);
    var u = intersect.descendant.userData;
    intersect.type = 'Triangle';
    intersect.mesh = intersect.descendant;
    u.faces = u.faces || {};
    u.faces[intersect.faceIndex] = u.faces[intersect.faceIndex] || {};
    intersect.userData = u.faces[intersect.faceIndex];
    var m = intersect.mesh;
    if (m.__searchHelper && m.userData.brushSizeSq) {
      // Look for close by triangles
      var g = m.__searchHelper;
      //intersect.gathered = { faceIndices: [intersect.faceIndex] };
      //intersect.gathered = g.gatherNeighbors(intersect.faceIndex, m.userData.brushSizeSq, 0.95);
      intersect.gathered = g.gatherFaces(intersect.faceIndex, m.userData.brushSizeSq, 0.95);
      var labelInfo = intersect.userData.labelInfo;
      intersect.gathered.faceIndices = intersect.gathered.faceIndices.filter( function(f) {
        var flabelInfo = u.faces[f]? u.faces[f].labelInfo : null;
        if (labelInfo) { return flabelInfo === labelInfo; }
        else { return flabelInfo == null; }
      });
    }
    return intersect;
  }
};

TriangleLabeler.prototype.getAnnotations = function (options) {
  this.__condense();
  options = options || {};
  function addVertex(arr, map, i, geometry, xform) {
    if (map[i] == undefined) {
      var p = GeometryUtil.getGeometryVertex(geometry, i, xform);
      arr.push(p.x);
      arr.push(p.y);
      arr.push(p.z);
      map[i] = (arr.length/3)-1;
    }
    return map[i];
  }
  // Organize indices by modelInstance/label
  var annotatedByLabel = {};
  var objects = {};
  this.partsNode.updateMatrixWorld();
  // Create new mesh for each modelInstance/label with selected vertices/triangles
  Object3DUtil.traverseMeshes(this.partsNode, false, function(mesh) {
    var u = mesh.userData;
    if (u && u.faces && !_.isEmpty(u.faces)) {
      var xform = mesh.matrixWorld;
      if (options.transform) {
        xform = options.transform.clone().multiply(xform);
      }
      var modelInstance = Object3DUtil.getModelInstance(mesh, true);
      var objectIndex = (modelInstance)? modelInstance.index : -1;
      if (!objects[objectIndex]) {
        if (modelInstance) {
          objects[objectIndex] = {
            objectIndex: objectIndex,
            //objectInstanceId: modelInstance.instanceId,
            modelId: modelInstance.model.getFullID(),
            category: modelInstance.model.getCategory()
          };
        } else {
          objects[objectIndex] = {
            objectIndex: objectIndex,
            //objectInstanceId: modelInstance.instanceId,
            category: options.defaultCategory
          };
        }
      }
      //  Map of old to new vertex index
      var oldToNewVerticesMap = {};
      for (var k in u.faces) {
        if (u.faces.hasOwnProperty(k)) {
          var fu = u.faces[k];
          if (fu.labelInfo) {
            var label = (options.labelField)? fu.labelInfo[options.labelField] : fu.labelInfo.index;
            if (!annotatedByLabel[label]) {
              annotatedByLabel[label] = {};
            }
            var labelAnns = annotatedByLabel[label];
            if (!labelAnns[objectIndex]) {
              labelAnns[objectIndex] = { objectIndex: objectIndex, label: fu.labelInfo.name, vertices: [], tris: [] };
            }
            var ann = labelAnns[objectIndex];
            var face = mesh.geometry.faces[k];
            var va = addVertex(ann.vertices, oldToNewVerticesMap, face.a, mesh.geometry, xform);
            var vb = addVertex(ann.vertices, oldToNewVerticesMap, face.b, mesh.geometry, xform);
            var vc = addVertex(ann.vertices, oldToNewVerticesMap, face.c, mesh.geometry, xform);
            ann.tris.push(va);
            ann.tris.push(vb);
            ann.tris.push(vc);
          }
        }
      }
    }
  });
  var result = {
    objects: objects,
    labels: this.labelInfos,
    annotations: annotatedByLabel
  };
  return result;
};

TriangleLabeler.prototype.__condense = function() {
  Object3DUtil.traverseMeshes(this.partsNode, false, function(mesh) {
    var u = mesh.userData;
    if (u && u.faces) {
      var keys = _.keys(u.faces);
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (!u.faces[key].labelInfo) {
          delete u.faces[key];
        }
      }
    }
  });
};

TriangleLabeler.prototype.hasParts = function(labelInfo) {
  Object3DUtil.existsMesh(this.partsNode, false, function(mesh) {
    var u = mesh.userData;
    if (u && u.faces) {
      return _.some(u.faces, function(x) { return x.labelInfo === labelInfo; });
    }
  });
};

TriangleLabeler.prototype.unlabelAll = function() {
  this.__clearLabels(this.partsNode, this.defaultColor);
};

TriangleLabeler.prototype.__clearLabels = function(partsNode, defaultColor) {
  //var material = Object3DUtil.ClearMat;
  //Object3DUtil.applyMaterial(this.partsNode, material, false, true);
  var material = new THREE.MeshPhongMaterial({ vertexColors: THREE.FaceColors });
  Object3DUtil.traverseMeshes(partsNode, false, function(mesh) {
    mesh.material = material;
    var faces = mesh.geometry.faces;
    for (var i = 0; i < faces.length; i++) {
      var f = faces[i];
      f.color.copy(defaultColor);
    }
    mesh.geometry.colorsNeedUpdate = true;
    delete mesh.userData.faces;
  });
};

TriangleLabeler.prototype.setBrushSize = function(brushSize) {
  this.brushSize = brushSize;
  console.log('setBrushSize=' + brushSize);

  Object3DUtil.traverseMeshes(this.partsNode, false, function(mesh) {
    if (brushSize) {
      // NOTE: Estimate of scale we need to multiply by
      var worldScale = mesh.getWorldScale();
      console.log(worldScale);
      var wsl = Math.min(worldScale.x, worldScale.y, worldScale.z) || 1.0;
      var worldToLocalScale = 1.0 / wsl;

      if (!mesh.__searchHelper) {
        mesh.__searchHelper = new ConnectivityGraph(mesh.geometry);
      }
      mesh.userData.brushSize = worldToLocalScale*brushSize;
      mesh.userData.brushSizeSq = mesh.userData.brushSize*mesh.userData.brushSize;
      //console.log(mesh.userData);
    } else {
      mesh.userData.brushSize = undefined;
      mesh.userData.brushSizeSq = undefined;
    }
      //console.log(mesh.userData);
  });
};

TriangleLabeler.prototype.setTarget = function(target) {
  if (target instanceof THREE.Object3D) {
    this.origObject3D = target;
    this.modelInstance = null;
  } else {
    // Assume is ModelInstance...
    this.origObject3D = target.object3D;
    this.modelInstance = target;
  }
  // Make copy of scene along with modelInstances!
  var modelInstances = Object3DUtil.findModelInstances(this.origObject3D, [], '__triLabelerObjectIndex');
  var copied = Object3DUtil.copyObjectWithModelInstances(this.origObject3D, modelInstances, true, '__triLabelerObjectIndex');
  this.partsNode = copied.object;
  //this.partsNode = this.origObject3D.clone();
  // TODO: Keep object identities...
  // Flatten to create one big happy mesh - hmm, not working
  //this.partsNode = GeometryUtil.flattenAndMergeMeshes(this.origObject3D);

  console.log('TriangleLabeler');
  // Tessallate!
  // Subdivide smoothing the whole thing into a ball, weird
  var minEdgeLength = this.minEdgeLength;
  var maxEdgeLength = this.maxEdgeLength;
  var maxVertices = 0; //500;
  if (maxEdgeLength || maxVertices) {
    console.log('tessellate');
    console.time('tessellate');
    // Create a new instance of the modifier and pass the number of divisions.
    var tessellateModifier = new TessellateModifier(maxEdgeLength);
    var simplifyModifier = new THREE.SimplifyModifier();
    Object3DUtil.traverseMeshes(this.partsNode, false, function(mesh) {
      // NOTE: Estimate of scale we need to multiply by
      var worldScale = mesh.getWorldScale();
      //console.log('worldScale', worldScale);
      var wsl = Math.min(worldScale.x, worldScale.y, worldScale.z) || 1.0;
      var worldToLocalScale = 1.0/wsl;

      // Clone geometry so that shared geometries can be colored independently
      var smooth = new THREE.Geometry();
      if (mesh.geometry instanceof THREE.BufferGeometry) {
        // Convert from BufferGeometry into Geometry so we can use our tessellateModifier on it
        // TODO: Implement tessellate directly on BufferGeometry
        smooth.fromBufferGeometry(mesh.geometry);
      } else {
        smooth.copy(mesh.geometry);
      }
      //smooth.boundingSphere = null;
      //smooth.boundingBox = null;
      //smooth.morphTargets = [];
      //smooth.morphNormals = [];
      //smooth.skinWeights = [];
      //smooth.skinIndices = [];
      smooth.dynamic = true;
      var nvertices = GeometryUtil.getGeometryVertexCount(smooth);
      if (maxVertices && nvertices > maxVertices) {
        smooth = simplifyModifier.modify(smooth, nvertices - maxVertices);
      } else if (maxEdgeLength) {
        mesh.userData.maxEdgeLength = worldToLocalScale * maxEdgeLength;
        mesh.userData.maxEdgeLengthSq = mesh.userData.maxEdgeLength * mesh.userData.maxEdgeLength;
        //console.log('maxEdgeLength: ' + mesh.userData.maxEdgeLength);
        tessellateModifier.maxEdgeLength = mesh.userData.maxEdgeLength;
        //var m = Object3DUtil.getModelInstance(mesh, true);
        //var c = m? m.model.getCategory() : '';
        //console.log('tesselateModifier: ' + tessellateModifier.maxEdgeLength + ' ' + c, worldScale);
        tessellateModifier.modify(smooth);
      }
      smooth.computeFaceNormals();
      smooth.computeVertexNormals();
      smooth.computeBoundingSphere();
      smooth.computeBoundingBox();
      if (smooth._bufferGeometry) {
        smooth._bufferGeometry.setFromObject(mesh);
      }
      //smooth.needsUpdate  = true;
      smooth.verticesNeedUpdate = true;
      //smooth.elementsNeedUpdate = true;
      //smooth.morphTargetsNeedUpdate = true;
      //smooth.uvsNeedUpdate = true;
      smooth.normalsNeedUpdate = true;
      //smooth.colorsNeedUpdate = true;
      //smooth.tangentsNeedUpdate = true;

      // Next, we need to merge vertices to clean up any unwanted vertex.
      //smooth.mergeVertices();
      mesh.geometry = smooth;
    });
    console.timeEnd('tessellate');
  }
  this.setBrushSize(this.brushSize);

  // Set to neutral gray material
  this.__clearLabels(this.partsNode, this.defaultColor);

  // Show fake node
  Object3DUtil.setVisible(this.partsNode, false);
  if (this.showNodeCallback) {
    this.showNodeCallback(this.partsNode);
  }
};

module.exports = TriangleLabeler;