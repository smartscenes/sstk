'use strict';

var BBox = require('geo/BBox');
var Object3DUtil = require('geo/Object3DUtil');
var ViewGenerator = require('gfx/ViewGenerator');
var Constants = require('Constants');
require('three-controls');
var EnhancedPointerLockControls = require('controls/cam/EnhancedPointerLockControls');
var DragLookPointerControls = require('controls/cam/DragLookPointerControls');

function CameraControls(params) {
  this.camera = params.camera;
  this.container = params.container;
  this.autoRotateCheckbox = params.autoRotateCheckbox;
  if (this.autoRotateCheckbox) this.autoRotateCheckbox.change(function () {
    this.updateAutoRotate();
  }.bind(this));
  this.renderCallback = params.renderCallback;
  this.controlType = params.controlType || 'orbit';
  this.clock = new THREE.Clock();
  this.cameraStates = [];
  this.allControls = {};
  if (this.controlType !== 'none') {
    this.setControls();
  }
  this.movementSpeed = this.camera.far / 25;
  this.defaultDistanceScale = 1.0;
  this.cameraPositionStrategy = params.cameraPositionStrategy || 'positionToFit';

  this.orbitStartCallback = params.orbitStartCallback;
  this.orbitEndCallback = params.orbitEndCallback;
  this.orbitDetails = null;
}

CameraControls.prototype = Object.create(ViewGenerator.prototype);
CameraControls.prototype.constructor = CameraControls;

Object.defineProperty(CameraControls.prototype, 'lastViewConfig', {
  get: function () {return this.__lastViewConfig; }
});

CameraControls.prototype.setControls = function () {
  //console.log("Using control type " + this.controlType);
  var oldControls = this.controls;
  if (oldControls) {
    if (oldControls.enabled) {
      oldControls.enabled = false;
    }
  }
  if (this.orbitControls) {
    this.orbitControls.enabled = false;
    this.orbitControls = null;
  }
  var controlsEnabled = this.controlType !== 'none';
  if (this.controlType === 'trackballWithOrbit' ||
    this.controlType === 'trackballNoOrbit' ||
    this.controlType === 'trackball') {
    var trackBallControls = this.__getControls('trackball', true);
    var useOrbitControls = (this.controlType === 'trackballWithOrbit');
    var orbitControls = this.__getControls('orbit', useOrbitControls);
    if (orbitControls) {
      orbitControls.enabled = !orbitControls;
      this.updateAutoRotate(orbitControls);
    }
    // trackBallControls.noZoom = useOrbitControls;  // Use orbit controls for zoom

    if (useOrbitControls) this.orbitControls = orbitControls;
    this.controls = trackBallControls;
  } else if (this.controlType === 'orbit' || this.controlType === 'orbitRightClick' || this.controlType === 'orbitRightClickNoPanZoom') {
    this.controls = this.__getControls(this.controlType, true);
    this.controls.userRotate = false;
    this.updateAutoRotate(this.controls);
    this.orbitControls = this.controls;
  } else {
    // Not tested
    var controls = this.__getControls(this.controlType, true);
    if (controls) {
      this.controls = controls;
    } else {
      console.error('Invalid controlType: ' + this.controlType);
    }
  }

  if (this.controls) {
    this.controls.enabled = controlsEnabled;
    this.__updateMovementSpeed();
  }

  if (oldControls) {
    if (this.controls.target) {
      if (oldControls.target) {
        this.controls.target.copy(oldControls.target);
      } else {
        // guess some target based on the camera direction
        var ray = new THREE.Ray(this.camera.position);
        this.camera.getWorldDirection(ray.direction);
        ray.closestPointToPoint(this.controls.target, this.controls.target);
        if (this.controls.target.distanceToSquared(this.camera.position) < 0.0001) {
          // make sure the target is sufficiently far
          this.controls.target.copy(this.camera.position);
          this.controls.target.add(ray.direction);
        }
      }
    }
  }
};


CameraControls.prototype.__getControls = function (controlType, createControls) {
  var controls = this.allControls[controlType];
  if (!controls && createControls) {
    controls = this.__createControls(controlType);
    if (controls) this.allControls[controlType] = controls;
  }
  return controls;
};

CameraControls.prototype.__addOrbitControlListeners = function(controls) {
  // TODO: shouldn't we also have listeners for other controls?
  // TODO: there is also very limited information in the events
  let scope = this;
  controls.addEventListener('start', () => {
    scope.orbitDetails = {startTime: new Date().getTime()};
    if (scope.orbitStartCallback) {
      scope.orbitStartCallback(scope.orbitDetails);
    }
  });
  controls.addEventListener('end', () => {
    if (scope.orbitEndCallback) {
      scope.orbitEndCallback(scope.orbitDetails);
    }
  });
};

