var AssetGroups = require('assets/AssetGroups');
var Index = require('ds/Index');
var IndexedCounters = require('ds/IndexedCounters');
var Object3DUtil = require('geo/Object3DUtil');
var async = require('async');
var _ = require('util');

/**
 * Scene statistics that we have computed
 * @constructor
 * @memberOf ssg
 */
function SceneStatistics() {
  // Materials
  this.__materialIndex = new Index({name: 'material', filename: 'materials'});
  this.__textureIndex = new Index({name: 'texture', filename: 'textures'});
  this.__objectMaterialIdIndex = new Index({name: 'object', filename: 'objectMaterialId'});

  this.__objectMaterialCounts = new IndexedCounters({ name: 'materialCounts', indices: [this.__objectMaterialIdIndex, this.__materialIndex]});
  this.__objectTextureCounts = new IndexedCounters({ name: 'textureCounts', indices: [this.__objectMaterialIdIndex, this.__textureIndex]});

  // Relations
  this.__relationIndex = new Index({name: 'relation'});
  this.__objectIdIndex = new Index({name: 'objectId'});
  this.__objectTypeIndex = new Index({name: 'objectType'});
  this.__bbfaceTypeIndex = new Index({name: 'bbfaceType'});
  this.__supportSurfaceTypeIndex = new Index({name: 'supportSurfaceType'});
  this.__objectIdRelationCounts = new IndexedCounters(
    { name: 'objectIdRelationCounts', indices: [this.__relationIndex, this.__objectIdIndex,  this.__objectIdIndex]});
  this.__objectTypeRelationCounts = new IndexedCounters(
    { name: 'objectTypeRelationCounts', indices: [this.__relationIndex, this.__objectTypeIndex,  this.__objectTypeIndex]});
  this.__objectIdChildAttachmentCounts = new IndexedCounters({ name: 'objectIdChildAttachmentCounts', indices: [this.__objectIdIndex, this.__bbfaceTypeIndex]});
  this.__objectTypeChildAttachmentCounts = new IndexedCounters({ name: 'objectTypeChildAttachmentCounts', indices: [this.__objectTypeIndex, this.__bbfaceTypeIndex]});
  this.__objectIdSupportSurfaceCounts = new IndexedCounters({ name: 'objectIdSupportSurfaceCounts', indices: [this.__objectIdIndex, this.__supportSurfaceTypeIndex]});
  this.__objectTypeSupportSurfaceCounts = new IndexedCounters({ name: 'objectTypeSupportSurfaceCounts', indices: [this.__objectTypeIndex, this.__supportSurfaceTypeIndex]});
}

function __getKey(obj, attrnames) {
  var attributes = attrnames.map(function (attr) {
    return obj[attr];
  });
  return attributes.join('-');
}

SceneStatistics.prototype.getMaterialIndex = function() {
  return this.__materialIndex;
};

SceneStatistics.prototype.getTextureIndex = function() {
  return this.__textureIndex;
};

SceneStatistics.prototype.getMaterialKey = function(mat) {
  return __getKey(mat, ['color', 'opacity', 'texture']);
};

SceneStatistics.prototype.getTextureKey = function(mat) {
  return __getKey(mat, ['texture']);
};

SceneStatistics.prototype.hasTexture = function(v) {
  // wallp_1_1 and wallp_0 are not real textures
  return !v.endsWith('-') && !v.endsWith('-wallp_1_1.jpg') && !v.endsWith('-wallp_0.jpg');
};

SceneStatistics.prototype.updateMaterials = function(input) {
  // Update material statistics
  var materials = input.materials? input.materials : input;
  for (var i = 0; i < materials.length; i++) {
    var m = materials[i];
    for (var j = 0; j < m.materials.length; j++) {
      var matInfo = m.materials[j];
      var materialKey = this.getMaterialKey(matInfo);
      var textureKey = this.getTextureKey(matInfo);

      var matIndexSuffix = (matInfo['materialIndex'] != null)? ('#' + matInfo['materialIndex']):'';
      var objectMaterialId = (matInfo['type'] || m.modelId || m.category) + matIndexSuffix;
      this.__objectMaterialCounts.add([objectMaterialId, materialKey]);
      this.__objectTextureCounts.add([objectMaterialId, textureKey]);
    }
  }
};

SceneStatistics.prototype.getTextureCounts = function() {
  return this.__objectTextureCounts;
};

SceneStatistics.prototype.getMaterialCounts = function(filter) {
  if (filter) {
    return this.__objectMaterialCounts? this.__objectMaterialCounts.filter(filter) : null;
  } else {
    return this.__objectMaterialCounts;
  }
};

