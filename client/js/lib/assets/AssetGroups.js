'use strict';

var _ = require('util/util');

var AssetsDb = require('assets/AssetsDb');
var AssetGroup = require('assets/AssetGroup');
var Object3DUtil = require('geo/Object3DUtil');
var Constants = require('Constants');

var AssetGroups = {
  _assetGroups: {},
  _assetGroupsByType: {},
  _defaultGroupsRegistered: false
};

// Functions to get the different types of AssetGroups
AssetGroups.getAssetGroups = function (type) {
  if (!AssetGroups._defaultGroupsRegistered) {
    // Make sure all asset groups are registered
    _registerDefaultAssetGroups();
  }
  // Figure out what set of asset groups to return
  if (type !== undefined) {
    // Return all asset groups corresponding to the given type
    return AssetGroups._assetGroupsByType[type];
  } else {
    // Return all asset groups
    return AssetGroups._assetGroups;
  }
};

AssetGroups.getAssetGroup = function (name) {
  var groups = AssetGroups.getAssetGroups();
  return groups[name];
};

AssetGroups.setDefaultFormat = function (format) {
  var groups = AssetGroups.getAssetGroups();
  AssetGroups.defaultFormat = format;
  for (var name in groups) {
    if (groups.hasOwnProperty(name)) {
      var group = groups[name];
      group.setDefaultFormat(format);
    }
  }
};

// Functions to get default up, front, unit
function getAttributeFromInfo(info, attr, defaultValue) {
  if (!info) return defaultValue;
  if (info[attr]) {
    return info[attr];
  }
  var source = info.source;
  var assetGroup = AssetGroups.getAssetGroup(source);
  if (assetGroup) {
    return (assetGroup[attr] != undefined)? assetGroup[attr] : defaultValue;
  } else {
    return defaultValue;
  }
}

AssetGroups.getDefaultUp = function (info, globalDefault) {
  // TODO: what if scene?
  var v = getAttributeFromInfo(info, 'defaultUp', globalDefault || new THREE.Vector3(0,1,0));
  return Object3DUtil.toVector3(v);
};

AssetGroups.getDefaultFront = function (info, globalDefault) {
  // TODO: what if scene?
  var v = getAttributeFromInfo(info, 'defaultFront', globalDefault || new THREE.Vector3(0,0,1));
  return Object3DUtil.toVector3(v);
};

AssetGroups.getDefaultUnit = function (info, globalDefault) {
  // TODO: what if scene?
  return getAttributeFromInfo(info, 'defaultUnit', globalDefault || Constants.defaultModelUnit);
};

// Functions to register AssetGroups

AssetGroups.registerAssetGroup = function (assetGroup, opts) {
  opts = opts || {};
  if (opts.isDefault) {
    assetGroup.isDefault = true;
  }
  if (AssetGroups._assetGroups[assetGroup.name]) {
    if (assetGroup.isDefault && !AssetGroups._assetGroups[assetGroup.name].isDefault) {
      console.log('Skipping registering of default asset group ' + assetGroup.name);
      return;
    }
    // Remove old asset group
    console.log('Replace asset group ' + assetGroup.name);
    AssetGroups.unregisterAssetGroup(assetGroup.name);
  }
  AssetGroups._assetGroups[assetGroup.name] = assetGroup;
  var type = assetGroup.type;
  if (!AssetGroups._assetGroupsByType.hasOwnProperty(type)) {
    AssetGroups._assetGroupsByType[type] = [];
  }
  AssetGroups._assetGroupsByType[type].push(assetGroup);
  if (AssetGroups.defaultFormat) {
    assetGroup.setDefaultFormat(AssetGroups.defaultFormat);
  }

  Constants.assetSources[type] = Constants.assetSources[type] || [];
  _.addUnique(Constants.assetSources[type], assetGroup.name);
};

