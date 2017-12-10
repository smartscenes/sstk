'use strict';

define(['geo/BBox', 'geo/Object3DUtil', 'gfx/ViewGenerator', 'Constants', 'three-controls'],
  function (BBox, Object3DUtil, ViewGenerator, Constants, threeControls) {

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
  }

  CameraControls.prototype = Object.create(ViewGenerator.prototype);
  CameraControls.prototype.constructor = CameraControls;

  CameraControls.prototype.setControls = function () {
    //console.log("Using control type " + this.controlType);
    var oldControls = this.controls;
    if (oldControls) {
      if (oldControls.enabled) {
        oldControls.enabled = false;
      } else if (oldControls instanceof THREE.FirstPersonControls) {
        oldControls.freeze = true;
      }
    }
    if (this.orbitControls) {
      this.orbitControls.enabled = false;
      this.orbitControls = null;
    }
    if (this.controlType === 'trackballWithOrbit' ||
      this.controlType === 'trackballNoOrbit' ||
      this.controlType === 'trackball') {
      var trackBallControls = this.getControls('trackball', true);
      var useOrbitControls = (this.controlType === 'trackballWithOrbit');
      var orbitControls = this.getControls('orbit', useOrbitControls);
      if (orbitControls) {
        orbitControls.enabled = !orbitControls;
        this.updateAutoRotate(orbitControls);
      }
      // trackBallControls.noZoom = useOrbitControls;  // Use orbit controls for zoom

      if (useOrbitControls) this.orbitControls = orbitControls;
      this.controls = trackBallControls;
      this.controls.enabled = true;
    } else if (this.controlType === 'firstPerson') {
      this.controls = this.getControls(this.controlType, true);
      this.controls.freeze = false;
      this.controls.movementSpeed = this.movementSpeed;
    } else if (this.controlType === 'firstPersonClickDrag') {
      this.controls = this.getControls(this.controlType, true);
      this.controls.freeze = false;
      this.controls.movementSpeed = this.movementSpeed;
    } else if (this.controlType === 'pointerLock') {
      // Not working
      this.controls = this.getControls(this.controlType, true);
      this.controls.enabled = true;
    } else if (this.controlType === 'orbit' || this.controlType === 'orbitRightClick') {
      this.controls = this.getControls(this.controlType, true);
      this.controls.enabled = true;
      this.controls.userRotate = false;
      this.updateAutoRotate(this.controls);
      this.orbitControls = this.controls;
    } else {
      console.error('Invalid controlType: ' + this.controlType);
    }

    if (oldControls) {
      if (oldControls.target && this.controls.target)
        this.controls.target.copy(oldControls.target);
    }
  };


  CameraControls.prototype.getControls = function (controlType, createControls) {
    var controls = this.allControls[controlType];
    if (!controls && createControls) {
      controls = this.createControls(controlType);
      if (controls) this.allControls[controlType] = controls;
    }
    return controls;
  };

  CameraControls.prototype.createControls = function (controlType) {
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
      controls.freeze = true;
      controls.activeLook = false;
      controls.movementSpeed = this.movementSpeed;
    } else if (controlType === 'firstPersonClickDrag') {
      controls = new THREE.FirstPersonControlsClickDragRotation(this.camera, this.container);
      controls.freeze = true;
      controls.activeLook = false;
      controls.movementSpeed = this.movementSpeed;
    } else if (controlType === 'pointerLock') {
      // Not working
      controls = new THREE.PointerLockControls(this.camera);
    } else if (controlType === 'orbit') {
      // Use orbit controls for the auto rotate
      controls = new THREE.OrbitControls(this.camera, this.container);
      controls.enableKeys = false;
      controls.userRotate = false;
      this.updateAutoRotate(controls);
      controls.addEventListener('change', this.renderCallback);
    } else if (controlType === 'orbitRightClick') {
      // Use orbit controls for the auto rotate

      controls = new THREE.OrbitControls(this.camera, this.container);
      controls.panRequiresShift = true;
      controls.enableKeys = false;
      controls.mouseButtons = { ORBIT: THREE.MOUSE.RIGHT, ZOOM: THREE.MOUSE.MIDDLE, PAN: THREE.MOUSE.RIGHT };
      controls.userRotate = false;
      this.updateAutoRotate(controls);
      controls.addEventListener('change', this.renderCallback);
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

  CameraControls.prototype.unfreeze = function () {
    if (this.controlType === 'firstPerson') {
      this.controls.freeze = false;
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

  CameraControls.prototype.viewTarget = function (options) {
    var target = Object3DUtil.toVector3(options.target);        // Target to look at
    var position = Object3DUtil.toVector3(options.position);    // Camera position
    var up = Object3DUtil.toVector3(options.up);  // Up direction
    var lookatUp = Object3DUtil.toVector3(options.lookatUp) || up;  // Up to use for looking at target
    var distanceScale = options.distanceScale || this.defaultDistanceScale;

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

  CameraControls.prototype.__setControlsTarget = function (target) {
    if (this.controls) {
      if (target && this.controls.target) {
        this.controls.target.copy(target);
        // If first person camera set the movement to be somewhat reasonable based on camera far/near
        if (this.controlType === 'firstPerson' || this.controlType === 'firstPersonClickDrag') {
          this.controls.movementSpeed = this.movementSpeed;
        }
      } else if (this.controlType === 'pointerLock') {
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
      target: (this.controls.target) ? this.controls.target.clone() : undefined,
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
    if (state) {
      if (state.position) {
        if (this.camera.position) this.camera.position.copy(state.position);
      }
      if (state.up) {
        if (this.camera.up) this.camera.up.copy(state.up);
      }
      if (state.target) {
        if (this.controls.target) this.controls.target.copy(state.target);
        this.camera.lookAt(state.target);
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
    this.orbitControls.constraint.panLeft(delta);
  };

  CameraControls.prototype.panUp = function (delta) {
    this.orbitControls.constraint.panUp(delta);
  };

  CameraControls.prototype.rotateLeft = function (delta) {
    this.orbitControls.constraint.rotateLeft(delta);
  };

  CameraControls.prototype.rotateUp = function (delta) {
    this.orbitControls.constraint.rotateUp(delta);
  };

  CameraControls.prototype.dollyIn = function (dollyScale) {
    this.orbitControls.constraint.dollyIn(dollyScale);
  };

  CameraControls.prototype.dollyOut = function (dollyScale) {
    this.orbitControls.constraint.dollyOut(dollyScale);
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

  CameraControls.prototype.setCameraMatrix = function(xform) {
    Object3DUtil.setMatrix(this.camera, xform);
    this.camera.updateMatrix();
    this.camera.updateProjectionMatrix();
    this.controls.update();
  };

  // Exports
  return CameraControls;
});
