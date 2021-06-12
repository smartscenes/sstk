'use strict';

var Constants = require('Constants');
var GeometryUtil = require('geo/GeometryUtil');
var MeshHelpers = require('geo/MeshHelpers');
var OBBFitter = require('geo/OBBFitter');
var SemanticOBB = require('geo/SemanticOBB');
var Object3DUtil = require('geo/Object3DUtil');
var VertexSegmentedObject3DWrapper = require('geo/VertexSegmentedObject3DWrapper');
var PubSub = require('PubSub');
var _ = require('util/util');

/**
 * Class that handles loading and display of custom segmentation and potentially multiple segmentations.
 * This class was coded way back, with inefficient remeshing of objects and random stuff.
 * There is really too much random functionality in this one class -
 *   it should be broken apart into separate classes for storing the segmentation data,
 *     loading, and display/selection of segments
 * TODO: Rename to SegmentationVisualizer
 * @param params
 * @param [segmentType=surfaces] {string} What type of segment to load.
 * @constructor
 * @memberOf geo
 * @example
 * // Setup scene and model instance
 * var scene = new THREE.Scene();
 * var modelInstance = ...;  // do something to get a modelInstance
 * // Setup segmentation
 * var segments = new Segments({
 *   showNodeCallback: function (segmentedObject3D) {
 *   // Add segmented object to scene for display
 *   scene.add(segmentedObject3D);
 * }}, 'surfaces');
 * segments.init(modelInstance);
 * segments.loadSegments(function (err, res) {
 *   if (!err) {
 *     // Segmentation is loaded and available
 *   } else {
 *    console.warn('Error loading segmentation!');
 *   }
 * };
 */
function Segments(params, segmentType) {
  PubSub.call(this);
  params = params || {};
  this.segmentType = segmentType || 'surfaces';
  this.showNodeCallback = params.showNodeCallback;
  this.segmentLevels = params.segmentLevels || ['components', 'pieces', 'surfaces'];
  this.annotatedSegmentLevels = params.annotatedSegmentLevels;

  // Should we compute remapped segments?
  this.sortSegmentsByArea = params.sortSegmentsByArea;
  // Should we skip creation of unlabeled segment?
  this.skipUnlabeledSegment = params.skipUnlabeledSegment;
  // Should we skip creating of segmented object3d?
  this.skipSegmentedObject3D = params.skipSegmentedObject3D;
  // If attributes should be stored
  this.keepAttributes = params.keepAttributes;
  // If materials should be kept
  this.keepMaterials = params.keepMaterials;
  this.autoFitOBBs = true; //params.autoFitOBBs;
  this.obbOptions = {
    useWireframe: true,
    lineWidth: 0.0005 * Constants.metersToVirtualUnit,
    showNormal: false,
    showAxes: false,
    showOrientations: true,
    fitOBBOptions: {
      constrainVertical: true,
      checkAABB: true,
      tolerance: 0.05,
      debug: true
    }
  };
  this.segmentOptions = {
    method: 'clustering',
    adjFaceNormSimThreshold: 0.9,
    includeFaceIndices: true,
    condenseFaceIndices: false
  };
  // The model instance that we are segmenting
  this.modelInstance = null;
  // The original object that we are segmenting
  this.origObject3D = null;
  // The segmented object3d
  this.segmentedObject3D = null;
  this.segmentedObject3DHierarchical = null;
  this.obbsObject3D = null;
  this.rawSegmentObject3DWrapper = null;
  this.rawSegmentColor = null;
  this._showOBBs = false;
  this._showRawSegments = false;
  // The loaded segments
  this.segments = null;
  this.segmentGroups = null;
  // Remapped segments
  this.remappedSegments = null;
  // Segment indices that are selected
  this.segmentIndices = null;
  // Use segment colors?
  this.useColorSequence = false;
  // Is segments visible?
  this.isSegmentsVisible = false;
  // Which segment is being shown
  this.iSegmentGroup = -1;
  // How many segment groups are there?
  this.nSegmentGroups = 0;
}

Segments.prototype = Object.create(PubSub.prototype);
Segments.prototype.constructor = Segments;

Segments.prototype.init = function (modelInstance) {
  this.modelInstance = modelInstance;
  if (this.modelInstance) {
    this.origObject3D = this.modelInstance.object3D;
  } else {
    this.origObject3D = null;
  }
  // Reset rest
  this.remappedSegments = null;
  this.segments = null;
  this.segmentGroups = null;
  this.rawSegmentObject3DWrapper = null;
  this.obbsObject3D = null;
  this.segmentedObject3D = null;
  this.segmentedObject3DHierarchical = null;
  this.segmentIndices = null;
  this.isSegmentsVisible = false;
  this.iSegmentGroup = -1;
  this.nSegmentGroups = 0;

  this.indexedSegmentation = null;
  this.indexedSegmentationAnnotation = null;
};

Object.defineProperty(Segments.prototype, 'modelId', {
  get: function () {
    return this.modelInstance? this.modelInstance.model.getFullID() : null;
  }
});

Object.defineProperty(Segments.prototype, 'showOBBs', {
  get: function () {return this._showOBBs; },
  set: function (v) {
    this._showOBBs = v;
    this.__showSelectedSegmentedObject3D();
  }
});

Object.defineProperty(Segments.prototype, 'showRawSegments', {
  get: function () {return this._showRawSegments; },
  set: function (v) {
    this._showRawSegments = v;
    this.__showSelectedSegmentedObject3D();
  }
});

Object.defineProperty(Segments.prototype, 'rawSegmentObject3D', {
  get: function () {return this.rawSegmentObject3DWrapper? this.rawSegmentObject3DWrapper.rawSegmentObject3D : null; }
});

Segments.prototype.__showSelectedSegmentedObject3D = function() {
  Object3DUtil.setVisible(this.rawSegmentObject3D, this.isSegmentsVisible && this._showRawSegments);
  Object3DUtil.setVisible(this.segmentedObject3D, this.isSegmentsVisible && !this._showRawSegments);
  Object3DUtil.setVisible(this.obbsObject3D, this.isSegmentsVisible && this._showOBBs);
};

Segments.prototype.isVisible = function () {
  return this.isSegmentsVisible;
};

Segments.prototype.getDefaultSegmentator = function() {
  var ObjectSegmentator = require('geo/ObjectSegmentator');
  var segmentator = new ObjectSegmentator();
  return segmentator;
};

Segments.prototype.__segmentationToSegmentsWithTriMesh = function(object3D) {
  var segments = [];
  var meshes = Object3DUtil.getMeshList(object3D);
  for (var i = 0; i < meshes.length; i++) {
    var m = meshes[i];
    var mIndex = m.userData.index;
    var triIndex = m.userData.faceIndices;
    var segIndex = segments.length;
    m.userData.segIndex = segIndex;
    m.userData.id = segIndex;
    segments.push({ surfaceIndex: segIndex, meshIndex: mIndex, triIndex: triIndex });
  }
  return segments;
};

