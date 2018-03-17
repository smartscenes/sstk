var Constants = require('Constants');
var Object3DUtil = require('geo/Object3DUtil');
var Materials = require('materials/Materials');
var MeshHelpers = require('geo/MeshHelpers');
var _sensors = require('sim/sensors');
var _ = require('util');

/**
 * Generic simulator agent which translates actions into changes on state.
 * Basic agent is modeled as a cylinder with a hemisphere on top.
 * @param opts
 * @param [opts.eyeHeight=1.09] {float} Eye height (m) of agent (where the cylinder meets the hemisphere)
 * @param [opts.radius=0.25] {float} Radius (m) of agent (both cylinder and hemisphere radius)
 * @param [opts.mass=32] {float} Mass of agent (in kg)
 * @param [opts.stepAcceleration=20] {float} Acceleration when moving (m/s^2)
 * @param [opts.turnAcceleration=4pi] {float} Acceleration when turning (rad/s^2)
 * @param [opts.maxSpeed=2] {float} Maximum speed (m/s)
 * @param [opts.maxAngularSpeed=4pi] {float} Maximum angular speed (rad/s)
 * @param [opts.linearFriction=0.5] {float} coefficient of friction applied every step (k in F=-k*m*v/dt)
 * @param [opts.angularFriction=1] {float}
 * @param [opts.coeffRestitution=0] {float} ratio of relative velocity before and after collision in direction of collision normal
 * @constructor
 * @memberOf sim
 */
function Agent(opts) {
  // set basic parameters
  opts = opts || {};
  var p = opts.agent;
  p = p || {};
  this.eyeHeight = p.eyeHeight || 1.09;  // m height eye level
  this.originHeight = this.eyeHeight / 2;  // m height of agent reference frame origin
  this.radius = p.radius || 0.1;  // 10cm radius cylinder
  this.radialClearance = p.radialClearance || 0.2;  // Clearance for radisu
  this.height = p.height || (this.eyeHeight + this.radius);  // I'm very tall!
  this.mass = p.mass || 32;  // kg weight
  this.stepAcceleration = p.stepAcceleration || 20;  // m/s^2
  this.turnAcceleration = p.turnAcceleration || 4 * Math.PI;  // rad/s^2
  this.maxSpeed = p.maxSpeed || 2;  // m/s
  this.maxAngularSpeed = p.maxAngularSpeed || 4 * Math.PI;  // rad/s
  this.linearFriction = p.linearFriction || 0.5;  // coefficient of friction applied every step (k in F=-k*m*v/dt)
  this.angularFriction = p.angularFriction || 1;
  this.coeffRestitution = p.coeffRestitution || 0;  // ratio of relative velocity before and after collision in direction of collision normal
  this.angularResolution = p.angularResolution || undefined;  // agent heading angle modulated by this angular resolution
  this.upAxis = p.upAxis || new THREE.Vector3(0, 1, 0);
  this.debug = !!p.debug;  // coerce true/false
  this.cameraSensor = p.cameraSensor || 'color'; // Main camera sensor

  // velocity and force accumulators
  this.velocity = new THREE.Vector3();  // linear velocity
  this.angularVelocity = 0;             // angular velocity
  this.force = new THREE.Vector3();     // accumulator for linear forces
  this.torque = 0;                      // accumulator for angular forces

  // representative objects
  this.__object3D = new THREE.Object3D();       // stores position
  this.__pitchObject3D = new THREE.Object3D();  // stores azimuth and pitch angles
  this.__object3D.add(this.__pitchObject3D);

  // working space variables
  this.__PI_2 = Math.PI / 2;
  this.__massInv = 1 / this.mass;
  this.__stepForce = this.mass * this.stepAcceleration;
  this.__turnForce = this.mass * this.turnAcceleration;
  this.__tempVec = new THREE.Vector3();

  // Initialize sensors
  this.initSensors(opts);

  // Create basic body for an agent (visible in debug mode)
  this.__object3D.add(this.__createBody());

  this.__actions = {
    'idle': this.idle.bind(this),
    'moveTo': this.moveTo.bind(this)
  };
  this.__bag = []; // Bag of my stuff!
}

Object.defineProperty(Agent.prototype, 'position', {
  get: function () { return this.__object3D.position; },
  set: function (p) { this.__object3D.position.copy(p); }
});

Object.defineProperty(Agent.prototype, 'rotation', {
  get: function () { return this.__object3D.rotation.y; },
  set: function (t) {
    if (this.angularResolution !== undefined) {
      t = Math.round(t / this.angularResolution) * this.angularResolution;
    }
    this.__object3D.rotation.y = t;
  }
});

