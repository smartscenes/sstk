// A bit of overkill, but let's extend PointerControls
const PointerControls = require('controls/PointerControls');

const PI_2 = Math.PI / 2;

const STATE = {
  NONE: PointerControls.STATE.NONE,
  ROTATE: 1
};

class DragLookPointerControls extends PointerControls {
  constructor( camera, domElement ) {
    super(domElement);
    this.camera = camera;

    // First person movement using keybindings
    this.__keymappings = {
      'ArrowUp': 'moveForward',
      'KeyW': 'moveForward',
      'ArrowDown': 'moveBackward',
      'KeyS': 'moveBackward',
      'ArrowRight': 'moveRight',
      'KeyD': 'moveRight',
      'ArrowLeft': 'moveLeft',
      'KeyA': 'moveLeft'
    };
    this.__activeActions = {
      moveForward: false,
      moveBackward: false,
      moveLeft: false,
      moveRight: false
    };
    this.velocity = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.friction = 10.0;
    this.acceleration = 40.0;
    this.movementSpeedMultiplier = 2;

    // Set to constrain the pitch of the camera
    // Range is 0 to Math.PI radians
    this.minPolarAngle = 0; // radians
    this.maxPolarAngle = Math.PI; // radians

    // mouse mappings
    this.mouseMappings = [
      { button: THREE.MOUSE.RIGHT, state: DragLookPointerControls.STATE.ROTATE }
    ];

    //
    // internals
    //
    this.__euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.__vec = new THREE.Vector3();
    this.__direction = new THREE.Vector3( 0, 0, - 1 );

    // activate
    // we really just need the key events and the pointerdown and pointermove events
    this.addEventListeners(domElement);
  }

  get movementSpeed() {
    return this.acceleration / this.movementSpeedMultiplier;
  }

  set movementSpeed(value) {
    // TODO: check this
    this.acceleration = value * this.movementSpeedMultiplier;
  }

  handleMouseMove( event ) {
    if ( this.isActive === false ) return;
    const movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
    const movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;

    const euler = this.__euler;
    euler.setFromQuaternion( this.camera.quaternion );
    euler.y -= movementX * 0.002;
    euler.x -= movementY * 0.002;
    euler.x = Math.max( PI_2 - this.maxPolarAngle, Math.min( PI_2 - this.minPolarAngle, euler.x ) );

    this.camera.quaternion.setFromEuler( this.__euler );
    this.dispatchEvent( {type: 'change'} );
    return true;
  }

  connect() {
    this.addActivePointerEventListeners(this.domElement.ownerDocument);
  }

  disconnect() {
    this.removeActivePointerEventListeners(this.domElement.ownerDocument);
  }

  getDirection(v) {
    return v.copy( this.__direction ).applyQuaternion( this.camera.quaternion );
  }

  moveForward(distance) {
    // move forward parallel to the xz-plane
    // assumes camera.up is y-up
    this.__vec.setFromMatrixColumn(this.camera.matrix, 0 );
    this.__vec.crossVectors(this.camera.up, this.__vec );
    this.camera.position.addScaledVector( this.__vec, distance );
  }

  moveRight(distance) {
    this.__vec.setFromMatrixColumn(this.camera.matrix, 0 );
    this.camera.position.addScaledVector( this.__vec, distance );
  }

  update(delta) {
    if (this.enabled) {
      // apply deceleration due to friction
      this.velocity.x -= this.velocity.x * this.friction * delta;
      this.velocity.z -= this.velocity.z * this.friction * delta;

      // get acceleration direction from actions
      const active = this.__activeActions;
      this.direction.z = Number(active.moveForward) - Number(active.moveBackward);
      this.direction.x = Number(active.moveRight) - Number(active.moveLeft);
      this.direction.normalize(); // this ensures consistent movements in all directions

      // apply acceleration
      if (active.moveForward || active.moveBackward) {
        this.velocity.z -= this.direction.z * this.acceleration * delta;
      }
      if (active.moveLeft || active.moveRight) {
        this.velocity.x -= this.direction.x * this.acceleration * delta;
      }

      // apply movement
      this.moveRight(-this.velocity.x * delta);
      this.moveForward(-this.velocity.z * delta);
    }
  }
}

DragLookPointerControls.STATE = STATE;

module.exports = DragLookPointerControls;