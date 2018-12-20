var async = require('async');
var AssetGroups = require('assets/AssetGroups');
var BVH = require('geo/BVH');
var Constants = require('Constants');
var Colors = require('util/Colors');
var GeometryUtil = require('geo/GeometryUtil');
var ImageUtil = require('util/ImageUtil');
var Index = require('ds/Index');
var MeshHelpers = require('geo/MeshHelpers');
var MeshSampling = require('geo/MeshSampling');
var Object3DUtil = require('geo/Object3DUtil');
var VPTreeFactory = require('ds/VPTree');
var RNG = require('math/RNG');
var SceneStatistics = require('ssg/SceneStatistics');
var _ = require('util/util');

/**
 * Utility functions for working with scenes
 * @module SceneUtil
 */
var SceneUtil = {};

function getMaterial(idx, color, palette) {
  return Object3DUtil.getSimpleFalseColorMaterial(idx, color, palette);
}

function getIndexMaterial(idx, color, palette) {
  // Encode index somewhere
  var mat = new THREE.MeshBasicMaterial({
    name: "index-" + idx,
    color: color || new THREE.Color(idx)
  });
  return mat;
}

function colorObj(obj, material, opts) {
  opts = opts || {};
  var setMaterialMode = (Object3DUtil.getModelInstance(obj) != null)? Object3DUtil.MaterialsAllNonRecursive : Object3DUtil.MaterialsAll;
  Object3DUtil.setMaterial(obj, material, setMaterialMode, true, function(node, m) {
    if (!opts.isTemporary) {
      node.__colorMaterial = m;
    }
    return true;
  });
}

SceneUtil.revertMaterial = function(obj, fullRevert) {
  var nonrecursive = (Object3DUtil.getModelInstance(obj) != null);
  Object3DUtil.revertMaterials(obj, nonrecursive, fullRevert);
};

SceneUtil.recolorObject = function(object3D) {
  var setMaterialMode = (Object3DUtil.getModelInstance(object3D) != null) ? Object3DUtil.MaterialsAllNonRecursive : Object3DUtil.MaterialsAll;
  Object3DUtil.setMaterial(object3D, function(node) {
    return node.__colorMaterial;
  }, setMaterialMode, true);
};

SceneUtil.revertMaterials = function(sceneState) {
  for (var i = 0; i < sceneState.modelInstances.length; i++) {
    var modelInstance = sceneState.modelInstances[i];
    SceneUtil.revertMaterial(modelInstance.object3D);
  }
  for (var i = 0; i < sceneState.extraObjects.length; i++) {
    var object = sceneState.extraObjects[i];
    SceneUtil.revertMaterial(object);
  }
};

// TODO: deprecate category
SceneUtil.ColorByOptions = [
 'objectId', 'objectMaterialId', 'objectPartId', 'objectPartLabel',
 'modelId', 'category', 'objectType', 'roomId', 'roomType',
 'materialId', 'material', 'texture',
 'depth', 'normal', 'wireframe', 'color'];

/**
 * Recolors a scene
 * @function colorScene
 * @static
 * @param sceneState {scene.SceneState}
 * @param colorBy {string} How to recolor a scene.
 * <ul>
 *   <li>modelId: recolors by model id - objects with the same model id will be the same color</li>
 *   <li>materialId: recolors by material id - parts with different materials will be different colors</li>
 *   <li>material: recolors by material - parts with same materials will be the same color</li>
 *   <li>texture: recolors by texture - parts with textured materials will be different colors</li>
 *   <li>objectType (or category): recolors by objectType - objects with the same object type/category will be the same color</li>
 *   <li>roomId: recolors by room id - different rooms will have different colors</li>
 *   <li>roomType: recolors by room type - rooms with the same room type will have the same color</li>
 *   <li>objectId: recolors by object id - each object instance will have a different color</li>
 *   <li>objectMaterialId: recolors by object, then materialId - each object part with different material will have a different color</li>
 *   <li>objectPartId: recolors by object, then partId - each annotated object part will have a different color</li>
 *   <li>objectPartLabel: recolors by part label - object parts with the same label will ahve the same color</li>
 * </ul>
 * @param opts Additional options
 * @param [opts.callback]
 * @param [opts.encodeIndex]
 * @param [opts.objectIndex]
 * @param [opts.loadIndex] {string} Filename to load the encoding index from (must also specify `opts.fs`)
 * @param [opts.writeIndex] {string} Filename to save the encoded index to (must also specify `opts.fs`)
 * @param [opts.fs] Filesystem API to use (must be specified if writeIndex or loadIndex is specified)
 * @param [opts.getMaterialFn] {function(int, THREE.Color, palette): THREE.Material}
 * @param [opts.palette] {Palette}
 * @param [opts.getId]
 * @param [opts.getObjectId]
 * @param [opts.randomize]
 * @param [opts.rng]
 */
SceneUtil.colorScene = function(sceneState, colorBy, opts) {
  opts = opts || {};
  var loadIndex = opts.loadIndex;
  if (loadIndex) {
    loadIndex = _.pickBy(loadIndex, function(v,k) { return v; });
  }
  if (loadIndex && _.size(loadIndex) > 0) {
    // Need to load these indices before calling color scene
    async.eachOfSeries(loadIndex, function(item, key, cb) {
      Index.import({ fs: opts.fs, filename: item, callback: function(err, index) {
        if (index) {
          opts[key] = index;
        }
        cb(err, index);
      }});
    }, function(err, res) {
      SceneUtil.__colorScene(sceneState, colorBy, opts);
    });
  } else {
    return SceneUtil.__colorScene(sceneState, colorBy, opts);
  }
};

SceneUtil.__colorScene = function (sceneState, colorBy, opts) {
  if (opts.encodeIndex) {
    // Make sure that we use basic material
    opts = _.clone(opts);
    opts.getMaterialFn = getIndexMaterial;
    if (colorBy === 'objectId' || colorBy === 'objectPartId') {
      // Make sure we have a consistent ordering over entire scene for objectId
      opts.getId = opts.getId || function(x) { return x.userData.id; };
      opts.getObjectId = opts.getId;
      if (!opts.objectIndex) {
        opts.objectIndex = sceneState.getObjectIndex();
      }
    }
  }
  if (opts.writeIndex) {
    opts = _.clone(opts);
    var origCallback = opts.callback;
    opts.callback = function(err, res) {
      async.series([
        function (cb) {
          if (res && res.objectIndex) {
            res.objectIndex.export({ fs: opts.fs, filename: opts.writeIndex + '.objectIndex.csv', callback: cb });
          } else {
            cb();
          }
        },
        function (cb) {
          if (res && res.index) {
            res.index.export({ fs: opts.fs, filename: opts.writeIndex + '.' + colorBy + '.csv', callback: cb });
          } else {
            cb();
          }
        }
      ], function(err2, res2) {
        if (origCallback) {
          origCallback(err, res);
        }
      });
    };
  }
  if (colorBy === 'modelId') {
    return SceneUtil.__colorSceneByModelId(sceneState, opts);
  } else if (colorBy === 'materialId') {
    return SceneUtil.__colorSceneByMaterial(sceneState, opts);
  } else if (colorBy === 'material') {
    return SceneUtil.__colorSceneByMaterial(sceneState, _.merge(Object.create(null), opts, { materialIndex: SceneUtil.getMaterialIndex(sceneState) }));
  } else if (colorBy === 'texture') {
    return SceneUtil.__colorSceneByMaterial(sceneState, _.merge(Object.create(null), opts,
      { materialIndex: SceneUtil.getTextureIndex(sceneState), getMaterialIndexId: function(metadata, id) { return metadata.texture == undefined? 'unknown' : id; } }));
  } else if (colorBy === 'category' || colorBy === 'objectType') {
    return SceneUtil.__colorSceneByObjectType(sceneState, opts);
  } else if (colorBy === 'roomId') {
    return SceneUtil.__colorSceneByRoomId(sceneState, opts);
  } else if (colorBy === 'roomType') {
    return SceneUtil.__colorSceneByRoomType(sceneState, opts);
  } else if (colorBy === 'objectId') {
    return SceneUtil.__colorSceneByObjectId(sceneState, opts);
  } else if (colorBy === 'objectMaterialId') {
    return SceneUtil.__colorSceneByObjectPart(sceneState, _.merge(Object.create(null),
      { segmentType: 'surfaces', segmentName: 'materials' }, opts, { useLabel: false }));
  } else if (colorBy === 'objectPartId') {
    return SceneUtil.__colorSceneByObjectPart(sceneState, _.merge(Object.create(null),
      { segmentType: 'parts', segmentName: 'parts', recolorAlphaTexture: true }, opts, { useLabel: false }));
  } else if (colorBy === 'objectPartLabel') {
    return SceneUtil.__colorSceneByObjectPart(sceneState, _.merge(Object.create(null),
      { segmentType: 'parts', segmentName: 'parts', recolorAlphaTexture: true }, opts, { useLabel: true }));
  } else if (colorBy === 'index') {
    return SceneUtil.__colorSceneByIndex(sceneState, opts);
  } else if (colorBy) {
    var material = SceneUtil.__getColorByMaterial(colorBy, opts);
    if (material) {
      return SceneUtil.__colorSceneUsingMaterial(sceneState, _.merge(Object.create(null), opts, { material: material }));
    } else {
      console.warn('Unsupported colorBy=' + colorBy);
      if (opts.callback) {
        opts.callback('Unsupported colorBy=' + colorBy, null);
      }
    }
  }
};

