/**
 * Utility functions for working with scenes
 * @module ImageUtil
 */
var ImageUtil = {};
var Constants = require('Constants');
var Colors = require('util/Colors');
var TypeUtils = require('data/TypeUtils');
var _ = require('util/util');

ImageUtil.DISABLE_IMAGE_RESIZE = false;

/**
 * Pixel buffer
 * @typedef PixelBuffer
 * @type {object}
 * @property {ArrayBuffer} data - buffer of pixel values
 * @property {int} width
 * @property {int} height
 * @property {int} channels - number of channel in pixels buffer (4 for RGBA)
 * */

/**
 * Extract image data from element
 * @param image
 * @return {{data: *, width: int, height: int}}
 * @static
 */
function getImageData(image) {
  if (image.data) {
    return { data: image.data, width: image.width, height: image.height, channels: image.channels };

  }
  // Use document canvas to draw image
  if (document) {
    var canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    var context = canvas.getContext('2d');
    if (context) {
      context.drawImage(image, 0, 0, image.width, image.height);
      return context.getImageData(0, 0, image.width, image.height);
    }
  }
  console.error('Cannot get image data: cannot create context');
}
ImageUtil.getImageData = getImageData;

/**
 * Extract image data from element
 * @param image
 * @return {{data: *, width: int, height: int}}
 * @static
 */
function getImageDataScaled(image, factor) {
  // if (image.data) {
  //   return { data: image.data, width: image.width, height: image.height, channels: image.channels };
  // }
  // Use document canvas to draw image
  if (document) {
    var canvas = document.createElement('canvas');
    canvas.width = image.width * factor;
    canvas.height = image.height * factor;
    var context = canvas.getContext('2d');
    if (context) {
      context.imageSmoothingEnabled = false;
      
      // Use nearest-neighbor scaling when images are resized instead of the resizing algorithm to create blur.
      context.webkitImageSmoothingEnabled = false;
      context.mozImageSmoothingEnabled = false;
      context.msImageSmoothingEnabled = false;
      context.imageSmoothingEnabled = false;

      context.drawImage(image, 0, 0, image.width * factor, image.height * factor);
      return context.getImageData(0, 0, image.width * factor, image.height * factor);
    }
  }
  console.error('Cannot get image data: cannot create context');
}
ImageUtil.getImageDataScaled = getImageDataScaled;


function recolorImageData(image, recolorFn) {
  var imageData = getImageData(image);
  var data = imageData.data;
  for (var i = 0; i < data.length; i += 4) {
    recolorFn(data, i);
  }
  return imageData;
}

ImageUtil.recolorImageData = recolorImageData;

function toSharpImage(image) {
  if (ImageUtil.sharp) {
    if (_.isPlainObject(image)) {
      var imageData = { data: image.data, width: image.width, height: image.height, channels: image.channels };
      // TODO(AXC): Remove this weird hack!!!!
      var buffer = imageData.data.buffer || imageData.data;
      if (Constants.sys && Constants.sys.Buffer) {
        buffer = new Constants.sys.Buffer(buffer);
      }
      return ImageUtil.sharp(buffer, { raw: { width: image.width, height: image.height, channels: image.channels || 4 } });
    } else {
      if (Constants.sys && Constants.sys.Buffer) {
        return ImageUtil.sharp(Constants.sys.Buffer.from(image)).toColorspace('srgb');
      }
    }
  }
}

function toMimeType(image, options, callback) {
  var sharpImage = toSharpImage(image);
  try {
    if (sharpImage) {
      if (options.mimeType.endsWith("jpeg")) {
        return sharpImage.jpeg(options).toBuffer(callback);
      } else if (options.mimeType.endsWith("png")) {
        return sharpImage.png(options).toBuffer(callback);
      } else {
        callback("Unsupported mimeType: " + options.mimeType);
      }
    }
  } catch (e) {
    callback(e);
  }
}

ImageUtil.toMimeType = toMimeType;

function saveImage(image, path, callback) {
  var sharpImage = toSharpImage(image);
  try {
    if (sharpImage) {
      sharpImage.toFile(path, function (err, info) {
        if (err) {
          console.error('Error saving image to ' + path);
        }
        callback(err, info);
      });
    }
  } catch (e) {
    callback(e);
  }
}