// Directions for the agent
Agent.DIRS = {
  'left': new THREE.Vector3(-1,0,0),
  'right': new THREE.Vector3(1,0,0),
  'down': new THREE.Vector3(0,-1,0),
  'up': new THREE.Vector3(0,1,0),
  'forward': new THREE.Vector3(0,0,-1),
  'back': new THREE.Vector3(0,0,1)
};

Agent.prototype.__createBody = function() {
  var body = new THREE.Group();
  body.name = 'body';
  body.visible = this.debug;
  var r = this.radius * Constants.metersToVirtualUnit;
  var h = (this.eyeHeight - 0.01) * Constants.metersToVirtualUnit;
  var cylinder = new THREE.CylinderGeometry(r, r, h, 20, 4);
  var cylinderMesh = new THREE.Mesh(cylinder, Materials.getSimpleFalseColorMaterial(0, 'blue'));
  body.add(cylinderMesh);
  var hsphere = new THREE.SphereGeometry(r, 8, 8, 0, 2 * Math.PI, 0, Math.PI / 2 - 0.1);
  var hsphereMesh = new THREE.Mesh(hsphere, Materials.getSimpleFalseColorMaterial(1, 'gray'));
  hsphereMesh.position.y = this.eyeHeight - this.originHeight;
  body.add(hsphereMesh);

  var arrow = function(pos, dir, color) {
    return new MeshHelpers.FatArrow(dir, pos, 0.05, 0.03, undefined, undefined, color);
  };
  _.forOwn(this.sensors.camera, function (c) {
    // var w = widget.clone();
    // w.position.copy(c.position);
    // body.add(w);
  });
  _.forOwn(this.sensors.force, function (s) {
    for (var i = 0; i < s.position.length; i++) {
      var a = arrow(s.position[i], s.orientation[i], 'red');
      body.add(a);
    }
  });
  _.forOwn(this.sensors.audio, function (s) {
    for (var i = 0; i < s.position.length; i++) {
      var a = arrow(s.position[i], s.orientation[i], 'green');
      body.add(a);
    }
  });

  return body;
};

Agent.prototype.getObject = function () {
  return this.__object3D;
};

Agent.prototype.getCamera = function (name) {
  var camSensor = this.getCameraSensor(name);
  return camSensor? camSensor.camera : null;
};

Agent.prototype.getCameraSensor = function (name) {
  return name ? this.sensors.camera[name] : this.sensors.camera[this.cameraSensor];
};

Agent.prototype.resizeCameraSensors = function(width, height, secondaryWidth, secondaryHeight) {
  secondaryWidth = secondaryWidth || width;
  secondaryHeight = secondaryHeight || height;
  _.each(this.sensors.camera, function(sensor, name) {
    // Only resize the ones that are resizable
    if (sensor.config.resize) {
      if (sensor.config.renderer === 'main') {
        sensor.setSize(width, height);
      } else {
        sensor.setSize(secondaryWidth, secondaryHeight);
      }
    }
  });
};

Agent.prototype.getState = function (state) {
  state = state || {};
  state.position = this.position;
  state.orientation = this.getOrientation ? this.getOrientation() : null;
  return state;
};

Agent.prototype.act = function (action) {
  var actFn = this.__actions[action.name];
  if (actFn) {
    actFn(action);
  } else {
    console.log('Unknown action ' + action.name);
  }
};

Agent.prototype.getAgentFeetAt = function(p, out) {
  out = out || new THREE.Vector3();
  out.copy(p || this.position);
  out.y -= this.originHeight*Constants.metersToVirtualUnit;
  return out;
};

Agent.prototype.localToWorldPosition = function(position, out) {
  out = out || new THREE.Vector3();
  this.__object3D.updateMatrixWorld();
  out.copy(position).applyMatrix4(this.__object3D.matrixWorld);
  return out;
};

Agent.prototype.localToWorldDirection = function(direction, out) {
  out = out || new THREE.Vector3();
  // Assumes agent is already in world coordinate!
  // Use getWorldQuaternion (if our agent no longer in world space)
  out.copy(direction);
  out.applyQuaternion(this.__object3D.quaternion);
  return out;
};

Agent.prototype.worldToLocalPositionNoScaling = function(position, out) {
  // Assumes agent is already in world coordinate!
  // Use getWorldQuaternion and getWorldPosition (if our agent no longer in world space)
  out = out || new THREE.Vector3();
  out.copy(position).sub(this.__object3D.position);
  out.applyQuaternion(this.__object3D.quaternion.clone().inverse());
  return out;
};