SceneStatistics.prototype.getTexturedMaterialCounts = function(textureSet) {
  if (this.__objectTexturedMaterialCounts === undefined) {
    var scope = this;
    this.__objectTexturedMaterialCounts = this.getMaterialCounts(function(count, keys, indices) {
      var k = keys[keys.length-1];
      var v = indices[keys.length-1].get(k);
      return scope.hasTexture(v);
    });
  }
  if (!textureSet || textureSet === 'all') {
    return this.__objectTexturedMaterialCounts;
  } else {
    // Break textures apart by set and then return appropriate set
    var textureAssets = AssetGroups.getAssetGroup('p5dTexture');
    if (textureAssets && textureAssets.assetDb) {
      var assetInfos = textureAssets.assetDb.assetInfos;
      var splits = _.groupBy(assetInfos, 'split');
      var counts = this.__objectTexturedMaterialCounts;
      this.__objectTexturedMaterialCountsGrouped = _.mapValues(splits, function(g, k) {
        var textures = new Set(_.map(g, 'name'));
        //console.log('split ' + k, textures);
        return counts.filter(function(count, keys, indices) {
          var k = keys[keys.length-1];
          var v = indices[keys.length-1].get(k);
          var parts = v.split('-');
          var tex = parts[parts.length-1];
          //console.log('checking ' + tex);
          return textures.has(tex);
        });
      });
      //console.log('textureSet ' + textureSet, this.__objectTexturedMaterialCountsGrouped[textureSet]);
      return this.__objectTexturedMaterialCountsGrouped[textureSet];
    } else {
      console.warn('Cannot get texture assets');
      return this.__objectTexturedMaterialCounts;
    }
  }
};

SceneStatistics.prototype.__updatePortals = function(nodesById, portals) {
  for (var i = 0; i < portals.length; i++) {
    var portal = portals[i];
    this.__objectTypeRelationCounts.add(['portal', portal.portalType, 'wall']);
  }
};

SceneStatistics.prototype.__updateSupport = function(nodesById, support) {
  var assetGroup = AssetGroups.getAssetGroup('p5d');

  function getNode(nodeId) {
    var node = nodesById[nodeId];
    if (node) { return node; }
    if (nodeId.endsWith('f')) {
      // Floor
      return { type: 'Floor' };
    } else if (nodeId.endsWith('c')) {
      // Ceiling
      return { type: 'Ceiling' };
    } else {
      // TODO: Try to split into 3 and see if it is a wall
      return { type: 'Wall' };
    }
  }

  function getObjectId(node) {
    return (node.type === 'Object')? 'p5d.' + node.modelId : node.type;
  }

  function getObjectTypes(node) {
    // TODO: Lookup object type from modelId
    if (node.type === 'Object') {
      var modelInfo = assetGroup.getAssetInfo('p5d.' + node.modelId);
      return modelInfo.category;
    } else {
      return [node.type];
    }
  }

  var supportSurfaces = ['vertical', 'vertical', 'down', 'up', 'vertical', 'vertical'];
  var attachmentTypes = ['left','right','bottom','top','front','back'];
  for (var si = 0; si < support.length; si++) {
    var s = support[si];
    var parentNode = getNode(s.parent);
    var childNode = getNode(s.child);
    var parentId = getObjectId(parentNode);
    var childId = getObjectId(childNode);
    var parentTypes = getObjectTypes(parentNode);
    var childTypes = getObjectTypes(childNode);
    // Update relation counts
    this.__objectIdRelationCounts.add(['supports', parentId, childId]);
    this.__objectIdRelationCounts.add(['supportedBy', childId, parentId]);
    for (var i = 0; i < parentTypes.length; i++) {
      var parentType = parentTypes[i];
      for (var j = 0; j < childTypes.length; j++) {
        var childType = childTypes[j];
        this.__objectTypeRelationCounts.add(['supports', parentType, childType]);
        this.__objectTypeRelationCounts.add(['supportedBy', childType, parentType]);
      }
    }
    // Update support surface counts
    var parentAttachment = s.parentAttachment;
    // TODO: Get directly from data
    parentAttachment.bbfaceIndex = Object3DUtil.findClosestBBFaceByOutNormal(Object3DUtil.toVector3(parentAttachment.normal));
    var supportSurface = supportSurfaces[parentAttachment.bbfaceIndex];
    this.__objectIdSupportSurfaceCounts.add([parentId, supportSurface]);
    for (var i = 0; i < parentTypes.length; i++) {
      var parentType = parentTypes[i];
      this.__objectTypeSupportSurfaceCounts.add([parentType, supportSurface]);
    }
    // Update attachment
    var childAttachment = s.childAttachment;
    var attachmentType = attachmentTypes[childAttachment.bbfaceIndex];
    this.__objectIdChildAttachmentCounts.add([childId, attachmentType]);
    for (var j = 0; j < childTypes.length; j++) {
      var childType = childTypes[j];
      this.__objectTypeChildAttachmentCounts.add([childType, attachmentType]);
    }
  }

};

SceneStatistics.prototype.updateRelations = function(scene, sceneStats) {
  // Update support hierarchy and other relation statistics
  var relations = sceneStats.relations;
  var instanceLookupTable = {};
  for (var i = 0; i < scene.levels.length; i++) {
    var level = scene.levels[i];
    for (var j = 0; j < level.nodes.length; j++) {
      var node = level.nodes[j];
      instanceLookupTable[node.id] = node;
    }
  }
  //this.__updatePortals(instanceLookupTable, relations.portals);
  this.__updateSupport(instanceLookupTable, relations.support);
};

