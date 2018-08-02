var Camera = require('gfx/Camera');
var ClippingBox = require('gfx/ClippingBox');
var Object3DUtil = require('geo/Object3DUtil');
var ViewGenerator = require('gfx/ViewGenerator');
var _ = require('util');

/**
 * Render from a view point onto a image and stores it for lookup and processing
 * @param opts Parameters that define how I work
 * @param opts.renderer {gfx.Renderer} Renderer to use
 * @param opts.camera {THREE.Camera} Camera to use when rendering
 * @param opts.overrideMaterial {THREE.Material} Material to use when rendering
 * @param opts.cameraPositionStrategy {string} Camera positioning strategy to use
 * @constructor
 * @memberOf gfx
 */
function ViewProjectionGenerator(opts) {
  this.__renderer = opts.renderer;
  this.__camera = opts.camera;
  this.__overrideMaterial = opts.overrideMaterial;
  this.__clippingBox = null;
  if (!(this.__camera instanceof THREE.Camera)) {
    this.__camera = Camera.fromJson(this.__camera, this.__renderer.width, this.__renderer.height);
  }
  this.__viewGenerator = new ViewGenerator({
    camera: this.__camera,
    cameraPositionStrategy: opts.cameraPositionStrategy
  });
}

Object.defineProperty(ViewProjectionGenerator.prototype, 'viewGenerator', {
  get: function () {
    return this.__viewGenerator;
  }
});

Object.defineProperty(ViewProjectionGenerator.prototype, 'camera', {
  get: function () {
    return this.__camera;
  }
});

/**
 * Generate view with given options
 * @param scene {THREE.scene}
 * @param opts {gfx.ViewGenerator.ViewOptions}
 * @param projection {gfx.ViewProjection} Optional view projection for reuse
 * @returns {gfx.ViewProjection}
 */
ViewProjectionGenerator.prototype.generate = function(scene, opts, projection) {
  var view = opts.view;
  if (!view) {
    if (!opts.target) {
      var bbox = Object3DUtil.getBoundingBox(scene);
      opts = _.defaults({target: bbox, name: 'view'}, opts);
    }
    view = this.__viewGenerator.getView(opts);
  }
  //console.log('view', view);
  if (view.imageSize) {
    //console.log('got', viewOpts);
    var width = view.imageSize[0];
    var height = view.imageSize[1];
    if (width !== this.__renderer.width || height !== this.__renderer.height) {
      this.__renderer.setSize(width, height);
      this.__camera.aspect = width / height;
    }
  }
  var oldClippingPlanes = this.__renderer.renderer.clippingPlanes;
  if (opts.clipToBox) {
    if (!this.__clippingBox) {
      this.__clippingBox = new ClippingBox();
    }
    this.__clippingBox.init(opts.clipToBox);
    this.__renderer.renderer.clippingPlanes = this.__clippingBox.clippingPlanes;
    console.log('clippingPlanes', this.__renderer.renderer.clippingPlanes);
  }
  Camera.setView(this.__camera, view);
  var viewProjection = this.render(scene, projection);
  this.__renderer.renderer.clippingPlanes = oldClippingPlanes;
  return viewProjection;
};

/**
 * Render from current view
 * @param scene {THREE.scene} Scene to render
 * @param [projection] {gfx.ViewProjection} Optional view projection for reuse
 * @returns {gfx.ViewProjection}
 */
ViewProjectionGenerator.prototype.render = function(scene, projection) {
  // Set override material for masking
  var oldOverrideMaterial = scene.overrideMaterial;
  if (this.__overrideMaterial) {
    scene.overrideMaterial = this.__overrideMaterial;
  }
  // Render
  var renderer = this.__renderer;
  var viewProjection = projection || new ViewProjection();
  viewProjection.render(renderer, this.__camera, scene);
  // Restore old overrideMaterial
  scene.overrideMaterial = oldOverrideMaterial;
  return viewProjection;
};

ViewProjectionGenerator.createProjection = function(opts) {
  return new ViewProjection(opts);
};

/**
 * A view projection with a pixel buffer and project and unproject operators
 * @param opts
 * @constructor
 * @memberOf gfx
 */
function ViewProjection(opts) {
  // Take world coordinates to image space
  this.projectMatrix = new THREE.Matrix4();
  // Image space to world
  this.unprojectMatrix = new THREE.Matrix4();
}

Object.defineProperty(ViewProjection.prototype, 'pixels', {
  get: function () {
    return this.__pixelBuffer;
  }
});

ViewProjection.prototype.__getPixelBuffer = function(renderer) {
  var createNewBuffer = !this.__pixelBuffer || (renderer.width * renderer.height * 4 !== this.__pixelBuffer.length);
  if (createNewBuffer) {
    this.__pixelBuffer = renderer.createPixelBuffer();
  }
  this.width = renderer.width;
  this.height = renderer.height;
  return this.__pixelBuffer;
};

ViewProjection.prototype.render = function(renderer, camera, scene) {
  var pixels = this.__getPixelBuffer(renderer);
  renderer.render(scene, camera, { pixelBuffer: pixels });
  this.update(camera);
};

ViewProjection.prototype.update = function(camera) {
  // Save away projection matrices
  var matrix = this.projectMatrix;
  matrix.multiplyMatrices(camera.projectionMatrix, matrix.getInverse(camera.matrixWorld));
  matrix = this.unprojectMatrix;
  matrix.multiplyMatrices(camera.matrixWorld, matrix.getInverse(camera.projectionMatrix));
};

ViewProjection.prototype.project = (function() {
  var tmpVector = new THREE.Vector3();
  return function(v) {
    tmpVector.copy(v);
    tmpVector.applyMatrix4(this.projectMatrix);
    return tmpVector;
  };
});

ViewProjection.prototype.unproject = (function() {
  var tmpVector = new THREE.Vector3();
  return function(v) {
    tmpVector.copy(v);
    tmpVector.applyMatrix4(this.unprojectMatrix);
    return tmpVector;
  };
});

module.exports = ViewProjectionGenerator;