ImageUtil.saveImage = saveImage;

function bufferToRawPixels(buffer, callback) {
  var sharpImage = toSharpImage(buffer);
  if (sharpImage) {
    sharpImage
      .raw()
      .toBuffer(function (err, data, info) {
        if (err) {
          callback(err);
        } else {
          // Make sure it is there is alpha channel
          if (info.channels === 3) {
            var npixels = info.width * info.height;
            var withAlpha = Constants.sys.Buffer.alloc(npixels * 4, 255);
            for (var i = 0; i < npixels; i++) {
              withAlpha[i * 4] = data[i * 3];
              withAlpha[i * 4 + 1] = data[i * 3 + 1];
              withAlpha[i * 4 + 2] = data[i * 3 + 2];
            }
            callback(err, { data: withAlpha, width: info.width, height: info.height, channels: 4 });
          } else {
            callback(err, { data: data, width: info.width, height: info.height, channels: info.channels });
          }
        }
      });
  } else {
    callback("Error reading image");
  }
}

ImageUtil.bufferToRawPixels = bufferToRawPixels;

// Copied from THREE WebGLTextures
function isPowerOfTwo(image) {
  return THREE.MathUtils.isPowerOfTwo(image.width) && THREE.MathUtils.isPowerOfTwo(image.height);
}

function makePowerOfTwo(image, callback) {
  var width = THREE.MathUtils.floorPowerOfTwo(image.width);
  var height = THREE.MathUtils.floorPowerOfTwo(image.height);
  if (document) {
    var canvas = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas');
    canvas.width = width;
    canvas.height = height;
    var context = canvas.getContext('2d');
    if (context) {
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      callback(null, canvas);
      return;
    }
  }
  try {
    var sharpImage = toSharpImage(image);
    if (sharpImage) {
      sharpImage.resize(width, height)
        .toBuffer(function (err, data, info) {
          if (err) {
            callback(err, image);
          } else {
            callback(err, { src: image.src, path: image.path, data: data, width: info.width, height: info.height, channels: info.channels });
          }
        });
    } else {
      callback('Cannot resize image to power of two', image);
    }
  } catch (e) {
    callback(e, image);
  }
}
ImageUtil.makePowerOfTwo = makePowerOfTwo;

function textureNeedsPowerOfTwo(texture) {
  return (texture.wrapS !== THREE.ClampToEdgeWrapping || texture.wrapT !== THREE.ClampToEdgeWrapping) ||
    (texture.minFilter !== THREE.NearestFilter && texture.minFilter !== THREE.LinearFilter);
}

function ensurePowerOfTwo(image, texture, callback) {
  if (!ImageUtil.DISABLE_IMAGE_RESIZE && (!texture || textureNeedsPowerOfTwo(texture)) && !isPowerOfTwo(image)) {
    return makePowerOfTwo(image, callback);
  } else {
    return callback(null, image);
  }
}
ImageUtil.ensurePowerOfTwo = ensurePowerOfTwo;

