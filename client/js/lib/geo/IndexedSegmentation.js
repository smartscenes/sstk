var AssetLoader = require('assets/AssetLoader');
var Object3DUtil = require('geo/Object3DUtil');
var GeometryUtil = require('geo/GeometryUtil');
var _ = require('util/util');

/**
 * Create a segmented mesh using index faces or vertices
 * @param params
 * @param params.filename {string} Filename
 * @constructor
 */
function IndexedSegmentation(params) {
  this.__options = params;
}

/**
 * Create segmentation using one mesh with multiple materials
 * @param opts
 * @param opts.segmentName {string} segment name to use
 * @param opts.segmentType {string} segmentation type
 * @param opts.object3D {THREE.Object3D} Object to segment
 * @param [opts.useOriginalMaterial] {boolean} whether to use original material
 * @param [opts.getMaterial] {function(THREE.Object3D, {})}
 * @param [opts.callback] If provided, will attempt to load the segmentation file.  Otherwise creates segmentaiton from this.data
 * @returns {THREE.Mesh}
 */
IndexedSegmentation.prototype.getSegments = function(opts) {
  var scope = this;
  if (opts.callback) {
    this.load({
      filename: this.__options.filename,
      callback: function (err, data) {
        if (data) {
          var segments = scope.__makeSegments(opts);
          opts.callback(null, segments);
        } else {
          opts.callback(err, null);
        }
      }
    });
  } else {
    var segments = scope.__makeSegments(opts);
    return segments;
  }
};

// Copied from Segments
function createMeshIndicesFromMeshes(meshes) {
  var meshIndex = [];      // triangle index to mesh index
  var meshTriCounts = [];  // mesh index to number of triangles in mesh
  var meshTriIndex = [];   // triangle index to triangle index for mesh
  var totalTris = 0;
  for (var mi = 0; mi < meshes.length; mi++) {
    var mesh = meshes[mi];
    var ntris = GeometryUtil.getGeometryFaceCount(mesh.geometry);
    meshTriCounts[mi] = ntris;
    for (var i = 0; i < ntris; i++) {
      meshTriIndex.push(i);
      meshIndex.push(mi)
    }
    totalTris += ntris;
  }
  return { meshIndex: meshIndex, meshTriIndex: meshTriIndex, meshTriCounts: meshTriCounts };
}

// Copied from Segments
function __indexedSegmentationToSegmentsWithTriMesh(index, meshIndex, meshTriIndex) {
  var segmentsByKey = {};
  var segments = [];
  for (var i = 0; i < index.length; i++) {
    var sIndex = index[i];
    var mIndex = meshIndex? meshIndex[i] : 0;
    var triIndex = meshTriIndex? meshTriIndex[i] : i;
    var key = mIndex + '-' + sIndex;
    if (!segmentsByKey[key]) {
      segmentsByKey[key] = { id: sIndex, surfaceIndex: segments.length, meshIndex: mIndex, triIndex: [triIndex]};
      segments.push(segmentsByKey[key]);
    } else {
      segmentsByKey[key].triIndex.push(triIndex);
    }
  }
  return segments;
}

/**
 * Creates segmentation with individual meshes per part
 * @param opts
 */
IndexedSegmentation.prototype.getSegmentedMeshes = function(opts) {
  if (this.data.elementType === 'triangles') {
    var object3D = opts.object3D;
    var segmentationsByName = _.keyBy(this.data.segmentation, 'name');
    var segmentation = segmentationsByName[opts.segmentName];

    if (segmentation) {
      const meshes = Object3DUtil.getMeshList(object3D);
      let converted;
      if (meshes.length > 1) {
        // Need to create new mesh to tri indices (whatever is saved is not necessarily how our loader separated into meshes)
        const  meshIndices = createMeshIndicesFromMeshes(meshes);
        converted = __indexedSegmentationToSegmentsWithTriMesh(segmentation.index, meshIndices.meshIndex, meshIndices.meshTriIndex);
      } else {
        converted = __indexedSegmentationToSegmentsWithTriMesh(segmentation.index);
      }
      const segmented = Object3DUtil.remeshObject(object3D, converted);
      return segmented;
    } else {
      // Leaving object unsegmented
      console.warn('No ' + opts.segmentType + '.' + opts.segmentName + ' segmentation for ' + this.data.id, segmentationsByName);
      return object3D;
    }
  } else {
    throw "Unsupported elementType " + this.data.elementType;
  }
};


