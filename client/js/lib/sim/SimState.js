var Constants = require('Constants');
var FirstPersonAgent = require('sim/FirstPersonAgent');
var NavScene = require('nav/NavScene');
var SceneUtil = require('scene/SceneUtil');
var Object3DUtil = require('geo/Object3DUtil');
var Transform = require('geo/Transform');
var _ = require('util');

/**
 * Basic simulator state
 * @param opts
 * @memberOf sim
 * @constructor
 */
function SimState(opts) {
  this.opts = { sampleFloor: {
      nsamples:300,
      maxIters:100
    }, sampleValidStartGoal: {
      maxStartSamples:500,
      maxGoalSamples: 1
    }
  };
  this.collisionProcessor = null;  // set by Simulator
  this.configure(opts);
  this.__init();
}

SimState.prototype.configure = function (opts) {
  // Update configure with stuff in opts
  this.opts = _.defaultsDeep(Object.create(null), opts || {}, this.opts);
  this.opts.sampleFloor.rng = this.opts.rng;
  if (opts.goal != null) {
    this.opts.goal.positions = opts.goal.positions;
  }
  return this.opts;
};

SimState.prototype.__init = function () {
  var opts = _.pick(this.opts, ['agent', 'semanticEncodings', 'sensors', 'rendererFactory', 'colorEncoding']);
  this.agent = new FirstPersonAgent(opts);
  this.clear();
};

SimState.prototype.clear = function() {
  this.sceneState = null;
  this.prevTicks = 0;
  this.ticks = 0;
  this.lastStepCollided = false;
  this.start = null;
  this.goals = [];
  this.__serializableGoals = null;
  this.navscene = null;
  this.level = null;
};

