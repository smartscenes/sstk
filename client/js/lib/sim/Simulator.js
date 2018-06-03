// Simulator
var AssetGroups = require('assets/AssetGroups');
var AssetManager = require('assets/AssetManager');
var async = require('async');
var ActionTraceLog = require('sim/ActionTraceLog');
var AudioSimulator = require('sim/AudioSimulator');
var CollisionProcessorFactory = require('sim/CollisionProcessorFactory');
var Constants = require('Constants');
var Object3DUtil = require('geo/Object3DUtil');
var PubSub = require('PubSub');
var Renderer = require('gfx/Renderer');
var RendererFactory = require('gfx/RendererFactory');
var RNG = require('math/RNG');
var Sampler = require('math/Sampler');
var SceneStatistics = require('ssg/SceneStatistics');
var SceneUtil = require('scene/SceneUtil');
var SimOperations = require('sim/SimOperations');
var SimState = require('sim/SimState');
var SkyGround = require('geo/SkyGround');
var _ = require('util');

var __optsToIgnore = ['renderer', 'simpleRenderer', 'assetManager', 'net', 'wav', 'fs', 'bufferType', 'rendererType', 'rendererFactory'];

/**
 * Simulator class
 * @constructor
 * @memberOf sim
 * @param opts Configuration parameters for Simulator
 * @param [opts.observations] {Object} Set of observations to return
 *   (default = `{rgb: true, depth: false, normal: false, objectType: false, objectId: false, roomType: false, roomId: false, forces: true, audio: false}`).
 * @param [opts.unit=1] {number} Unit to use for space (in meters).
 * @param [opts.timeStep=0.1] {number} Amount of time (in secs) a tick/step corresponds to.
 * @param [opts.assetManager] {AssetManager} For loading assets (will be created if not specified).
 * @param [opts.assetCacheSize=100] {int} Size of asset cache
 * @param [opts.outputDir] {string} Output directory for debug output (e.g. screenshots and audio output)
 * @param [opts.agent] {Object} Agent configuration
 * @param [opts.sensors] {Object} Sensor configuration
 * @param [opts.scene] {Object} Options for loading a scene
 * @param [opts.start] {Object|string} Start specification (use `random` for random start)
 * @param [opts.goal] {Object|string} Goal specification (use `random` for random goal)
 * @param [opts.audio] {Object} Options for audio simulator
 * @param [opts.navmap] {Object} Options for navigation map (use `{ recompute=true }` for force recomputation of navigation maps
 * @param [opts.collisionDetection] {Object} Parameters for collision detection
 * @param [opts.seed] {int} Seed to use for random number generator
 * @param [opts.useSky=true] {boolean} Whether to use grass and sky for outside environment.
 * @param [opts.actionTraceLog] {string|boolean} True to use log action traces to file.  If string, used to specify filename of action trace.
 *        By default, action trace is saved to `outputDir/action_trace.csv`.
 * @param [opts.actionTraceLogFields] {string[]} List of additional fields to include in action trace log. Supported fields are: `forces`.
 * @param opts.renderer {Renderer} Renderer for rendering rgb (can have fancy effects)
 * @param [opts.rendererType] {Class} Renderer class (used for creating more renderers)
 * @param [opts.bufferType] {Buffer} node.js Buffer (webpack gets some other Buffer) for audio simulator
 * @param [opts.net] {net} Network library for audio simulator
 * @param [opts.wav] {wav} Wav library for audio simulator
 * @param [opts.fs] {fs} Filesystem library for writing files
 **/
function Simulator(opts) {
  PubSub.call(this);
  opts = _.defaultsDeep(Object.create(null), opts,
    {
      observations: { rgb: true, depth: false, normal: false, objectType: false, objectId: false, roomType: false, roomId: false, forces: true, audio: false, map: false },
      unit: 1,
      timeStep: 0.1,
      collisionDetection: { mode: 'raycast' },
      assetCacheSize: 100,
      useSky: true
    });
  opts = _.mapKeysDeep(opts, function(v,k) { return _.camelCase(k); });
  console.log('Creating Simulator with options', _.omit(opts, __optsToIgnore));
  this.__init(opts);
}

Simulator.prototype = Object.create(PubSub.prototype);
Simulator.prototype.constructor = Simulator;