Segments.prototype.__segment = function(segmentator, opts, callback) {
  console.log('segmenting...');
  console.time('segmenting');
  var cloned = this.origObject3D.clone();
  cloned = segmentator.segmentObject(cloned, opts);
  console.log(cloned);
  var segs = this.__segmentationToSegmentsWithTriMesh(cloned);
  console.log(segs);
  console.timeEnd('segmenting');
  //this.segments = toSegments(cloned);
  this.segments = null;
  this.segmentedObject3D = cloned;
  this.segmentedObject3DHierarchical = cloned;
  this.obbsObject3D = null;
  this.rawSegmentObject3DWrapper = null;
//  this.remappedSegments = this.remapSegments(this.sortSegmentsByArea, false);
  this.nSegmentGroups = 0; //this.segments.length;
  this.isCustomSegmentation = true;
  this.segmentationJson = segs;
  if (this.showNodeCallback) {
    this.showNodeCallback(this.segmentedObject3D);
  }
  callback(null, { type: 'segments', data: this.segments });
};

Segments.prototype.ensureSegments = function(callback) {
  var scope = this;
  this.loadSegments(function(err, res) {
    if (res == null && typeof(err) === 'string' && err.startsWith('No segments')) {
      scope.__segment(scope.getDefaultSegmentator(), scope.segmentOptions, callback);
    } else {
      callback(err, res);
    }
  });
};

/**
 * Load segmentation.  A variety of formats is supported.
 * @param callback
 */
Segments.prototype.loadSegments = function (callback) {
  callback = callback || function(err, results) {};
  var scope = this;
  var wrappedCallback = function(err, results) {
    if (err && err instanceof Error) {
      console.error(err);
    }
    scope.Publish('loadSegmentsDone', this);
    callback(err, results);
  };
  this.Publish('loadSegments', this);
  if (this.segmentedObject3D || this.rawSegmentObject3D) {
    // Already loaded...
    wrappedCallback();
    return;
  }
  if (this.segmentType === 'surfaces') {
    this.__loadSegments({ callback: wrappedCallback });
  } else if (this.segmentType === 'meshes') {
    var meshes = Object3DUtil.getMeshList(this.origObject3D);
    var data = [];
    for (var i = 0; i < meshes.length; i++) {
      var mesh = meshes[i];
      var meshIndex = mesh.userData.index;
      data.push({ mesh: mesh, meshIndex: meshIndex });
    }
    this.__setSegments(wrappedCallback, undefined, 'trimesh', data);
  } else if (this.segmentType === 'mtl-groups') {
    var materials = Object3DUtil.getMaterialsMap(this.origObject3D);
    var data = [];
    for (var mat in materials) {
      if (!materials.hasOwnProperty(mat)) {
        continue;
      }
      if (mat === 'all' || mat === 'textured') {
        // Skip these
        continue;
      }
      var matData = [];
      for (var j = 0; j < materials[mat].meshes.length; j++) {
        var mesh = materials[mat].meshes[j];
        if (mesh instanceof THREE.Mesh) {
          var meshIndex = mesh.userData.index;
          matData.push({mesh: mesh, meshIndex: meshIndex});
        } else {
          var meshIndex = mesh.mesh.userData.index;
          var tris = mesh.faceIndices;
          matData.push({mesh: mesh.mesh, meshIndex: meshIndex, triIndex: tris});
        }
      }
      if (matData.length > 0) {
        data.push(matData);
      }
    }
    this.__setSegments(wrappedCallback, undefined, 'trimesh', data);
  } else {
    console.warn('Unknown segmentType: ' + this.segmentType);
    this.__loadSegments({ segmentType: this.segmentType, callback: wrappedCallback });
  }
};

/**
 * Load segments
 * @param opts
 * @param opts.segmentsInfo
 * @param [opts.segmentType] {string} (default='surfaces')
 * @param [opts.segmentsDataField] {string} (default='surface')
 * @param opts.callback
 * @private
 */
Segments.prototype.__loadSegments = function (opts) {
  var callback = opts.callback;
  var segmentsInfo = opts.segmentsInfo;
  var segmentType = opts.segmentType || 'surfaces';
  if (!segmentsInfo) {
    // Segments info not specified, get segment info associated with model
    if (this.modelInstance && this.modelInstance.model.info) {
      var info = this.modelInstance.model.info;
      segmentsInfo = _.cloneDeepWithReplaceVars(info[segmentType], info, {optionalPrefix: 'vars'});
      if (!segmentsInfo) {
        console.log('No segments for model ' + info.fullId + ' ' + segmentType);
        callback('No segments for model ' + info.fullId + ' ' + segmentType);
        return;
      }
    } else {
      console.log('No model or model info when attempting to load segments');
      callback('No model or model info when attempting to load segments');
      return;
    }
  }

  var self = this;
  if (segmentsInfo) {
    var segmentsDataField = segmentsInfo['field'] || opts.segmentsDataField || 'surface';
    this.dropMissingSegments = segmentsInfo.dropMissingSegments;
    if (typeof segmentsInfo === 'string') {
      _.getJSON(segmentsInfo)
        .done(this.__setSegments.bind(this, callback, segmentsDataField, 'trimesh'))
        .fail(callback);
    } else {
      if (segmentsInfo['files']) {
        var files = segmentsInfo['files'];
        if (segmentsInfo['format'] === 'segmentGroups') {
          // surfaces are put in separate files - labeled is separate from the unlabeled
          if (files['segments']) {
            //console.log('segments: ' + files['segments']);
            _.getJSON(files['segments'])
              .done(function (segments) {
                //console.log('segmentGroups: ' + files['segmentGroups']);
                if (files['segmentGroups']) {
                  _.getJSON(files['segmentGroups'])
                    .done(
                      function (segmentGroups) {
                        // merge segments with segmentGroups
                        self.segmentGroupsData = segmentGroups;
                        var data = _.defaults(new Object(null), segmentGroups, segments);
                        data.obbMatrixIsRowMajor = segmentsInfo.obbMatrixIsRowMajor;  // handle row major OBB xform matrix
                        //console.log(data);
                        self.__setSegments(callback, segmentsDataField, segmentsInfo['format'], data);
                      })
                    .fail(function () {
                      self.__setSegments(callback, segmentsDataField, segmentsInfo['format'], segments);
                    });
                } else {
                  self.__setSegments(callback, segmentsDataField, segmentsInfo['format'], segments);
                }
              })
              .fail(callback);
          } else {
            throw Error('Error loading segments: expected segments files');
          }
        } else if (segmentsInfo['format'] === 'indexedSegmentation') {
          if (files['segmentation']) {
            _.getJSON(files['segmentation'])
              .done(function (data) {
                if (files['annotation']) {
                  _.getJSON(files['annotation'])
                    .done(function (annotation) {
                      self.__parseIndexedSegmentation(callback, data, annotation, segmentsInfo['name'] || segmentType);
                    })
                    .fail(callback);
                } else {
                  self.__parseIndexedSegmentation(callback, data);
                }
              })
              .fail(callback);
          } else {
            throw Error('Error loading indexSegmentation: expected segmentation file');
          }
        } else {
          throw Error('Error loading surfaces - multiple files specified for format ' + segmentsInfo['format']);
        }
      } else {
        _.getJSON(segmentsInfo['file'])
          .done(function (data) {
            if (segmentsInfo['format'] === 'indexedSegmentation') {
              self.__parseIndexedSegmentation(callback, data);
            } else {
              var segmentGroups = data;
              segmentGroups.obbMatrixIsRowMajor = segmentsInfo.obbMatrixIsRowMajor;  // handle row major OBB xform matrix
              self.__setSegments(callback, segmentsDataField, segmentsInfo['format'] || 'trimesh', segmentGroups);
            }
          })
          .fail(callback);
      }
    }
  } else {
    callback('Error loading segments');
  }
};

