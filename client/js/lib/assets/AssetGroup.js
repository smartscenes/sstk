'use strict';

var Constants = require('Constants');
var _ = require('util/util');

/**
 * A AssetGroup represent a group of 3D assets
 * It should have the following attributes (these are what is interpreted and supported by the rest of the code):
 * <pre>
 *   name - The name of the AssetGroup (3dw, wss, etc)
 *   type - The type of asset found in the AssetGroup: model, scene, texture
 *   defaultFilter - Solr query indicate default filter to apply for this asset group (e.g. '+hasModel:true')
 *   defaultImageCount - number of images associated with the AssetGroup
 *   defaultImageIndex - which image to use as the default for the preview image
 *   defaultFront - vector indicating the default up direction (applies to model/scene)
 *   defaultUp - vector indicating the default front direction (applies to model/scene)
 *   defaultUnit - default unit this asset is modeled at (applies to model/scene)
 *   supportedFormats - Ordered array of supported formats (the first one will be the default format used)
 *   hasThumbnails - whether this AssetGroup has smaller thumbnail images
 *   texturePath - (for models only) separate path for which textures for the model are found (if not relative to model)
 *   lightSpecsFile - (for models only) path to file which specifies lights for each model id in this AssetGroup
 *   prefetchModelInfo
 *   roomFilesPath
 * </pre>
 *
 * In addition, a AssetGroup contains the following callback functions, each of which takes an id as the input parameter
 * <pre>
 *   getLoadInfo   - Returns information about how to load the asset with given id
 *     Optional parameters: format - format to load (an asset may come in multiple formats)
 *                          metadata - metadata about the asset
 *   getDefaultImageUrl - Returns the url of the default image
 *   getOriginalSourceUrl - Returns the url indicating where the asset originally came from
 *   getOriginalImageUrl - Returns the url of the original image that came with the asset
 *   getRotatingImageUrl - Returns the url of the rotating image for the asset
 *   getAllImageUrls - Returns all images associated with the asset with given id
 *   getImageUrl - Returns the image url
 *     Optional parameters: index - indicating the image requested
 *                          metadata - metadata about the asset (can include information to help determine if a image exist for an asset or not)
 *   getImagePreviewUrl - Returns the image preview url
 *     Optional parameters: index - indicating the image requested
 *                          metadata - metadata about the asset (can include information to help determine if a image exist for an asset or not)
 * </pre>
 * @param params
 * @memberOf assets
 * @constructor
 */
function AssetGroup(params) {
  // // interpolate params
  if (params.__interpolateOptions) {
    var defaultConstants = {'baseUrl': Constants.baseUrl, 'assetsDir': Constants.assetsDir};
    var interpolatedParams = this.__createInterpolated(params, defaultConstants, params.__interpolateOptions);
    params = _.defaults(interpolatedParams, params);
  }

  // TODO: Group images into sets of images with a type, index
  var defaults = {
    defaultImageCount: 1,
    defaultImageIndex: -1
  };

  // Populate defaults
  params.type = params.type || params.assetType;
  var assetTypeInfo = Constants.assetTypes[params.type];
  if (!this.assetTypeInfo) {
    this.assetTypeInfo = assetTypeInfo;
  }
  if (this.assetTypeInfo && this.assetTypeInfo.defaults) {
    _.extend(defaults, this.assetTypeInfo.defaults);
  }

  // Extend this with default values and then whatever is specified in params
  // Anything specified in params will overwrite other values
  _.extend(this, defaults, params);
  this.__normalizeData();

  // Set defaultFormat
  if (this.defaultDataType != undefined && this.dataTypes) {
    var dataTypeInfo = this.dataTypes[this.defaultDataType];
    if (dataTypeInfo && !this.supportedFormats) {
      this.supportedFormats = _.map(dataTypeInfo.data, 'name');
    }
  }

  if (this.supportedFormats && this.defaultFormat == undefined) {
    this.defaultFormat = this.supportedFormats[0];
  }
}

AssetGroup.prototype.setDefaultFormat = function(format) {
  if (this.supportedFormats && this.supportedFormats.indexOf(format) >= 0) {
    this.defaultFormat = format;
  }
};

