var CollisionProcessorNull = require('sim/CollisionProcessorNull');
var Constants = require('Constants');
var Object3DUtil = require('geo/Object3DUtil');
var Octree = require('three-octree');
var BVH = require('geo/BVH');
var RaycasterUtil = require('geo/RaycasterUtil');
var _ = require('util');

/**
 * Collision processor using raycasting to determine collisions
 * @constructor
 * @extends CollisionProcessorNull
 * @memberOf sim
 * @param opts Configuration parameters for collision processing
 * @param [opts.useBVH=true] {boolean} Whether to use BVH acceleration for raycast mode
 * @param [opts.useOctree=false] {boolean} Whether to use Octree acceleration for raycast mode
 **/
function CollisionProcessorRaycast(opts) {
  CollisionProcessorNull.call(this, opts);
  opts = _.defaultsDeep(Object.create(null), opts, {
    useBVH: true,
    useMeshBVH: false, // Very slow (does this even help? Also takes a while to build the BVH)
    useOctree: false
  });
  this.__useBVH = opts.useBVH;
  this.__useMeshBVH = opts.useMeshBVH;
  this.__useOctree = opts.useOctree;
  this.__rightAxis = new THREE.Vector3(0, 0, 0);
  this.__vn = new THREE.Vector3(0, 0, 0);
  this.__fn = new THREE.Vector3(0, 0, 0);
  this.__raycaster = new THREE.Raycaster();
}
CollisionProcessorRaycast.prototype = Object.create(CollisionProcessorNull.prototype);
CollisionProcessorRaycast.prototype.constructor = CollisionProcessorRaycast;

CollisionProcessorRaycast.prototype.__prepareScene = function(sceneState) {
  // Make sure we have necessary acceleration structure for scene
  if (this.__useBVH) {
    // Make sure we have an bvh
    if (!sceneState.bvh) {
      var timingMsg = 'buildBVH.scene';
      console.time(timingMsg);
      var objects = sceneState.getObject3Ds();
      var meshes = [];
      for (var i = 0; i < objects.length; i++) {
        meshes.push.apply(meshes, _.filter(Object3DUtil.getVisibleMeshList(objects[i])));
      }
      sceneState.bvh = new BVH(meshes, {splitStrategy: BVH.SplitStrategy.SURFACE_AREA_HEURISTIC});
      console.timeEnd(timingMsg);
    }
  } else if (this.__useOctree) {
    // Make sure we have an octree
    if (!sceneState.octree) {
      console.time('buildOctree');
      sceneState.octree = new THREE.Octree({});
      var objects = sceneState.getObject3Ds();
      for (var i = 0; i < objects.length; i++) {
        if (objects[i].visible !== false) {
          var meshes = Object3DUtil.getVisibleMeshList(objects[i]);
          for (var j = 0; j < meshes.length; j++) {
            if (meshes[j].visible !== false) {  // TODO: what if a higher level node is not visible
              sceneState.octree.add(meshes[j], {useFaces: false, undeferred: true});
            }
          }
        }
      }
      sceneState.octree.update();
      console.timeEnd('buildOctree');
    }
  }
};

CollisionProcessorRaycast.prototype.__intersectObjects = function(raycaster, objects) {
  var recursive = true;
  if (!Array.isArray(objects)) {
    objects = [objects];
  }
  return raycaster.intersectObjects(objects, recursive);
};

CollisionProcessorRaycast.prototype.__intersectObjectOctree = function(raycaster) {
  var threshold = 0.2*Constants.metersToVirtualUnit;
  return function(object, recursive) {
    // Uses a octree to intersect an object
    if (object.visible !== false) {
      if (!object.octree) {
        var bbox = Object3DUtil.getBoundingBox(object);
        if (bbox.maxDim() > threshold) {
          //console.time('buildOctree');
          object.octree = new THREE.Octree({});
          var meshes = Object3DUtil.getVisibleMeshList(object);
          for (var j = 0; j < meshes.length; j++) {
            if (meshes[j].visible !== false) {
              object.octree.add(meshes[j], {useFaces: true, undeferred: true});
            }
          }
          object.octree.update();
          //console.timeEnd('buildOctree');
        }
      }
      if (object.octree) {
        var octreeObjects = object.octree.search(raycaster.ray.origin, raycaster.ray.far, true, raycaster.ray.direction);
        return raycaster.intersectOctreeObjects(octreeObjects, recursive);
      } else {
        return raycaster.intersectObject(object, recursive);
      }
    }
  };
};

