const RNG = require('math/RNG');
const {get} = require("lodash");
const MatrixUtil = {};

function axisPairToOrthoMatrix(_v1, _v2) {
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
}
MatrixUtil.axisPairToOrthoMatrix = axisPairToOrthoMatrix;

/**
 * Returns matrix to align from objectUp/objectFront to targetUp/targetFront
 * Assumptions: objectUp perpendicular to objectFront, targetUp perpendicular to targetFront.
 * @param objectUp Object's semantic up vector
 * @param objectFront Object's semantic front vector
 * @param targetUp Target up vector
 * @param targetFront Target front vector
 */
MatrixUtil.getAlignmentMatrix = function (objectUp, objectFront, targetUp, targetFront) {
  // Figure out what transform to apply to matrix
  var objM = MatrixUtil.axisPairToOrthoMatrix(objectUp, objectFront);
  var targetM = MatrixUtil.axisPairToOrthoMatrix(targetUp, targetFront);
  var transform = new THREE.Matrix4();
  var objMinv = new THREE.Matrix4();
  objMinv.copy(objM).invert();
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
MatrixUtil.getAlignmentQuaternion = function (objectUp, objectFront, targetUp, targetFront) {
  var m = arguments.length === 4? MatrixUtil.getAlignmentMatrix(objectUp, objectFront, targetUp, targetFront) :
    MatrixUtil.getAlignmentMatrixSingle(arguments[0], arguments[1]);
  var position = new THREE.Vector3();
  var scale = new THREE.Vector3();
  var quaternion = new THREE.Quaternion();
  m.decompose( position, quaternion, scale );
  return quaternion;
};

function getRotationMatrixFromX(axis) {
  return MatrixUtil.getAlignmentMatrixSingle(new THREE.Vector3(1,0,0), axis);
}
MatrixUtil.getRotationMatrixFromX = getRotationMatrixFromX;

function getRotationMatrixFromY(axis) {
  return MatrixUtil.getAlignmentMatrixSingle(new THREE.Vector3(0,1,0), axis);
}
MatrixUtil.getRotationMatrixFromY = getRotationMatrixFromY;

function getRotationMatrixFromZ(axis) {
  return MatrixUtil.getAlignmentMatrixSingle(new THREE.Vector3(0,0,1), axis);
}
MatrixUtil.getRotationMatrixFromZ = getRotationMatrixFromZ;

function getOrthogonalComponent(axis, vector, normalize) {
  const w = axis.clone().normalize();
  const lengthInNormalDir = vector.dot(axis);
  const partInNormalDir = w.multiplyScalar(lengthInNormalDir);
  const v = vector.clone();
  v.sub(partInNormalDir);
  if (normalize && v.lengthSq() > 0) {
    v.normalize();
  }
  return v;
}

MatrixUtil.getOrthogonalComponent = getOrthogonalComponent;

function getOrthogonal(axis, initial = null, rng = RNG.global) {
  const w = axis.clone().normalize();
  // Get random perpendicular to normal
  const axes = [new THREE.Vector3(1,0,0), new THREE.Vector3(0,1,0), new THREE.Vector3(0,0,1)];
  for (let c of axes) {
    if (Math.abs(c.dot(w)) == 0) {
      return c;
    }
  }
  let out;
  if (initial) {
    out = getOrthogonalComponent(axis, initial, true);
    if (out.lengthSq() > 0) {
      return out;
    }
  }
  const rand = new THREE.Vector3(rng.random(), rng.random(), rng.random()).normalize();
  out = getOrthogonalComponent(axis, rand, true);
  return out;
}
MatrixUtil.getOrthogonal = getOrthogonal;

MatrixUtil.getAlignmentMatrixSingle = function (axis, target) {
  const v1 = MatrixUtil.getOrthogonal(axis);
  const v2 = MatrixUtil.getOrthogonal(target);
  return MatrixUtil.getAlignmentMatrix(axis, v1, target, v2);
};


module.exports = MatrixUtil;