SimState.prototype.reset = function (sceneState) {
  // Reset simulation state with new scene (new episode starting)
  this.sceneState = sceneState;
  // TODO: convert from this.opts.scene.level to loaded level index for SUNCG scenes that can be loaded at one level at a time
  this.level = (this.opts.scene.level != undefined)? sceneState.getLevelByIndex(this.opts.scene.level): null;

  // set goal and start
  this.__serializableGoals = null;
  this.goals = this.computeGoals();
  if (this.opts.start === 'random') {
    // Select point in random level and room as starting point
    this.start = this.sampleStart();
  } else {
    this.start = _.clone(this.opts.start);
    this.start.position = Object3DUtil.toVector3(this.start.position);
    if (_.isString(this.start.angle)) {
      this.start.angle = parseFloat(this.start.angle);
    } else if (this.start.angle == undefined) {
      this.start.angle = 0;
    }
  }
  this.agent.moveTo(this.start);
  this.prevTicks = 0;
  this.ticks = 0;

  // compute world-to-scene transform
  this.sceneState.fullScene.updateMatrixWorld();
  var sceneTransformMatrixInverse = new THREE.Matrix4();
  sceneTransformMatrixInverse.getInverse(sceneState.scene.matrixWorld);
  if (this.opts.unit) {
    var scaleBy = this.opts.unit ? (sceneState.info.defaultUnit / this.opts.unit) : 1.0;
    var scaleMat = new THREE.Matrix4();
    scaleMat.makeScale(scaleBy, scaleBy, scaleBy);
    sceneTransformMatrixInverse.multiply(scaleMat);
  }
  this.worldToSceneScaled = new Transform(sceneTransformMatrixInverse);

  if (this.opts.navmap) {
    // initialize navscene
    var scope = this;
    if (!this.navscene || this.navscene.sceneState !== sceneState) {
      // We need to create a new navscene for a new scene state
      var useCellFloorHeight = this.opts.navmap.useCellFloorHeight;
      var estimateFloorHeight = this.opts.navmap.estimateFloorHeight;
      var refineGridOpts = null;
      if (this.opts.navmap.refineGrid) {
        var defaultOpts = { radius: this.agent.radius*Constants.metersToVirtualUnit, clearance: this.agent.radialClearance*Constants.metersToVirtualUnit  };
        refineGridOpts = _.isPlainObject(this.opts.navmap.refineGrid)? _.defaults(this.opts.navmap.refineGrid , defaultOpts) : defaultOpts;
      }
      this.navscene = new NavScene({
        sceneState: sceneState,
        getCellData: function (position, level) {
          return scope.getPositionMetadata(position, {
            useCellFloorHeight: useCellFloorHeight, baseCost: 1, level: level,
            estimateFloorHeight: estimateFloorHeight,
            needFloorHeight: refineGridOpts? true : false
          });
        },
        refineGrid: refineGridOpts,
        mapName: this.opts.navmap.mapName,
        cellAttributes: _.keyBy([
          new NavScene.CellAttribute('floorHeight', Float32Array, { dataType: 'continuous' } ),
          new NavScene.CellAttribute('roomIndex', Uint16Array, { dataType: 'categorical'}),
          new NavScene.CellAttribute('occupancy', Uint8Array, { dataType: 'categorical'})
        ], 'name'),
        autoUpdate: this.opts.navmap.autoUpdate,
        autoCreateGrid: this.opts.navmap.autoCreateGrid,
        allowDiagonalMoves: this.opts.navmap.allowDiagonalMoves,
        reverseEdgeOrder: this.opts.navmap.reverseEdgeOrder,
        cellSize: (this.opts.navmap.cellSize || (this.agent.radius/2)) * Constants.metersToVirtualUnit,
        metadata: {
          agentHeight: this.agent.height, agentRadius: this.agent.radius,
          traversableFloorHeight: scope.collisionProcessor.traversableFloorHeight,
          useCellFloorHeight: useCellFloorHeight },
        baseTileHeight: scope.collisionProcessor.traversableFloorHeight * Constants.metersToVirtualUnit
      });
      sceneState.navscene = this.navscene;
    }

    // update navscene with goal and start
    if (this.navscene) {
      if (this.navscene.isGridValid()) {
        if (this.level) {
          this.navscene.setActiveLevel(this.opts.scene.level);
        }
        this.navscene.reset(this.agent, this.start, this.goals);
        if (this.opts.start === 'random') {
          this.ensureValidPath();
        }
        if (Constants.isBrowser) {
          console.log('start and goals', this.start, this.goals);
          console.log('shortestPath', this.navscene.getShortestPath());
        }
      } else {
        console.warn('Cannot create navscene!  Please check your configuration');
        this.navscene = null; // NOT able to create navscene successfully
      }
    }
  }
};

SimState.prototype.update = function(collision) {
  if (this.navscene && this.navscene.autoUpdate) {
    this.navscene.update(this.agent);
  }
  this.lastStepCollided = collision;
};

