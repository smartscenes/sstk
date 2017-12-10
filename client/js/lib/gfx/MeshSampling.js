'use strict';

var Colors = require('util/Colors');
var GeometryUtil = require('geo/GeometryUtil');
var MaterialHelper = require('gfx/MaterialHelper');
var Object3DUtil = require('geo/Object3DUtil');
var ViewUtils = require('gfx/ViewUtils');
var RNG = require('math/RNG');
var _ = require('util');

/**
 * Utility functions for sampling meshes
 * @module MeshSampling
 */
var MeshSampling = {};


function computeMaterialScores(object3D, visible) {
  var visibleMaterialCounts = {};
  var materialAreas = {};
  //var meshTriCounts = {};
  Object3DUtil.traverseMeshes(object3D, false, function(m) {
    var T = new TriangleAccessor(m);
    var numTris = T.numTriangles();
    //meshTriCounts[m.id] = numTris;
    m.updateMatrixWorld();
    var meshMaterials = (m.material instanceof THREE.MultiMaterial)?  m.material.materials : [m.material];
    for (var i = 0; i < numTris; i++) {
      var face = T.get(i);
      var faceArea = GeometryUtil.triangleAreaWithTransform(face.va, face.vb, face.vc, m.matrixWorld);
      var matIndex = face.materialIndex || 0;
      var material = meshMaterials[matIndex];
      materialAreas[material.id] = (materialAreas[material.id] || 0) + faceArea;
      visibleMaterialCounts[material.id] = (visibleMaterialCounts[material.id] || 0) + (_.get(visible, [m.id, face.index]) || 0);
    }
  });
  //var totalTris = _.sum(_.values(meshTriCounts));
  var totalVisible = _.sum(_.values(visibleMaterialCounts));
  var nMaterials = _.size(visibleMaterialCounts);
  var sumArea = _.sum(_.values(materialAreas));
  var materialScores = _.mapValues(materialAreas, function(c,mid) {
    var areaFraction = c/sumArea;
    var vc = visibleMaterialCounts[mid] || 0;
    var materialVisibility = (vc+1)/(totalVisible+nMaterials);
    return _.clamp(materialVisibility/areaFraction, 0, 1);
  });
  return materialScores;
}

function getMaterialScore(materialScores, mesh, face) {
  var meshMaterials = (mesh.material instanceof THREE.MultiMaterial)?  mesh.material.materials : [mesh.material];
  var matIndex = face.materialIndex || 0;
  var material = meshMaterials[matIndex];
  return materialScores[material.id];
}