CameraControls.prototype.__createControls = function (controlType) {
  //console.log("Creating controller for control type " + controlType);
  var controls = null;
  if (controlType === 'trackball') {
    // Create trackball controls with reasonable defaults
    // Used for panning (right mouse button) and rotating (left mouse button)
    controls = new THREE.TrackballControls(this.camera, this.container);

    controls.rotateSpeed = 1.0;
    controls.zoomSpeed = 1.2;
    controls.panSpeed = 0.8;

    controls.noZoom = false;
    controls.noPan = false;

    controls.staticMoving = true;
    controls.dynamicDampingFactor = 0.3;

    // keys for rotate, zoom, pan (press and hold?)
    controls.keys = [65 /*A*/, 83 /*S*/, 68 /*D*/];
    controls.addEventListener('change', this.renderCallback);

    // Prevent default mousewheel action (zoom in/out on mousewheel)
    this.container.addEventListener('mousewheel', this.mousewheel.bind(this), false);
  } else if (controlType === 'firstPerson') {
    controls = new THREE.FirstPersonControls(this.camera, this.container);
    controls.activeLook = false;
  } else if (controlType === 'firstPersonClickDrag') {
    controls = new DragLookPointerControls(this.camera, this.container);
  } else if (controlType === 'pointerLock') {
    controls = new EnhancedPointerLockControls(this.camera, this.container);
    controls.bindEvents(window);
  } else if (controlType === 'orbit') {
    // Default orbit controls
    controls = new THREE.OrbitControls(this.camera, this.container);
    controls.enableKeys = false;
    controls.userRotate = false;
    // Use orbit controls for the auto rotate
    this.updateAutoRotate(controls);
    controls.addEventListener('change', this.renderCallback);
    this.__addOrbitControlListeners(controls);
  } else if (controlType === 'orbitRightClick') {
    // Orbit controls with right click and ability to pan/zoom
    controls = new THREE.OrbitControls(this.camera, this.container);
    controls.mouseMappings = [
      { action: controls.actions.PAN,    button: THREE.MOUSE.RIGHT, keys: ['shiftKey'] },
      { action: controls.actions.ORBIT,  button: THREE.MOUSE.RIGHT },
      { action: controls.actions.ZOOM,   button: THREE.MOUSE.MIDDLE }
    ];
    controls.enableKeys = false;
    controls.userRotate = false;
    this.updateAutoRotate(controls);
    this.__addOrbitControlListeners(controls);
  } else if (controlType === 'orbitRightClickNoPanZoom') {
    // Orbit controls with right click and no ability to pan/zoom
    controls = new THREE.OrbitControls(this.camera, this.container);
    controls.mouseMappings = [
      { action: controls.actions.ORBIT,  button: THREE.MOUSE.RIGHT }
    ];
    controls.enableKeys = false;
    controls.userRotate = false;
    controls.enableZoom = false;
    this.updateAutoRotate(controls);
    this.__addOrbitControlListeners(controls);
  } else if (controlType === 'fly') {
    controls = new THREE.FlyControls(this.camera, this.container);
  } else {
    console.error('Invalid controlType: ' + controlType);
  }
  return controls;
};

CameraControls.prototype.setControlType = function (controlType) {
  // TODO: Make it so we can switch between control types...doesn't quite work
  if (controlType !== this.controlType) {
    // we are trying to switch the controlType...
    this.controlType = controlType;
    // TODO: Cleanup events for old controls or at least disable old controls
    this.setControls();
  }
};

CameraControls.prototype.mousewheel = function (event) {
  event.preventDefault();
  event.stopPropagation();
};

CameraControls.prototype.update = function () {
  if (this.orbitControls && this.controls !== this.orbitControls) this.orbitControls.update();
  this.controls.update(this.clock.getDelta());
};

CameraControls.prototype.handleResize = function () {
  if (this.controls && this.controls.handleResize) {
    this.controls.handleResize();
  }
};

CameraControls.prototype.updateAutoRotate = function (controls) {
  if (!controls) controls = this.orbitControls;
  if (controls && this.autoRotateCheckbox) {
    controls.autoRotate = this.autoRotateCheckbox.prop('checked');
  }
};