CollisionProcessorRaycast.prototype.__intersectObjectBVH = function(raycaster) {
  var inverseMatrix = new THREE.Matrix4();
  var sphere = new THREE.Sphere();
  var ray = new THREE.Ray();
  function descSort(a, b) {
    return a.distance - b.distance;
  }
  return function(object, recursive) {
    // Uses a triangle based bvh to intersect an object
    var intersected = [];
    if (object.visible !== false) {
      // TODO: Respect recursive flag!
      var meshes = Object3DUtil.getVisibleMeshList(object);
      for (var i = 0; i < meshes.length; i++) {
        var mesh = meshes[i];
        if (mesh.visible !== false) {
          // Checking boundingSphere distance to ray
          if (mesh.geometry.boundingSphere === null ) mesh.geometry.computeBoundingSphere();

          var matrixWorld = mesh.matrixWorld;
          sphere.copy(mesh.geometry.boundingSphere );
          sphere.applyMatrix4( matrixWorld );

          if ( raycaster.ray.isIntersectionSphere( sphere ) === false ) continue;

          ray.copy(raycaster.ray);
          inverseMatrix.getInverse(matrixWorld);
          ray.applyMatrix4(inverseMatrix);

          if (mesh.geometry.boundingBox !== null) {
            if (ray.isIntersectionBox(mesh.geometry.boundingBox) === false) continue;
          }

          if (!mesh.bvh) {
            //console.time('buildBVH.Mesh');
            mesh.bvh = BVH.buildFromTriangles(mesh);
            //console.timeEnd('buildBVH.Mesh');
          }
          mesh.bvh.intersects(raycaster, {
            recursive: recursive,
            intersects: intersected,
            intersectObjects: function(triIndices, recursive, intersects) {
              RaycasterUtil.raycastMeshTriangles(mesh, triIndices, raycaster, ray, intersects);
            }
          });
        }
      }
    }
    intersected.sort(descSort);
    return intersected;
  };
};

CollisionProcessorRaycast.prototype.__intersectScene = function(raycaster, sceneState, options) {
  options = _.defaults(Object.create(null), options || {}, { recursive: true /*, limit: 1*/ });
  var recursive = options.recursive;
  if (this.__useBVH) {
    this.__prepareScene(sceneState);
    options.intersectObject = this.__useOctree? this.__intersectObjectOctree(raycaster) :
      (this.__useMeshBVH? this.__intersectObjectBVH(raycaster) :
        function(object, rec) { return raycaster.intersectObject(object, rec); } );
    return sceneState.bvh.intersects(raycaster, options);
  } else if (this.__useOctree) {
    this.__prepareScene(sceneState);
    var octreeObjects = sceneState.octree.search( raycaster.ray.origin, raycaster.ray.far, true, raycaster.ray.direction );
    if (this.debug && octreeObjects && octreeObjects.length) {
      console.log('octreeObjects', octreeObjects);
    }
    var intersections = raycaster.intersectOctreeObjects( octreeObjects, recursive );
    if (this.debug && intersections && intersections.length) {
      console.log('intersections', intersections);
    }
    return intersections;
  } else {
    return raycaster.intersectObject(sceneState.fullScene, recursive);
  }
};

