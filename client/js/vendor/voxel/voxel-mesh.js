// Original voxel mesh code from https://raw.githubusercontent.com/maxogden/voxel-mesh/master/index.js
// Reworked to support buffer geometry and newer three.js version
//module.exports = function(data, mesher, scaleFactor, three) {
//  return new Mesh(data, mesher, scaleFactor, three)
//};

function VoxelMesh(data, options, three) {
  this.THREE = three || THREE;
  this.data = data;
  this.scale = options.scaleFactor || new this.THREE.Vector3(1, 1, 1);

  var name = "CreateVoxelMesh-mesher";
  console.time(name);
  var result = options.mesher(data.voxels, data.dims, options);
  console.timeEnd(name);
  //this.meshed = result;
  var useBufferGeometry = options.useBufferGeometry;
  name = (useBufferGeometry)? "CreateVoxelMesh-createBufferGeometry" : "CreateVoxelMesh-createGeometry";
  console.time(name);
  if (useBufferGeometry) {
    this.createBufferGeometry(result);
  } else {
    this.createGeometry(result);
  }
  console.timeEnd(name);
}

VoxelMesh.prototype.createGeometry = function(result) {
  var geometry = this.geometry = new this.THREE.Geometry();
  geometry.vertices.length = 0;
  geometry.faces.length = 0;

  for (var i = 0; i < result.vertices.length; ++i) {
    var q = result.vertices[i];
    geometry.vertices.push(new this.THREE.Vector3(q[0], q[1], q[2]));
  }

  for (var i = 0; i < result.faces.length; ++i) {
    //geometry.faceVertexUvs[0].push(this.faceVertexUv(result, i));

    var q = result.faces[i];
    if (q.length === 5) {
      var color = new this.THREE.Color(q[4] & 0xffffff);
      var f1 = new this.THREE.Face3(q[0], q[1], q[3]);
      f1.color = color;
      geometry.faces.push(f1);
      var f2 = new this.THREE.Face3(q[1], q[2], q[3]);
      f2.color = color;
      geometry.faces.push(f2);
    } else if (q.length === 4) {
      var f = new this.THREE.Face3(q[0], q[1], q[2]);
      f.color = new this.THREE.Color(q[3] & 0xffffff);
      geometry.faces.push(f);
    }
  }

  geometry.computeFaceNormals();

  geometry.verticesNeedUpdate = true;
  geometry.elementsNeedUpdate = true;
  geometry.normalsNeedUpdate = true;

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
};

// Utility routines
VoxelMesh.prototype.createBufferGeometry = function(result) {
  var geometry = this.geometry = new this.THREE.BufferGeometry();

  var positions = [];
  var normals = [];
  var uvs = [];
  var colors = [];
  var nTris = 0;

  var cb = new THREE.Vector3(), ab = new THREE.Vector3();
  var vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3();
  function faceNormal(vertices, a, b, c) {
    vA.set(vertices[a][0],vertices[a][1],vertices[a][2]);
    vB.set(vertices[b][0],vertices[b][1],vertices[b][2]);
    vC.set(vertices[c][0],vertices[c][1],vertices[c][2]);
    cb.subVectors( vC, vB );
    ab.subVectors( vA, vB );
    cb.cross( ab );

    cb.normalize();
    return cb;
  }

  function addFace(a, b, c, color) {
    var v = result.vertices;
    positions.push(v[a][0],v[a][1],v[a][2],
      v[b][0],v[b][1],v[b][2],
      v[c][0],v[c][1],v[c][2]);
    var fn = faceNormal(result.vertices, a,b,c);
    //var uv = this.faceVertexUv(result, i);
    for (var i = 0; i < 3; i++) {
      normals.push(fn.x, fn.y, fn.z);
      colors.push(color.r, color.g, color.b);
    }
    nTris++;
  }

  var color = new this.THREE.Color();
  for (var i = 0; i < result.faces.length; ++i) {
    var q = result.faces[i];
    if (q.length === 5) {
      color.set(q[4] & 0xffffff);
      addFace(q[0], q[1], q[3], color);
      addFace(q[1], q[2], q[3], color);
    } else if (q.length === 4) {
      color.set(q[3] & 0xffffff);
      addFace(q[0], q[1], q[2], color);
    }
  }

  geometry.addAttribute( 'position', new THREE.BufferAttribute( new Float32Array( positions ), 3 ) );
  geometry.addAttribute( 'normal', new THREE.BufferAttribute( new Float32Array( normals ), 3 ) );
  //geometry.addAttribute( 'uv', new THREE.BufferAttribute( new Float32Array( uvs ), 2 ) );
  geometry.addAttribute( 'color', new THREE.BufferAttribute(new Float32Array( colors ), 3 ) );
  //geometry.offsets[0] = {start: 0, count: indices.length, index: 0};   //very important!
  geometry.verticesArray = geometry.attributes['position'].array;

  geometry.computeFaceNormals();

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
};