// Predefined face weighing functions
MeshSampling.WeightFns = [
  {
    name: 'area',
    description: 'Weight each face by surface area (in world)',
    create: function () {
      return function (mesh, face) {
        var faceArea = GeometryUtil.triangleAreaWithTransform(face.va, face.vb, face.vc, mesh.matrixWorld);
        return faceArea;
      };
    }
  },
  {
    name: 'visibleWithArea',
    description: 'Weight each face by visible surface area (in world)',
    create: function (opts) {
      //console.log('identifyVisibleTriangles', opts);
      var visible = opts.visibleTriangles || ViewUtils.identifyVisibleTriangles(opts);
      return function (mesh, face) {
        var faceArea = GeometryUtil.triangleAreaWithTransform(face.va, face.vb, face.vc, mesh.matrixWorld);
        var isVisible = (visible[mesh.id] && visible[mesh.id][face.index]) ? 1 : 0;
        return (isVisible) ? faceArea : 0;
      };
    }
  },
  {
    name: 'areaWithVisibleMaterial',
    description: 'Weight each face by visibility (taking into account material visibility)',
    create: function (opts) {
      //console.log('identifyVisibleTriangles', opts);
      var visible = opts.visibleTriangles || ViewUtils.identifyVisibleTriangles(opts);
      //var meshCounts = _.mapValues(visible, function(mv, mid) {
      //  return _.sum(_.values(mv));
      //});
      //var totalVisible = _.sum(_.values(meshCounts));
      var materialScores = computeMaterialScores(opts.scene, visible);
      var minMaterialScore = _.min(_.values(materialScores));
      var materialScoreThreshold = (_.size(materialScores) > 1 && opts.ignoreMaterialWithMinScore)? minMaterialScore : 0;
      if (opts.minMaterialScoreRange) {
        materialScoreThreshold = _.clamp(materialScoreThreshold, opts.minMaterialScoreRange[0], opts.minMaterialScoreRange[1]);
      }
      console.log('minMaterialScore=' + minMaterialScore + ', materialScoreThreshold=' + materialScoreThreshold);
      //console.log('materialScores', materialScores, materialAreas, visibleMaterialCounts, sumArea, totalVisible, nMaterials);
      return function (mesh, face) {
        var materialScore = getMaterialScore(materialScores, mesh, face);
        var faceArea = GeometryUtil.triangleAreaWithTransform(face.va, face.vb, face.vc, mesh.matrixWorld);
        //var isVisible = (visible[mesh.id] && visible[mesh.id][face.index]) ? 1 : 0;
        return (materialScore > materialScoreThreshold)? faceArea : 0;

        //var visibility = (totalVisible && visible[mesh.id] && visible[mesh.id][face.index])? visible[mesh.id][face.index]/totalVisible : 0;
        //return materialScore*visibility;
      };
    }
  },
  {
    name: 'visibility',
    description: 'Weight each face by visibility',
    create: function (opts) {
      //console.log('identifyVisibleTriangles', opts);
      var visible = opts.visibleTriangles || ViewUtils.identifyVisibleTriangles(opts);
      var meshCounts = _.mapValues(visible, function(mv, mid) {
        return _.sum(_.values(mv));
      });
      var totalVisible = _.sum(_.values(meshCounts));
      return function (mesh, face) {
        var visibility = (totalVisible && visible[mesh.id] && visible[mesh.id][face.index])? visible[mesh.id][face.index]/totalVisible : 0;
        return visibility;
      };
    }
  },
  {
    name: 'smoothedVisibility',
    description: 'Weight each face by visibility (with add one smoothing)',
    create: function (opts) {
      //console.log('identifyVisibleTriangles', opts);
      var visible = opts.visibleTriangles || ViewUtils.identifyVisibleTriangles(opts);
      var meshCounts = _.mapValues(visible, function(mv, mid) {
        return _.sum(_.values(mv));
      });
      var meshTriCounts = {};
      Object3DUtil.traverseMeshes(opts.scene, false, function(m) {
        meshTriCounts[m.id] = GeometryUtil.getGeometryFaceCount(m);
      });
      var totalVisible = _.sum(_.values(meshCounts)) + _.sum(_.values(meshTriCounts));
      return function (mesh, face) {
        var visibility = (totalVisible && visible[mesh.id] && visible[mesh.id][face.index])? (1+visible[mesh.id][face.index])/totalVisible : 1/totalVisible;
        return visibility;
      };
    }
  },
  {
    name: 'areaWithNormal',
    description: 'Weight each face by surface area and similarity to target normal',
    create: function(opts) {
      return function(mesh, face) {
        var targetNormal = opts.targetNormal;
        var triArea = GeometryUtil.triangleAreaWithTransform(face.va, face.vb, face.vc, mesh.matrixWorld);
        if (targetNormal) {
          if (!mesh.__cachedTargetVector) {
            mesh.updateMatrixWorld();
            var normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
            var normalMatrixInverse = new THREE.Matrix3().getInverse(normalMatrix);
            mesh.__cachedTargetVector = targetNormal.clone().applyMatrix3(normalMatrixInverse).normalize();
          }
          var triNormal = GeometryUtil.triangleNormal(face.va, face.vb, face.vc);
          var weight = mesh.__cachedTargetVector.dot(triNormal);
          weight = Math.max(weight, 0);
          return weight * triArea;
        } else {
          return triArea;
        }
      };
    },
    dispose: function(mesh) {
      delete mesh.__cachedTargetVector;
    }
  }
];