SceneUtil.__getColorByMaterial = function(colorBy, opts) {
  if (colorBy === 'depth') {
    return new THREE.MeshDepthMaterial({depthPacking: opts.depthPacking || THREE.RGBADepthPacking});
  } else if (colorBy === 'normal') {
    return new THREE.MeshNormalMaterial();
  } else if (colorBy === 'wireframe') {
    return new THREE.MeshBasicMaterial({color: new THREE.Color(0), wireframe: true, side: THREE.DoubleSide});
  } else if (colorBy === 'color') {
    return Object3DUtil.getStandardMaterial(opts.color, opts.alpha);
  }
};


SceneUtil.__colorSceneUsingMaterial = function (sceneState, opts) {
  opts = opts || {};
  var material = opts.material;
  for (var i = 0; i < sceneState.modelInstances.length; i++) {
    var modelInstance = sceneState.modelInstances[i];
    colorObj(modelInstance.object3D, material, opts);
  }
  for (var i = 0; i < sceneState.extraObjects.length; i++) {
    var object = sceneState.extraObjects[i];
    colorObj(object, material, opts);
  }
  if (opts.callback) {
    opts.callback(null, {});
  }
};

SceneUtil.__colorSceneByMaterial = function (sceneState, opts) {
  opts = opts || {};
  var getMaterialFn = opts.getMaterialFn || getMaterial;
  var palette = opts.palette || Colors.palettes.d3_unknown_category19p;
  var materialIndex = opts.materialIndex;
  var categoryIndex = opts.index || materialIndex || new Index();
  var unknownIdx = categoryIndex.indexOf('unknown', true);
  var rng = opts.rng || RNG.global;

  var materialIdMap = materialIndex? materialIndex.materialIdMap || SceneUtil.__getMaterialIdMap(materialIndex, opts) : null;

  var getMeshMaterial = opts.getMeshMaterialFn || function(mesh) {
    if (Array.isArray(mesh.materials)) {
      var materials = mesh.material.map(function (m, i) {
        var category = materialIdMap ? materialIdMap[m.id] : m.id;
        var colorIdx = (category != undefined) ? categoryIndex.indexOf(category, true) : unknownIdx;
        return getMaterialFn(colorIdx, null, palette);
      });
      return new THREE.MultiMaterial(materials);
    } else if (mesh.material instanceof THREE.MultiMaterial) {
      var materials = mesh.material.materials.map(function(m, i) {
        var category = materialIdMap? materialIdMap[m.id] : m.id;
        var colorIdx = (category != undefined)? categoryIndex.indexOf(category, true) : unknownIdx;
        return getMaterialFn(colorIdx, categoryIndex.metadata(colorIdx, 'color'), palette);
      });
      return new THREE.MultiMaterial(materials);
    } else {
      var category = mesh.material.id; // TODO: build index of materials
      var colorIdx = (category != undefined)? categoryIndex.indexOf(category, true) : unknownIdx;
      return getMaterialFn(colorIdx, categoryIndex.metadata(colorIdx, 'color'), palette);
    }
  };
  var modelInstances = sceneState.modelInstances;
  if (opts.randomize) {
    modelInstances = rng.shuffle(modelInstances);
  }
  for (var i = 0; i < modelInstances.length; i++) {
    var modelInstance = modelInstances[i];
    colorObj(modelInstance.object3D, getMeshMaterial, opts);
  }
  var extraObjects = sceneState.extraObjects;
  if (opts.randomize) {
    extraObjects = rng.shuffle(extraObjects);
  }
  for (var i = 0; i < extraObjects.length; i++) {
    var object = extraObjects[i];
    colorObj(object, getMeshMaterial, opts);
  }
  if (opts.callback) {
    opts.callback(null, { index: categoryIndex });
  }
  return categoryIndex;
};

SceneUtil.__remapSceneModelMaterials = function (sceneState, opts) {
  opts = opts || {};
  var remapMaterialsKey = opts.remapMaterialsKey;
  var getMeshMaterialForModel = function (modelInfo, mesh) {
    var originalMaterials = null;
    var materialsMap = modelInfo[remapMaterialsKey].data.materials;
    if (mesh.material instanceof THREE.MultiMaterial) {
      originalMaterials = mesh.material.materials;
    } else if (Array.isArray(mesh.material)) {
      originalMaterials = mesh.material;
    }
    if (originalMaterials) {
      var newMaterials = originalMaterials.map(function(m) {
        return materialsMap[m.name];
      });
      return new THREE.MultiMaterial(newMaterials);
    } else {
      return materialsMap[mesh.material.name];
    }
  };
  for (var i = 0; i < sceneState.modelInstances.length; i++) {
    var modelInstance = sceneState.modelInstances[i];
    var modelInfo = modelInstance.model.info;
    if (modelInfo[remapMaterialsKey].data != null) {
      var getMeshMaterial = function (m) { return getMeshMaterialForModel(modelInfo, m); };
      colorObj(modelInstance.object3D, getMeshMaterial, opts);
    } else {
      console.error('Cannot find remapMaterial ' + remapMaterialsKey + ' for model ' + modelInfo.fullId);
      colorObj(modelInstance.object3D, Object3DUtil.BlackMat, opts);
    }
  }
};

SceneUtil.__colorSceneByIndex = function (sceneState, opts) {
  opts = opts || {};
  var getMaterialFn = opts.getMaterialFn || getMaterial;
  var palette = opts.palette || Colors.palettes.d3_unknown_category19p;
  var getIndex = opts.getIndex;
  var index = opts.index;

  var object3Ds = sceneState.modelInstances.map(function(x) { return x.object3D; });
  object3Ds = object3Ds.concat(sceneState.extraObjects);
  for (var i = 0; i < object3Ds.length; i++) {
    var object = object3Ds[i];
    var idx = getIndex(object);
    colorObj(object, getMaterialFn(idx, null, palette), opts);
  }
  if (opts.callback) {
    opts.callback(null, { index: index });
  }
  return index;
};

SceneUtil.__colorSceneByModelId = function (sceneState, opts) {
  opts = opts || {};
  var getMaterialFn = opts.getMaterialFn || getMaterial;
  var palette = opts.palette || Colors.palettes.d3_unknown_category19p;
  var categoryIndex = opts.index || new Index();
  var unknownIdx = categoryIndex.indexOf('unknown', true);
  for (var i = 0; i < sceneState.modelInstances.length; i++) {
    var modelInstance = sceneState.modelInstances[i];
    var category = modelInstance.model.getFullID();
    var colorIdx = (category != undefined)? categoryIndex.indexOf(category, true) : unknownIdx;
    colorObj(modelInstance.object3D, getMaterialFn(colorIdx, categoryIndex.metadata(colorIdx, 'color'), palette), opts);
  }
  for (var i = 0; i < sceneState.extraObjects.length; i++) {
    var object = sceneState.extraObjects[i];
    colorObj(object, getMaterialFn(unknownIdx, categoryIndex.metadata(unknownIdx, 'color'), palette), opts);
  }
  if (opts.callback) {
    opts.callback(null, { index: categoryIndex });
  }
  return categoryIndex;
};

SceneUtil.__colorSceneByObjectId = function (sceneState, opts) {
  opts = opts || {};
  var getMaterialFn = opts.getMaterialFn || getMaterial;
  var palette = opts.palette || Colors.palettes.d3_unknown_category19p;
  var categoryIndex = opts.index || opts.objectIndex || new Index();
  var unknownIdx = categoryIndex.indexOf('unknown', true);
  for (var i = 0; i < sceneState.modelInstances.length; i++) {
    var modelInstance = sceneState.modelInstances[i];
    var category = opts.getId? opts.getId(modelInstance.object3D) : modelInstance.object3D.id;
    var colorIdx = (category != undefined)? categoryIndex.indexOf(category, true, { modelId: modelInstance.model.getFullID(), category: modelInstance.model.info.category }) : unknownIdx;
    colorObj(modelInstance.object3D, getMaterialFn(colorIdx, categoryIndex.metadata(colorIdx, 'color'), palette), opts);
  }
  for (var i = 0; i < sceneState.extraObjects.length; i++) {
    var object = sceneState.extraObjects[i];
    var category = opts.getId? opts.getId(object) : object.id;
    var colorIdx = (category != undefined)? categoryIndex.indexOf(category, true, { category: object.userData.type }) : unknownIdx;
    colorObj(object, getMaterialFn(colorIdx, categoryIndex.metadata(colorIdx, 'color'), palette), opts);
  }
  if (opts.callback) {
    opts.callback(null, { index: categoryIndex });
  }
  return categoryIndex;
};

