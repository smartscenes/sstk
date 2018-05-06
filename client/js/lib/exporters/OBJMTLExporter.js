var GeometryUtil = require('geo/GeometryUtil');
var FileUtil = require('io/FileUtil');
var Index = require('ds/Index');
var async = require('async');
var _ = require('util');

/**
 * Export a mesh as OBJ and MTL
 * @param options
 * @param options.fs File system to use for exporting (defaults to FileUtil)
 * @constructor
 * @memberOf exporters
 */
function OBJMTLExporter(options) {
  options = options || {};
  this.__fs = options.fs || FileUtil;
  this.includeChildModelInstances = false;
}

var toVertexStr = function (vi, ti, ni) {
  var s = '' + vi;
  if (ti > 0) {
    s = s + '/' + ti;
    if (ni > 0) {
      s = s + '/' + ni;
    }
  } else if (ni > 0) {
    s = s + '//' + ni;
  }
  return s;
};

var toObjStr = function (prefix, v) {
  var p = prefix;
  if (v instanceof THREE.Vector3) {
    return p + ' ' + v.x + ' ' + v.y + ' ' + v.z;
  } else if (v instanceof Array || (v && v.join)) {
    return p + ' ' + v.join(' ');
  } else {
    console.log('unknown type ' + typeof v);
    console.log(v);
    return null;
  }
};

var getObjMtl = function (root, params, data) {
  params = params || {};
  var startVertexOffset = params.vertexOffset || 0;
  var startNormalOffset = params.normalOffset || 0;
  var startUvOffset = params.uvOffset || 0;
  var materialOffset = params.materialOffset || 0;
  data = _.defaults(data || {}, { v: [], vt: [], vn: [], f: [] });
  if (!params.includeNotVisible && !root.visible) {
    // Ignore invisible meshes
    return data;
  }

  var attrInfos = [];
  attrInfos[0] = { name: 'uv', stride: 2, index: new Index(), mapping: {}, objType: 'vt' };
  attrInfos[1] = { name: 'normal', stride: 3, index: new Index(), mapping: {}, objType: 'vn' };
  root.updateMatrixWorld();
  if (root instanceof THREE.Mesh) {
    var t = root.matrixWorld;
    if (params.transform) {
      t = params.transform.clone();
      t.multiply(root.matrixWorld);
    }
    var hasNormals = false;
    var hasUvs = false;
    var vertexOffset = startVertexOffset + data.v.length + 1;
    var normalOffset = startNormalOffset + data.vn.length + 1;
    var uvOffset = startUvOffset + data.vt.length + 1;
    var vi = 0;
    GeometryUtil.forMeshVerticesWithTransform(root, function (v, attrs) {
      data.v.push(toObjStr('v', v));
      if (attrs) {
        for (var i = 0; i < attrInfos.length; i++) {
          if (attrs[i]) {
            var info = attrInfos[i];
            var index = info.index;
            var objStr = toObjStr(info.objType, attrs[i]);
            if (index.add(objStr)) {
              data[info.objType].push(objStr);
            }
            info.mapping[vi] = index.indexOf(objStr);
            if (info.name === 'normal') { hasNormals = true; }
            else if (info.name === 'uv') { hasUvs = true; }
          }
        }
      }
      vi++;
    }, t, attrInfos);
    var geometry = root.geometry;

    var materials = root.material.materials || root.material;
    if (!Array.isArray(materials)) {
      materials = [materials];
    }

    for (var iMat = 0; iMat < materials.length; iMat++) {
      // material
      var material = materials[iMat];
      // console.log(material);
      if (!params.skipMtl) {
        if (material.uuid) {
          var matIndex = params.materialsIndex.indexOf(material.uuid, true) + materialOffset;
          var mtlId = 'material_' + matIndex;
          data.f.push('usemtl ' + mtlId);
          params.materials[mtlId] = material;
        } else {
          console.warn('Material is missing uuid!');
        }
      }

      // faces
      GeometryUtil.forFaceVertexIndices(geometry, function (iface, verts) {
        var group = _.find(geometry.groups, function (g) {
          return (iface >= g.start) && (iface < g.start + g.count);
        });
        var materialIndex = (materials.length > 1)? (group? group.materialIndex : 0) : 0;
        if (materialIndex === iMat) {
          var faceStrings = [];  // will hold face spec strings (f)
          for (var i = 0; i < verts.length; i++) {
            var vi = verts[i] + vertexOffset;
            var ti = hasUvs ? (attrInfos[0].mapping[verts[i]] + uvOffset) : -1;
            var ni = hasNormals ? (attrInfos[1].mapping[verts[i]] + normalOffset) : -1;
            faceStrings[i] = toVertexStr(vi, ti, ni);
          }
          var fs = toObjStr('f', faceStrings);
          data.f.push(fs);
        }
      });
    }
  }
  // if (root.children) {
  //   for (var i = 0; i < root.children.length; i++) {
  //     getObjMtl(root.children[i], params, data);
  //   }
  // }
  return data;
};