// Takes the specified data and dataTypes and puts into normalized form
// dataTypes: { type1: { data: [...], options ... } }
AssetGroup.prototype.__normalizeData = function() {
  if (!this.data && !this.dataTypes) return; // Nothing to do
  // Parse data/dataTypes fields
  if (this.dataTypes) {
    // Make dataTypes consistent (Object with field data)
    this.dataTypes = _.mapValues(this.dataTypes, function(v, k) {
      if (Array.isArray(v)) {
        return { data: v };
      } else {
        return v;
      }
    });
  }
  if (this.data) {
    var dataByType = _.groupBy(this.data, 'dataType');
    dataByType = _.mapValues(dataByType, function(v, k) {
      return { data: v };
    });
    if (this.dataTypes) {
      // merge dataByType into this.dataTypes
      _.merge(this.dataTypes, dataByType);
    } else {
      this.dataTypes = dataByType;
    }
  }

  // Handle variants
  var interpolateOptions = this.__interpolateOptions;
  _.each(this.dataTypes, function(dataTypeInfo, dataType) {
    var hasVariants = _.filter(dataTypeInfo.data, function(d) { return d.variants; });
    var noVariants = _.filter(dataTypeInfo.data, function(d) { return !d.variants; });
    var variants = [];
    _.each(hasVariants, function(d) {
      var crossProd = _.product(_.pick(d.variants, d.variants.varying));
      var omitKeys = d.variants.varying.concat(['varying']);
      var defaults = _.defaults(_.omit(d.variants, omitKeys), _.omit(d, ['variants']));
      for (var i = 0; i < crossProd.length; i++) {
        var variant = crossProd[i];
        variant = _.cloneDeepWithReplaceVars(_.defaults(variant, defaults), variant, { optionalPrefix: interpolateOptions.variable });
        //variant = _.interpolate(_.defaults(variant, defaults), variant, interpolateOptions);
        variant.variantOf = d.name;
        variants.push(variant);
      }
    });
    dataTypeInfo.data = noVariants.concat(variants);
  });

  // Create data
  this.data = _.flatMap(this.dataTypes, 'data');
  // Make sure each data element has a dataType and a name
  _.each(this.dataTypes, function(dataTypeInfo, dataType) {
    _.each(dataTypeInfo.data, function(d) {
      d.dataType = dataType;
      if (!_.has(d, 'name')) {
        d.name = d.dataType + '-' + d.format;
      }
    });
  });
  // TODO: what if there are duplicate names?
  this.dataByName = _.keyBy(this.data, 'name');
  //console.log(this);
};

AssetGroup.prototype.getDataTypes = function() {
  return this.dataTypes;
};

AssetGroup.prototype.__createInterpolated = function(params, vars, interpolateOptions) {
  var ignoreFields = ['assetInfoType', 'assetFields', 'data', 'dataByName', 'dataTypes'];
  var interpolated = _.pickBy(params, function(v,name) { return (ignoreFields.indexOf(name) < 0 && !name.startsWith('__')) && (_.isString(v) || _.isPlainObject(v)); });
  interpolated = _.interpolate(interpolated, vars, interpolateOptions);
  _.extend(interpolated, vars);
  return interpolated;
};

AssetGroup.prototype.__getInterpolateContext = function() {
  if (!this.__interpolateContext) {
    var defaultConstants = {'baseUrl': Constants.baseUrl, 'assetsDir': Constants.assetsDir};
    this.__interpolateContext = this.__createInterpolated(this, defaultConstants, this.__interpolateOptions);
  }
  return this.__interpolateContext;
};

AssetGroup.prototype.__getInterpolatedAssetInfo = function(obj, id, metadata) {
  var vars = _.defaults(Object.create(null), {id: id}, metadata, this.__getInterpolateContext());
  if (this.assetFields) {
    var assetFields = _.interpolate(this.assetFields, vars, this.__interpolateOptions);
    vars = _.extend(vars, assetFields);
  }
  return _.interpolate(obj, vars, this.__interpolateOptions);
};

AssetGroup.prototype.__getAssetFields = function(id, metadata) {
  var vars = _.defaults(Object.create(null), {id: id}, metadata, this.__getInterpolateContext());
  if (this.assetFields) {
    var assetFields = _.interpolate(this.assetFields, vars, this.__interpolateOptions);
    if (_.isString(assetFields.imageCount)) {
      assetFields.imageCount = parseInt(assetFields.imageCount);
    }
    return assetFields;
  }
};