SceneUtil.__colorSceneByObjectPart = function (sceneState, opts) {
  opts = opts || {};
  var getMaterialFn = opts.getMaterialFn || getMaterial;
  var palette = opts.palette || Colors.palettes.d3_unknown_category19p;
  var categoryIndex = opts.index || new Index();
  var unknownIdx = categoryIndex.indexOf('unknown', true);
  var objectIndex = null;
  if (opts.encodeIndex) {
    objectIndex = opts.objectIndex || new Index();
  }
  // Need to make sure segmentation for objects are loaded
  //console.log('opts is', opts);
  SceneUtil.ensureObjectSegmentation(sceneState, { segmentType: opts.segmentType || 'surfaces',
    callback: function(err, res) {
      sceneState.showObjectSegmentation({
        segmentType: opts.segmentType || 'surfaces',
        segmentName: opts.segmentName || 'materials',
        useOriginalMaterial: opts.recolorAlphaTexture,   // Set true to recolor textures with alpha
        getMaterial: function(object3D, segInfo) {
          var objectId = opts.getObjectId? opts.getObjectId(object3D) : object3D.id;
          var category = 'unknown';
          var modelInstance = Object3DUtil.getModelInstance(object3D);
          var objectCategory = modelInstance? modelInstance.model.getCategory() : (object3D.userData.type || object3D.name);
          var label = segInfo.label;
          var partIndex = segInfo.partIndex || 0;
          var material = segInfo.material;
          var objectPartMetadata =  {
              modelId: modelInstance? modelInstance.model.getFullID() : undefined,
              category: objectCategory,
              partLabel: label
          };
          if (opts.useLabel) {
            category = (label && label !== objectCategory)? (objectCategory + '-' + label) : objectCategory;
          }  else {
            category = objectId + '-' + partIndex;
          }
          var color = null;
          if (opts.encodeIndex && !opts.useLabel) {
            // Encode objectIndex and partIndex directly in color
            // objectIndex lower order 2 bytes (GB), partIndex first byte (R)
            var objectIdx = objectIndex.indexOf(objectId, true, _.omit(objectPartMetadata, ['partLabel']));
            objectPartMetadata['objectIndex'] = objectIdx;
            objectPartMetadata['partIndex'] = partIndex;
            var c = (partIndex << 16) ^ objectIdx;
            color = new THREE.Color(c);
          }
          var colorIdx = (category != undefined)? categoryIndex.indexOf(category, true, objectPartMetadata) : unknownIdx;
          var mat = getMaterialFn(colorIdx, color, palette);
          if (opts.recolorAlphaTexture && material && material.map && material.map.image && material.alphaTest > 0) {
            // Hmm, there may be interesting stuff there....
            // TODO: optimize this....
            var Materials = require('materials/Materials');
            //console.log('recolor', material.alphaTest, material, mat);
            mat.map = Materials.recolorTexture(material.map, { color: mat.color });
            mat.alphaTest = material.alphaTest;
          }
          return mat;
        },
        applyMaterial: function(object3D, material) {
          colorObj(object3D, material, opts);
        }
      });
      if (opts.callback) {
        var res = { index: categoryIndex };
        if (objectIndex) {
          res['objectIndex'] = objectIndex;
        }
        opts.callback(null, res);
      }
    }
  });
  return categoryIndex;
};

SceneUtil.__colorSceneByObjectType = function (sceneState, opts) {
  opts = opts || {};
  var getCategory = opts.getCategory;
  var getMaterialFn = opts.getMaterialFn || getMaterial;
  var palette = opts.palette || Colors.concatPalettes('all-roomtypes',[
    Colors.createPalette('other-roomtypes', ['#A9A9A9', '#708090']),
    Colors.palettes.d3_category18p
  ]);
  var categoryIndex = opts.index || new Index();
  var unknownIdx = categoryIndex.indexOf('unknown', true);
  if (opts.restrictToIndex && opts.index) {
    var validCategories = new Set(opts.index.objects());
    if (getCategory) {
      var getBaseCategory = getCategory;
      getCategory = function(mi) {
        var c = getBaseCategory(mi);
        if (!validCategories.has(c)) {
          c = undefined;
        }
        return c;
      };
    } else {
      getCategory = function(mi) {
        return mi.model.getMatchingCategory(validCategories);
      };
    }
  } else {
    categoryIndex.indexOf('Wall', true);
  }
  for (var i = 0; i < sceneState.modelInstances.length; i++) {
    var modelInstance = sceneState.modelInstances[i];
    var category = getCategory? getCategory(modelInstance) : modelInstance.model.getCategory();
    if (category == undefined && modelInstance.object3D.userData.archType) {
      category = modelInstance.object3D.userData.archType;
    }
    var colorIdx = (category != undefined)? categoryIndex.indexOf(category, true) : unknownIdx;
    colorObj(modelInstance.object3D, getMaterialFn(colorIdx, categoryIndex.metadata(colorIdx, 'color'), palette), opts);
  }
  for (var i = 0; i < sceneState.extraObjects.length; i++) {
    var object = sceneState.extraObjects[i];
    var category = object.userData.type || object.name;
    var colorIdx = (category != undefined)? categoryIndex.indexOf(category, true) : unknownIdx;
    colorObj(object, getMaterialFn(colorIdx, categoryIndex.metadata(colorIdx, 'color'), palette), opts);
  }
  if (opts.callback) {
    opts.callback(null, { index: categoryIndex });
  }
  return categoryIndex;
};

SceneUtil.__colorSceneByRoomId = function (sceneState, opts) {
  opts = opts || {};
  var getMaterialFn = opts.getMaterialFn || getMaterial;
  var palette = opts.palette || Colors.concatPalettes('roomids',[
      Colors.createPalette('wall-outside', ['#A9A9A9', '#708090', '#c4cfc4']),
      Colors.palettes.d3_category18p
    ]);
  var rooms = sceneState.getRooms();
  var categoryIndex = opts.index || new Index();
  var unknownIdx = categoryIndex.indexOf('unknown', true);
  categoryIndex.indexOf('Wall', true);
  categoryIndex.indexOf('Outside', true);

  for (var i = 0; i < sceneState.modelInstances.length; i++) {
    var modelInstance = sceneState.modelInstances[i];
    var objRooms = modelInstance.object3D.userData.roomIds;
    var inRoom = objRooms && objRooms.length > 0;
    if (!inRoom) {
      var colorIdx = categoryIndex.indexOf('Outside', true);
      colorObj(modelInstance.object3D, getMaterialFn(colorIdx, categoryIndex.metadata(colorIdx, 'color'), palette), opts);
    }
  }
  for (var i = 0; i < sceneState.extraObjects.length; i++) {
    var object = sceneState.extraObjects[i];
    var objRooms = object.userData.roomIds;
    var inRoom = objRooms && objRooms.length > 0;
    if (!inRoom) {
      var colorIdx = categoryIndex.indexOf('Outside', true);
      colorObj(object, getMaterialFn(colorIdx, categoryIndex.metadata(colorIdx, 'color'), palette), opts);
    }
  }

  for (var i = 0; i < rooms.length; i++) {
    var room = rooms[i];
    var category = room.userData.id;
    var colorIdx = (category != undefined)? categoryIndex.indexOf(category, true) : unknownIdx;
    colorObj(room, getMaterialFn(colorIdx, categoryIndex.metadata(colorIdx, 'color'), palette), opts);
  }

  // Keep walls a nice lovely gray
  for (var i = 0; i < sceneState.extraObjects.length; i++) {
    var object = sceneState.extraObjects[i];
    if (object.userData.type === 'Wall') {
      var colorIdx = categoryIndex.indexOf('Wall', true);
      colorObj(object, getMaterialFn(colorIdx, categoryIndex.metadata(colorIdx, 'color'), palette), opts);
    }
  }
  if (opts.callback) {
    opts.callback(null, { index: categoryIndex });
  }
  return categoryIndex;
};