SceneStatistics.prototype.importCsvs = function(opts) {
  var statsToExport = opts.stats || ['materials'];
  var funcNames = _.map(statsToExport, function(s) { return '__' + s + '_importCsvs'; });
  this.__run(funcNames, opts);
};

SceneStatistics.prototype.exportCsvs = function(opts) {
  var statsToExport = opts.stats || ['materials'];
  var funcNames = _.map(statsToExport, function(s) { return '__' + s + '_exportCsvs'; });
  this.__run(funcNames, opts);
};

SceneStatistics.prototype.__run = function(names, opts) {
  var scope = this;
  var jobs = _.map(names, function(name) {
    return function(cb) {
      if (scope[name]) {
        scope[name](_.defaults({callback: cb}, opts));
      } else {
        console.error('No function with name: SceneStatistics.' + name);
      }
    }
  });
  async.parallel(jobs, function(err, results) {
    opts.callback(err, results);
  });
};

SceneStatistics.prototype.__exportStats = function(stats, opts) {
  var jobs = _.map(stats, function(stat) {
    return function(cb) {
      stat.exportCsv({
        fs: opts.fs,
        filename: opts.basename + '.' + stat.filename + '.csv',
        callback: cb
      });
    }
  });
  async.parallel(jobs, function(err, results) {
    opts.callback(err, results);
  });
};

SceneStatistics.prototype.__importStats = function(stats, opts) {
  var jobs = _.map(stats, function(stat) {
    return function(cb) {
      stat.importCsv({
        fs: opts.fs,
        filename: opts.basename + '.' + stat.filename + (opts.useSavedIndex? '.index':'') + '.csv',
        useSavedIndex: opts.useSavedIndex,
        callback: cb
      });
    }
  });
  async.parallel(jobs, function(err, results) {
    opts.callback(err, results);
  });
};

// Relations
SceneStatistics.prototype.__relations_importCsvs = function(opts) {
  var scope = this;
  console.time('importRelationCsvs');
  async.series([
    function (callback) {
      scope.__importStats([
        scope.__objectIdIndex, scope.__objectTypeIndex, scope.__relationIndex,
        scope.__bbfaceTypeIndex, scope.__supportSurfaceTypeIndex],
        {
          fs: opts.fs,
          basename: opts.basename,
          callback: function(err,res) {
            console.log('imported relation indices');
            callback(err, res)
          }
        }
      );
    },
    function (callback) {
      scope.__importStats([
          scope.__objectIdRelationCounts, scope.__objectTypeRelationCounts,
          scope.__objectIdChildAttachmentCounts, scope.__objectTypeChildAttachmentCounts,
          scope.__objectIdSupportSurfaceCounts, scope.__objectTypeSupportSurfaceCounts],
        {
          fs: opts.fs,
          basename: opts.basename,
          useSavedIndex: true,
          callback: function(err,res) {
            console.log('imported relation counts');
            callback(err, res)
          }
        }
      );
    }
  ], function(err, results) {
    opts.callback(err, results);
    console.timeEnd('importRelationCsvs');
  });
};

SceneStatistics.prototype.__relations_exportCsvs = function(opts) {
  var scope = this;
  scope.__exportStats([
      // indices
      scope.__objectIdIndex, scope.__objectTypeIndex, scope.__relationIndex,
      scope.__bbfaceTypeIndex, scope.__supportSurfaceTypeIndex,
      // counts
      scope.__objectIdRelationCounts, scope.__objectTypeRelationCounts,
      scope.__objectIdChildAttachmentCounts, scope.__objectTypeChildAttachmentCounts,
      scope.__objectIdSupportSurfaceCounts, scope.__objectTypeSupportSurfaceCounts
  ], opts);
};

// Materials
SceneStatistics.prototype.__materials_importCsvs = function(opts) {
  var scope = this;
  console.time('importMaterialCsvs');
  async.series([
    function (callback) {
      scope.__importStats(
        [scope.__materialIndex, scope.__textureIndex, scope.__objectMaterialIdIndex],
        {
          fs: opts.fs,
          basename: opts.basename,
          callback: function(err,res) {
            console.log('imported material indices');
            callback(err, res)
          }
        }
      );
    },
    function (callback) {
      scope.__importStats(
        [scope.__objectMaterialCounts, scope.__objectTextureCounts],
        {
          fs: opts.fs,
          basename: opts.basename,
          useSavedIndex: true,
          callback: function(err,res) {
            console.log('imported material counts');
            callback(err, res)
          }
        }
      );
    }
  ], function(err, results) {
    opts.callback(err, results);
    console.timeEnd('importMaterialCsvs');
  });
};

SceneStatistics.prototype.__materials_exportCsvs = function(opts) {
  var scope = this;
  scope.__exportStats([
    scope.__materialIndex, scope.__textureIndex, scope.__objectMaterialIdIndex,
    scope.__objectMaterialCounts, scope.__objectTextureCounts], opts);
};

module.exports = SceneStatistics;