IndexedSegmentation.prototype.load = function(opts) {
  if (!this.data) {
    this.__load(_.defaults(Object.create(null), opts, this.__options));
  } else {
    opts.callback(null, this.data);
  }
};

/**
 * Segments mesh based on indexed segmentation
 * @param opts
 * @param opts.segmentName {string} segment name to use
 * @param opts.segmentType {string} segmentation type
 * @param opts.object3D {THREE.Object3D} Object to segment
 * @param [opts.useOriginalMaterial] {boolean} whether to use original material
 * @param [opts.getMaterial] {function(THREE.Object3D, {})}
 * @returns {THREE.Mesh}
 * @private
 */
IndexedSegmentation.prototype.__makeSegments = function(opts) {
  if (!this.data) {
    throw 'Segmentation not loaded';
  }
  if (this.data.elementType === 'triangles') {
    var object3D = opts.object3D;
    var segmentationsByName = _.keyBy(this.data.segmentation, 'name');
    var segmented = object3D.clone();
    //console.log('segmented', this.data.id, segmented);
    var mesh = GeometryUtil.mergeMeshesWithTransform(Object3DUtil.getMeshList(segmented), { clone: true });
    mesh.name = object3D.name + '-segmented';
    _.merge(mesh.userData, object3D.userData, { segmentType: opts.segmentType, segmentName: opts.segmentName });
    var segmentation = segmentationsByName[opts.segmentName];
    var mats = (mesh.material instanceof THREE.MultiMaterial)? mesh.material.materials :
      (Array.isArray(mesh.material)? mesh.material : [mesh.material]);
    var segMatToSegInfoIndex = {};
    if (segmentation) {
      var maxIndex = -1;
      if (mesh.geometry.faces.length !== segmentation.index.length) {
        console.warn('mismatch between number of faces and segmentation index');
      }
      var labels = segmentation.labels || [];
      var nFaces = mesh.geometry.faces.length;
      var segInfos = [];
      if (opts.useOriginalMaterial) {
        for (var i = 0; i < nFaces; i++) {
          var mi = mesh.geometry.faces[i].materialIndex;
          var bsi = segmentation.index[i] || 0;
          var segMat = bsi + '-' + mi;
          var si = segMatToSegInfoIndex[segMat];
          if (si == undefined) {
            si = segInfos.length;
            segMatToSegInfoIndex[segMat] = si;
            segInfos[si] = { partIndex: bsi, label: labels[bsi], material: mats[mi] };
          }
          mesh.geometry.faces[i].materialIndex = si;
          if (si > maxIndex) {
            maxIndex = si;
          }
        }
      } else {
        for (var i = 0; i < nFaces; i++) {
          var si = segmentation.index[i] || 0;
          mesh.geometry.faces[i].materialIndex = si;
          if (si > maxIndex) {
            maxIndex = si;
          }
        }
        for (var i = 0; i < maxIndex+1; i++) {
          segInfos[i] = {partIndex: i, label: labels[i]};
        }
      }

      //console.log('Make segments: ', this.data.id, mesh, mats, segInfos, segMatToSegInfoIndex);
      var materials = _.range(maxIndex + 1).map(function (i) {
        return opts.getMaterial(object3D, segInfos[i]);
      });
      //console.log('maxIndex ' + maxIndex + ', materials', materials);
      mesh.material = new THREE.MultiMaterial(materials);
    } else {
      console.warn('No ' + opts.segmentType + '.' + opts.segmentName + ' segmentation for ' + this.data.id, segmentationsByName);
      if (opts.useOriginalMaterial) {
        var materials = mats.map(function (m, i) {
          return opts.getMaterial(object3D, { partIndex: 0, material: m });
        });
        mesh.material = new THREE.MultiMaterial(materials);
      } else {
        mesh.material = opts.getMaterial(object3D, { partIndex: 0 });
      }
    }
    //console.log(mesh);
    return mesh;
  } else {
    throw "Unsupported elementType " + this.data.elementType;
  }
};

IndexedSegmentation.prototype.__load = function(opts) {
  var assetLoader = new AssetLoader();
  var callback = opts.callback;
  var scope = this;
  console.log('loading segmentation ' + opts.filename);
  assetLoader.load(opts.filename, 'json', function(data) {
    scope.data = data;
    callback(null, data);
  }, null, function(err) {
    callback(err, null);
  });
};

module.exports = IndexedSegmentation;