SceneUtil.__colorSceneByRoomType = function (sceneState, opts) {
  opts = opts || {};
  var getMaterialFn = opts.getMaterialFn || getMaterial;
  var palette = opts.palette || Colors.concatPalettes('all-roomtypes',[
    Colors.createPalette('other-roomtypes', ['#A9A9A9', '#708090', '#c4cfc4']),
    Colors.palettes.d3_category18p
  ]);
    //Colors.palettes.d3_category19p;
  var rooms = sceneState.getRooms();
  var categoryIndex = opts.index || new Index();
  var unknownIdx = categoryIndex.indexOf('unknown', true);
  categoryIndex.indexOf('Wall', true);
  categoryIndex.indexOf('Outside', true);
  var roomTypes = [
    // List of original rooms types
    'Living_Room', 'Kitchen', 'Bedroom', 'Child_Room',
    'Dining_Room', 'Bathroom', 'Toilet', 'Hall', 'Hallway',
    'Office', 'Guest_Room', 'Wardrobe', 'Room', 'Lobby',
    'Storage', 'Boiler_room', 'Balcony', 'Loggia', 'Terrace',
    'Entryway', 'Passenger_elevator', 'Freight_elevator', 'Aeration', 'Garage',
    // Additional room types
    'Gym'];
  for (var i = 0; i < roomTypes.length; i++) {
    categoryIndex.indexOf(roomTypes[i], true);
  }

  for (var i = 0; i < sceneState.modelInstances.length; i++) {
    var modelInstance = sceneState.modelInstances[i];
    var objRooms = modelInstance.object3D.userData.roomIds;
    var inRoom = objRooms && objRooms.length > 0;
    if (!inRoom) {
      var colorIdx = categoryIndex.indexOf('Outside', true);
      colorObj(modelInstance.object3D, getMaterialFn(colorIdx, categoryIndex.metadata(colorIdx, 'color'), palette), opts);
    }
  }
  for (var i = 0; i < sceneState.extraObjects.length; i++) {
    var object = sceneState.extraObjects[i];
    var objRooms = object.userData.roomIds;
    var inRoom = objRooms && objRooms.length > 0;
    if (!inRoom) {
      var colorIdx = categoryIndex.indexOf('Outside', true);
      colorObj(object, getMaterialFn(colorIdx, categoryIndex.metadata(colorIdx, 'color'), palette), opts);
    }
  }

  for (var i = 0; i < rooms.length; i++) {
    var room = rooms[i];
    var category = (room.userData.roomType && room.userData.roomType.length > 0)?
      room.userData.roomType[0] : null;
    var colorIdx = (category != undefined)? categoryIndex.indexOf(category, true) : unknownIdx;
    colorObj(room, getMaterialFn(colorIdx, categoryIndex.metadata(colorIdx, 'color'), palette), opts);
  }

  // Keep walls a nice lovely gray
  for (var i = 0; i < sceneState.extraObjects.length; i++) {
    var object = sceneState.extraObjects[i];
    if (object.userData.type === 'Wall') {
      var colorIdx = categoryIndex.indexOf('Wall', true);
      colorObj(object, getMaterialFn(colorIdx, categoryIndex.metadata(colorIdx, 'color'), palette), opts);
    }
  }
  if (opts.callback) {
    opts.callback(null, { index: categoryIndex });
  }
  return categoryIndex;
};

/**
 * Recolor scene with compatible materials (based on aggregated scene statistics)
 * @function recolorWithCompatibleMaterials
 * @static
 * @param sceneState {scene.SceneState}
 * @param opts {Object} Options for helping to recolor the scene
 * @param opts.aggregatedSceneStatistics {ssg.SceneStatistics} statistics to use to figure out what materials are compatible
 * @param opts.assetManager {assets.AssetManager} AssetManager that we will use to load new textures and materials
 * @param [opts.textureOnly=false] {boolean} Whether only texture is remapped (color is kept as before)
 * @param [opts.texturedObjects] {string[]} List of object categories that we want to ensure has a textured material
 * @param [opts.texturedSet] {string} What set of textures to use (useful for when we want to split into train/test sets)
 * @param [opts.rng] {math.RNG} Random number generator to use when we need to randomize
 * @param [opts.debug=false] {boolean} Whether to enable debugging of this function
 */
SceneUtil.recolorWithCompatibleMaterials = function(sceneState, opts) {
  var ss = opts.aggregatedSceneStatistics;
  var assetManager = opts.assetManager;
  // Option to only remap texture (keep color)
  var remapTextureOnly = opts.textureOnly;
  // What object types should always have a texture
  var texturedObjects = opts.texturedObjects;
  var materialCounts = remapTextureOnly? ss.getTextureCounts() : ss.getMaterialCounts();
  var materialCountIndex = remapTextureOnly? ss.getTextureIndex() : ss.getMaterialIndex();
  var texturedMaterialCounts = ss.getTexturedMaterialCounts(opts.textureSet);
  var textureRepeat = opts.textureRepeat || sceneState.info.textureRepeat || new THREE.Vector2(1/100, 1/100);   // TODO: This is different for other walls
  // console.log('texturedMaterialCounts', texturedMaterialCounts);
  // console.log('materialCounts', materialCounts);
  var materialRemap = {};

  var materialIndex = SceneUtil.getMaterialIndex(sceneState,
    { includeMaterial: true,
      includeMaterialId: true,
      computeMaterialIdMap: true
    });
  var sampleOpts = {
    rng: opts.rng,
    filter: function(i) { return materialCountIndex.get(i); }
  };

  function getRemappedMaterial(material, cacheType, sampleType, sampleTexturedMaterialsOnly) {
    var mId = materialIndex.materialIdMap[material.id];
    var mat = materialIndex.metadata(materialIndex.indexOf(mId));
    if (!mat) {
      console.log('no metadata for material', Constants.isBrowser? material : material.id);
      return material;
    }
    var key = remapTextureOnly? ss.getTextureKey(mat) : ss.getMaterialKey(mat);
    if (!key || !mat.color || material.name === 'video') {
      return material;
    }
    var ckey = cacheType + '-' + key;
    if (materialRemap[ckey]) {
      return materialRemap[ckey];
    } else {
      if (Constants.isBrowser) {
        console.log('remap ' + ckey);
      }
      var sampled;
      if (!remapTextureOnly && sampleTexturedMaterialsOnly) {
        sampled = texturedMaterialCounts.sample([sampleType], sampleOpts);
        //console.log('sampled textured ' + sampleType, sampled);
        if (!sampled || !sampled[0]) {
          sampled = materialCounts.sample([sampleType], sampleOpts);
          //console.log('resampled', sampled);
        } else if (opts.debug) {
          if (ss.hasTexture(sampled[0])) {
            console.log('No texture for sampled ' + sampled[0]);
            // console.log('textured', texturedMaterialCounts.get([sampleType]));
            // console.log('unfiltered', materialCounts.get([sampleType]));
            // console.log('Index is ' + texturedMaterialCounts.indices[1].indexOf(sampled[0]));
          }
        }
      } else {
        sampled = materialCounts.sample([sampleType], sampleOpts);
      }
      if (Constants.isBrowser) {
        console.log('sampled ' + cacheType + ', ' + sampleType, sampled);
      }
      var m = material.clone();
      if (material.index != undefined) {
        m.index = material.index;
      }
      var textureOptions = (sampleType.startsWith('p5d') || sampleType.startsWith('Box'))? null :
        { wrap: THREE.RepeatWrapping, repeat: textureRepeat };
      if (sampled && sampled[0]) {
        if (remapTextureOnly) {
          var textureName = sampled[0];
          var texture = assetManager.getTexture(assetManager.getTexturePath('p5d', textureName), textureOptions);
          _.merge(m, {name: 'p5d.' + textureName, map: texture});
        } else {
          var matParts = sampled[0].split('-');
          var color = new THREE.Color(matParts[0]);
          // TODO: Take into account opacity as well, for now ignore
          var opacity = parseFloat(matParts[1]);
          var textureName = matParts[2];
          var texture = textureName?
            assetManager.getTexture(assetManager.getTexturePath('p5d', textureName), textureOptions) : null;
          _.merge(m, {name: 'p5d.' + sampled[0], map: texture, color: color});

        }
      }
      materialRemap[ckey] = m;
      //console.log('remapped', ckey, m);
      return m;
    }
  }

  SceneUtil.colorScene(sceneState, 'materialId', {
    materialIndex: materialIndex,
    getMeshMaterialFn: function(mesh) {
      var modelInstance = Object3DUtil.getModelInstance(mesh, true);
      var objectType = mesh.userData.type || (modelInstance? modelInstance.model.getCategory() : 'Object');
      var modelId = modelInstance? modelInstance.model.getFullID() : undefined;
      // Add option to only include material with texture for 'Wall', 'Floor', 'Ceiling'
      var sampleTexturedMaterialsOnly = false;
      var meshKey = mesh.userData.type || modelId;
      if (texturedObjects) {
        if (texturedObjects === 'all') {
          sampleTexturedMaterialsOnly = true;
        } else {
          sampleTexturedMaterialsOnly = texturedObjects.indexOf(objectType) >= 0;
        }
      }
      //console.log('texturedObjects', texturedObjects, sampleTexturedMaterialsOnly, objectType);
      if (Array.isArray(mesh.material)) {
        var materials = mesh.material.map(function (m, i) {
          return getRemappedMaterial(m, objectType, meshKey + '#' + i, sampleTexturedMaterialsOnly);
        });
        return new THREE.MultiMaterial(materials);
      } else if (mesh.material instanceof THREE.MultiMaterial) {
        var materials = mesh.material.materials.map(function(m, i) {
          return getRemappedMaterial(m, objectType, meshKey + '#' + i, sampleTexturedMaterialsOnly);
        });
        return new THREE.MultiMaterial(materials);
      } else {
        var key = (mesh.material.index != undefined)? meshKey + '#' + mesh.material.index : meshKey;
        return getRemappedMaterial(mesh.material, objectType, key, sampleTexturedMaterialsOnly);
      }
    }
  });
};