Segments.prototype.exists = function () {
  if (this.segmentType === 'meshes' || this.segmentType === 'mtl-groups') {
    return true;
  } else {
    return this.modelInstance && this.modelInstance.model.info && this.modelInstance.model.info[this.segmentType];
  }
};

Segments.prototype.getSegmentedObjects = function () {
  if (this._showRawSegments) {
    return this.rawSegmentObject3D;
  } else if (this._showOBBs) {
    return [this.segmentedObject3D, this.obbsObject3D];
  } else {
    return this.segmentedObject3D;
  }
};

Segments.prototype.getSegmentedObject = function () {
  if (this._showRawSegments) {
    return this.rawSegmentObject3D;
  } else {
    return this.segmentedObject3D;
  }
};

Segments.prototype.__storeVertexAttributes = function(mesh, vertices, name, value, defaultValue) {
  var data = mesh.userData;
  if (!data.vertexAttributes) {
    data.vertexAttributes = {};
  }
  if (!data.vertexAttributes[name]) {
    data.vertexAttributes[name] = [];
    var nVerts = GeometryUtil.getGeometryVertexCount(mesh.geometry);
    for (var vi = 0; vi < nVerts; vi++) {
      data.vertexAttributes[name].push(defaultValue);
    }
  }
  for (var v = 0; v < vertices.length; v++) {
    var vi = vertices[v];
    data.vertexAttributes[name][vi] = value;
  }
};

Segments.prototype.__storeRawSegmentAttributes = function(mesh, segmentIndex, name, value, defaultValue) {
  var vertices = mesh.userData.segToVertIndices[segmentIndex];
  if (vertices) {
    this.__storeVertexAttributes(mesh, vertices, name, value, defaultValue);
  }
};


/**
 * Color one segment a specific color
 * @param mesh Mesh with segments
 * @param segmentIndex index of segment to color
 * @param color
 */
Segments.prototype.colorRawSegment = function(mesh, segmentIndex, color) {
  this.rawSegmentObject3DWrapper.colorSegment(mesh, segmentIndex, color);
};

/**
 * Colors all raw segments the same color!
 * @param color
 */
Segments.prototype.colorRawSegments = function(color) {
  this.rawSegmentObject3DWrapper.colorSegments(color);
};

/**
 * Colors all raw segments original color
 */
Segments.prototype.colorRawSegmentsOriginal = function() {
  this.rawSegmentObject3DWrapper.colorSegmentsOriginal(this.origObject3D);
};

Segments.prototype.__addUnlabeledSegmentGroup = function(segGroups, segs) {
  var segsToSegGroup = new Object(null);
  var maxId = -1;
  for (var i = 0; i < segGroups.length; i++) {
    var segGroup = segGroups[i];
    for (var j = 0; j < segGroup.segments.length; j++) {
      segsToSegGroup[segGroup.segments[j]] = i;
    }
    maxId = Math.max(segGroup.id, maxId);
  }
  var segIndices = []; //_.keys(segs);
  for (var i in segs) {
    if (segs.hasOwnProperty(i)) {
      segIndices.push(i);
    }
  }
  var segIndicesForSegGroups = _.keys(segsToSegGroup);
  segGroups.push({
    'id': maxId + 1,
    'segments': _.difference(segIndices, segIndicesForSegGroups),
    'label': 'unknown'
  });
};

Segments.prototype.__indexedSegmentationToSegmentsWithTriMesh = function(index, meshIndex, meshTriIndex) {
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
};

Segments.prototype.__indexedSegmentationToHierarchicalSegments = function (nTris, segmentationsByName, meshIndices, segLevels) {
  return this.__indexedSegmentationToHierarchicalSegmentsUseExisting(nTris, segmentationsByName, meshIndices, segLevels);
};

Segments.prototype.__indexedSegmentationToHierarchicalSegmentsUseExisting = function (nTris, segmentationsByName, meshIndices, segLevels) {
  var meshes = Object3DUtil.getMeshList(this.origObject3D);
  var meshIndex = meshIndices? meshIndices.meshIndex : segmentationsByName['meshes'].index;
  var meshTriIndex = meshIndices? meshIndices.meshTriIndex : null;

  var combinedIndex = [];
  for (var i = 0; i < nTris; i++) {
    var index = segLevels.map( function(name) { return segmentationsByName[name].index[i]; }).join('_');
    combinedIndex.push(index);
  }
  var rawSegments = this.__indexedSegmentationToSegmentsWithTriMesh(combinedIndex,
    (meshes.length > 1)? meshIndex : undefined, meshTriIndex);
  var segmented = Object3DUtil.remeshObject(this.origObject3D, rawSegments,
    this.keepMaterials? null : Object3DUtil.ClearMat);
  var segments = segmented.children;
  // Take segmented object and hierarchically cluster it
  var levels = segLevels.length-1;
  while (levels > 0) {
    var grouped = _.groupBy(segments, function(s) {
      var id = s.userData.id;
      var li = id.lastIndexOf('_');
      return li >= 0? id.substring(0, li) : id;
    });
    //console.log(grouped);
    var newChildren = _.map(grouped, function(ss,k) {
      //console.log(ss);
      var group = new THREE.Group();
      group.name = k;
      group.userData.id = k;
      for (var i = 0; i < ss.length; i++) {
        group.add(ss[i]);
      }
      return group;
    });
    for (var i = 0; i < newChildren.length; i++) {
      segmented.add(newChildren[i]);
    }
    segments = newChildren;
    levels = levels - 1;
  }
  // Apply labels
  function applyLabels(root, level) {
    var segLevelName = segLevels[level];
    if (segmentationsByName[segLevelName] && segmentationsByName[segLevelName].labels) {
      var segLevelLabels = segmentationsByName[segLevelName].labels;
      for (var i = 0; i < root.children.length; i++) {
        var c = root.children[i];
        var p = parseInt(c.userData.id);
        if (segLevelLabels[p]) {
          c.userData.label = segLevelLabels[p];
        }
        if (level + 1 < segLevels) {
          applyLabels(c, level + 1);
        }
      }
    }
  }
  applyLabels(segmented, 0);
  return { index: combinedIndex, segmented: segmented };
};

