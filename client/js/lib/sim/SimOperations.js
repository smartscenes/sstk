var SceneOperations = require('scene/SceneOperations');
var SimUtil = require('sim/SimUtil');
var ImageUtil = require('util/ImageUtil');
var Picker = require('controls/Picker');
var _ = require('util');
var async = require('async');

/**
 * Different operations supported by the simulator
 * Typically involve agent action on the environment (changes in both agent + scenestate)
 * @constructor
 * @memberOf sim
 */
function SimOperations(opts) {
  this.simulator = opts.simulator;
  this.picker = new Picker();
  this.rng = opts.rng;
}

SimOperations.selectFirst = function(res) {
  if (res && res.length) {
    return res[0];
  }
};

SimOperations.selectRandom = function(res, opts) {
  if (res && res.length) {
    return opts.rng.choice(res);
  }
};

SimOperations.selectors = {
  'first': SimOperations.selectFirst,
  'random': SimOperations.selectRandom
}

SimOperations.prototype.init = function() {
  this.__sceneOperations = new SceneOperations({
    assetManager: this.simulator.assetManager
  });
};

/**
 * Performs a set of modifications on the scene
 * @param simState {SimState}
 * @param modifications
 * @param callback
 */
SimOperations.prototype.modify = function(simState, modifications, callback) {
  if (!_.isArray(modifications)) {
    modifications = [modifications];
  }
  var scope = this;
  console.log('modifications', modifications);
  async.forEachSeries(modifications, function(modification, cb) {
    scope.__modify(simState, modification, cb);
  }, callback);
};

/**
 * Performs one modification on the scene
 * @param simState
 * @param modification
 * @param cb
 */
SimOperations.prototype.__modify = function(simState, modification, cb) {
  var scope = this;
  if (modification.name === 'add') {
    if (modification.positionAt === 'goal') {
      // Position at goal
      var goals = simState.getGoals();
      if (goals.length) {
        var updatedModifications = _.map(goals, function(g) {
          var m = _.clone(modification);
          m.positionAt = g.position;
          if (m.rotation == undefined) {
            m.rotation = g.rotation;
          }
          return m;
       });
        this.modify(simState, updatedModifications, cb);
      } else {
        cb('Cannot place without goals');
      }
      return;
    }

    var prepareModelInstance = function(modelInstance) {
      scope.__sceneOperations.prepareModelInstance(modelInstance, {
        useShadows: scope.simulator.useShadows,
        enableMirrors: scope.simulator.enableMirrors // TODO: these are scene options
      });
      // Have attachment point
      modelInstance.setAttachmentPoint({ position: new THREE.Vector3(0.5, 0, 0.5), coordFrame: 'childBB' });
      modelInstance.object3D.userData.inserted = true;
    };
    var placementOptions = _.defaults(_.pick(modification, ['positionAt', 'rotation', 'format']),
      { anchorFrame: 'objectOrigin', prepareModelInstance: prepareModelInstance });
    if (modification.select) {
      placementOptions.objectSelector = SimOperations.selectors;
    }
    if (placementOptions.rotation === 'random') {
      placementOptions.rotation = this.rng.random() * 2 * Math.PI;
    }
    if (modification.modelIds) {
      this.addObjectWithId(simState, modification.modelIds, placementOptions, cb);
    } else if (modification.keywords) {
      this.addObjectWithKeywords(simState, modification.keywords, placementOptions, cb);
    } else if (modification.categories) {
      this.addObjectWithCategory(simState, modification.categories, placementOptions, cb);
    } else if (modification.query) {
      this.addQueriedObject(simState, modification.categories, placementOptions, cb);
    } else {
      cb('Please specify modelIds, keywords, categories, or query for add');
    }
  } else if (modification.name === 'remove') {
    if (modification.modelIds) {
      this.removeObjects(simState, function(modelInstance) { return modification.modelIds.indexOf(modelInstance.model.getFullID()) >= 0; }, cb);
    } else if (modification.objectIds) {
      this.removeObjects(simState, function(modelInstance) { return modification.objectIds.indexOf(modelInstance.object3D.userData.id) >= 0; }, cb);
    } else if (modification.categories) {
      this.removeObjects(simState, function(modelInstance) { return modelInstance.model.hasCategoryIn(modification.categories); }, cb);
    } else if (modification.filter) {
      this.removeObjects(simState, modification.filter, cb);
    } else {
      cb('Please specify modelIds, objectIds, categories, or filter for remove');
    }
  } else {
    cb('Unsupported operation ' + modification.name);
  }
};

/**
 * Removes objects matching filter condition
 * @param simState {SimState}
 * @param filter {function(ModelInstance)}
 * @param cb
 */
SimOperations.prototype.removeObjects = function(simState, filter, cb) {
  this.__sceneOperations.removeObjects({ sceneState: simState.sceneState, filter: filter });
  if (cb) { cb(); }
};

/**
 * Find and returns modelids from database
 * @param simState {SimState}
 * @param query
 * @param cb
 */