SceneUtil.colorObjects = function (object3Ds, opts) {
  opts = opts || {};
  var getMaterialFn = opts.getMaterialFn || getMaterial;
  var palette = opts.palette || Colors.palettes.d3_unknown_category19p;
  var idIndex = opts.index || opts.objectIndex || new Index();
  var unknownIdx = idIndex.indexOf('unknown', true);
  for (var i = 0; i < object3Ds.length; i++) {
    var object = object3Ds[i];
    var id = opts.getId? opts.getId(object) : object.id;
    var colorIdx = (id != undefined)? idIndex.indexOf(id, true, { category: object.userData.type }) : unknownIdx;
    colorObj(object, getMaterialFn(colorIdx, idIndex.metadata(colorIdx, 'color'), palette), opts);
  }
  if (opts.callback) {
    opts.callback(null, { index: idIndex });
  }
  return idIndex;
};

SceneUtil.__precomputeSemanticEncoding = function(sceneState, encodingType, labelMapping) {
  // Preprocess sceneState for using labelMapping
  sceneState.__semanticEncodings = sceneState.__semanticEncodings || {};
  var encname = _.get(labelMapping, 'name', encodingType);
  if (!sceneState.__semanticEncodings[encname]) {
    //console.log('precomputing semantic encodings for ' + encname);
    var object3Ds = sceneState.modelInstances.map(function(x) { return x.object3D; });
    object3Ds = object3Ds.concat(sceneState.extraObjects);
    if (encodingType === 'roomType' || encodingType === 'roomId') {
      var isId = encodingType === 'roomId';
      var roomIdIndex = sceneState.getRoomIndex();
      sceneState.__semanticEncodings[encname] = {
        'index': isId? roomIdIndex : null // TODO: roomTypeIndex
      };
      for (var i = 0; i < object3Ds.length; i++) {
        var object3D = object3Ds[i];
        object3D.userData.semanticEncoding = object3D.userData.semanticEncoding || {};
        var objRooms = (object3D.userData.roomId != undefined)? [object3D.userData.roomId] : object3D.userData.roomIds;
        var inRoom = objRooms && objRooms.length > 0;
        if (isId) {
          if (inRoom) {
            object3D.userData.semanticEncoding[encname] = roomIdIndex.indexOf(objRooms[0]) + 1;
          } else {
            object3D.userData.semanticEncoding[encname] = 0;
          }
        } else {
          if (inRoom) {
            // HACK!!! Take first room as main room type
            var roomMetadata = roomIdIndex.metadata(roomIdIndex.indexOf(objRooms[0]));
            var roomType = roomMetadata.room.userData.roomType || roomMetadata.room.userData.regionType;
            if (_.isArray(roomType)) { roomType = roomType[0]; }
            object3D.userData.semanticEncoding[encname] = labelMapping.index(roomType);
          } else {
            // HACK!!! Assume outside is last index
            object3D.userData.semanticEncoding[encname] = labelMapping.maxIndex;
          }
        }
      }
    } else if (encodingType === 'objectType' || encodingType === 'objectId') {
      var isId = encodingType === 'objectId';
      var objectIdIndex = isId? sceneState.getObjectIndex() : null;
      sceneState.__semanticEncodings[encname] = {
        'index': isId? objectIdIndex : null // TODO: objectTypeIndex
      };
      for (var i = 0; i < object3Ds.length; i++) {
        var object3D = object3Ds[i];
        object3D.userData.semanticEncoding = object3D.userData.semanticEncoding || {};
        if (isId) {
          object3D.userData.semanticEncoding[encname] = objectIdIndex.indexOf(object3D.userData.id) + 1;
        } else {
          var modelInstance = Object3DUtil.getModelInstance(object3D, false);
          var objectType = modelInstance? modelInstance.model.getCategories() : (object3D.userData.type || 'Object');
          object3D.userData.semanticEncoding[encname] = labelMapping.indexOneOf(objectType);
          //console.log('got ', objectType, object3D.userData.semanticEncoding[encname]);
        }
      }
    }
  }
  return sceneState.__semanticEncodings[encname];
};

/**
 * Helper function to render the scene indexed by id
 * @function renderIndexed
 * @static
 * @param sceneState {scene.SceneState|THREE.Object3D}
 * @param opts Options on how to render/index the scene
 * @param opts.renderer {gfx.Renderer} Renderer to use (NOTE: for indexed render to happen well, renderer should not have any special effects such as ambientOcclusion,e tc)
 * @param opts.camera {THREE.Camera} Camera to use when renderering
 * @param [opts.getIndex] {function(THREE.Object3D): int} Function that returns the index to use
 * @param [opts.getId] {function(THREE.Object3D): string} Function that returns the id to index
 * @param [opts.palette]
 * @param [opts.targetObjects]
 * @param [opts.colorBy]
 * @returns {{pixels, nPixels: number, index}}
 */
SceneUtil.renderIndexed = function(sceneState, opts) {
  var getMaterialFn = getIndexMaterial;
  if (sceneState instanceof THREE.Object3D) {
    var idIndex = new Index() || opts.index;
    var unknownIdx = idIndex.indexOf('unknown', true);

    var getId = opts.getId || function(x) { return x.id; };
    var targetObjects = opts.targetObjects || [];
    colorObj(sceneState, getMaterialFn(unknownIdx, null, opts.palette), { isTemporary: true});
    for (var i = 0; i < targetObjects.length; i++) {
      var obj = targetObjects[i];
      var colorIdx = unknownIdx;
      if (opts.getIndex) {
        colorIdx = opts.getIndex(obj);
      } else {
        var id = getId(obj);
        colorIdx = (id != undefined) ? idIndex.indexOf(id, true) : unknownIdx;
      }
      colorObj(obj, getMaterialFn(colorIdx, null, opts.palette), { isTemporary: true});
    }

    var colorByIndex = idIndex;
    var pixels = opts.renderer.render(sceneState, opts.camera);
    for (var i = 0; i < targetObjects.length; i++) {
      SceneUtil.revertMaterial(targetObjects[i]);
    }
    SceneUtil.revertMaterial(sceneState);

    return {
      pixels: pixels,
      nPixels: pixels.length / 4,
      index: colorByIndex
    };
  } else {
    // TODO: Use callback for rendering parts....
    var colorByIndex = SceneUtil.colorScene(sceneState, opts.colorBy, {
      index: opts.index,
      getIndex: opts.getIndex,
      getId: opts.getId,
      getMaterialFn: getMaterialFn,
      isTemporary: true
    });
    var pixels = opts.renderer.render(sceneState.fullScene, opts.camera);
    SceneUtil.revertMaterials(sceneState);
    return {
      pixels: pixels,
      nPixels: pixels.length / 4,
      index: colorByIndex
    };
  }
};

SceneUtil.renderWithMaterial = function(sceneState, opts) {
  var scene = sceneState.fullScene || sceneState;
  var oldOverrideMaterial = scene.overrideMaterial;
  scene.overrideMaterial = opts.material;
  var pixels = opts.renderer.render(scene, opts.camera);
  scene.overrideMaterial = oldOverrideMaterial;
  return pixels;
};

SceneUtil.renderWithRemappedMaterials = function(sceneState, opts) {
  SceneUtil.__remapSceneModelMaterials(sceneState, _.defaults({ isTemporary: true }, opts));
  var pixels = opts.renderer.render(sceneState.fullScene, opts.camera);
  SceneUtil.revertMaterials(sceneState);
  return {
    pixels: pixels,
    nPixels: pixels.length / 4
  };
};

SceneUtil.renderColored = function(sceneState, opts) {
  if (sceneState instanceof THREE.Object3D) {
    var material = SceneUtil.__getColorByMaterial(opts.colorBy, opts);
    if (material) {
      colorObj(sceneState, material, { isTemporary: true});
      var pixels = opts.renderer.render(sceneState, opts.camera);
      SceneUtil.revertMaterial(sceneState);
      return pixels;
    } else {
      console.log('Unsupported colorBy for Object3D: ' + opts.colorBy);
      return null;
    }
  } else {
    SceneUtil.colorScene(sceneState, opts.colorBy, _.merge(Object.create(null), opts, {
      isTemporary: true
    }));
    var pixels = opts.renderer.render(sceneState.fullScene, opts.camera);
    SceneUtil.revertMaterials(sceneState);
    return pixels;
  }
};

SceneUtil.getPixelCounts = function(sceneState, opts) {
  var result = SceneUtil.renderIndexed(sceneState, opts);
  result.counts = ImageUtil.getIndexCounts(result.pixels, result.index? function (index) {
    return result.index.get(index);
  }: null);
  return result;
};