CameraControls.prototype.setAutoRotate = function (flag, controls) {
  if (!controls) controls = this.orbitControls;
  if (controls) {
    if (this.autoRotateCheckbox) {
      this.autoRotateCheckbox.prop('checked', flag);
    }
    controls.autoRotate = flag;
  }
};

CameraControls.prototype.getAutoRotate = function (controls) {
  if (!controls) controls = this.orbitControls;
  if (controls) {
    return controls.autoRotate || false;
  } else { return false; }
};

CameraControls.prototype.setAutoRotateSpeed = function (speed, controls) {
  if (!controls) controls = this.orbitControls;
  if (controls) {
    controls.autoRotateSpeed = speed;
  }
};

CameraControls.prototype.timedAutoRotate = function (totalMillis, speed, callback, controls) {
  this.setAutoRotateSpeed(speed, controls);
  this.setAutoRotate(true, controls);
  var timeoutID = window.setTimeout(function () {
    this.setAutoRotate(false, controls);
    if (callback) {
      callback(timeoutID);
    }
  }.bind(this), totalMillis);
};

/**
 * View target
 * @param options
 * @param [options.target] {THREE.Vector3} Target point to look at (if not specified, then must specify `targetBBox` - then the `targetBBox` centroid is used as target)
 * @param [options.position] {THREE.Vector3} Camera position to look from (if not specified, then must specify `targetBBox` - then the `target` and `targetBBox` along with other parameters are used to determine the position)
 * @param [options.targetBBox] {geo.BBox} Target bounding box to look at (used if either `target` or `position` not specified)
 * @param [options.up] {THREE.Vector3} Camera up (existing camera up is used if not specified)
 * @param [options.lookatUp] {THREE.Vector3} Up to use for lookat computation (`up` is used if not specified)
 * @param [options.distanceScale=this.defaultDistanceScale] {number}
 * @param [options.viewIndex] {int}
 * @param [options.theta] {number}
 * @param [options.phi] {number}
 * @param [options.fitRatio] {number}
 * @param [options.defaultPosition] {number}
 * @param [options.fov] {number} Vertical field of view (in degrees)
 * @param [options.near] {number} Near in virtual units
 * @param [options.far] {number} Far in virtual units
 */
CameraControls.prototype.viewTarget = function (options) {
  // console.log('view', options);
  var target = Object3DUtil.toVector3(options.target || options.lookat);        // Target to look at
  var position = Object3DUtil.toVector3(options.position);    // Camera position
  var up = Object3DUtil.toVector3(options.up);  // Up direction
  var lookatUp = Object3DUtil.toVector3(options.lookatUp) || up;  // Up to use for looking at target
  var distanceScale = options.distanceScale || this.defaultDistanceScale;

  this.__lastViewConfig = {
    target: target? target.toArray() : undefined,
    targetBBox: options.targetBBox? options.targetBBox.toJSON() : undefined,
    eye: position? position.toArray() : undefined,
    lookatUp: lookatUp? lookatUp.toArray() : undefined,
    distanceScale: distanceScale,
    theta: options.theta,
    phi: options.phi,
    fitRatio: options.fitRatio,
    viewIndex: options.viewIndex
  };
  if ((!target || !position) && options.targetBBox) {
    // Don't have a precise point, but a bbox
    var bb = options.targetBBox;
    var centroid = bb.centroid();
    // Figure out a good position for the camera
    if (!target) target = centroid;
    if (!position) {
      var dims = bb.dimensions();
      var maxDim = Math.max(dims.x, dims.y, dims.z);
      this.camera.near = maxDim / Constants.defaultCamera.nearFarMultiplier;
      this.camera.far = maxDim * Constants.defaultCamera.nearFarMultiplier;
      //console.log('changing camera near/far to ' + this.camera.near + '/' + this.camera.far);
      if (THREE.CombinedCamera && this.camera instanceof THREE.CombinedCamera) {
        this.camera.updateNearFar();
      }
      this.movementSpeed = maxDim / 5;
      var viewIndex = options.viewIndex;
      if (viewIndex === undefined || viewIndex <= 0) {
        if (options.theta !== undefined/* latitude */ && options.phi !== undefined /* longitude */) {
          var viewbb = bb;
          if (options.fitRatio) {
            viewbb =  viewbb.scaleBy(options.fitRatio);
          }
          var view = this.getViewForBBox({ name: 'view', target: viewbb, theta: options.theta, phi: options.phi, dists: distanceScale});
          position = Object3DUtil.toVector3(view.position);
        } else if (options.defaultPosition) {
          position = options.defaultPosition;
        } else {
          position = new THREE.Vector3(centroid.x, centroid.y, bb.min.z - maxDim * distanceScale);
        }
      } else {
        var views = [
          new THREE.Vector3(bb.min.x - maxDim * distanceScale, centroid.y, centroid.z),
          new THREE.Vector3(bb.max.x + maxDim * distanceScale, centroid.y, centroid.z),
          new THREE.Vector3(centroid.x, bb.min.y - maxDim * distanceScale, centroid.z),
          new THREE.Vector3(centroid.x, bb.max.y + maxDim * distanceScale, centroid.z),
          new THREE.Vector3(centroid.x, centroid.y, bb.min.z - maxDim * distanceScale),
          new THREE.Vector3(centroid.x, centroid.y, bb.max.z + maxDim * distanceScale)
        ];
        position = views[viewIndex - 1];
      }
    }
    //console.log(bb);
    //console.log(target);
    //console.log(position);
  }
  // Set up to use for lookAt
  var cameraUp = up || this.camera.up.clone();
  if (lookatUp) {
    this.camera.up.copy(lookatUp);
  }
  this.camera.position.copy(position);
  this.camera.lookAt(target);

  // Adjust left/right/top/bottom for orthographic camera
  if (this.camera instanceof THREE.OrthographicCamera) {
    // The size that we set is the mid plane of the viewing frustum
    var hyperfocus = target.clone().sub(this.camera.position).length();
    var halfHeight = Math.tan( this.camera.fov * Math.PI / 180 / 2 ) * hyperfocus;
    var planeHeight = 2 * halfHeight;
    var planeWidth = planeHeight * this.camera.aspect;
    var halfWidth = planeWidth / 2;

    this.camera.left = - halfWidth;
    this.camera.right = halfWidth;
    this.camera.top = halfHeight;
    this.camera.bottom = - halfHeight;
  }

  if (options.fov) {
    this.camera.fov = options.fov;
  }
  if (options.near) {
    this.camera.near = options.near;
  }
  if (options.far) {
    this.camera.far = options.far;
  }

  //console.log("Camera should look at: " );
  //console.log(target);
  this.__setControlsTarget(target);

  // Set back up to use for camera
  this.camera.up.copy(cameraUp);
  this.camera.updateMatrix();
  this.camera.updateProjectionMatrix(target);
};