Segments.prototype.__indexedSegmentationToHierarchicalSegmentsRegroup = function (nTris, segmentationsByName, meshIndices, segLevels) {
  var meshes = Object3DUtil.getMeshList(this.origObject3D);
  var meshIndex = meshIndices? meshIndices.meshIndex : segmentationsByName['meshes'].index;
  var meshTriIndex = meshIndices? meshIndices.meshTriIndex : null;

//  var segLevels = ['components', 'pieces', 'surfaces'];
  var combinedIndex = [];
  for (var i = 0; i < nTris; i++) {
    var index = segLevels.map( function(name) { return segmentationsByName[name].index[i]; }).join('_');
    combinedIndex.push(index);
  }
  var rawSegments = this.__indexedSegmentationToSegmentsWithTriMesh(combinedIndex, (meshes.length > 1)? meshIndex : undefined);
  var segmented = Object3DUtil.remeshObject(this.origObject3D, rawSegments,
    this.keepMaterials? null : Object3DUtil.ClearMat);
  var segments = segmented.children;
  var grouped = this.__groupSegmentsToHierarchicalSegments(segments);
  grouped.name = segmented.name;
  return { index: combinedIndex, segmented: grouped };
};

Segments.prototype.__groupSegmentsToHierarchicalSegments = function (segments) {
  var BVH = require('geo/BVH');
  var bvh = new BVH(segments, { splitStrategy: BVH.SplitStrategy.CUBICITY_HEURISTIC });

  // Take bvh and group segments
  var threeNodes = {};
  // TODO: Flatten down into max levels
  bvh.traverse(function(bvhNode) {
    },
    function(bvhNode) {
      var node = threeNodes[bvhNode.id];
      if (!node) {
        node = new THREE.Group();
        node.name = 'BVH-' + bvhNode.id;
        threeNodes[bvhNode.id] = node;
        if (bvhNode.isLeaf) {
          for (var j = 0; j < bvhNode.objects.length; j++) {
            var obj = bvhNode.objects[j];
            node.add(obj);
          }
        } else {
          for (var j = 0; j < bvhNode.children.length; j++) {
            var child = bvhNode.children[j];
            var childNode = threeNodes[child.id];
            node.add(childNode);
          }
        }
        node.userData.splitAxis = bvhNode.splitAxis;
      }
    }
  );

  var grouped = threeNodes[bvh.root.id];
  return grouped;
};

Segments.prototype.extractParts = function(partName, labels) {
  var meshes = Object3DUtil.getMeshList(this.origObject3D);
  // Assume just one geometry for now
  var geometry = GeometryUtil.extractParts(meshes[0].geometry,
    this.indexedSegmentation,
    { name: partName, labels: labels, elementOffset: 0});
  return new THREE.Mesh(geometry, meshes[0].material);
};

function createMeshTriIndexFromMeshIndex(meshIndex, ntriangles) {
  var meshTriCounts = [];   // mesh index to number of triangles in mesh
  var meshTriIndex = [];    // triangle index to triangle index for mesh
  for (var j = 0; j < ntriangles; j++) {
    var mi = meshIndex[j];
    var c = (meshTriCounts[mi] || 0);
    meshTriIndex[j] = c;
    meshTriCounts[mi] = c + 1;
  }
  return meshTriIndex;
}

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

Segments.prototype.__parseIndexedSegmentation = function (callback, data, annotation, annName) {
  //console.log(data);
  //console.log(annotation);
  this.indexedSegmentation = data;
  if (data.elementType === 'triangles') {
    var meshes = Object3DUtil.getMeshList(this.origObject3D);
    var meshIndices = null;
    var segmentationsByName = _.keyBy(data.segmentation, 'name');
    var ignoreList = ['faces', 'materials', 'meshes'];
    //var meshIndex = segmentationsByName['meshes'].index;
    var segmentations = {};
    for (var i = 0; i < data.segmentation.length; i++) {
      var segmentation = data.segmentation[i];
      if (ignoreList.indexOf(segmentation.name) >= 0) continue; // ignore
      var converted;
      if (meshes.length > 1) {
        // Need to create new mesh to tri indices (whatever is saved is not necessarily how our loader separated into meshes)
        if (!meshIndices) {
          meshIndices = createMeshIndicesFromMeshes(meshes);
        }
        converted = this.__indexedSegmentationToSegmentsWithTriMesh(segmentation.index, meshIndices.meshIndex, meshIndices.meshTriIndex);
      } else {
        converted = this.__indexedSegmentationToSegmentsWithTriMesh(segmentation.index);
      }
      segmentations[segmentation.name] = converted;
    }
    var info = this.__indexedSegmentationToHierarchicalSegments(data.elementCount, segmentationsByName, meshIndices, this.segmentLevels);
    if (annotation) {
      // Augment original indexSegmentation with annotations
      // Figure out corresponding faceIndices
      //console.log(info);
      // Map from partId to annotation label index
      var annotatedParts = annotation.parts;
      var partIdToAnnIndex = {};
      for (var i = 0; i < annotatedParts.length; i++) {
        var ann = annotatedParts[i];
        var partIds = ann.partId.split(',');
        for (var j = 0; j < partIds.length; j++) {
          partIdToAnnIndex[partIds[j]] = i+1;
        }
      }
      var annLabels = ['unknown'].concat(annotatedParts.map(function(x) { return x.label; }));
      var annTriIndices = info.index.map(function(pId) {
        return partIdToAnnIndex[pId] || 0;
      });
      var annotationSegments = {
        name: annName,
        labels: annLabels,
        index: annTriIndices
      };
      this.indexedSegmentation.segmentation.push(annotationSegments);
      this.indexedSegmentationAnnotation = annotation;
      if (this.annotatedSegmentLevels) {
        segmentationsByName[annName] = annotationSegments;
        info = this.__indexedSegmentationToHierarchicalSegments(data.elementCount, segmentationsByName, meshIndices, this.annotatedSegmentLevels);
      }
    }
    this.segmentedObject3DHierarchical = info.segmented;
    this.__setSegments(callback, 'surfaces', 'trimesh', segmentations);
  } else {
    callback('Unsupported element type: ' + data.elementType);
  }
};

function __convertFaceToSegIndices2VertToSegIndices(object3D, faceToSegIndices) {
  var vertToSegIndices = [];
  var vertOffset = 0;
  var faceOffset = 0;
  Object3DUtil.traverseMeshes(object3D, false, function(mesh) {
    var geometry = mesh.geometry;
    GeometryUtil.forFaceVertexIndices(geometry, function(iFace, vertIndices) {
      for (var i = 0; i < vertIndices.length; i++) {
        vertToSegIndices[vertOffset + vertIndices[i]] = faceToSegIndices[faceOffset + iFace];
      }
    });
    vertOffset += GeometryUtil.getGeometryVertexCount(geometry);
    faceOffset += GeometryUtil.getGeometryFaceCount(geometry);
  });
  return vertToSegIndices;
}

function __remapFromOriginalVertices(object, vertToSegIndices) {
  // Go over segment groups
  var meshes = Object3DUtil.getMeshList(object);
  // Assumes just one mesh
  var mesh = meshes[0];
  var geometry = mesh.geometry;
  var origVertIndices;
  if (geometry.faces) {
    // TODO: use original vert indices
  } else {
    // Set in OBJLoader (look for handling of geometry.origVertIndices)
    var attributes = geometry.attributes;
    if ( attributes.position ) {
      var positions = attributes.position.array;
      if (attributes.vertIndices) {
        origVertIndices = attributes.vertIndices.array;
      }
      if (origVertIndices) {
        var vcount = Math.floor(positions.length / 3);
        var remapped = [];
        for (var i = 0; i < vcount; i++) {
          remapped[i] = vertToSegIndices[origVertIndices[i]];
        }
        return remapped;
      }
    }
  }

  return vertToSegIndices;
}