CollisionProcessorRaycast.prototype.__broadphase = function (sceneState, agent, dt) {
  var collisions = [];
  var didCollide = false;

  var velocityLength = agent.velocity.length();
  var dist = (velocityLength * dt + agent.radius + 0.01) * Constants.metersToVirtualUnit;
  var rc = this.__raycaster;
  rc.near = 0;
  rc.far = dist;
  rc.ray.origin.copy(agent.position);
  rc.ray.direction.copy(agent.velocity).normalize();  // TODO: does this make sense if velocity is 0?
  if (velocityLength <= 0) { return collisions; }

  var floorHeight = agent.position.y - agent.originHeight * Constants.metersToVirtualUnit;

  // collisions with torso region
  var torsoInters = this.__intersectScene(rc, sceneState);
  if (torsoInters.length) {
    didCollide = true;
    collisions[0] = torsoInters[0];
  }

  // check for collisions with head
  rc.ray.origin.y = floorHeight + agent.height * Constants.metersToVirtualUnit;
  var headInters = this.__intersectScene(rc, sceneState);
  if (headInters.length) {
    didCollide = true;
    collisions[1] = headInters[0];
  }

  // collisions with foot region
  rc.ray.origin.y = floorHeight + this.traversableFloorHeight * Constants.metersToVirtualUnit;
  var footInters = this.__intersectScene(rc, sceneState);
  if (footInters.length) {
    didCollide = true;
    collisions[2] = footInters[0];
  }

  // conservative check at next position to catch surfaces between rays
  if (!didCollide) {
    rc.ray.origin.copy(agent.position);
    rc.ray.origin.addScaledVector(rc.ray.direction, dist);
    rc.ray.origin.y = floorHeight + agent.height * Constants.metersToVirtualUnit;
    rc.ray.direction.set(0, -1, 0);
    rc.far = (agent.height - this.traversableFloorHeight) * Constants.metersToVirtualUnit;
    var posInters = this.__intersectScene(rc, sceneState);
    if (posInters.length) {
      // need to recompute normal since this was a top-down ray
      this.__vn.subVectors(agent.position, posInters[0].point).normalize();
      posInters[0].normal = this.__vn.clone();
      collisions[3] = posInters[0];
    }
  }
  if (this.debug && collisions && collisions.length) {
    console.log('collisions', collisions);
  }
  return collisions;
};

CollisionProcessorRaycast.prototype.__broadphaseMulticolumn = function (sceneState, agent, dt) {
  var collisions = [];

  var rc = this.__raycaster;
  rc.near = 0;
  rc.ray.direction.copy(agent.velocity).normalize();
  var dist_travelled = agent.velocity.length() * dt + 0.01;  // extend by epsilon of 1cm
  this.__rightAxis.copy(rc.ray.direction).applyAxisAngle(agent.upAxis, -agent.__PI_2);
  var floorHeight = agent.position.y - agent.originHeight * Constants.metersToVirtualUnit;
  var scope = this;

  // helper to check for collisions in column in velocity direction from agent's center
  // offset by leftRightOffset in perpendicular to velocity (agent's left-right axis)
  // and by frontOffset in velocity direction (agent's front)
  function raycastColumn(leftRightOffset, frontOffset) {
    var foundCollision = false;
    var far = (dist_travelled + frontOffset) * Constants.metersToVirtualUnit;
    rc.far = far;
    // collisions with torso region
    rc.ray.origin.copy(agent.position);
    if (leftRightOffset) {
      rc.ray.origin.addScaledVector(scope.__rightAxis, leftRightOffset);
    }
    var torsoInters = scope.__intersectScene(rc, sceneState);
    if (torsoInters.length) {
      foundCollision = true;
      collisions[0] = torsoInters[0];
    }

    // check for collisions with head
    rc.ray.origin.y = floorHeight + agent.height * Constants.metersToVirtualUnit;
    var headInters = scope.__intersectScene(rc, sceneState);
    if (headInters.length) {
      foundCollision = true;
      collisions[1] = headInters[0];
    }

    // collisions with foot region
    rc.ray.origin.y = floorHeight + scope.traversableFloorHeight * Constants.metersToVirtualUnit;
    var footInters = scope.__intersectScene(rc, sceneState);
    if (footInters.length) {
      foundCollision = true;
      collisions[2] = footInters[0];
    }

    // conservative check at next position to catch surfaces between rays
    if (!foundCollision) {
      rc.ray.origin.copy(agent.position);
      if (leftRightOffset) {
        rc.ray.origin.addScaledVector(scope.__rightAxis, leftRightOffset);
      }
      rc.ray.origin.addScaledVector(rc.ray.direction, far);
      rc.ray.origin.y = floorHeight + agent.height * Constants.metersToVirtualUnit;
      rc.ray.direction.set(0, -1, 0);
      rc.far = (agent.height - scope.traversableFloorHeight) * Constants.metersToVirtualUnit;
      var posInters = scope.__intersectScene(rc, sceneState);
      if (posInters.length) {
        // need to recompute normal since this was a top-down ray
        scope.__vn.subVectors(agent.position, posInters[0].point).normalize();
        posInters[0].normal = scope.__vn.clone();
        collisions[3] = posInters[0];
      }
    }

    if (foundCollision) console.log('raycastColumn ', leftRightOffset, frontOffset, collisions);
  }

  raycastColumn(0, agent.radius);
  raycastColumn(-agent.radius, 0);
  raycastColumn(agent.radius, 0);

  return collisions;
};