Simulator.prototype.__init = function (opts) {
  this.opts = opts;
  opts.rng = opts.rng || new RNG();
  this.sampler = new Sampler(opts.rng);
  this.__seed = null;
  if (opts.seed != undefined) {
    this.seed(opts.seed);
  }
  // sensor visualization
  if (opts.visualizeSensors != undefined) {
    _.each(opts.sensors, function (s) {
      s.visualize = opts.visualizeSensors;
    });
  }

  this.scene = null;
  this.assetManager = opts.assetManager;
  this.timeStep = opts.timeStep;
  //this.__rendererType = opts.rendererType || Renderer;
  //this.__rendererConfig = opts.rendererConfig || {};  // Default renderer config
  this.renderer = opts.renderer;
  // TODO: should the renderer factory be passed in?
  this.__rendererFactory = new RendererFactory({
    rendererType: opts.rendererType || Renderer, // What class to use for rendering
    renderers: {
      'main': this.renderer
    },
    configSets: {
      'simple': {
        isOffscreen: true,
        useAmbientOcclusion: false,
        useLights: false,
        useShadows: false,
        width: opts.width,
        height: opts.height,
        reuseBuffers: true
      },
      'color': {
        isOffscreen: true,
        useAmbientOcclusion: opts.useAmbientOcclusion,
        useLights: opts.useLights,
        useShadows: opts.useShadows,
        width: opts.width,
        height: opts.height,
        reuseBuffers: true
      }
    }
  });
  this.__collisionProcessor = CollisionProcessorFactory.createCollisionProcessor(opts.collisionDetection);
  this.state = new SimState(_.defaults({ rendererFactory: this.__rendererFactory, sampler: this.sampler }, opts));
  this.state.collisionProcessor = CollisionProcessorFactory.createCollisionProcessor(
    _.defaults({ mode: 'raycast' }, opts.collisionDetection)  // for sampling start configurations (avoids NavScene co-dependency)
    );

  this.__modifications = opts.modifications;    // scene modifications
  this.__outputDir = opts.outputDir || '.'; // Output directory for debug
  this.__resetCnt = 0; // Reset count
  this.__simOperations = new SimOperations({
    simulator: this,
    rng: opts.rng
  });
  var actionTraceLog = opts.actionTraceLog || opts.logActionTrace;
  if (actionTraceLog) {
    if (typeof(actionTraceLog) !== 'string') {
      actionTraceLog = this.__outputDir + '/action_trace.csv';
    }
    var actionTraceFields = ['tick', 'px', 'py', 'pz', 'rotation', 'actions', 'actionArgs'];
    if (opts.actionTraceLogFields) {
      // Additional fields to log
      for (var i = 0; i < opts.actionTraceLogFields.length; i++) {
        var field = opts.actionTraceLogFields[i];
        if (field === 'forces') {
          actionTraceFields.push('forces');
        } else {
          console.warn('Skipping unknown actionTraceLogField: ' + field);
        }
      }
    }
    this._actionTrace = new ActionTraceLog({
      fs: opts.fs,
      logfile: actionTraceLog ? {
        filename: actionTraceLog,
        fields: actionTraceFields
      } : null
    });
    this._actionTrace.updateConstants( { task: this.opts.task });
    this._actionTrace.updateConstants( { episode: this.__resetCnt });
  }

  if (opts.observations.audio && opts.audio) {
    if (!opts.net) {
      console.error('Attempting to start audio simulator without net.  Not using Audio!');
    } else {
      this.audioSim = new AudioSimulator(_.merge(Object.create(null), opts.audio || {},
        {
          scene: opts.scene,
          net: opts.net,
          fs: opts.fs,
          wav: opts.wav,
          bufferType: opts.bufferType,
          outputDir: opts.outputDir
        }));
      var scope = this;
      this.audioSim.Subscribe('close', this, function () {
        console.warn('AudioSimulator connection closed');
        scope.audioSim = null;
      });
    }
  }

  // async tasks that we are waiting on
  this._waiting = {};
  // dynamic assets
  this._dynamicAssets = [];
  // Sky ground
  this._skyGround = null;
};

Simulator.prototype.__addWaiting = function(id, obj) {
  obj = obj || true;
  this._waiting[id] = obj;
};

Simulator.prototype.__removeWaiting = function(id) {
  delete this._waiting[id];
  if (_.isEmpty(this._waiting)) {
    this.Publish('ready');
  }
};

Simulator.prototype.__waitReady = function(cb) {
  if (_.isEmpty(this._waiting)) {
    cb();
  } else {
    this.SubscribeOnce('ready', this, cb);
  }
};

