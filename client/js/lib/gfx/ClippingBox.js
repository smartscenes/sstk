var Object3DUtil = require('geo/Object3DUtil');
var Constants = require('Constants');

// 6 clipping planes
function ClippingBox() {
  this.clippingPlanes = []; // Array of clipping planes
  for (var i = 0; i < Object3DUtil.InNormals.length; i++) {
    this.clippingPlanes[i] = new THREE.Plane( Object3DUtil.InNormals[i], 0.1);
  }
}

ClippingBox.prototype.init = function(bbox) {
  // Update clipping box so the different planes are set to appropriate positions covering the entire bbox
  this.clippingPlanes[0].constant = -bbox.min.x;
  this.clippingPlanes[1].constant = bbox.max.x;
  this.clippingPlanes[2].constant = -bbox.min.y;
  this.clippingPlanes[3].constant = bbox.max.y;
  this.clippingPlanes[4].constant = -bbox.min.z;
  this.clippingPlanes[5].constant = bbox.max.z;
};

ClippingBox.prototype.updateDatGui = function(gui) {
  var min = -10*Constants.metersToVirtualUnit;
  var max = 10*Constants.metersToVirtualUnit;
  gui.add(this.clippingPlanes[0], 'constant', min, max).name('left').listen();
  gui.add(this.clippingPlanes[1], 'constant', min, max).name('right').listen();
  gui.add(this.clippingPlanes[2], 'constant', min, max).name('bottom').listen();
  gui.add(this.clippingPlanes[3], 'constant', min, max).name('top').listen();
  gui.add(this.clippingPlanes[4], 'constant', min, max).name('front').listen();
  gui.add(this.clippingPlanes[5], 'constant', min, max).name('back').listen();
};

module.exports = ClippingBox;