CollisionProcessorRaycast.prototype.__narrowphase = function (collisions, agent, dt) {
  var response = {
    collision: false,
    force: new THREE.Vector3(0, 0, 0)
  };

  if (!(collisions[0] || collisions[1] || collisions[2] || collisions[3])) {
    return response;  // no collisions
  }

  // collision force F = m * dv / t
  this.__fn.set(0, 0, 0);
  this.__fn.addScaledVector(agent.velocity, - agent.mass / dt);

  // add F component parallel to normal as collision force
  var validCollisions = _.filter(collisions, function(x) { return x; });
  var collision = _.minBy(validCollisions, 'distance');
  var n = RaycasterUtil.getIntersectedNormal(collision);
  //console.log('minCollision', collision, n);
  //console.log('velocity before', JSON.stringify(agent.velocity));
  this.__vn.copy(agent.velocity).projectOnVector(n);
  agent.velocity.sub(this.__vn);  // remove normal component
  agent.velocity.multiplyScalar(1 - agent.linearFriction);  // tangential friction
  this.__vn.multiplyScalar(-agent.coeffRestitution);  // add bounce from normal
  agent.velocity.add(this.__vn);
  //console.log('velocity after', JSON.stringify(agent.velocity));

  response.force.addScaledVector(n, Math.abs(this.__fn.dot(n)));
  response.collision = true;

  return response;
};

CollisionProcessorRaycast.prototype.checkForCollision = function (sceneState, agent, dt) {
  var collisions = this.__broadphase(sceneState, agent, dt);
  var response = this.__narrowphase(collisions, agent, dt);
  return response;
};

CollisionProcessorRaycast.prototype.computeSensorForces = function (sceneState, agent, dt) {
  var forceSensors = agent.getSensors('force');
  var scope = this;
  _.forEach(forceSensors, function (sensorConfig) {
    if (sensorConfig.encoding.includes('contact')) {
      scope.__computeSensorForcesContact(sensorConfig, sceneState, agent, dt);
    } else {
      scope.__computeSensorForcesCollision(sensorConfig, sceneState, agent, dt);
    }
  });
};

CollisionProcessorRaycast.prototype.__computeSensorForcesCollision = function (sensorConfig, sceneState, agent, dt) {
  var rc = this.__raycaster;
  rc.near = 0;
  rc.far = (agent.velocity.length() * dt + 0.01) * Constants.metersToVirtualUnit;

  // overall collision force F = m * dv / t
  this.__fn.set(0, 0, 0);
  this.__fn.addScaledVector(agent.velocity, - agent.mass / dt);

  var forces = sensorConfig.force;
  forces.fill(0);  // zero out initially
  var positions = sensorConfig.position;
  var orientations = sensorConfig.orientation;
  for (var i = 0; i < forces.length; i++) {
    agent.localToWorldDirection(orientations[i], rc.ray.direction);
    var vDotN = agent.velocity.dot(rc.ray.direction);
    if (vDotN > 0.5) {  // angle between velocity and sensor normal < pi/2
      agent.localToWorldPosition(positions[i], rc.ray.origin);
      var intersections = this.__intersectScene(rc, sceneState);
      if (intersections.length) {
        var n = RaycasterUtil.getIntersectedNormal(intersections[0]);
        forces[i] = Math.abs(this.__fn.dot(n));
      }
    }
  }
};