Segments.prototype.__setSegments = function (callback, field, format, data) {
  this.isCustomSegmentation = false;
  this.segmentationJson = null;
  if (format === 'trimesh') {
    console.time('setSegments');
    this.segments = (field) ? data[field] : data;
    this.segmentedObject3D = Object3DUtil.remeshObject(this.origObject3D, this.segments);
    this.obbsObject3D = null;
    this.rawSegmentObject3DWrapper = null;
    this.remappedSegments = this.remapSegments(this.sortSegmentsByArea, false);
    this.nSegmentGroups = this.remappedSegments.length;
    if (this.showNodeCallback) {
      this.showNodeCallback(this.segmentedObject3D);
    }
    console.timeEnd('setSegments');
    callback(null, {type: 'segments', data: this.segments});
  } else if (format === 'trimeshHier') {
    console.time('setSegments');
    this.segments = (field) ? data[field] : data;
    var segmented = this.getDefaultSegmentator().applyTriMeshSegmentation(this.origObject3D, this.segments);
    this.segmentedObject3D = segmented;
    this.segmentedObject3DHierarchical = segmented;
    this.obbsObject3D = null;
    this.rawSegmentObject3DWrapper = null;
    this.nSegmentGroups = 0; //this.segments.length;
    this.isCustomSegmentation = true;
    this.segmentationJson = this.segments;
    if (this.showNodeCallback) {
      this.showNodeCallback(this.segmentedObject3D);
    }
    console.timeEnd('setSegments');
    callback(null, { type: 'segments', data: this.segments });
  } else if (format === 'segmentGroups') {
    var elementType = data['elementType'];
    if (elementType == null) {
      console.log('Segmentation element type not specified for segmentGroups, assuming vertices');
      elementType = 'vertices';
    }
    if (elementType === 'vertices' || elementType === 'faces') {
      console.time('setSegments');
      this.segments = null;
      var vertToSegIndices = null;
      if (elementType === 'vertices') {
        var origVertToSegIndices = data['segIndices'];
        vertToSegIndices = __remapFromOriginalVertices(this.origObject3D, origVertToSegIndices);
      } else {
        var origFaceToSegIndices = data['segIndices'];
        vertToSegIndices = __convertFaceToSegIndices2VertToSegIndices(this.origObject3D, origFaceToSegIndices);
      }
      this.rawSegmentObject3DWrapper = new VertexSegmentedObject3DWrapper(this.origObject3D, vertToSegIndices, this.rawSegmentColor);
      var segToVertIndices = this.rawSegmentObject3DWrapper.segToVertIndices;
      this.segmentGroups = data['segGroups'] || [];
      //console.log(this.segmentGroups);
      // convert indices that are mistakenly encoded as strings
      for (var i = 0; i < this.segmentGroups.length; i++) {
        var segs = this.segmentGroups[i].segments;
        for (var j = 0; j < segs.length; j++) {
          var v = segs[j];
          if (typeof v === 'string') {
            segs[j] = parseInt(v);
          }
        }
      }
      // Create a fake segment group of unlabeled segments
      if (!this.skipUnlabeledSegment) {
        this.__addUnlabeledSegmentGroup(this.segmentGroups, segToVertIndices);
      }
      if (!this.skipSegmentedObject3D) {
        this.segmentedObject3D = Object3DUtil.remeshObjectUsingSegmentGroups(this.origObject3D, this.segmentGroups, vertToSegIndices,
          this.dropMissingSegments);
        var obbs = this.segmentGroups.map(x => x.obb);
        this.useOBBs(obbs, { createObbMeshes: true, autoFitOBBs: this.autoFitOBBs, obbMatrixIsRowMajor: data.obbMatrixIsRowMajor });
        this.remappedSegments = this.remapSegments(this.sortSegmentsByArea, false);
        this.nSegmentGroups = this.remappedSegments.length;
        this.__showSelectedSegmentedObject3D();
        if (this.showNodeCallback) {
          this.showNodeCallback(this.segmentedObject3D);
          this.showNodeCallback(this.obbsObject3D);
        }
      } else {
        this.nSegmentGroups = this.segmentGroups.length;
        for (var i = 0; i < this.segmentGroups.length; i++) {
          var segGroup = this.segmentGroups[i];
          segGroup['index'] = i;
        }
        this.__showSelectedSegmentedObject3D();
      }
      if (this.showNodeCallback) {
        this.showNodeCallback(this.rawSegmentObject3D);
      }
      console.timeEnd('setSegments');
      callback(null, {type: 'segmentGroups', data: this.segmentGroups});
    } else {
      console.log('Unsupported element type segmentGroups: ' + elementType);
      callback('Unsupported element type segmentGroups: ' + elementType);
    }
  } else {
    console.error('Unknown segment format type: ' + format);
    callback('Unknown segment format type: ' + format);
  }
  this.Publish('segmentsUpdated', this);
};

Segments.prototype.__getOBBFitter = function(origObject3D, fitOBBOptions) {
  var scope = this;
  var inverseMatrix = Object3DUtil.getModelMatrixWorldInverse(origObject3D);
  if (fitOBBOptions) {
    fitOBBOptions = _.defaults(Object.create(null), fitOBBOptions, this.obbOptions.fitOBBOptions);
  } else {
    fitOBBOptions = this.obbOptions.fitOBBOptions;
  }
  var obbFitter = function (segmentIndices) {
    var obb = scope.__fitOBB('Raw', segmentIndices, fitOBBOptions);
    if (obb) {
      obb.applyMatrix4(inverseMatrix);
    }
    return obb;
  };
  return obbFitter;
};

Segments.prototype.__updateObbsObject3D = function(obbsObject3D) {
  if (this.obbsObject3D) {
    var oldObject3D = this.obbsObject3D;
    obbsObject3D.visible = this.obbsObject3D.visible;
    if (oldObject3D.parent) {
      oldObject3D.parent.add(obbsObject3D);
      oldObject3D.parent.remove(oldObject3D);
      Object3DUtil.dispose(oldObject3D);
    }
  }
  this.obbsObject3D = obbsObject3D;
};

Segments.prototype.ensureSegmentGroupObbInfo = function() {
  var segs = this.segmentGroups;
  var obbFitter = this.__getOBBFitter(this.origObject3D);
  for (var i = 0; i < segs.length; i++) {
    var sobb = segs[i].obb;
    if (!sobb) {
      sobb = obbFitter(segs[i].segments);
      if (sobb) {
        segs[i].obb = sobb;
      }
    }
  }
};

Segments.prototype.updateFittedOBBForSegmentGroup = function(index, fitObbOptions) {
  var segs = this.segmentGroups;
  var obbFitter = this.__getOBBFitter(this.origObject3D, fitObbOptions);
  var obb = obbFitter(segs[index].segments);
  this.updateOBB(obb, index);
  return obb;
};

