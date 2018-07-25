var JSZip = require('jszip');
var ImageUtil = require('util/ImageUtil');
var FileLoader = require('io/FileLoader');
var _ = require('util');

function loadFile(zip, basePath, relPath) {
  var path = _.getPath(basePath, relPath);
  path = path.replace(/^.\//, '');
  var file = zip.file(path);
  return file;
}

function loadTextFile(zip, basePath, relPath) {
  var file = loadFile(zip, basePath, relPath);
  if (file) {
    return file.asText();
  }
}

function loadBinaryFile(zip, basePath, relPath) {
  var file = loadFile(zip, basePath, relPath);
  if (file) {
    return file.asBinary();
  }
}

function loadTexture(zip, basePath, relPath, images) {
  var path = _.getPath(basePath, relPath);
  path = path.replace(/^.\//, '');
  var img = images[path];
  var texture = new THREE.Texture();
  texture.name = path;
  texture.sourceFile = path;
  if (!img) {
    // console.log('load image', path);
    var imgfile = zip.file(path);
    if (imgfile) {
      var imageData = imgfile.asBinary(); // Note: this is string
      // Let the file extension be the image type
      var extIndex = relPath.lastIndexOf(".");
      var imageType = (extIndex >= 0) ? relPath.substring(extIndex + 1) : "jpg";
      // Base64 encode
      var imageDataEncoded = btoa(imageData);
      var datauri = "data:image/" + imageType + ";base64," + imageDataEncoded;
      if (typeof Image !== 'undefined') {
        // In browser with Image
        img = new Image();
        img.path = path;
        img.src = datauri;
        img.addEventListener('load', function() {
          // Need to wait for image to load before there is width and height to use
          ImageUtil.ensurePowerOfTwo(img, texture, function(err, resizedImage) {
            if (err) {
              console.warn('Error resizing image to power of two', err);
            }
            texture.image = resizedImage || img;
            texture.needsUpdate = true;
            images[path] = texture.image;
          });
        }, false);
        //img = ImageUtil.ensurePowerOfTwo(img);
      } else {
        // Not in browser
        var pixels = ImageUtil.getPixelsSync(datauri, 'image/' + imageType);
        img = {
          src: path,
          data: pixels.data,
          width: pixels.shape[0],
          height: pixels.shape[1],
          channels: pixels.shape[2]
        };
        ImageUtil.ensurePowerOfTwo(img, texture, function(err, resizedImage) {
          if (err) {
            console.warn('Error resizing image to power of two', err);
          }
          texture.image = resizedImage || img;
          texture.needsUpdate = true;
          images[path] = texture.image;
        });
      }
    } else {
      console.error('Error getting image ' + path + ' from ' + zip.name);
    }
  } else {
    texture.image = img;
    texture.needsUpdate = true;
  }
  // texture.sourceFile = url;
  return texture;
}

/**
 * A loader for handling a zipped file
 * @param params
 * @param params.regex {string} Pattern of main file to match
 * @param params.loader Base loader with zippedLoad or load function
 * @constructor
 */
var ZIPLoader = function(params) {
  this.options = params;
  this.__cached = {};
};

ZIPLoader.prototype = {

  constructor: ZIPLoader,

  load: function (fileOrUrl, readyCallback, progressCallback, errorCallback) {
    var zipLoader = this;
    var options = this.options;

    var zipname = _.isString(fileOrUrl) ? fileOrUrl : fileOrUrl.name;
    var loader = new FileLoader();
    loader.load(fileOrUrl,
      'arraybuffer',
      function (data) {
        var zip = new JSZip(data);
        zipLoader.zip = zip;
        var regex = options.regex;
        var mainFile = null;
        for (var filename in zip.files) {
          var match = regex.exec(filename);
          if (match) {
            mainFile = filename;
            break;
          }
        }

        if (mainFile) {
          var loader = options.loader;
          // Push options into loader
          if (loader.options) {
            for (var n in options) {
              loader.options[n] = options[n];
            }
          }
          if (loader.zippedLoad) {
            loader.zippedLoad(zipLoader, mainFile, readyCallback, progressCallback, errorCallback);
          } else {
            loader.load(mainFile, readyCallback, progressCallback, errorCallback);
          }
        } else {
          console.error("Cannot find file matching regex " + regex + " in zip: " + zipname);
          if (errorCallback) {
            errorCallback("Cannot find file matching regex " + regex + " in zip: " + zipname);
          }
        }
      },
      progressCallback,
      function (err) {
        console.log('Error loading ' + zipname, err);
        if (errorCallback) {
          errorCallback(err);
        }
      }
    );
  },


  loadFile: function(basePath, relPath) {
    return loadFile(this.zip, basePath, relPath);
  },

  loadBinaryFile: function(basePath, relPath) {
    return loadBinaryFile(this.zip, basePath, relPath);
  },

  loadTextFile: function(basePath, relPath) {
    return loadTextFile(this.zip, basePath, relPath);
  },

  loadTexture: function(basePath, relPath) {
    return loadTexture(this.zip, basePath, relPath, this.__cached);
  }
};

module.exports = ZIPLoader;