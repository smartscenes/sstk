var AssetCache = require('assets/AssetCache');
var _ = require('util');

function LoadingAsset(id) {
  // Asset is in progress
  this.id = id;
  this.__callbacks = [];
}

LoadingAsset.prototype.addCallback = function (fn) {
  this.__callbacks.push(fn);
};

LoadingAsset.prototype.done = function (err, value) {
  //console.log('asset done ' + this.id + ' notify ' + this.__callbacks.length);
  //console.log(value);
  // Call all the callbacks
  for (var i = 0; i < this.__callbacks.length; i++) {
    this.__callbacks[i](err, value);
  }
};

/**
 * Smart asset loader that can cache and not send multiple requests if an asset is already being fetched
 * @param params
 * @constructor
 * @memberOf assets
 */
function CachedAssetLoader(params) {
  params = params || {};
  // Cache of assets
  this.__defaultLoadFn = params.loadFn;
  this.__assetCache = (params.assetCacheSize >= 0) ? new AssetCache(params.assetCacheSize) : undefined;
  this.__loading = {};
  this.debug = false;
}

CachedAssetLoader.prototype.getCache = function() {
  return this.__assetCache;
};

CachedAssetLoader.prototype.get = function(key) {
  return this.__assetCache.get(key);
};

CachedAssetLoader.prototype.getOrElse = function(key, fetch, dispose) {
  return this.__assetCache.getOrElse(key, fetch, dispose);
};

CachedAssetLoader.prototype.load = function(opts) {
  opts = _.defaults(new Object(null), opts, {
    cache: this.__assetCache,
    loadFn: this.__defaultLoadFn
  });
  return this.__loadAsset(opts);
};

CachedAssetLoader.prototype.__loadAsset = function(opts) {
  var cache = opts.cache;
  var key = opts.key;
  var callback = opts.callback;
  var loadFn = opts.loadFn;
  var loadOpts = opts.loadOpts;
  var skipCache = opts.skipCache;

  if (cache && key) {
    var asset = skipCache? undefined : cache.get(key);
    if (asset != undefined) {
      if (this.debug) {
        console.log('Load asset (from cache): ' + key);
      }
      callback(null, asset);
    } else {
      // Load and add to asset cache
      var scope = this;
      var loadingAsset = this.__loading[key];
      if (loadingAsset) {
        if (this.debug) {
          console.log('Load asset (add listener): ' + key);
        }
        loadingAsset.addCallback(callback);
      } else {
        if (this.debug) {
          console.log('Load asset (new request): ' + key);
        }
        loadingAsset = new LoadingAsset(key);
        loadingAsset.addCallback(function (err, x) {
          if (!err) {
            if (!skipCache) {
              cache.set(key, x, null, opts.dispose);
            }
          } else {
            console.error('Error fetching ' + key, err);
          }
          delete scope.__loading[key];
        });
        loadingAsset.addCallback(callback);
        scope.__loading[key] = loadingAsset;
        return loadFn(loadOpts, function(err, result) {
          loadingAsset.done(err, result);
        });
      }
    }
  } else {
    return loadFn(loadOpts, function(err, result) {
      callback(err, result);
    });
  }
};

module.exports = CachedAssetLoader;
