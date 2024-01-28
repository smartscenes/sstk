var OBB = require('geo/OBB');

function SemanticOBB(position, halfSizes, basis, label, symmetryType) {
  OBB.call(this, position, halfSizes, basis);
  this.label = label;
  this.symmetryType = symmetryType;
  this.__frontIndex = undefined; // -1, 0, 1, 2, 3, 4, 5, 6
  this.__frontVector = new THREE.Vector3(); // Cached front vector
  this.__upIndex = undefined; // -1, 0, 1, 2, 3, 4, 5, 6
  this.__upVector = new THREE.Vector3(); // Cached up vector
}

SemanticOBB.prototype = Object.create(OBB.prototype);
SemanticOBB.prototype.constructor = SemanticOBB;

Object.defineProperty(SemanticOBB.prototype, 'orientation', {
  get: function () {
    var front = this.front;
    var up = this.up;
    return (front != null || up != null)? [front, up]:null;
  }
});

Object.defineProperty(SemanticOBB.prototype, 'hasFront', {
  get: function () {
    return (this.__frontIndex != null);
  }
});

Object.defineProperty(SemanticOBB.prototype, 'isFrontNull', {
  get: function () {
    return (this.__frontIndex === null);
  },
  set: function(v) {
    if (v) {
      if (this.__frontIndex != null) {
        this.__prevFrontIndex = this.__frontIndex;
      }
      this.__frontIndex = null;
    } else if (this.__frontIndex === null) {
      this.__frontIndex = this.__prevFrontIndex;
    }
  }
});

Object.defineProperty(SemanticOBB.prototype, 'front', {
  get: function () {
    return (this.__frontIndex != null)? this.__frontVector : null;
  },
  set: function (v) {
    this.__updateDirVec(v, '__frontIndex', '__frontVector');
  }
});

Object.defineProperty(SemanticOBB.prototype, 'frontIndex', {
  get: function () {
    return this.__frontIndex;
  },
  set: function(i) {
    this.__frontIndex = i;
    if (i >= 0) {
      this.getBasisVector(i, this.__frontVector);
    }
  }
});

Object.defineProperty(SemanticOBB.prototype, 'hasUp', {
  get: function () {
    return (this.__upIndex != null);
  }
});

Object.defineProperty(SemanticOBB.prototype, 'isUpNull', {
  get: function () {
    return (this.__upIndex === null);
  },
  set: function(v) {
    if (v) {
      if (this.__upIndex != null) {
        this.__prevUpIndex = this.__upIndex;
      }
      this.__upIndex = null;
    } else if (this.__upIndex === null) {
      this.__upIndex = this.__prevUpIndex;
    }
  }
});

Object.defineProperty(SemanticOBB.prototype, 'up', {
  get: function () {
    return (this.__upIndex != null)? this.__upVector : null;
  },
  set: function (v) {
    this.__updateDirVec(v, '__upIndex', '__upVector');
  }
});

Object.defineProperty(SemanticOBB.prototype, 'upIndex', {
  get: function () {
    return this.__upIndex;
  },
  set: function(i) {
    this.__upIndex = i;
    if (i >= 0) {
      this.getBasisVector(i, this.__upVector);
    }
  }
});

SemanticOBB.prototype.__updateDirVec = function(v, indexField, vecField) {
  if (v == null) {
    this[indexField] = null;
    return;
  } else if (Array.isArray(v)) {
    v = new THREE.Vector3(v[0], v[1], v[2]);
  }
  var a = new THREE.Vector3();
  var found = false;
  for (var i = 0; i < 3; i++) {
    this.getBasisVector(i, a);
    var match = a.dot(v);
    if (Math.abs(match) >= 0.95) {
      // Snap front
      this[indexField] = (match > 0)? i : i+3;
      this.getBasisVector(this[indexField], this[vecField]);
      found = true;
      break;
    }
  }
  if (!found) {
    this[indexField] = -1;
    this[vecField].copy(v);
  }
  //console.log('got dirvec', indexField, vecField, this[indexField], this[vecField]);
};

SemanticOBB.prototype.__updateDir = function(v, setIndexField, setVecField) {
  if (typeof(v) === 'number') {
    this[setIndexField] = v;
  } else {
    this[setVecField] = v;
  }
};

SemanticOBB.prototype.copy = function(obb) {
  OBB.prototype.copy.call(this, obb);
  this.label = obb.label;
  this.symmetryType = obb.symmetryType;
  this.__frontIndex = obb.__frontIndex;
  this.__frontVector.copy(obb.__frontVector);
  return this;
};

SemanticOBB.prototype.ensureUpFront = function(defaultUp, defaultFront, keepNull) {
  this.ensureUp(defaultUp, keepNull);
  this.ensureFront(defaultFront, keepNull);
};

SemanticOBB.prototype.ensureFront = function(defaultFront, keepNull) {
  if (!this.hasFront) {
    if (!keepNull || !this.isFrontNull) {
      this.__updateDir(defaultFront || 0, 'frontIndex', 'front');
    }
  }
};

SemanticOBB.prototype.ensureUp = function(defaultUp, keepNull) {
  if (!this.hasUp) {
    if (!keepNull || !this.isUpNull) {
      this.__updateDir(defaultUp || 0, 'upIndex', 'up');
    }
  }
};

SemanticOBB.prototype.toggleFront = function(inc) {
  if (this.frontIndex >= 0) {
    this.frontIndex = (this.frontIndex + inc) % 6;
  } else {
    this.frontIndex = 0;
  }
};

SemanticOBB.prototype.toggleUp = function(inc) {
  if (this.upIndex >= 0) {
    this.upIndex = (this.upIndex + inc) % 6;
  } else {
    this.upIndex = 0;
  }
};

SemanticOBB.prototype.__updateVectorsByRotationMatrix = function(rotMat) {
  OBB.prototype.__updateVectorsByRotationMatrix.call(this, rotMat);
  this.__upVector.applyMatrix4(rotMat);
  this.__frontVector.applyMatrix4(rotMat);
};

SemanticOBB.prototype.toJSON = function () {
  var json = OBB.prototype.toJSON.call(this);
  json.label = this.label;
  json.symmetryType = this.symmetryType;
  if (this.hasFront) {
    json.front = this.front.toArray();
  }
  if (this.hasUp) {
    json.up = this.up.toArray();
  }
  return json;
};

SemanticOBB.prototype.fromJSON = function(json) {
  OBB.prototype.fromJSON.call(this, json);
  this.label = json.label;
  this.symmetryType = json.symmetryType;
  this.front = json.front;
  this.up = json.up;
  return this;
};

SemanticOBB.fromJSON = function(json) {
  var obb = new SemanticOBB();
  obb.fromJSON(json);
  return obb;
};

SemanticOBB.asSemanticOBB = function(obb) {
  if (obb instanceof SemanticOBB) {
    return obb;
  } else if (obb instanceof OBB) {
    var sobb = new SemanticOBB(obb.position, obb.halfSizes, obb.basis);
    sobb.metadata = obb.metadata;
    return sobb;
  } else {
    return SemanticOBB.fromJSON(obb);
  }
};

module.exports = SemanticOBB;