function getIndexInfo(pixelBuffer, rect, getInfoFn, useHexColor, ignoreAlpha0) {
  function createBBox() {
    return { min: { x: +Infinity, y: +Infinity }, max: { x: -Infinity, y: -Infinity } };
  }

  function updateBBox(bbox, x, y) {
    bbox.min.x = Math.min(bbox.min.x, x);
    bbox.min.y = Math.min(bbox.min.y, y);
    bbox.max.x = Math.max(bbox.max.x, x);
    bbox.max.y = Math.max(bbox.max.y, y);
  }

  function finalizeBBox(bbox) {
    bbox.mid = { x: (bbox.min.x + bbox.max.x)/2, y: (bbox.min.y + bbox.max.y)/2 };
    bbox.dims = { x: (bbox.max.x - bbox.min.x), y: (bbox.max.y - bbox.min.y) };
  }

  // pixels should be UInt8Array where each pixel is RGBA
  var indexInfo = {};
  var pixels = pixelBuffer.data;
  var stride = pixels.length / (pixelBuffer.width * pixelBuffer.height);
  if (stride * pixelBuffer.width * pixelBuffer.height !== pixels.length) {
    console.error(`Invalid pixel buffer size: width=${pixelBuffer.width}, height=${pixelBuffer.height}, bufferSize=${pixels.length}`);
    return;
  }
  if (stride !== 1 && stride !== 4) {
    console.error(`Unsupported pixel stride: stride=${stride}`);
    return;
  }
  var pixelToIndex;
  if (!pixelToIndex) {
    if (stride === 4) {
      if (useHexColor) {
        pixelToIndex = function (pixels, i) {
          var v = (pixels[i] << 16) ^ (pixels[i + 1] << 8) ^ (pixels[i + 2]);
          return ('000000' + v.toString(16)).slice(-6);
        };
      } else {
        pixelToIndex = function (pixels, i) {
          return ((255 - pixels[i + 3]) << 24) ^ (pixels[i] << 16) ^ (pixels[i + 1] << 8) ^ (pixels[i + 2]);
        };
      }
    } else {
      pixelToIndex = function (pixels, i) {
        return pixels[i];
      };
    }
  }

  var numElementsPerRow = stride * pixelBuffer.width;
  if (!rect) {
    rect = {
      min: {x: 0, y: 0},
      max: {x: pixelBuffer.width, y: pixelBuffer.height}
    };
  }
  for (var x = rect.min.x; x < rect.max.x; x++) {
    for (var y = rect.min.y; y < rect.max.y; y++) {
      var i = numElementsPerRow * y + stride * x;
      if (ignoreAlpha0 && stride === 4) {
        if (pixels[i + 3] === 0) {
          continue;
        }
      }
      // Convert to ARGB
      var index = pixelToIndex(pixels, i);
      var info;
      if (getInfoFn) {
        info = getInfoFn(index);
        if (info && info.index != null) {
          index = info.index;
        }
      }
      if (indexInfo[index] == null) {
        indexInfo[index] = {
          index: index,
          bbox: createBBox(),
          npixels: 0
        };
        if (info) {
          _.defaults(indexInfo[index], info);
        }
      }
      indexInfo[index].npixels++;
      updateBBox(indexInfo[index].bbox, x, y);
    }
  }
  _.forEach((v,k) => {
    finalizeBBox(v.bbox);
  });
  return indexInfo;
}

ImageUtil.getIndexInfo = getIndexInfo;


function getIndexCounts(pixels, remapIndexFn) {
  // pixels should be UInt8Array where each pixel is RGBA
  var counts = {};
  for (var i = 0; i < pixels.length; i += 4) {
    // Convert to ARGB
    var index = ((255 - pixels[i + 3]) << 24) ^ (pixels[i] << 16) ^ (pixels[i + 1] << 8) ^ (pixels[i + 2]);
    if (remapIndexFn) {
      index = remapIndexFn(index);
    }
    if (counts[index]) {
      counts[index]++;
    } else {
      counts[index] = 1;
    }
  }
  return counts;
}

ImageUtil.getIndexCounts = getIndexCounts;

// get counts for a rectangular region
function getIndexCountsRect(pixelBuffer, rect, remapIndexFn) {
  // pixels should be UInt8Array where each pixel is RGBA
  var counts = {};
  var pixels = pixelBuffer.data;
  var numElementsPerRow = 4 * pixelBuffer.width;
  for (var x = rect.min.x; x < rect.max.x; x++) {
    for (var y = rect.min.y; y < rect.max.y; y++) {
      var i = numElementsPerRow * y + 4 * x;
      // Convert to ARGB
      var index = ((255 - pixels[i + 3]) << 24) ^ (pixels[i] << 16) ^ (pixels[i + 1] << 8) ^ (pixels[i + 2]);
      if (remapIndexFn) {
        index = remapIndexFn(index);
      }
      if (counts[index]) {
        counts[index]++;
      } else {
        counts[index] = 1;
      }
    }
  }
  return counts;
}

ImageUtil.getIndexCountsRect = getIndexCountsRect;

