const fflate = require('fflate');
const DataUriUtil = require('util/DataUriUtil');
const ImageUtil = require('util/ImageUtil');
const FileLoader = require('io/FileLoader');
const _ = require('util/util');

function loadFile(zip, basePath, relPath, cacheOpts) {
  let path = _.getPath(basePath, relPath);
  path = path.replace(/^.\//, '');
  const file = zip.file(path);
  if (file && cacheOpts) {
    // Rewrite path
    const p = cacheOpts.rewritePath? cacheOpts.rewritePath(path) : path;
    const cachePath = cacheOpts.dir + '/' + p;
    cacheOpts.fs.fsWriteToFileEnsureDir(cachePath, file._data);
  }
  return file;
}

function loadTextFile(zip, basePath, relPath, cacheOpts) {
  const file = loadFile(zip, basePath, relPath, cacheOpts);
  if (file) {
    return file.asText();
  }
}

function loadBinaryFile(zip, basePath, relPath, cacheOpts) {
  const file = loadFile(zip, basePath, relPath, cacheOpts);
  if (file) {
    return file.asBinary();
  }
}

function loadTexture(zip, basePath, relPath, images, cacheOpts) {
  let path = _.getPath(basePath, relPath);
  path = path.replace(/^.\//, '');
  let img = images[path];
  const texture = new THREE.Texture();
  texture.name = path;
  texture.sourceFile = path;
  if (!img) {
    // console.log('load image', path);
    const imgfile = zip.file(path);
    if (imgfile) {
      const datauri = imgfile.asObjectURL();
      //var imageData = imgfile.asBinary(); // Note: this is string
      if (cacheOpts) {
        const cachePath = cacheOpts.dir + '/' + path;
        console.log('Save texture ' + path + ' to ' + cachePath);
        cacheOpts.fs.fsWriteToFileEnsureDir(cachePath, imgfile._data);
      }
      // Let the file extension be the image type
      const extIndex = relPath.lastIndexOf(".");
      const imageType = (extIndex >= 0) ? relPath.substring(extIndex + 1) : "jpg";
      // Base64 encode
      //var imageDataEncoded = btoa(imageData);
      //var datauri = "data:image/" + imageType + ";base64," + imageDataEncoded;
      const fullPath =  (zip.path != null)? zip.path + '/' + path : path;
      if (typeof Image !== 'undefined') {
        // In browser with Image
        img = new Image();
        img.path = fullPath;
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
        const pixels = ImageUtil.getPixelsSync(datauri, 'image/' + imageType);
        //var pixels = ImageUtil.bufferToRawPixelsSync(imgfile._data);
        img = {
          src: fullPath,
          data: pixels.data,
          width: pixels.shape? pixels.shape[0] : pixels.width,
          height: pixels.shape? pixels.shape[1] : pixels.height,
          channels: pixels.shape? pixels.shape[2] : pixels.channels
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

class ZipFile {
  constructor(data, path) {
    this._zip = fflate.unzipSync(new Uint8Array(data));
    this.path = path;
  }

  get filenames() {
    return Object.keys(this._zip);
  }

  file(filename) {
    const uint8array = this._zip[filename];
    if (uint8array) {
      return {
        _data: uint8array,
        asText: () => fflate.strFromU8(uint8array),
        asBinary: () => uint8array.buffer,
        asObjectURL: () => {
          return DataUriUtil.toDataURI(uint8array.buffer, 'application/octet-stream');
        }
      };
    }
  }

  findFirstMatchingFile(regex) {
    let mainFile = null;
    const filenames = this.filenames;
    for (let filename of filenames) {
      const match = regex.exec(filename);
      if (match) {
        mainFile = filename;
        break;
      }
    }
    return mainFile;
  }
}

/**
 * A loader for handling a zipped file
 * @param params
 * @param params.regex {string} Pattern of main file to match
 * @param params.loader Base loader with zippedLoad or load function
 * @constructor
 */
class ZIPLoader {
  constructor(params) {
    this.options = params;
    this.__cached = {};
  }

  load(fileOrUrl, readyCallback, progressCallback, errorCallback) {
    const zipLoader = this;
    const options = this.options;

    const zipname = _.isString(fileOrUrl) ? fileOrUrl : fileOrUrl.name;
    const fileloader = new FileLoader();
    fileloader.load(fileOrUrl,
      'arraybuffer',
      function (data) {
        const zip = new ZipFile(data, zipname);
        zipLoader.zip = zip;
        const regex = options.regex;
        const mainFile = zip.findFirstMatchingFile(regex);
        if (mainFile) {
          const loader = options.loader;
          // Push options into loader
          if (loader.options) {
            for (let n in options) {
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
  }


  loadFile(basePath, relPath) {
    return loadFile(this.zip, basePath, relPath, this.options.cacheOpts);
  }

  loadBinaryFile(basePath, relPath) {
    return loadBinaryFile(this.zip, basePath, relPath, this.options.cacheOpts);
  }

  loadTextFile(basePath, relPath) {
    return loadTextFile(this.zip, basePath, relPath, this.options.cacheOpts);
  }

  loadTexture(basePath, relPath) {
    return loadTexture(this.zip, basePath, relPath, this.__cached, this.options.textureCacheOpts || this.options.cacheOpts);
  }

  normalizePath(path) {
    return path.replace(/^.\//, '');
  }
}

module.exports = ZIPLoader;