Agent.prototype.moveTo = function (opts) {
  if (opts.position != undefined) {
    this.position.copy(Object3DUtil.toVector3(opts.position));
  }
  if (opts.angle != undefined) {
    this.rotation = opts.angle;
  }
  if (opts.tilt != undefined) {
    this.__pitchObject3D.rotation.x = opts.tilt;
    this.__pitchObject3D.rotation.x = Math.max(-this.__PI_2, Math.min(this.__PI_2, this.__pitchObject3D.rotation.x));
  }
  if (!opts.isTemporary) {
    this.velocity.set(0, 0, 0);
    this.angularVelocity = 0;
    this.force.set(0, 0, 0);
    this.torque = 0;
  }
};

Agent.prototype.pickUp = function () {
  // Object magically disappears from scene and enters our fabulous bag!
};

Agent.prototype.putDown = function (obj) {
  // Object magically enters into scene
  var i = this.__bag.indexOf(obj);
  if (i >= 0) {
    this.__bag.splice(i, 1);
  }
  console.log('Bag', this.__bag);
};

// Store object in our bag!
Agent.prototype.store = function (obj) {
  var i = this.__bag.indexOf(obj);
  if (i < 0) {
    this.__bag.push(obj);
  }
  console.log('Bag', this.__bag);
};

// Check out bag for objects matching filterFn
Agent.prototype.checkBag = function (filterFn) {
  return this.__bag.filter(filterFn);
};

Agent.prototype.idle = function () {
  return true;
};

// Update state of agent after time passage given in seconds
Agent.prototype.update = function (dt) {
  this.__advanceTime(dt);
};

// Initialize agent sensor configuration given relevant parameters p
Agent.prototype.initSensors = function(opts) {
  this.sensors = { force: {}, audio: {}, camera: {} };  // Sensors by type
  this.__forceSensors = [];  // force sensor objects in guaranteed order
  this.__forcesEncoding = [];  // will become a comma-separated encodings string
  this.__forcesBuffer = null;  // force sensor values
  var forcesLength = 0;  // total length of force values

  var sensors = opts.sensors;
  if (sensors) {
    for (var i = 0; i < sensors.length; i++) {
      var sensor = sensors[i];
      if (!sensor.active) {
        continue;
      }
      this.__parsePosition(sensor);

      if (sensor.type === 'audio') {
        this.sensors.audio[sensor.name] = sensor;
      } else if (sensor.type === 'force') {
        sensor.force = new Float32Array(sensor.position.length);
        if (sensor.encoding.includes('raw')) {  // raw force stored at each sensor
          forcesLength += sensor.position.length;
        } else if (sensor.encoding.includes('sum') || sensor.encoding.includes('mean')) {  // sum or mean of all force sensors
          forcesLength += 1;
        } else {
          console.error('Unrecognized force sensor encoding: ' + sensor.encoding);
        }
        this.__forcesEncoding.push(sensor.encoding);
        this.sensors.force[sensor.name] = sensor;
        this.__forceSensors.push(sensor);
      } else {
        // Assume some kind of camera sensor
        if (this.debug) {
          sensor.position[0].z += 2;  // offset rgb camera for external view
        }
        var camsensor = _sensors.getSensor(sensor, opts);
        if (camsensor) {
          var minisensors = camsensor.getSensors();
          //console.log('minisensors', minisensors);
          for (var j = 0; j < minisensors.length; j++) {
            var minisensor = minisensors[j];
            this.__pitchObject3D.add(minisensor.camera);
            this.sensors.camera[minisensor.name] = minisensor;
          }
        } else {
          console.log('Ignoring unsupported sensor');
        }
      }
    }
  }

  // Concatenated force sensors array and encodings string
  this.__forcesBuffer = new Float32Array(forcesLength);
  this.__forcesEncoding = this.__forcesEncoding.join(',');
};

// Return sensors matching sensor type
Agent.prototype.getSensors = function(sensorType) {
  if (sensorType === 'color' || sensorType === 'depth') {
    return _.filter(this.sensors.camera, function(v) { return v.config.type === sensorType; });
  } else if (sensorType === 'force') {
    return this.__forceSensors;
  } else {
    return this.sensors[sensorType];
  }
};

// Returns external forces acting on the Agent
Agent.prototype.getExternalForces = function () {
  var scope = this;
  var forceSensors = this.getSensors('force');
  var fi = 0;
  for (var i = 0; i < forceSensors.length; i++) {
    var sensor = forceSensors[i];
    var forces = sensor.force;
    if (sensor.encoding.includes('raw')) {  // raw force stored at each sensor
      scope.__forcesBuffer.set(forces, fi);
      fi += forces.length;
    } else if (sensor.encoding.includes('sum')) {  // sum of all force sensors
      scope.__forcesBuffer[fi] = _.sum(forces);
      fi += 1;
    } else if (sensor.encoding.includes('mean')) {  // sum of all force sensors
      scope.__forcesBuffer[fi] = _.sum(forces) / forces.length;
      fi += 1;
    } else {
      console.error('Unrecognized force sensor encoding: ' + sensor.encoding);
    }
  }
  return {
    type: 'force',
    data: this.__forcesBuffer,
    encoding: this.__forcesEncoding,
    shape: [this.__forcesBuffer.length, 1]
  };
};