// Exports object3D to file using OBJ format
OBJMTLExporter.prototype.export = function (objects, opts) {
  var fileutil = this.__fs;
  opts = opts || {};
  opts.name = (opts.name != undefined)? opts.name : 'scene';
  opts.dir = (opts.dir != undefined)? opts.dir + '/' : '';
  var callback = opts.callback;
  var objfilename = opts.dir + opts.name + '.obj';
  var objfile = objfilename;
  var mtllib = opts.name + '.mtl';
  var mtlfile = opts.skipMtl ? null : opts.dir + mtllib;
  console.log('export to OBJ');

  if (objects instanceof THREE.Object3D) {
    objects = [objects];
  }

  var scope = this;

  console.log('processing ' + objects.length + ' objects');
  // Set the vertexOffset and such
  var params = _.defaults({ vertexOffset: 0, normalOffset: 0, uvOffset: 0, materialsOffset: 0 }, opts);

  // Set up functions to append to obj/mtl files
  // Each should takes in a string (to append to the file) and a callback function to let the caller know its safe to proceed
  params.appendToObj = function(string, cb) {
    fileutil.fsAppendToFile(objfile, string, cb);
  };
  if (mtlfile) {
    // Actually append
    params.appendToMtl = function (string, cb) {
      fileutil.fsAppendToFile(mtlfile, string, cb);
    };
  } else {
    // Nothing to do
    params.appendToMtl = function (string, cb) {
      setTimeout(function () { cb(); }, 0);
    };
  }

  // Export objects by looping over each one and exporting!
  var exportObjects = function () {
    var count = 0;
    async.whilst(
      function () {
        return count < objects.length;
      },
      function (cb) {
        count++;
        scope.__exportObject(objects[count-1], params, cb);
      },
      function (err, results) {
        // everything done or disaster!
        if (err) {
          console.err('Error exporting objects!', err);
        }
        fileutil.fsExportFile(objfile, objfile);
        if (mtlfile) {
          fileutil.fsExportFile(mtlfile, mtlfile);
        }
        console.log('finished processing ' + objects.length + ' objects');
        if (callback) {
          callback();
        }
      }
    );
  };

  // Start export by writing mtl header to objfile
  var header = mtlfile ? ('mtllib ' + mtllib + '\n'):'';
  fileutil.fsWriteToFile(objfile, header, function(err, res) {
    if (err) {
      console.warn('Error writing header to ' + objfilename + ', aborting export!', err);
    } else {
      if (mtlfile) {  // first make sure old mtl is cleaned up
        fileutil.fsWriteToFile(mtlfile, '', function (err, res) {
          if (err) {
            console.warn('Error writing to ' + mtlfile + ', aborting export!', err);
          } else {
            exportObjects();
          }
        });
      } else {  // no mtl so go ahead
        exportObjects();
      }
    }
  });
};