SimOperations.prototype.findModelsInDb = function(simState, query, cb) {
  var assetManager = this.simulator.assetManager;
  assetManager.searchController.search(query, function(source, res) {
    console.log('objects found for ' + query, res, source);
    cb(null, res);
  });
};

/**
 * Add object with specified modelId to scene
 * @param simState {SimState}
 * @param modelIds {string[]}
 * @param options {PlacementOption}
 * @param cb
 */
SimOperations.prototype.addObjectWithId = function(simState, modelIds, options, cb) {
  if (!_.isArray(modelIds)) { modelIds = [modelIds]; }
  var scope = this;
  // Let's just pick the first one
  var objectSelector = options.objectSelector || SimOperations.selectFirst;
  var selected = objectSelector(modelIds, { rng: this.rng} );
  if (selected) {
    var fullId = selected;
    this.__sceneOperations.createObject(_.defaults({ sceneState: simState.sceneState, fullId: fullId,
      callback: function(err, mi) {
        cb(err, mi);
      }
    }, options));
  } else {
    cb(err || 'Cannot find any matching object models');
  }
};

/**
 * Query and add object to scene
 * @param simState {SimState}
 * @param query {string}
 * @param options {PlacementOption}
 * @param cb
 */
SimOperations.prototype.addQueriedObject = function(simState, query, options, cb) {
  var scope = this;
  // Let's just pick the first one
  var objectSelector = options.objectSelector || SimOperations.selectFirst;
  this.findModelsInDb(simState, query, function(err, res) {
    var selected = objectSelector(res, { rng: this.rng} );
    if (selected) {
      var fullId = selected.fullId;
      scope.__sceneOperations.createObject(_.defaults({ sceneState: simState.sceneState, fullId: fullId,
        callback: function(err, mi) {
          cb(err, mi);
        }
      }, options));
    } else {
      cb(err || 'Cannot find any matching object models');
    }
  });
};

/**
 * Add object to scene with specified category
 * @param simState {SimState}
 * @param categories {string[]}
 * @param options {PlacementOption}
 * @param cb
 */
SimOperations.prototype.addObjectWithCategory = function(simState, categories, options, cb) {
  if (!_.isArray(categories)) { categories = [categories]; }
  var assetManager = this.simulator.assetManager;
  var query = assetManager.searchController.getQuery('category', categories.concat(_.map(categories, function(x) { return _.upperFirst(x); })));
  this.addQueriedObject(simState, query, options, cb);
};

/**
 * Add object to scene with specified keywords
 * @param simState {SimState}
 * @param keywords {string[]}
 * @param options {PlacementOption}
 * @param cb
 */
SimOperations.prototype.addObjectWithKeywords = function(simState, keywords, options, cb) {
  if (!_.isArray(keywords)) { keywords = [keywords]; }
  var assetManager = this.simulator.assetManager;
  var query = assetManager.searchController.getQuery('text', keywords);
  this.addQueriedObject(simState, query, options, cb);
};

/**
 * Find object in bag matching filter
 * @param simState {SimState}
 * @param filter {Function}
 */
SimOperations.prototype.findObjectsInBag = function(simState, filter) {
  return simState.agent.checkBag(filter);
};

/**
 * Find object in bag matching category
 * @param simState {SimState}
 * @param categories {string[]}
 */
SimOperations.prototype.findObjectsInBagByCategory = function(simState, categories) {
  return simState.agent.checkBag(function(mInst) {
    return mInst.model.hasCategoryIn(categories);
  });
};

/**
 * Find object in view matching filter
 * @param simState {SimState}
 * @param sensedObjects
 * @param filter {Function}
 */
SimOperations.prototype.findObjectsInView = function(simState, sensedObjects, filter) {
  return SimUtil.findObjects(simState, sensedObjects, filter);
};

/**
 * Find object in view matching category
 * @param simState {SimState}
 * @param sensedObjects
 * @param categories {string[]}
 */
SimOperations.prototype.findObjectsInViewByCategory = function(simState, sensedObjects, categories, includeOtherObjects) {
  return SimUtil.findObjectsByCategory(simState, sensedObjects, categories, includeOtherObjects);
};

/**
 * Moves object in the scene and places at targetPosition
 * @param simState {SimState}
 * @param obj {{node: THREE.Object3D, modelInstance: ModelInstance}}
 * @param movementOptions
 */
SimOperations.prototype.move = function(simState, obj, movementOptions) {
  // TODO: Check if object will collide
  // Move object in scene
  this.__sceneOperations.placeObject(_.defaults({
    sceneState: simState.sceneState,
    object3D: obj.node,
    modelInstance: obj.modelInstance
  }, movementOptions));
};

/**
 * Rotate object in the scene
 * @param simState {SimState}
 * @param obj {{node: THREE.Object3D, modelInstance: ModelInstance}}
 * @param rotateOptions
 */
SimOperations.prototype.rotate = function(simState, obj, rotateOptions) {
  // TODO: Check if object will collide
  // Rotate object in scene
  this.__sceneOperations.rotateObject(_.defaults({
    sceneState: simState.sceneState,
    object3D: obj.node,
    modelInstance: obj.modelInstance
  }, rotateOptions));
};