SceneUtil.ensureObjectSegmentation = function(sceneState, opts) {
  async.forEachSeries( sceneState.modelInstances,
    function(modelInstance, cb) {
      modelInstance.model.segmentations = modelInstance.model.segmentations || {};
      if (!modelInstance.model.segmentations[opts.segmentType]) {
        var segmentationInfo = modelInstance.model.info[opts.segmentType];
        if (segmentationInfo) {
          var IndexedSegmentation = require('geo/IndexedSegmentation');
          modelInstance.model.segmentations[opts.segmentType] = new IndexedSegmentation({
            filename: segmentationInfo.file,
            segmentType: opts.segmentType
          });
        }
      }
      var segmentation = modelInstance.model.segmentations[opts.segmentType];
      if (segmentation) {
        segmentation.load({callback: function(err, res) {
          if (err) {
            console.warn('Error fetching ' + opts.segmentType + ' for ' + modelInstance.model.getFullID());
          }
          console.log('done with ' + modelInstance.model.getFullID());
          cb(null, res);
        }});
      } else {
        console.warn('No ' + opts.segmentType + ' for ' + modelInstance.model.getFullID());
        cb('No ' + opts.segmentType + ' for ' + modelInstance.model.getFullID(), null);
      }
    },
    function(err, results) {
      opts.callback(err, results);
    }
  );
};

SceneUtil.clusterObjectsByBoundingBoxes = function (objects) {
  // order objects by size
  var sortedObjects = _.sortBy(objects, function (o) {
    return -o.getBBoxDims().length();
  });

  // iterate from largest to smallest, merging into overlapping cluster
  var clusters = [];
  _.forOwn(sortedObjects, function (o) {
    var compatibleCluster = null;
    if (clusters.length) {
      var intersections = _.map(clusters, function (cluster) {
        var clusterMembers = cluster.clusterMembers || [];
        if (clusterMembers.length) {
          var intersection = cluster.bbox.intersection(o.getBBox());
          if (intersection) {
            clusterMembers.push(o);
            var intDiag = intersection.dimensions().length();
            var unionBBox = cluster.bbox.union(o.getBBox());
            var oDiag = o.getBBox().dimensions().length();
            return { bbox: unionBBox, overlap: intDiag / oDiag, clusterMembers: clusterMembers };
          }
        }
      });
      var maxOverlapIntersection = _.maxBy(intersections, function (i) {
        if (i) return i.overlap;
      });
      if (maxOverlapIntersection && maxOverlapIntersection > 0.1) {
        compatibleCluster = maxOverlapIntersection;
      }
    }

    if (compatibleCluster) {
      compatibleCluster.clusterMembers.push(o);
    } else {
      var cluster = { bbox: o.getBBox(), overlap: 1.0, clusterMembers: [o] };
      clusters.push(cluster);
    }

  });

  return clusters;
};

function triangleUpFilter(up, v1,v2,v3) {
  var normal = GeometryUtil.computeFaceNormal(v1,v2,v3);
  return (normal.dot(up) >= 0.9);
}

SceneUtil.computeRoomFloorArea = function(room, opts) {
  opts = opts || {};
  var upFilter = triangleUpFilter.bind(null, opts.up || Constants.worldUp);
  // note that this won't work if floor/ceiling is hidden
  var roomCeiling = Object3DUtil.findNodes(room, function (o) {
    return o.userData.type === 'Ceiling';
  });
  var roomFloor = Object3DUtil.findNodes(room, function (o) {
    return o.userData.type === 'Floor' || o.userData.type === 'Ground';
  });
  var surface = roomFloor.length? roomFloor[0] : (roomCeiling.length? roomCeiling[0] : null);
  if (surface) {
    // surface may be extruded, so filter out only those that are face up
    var area = Object3DUtil.getSurfaceArea(surface, { includeChildModelInstance: false, transform: opts.transform, triFilter: upFilter });
    return area;
  }
};

SceneUtil.getRoomFloorArea = function(room) {
  if (room.userData.floorArea == undefined) {
    room.userData.floorArea = SceneUtil.computeRoomFloorArea(room);
  }
  return room.userData.floorArea;
};

/**
 * Samples a room in the scene weighted by floor area
 * @function sampleRoom
 * @static
 * @param rooms {THREE.Object3D[]}
 * @param opts
 * @returns {*}
 */
SceneUtil.sampleRoom = function(rooms, opts) {
  opts = opts || {};
  var totalArea = 0;
  var cumulativeAreas = [];
  for (var i = 0; i < rooms.length; i++) {
    var room = rooms[i];
    var area = SceneUtil.getRoomFloorArea(room);
    totalArea += area;
    cumulativeAreas.push(totalArea);
  }
  var rng = opts.rng || RNG.global;
  var r = rng.random() * totalArea;
  var index = _.sortedIndex(cumulativeAreas, r);
  return rooms[index];
};

SceneUtil.getWallsBBox = function(sceneState) {
  var walls = sceneState.findNodes(function (o) {
    return o.userData.type === 'Wall' || o.userData.archType === 'Wall';
  });
  return Object3DUtil.getBoundingBox(walls);
};

SceneUtil.getFloorSamples = function(object3D, nsamples) {
    var floors = Object3DUtil.findNodes(object3D, function(node) {
        return node.userData.type === 'Floor' || node.userData.type === 'Ground';
    });
    if (floors.length > 0) {
        object3D.updateMatrixWorld();
        var sampledPoints = MeshSampling.sampleObject(floors, nsamples, {
            weightFn: 'area',
            recursive: true,
            convertSample: function(s) { return s.worldPoint; },
            skipUVColors: true
        });
        return _.flatten(sampledPoints);
    } else {
        return [];
    }
};

SceneUtil.sampleUpwardSurfaces = function(object3D, nsamples) {
  object3D.updateMatrixWorld();
  var sampledPoints = MeshSampling.sampleObject(object3D, nsamples, {
    weightFn: {
      name: 'areaWithNormal',
      args: { targetNormal: Constants.worldUp }
    },
    recursive: true,
    convertSample: function(s) { return s.worldPoint; },
    skipUVColors: true
  });
  return _.flatten(sampledPoints);
};

SceneUtil.estimateFloorHeight = function(level, point, nsamples, maxDist, kNeighbors, sampleUpwardSurfaces) {
    // Estimate floor height for point by considering 2D neighbors around it
    if (!level.__floorSamples) {
      level.__floorSamples = SceneUtil.getFloorSamples(level, nsamples);
      if (level.__floorSamples.length === 0 && sampleUpwardSurfaces) {
        level.__floorSamples = SceneUtil.sampleUpwardSurfaces(level, nsamples);
      }
    }
    if (!level.__floorSamplesVPTree2DL2) {
      level.__floorSamplesVPTree2DL2 = VPTreeFactory.build(level.__floorSamples, function (a, b) {
          var dx = a.x - b.x;
          var dz = a.z - b.z;
          return Math.sqrt(dx * dx + dz * dz);
      });
    }
    var closest = level.__floorSamplesVPTree2DL2.search(point, kNeighbors, maxDist);
    if (closest && closest.length > 1) {
      var csamples = _.map(closest, function(c) { return level.__floorSamples[c.i].y; } );
      //console.log('got closest', csamples);
      if (csamples.length === 1) { return csamples[0].y; }
      else {
        var sum = _.sum(csamples, function(p) { return p.y; });
        return sum/csamples.length;
      }
    }
};


SceneUtil.sampleRoomFloor = function(room, nsamples, opts) {
  var roomFloor = Object3DUtil.findNodes(room, function (o) {
    return o.userData.type === 'Floor' || o.userData.type === 'Ground';
  });
  if (roomFloor.length) {
    opts = _.defaults(opts, { up: Constants.worldUp });
    return SceneUtil.sampleObject(roomFloor[0], nsamples, opts);
  }
};

SceneUtil.sampleObject = function(object, nsamples, opts) {
  // Sample points from object with normal
  opts = _.defaults(opts, {
    weightFn: { name: 'areaWithNormal', args: { targetNormal: opts.up } }
  });
  var samples = MeshSampling.sampleObject(object, nsamples, opts);
  return _.flatten(samples);
};

function addContains(a,b) {
  a.contains = a.contains || [];
  a.contains.push(b.id);
  b.inside = a.inside || [];
  b.inside.push(a.id);
}