CameraControls.prototype.__updateMovementSpeed = function() {
  // If first person camera set the movement to be somewhat reasonable based on camera far/near
  if (this.controlType === 'firstPerson' || this.controlType === 'firstPersonClickDrag' || this.controlType === 'pointerLock') {
    this.controls.movementSpeed = this.movementSpeed;
  } else if (this.controlType === 'fly') {
    this.controls.movementSpeed = this.movementSpeed * Constants.metersToVirtualUnit;
    this.controls.rollSpeed = 0.005 * this.movementSpeed * Constants.metersToVirtualUnit;
  }
};

CameraControls.prototype.__setControlsTarget = function (target) {
  if (this.controls) {
    if (target && this.controls.target) {
      this.controls.target.copy(target);
      this.__updateMovementSpeed();
    }
    this.controls.update();
  }
};

CameraControls.prototype.saveCameraState = function (clearCameraStates) {
  if (clearCameraStates) {
    this.cameraStates.length = 0;
  }
  var cameraState = this.getCurrentCameraState();
  this.cameraStates.push(cameraState);
};

CameraControls.prototype.getCurrentCameraState = function () {
  var cameraState = {
    position: (this.camera.position) ? this.camera.position.clone() : undefined,
    rotation: (this.camera.rotation) ? this.camera.rotation.clone() : undefined,
    target: (this.controls && this.controls.target) ? this.controls.target.clone() : undefined,
    up: (this.camera.up) ? this.camera.up.clone() : undefined
  };
  if (this.camera instanceof THREE.CombinedCamera) {
    cameraState['isOrtho'] = this.camera.inOrthographicMode;
  }
  return cameraState;
};

CameraControls.prototype.resetCamera = function () {
  this.restoreCameraState();
};

CameraControls.prototype.restoreCameraState = function (state) {
  if (!state && this.cameraStates.length > 0) {
    state = this.cameraStates[this.cameraStates.length - 1];
  }
  this.setCameraState(state);
};

