var async = require('async');
var deasync = require('deasync');
var fs = require('./lib/file-util.js');
var getPixels = require('get-pixels');
var jsdom = require('jsdom');
var path = require('path');
var _ = require('lodash');
var canvas = { addEventListener: function () { return 1; } };  // dummy canvas

// Set up configuration (suppress warnings if no configuration file found)
process.env.SUPPRESS_NO_CONFIG_WARNING = 'y';
var config = require('config');
// Default configuration
var defaultConfig = {
  fileCache: { size: 50 },
  imageCache: { size: 200 },
  imageQueue: { concurrency: 4 }
};
// Mixin configs that have been passed in, and make those my defaults
//config.util.extendDeep(defaultConfig, configs);
config.util.setModuleDefaults('ssc', defaultConfig);
var sscConfig = config.get('ssc');

// setup the simplest document possible and patch global context with window, document, and THREE
var doc = jsdom.jsdom('<!doctype html><html><head></head><body><div id="canvas"></div></body></html>', {
  features: { FetchExternalResources: ['img'] }
});
var win = doc.defaultView;
global.window = win;
global.document = doc;
global.isNode = true;
// take all properties of the window object and also attach it to the node global object
function propagateToGlobal(w) {
  for (var key in w) {
    if (!w.hasOwnProperty(key)) { continue; }
    if (key in global) { continue; }
    global[key] = w[key];
  }
}
propagateToGlobal(win);
global.DOMParser = win.DOMParser;
// need to load THREE after patching globals and add it to globals
var THREE = require('sstk-core/js/vendor/three/three');
global.THREE = THREE;
global.File = function () { };  // TODO(MS): Hack for AssetLoader.load()

if (process.env.NODE_BASE_URL == undefined) {
  _.defaults(sscConfig, {base_url: 'file://' + process.env.HOME + '/work', assets_url: 'file://' + __dirname + '/../server/static'}); // TODO(MS): Better way to set default base
} else {
  _.defaults(sscConfig, {base_url: process.env.NODE_BASE_URL, assets_url: 'file://' + __dirname + '/../server/static'});
}
global.window.globals = sscConfig;

console.log('Configuration', sscConfig);

var STK = require('sstk-core');
// Indicate that we are not on the browser
STK.Constants.isBrowser = false;

// console.log('baseUrl is ' + STK.Constants.baseUrl);
// console.log('assetsDir is ' + STK.Constants.assetsDir);
// console.log('dataDir is ' + STK.Constants.dataDir);
// console.log('defaultVars is ', STK.Constants.defaultVars);
// Who uses the XMLHttpRequest?  ColladaLoader and _.getJSON
if (STK.Constants.baseUrl.startsWith('http:') || STK.Constants.baseUrl.startsWith('https:') ) {
  // NOTE: Don't support file://
  global.XMLHttpRequest = require('w3c-xmlhttprequest').XMLHttpRequest;
} else {
  // NOTE: Don't post response in event!!!
  global.XMLHttpRequest = require('xmlhttprequest').XMLHttpRequest;
}
STK.ImageUtil.getPixelsSync = deasync(getPixels);
STK.ImageUtil.bufferToRawPixelsSync = deasync(STK.ImageUtil.bufferToRawPixels);
STK.ImageUtil.makePowerOfTwoSync = deasync(STK.ImageUtil.makePowerOfTwo);

var AssetGroups = STK.assets.AssetGroups;
var AssetsDb = STK.assets.AssetsDb;

var cachedFileLoader = new STK.assets.CachedAssetLoader({
  assetCacheSize: sscConfig.fileCache.size,
  loadFn: function (loadOpts, callback) {
    //console.log('load ' + loadOpts.url + ', ' + this.responseType);
    fs.readAsync(loadOpts.url, loadOpts.encoding || 'utf8', callback);
  }
});
var cachedImagesLoader = new STK.assets.CachedAssetLoader({
  assetCacheSize: sscConfig.imageCache.size,
  loadFn: function (loadOpts, callback) {
    //console.log('request image: ' + loadOpts.url);
    //console.log('request image: ' + loadOpts.url.length, loadOpts.mimeType);
    getPixels(loadOpts.url, loadOpts.mimeType, callback);
    // fs.readAsync(loadOpts.url, 'arraybuffer', function(err, buffer) {
    //   if (buffer) {
    //     STK.ImageUtil.bufferToRawPixels(buffer, callback);
    //   } else {
    //     callback(err);
    //   }
    // });
  }
});