Simulator.prototype.__preloadData = function(opts) {
  opts = opts || {};
  console.log('preloadData', opts);
  if (opts.loadSceneStatistics && !this.__aggregatedSceneStatistics) {
    // Preload various data that we will need
    this.__addWaiting('loadSceneStatistics');
    var assetGroup = AssetGroups.getAssetGroup('p5dScene');
    this.__aggregatedSceneStatistics = new SceneStatistics();
    this.__aggregatedSceneStatistics.importCsvs({
      fs: this.opts.fs,
      basename: assetGroup.rootPath + '/stats/v4/suncg',
      stats: opts.stats || ['materials', 'relations'],
      callback: function(err, data) {
        if (err) {
          console.warn('Error loading scene statistics', err);
        }
        this.__removeWaiting('loadSceneStatistics');
      }.bind(this)
    });
  }
  if (opts.loadSounds) {
    var assetGroup = AssetGroups.getAssetGroup('p5d');
    console.log('loadSoundSpecs');
    if (!assetGroup.sounds) {
      this.__addWaiting('loadSoundSpecs');
      this.assetManager.loadSoundSpecs(assetGroup, function(err, result) {
        if (err) {
          console.warn('Error loading sound specs', err);
        }
        this.__removeWaiting('loadSoundSpecs');
      }.bind(this));
    }
  }
};

// Helper functions getting observations for each sensor type

Simulator.prototype.__getCameraFrames = function() {
  // We want to have depth observations
  var cameraSensors = this.getAgent().getSensors('camera');
  //console.log('colorSensors', colorSensors);
  var scope = this;
  if (cameraSensors) {
    var results = {};
    _.forEach(cameraSensors, function(sensor, name) {
      // Make sure this sensor is active and observations for it is enabled
      // TODO: Should observation be based on sensor type or sensor name???
      if (scope.opts.observations[sensor.config.name]) {
        results[sensor.config.name] = sensor.getFrame(scope.state.sceneState);
      }
    });
    return results;
  }
};

Simulator.prototype.__getForces = function () {
  if (this.opts.observations.forces) {
    return this.getAgent().getExternalForces();
  }
};

Simulator.prototype.__getAudioBuffer = function(callback) {
  if (this.audioSim) {
    this.audioSim.getAudioBuffer({
      startTime: Math.round(this.state.prevTicks * this.timeStep * 1000),
      endTime: Math.round(this.state.ticks * this.timeStep * 1000)
    },
    function(err, msg) {
      // Don't need to pass certain things back
      // Rename samples to generic data
      // TODO: check status for error!
      var res = _.omit(msg, ['name', 'msgId', 'status', 'samples']);
      res.data = msg.samples;
      res.type = 'audio';
      callback(res);
    });
  } else {
    setTimeout(function() { callback(); }, 0);
  }
};

// API that attempts to match openai's env class
// https://github.com/openai/gym/blob/master/gym/core.py

/**
 * Acts for nframes time step with given action, updates simulator, and returns observations.
 * @param {Object|Object[]} [action] What action or sequence of actions to take.  Each action should have a `name`
 *   and necessary input parameters.  Specific actions supported by Agent is Agent dependent.
 * @param {int} [nframes=1] How many times to repeat the action (and number of ticks to increment).
 * @param {Function} [callback] Error first callback with object containing the following information
 *  observation (object): agent's observation of the current environment
 *  reward (float) : amount of reward returned after previous action
 *  done (boolean): whether the episode has ended, in which case further step() calls will return undefined results
 *  info (dict): contains auxiliary diagnostic information (helpful for debugging, and sometimes learning)
 */
Simulator.prototype.step = function (action, nframes, callback) {
  nframes = nframes || 1;

  if (!this.scene) {
    var message = 'Simulator not ready for step: no scene loaded';
    console.error(message);
    callback(message, null);
    return;
  }

  var scope = this;
  async.waterfall([
    function(cb) {
      scope.act(action, nframes);
      cb();
    },
    function (cb) {
      scope.update(cb);
    },
    function(cb) {
      scope.getObservations(cb);
    }
  ], function (err, result) {
    if (err) {
      console.error('Error stepping simulator.');
      console.error(err);
    }
    callback(err, result);
  });
};

Simulator.prototype._logAction = function(actionname, actionArgs) {
  if (this._actionTrace) {
    var agent = this.getAgent();
    var p = agent.position;
    var r = agent.rotation;
    var rec = [this.state.ticks, p.x, p.y, p.z, r, actionname, actionArgs];

    var forcesIndex = this._actionTrace.logfile.fieldIndices.forces;
    if (forcesIndex >= 0) {
      var forces = this.__getForces();
      if (forces) {
        rec[forcesIndex] = Array.from(forces.data);
      }
    }
    this._actionTrace.push(rec);
  }
};