/**
 * Agent tries to look at obj
 * @param simState {SimState}
 * @param obj
 */
SimOperations.prototype.look = function(simState, obj) {
  throw 'Please implement me!';
};

/**
 * Takes something from the scene and puts it into our agent bag
 * @param simState {SimState}
 * @param obj {{node: THREE.Object3D, modelInstance: ModelInstance}} Object to act on
 */
SimOperations.prototype.take = function(simState, obj) {
  // TODO: Check if agent has space and can physically handle the object
  this.__sceneOperations.removeObject({
    sceneState: simState.sceneState,
    object3D: obj.node,
    modelInstance: obj.modelInstance
  });
  simState.agent.store(obj.modelInstance);
};

/**
 * Put something from agent bag back into the scene
 * @param simState {SimState}
 * @param obj {{node: THREE.Object3D, modelInstance: ModelInstance}} Object to act on
 * @param targetPosition
 */
SimOperations.prototype.putDown = function(simState, obj, targetPosition) {
  var modelInstance = obj.modelInstance;
  var placementOpts = {
    sceneState: simState.sceneState,
    modelInstance: modelInstance
  };
  if (targetPosition) {
    placementOpts = _.defaults(placementOpts, targetPosition);
  }
  this.__sceneOperations.placeObject(placementOpts);
  simState.agent.putDown(modelInstance);
};

/**
 * Do something with object
 * @param simState {SimState}
 * @param obj {{node: THREE.Object3D, modelInstance: ModelInstance}} Object to act on
 * @param action
 * @returns {{capability, state}}
 */
SimOperations.prototype.actOnObject = function(simState, obj, action) {
  return this.__sceneOperations.actOnObject({
    object3D: obj.node,
    modelInstance: obj.modelInstance,
    action: action
  });
};

function scoreObjectSupport(objectPixel, normalPixel, offset, targetNormal, objectScorer) {
  var objectId = ImageUtil.decodePixelValue(objectPixel, offset);
  var normal = ImageUtil.decodeNormal(normalPixel, offset);
  var normalSim = targetNormal.dot(normal);
  var s = normalSim*objectScorer(objectId);
  return Math.pow(s, 3);
}

function scoreObjectById(sensedObjects, obj) {
  var objIndex = sensedObjects.index.indexOf(obj.id);
  return function(v) { return (objIndex === v)? 1 : 0; };
}

function scoreObjectByIds(sensedObjects, objs) {
  var objIndices = _.map(objs, function(obj) { return sensedObjects.index.indexOf(obj.id) });
  // TODO: Have the final score be proportional to the pixel count
  return function(v) { return (objIndices.indexOf(v) >= 0)? 1 : 0; };
}

SimOperations.prototype.samplePositionOnObjects = function(simState, sensedObjects, normals, objs, objectScorer) {
  var sampler = this.simulator.sampler;
  var normalPixels = new Uint8Array(normals.data);
  var objectPixels = new Uint8Array(sensedObjects.data);
  var targetNormal = new THREE.Vector3(0,1,0);
  var sampled = sampler.sample({
    elements: _.getIterator(0, objectPixels.length, 4),
    scorer: function(i) {
      return scoreObjectSupport(objectPixels, normalPixels, i, targetNormal, objectScorer);
    }
  });
  var sampledPixelBufferOffset = sampled.value;
  var sampledObjectIndex = ImageUtil.decodePixelValue(objectPixels, sampledPixelBufferOffset);
  var sampledNormal = ImageUtil.decodeNormal(normalPixels, sampledPixelBufferOffset);
  console.log('sample', sampled, sampledObjectIndex, sensedObjects.index[sampledObjectIndex], sampledNormal);
  var v2 = ImageUtil.offsetToVector2(sampledPixelBufferOffset/4, sensedObjects.shape[0], sensedObjects.shape[1], true);
  var obj = _.find(objs, function(x) { return x.id === sensedObjects.index[sampledObjectIndex]; });
  if (obj) {
    var sensor = simState.agent.getCameraSensor('objectId');
    var intersected = this.picker.getFirstIntersected(v2.x, v2.y, sensor.camera, [obj.node]);
    //console.log('intersected', v2, intersected);
    if (intersected) {
      intersected.targetObject = obj;
    }
    //console.log('intersected', intersected);
    return intersected;
  }
};

SimOperations.prototype.findPlacementPosition = function(simState, sensedObjects, normals, categories) {
  var targetObjs = this.findObjectsInViewByCategory(simState, sensedObjects, categories, true);
  if (targetObjs.length <= 0) {
    return { error: "No matching " + categories };
  } else {
    // TODO: Sample pixel point with given targetObj and try to place object there
    var objectScorer = scoreObjectByIds(sensedObjects, targetObjs);
    var sampled = this.samplePositionOnObjects(simState, sensedObjects, normals, targetObjs, objectScorer);
    if (sampled) {
      return { object: sampled.targetObject, position: sampled.point };
    } else {
      return { error: "No placement possible" };
    }
  }
};


module.exports = SimOperations;