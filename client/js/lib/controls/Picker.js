'use strict';

var Object3DUtil = require('geo/Object3DUtil');
var RaycasterUtil = require('geo/RaycasterUtil');

function Picker(params) {
  params = params || {};
  // TODO: have default be not to use highlight material
  this.useHighlightMaterial = (params.useHighlightMaterial != null)? params.useHighlightMaterial : true;
  this.highlightMaterial = params.highlightMaterial ||
    Object3DUtil.getSimpleFalseColorMaterial('selected', new THREE.Color(0xef9f56));
  this.__customColorObjectFn = params.colorObject;
  this.__renderer = params.renderer;
  this.highlighted = null;
}

// Stuffs arguments into object
Picker.prototype.__processArguments = function(args, argNames) {
  if (args.length === 1) {
    // Assume single argument is object - return as is
    return args[0];
  } else {
    var res = {};
    var n = Math.min(argNames.length, args.length);
    for (var i = 0; i < n; i++) {
      res[argNames[i]] = args[i];
    }
    return res;
  }
};

Picker.prototype.getCoordinates = function (container, screenPosition) {
  if (container) {
    var rect = container.getBoundingClientRect();
    var x = ((screenPosition.clientX - rect.left) / container.clientWidth) * 2 - 1;
    var y = -((screenPosition.clientY - rect.top) / container.clientHeight) * 2 + 1;
    return new THREE.Vector2(x, y);
  } else {
    var x = (screenPosition.x/screenPosition.width) * 2 - 1 ;
    var y = -(screenPosition.y/screenPosition.height) * 2 + 1;
    return new THREE.Vector2(x, y);
  }
};

/**
 * Returns object picked
 * @param options
 * @param options.container container
 * @param options.position Screen position (contains `clientX, clientY` if `container` provided or `x,y,width,height` if no container)
 * @param options.camera {THREE.Camera}
 * @param options.objects {THREE.Object3D[]} Array of objects to intersect against
 * @param options.ignore {THREE.Object3D[]} Array of objects to ignore
 * @param options.targetType {string} What type of target (`mesh|object`)
 * @returns {Intersect}
 */
Picker.prototype.pick = function(options) {
  var raycastMouse = this.getCoordinates(options.container, options.position);
  if (options.targetType === 'mesh') {
    return this.getFirstIntersectedMesh(raycastMouse.x, raycastMouse.y, options.camera, options.objects, options.ignore);
  } else if (options.targetType === 'object') {
    return this.getFirstIntersected(raycastMouse.x, raycastMouse.y, options.camera, options.objects, options.ignore);
  } else {
    console.error('Unsupported targetType', options.targetType);
  }
};

/**
 * Returns the first intersected object
 * Input parameter can also be a single object with the following field names.
 * @param x {number} x coordinate (already transformed from screen space into image space)
 * @param y {number} y coordinate (already transformed from screen space into image space)
 * @param camera {THREE.Camera}
 * @param objects {THREE.Object3D[]} Array of objects to intersect against
 * @param [ignore] {THREE.Object3D[]} Array of objects to ignore
 * @returns {Intersect}
 */
Picker.prototype.getFirstIntersected = function (x, y, camera, objects, ignore) {
  var args = this.__processArguments(arguments, ['x', 'y', 'camera', 'objects', 'ignore']);
  args.n = 1;
  var intersected = this.getIntersected(args);
  if (intersected.length > 0) {
    // console.log('Picker intersected', intersected[0]);
    return intersected[0];
  }
};

Picker.prototype.getIntersectedNormal = RaycasterUtil.getIntersectedNormal;

/**
 * Returns intersected objects
 * Input parameter can also be a single object with the following field names.
 * @param x {number} x coordinate (already transformed from screen space into image space)
 * @param y {number} y coordinate (already transformed from screen space into image space)
 * @param camera {THREE.Camera}
 * @param objects {THREE.Object3D[]} Array of objects to intersect against
 * @param [ignore] {THREE.Object3D[]} Array of objects to ignore
 * @param [n] {int} Number of intersected objects to return
 * @param [raycaster] {THREE.Raycaster} Optional raycaster (provided so previously computed raycaster can be reused)
 * @returns {Intersect[]}
 */
Picker.prototype.getIntersected = function (x, y, camera, objects, ignore, n, raycaster) {
  var args = this.__processArguments(arguments, ['x', 'y', 'camera', 'objects', 'ignore', 'n', 'raycaster']);
  // Get intersected takes up to 10ms for large scenes
  var intersected = this.getIntersectedDescendants(args);
  return this.selectIntersectedObjects(intersected, args.objects, args.ignore, args.n, args.allowAllModelInstances);
};

/**
 * Returns intersected for a specfied raycaster
 * @param raycaster {THREE.Raycaster}
 * @param objects {THREE.Object3D[]} Array of objects to intersect against
 * @param [ignore] {THREE.Object3D[]} Array of objects to ignore
 * @param [n] {int} Number of intersected objects to return
 * @returns {Intersect[]|*}
 */
Picker.prototype.getIntersectedForRay = function (raycaster, objects, ignore, n) {
  var intersected = raycaster.intersectObjects(objects, true);
  intersected = RaycasterUtil.filterClipped(intersected, this.__renderer);
  RaycasterUtil.sortIntersectionsByNormal(raycaster.ray, intersected);
  return this.selectIntersectedObjects(intersected, objects, ignore, n);
};

Picker.prototype.selectIntersectedObjects = RaycasterUtil.selectIntersectedObjects;

