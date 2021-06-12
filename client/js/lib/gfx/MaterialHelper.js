'use strict';

var MaterialHelper = {};

MaterialHelper.getImageData = function (image) {
  if (!image) {
    return null;
  }
  if (image.data) {
    return { data: image.data, width: image.width, height: image.height };
  }
  var canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  var context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, image.width, image.height);
};

MaterialHelper.getPixel = function (imagedata, x, y) {
  var i = (x + imagedata.width * y) * 4;
  var data = imagedata.data;
  return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
};

MaterialHelper.getPixelAtUV = function (imagedata, u, v) {
  var x = THREE.MathUtils.clamp(Math.round(u * imagedata.width), 0, imagedata.width-1);
  var y = THREE.MathUtils.clamp(Math.round(v * imagedata.height), 0, imagedata.height-1);
  return MaterialHelper.getPixel(imagedata, x, y);
};

module.exports = MaterialHelper;