AssetGroups.unregisterAssetGroup = function (name) {
  var assetGroup = AssetGroups._assetGroups[name];
  if (assetGroup) {
    delete AssetGroups._assetGroups[name];
    var type = assetGroup.type;
    if (AssetGroups._assetGroupsByType[type]) {
      var index = AssetGroups._assetGroupsByType[type].indexOf(assetGroup);
      if (index > -1) {
        AssetGroups._assetGroupsByType[type].splice(index, 1);
      }
    }
  }
};


// Helper functions for creating custom asset group
AssetGroups.createCustomAssetGroup = function (options) {
  if (options.data || options.dataTypes) {
    return this.__parseAssetMetadataNew(options);
  } else {
    return this.__parseAssetMetadataOld(options);
  }
};

// Parses new asset metadata format
AssetGroups.__parseAssetMetadataNew = function(options) {
  if (!Constants.isBrowser && options.rootPathLocal) {
    options.rootPath = options.rootPathLocal;
  }
  // HACK!!!! Make sure undefined vars are not replaced
  var defaultVars = _.createDefaultVars(options, 'vars.');
  // HACK!!!! Make sure ${xyz} becomes ${vars.xyz} for future interpolation
  options =  _.cloneDeepWith(options, function (x) {
    if (_.isString(x)) { return _.appendVarPrefix(x, 'vars'); }
  });
  options.__interpolateOptions = { 'variable': 'vars',  'defaults': defaultVars,
    isPossibleTemplate: function(str) {
      // Lazy check for if a string is a template value
      return _.includes(str, '$') || _.includes(str, '<%');
    },
    inferType: true
  };

  var assetGroup = new AssetGroup(options);
  //console.log(assetGroup.__interpolateOptions);
  return assetGroup;
};