// FileLoader for handling local file loading, indicated by "file://" URI prefix
var FileLoader = function (manager) {
  this.manager = (manager !== undefined) ? manager : THREE.DefaultLoadingManager;
  this.responseType = 'utf8';
};
FileLoader.prototype = {
  constructor: FileLoader,
  load: function (url, onLoad, onProgress, onError) {
    if (typeof url === 'string' && url.startsWith('file://')) { url = url.substr(7); }
    cachedFileLoader.load({
      key: url,
      loadOpts: { url: url, encoding: this.responseType === 'text'? 'utf8' : this.responseType },
      callback: function (err, data) {
        if (err) {
          if (onError) {
            onError(err);
          } else {
            console.error('Error loading ' + url);
          }
        } else {
          if (onLoad) { setTimeout(function () { onLoad(data); }, 0); }
        }
      }
    });
    return {};  // TODO(MS): Do something more reasonable
  },
  setResponseType: function (type) {
    this.responseType = type;
  }
};
// TODO(MS): HACK!!! Replace XHRLoader load with FileLoader load for local filesystem access
THREE.FileLoader.prototype.load = FileLoader.prototype.load;

// NOTE: The THREE.Cache is not capped in size and will fetch if request is outstanding
THREE.Cache.enabled = true;

THREE.ImageLoaderQueue = async.queue(function (task, callback) {
  var url = task.url;
  var key;
  var loadOpts;
  if (_.isString(url)) {
    if (url.startsWith('file://')) { url = url.substr(7); }
    key = url;
    loadOpts = { url: url };
  } else if (url && url.type === 'bufferView') {
    key = url.key;
    url.buffer = Buffer.from(url.buffer);
    loadOpts = { url: url.buffer, mimeType: url.mimeType };
  } else {
    callback('Invalid image url');
    return;
  }
  cachedImagesLoader.load({
    key: key,
    loadOpts: loadOpts,
    callback: function (err, pixels) {
      if (err) {
        console.error('Error loading: ' + key);
        console.error(err);
        if (task.onError) {
          task.onError(err);
        }
        callback(err, null);
      } else {
        var image = {
          src: key,
          data: pixels.data,
          width: pixels.shape? pixels.shape[0] : pixels.width,
          height: pixels.shape? pixels.shape[1] : pixels.height,
          channels: pixels.shape? pixels.shape[2] : pixels.channels
        };
        // console.log('ImageLoaded: ' + key + ' ' + image.width + 'x' + image.height);
        // TODO(AXC): HACK!!! Added extra argument waitForImageReady
        //  do some async final processing before declaring image ready
        if (task.onLoad !== undefined) {
          task.onLoad(image, task.waitForImageReady? callback : undefined);
        }
        if (!task.waitForImageReady) {
          callback(null, image);
        }
      }
    }
  });
}, sscConfig.imageQueue.concurrency);

var imageQueuePubSub = new STK.PubSub();
THREE.ImageLoaderQueue.drain = function() {
  imageQueuePubSub.Publish('drain');
};
function __waitImagesLoaded(cb) {
  if (THREE.ImageLoaderQueue.idle()) {
    if (cb) {
      setTimeout(function() { cb(); }, 0);
    }
  } else {
    imageQueuePubSub.SubscribeOnce('drain', imageQueuePubSub, function() {
      // Keep waiting until it done, really really done!
      setTimeout(function() { __waitImagesLoaded(cb); }, 0);
    });
  }
}
function waitImagesLoaded(cb) {
  console.time('waitImagesLoaded');
  __waitImagesLoaded(() => { console.timeEnd('waitImagesLoaded'); if (cb) { cb(); } });
}

function disableImagesLoading() {
  THREE.ImageLoaderQueue.disabled = true;
}

var PlaceholderImage = {
  data: new Uint8Array(0),
  width: 0,
  height: 0
};

