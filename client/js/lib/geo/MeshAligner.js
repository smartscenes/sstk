
const GeometryUtil = require('geo/GeometryUtil');
const MatrixUtil = require('math/MatrixUtil');
const Materials = require('materials/Materials');
const Object3DUtil = require('geo/Object3DUtil');
const _ = require('util/util');

const MeshAligner = {};

function withinRange(a, min, max) {
  return a >= min && a <= max;
}

function checkMeshesCompatible(sourceMesh, targetMesh, opts) {
  const messages = [];
  if (opts.checkVerts) {
    const verts1 = GeometryUtil.getGeometryVertexCount(sourceMesh.geometry);
    const verts2 = GeometryUtil.getGeometryVertexCount(targetMesh.geometry);
    if (verts1 != verts2) {
      const vertMessage = `Vertex count do not match: ${verts1} vs ${verts2}`;
      if (!withinRange(verts1, verts2 * (1 - opts.percDiff), verts2 * (1 + opts.percDiff))) {
        return {isCompatible: false, message: vertMessage};
      }
      messages.push(vertMessage);
    }
  }
  if (opts.checkFaces) {
    const tris1 = GeometryUtil.getGeometryFaceCount(sourceMesh.geometry);
    const tris2 = GeometryUtil.getGeometryFaceCount(targetMesh.geometry);
    if (tris1 != tris2) {
      const triMessage = `Triangle count do not match: ${tris1} vs ${tris2}`;
      if (!withinRange(tris1, tris2 * (1 - opts.percDiff), tris2 * (1 + opts.percDiff))) {
        return {isCompatible: false, message: triMessage};
      }
      messages.push(triMessage);
    }
  }
  if (opts.checkObbSize) {
    // check obb size
    const sourceObb = Object3DUtil.getOrientedBoundingBox(sourceMesh);
    const targetObb = Object3DUtil.getOrientedBoundingBox(targetMesh);
    const sourceHalfWidths = sourceObb.halfSizes.toArray();
    const targetHalfWidths = targetObb.halfSizes.toArray();
    const orderedSourceHalfWidths = _.sortBy(sourceHalfWidths);
    const orderedTargetHalfWidths = _.sortBy(targetHalfWidths);
    for (let i = 0; i < 3; i++) {
      const sv = orderedSourceHalfWidths[i];
      const tv = orderedTargetHalfWidths[i];
      if (sv != tv) {
        const obbMessage = `Obb size do not match: ${orderedSourceHalfWidths} vs ${orderedTargetHalfWidths}`;
        if (!withinRange(sv, tv * (1 - opts.obbPercDiff), tv * (1 + opts.obbPercDiff))) {
          return {isCompatible: false, message: obbMessage};
        }
      }
    }
  }

  if (opts.checkMaterials) {
    // TODO: sometimes two geometries will use the same textures, but they will be different parts of the texture...
    // get materials for sourceMesh and targetMesh
    const matMatch = Materials.isMaterialsSame(sourceMesh.material, targetMesh.material, true);
    // console.log(`materials same ${matMatch}`);
    if (!matMatch) {
      const matMessage = `Materials do not match`;
      return {isCompatible: false, message: matMessage};
    }
  }
  return { isCompatible: true, message: messages.length? messages.join('; ') : undefined };
}

function checkSourceToTargetVertsAligned(sourceMesh, targetMesh,
                                         sourceToTargetVertMapping, sourceToTargetTransform,
                                         distThreshold, numDiffThreshold, verbose) {
  const numVerts = GeometryUtil.getGeometryVertexCount(sourceMesh.geometry);
  const sv = new THREE.Vector3();
  const tv = new THREE.Vector3();
  const diff = new THREE.Vector3();
  const t1 = new THREE.Matrix4();
  t1.multiplyMatrices(sourceToTargetTransform, sourceMesh.matrixWorld);
  const t2 = new THREE.Matrix4();
  t2.copy(targetMesh.matrixWorld);
  let numDiff = 0;
  for (let si = 0; si < numVerts; si++) {
    const ti = sourceToTargetVertMapping? sourceToTargetVertMapping[si] : si;
    if (ti != null) {
      GeometryUtil.getGeometryVertex(sourceMesh.geometry, si, t1, sv);
      GeometryUtil.getGeometryVertex(targetMesh.geometry, ti, t2, tv);
      diff.subVectors(sv, tv);
      if (diff.lengthSq() >= distThreshold) {
        if (verbose) {
          console.log('got diff', si, ti, numVerts, diff.lengthSq());
        }
        numDiff++;
        if (numDiff > numDiffThreshold) {
          return false;
        }
      }
    } else {
      if (verbose) {
        console.log('no mapping', si, numVerts);
      }
      numDiff++;
      if (numDiff > numDiffThreshold) {
        return false;
      }
    }
  }
  return true;
}