/**
 * Tells agent to take action.  Action is tracked in action log (before action) and time is updated.
 * The state of the simulator won't be fully updated until `update` is called.
 * @param {Object|Object[]} [action] What action or sequence of actions to take.  Each action should have a `name`
 *   and necessary input parameters.  Specific actions supported by Agent is Agent dependent.
 * @param {int} [nframes=1] How many times to repeat the action (and number of ticks to increment).
 */
Simulator.prototype.act = function (action, nframes) {
  var agent = this.getAgent();
  var actions = Array.isArray(action)? action : [action];

  // Log action that is about to take place
  if (this._actionTrace) {
    var anames = _.map(actions, 'name');
    this._logAction(anames.join('+'));
  }

  // Agent act
  _.forEach(actions, function (a) {
    for (var i = 0; i < nframes; i++) {
      agent.act(a, nframes);
    }
  });

  // Update tick count
  this.state.prevTicks = this.state.ticks;
  this.state.ticks += nframes;
};

/**
 * Updates the scene state after actions.  Collisions and forces are computed.  Audio is notified of updated position of agent.
 * @param {Function} [callback] Callback to call after things are updated.
 */
Simulator.prototype.update = function (callback) {
  if (!this.state.sceneState) {
    if (callback) { callback(); }
    return;
  }
  var agent = this.getAgent();
  var sceneBBox = Object3DUtil.getBoundingBox(this.state.sceneState.fullScene);
  var dt = this.opts.timeStep;
  agent.setPredictedVs(dt);
  if (this.opts.observations.forces) {
    this.__collisionProcessor.computeSensorForces(this.state.sceneState, this.state.agent, dt);
  }
  var response = this.__collisionProcessor.checkForCollision(this.state.sceneState, agent, dt);
  //var beforePosition = JSON.stringify(agent.position);
  //var beforeCanStand = this.__collisionProcessor.isPositionAgentCanStandAt(this.state.sceneState, agent, agent.getAgentFeetAt());
  if (response.collision) {
    // check if first collision response causes second collision, and hackishly kill all velocity
    var secondResponse = this.__collisionProcessor.checkForCollision(this.state.sceneState, agent, dt);
    if (secondResponse.collision) {
      agent.velocity.set(0, 0, 0);
    } else {  // apply first collision response
      agent.velocity.y = 0;  // ignore vertical displacements
      agent.position.addScaledVector(agent.velocity, dt * Constants.metersToVirtualUnit);
    }
    agent.rotation += agent.angularVelocity * dt;
  } else if (!sceneBBox.contains(agent.position)) {
    // TODO: double check this logic, sometimes agent accidentally goes out and can't get back in!
    // check for collisions with scene boundary and hackily push agent back in
    response.collision = true;
    var delta = new THREE.Vector3();
    var c = sceneBBox.centroid();
    delta.subVectors(c, agent.position);
    delta.y = 0;
    delta.normalize();
    agent.position.addScaledVector(delta, dt * Constants.metersToVirtualUnit);
    agent.rotation += agent.angularVelocity * dt;
  } else {
    agent.update(dt);
  }
  // var afterPosition = JSON.stringify(agent.position);
  // var afterCanStand = this.__collisionProcessor.isPositionAgentCanStandAt(this.state.sceneState, agent, agent.getAgentFeetAt());
  // if (beforeCanStand != afterCanStand || !afterCanStand) {
  //   console.log('before', beforePosition, beforeCanStand);
  //   console.log('collisionCheck', response);
  //   console.log('after', afterPosition, afterCanStand);
  // }

  this.state.update(response.collision);
  this._dynamicAssets.forEach(function(x) { x.update(); });

  if (this.audioSim) {
    // Update audio simulator as well
    var receivers = this.state.getAudioReceivers({ op: 'update', baseId: 0});
    this.audioSim.update({endpoints: receivers}, function(err, res) {
      if (callback) { callback(); }
    });
  } else {
    if (callback) { callback(); }
  }
};

