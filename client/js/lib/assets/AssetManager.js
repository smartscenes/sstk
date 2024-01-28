'use strict';

var Constants = require('Constants');
var Sounds = require('audio/Sounds');
var Model = require('model/Model');
var SceneState = require('scene/SceneState');
var LightsLoader = require('assets/LightsLoader');
var Object3DLoader = require('loaders/Object3DLoader');
var AssetGroups = require('assets/AssetGroups');
var AssetLoaders = require('assets/AssetLoaders');
var CachedAssetLoader = require('assets/CachedAssetLoader');
var AssetCache = require('assets/AssetCache');
var AssetLoader = require('assets/AssetLoader');
var Object3DUtil = require('geo/Object3DUtil');
var Materials = require('materials/Materials');
var TaskQueue = require('util/TaskQueue');
var PubSub = require('PubSub');
var async = require('async');
var _ = require('util/util');

// TODO: Cache model, geometries, materials, textures
// TODO: Simplify convoluted model loading code
// Loaders (OBJMTLLoader, ColladaLoader, UTFv8Loader)
//   will need to be updated so they can use the cache
// Cache from url to geometry/texture
// Cache from modelId to object3D, materialId to material
// TODO: Compression of obj/collada models

/**
 * Class for handling loading and retrieving of assets
 * @param params Configuration for asset manager
 * @param [params.searchController] {SearchController}
 * @param [params.assetCacheSize] {number} Size of asset cache
 * @param [params.cacheSettings] {Object} Cache settings keyed on asset type
 * @param [params.autoAlignModels=false] {boolean} If true, models are automatically aligned when loaded
 * @param [params.autoScaleModels=true] {boolean} If true, models are automatically rescaled when loaded
 * @param [params.autoLoadVideo=false] {boolean} If true, videos for models with video textures are loaded along with models
 * @param [params.enableLights=false] {boolean} If true, lights are enabled for models with lights.
 * @param [params.defaultLightState=false] {boolean} If true, lights are turned on for models with lights (requires `enableLights` to be true)
 * @param [params.includeModelInfo=true] {boolean} If true, model info is automatically queried from solr
 * @param [params.previewImageIndex=-1] {int} Which image to use for preview
 * @param [params.modelFilter=true] {function(model.ModelInfo): boolean} If true, model is loaded
 * @param [params.maxAnisotropy] {number}
 * @param [params.defaultSceneFormat='wss'] {string}
 * @param [params.useColladaScale=null] {boolean} Whether to apply the unit found in Collada files.  If specified, will override `applyScale` in load model options
 * @param [params.convertUpAxis=null] {boolean} Whether to convert up axis of Collada files.  If specified, will override `convertUpAxis` in load model options
 * @param [params.supportArticulated=false] {boolean} Whether to load articulation information and split model into separate meshes for articulation
 * @param [params.mergeFixedParts=false] {boolean} Whether to merge fixed parts into single meshes (if `supportArticulated` is `true`)
 * @constructor
 * @memberOf assets
 */
function AssetManager(params) {
  PubSub.call(this);
  // Whether to try to return modelInfo with model (true by default)
  this.includeModelInfo = true;

  // Cache of asset infos - can make into fancier cache if needed...
  this.__assetInfoCache = new AssetCache();
  this.__prefetchedQueryKeys = {};

  // Cache of assets
  var defaultCacheSettings = params? { assetCacheSize: params.assetCacheSize } : undefined;
  var cacheSettings = {};
  ['model', 'scene', 'other'].forEach(function(x) {
    var s = (params && params.cacheSettings)? params.cacheSettings[x] : undefined;
    cacheSettings[x] = s || defaultCacheSettings;
  });
  //console.log('cacheSettings', cacheSettings);
  this.__cachedAssetLoaders = {
    'model': new CachedAssetLoader(cacheSettings['model']),
    'scene': new CachedAssetLoader(cacheSettings['scene']),
    'other': new CachedAssetLoader(cacheSettings['other'])
  };

  // Whether to auto align models with world or not
  this.autoAlignModels = false;

  // Whether to auto scale models or not
  this.autoScaleModels = true;

  // Whether to automatically load a video (for p5d models with "video" texture)
  this.autoLoadVideo = false;

  // What image to use for the preview (-1 for original image)
  this.previewImageIndex = -1;

  // Use collada scale?
  this.useColladaScale = undefined;

  // Convert up axis
  this.convertUpAxis = undefined;

  // Optional filter function takes modelinfo as input and returns whether to load model
  this.modelFilter = undefined;

  // Default scene format
  this.defaultSceneFormat = 'wss';

  // Asset loader helper for loading from file or url
  this.assetLoader = new AssetLoader();

  // Mapping of asset loader by type and format
  // TODO: Put object loaders here too
  this.__assetLoaders = {};

  // Custom material bindings
  this.__materialBindingsByModelId = {};

  // Custom assetDbs (additional model information)
  // Currently just one big pile...
  this.__assetsDbs = [];

  // Max anisotropy for textures
  this.maxAnisotropy = undefined;

  // Whether lights are automatically created and loaded
  this.autoLoadLights = true;

  if (params) {
    // Search controller for fetching modelInfos
    this.searchController = params.searchController;

    if (params.autoAlignModels !== undefined) this.autoAlignModels = params.autoAlignModels;
    if (params.autoScaleModels !== undefined) this.autoScaleModels = params.autoScaleModels;
    if (params.autoLoadVideo !== undefined) this.autoLoadVideo = params.autoLoadVideo;
    if (params.autoLoadLights !== undefined) this.autoLoadLights = params.autoLoadLights;
    if (params.includeModelInfo !== undefined) this.includeModelInfo = params.includeModelInfo;
    if (params.previewImageIndex !== undefined) this.previewImageIndex = params.previewImageIndex;
    if (params.useColladaScale !== undefined) this.useColladaScale = params.useColladaScale;
    if (params.convertUpAxis !== undefined) this.convertUpAxis = params.convertUpAxis;
    if (params.modelFilter !== undefined) this.modelFilter = params.modelFilter;
    if (params.defaultSceneFormat !== undefined) this.defaultSceneFormat = params.defaultSceneFormat;
    if (params.maxAnisotropy !== undefined) this.maxAnisotropy = params.maxAnisotropy;
    if (params.supportArticulated !== undefined) this.supportArticulated = params.supportArticulated;
    if (params.mergeFixedParts !== undefined) this.mergeFixedParts = params.mergeFixedParts;
  }

  // Fields we want to preserve and send to the scene loaders
  this.__sceneLoadInfoFields = ['preload', 'freezeObjects', 'floor', 'level', 'room', 'archIds',
    'includeCeiling', 'includeWalls', 'includeFloor',
    'attachWallsToRooms', 'useVariants',
    'useDefaultMaterials', 'archOptions', 'adjustReplacementTransforms',
    'createArch', 'useArchModelId', 'ignoreOriginalArchHoles',
    'keepInvalid', 'keepHidden', 'keepParse', 'keepMaterialInfo', 'precomputeAttachments',
    'hideCategories', 'hideModelIds', 'replaceModels', 'loadModelFilter', 'skipElements',
    'emptyRoom', 'archOnly', 'defaultModelFormat', 'data'];

  this.__lightsLoader = new LightsLoader(params);

  this.defaultSource = null; // TODO: set

  this.__registerDefaultLoaders();
}

AssetManager.prototype = Object.create(PubSub.prototype);
AssetManager.prototype.constructor = AssetManager;

AssetManager.toSourceId = function (defaultSource, id) {
  if (!defaultSource) defaultSource = Constants.defaultModelSource;
  var pos = id.indexOf('.');
  var source = defaultSource;
  if (pos > 0) {
    source = id.substring(0, pos);
    id = id.substring(pos + 1);
  }
  return { source: source, id: id, fullId: source + '.' + id };
};

AssetManager.toFullId = function (defaultSource, id) {
  if (!defaultSource) defaultSource = Constants.defaultModelSource;
  var pos = id.indexOf('.');
  return (pos > 0) ? id : defaultSource + '.' + id;
};

AssetManager.prototype.toFullId = function(defaultSource, id) {
  return AssetManager.toFullId(defaultSource, id);
};

AssetManager.prototype.setSearchController = function (searchController) {
  this.searchController = searchController;
};