CollisionProcessorRaycast.prototype.__computeSensorForcesContact = function (sensorConfig, sceneState, agent, dt) {
  var rc = this.__raycaster;
  rc.near = 0;
  rc.far = (agent.radius + 0.1) * Constants.metersToVirtualUnit;

  var forces = sensorConfig.force;
  forces.fill(0);  // zero out initially
  var positions = sensorConfig.position;
  var orientations = sensorConfig.orientation;
  for (var i = 0; i < forces.length; i++) {
    agent.localToWorldDirection(orientations[i], rc.ray.direction);
    agent.localToWorldPosition(positions[i], rc.ray.origin);
    var intersections = this.__intersectScene(rc, sceneState);
    if (intersections.length) {
      forces[i] = 1.0;
    }
  }
};

CollisionProcessorRaycast.prototype.isPositionInsideScene = function(sceneState, pFeet, far) {
  // Check if position is inside the scene by
  // checking that y is within scene bbox and, raycasting downwards hits something
  var sceneBBox = sceneState.getBBox();
  if (sceneBBox.min.y <= pFeet.y && pFeet.y <= sceneBBox.max.y) {
    var rc = this.__raycaster;
    rc.near = 0;
    rc.far = far || (sceneBBox.max.y - sceneBBox.min.y);
    rc.ray.origin.copy(pFeet);
    rc.ray.direction.set(0, -1, 0);
    var intersections = this.__intersectScene(rc, sceneState);
    if (intersections.length) {
      return true;
    }
  }
  return false;
};

CollisionProcessorRaycast.prototype.isPositionAgentCanStandAt = function (sceneState, agent, pFeet, opts) {
  // TODO: Deprecate/rename __isPositionAgentCanStandAtStrict to __isPositionAgentCanStandAtBBox
  opts = _.defaults(Object.create(null), opts || {}, {
    looseCheck: true,
    nChecksVertical: 3,
    nChecksRadial: 4
  });
  var scope = this;
  if (opts.looseCheck) {
    return this.__withRaycasterSettings({intersectBackFaces: true}, function(x) {
      return scope.__isPositionAgentCanStandAtLoose(sceneState, agent, pFeet, opts);
    });
  } else {
    return this.__withRaycasterSettings({intersectBackFaces: true}, function(x) {
      return scope.__isPositionAgentCanStandAtStrict(sceneState, agent, pFeet, opts);
    });
  }
};

CollisionProcessorRaycast.prototype.__withRaycasterSettings = function(settings, action) {
  var rc = this.__raycaster;
  var oldSettings = {};
  _.each(settings, function(v,k) {
    oldSettings[k] = rc[k];
    rc[k] = v;
  });
  var result = action();
  _.each(oldSettings, function(v,k) { rc[k] = v; });
  return result;
};

// Conservative check on whether agent can stand at a certain point (using object bounding boxes)
CollisionProcessorRaycast.prototype.__isPositionAgentCanStandAtStrict = function (sceneState, agent, pFeet, opts) {
  var bottomHeight = pFeet.y + this.traversableFloorHeight * Constants.metersToVirtualUnit;
  var pAdjustedFeet = new THREE.Vector3(pFeet.x, bottomHeight, pFeet.z);

  var object3Ds = sceneState.getObject3Ds();
  object3Ds = object3Ds.filter(function(o) {
    return o.visible;
  });
  var feetObject3Ds = object3Ds.filter(function(o) {
    // OKAY for feet to be on rug, floor, or ground
    var modelInstance = Object3DUtil.getModelInstance(o);
    var catOkay = !modelInstance || !modelInstance.model.hasCategory('rug');
    return o.userData.type !== 'Floor' && o.userData.type !== 'Ground' && catOkay;
  });
  //var height = (agent.height - this.traversableFloorHeight) * Constants.metersToVirtualUnit;
  var height = agent.height * Constants.metersToVirtualUnit;
  var targetRadius = (opts.radius ||agent.radius) * Constants.metersToVirtualUnit;
  //console.log('checkStrict', targetRadius);
  // Sample some point between head and feet and make sure they are also clear
  var points = [];
  var npieces = opts.nChecksVertical;
  for (var i = 1; i <= npieces; i++) {
    var p = pAdjustedFeet.clone();
    p.y += (i/npieces)*height;
    points.push(p);
  }
  var feetDist = Object3DUtil.getMinDistanceToObjectBBoxes(feetObject3Ds, [pAdjustedFeet], 'clamped').dist;
  var restDist = Object3DUtil.getMinDistanceToObjectBBoxes(object3Ds, points, 'clamped').dist;
  var minDist = Math.min(restDist, feetDist);
  var canStandHere = minDist > targetRadius;
  if (canStandHere) {
    // Raycast up from feet to head and check that there isn't anything else
    var rc = this.__raycaster;
    rc.ray.origin.copy(pAdjustedFeet);
    rc.ray.direction.set(0,1,0);
    rc.far = height;
    var intersected = this.__intersectObjects(rc, feetObject3Ds);
    if (intersected && intersected.length > 0) {
      //console.log('intersected', intersected);
      canStandHere = false;
    }
  }
  //console.log('stand', pFeet, minDist, canStandHere);
  return canStandHere;
};

