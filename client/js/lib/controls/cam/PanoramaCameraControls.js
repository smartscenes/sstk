const PointerControls = require('controls/PointerControls')
// This set of controls performs allows rotating the camera about orbiting, dollying (zooming), and panning.
// Unlike TrackballControls, it maintains the "up" direction object.up (+Y by default).
//
//    Orbit - left mouse / touch: one-finger move
//    Zoom - middle mouse, or mousewheel / touch: two-finger spread or squish
//    Pan - right mouse, or left mouse + ctrl/meta/shiftKey, or arrow keys / touch: two-finger move

const STATE = {
  NONE: PointerControls.STATE.NONE,
  ROTATE: 1
};

class PanoramaCameraControls extends PointerControls {

  constructor(camera, domElement) {
    super(domElement);
    if (domElement === undefined) console.warn('PanoramaCameraControls: The second parameter "domElement" is mandatory.');
    if (domElement === document) console.error('PanoramaCameraControls: "document" should not be used as the target "domElement". Please use "renderer.domElement" instead.');

    this.camera = camera;

    // How far you can rotate vertically (pitch/elevation), upper and lower limits.
    // Range is 0 to Math.PI radians.
    this.minPolarAngle = -Math.PI/2; // radians
    this.maxPolarAngle = Math.PI/2; // radians

    // How far you can rotate horizontally, upper and lower limits.
    // If set, the interval [ min, max ] must be a sub-interval of [ - 2 PI, 2 PI ], with ( max - min < 2 PI )
    this.minAzimuthAngle = -Infinity; // radians
    this.maxAzimuthAngle = Infinity; // radians

    // Set to true to enable damping (inertia)
    // If damping is enabled, you must call controls.update() in your animation loop
    this.enableDamping = false;
    this.dampingFactor = 0.05;

    this.rotateSpeed = 0.002;

    // The four arrow keys
    this.keys = {LEFT: 37, UP: 38, RIGHT: 39, BOTTOM: 40};
    this.keyRotateAngle = Math.PI / 18;

    this.actions = Object.freeze({ROTATE: 0});

    // AXC: more generic mouse mappings
    this.mouseMappings = [
      { action: this.actions.ROTATE, button: THREE.MOUSE.RIGHT, state: PanoramaCameraControls.STATE.ROTATE }
    ];

    // Touch fingers
    this.touches = { ONE: THREE.TOUCH.ROTATE };

    // for reset
    // this._position0 = this.camera.position.clone();
    // this._quaternion0 = this.camera.quaternion.clone();

    const EPS = 0.000001;
    const spherical = new THREE.Spherical();
    const sphericalDelta = new THREE.Spherical();
    const euler = new THREE.Euler( 0, 0, 0, 'YXZ' );
    const twoPI = 2 * Math.PI;
    const halfPI = Math.PI / 2;
    const changeEvent = { type: 'change' };
    const lastQuaternion = new THREE.Quaternion();

    const scope = this;

    function update() {
      if ( scope.enableDamping ) {
        spherical.theta += sphericalDelta.theta * scope.dampingFactor;
        spherical.phi += sphericalDelta.phi * scope.dampingFactor;
      } else {
        spherical.theta += sphericalDelta.theta;
        spherical.phi += sphericalDelta.phi;
      }

      // restrict theta to be between desired limits
      let min = scope.minAzimuthAngle;
      let max = scope.maxAzimuthAngle;
      if ( isFinite( min ) && isFinite( max ) ) {
        if ( min < - Math.PI ) min += twoPI; else if ( min > Math.PI ) min -= twoPI;
        if ( max < - Math.PI ) max += twoPI; else if ( max > Math.PI ) max -= twoPI;
        if ( min <= max ) {
          spherical.theta = Math.max( min, Math.min( max, spherical.theta ) );
        } else {
          spherical.theta = ( spherical.theta > ( min + max ) / 2 ) ?
            Math.max( min, spherical.theta ) :
            Math.min( max, spherical.theta );
        }
      }

      // restrict phi to be between desired limits
      spherical.phi = Math.max( scope.minPolarAngle, Math.min( scope.maxPolarAngle, spherical.phi ) );
      //spherical.makeSafe();

      // Update orientation of camera
      euler.x = spherical.phi;
      euler.y = spherical.theta;
      scope.camera.quaternion.setFromEuler(euler);

      if (scope.enableDamping === true) {
        sphericalDelta.theta *= ( 1 - scope.dampingFactor );
        sphericalDelta.phi *= ( 1 - scope.dampingFactor );
      } else {
        sphericalDelta.set( 0, 0, 0 );
      }

      if (8 * ( 1 - lastQuaternion.dot(scope.camera.quaternion)) > EPS ) {
        scope.dispatchEvent( changeEvent );
        lastQuaternion.copy(scope.camera.quaternion);
        return true;
      }
      return false;
    }

    // private state
    this.__rotateStart = new THREE.Vector2();
    this.__rotateEnd = new THREE.Vector2();
    this.__rotateDelta = new THREE.Vector2();
    this.__spherical = spherical;
    this.__sphericalDelta = sphericalDelta;

    // expose functions
    this.update = update;
  }