function drawRect(pixelBuffer, rect, color, width) {
  var pixels = pixelBuffer.data;
  var numElementsPerRow = 4 * pixelBuffer.width;
  var x1 = Math.max(rect.min.x, 0);
  var x2 = Math.min(rect.max.x + 1, pixelBuffer.width);
  var y1 = Math.max(rect.min.y, 0);
  var y2 = Math.min(rect.max.y + 1, pixelBuffer.height);
  for (var x = x1; x < x2; x++) {
    for (var y = y1; y < y2; y++) {
      var fill = false;
      if (width > 0) {
        fill = ((x - x1) < width || (x2 - x) <= width || (y - y1) < width || (y2 - y) <= width);
      } else {
        fill = true;
      }
      if (fill) {
        var i = numElementsPerRow * y + 4 * x;
        pixels[i] = color.r * 255;
        pixels[i + 1] = color.g * 255;
        pixels[i + 2] = color.b * 255;
        pixels[i + 3] = 255;
      }
    }
  }
}
ImageUtil.drawRect = drawRect;

ImageUtil.getPixel = function (pixelBuffer, x, y, fn) {
  var d = pixelBuffer.data;
  var numElementsPerRow = 4 * pixelBuffer.width;
  var idx = numElementsPerRow * y + 4 * x;
  return fn ? fn(d, idx) : d.slice(idx, idx + 4);
};

ImageUtil.decodePixelValue = function (array, offset) {
  var i = offset || 0;
  var d = array;
  return ((255 - d[i + 3]) << 24) ^ (d[i] << 16) ^ (d[i + 1] << 8) ^ (d[i + 2]);
};

ImageUtil.decodeVector3 = function (array, offset, normalize, out) {
  out = out || new THREE.Vector3();
  var i = offset || 0;
  var d = array;
  if (normalize) {
    out.set(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255);
  } else {
    out.set(d[i], d[i + 1], d[i + 2]);
  }
  return out;
};

ImageUtil.decodeNormal = function (array, offset, out) {
  out = ImageUtil.decodeVector3(array, offset, true, out);
  out.multiplyScalar(2).subScalar(1).normalize();
  return out;
};


function combinePixels(pixelSet, combineFn) {
  // pixels should be UInt8Array where each pixel is RGBA
  var output = [];
  var npixels = pixelSet[0].length;
  for (var i = 0; i < npixels; i += 4) {
    var slices = _.map(pixelSet, function (x) { return x.slice(i, i + 4); });
    output[i / 4] = combineFn(slices);
  }
  return output;
}

ImageUtil.combinePixels = combinePixels;

function offsetToVector2(offset, width, height, toNormalized) {
  var numElementsPerRow = width;
  var y = Math.floor(offset / numElementsPerRow);
  var x = Math.floor(offset - numElementsPerRow * y);
  if (toNormalized) {
    x = (x / width) * 2 - 1;
    y = (y / height) * 2 - 1;  // TODO: sometimes need to be flipped too...
  }
  return new THREE.Vector2(x, y);
}
ImageUtil.offsetToVector2 = offsetToVector2;

function flipPixelsY(p, width, height) {
  var t;
  var numPixelsPerRow = 4 * width;
  for (var row = 0; row < height / 2; row++) {
    var yOut = height - row - 1;
    var base = numPixelsPerRow * row;
    var baseOut = numPixelsPerRow * yOut;
    for (var col = 0; col < width; col++) {
      var step = col << 2;  // 4*x
      var idx = base + step;
      var idxOut = baseOut + step;
      t = p[idxOut]; p[idxOut] = p[idx]; p[idx] = t;  // R
      t = p[idxOut + 1]; p[idxOut + 1] = p[idx + 1]; p[idx + 1] = t;  // G
      t = p[idxOut + 2]; p[idxOut + 2] = p[idx + 2]; p[idx + 2] = t;  // B
      t = p[idxOut + 3]; p[idxOut + 3] = p[idx + 3]; p[idx + 3] = t;  // A
    }
  }
}

ImageUtil.flipPixelsY = flipPixelsY;

function copyImageData(source) {
  var target = {};
  Object.assign(target, source);
  target.data = new Uint8Array(source.data.buffer.slice(0));
  return target;
}

ImageUtil.copyImageData = copyImageData;