// ensure that there is path between start and goal
SimState.prototype.ensureValidPath = function(opts) {
  opts = _.defaults(Object.create(null), opts || {}, this.opts.sampleValidStartGoal);
  var ngsamples = 0;
  var hasPath = this.navscene.hasValidPath(this.opts.goal);
  if (!hasPath) {
    console.log('Need to resample for start/goal with valid path');
    console.time('ensureValidPath.resample');
    while (!hasPath && ngsamples < opts.maxGoalSamples) {
      // Select point in random level and room as starting point
      if (_.isFinite(opts.maxStartSamples)) {
        var nssamples = 0;
        while (!hasPath && nssamples < opts.maxStartSamples && this.goals.length > 0) {
          this.start = this.sampleStart();
          this.agent.moveTo(this.start);
          this.navscene.reset(this.agent, this.start, this.goals);
          hasPath = this.navscene.hasValidPath(this.opts.goal);
          nssamples++;
        }
      } else {
        // Use navscene sampler that searches the entire grid.  NOTE: check performance for large scenes
        // As by product will get cost to goal for all tiles
        // This is good if we have more constraints on properties of the path to the target (like number of doors, number of steps, etc).
        var sampleOpts = _.defaults({ /*nsamples: 1,*/ sampler: this.opts.sampler, scorer: 'path', goals: this.goals, mapState: { map: [] } }, this.opts.goal);
        var sample = this.navscene.sample(sampleOpts);
        if (sample) {
         this.start = this.__updateNavSceneSample(sample, this.opts.rng);
         this.agent.moveTo(this.start);
         // console.log('sample', sample, sampleOpts);
         this.navscene.reset(this.agent, this.start, this.goals, sampleOpts.mapState);
         hasPath = this.navscene.hasValidPath(this.opts.goal);
        }
      }

      ngsamples++;
      if (!hasPath && ngsamples < opts.maxGoalSamples) {
        this.goals = this.computeGoals();
        this.__serializableGoals = null;
        this.navscene.reset(this.agent, this.start, this.goals);
        hasPath = this.navscene.hasValidPath(this.opts.goal);
      }
    }
    console.timeEnd('ensureValidPath.resample');
  }
  if (!hasPath) {
    console.warn('No path between start and goals!', this.start, this.goals);
  }
};

/**
 * Set goal specification
 * @param goal {string|Object} Goal specification ('random' to randomly sample valid goal point)
 * @param [goal.position] {Array<number>} 3D position of the goal point (x,y,z)
 * @param [goal.radius] {number} distance threshold for goal point
 * @param [goal.categories] {Array<string>} Array of categories
 * @param [goal.roomTypes] {Array<string>} Array of roomTypes
 * @param [goal.modelIds] {Array<string>} Array of model Ids
 * @param [goal.objectIds] {Array<string>} Array of object Ids
 * @param [goal.roomIds] {Array<string>} Array of room Ids
 * @param [goal.select] {string} From valid goals, select `closest`, `random`.  All goals are allowed if not specified
 */
SimState.prototype.setGoal = function (goal) {
  this.opts.goal = goal;
};

/**
 * Fetch configuration for audio sources - position of audio sources will be centroid of goal, audio file is also audio associated with goal.
 * @param opts Options for creating audio source configuration
 * @param opts.op Operation to perform on the audio source (`create`, `update`, or `remove`)
 * @param opts.baseId [int] Audio endpoints are given an unique integer id.  The baseId specified the next id to start from.
 * @param [opts.keepInsideWalls=false] {boolean} If true, will shrink the wall bounding box by a bit and push all audio
 *   source positions to be within the walls.
 * @return {sim.AudioSimulator.AudioEndpointConfig[]}
 */
SimState.prototype.getAudioSources = function(opts) {
  var goals = this.getGoals();
  // TODO: Configure sound sources for all models vs just goals
  var scope = this;
  var keepInsideWalls = opts.keepInsideWalls;
  var bbox;
  if (keepInsideWalls) {
    bbox = SceneUtil.getWallsBBox(this.sceneState);
    // Shrink it a bit so we are inside
    bbox = bbox.expandBy(-0.11*Constants.metersToVirtualUnit);
    console.log('Got walls bbox: ' + JSON.stringify(bbox));
  }
  var sources = goals.map(function(g,i) {
    var worldPos = g.position.clone();
    if (bbox) {
      worldPos = bbox.closestPoint(worldPos);
    }
    var position = scope.worldToSceneScaled.convertPoint(worldPos);
    return {
      op: opts.op, id: i+opts.baseId, type: 'S',
      position: { x: position.x, z: position.z },
      direction: { x: 0, z: 0},
      audioFile: g.audioFile
    };
  });
  return sources;
};

/**
 * Fetch configuration for audio receivers - position of audio receivers is based on agent audio sensors.
 * @param opts Options for creating audio receiver configuration
 * @param opts.op Operation to perform on the audio receiver (`create`, `update`, or `remove`)
 * @param opts.baseId [int] Audio endpoints are given an unique integer id.  The baseId specified the next id to start from.
 * @return {sim.AudioSimulator.AudioEndpointConfig[]}
 */