Simulator.prototype.getGoalObservations = function(opts, callback) {
  // Get necessary observations for the gaol
  // Save agent position
  var agent = this.getAgent();
  var agentPosition = { position: agent.position.clone(), rotation: agent.angle, isTemporary: true }; // isTemporary indicates other stuff don't really change
  var goals = this.getState().getGoals();
  var scope = this;
  async.map(goals, function(goal, cb) {
    // TODO: Take some sensory input
    // Move agent to goal
    var goalPos = { position: goal.position.clone(), rotation: goal.rotation, isTemporary: true };
    // Set goal position to be at same height as agent
    goalPos.position.y = agent.position.y;  // TODO: handle if goal is on different floor
    //console.log('move agent to goal', goalPos, goal);
    agent.moveTo(goalPos);
    scope.getObservations(cb);
  }, function(err, goalObservations) {
    // Move agent back to original position
    //console.log('move agent to', agentPosition);
    agent.moveTo(agentPosition);
    if (err) {
      callback(err, null);
    } else {
      // Return sensory input
      callback(null, goalObservations);
    }
  });
};

Simulator.prototype.getObservationMetadata = function() {
  var goals = this.state.goals;
  var ngoals = goals.length;
  var measMetadata = {
    'distance_to_goal': { name: 'distance_to_goal', type: 'measurement', shape: [ngoals,1], dataType: 'float32', range: [0,Infinity] },
    'offset_to_goal': { name: 'offset_to_goal', type: 'measurement', shape: [ngoals,3], dataType: 'float32', range: [-Infinity,Infinity] },
    'direction_to_goal': { name: 'direction_to_goal', type: 'measurement', shape: [ngoals,3], dataType: 'float32', range: [-1,1] }
  };
  var sensors = this.getAgent().sensors;
  var sensorMetadata = {};
  var scope = this;
  _.each(sensors, function(sg,st) {
    _.each(sg, function(s) {
      if (st === 'camera') {
        if (scope.opts.observations[s.config.type]) {
          sensorMetadata[s.name] = s.getMetadata();
        }
      } else if (st === 'force') {
        // TODO: API to get forces metadata
        if (scope.opts.observations.forces) {
          sensorMetadata[s.name] = {
            name: s.name, type: 'force',
            shape: [scope.getAgent().__forcesBuffer.length, 1],
            dataType: 'float32',
            dataRange: [-Infinity, Infinity]
          };
        }
      } else if (st === 'audio') {
        // TODO: API to get audio metadata
        var audioSim = scope.audioSim;
        if (audioSim) {
          sensorMetadata[s.name] = {
            name: s.name,
            type: 'audio',
            shape: [s.position.length, audioSim.opts.samplingRate * scope.timeStep, 1],
            dataType: audioSim.opts.datatype,
            dataRange: (audioSim.opts.datatype === 'float32') ? [-1, 1] : [0, 255]
          };
        }
      }
    });
  });
  return { sensors: sensorMetadata, measurements: measMetadata };
};

/**
 * Get observations and convert action response
 * @param {Function} [callback] Error first callback with object containing useful stuff.
 */
Simulator.prototype.getObservations = function (callback) {
  // Collect observations!
  var offsetsToGoal = this.state.offsetsToGoals();
  var agent = this.getAgent();
  var agentPosition = agent.position;
  var agentVelocity = agent.velocity;
  var room = null;
  if (this.navmap) {
    room = this.navmap.getRoom(agentPosition);
  } else {
    var roomIntersect = this.state.sceneState.getIntersectedRoomAt(agentPosition, this.opts.scene.level);
    if (roomIntersect) {
      room = roomIntersect.object;
    }
  }
  var roomInfo = this.state.sceneState.getRoomInfo(room);

  var data = {
    observation: {
      time: this.state.ticks * this.timeStep,
      collision: this.state.lastStepCollided,
      sensors: {},
      measurements: {
        velocity: agentVelocity,
        distance_to_goal: offsetsToGoal.map(function (x) {
          return x.distance;
        }),
        offset_to_goal: _.flatMap(offsetsToGoal, function (x) {
          return x.offset.toArray();
        }),
        direction_to_goal: _.flatMap(offsetsToGoal, function (x) {
          var dir = x.offset.normalize();
          return [dir.x, 0, -dir.z];  // note -z flip due to agent front in -z
        })
      },
      roomInfo: roomInfo
    },
    //reward: 1.0,
    //done: false//,
    info: {
      agent_state: this.getAgent().getState(),
      goal: this.state.getSerializableGoals()
    }
  };

  if (this.state.navscene) {
    var path = this.state.navscene.getShortestPath();
    data.observation.measurements.shortest_path_to_goal = {
      distance: path.distance,
      direction: path.direction
    };
  }

  if (this.opts.observations.map) {
    var encodedMap = this.getEncodedMap();
    if (encodedMap) {
      data.observation.map = encodedMap;
    }
  }

  // Asynchronous stuff (only audio, but pretend other frame are async too)
  var scope = this;
  var sensors = data.observation.sensors;
  async.parallel([
      function(cb) {
        // Audio
        scope.__getAudioBuffer(function(audio) {
          if (!audio) {
            cb(null, audio);
          } else {
            sensors.audio = audio;
            // var samples = audio.data;
            // console.log('original samples', samples);
            // var buf = scope.opts.wav.encode([samples], { sampleRate: 44100, float: false, bitDepth: 16 });
            // scope.opts.fs.writeFileSync('test.wav', buf, { encoding: null });
            cb(null, sensors.audio);
          }
        });
      },
      function(cb) {
        // Forces
        sensors.forces = scope.__getForces();
        setTimeout(function() { cb(null, sensors.forces); }, 0);
      },
      function(cb) {
        // Camera frames
        var cameraFrames = scope.__getCameraFrames();
        //console.log('cameraFrames', cameraFrames);
        if (cameraFrames) {
          _.merge(sensors, cameraFrames);
        }
        setTimeout(function() { cb(null, cameraFrames); }, 0);
      }
    ],
    function (err, results) {
      // Everything ready!
      callback(err, data);
    }
  );
  return data;
};

