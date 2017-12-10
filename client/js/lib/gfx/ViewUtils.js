var Constants = require('Constants');
var Object3DUtil = require('geo/Object3DUtil');
var _ = require('util');

/**
 * View based utility functions for analyzing geometry
 * @module ViewUtils
 */
var ViewUtils = {};

/**
 * Identifies visible triangles by rendering from different views and counting which triangles were seen
 * @param opts Options for identifying visible triangles
 * @param opts.width {int} Width of image to render
 * @param opts.height {int} Height of image to render
 * @param opts.scene {THREE.Object3D} Scene to render
 * @returns {Object<int, Object<int, int>>} Map of mesh id to map of pickable face indices to counts
 */
function identifyVisibleTriangles(opts) {
  var scene = opts.scene;
  var sceneBBox = Object3DUtil.getBoundingBox(scene);
  var dims = sceneBBox.dimensions();
  var minDim = Math.min(dims.x, dims.y, dims.z);
  var maxDim = Math.max(dims.x, dims.y, dims.z);
  var OffscreenPicker = require('controls/OffscreenPicker');
  var Camera = require('gfx/Camera');
  var camera = new THREE.PerspectiveCamera(45, opts.width/opts.height,
    opts.near || Math.min(minDim/20, 0.01*Constants.metersToVirtualUnit),
    opts.far || Math.max(10*maxDim, 10*Constants.metersToVirtualUnit));
  //console.log('near, far', camera.near, camera.far);
  var offscreenPicker = new OffscreenPicker({
    debug: false,
    useFullBuffer: true,
    width: opts.width,
    height: opts.height,
    camera: camera
  });
  var ViewGenerator = require('gfx/ViewGenerator');
  var viewGenerator = new ViewGenerator({
    camera: camera,
    cameraPositionStrategy: 'positionToFit'
  });
  var views = viewGenerator.generateViews(sceneBBox, opts.width, opts.height);
  views = views.concat(viewGenerator.generateRotatingViews(sceneBBox, Math.PI/6, { start: Math.PI/6, end: 2*Math.PI, step: Math.PI/4 }));
  views = views.concat(viewGenerator.generateRotatingViews(sceneBBox, -Math.PI/6, { start: -Math.PI/6, end: 2*Math.PI, step: Math.PI/4 }));
  var visible = {};
  _.each(views, function(view) {
    //console.log('view', view);
    Camera.setView(camera, view);
    offscreenPicker.updatePickables(camera, scene, visible);
  });
  //console.log('visible', visible);
  return visible;
}
ViewUtils.identifyVisibleTriangles = identifyVisibleTriangles;

module.exports = ViewUtils;