SimState.prototype.getAudioReceivers = function(opts) {
  // Using just one audio sensor at center of agent
  // var sensorPosition = { position: this.agent.position.clone(),
  //   direction: this.agent.getOrientation().clone() };

  var agent = this.agent;
  var worldToSceneScaled = this.worldToSceneScaled;
  var audioSensors = agent.getSensors('audio');
  var sensorId = opts.baseId;
  var sensorType = 'R';
  var receivers = [];
  _.each(audioSensors, function(sensor, name) {
    sensor.audioSensorId = sensorId;
    for (var i = 0; i < sensor.position.length; i++) {
      // Convert to world space
      var sensorPosition = {
        position: agent.localToWorldPosition(sensor.position[i]),
        direction: agent.localToWorldDirection(sensor.orientation[i]) };
      // Convert to scene space
      sensorPosition = worldToSceneScaled.convertPosition(sensorPosition);
      sensorPosition.direction.y = 0;
      sensorPosition.direction.normalize();
      var receiver = {
         op: opts.op, id: sensorId, type: sensorType,
         position: { x: sensorPosition.position.x, z: sensorPosition.position.z },
         direction: { x: sensorPosition.direction.x, z: sensorPosition.direction.z }
      };
      receivers.push(receiver);
      sensorId++;
    }
  });
  return receivers;
};

SimState.prototype.getGoals = function () {
  return this.goals;
};

SimState.prototype.getSerializableGoals = function() {
  if (!this.__serializableGoals && this.goals) {
    this.__serializableGoals = _.map(this.goals, function (g) {
      return _.omit(g, ['modelInstance']);
    });
  }
  return this.__serializableGoals;
};

// Convert a model instance to a goal
SimState.prototype.__getGoalForModelInstance = function (mi) {
  const bbox = mi.getBBox();
  const objectCentroid = bbox.centroid();
  const closestPoint = bbox.closestPoint(this.agent.position);
  let roomIds = mi.object3D.userData.roomIds ? mi.object3D.userData.roomIds : null;
  if (!roomIds) {
    roomIds = [];
    // did not get rooms from modelInstances, get from position query
    const room = this.sceneState.getIntersectedRoomAt(objectCentroid);
    if (room) {
      roomIds.push(room.object.userData.id);
    }
  }
  const rooms = roomIds.map(this.sceneState.getRoomById.bind(this.sceneState));
  const roomTypes = rooms.map(r => this.sceneState.getRoomInfo.bind(this.sceneState)(r).roomType);

  return {
    type: 'object',
    position: objectCentroid,
    bbox: bbox,
    objectId: mi.object3D.userData.id,
    objectType: mi.model.getCategories(),
    room: roomIds,
    roomType: roomTypes,
    modelInstance: mi,
    initialOffsetFromAgent: this.agent.worldToLocalPositionNoScaling(closestPoint),
    audioFile: mi.model.getAudioFile()
  };
};

// Convert a room object to a goal
SimState.prototype.__getGoalInRoom = function (room) {
  const bbox = Object3DUtil.getBoundingBox(room);
  const sample = this.__sampleFloor(room, this.opts.sampleFloor, room.targetCenter);
  const position = sample ? sample.worldPoint : bbox.centroid();
  const closestPoint = bbox.closestPoint(this.agent.position);
  const offsetFromAgent = this.agent.worldToLocalPositionNoScaling(closestPoint);
  const roomInfo = this.sceneState.getRoomInfo(room);

  return {
    type: 'room',
    position: position,
    bbox: bbox,
    room: [roomInfo.id],
    roomType: [roomInfo.roomType],
    initialOffsetFromAgent: offsetFromAgent
  };
};