AssetGroup.prototype.getDataInfo = function(id, metadata) {
  if (this.dataTypes) {
    //console.log('vars', vars);
    var dataTypes = this.__getInterpolatedAssetInfo(this.dataTypes, id, metadata);
    var data = _.flatMap(dataTypes, 'data');
    _.each(data, function(loadInfo) {
      // TODO: HACK!!! Make sure both path and file populated!!!
      if (loadInfo.path == undefined && loadInfo.file != undefined) { loadInfo.path = loadInfo.file; }
      if (loadInfo.file == undefined && loadInfo.path != undefined) { loadInfo.file = loadInfo.path; }
    });
    var dataByName = _.keyBy(data, 'name');
    var dataInfo = {
      dataTypes: dataTypes,   // Data grouped by dataType
      data: data,             // List of all data
      dataByName: dataByName  // Map of name to data
    };
    return dataInfo;
  }
};

AssetGroup.prototype.__getInterpolatedField = function (id, metadata, path, field) {
  var data = _.get(this, path);
  if (data) {
    var interpolated = this.__getInterpolatedAssetInfo(data, id, metadata);
    if (interpolated && field != undefined) {
      return interpolated[field];
    } else {
      return interpolated;
    }
  }
};

AssetGroup.prototype.__getBasicLoadInfo = function (id, dataName, metadata) {
  var d = this.dataByName[dataName] || this.dataByName[this.defaultDataType + '-' + dataName];
  if (d) {
    var loadInfo = this.__getInterpolatedAssetInfo(d, id, metadata);
    if (loadInfo.path == undefined && loadInfo.file != undefined) { loadInfo.path = loadInfo.file; }
    if (loadInfo.file == undefined && loadInfo.path != undefined) { loadInfo.file = loadInfo.path; }
    return loadInfo;
  }
};

AssetGroup.prototype.__getBasicDataTypeInfo = function (id, dataType, metadata) {
  var d = this.dataTypes[dataType];
  if (d) {
    var dataTypeInfo = this.__getInterpolatedAssetInfo(_.omit(d, 'data'), id, metadata);
    return dataTypeInfo;
  }
};

AssetGroup.prototype.getLoadInfo = function (id, dataName, metadata) {
  if (dataName == undefined) {
    // dataName is not specified - let's pick the default
    dataName = this.defaultFormat;
  }
  var loadInfo = this.__getBasicLoadInfo(id, dataName, metadata);
  //console.log('supportFormats', this.supportedFormats);
  if (loadInfo.isSupported === false) {
    var mainSupportedFormat = this.supportedFormats[0];
    if (this.supportedFormats.indexOf(dataName) < 0) {
      console.warn(dataName + ' not supported for ' + id + ', using ' + mainSupportedFormat + ' instead');
      dataName = mainSupportedFormat;
      loadInfo = this.__getBasicLoadInfo(id, dataName, metadata);
    }
  }
  if (loadInfo) {
    var assetFields = this.__getAssetFields(id, metadata);
    var loadDataInfo = this.getDataInfo(id, _.defaults(loadInfo, assetFields, metadata || {}));

    // TODO: CLEAN THIS CODE UP!!!!
    // Merge default options into loadInfo
    var dataTypeInfo = loadDataInfo.dataTypes[loadInfo.dataType];
    loadInfo = _.clone(loadInfo);
    var loadOptions = loadInfo.options || {};
    if (metadata && metadata.options) {
      _.merge(loadOptions, metadata.options);
    }
    loadInfo.options = _.defaults(loadOptions, dataTypeInfo.defaultOptions || {});
    // Makes sure basic fields are populated
    var source = this.source || this.name;
    loadInfo.id = id;
    loadInfo.source = source;
    loadInfo.fullId = source + '.' + id;
    loadInfo.options.source = source;

    //console.log('loadInfo', loadInfo, dataName);

    // HACK: Splat dataByName into loadInfo
    _.defaults(loadInfo, loadDataInfo.dataByName);

    // TODO: refactor other code (Segments/Voxels to use more orderly data structure)
    loadInfo.dataInfo = loadDataInfo;
    //console.log('loadInfo', loadInfo);
    return loadInfo;
  }
};

AssetGroup.prototype.getOriginalSourceUrl = function (id, metadata) {
  var url = this.__getInterpolatedField(id, metadata, 'assetFields.originalSourceUrl');
  return url;
};

AssetGroup.prototype.getImageCount = function(id, metadata) {
  if (metadata && metadata.imageCount != null) {
    return metadata.imageCount;
  } else {
    var assetFields = this.__getAssetFields(id, metadata);
    return (assetFields && assetFields.imageCount != null)? assetFields.imageCount : this.defaultImageCount;
  }
};

