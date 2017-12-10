/**
 * Modified version of THREE.TessellateModifier
 * Break faces with edges longer than maxEdgeLength
 *
 * @author alteredq / http://alteredqualia.com/
 * @author angelx
 * @license MIT License <http://www.opensource.org/licenses/mit-license.php>
 * @memberOf geo
 */

var TessellateModifier = function (maxEdgeLength) {
  this.maxEdgeLength = maxEdgeLength;
};

TessellateModifier.prototype.__tesselateFaces = function(indices, options) {
  if (indices) {
    for (var i = 0, il = indices.length; i < il; i++) {
      var iFace = indices[i];
      var face = options.faces[iFace];
      if (face instanceof THREE.Face3) {
        this.__tesselateFace(iFace, options);
      }
    }
  } else {
    // Note: number of faces will increase (only want to do the originals)
    for (var i = 0, il = options.faces.length; i < il; i++) {
      var face = options.faces[i];
      if (face instanceof THREE.Face3) {
        this.__tesselateFace(i, options);
      }
    }
  }
};

TessellateModifier.prototype.__tesselateFace = function(iFace, options) {
  return this.__tesselateFace4(iFace, options);
};

function _lerpFaceVertices(face, outTris, field) {
  var vertexVec = face[field];

  var vmab = vertexVec[0].clone().lerp(vertexVec[1], 0.5);
  var vmac = vertexVec[0].clone().lerp(vertexVec[2], 0.5);
  var vmbc = vertexVec[1].clone().lerp(vertexVec[2], 0.5);

  outTris[0][field][0].copy(vmab);
  outTris[0][field][1].copy(vmbc);
  outTris[0][field][2].copy(vmac);

  outTris[1][field][0].copy(vertexVec[0]);
  outTris[1][field][1].copy(vmab);
  outTris[1][field][2].copy(vmac);

  outTris[2][field][0].copy(vmab);
  outTris[2][field][1].copy(vertexVec[1]);
  outTris[2][field][2].copy(vmbc);

  outTris[3][field][0].copy(vmac);
  outTris[3][field][1].copy(vmbc);
  outTris[3][field][2].copy(vertexVec[2]);
}

function _lerpFaceVertices2(input) {
  var vertexVec = input;

  var vmab = vertexVec[0].clone().lerp(vertexVec[1], 0.5);
  var vmac = vertexVec[0].clone().lerp(vertexVec[2], 0.5);
  var vmbc = vertexVec[1].clone().lerp(vertexVec[2], 0.5);

  var outputs = [];
  outputs[0] = [vmab.clone(), vmbc.clone(), vmac.clone()];
  outputs[1] = [vertexVec[0].clone(), vmab.clone(), vmac.clone()];
  outputs[2] = [vmab.clone(), vertexVec[1].clone(), vmbc.clone()];
  outputs[3] = [vmac.clone(), vmbc.clone(), vertexVec[2].clone()];
  return outputs;
}