function checkAlignmentMatrixVerts(sourceMesh, targetMesh, sourceTargetTransform, distTh, distSqTh, numDiffTh, verbose) {
  const stmapping = GeometryUtil.getVertexMapping(sourceMesh.geometry, targetMesh.geometry, distTh, sourceTargetTransform, targetMesh.matrixWorld);
  // check alignment matrix
  let aligned = checkSourceToTargetVertsAligned(sourceMesh, targetMesh, stmapping, sourceTargetTransform, distSqTh, numDiffTh, verbose);
  if (!aligned) return false;

  // check reverse alignment matrix
  const targetSourceTransform = sourceTargetTransform.clone().invert();
  const tsmapping = GeometryUtil.getVertexMapping(targetMesh.geometry, sourceMesh.geometry, distTh, targetMesh.matrixWorld, sourceTargetTransform);
  aligned = checkSourceToTargetVertsAligned(targetMesh, sourceMesh, tsmapping, targetSourceTransform, distSqTh, numDiffTh, verbose);
  return aligned;
}


function getInitialAlignmentByTriangle(sourceMesh, targetMesh) {
  const iface = 0;
  const fvertIndices = GeometryUtil.getFaceVertexIndices(sourceMesh.geometry, iface);
  const sv0 = GeometryUtil.getGeometryVertex(sourceMesh.geometry, fvertIndices[0], sourceMesh.matrixWorld);
  const sv1 = GeometryUtil.getGeometryVertex(sourceMesh.geometry, fvertIndices[1], sourceMesh.matrixWorld);
  const sv2 = GeometryUtil.getGeometryVertex(sourceMesh.geometry, fvertIndices[2], sourceMesh.matrixWorld);
  const tv0 = GeometryUtil.getGeometryVertex(targetMesh.geometry, fvertIndices[0], targetMesh.matrixWorld);
  const tv1 = GeometryUtil.getGeometryVertex(targetMesh.geometry, fvertIndices[1], targetMesh.matrixWorld);
  const tv2 = GeometryUtil.getGeometryVertex(targetMesh.geometry, fvertIndices[2], targetMesh.matrixWorld);
  const sn = GeometryUtil.triangleNormal(sv0, sv1, sv2);
  const tn = GeometryUtil.triangleNormal(tv0, tv1, tv2);
  const sd = new THREE.Vector3().subVectors(sv1, sv0).normalize();
  const td = new THREE.Vector3().subVectors(tv1, tv0).normalize();
  const alignmentMatrix = MatrixUtil.getAlignmentMatrix(sn,sd, tn,td);
  applyTranslationToRotationAlignmentMatrix(alignmentMatrix, sourceMesh, targetMesh);
  return alignmentMatrix;
}

function applyTranslationToRotationAlignmentMatrix(alignmentMatrix, sourceMesh, targetMesh) {
  sourceMesh.geometry.computeBoundingSphere();
  targetMesh.geometry.computeBoundingSphere();
  const sc = sourceMesh.geometry.boundingSphere.center.clone().applyMatrix4(sourceMesh.matrixWorld);
  const tc = targetMesh.geometry.boundingSphere.center.clone().applyMatrix4(targetMesh.matrixWorld);
  // const sourceObb = Object3DUtil.getOrientedBoundingBox(sourceMesh);
  // const targetObb = Object3DUtil.getOrientedBoundingBox(targetMesh);
  // const sc = sourceObb.getCenter();
  // const tc = targetObb.getCenter();
  const mscMat4 = new THREE.Matrix4().makeTranslation(-sc.x, -sc.y, -sc.z);
  const tcMat4 = new THREE.Matrix4().makeTranslation(tc.x, tc.y, tc.z);

  alignmentMatrix.multiply(mscMat4);
  alignmentMatrix.premultiply(tcMat4);
  return alignmentMatrix;
}

function getInitialAlignmentsByOBB(sourceMesh, targetMesh, allowMirror) {
  const sourceObb = Object3DUtil.getOrientedBoundingBox(sourceMesh);
  const targetObb = Object3DUtil.getOrientedBoundingBox(targetMesh);
  const sourceHalfWidths = sourceObb.halfSizes.toArray();
  const targetHalfWidths = sourceObb.halfSizes.toArray();
  const s0 = _.minBy([0,1,2], i => Math.abs(sourceHalfWidths[i] - targetHalfWidths[0] ));
  const other = [0,1,2].filter(i => i !== s0);
  const s1 = _.minBy(other, i => Math.abs(sourceHalfWidths[i] - targetHalfWidths[1] ));

  const sourceBasis = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const targetBasis = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  sourceObb.extractBasis(sourceBasis[0], sourceBasis[1], sourceBasis[2]);
  targetObb.extractBasis(targetBasis[0], targetBasis[1], targetBasis[2]);

  const transforms = [];
  const align1 = Object3DUtil.getAlignmentMatrix(sourceBasis[s0], sourceBasis[s1], targetBasis[0], targetBasis[1]);
  applyTranslationToRotationAlignmentMatrix(align1, sourceMesh, targetMesh);
  transforms.push(align1);
  const align2 = Object3DUtil.getAlignmentMatrix(sourceBasis[s0].clone().negate(), sourceBasis[s1], targetBasis[0], targetBasis[1]);
  applyTranslationToRotationAlignmentMatrix(align2, sourceMesh, targetMesh);
  transforms.push(align2);
  if (allowMirror) {
    const align3 = Object3DUtil.getAlignmentMatrix(sourceBasis[s0], sourceBasis[s1], targetBasis[0], targetBasis[1]);
    align3.scale(new THREE.Vector3(-1, 1, 1));
    applyTranslationToRotationAlignmentMatrix(align3, sourceMesh, targetMesh);
    transforms.push(align3);
    align3.isMirrored = true;

    const align4 = Object3DUtil.getAlignmentMatrix(sourceBasis[s0].clone().negate(), sourceBasis[s1], targetBasis[0], targetBasis[1]);
    align4.scale(new THREE.Vector3(-1, 1, 1));
    applyTranslationToRotationAlignmentMatrix(align4, sourceMesh, targetMesh);
    align4.isMirrored = true;
    transforms.push(align4);
  }
  return transforms;
}