Simulator.prototype.prepareTopDownMapProjection = function() {
  var sceneState = this.state.sceneState;
  var ViewProjectionGenerator = require('gfx/ViewProjectionGenerator');
  // TODO: acquire renderer using passed in RendererClass
  var renderer =  this.__rendererFactory.getRenderer('simple-2000x2000', { configSet: 'simple', width: 2000, height: 2000 });
  var bbox = Object3DUtil.getBoundingBox(sceneState.scene);
  var agent = this.getAgent();
  var agentFeetPosition = this.getAgent().getAgentFeetAt();
  var floorHeight = agentFeetPosition.y + this.__collisionProcessor.traversableFloorHeight*Constants.metersToVirtualUnit;
  var topHeight = agentFeetPosition.y + agent.height*Constants.metersToVirtualUnit;

  //renderer.renderer.clippingPlanes = Constants.EmptyArray;
  this.__viewProjectionGenerator = this.__viewProjectionGenerator || new ViewProjectionGenerator({
    renderer: renderer,
    overrideMaterial: Object3DUtil.getBasicMaterial('red'),
    cameraPositionStrategy: 'positionToFixedResolution',
    //cameraPositionStrategy: 'positionToFit',
    //camera: this.getAgent().getCamera(),
    camera: {
      type: 'perspective',
      fov: 45,
      near: 0.1,
      far: 1000
    }
  });
  // Get top down view
  var viewBBox = bbox.clone();
  viewBBox.min.y = floorHeight;
  viewBBox.max.y = topHeight;
  var view = this.__viewProjectionGenerator.viewGenerator.getView({ name: 'view', target: viewBBox, viewIndex: 4 /* top view */, pixelWidth: 0.01});
  // TODO: set appropriate clipping planes
  //view.near = view.position[1] - topHeight;
  //view.far = view.position[1] - floorHeight;
  // Position camera and render
  this.topDownMapProjection = this.__viewProjectionGenerator.generate(sceneState.scene,
    {view: view, clipToBox: viewBBox}, this.topDownMapProjection);
  return this.topDownMapProjection;
};

Simulator.prototype.__setSceneState = function(sceneState, callback) {
  this.state.reset(sceneState);

  if (this._actionTrace) {
    var goals = this.state.getGoals();
    this._actionTrace.updateConstants( { sceneId: sceneState.getFullID() });
    for (var i = 0; i < goals.length; i++) {
      var p = goals[i].position;
      var r = goals[i].rotation;
      this._actionTrace.push([this.state.ticks, p.x, p.y, p.z, r, 'goal', goals[i].objectId]);
    }
  }

  if (this.state.sceneState && this.__modifications) {
    // TODO: handle clearing state of scene to initial state before all times of modifications (not just this one)
    this.__simOperations.removeObjects(this.state, function(x) { return x.object3D.userData.inserted; });
    this.__simOperations.modify(this.state, this.__modifications, callback);
  } else {
    callback(null);
  }
};

/**
 * Reset simulator to a new episode.  Start/goals are reinitialized and agent moved to start.
 */
Simulator.prototype.reset = function (callback) {
  if (this._actionTrace && !this._actionTrace.isEmpty()) {
    this._logAction('reset'); // Last action before clearing
    this._actionTrace.clear();
  }

  var scope = this;
  async.waterfall(
    [
      function(cb) {
        if (scope.state.sceneState) {
          scope.__setSceneState(scope.state.sceneState, cb);
        } else {
          setTimeout( function() { cb(); }, 0);
        }
      },
      function(cb) {
        if (scope.audioSim) {
          scope.audioSim.reset();
        }

        scope.__resetCnt++;
        if (scope._actionTrace) {
          scope._actionTrace.updateConstants( { episode: scope.__resetCnt });
        }
        setTimeout( function() { cb(); }, 0);
      }
    ],
    function(err,res) {
      callback(err, scope.state.sceneState);
    }
  )
};