TessellateModifier.prototype.__tesselateFace4 = function(iFace, options) {
  var maxEdgeLengthSquared = options.maxEdgeLengthSquared;
  var faces = options.faces;
  var faceVertexUvs = options.faceVertexUvs;
  var face = faces[iFace];
  var iFaces = [iFace, faces.length, faces.length+1, faces.length+2];

  var a = face.a;
  var b = face.b;
  var c = face.c;

  var va = options.vertices[a];
  var vb = options.vertices[b];
  var vc = options.vertices[c];

  // Cache of midpoints - v1_v2 => vertex.
  var cached = options.cached;
  function getCachedIndex(a,b) {
    var key = (a > b)? (b + '_' + a) : (a + '_' + b);
    if (!cached.has(key)) {
      cached.set(key, {});
    }
    return cached.get(key);
  }

  var dab = va.distanceToSquared(vb);
  var dbc = vb.distanceToSquared(vc);
  var dac = va.distanceToSquared(vc);

  if (dab > maxEdgeLengthSquared || dbc > maxEdgeLengthSquared || dac > maxEdgeLengthSquared) {
    // Takes one triangle and create four triangles
    var ntris = 4;
    var tris = [];
    for (var i = 0; i < ntris; i++) {
      tris[i] = face.clone();
    }

    var cab = getCachedIndex(a,b);
    if (cab.index == undefined) {
      cab.index = options.vertices.length;
      var vmab = va.clone().lerp(vb, 0.5);
      options.vertices.push(vmab);
    }
    var cbc = getCachedIndex(b,c);
    if (cbc.index == undefined) {
      cbc.index = options.vertices.length;
      var vmbc = vb.clone().lerp(vc, 0.5);
      options.vertices.push(vmbc);
    }
    var cac = getCachedIndex(a,c);
    if (cac.index == undefined) {
      cac.index = options.vertices.length;
      var vmac = va.clone().lerp(vc, 0.5);
      options.vertices.push(vmac);
    }

    var mab = cab.index;
    var mbc = cbc.index;
    var mac = cac.index;

    tris[0].a = mab; tris[0].b = mbc; tris[0].c = mac;
    tris[1].a = a; tris[1].b = mab; tris[1].c = mac;
    tris[2].a = mab; tris[2].b = b; tris[2].c = mbc;
    tris[3].a = mac; tris[3].b = mbc; tris[3].c = c;

    // normals
    if (face.vertexNormals.length === 3) {
      _lerpFaceVertices(face, tris, 'vertexNormals');
    }
    // vertex colors
    if (face.vertexColors.length === 3) {
      _lerpFaceVertices(face, tris, 'vertexColors');
    }

    for (var i = 0; i < ntris; i++) {
      faces[iFaces[i]] = tris[i];
    }
    for (var j = 0, jl = options.faceVertexUvs.length; j < jl; j++) {
      if (faceVertexUvs[j].length) {
        var uvs = faceVertexUvs[j][iFace];
        if (!uvs) { continue; }

        var uvsTris = _lerpFaceVertices2(uvs);
        for (var i = 0; i < ntris; i++) {
          faceVertexUvs[j][iFaces[i]] = uvsTris[i];
        }

      }
    }

    this.__tesselateFaces(iFaces, options);
  } else {
    //faces.push(face);
    //for (var j = 0, jl = options.faceVertexUvs.length; j < jl; j++) {
    //  faceVertexUvs[j].push(options.faceVertexUvs[j][iFace]);
    //}
  }
};