Agent.prototype.setPredictedVs = function(dt) {
  // drag and friction
  this.__tempVec.copy(this.velocity).multiplyScalar(- this.linearFriction * this.mass / dt);
  this.__applyWrenchW(this.__tempVec, - this.angularFriction * this.mass * this.angularVelocity / dt);

  // update velocities
  this.velocity.addScaledVector(this.force, dt * this.__massInv);
  this.angularVelocity += dt * this.__massInv * this.torque;
  this.velocity.y = 0;  // ignore vertical component
  this.velocity.clampLength(0, this.maxSpeed);
  THREE.Math.clamp(this.angularVelocity, -this.maxAngularSpeed, this.maxAngularSpeed);

  // clear force and torque
  this.force.set(0, 0, 0);
  this.torque = 0;
};

Agent.prototype.getOrientation = (function () {
  // assumes the camera itself is not rotated
  var direction = new THREE.Vector3(0, 0, -1);
  var rotation = new THREE.Euler(0, 0, 0, 'YXZ');

  return function (v) {
    v = v || new THREE.Vector3();
    rotation.set(this.__pitchObject3D.rotation.x, this.__object3D.rotation.y, 0);
    v.copy(direction).applyEuler(rotation);
    return v;
  };
}());

Agent.prototype.toJSON = function() {
  return {
    position: this.position,
    velocity: this.velocity,
    rotation: this.rotation,
    angularVelocity: this.angularVelocity,
    force: this.force,
    torque: this.torque
  };
};


Agent.prototype.__applyContactForceW = function(pW, fW) {
  this.force.add(fW);
  this.torque += (pW.x - this.position.x) * fW.z - (pW.z - this.position.z) * fW.x;
};

Agent.prototype.__applyWrenchW = function(fW, tau) {
  this.force.add(fW);
  this.torque += tau;
};

// Advance state integrating accumulated force+torque with symplectic euler
Agent.prototype.__advanceTime = function(dt) {
  // update position and orientation
  this.velocity.y = 0;  // Ignore vertical velocity component
  this.position.addScaledVector(this.velocity, dt * Constants.metersToVirtualUnit);
  this.rotation += this.angularVelocity * dt;
  // console.log(JSON.stringify(this));
};

Agent.prototype.__headingVector = function() {
  this.getOrientation(this.__tempVec);
  this.__tempVec.y = 0;  // Remove vertical displacements
  return this.__tempVec;
};

// helper for parsing sensor configuration blob position types
Agent.prototype.__parsePosition = function(sensor) {
  var ps = [];
  var ds = [];
  if (sensor.configuration === 'positional') {
    // coordinates already in euler
    _.forEach(sensor.position, function (p) {
      ps.push(new THREE.Vector3(p[0], p[1], p[2]));
    });
    _.forEach(sensor.orientation, function (d) {
      ds.push(new THREE.Vector3(d[0], d[1], d[2]));
    });
  } else if (sensor.configuration === 'radial') {
    // convert from cylindrical to eulerian
    _.forEach(sensor.position, function (p) {
      var r = p[0];
      var t = p[2];
      ps.push(new THREE.Vector3(r * Math.sin(t), p[1], r * Math.cos(t)));
    });
    _.forEach(sensor.orientation, function (d) {
      ds.push(new THREE.Vector3(d[0], d[1], d[2]));
    });
  } else if (sensor.configuration === 'radial-group') {
    var r = sensor.radial[0];   // radius
    var k = sensor.radial[1];   // number of radial group points
    var t0 = sensor.radial[2];  // start theta
    var t1 = sensor.radial[3];  // end theta
    var tStep = (t1 - t0) / k;
    for (var gi = 0; gi < sensor.position.length; gi++) {
      var o = sensor.position[gi];     // gives origin of group
      var d = sensor.orientation[gi];  // gives [dr, dy, dt] cylindrical coord orientation
      for (var i = 0; i < k; i++) {
        var t = t0 + (tStep * i);
        var p = new THREE.Vector3(r * Math.sin(t) + o[0], 0 + o[1], r * Math.cos(t) + o[2]);
        var pDir = new THREE.Vector3(d[0], d[1], d[2]);
        pDir.applyAxisAngle(this.upAxis, t);
        ps.push(p);
        ds.push(pDir);
      }
    }
  } else {
    console.error('Unrecognized sensor position configuration type: ' + sensor.configuration);
  }

  sensor.position = ps;
  sensor.orientation = ds;
};

module.exports = Agent;