  setLookDirVector3(vector) {
    this.__spherical.setFromVector3(vector);
    console.log('lookdir', vector.clone(), this.__spherical.clone());
    this.__sphericalDelta.phi = 0;
    this.__sphericalDelta.theta = 0;
  }

  getPolarAngle() {
    return this.__spherical.phi;
  }

  getAzimuthalAngle() {
    return this.__spherical.theta;
  }

  // rotate up and left
  rotateLeft(angle) {
    this.__sphericalDelta.theta += angle;
  }

  rotateUp(angle) {
    this.__sphericalDelta.phi += angle;
  }

  handleKeyDown(event) {
    let needsUpdate = false;
    switch ( event.keyCode ) {
      case this.keys.UP:
        this.rotateUp(this.keyRotateAngle);
        needsUpdate = true;
        break;
      case this.keys.BOTTOM:
        this.rotateUp(-this.keyRotateAngle);
        needsUpdate = true;
        break;
      case this.keys.LEFT:
        this.rotateLeft(this.keyRotateAngle);
        needsUpdate = true;
        break;
      case this.keys.RIGHT:
        this.rotateLeft(-this.keyRotateAngle);
        needsUpdate = true;
        break;
    }

    if ( needsUpdate ) {
      // prevent the browser from scrolling on cursor keys
      event.preventDefault();
      this.update();
    }
  }

  handleMouseDownAction (event, mouseMapping) {
    // TODO: override
    if (mouseMapping.state === PanoramaCameraControls.STATE.ROTATE) {
      this.__state = mouseMapping.state;
      this.__handleMouseDownRotate(event);
      return true;
    }
  }

  handleMouseMove(event) {
    if (this.__state === PanoramaCameraControls.STATE.ROTATE) {
      return this.__handleMouseMoveRotate(event);
    }
  }

  handleTouchStart(event) {
    if (event.touches.length === 1 && this.touches.ONE === this.actions.ROTATE) {
      this.__state = PanoramaCameraControls.STATE.ROTATE;
      return this.__handleTouchStartRotate(event);
    } else if (event.touches.length === 2 && this.touches.TWO === this.actions.ROTATE) {
      this.__state = PanoramaCameraControls.STATE.ROTATE;
      return this.__handleTouchStartRotate(event);
    }
  }

  handleTouchMove(event) {
    if (this.__state === PanoramaCameraControls.STATE.ROTATE) {
      return this.__handleTouchMoveRotate(event);
    }
  }

  // handle mouse/touch interactions
  __handleMouseDownRotate(event) {
    this.__rotateStart.set( event.clientX, event.clientY );
  }

  __handleMouseMoveRotate(event) {
    const rotateEnd = this.__rotateEnd;
    const rotateStart = this.__rotateStart;
    const rotateDelta = this.__rotateDelta;

    rotateEnd.set( event.clientX, event.clientY );
    rotateDelta.subVectors( rotateEnd, rotateStart ).multiplyScalar( this.rotateSpeed );
    const element = this.domElement;
    this.rotateLeft( 2 * Math.PI * rotateDelta.x / element.clientHeight ); // yes, height
    this.rotateUp( 2 * Math.PI * rotateDelta.y / element.clientHeight );
    rotateStart.copy( rotateEnd );
    this.update();
  }

  __handleTouchStartRotate(event) {
    const rotateStart = this.__rotateStart;

    if ( event.touches.length === 1 ) {
      rotateStart.set( event.touches[ 0 ].pageX, event.touches[ 0 ].pageY );
    } else {
      const x = 0.5 * ( event.touches[ 0 ].pageX + event.touches[ 1 ].pageX );
      const y = 0.5 * ( event.touches[ 0 ].pageY + event.touches[ 1 ].pageY );
      rotateStart.set( x, y );
    }
  }

  __handleTouchMoveRotate( event ) {
    const rotateEnd = this.__rotateEnd;
    const rotateStart = this.__rotateStart;
    const rotateDelta = this.__rotateDelta;

    if ( event.touches.length === 1 ) {
      rotateEnd.set( event.touches[ 0 ].pageX, event.touches[ 0 ].pageY );
    } else {
      const x = 0.5 * ( event.touches[ 0 ].pageX + event.touches[ 1 ].pageX );
      const y = 0.5 * ( event.touches[ 0 ].pageY + event.touches[ 1 ].pageY );
      rotateEnd.set( x, y );
    }

    rotateDelta.subVectors( rotateEnd, rotateStart ).multiplyScalar( scope.rotateSpeed );
    const element = this.domElement;
    this.rotateLeft( 2 * Math.PI * rotateDelta.x / element.clientHeight ); // yes, height
    this.rotateUp( 2 * Math.PI * rotateDelta.y / element.clientHeight );
    rotateStart.copy( rotateEnd );
  }
}

PanoramaCameraControls.STATE = STATE;

module.exports = PanoramaCameraControls;