OBJMTLExporter.prototype.__exportMesh = function (mesh, result, params, callback) {
  if (!params.includeNotVisible && !mesh.visible) {
    // Ignore invisible meshes - nothing to do!
    setTimeout(function () { callback(); }, 0);
    return;
  }

  var obj = '';

  var nbVertex = 0;
  var nbVertexUvs = 0;
  var nbNormals = 0;
  var v = new THREE.Vector3();
  var normal = new THREE.Vector3();

  var geometry = mesh.geometry;
  var transform = mesh.matrixWorld;
  if (params.transform) {
    transform = params.transform.clone();
    transform.multiply(mesh.matrixWorld);
  }

  var materials = mesh.material.materials || mesh.material;
  if (!Array.isArray(materials)) {
    materials = [materials];
  }
  var normIndex = new Index();
  var uvIndex = new Index();
  var normIndexRemap = {};
  var uvIndexRemap = {};

  var name = mesh.name;
  if (params.getMeshName) {
    name = params.getMeshName(mesh);
  } else {
    if (mesh.userData.id != null && mesh.name.indexOf('#') < 0) {
      name = name + '#' + mesh.userData.id;
    }
  }
  if (name) {
    obj += 'o ' + name + '\n';
  }

  if (geometry instanceof THREE.Geometry) {
    // positions
    var verts = geometry.vertices;
    for (var i = 0; i < verts.length; i++) {
      v.copy(verts[i]);
      v.applyMatrix4(transform);
      obj += 'v ' + v.x + ' ' + v.y + ' ' + v.z + '\n';
      nbVertex++;
    }

    var faces = geometry.faces;
    // uvs
    var faceVertexUvs = geometry.faceVertexUvs[0];
    var hasVertexUvs = faces.length === faceVertexUvs.length;
    if (hasVertexUvs) {
      for (var iFace = 0; iFace < faceVertexUvs.length; iFace++) {
        var face = faces[iFace];
        var vertexUvs = faceVertexUvs[iFace];
        if (vertexUvs) {
          for (var j = 0; j < vertexUvs.length; j++) {
            var uv = vertexUvs[j].clone();
            var materialIndex = (materials.length > 1)? face.materialIndex || 0 : 0;
            var material = materials[materialIndex];
            if (material.map && material.map.repeat) {
              uv.x *= material.map.repeat.x;
              uv.y *= material.map.repeat.y;
            } else if (params.defaultUvScale) {
              uv.x *= params.defaultUvScale.x;
              uv.y *= params.defaultUvScale.y;
            }
            var uvstr = 'vt ' + uv.x + ' ' + uv.y;
            if (uvIndex.add(uvstr)) {
              obj += uvstr + '\n';
              nbVertexUvs++;
            }
            uvIndexRemap[iFace * 3 + j] = uvIndex.indexOf(uvstr);
          }
        }
      }
    }

    // normals
    var normalMatrixWorld = new THREE.Matrix3();
    normalMatrixWorld.getNormalMatrix(transform);
    for (var iFace = 0; iFace < faces.length; iFace++) {
      var f = faces[iFace];
      var vertexNormals = f.vertexNormals;
      for (var j = 0; j < 3; j++) {
        var vn = vertexNormals.length === 3 ? vertexNormals[j] : f.normal;
        normal.copy(vn);
        normal.applyMatrix3(normalMatrixWorld);
        normal.normalize();
        var normstr = 'vn ' + normal.x + ' ' + normal.y + ' ' + normal.z;
        if (normIndex.add(normstr)) {
          obj += normstr +'\n';
          nbNormals++;
        }
        normIndexRemap[iFace*3 + j] = normIndex.indexOf(normstr);
      }
    }

    for (var iMat = 0; iMat < materials.length; iMat++) {
      // material
      var material = materials[iMat];
      // console.log(material);
      if (!params.skipMtl) {
        if (material.uuid) {
          var matIndex = result.materialsIndex.indexOf(material.uuid, true) + result.indexMaterials;
          var mtlId = 'material_' + matIndex;
          obj += 'usemtl ' + mtlId + '\n';
          result.materials[mtlId] = material;
        } else {
          console.warn('Material is missing uuid!');
        }
      }

      // faces
      for (var iFace = 0, j = 0; iFace < faces.length; iFace++, j += 3) {
        var face = faces[iFace];
        var materialIndex = (materials.length > 1)? face.materialIndex || 0 : 0;
        if (materialIndex !== iMat) {
          continue; // Skip this face
        }
        var uvis = [uvIndexRemap[j]+1, uvIndexRemap[j+1]+1, uvIndexRemap[j+2]+1];
        var nis = [normIndexRemap[j]+1, normIndexRemap[j+1]+1, normIndexRemap[j+2]+1];
        var faceHasUvs = hasVertexUvs && faceVertexUvs[iFace];
        obj += 'f ';
        obj += (result.indexVertex + face.a + 1) + '/' + (faceHasUvs ? (result.indexVertexUvs + uvis[0]) : '') + '/' + (result.indexNormals + nis[0]) + ' ';
        obj += (result.indexVertex + face.b + 1) + '/' + (faceHasUvs ? (result.indexVertexUvs + uvis[1]) : '') + '/' + (result.indexNormals + nis[1]) + ' ';
        obj += (result.indexVertex + face.c + 1) + '/' + (faceHasUvs ? (result.indexVertexUvs + uvis[2]) : '') + '/' + (result.indexNormals + nis[2]) + '\n';
      }
    }
  } else {  // BufferGeometry
    var data = getObjMtl(mesh,
      { transform: params.transform,
        vertexOffset: result.indexVertex,
        normalOffset: result.indexNormals,
        uvOffset: result.indexVertexUvs,
        materialOffset: result.indexMaterials,
        materials: result.materials,
        materialsIndex: result.materialsIndex });
    obj += data.v.join('\n') + '\n'
        + ((data.vn.length > 0)? (data.vn.join('\n') + '\n') : '')
        + ((data.vt.length > 0)? (data.vt.join('\n') + '\n') : '')
        + data.f.join('\n') + '\n';
    nbVertex = data.v.length;
    nbVertexUvs = data.vt.length;
    nbNormals = data.vn.length;
  }

  // update index
  result.indexVertex += nbVertex;
  result.indexVertexUvs += nbVertexUvs;
  result.indexNormals += nbNormals;

  params.appendToObj(obj, callback);
};