function encodePixels(array, encodingFn, targetData) {
  targetData = targetData || new Uint8Array(array.length);
  for (var i = 0; i < array.length; i += 4) {
    var v = encodingFn(array.slice(i, i + 4));
    targetData[i] = v[0];
    targetData[i + 1] = v[1];
    targetData[i + 2] = v[2];
    targetData[i + 3] = v[3];
  }
  return targetData;
}

ImageUtil.encodePixels = encodePixels;

function encodePixels2(array, encodingFn, stride1, stride2, targetData) {
  targetData = targetData || new Uint8Array(stride2 * array.length/stride1);
  if (!encodingFn) {
    encodingFn = function(x) { return x; };
  }
  var ti = 0;
  for (var i = 0; i < array.length; i+=stride1) {
    var v = encodingFn(array.slice(i, i+stride1));
    for (var j = 0; j < v.length; j++) {
      targetData[ti+j] = v[j];
    }
    ti += v.length;
  }
  return targetData;
}

ImageUtil.encodePixels2 = encodePixels2;

function encodePixelsDirect8(array, targetData) {
  return encodePixels2(array, function(x) {
    return [x[2]];
  }, 4, 1, targetData);
}

ImageUtil.encodePixelsDirect8 = encodePixelsDirect8;

function encodePixelsDirect16(array, targetData) {
  return encodePixels2(array, function(x) {
    return [x[1], x[2]];
  }, 4, 2, targetData);
}

ImageUtil.encodePixelsDirect16 = encodePixelsDirect16;


function recolorIndexed(array, palette, targetData) {
  return encodePixels(array, function (x) {
    var index = ImageUtil.decodePixelValue(x);
    var c = Colors.createColor(index, palette, true);
    return [Math.floor(c.r * 255), Math.floor(c.g * 255), Math.floor(c.b * 255), 255];
  }, targetData);
}

ImageUtil.recolorIndexed = recolorIndexed;


function orthographicDepthToViewZ(near, far, d) {
  return d * (near - far) - near;
}

function perspectiveDepthToViewZ(near, far, d) {
  return (near * far) / ((far - near) * d - far);
}

var unpack_factors = [1.0 / (256 * 256 * 256 * 256), 1.0 / (256 * 256 * 256), 1.0 / (256 * 256), 1.0 / 256];

function unpackRGBAdepth(pixels, camera, datatype, metersToUnit, useBasicPacking) {
  datatype = datatype || 'uint16';
  metersToUnit = metersToUnit || 1000;  // millimeters

  var scaleFactor = metersToUnit * Constants.virtualUnitToMeters;
  var npixels = pixels.length / 4;
  var arrayType = TypeUtils.nameToTypedArray(datatype);
  var d = new arrayType(npixels);
  var sum = 0;
  var sum_opaque = 0;
  var nopaque = 0;
  // var min = Infinity;
  // var max = -Infinity;
  for (var i = 0; i < npixels; i++) {
    var b = i << 2;  // 4 * i
    var transparent = 0;
    var pd = 0;
    if (useBasicPacking) {
      pd = pixels[b] / 255;
      transparent = (pixels[b + 3] === 0);
    } else {
      for (var j = 0; j < 4; j++) {
        pd += pixels[b + j] * unpack_factors[j];
      }
    }

    var v = 0;
    if (pd != 0) {  // Convert from packed depth buffer value pd to real depth v
      if (camera.isOrthographicCamera || camera.inOrthographicMode) {
        v = -orthographicDepthToViewZ(camera.near, camera.far, pd);
      } else {
        // Assume other cases are perspective
        v = -perspectiveDepthToViewZ(camera.near, camera.far, pd);
      }
      v = scaleFactor * v;
      // min = Math.min(v, min);
      // max = Math.max(v, max);
    }

    d[i] = v;  // NOTE: coerces v into datatype
    sum += d[i];
    if (!transparent) {
      nopaque++;
      sum_opaque++;
    }
  }
  // console.log('min=' + min + ', max=' + max);
  // console.log('min=' + _.min(d), 'max=' + _.max(d), 'ave=' + (sum/npixels), 'opaque_ave=' + (sum_opaque/nopaque), 'opaque=' + (nopaque/npixels));
  return d;
}
ImageUtil.unpackRGBAdepth = unpackRGBAdepth;


module.exports = ImageUtil;