MeshSampling.WeightFnsByName = _.keyBy(MeshSampling.WeightFns, 'name');

/**
 * Helper function for sampling mesh points from a object3D
 * @param object3D {THREE.Object3D} Object to sample from
 * @param nsamples {int} Number of samples to take
 * @param opts Additional sampling options
 * @param [opts.weightFn] {function(THREE.Mesh,Face): number|{name:string, args:{}}|string} Function for weighted scoring of mesh faces
 * @param [opts.scoreFn] {function(THREE.Mesh,Face): number|{name:string, args:{}}|string} Function for scoring final sample
 * @returns {Array.<MeshSampling.PointSample>|*}
 */
MeshSampling.sampleObject = function(object3D, nsamples, opts) {
  var weightFn, scoreFn;
  if (opts.weightFn) {
    if (_.isPlainObject(opts.weightFn)) {
      weightFn = MeshSampling.WeightFnsByName[opts.weightFn.name];
      opts = _.defaults({
        weightFn: weightFn.create(opts.weightFn.args)
      }, opts);
    } else if (_.isString(opts.weightFn)) {
      weightFn = MeshSampling.WeightFnsByName[opts.weightFn];
      opts = _.defaults({
        weightFn: weightFn.create()
      }, opts);
    }
  }
  if (opts.scoreFn) {
    if (_.isPlainObject(opts.scoreFn)) {
      scoreFn = MeshSampling.WeightFnsByName[opts.scoreFn.name];
      opts = _.defaults({
        scoreFn: scoreFn.create(opts.scoreFn.args)
      }, opts);
    } else if (_.isString(opts.scoreFn)) {
      scoreFn = MeshSampling.WeightFnsByName[opts.scoreFn];
      opts = _.defaults({
        scoreFn: scoreFn.create()
      }, opts);
    }
  }
  var meshes;
  if (Array.isArray(object3D)) {
    meshes = [];
    for (var i = 0; i < object3D.length; i++) {
      meshes = Object3DUtil.getVisibleMeshList(object3D[i], opts.recursive, meshes);
    }
  } else {
    meshes = Object3DUtil.getVisibleMeshList(object3D, opts.recursive);
  }
  var samples = MeshSampling.getMeshesSurfaceSamples(meshes, nsamples, opts);
  if (weightFn && weightFn.dispose) {
    for (var i = 0; i < meshes.length; i++) {
      weightFn.dispose(meshes[i]);
    }
  }
  if (scoreFn && scoreFn.dispose) {
    for (var i = 0; i < meshes.length; i++) {
      scoreFn.dispose(meshes[i]);
    }
  }
  return samples;
};

/**
 * Sampled point from a mesh (normals, uv, color are interpolated from vertices)
 * @typedef {object} PointSample
 * @property face
 * @property point {THREE.Vector3}
 * @property worldPoint {THREE.Vector3}
 * @property normal {THREE.Vector3}
 * @property worldNormal {THREE.Vector3}
 * @property uv {THREE.Vector2}
 * @property vertexColor {THREE.Color}
 * @static
 */

/**
 * Samples point on mesh surfaces from an array of meshes
 * @param meshes {Array<THREE.Mesh>} Meshes to sample from
 * @param numSamples {int} Number of samples to draw
 * @param [opts] {{rng: math.RNG, skipUVColors: boolean}}
 * @returns {Array<MeshSampling.PointSample>}
 * @static
 */