AssetManager.prototype.getMaterial = function(materialOptions, metadata) {
  if (metadata) {
    var assetManager = this;
    materialOptions = _.mapValues(materialOptions, function (v, k) {
      if (Materials.textureMapFields.indexOf(k) >= 0) {
        if (!_.isUrl(v) && !_.isDataUrl(v)) {
          v = assetManager.getTexturePath(metadata.source, v, metadata);
        }
      }
      return v;
    });
  }
  return Materials.createMaterial(materialOptions);
};

AssetManager.prototype.getColoredMaterial = function (colorname, hex, options) {
  var side = (options && options.side) ? options.side : THREE.FrontSide;
  var name = (options && options.name) ? options.name : colorname;
  var c = new THREE.Color(parseInt(hex, 16));
  var a = new THREE.Color();
  a.setRGB(c.r / 4, c.g / 4, c.b / 4);
  var s = new THREE.Color();
  s.setRGB(0.18, 0.18, 0.18);
  var p = Materials.updateMaterialParams(Materials.DefaultMaterialType, {
      color: c, /*ambient: a, */
      specular: s,
      shininess: 64,
      side: side,
      name: name
    });
  var matType = options.type? Materials.getMaterialType(options.type) : Materials.DefaultMaterialType;
  return new matType(p);
};

AssetManager.prototype.getMaterialDefaults = function() {
  return { type: 'MeshPhysicalMaterial' };
};

AssetManager.prototype.getTextureDefaults = function() {
  return { wrap: [THREE.RepeatWrapping,THREE.RepeatWrapping] };
};

AssetManager.prototype.loadMaterials = function(json, options) {
  options = _.defaults(Object.create(null), options || {}, { resourcePath: Constants.baseUrl });
  var objectLoader = new THREE.ObjectLoader(THREE.DefaultLoadingManager);
  objectLoader.resourcePath = options.resourcePath;
  var images = objectLoader.parseImages(json.images, function () {
//    if ( onLoad !== undefined ) { onLoad( object ); }
  });
  var texturesJson = json.textures.map(t => _.defaults(Object.create(null), t, this.getTextureDefaults()));
  var textures = objectLoader.parseTextures(texturesJson, images);
  var materialsJson = json.materials.map(m => _.defaults(Object.create(null), m, this.getMaterialDefaults()));
  var materials = objectLoader.parseMaterials(materialsJson, textures);
  return materials;
};

AssetManager.prototype.getTexture = function (url, options) {
  // TODO: Cache textures
  options = _.defaults(Object.create(null), { url: url }, options || {}, { anisotropy: this.maxAnisotropy });
  return Materials.createTexture(options);
};

AssetManager.prototype.getTexturedMaterialFromUrl = function (name, url, options) {
  var texture = this.getTexture(url, options);
  var side = (options && options.side) ? options.side : THREE.FrontSide;
  var mname = (name !== undefined) ? name : null;
  var matType = options.type? Materials.getMaterialType(options.type) : Materials.DefaultMaterialType;
  return new matType({ map: texture, side: side, name: mname });
};

AssetManager.prototype.getTexturePath = function (source, id, metadata) {
  if (!metadata) {
    metadata = this.getAssetInfo(AssetManager.toFullId(source, id));
  }
  var sid = AssetManager.toSourceId(source, id);

  var assetGroup = AssetGroups.getAssetGroup(sid.source);
  if (assetGroup && assetGroup.type === 'texture') {
    return assetGroup.getImageUrl(sid.id, 'texture', metadata);
  } else {
    console.error('Unknown texture source: ' + sid.source);
  }
};

AssetManager.prototype.getTexturedMaterial = function (source, id, options) {
  if (!options) options = {};
  var name = AssetManager.toFullId(source, id);
  var path = this.getTexturePath(source, id, options.metadata);
  if (path) {
    return this.getTexturedMaterialFromUrl(name, path, options);
  } else {
    console.warn('Cannot get path for ' + name);
  }
};

AssetManager.prototype.refreshAssetInfo = function (source, id) {
  var fullId = AssetManager.toFullId(source, id);
  this.__assetInfoCache.clear(fullId);
};

AssetManager.prototype.registerAssetsDb = function (assetsDb) {
  this.__assetsDbs.push(assetsDb);
};

AssetManager.prototype.__augmentAssetInfo = function (info) {
  // Augments asset info with information from registered assetsDb
  // for (var k in this.__assetsDbs) {
  //   if (this.__assetsDbs.hasOwnProperty(k)) {
  //     var assetsDb = this.__assetsDbs[k];
  //     var assetInfo = assetsDb.getAssetInfo(info.fullId);
  //     if (assetInfo) {
  //       _.merge(info, assetInfo);
  //     }
  //   }
  // }
  var assetInfo = this.getAssetInfo(info.fullId);
  if (assetInfo) {
    _.merge(info, assetInfo);
  }
};

AssetManager.prototype.__getMergedModelLoadInfo = function(info) {
  // merge information from loadModeInfo into modelinfo
  var merged = _.clone(info);
  var loadModelInfo = this.getLoadModelInfo(null, info.fullId, info);
  if (loadModelInfo) {
    for (var prop in loadModelInfo) {
      if (prop == 'name') { continue; } // HACK!!!! Filter out weird load format name
      if (loadModelInfo.hasOwnProperty(prop) && (!merged.hasOwnProperty(prop) ||
          (loadModelInfo.overrideFields && loadModelInfo.overrideFields[prop]))) {
        merged[prop] = loadModelInfo[prop];
      }
    }
  }
  return merged;
};

AssetManager.prototype.__getCachedModelInfo = function (source, id, loadinfo) {
  var fullId = AssetManager.toFullId(source, id);
  var cached = this.__assetInfoCache.get(fullId);
  if (cached && loadinfo) {
    // TODO: consider if we dropped anything else from loadinfo
    var info = _.defaults(Object.create(null), cached, { format: loadinfo.formatName });
    if (loadinfo.copyFields) {
      _.merge(info, _.pick(loadinfo, loadinfo.copyFields));
    }
    var merged = this.__getMergedModelLoadInfo(info);
    if (loadinfo.options) {
      merged.options = _.merge(merged.options || {}, loadinfo.options);
    }
    merged.format = loadinfo.format || merged.format;  // HACK: Fix format
    return merged;
  } else {
    return cached;
  }
};

AssetManager.prototype.cacheAssetInfos = function (source, assetInfos) {
  //if (!this.includeModelInfo) return;  // No need to cache....
  for (var i = 0; i < assetInfos.length; i++) {
    var info = assetInfos[i];
    this.__augmentAssetInfo(info);

    var fullId = (info.fullId) ? info.fullId : AssetManager.toFullId(source, info.id);
    // console.log('caching model info', info, fullId);
    this.__assetInfoCache.set(fullId, info);
  }
};
AssetManager.prototype.cacheModelInfos = AssetManager.prototype.cacheAssetInfos;

AssetManager.prototype.getAssetGroup = function (source) {
  return AssetGroups.getAssetGroup(source);
};

AssetManager.prototype.getSourceDataType = function (source) {
  var assetGroup = this.getAssetGroup(source);
  if (assetGroup) {
    return assetGroup.type;
  } else {
    if (source === 'models3d') {
      return Constants.assetTypeModel;
    } else if (source === 'scans') {
      return Constants.assetTypeScan;
    } else if (source === 'scenes') {
      return Constants.assetTypeScene;
    } else if (source === 'rooms') {
      return Constants.assetTypeRoom;
    } else if (source === 'textures') {
      return Constants.assetTypeTexture;
    } else {
      console.error('Unknown source: ' + source);
    }
  }
};

AssetManager.prototype.queryAssetGroup = function(options, callback) {
  if (options.source == null) {
    callback('Source not specified');
    return;
  }
  var assetGroup = AssetGroups.getAssetGroup(options.source);
  if (assetGroup && assetGroup.assetDb) {
    assetGroup.assetDb.query(options, callback);
  } else if (this.searchController) {
    this.searchController.query(options, callback);
  } else {
    callback('Cannot perform query without searchController');
    return;
  }
};

AssetManager.prototype.getAssetInfo = function(id) {
  if (id != undefined) {
    var sid = AssetManager.toSourceId(null, id);
    var assetGroup = AssetGroups.getAssetGroup(sid.source);
    var assetInfo = null;
    if (assetGroup) {
      assetInfo = assetGroup.getAssetInfo(sid.source + '.' + sid.id);
    }
    if (!assetInfo) {
      assetInfo = this.__assetInfoCache.get(id);
    }
    return assetInfo;
  } else {
    console.error('Asset id undefined');
  }
};

