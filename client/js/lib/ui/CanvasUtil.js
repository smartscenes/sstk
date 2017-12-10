// Utility functions for working with the canvas, manipulating images and creating canvas elements

var self = {};

// Create and return cursor of given css color string and (dim x dim) size
// Returned as url(...) string for putting into css
function getColoredArrowCursor(color, dim, defaultCursor) {
  color = color || 'rgb(255, 255, 255)';
  dim = dim || 32;
  defaultCursor = defaultCursor || 'auto';

  var cursor = document.createElement('canvas');
  var ctx = cursor.getContext('2d');
  cursor.width = dim;
  cursor.height = dim;

  function drawArrow(lw, c) {
    ctx.strokeStyle = c;
    ctx.lineWidth = lw;
    ctx.lineCap = 'square';
    ctx.moveTo(dim * 1/8, dim * 3/4);
    ctx.lineTo(dim * 1/8, dim * 1/8);
    ctx.lineTo(dim * 3/4, dim * 1/8);
    ctx.moveTo(dim * 6/32,  dim * 6/32);
    ctx.lineTo(dim * 26/32, dim *26/32);
    ctx.stroke();
  }

  drawArrow(dim * 1/4, 'black');
  drawArrow(dim * 5/32, color);

  var stringified = 'url(' + cursor.toDataURL() + '), ' + defaultCursor;
  return stringified;
}

self.getColoredArrowCursor = getColoredArrowCursor;

// Sets the specified image as the background, rescaled to maxSize
function setImageAsBackground(imgSrc, container, maxSize) {

  var img = new Image();
  img.src = imgSrc;
  img.id = 'image';

  img.onload = function () {
    scaleImagePreservingAspectRatio(img, maxSize);
    container.style.backgroundImage = 'url(' + img.src + ')';
    container.style.backgroundPosition = 'center center';
    container.style.backgroundRepeat = 'no-repeat';
    container.style.backgroundSize = img.width + 'px ' + img.height + 'px';
  };
}

self.setImageAsBackground = setImageAsBackground;

function scaleImagePreservingAspectRatio(img, size) {
  var imgW = img.width, imgH = img.height;
  var scale = (imgW > imgH) ? (size / imgH) : (size / imgW);
  img.width = scale * imgW;
  img.height = scale * imgH;
}

self.scaleImagePreservingAspectRatio = scaleImagePreservingAspectRatio;

// Centers image on the canvas
function centerImageOnCanvas(imgSrc, canvas, maxSize) {
  var img = new Image();
  img.src = imgSrc;
  img.id = 'image';

  img.onload = function () {
    var ctx = canvas.getContext('2d');
    var centerX = canvas.clientWidth / 2;
    var centerY = canvas.clientHeight / 2;

    scaleImagePreservingAspectRatio(img, maxSize);

    var dx = img.width / 2, dy = img.height / 2;
    var x0 = centerX - dx, y0 = centerY - dy,
      x1 = centerX + dx, y1 = centerY + dy;

    ctx.drawImage(img, x0, y0, x1, y1);
  };
}

self.centerImageOnCanvas = centerImageOnCanvas;

// Function to get a potentially resized canvas with a given maxWidth and maxHeight
// while retaining the aspect ratio of the original canvas
// The quality of the resized image is probably not great
function getResizedCanvas(canvas, maxWidth, maxHeight) {
  var scale = 1.0;
  if (maxWidth && canvas.width > maxWidth) {
    scale = Math.min(scale, maxWidth / canvas.width);
  }
  if (maxHeight && canvas.height > maxHeight) {
    scale = Math.min(scale, maxHeight / canvas.height);
  }
  if (scale !== 1.0) {
    var newCanvas = document.createElement('canvas');
    newCanvas.width = scale * canvas.width;
    newCanvas.height = scale * canvas.height;
    var ctx = newCanvas.getContext('2d');
    ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, newCanvas.width, newCanvas.height);
    return newCanvas;
  } else {
    return canvas;
  }
}

self.getResizedCanvas = getResizedCanvas;

function createCanvasFromPixels(pixels, canvas) {
  canvas = canvas || document.createElement("canvas");
  canvas.width = pixels.width;
  canvas.height = pixels.height;
  var ctx = canvas.getContext("2d");
  var img = ctx.getImageData(0, 0, pixels.width, pixels.height); //x,y,w,h
  img.data.set(new Uint8ClampedArray(pixels.data.buffer)); // assuming values 0..255, RGBA, pre-mult.
  ctx.putImageData(img, 0, 0);
  return canvas;
}

self.createCanvasFromPixels = createCanvasFromPixels;

// Copies the image contents of the canvas
function copyCanvas(canvas) {
  var c = document.createElement('canvas');
  c.width = canvas.width;
  c.height = canvas.height;
  var ctx = c.getContext('2d');
  ctx.drawImage(canvas, 0, 0);
  return c;
}

self.copyCanvas = copyCanvas;

// Trims the canvas to non-transparent pixels?
// Taken from https://gist.github.com/remy/784508
function trimCanvas(c) {
  var ctx = c.getContext('2d');
  var copy = document.createElement('canvas').getContext('2d');
  var pixels = ctx.getImageData(0, 0, c.width, c.height);
  var l = pixels.data.length;
  var bound = {
    top: null,
    left: null,
    right: null,
    bottom: null
  };
  var i, x, y;

  for (i = 0; i < l; i += 4) {
    if (pixels.data[i + 3] !== 0) {
      x = (i / 4) % c.width;
      y = ~~((i / 4) / c.width);

      if (bound.top === null) {
        bound.top = y;
      }

      if (bound.left === null) {
        bound.left = x;
      } else if (x < bound.left) {
        bound.left = x;
      }

      if (bound.right === null) {
        bound.right = x;
      } else if (bound.right < x) {
        bound.right = x;
      }

      if (bound.bottom === null) {
        bound.bottom = y;
      } else if (bound.bottom < y) {
        bound.bottom = y;
      }
    }
  }

  var trimHeight = bound.bottom - bound.top;
  var trimWidth = bound.right - bound.left;
  if (trimHeight > 0 && trimWidth > 0) {
    var trimmed = ctx.getImageData(bound.left, bound.top, trimWidth, trimHeight);

    copy.canvas.width = trimWidth;
    copy.canvas.height = trimHeight;
    copy.putImageData(trimmed, 0, 0);

    // open new window with trimmed image:
    return copy.canvas;
  } else {
    console.error('Invalid trimmed height or width, returning original canvas');
    return c;
  }
}

self.trimCanvas = trimCanvas;

function getTrimmedCanvasDataUrl(canvas, maxWidth, maxHeight) {
  var copy = copyCanvas(canvas);
  var trimmed = trimCanvas(copy);
  var newCanvas = getResizedCanvas(trimmed, maxWidth, maxHeight);
  return newCanvas.toDataURL();
}

self.getTrimmedCanvasDataUrl = getTrimmedCanvasDataUrl;

function dataUrlToBlob(dataUrl) {
  var data = atob( dataUrl.substring( "data:image/png;base64,".length ) ),
    asArray = new Uint8Array(data.length);
  for( var i = 0, len = data.length; i < len; ++i ) {
    asArray[i] = data.charCodeAt(i);
  }
  var blob = new Blob( [ asArray.buffer ], {type: "image/png"} );
  return blob;
}

self.dataUrlToBlob = dataUrlToBlob;

module.exports = self;