SceneUtil.computeStatistics = function(sceneState, opts) {
  opts = opts || {};
  var transform;
  if (opts.transform) {
    transform = opts.transform.clone();
  } else {
    var sceneTransformMatrixInverse = new THREE.Matrix4();
    sceneTransformMatrixInverse.getInverse(sceneState.scene.matrixWorld);
    transform = sceneTransformMatrixInverse;
  }
  var scaleBy = opts.unit ? (sceneState.info.defaultUnit / opts.unit) : 1.0;
  if (opts.unit) {
    var scaleMat = new THREE.Matrix4();
    scaleMat.makeScale(scaleBy, scaleBy, scaleBy);
    transform.multiply(scaleMat);
  }
  var up = Object3DUtil.toVector3(sceneState.info.defaultUp);

  var relations = opts.relations || {};
  var portalsByRoom = relations.portals? _.groupBy(relations.portals, 'room') : {};
  var portalsById = relations.portals? _.groupBy(relations.portals, 'portal') : {};

  var nodes = [];
  var rooms = sceneState.getRooms();
  for (var i = 0; i < rooms.length; i++) {
    var room = rooms[i];
    var stats = { type: 'Room', id: room.userData.id };
    var area = SceneUtil.computeRoomFloorArea(room, { transform: transform, up: up });
    if (area != undefined) {
      stats.floorArea = area;
    }
    var portals = portalsByRoom[room.userData.id];
    if (portals) {
      var portalCounts = _.countBy(portals, 'portalType');
      stats.nwindows = portalCounts['window'];
      stats.ndoors = portalCounts['door'];
      // Attach portals to this room
      _.each(portals, function(p) {
        var portalObject = sceneState.findNodeById(p.portal);
        if (portalObject) {
          Object3DUtil.attachToParent(portalObject, room);
        }
      });
    }
    var bboxRoom = Object3DUtil.computeBoundingBox(room, transform, function(x) {
      return (x.userData.type !== 'ModelInstance');
    });
    room.traverse(function(x) {
      if (x.userData.type === 'ModelInstance') {
        x.userData.__isObject = true;
        Object3DUtil.traverseAncestors(x, function(a) {
          a.userData.__hasObject = true;
          return a.id !== room.id;
        });
      } else if (x.parent && x.parent.userData.__isObject) {
        x.userData.__isObject = true;
      }
    });
    var bboxObjects = Object3DUtil.computeBoundingBox(room, transform, function(x) {
      return x.userData.__isObject || x.userData.__hasObject;
    });
    stats.bboxRoom =  bboxRoom;  // Bounding box of room itself
    if (bboxObjects.valid()) {
      stats.bboxObjects = bboxObjects; // Bounding box of the objects in the room
    }
    nodes.push(stats);
  }
  
  for (var i = 0; i < nodes.length; i++) {
    for (var j = i+1; j < nodes.length; j++) {
      var bi = nodes[i].bboxRoom;
      var bj = nodes[j].bboxRoom;
      if (bi.contains(bj)) {
        addContains(nodes[i], nodes[j]);
      }
      if (bj.contains(bi)) {
        addContains(nodes[j], nodes[i]);
      }
    }
  }
  var statistics = { nodes: nodes };
  return statistics;
};

/**
 * Returns list of materials for the scene
 * @function computeMaterials
 * @static
 * @param sceneState {scene.SceneState}
 * @param opts
 * @returns {Array}
 */
SceneUtil.computeMaterials = function(sceneState, opts) {
  opts = opts || {};
  var getTextureName = opts.getTextureName ||  function (name) {
    return name;
  };
  // Compute for each object/materialIndex the set of materials and colors used
  var nodes = sceneState.getObject3Ds();
  var materials = [];
  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    var id = node.userData.id;
    var type = node.userData.type;
    var nodeMaterials = Object3DUtil.getMeshMaterials(node);
    var modelInstance = Object3DUtil.getModelInstance(node);
    var roomIds = node.userData.roomIds || (node.userData.roomId? [node.userData.roomId] : undefined);
    var roomTypes = roomIds? _.flatMap(roomIds, function(roomId) {
      var room = sceneState.findNode(function(x) { return x.userData.id === roomId; });
      return room? room.userData.roomType : [];
    }) : undefined;
    if (roomTypes && roomTypes.length === 0) {
      roomTypes = undefined;
    }
    materials.push({
      id: id,
      modelId: modelInstance? modelInstance.model.getFullID() : undefined,
      category: modelInstance? modelInstance.model.getCategories().join(',') : node.userData.type,
      roomIds: roomIds,
      roomTypes: roomTypes,
      materials: nodeMaterials.map(function(materialInfo) {
        var mat = materialInfo.material;
        return {
          mesh: materialInfo.mesh.userData.id || id,
          type: materialInfo.mesh.userData.type || type,
          material: opts.includeMaterial? mat : undefined,
          materialId: opts.includeMaterialId? mat.id : undefined,
          materialIndex: materialInfo.index,
          opacity: mat.transparent? mat.opacity : 1.0,
          color:  mat.color? '#' + mat.color.getHexString() : undefined,
          texture: mat.map? getTextureName(mat.map.sourceFile || mat.map.name): undefined
        };
      })
    });
  }
  //console.log('materials', materials);
  return materials;
};

SceneUtil.__getMaterialIdMap = function(materialIndex, opts) {
  if (!materialIndex) return null;
  var materialIdMap = {};
  //console.log(materialIndex);
  for (var i = 0; i < materialIndex.size(); i++) {
    var id = materialIndex.get(i);
    var metadata = materialIndex.metadata(i);
    if (metadata) {
      for (var j = 0; j < metadata.materials.length; j++) {
        var m = metadata.materials[j];
        if (opts.getMaterialIndexId) {
          materialIdMap[m.materialId] = opts.getMaterialIndexId(metadata, id);
        } else {
          materialIdMap[m.materialId] = id;
        }
      }
    }
  }
  return materialIdMap;
};

SceneUtil.__getMaterialIndex = function(sceneState, opts) {
  var attrnames = opts.attributes;
  var prefix = opts.prefix || '';
  var materialsByObject = SceneUtil.computeMaterials(sceneState, opts);
  var materials = _.flatMap(materialsByObject, function(m) { return m.materials; });
  var groupedMaterials = _.groupBy(materials, function(x) {
    var attributes = attrnames.map(function(attr) { return x[attr]; });
    return attributes.join('-');
  });
  var index = new Index();
  index.add('unknown');
  var v = _.values(groupedMaterials);
  for (var i = 0; i < v.length; i++) {
    var grouped = v[i];
    var materialInfo = {
      id: prefix + (i+1),
      materials: grouped.map(function(g) { return _.omit(g, attrnames); })
    };
    _.each(attrnames, function(attr) {
      materialInfo[attr] = grouped[0][attr];
    });
    index.add(materialInfo.id, materialInfo);
  }
  if (opts.computeMaterialIdMap) {
    index.materialIdMap = SceneUtil.__getMaterialIdMap(index, opts);
  }
  return index;
};

SceneUtil.getMaterialIndex = function(sceneState, opts) {
  // consider two materials the same if they have the same color, texture, and opacity
  return SceneUtil.__getMaterialIndex(sceneState,
    _.defaults(Object.create(null), opts || {},
      { includeMaterialId: true, prefix: 'm', attributes: ['color', 'opacity', 'texture' ]}));
};

SceneUtil.getTextureIndex = function(sceneState, opts) {
  // consider two materials to be the same if they have the same texture
  return SceneUtil.__getMaterialIndex(sceneState,
    _.defaults(Object.create(null), opts || {},
      { includeMaterialId: true, prefix: 't', attributes: ['texture']}));
};

/**
 * PortalRelation information
 * @typedef PortalRelation
 * @type {object}
 * @property {string} portalType What kind of portal is it (door, windown, unknown)?
 * @property {string} portal Object instance id of the portal
 * @property {string} wall Object instance id of the wall
 * @property {string} room Object instance id of the room
 */

/**
 * SupportRelation information
 * @typedef SupportRelation
 * @type {object}
 * @property {string} child Object instance id of the support child
 * @property {string} parent Object instance id of the support parent
 * @property {{distance: number, faceIndex: int, normSim: number, normal: number[], point: number[], uv: number[], meshId: string}} parentAttachment
 * @property {{type: string, frame: string, bbfaceIndex: int, local: object, world: object, index: 2}} parentAttachment
 */

/**
 * Identifies and returns portal relations
 * @param sceneState {scene.SceneState}
 * @returns {PortalRelation[]}
 */
SceneUtil.identifyPortalRelations = function(sceneState) {
  // Start with door/window to wall association
  var portalRelations = [];
  for (var i = 0; i < sceneState.modelInstances.length; i++) {
    var modelInstance = sceneState.modelInstances[i];
    var obj = modelInstance.object3D;
    if (obj) {
      var objId = obj.userData.id;
      var wallIds = obj.userData.wallIds || [];
      for (var j = 0; j < wallIds.length; j++) {
        var wallId = wallIds[j];
        var li = wallId.lastIndexOf('_');
        var roomId = wallId.substring(0, li);
        var portalType = modelInstance.model.isDoor()? 'door' :
          (modelInstance.model.isWindow()? 'window' : 'unknown');
        portalRelations.push({ portalType: portalType, portal: objId , wall: wallIds[j], room: roomId });
      }
    }
  }
  return portalRelations;
};

/**
 * Identifies relations between objects in the scene
 * @function identifyRelations
 * @static
 * @param sceneState {scene.SceneState}
 * @param opts
 * @param callback
 * @returns {{portals: PortalRelation[], support: SupportRelation[]}}
 */
SceneUtil.identifyRelations = function(sceneState, opts, callback) {
  var portalRelations = SceneUtil.identifyPortalRelations(sceneState);
  var supportRelations = [];
  var relations = {
    portals: portalRelations,
    support: supportRelations
  };
  // Support relations
  sceneState.identifySupportHierarchy({ portalRelations: portalRelations, assetManager: opts.assetManager, aggregatedSceneStatistics: opts.aggregatedSceneStatistics },
    function(err, supportAttachments) {
      SceneUtil.supportAttachmentsToRelations(supportAttachments, supportRelations);
      callback(err, relations);
  });
  return relations;
};