// TODO(MS): HACK!!! Replace ImageLoader load with version handling local filesystem access
// TODO(AXC): HACK!!! Added extra argument waitForImageReady (see Materials.loadTextureImage) that allows us
//   to load image, do some async final processing before declaring image ready
THREE.ImageLoader.prototype.load = function (url, onLoad, onProgress, onError, waitForImageReady) {
  var task = { url: url, onLoad: onLoad, onError: onError, waitForImageReady: waitForImageReady};
  var placeholder = { src: url };
  if (!THREE.ImageLoaderQueue.disabled) {
    THREE.ImageLoaderQueue.push(task, function (err, image) {
      _.merge(placeholder, image || PlaceholderImage);
      return placeholder;
    });
  } else {
    if (onError) {
      onError('Image loading disabled');
    }
  }
  return placeholder;
};

function resolvePath(refPath, p) {
  if (p == null) { return null; }
  if (p.startsWith('https://') || p.startsWith('http://') || p.startsWith('file://')) {
    return p;
  } else {
    return path.resolve(refPath, p);
  }
}

// Read gaps lights map file and returns object mapping { modelId: [lights] }
var readGapsLights = function (lightsfile) {
  var data = fs.readSync(lightsfile);
  var lightsLoader = new STK.assets.LightsLoader();
  return lightsLoader.parse(data);
};

var registerCustomAssetGroupSync = function (metadata, assetIdsFile, assetIdField) {
  var json;
  if (typeof(metadata) === 'string') {
    var metadataFile = metadata;
    json = fs.readSync(metadataFile);
    if (!json) {
      throw 'Error reading file ' + metadataFile;
    }
    json = JSON.parse(json);
  } else {
    json = metadata;
  }
  var assetGroup = AssetGroups.createCustomAssetGroup(json);
  if (!assetIdsFile) {
    assetIdsFile = assetGroup.idsFile;
  }
  var assetIdsString;
  if (assetIdsFile != null) {
    assetIdsString = fs.readSync(assetIdsFile);
    if (!assetIdsString) {
      throw 'Error reading file ' + assetIdsFile;
    }
  }
  if (assetIdField == null) {
    assetIdField = assetGroup.assetIdField;
  }
  AssetGroups.registerAssetGroup(assetGroup);
  console.log('Registered asset group: ' + assetGroup.name);
  var assetsDb = AssetGroups.createAssetDbForAssetGroup(assetGroup, {assetIdField: assetIdField});
  if (assetIdsString) {
    assetsDb.loadAssetInfoFromData(assetGroup, assetIdsString, assetIdsFile);
  }
  assetGroup.setAssetDb(assetsDb);
  if (assetGroup.lightSpecsFile) {
    var res = fs.readSync(assetGroup.lightSpecsFile);
    if (res) {
      assetGroup.lightSpecs = JSON.parse(res);
      var modelsWithLights = _.keys(assetGroup.lightSpecs);
      console.log('Loaded lightSpecs for ' + modelsWithLights.length + ' models.');
    }
  }
  return { assetGroup: assetGroup, assetsDb: assetsDb };
};

var registerCustomAssetGroupsSync = function(assetsMap, assetGroupNames, refPath) {
  refPath = refPath || __dirname;
  assetGroupNames = assetGroupNames || _.keys(assetsMap);
  var assetsToRegister = AssetGroups.getAssetsToRegister(assetsMap, assetGroupNames);
  for (var j = 0; j < assetsToRegister.length; j++) {
    var g = assetsMap[assetsToRegister[j]];
    var metadataRefPath = (g.refpath != null) ? g.refpath : refPath;
    var metadata = g.metadata;
    if (typeof(metadata) === 'string') {
      console.log('register ' + metadata);
      metadata = resolvePath(metadataRefPath, metadata);
    }
    var idsPath = resolvePath(metadataRefPath, g.ids);
    //console.log(metadataPath, idsPath);
    registerCustomAssetGroupSync(metadata, idsPath, g.assetIdField);
  }
};

/**
 * Register asset groups
 * @param [opts]
 * @param [opts.assetSources] {string[]} List of asset sources to register
 * @param [opts.assetFiles] {string[]} List of asset files to include
 * @param [opts.skipDefaults] {boolean} Whether to skip defaults or not
 * @param [opts.includeAllAssetFilesSources] {boolean} Whether to automatically include as sources listed in assetFiles
 */