// Convert a position in the scene to a goal
SimState.prototype.__getGoalForPosition = function (position) {
  const room = this.sceneState.getIntersectedRoomAt(position);
  const roomInfo = this.sceneState.getRoomInfo(room.object);
  return {
    type: 'position',
    position: position,
    room: [roomInfo.id],
    roomType: [roomInfo.roomType],
    initialOffsetFromAgent: this.agent.worldToLocalPositionNoScaling(position)
  };
};

/**
 * Computes actual goals from goal specification
 * @returns {Array<{position: THREE.Vector3, room: ?string, angle: ?number, bbox: ?geo.BBox, objectId: ?string, modelInstance: ?model.ModelInstance, initialOffsetFromAgent: ?THREE.Vector3, audioFile: ?string}>}
 */
SimState.prototype.computeGoals = function () {
  let goalsSpec = this.opts.goal;
  let goals = [];

  // basic random position goal -> sample concrete position goal
  if (goalsSpec === 'random'  || (goalsSpec && goalsSpec.type === 'position' && goalsSpec.position === 'random')) {
    let sample = this.sample();
    goalsSpec = { type: 'position', position: sample.position, radius: goalsSpec.radius }
  }

  // check type and required fields, dispatch to type-specific handlers for specification field
  if (goalsSpec && goalsSpec.type) {
    switch (goalsSpec.type) {
      case 'position':
        if (goalsSpec.position) {
          let pos = Object3DUtil.toVector3(goalsSpec.position);
          if (!this.sceneState.getBBox().contains(pos)) {
            console.error('Goal position outside bounds of scene: ' + JSON.stringify(pos));
          }
          goals.push(this.__getGoalForPosition(pos));
        } else {
          // error
        }
        break;
      case 'object':
        let filterFun;
        if (goalsSpec.objectIds && goalsSpec.objectIds.length > 0) {
          // select objects by object ids
          if (_.isString(goalsSpec.objectIds)) {
            goalsSpec.objectIds = goalsSpec.objectIds.split(',');
          }
          filterFun = mi => goalsSpec.objectIds.includes(mi.object3D.userData.id);
        } else if (goalsSpec.modelIds && goalsSpec.modelIds.length > 0) {
          // select objects by model ids
          filterFun = mi => goalsSpec.modelIds.includes(mi.model.getFullID()) && mi.object3D.visible;
        } else if (goalsSpec.categories && goalsSpec.categories.length > 0) {
          // select objects by categories
          filterFun = mi => mi.model.hasCategoryIn(goalsSpec.categories) && mi.object3D.visible;
        } else {
          // error
        }
        // map modelInstances to goals
        const modelInstances = this.sceneState.findModelInstances(filterFun);
        goals = _.map(modelInstances, this.__getGoalForModelInstance.bind(this));
        break;
      case 'room':
        let rooms;
        if (goalsSpec.roomIds && goalsSpec.roomIds.length > 0) {  // select rooms given roomIds
          rooms = this.sceneState.getRoomsOrHouseRegions(this.level, function(room) {
            return goalsSpec.roomIds.includes(room.userData.id);
          });
        } else if (goalsSpec.roomTypes && goalsSpec.roomTypes.length > 0) {  // select rooms give roomTypes
          rooms = this.sceneState.getRoomsOrHouseRegions(this.level,
            (goalsSpec.roomTypes === 'any') ? null : function(room) {
              const roomType = room.userData.roomType || room.userData.regionType;
              if (_.isArray(roomType)) {  // match on any in roomType
                return _.some(roomType, function (rt) {
                  return goalsSpec.roomTypes.includes(rt);
                });
              } else {  // assume roomType is string
                return goalsSpec.roomTypes.includes(roomType);
              }
            });
        } else {
          // error
        }
        goals = _.map(rooms, r => {
          // TODO camelCase incoming parameter
          if (goalsSpec.target_pos) {
            r.targetCenter = Object3DUtil.toVector3(goalsSpec.target_pos);
          }
          let g = this.__getGoalInRoom(r);
          if (r.targetCenter) {
            delete r.targetCenter;
          }
          return g;
        });  // map rooms to goals
        break;
      default:
        console.error('Goal specification of unknown type: ' + JSON.stringify(goalsSpec));
        return null;
    }
  }

  // TODO handle type-less multiple positions goalsSpec (inherited from ew-patches)
  if (goalsSpec.positions != null) {
    for (let i = 0; i < goalsSpec.positions.length; ++i) {
      goals.push(JSON.parse(JSON.stringify(goalsSpec)));
      goals[i].position = Object3DUtil.toVector3(goalsSpec.positions[i]);
      goals[i].positions = null;
    }
    return goals;
  }

  // Goal selection strategy
  if (goalsSpec.select === 'random') {
    // random choice at uniform
    if (goals && goals.length > 1) {
      goals = [this.opts.rng.choice(goals)];
    }
  } else if (goalsSpec.select === 'closest') {
    // pick goal closest to starting position of agent
    goals = _.sortBy(goals, function (g) {
      return g.initialOffsetFromAgent.length();
    });
    if (goals.length > 0) {
      goals = [goals[0]];
    }
  }

  // TODO: Implement me!!!
  // Support observer option for having a specific position  that is next to the selected goals
  if (goalsSpec.selectObserverPosition) {
    // Currently just do it randomly, in the future can be enhanced to have options of how far away the observer should be positioned
    _.each(goals, function(g) {

    });
  }

  if (goals.length === 0) {
    console.error('Could not select a goal given spec ' + JSON.stringify(goalsSpec));
  }

  // return filled in goals
  return goals;
};

