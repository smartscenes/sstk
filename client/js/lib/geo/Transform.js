// Utility functions for applying 3D transform

function Transform(transformMatrix) {
  this.__matrix4 = transformMatrix;
  this.__normalMatrixWorld = new THREE.Matrix3();
  this.__normalMatrixWorld.getNormalMatrix(this.__matrix4);
}

// NOTE: mutates p
Transform.prototype.convertPoint = function(p) {
  return p.applyMatrix4(this.__matrix4);
};

// NOTE: mutates dir
Transform.prototype.convertDir = function(dir) {
  dir.applyMatrix3(this.__normalMatrixWorld);
  dir.normalize();
  return dir;
};

// NOTE: mutates p (assumes p contains a position and a direction)
Transform.prototype.convertPosition = function(p) {
  if (p.position) {
    p.position = this.convertPoint(p.position);
  }
  if (p.direction) {
    p.direction = this.convertDir(p.direction);
  }
  return p;
};

module.exports = Transform;