Segments.prototype.getOBBForSegmentGroup = function(index) {
  var seg = this.segmentGroups[index];
  if (seg) {
    return seg.obb;
  }
};

/**
 * Use specified obbs for segmentGroups
 * @param obbs
 * @param [options.obbMatrixIsRowMajor] {boolean} If obb is a plain JSON object, whether the basis matrix is specified in row major order
 * @param [options.autoFitObbs] {boolean} Whether to autoFit obbs if obb for segment is missing
 * @param [options.createObbMeshes] {boolean} Whether to create the obb mesh for visualization
 */
Segments.prototype.useOBBs = function(obbs, options) {
  // TODO: obbMatrixIsRowMajor option is currently ignored
  //       is this still used anywhere?  if so - support, otherwise, remove support
  options = options || {};
  for (var i = 0; i < this.segmentGroups.length; i++) {
    var seg = this.segmentGroups[i];
    if (seg) {
      var obb = obbs[i];
      if (obb && _.isPlainObject(obb)) {
        obb = SemanticOBB.asSemanticOBB(obb, options.obbMatrixIsRowMajor);
      } else if (!options.autoFitObbs) {
        console.log('No OBB for segment group ' + i);
      }
      seg.obb = obb;
    }
  }
  if (options.createObbMeshes) {
    var obbFitter = (options.autoFitObbs)? this.__getOBBFitter(this.origObject3D) : null;
    var obbsObject3D = this.__createObbMeshes(this.origObject3D, this.segmentGroups, obbFitter);
    this.__updateObbsObject3D(obbsObject3D);
  }
};

Segments.prototype.getOBBs = function() {
  var obbs = this.segmentGroups.map(x => x.obb );
  return obbs;
};

Segments.prototype.updateOBB = function(obb, meshIndex) {
  var seg = this.segmentGroups[meshIndex];
  if (seg && seg.obb !== obb) {
    if (seg.obb && seg.obb.hasFront) {
      obb.front = seg.obb.front;
    }
    if (seg.obb && seg.obb.hasUp) {
      obb.up = seg.obb.up;
    }
    seg.obb = obb;
  }
  if (this.obbsObject3D) {
    var obbObject3D = createObb(obb, seg, Object3DUtil.getSimpleFalseColorMaterial(meshIndex+1), this.obbOptions);
    // console.log('find and replace child', obbObject3D, this.obbsObject3D);
    Object3DUtil.findAndReplaceChild(obbObject3D, this.obbsObject3D,
      function(c) { return c.userData.index === meshIndex; }, true);
  }
};

function createObb(sobb, userData, material, obbOptions) {
  var obb = new MeshHelpers.OBB(sobb, material);
  //console.log('createObb', sobb, obbOptions);
  if (obbOptions.useWireframe) {
    var lineWidth = obbOptions.lineWidth;
    obb = obb.toWireFrame(lineWidth, obbOptions.showNormal, null, obbOptions.showAxes, obbOptions.showOrientations);
    Object3DUtil.traverseMeshes(obb, true, function(x) { _.merge(x.userData, userData); });
  }
  obb.userData = userData;
  return obb;
}

Segments.prototype.__createObbMeshes = function (obj, segs, obbFitter) {
  var obbs = new THREE.Object3D();
  obbs.name = obj.name + '-obbs';
  var matrix = Object3DUtil.getModelMatrixWorld(obj);
  obbs.applyMatrix4(matrix);
  for (var i = 0; i < segs.length; i++) {
    var sobb = segs[i].obb;
    if (sobb) {
      var obb = createObb(sobb, segs[i], Object3DUtil.getSimpleFalseColorMaterial(i), this.obbOptions);
      obbs.add(obb);
    } else if (obbFitter) {
      sobb = obbFitter(segs[i].segments);
      if (sobb) {
        var obb = createObb(sobb, segs[i], Object3DUtil.getSimpleFalseColorMaterial(i), this.obbOptions);
        segs[i].obb = sobb;
        obbs.add(obb);
      }
    }
  }
  return obbs;
};

Segments.prototype.__colorSegments = function(segmentedObject, labelType, labelToIdxFn, getLabelFn, getMaterialFn, defaultIdx, sortByIdx, neutralColor) {
  if (labelType === 'Normal' || labelType === 'Neutral' || labelType === 'Raw') {
    this.labelType = labelType;
    this.labels = [];
    this.labelData = [];
    if (labelType === 'Normal') {
      this.showRawSegments = false;
      Object3DUtil.setMaterial(this.getSegmentedObject(), new THREE.MeshNormalMaterial());
    } else if (labelType === 'Neutral') {
      this.showRawSegments = false;
      Object3DUtil.setMaterial(this.getSegmentedObject(), Object3DUtil.getSimpleFalseColorMaterial(0, neutralColor));
    } else if (labelType === 'Raw') {
      this.showRawSegments = true;
    }
  } else {
    this.showRawSegments = false;
    return this.__colorLabeledSegments(segmentedObject, labelType, labelToIdxFn, getLabelFn, getMaterialFn, defaultIdx, sortByIdx);
  }
};

/**
 * Color segments
 * @param segmentedObject {Object3D} object to color
 * @param type {string} Type of coloring
 * @param labelToIdxFn {Map<string,int>|function(string):int} Mapping from label to index
 * @param [getLabelFn] {function(string): string} Remapping of labels
 * @param [getMaterialFn] {function(int,THREE.color): THREE.Material} Material to use for segment
 * @param [defaultIdx] {int} Default index
 * @param [sortByIdx] {boolean} Whether to sort final labels by index
 * @returns {{}}
 * @private
 */
