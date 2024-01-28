'use strict';

var Constants = require('Constants');
var GeometryUtil = require('geo/GeometryUtil');
var MultiOBBHelper = require('geo/MultiOBBHelper');
var OBBFitter = require('geo/OBBFitter');
var SemanticOBB = require('geo/SemanticOBB');
var Object3DUtil = require('geo/Object3DUtil');
var SegmentsLoader = require('geo/seg/SegmentsLoader');
var SegmentationUtil = require('geo/seg/SegmentationUtil');
var IndexedSegmentationUtil = require('geo/seg/IndexedSegmentationUtil');
var SegmentedObject3DWrapper = require('geo/seg/SegmentedObject3DWrapper');
var Index = require('ds/Index');
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
  this.debug = params.debug;
  this.segmentType = segmentType || 'surfaces';
  this.showNodeCallback = params.showNodeCallback;
  this.segmentLevels = params.segmentLevels || ['components', 'pieces', 'surfaces'];
  this.annotatedSegmentLevels = params.annotatedSegmentLevels;
  this.targetElementType = params.targetElementType;  // Specify whether the final segmentation once loaded should be 'triangles' or 'vertices'

  // Should we compute remapped segments?
  this.sortSegmentsByArea = params.sortSegmentsByArea;
  // Should we skip creation of unlabeled segment?
  this.skipUnlabeledSegment = params.skipUnlabeledSegment;
  // Should we skip creating of segmented object3d?
  this.skipSegmentedObject3D = params.skipSegmentedObject3D;
  // Should we try to create hierarchical from trimesh segmentation if we can?
  this.createTrimeshHierarchical = params.createTrimeshHierarchical;
  // If attributes should be stored
  this.keepAttributes = params.keepAttributes;
  // If materials should be kept
  this.keepMaterials = params.keepMaterials;
  this.useOutlineHighlight = (params.useOutlineHighlight != null)? params.useOutlineHighlight : false;
  this.highlightMaterial = Object3DUtil.getBasicMaterial('yellow');
  this.autoFitObbs = (params.autoFitObbs != null)? params.autoFitObbs : true;
  this.obbOptions = {
    useWireframe: true,
    lineWidth: 0.0002 * Constants.metersToVirtualUnit,
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
  if (params.obbOptions) {
    this.obbOptions = _.merge(this.obbOptions, params.obbOptions);
  }
  this.segmentOptions = {
    method: 'fwab-tri',
    adjFaceNormSimThreshold: 0.9,
    colorWeight: 0.5,
    segMinVerts: 10,
    includeFaceIndices: true,
    condenseFaceIndices: false
  };
  if (params.segmentOptions) {
    this.segmentOptions = _.merge(this.segmentOptions, params.segmentOptions);
  }
  // The model instance that we are segmenting
  this.modelInstance = null;
  // The original object that we are segmenting
  this.origObject3D = null;
  // The segmented object3d
  this.segmentedObject3D = null;
  this.segmentedObject3DHierarchical = null;
  this.obbsByLabelType = {};
  this.rawSegmentObject3DWrapper = null;
  this.rawSegmentColor = null;
  // Indexed segmentation (really should be moved out into some other class)
  this.indexedSegmentation = null;
  this.indexedSegmentationHier = null;
  this.indexedSegmentationAnnotation = null;
  // Options to show OBBS
  this._showOBBs = false;
  // The loaded segments
  this.segments = null;
  this.segmentGroups = null;
  this.objectIdToSegmentGroupIndex = null;
  // Remapped segments
  this.remappedSegments = null;
  // Use segment colors?
  this.useColorSequence = false;
  // Is segments visible?
  this.isSegmentsVisible = false;
  // Which segment is being shown
  this.iSegmentGroup = -1;        // TODO: make into private variable
  // How many segment groups are there?
  this.nSegmentGroups = 0;        // TODO: make into private variable
  // Is this a custom segmentation?
  this.isCustomSegmentation = false;
  // Original json for segment group and segmentation (should try to eliminate these fields)
  this.segmentationJson = null;
  this.segmentGroupsData = null;
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
  this.partMeshes = null;
  this.partsAnnId = undefined;
  this.segments = null;
  this.segmentGroups = null;
  this.objectIdToSegmentGroupIndex = null;
  this.rawSegmentObject3DWrapper = null;
  this.obbsByLabelType = {};
  this.segmentedObject3D = null;
  this.segmentedObject3DHierarchical = null;
  this.isSegmentsVisible = false;
  this.iSegmentGroup = -1;
  this.nSegmentGroups = 0;

  this.indexedSegmentation = null;
  this.indexedSegmentationHier = null;
  this.indexedSegmentationAnnotation = null;
  // Is this a custom segmentation?
  this.isCustomSegmentation = false;
  // Original json for segment group and segmentation (should try to eliminate these fields)
  this.segmentationJson = null;
  this.segmentGroupsData = null;
};

Object.defineProperty(Segments.prototype, 'modelId', {
  get: function () {
    return this.modelInstance? this.modelInstance.model.getFullID() : null;
  }
});