function getMeshesSurfaceSamples(meshes, numSamples, opts) {
  opts = opts || {};
  var meshWeights = _.map(meshes, function (mesh) {
    if (opts.weightFn) {
      if (!_.isFunction(opts.weightFn)) {
        console.error('Invalid weightFn specification', opts);
      }
      // Custom weight function
      var T = new TriangleAccessor(mesh);
      var numTris = T.numTriangles();
      var meshWeight = 0;
      for (var i = 0; i < numTris; i++) {
        var face = T.get(i);
        meshWeight += opts.weightFn(mesh, face); // NOTE: face is not transformed
      }
      return meshWeight;
    } else {
      return Object3DUtil.getSurfaceArea(mesh);
    }
  });
  var totalWeight = _.sum(meshWeights);
  //console.log('meshWeights', meshWeights);
  var samplesPerMesh = _.map(meshWeights, function (a) {
    return Math.max(0, Math.ceil(a / totalWeight * numSamples));
  });
  var samples = _.map(meshes, function (m, i) {
    return MeshSampling.getMeshSurfaceSamples(m, samplesPerMesh[i], opts);
  });
  return samples;
}
MeshSampling.getMeshesSurfaceSamples = getMeshesSurfaceSamples;

/**
 * Samples a single mesh
 * @param mesh {THREE.Mesh} Mesh to sample from
 * @param numSamples {int} Number of samples to draw
 * @param [opts] {{rng: math.RNG, skipUVColors: boolean}}
 * @returns {Array<MeshSampling.PointSample>}
 * @static
 */
function getMeshSurfaceSamples(mesh, numSamples, opts) {
  opts = opts || {};
  var rng = opts.rng || RNG.global;
  var face, i;
  var T = new TriangleAccessor(mesh);
  var numTris = T.numTriangles();
  var result = [];
  if (numTris < 1) {
    return result;
  }

  // precompute face areas
  var totalWeight = 0;
  var cumulativeWeights = [];
  for (i = 0; i < numTris; i++) {
    face = T.get(i);
    if (opts.weightFn) {
      totalWeight += opts.weightFn(mesh, face);
    } else {
      var triArea = GeometryUtil.triangleArea(face.va, face.vb, face.vc);
      totalWeight += triArea;
    }
    cumulativeWeights.push(totalWeight);
  }

  // pick random face weighted by face area
  mesh.updateMatrixWorld();
  var normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  for (i = 0; i < numSamples; i++) {
    var r = rng.random() * totalWeight;
    var index = _.sortedIndex(cumulativeWeights, r);
    face = T.get(index);
    face.sampleWeight = cumulativeWeights[index] - (cumulativeWeights[index-1] || 0);
    if (opts.scoreFn) {
      face.score = opts.scoreFn(mesh, face);
    }
    var ruv = randomBarycentricCoords(rng);
    var p  = baryCentricInterpolation(ruv, face.va, face.vb, face.vc);
    var n  = face.hasNormals ? baryCentricInterpolation(ruv, face.na, face.nb, face.nc).normalize() : null;
    var uv  = face.hasUVs ? baryCentricInterpolation(ruv, face.uva, face.uvb, face.uvc) : null;
    var c  = face.hasVertexColors ? baryCentricInterpolation(ruv, face.ca, face.cb, face.cc) : null;
    var sample = { /*mesh: mesh, */face: face,
      point: p, worldPoint: p.clone().applyMatrix4(mesh.matrixWorld),
      normal: n, worldNormal: n? n.clone().applyMatrix3(normalMatrix).normalize() : null,
      uv: uv, vertexColor: c
    };
    if (opts.convertSample) {
      result[i] = opts.convertSample(sample);
    } else {
      result[i] = sample;
    }
  }

  if (!opts.skipUVColors) {
    populateUVColors(mesh, result);
  }
  return result;
}
MeshSampling.getMeshSurfaceSamples = getMeshSurfaceSamples;

