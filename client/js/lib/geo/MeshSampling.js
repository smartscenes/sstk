'use strict';

var Colors = require('util/Colors');
var ConnectivityGraph = require('geo/ConnectivityGraph2');
var Distances = require('geo/Distances');
var GeometryUtil = require('geo/GeometryUtil');
var TriangleAccessor = require('geo/TriangleAccessor');
var MaterialHelper = require('gfx/MaterialHelper');
var Object3DUtil = require('geo/Object3DUtil');
var ViewUtils = require('gfx/ViewUtils');
var RNG = require('math/RNG');
var _ = require('util/util');

/**
 * Utility functions for sampling meshes
 * @module MeshSampling
 * @memberOf geo
 */
var MeshSampling = {};

function findMatchingMesh(meshes, mesh, face) {
  return _.find(meshes, function(candidateMesh) {
    if (candidateMesh instanceof THREE.Mesh) {
      return mesh.uuid === candidateMesh.uuid;
    } else if (candidateMesh.mesh && candidateMesh.faceIndices) {
      return mesh.uuid === candidateMesh.mesh.uuid && _.indexOf(candidateMesh.faceIndices, face.index) >= 0;
    }
  });
}

function identifyInnerRedundantSurfaces(object3D, visible, opts) {
  opts = opts || {};
  _.defaults(opts, { ignoreAllLowScoringMaterials: false, minMaterialScore: 0.1, nsamples: 0,
    restrictRedundantToWhiteMaterial: false, checkReverseFaces: false });
  console.log('got opts for identifyInnerRedundantSurfaces', opts);
  Object3DUtil.getBoundingBox(object3D);
  // Identify white surfaces that are inner and not too useful (appears in models from trimble 3d warehouse)
  // Consider white material with no transparency or textures
  var checkHausdorffDistance = !opts.ignoreAllLowScoringMaterials;
  var threshold = opts.minMaterialScore;
  var epsilon = opts.epsilon || 0;
  var checkReverseFaces = opts.checkReverseFaces;
  console.time('identifyInnerRedundantSurfaces');
  function isWhiteMat(material) {
    var isOpaque = !material.transparent || material.opacity === 1;
    var hasTexture = material.map || material.bumpMap || material.normalMap || material.specularMap || material.envMap;
    var isWhite = (material.color.r === 1) && (material.color.g === 1) && (material.color.b === 1);
    return isOpaque && !hasTexture && isWhite;
  }
  var materials = Object3DUtil.getMaterialsMap(object3D);
  if (checkReverseFaces) {
    var connectivityGraphs = {};
    _.each(materials, function (material, k) {
      if (material.type === 'material') {
        if (material.meshes) {
          _.each(material.meshes, function (m, i) {
            if (m.mesh && m.faceIndices) {
              var mesh = m.mesh;
              if (!connectivityGraphs[mesh.geometry.id]) {
                connectivityGraphs[mesh.geometry.id] = new ConnectivityGraph(mesh.geometry, true);
              }
              var faceReversals = connectivityGraphs[mesh.geometry.id].getReverseFaceMappings();
              var facesByReversalMaterial = _.groupBy(m.faceIndices, function (fi) {
                if (faceReversals[fi] && faceReversals[fi].length) {
                  var materialIndices = _.uniq(_.map(faceReversals[fi], function (fi2) {
                    return GeometryUtil.getFaceMaterialIndex(mesh.geometry, fi2);
                  }));
                  return materialIndices[0];
                } else {
                  return -1;
                }
              });
              m.facesIndicesByReversalMaterial = facesByReversalMaterial;
            }
          });
        }
      }
    });
  }
  var materialScores = computeMaterialScores(object3D, visible);
  _.each(materialScores, function(v,k) {
    var material = materials[k];
    if (material) {
      material.score = v;
      material.isWhite = isWhiteMat(material.material);
      //console.log('material', material.material.id, material.material.name, material.score, material.isWhite);
    } else {
      console.log('Cannot find material', k);
    }
  });
  var possibleRedundantMaterials = [];
  var keepMeshes = [];
  _.each(materials, function(material,k) {
    if (material.type === 'material') {
      if ((!opts.restrictRedundantToWhiteMaterial || material.isWhite) && material.score < threshold) {
        possibleRedundantMaterials.push(material);
      } else if (material.meshes) {
        Array.prototype.push.apply(keepMeshes, material.meshes);
      }
    }
  });
  possibleRedundantMaterials = _.sortBy(possibleRedundantMaterials, function(m) { return [m.isWhite? 1 : 0, -m.score]; });
  var redundantMaterials = [];
  var notReallyRedundantMaterials = [];
  var redundantMeshes = [];
  var partlyRedundantMaterials = [];
  //console.log(possibleRedundantMaterials);
  var sampler = {
    sampleMeshes: function(meshes, nsamples) {
      var samples = MeshSampling.getMeshesSurfaceSamples(meshes, nsamples, {
        rng: opts.rng,
        skipUVColors: true
      });
      _.each(samples, function(meshSamples,index) {
        _.each(meshSamples, function(s,index) {
          s.meshIndex = index;
        });
      });
      return samples;
    }
  };
  for (var i = 0; i < possibleRedundantMaterials.length; i++) {
    var material = possibleRedundantMaterials[i];
    console.log('Testing material', material.material.name, material.isWhite, material.score);
    if (material.meshes && material.meshes.length) {
        // compute directed hausdorff distance from meshes with this material to meshes with other materials
      var okayMatMeshes = [];
      var redundantMatMeshes = [];
      var meshesToConsider = [];
      for (var j = 0; j < material.meshes.length; j++) {
        var mesh = material.meshes[j];
        if (mesh.facesIndicesByReversalMaterial) {
          _.each(mesh.facesIndicesByReversalMaterial, function(faceIndices, mid) {
            var split = {
              mesh: mesh.mesh,
              faceIndices: faceIndices,
              materialIndex: mesh.mesh.materialIndex
            };
            console.log('considering split', material.material.name, mesh.mesh.userData.id, faceIndices.length, mid);
            if (mid >= 0) {
              var isReverseOfKeepMesh = _.find(keepMeshes, function(km) {
                if (km.mesh && km.faceIndices) {
                  return km.mesh.id === mesh.mesh.id && mid == km.materialIndex;
                }
              });
              if (isReverseOfKeepMesh) {
                redundantMatMeshes.push(split);
                redundantMeshes.push(split);
                console.log('redundant split', material.material.name, mesh.mesh.userData.id, faceIndices.length, mid);
              } else {
                meshesToConsider.push(split);
              }
            } else {
              meshesToConsider.push(split);
            }
          });
        } else {
          meshesToConsider.push(mesh);
        }
      }
      for (var j = 0; j < meshesToConsider.length; j++) {
        var mesh = meshesToConsider[j];
        var opts = { all: true, shortCircuit: { maxDistSq: epsilon*2 }, sampler: sampler, nsamples: opts.nsamples };
        var distSq = checkHausdorffDistance? Distances.MeshesMeshesHausdorffDirectedDistanceSquared([mesh],
          keepMeshes, opts) : null;
        if (distSq && opts.all) {
          distSq.meshIndex0 = j;
        }
        //console.log('got distSq', distSq);
        if (!distSq || distSq.distanceSq < epsilon) {
          redundantMeshes.push(mesh);
          redundantMatMeshes.push(mesh);
        } else {
          // TODO: consider more intelligent updating of keepMeshes
          // console.log('got distSq', distSq, distSq.point0.distanceToSquared(distSq.point1), epsilon);
          keepMeshes.push(mesh);
          okayMatMeshes.push(mesh);
        }
      }
      if (okayMatMeshes.length === 0) {
        console.log('Rejecting material', material.material.name);
        redundantMaterials.push(material);
      } else if (redundantMatMeshes.length === 0) {
        console.log('Keeping material', material.material.name);
        notReallyRedundantMaterials.push(material);
      } else {
        // There is mix of keep and reject
        console.log('Mixed material', material.material.name);
        console.log('Rejecting meshes', _.map(redundantMatMeshes, function(x) {
          if (x instanceof THREE.Mesh) {
            return x.userData.id;
          } else if (x.mesh && x.faceIndices) {
            return x.mesh.userData.id + ':' + x.faceIndices.length;
          }
        }));
        partlyRedundantMaterials.push(material);
      }

    }
  }
  console.timeEnd('identifyInnerRedundantSurfaces');
  return {
    redundantMeshes: redundantMeshes,
    redundantMaterials: redundantMaterials,
    partlyRedundantMaterials: partlyRedundantMaterials,
    keepMeshes: keepMeshes,
    isRedundant: function(mesh, face) {
      return findMatchingMesh(redundantMeshes, mesh, face);
    },
    isKeep: function(mesh, face) {
      return findMatchingMesh(keepMeshes , mesh, face);
    }
  };
}