var registerAssetGroupsSync = function(opts) {
  opts = opts || {};
  if (!opts.skipDefaults) {
    AssetGroups.registerDefaults();
  }
  var assets = (opts.skipDefaults)? [] : require('./data/assets.json');
  for (var i = 0; i < assets.length; i++) {
    assets[i] = STK.util.interpolate(assets[i], STK.Constants.defaultVars);
  }
  var assetsMap = _.keyBy(assets, 'name');

  var assetSources = opts.assetSources || [];
  var assetFiles = opts.assetFiles || [];
  for (var i = 0; i < assetFiles.length; i++) {
    // Load additional custom assets
    var customAssets = assetFiles[i];
    if (typeof(assetFiles[i]) === 'string') {
      var customAssetsPath = assetFiles[i];
      if (!fs.existsSync(customAssetsPath)) {
        console.error('Cannot register custom assets: ' + customAssetsPath + ' not found');
      }
      customAssets = JSON.parse(STK.fs.readSync(customAssetsPath));
      _.each(customAssets, function (a) {
        if (a.refpath == null) {
          a.refpath = path.dirname(customAssetsPath);
        }
      });
    }

    var customAssetsMap = _.keyBy(customAssets, 'name');
    _.merge(assetsMap, customAssetsMap); // Override with custom assets if duplicate name
    if (opts.includeAllAssetFilesSources) {
      assetSources = _.uniq(assetSources.concat(_.keys(customAssetsMap)));
    }
  }
  registerCustomAssetGroupsSync(assetsMap, assetSources);
};

function checkMemory(prefix, opts) {
  prefix = prefix || '';
  opts = opts || {};
  var memUsage = process.memoryUsage();
  if (global.gc) {
    console.log('Garbage collection.. memory=', memUsage);
    global.gc();
    memUsage = process.memoryUsage();
  }
  console.log(prefix + ' memory=', memUsage);
  if (opts.heapdump && opts.heapdump.limit) {
    opts.heapdump.count = opts.heapdump.count || 0;
    if (opts.heapdump.count < opts.heapdump.limit) {
      var heapdump = require('heapdump');
      heapdump.writeSnapshot(function (err, filename) {
        console.log('dump written to', filename);
      });
      opts.heapdump.count++;
    }
  }
  return memUsage;
}

function clearCache(opts) {
  opts = opts || {};
  THREE.Cache.clear();
  cachedFileLoader.getCache().clear();
  cachedImagesLoader.getCache().clear();
  if (opts.assetManager) {
    opts.assetManager.clearCache();
  }
}

// Busy wait function for debugging/testing
function busywait(secs) {
  console.log('Busy wait for ' + secs + ' seconds');
  var start = new Date();
  var now;
  var msecs = secs*1000;

  while (true) {
    now = new Date();
    if (now - start >= msecs) {
      break;
    }
  }
  console.log('Busy wait done');
}

// Update ajax functions
var najax = require('najax');
STK.util.ajax = function(opts) {
  opts = STK.util.__prepareAjaxOpts(opts);
  return najax(opts);
};
STK.util.post = function(opts) {
  opts = STK.util.__prepareAjaxOpts(opts);
  return najax.post(opts);
};
STK.util.param = require('jquery-param');

STK.Constants.sys = { fs: fs, Buffer: Buffer };
STK.ImageUtil.sharp = require('sharp');

// Exports -- just patch functionality into STK and return it all
STK.fs = fs;
STK.PNGRenderer = require('./lib/OffscreenRenderer.js')(STK.gfx.Renderer, STK.ImageUtil, STK.Colors);
// Always create PNGRenderer
STK.gfx.RendererFactory.createRenderer = function(opts) {
  return new STK.PNGRenderer(opts);
};
STK.gfx.readGapsLights = readGapsLights;
STK.assets.registerCustomAssetGroupSync = registerCustomAssetGroupSync;
STK.assets.registerCustomAssetGroupsSync = registerCustomAssetGroupsSync;
STK.assets.registerAssetGroupsSync = registerAssetGroupsSync;
STK.util.waitImagesLoaded = waitImagesLoaded;
STK.util.disableImagesLoading = disableImagesLoading;
STK.util.clearCache = clearCache;
STK.util.checkMemory = checkMemory;
STK.util.readSync = STK.fs.readSync;
STK.util.readAsync = STK.fs.readAsync;
STK.util.loadLabelColorIndex = STK.fs.loadLabelColorIndex;
STK.util.execSync = STK.fs.execSync;
STK.util.busywait = busywait;
STK.util.resolvePath = resolvePath;

module.exports = STK;