AssetManager.prototype.getLoadInfo = function (source, id, metadata) {
  var sid = AssetManager.toSourceId(source, id);
  var assetGroup = this.getAssetGroup(sid.source);
  if (assetGroup) {
    var format = metadata? (metadata.format || metadata.defaultFormat) : undefined;
    var loadInfo = assetGroup.getLoadInfo(sid.id, format, metadata);
    if (loadInfo) {
      loadInfo.formatName = loadInfo.format;
      if (loadInfo.name && loadInfo.name != loadInfo.format) {
        loadInfo.formatName = loadInfo.name;
      }
    }
    switch (assetGroup.type) {
      // Model - return model load info
      case Constants.assetTypeScan:
      case Constants.assetTypeModel: {
        if (loadInfo) {
          // augment options
          if (!loadInfo.options) {
            loadInfo.options = {};
          }
          if (!loadInfo.options.hasOwnProperty('autoAlign')) {
            loadInfo.options['autoAlign'] = this.autoAlignModels;
          }
          if (!loadInfo.options.hasOwnProperty('autoScale')) {
            loadInfo.options['autoScale'] = this.autoScaleModels;
          }
        }
        if (assetGroup.lightSpecs) {
          loadInfo.lightSpecs = assetGroup.lightSpecs[sid.id];
        }
        return loadInfo;
      }
      // Other types - return loadInfo
      default:
        return loadInfo || {};
    }
  } else {
    console.error('Unknown source: ' + sid.source);
    console.error('Original source: ' + source);
  }
};

AssetManager.prototype.getLoadModelInfo = function (source, id, metadata) {
  return this.getLoadInfo(source, id, metadata);
};

AssetManager.prototype.getAllImageUrls = function (source, id, metadata) {
  var sid = AssetManager.toSourceId(source, id);
  var assetGroup = this.getAssetGroup(sid.source);
  if (assetGroup) {
    return assetGroup.getAllImageUrls(sid.id, metadata);
  } else {
    console.error('Unknown source: ' + source);
  }
};

AssetManager.prototype.getOriginalSourceUrl = function (source, id) {
  var sid = AssetManager.toSourceId(source, id);
  var assetGroup = this.getAssetGroup(sid.source);
  if (assetGroup) {
    return assetGroup.getOriginalSourceUrl(sid.id);
  } else {
    console.error('Unknown source: ' + source);
  }
};

AssetManager.prototype.getImagePreviewUrl = function (source, id, index, metadata) {
  var sid = AssetManager.toSourceId(source, id);
  var assetGroup = this.getAssetGroup(sid.source);
  metadata = _.defaults(Object.create(null), metadata, this.getAssetInfo(sid.fullId));
  var idx = (index === undefined) ? this.previewImageIndex : index;
  if (assetGroup) {
    return assetGroup.getImagePreviewUrl(sid.id, idx, metadata);
  } else {
    console.error('Unknown source: ' + sid.source + ', original source ' + source);
  }
};

AssetManager.prototype.__getCachingLoader = function(assetType, format) {
  return this.__cachedAssetLoaders[assetType] || this.__cachedAssetLoaders['other'];
};

AssetManager.prototype.clearCache = function(cacheTypes) {
  var scope = this;
  if (cacheTypes) {
    if (!Array.isArray(cacheTypes)) {
      cacheTypes = [cacheTypes];
    }
    _.each(cacheTypes, function(cacheType) {
      var loader = scope.__cachedAssetLoaders[cacheType];
      if (loader) {
        loader.getCache().clear();
      }
    });
  } else {
    _.each(this.__cachedAssetLoaders, function (loader) {
      loader.getCache().clear();
    });
  }
};

AssetManager.prototype.getModelInstance = function (source, id, callback, onerror, metadata) {
  var sid = AssetManager.toSourceId(source, id);
  if (!onerror) {
    onerror = function(err) { console.error(err); };
  }
  if (sid.source === 'shape') {
    // special shape creator - create dummy shape model
    if (sid.id === 'box') {
      // TODO: use ShapeGenerator to generate shapes
      var box = new THREE.BoxGeometry(1,1,1);
      var mesh = new THREE.Mesh(box, Object3DUtil.TransparentMat);
      var model = new Model(mesh, { id: sid.id, fullId: AssetManager.toFullId(sid.source, sid.id), source: sid.source, unit: this.virtualUnitToMeters });
      callback(model.newInstance(false));
    } else {
      onerror('Unsupported shape ' + sid.id);
    }
  } else if (sid.source === 'uri' || sid.source === 'file' || sid.source === 'path') {
    var modelInfo = _.defaults({file: sid.id}, metadata);
    return this.getModelInstanceFromLoadModelInfo(modelInfo, callback, onerror);
  } else {
    var modelInfo = this.getLoadModelInfo(source, id, metadata);
    if (modelInfo) {
      return this.getModelInstanceFromLoadModelInfo(modelInfo, callback, onerror);
    } else {
      onerror('Cannot determine load info for model ' + sid.source + '.' + sid.id);
    }
  }
};

AssetManager.prototype.getModelInstanceFromLoadModelInfo = function (modelInfo, callback, onerror) {
  var scope = this;
  var loader = this.__getCachingLoader('model');
  var clone = modelInfo.skipCache? false : !!loader.getCache();
  scope.__getModelWithModelInfoLookup(modelInfo, function(model) {
    callback(model.newInstance(clone));
  }, onerror);
  // this.prefetchModelInfosForAssetGroup(modelInfo.source, function(err, data) {
  //   scope.__getModelInstanceWithModelInfoLookup(modelInfo, callback, onerror);
  // });
};

AssetManager.prototype.__getModelWithModelInfoLookup = function (modelInfo, callback, onerror) {
  var scope = this;
  return this.__lookupModelInfo(modelInfo, function(info) {
    return scope.__loadModel(info, callback, onerror);
  });
};

AssetManager.prototype.lookupModelInfo = function(source, id, callback) {
  var sid = AssetManager.toSourceId(source, id);
  return this.__lookupModelInfo(sid, callback);
};

AssetManager.prototype.__lookupModelInfo = function (modelInfo, callback) {
  //console.log('lookupModelInfo', modelInfo);
  if (modelInfo.id == undefined && modelInfo.fullId) {
    var sid = AssetManager.toSourceId(null, modelInfo.fullId);
    modelInfo.source = sid.source;
    modelInfo.id = sid.id;
  }
  if (this.includeModelInfo && modelInfo.id != undefined) {
    var cachedModelInfo = this.__getCachedModelInfo(modelInfo.source, modelInfo.id, modelInfo);
    if (cachedModelInfo) {
      modelInfo = cachedModelInfo;
    } else {
      var assetGroup = AssetGroups.getAssetGroup(modelInfo.source);
      if (assetGroup) {
        // Lookup info from local asset group (will potentially update if search controller is specified)
        var localGroupAssetInfo = assetGroup.getAssetInfo(modelInfo.source + '.' + modelInfo.id);
        if (localGroupAssetInfo) {
          this.cacheModelInfos(modelInfo.source, [localGroupAssetInfo]);
          modelInfo = this.__getCachedModelInfo(modelInfo.source, modelInfo.id, modelInfo);
        }
      }
    }

    if (!cachedModelInfo && this.searchController) {
      var scope = this;
      // Handle when we don't yet have info for this model.... need to explicitly fetch it
      var fullId = AssetManager.toFullId(modelInfo.source, modelInfo.id);
      var query = this.searchController.getQuery('fullId', fullId);
      //console.log('search for ' + query);
      // NOTE: Use modelinfo cache
      var loader = this.__getCachingLoader('modelinfo');
      loader.load({
        skipCache: true,
        key: 'modelinfo-' + fullId,
        loadFn: function(opts, cb) {
          scope.searchController.query({ source: modelInfo.source, query: query, start: 0, limit: 1 }, cb);
        },
        loadOpts: null,
        callback: function(err, data) {
          var info;
          if (err) {
            console.error('Search for ' + query + ' failed', err);
          } else {
            scope.cacheModelInfos(modelInfo.source, data.response.docs);
            info = scope.__getCachedModelInfo(modelInfo.source, modelInfo.id, modelInfo);
          }
          if (!info) info = modelInfo;
          return callback(info);
        }
      });
      return;
    }
  }
  return callback(modelInfo);
};