Segments.prototype.__colorLabeledSegments = function (segmentedObject, type, labelToIdxFn, getLabelFn, getMaterialFn, defaultIdx, sortByIdx) {
  var labelColorIndex = {};
  var materials = {};
  getMaterialFn = getMaterialFn || Object3DUtil.getSimpleFalseColorMaterial;
  defaultIdx = defaultIdx || 0;
  var scope = this;

  if (typeof labelToIdxFn !== 'function') {
    labelColorIndex = labelToIdxFn || {};
    var labelToIndex = labelColorIndex;
    var vals = _.filter(_.values(labelToIndex), function (x) {
      return _.isNumber(x);
    });
    var maxIdx = (vals.length > 0) ? _.max(vals) : 0;
    labelToIdxFn = function(label) {
      if (labelToIndex[label] == undefined) {
        maxIdx++;
        labelToIndex[label] = maxIdx;
      }
      return labelToIndex[label];
    };
  }

  function getCategory(label) {
    var category = label;
    if (label) {
      var i = label.indexOf(':');
      if (i >= 0) {
        category = label.substring(0, i);
      }
    }
    return category;
  }

  function indexOf(label) {
    var idx = labelToIdxFn(label);
    labelColorIndex[label] = idx;
    return idx;
  }

  function saveLabel(label, segment_data, material) {
    var labels = scope.labels;
    var li = labels.indexOf(label);
    if (li < 0) {
      li = labels.length;
      labels.push(label);
    }
    scope.labelData[li] = scope.labelData[li] || { segmentGroups: [] };
    scope.labelData[li].material = material;
    scope.labelData[li].segmentGroups.push(segment_data.index);
  }

  function getColorLabel(segment_data) {
    var colorIdx = 0;
    var data = segment_data;
    var label;
    if (data.label) {
      if (type === 'Segment') {
        label = (data.label === 'unknown') ? 'unknown' : data.label + ' (' + data.index + ')';
        colorIdx = indexOf(label, segment_data);
      } else if (type === 'Category') {
        label = getCategory(data.label);
        if (getLabelFn) {
          label = getLabelFn(label);
        }
        colorIdx = indexOf(label);
      } else if (type === 'Label') {
        label = data.label;
        colorIdx = indexOf(label);
      } else if (type === 'Object') {
        label = getCategory(data.label);
        var objLabel = (label === 'unknown' || label == undefined) ? 'unknown' : label + ' (' + data.objectId + ')';
        colorIdx = indexOf(objLabel);
        label = objLabel;
      } else if (getLabelFn) {
        label = getLabelFn(data.label);
        colorIdx = indexOf(label);
        //console.log('Got label', label, colorIdx);
      } else {
        console.warn('Unknown type for colorSegments: ' + type + ', using segment colors');
        colorIdx = data.index;
      }
    } else {
      colorIdx = data.index;
    }

    if (!materials[colorIdx]) {
      var color = _.isInteger(colorIdx) ? undefined : colorIdx;
      materials[colorIdx] = getMaterialFn(colorIdx, color);
    }
    if (label) {
      saveLabel(label, segment_data, materials[colorIdx]);
    }
    return { colorIdx: colorIdx, label: label, material: materials[colorIdx] };
  }

  this.labelType = type;
  this.labels = [];
  this.labelData = [];
  var keepAttributes = this.keepAttributes;
  if (segmentedObject && !this.showRawSegments) {
    for (var i = 0; i < segmentedObject.children.length; i++) {
      var seg = segmentedObject.children[i];
      var data = seg.userData;
      var colorLabel = getColorLabel(data);
      if (keepAttributes) {
        if (!data.attributes) {
          data.attributes = {};
        }
        data.attributes[type] = colorLabel.colorIdx;
      }
      // Color our segment!!!
      Object3DUtil.setMaterial(seg, colorLabel.material, Object3DUtil.MaterialsAll, false, function(mesh) {
        return !mesh.userData.isAxis && !mesh.userData.isOrientationArrow;
      });
    }
  } else if (!this.showRawSegments) {
    segmentedObject = this.rawSegmentObject3D;
    if (segmentedObject instanceof THREE.Mesh) {
      if (this.segmentGroups) {
        for (var i = 0; i < this.segmentGroups.length; i++) {
          var segmentGroup = this.segmentGroups[i];
          var colorLabel = getColorLabel(segmentGroup);
          var segIndices = segmentGroup.segments || segmentGroup.segIndices;
          for (var j = 0; j < segIndices.length; j++) {
            this.colorRawSegment(segmentedObject, segIndices[j], colorLabel.material.color);
            if (keepAttributes) {
              this.__storeRawSegmentAttributes(segmentedObject, segIndices[j], type, colorLabel.colorIdx, defaultIdx);
            }
          }
        }
      } else {
        console.error('Cannot color segments if there are not segment groups');
      }
    }
  }
  if (sortByIdx && this.labels.length > 1) {
    var zipped = _.zip(this.labels, this.labelData);
    zipped = _.sortBy(zipped, function(p) { return indexOf(p[0]); });
    var unzipped = _.unzip(zipped);
    //console.log('unzipped', unzipped);
    this.labels = unzipped[0];
    this.labelData = unzipped[1];
  }
  //console.log(labelColorIndex);
  return labelColorIndex;
};

/**
 * Color segments
 * @param type {string} Type of coloring
 * @param labelToIdxFn {Map<string,int>|function(string):int} Mapping from label to index
 * @param [getLabelFn] {function(string): string} Remapping of labels
 * @param [getMaterialFn] {function(int,THREE.color): THREE.Material} Material to use for segment
 * @param [defaultIdx] {int} Default index
 * @param [sortByIdx] {boolean} Whether to sort final labels by index
 * @returns {{}}
 */
Segments.prototype.colorSegments = function(type, labelToIdxFn, getLabelFn, getMaterialFn, defaultIdx, sortByIdx, neutralColor) {
  var segmentedObject = this.getSegmentedObjects();
  if (Array.isArray(segmentedObject)) {
    for (var i = 0; i < segmentedObject.length; i++) {
      this.__colorSegments(segmentedObject[i], type, labelToIdxFn, getLabelFn, getMaterialFn, defaultIdx, sortByIdx, neutralColor);
    }
  } else {
    this.__colorSegments(segmentedObject, type, labelToIdxFn, getLabelFn, getMaterialFn, defaultIdx, sortByIdx, neutralColor);
  }
};

Segments.prototype.setMaterialVertexColors = function (v) {
  var segmentedObject = this.getSegmentedObject();
  if (segmentedObject) {
    for (var i = 0; i < segmentedObject.children.length; i++) {
      var seg = segmentedObject.children[i];
      seg.material.vertexColors = v;
    }
  }
};

Segments.prototype.getLabels = function () {
  return this.labels;
};

// Returns array of segments by surface area from largest to smallest
//  each object: segmentIndices, area, bbox
// If mergeSurfaces is true, then segments are potentially merged
Segments.prototype.remapSegments = function (sortSurfaces, mergeSurfaces) {
  // Remap segments by order of area...
  // Once we have improved part segmentation, this will not be needed.
  var meshes = Object3DUtil.getMeshList(this.segmentedObject3D);
  var sAreas = [];
  for (var i = 0; i < meshes.length; i++) {
    // Find area of this surface
    if (meshes[i]) {
      var myBBox = Object3DUtil.getBoundingBox(meshes[i]);
      var surfaceArea = myBBox.surfaceArea();
      sAreas.push({ segmentIndices: [i], area: surfaceArea, bbox: myBBox });
    } else {
      console.warn('No mesh for segment ' + i);
    }
  }
  if (sortSurfaces) {
    sAreas.sort(function (a, b) {return b['area'] - a['area'];});
  }

  if (mergeSurfaces) {
    // "Merge" surfaces with same BBox (list them together, not actually merge)
    var epsilon = 50;
    for (var i = 0; i < sAreas.length - 1; i++) {
      for (var j = i + 1; j < sAreas.length && sAreas[i].area < sAreas[j].area + epsilon; j++) {
        if (sAreas[i].bbox.isEq(sAreas[j].bbox)) {
          // TODO: shouldn't all segmentIndices be pushed (in case there is more than one?)
          sAreas[i].segmentIndices.push(sAreas[j].segmentIndices[0]);
          sAreas.splice(j,1);
          j--;
        }
      }
    }
  }

  return sAreas;
};

Segments.prototype.showSegments = function (flag, skipRecolor) {
  if (flag) {
    this.showAllSegments(skipRecolor);
  } else {
    this.isSegmentsVisible = false;
    this.__showSelectedSegmentedObject3D();
  }
};