Simulator.prototype.render = function(camera) {
  // render called by SimViewer
  if (!this.renderer || !this.scene) { // NOT ready yet
    return null;
  }

  camera = camera || this.getAgent().getCamera();
  return this.renderer.render(this.scene, camera);
};

/**
 * Closes the simulator.  It should never be used again.
 */
Simulator.prototype.close = function () {
  if (this.audioSim) {
    this.audioSim.close();
  }
  if (this._actionTrace && !this._actionTrace.isEmpty()) {
    this._logAction('reset'); // Last action before clearing
    this._actionTrace.clear();
  }
};

// Configures the simulator
// Use to set scene, level, start, end goal
Simulator.prototype.configure = function (opts) {
  //TODO(MS): use async to block for configure response
  if (this.audioSim) {
    this.audioSim.configure(opts);
  }
  var res = this.state.configure(opts);
  if (opts.modifications) {
    this.__modifications = opts.modifications; // Modifications to be made to the scene
  }
  return _.omit(res, __optsToIgnore);
};

Simulator.prototype.seed = function (seed) {
  // Sets seed used in environments random number generator (for reproducibility)
  // Returns list of seeds used (first value should be main seed)
  console.log('Seeding simulator rng with ' + seed);
  this.__seed = seed;
  this.opts.rng.seed(this.__seed);
  return [seed];
};

/**
 * Start simulator
 * @param callback
 */
Simulator.prototype.start = function (callback) {
  // Create asset manager, load scene
  if (!this.assetManager) {
    this.assetManager = new AssetManager({
      autoAlignModels: false, autoScaleModels: false,
      assetCacheSize: this.opts.assetCacheSize,
      enableLights: this.opts.useLights,
      defaultLightState: this.opts.defaultLightState
    });
    this.assetManager.Subscribe('dynamicAssetLoaded', this, function(d) {
      console.log('adding to dynamic assets', d);
      this._dynamicAssets.push(d);
    }.bind(this));
  }
  this.__simOperations.init();
  var preloadOpts = {
    loadSceneStatistics: !!this.state.opts.scene.retexture,
    loadSounds: !!this.audioSim
  };
  this.__preloadData(preloadOpts);
  var scope = this;
  this.__waitReady(function() {
    scope.state.clear();
    scope.reset(function(err, sceneState) {
      scope.__loadScene(scope.state.opts, callback);
    });
  });
};

Simulator.prototype.__clearScene = function() {
  // Clear dynamic assets
  this._dynamicAssets.forEach(function(x) { x.destroy(); });
  this._dynamicAssets = [];  // Clears dynamic assets

  // Clear scene
  if (this.scene) {
    Object3DUtil.dispose(this.scene);
    this.scene = null; // Invalidate old scene
  }
};

Simulator.prototype.__updateSkyGround = function(sceneState) {
  if (this.opts.useSky) {
    if (!this._skyGround) {
      this._skyGround = new SkyGround();
    }
    this.scene.add(this._skyGround);
    this.scene.fog = this._skyGround.fog;
    this._skyGround.position.copy(
      Object3DUtil.getBBoxFaceCenter(sceneState.fullScene, Constants.BBoxFaceCenters.BOTTOM));
  }
};