AssetManager.prototype.getModelInstanceFromModelInfo = function (modelInfo, onsuccess, onerror) {
  var loader = this.__getCachingLoader('model');
  var clone = modelInfo.skipCache? false : !!loader.getCache();
  return this.__loadModel(modelInfo, function (model) {
    onsuccess(model.newInstance(clone));
  }, onerror);
};

AssetManager.prototype.prefetchModelInfosForAssetGroup = function (name, callback) {
  var assetGroup = AssetGroups.getAssetGroup(name);
  if (assetGroup && assetGroup.prefetchModelInfo) {
    this.prefetchModelInfos(assetGroup.prefetchModelInfo, undefined, callback);
  } else {
    if (callback) {
      callback('No prefetch info', null);
    }
  }
};

AssetManager.prototype.prefetchModelInfos = function (p, force, callback) {
  var queryKey = p.source + '/' + p.query + '/' + p.limit;
  var fetched = this.__prefetchedQueryKeys[queryKey] && !force;
  if (!fetched && this.searchController) {
    var scope = this;
    // NOTE: Use modelinfo cache
    var loader = this.__getCachingLoader('modelinfo');
    loader.load({
      skipCache: true,
      key: queryKey,
      loadFn: function(opts, cb) {
        scope.searchController.query({ source: p.source, query: p.query, start: 0, limit: p.limit }, cb);
      },
      loadOpts: null,
      callback: function(err, data) {
        if (!err) {
          // console.log('populating prefetched model infos', queryKey);
          if (data.response && data.response.docs) {
            scope.cacheModelInfos(p.source, data.response.docs);
            scope.__prefetchedQueryKeys[queryKey] = 1;
          }
        }
        if (callback) {
          callback(err, data);
        }
      }
    });
  } else {
    console.warn('Cannot prefetch models: no search controller');
    callback('Cannot prefetch models: no search controller');
  }
};

AssetManager.prototype.getModelVariant = function(model, variantId, callback) {
  if (model.info.id === variantId) {
    callback(null, model);
  } else if (model.info.variantIds && model.info.variantIds.indexOf(variantId) >= 0) {
    var loadInfo = this.getLoadInfo(model.info.source, variantId);
    var scope = this;
    this.__getModelWithModelInfoLookup(loadInfo, function(m) {
      if (model.isFlipped) {
        callback(null, scope.getFlippedModel(m));
      } else {
        callback(null, m);
      }
    }, function(err) {
      callback(err, null);
    });
  } else {
    callback('Unknown variant ' + variantId + ' for model ' + model.info.fullId);
  }
};

AssetManager.prototype.getFlippedModel = function(model) {
  // Create variation of model with flipped normals
  if (model.__flipped) {
    return model.__flipped;
  }
  var modelinfo = model.info;

  var key =  'model-' + modelinfo.fullId + '-' + modelinfo.formatName + '-flipped';
  var loader = this.__getCachingLoader('model');
  var flipped = loader.getOrElse(key, function() {
    // Create flipped model
    // Deep clone model and flip geometry
    var clone = model.deepClone();
    clone.isFlipped = true;
    Object3DUtil.flipForMirroring(clone.object3D);
    model.__flipped = clone;
    clone.__flipped = model;
    return clone;
  }, function(model) {
    if (model && model.object3D) {
      Object3DUtil.dispose(model.object3D);
    }
  });
  return flipped;
};

AssetManager.prototype.__loadModel = function (modelinfo, callback, onerror) {
  // check whether we really want to load, or just filter out this model
  //console.log("loading model", modelinfo);
  onerror = onerror || function (err) { console.error(err); };
  var isValidModel = this.modelFilter ? this.modelFilter(modelinfo) : true;
  if (!isValidModel) {
    onerror('Ignoring invalid model ' + modelinfo.fullId);
    return;
  }

  // Load model with cache
  var key = (modelinfo.fullId)? 'model-' + modelinfo.fullId + '-' + modelinfo.formatName : undefined;
  var loader = this.__getCachingLoader('model');
  var scope = this;
  loader.load({
    skipCache: modelinfo.skipCache,
    key: key,
    loadOpts: modelinfo,
    loadFn: function(minfo, cb) {
      return scope.__preloadAssets(minfo, function(err, res) {
        scope.__loadModelUncached(minfo, cb);
      });
    },
    dispose: function(model) {
      if (model && model.object3D) {
        Object3DUtil.dispose(model.object3D);
      }
    },
    callback: function(err, value) {
      if (err) {
        onerror(err);
      } else {
        callback(value);
      }
    }
  });
};

AssetManager.prototype.addMaterialBinding = function(modelId, options) {
  for (var i = 0; i < options.materials.length; i++) {
    var m = options.materials[i];
    var side = (m.side != undefined)? m.side : Materials.DefaultMaterialSide;
    if (!m.material) {
      var matOpts = {side: side, type: m.type, encoding: m.encoding };
      if (m.textureId) {
        m.material = this.getTexturedMaterial(undefined, m.textureId, matOpts);
      } else if (m.color != undefined) {
        m.material = this.getColoredMaterial(m.name, m.color, matOpts);
      }
    }
  }
  options.materialsByName = _.keyBy(options.materials, 'name');
  this.__materialBindingsByModelId[modelId] = options;
};

AssetManager.prototype.__createModel = function(object3D, modelInfo) {
  if (modelInfo.groupMeshes) {
    // Group meshes by chunkxxx_groupyyy_subzzz
    //console.log('group meshes');
    var meshes = Object3DUtil.getMeshList(object3D);
    var grouped = new THREE.Group();
    var groups = {};
    var subgroups = {};
    for (var i = 0; i < meshes.length; i++) {
      var mesh = meshes[i];
      var parts = mesh.name.split('_');
      if (parts.length >= 2 && parts[1].startsWith('group')) {
        var g = parts[1];
        if (!groups[g]) {
          groups[g] = new THREE.Group();
          groups[g].name = g;
          grouped.add(groups[g]);
        }
        if (parts.length >= 3 && parts[2].startsWith('sub')) {
          var s = parts[1] + '_' + parts[2];
          if (!subgroups[s]) {
            subgroups[s] = new THREE.Group();
            subgroups[s].name = s;
            groups[g].add(subgroups[s]);
          }
          subgroups[s].add(mesh);
        } else {
          groups[g].add(mesh);
        }
      } else {
        grouped.add(mesh);
      }
    }
    //console.log(grouped);
    _.merge(grouped.userData, object3D.userData);
    object3D = grouped;
  }
  var model = new Model(object3D, modelInfo);
  this.__preprocessModel(model);
  return model;
};

AssetManager.prototype.__preprocessModel = function(model) {
  // Apply custom textures
  var modelId = model.info.fullId;
  var bindings = this.__materialBindingsByModelId[modelId];  // custom material bindings
  if (bindings) {
    // array of new material bindings
    // either from old material or old mesh to new material
    var materialsByName = bindings.materialsByName;
    var mappings = bindings.materialMappings;
    for (var p in mappings) {
      if (mappings.hasOwnProperty(p)) {
        var originalMaterialName = p;
        var m = materialsByName[mappings[p]];
        // Going from material name to to new material
        if (m && m.material) {
          var newMaterial = m.material;
          //Object3DUtil.setMaterial(model.object3D, newMaterial);
          Object3DUtil.setMaterial(model.object3D, newMaterial, undefined, false, function (mesh) {
            return mesh.material.name === originalMaterialName;
          });
        }
      }
    }
  }
  if (this.__lightsLoader && this.autoLoadLights) {
    this.__lightsLoader.createLights(model.info, model.object3D);
  }
};

AssetManager.prototype.__loadModelUncached = function (modelinfo, callback) {
  var scope = this;
  var onsuccess = function (object3D) {
    var model = scope.__createModel(object3D, modelinfo); // custom preprocessing of the model
    if (modelinfo.modelSpaceMetadataFile) {
      // Weird hack for shapenet v2 modelspace normalization
      scope.assetLoader.load(modelinfo.modelSpaceMetadataFile, 'json', function(json) {
        modelinfo.modelSpaceMetadata = json;
        callback(null, model);
      }, null, function(err) {
        console.warn('Error loading modelSpaceMetadataFile ' + modelinfo.modelSpaceMetadataFile, err);
        callback(null, model);
      });
    } else {
      callback(null, model);
    }
  };
  var onerror = function(err) {
    if (err) {
      console.error('Error loading model', modelinfo, err);
    }
    callback(err, null);
  };

  return this.__loadObject3D(modelinfo, onsuccess, onerror);
};