function computeMaterialScores(object3D, visible) {
  var visibleMaterialCounts = {};
  var materialAreas = {};
  //var meshTriCounts = {};
  Object3DUtil.traverseMeshes(object3D, false, function(m) {
    var T = new TriangleAccessor(m);
    var numTris = T.numTriangles();
    //meshTriCounts[m.id] = numTris;
    m.updateMatrixWorld();
    var meshMaterials = (m.material instanceof THREE.MultiMaterial)?  m.material.materials : (Array.isArray(m.material)? m.material : [m.material]);
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
  var meshMaterials = (mesh.material instanceof THREE.MultiMaterial)?  mesh.material.materials : (Array.isArray(mesh.material)? mesh.material : [mesh.material]);
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
    name: 'areaWithoutInnerRedundantMaterials',
    description: 'Weight each face by surface area (in world) and discounting inner redundant meshes with white materials',
    /**
     * Create sampling function that weights each face by visibility (ignoring inner redundant surfaces)
     * @param opts
     * @param [opts.visibleTriangles] {Object<int, Object<int, int>>} Map of mesh id to map of pickable face indices to counts
     * @param [opts.width] {int} Width of image to render (required if `opts.visibleTriangles` is not specified)
     * @param [opts.height] {int} Height of image to render (required if `opts.visibleTriangles` is not specified)
     * @param [opts.scene] {THREE.Object3D} Scene to render (required if `opts.visibleTriangles` is not specified)
     * @param [opts.checkReverseFaces] {boolean} Whether to explicitly check and align reversed faces
     * @param [opts.restrictRedundantToWhiteMaterial] {boolean} Whether to restrict redundant materials to just white materials
     * @param [opts.ignoreAllLowScoringMaterials] {boolean} Whether material with low scores should be ignored
     * @param [opts.minMaterialScore] {number} Threshold for low visibility material
     * @param [opts.nsamples] {int} If not `ignoreAllLowScoringMaterials`, sample this many points for hausdorff distance computation.
     * @param [opts.epsilon] {number} Epsilon distance threshold for considering a mesh to be redundant
     * @returns {function(THREE.Mesh, MeshSampling.Face): number}
     */
    create: function (opts) {
      var visible = opts.visibleTriangles || ViewUtils.identifyVisibleTriangles(opts);
      var redundantInfo = identifyInnerRedundantSurfaces(opts.scene, visible,
        _.pick(opts, ['restrictRedundantToWhiteMaterial', 'ignoreAllLowScoringMaterials', 'checkReverseFaces',
          'minMaterialScore', 'nsamples', 'rng', 'epsilon']));
      return function (mesh, face) {
        var faceArea = GeometryUtil.triangleAreaWithTransform(face.va, face.vb, face.vc, mesh.matrixWorld);
        var isRedundant = redundantInfo.isRedundant(mesh, face);
        return (!isRedundant) ? faceArea : 0;
      };
    }
  },
  {
    name: 'visibleWithArea',
    description: 'Weight each face by visible surface area (in world)',
    /**
     * Create sampling function that weights each face by visibility
     * @param opts
     * @param [opts.visibleTriangles] {Object<int, Object<int, int>>} Map of mesh id to map of pickable face indices to counts
     * @param [opts.width] {int} Width of image to render (required if `opts.visibleTriangles` is not specified)
     * @param [opts.height] {int} Height of image to render (required if `opts.visibleTriangles` is not specified)
     * @param [opts.scene] {THREE.Object3D} Scene to render (required if `opts.visibleTriangles` is not specified)
     * @returns {function(THREE.Mesh, MeshSampling.Face): number}
     */
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
    /**
     * Create sampling function that weights each face by visibility
     * @param opts
     * @param [opts.visibleTriangles] {Object<int, Object<int, int>>} Map of mesh id to map of pickable face indices to counts
     * @param [opts.width] {int} Width of image to render (required if `opts.visibleTriangles` is not specified)
     * @param [opts.height] {int} Height of image to render (required if `opts.visibleTriangles` is not specified)
     * @param [opts.scene] {THREE.Object3D} Scene to render (required if `opts.visibleTriangles` is not specified)
     * @param [opts.ignoreMaterialWithMinScore] {boolean} Whether material with low scores should be ignored
     * @param [opts.minMaterialScoreRange] {number[]} Min and max (as array) of low and high material score
     * @returns {function(THREE.Mesh, MeshSampling.Face): number}
     */
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
    /**
     * Create sampling function that weights each face by visibility
     * @param opts
     * @param [opts.visibleTriangles] {Object<int, Object<int, int>>} Map of mesh id to map of pickable face indices to counts
     * @param [opts.width] {int} Width of image to render (required if `opts.visibleTriangles` is not specified)
     * @param [opts.height] {int} Height of image to render (required if `opts.visibleTriangles` is not specified)
     * @param [opts.scene] {THREE.Object3D} Scene to render (required if `opts.visibleTriangles` is not specified)
     * @returns {function(THREE.Mesh, MeshSampling.Face): number}
     */
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
    /**
     * Create sampling function that weights each face by visibility
     * @param opts
     * @param [opts.visibleTriangles] {Object<int, Object<int, int>>} Map of mesh id to map of pickable face indices to counts
     * @param [opts.width] {int} Width of image to render (required if `opts.visibleTriangles` is not specified)
     * @param [opts.height] {int} Height of image to render (required if `opts.visibleTriangles` is not specified)
     * @param [opts.scene] {THREE.Object3D} Scene to render (required if `opts.visibleTriangles` is not specified)
     * @returns {function(THREE.Mesh, MeshSampling.Face): number}
     */
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
    /**
     * Create sampling function that weights each face by visibility
     * @param opts
     * @param [opts.targetNormal] {THREE.Vector3} Target normal to be similar to
     * @returns {function(THREE.Mesh, MeshSampling.Face): number}
     */
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
 * @param [opts.weightFn] {function(THREE.Mesh,MeshSampling.Face): number|{name:string, args:{}}|string} Function for weighted scoring of mesh faces
 * @param [opts.scoreFn] {function(THREE.Mesh,MeshSampling.Face): number|{name:string, args:{}}|string} Function for scoring final sample
 * @param [opts.recursive=false] {boolean} Whether to sample from child model instances as well
 * @param [opts.rng] {math.RNG} Random number generator
 * @param [opts.skipUVColors] {boolean} Whether to skip color sampling
 * @param [opts.handleMaterialSide] {boolean} Whether to negate normal based on material side
 * @param [opts.userDataFields] {string[]} Array of mesh user data fields to include
 * @returns {Array.<MeshSampling.PointSample>|*}
 */
MeshSampling.sampleObject = function(object3D, nsamples, opts) {
  var weightFn, scoreFn;
  object3D.updateMatrixWorld(); // Make sure matrix world updated
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
 * @property point {THREE.Vector3} Position of sample in local coordinates
 * @property worldPoint {THREE.Vector3} Position of sample in world coordinates
 * @property normal {THREE.Vector3} Normal of sample in local coordinates
 * @property worldNormal {THREE.Vector3} Normal of sample in world coordinates
 * @property uv {THREE.Vector2} UV of sample
 * @property color {THREE.Color} Color of sample (combined material and actual color)
 * @property opacity {float} Opacity of sample (from 0 to 1)
 * @property vertexColor {THREE.Color} Basic color of sample
 * @static
 */

/**
 * Samples point on mesh surfaces from an array of meshes
 * @param meshes {Array<THREE.Mesh>} Meshes to sample from
 * @param numSamples {int} Number of samples to draw
 * @param [opts] {{rng: math.RNG, skipUVColors: boolean, handleMaterialSide}}
 * @returns {Array<MeshSampling.PointSample>}
 * @static
 */
function getMeshesSurfaceSamples(meshes, numSamples, opts) {
  opts = opts || {};
  var meshWeights = _.map(meshes, function (meshOrPartial) {
    var mesh;
    var faceIndices;
    if (meshOrPartial instanceof THREE.Mesh) {
      mesh = meshOrPartial;
    } else if (meshOrPartial.mesh && meshOrPartial.faceIndices) {
      mesh = meshOrPartial.mesh;
      faceIndices = meshOrPartial.faceIndices;
    } else {
      throw "Unsupported mesh type";
    }
    if (opts.weightFn) {
      if (!_.isFunction(opts.weightFn)) {
        console.error('Invalid weightFn specification', opts);
      }
      // Custom weight function
      var T = new TriangleAccessor(mesh);
      var numTris = faceIndices? faceIndices.length : T.numTriangles();
      var meshWeight = 0;
      for (var i = 0; i < numTris; i++) {
        var iTri = faceIndices? faceIndices[i] : i;
        var face = T.get(iTri);
        meshWeight += opts.weightFn(mesh, face); // NOTE: face is not transformed
      }
      return meshWeight;
    } else {
      if (faceIndices) {
        return Object3DUtil.getSurfaceArea(mesh, {
          triFilter: function(v0,v1,v2,iFace) {
            return faceIndices.indexOf(iFace) >= 0;
          }
        });
      } else {
        return Object3DUtil.getSurfaceArea(mesh);
      }
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
 * @param mesh {THREE.Mesh|geo.PartialMesh} Mesh to sample from
 * @param numSamples {int} Number of samples to draw
 * @param [opts] {{rng: math.RNG, skipUVColors: boolean, handleMaterialSide: boolean, userDataFields: string[]}}
 * @returns {Array<MeshSampling.PointSample>}
 * @static
 */
function getMeshSurfaceSamples(mesh, numSamples, opts) {
  opts = opts || {};
  var faceIndices;
  if (mesh instanceof THREE.Mesh) {
    // use mesh as is;
  } else if (mesh.mesh && mesh.faceIndices) {
    faceIndices = mesh.faceIndices;
    mesh = mesh.mesh;
  } else {
    throw "Unsupported mesh type";
  }

  var rng = opts.rng || RNG.global;
  var face, i;
  var T = new TriangleAccessor(mesh);
  var numTris = faceIndices? faceIndices.length : T.numTriangles();
  var result = [];
  if (numTris < 1) {
    return result;
  }

  // precompute face areas
  var totalWeight = 0;
  var cumulativeWeights = [];
  for (i = 0; i < numTris; i++) {
    var iTri = faceIndices? faceIndices[i] : i;
    face = T.get(iTri);
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
    var iTri = faceIndices? faceIndices[index] : index;
    face = T.get(iTri);
    face.sampleWeight = cumulativeWeights[index] - (cumulativeWeights[index-1] || 0);
    if (opts.scoreFn) {
      face.score = opts.scoreFn(mesh, face);
    }
    var ruv = randomBarycentricCoords(rng);
    var p  = baryCentricInterpolation(ruv, face.va, face.vb, face.vc);
    var n  = face.hasNormals ? baryCentricInterpolation(ruv, face.na, face.nb, face.nc).normalize() : null;
    var uv  = face.hasUVs ? baryCentricInterpolation(ruv, face.uva, face.uvb, face.uvc) : null;
    var c  = face.hasVertexColors ? baryCentricInterpolation(ruv, face.ca, face.cb, face.cc) : null;
    if (opts.handleMaterialSide) {
      var material = getMaterial(mesh, face.materialIndex);
      if (material.side === THREE.DoubleSide) {
        if (rng.random() > 0.5) {
          n.negate();
        }
      } else if (material.side === THREE.BackSide) {
        n.negate();
      }
    }
    var sample = { /*mesh: mesh, */face: face,
      point: p, worldPoint: p.clone().applyMatrix4(mesh.matrixWorld),
      normal: n, worldNormal: n? n.clone().applyMatrix3(normalMatrix).normalize() : null,
      uv: uv, vertexColor: c
    };
    if (opts.userDataFields) {
      _.merge(sample, _.pick(mesh.userData, opts.userDataFields));
    }
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

/**
 * @typedef MeshSampling.Face
 * @type {object}
 * @property {int} index
 * @property {THREE.Vector3} va - Vertex position
 * @property {THREE.Vector3} vb - Vertex position
 * @property {THREE.Vector3} vc - Vertex position
 * @property {THREE.Vector3} [na] - Vertex normal
 * @property {THREE.Vector3} [nb] - Vertex normal
 * @property {THREE.Vector3} [nc] - Vertex normal
 * @property {THREE.Color} [ca] - Vertex color
 * @property {THREE.Color} [cb] - Vertex color
 * @property {THREE.Color} [cc] - Vertex color
 * @property {THREE.Vector2} [uva] - Vertex uv
 * @property {THREE.Vector2} [uvb] - Vertex uv
 * @property {THREE.Vector2} [uvc] - Vertex uv
 */

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

function getMaterial(mesh, materialIndex) {
  var material = mesh.material;
  if (Array.isArray(material)) {
    material = material[materialIndex];
  } else if (material instanceof THREE.MultiMaterial) {
    material = material.materials[materialIndex];
  }
  return material;
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
    if (Array.isArray(material)) {
      var materialIndex = sample.face.materialIndex;
      material = material[materialIndex];
    } else if (material instanceof THREE.MultiMaterial) {
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

MeshSampling.getDefaultSampler = function(rng) {
  rng = rng || RNG.global;
  return {
    sampleMeshes: function(meshes, nsamples) {
      var samples = MeshSampling.getMeshesSurfaceSamples(meshes, nsamples, {
        rng: rng,
        skipUVColors: true
      });
      _.each(samples, function(meshSamples,index) {
        _.each(meshSamples, function(s,index) {
          s.meshIndex = index;
        });
      });
      return samples;
    }
  };
}

module.exports = MeshSampling;