Simulator.prototype.__loadScene = function (opts, callback) {
  console.log('Loading scene ', opts.scene ? opts.scene.fullId : 'unknown');
  this.__clearScene();

  var scene = new THREE.Scene();
  var intensity = this.assetManager.enableLights ? 0.5 : 2.0;  // set low if interior lights turned on
  var light = new THREE.HemisphereLight(0xffffff, 0x202020, intensity);
  //scene.add(light);
  //scene.add(this.getAgent().getObject());
  if (window) { window.scene = scene; }  // NOTE: for debugging with three.js inspector
  var scope = this;
  var preloads = ['regions'];
  if (this.opts.navmap && this.opts.navmap.recompute !== true) {
    // recompute true = force recomputation of navmap
    // otherwise, load if it exists
    preloads.push(this.opts.navmap.mapName || 'navmap');
    // TODO: enforce recompute false = no recomputation, only use precomputed
    //               recompute undefined = use precomputed, recompute as needed
  }
  //console.log('got preloads', preloads);
  var defaults = { includeCeiling: true, preload: preloads,
    modelMetadata: { userData: { isSupportObject: true } },
    textureSet: 'all', texturedObjects: Constants.defaultTexturedObjects };
  var sceneOpts = _.defaultsDeep({}, opts.scene, defaults);
  console.time('Timing loadScene');
  this.assetManager.loadAssetAsScene(sceneOpts, function (err, sceneState) {
    console.timeEnd('Timing loadScene');
    if (!sceneState) {
      console.error('Cannot load scene', _.omit(opts, __optsToIgnore));
      callback(err, sceneState);
      return;
    }

    //console.log(sceneState);
    sceneState.compactify();  // Make sure that there are no missing models
    scene.name = sceneState.getFullID();
    scene.add(sceneState.fullScene);
    var sceneBBox = Object3DUtil.getBoundingBox(sceneState.fullScene);
    sceneState.fullScene.add(light);
    sceneState.fullScene.add(scope.getAgent().getObject());
    var bbdims = sceneBBox.dimensions();
    console.log('Loaded ' + sceneState.getFullID() +
        ' bbdims: [' + bbdims.x + ',' + bbdims.y + ',' + bbdims.z + ']');
    scope.scene = scene;
    scope.__updateSkyGround(sceneState);

    if (scope.renderer && scope.renderer.useShadows) {
      console.log('using shadows');
      Object3DUtil.setCastShadow(sceneState.fullScene, true);
      Object3DUtil.setReceiveShadow(sceneState.fullScene, true);
    }

    // Whether to have mirrors
    if (sceneOpts.enableMirrors) {
      console.log('Enabling mirrors');
      Object3DUtil.addMirrors(sceneState.scene, {
        ignoreSelfModel: true,
        renderer: scope.renderer.renderer,
        assetManager: scope.assetManager,
        camera: scope.getAgent().getCamera(),
        width: scope.renderer.width,
        height: scope.renderer.height
      });
    }
    if (sceneOpts.retexture) {
      console.log('Retexture scene');
      SceneUtil.recolorWithCompatibleMaterials(sceneState, {
        rng: scope.opts.rng,
        textureOnly: false,
        textureSet: sceneOpts.textureSet,
        texturedObjects: sceneOpts.texturedObjects,
        assetManager: scope.assetManager,
        aggregatedSceneStatistics: scope.__aggregatedSceneStatistics
      });
    }

    scope.__setSceneState(sceneState, function(err, ss) {
      if (scope.audioSim) {
        // Local configure
        console.time('Timing startAudio');
        var receivers = scope.state.getAudioReceivers({ op: 'create', baseId: 0});
        // Stupid audio simulator requires sound sources be inside walls
        var sources = scope.state.getAudioSources({ op: 'create', baseId: receivers.length, keepInsideWalls: true });
        scope.audioSim.configure({endpoints: _.concat(receivers, sources)});
        scope.audioSim.start(function () {
          //TODO(MS): improve error handling
          console.timeEnd('Timing startAudio');
          scope.Publish('SceneLoaded', sceneState);
          callback(err, sceneState);
        });
      } else {
        scope.Publish('SceneLoaded', sceneState);
        callback(err, sceneState);
      }
    });
  });
};

/**
 * Returns top down nav map of current level as image
 * @param opts
 */
Simulator.prototype.getEncodedMap = function(opts) {
  if (this.state.navscene) {
    return this.state.navscene.getEncodedMap(opts);
  }
};

Simulator.prototype.getEpisodeInfo = function(opts, callback) {
  // Returns information about the environment/goals/etc
  var summary = this.state.getSummary();
  summary.task = this.opts.task;
  if (summary.goal) {
    this.getGoalObservations(opts, function (err, goalObservations) {
      if (goalObservations && goalObservations.length > 0) {
        summary.goalObservations = goalObservations;
      }
      callback(null, summary);
    });
  } else {  // No goal to observe
    callback(null, summary);
  }
  return summary;
};

// Returns main active agent to be controlled by the user
Simulator.prototype.getAgent = function () {
  return this.state.agent;
};

// Returns simulator state
Simulator.prototype.getState = function () {
  return this.state;
};

// Returns simulator action trace
Simulator.prototype.getActionTrace = function () {
  return this._actionTrace.data;
};

// Returns if simulator is ready for action!
Simulator.prototype.isReady = function() {
  // Ready if we have a scene ready to go!
  return this.scene;
};

module.exports = Simulator;