AssetManager.prototype.__loadObject3D = function(modelinfo, onsuccess, onerror) {
  if (this.supportArticulated) {
    var ArticulatedObjectLoader = require('articulations/ArticulatedObjectLoader');
    var articulatedLoader = new ArticulatedObjectLoader({ assetManager: this, mergeFixedParts: this.mergeFixedParts });
    if (modelinfo.hasArticulations && articulatedLoader.checkModelHasArticulatedMesh(modelinfo)) {
      articulatedLoader.load(modelinfo, function(err, res) {
        if (err) { if (onerror) { onerror(err); }}
        else { if (onsuccess) { onsuccess(res); }}
      });
    } else {
      var origOnsuccess = onsuccess;
      onsuccess = function(object3D) {
        var ArticulatedObject = require('articulations/ArticulatedObject');
        var articulatedObject3D = ArticulatedObject.toArticulatedHierarchical(object3D);
        origOnsuccess(articulatedObject3D || object3D);
      };
      var obj3dLoader = new Object3DLoader(this);
      obj3dLoader.load(modelinfo, onsuccess, onerror);
    }
  } else {
    var obj3dLoader = new Object3DLoader(this);
    obj3dLoader.load(modelinfo, onsuccess, onerror);
  }
};

AssetManager.prototype.__getMaterialSide = function(modelInfo) {
  var options = modelInfo.options || {};
  var sidedness = options.materialSidedness || modelInfo.materialSidedness;
  return Materials.getMaterialSide(sidedness, Materials.DefaultMaterialSide);
};

AssetManager.prototype.__getMaterial = function(modelInfo, materialKey, materialTypeKey, defaultMaterialType) {
  var materialType = this.__getMaterialType(modelInfo, materialTypeKey, defaultMaterialType);
  if (materialType) {
    var options = modelInfo.options || {};
    var side = this.__getMaterialSide(modelInfo);
    var material = (options[materialKey]) ? options[materialKey] : new materialType(
      { name: materialKey, side: side });
    return material;
  }
};

AssetManager.prototype.__getDefaultMaterial = function(modelInfo, defaultMaterialType) {
  return this.__getMaterial(modelInfo, 'defaultMaterial', 'defaultMaterialType', defaultMaterialType);
};

AssetManager.prototype.__getOverrideMaterial = function(modelInfo, defaultMaterialType) {
  return this.__getMaterial(modelInfo, 'overrideMaterial', 'overrideMaterialType', defaultMaterialType);
};

AssetManager.prototype.__getMaterialType = function(modelInfo, materialTypeKey, defaultMaterialType) {
  var materialType = modelInfo.options? modelInfo.options[materialTypeKey] : null;
  materialType = materialType || modelInfo[materialTypeKey] || defaultMaterialType;
  if (_.isString(materialType)) {
    materialType = Materials.getMaterialType(materialType);
  }
  return materialType;
};

AssetManager.prototype.__getDefaultMaterialType = function(modelInfo, defaultMaterialType) {
  return this.__getMaterialType(modelInfo, 'defaultMaterialType', defaultMaterialType);
};

AssetManager.prototype.__getOverrideMaterialType = function(modelInfo, defaultMaterialType) {
  return this.__getMaterialType(modelInfo, 'overrideMaterialType', defaultMaterialType);
};

AssetManager.prototype.__updateMaterialOptions = function(modelInfo, options, defaultMaterialType) {
  // var side = this.__getMaterialSide(modelInfo);
  options.materialBase = options.materialBase || options.texturePath || modelInfo.materialBase || modelInfo.texturePath;
  options.defaultMaterialType = this.__getDefaultMaterialType(modelInfo, defaultMaterialType);
  options.defaultMaterial = this.__getDefaultMaterial(modelInfo, defaultMaterialType);
  options.overrideMaterialType = this.__getOverrideMaterialType(modelInfo, null);
  options.overrideMaterial = this.__getOverrideMaterial(modelInfo, null);
};

AssetManager.prototype.__loadArchWithFilename = function(info, callback, asScene) {
  var ArchLoader = require('loaders/ArchLoader');
  var archOptions = info.archOptions || {};
  var archLoader = new ArchLoader({fs: Constants.sys.fs,
    archOptions: { assetManager: this, filter: _.pick(info, this.__sceneLoadInfoFields),
      createGround: info.debugArch || archOptions.createGround,
      skipWallCeilingProfile: info.debugArch || archOptions.skipWallCeilingProfile,
      includeWallCeilingProfilePolys: info.debugArch || archOptions.includeWallCeilingProfilePolys,
      skipWallHoleCutouts: info.debugArch || archOptions.skipWallHoleCutouts,
      includeWallHoleBoundingBoxes: info.debugArch || archOptions.includeWallHoleBoundingBoxes }});
  var filename = info.file || info.path;
  archLoader.load(filename, function (err, res) {
    if (err) {
      callback(err);
    } else {
      res.info = info;
      if (info.fullId) {
        res.arch.ref = info.fullId;
      }
      if (asScene) {
        var sceneState = archLoader.archCreator.toSceneState(res.json, res.arch, true);
        // TODO: Use arch instead the json
        sceneState.arch = res.json;
        sceneState.arch.ref = res.arch.ref;
        callback(null, sceneState);
      } else {
        callback(null, res);
      }
    }
  });
};

AssetManager.prototype.loadArch = function(info, callback, asScene) {
  if (info.file != null || info.path != null) {
    this.__loadArchWithFilename(info, callback, asScene);
  } else if (info.fullId != null || (info.id != null && info.source != null)){
    var sid = AssetManager.toSourceId(info.source, (info.fullId != null)? info.fullId : info.id);
    var assetInfo = this.getAssetInfo(sid.fullId);
    var loadInfo = this.getLoadInfo(sid.source, sid.id, _.defaults(Object.create(null), info, assetInfo || {}));
    if (loadInfo != null) {
      if (loadInfo.file != null || loadInfo.path != null) {
        this.__loadArchWithFilename(loadInfo, callback, asScene);
      } else {
        callback('Cannot get path for ' + sid.fullId);
      }
    } else {
      callback('Unknown asset: ' + sid.fullId);
    }
  } else {
    callback('Cannot loadArch: need to specify either path/file or fullId/source,id');
  }
};

AssetManager.prototype.loadAsset = function(info, callback) {
  var assetType = info.assetType;
  var sid = (info.fullId)? AssetManager.toSourceId(info.source, info.fullId) : null;
  if (!assetType) {
    var assetGroup = this.getAssetGroup(sid.source);
    assetType = assetGroup.type;
  }
  if (assetType === Constants.assetTypeScene) {
    return this.loadScene(info, callback);
  } else if (assetType === Constants.assetTypeModel || assetType === Constants.assetTypeScan) {
    return this.loadModel(info, callback);
  } else if (assetType === Constants.assetTypeArch) {
    return this.loadArch(info, callback, false);
  } else {
    console.warn('Cannot load asset', info);
    callback('Cannot load asset', null);
  }
};

AssetManager.prototype.loadAssetAsScene = function(info, callback) {
  var assetType = info.assetType;
  var sid = info.fullId? AssetManager.toSourceId(info.source, info.fullId) : null;

  if (!assetType && sid) {
    var assetGroup = this.getAssetGroup(sid.source);
    assetType = assetGroup.type;
  }
  if (assetType === Constants.assetTypeScene || assetType == undefined) {
    if (info.defaultSceneFormat) {
      info.defaultFormat = info.defaultSceneFormat;
    }
    return this.loadScene(info, callback);
  } else if (assetType === Constants.assetTypeModel || assetType === Constants.assetTypeScan) {
    // TODO: Restore defaultFormat
    if (info.format && sid) {
      var assetGroup = this.getAssetGroup(sid.source);
      assetGroup.defaultFormat = info.format;
    }
    return this.loadModelAsScene(info, callback);
  } else if (assetType === Constants.assetTypeArch) {
    return this.loadArch(info, callback, true);
  } else {
    console.warn('Cannot load asset', info);
    callback('Cannot load asset', null);
  }
};

