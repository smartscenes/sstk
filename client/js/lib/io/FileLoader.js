'use strict';

var Constants = require('Constants');
var LocalFileLoader = require('io/LocalFileLoader');
var IOUtil = require('io/IOUtil');

function FileLoader(params) {
  params = params || {};
  this.manager = params.manager;
  this.crossOrigin = params.crossOrigin;
  this.defaultOnLoad = params.defaultOnLoad;
  this.defaultOnProgress = params.defaultOnProgress;
  this.defaultOnError = params.defaultOnError || function (event) {
    console.error('Error fetching');
    console.log(event);
  };
}

FileLoader.prototype.loadErrorFirst = function (fileOrUrl, encoding, callback) {
  // Load with node.js error first style callback(err, result)
  this.load(fileOrUrl, encoding,
    function(data) { callback(null, data); },
    null,
    function(err) { callback(err, null); }
  );
};

FileLoader.prototype.load = function (fileOrUrl, encoding, onLoad, onProgress, onError) {
  // Load compatible in style to THREE.js loaders
  if (fileOrUrl instanceof File) {
    return this.loadFromLocal(fileOrUrl, encoding, onLoad, onProgress, onError);
  } else if (typeof fileOrUrl === 'string') {
    return this.loadFromUrl(fileOrUrl, encoding, onLoad, onProgress, onError);
  } else {
    console.error('Invalid argument to load: ', fileOrUrl);
    if (onError) {
      onError('Invalid argument to load: ', fileOrUrl);
    }
  }
};

FileLoader.prototype.loadFromLocal = function (file, encoding, onLoad, onProgress, onError) {
  onLoad = onLoad || this.defaultOnLoad;
  onProgress = onProgress || this.defaultOnProgress;
  onError = onError || this.defaultOnError;
  var localLoader = new LocalFileLoader();
  return localLoader.load(file, encoding, onLoad, onProgress, onError);
};

FileLoader.prototype.loadFromUrl = function (url, encoding, onLoad, onProgress, onError) {
  onLoad = onLoad || this.defaultOnLoad;
  onProgress = onProgress || this.defaultOnProgress;
  onError = onError || this.defaultOnError;
  var loader = new THREE.FileLoader(this.manager);
  //loader.setCrossOrigin(this.crossOrigin);
  if (encoding) {
    if (encoding === 'json' || encoding === 'jsonl') {
      if (onLoad) {
        var oldOnLoad = onLoad;
        onLoad = function (text) {
          var parsed;
          try {
            if (encoding === 'json') {
              parsed = JSON.parse(text);
            } else {
              parsed = IOUtil.parseJsonl(text);
            }
          } catch (err) {
            onError('Invalid json from ' + url);
            return;
          }
          oldOnLoad(parsed);
        };
      }
    } else {
      if (Constants.isBrowser && encoding.toLowerCase().replace('-', '') === 'utf8') {
        encoding = 'text';
      }
      loader.setResponseType(encoding);
    }
  }
  return loader.load(url, onLoad, onProgress, onError);
};

module.exports = FileLoader;