SimState.prototype.offsetsToGoals = (function () {
  var tmp = new THREE.Vector3();
  return function() {
    var agent = this.agent;
    var goals = this.getGoals();
    var scope = this;
    var offsets = _.map(goals, function (g) {
      var closestPoint = g.bbox && scope.opts.goal.dist_from_bbox ? g.bbox.closestPoint(agent.position, tmp) : g.position;
      var positionInAgentSpace = agent.worldToLocalPositionNoScaling(closestPoint);
      return {
        // distance: positionInAgentSpace.length(),
        distance: Math.sqrt(positionInAgentSpace.x * positionInAgentSpace.x + positionInAgentSpace.z * positionInAgentSpace.z),
        offset: positionInAgentSpace
      };
    });
    return offsets;
  };
}());

SimState.prototype.isPositionAgentCanStandAt = function(pFeet) {
  return this.collisionProcessor.isPositionAgentCanStandAt(this.sceneState, this.agent, pFeet);
};

// Returns information about the position
// Whether the cell is unoccupied from height above floor to up
SimState.prototype.getPositionMetadata = (function() {
  var pFeetAdjusted = new THREE.Vector3();
  return function(pFeet, opts) {
    opts = opts || {};
    var metadata = {};
    // TODO: Add level parameter
    var roomIntersect = this.sceneState.getIntersectedRoomAt(pFeet, opts.level);

    var floorHeight;
    if (roomIntersect) {
      // Height of floor at the cell
      metadata.roomIndex = roomIntersect.object.userData.index + 1; // Add 1 so 0 is safely unknown
      floorHeight = this.sceneState.getFloorHeight(roomIntersect.object);
    } else {
      var groundIntersect = this.sceneState.getIntersectedGroundAt(pFeet, opts.level);
      if (groundIntersect) {
        floorHeight = this.sceneState.getFloorHeight(groundIntersect.object);
      }
    }
    if (floorHeight == undefined && opts.estimateFloorHeight) {
      //console.log('estimateFloorHeight', opts.estimateFloorHeight);
      // No floor height - try to estimate from of room floors around this one
      // TODO: pass this.opts.rng
      var estimatedFloorHeight = SceneUtil.estimateFloorHeight(opts.level, pFeet,
        opts.estimateFloorHeight.numSamples,
        opts.estimateFloorHeight.maxDist,
        opts.estimateFloorHeight.kNeighbors,
        opts.estimateFloorHeight.sampleUpwardSurfaces
      );
      if (estimatedFloorHeight != undefined) {
        // console.log('estimatedFloorHeight', estimatedFloorHeight);
        // check if there is a floor here
        pFeetAdjusted.copy(pFeet);
        var thresh = opts.estimateFloorHeight.maxVerticalDist + opts.estimateFloorHeight.verticalOffset;
        pFeetAdjusted.y = estimatedFloorHeight + opts.estimateFloorHeight.verticalOffset;
        if (this.collisionProcessor.isPositionInsideScene(this.sceneState, pFeetAdjusted, thresh)) {
          //console.log('update floorHeight', estimatedFloorHeight);
          floorHeight = estimatedFloorHeight;
        }
      }
    }
    if (floorHeight != undefined) {
      metadata.floorHeight = floorHeight;
    }

    pFeetAdjusted.copy(pFeet);
    if (opts.useCellFloorHeight) {
      if (metadata.floorHeight != null && _.isFinite(metadata.floorHeight)) {
        pFeetAdjusted.y = metadata.floorHeight;
      }
    }
    var cost = Infinity;
    if (!opts.needFloorHeight || _.isFinite(metadata.floorHeight)) {
      //console.log('get position cost', pFeetAdjusted);
      cost = this.collisionProcessor.getPositionCost(this.sceneState, this.agent, pFeetAdjusted, opts);
    }
    metadata.cost = cost;
    metadata.occupancy = _.isFinite(cost)? 0 : 1;

    return metadata;
  };
})();