TessellateModifier.prototype.__tesselateFace2 = function(iFace, options) {
  var maxEdgeLengthSquared = options.maxEdgeLengthSquared;
  var faces = options.faces;
  var faceVertexUvs = options.faceVertexUvs;
  var iFaceA = iFace;
  var iFaceB = faces.length;
  var face = faces[iFace];

  var edge;

  var a = face.a;
  var b = face.b;
  var c = face.c;

  var va = options.vertices[a];
  var vb = options.vertices[b];
  var vc = options.vertices[c];

  var dab = va.distanceToSquared(vb);
  var dbc = vb.distanceToSquared(vc);
  var dac = va.distanceToSquared(vc);

  if (dab > maxEdgeLengthSquared || dbc > maxEdgeLengthSquared || dac > maxEdgeLengthSquared) {
    var m = options.vertices.length;

    var triA = face.clone();
    var triB = face.clone();

    if (dab >= dbc && dab >= dac) {
      var vm = va.clone();
      vm.lerp(vb, 0.5);

      triA.a = a;
      triA.b = m;
      triA.c = c;

      triB.a = m;
      triB.b = b;
      triB.c = c;
      if (face.vertexNormals.length === 3) {
        var vnm = face.vertexNormals[0].clone();
        vnm.lerp(face.vertexNormals[1], 0.5);

        triA.vertexNormals[1].copy(vnm);
        triB.vertexNormals[0].copy(vnm);
      }
      if (face.vertexColors.length === 3) {
        var vcm = face.vertexColors[0].clone();
        vcm.lerp(face.vertexColors[1], 0.5);

        triA.vertexColors[1].copy(vcm);
        triB.vertexColors[0].copy(vcm);
      }
      edge = 0;
    } else if (dbc >= dab && dbc >= dac) {
      var vm = vb.clone();
      vm.lerp(vc, 0.5);

      triA.a = a;
      triA.b = b;
      triA.c = m;

      triB.a = m;
      triB.b = c;
      triB.c = a;

      if (face.vertexNormals.length === 3) {
        var vnm = face.vertexNormals[1].clone();
        vnm.lerp(face.vertexNormals[2], 0.5);

        triA.vertexNormals[2].copy(vnm);

        triB.vertexNormals[0].copy(vnm);
        triB.vertexNormals[1].copy(face.vertexNormals[2]);
        triB.vertexNormals[2].copy(face.vertexNormals[0]);
      }
      if (face.vertexColors.length === 3) {
        var vcm = face.vertexColors[1].clone();
        vcm.lerp(face.vertexColors[2], 0.5);

        triA.vertexColors[2].copy(vcm);

        triB.vertexColors[0].copy(vcm);
        triB.vertexColors[1].copy(face.vertexColors[2]);
        triB.vertexColors[2].copy(face.vertexColors[0]);
      }
      edge = 1;
    } else {
      var vm = va.clone();
      vm.lerp(vc, 0.5);

      triA.a = a;
      triA.b = b;
      triA.c = m;

      triB.a = m;
      triB.b = b;
      triB.c = c;

      if (face.vertexNormals.length === 3) {
        var vnm = face.vertexNormals[0].clone();
        vnm.lerp(face.vertexNormals[2], 0.5);

        triA.vertexNormals[2].copy(vnm);
        triB.vertexNormals[0].copy(vnm);
      }
      if (face.vertexColors.length === 3) {
        var vcm = face.vertexColors[0].clone();
        vcm.lerp(face.vertexColors[2], 0.5);

        triA.vertexColors[2].copy(vcm);
        triB.vertexColors[0].copy(vcm);
      }
      edge = 2;
    }

    faces[iFaceA] = triA;
    faces[iFaceB] = triB;
    //faces.push(triA, triB);
    options.vertices.push(vm);

    for (var j = 0, jl = options.faceVertexUvs.length; j < jl; j++) {
      if (options.faceVertexUvs[j].length) {
        var uvs = options.faceVertexUvs[j][iFace];
        if (!uvs) { continue; }

        var uvA = uvs[0];
        var uvB = uvs[1];
        var uvC = uvs[2];

        // AB
        if (edge === 0) {
          var uvM = uvA.clone();
          uvM.lerp(uvB, 0.5);

          var uvsTriA = [uvA.clone(), uvM.clone(), uvC.clone()];
          var uvsTriB = [uvM.clone(), uvB.clone(), uvC.clone()];
          // BC
        } else if (edge === 1) {
          var uvM = uvB.clone();
          uvM.lerp(uvC, 0.5);

          var uvsTriA = [uvA.clone(), uvB.clone(), uvM.clone()];
          var uvsTriB = [uvM.clone(), uvC.clone(), uvA.clone()];
          // AC
        } else {
          var uvM = uvA.clone();
          uvM.lerp(uvC, 0.5);

          var uvsTriA = [uvA.clone(), uvB.clone(), uvM.clone()];
          var uvsTriB = [uvM.clone(), uvB.clone(), uvC.clone()];
        }
        //faceVertexUvs[j].push(uvsTriA, uvsTriB);
        faceVertexUvs[j][iFaceA] = uvsTriA;
        faceVertexUvs[j][iFaceB] = uvsTriB;
      }

      this.__tesselateFaces([iFaceA, iFaceB], options);
    }
  } else {
    //faces.push(face);
    //for (var j = 0, jl = options.faceVertexUvs.length; j < jl; j++) {
    //  faceVertexUvs[j].push(options.faceVertexUvs[j][iFace]);
    //}
  }
};

TessellateModifier.prototype.modify = function (geometry) {
  if (geometry instanceof THREE.BufferGeometry) {
    console.warn('Tessellate not supported for BufferGeometry');
    return;
  }

//  var faces = [];
//  var faceVertexUvs = [];
  var maxEdgeLengthSquared = this.maxEdgeLength * this.maxEdgeLength;

  //for (var i = 0, il = geometry.faceVertexUvs.length; i < il; i++) {
  //  faceVertexUvs[i] = [];
  //}

  var options = {
    maxEdgeLengthSquared: maxEdgeLengthSquared,
    faces: geometry.faces,
    faceVertexUvs: geometry.faceVertexUvs,
    vertices: geometry.vertices,
    cached: new Map()
  };
  this.__tesselateFaces(null, options);

//  geometry.faces = faces;
//  geometry.faceVertexUvs = faceVertexUvs;
};

module.exports = TessellateModifier;