Object.defineProperty(Segments.prototype, 'selectedIndex', {
  get: function () {
    return this.partMeshes? (this.labelType === 'Label'? this.iSegment : this.iSegmentGroup ) : this.iSegmentGroup;
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
  get: function () { return this.labelType === 'Raw'; }
});

Object.defineProperty(Segments.prototype, 'rawSegmentObject3D', {
  get: function () {return this.rawSegmentObject3DWrapper? this.rawSegmentObject3DWrapper.rawSegmentObject3D : null; }
});

Object.defineProperty(Segments.prototype, 'obbsObject3D', {
  get: function () {return this.obbsByLabelType[this.labelType]? this.obbsByLabelType[this.labelType].obbsObject3D : null; }
});

Segments.prototype.__showSelectedSegmentedObject3D = function() {
  Object3DUtil.setVisible(this.rawSegmentObject3D, this.isSegmentsVisible && this.showRawSegments);
  Object3DUtil.setVisible(this.segmentedObject3D, this.isSegmentsVisible && !this.showRawSegments);
  _.each(this.obbsByLabelType, (obbsHelper, labelType) => {
    var visible = this.labelType === labelType && this.isSegmentsVisible && this.showOBBs;
    Object3DUtil.setVisible(obbsHelper.obbsObject3D, visible);
  });
};

Segments.prototype.isVisible = function () {
  return this.isSegmentsVisible;
};

Segments.prototype.getDefaultSegmentator = function() {
  var ObjectSegmentator = require('geo/ObjectSegmentator');
  var segmentator = new ObjectSegmentator();
  return segmentator;
};

Segments.prototype.__segmentationToMeshTriSegments = function(object3D) {
  var segments = [];
  var meshes = Object3DUtil.getMeshList(object3D);
  for (var i = 0; i < meshes.length; i++) {
    var m = meshes[i];
    var mIndex = m.userData.index;
    var triIndex = m.userData.faceIndices;
    var segIndex = segments.length;
    m.userData.segIndex = segIndex;
    m.userData.id = segIndex;
    segments.push({ segIndex: segIndex, meshIndex: mIndex, triIndex: triIndex });
  }
  return segments;
};

Segments.prototype.__segment = function(segmentator, opts, callback) {
  console.log('segmenting...');
  console.time('segmenting');
  var cloned = this.origObject3D.clone();
  cloned = segmentator.segmentObject(cloned, opts);
  if (this.debug) {
    console.log('Segments.__segment: segmented object', cloned);
  }
  var segs = this.__segmentationToMeshTriSegments(cloned);
  if (this.debug) {
    console.log('Segments.__segment: MeshTriSegments', segs);
  }
  console.timeEnd('segmenting');
  //this.segments = toSegments(cloned);
  this.segments = null;
  this.segmentedObject3D = cloned;
  this.segmentedObject3DHierarchical = cloned;
  this.obbsByLabelType = {};
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

Segments.prototype.ensureSegments = function(callback, autoSegmentCheck) {
  var scope = this;
  this.loadSegments(function(err, res) {
    if (res == null && typeof(err) === 'string' && err.startsWith('No segments')) {
      if (autoSegmentCheck) {
        autoSegmentCheck({
          autoSegment: () => {
            scope.__segment(scope.getDefaultSegmentator(), scope.segmentOptions, callback);
          },
          callback: callback
        });
      } else {
        scope.__segment(scope.getDefaultSegmentator(), scope.segmentOptions, callback);
      }
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
  var loadStarted = null;
  var wrappedCallback = function(err, results) {
    if (err /*&& err instanceof Error*/) {
      console.error(err);
    }
    if (loadStarted) {
      console.timeEnd(loadStarted);
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
  loadStarted = 'Segments.loadSegments';
  console.time(loadStarted);
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
    console.warn('Load custom segmentType: ' + this.segmentType);
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
Segments.prototype.__loadSegments = function(opts) {
  var callback = opts.callback;
  var segmentsInfo = opts.segmentsInfo;
  var segmentType = opts.segmentType || 'surfaces';
  var loader = new SegmentsLoader();
  if (!segmentsInfo) {
    segmentsInfo = loader.getSegmentInfo(this.modelInstance, segmentType);
    if (segmentsInfo && segmentsInfo.error) {
      console.warn(segmentsInfo.error);
      callback(segmentsInfo.error);
      return;
    }
  }
  var self = this;
  if (segmentsInfo) {
    this.dropMissingSegments = segmentsInfo.dropMissingSegments;
    loader.loadSegments(segmentsInfo, opts, function(err, res) {
      if (err) {
        callback(err);
      } else {
        var data = res.data;
        if (data.obbMatrixIsRowMajor == null && segmentsInfo.obbMatrixIsRowMajor != null) {
          data.obbMatrixIsRowMajor = segmentsInfo.obbMatrixIsRowMajor;  // handle row major OBB xform matrix
        }
        if (res.segmentGroupsData) {
          self.segmentGroupsData = res.segmentGroupsData;
        }
        if (segmentsInfo.partType != null) {
          // console.log('got', segmentsInfo.partType, data);
          if (segmentsInfo.partType === 'annotated-segment-triindices') {
            var SegmentedPartsLoader = require('articulations/SegmentedPartsLoader');
            var partsJson = res.data;
            var partsData = SegmentedPartsLoader.parseParts(partsJson);
            var partMeshes = SegmentedPartsLoader.segmentObject(self.origObject3D, partsData.parts, {
              skipUnlabeledSegment: self.skipUnlabeledSegment, format: 'triIndices'
            });
            self.__setSegmentsFromPartMeshes(callback, partsData, partMeshes);
          } else if (segmentsInfo.partType === 'annotated-segment-ids') {
            var SegmentedPartsLoader = require('articulations/SegmentedPartsLoader');
            var partsJson = res.annotation;
            var partsData = SegmentedPartsLoader.parseParts(partsJson);
            var partMeshes = SegmentedPartsLoader.segmentObject(self.origObject3D, partsData.parts, {
              skipUnlabeledSegment: self.skipUnlabeledSegment, format: 'segmentation', segmentation: res.data
            });
            partsData.segmentation = { metadata: res.data.metadata };
            self.partsData = partsData;
            self.__setSegmentsFromPartMeshes(callback, partsData, partMeshes);
          } else {
            console.error('Unsupported partType: '  + segmentsInfo.partType, segmentsInfo);
            callback('Unsupported partType: ' + segmentsInfo.partType);
          }
        } else if (res.format === 'indexedSegmentation') {
          self.__parseIndexedSegmentation(callback, res.field, res.data, res.annotation, res.segmentsInfo['name'] || segmentType);
        } else {
          var format = res.format;
          if (res.format === 'trimesh' && self.createTrimeshHierarchical) {
            format = 'trimeshHier';
          }
          self.__setSegments(callback, res.field, format, res.data, res.segmentsInfo);
        }
      }
    });
  } else {
    callback('Error loading segments: No segmentInfo');
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
  if (this.showRawSegments) {
    return this.rawSegmentObject3D;
  } else if (this.showOBBs && this.obbsObject3D) {
    return [this.segmentedObject3D, this.obbsObject3D];
  } else {
    return this.segmentedObject3D;
  }
};

Segments.prototype.getSegmentedObject = function () {
  if (this.showRawSegments) {
    return this.rawSegmentObject3D;
  } else {
    return this.segmentedObject3D;
  }
};

Segments.prototype.__storeElementAttributes = function(mesh, elementName, getElementCountFn, elements, name, value, defaultValue) {
  var data = mesh.userData;
  if (!data[elementName]) {
    data[elementName] = {};
  }
  if (!data[elementName][name]) {
    var elementCount = getElementCountFn(mesh);
    data[elementName][name] = [];
    for (var i = 0; i < elementCount; i++) {
      data[elementName][name].push(defaultValue);
    }
  }
  for (var v = 0; v < elements.length; v++) {
    var vi = elements[v];
    data[elementName][name][vi] = value;
  }
};

Segments.prototype.__storeVertexAttributes = function(mesh, vertices, name, value, defaultValue) {
  this.__storeElementAttributes(mesh, 'vertexAttributes',
    function(mesh) { return GeometryUtil.getGeometryVertexCount(mesh.geometry); },
    vertices, name, value, defaultValue);
};

Segments.prototype.__storeFaceAttributes = function(mesh, triangles, name, value, defaultValue) {
  this.__storeElementAttributes(mesh, 'faceAttributes',
    function(mesh) { return GeometryUtil.getGeometryFaceCount(mesh.geometry); },
    triangles, name, value, defaultValue);
};

Segments.prototype.__storeRawSegmentAttributes = function(mesh, segmentIndex, name, value, defaultValue) {
  var elements = mesh.userData.segToElemIndices[segmentIndex];
  if (elements) {
    if (mesh.userData.segElementType === SegmentationUtil.ELEMENT_TYPES.VERTICES) {
      this.__storeVertexAttributes(mesh, elements, name, value, defaultValue);
    } else if (mesh.userData.segElementType === SegmentationUtil.ELEMENT_TYPES.TRIANGLES) {
      this.__storeFaceAttributes(mesh, elements, name, value, defaultValue);
    } else {
      throw 'Unsupported segElementType: ' + mesh.userData.segElementType;
    }
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
  this.rawSegmentObject3DWrapper.colorAllSegments(color);
};

/**
 * Colors all raw segments original color
 */
Segments.prototype.colorRawSegmentsOriginal = function() {
  this.rawSegmentObject3DWrapper.colorSegmentsOriginal(this.origObject3D);
};

Segments.prototype.__addUnlabeledSegmentGroup = function(segGroups, segs) {
  var unkSegGroup = SegmentationUtil.findUnannotatedSegments(segGroups, segs, 'segments');
  if (unkSegGroup.segments.length) {
    var maxId = -1;
    for (var i = 0; i < segGroups.length; i++) {
      var segGroup = segGroups[i];
      maxId = Math.max(segGroup.id, maxId);
    }
    unkSegGroup.id = maxId + 1;
    segGroups.push(unkSegGroup);
  }
};

Segments.prototype.extractParts = function(partName, labels) {
  var meshes = Object3DUtil.getMeshList(this.origObject3D);
  // Assume just one geometry for now
  var geometry = GeometryUtil.extractParts(meshes[0].geometry,
    this.indexedSegmentation,
    { name: partName, labels: labels, elementOffset: 0});
  return new THREE.Mesh(geometry, meshes[0].material);
};

Segments.prototype.__parseIndexedSegmentation = function (callback, field, data, annotation, annName) {
  this.indexedSegmentation = data;
  // console.log('parseIndexedSegmentation', this.skipSegmentedObject3D);
  if (this.skipSegmentedObject3D) {
    this.__parseIndexedSegmentationIntoHierarchicalSegs(callback, field, data, annotation, annName);
  } else {
    this.__parseIndexedSegmentationIntoSegmentedObject3D(callback, field, data, annotation, annName);
  }
};

Segments.prototype.__parseIndexedSegmentationIntoHierarchicalSegs = function (callback, field, data, annotation, annName) {
  // var segmentations = data.segmentation[0];  // assume this is the finest
  // convert segmentations
  // console.log('__parseIndexedSegmentationIntoHierarchicalSegs', this.targetElementType);
  if (this.targetElementType != null) {
    data = this.__convertIndexedSeg(data, this.targetElementType, true);
    this.indexedSegmentation = data;
  }
  var indexedSegHier = this.__getIndexedSegHier(data);
  this.indexedSegmentationHier = indexedSegHier;
  // For now assume fine to coarse
  var fineSeg = indexedSegHier[0];
  // define segmentation hierarchy
  this.__setSegments(callback, null, 'segmentGroups',
    { segGroups: null, segIndices: fineSeg.index, elementType: fineSeg.elementType });
};

Segments.prototype.__parseIndexedSegmentationIntoSegmentedObject3D = function (callback, field, data, annotation, annName) {
  //console.log(data);
  //console.log(annotation);
  // TODO: update for newer versions where elementType is stored in the segmentation
  data = this.__convertIndexedSeg(data, SegmentationUtil.ELEMENT_TYPES.TRIANGLES, false);
  if (data.elementType === SegmentationUtil.ELEMENT_TYPES.TRIANGLES) {
    var meshes = Object3DUtil.getMeshList(this.origObject3D);
    var meshIndices = null;
    var segmentationsByName = _.keyBy(data.segmentation, 'name');
    var ignoreList = ['faces', 'materials', 'meshes'];
    //var meshIndex = segmentationsByName['meshes'].index;
    var segmentations = {};
    for (var i = 0; i < data.segmentation.length; i++) {
      var segmentation = data.segmentation[i];
      if (ignoreList.indexOf(segmentation.name) >= 0) continue; // ignore
      segmentations[segmentation.name] = SegmentationUtil.convertTriIndexedSegmentationToMeshTriSegments(
        meshes, segmentation.index, meshIndices);
    }
    var segmentLevels = data.hierarchies? data.hierarchies[0].levels.slice().reverse() : this.segmentLevels;
    var info = IndexedSegmentationUtil.indexedSegmentationToHierarchicalSegments(this.origObject3D,
      data.elementCount, segmentationsByName, meshIndices, segmentLevels, { keepMaterials: this.keepMaterials });
    if (annotation) {
      // Augment original indexSegmentation with annotations
      // Figure out corresponding faceIndices
      //console.log(info);
      // Map from partId to annotation label index
      var annotatedParts = annotation.parts;
      var partIdToAnnIndex = {};
      for (var i = 0; i < annotatedParts.length; i++) {
        var ann = annotatedParts[i];
        var partIds = (typeof(ann.partId) === 'string')? ann.partId.split(',') : ann.partId;
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
        info = IndexedSegmentationUtil.indexedSegmentationToHierarchicalSegments(this.origObject3D,
          data.elementCount, segmentationsByName, meshIndices, this.annotatedSegmentLevels, { keepMaterials: this.keepMaterials });
      }
    }
    console.log('got info', info);
    this.segmentedObject3DHierarchical = info.segmented;
    this.__setSegments(callback, segmentLevels[segmentLevels.length-1], 'trimesh', segmentations);
  } else {
    callback('Unsupported element type: ' + data.elementType);
  }
};

Segments.prototype.__getFineToCoarseSegmentations = function(indexedSeg, hierIndex) {
  hierIndex = hierIndex || 0;
  var hier = indexedSeg.hierarchies? indexedSeg.hierarchies[hierIndex] : null;
  var segmentations;
  if (hier) {
    var segmByName = _.keyBy(indexedSeg.segmentation, 'name');
    segmentations = hier.levels.map(l => segmByName[l]);
  } else {
    // No hierarchy specified, assume fine to coarse
    segmentations = indexedSeg.segmentation;
  }
  return segmentations;
};

Segments.prototype.__getIndexedSegHier = function(indexedSeg, hierIndex) {
  var segmentations = this.__getFineToCoarseSegmentations(indexedSeg, hierIndex);
  var hierSegs = [];
  for (var i = 0; i < segmentations.length; i++) {
    var segm = segmentations[i];
    var segmElemType = segm.elementType;
    var targetElementType = (i > 0)? segmentations[i-1].name : segm.elementType;
    var targetIndices = segm.index;
    if (i > 0 && targetElementType !== segmElemType) {
      // rewrite indices in term of last level
      var prevSegmElmeType = segmentations[i-1].elementType;
      if (segmElemType === prevSegmElmeType) {
        var prevSegIndices = segmentations[i-1].index;
        var segIndices = segm.index;
        var converted = [];
        var warned = 0;
        for (var j = 0; j < segIndices.length; j++) {
          var segj = segIndices[j];
          var prevsegj = prevSegIndices[j];
          if (converted[prevsegj] != null) {
            if (converted[prevsegj] !== segj) {
              if (warned < 10) {
                console.warn('Segmentation ' + segmentations[i - 1].name + ', segment ' + prevsegj +
                  ' corresponds to multiple coarse segments: ' + segm.name + '[' + converted[prevsegj] + ',' + segj + ']' +
                  ' at ' + segm.elementType + ' ' + j);
                warned++;
              }
            }
          } else {
            converted[prevsegj] = segj;
          }
        }
        var noCorrespondences = [];
        for (var j = 0; j < converted.length; j++) {
          if (converted[j] == null) {
            noCorrespondences.push(j);
          }
        }
        if (noCorrespondences.length) {
          console.warn('Segmentation ' + segmentations[i-1].name + ' has ' + noCorrespondences.length +
            ' segments that does not corresponds to any coarse segments: ' + segm.name, noCorrespondences);
        }
        targetIndices = converted;
      } else {
        throw 'Error creating hierarchy from indexedSegmentation for ' + segm.name +
        ': Cannot convert segmentType: ' + segmElemType + ' to ' + targetElementType;
      }
    }
    hierSegs[i] = {
      name: segm.name,
      elementType: targetElementType,
      index: targetIndices,
      segToElements: SegmentationUtil.groupElemToSegIndicesBySeg(targetIndices)
    };
    if (segm.origToContiguousIndex) {
      hierSegs[i].origToContiguousIndex = segm.origToContiguousIndex;
    }
  }
  return hierSegs;
};

Segments.prototype.__convertIndexedSeg = function(indexedSeg, targetElementType, reindex) {
  var segmentations = indexedSeg.segmentation;
  for (var i = 0; i < segmentations.length; i++) {
    var segm = segmentations[i];
    var elemType = (segm.elementType == null)? indexedSeg.elementType : segm.elementType;
    if (elemType !== targetElementType) {
      if (elemType === SegmentationUtil.ELEMENT_TYPES.VERTICES || elemType === SegmentationUtil.ELEMENT_TYPES.TRIANGLES) {
        segm.index = this.__convertSegIndices(segm.index, elemType, targetElementType);
      }
    }
    segm.elementType = targetElementType;
    if (reindex) {
      var reindexed = new Index();
      segm.index = _.map(segm.index, function(j) {
        return reindexed.indexOf(j, true);
      });
      segm.origToContiguousIndex = reindexed;
    }
  }
  if (indexedSeg.elementType !== targetElementType) {
    indexedSeg.elementType = targetElementType;
    indexedSeg.elementCount = segmentations[0].index.length;
  }
  // console.log('converted indexedSeg', indexedSeg);
  return indexedSeg;
};

Segments.prototype.__convertSegIndices = function(inputElemToSegIndices, inputElementType, targetElementType) {
  var elementToSegIndices = null;
  if (this.debug) {
    console.log('convert indices from ' + inputElementType + ' to ' + targetElementType);
  }
  if (targetElementType === SegmentationUtil.ELEMENT_TYPES.VERTICES) {
    if (inputElementType === SegmentationUtil.ELEMENT_TYPES.VERTICES) {
      // vert to vert
      var origVertToSegIndices = inputElemToSegIndices;
      elementToSegIndices = SegmentationUtil.remapVertToSegIndicesFromOriginalVertices(this.origObject3D, origVertToSegIndices);
    } else {
      // face to vert
      var origFaceToSegIndices = inputElemToSegIndices;
      elementToSegIndices = SegmentationUtil.convertFaceToSegIndices2VertToSegIndices(this.origObject3D, origFaceToSegIndices);
    }
  } else {
    if (inputElementType === SegmentationUtil.ELEMENT_TYPES.VERTICES) {
      // vert to face
      var origVertToSegIndices = inputElemToSegIndices;
      elementToSegIndices = SegmentationUtil.remapVertToSegIndicesFromOriginalVertices(this.origObject3D, origVertToSegIndices);
      elementToSegIndices = SegmentationUtil.convertVertToSegIndices2FaceToSegIndices(this.origObject3D, elementToSegIndices);
    } else {
      // face to face (is there a remap from original faces?)
      elementToSegIndices = inputElemToSegIndices;
    }
  }
  return elementToSegIndices;
};

Segments.prototype.__setSegmentsFromPartMeshes = function(callback, partsData, partMeshes, segmentedObject3D) {
  this.isCustomSegmentation = false;
  this.segmentationJson = null;
  this.segmentedObject3D = segmentedObject3D;
  if (this.segmentedObject3D == null) {
    this.segmentedObject3D = new THREE.Group();
    for (var i = 0; i < partMeshes.length; i++) {
      if (partMeshes[i]) {
        this.segmentedObject3D.add(partMeshes[i]);
      }
    }
    this.segmentedObject3D.userData.segIndexInfo = { type: 'segment', field: 'index' };
  }
  this.partsAnnId = partsData.annId;
  this.partMeshes = partMeshes;
  this.segments = partMeshes.map(x => x? x.userData : null);
  for (var i = 0; i < this.segments.length; i++) {
    var seg = this.segments[i];
    if (seg) {
      seg.index = i;
      var partInfo = partMeshes[i].userData.partInfo;
      if (partInfo) {
        seg.partId = partInfo.partId;
        seg.objectId = partInfo.objectId;
        seg.obb = partInfo.obb;
      }
    }
  }
  var grouped = _.groupBy(this.segments.filter(x => x), 'objectId');
  var objectIdToSegGroupIdx = new Index();
  var unknownIdx = objectIdToSegGroupIdx.indexOf('unknown', true);
  this.objectIdToSegmentGroupIndex = objectIdToSegGroupIdx;
  this.segmentGroups = [];
  _.each(grouped, (g, objectId) => {
    var index = (objectId != undefined && objectId !== 'undefined')? objectIdToSegGroupIdx.indexOf(objectId, true) : unknownIdx;
    var partIndices = g.map(g => g.index );
    this.segmentGroups[index] = {
      index: index,
      objectId: objectId,
      label: g[0].label.split(':')[0],
      parts: g,
      segments: partIndices
//      partIndices: partIndices
//      obb: this.__fitOBB('partMeshes', partIndices, )
    };
  });
  this.nSegmentGroups = this.segmentGroups.length;
  this.ensureOBBs('Label', { createObbMeshes: true, autoFitObbs: this.autoFitObbs, obbMatrixIsRowMajor: false });
  this.ensureOBBs('Object', { createObbMeshes: true, autoFitObbs: this.autoFitObbs, obbMatrixIsRowMajor: false });
  if (this.debug) {
    console.log('got parts', partsData, partMeshes, this.segmentedObject3D, this.segmentGroups);
  }
  this.rawSegmentObject3DWrapper = null;
  this.remappedSegments = null;
  //this.remappedSegments = this.remapSegments(this.sortSegmentsByArea, false);
  this.__showSelectedSegmentedObject3D();
  if (this.showNodeCallback) {
    this.showNodeCallback(this.segmentedObject3D);
    this.showNodeCallback(this.getOBBHelperForLabelType('Label').obbsObject3D);
    this.showNodeCallback(this.getOBBHelperForLabelType('Object').obbsObject3D);
  }
//  callback(null, {type: 'parts', data: partMeshes});
  callback(null, {type: 'segmentGroups', data: this.segmentGroups});
  this.Publish('segmentsUpdated', this);
};

Segments.prototype.__setSegments = function (callback, field, format, data, segmentsInfo) {
  this.isCustomSegmentation = false;
  this.segmentationJson = null;
  if (format === 'trimesh') {
    if (this.targetElementType === SegmentationUtil.ELEMENT_TYPES.VERTICES) {
      console.error('Cannot convert from trimesh segmentation to vertex based segmentation');
    }
    console.time('setSegments');
    this.segments = (field) ? data[field] : data;
    var metadata = data.metadata;
    if (metadata && metadata.condenseFaceIndices) {
      this.segments = this.segments.map(seg => {
        const copy = Object.assign({}, seg);
        copy.triIndex = _.fromCondensedIndices(seg.triIndex);
        return copy;
      });
    }
    if (segmentsInfo && segmentsInfo.useOneMaterialPerMesh) {
      var origMeshes = Object3DUtil.getMeshList(this.origObject3D);
      this.segments = SegmentationUtil.convertMaterialMeshTrisToMeshTris(this.segments, origMeshes);
    }
    this.segmentedObject3D = SegmentationUtil.remeshObjectUsingMeshTriSegments(this.origObject3D, this.segments);
    this.segmentedObject3D.userData.segIndexInfo = { type: 'segment', field: 'index' };
    this.obbsByLabelType = {};
    this.rawSegmentObject3DWrapper = null;
    this.remappedSegments = this.remapSegments(this.sortSegmentsByArea, false);
    this.nSegmentGroups = this.remappedSegments.length;
    if (this.showNodeCallback) {
      this.showNodeCallback(this.segmentedObject3D);
    }
    console.timeEnd('setSegments');
    callback(null, {type: 'segments', data: this.segments});
  } else if (format === 'trimeshHier') {
    if (this.targetElementType === SegmentationUtil.ELEMENT_TYPES.VERTICES) {
      console.error('Cannot convert from trimeshHier segmentation to vertex based segmentation');
    }
    console.time('setSegments');
    this.segments = (field) ? data[field] : data;
    var metadata = data.metadata;
    if (metadata && metadata.condenseFaceIndices) {
      this.segments = this.segments.map(seg => {
        const copy = Object.assign({}, seg);
        copy.triIndex = _.fromCondensedIndices(seg.triIndex);
        return copy;
      });
    }
    var segOpts = {};
    if (segmentsInfo && segmentsInfo.useOneMaterialPerMesh) {
      var origMeshes = Object3DUtil.getMeshList(this.origObject3D);
      this.segments = SegmentationUtil.convertMaterialMeshTrisToMeshTris(this.segments, origMeshes);
    }
    if (segmentsInfo && segmentsInfo.segIndexField) {
      segOpts.segIndexField = segmentsInfo.segIndexField;
    }
    var segmented = this.getDefaultSegmentator().applyTriMeshSegmentation(this.origObject3D.clone(), this.segments, segOpts);
    this.segmentedObject3D = segmented;
    this.segmentedObject3D.userData.segIndexInfo = { type: 'segment', field: 'index' };
    this.segmentedObject3DHierarchical = segmented;
    this.obbsByLabelType = {};
    this.rawSegmentObject3DWrapper = null;
    this.nSegmentGroups = 0; //this.segments.length;
    this.segmentationJson = this.segments;
    if (this.showNodeCallback) {
      this.showNodeCallback(this.segmentedObject3D);
    }
    console.timeEnd('setSegments');
    callback(null, { type: 'segments', data: this.segments });
  } else if (format === 'segmentGroups') {
    var elementType = data['elementType'];
    elementType = SegmentationUtil.getCanonicalizedElementType(elementType, SegmentationUtil.ELEMENT_TYPES.VERTICES,
      'Segmentation element type not specified for segmentGroups');
    if (elementType === SegmentationUtil.ELEMENT_TYPES.VERTICES || elementType === SegmentationUtil.ELEMENT_TYPES.TRIANGLES) {
      console.time('setSegments');
      this.segments = null;
      var targetElementType = this.targetElementType || elementType; // default to input element type if target not specified
      var elementToSegIndices = this.__convertSegIndices(data['segIndices'], elementType, targetElementType);
      this.rawSegmentObject3DWrapper = new SegmentedObject3DWrapper(this.origObject3D, targetElementType, elementToSegIndices, this.rawSegmentColor);
      var segToElemIndices = this.rawSegmentObject3DWrapper.segToElemIndices;
      this.segmentGroups = data['segGroups'] || [];
      this.objectIdToSegmentGroupIndex = null;
      //console.log(this.segmentGroups);
      // convert indices that are mistakenly encoded as strings (why do we need this?)
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
        this.__addUnlabeledSegmentGroup(this.segmentGroups, segToElemIndices);
      }
      if (!this.skipSegmentedObject3D) {
        var segToTriIndices = this.rawSegmentObject3DWrapper.getSegToTriIndices(true);
        this.segmentedObject3D = SegmentationUtil.remeshObjectUsingSegmentGroups(this.origObject3D, this.segmentGroups, segToTriIndices,
          this.dropMissingSegments);
        this.segmentedObject3D.userData.segIndexInfo = { type: 'segmentGroup', field: 'index' };
        this.ensureOBBs('Object', { createObbMeshes: true, autoFitObbs: this.autoFitObbs, obbMatrixIsRowMajor: data.obbMatrixIsRowMajor });
        this.remappedSegments = this.remapSegments(this.sortSegmentsByArea, false);
        this.nSegmentGroups = this.remappedSegments.length;
        this.__showSelectedSegmentedObject3D();
        if (this.showNodeCallback) {
          this.showNodeCallback(this.segmentedObject3D);
          this.showNodeCallback(this.getOBBHelperForLabelType('Object').obbsObject3D);
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

Segments.prototype.__getOBBFitterForInputType = function(inputType, origObject3D, defaultFitOBBOptions) {
  var scope = this;
  defaultFitOBBOptions = _.defaults(Object.create(null), defaultFitOBBOptions || {}, this.obbOptions.fitOBBOptions);
  var inverseMatrix = Object3DUtil.getModelMatrixWorldInverse(origObject3D);
  var obbFitter = function (indices, fitOBBOptions) {
    fitOBBOptions = fitOBBOptions? _.defaults(Object.create(null), fitOBBOptions, defaultFitOBBOptions) : defaultFitOBBOptions;
    console.log('fitOBB', inputType, indices, fitOBBOptions);
    var obb = scope.__fitOBB(inputType, indices, fitOBBOptions);
    if (obb) {
      obb.applyMatrix4(inverseMatrix);
    }
    return obb;
  };
  return obbFitter;
};

Segments.prototype.ensureSegmentGroupObbInfo = function() {
  var segs = this.segmentGroups;
  var obbFitter = this.__getOBBFitterForInputType('segmentGroups', this.origObject3D);
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

Segments.prototype.__updateObbsLabelIndex = function(labelType, labels, labelData) {
  // Hack to get labeIndex associated with segments/segmentGroups;
  if (this.obbsByLabelType[labelType]) {
    var obbUserData = this.obbsByLabelType[labelType].obbUserData;
    var obbComps = this.obbsByLabelType[labelType].components;
    for (var i = 0; i < obbComps.length; i++) {
      if (obbComps[i]) {
        delete obbComps[i].labelIndex;
      }
    }
    if (labelData && labelData.length) {
      for (var i = 0; i < labelData.length; i++) {
        if (labelData[i]) {
          const compIndices = labelData[i][obbUserData.type];
          if (compIndices) {
            for (var j = 0; j < compIndices.length; j++) {
              obbComps[compIndices[j]].labelIndex = i;
            }
          }
        }
      }
    }
  }
};

Segments.prototype.getOBBHelperForLabelType = function(labelType, create) {
  if (!this.obbsByLabelType[labelType] && create) {
    // TODO: use segmentGroups or something else based on labelType
    var obbFitterOptions, components;
    var segIndexInfo = this.segmentedObject3D.userData.segIndexInfo;
    var idField = null;
    if (this.partMeshes) {
      if (labelType === 'Label') {
        obbFitterOptions = { inputType: 'partMeshes', componentToInputIndices: (comp) => [comp.index] };
        components = this.segments;
        idField = 'partId';
      } else if (labelType === 'Object') {
        obbFitterOptions = { inputType: 'partMeshes', componentToInputIndices: (comp) => comp.segments };
        components = this.segmentGroups;
        segIndexInfo = { type: 'segmentGroup', field: 'index' };
        idField = 'objectId';
      }
    } else {
      if (labelType === 'Object') {
        obbFitterOptions = { inputType: 'segments', componentToInputIndices: (comp) => comp.segments };
        components = this.segmentGroups;
      }
    }
    var indexedObbFitter = this.__getOBBFitterForInputType(obbFitterOptions.inputType, this.origObject3D, {});
    var obbFitter = function(component, fitObbOptions) {
      return indexedObbFitter(obbFitterOptions.componentToInputIndices(component), fitObbOptions);
    };
    this.obbsByLabelType[labelType] = new MultiOBBHelper(this.origObject3D, components, this.obbOptions, obbFitter, segIndexInfo, idField);
  }
  return this.obbsByLabelType[labelType];
};

Segments.prototype.getOBBHelpers = function(labelType) {
  if (labelType) {
    this.getOBBHelperForLabelType(labelType, false);
  } else {
    return this.obbsByLabelType;
  }
};

/**
 * Use specified obbs for segmentGroups
 * @param labelType {string}
 * @param obbs
 * @param [options.obbMatrixIsRowMajor] {boolean} If obb is a plain JSON object, whether the basis matrix is specified in row major order
 * @param [options.autoFitObbs] {boolean} Whether to autoFit obbs if obb for segment is missing
 * @param [options.createObbMeshes] {boolean} Whether to create the obb mesh for visualization
 */
Segments.prototype.useOBBs = function(labelType, obbs, options) {
  var obbsHelper = this.getOBBHelperForLabelType(labelType, true);
  obbsHelper.useOBBs(obbs, options);
};

Segments.prototype.ensureOBBs = function(labelType, options) {
  var obbsHelper = this.getOBBHelperForLabelType(labelType, true);
  obbsHelper.ensureOBBs(options);
};

/**
 * Color segments
 * @param segmentedObjects {Array<Object3D>} objects to color
 * @param type {string} Type of coloring
 * @param labelToIdxFn {Map<string,int>|function(string):int} Mapping from label to index
 * @param [getLabelFn] {function(string): string} Remapping of labels
 * @param [getMaterialFn] {function(int,THREE.color): THREE.Material} Material to use for segment
 * @param [defaultIdx] {int} Default index
 * @param [sortByIdx] {boolean} Whether to sort final labels by index
 * @returns {{}}
 * @private
 */
Segments.prototype.__colorLabeledSegments = function (segmentedObjects, type, labelToIdxFn, getLabelFn, getMaterialFn, defaultIdx, sortByIdx) {
  // NOTE: this function does two things
  //  determines the set of labels and colors to use and
  //  colors the segments a specific color
  if (segmentedObjects && !Array.isArray(segmentedObjects)) {
    segmentedObjects = [segmentedObjects];
  }

  var labelColorIndex = {};  // label to color index
  var labels = [];           // array of labels (string only)
                             // this will used to populate the label panel
                             // note: indices into this may differ from indices into segment groups or segments
  var labelData = [];        // array of objects with information associated with each label
  var materials = {};
  getMaterialFn = getMaterialFn || Object3DUtil.getSimpleFalseColorMaterial;
  defaultIdx = defaultIdx || 0;

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

  function saveLabel(label, initialLabelDatum, segment_data, segIndexInfo) {
    // Push label unto array of labels
    var li = labels.indexOf(label);
    if (li < 0) {
      li = labels.length;
      labels.push(label);
    }
    // Make sure there is an datum associated with this label
    var segLabelDatum = labelData[li];
    if (!segLabelDatum) {
      segLabelDatum = initialLabelDatum;
      labelData[li] = segLabelDatum;
    }
    // Update segment indices associated with this label
    if (!segLabelDatum[segIndexInfo.type]) {
      segLabelDatum[segIndexInfo.type] = [];
    }
    var segIndices = segLabelDatum[segIndexInfo.type];
    // console.log('got segIndices ', segIndices, segIndexInfo.type, segLabelData);
    if (segIndices.indexOf(segment_data[segIndexInfo.field]) < 0) {
      segIndices.push(segment_data[segIndexInfo.field]);
    }
    return li;
  }

  function getColorLabel(segment_data, segIndexInfo) {
    var colorIdx = 0;
    var data = segment_data;
    var label;
    var labelDatum = {};
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
        labelDatum.objectId = data.objectId;
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
    var labelIndex;
    if (label) {
      labelDatum.material = materials[colorIdx];
      labelIndex = saveLabel(label, labelDatum, segment_data, segIndexInfo);
    }
    return { colorIdx: colorIdx, label: label, labelIndex: labelIndex, material: materials[colorIdx] };
  }

  var keepAttributes = this.keepAttributes;
  if (segmentedObjects && segmentedObjects.length) {
    segmentedObjects.forEach((segmentedObject) => {
      var segIndexInfo = segmentedObject.userData.segIndexInfo || { type: 'segmentGroup', field: 'index' };
      for (var i = 0; i < segmentedObject.children.length; i++) {
        var seg = segmentedObject.children[i];
        var data = seg.userData;
        var colorLabel = getColorLabel(data, segIndexInfo);
        if (this.debug) {
          console.log('color segment', i, colorLabel, data);
        }
        if (keepAttributes) {
          if (!data.attributes) {
            data.attributes = {};
          }
          data.attributes[type] = colorLabel.colorIdx;
        }
        // Color our segment!!!
        Object3DUtil.setMaterial(seg, colorLabel.material, Object3DUtil.MaterialsAll, false, function (mesh) {
          return !mesh.userData.isAxis && !mesh.userData.isOrientationArrow;
        });
      }
    });
  } else {
    // TODO: is this code path taken?
    var segmentedObject = this.rawSegmentObject3D;
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
        console.error('Cannot color segments if there are no segment groups');
      }
    }
  }
  if (sortByIdx && labels.length > 1) {
    var zipped = _.zip(labels, labelData);
    zipped = _.sortBy(zipped, function(p) { return indexOf(p[0]); });
    var unzipped = _.unzip(zipped);
    //console.log('unzipped', unzipped);
    labels = unzipped[0];
    labelData = unzipped[1];
  }
  //console.log(labelColorIndex);
  return { labelColorIndex: labelColorIndex, labels: labels, labelData: labelData };
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
  this.labelType = type;
  this.labels = [];
  this.labelData = [];
  if (type === 'Normal' || type === 'Neutral' || type === 'Raw') {
    if (type === 'Normal') {
      Object3DUtil.setMaterial(this.getSegmentedObject(), new THREE.MeshNormalMaterial());
    } else if (type === 'Neutral') {
      Object3DUtil.setMaterial(this.getSegmentedObject(), Object3DUtil.getSimpleFalseColorMaterial(0, neutralColor));
    } else if (type === 'Raw') {
      // Nothing to do (default)
    }
  } else {
    var segmentedObjects = this.getSegmentedObjects();
    if (Array.isArray(segmentedObjects)) {
      segmentedObjects = segmentedObjects.filter(x => x);
    }
    var labeledInfo = this.__colorLabeledSegments(segmentedObjects, type, labelToIdxFn, getLabelFn, getMaterialFn, defaultIdx, sortByIdx);
    this.labels = labeledInfo.labels;
    this.labelData = labeledInfo.labelData;
    this.__updateObbsLabelIndex(this.labelType, this.labels, this.labelData);
  }
  this.__showSelectedSegmentedObject3D();
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

Segments.prototype.setSelectedLabel = function (labelInfo) {
  var slabelData = this.labelData[labelInfo.index];
  if (slabelData) {
    var type = this.getSegmentedObject().userData.segIndexInfo.type;
    this.__showSegments(slabelData, slabelData[type], this.useColorSequence ? slabelData.material : null);
  }
};

Segments.prototype.__showSegment = function (index) {
  this.__showSegments(null,[index]);
};

Segments.prototype.__setSelectedIndices = function(labelDatum, indices) {
  this.iSegment = -1;
  this.iSegmentGroup = -1;
  var segmentIndices = indices;
  var segmentGroupIndices = null;
  if (this.partMeshes) {
    // segments are labels
    // segmentGroups are objects
    if (indices.length === 1) {
      this.iSegment = indices[0];
    }
    if (this.labelType === 'Label') {
    } else if (this.labelType === 'Object') {
      this.iSegmentGroup = labelDatum.segmentGroup[0];
      segmentGroupIndices = labelDatum.segmentGroup;
    }
  } else {
    if (indices.length === 1) {
      this.iSegmentGroup = indices[0];
    }
  }
  return { segmentIndices: segmentIndices, segmentGroupIndices: segmentGroupIndices };
};

/**
 *
 * @param labelDatum {Object} data associated with label
 * @param indices {int[]} segment indices
 * @param [material] {THREE.Material}
 * @private
 */
Segments.prototype.__showSegments = function (labelDatum, indices, material) {
  var selected = this.__setSelectedIndices(labelDatum, indices);

  // handle segmentIndices
  var segmentIndices = this.__getRemappedSegmentIndices(selected.segmentIndices);
  var segmentedObjects = this.getSegmentedObjects();
  // console.log('__showSegments', labelDatum, indices, selected);
  var segmentedObject = this.getSegmentedObject();
  Object3DUtil.highlightMeshes(segmentedObject, segmentIndices, material, this.useColorSequence, this.useOutlineHighlight);
  var obbsObject3D = this.obbsObject3D;
  if (obbsObject3D) {
    var obbIndices = (selected.segmentGroupIndices != null)? selected.segmentGroupIndices : segmentIndices;
    Object3DUtil.highlightMeshes(obbsObject3D, obbIndices, this.highlightMaterial, this.useColorSequence, false);
  }

  // Show our colored object
  this.isSegmentsVisible = true;
  //Object3DUtil.setVisible(this.origObject3D, false);
  Object3DUtil.setVisible(segmentedObjects, true);

};

Segments.prototype.__getRemappedSegmentIndices = function(indices) {
  if (this.remappedSegments) {
    var remappedIndices = [];
    for (var i = 0; i < indices.length; i++) {
      var index = indices[i];
      remappedIndices.push.apply(remappedIndices, this.remappedSegments[index].segmentIndices);
    }
    return remappedIndices;
  } else {
    return indices;
  }
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

Segments.prototype.segmentIsContainedInOBB = function (segmentIndex, obb) {
  return this.rawSegmentObject3DWrapper.segmentIsContainedInOBB(segmentIndex, obb);
};

Segments.prototype.fitOBB = function(type, indices) {
  return this.__fitOBB(type, indices, {});
};


Segments.prototype.__fitOBB = function (type, indices, fitOBBOptions) {
  // TODO: update the name 'Raw' to 'segments'
  if (type === 'segments' || type === 'Raw') {
    var points = this.getRawSegmentVertices(indices);
    return this.__fitOBBToPoints(points, fitOBBOptions);
  } else if (type === 'partMeshes') {
    var parts = this.partMeshes.filter(child => indices.indexOf(child.userData.index) >= 0);
    return this.__fitOBBToObjects(parts, fitOBBOptions);
  } else if (type === 'vertices') {
    var points = GeometryUtil.getVerticesForVertIndices(this.rawSegmentObject3D, indices);
    return this.__fitOBBToPoints(points, fitOBBOptions);
  } else if (type === 'triangles') {
    var points = GeometryUtil.getVerticesForTriIndices(this.rawSegmentObject3D, indices);
    return this.__fitOBBToPoints(points, fitOBBOptions);
  } else {
    console.error('Segments.fitOBB: unsupported type ' + type);
  }
};

Segments.prototype.__fitOBBToObjects = function(object3Ds, fitOBBOptions) {
  if (object3Ds && object3Ds.length) {
    var obb = OBBFitter.fitObjectOBB(object3Ds, fitOBBOptions);
    obb = SemanticOBB.asSemanticOBB(obb);
    if (fitOBBOptions.up) {
      obb.up = fitOBBOptions.up;
    }
    if (fitOBBOptions.front) {
      obb.front = fitOBBOptions.front;
    }
    return obb;
  } else {
    console.warn('Segments.fitOBB: no object3Ds');
    return null;
  }
};

Segments.prototype.__fitOBBToPoints = function(points, fitOBBOptions) {
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
};

Segments.prototype.exportRaw = function(exporter, name, cb) {
  var target = this.rawSegmentObject3D;
  target.updateMatrixWorld();
  var worldToModelTransform = new THREE.Matrix4();
  worldToModelTransform.copy(target.matrixWorld).invert();
  exporter.export(target, {transform: worldToModelTransform, name: name, callback: cb});
};

Segments.prototype.export = function(exporter, name, cb) {
  var target = this.getSegmentedObject() || this.rawSegmentObject3D;
  target.updateMatrixWorld();
  var worldToModelTransform = new THREE.Matrix4();
  worldToModelTransform.copy(target.matrixWorld).invert();
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