/**
 * Samples from the state space for agent configuration (position, orientation)
 * @returns {{room: string, position: THREE.Vector3, angle: number}}
 */
SimState.prototype.sample = function (opts) {
  //console.time('SimState.sample');
  var rng = this.opts.rng;
  var sampled = this.__sampleRoomFloor(_.defaults({}, opts || {}, this.opts.sampleFloor));
  var roomId;
  var position;
  if (sampled) {
    roomId = sampled.room.userData.id;
    position = sampled.floorSample.worldPoint;
  } else {
    // Let's be simple and some some point on the bottom of the bounding box
    var bbox = this.sceneState.getBBox();
    position = bbox.sample(rng);
    var floorHeight = this.sceneState.getFloorHeight();
    position.y = (floorHeight == undefined)? bbox.min.y : floorHeight;
  }

  // console.log('final', floorSample);
  // return agent origin position
  position.y += this.agent.originHeight * Constants.metersToVirtualUnit;
  // random view direction (angle wrt +X axis)
  var angle = rng.random() * 2 * Math.PI;
  //console.timeEnd('SimState.sample');

  return {
    room: roomId,
    position: position,
    angle: angle
  };
};

SimState.prototype.sampleStart = function() {
  var goalSpec = this.opts.goal;
  var numRooms = this.sceneState.getRoomsOrHouseRegions().length;
  if (goalSpec && goalSpec.minRooms && numRooms > 1) {
    var goalRoomIds = _.filter(_.map(this.goals, function(g) { return g.room; }), function(x) { return x; });
    return this.sample({ filterRooms: function(r) { return goalRoomIds.indexOf(r.userData.id) < 0; } });
  } else {
    return this.sample();
  }
};


/** sample valid position on room floor */
SimState.prototype.__sampleFloor = function (room, opts, target) {
  var scope = this;
  var validSampleFun = function (x) {
    return scope.isPositionAgentCanStandAt(x.worldPoint);
  };
  var floorSamples = SceneUtil.sampleRoomFloor(room, opts.nsamples, {skipUVColors: true, rng: opts.rng});
  var res = null;
  if (floorSamples && floorSamples.length > 0) {
    if (target) {
      floorSamples = _.sortBy(floorSamples, function (x) {
        return x.worldPoint.distanceTo(target);
      });
    }
    var validFloorSample = _.find(floorSamples, validSampleFun);
    if (validFloorSample) {
      return validFloorSample;
    }
  }
  return res;
};

