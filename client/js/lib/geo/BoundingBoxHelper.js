'use strict';

var Object3DUtil = require('geo/Object3DUtil');

// My bounding box helper!!!  Just like THREE.BoundingBoxHelper except that
//   we use our cached bounding box, and have more functions!
var BoundingBoxHelper = function (object, materialOrColor) {
  this.object = object;
  this.box = new THREE.Box3();

  var material;
  if (materialOrColor && (materialOrColor.isMaterial || materialOrColor.isMultiMaterial)) {
    material = materialOrColor;
  } else if (materialOrColor instanceof THREE.Color) {
    material = new THREE.MeshBasicMaterial({ color: materialOrColor, wireframe: true });
  } else {
    var hex = materialOrColor;
    var color = (hex !== undefined) ? hex : 0x888888;
    material = new THREE.MeshBasicMaterial({ color: color, wireframe: true });
  }
  THREE.Mesh.call(this, new THREE.BoxGeometry(1, 1, 1), material);
};

BoundingBoxHelper.prototype = Object.create(THREE.Mesh.prototype);
BoundingBoxHelper.prototype.constructor = BoundingBoxHelper;

BoundingBoxHelper.prototype.update = function (force) {
  if (this.object) {
    var bb = Object3DUtil.getBoundingBox(this.object, force);
    this.box.set(bb.min, bb.max);
    //this.box.setFromObject( this.object );
    this.box.size(this.scale);
    this.box.center(this.position);
  } else {
    this.box.makeEmpty();
  }
};

BoundingBoxHelper.prototype.attach = function (object) {
  this.object = object;
  this.update();
};

BoundingBoxHelper.prototype.detach = function () {
  this.object = null;
  this.update();
};

module.exports = BoundingBoxHelper;
