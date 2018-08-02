var ImageUtil = require('util/ImageUtil');
var JSZip = require('jszip');
var FileLoader = require('io/FileLoader');
var _ = require('util');

THREE.KMZLoader = function() {
  var options = {};
  var zip = null;

  function load (fileOrUrl, readyCallback, progressCallback, errorCallback ) {
    var zipname = _.isString(fileOrUrl)? fileOrUrl : fileOrUrl.name;
    var loader = new FileLoader();
    loader.load(fileOrUrl,
      'arraybuffer',
      function(data) {
        var zip = new JSZip(data);
        if (!zip.name) {
          zip.name = zipname;
        }
        var colladaFile = null;
        for (var filename in zip.files) {
          if (filename.endsWith(".dae")) {
            colladaFile = filename;
            break;
          }
        }

        if (colladaFile) {
          var loader = new THREE.ZippedColladaLoader(zip);
          for (var n in options) {
            loader.options[n] = options[n];
          }
          loader.load(colladaFile, readyCallback);
        } else {
          console.error("Cannot find .dae file in zip: " + zipname);
          if (errorCallback) {
            errorCallback("Cannot find .dae file in zip: " + zipname);
          }
        }
      },
      progressCallback,
      function(err) {
        console.log('Error loading ' + zipname, err);
        if (errorCallback) {
          errorCallback(err);
        }
      }
    );
  }

  return {
    load: load,
    options: options
  };
};

THREE.ZippedColladaLoader = function (zip) {
  var colladaLoader = THREE.ColladaLoader();
  var images = {};

  colladaLoader.options.loadTextureCallbackFunc = function loadTexture(basePath, relPath) {
    var path = _.getPath(basePath, relPath);
    path = path.replace(/^.\//, '');
    var img = images[path];
    var texture = new THREE.Texture();
    if (!img) {
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
  };

  function load ( url, readyCallback, progressCallback, errorCallback ) {
    var text = zip.file(url).asText();
    var xmlParser = new DOMParser();
    var responseXML = xmlParser.parseFromString( text, "application/xml" );
    colladaLoader.parse( responseXML, readyCallback, url );
  }

  colladaLoader.load = load;

  return colladaLoader;
};