/**
 * Sample room and position on room floor
 * @param opts.nsamples {int} Number of floor samples to sample
 * @param opts.maxIters {int} Number of iterations to try for sampling rooms and floor
 * @param opts.rng {Math.RNG} Random number generator to use for sampling
 * @param [opts.filterRooms] {function(THREE.Object3D): boolean} Optional filter when selecting rooms
 * @returns {{room: *, floorSample: *}}
 * @private
 */
SimState.prototype.__sampleRoomFloor = function(opts) {
  var rooms = this.sceneState.getRoomsOrHouseRegions(this.level, opts.filterRooms);
  //console.log('got rooms', rooms);
  // find position agent can stand
  var scope = this;
  var validSampleFun = function (x) {
    return scope.isPositionAgentCanStandAt(x.worldPoint);
  };
  var validFloorSample;
  var floorSample;
  var room;
  for (var iters = 0; iters < opts.maxIters; iters++) {
    if (rooms.length === 0) {
      console.warn('Cannot find room with floor!');
      break;
    }
    room = SceneUtil.sampleRoom(rooms, { rng: opts.rng });
    var floorSamples = SceneUtil.sampleRoomFloor(room, opts.nsamples, { skipUVColors: true, rng: opts.rng });
    if (floorSamples && floorSamples.length > 0) {
      validFloorSample = _.find(floorSamples, validSampleFun);
      if (validFloorSample) {
        floorSample = validFloorSample;
        break;
      }
      floorSample = floorSamples[0];
    } else {
      // if room has no floor, try other rooms
      _.pull(rooms, room);
    }
  }

  if (!validFloorSample) {
    console.warn('Cannot find good position after ' + opts.maxIters + '.  Giving up!');
  }
  if (floorSample) {
    return {room: room, floorSample: floorSample};
  }
};

SimState.prototype.__updateNavSceneSample = function(sample, rng) {
  //console.log('updateNavSceneSample', sample);
  sample.position.y += this.agent.originHeight * Constants.metersToVirtualUnit;
  var room = this.sceneState.getRoomByIndex1(sample.roomIndex);
  if (room) {
    sample.room = room.userData.id;
  }
  // random view direction (angle wrt +X axis)
  var angle = rng.random() * 2 * Math.PI;
  if (this.agent.angularResolution !== undefined) {
    angle = Math.round(angle / this.agent.angularResolution) * this.agent.angularResolution;
  }
  sample.angle = angle;
  return sample
};

SimState.prototype.getObjectInfos = function(objectIds) {
  var scope = this;
  return objectIds.map(function(id) {
    var node = scope.sceneState.findNode(function(x) { return x.userData.id === id; });
    return { id: id, node: node };
  });
};

SimState.prototype.getSceneId = function() {
  if (this.sceneState) {
    return this.sceneState.getFullID();
  }
};

SimState.prototype.getSummary = function() {
  var goals = this.getSerializableGoals();
  var summary = {
    sceneId: this.sceneState.getFullID(),
    scene: { bbox: this.sceneState.getBBox() },
    start: this.start,
    goal: goals,
    agent_state: this.agent.getState(),
    shortestPath: this.getShortestPath()
  };
  return summary;
};

SimState.prototype.getMap = function() {
  if (this.navscene) {
    return {
      sceneId: this.sceneState.getFullID(),
      map: this.navscene.map,
      graph: this.navscene.grid,
      start: this.navscene.start,
      goals: this.navscene.goals
    };
  }
};

SimState.prototype.getShortestPath = function() {
  if (this.navscene) {
    return this.navscene.getShortestPath();
  }
};

module.exports = SimState;