OBJMTLExporter.prototype.__getTexturePath = function(src, params) {
  if (params.rewriteTexturePathFn) {
    return params.rewriteTexturePathFn(src);
  } else {
    var textureDir = params.textureDir ? params.textureDir : '';
    return textureDir + src.split('/').pop();
  }
};

OBJMTLExporter.prototype.__getMaterialString = function(mat, matId, params) {
  var mtl = '';
  mtl += 'newmtl ' + matId + '\n';
  // mtl += 'Ni 1.5000\n';
  var opacity = (mat.transparent)? mat.opacity : 1.0;
  if (opacity < 1.0) {
    mtl += 'illum 4\n';
  } else {
    mtl += 'illum 2\n';
  }
  mtl += 'd ' + opacity + '\n';
  if (mat.shininess != null) {
    mtl += 'Ns ' + mat.shininess + '\n';
  }
  // mtl += 'Tr 0.0000\n';
  // mtl += 'Tf 1.0000 1.0000 1.0000\n';
  // mtl += 'Ka ' + mat.color.r + ' ' + mat.color.g + ' ' + mat.color.b + ' ' + '\n';
  if (mat.color) {
    mtl += 'Kd ' + mat.color.r + ' ' + mat.color.g + ' ' + mat.color.b + ' ' + '\n';
  }
  if (mat.specular) {
    mtl += 'Ks ' + mat.specular.r + ' ' + mat.specular.g + ' ' + mat.specular.b + ' ' + '\n';
  }
  // mtl += 'Ke 0.0000 0.0000 0.0000\n';
  if (mat.map && mat.map.image) {
    var file = this.__getTexturePath(mat.map.image.src, params);
    mtl += 'map_Kd ' + file + '\n';
  }
  if (mat.bumpMap && mat.bumpMap.image) {
    var file = this.__getTexturePath(mat.bumpMap.image.src, params);
    mtl += 'map_bump ' + file + '\n';
  }
  return mtl;
};

OBJMTLExporter.prototype.__exportObject = function (object, params, callback) {
  var scope = this;

  if (!params.includeNotVisible && !object.visible) {
    // Ignore invisible objects - nothing to do!
    setTimeout(function () { callback(); }, 0);
    return;
  }

  var result = {
    materials: {},
    materialsIndex: new Index(),
    indexVertex: params.vertexOffset,
    indexVertexUvs: params.uvOffset,
    indexNormals: params.normalOffset,
    indexMaterials: params.materialsOffset
  };

  // Get our nodes in depth-first traversal order
  var nodes = [];
  object.updateMatrixWorld();
  object.traverse(function (child) {
    nodes.push(child);
  });

  console.log('Processing ' + nodes.length + ' nodes for object ' + object.name);

  // Iterate and export!
  async.forEachSeries(nodes, function (child, __cb) {
    // console.log('processing node', child.name);
    var cb = function(err, res) {
      setTimeout(function () { __cb(); }, 0);
    };
    if (child instanceof THREE.Mesh) {
      scope.__exportMesh(child, result, params, cb);
      return;
    } else {
      if (params.getGroupName) {
        var name = params.getGroupName(child);
        if (name) {
          params.appendToObj('g ' + name + '\n', cb);
          return;
        }
      }
    }
    // Make sure we call the loop callback cb
    cb();
  }, function(err, res) {
    // All done - either excellent or disaster!
    if (err) {
      console.error('Error exporting object ' + object.id, err);
      callback(err);
    } else {
      // mtl output
      var mtl = '';
      _.forOwn(result.materials, function (mat, matId) {
        mtl += scope.__getMaterialString(mat, matId, params);
        mtl += '\n';
      });
      params.appendToMtl(mtl, function (err, res) {
        params.vertexOffset = result.indexVertex;
        params.uvOffset = result.indexVertexUvs;
        params.normalOffset = result.indexNormals;
        params.materialsOffset = result.indexMaterials + result.materialsIndex.size();
        callback(err);
      });
    }
  });
};

module.exports = OBJMTLExporter;