VoxelMesh.prototype.createWireMesh = function(hexColor) {
  var wireMaterial = new this.THREE.MeshBasicMaterial({
    color : hexColor || 0xffffff,
    wireframe : true
  });
  wireMesh = new this.THREE.Mesh(this.geometry, wireMaterial);
  wireMesh.scale.set(this.scale.x, this.scale.y, this.scale.z);
  wireMesh.doubleSided = true;
  this.wireMesh = wireMesh;
  return wireMesh;
};

VoxelMesh.prototype.createSurfaceMesh = function(material) {
  material = material || new this.THREE.MeshNormalMaterial();
  material.side = THREE.DoubleSide;
  var surfaceMesh  = new this.THREE.Mesh( this.geometry, material );
  surfaceMesh.scale.set(this.scale.x, this.scale.y, this.scale.z);
  surfaceMesh.doubleSided = true;
  this.surfaceMesh = surfaceMesh;
  return surfaceMesh;
};

VoxelMesh.prototype.addToScene = function(scene) {
  if (this.wireMesh) scene.add( this.wireMesh );
  if (this.surfaceMesh) scene.add( this.surfaceMesh );
};

VoxelMesh.prototype.setPosition = function(x, y, z) {
  if (this.wireMesh) {
    this.wireMesh.position.set(x, y, z);
    this.wireMesh.updateMatrix();
  }
  if (this.surfaceMesh) {
    this.surfaceMesh.position.set(x, y, z);
    this.surfaceMesh.updateMatrix();
  }
};

// TODO: Fix UV computations
VoxelMesh.prototype.faceVertexUv = function(meshed, i) {
  var vs = [
    meshed.vertices[i*4+0],
    meshed.vertices[i*4+1],
    meshed.vertices[i*4+2],
    meshed.vertices[i*4+3]
  ];
  var spans = {
    x0: vs[0][0] - vs[1][0],
    x1: vs[1][0] - vs[2][0],
    y0: vs[0][1] - vs[1][1],
    y1: vs[1][1] - vs[2][1],
    z0: vs[0][2] - vs[1][2],
    z1: vs[1][2] - vs[2][2]
  };
  var size = {
    x: Math.max(Math.abs(spans.x0), Math.abs(spans.x1)),
    y: Math.max(Math.abs(spans.y0), Math.abs(spans.y1)),
    z: Math.max(Math.abs(spans.z0), Math.abs(spans.z1))
  };
  if (size.x === 0) {
    if (spans.y0 > spans.y1) {
      var width = size.y;
      var height = size.z;
    }
    else {
      var width = size.z;
      var height = size.y;
    }
  }
  if (size.y === 0) {
    if (spans.x0 > spans.x1) {
      var width = size.x;
      var height = size.z;
    }
    else {
      var width = size.z;
      var height = size.x;
    }
  }
  if (size.z === 0) {
    if (spans.x0 > spans.x1) {
      var width = size.x;
      var height = size.y;
    }
    else {
      var width = size.y;
      var height = size.x;
    }
  }
  if ((size.z === 0 && spans.x0 < spans.x1) || (size.x === 0 && spans.y0 > spans.y1)) {
    return [
      new this.THREE.Vector2(height, 0),
      new this.THREE.Vector2(0, 0),
      new this.THREE.Vector2(0, width),
      new this.THREE.Vector2(height, width)
    ];
  } else {
    return [
      new this.THREE.Vector2(0, 0),
      new this.THREE.Vector2(0, height),
      new this.THREE.Vector2(width, height),
      new this.THREE.Vector2(width, 0)
    ];
  }
};

module.exports = VoxelMesh;