AssetManager.prototype.loadModel = function (info, callback) {
  var sid = info.fullId? AssetManager.toSourceId(info.source, info.fullId) : null;
  if (sid) {
    return this.getModelInstance(sid.source, sid.id,
      function (mi) {
        callback(null, mi);
      },
      function (err) {
        callback(err, null);
      },
      info
    );
  } else {
    return this.getModelInstanceFromLoadModelInfo(info,
      function (mi) {
        callback(null, mi);
      },
      function (err) {
        callback(err, null);
      },
      info
    );
  }
};

AssetManager.prototype.loadModelAsScene = function (modelLoadInfo, callback) {
  var scope = this;
  // TODO: simplify crazy asset info manipulation
  this.__lookupModelInfo(modelLoadInfo, function(modelInfo) {
    var sceneInfo = _.clone(modelLoadInfo);
    if (!sceneInfo.data) {
      // Pretend that we are a scene
      sceneInfo.rootObjectIndex = 0;
      sceneInfo.data = {
        "format": "sceneState",
        "object": [
          _.defaults({
            "modelId": sceneInfo.fullId,
            "index": 0,
            "parentIndex": -1,
            "transform": [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
          }, modelLoadInfo.modelMetadata || {})
        ]
      };
    }
    if (sceneInfo.preload) {
      _.each(sceneInfo.preload, function(p) {
        sceneInfo[p] = modelInfo[p];
      });
    }

    sceneInfo['baseModelInfo'] = modelInfo;
    //console.log('Load model as scene', modelInfo, sceneInfo);
    scope.loadScene(sceneInfo, callback);
  });
};

AssetManager.prototype.loadScene = function (sceneinfo, callback) {
  sceneinfo.archType = SceneState.getArchType(sceneinfo);
  if (sceneinfo.createArch) {
    sceneinfo.preload = sceneinfo.preload || [];
    sceneinfo.preload.push('arch');
  }
  if (sceneinfo.cache && sceneinfo.fullId) {
    var cachingLoader = this.__getCachingLoader('scene', sceneinfo.format);
    var scope = this;
    return cachingLoader.load({
      key: 'scene-' + sceneinfo.fullId,
      loadFn: function(opts, cb) {
        scope.__loadSceneUncached(sceneinfo, cb);
      },
      loadOpts: null,
      callback: callback,
      dispose: function(sceneState) {
        if (sceneState && sceneState.fullScene) {
          Object3DUtil.dispose(sceneState.fullScene);
        }
      }
    });
  } else {
    return this.__loadSceneUncached(sceneinfo, callback);
  }
};

// Main entry point for loading a uncached scene
// sceneinfo can be
//    sceneId (string)
//    object with file (url or local File object), fullId, or data (string/object to be parsed)
//           optional: format (specifies the format of the scene to be loaded)
//                     defaultFormat (specifies the defaultFormat to use if not specified in the actual data)
// callback should be a function(err, sceneState)
AssetManager.prototype.__loadSceneUncached = function (sceneinfo, callback) {
  if (typeof sceneinfo === 'string') {
    sceneinfo = { fullId: sceneinfo };
  }
  var scope = this;
  function loadScene() {
    if (sceneinfo['file']) {
      return scope.__loadSceneFromJsonFile(sceneinfo, callback);
    } else if (sceneinfo['data']) {
      return scope.__loadSceneFromData(sceneinfo, callback);
      //} else if (sceneinfo['format'] != undefined) {
      //  return this.__loadSceneWithFormat(sceneinfo, callback);
    } else if (sceneinfo['fullId'] != undefined) {
      // TODO: Refactor....
      // Try to load from DB or Solr
      var assetInfo = scope.getAssetInfo(sceneinfo.fullId);
      if (assetInfo) {
        _.defaults(sceneinfo, assetInfo);
      }
      var sid = AssetManager.toSourceId(sceneinfo.source, sceneinfo.fullId);
      if (sid.source === 'db' || sid.source === 'mturk') {
        return scope.__loadSceneFromDb(sceneinfo, callback);
      } else {
        // TODO: Get scene from solr
        var loadInfo = scope.getLoadInfo(sid.source, sid.id, sceneinfo);
        if (loadInfo) {
          // HACK!!! Copy some important info from my sceneinfo to loadInfo
          _.merge(loadInfo, _.pick(sceneinfo, scope.__sceneLoadInfoFields));
          return scope.loadScene(loadInfo, callback);
        }
        console.error('Please implement me: AssetManager.loadScene from fullId');
        if (callback) callback('Cannot load ' + sceneinfo.fullId);
      }
    } else {
      console.error('Cannot load scene: ');
      console.log(sceneinfo);
      if (callback) callback('Cannot load scene with unknown scene format');
    }
  }

  if (sceneinfo.prefetchModelInfo) {
    this.prefetchModelInfos(sceneinfo.prefetchModelInfo, null, loadScene);
  } else {
    loadScene();
  }
};

AssetManager.prototype.__preloadAssets = function(assetinfo, callback) {
  return this.loadAssetDependencies(assetinfo,
      { fields: assetinfo.preload }, callback);
};

AssetManager.prototype.loadAssetDependencies = function (assetinfo, options, callback) {
  var scope = this;
  var taskQueue = new TaskQueue({ concurrency: 4 });

  // Add preloads
  var preloads = options.fields;
  // console.log('preloads', preloads, assetinfo);
  if (preloads) {
    _.each(preloads, function(preload) {
      var preloadInfo = assetinfo[preload];
      if (preloadInfo && preloadInfo.path) {
        // TODO: Only update material options for the assets that need it
        scope.__updateMaterialOptions(preloadInfo, preloadInfo);
        var path = _.replaceVars(preloadInfo.path, assetinfo);
        var assetLoader;
        if (preloadInfo.assetType) {
          var format = preloadInfo.format || _.getFileExtension(path);
          var assetLoaderClass = scope.__lookupAssetLoader(preloadInfo.assetType, format);
          if (assetLoaderClass) {
            assetLoader = new assetLoaderClass(_.defaults({fs: Constants.sys.fs}, preloadInfo));
          }
        }
        if (assetLoader) {
          taskQueue.push(function(cb) {
            console.log('preloading ' + path + ' using ' + assetLoader.constructor.name);
            assetLoader.load(path, function(err, res) {
              if (err) {
                console.error('Error preloading ' + preload + ' for asset ' + assetinfo.fullId, path, err);
              } else {
                // TODO: Differentiate between data and parsed/processed?
                preloadInfo.data = preloadInfo.processor? preloadInfo.processor(res) : res;
                preloadInfo.isParsed = true;
              }
              cb(err, res);
            });
          });
        } else {
          taskQueue.push(function(cb) {
            console.log('preloading ' + path);
            scope.assetLoader.loadErrorFirst(path, preloadInfo.encoding, function(err, res) {
              if (err) {
                console.error('Error preloading ' + preload + ' for asset ' + assetinfo.fullId, path, err);
              } else {
                preloadInfo.data = preloadInfo.processor? preloadInfo.processor(res) : res;
              }
              cb(err, res);
            });
          });
        }
      }
    });
  }

  taskQueue.awaitAll(function(err, res) {
    callback(err, res);
  });
  return taskQueue;
};

// At this point, the actual format of the scene has been determined
// (it was either specified explicitly in the scene, or was populated by user
// This dispatches to the different loaders (we can have a map of format to loader
//    instead of hand coding all loaders here)
// All loadScene should hopefully end up here
AssetManager.prototype.__loadSceneWithFormat = function (sceneinfo, callback) {
  var wrappedCallback = function (err, sceneResult) {
    // TODO: Create proper scene class
    var sceneState = null;
    var error;
    sceneinfo = _.omit(sceneinfo, 'name'); // HACK!!!! omit weird format name
    if (sceneResult instanceof SceneState) {
      sceneState = sceneResult;
      if (sceneState.info) {
        _.merge(sceneinfo, sceneState.info);
      }
      sceneState.info = sceneinfo;
      sceneState.finalizeScene();
    } else if (sceneResult instanceof THREE.Scene) {
      sceneState = new SceneState(sceneResult, sceneinfo);
      sceneState.finalizeScene();
    } else if (sceneResult && sceneResult.scene instanceof THREE.Scene) {
      sceneState = new SceneState(sceneResult.scene, sceneinfo);
      sceneState.finalizeScene();
    } else {
      error = err || 'Error loading scene: Unknown scene result';
      console.error(error);
      console.log(sceneResult);
      console.log(sceneinfo);
    }
    if (sceneState) {
      // Let's see if they wanted to hide some stuff!
      if (sceneinfo.hideCategories) {
        var cats = sceneinfo.hideCategories;
        if (!_.isArray(cats)) {
          cats = [cats];
        }
        sceneState.setVisible(
          false, /* visibility */
          function (node) {
            var modelInstance = Object3DUtil.getModelInstance(node);
            return modelInstance && modelInstance.model.hasCategoryIn(cats);
          },
          true /* recursive */
        );
      }
      if (sceneinfo.hideModelIds) {
        var modelIds = sceneinfo.hideModelIds;
        if (!_.isArray(modelIds)) {
          modelIds = [modelIds];
        }
        sceneState.setVisible(
          false, /* visibility */
          function (node) {
            var modelInstance = Object3DUtil.getModelInstance(node);
            return modelInstance && modelIds.indexOf(modelInstance.model.getFullID()) >= 0;
          },
          true /* recursive */
        );
      }
      if (!sceneState.scene.name) {
        sceneState.scene.name = sceneinfo.fullId;
      }
    }
    callback(error, sceneState);
  };
  var loadOptions = { assetManager: this };
  _.merge(loadOptions, _.pick(sceneinfo, this.__sceneLoadInfoFields));

  // Replaced with more generic asset loader registry
  var loaderClass = this.__lookupAssetLoader('scene', sceneinfo.format);
  if (loaderClass) {
    // Load scene + extra stuff that we are suppose to preload
    var scope = this;
    var loader = new loaderClass(loadOptions);
    return this.__preloadAssets(sceneinfo, function(err, res) {
      try {
        scope.__loadScene(loader, sceneinfo, function (loadSceneError, loadedScene) {
          wrappedCallback(loadSceneError, loadedScene);
        });
      } catch (err) {
        console.error('Error loading scene', err);
        if (callback) callback(err);
      }
    });
  } else {
    console.error('Cannot load scene with unsupported scene format: ' + sceneinfo['format']);
    console.log(sceneinfo);
    if (callback) callback('Cannot load scene with unsupported scene format: ' + sceneinfo['format']);
  }
};

AssetManager.prototype.__findFormat = function (loadInfo) {
  // Ugly code to try to guess format
  var scope = this;
  function guessFormatFromVersionString(json) {
    if (typeof json.version === 'string') {
      if (json.version.indexOf('@') > 0) {
        var f = json.version.split('@')[0];
        if (scope.__lookupAssetLoader('scene', f)) {
          return f;
        }
      }
    }
  }
  if (loadInfo.data) {
    if (loadInfo.data.scene) {
      if (typeof loadInfo.data.scene === 'string') {
        loadInfo.data.scene = JSON.parse(loadInfo.data.scene);
      }
      var vformat = guessFormatFromVersionString(loadInfo.data.scene);
      return loadInfo.data.scene.format || loadInfo.data.format || vformat || loadInfo.format;
    } else {
      var vformat = guessFormatFromVersionString(loadInfo.data);
      return loadInfo.data.format || vformat || loadInfo.format;
    }
  } else {
    if (loadInfo.scene) {
      if (typeof loadInfo.scene === 'string') {
        loadInfo.scene = JSON.parse(loadInfo.scene);
      }
      var vformat = guessFormatFromVersionString(loadInfo.scene);
      return loadInfo.scene.format || vformat || loadInfo.format;
    } else {
      return loadInfo.format;
    }
  }
};
// Assumes that the scene has already be fetched from either file or url,
//   and placed in the loadInfo.data
AssetManager.prototype.__loadSceneFromData = function (loadInfo, callback) {
  //console.log(loadInfo);
  // Jump through some hoops to massage data into an appropriate json object
  if (typeof loadInfo === 'string') {
    loadInfo = JSON.parse(loadInfo);
  }
  if (loadInfo && typeof loadInfo.data === 'string') {
    // May need to parse string...
    loadInfo.data = JSON.parse(loadInfo.data);
  }
  loadInfo.format = this.__findFormat(loadInfo) || loadInfo['defaultFormat'] || this.defaultSceneFormat;
  // try to figure out format
  if (loadInfo.data) {
    return this.__loadSceneWithFormat(loadInfo, callback);
  } else if (loadInfo.format) {
    // Need to wrap the data
    // Again, jump through some hoops to handle somewhat inconsistent input data
    var wrapped = { format: loadInfo.format, data: loadInfo };
    if (loadInfo.format === 'sceneState' && !loadInfo.scene && loadInfo.object) {
      wrapped.data = { scene: loadInfo };
    }
    return this.__loadSceneWithFormat(wrapped, callback);
  } else {
    // Something went wrong!!!
    var filename = (loadInfo.file)?  (loadInfo.file.name || loadInfo.file):undefined;
    var sceneName = loadInfo.fullId || filename;
    console.error('Error fetching scene ' + sceneName + ': invalid scene.');
    console.log(loadInfo);
    if (callback) callback('Error fetching scene ' + sceneName + ': invalid scene.');
  }
};

AssetManager.prototype.__loadSceneFromDb = function (sceneinfo, callback) {
  var sid = sceneinfo.fullId;
  var queryData = {
    'qt': 'scene',
    'sceneId': sid
  };
  return _.ajax({
    type: 'GET',
    url: Constants.baseUrl + '/query?' + _.param(queryData),
    success: function (data, textStatus, jqXHR) {
      if (typeof data === 'string') {
        data = JSON.parse(data);
      }
      sceneinfo.data = data.data || data;
      this.__loadSceneFromData(sceneinfo, callback);
    }.bind(this),
    error: function (jqXHR, textStatus, errorThrown) {
      console.error('Error fetching scene ' + sid);
      console.log('Error: ' + textStatus + ' ' + errorThrown);
      if (callback) callback('Error fetching scene ' + sid);
    },
    timeout: 3000
  });
};

AssetManager.prototype.__loadSceneFromJsonFile = function (sceneinfo, callback) {
  var file = sceneinfo.file;
  var filename = file.name || file;
  //console.log('load file', sceneinfo);
  return this.assetLoader.load(file, 'json',
    function (data) {
      sceneinfo.data = data;
      // Populate additional load info, a bit perculiar
      if (sceneinfo.id == null && data.id != null) {
        sceneinfo.id = data.id;
        if (sceneinfo.source) {
          sceneinfo.fullId = sceneinfo.source + '.' + sceneinfo.id;
          // Try to interpolate sceneinfo
          var loadinfo = this.getLoadInfo(sceneinfo.source, sceneinfo.id, sceneinfo);
          //console.log('got loadinfo', loadinfo);
          if (loadinfo) {
            sceneinfo =  _.defaults(sceneinfo, loadinfo);
            //console.log('updated sceneinfo', sceneinfo);
          }
        }
      }
      this.__loadSceneFromData(sceneinfo, callback);
    }.bind(this),
    undefined,
    function (event) {
      console.error('Error fetching scene ' + filename);
      console.log(event);
      if (callback) callback('Error fetching scene ' + filename);
    }
  );
};

AssetManager.prototype.__loadScene = function (loader, sceneinfo, callback) {
  if (sceneinfo.data) {
    var data = (typeof sceneinfo.data === 'string') ? JSON.parse(sceneinfo.data) : sceneinfo.data;
    loader.parse(data, function(s) { callback(null,s); }, null, sceneinfo);
  } else if (sceneinfo.file) {
    return loader.load(sceneinfo.file, function(s) { callback(null,s); }, null, function(err) { callback(err); }, sceneinfo);
  } else {
    console.error('Cannot load scene: neither data nor file specified');
    if (callback) callback('Cannot load scene: neither data nor file specified');
  }
};

AssetManager.prototype.registerAssetLoader = function(assetType, format, loader) {
  if (!this.__assetLoaders[assetType]) {
    this.__assetLoaders[assetType] = {};
  }
  this.__assetLoaders[assetType][format] = loader;
};

AssetManager.prototype.__lookupAssetLoader = function(assetType, format) {
  if (this.__assetLoaders[assetType]) {
    var loader = this.__assetLoaders[assetType][format];
    if (!loader) {
      loader = this.__assetLoaders[assetType]['*'];
    }
    return loader;
  }
};

AssetManager.prototype.__registerDefaultLoaders = function() {
  AssetLoaders.registerDefaultLoaders(this);
};

AssetManager.prototype.loadVideoTexture = function (videoPath) {
  videoPath = videoPath || Constants.assetsDir + Constants.defaultVideo;
  var VT = require('geo/VideoTexture');
  var vt = new VT(videoPath);
  this.Publish('dynamicAssetLoaded', vt);
  return vt;
};


AssetManager.prototype.registerAssetGroupWithSearchController = function(assetGroup, searchController) {
  if (assetGroup.assetDb) {
    searchController.registerSearchModule(assetGroup.name, assetGroup.assetDb);
  } else if (assetGroup.solrUrl) {
    searchController.registerSearchModule(assetGroup.name, assetGroup.solrUrl + '/select');
  }
};

// TODO: Modify Viewer3D to use these functions
AssetManager.prototype.registerCustomAssetGroup = function (options) {
  var searchController = options.searchController || this.searchController;
  var assetMetadataFile = options.assetMetadataFile;
  var assetIdsFile = options.assetIdsFile;
  var showWarning = options.showWarning;
  var callback = options.callback;

  var scope = this;
  var assetLoader = this.assetLoader;
  function _loadTextFile(filename, onLoad, errorMessage) {
    assetLoader.load(filename, 'utf-8', onLoad, null, function(err) {
      if (callback) {
        callback(errorMessage + (err? ': ' + err : ''));
      }
    });
  }
  function _registerAssetGroup(assetGroup) {
    AssetGroups.registerAssetGroup(assetGroup);
    console.log('Registered asset group: ' + assetGroup.name);
    if (searchController && searchController !== Constants.NONE ) {
      scope.registerAssetGroupWithSearchController(assetGroup, searchController);
    }
    if (callback) {
      //console.log('callback', assetGroup);
      callback(null, assetGroup);
    }
    scope.Publish('AssetGroupRegistered', assetGroup);
  }
  function _assetListLoaded(assetGroup, filename, data) {
    if (showWarning && searchController && searchController.hasSource(assetGroup.name)) {
      showWarning('Replacing assets for source ' + assetGroup.name);
    }
    var assetsDb = AssetGroups.createAssetDbForAssetGroup(assetGroup, options);
    assetsDb.loadAssetInfoFromData(assetGroup, data, filename, { format: options.assetIdsFileFormat });
    assetGroup.setAssetDb(assetsDb);
    _registerAssetGroup(assetGroup);
  }
  function _metadataLoaded(json) {
    if (typeof json === 'string') {
      json = JSON.parse(json);
    }
    var assetGroup = AssetGroups.createCustomAssetGroup(json);
    if (assetGroup.type == undefined && options.assetType != null) {
      assetGroup.type = options.assetType;
    }
    assetIdsFile = assetIdsFile || assetGroup.idsFile;
    if (assetIdsFile) {
      var filename = (assetIdsFile instanceof File) ? assetIdsFile.name : assetIdsFile;
      _loadTextFile(assetIdsFile, _assetListLoaded.bind(scope, assetGroup, filename), 'Error loading ids file');
    } else {
      _registerAssetGroup(assetGroup);
    }
  }

  if (typeof assetMetadataFile === 'string') {
    _loadTextFile(assetMetadataFile, _metadataLoaded.bind(scope), 'Error loading metadata file');
  } else {
    _metadataLoaded(assetMetadataFile);
  }
};

AssetManager.prototype.__registerCustomAssetGroups = function (options) {
  var scope = this;
  var searchController = options.searchController || this.searchController;
  var allAssetFiles = options.assetFiles;
  allAssetFiles = _.map(allAssetFiles, function(x,i) {
    if (typeof x === 'string') {
      x = {metadata: x};
    }
    if (x.name == null) {
      x.name = 'asset_' + i;
    }
    return x;
  });
  var assetFiles = allAssetFiles;
  if (options.filter) {
    assetFiles = _.filter(assetFiles, options.filter);
  } else if (options.filterByAssetId) {
    var sid = AssetManager.toSourceId(this.defaultSource, options.filterByAssetId);
    assetFiles = _.filter(assetFiles, function(x) { return x.name === sid.source; });
  } else if (options.filterBySource) {
    var sources = Array.isArray(options.filterBySource)? options.filterBySource : [options.filterBySource];
    assetFiles = _.filter(assetFiles, function(x) { return sources.indexOf(x.name) >= 0; });
  } else if (options.filterByType) {
    var types = Array.isArray(options.filterByType)? options.filterByType : [options.filterByType];
    assetFiles = _.filter(assetFiles, function(x) { return types.indexOf(x.type) >= 0; });
  }
  if (assetFiles.length > 0) {
    var assetGroupNames = _.map(assetFiles, 'name');
    var assetsMap = _.keyBy(allAssetFiles, 'name');  // Have map be original set of assetFiles (so we can get dependencies)
    var assetsToRegister = AssetGroups.getAssetsToRegister(assetsMap, assetGroupNames);
    var finalAssetFiles = _.map(assetsToRegister, function(x) { return assetsMap[x]; });
    async.mapLimit(finalAssetFiles, Constants.MAX_ASYNC_REQS, function (f, cb) {
        f = _.cloneDeepWithReplaceVars(f, { baseUrl: Constants.baseUrl, assetsDir: Constants.assetsDir }, { optionalPrefix: 'vars'});
        //console.log(f);
        scope.registerCustomAssetGroup({
          searchController: searchController,
          assetIdField: f.assetIdField,
          assetIdsFile: f.ids,
          assetIdsFileFormat: f.assetIdsFileFormat,
          assetType: f.type,
          assetMetadataFile: f.metadata,
          callback: function (err, res) {
            if (f.callback) {
              f.callback(err, res);
            } else if (err) {
              console.error('Error registering asset ' + f.name, err);
            }
            // Ignore errors (don't need all to load successfully)
            cb(null, res);
          }
        });
      },
      function (err, results) {
        //console.log('registered ', err, results);
        if (options.callback) {
          options.callback(err, results);
        }
      });
  } else {
    if (options.callback) {
      options.callback('No assets to register');
    }
  }
};

AssetManager.prototype.registerCustomAssetGroups = function (options) {
  function handleError(err) {
    console.error('Error registering custom asset groups', err);
    if (options.callback) {
      options.callback(err);
    }
  }
  if (options.assetFiles) {
    if (_.isArray(options.assetFiles)) {
      // Array of asset files
      this.__registerCustomAssetGroups(options);
    } else if (_.isString(options.assetFiles)) {
      // File to assets
      var scope = this;
      var assetLoader = this.assetLoader;
      assetLoader.load(options.assetFiles, 'json',
        function(data) {
          var opts = _.clone(options);
          opts.assetFiles = data;
          scope.__registerCustomAssetGroups(opts);
        },
        null,
        handleError
      );
    } else {
      handleError('Unsupported type for assetFiles');
    }
  } else {
    handleError('Missing assetFiles');
  }
};

AssetManager.prototype.loadSoundSpecs = function(assetGroup, cb) {
  if (!assetGroup.sounds && assetGroup.soundsFile) {
    _.getJSON(assetGroup.soundsFile, function(err, json) {
      if (json) {
        assetGroup.sounds = new Sounds();
        assetGroup.sounds.import(json);
      }
      cb(err, assetGroup.sounds);
    });
  } else {
    cb(null, assetGroup.sounds);
  }
};

AssetManager.prototype.watchDynamicAssets = function(scope, dynArrayField) {
  this.Subscribe('dynamicAssetLoaded', scope, function(d) {
    //console.log('adding to dynamic assets', d);
    scope[dynArrayField].push(d);
  });
  this.Subscribe('dynamicAssetUnloaded', scope, function(d) {
    //console.log('removing from dynamic assets', d);
    const index = scope[dynArrayField].indexOf(d);
    if (index >= 0) {
      scope[dynArrayField].splice(index, 1);
    }
  });
};

AssetManager.enableCompressedLoading = function(renderer) {
  Object3DLoader.enableCompressedLoading(renderer);
};

module.exports = AssetManager;
