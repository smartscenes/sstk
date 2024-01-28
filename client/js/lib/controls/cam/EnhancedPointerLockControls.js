// Extension of pointer lock with velocity, direction (like in example)

class EnhancedPointerLockControls extends THREE.PointerLockControls {

  constructor(camera, domElement) {
    super(camera, domElement);
    this.__enabled = true;
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
  }

  get enabled() {
    return this.__enabled;
  }

  set enabled(flag) {
    this.__enabled = flag;
    if (flag) {
      this.lock();
    } else {
      this.unlock();
    }
  }

  get movementSpeed() {
    return this.acceleration / this.movementSpeedMultiplier;
  }

  set movementSpeed(value) {
    // TODO: check this
    this.acceleration = value * this.movementSpeedMultiplier;
  }

  bindEvents(container) {
    const scope = this;
    const onKeyDown = function ( event ) {
      if (!scope.enabled) { return; }
      const action = scope.__keymappings[event.code];
      if (action) {
        scope.__activeActions[action] = true;
      }
    };

    const onKeyUp = function ( event ) {
      const action = scope.__keymappings[event.code];
      if (action) {
        scope.__activeActions[action] = false;
      }
    };

    container.addEventListener( 'keydown', onKeyDown );
    container.addEventListener( 'keyup', onKeyUp );
  }

  update(delta) {
    if (this.isLocked === true) {
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

module.exports = EnhancedPointerLockControls;
