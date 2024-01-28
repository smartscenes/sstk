var BBoxUtil = {};
var RNG = require('math/RNG');

BBoxUtil.OutNormals = Object.freeze([
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(+1, 0, 0),
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, +1, 0),
  new THREE.Vector3(0, 0, -1),
  new THREE.Vector3(0, 0, +1)
]);
BBoxUtil.InNormals = Object.freeze([
  new THREE.Vector3(+1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, +1, 0),
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, +1),
  new THREE.Vector3(0, 0, -1)
]);
BBoxUtil.FaceCenters01 = Object.freeze([
  new THREE.Vector3(0.0, 0.5, 0.5),
  new THREE.Vector3(1.0, 0.5, 0.5),
  new THREE.Vector3(0.5, 0.0, 0.5),
  new THREE.Vector3(0.5, 1.0, 0.5),
  new THREE.Vector3(0.5, 0.5, 0.0),
  new THREE.Vector3(0.5, 0.5, 1.0)
]);
BBoxUtil.OppositeFaces = Object.freeze([1,0,3,2,5,4]);
// Rotation
BBoxUtil.PlaneToFaceRotationParams = Object.freeze([
  { axis: new THREE.Vector3(0, 1, 0), angle: Math.PI / 2 },
  { axis: new THREE.Vector3(0, 1, 0), angle: Math.PI / 2 },
  { axis: new THREE.Vector3(1, 0, 0), angle: Math.PI / 2 },
  { axis: new THREE.Vector3(1, 0, 0), angle: Math.PI / 2 },
  null,  // { axis: new THREE.Vector3(0,0,1), angle: 0 },
  null   //{ axis: new THREE.Vector3(0,0,1), angle: 0 }
]);

BBoxUtil.getFaceDims = function(dims) {
  const faceDims = [];
  faceDims[0] = new THREE.Vector2(dims.y, dims.z);
  faceDims[1] = faceDims[0];
  faceDims[2] = new THREE.Vector2(dims.x, dims.z);
  faceDims[3] = faceDims[2];
  faceDims[4] = new THREE.Vector2(dims.x, dims.y);
  faceDims[5] = faceDims[4];
  return faceDims;
};

BBoxUtil.getFaceNormalDims = function(dims) {
  const faceNormalDims = [dims.x, dims.x, dims.y, dims.y, dims.z, dims.z];
  return faceNormalDims;
};

BBoxUtil.getFaceCorners = function (allCorners, faceIndex) {
  const vertIndices = BBoxUtil.FACE_VERTS[faceIndex];
  return vertIndices.map(vi => allCorners[vi]);
};

BBoxUtil.sample = function(out, rng) {
  rng = rng || RNG.global;
  out = out || new THREE.Vector3();
  out.set(rng.random(), rng.random(), rng.random());
  return out;
};

BBoxUtil.sampleFace = function(faceIndex, out, rng) {
  rng = rng || RNG.global;
  out = out || new THREE.Vector3();
  out.set(rng.random(), rng.random(), rng.random());
  if (faceIndex === 0) {
    out.x = 0;
  } else if (faceIndex === 1) {
    out.x = 1;
  } else if (faceIndex === 2) {
    out.y = 0;
  } else if (faceIndex === 3) {
    out.y = 1;
  } else if (faceIndex === 4) {
    out.z = 0;
  } else if (faceIndex === 5) {
    out.z = 1;
  }
  return out;
};

BBoxUtil.sampleSurface = function(out, rng) {
  rng = rng || RNG.global;
  var faceIndex = rng.randInt(0,5);
  return BBoxUtil.sampleFace(faceIndex, out, rng);
};

// Vertices pointing toward the inside
BBoxUtil.FACE_VERTS = [
  [0, 2, 3, 1],      // -x
  [4, 5, 7, 6],      // +x
  [0, 1, 5, 4],      // -y
  [2, 6, 7, 3],      // +y
  [0, 4, 6, 2],      // -z
  [1, 3, 7, 5],      // +z
];

module.exports = BBoxUtil;