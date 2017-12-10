'use strict';

define(['three-controls'], function (Character) {

  function Character(params) {
    this.init(params);
  }

  // Class constructor
  Character.prototype.init = function (params) {
    // Set the different geometries composing the humanoid
    var head = new THREE.SphereGeometry(32, 8, 8),
        hand = new THREE.SphereGeometry(8, 4, 4),
        foot = new THREE.SphereGeometry(16, 4, 4, 0, Math.PI * 2, 0, Math.PI / 2),
        nose = new THREE.SphereGeometry(4, 4, 4),
    // Set the material, the "skin"
        material = new THREE.MeshLambertMaterial(params.material);
    // Set the character modelisation object
    this.mesh = new THREE.Object3D();
    this.mesh.position.z = 48;
    // Set and add its head
    this.head = new THREE.Mesh(head, material);
    this.head.position.z = 0;
    this.mesh.add(this.head);
    // Set and add its hands
    this.hands = {
      left: new THREE.Mesh(hand, material),
      right: new THREE.Mesh(hand, material)
    };
    this.hands.left.position.x = -40;
    this.hands.left.position.z = -8;
    this.hands.right.position.x = 40;
    this.hands.right.position.z = -8;
    this.mesh.add(this.hands.left);
    this.mesh.add(this.hands.right);
    // Set and add its feet
    this.feet = {
      left: new THREE.Mesh(foot, material),
      right: new THREE.Mesh(foot, material)
    };
    this.feet.left.position.x = -20;
    this.feet.left.position.z = -48;
    this.feet.left.rotation.z = Math.PI / 4;
    this.feet.right.position.x = 20;
    this.feet.right.position.z = -48;
    this.feet.right.rotation.z = Math.PI / 4;
    this.mesh.add(this.feet.left);
    this.mesh.add(this.feet.right);
    // Set and add its nose
    this.nose = new THREE.Mesh(nose, material);
    this.nose.position.z = 0;
    this.nose.position.y = 32;
    this.mesh.add(this.nose);
    // Set the vector of the current motion
    this.direction = new THREE.Vector3(0, 0, 0);
    // Set the current animation step
    this.step = 0;
  };
  // Update the direction of the current motion
  Character.prototype.setDirection = function (controls) {
    // Either left or right, and either up or down (no jump or dive (on the Z axis), so far ...)
    var x = controls.left ? 1 : controls.right ? -1 : 0,
        y = controls.up ? 1 : controls.down ? -1 : 0,
        z = 0;
    this.direction.set(x, y, z);
  };

  // Process the character motions
  Character.prototype.motion = function () {
    // (if any)
    if (this.direction.x !== 0 || this.direction.y !== 0) {
      // Rotate the character
      this.rotate();
      // And, only if we're not colliding with an obstacle or a wall ...
      if (this.collide()) {
        return false;
      }
      // ... we move the character
      this.move();
      return true;
    }
  };
  // Rotate the character
  Character.prototype.rotate = function () {
    // Set the direction's angle, and the difference between it and our Object3D's current rotation
    var angle = Math.atan2(this.direction.x, this.direction.y),
        difference = angle - this.mesh.rotation.z;
    // If we're doing more than a 180°
    if (Math.abs(difference) > Math.PI) {
      // We proceed to a direct 360° rotation in the opposite way
      if (difference > 0) {
        this.mesh.rotation.z += 2 * Math.PI;
      } else {
        this.mesh.rotation.z -= 2 * Math.PI;
      }
      // And we set a new smarter (because shorter) difference
      difference = angle - this.mesh.rotation.y;
      // In short : we make sure not to turn "left" to go "right"
    }
    // Now if we haven't reached our target angle
    if (difference !== 0) {
      // We slightly get closer to it
      this.mesh.rotation.z += difference / 4;
    }
  };
  Character.prototype.move = function () {
    // We update our Object3D's position from our "direction"
    this.mesh.position.x += this.direction.x * ((this.direction.y === 0) ? 4 : Math.sqrt(8));
    this.mesh.position.y += this.direction.y * ((this.direction.x === 0) ? 4 : Math.sqrt(8));
    // Now let's use Sine and Cosine curves, using our "step" property ...
    this.step += 1 / 4;
    // ... to slightly move our feet and hands
    this.feet.left.position.setZ(Math.sin(this.step) * 16);
    this.feet.right.position.setZ(Math.cos(this.step + (Math.PI / 2)) * 16);
    this.hands.left.position.setZ(Math.cos(this.step + (Math.PI / 2)) * 8);
    this.hands.right.position.setZ(Math.sin(this.step) * 8);
  };
  Character.prototype.collide = function () {
    // INSERT SOME MAGIC HERE
    return false;
  };

  // Exports
  return Character;
});