function alignMeshesSemiExact(sourceMesh, targetMesh, opts) {
  opts = _.defaultsDeep(Object.create(null), opts || {}, {
    maxVertDist: 0.01,
    maxVertDistPerc: 0.01,
    //maxVertDist: 0.1,
    //maxVertDistPerc: 0.05,
    maxDiffThresh: 0,          // max number of differences we allow
    allowMirror: true,
    compatibleCheck: {
      facesPercDiff: 0.1,
      vertsPercDiff: 0.1,
      obbPercDiff: 0.02,
      //obbPercDiff: 0.1,
      checkVerts: true,
      checkFaces: true,
      checkObbSize: true,
      checkMaterials: true
    }
  });
  const res = checkMeshesCompatible(sourceMesh, targetMesh, opts.compatibleCheck);
  let maxDist = opts.maxVertDist;
  let maxDistSq = maxDist*maxDist;
  if (res.isCompatible) {
    const sourceObb = Object3DUtil.getOrientedBoundingBox(sourceMesh);
    const targetObb = Object3DUtil.getOrientedBoundingBox(targetMesh);
    const minDist = Math.min(sourceObb.diagonalLength(), targetObb.diagonalLength());
    const maxDistPerc = opts.maxVertDistPerc;
    const minThresSq = (maxDistPerc*minDist)*(maxDistPerc*minDist);
    if (minThresSq < maxDistSq) {
      console.log(`using maxDistSq of ${minThresSq} instead of ${maxDistSq}`);
      maxDistSq = minThresSq;
      maxDist = maxDistPerc*minDist;
    }
  }
  if (res.isCompatible) {
    const alignmentMatrix = getInitialAlignmentByTriangle(sourceMesh, targetMesh);

    // check alignment matrix
    const aligned = checkAlignmentMatrixVerts(sourceMesh, targetMesh, alignmentMatrix, maxDist, maxDistSq, opts.maxDiffThresh);
    if (aligned) {
      res.alignmentMatrix = alignmentMatrix;
      res.alignedUsing = 'tri0';
    }
  }
  if (res.isCompatible && !res.alignmentMatrix) {
    const alignments = getInitialAlignmentsByOBB(sourceMesh, targetMesh, opts.allowMirror);
    for (let alignmentMatrix of alignments) {
      // check alignment matrix
      const aligned = checkAlignmentMatrixVerts(sourceMesh, targetMesh, alignmentMatrix, maxDist, maxDistSq, opts.maxDiffThresh);
      if (aligned) {
        res.alignmentMatrix = alignmentMatrix;
        res.alignedUsing = 'obb';
        if (res.alignmentMatrix.isMirrored) {
          res.isMirrored = true;
        }
        break;
      }
    }
  }

  opts.maxVertDistSq = maxDistSq;
  res.alignOptions = opts;
  return res;
}

MeshAligner.alignMeshesSemiExact = alignMeshesSemiExact;

MeshAligner.deduplicateAndAlign = function(meshes) {
  const sorted = _.sortBy(meshes, mesh => GeometryUtil.getGeometryVertexCount(mesh.geometry));
  const deduplicated = [];
  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    const lastDup = deduplicated.length? deduplicated[deduplicated.length-1] : null;
    if (lastDup) {
      const alignInfo = MeshAligner.alignMeshesSemiExact(current, lastDup.reference);
      if (alignInfo.alignmentMatrix) {
        // aligned!
        lastDup.duplicates.push({
          mesh: current,
          alignmentMatrix: alignInfo.alignmentMatrix,
          alignedUsing: alignInfo.alignedUsing,
          isMirrored: alignInfo.isMirrored
        });
      } else {
        console.log('did not match', alignInfo);
        deduplicated.push({ reference: current, duplicates: []});
      }
    } else {
      deduplicated.push({ reference: current, duplicates: []});
    }
  }
  return deduplicated;
};

module.exports = MeshAligner;