// Parses old asset metadata format
AssetGroups.__parseAssetMetadataOld = function (options) {
  if (!Constants.isBrowser && options.rootPathLocal) {
    if (!Constants.baseUrl.startsWith('http')) {
      options.rootPath = options.rootPathLocal;
    }
  }
  var formats = {};
  var supportedFormats = [];
  if (options.formats) {
    for (var i = 0; i < options.formats.length; i++) {
      var f = options.formats[i];
      formats[f.name || f.format] = f;
      supportedFormats.push(f.name || f.format);
    }
  }

  var defaultConstants = {'baseUrl': Constants.baseUrl, 'assetsDir': Constants.assetsDir};
  // TODO: Move custom fields into their asset files
  var validAssetFields = ['texturePath', 'surfaces', 'prefetchModelInfo',
    'regions', 'video', 'trajectory', 'voxelsField',
    'voxels-surface', 'voxels-solid', 'voxels-labeled', 'voxels-color',
    'part-annotations',
    'segment-annotations-raw', 'segment-annotations-clean'];
  if (options.assetFields) {
    validAssetFields = validAssetFields.concat(options.assetFields);
  }

  function _getLoadAssetInfo(id, format, metadata) {
    metadata = metadata || {};
    if (format === undefined) { format = metadata.format || metadata.defaultFormat; }
    if (format === undefined && this) { format = this.defaultFormat; }
    var source = options.source;
    var assetInfo = {
      id: id,
      source: source,
      fullId: source + '.' + id,
      options: {
        source: source
      }
    };
    var vars = _.merge(new Object(null), options, metadata, defaultConstants, _.omit(assetInfo, 'options'));
    if (vars.baseVariantId == null || vars.baseVariantId === '')  { vars.baseVariantId = id; }
    var m = formats[format];
    //console.log(format);
    //console.log(m);
    if (m) {
      m = _.cloneDeepWithReplaceVars(m, vars);
      _.merge(assetInfo, m);
      assetInfo['format'] = assetInfo['format'] || format;
      assetInfo['file'] = assetInfo['file'] || m['path'];
    }
    var validFields = validAssetFields;
    for (var i = 0; i < validFields.length; i++) {
      var field = validFields[i];
      var value = assetInfo[field] || options[field];
      if (value) {
        assetInfo[field] = _.cloneDeepWithReplaceVars(value, vars);
      }
    }

    if (options.defaultMaterialType !== undefined) {
      var defaultMaterialType = options.defaultMaterialType;
      if (typeof defaultMaterialType === 'string') {
        var meshMaterialsByName = {
          'depth': THREE.MeshDepthMaterial,
          'normal': THREE.MeshNormalMaterial,
          'basic': THREE.MeshBasicMaterial,
          'lambert': THREE.MeshLambertMaterial,
          'phong': THREE.MeshPhongMaterial,
          'standard': THREE.MeshStandardMaterial,
          'physical': THREE.MeshPhysicalMaterial,
          'toon': THREE.MeshToonMaterial
        };

        assetInfo.defaultMaterialType = meshMaterialsByName[defaultMaterialType];
        if (!assetInfo.defaultMaterialType) {
          console.warn('Unknown material type: ' + defaultMaterialType);
        }
      } else {
        assetInfo.defaultMaterialType = defaultMaterialType;
      }
    }
    if (assetInfo.options && assetInfo.options.defaultMaterial !== undefined) {
      if (typeof assetInfo.options.defaultMaterial === 'boolean') {
        assetInfo.options.defaultMaterial = Object3DUtil.getSimpleFalseColorMaterial(0);
      } else {
        // TODO: parse material
        console.warn('Need to parse defaultMaterial!');
      }
    }
    return assetInfo;
  }

  var varsBasic = _.merge(new Object(null), options, defaultConstants );
  var screenShotPaths = options.screenShotPaths;
  var screenShotPathsByName = screenShotPaths? _.keyBy(screenShotPaths, 'name') : null;
  var assetGroupOptions = {
    name: options.source,
    type: options.assetType,
    supportedFormats: supportedFormats,
    usesDeprecated: true,
    getImageUrl: function (id, i, metadata) {
      metadata = metadata || {};
      var screenShotPath = (screenShotPaths)? screenShotPaths[i] || screenShotPathsByName[i] : null;
      var index = (i !== undefined && (screenShotPath || i >= 0)) ? i : options.defaultImageIndex;
      //console.log('getImageUrl', id, i, index, options, metadata);
      if (index == undefined && this.getOriginalImageUrl) {
        return this.getOriginalImageUrl(id, metadata);
      } else {
        var vars = _.merge(new Object(null), varsBasic, metadata, {'id': id, 'index': index});
        if (vars.baseVariantId == null || vars.baseVariantId === '') {
          vars.baseVariantId = id;
        }
        if (screenShotPath) {
          var path = screenShotPath;
          if (typeof path !== 'string') { path = path.path; }
          return _.replaceVars(path, vars);
        }
        return _.replaceVars(options['screenShotPath'], vars);
      }
    },
    texturePath: _.replaceVars(options['texturePath'], varsBasic),
    lightSpecsFile: _.replaceVars(options['lightSpecsFile'], varsBasic),
    roomFilesPath: _.replaceVars(options['roomFilesPath'], varsBasic),
    getLoadInfo: _getLoadAssetInfo,
    getImageCount: function(id, metadata) {
      if (metadata && metadata.imageCount != null) {
        return metadata.imageCount;
      } else if (screenShotPaths && screenShotPaths.length) {
        return screenShotPaths.length;
      } else {
        return this.defaultImageCount;
      }
    }
  };
  if (options['originalScreenShotPath']) {
    assetGroupOptions.getOriginalImageUrl = function (id, metadata) {
      metadata = metadata || {};
      var vars = _.merge(new Object(null), varsBasic, metadata, { 'id': id });
      if (vars.baseVariantId == null || vars.baseVariantId === '')  { vars.baseVariantId = id; }
      return _.replaceVars(options['originalScreenShotPath'], vars);
    };
  }
  var opts = _.cloneDeepWithReplaceVars(options, varsBasic);
  assetGroupOptions = _.merge(new Object(null), opts, assetGroupOptions);
  var assetGroup = new AssetGroup( assetGroupOptions );
  return assetGroup;
};

// Helper functions for creating various asset groups
// Here after all asset groups defined

var _defaultAssets = Constants.assets;