/**
 * Converts support attachments to support relations for export
 * @param supportAttachments {Attachment[]}
 * @param [supportRelations] {SupportRelation[]}
 * @returns {SupportRelation[]}
 */
SceneUtil.supportAttachmentsToRelations = function(supportAttachments, supportRelations) {
  supportRelations = supportRelations || [];
  if (supportAttachments) {
    for (var i = 0; i < supportAttachments.length; i++) {
      var attachment = supportAttachments[i];
      if (attachment) {
        // TODO: Add bbfaceIndex to parentAttachment and position of child attachment point in parent frame
        var parentAttachment = _.pick(attachment.parentAttachment, ['distance', 'faceIndex', 'normSim', 'normal', 'point', 'uv']);
        parentAttachment.meshId = Object3DUtil.getSceneGraphPath(attachment.parentAttachment, attachment.parent);
        supportRelations.push({
          child: attachment.child.userData.id,
          parent: attachment.parent.userData.id,
          parentAttachment: parentAttachment,
          childAttachment: attachment.childAttachment
        });
      }
    }
  }
  return supportRelations;
};

/**
 * Converts support relations to support attachments
 * @param sceneState {scene.SceneState}
 * @param supportRelations {SupportRelation[]}
 * @param [supportAttachments] {Attachment[]}
 * @returns {Attachment[]}
 */
SceneUtil.relationsToSupportAttachments = function(sceneState, supportRelations, supportAttachments) {
  supportAttachments = supportAttachments || [];
  if (supportRelations) {
    for (var i = 0; i < supportRelations.length; i++) {
      var relation = supportRelations[i];
      if (relation) {
        //console.log('do relation', relation);
        var child = sceneState.findNodeById(relation.child);
        //console.log('got child', child);
        var parent = sceneState.findNodeById(relation.parent);
        //console.log('got parent', parent);
        supportAttachments.push({
          child: child,
          childInst: Object3DUtil.getModelInstance(child, false),
          parent: parent,
          parentInst: Object3DUtil.getModelInstance(parent, false),
          parentSurfaceNorm: null, // TODO: populate
          childWorldBBFaceIndex: null, // TODO: populate
          parentAttachment: null, // TODO populate
          childAttachment: null // TODO populate
        });
      }
    }
  }
  return supportAttachments;
};

/**
 * Use BVH to identify subgroups based on the support relations
 * @param sceneState {scene.SceneState}
 * @param supportRelations {scene.SupportRelation[]}
 * @param opts Options for creating a BVH
 * @returns {Map} Mapping of parent to BVH
 */
SceneUtil.identifyGroupings = function(sceneState, supportRelations, opts) {
  console.time('identifyGroupings');
  opts = opts || {};
  var bvhConfig = _.defaults(Object.create(null), opts, {
    splitStrategy: BVH.SplitStrategy.SURFACE_AREA_HEURISTIC,
    axisChoiceStrategy: BVH.AxisChoiceStrategy.OPTIMAL
  });
  var groupedRelations = _.groupBy(supportRelations, 'parent');
  var grouped = _.mapValues(groupedRelations, function(rels) {
    var object3Ds = _.map(rels, function (rel) {
      var object3D = sceneState.findNodeById(rel.child);
      return object3D;
    });
    var bvh = new BVH(object3Ds, bvhConfig);
    return bvh;
  });
  console.timeEnd('identifyGroupings');
  return grouped;
};

/**
 * Tries to identify outlier objects that are shouldn't be part of the scene
 * @param sceneState
 * @param opts
 * @returns {{outliers: Array, root: *}}
 */
SceneUtil.detectOutlierObjects = function(sceneState, opts) {
  console.time('detectOutlierObjects');
  opts = opts || {};
  var bvh = opts.bvh;
  var minObjects = opts.minObjects || 10;
  var maxDistance = (opts.maxDistance != undefined)? opts.maxDistance : 0.25*Constants.metersToVirtualUnit;
  var upFilter = triangleUpFilter.bind(null, Constants.worldUp);
  var vu2m2 = Constants.virtualUnitToMeters * Constants.virtualUnitToMeters;
  function isOkay(node) {
    if (node.objects.length > minObjects) { return true; }
    var totalSurfaceArea = 0;
    for (var i = 0; i < node.objects.length; i++) {
      var obj = node.objects[i];
      if (/*obj.userData.type === 'Ceiling' || */ obj.userData.type === 'Floor' || obj.userData.type ==='Ground') {
        var surfaceArea = Object3DUtil.getSurfaceArea(obj, { includeChildModelInstance: false, triFilter: upFilter }) * vu2m2;
        totalSurfaceArea += surfaceArea;
        console.log('Surface area: ' + surfaceArea + ', total: ' + totalSurfaceArea + ', bb: ' + Object3DUtil.getBoundingBox(obj).toString());
        if (totalSurfaceArea > 3) {
          return true;
        }
      }
    }
    return false;
  }
  if (!bvh) {
    var bvhConfig = _.defaults(Object.create(null), opts, {
      splitStrategy: BVH.SplitStrategy.SURFACE_AREA_HEURISTIC,
      axisChoiceStrategy: BVH.AxisChoiceStrategy.OPTIMAL
    });
    var object3Ds = sceneState.getObject3Ds();
    bvh = new BVH(object3Ds, bvhConfig);
  }
  var outliers = [];
  var root = bvh.root;
  while (root.left && root.right) {
    var left = root.left;
    var right = root.right;
    // Check if the two branches are disjoint or close together
    var bbDistance = left.bbox.distanceTo(right.bbox); // 0 if intersecting
    if (Constants.isBrowser) {
      console.log('BBDistance: ' + bbDistance, left, right);
    }
//    if (left.bbox.intersects(right.bbox)) {
    if (bbDistance <= maxDistance) { // Less than some distance apart
      break;
    } else {
      // Check two sides of root to make sure both have room or ground
      var lOkay = isOkay(left);
      var rOkay = isOkay(right);
      if (!lOkay || !rOkay) {
        if (!lOkay && !rOkay) {
          console.warn('Neither branch good, giving up');
          break;
        } else {
          // Check difference between left and right
          if (!lOkay) {
            outliers = outliers.concat(left.objects);
            root = right;
          } else {
            outliers = outliers.concat(right.objects);
            root = left;
          }
        }
      } else {
        break;
      }
    }
  }
  console.timeEnd('detectOutlierObjects');
  if (Constants.isBrowser) {
    console.log('New root ', root);
    console.log('Outliers ', outliers);
  }
  return { outliers: outliers, root: root };
};

SceneUtil.getAggregatedSceneStatistics = function(cache, cb, opts) {
  opts = opts || {};
  if (cache.aggregatedSceneStatistics) {
    setTimeout(function() { cb(null, cache.aggregatedSceneStatistics); }, 0);
  } else {
    var p5dSceneAssetGroup = AssetGroups.getAssetGroup('p5dScene');
    cache.aggregatedSceneStatistics = new SceneStatistics();
    cache.aggregatedSceneStatistics.importCsvs({
      fs: opts.fs || Constants.sys.fs,
      basename: p5dSceneAssetGroup.rootPath + '/stats/suncg',
      stats: opts.stats || ['materials', 'relations'],
      callback: function(err, data) {
        if (err) {
          console.error('error loading scene statistics', err);
        }
        cb(err, cache.aggregatedSceneStatistics);
      }
    });
  }
};

SceneUtil.visualizeWallLines = function(sceneState, walls) {
  //console.log('visualizeWallLines', walls);
  sceneState.fullScene.updateMatrixWorld();
  var sceneTransformMatrix = new THREE.Matrix4();
  sceneTransformMatrix.copy(sceneState.scene.matrixWorld);
  var unit = 1.0;
  var scaleBy = unit / sceneState.info.defaultUnit;
  var scaleMat = new THREE.Matrix4();
  scaleMat.makeScale(scaleBy, scaleBy, scaleBy);
  sceneTransformMatrix.multiply(scaleMat);

  var wallLines = new THREE.Group();
  wallLines.name = 'WallLines';
  for (var i = 0; i < walls.length; i++) {
    var wall = walls[i];
    var p0 = wall.points[0];
    var p1 = wall.points[1];
    var points1 = wall.points.map(function(p) {
      var res = new THREE.Vector3(p[0], p0[1], p[2]);
      res.applyMatrix4(sceneTransformMatrix);
      return res;
    });
    var points2 = wall.points.map(function(p) {
      var res = new THREE.Vector3(p[0], p1[1], p[2]);
      res.applyMatrix4(sceneTransformMatrix);
      res.y += 0.05*Constants.metersToVirtualUnit;
      return res;
    });
    var line1 = new MeshHelpers.FatLines(points1, 0.05*Constants.metersToVirtualUnit, 'blue');
    wallLines.add(line1);
    var line2 = new MeshHelpers.FatLines(points2, 0.05*Constants.metersToVirtualUnit, 'blue');
    wallLines.add(line2);
  }
  sceneState.debugNode.add(wallLines);
  // Make sure debugNode is visible
  Object3DUtil.setVisible(sceneState.debugNode, true);
  return wallLines;
};

module.exports = SceneUtil;