AssetGroup.prototype.getAllImageUrls = function (id, metadata) {
  var imgs = [];
  var nimgs = this.getImageCount(id, metadata);
  for (var i = 0; i < nimgs; i++) {
    var url = this.getImageUrl(id,i,metadata);
    if (url) {
      imgs.push(url);
    }
  }
  if (this.getOriginalImageUrl) {
    var url = this.getOriginalImageUrl(id);
    if (url) {
      imgs.push(url);
    }
  } else {
    var imagePath = this.__getInterpolatedField(id, metadata, 'dataByName.originalImage.path');
    if (imagePath) { imgs.push(imagePath); }
  }

  // Let's dedup too
  imgs = _.uniq(imgs);
  return imgs;
};

AssetGroup.prototype.getDefaultImageUrl = function (id) {
  return Constants.screenShotDir + this.type + 's/' + this.name + '/' + id + '.png';
};

AssetGroup.prototype.loadLightSpecs = function (callback) {
  var scope = this;
  _.getJSON(this.lightSpecsFile)
    .done(function (res) {
      scope.lightSpecs = res;
      if (callback) {
        callback(null, res);
      }
    }).fail(function (err) {
      if (callback) {
        callback(err, null);
      }
    });
};

AssetGroup.prototype.getImageUrl = function (id, i, metadata) {
  var index = (i !== undefined) ? i : this.defaultImageIndex;
  var imgCount = this.getImageCount(id, metadata);
  if (index !== undefined && index >= 0 && index < imgCount) {
    var imagePath = this.__getInterpolatedField(id, _.defaults({index: i}, metadata), 'dataByName.screenshot.path');
    return imagePath ? imagePath : Constants.screenShotDir + this.type + 's/' + this.name + '/' + id + '/' + id + '-' + index + '.png';
  } else if (i === Constants.AssetGroup.ROTATING_IMAGE_INDEX) {
    if (this.getRotatingImageUrl) {
      return this.getRotatingImageUrl(id);
    } else {
      var imageInfo = this.__getInterpolatedField(id, metadata, 'dataByName.rotatingImage');
      if (imageInfo && imageInfo.isSupported !== false) {
        return imageInfo.path;
      }
    }
  } else {
    if (typeof index === 'string') {
      var imagePath = this.__getInterpolatedField(id, metadata, 'dataByName.' + index + '.path');
      if (imagePath) { return imagePath; }
    }
    if (this.getOriginalImageUrl) {
      return this.getOriginalImageUrl(id);
    } else {
      var imagePath = this.__getInterpolatedField(id, metadata, 'dataByName.originalImage.path');
      return imagePath? imagePath : this.getDefaultImageUrl(id);
    }
  }
};

// Default implementation just returns getImageUrl
AssetGroup.prototype.getImagePreviewUrl = function (id, i, metadata) {
  var url = this.getImageUrl(id, i, metadata);
  if (url && Constants.enableThumbnail && this.hasThumbnails) {
    // check that this is a regular image that we generated (and will therefore have thumbnail)
    var regex = /.+-[0-9]+\.png$/;
    if (regex.test(url) || (metadata && metadata.hasThumbnail)) {
      url = url.substr(0, url.lastIndexOf('.')) + Constants.thumbnailPostfix;
    }
  }
  return url;
};

AssetGroup.prototype.setAssetDb = function(assetDb) {
  this.assetDb = assetDb;
};

AssetGroup.prototype.getAssetInfo = function(assetId) {
  if (this.assetDb) {
    var assetInfo = this.assetDb.getAssetInfo(assetId);
    if (this.sounds && !assetInfo.sounds) {
      assetInfo.sounds = this.sounds.getModelSounds(assetInfo);
    }
    if (this.dataTypes) {
      var dataInfo = this.getDataInfo(assetInfo.id, assetInfo);
      // TODO: Don't just merge in
      _.defaults(assetInfo, dataInfo.dataByName);
    }
    return assetInfo;
  } else {
    // if (this.dataTypes) {
    //   // TODO: Don't just merge in
    //   var pos = assetId.indexOf('.');
    //   var id = (pos > 0) ? assetId.substring(pos + 1) : assetId;
    //   return this.getDataInfo(id).dataByName;
    // }
  }
};

// Exports
module.exports = AssetGroup;