function TriangleAccessor(mesh) {
  this.mesh = mesh;
  this.geo = mesh.geometry;
  this.isBufferGeometry = mesh.geometry instanceof THREE.BufferGeometry;
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

// TODO(MS): quick hack to get default tri fields, generalize and make work with BufferGeometry
TriangleAccessor.prototype.get = function (i) {
  var face = { index: i };  // fields : va, vb, vc, na, nb, nc, ca, cb, cc, uva, uvb, uvc, materialIndex
  if (this.isBufferGeometry) {
    var vidxs = GeometryUtil.getFaceVertexIndices(this.geo, i);

    face.va = GeometryUtil.getGeometryVertex(this.geo, vidxs[0]);
    face.vb = GeometryUtil.getGeometryVertex(this.geo, vidxs[1]);
    face.vc = GeometryUtil.getGeometryVertex(this.geo, vidxs[2]);

    if (this.geo.groups) {  // material indices
      var group = _.find(this.geo.groups, function (g) {
        return (i >= g.start) && (i < g.start + g.count);
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

function randomBarycentricCoords(rng) {
  rng = rng || RNG.global;
  var u = rng.random();
  var v = rng.random();
  if ((u + v) > 1) {
    u = 1 - u;
    v = 1 - v;
  }
  return { u: u, v: v };
}

function baryCentricInterpolation(uv, a, b, c) {
  var x = a.clone();
  x.multiplyScalar(uv.u);
  var y = b.clone();
  y.multiplyScalar(uv.v);
  x.add(y);
  y.copy(c);
  y.multiplyScalar(1 - uv.u - uv.v);
  x.add(y);
  return x;
}

/**
 * Populate each sample with color and opacity
 * @param mesh {THREE.Mesh}
 * @param samples {Array<{uv: THREE.Vector2, face: {materialIndex: int}>}
 * @private
 */
function populateUVColors (mesh, samples) {
  var texuv = new THREE.Vector2();
  var warned = {};
  for (var i = 0; i < samples.length; i++) {
    var sample = samples[i];

    var material = mesh.material;
    if (material instanceof THREE.MultiMaterial) {
      var materialIndex = sample.face.materialIndex;
      material = material.materials[materialIndex];
    }

    if (material.transparent) {
      sample.opacity = material.opacity;
    } else {
      sample.opacity = 1;
    }

    if (material.vertexColors === THREE.VertexColors) {
      sample.color = sample.vertexColor;
    }

    var textureOpacity = 1;
    if (material.map && sample.uv) {
      if (!material.map.imageData) {
        material.map.imageData = MaterialHelper.getImageData(material.map.image);
      }
      if (material.map.imageData) {
        texuv.copy(sample.uv);
        material.map.transformUv(texuv);
        var pix = MaterialHelper.getPixelAtUV(material.map.imageData, texuv.x, texuv.y);
        if (Colors.isValidColor(pix)) {
          sample.color = new THREE.Color(pix.r / 255, pix.g / 255, pix.b / 255);  // overwrites color
          // Handle alpha from transparent PNGs
          textureOpacity = pix.a/255;
        } else {
          console.log('MeshSampling: Invalid color from material map', material.map, sample, texuv);
        }
      } else {
        if (!warned[material.map.name]) {
          console.warn('MeshSampling: Cannot get image data for texture', material.map.name);
          warned[material.map.name] = 1;
        }
      }
    }

    if (textureOpacity < 1 && material.transparent) {
      sample.opacity = textureOpacity;
    }
    if (material.color) {
      if (!sample.color) {  // just copy material color
        sample.color = material.color;
      } else {
        // TODO: Combine material.color with sampled texture color
        if (textureOpacity < 1) {
          // Handles when texture is a bit transparent
          var matWeight = 1 - textureOpacity;
          var sampleWeight = textureOpacity;
          sample.color.setRGB(sample.color.r*sampleWeight + material.color.r*matWeight,
            sample.color.g*sampleWeight + material.color.g*matWeight,
            sample.color.b*sampleWeight + material.color.b*matWeight);
        }
      }
    }
  }
}

module.exports = MeshSampling;