// Looser check on whether agent can stand at a certain point
CollisionProcessorRaycast.prototype.__isPositionAgentCanStandAtLoose = function (sceneState, agent, pFeet, opts) {
  var canStandHere = true;
  var bottomHeight = pFeet.y + this.traversableFloorHeight * Constants.metersToVirtualUnit;
  var height = (agent.height - this.traversableFloorHeight) * Constants.metersToVirtualUnit;
  var targetRadius = (opts.radius || agent.radius) * Constants.metersToVirtualUnit;
  //console.log('checkLoose', targetRadius);
  // Sample some point between head and feet and make sure they are also clear
  var npieces = Math.max(opts.nChecksVertical - 1, 1);
  var nradial = opts.nChecksRadial;
  var deltaTheta = Math.PI*2/nradial;
  var rc = this.__raycaster;
  rc.far = targetRadius;
  for (var i = 0; i <= npieces; i++) {
    // Set point
    rc.ray.origin.set(pFeet.x, bottomHeight, pFeet.z);
    rc.ray.origin.y += (i/npieces)*height;
    // Raycast to sides to see if okay
    var theta = 0;
    for (var j = 0; j < nradial; j++) {
      rc.ray.direction.set(Math.cos(theta), 0, Math.sin(theta));
      var intersected = this.__intersectScene(rc, sceneState);
      if (intersected && intersected.length > 0) {
        if (this.debug) {
          console.log('intersected radial', intersected);
        }
        canStandHere = false;
        return canStandHere;
      }
      theta += deltaTheta;
    }
  }
  if (canStandHere) {
    // Raycast up from feet to head and check that there isn't anything else
    rc.ray.origin.set(pFeet.x, bottomHeight, pFeet.z);
    rc.ray.direction.set(0,1,0);
    rc.far = height;
    var intersected = this.__intersectScene(rc, sceneState);
    if (intersected && intersected.length > 0) {
      if (this.debug) {
        console.log('intersected vertical', intersected);
      }
      canStandHere = false;
    }
  }
  return canStandHere;
};

/**
 * Return cost of agent position pFeet in sceneState given baseCost
 */
CollisionProcessorRaycast.prototype.getPositionCost = function (sceneState, agent, pFeet, opts) {
  opts = opts || {};
  var baseCost = opts.baseCost || 1;
  var canStandAt = this.isPositionAgentCanStandAt(sceneState, agent, pFeet, {
    radius: opts.radius,
    looseCheck: true, nChecksVertical: 4, nChecksRadial: 4 });
  return canStandAt? baseCost : Infinity;
  // Performs conservative check on whether the agent can stand at the given position
  // var canStandAt = this.isPositionAgentCanStandAt(sceneState, agent, pFeet, { looseCheck: false, radius: opts.radius });
  // if (canStandAt) {
  //   return baseCost;
  // } else {
  //   // Check if it is an okay spot
  //   canStandAt = this.isPositionAgentCanStandAt(sceneState, agent, pFeet, {
  //     radius: opts.radius,
  //     looseCheck: true, nChecksVertical: 4, nChecksRadial: 4 });
  //   return canStandAt? baseCost + 1 : Infinity;
  // }
};

module.exports = CollisionProcessorRaycast;