CameraControls.prototype.setCameraState = function (state) {
  if (state) {
    if (state.position) {
      if (this.camera.position) this.camera.position.copy(state.position);
    }
    const up = state.up;
    if (up) {
      if (this.camera.up) this.camera.up.copy(up);
    }
    if (state.target) {
      if (this.controls.target) this.controls.target.copy(state.target);
      this.camera.lookAt(state.target);
    } else if (state.direction) {
      const target = state.direction.clone().normalize();
      target.add(this.camera.position);
      if (this.controls.target) this.controls.target.copy(target);
      this.camera.lookAt(target);
    }
    const fov = state.fov;
    if (fov) {
      this.camera.setFov(fov);
    }
    this.camera.updateMatrix();
    if (this.camera instanceof THREE.CombinedCamera) {
      this.camera.inOrthographicMode = state.isOrtho || false;
      this.camera.inPerspectiveMode = !this.camera.inOrthographicMode;
    }
    this.camera.updateProjectionMatrix(this.controls.target);
    this.controls.update();
  }
};

CameraControls.prototype.popCameraState = function () {
  return this.cameraStates.pop();
};

CameraControls.prototype.viewObject3DArray = function (object3Darr) {
  var bbox = new BBox();
  for (var i = 0; i < object3Darr.length; i++) {
    var object3d = object3Darr[i];
    bbox.includeObject3D(object3d);
  }
  var bboxDims = bbox.dimensions();
  var width = bboxDims.x;
  var height = bboxDims.z;
  var depth = bboxDims.y;

  var epsilon = 0.2 * height;

  this.camera.position.y = -(0.5 * depth + 0.75 * width + epsilon);
  this.camera.position.z = 0.5 * height + epsilon;
  this.camera.position.x = 0;

  var maxDim = Math.max(bboxDims.x, bboxDims.y, bboxDims.z);
  this.camera.far = maxDim * Constants.defaultCamera.nearFarMultiplier;
  this.camera.near = maxDim / Constants.defaultCamera.nearFarMultiplier;
  this.movementSpeed = maxDim / 5;
  if (THREE.CombinedCamera && this.camera instanceof THREE.CombinedCamera) {
    this.camera.updateNearFar();
  }
  this.camera.updateMatrix();
  this.camera.updateProjectionMatrix(bbox.centroid());
};

CameraControls.prototype.panLeft = function (delta) {
  if (this.orbitControls && this.orbitControls.enabled) {
    this.orbitControls.panLeft(delta);
  }
};

CameraControls.prototype.panUp = function (delta) {
  if (this.orbitControls && this.orbitControls.enabled) {
    this.orbitControls.panUp(delta);
  }
};

CameraControls.prototype.rotateLeft = function (delta) {
  if (this.orbitControls && this.orbitControls.enabled) {
    this.orbitControls.rotateLeft(delta);
  }
};

CameraControls.prototype.rotateUp = function (delta) {
  if (this.orbitControls && this.orbitControls.enabled) {
    this.orbitControls.rotateUp(delta);
  }
};

CameraControls.prototype.dollyIn = function (dollyScale) {
  if (this.orbitControls && this.orbitControls.enabled) {
    this.orbitControls.dollyIn(dollyScale);
  }
};

CameraControls.prototype.dollyOut = function (dollyScale) {
  if (this.orbitControls && this.orbitControls.enabled) {
    this.orbitControls.dollyOut(dollyScale);
  }
};
//    CameraControls.prototype.toCameraCoords = function(position) {
//        return this.camera.matrixWorldInverse.multiplyVector3(position.clone());
//    };

CameraControls.prototype.getBaseCamera = function () {
  if (THREE.CombinedCamera && this.camera instanceof THREE.CombinedCamera) {
    this.camera.updateProjectionMatrix();
    if (this.camera.inPerspectiveMode) {
      this.camera.cameraP.updateMatrixWorld();
      return this.camera.cameraP;
    } else {
      this.camera.cameraO.updateMatrixWorld();
      return this.camera.cameraO;
    }
  } else {
    return this.camera;
  }
};

CameraControls.prototype.toJSON = function () {
  var baseCamera = this.getBaseCamera();
  var json = baseCamera.toJSON();
  return json;
};

CameraControls.prototype.setCameraMatrix = function(xform) {
  Object3DUtil.setMatrix(this.camera, xform);
  this.camera.updateMatrix();
  this.camera.updateProjectionMatrix();
  this.controls.update();
};

CameraControls.prototype.setCameraPosition = function(position) {
  this.camera.position.copy(position);
  this.camera.updateMatrix();
  this.camera.updateProjectionMatrix(this.controls.target);
  this.controls.update();
};

// Exports
module.exports = CameraControls;
