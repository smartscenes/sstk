/**
 * Utility functions for working with scenes
 * @module ImageUtil
 */
var ImageUtil = {};
var Constants = require('Constants');
var Colors = require('util/Colors');
var _ = require('util');

/**
 * Extract image data from element
 * @param image
 * @return {{data: *, width: int, height: int}}
 * @static
 */
function getImageData (image) {
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
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, image.width, image.height);
    }
  }
  console.error('Cannot get image data: cannot create context');
}
ImageUtil.getImageData = getImageData;

function recolorImageData(image, recolorFn) {
  var imageData = getImageData(image);
  var data = imageData.data;
  for (var i = 0; i < data.length; i+=4) {
    recolorFn(data, i);
  }
  return imageData;
}

ImageUtil.recolorImageData = recolorImageData;

// Copied from THREE WebGLTextures
function isPowerOfTwo( image ) {
  return THREE.Math.isPowerOfTwo(image.width) && THREE.Math.isPowerOfTwo(image.height);
}

function makePowerOfTwo(image, callback) {
  var width = THREE.Math.nearestPowerOfTwo( image.width );
  var height = THREE.Math.nearestPowerOfTwo( image.height );
  if (document) {
    var canvas = document.createElementNS( 'http://www.w3.org/1999/xhtml', 'canvas' );
    canvas.width = width;
    canvas.height = height;
    var context = canvas.getContext( '2d' );
    if (context) {
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      callback(null, canvas);
      return;
    }
  }
  if (ImageUtil.sharp) {
    var imageData = ImageUtil.getImageData(image);
    try {
      // TODO(AXC): Remove this weird hack!!!!
      var buffer = imageData.data.buffer || imageData.data;
      if (Constants.sys && Constants.sys.Buffer) {
        buffer = new Constants.sys.Buffer(buffer);
      }
      ImageUtil.sharp(buffer, {raw: {width: image.width, height: image.height, channels: image.channels || 4}})
        .resize(width, height)
        .toBuffer(function (err, data, info) {
          if (err) {
            callback(err, image);
          } else {
            callback(err, {data: data, width: info.width, height: info.height, channels: image.channels});
          }
        });
    } catch (e) {
      callback(e, image);
    }
  } else {
    callback('Cannot resize image to power of two', image);
  }
}

function textureNeedsPowerOfTwo( texture ) {
  return ( texture.wrapS !== THREE.ClampToEdgeWrapping || texture.wrapT !== THREE.ClampToEdgeWrapping ) ||
    ( texture.minFilter !== THREE.NearestFilter && texture.minFilter !== THREE.LinearFilter );
}

function ensurePowerOfTwo(image, texture, callback) {
  if ( (!texture || textureNeedsPowerOfTwo(texture)) && !isPowerOfTwo(image)) {
    return makePowerOfTwo(image, callback);
  } else {
    return callback(null, image);
  }
}
ImageUtil.ensurePowerOfTwo = ensurePowerOfTwo;

function getIndexCounts(pixels, remapIndexFn) {
  // pixels should be UInt8Array where each pixel is RGBA
  var counts = {};
  for (var i = 0; i < pixels.length; i+=4) {
    // Convert to ARGB
    var index = ((255-pixels[i+3]) << 24) ^ (pixels[i] << 16) ^ (pixels[i+1] << 8) ^ (pixels[i+2]) ;
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

ImageUtil.getPixel = function(pixelBuffer, x, y, fn) {
  var d = pixelBuffer.data;
  var numElementsPerRow = 4 * pixelBuffer.width;
  var idx = numElementsPerRow*y + 4*x;
  return fn? fn(d, idx) : d.slice(idx, idx+4);
};

ImageUtil.decodePixelValue = function(array, offset) {
  var i = offset || 0;
  var d = array;
  return ((255-d[i+3]) << 24) ^ (d[i] << 16) ^ (d[i+1] << 8) ^ (d[i+2]);
};

ImageUtil.decodeVector3 = function(array, offset, normalize, out) {
  out = out || new THREE.Vector3();
  var i = offset || 0;
  var d = array;
  if (normalize) {
    out.set(d[i]/255, d[i+1]/255, d[i+2]/255);
  } else {
    out.set(d[i], d[i+1], d[i+2]);
  }
  return out;
};

ImageUtil.decodeNormal = function(array, offset, out) {
  out = ImageUtil.decodeVector3(array, offset, true, out);
  out.multiplyScalar(2).subScalar(1).normalize();
  return out;
};


function combinePixels(pixelSet, combineFn) {
  // pixels should be UInt8Array where each pixel is RGBA
  var output = [];
  var npixels = pixelSet[0].length;
  for (var i = 0; i < npixels; i+=4) {
    var slices = _.map(pixelSet, function(x) { return x.slice(i, i+4); });
    output[i/4] = combineFn(slices);
  }
  return output;
}

ImageUtil.combinePixels = combinePixels;

function offsetToVector2(offset, width, height, toNormalized) {
  var numElementsPerRow = width;
  var y = Math.floor(offset/numElementsPerRow);
  var x = Math.floor(offset - numElementsPerRow*y);
  if (toNormalized) {
    x = (x/width)*2-1;
    y = (y/height)*2-1;  // TODO: sometimes need to be flipped too...
  }
  return new THREE.Vector2(x,y);
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
      t = p[idxOut    ]; p[idxOut    ] = p[idx    ]; p[idx    ] = t;  // R
      t = p[idxOut + 1]; p[idxOut + 1] = p[idx + 1]; p[idx + 1] = t;  // G
      t = p[idxOut + 2]; p[idxOut + 2] = p[idx + 2]; p[idx + 2] = t;  // B
      t = p[idxOut + 3]; p[idxOut + 3] = p[idx + 3]; p[idx + 3] = t;  // A
    }
  }
}

ImageUtil.flipPixelsY = flipPixelsY;

function encodePixels(array, encodingFn, targetData) {
  targetData = targetData || new Uint8Array(array.length);
  for (var i = 0; i < array.length; i+=4) {
    var v = encodingFn(array.slice(i, i+4));
    targetData[i] = v[0];
    targetData[i+1] = v[1];
    targetData[i+2] = v[2];
    targetData[i+3] = v[3];
  }
  return targetData;
}

ImageUtil.encodePixels = encodePixels;


function recolorIndexed(array, palette, targetData) {
  return encodePixels(array, function(x) {
    var index = ImageUtil.decodePixelValue(x);
    var c = Colors.createColor(index, palette, true);
    return [Math.floor(c.r*255), Math.floor(c.g*255), Math.floor(c.b*255), 255];
  }, targetData);
}

ImageUtil.recolorIndexed = recolorIndexed;

module.exports = ImageUtil;