function expandLists(object, sourceList, expandFn) {
  return _.cloneDeepWith(object, function(v) {
    if (_.isPlainObject(v)) {
      if (v['$list']) {
        var element = v['$list'];
        return _.map(sourceList, function(x) { return expandFn(element, x); });
      }
    }
  });
}

function createAssetDbForAssetGroup(ag, config) {
  config = config || {};
  var groupDataFn = null;
  var convertDataFn = null;
  var lazyConvertDataFn = null;
  var idField = ag.assetIdField || _.get(config, 'metadata.assetIdField') || config.assetIdField || 'id';
  var groupBy = ag.groupBy || _.get(config, 'metadata.groupBy');
  if (groupBy) {
    groupDataFn = function(assetInfos) {
      var infoFields = [groupBy.fieldName].concat(groupBy.infoFields || []);
      return _.values(_.groupBy(assetInfos, groupBy.fieldName)).map(function(records) {
        var info = _.pick(records[0], infoFields);
        info.id = info[idField];
        info.records = records;
        return info;
      });
    };
    lazyConvertDataFn = function(info) {
      if (groupBy.data && !info.data) {
        info.data = expandLists(ag.__getInterpolatedAssetInfo(groupBy.data, info[idField], info), info.records,
          function(rec,vars) { return ag.__getInterpolatedAssetInfo(rec, info[idField], vars) });
      }
      return info;
    };
  }
  return new AssetsDb({ assetIdField: idField, groupDataFn: groupDataFn,
    convertDataFn: convertDataFn, lazyConvertDataFn: lazyConvertDataFn });
}
AssetGroups.createAssetDbForAssetGroup = createAssetDbForAssetGroup;


function _registerDefaultAssetGroups() {

  for (var i = 0; i < _defaultAssets.length; i++) {
    var asset = _defaultAssets[i];
    if (typeof asset.metadata === 'string') {
      // TODO: pull metadata
      // console.log('skipping asset: ' + asset.name);
    } else {
      var ag = AssetGroups.createCustomAssetGroup(asset.metadata);
      //console.log('register asset: ' + asset.name, ag, asset.metadata);
      if (ag.lightSpecsFile) {
        ag.loadLightSpecs(function (err, res) {
          console.log('Loaded LightSpecs for ' + _.keys(res).length + ' models');
        });
      }
      AssetGroups.registerAssetGroup(ag, { isDefault: true });
      var idsFile = ag.idsFile || asset.metadata.idsFile || asset.idsFile;
      if (idsFile) {
        var assetsDb = createAssetDbForAssetGroup(ag, asset);
        ag.setAssetDb(assetsDb);
        assetsDb.loadAssetInfo(ag, idsFile, function(err, assets) {
          if (err) {
            console.error('Error loading ids for ' + ag.name, err);
          }
        });
      }
    }
  }

  _.each(AssetGroups._assetGroupsByType, function(groups, type) {
    for (var i = 0; i < groups.length; i++) {
      Constants.assetSources[type] = Constants.assetSources[type] || [];
      _.addUnique(Constants.assetSources[type], groups[i].name);
    }
  });
  AssetGroups._defaultGroupsRegistered = true;
}

AssetGroups.registerDefaults = _registerDefaultAssetGroups;

function getAssetsToRegister(assetsMap, assetGroupNames) {
  var assetsToRegister = [];
  for (var i = 0; i < assetGroupNames.length; i++) {
    var name = assetGroupNames[i];
    var info = assetsMap[name];
    if (info) {
      var requires = info.requires;
      if (requires) {
        //assetsToRegister = assetsToRegister.concat(requires);
        for (var j = 0; j < requires.length; j++) {
          if (assetGroupNames.indexOf(requires[j]) < 0) {
            assetGroupNames.push(requires[j]);
          }
        }
      }
      if (info.metadata) {
        assetsToRegister.push(name);
      }
    } else {
      console.warn('Cannot register unknown asset ' + name);
    }
  }
  assetsToRegister = _.uniq(assetsToRegister);
  return assetsToRegister;
}
AssetGroups.getAssetsToRegister = getAssetsToRegister;


module.exports = AssetGroups;