Segments.prototype.showAllSegments = function (skipRecolor) {
  var self = this;
  this.loadSegments(function (err, res) {
    if (!err) {
      self.__showAllSegments(skipRecolor);
    }
  });
};

Segments.prototype.__showAllSegments = function (skipRecolor) {
  // Assign color to each segment
  if (!skipRecolor) {
    this.colorSegments(this.labelType);
  }

  // Show our colored object
  this.isSegmentsVisible = true;
  //Object3DUtil.setVisible(this.origObject3D, false);
  var segmentedObject = this.getSegmentedObjects();
  Object3DUtil.setVisible(segmentedObject, true);
};

Segments.prototype.showNextSegment = function (incr) {
  if (this.nSegmentGroups) {
    this.iSegmentGroup = ((this.iSegmentGroup + incr) % this.nSegmentGroups);
    while (this.iSegmentGroup < 0) {
      this.iSegmentGroup += this.nSegmentGroups;
    }
    this.__showSegment(this.iSegmentGroup);
    return this.iSegmentGroup;
  }
};

Segments.prototype.showSegment = function (index) {
  var self = this;
  this.loadSegments(function (err, res) {
    if (!err) {
      self.__showSegment(index);
    }
  });
};

Segments.prototype.highlightSegments = function (indices, material) {
  this.__showSegments(indices, material);
};

Segments.prototype.__showSegment = function (index) {
  this.__showSegments([index]);
};

Segments.prototype.__showSegments = function (indices, material) {
  if (indices.length === 1) {
    this.iSegmentGroup = indices[0];
  }
  var segmentedObject = this.getSegmentedObjects();
  if (this.remappedSegments) {
    this.segmentIndices = [];
    for (var i = 0; i < indices.length; i++) {
      var index = indices[i];
      this.segmentIndices = this.segmentIndices.concat(this.remappedSegments[index].segmentIndices);
    }
    Object3DUtil.highlightMeshes(segmentedObject, this.segmentIndices, material, this.useColorSequence);
  } else {
    // Make rest transparent, selected not transparent
    this.segmentIndices = indices;
    Object3DUtil.highlightMeshes(segmentedObject, this.segmentIndices, material, this.useColorSequence);
  }

  // Show our colored object
  this.isSegmentsVisible = true;
  //Object3DUtil.setVisible(this.origObject3D, false);
  Object3DUtil.setVisible(segmentedObject, true);
};

Segments.prototype.getRawSegmentVerticesCount = function (segmentIndices) {
  return this.rawSegmentObject3DWrapper.getSegmentVerticesCount(segmentIndices);
};

Segments.prototype.getRawSegmentVertices = function (segmentIndices) {
  return this.rawSegmentObject3DWrapper.getSegmentVertices(segmentIndices, { warn: !this.dropMissingSegments });
};

Segments.prototype.segmentHasPointInOBB = function (segmentIndex, obb) {
  return this.rawSegmentObject3DWrapper.segmentHasPointInOBB(segmentIndex, obb);
};

Segments.prototype.fitOBB = function(type, indices) {
  return this.__fitOBB(type, indices, {});
};

Segments.prototype.__fitOBB = function (type, indices, fitOBBOptions) {
  if (type === 'Raw') {
    var points = this.getRawSegmentVertices(indices);
    if (points && points.length) {
      var obb = OBBFitter.fitPointsOBB(points, fitOBBOptions);
      obb = SemanticOBB.asSemanticOBB(obb);
      if (fitOBBOptions.up) {
        obb.up = fitOBBOptions.up;
      }
      if (fitOBBOptions.front) {
        obb.front = fitOBBOptions.front;
      }
      return obb;
    } else {
      console.warn('Segments.fitOBB: no points');
      return null;
    }
  } else {
    console.error('Segments.fitOBB: unsupported type ' + type);
  }
};

Segments.prototype.exportRaw = function(exporter, name, cb) {
  var target = this.rawSegmentObject3D;
  target.updateMatrixWorld();
  var worldToModelTransform = new THREE.Matrix4();
  worldToModelTransform.getInverse(target.matrixWorld);
  exporter.export(target, {transform: worldToModelTransform, name: name, callback: cb});
};

Segments.prototype.export = function(exporter, name, cb) {
  var target = this.getSegmentedObject() || this.rawSegmentObject3D;
  target.updateMatrixWorld();
  var worldToModelTransform = new THREE.Matrix4();
  worldToModelTransform.getInverse(target.matrixWorld);
  exporter.export(target, {transform: worldToModelTransform, name: name, callback: cb});
};

Segments.prototype.compare = function(segGroups1, segGroups2) {
  var Alignment = require('ds/Alignment');
  var segments = this;
  // for (var i = 0; i < segGroups1.length; i++) {
  //   var seg = segGroups1[i];
  //   console.log(seg.label + seg.id);
  // }
  // for (var i = 0; i < segGroups2.length; i++) {
  //   var seg = segGroups2[i];
  //   console.log(seg.label + seg.id);
  // }
  var alignment = Alignment.getAlignment(segGroups1, segGroups2, {
    debug: false,
    cache: true,
    alignBy: 'greedy',
    cacheKey: function(sg) { return sg? sg.id : 'null'; },
    cost: function(sg1,sg2) {
      // Return cost of segment groups as number of vertices that are different
      if (sg1 && sg1.nVertices == undefined) {
        sg1.nVertices = segments.getRawSegmentVerticesCount(sg1.segments || sg1.segIndices);
      }
      if (sg2 && sg2.nVertices == undefined) {
        sg2.nVertices = segments.getRawSegmentVerticesCount(sg2.segments || sg2.segIndices);
      }
      if (sg1 && !sg2) { return sg1.nVertices; }
      if (sg2 && !sg1) { return sg2.nVertices; }
      if (sg1 && sg2) {
        // Get number of differences
        var union = _.union(sg1.segments || sg1.segIndices,sg2.segments || sg2.segIndices);
        var intersect = _.intersection(sg1.segments || sg1.segIndices, sg2.segments || sg2.segIndices);
        var diff = _.difference(union, intersect);
        //var nvertsUnion = segments.getRawSegmentVerticesCount(union);
        if (diff.length > 0) {
          var nvertsDiff = segments.getRawSegmentVerticesCount(diff);
          //console.log('difference', diff.length, nvertsDiff);
          //return nvertsDiff/nvertsUnion;
          return nvertsDiff;
        } else {
          return 0;
        }
      } else {
        return 0;
      }
    }
  });
  for (var i = 0; i < alignment.alignment.length; i++) {
    var pair = alignment.alignment[i];
    var sg1 = pair[0] >= 0? segGroups1[pair[0]] : null;
    var sg2 = pair[1] >= 0? segGroups2[pair[1]] : null;
    var sg1key = sg1? sg1.label : null;
    var sg2key = sg2? sg2.label : null;
    if (sg1key !== sg2key) {
      pair.push(1);
    } else {
      pair.push(0);
    }
  }
  return alignment;
};

module.exports = Segments;
