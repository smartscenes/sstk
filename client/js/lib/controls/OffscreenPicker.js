var Picker = require('controls/Picker');
var RendererFactory = require('gfx/RendererFactory');
require('controls/GPUPicker');

/**
 * Utility class for offscreen picking
 * @param [opts.renderer] {gfx.Renderer} Renderer used for rendering view for offscreen picking
 * @param [opts.camera] {THREE.Camera} Camera used for rendering view for offscreen picking
 * @param [opts.width] {int} Width of image to be rendered for picking
 * @param [opts.height] {int} Height of image to be rendered for picking
 * @param [opts.useFullBuffer=false] {boolean} Read entire buffer into memory
 * @param [opts.debug=false] {boolean} Enable debug messages
 * @constructor
 * @memberOf controls
 */
function OffscreenPicker(opts) {
  opts = opts || {};
  this.__offscreenRenderer = opts.renderer || this.__getOffscreenRenderer(opts);
  this.__gpuPicker = new THREE.GPUPicker({renderer: this.__offscreenRenderer.renderer, debug: opts.debug, useFullBuffer: opts.useFullBuffer});
  this.__gpuPicker.setFilter(function (object) {return true;});
  if (opts.camera) {
    this.__gpuPicker.setCamera(opts.camera);
  }
  this.__scene = null;
}

OffscreenPicker.prototype = Object.create(Picker.prototype);
OffscreenPicker.prototype.constructor = OffscreenPicker;

OffscreenPicker.prototype.__setSize = function(width, height) {
  this.__getOffscreenRenderer().setSize(width, height);
  this.__gpuPicker.resizeTexture(width, height);
};

OffscreenPicker.prototype.__getOffscreenRenderer = function(opts) {
  if (!this.__offscreenRenderer) {
    this.__offscreenRenderer = RendererFactory.createOffscreenRenderer({
      camera: opts.camera,
      width: opts.width,
      height: opts.height
    });
  }
  return this.__offscreenRenderer;
};

OffscreenPicker.prototype.getOffscreenCoordinates = function (container, screenPosition) {
  if (container) {
    var rect = container.getBoundingClientRect();
    var x = screenPosition.clientX - rect.left;
    var y = screenPosition.clientY - rect.top;
    return new THREE.Vector2(x, y);
  } else {
    return new THREE.Vector2(screenPosition.x, screenPosition.y);
  }
};

OffscreenPicker.prototype.__updateScene = function(scene) {
  if (this.__scene !== scene) {
    // Make sure scene is visible when we process it (NOTE: children may still be not visible)
    // the __gpuPicker actually makes a copy and create a pickingScene
    // if child nodes visibility changes, they should be updated...
    var oldSceneVisibility = scene.visible;
    scene.visible = true;
    this.__gpuPicker.setScene(scene);
    this.__scene = scene;
    scene.visible = oldSceneVisibility;
  }
};

/**
 * Returns object picked
 * @param options
 * @param [options.container] container
 * @param [options.scene] {THREE.Scene} scene to pick against
 * @param options.position Screen position (contains `clientX, clientY` if `container` provided or `x,y,width,height` if no container)
 * @param options.camera {THREE.Camera}
 * @param options.objects {THREE.Object3D[]} Array of objects to intersect against
 * @param options.ignore {THREE.Object3D[]} Array of objects to ignore
 * @param options.targetType {string} What type of target (`mesh|object`)
 * @returns {Intersect}
 */
OffscreenPicker.prototype.pick = function (options) {
  var raycastMouse = this.getCoordinates(options.container, options.position);
  var offscreenMouse = this.getOffscreenCoordinates(options.container, options.position);
  var raycaster =  this.getRaycaster(raycastMouse.x, raycastMouse.y, options.camera);

  var scene = options.scene;
  this.__updateScene(scene);
  if (options.ignore) {
    for (var i = 0; i < options.ignore.length; i++) {
      options.ignore[i].userData.__visible = options.ignore[i].visible;
      options.ignore[i].visible = false;
    }
  }
  this.__gpuPicker.setCamera(options.camera);
  var intersected = this.__gpuPicker.pick(offscreenMouse, raycaster);
  if (options.ignore) {
    for (var i = 0; i < options.ignore.length; i++) {
      options.ignore[i].visible = options.ignore[i].userData.__visible;
      delete options.ignore[i].userData.__visible;
    }
  }
  if (intersected) {
    if (options.targetType === 'mesh') {
      var intersected2 = this.selectIntersectedMeshes([intersected], [scene], [], 1);
      return intersected2[0];
    } else if (options.targetType === 'object') {
      // console.log('intersected', intersected, 'scene', scene);
      var intersected2 = this.selectIntersectedObjects([intersected], [scene], [], 1, true);
      // console.log('intersected2', intersected2);
      return intersected2[0];
    } else {
      console.error('Unsupport targetType', options.targetType);
    }
  }
};

OffscreenPicker.prototype.getIntersectedFromScreenPosition = function (container, screenPosition, camera, scene) {
  var raycastMouse = this.getCoordinates(container, screenPosition);
  var offscreenMouse = this.getOffscreenCoordinates(container, screenPosition);
  var raycaster =  this.getRaycaster(raycastMouse.x, raycastMouse.y, camera);

  this.__updateScene(scene);
  this.__gpuPicker.setCamera(camera);
  var intersected = this.__gpuPicker.pick(offscreenMouse, raycaster);
  if (intersected) {
    // console.log('intersected', intersected, 'scene', scene);
    var intersected2 = this.selectIntersectedObjects([intersected], [scene], [], 1, true);
    // console.log('intersected2', intersected2);
    return intersected2[0];
  }
};

/**
 * Update set of meshes and triangle that are pickabled by rendering the scene from given camera viewpoint
 * @param camera {THREE.Camera}
 * @param scene {THREE.Object3D}
 * @param [pickables] {Object<int, Object<int, int>>} Optional counts of pickable mesh ids and face indices to be updated
 * @returns {Object<int, Object<int, int>>} Map of mesh id to map of pickable face indices to counts
 */
OffscreenPicker.prototype.updatePickables = function(camera, scene, pickables) {
  // Get all pickable triangles from this view point
  this.__updateScene(scene);
  this.__gpuPicker.setCamera(camera);
  var width = this.__gpuPicker.pickingTexture.width;
  var height = this.__gpuPicker.pickingTexture.height;
  // TODO: Switch from generic object to actual Map!
  pickables = pickables || {};
  for (var i = 0; i < width; i++) {
    for (var j = 0; j < height; j++) {
      var m = { x: i, y: j };
      var intersected = this.__gpuPicker.pick(m);
      if (intersected) {
        pickables[intersected.object.id] = pickables[intersected.object.id] || {};
        pickables[intersected.object.id][intersected.faceIndex] = (pickables[intersected.object.id][intersected.faceIndex] || 0) + 1;
      }
    }
  }
  return pickables;
};

OffscreenPicker.prototype.onResize = function(container) {
  var width = container.clientWidth;
  var height = container.clientHeight;
  this.__setSize(width, height);
};

module.exports = OffscreenPicker;