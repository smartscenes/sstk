'use strict';

/**
 * Basic cache for assets.
 * @param maxSize
 * @constructor
 * @memberOf assets
 */
function AssetCache(maxSize) {
  this.cache = {};
  this.maxSize = maxSize;
  this.debug = false;
}

// Consider allowing for timeout after x amount of time or using weakmap so unused entries can be garbage collected
function CacheEntry(id, asset, aSize, dispose) {
  this.id = id;
  this.asset = asset;
  this.aSize = aSize;
  this.dispose = dispose;
  this.timestamp = Date.now();
}

AssetCache.prototype.get = function (id) {
  if (this.cache.hasOwnProperty(id)) {
    this.cache[id].timestamp = Date.now();  // touch entry
    return this.cache[id].asset;
  } else {
    return null;
  }
};

AssetCache.prototype.getOrElse = function (id, fetch, dispose) {
  if (this.cache.hasOwnProperty(id)) {
    this.cache[id].timestamp = Date.now();  // touch entry
    return this.cache[id].asset;
  } else {
    var asset = fetch(id);
    this.set(id, asset, null, dispose);
    return asset;
  }
};

// 'aSize' may be omitted, in which case it is assumed to be 1
// (i.e. we aren't actually computing the sizes of assets and are
// implicitly treating them as all the same size)
AssetCache.prototype.set = function (id, asset, aSize, disposeCb) {
  if (this.cache.hasOwnProperty(id)) {
    return;
  }

  aSize = aSize | 1;

  // Evict, if necessary.
  while (this.maxSize > 0 && this.computeSize() + aSize > this.maxSize) {
    var lru = this.findLRU();
    this.__remove(lru.id);
  }

  this.cache[id] = new CacheEntry(id, asset, aSize, disposeCb);
};

AssetCache.prototype.__remove = function(id) {
  var entry = this.cache[id];
  if (this.debug) {
    console.log('Removing cached asset: ' +  id + ', dispose=' + !!(entry && entry.dispose));
  }
  if (entry && entry.dispose) {
    entry.dispose(entry.asset);
  }
  delete this.cache[id];
};

AssetCache.prototype.computeSize = function () {
  var s = 0;
  for (var id in this.cache) {
    if (this.cache.hasOwnProperty(id)) {
      s += this.cache[id].aSize;
    }
  }
  return s;
};

AssetCache.prototype.findLRU = function () {
  var lru = null;
  var lrutime = Date.now();
  for (var id in this.cache) {
    if (this.cache.hasOwnProperty(id)) {
      var entry = this.cache[id];
      if (entry.timestamp < lrutime) {
        lrutime = entry.timestamp;
        lru = entry;
      }
    }
  }
  return lru;
};

AssetCache.prototype.clear = function (id) {
  if (id != undefined) {
    this.__remove(id);
  } else {
    for (var k in this.cache) {
      if (this.cache.hasOwnProperty(k)) {
        var entry = this.cache[k];
        if (entry && entry.dispose) {
          entry.dispose(entry.asset);
        }
      }
    }
    this.cache = {};
  }
};

// Exports
module.exports = AssetCache;