/**
 * Returns first intersected mesh
 * Input parameter can also be a single object with the following field names.
 * @param x {number} x coordinate (already transformed from screen space into image space)
 * @param y {number} y coordinate (already transformed from screen space into image space)
 * @param camera {THREE.Camera}
 * @param objects {THREE.Object3D[]} Array of objects to intersect against
 * @param [ignore] {THREE.Object3D[]} Array of objects to ignore
 * @param [n] {int} Number of intersected objects to return
 * @returns {Intersect|boolean}
 */
Picker.prototype.getFirstIntersectedMesh = function (x, y, camera, objects, ignore) {
  var intersected = this.getIntersectedMeshes(x, y, camera, objects, ignore, 1);
  if (intersected.length > 0) {
    return intersected[0];
  } else {
    return false;
  }
};

/**
 * Returns intersected meshes
 * Input parameter can also be a single object with the following field names.
 * @param x {number} x coordinate (already transformed from screen space into image space)
 * @param y {number} y coordinate (already transformed from screen space into image space)
 * @param camera {THREE.Camera}
 * @param objects {THREE.Object3D[]} Array of objects to intersect against
 * @param [ignore] {THREE.Object3D[]} Array of objects to ignore
 * @param [n] {int} Number of intersected objects to return
 * @returns {Intersect[]}
 */
Picker.prototype.getIntersectedMeshes = function (x, y, camera, objects, ignore, n) {
  var intersected = this.getIntersectedDescendants(x, y, camera, objects);
  return this.selectIntersectedMeshes(intersected, objects, ignore, n);
};

Picker.prototype.selectIntersectedMeshes = function (intersected, objects, ignore, n) {
  var meshes = [];
  for (var i = 0; i < intersected.length; i++) {
    var m = intersected[i].object;
    //var ignoreObject = (ignore && ignore.indexOf(m) >= 0);
    var ignoreObject = (ignore && Object3DUtil.isDescendantOf(m, ignore, true));
    if (!ignoreObject) {
      meshes.push(intersected[i].object);
    }
    if (n && meshes.length > n) break;
  }
  return meshes;
};

// Returns actual meshes that are intersected
// raycaster is optional (provided so previously computed raycaster can be reused)
Picker.prototype.getIntersectedDescendants = function (x, y, camera, objects, raycaster) {
  var args = this.__processArguments(arguments, ['x', 'y', 'camera', 'objects', 'raycaster']);
  if (!args.raycaster) args.raycaster = this.getRaycaster(args.x, args.y, args.camera);

  // Also, need to do recursive intersect since intersect is done at the mesh level
  var intersects = args.raycaster.intersectObjects(args.objects, true);
  intersects = RaycasterUtil.filterClipped(intersects, this.__renderer);
  RaycasterUtil.sortIntersectionsByNormal(args.raycaster.ray, intersects);
  return intersects;
};

Picker.prototype.getRaycaster = function (x, y, camera, raycaster) {
  if (!raycaster) {
    raycaster = new THREE.Raycaster();
    //this.__raycaster = raycaster;
  }
  raycaster.setFromCamera({ x: x, y: y}, camera);
  return raycaster;
};

Picker.prototype.__colorObject = function (object3D, highlighted, highlightMaterial) {
  // Recolor objects to indicate highlight or no highlight
  if (this.__customColorObjectFn) {
    this.__customColorObjectFn(object3D, highlighted, highlightMaterial);
  } else {
    if (highlighted) {
      Object3DUtil.setMaterial(object3D, highlightMaterial, Object3DUtil.MaterialsAll, true);
    } else {
      Object3DUtil.revertMaterials(object3D);
    }
  }
};

Picker.prototype.bind = function(name, fn) {
  if (name === 'colorObject') {
    this.__customColorObjectFn = fn;
  } else {
    console.warn('Unsupported function: ' + name);
  }
};

/**
 * Color object with highlight material
 * @param object3D {THREE.Object3D}
 */
Picker.prototype.highlightObject = function (object3D) {
  if (!object3D.isHighlighted) {
    if (this.useHighlightMaterial) {
      this.__colorObject(object3D, true, this.highlightMaterial);
    }
    this.highlighted = object3D;
    object3D.isHighlighted = true;
  }
};

/**
 * Uncolor object with highlight material
 * @param object3D {THREE.Object3D}
 */
Picker.prototype.unhighlightObject = function (object3D) {
  if (object3D.isHighlighted) {
    if (this.useHighlightMaterial) {
      this.__colorObject(object3D, false, this.highlightMaterial);
    }
    this.highlighted = null;
    object3D.isHighlighted = false;
  }
};

/**
 * Color objects with highlight material
 * @param objects {THREE.Object3D[]}
 */
Picker.prototype.highlightObjects = function (objects) {
  if (objects) {
    for (var i = 0; i < objects.length; i++) {
      var object3D = objects[i];
      if (!object3D.isHighlighted) {
        if (this.useHighlightMaterial) {
          this.__colorObject(object3D, true, this.highlightMaterial);
        }
        object3D.isHighlighted = true;
      }
    }
  }
  this.highlighted = objects;
};

/**
 * Uncolors objects with highlight material
 * @param objects {THREE.Object3D[]}
 */
Picker.prototype.unhighlightObjects = function (objects) {
  if (objects) {
    for (var i = 0; i < objects.length; i++) {
      var object3D = objects[i];
      if (object3D.isHighlighted) {
        if (this.useHighlightMaterial) {
          this.__colorObject(object3D, false, this.highlightMaterial);
        }
        object3D.isHighlighted = false;
      }
    }
  }
  this.highlighted = null;
};

// Exports
module.exports = Picker;
