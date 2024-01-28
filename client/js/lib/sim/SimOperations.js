var Constants = require('Constants');
var SceneOperations = require('scene/SceneOperations');
var SimUtil = require('sim/SimUtil');
var ImageUtil = require('util/ImageUtil');
var Picker = require('controls/Picker');
var Object3DUtil = require('geo/Object3DUtil');
var _ = require('util/util');
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
};

SimOperations.prototype.init = function() {
  this.__sceneOperations = new SceneOperations({
    assetManager: this.simulator.assetManager
  });
};

/**
 * Performs a set of modifications on the scene
 * @param simState {SimState}
 * @param modifications {sim.ModificationCmd[]}
 * @param callback Error first callback
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
 * Information about modification to apply.
 * @memberOf sim
 * @typedef ModificationCmd
 * @type {sim.AddModificationCmd|sim.RemoveModificationCmd|sim.ColorModificationCmd|sim.SetMaterialModificationCmd}
 * @property {string} name - Name of the modification (`add|remove|color|set_material`)
 */

/**
 * Command to add objects to the scene (specify one of modelIds, keywords, categories, and query)
 * @memberOf sim
 * @typedef AddModificationCmd
 * @type {object}
 * @property {string} name - Name of the modification (`add`)
 * @property {string[]} [modelIds] - The new object should match one of the modelIds
 * @property {string[]} [keywords] - The new object should match (one of?) the given keywords
 * @property {string[]} [categories] - The new object should match (one of?) the given categories
 * @property {string} [query] - Custom solr query to use for searching for the object
 * @property {string|THREE.Vector3} positionAt - Where to position the object at ('goal' or 3D position)
 * @property {number|string} [rotation] - Rotation about vertical ('random' or radians)
 * @property {string} [format] - What format to use for the fetched model
 */

/**
 * Command to removes objects from the scene (specify one of objectIds, modelIds, categories, and filter)
 * @memberOf sim
 * @typedef RemoveModificationCmd
 * @type {object}
 * @property {string} name - Name of the modification (`remove`)
 * @property {string[]} [objectIds] - List of object ids to operate on
 * @property {string[]} [modelIds] - List of model ids to operate on
 * @property {string[]} [categories] - List of categories to operate on
 * @property {function(ModelInstance): boolean} [filter] - Filter indicating what objects to operate on
 */

/**
 * Command to color objects with a specific color (specify one of objectIds, modelIds, categories, and filter)
 * @memberOf sim
 * @typedef ColorModificationCmd
 * @type {object}
 * @property {string} name - Name of the modification (`color`)
 * @property {string[]} [objectIds] - List of object ids to operate on
 * @property {string[]} [modelIds] - List of model ids to operate on
 * @property {string[]} [categories] - List of categories to operate on
 * @property {function(THREE.Object3D): boolean} [filter] - Filter indicating what objects to operate on
 */

/**
 * Command to set material of objects with a specific material (specify one of objectIds, modelIds, categories, and filter)
 * @memberOf sim
 * @typedef SetMaterialModificationCmd
 * @type {object}
 * @property {string} name - Name of the modification (`set_material`)
 * @property {string[]} [objectIds] - List of object ids to operate on
 * @property {string[]} [modelIds] - List of model ids to operate on
 * @property {string[]} [categories] - List of categories to operate on
 * @property {function(THREE.Object3D): boolean} [filter] - Filter indicating what objects to operate on
 * @property {materials.MaterialDef} [material] - Specification of what material to apply
 */

/**
 * Performs one modification on the scene
 * @param simState {sim.SimState}
 * @param modification {sim.ModificationCmd}
 * @param cb Error first callback function.
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
    } else if (modification.positionAt) {  // assume convertible to THREE.Vector3
      modification.positionAt = Object3DUtil.toVector3(modification.positionAt);
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
      this.addQueriedObject(simState, modification.query, placementOptions, cb);
    } else {
      cb('Please specify modelIds, keywords, categories, or query for add');
    }
  } else if (modification.name === 'remove') {
    if (modification.objectIds) {
      this.removeObjects(simState, function(modelInstance) { return modification.objectIds.indexOf(modelInstance.object3D.userData.id) >= 0; }, cb);
    } else if (modification.modelIds) {
      this.removeObjects(simState, function(modelInstance) { return modification.modelIds.indexOf(modelInstance.model.getFullID()) >= 0; }, cb);
    } else if (modification.categories) {
      this.removeObjects(simState, function(modelInstance) { return modelInstance.model.hasCategoryIn(modification.categories); }, cb);
    } else if (modification.filter) {
      this.removeObjects(simState, modification.filter, cb);
    } else {
      cb('Please specify modelIds, objectIds, categories, or filter for remove');
    }
  } else if (modification.name === 'color') {
    var color = modification.color;
    if (color == undefined) {
      cb('Please specify color to use');
      return;
    }
    if (modification.objectIds) {
      this.colorObjects(this.findObjectsInSceneByObjectId(simState, modification.objectIds), color, cb);
    } else if (modification.modelIds) {
      this.colorObjects(this.findObjectsInSceneByModelId(simState, modification.modelIds), color, cb);
    } else if (modification.categories) {
      this.colorObjects(this.findObjectsInSceneByCategory(simState, modification.categories), color, cb);
    } else if (modification.filter) {
      this.colorObjects(this.findObjectsInScene(simState, modification.filter), color, cb);
    } else {
      cb('Please specify modelIds, objectIds, categories, or filter for color');
    }
  } else if (modification.name === 'set_material' || modification.name === 'setMaterial') {
    if (modification.material == undefined) {
      cb('Please specify material to use');
      return;
    }
    var material = (modification.material instanceof THREE.Material)? modification.material : Object3DUtil.createMaterial(modification.material);
    if (modification.objectIds) {
      this.setObjectMaterial(this.findObjectsInSceneByObjectId(simState, modification.objectIds), material, cb);
    } else if (modification.modelIds) {
      this.setObjectMaterial(this.findObjectsInSceneByModelId(simState, modification.modelIds), material, cb);
    } else if (modification.categories) {
      this.setObjectMaterial(this.findObjectsInSceneByCategory(simState, modification.categories), material, cb);
    } else if (modification.filter) {
      this.setObjectMaterial(this.findObjectsInScene(simState, modification.filter), material, cb);
    } else {
      cb('Please specify modelIds, objectIds, categories, or filter for ' + modification.name);
    }
  } else {
    cb('Unsupported operation ' + modification.name);
  }
};

/**
 * Color specified objects
 * @param objects {Array<THREE.Object3D[]|{node: THREE.Object3D}>}
 * @param color {THREE.Color}}
 * @param cb Error first callback function
 */
SimOperations.prototype.colorObjects = function(objects, color, cb) {
  var object3Ds = _.map(objects, function(x) { return (x instanceof THREE.Object3D)? x : x.node; });
  var material = Object3DUtil.getStandardMaterial(color);
  this.__sceneOperations.setObjectMaterial({ objects: object3Ds, material: material });
  if (cb) { cb(); }
};

/**
 * Set object material
 * @param objects {Array<THREE.Object3D|{node: THREE.Object3D}>}
 * @param material {THREE.Material}}
 * @param cb Error first callback function
 */
SimOperations.prototype.setObjectMaterial = function(objects, material, cb) {
  var object3Ds = _.map(objects, function(x) { return (x instanceof THREE.Object3D)? x : x.node; });
  this.__sceneOperations.setObjectMaterial({ objects: object3Ds, material: material });
  if (cb) { cb(); }
};

/**
 * Removes objects matching filter condition
 * @param simState {SimState}
 * @param filter {function(ModelInstance)}
 * @param cb Error first callback function returning array of objects that were removed
 */
SimOperations.prototype.removeObjects = function(simState, filter, cb) {
  var removed = this.__sceneOperations.removeObjects({ sceneState: simState.sceneState, filter: filter });
  if (cb) { cb(null, removed); }
};

/**
 * Find and returns modelids from database
 * @param simState {SimState}
 * @param query {string}
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
 * Select model from database
 * @param simState {SimState}
 * @param query {string}
 * @param options
 * @param cb
 */
SimOperations.prototype.selectModelInDb = function(simState, query, options, cb) {
  options = options || {};
  var scope = this;
  var objectSelector = options.objectSelector || SimOperations.selectFirst;
  this.findModelsInDb(simState, query, function(err, res) {
    var selected = objectSelector(res, { rng: scope.rng} );
    //console.log('selected', selected, res);
    if (selected) {
      cb(null, selected);
    } else {
      cb(err || 'Cannot find any matching object models');
    }
  });
};

/**
 * Add object with specified modelId to scene
 * @param simState {SimState}
 * @param modelIds {string[]}
 * @param options {PlacementOption}
 * @param cb {addObjectCallback}
 */
SimOperations.prototype.addObjectWithId = function(simState, modelIds, options, cb) {
  if (!_.isArray(modelIds)) { modelIds = [modelIds]; }
  var scope = this;
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
    cb('Cannot find any matching object models');
  }
};

/**
 * Query and add object to scene
 * @param simState {SimState}
 * @param query {string}
 * @param options {PlacementOption}
 * @param cb {addObjectCallback}
 */
SimOperations.prototype.addQueriedObject = function(simState, query, options, cb) {
  var scope = this;
  var objectSelector = options.objectSelector || SimOperations.selectFirst;
  this.findModelsInDb(simState, query, function(err, res) {
    var selected = objectSelector(res, { rng: scope.rng} );
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

SimOperations.prototype.getQueryForCategories = function(categories) {
  if (!_.isArray(categories)) { categories = [categories]; }
  var assetManager = this.simulator.assetManager;
  var query = assetManager.searchController.getQuery('category', categories.concat(_.map(categories, function(x) { return _.upperFirst(x); })));
  return query;
};

/**
 * Add object to scene with specified category
 * @param simState {SimState}
 * @param categories {string[]}
 * @param options {PlacementOption}
 * @param cb
 */
SimOperations.prototype.addObjectWithCategory = function(simState, categories, options, cb) {
  var query = this.getQueryForCategories(categories);
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
    return mInst.model.hasCategoryIn(categories, true);
  });
};

/**
 * Find object in view matching filter
 * @param simState {SimState}
 * @param sensedObjects {sim.sensors.SemanticSensor.Frame}
 * @param filter {Function}
 */
SimOperations.prototype.findObjectsInView = function(simState, sensedObjects, filter) {
  return SimUtil.findObjects(simState, sensedObjects, filter);
};

/**
 * Find object in view matching category
 * @param simState {SimState}
 * @param sensedObjects {sim.sensors.SemanticSensor.Frame}
 * @param categories {string[]}
 * @param includeOtherObjects {boolean} Whether non model instances (wall/ceilings/floors) are included
 * @returns {Array<{id: string, node: THREE.Object3D, modelInstance: ModelInstance}>}
 */
SimOperations.prototype.findObjectsInViewByCategory = function(simState, sensedObjects, categories, includeOtherObjects) {
  return SimUtil.findObjectsByCategory(simState, sensedObjects, categories, includeOtherObjects);
};

SimOperations.prototype.findObjectsInViewById = function(simState, sensedObjects, ids) {
  return SimUtil.findObjects(simState, sensedObjects, function(x) {
    return ids.indexOf(x.node.userData.id) >= 0;
  });
};

/**
 * Find object in scene matching filter
 * @param simState {SimState}
 * @param filter {Function}
 */
SimOperations.prototype.findObjectsInScene = function(simState, filter) {
  var nodes = simState.sceneState.findNodes(filter);
  var objectInfos = nodes.map(function(node) {
    return {
      id: node.userData.id,
      node: node,
      modelInstance: Object3DUtil.getModelInstance(node)
    };
  });
  objectInfos = _.sortBy(objectInfos, 'id');
  return objectInfos;
};

/**
 * Find object in scene matching category
 * @param simState {SimState}
 * @returns {Array<{id: string, node: THREE.Object3D, modelInstance: ModelInstance}>}
 */
SimOperations.prototype.findObjectsInSceneByCategory = function(simState, categories, includeOtherObjects) {
  return this.findObjectsInScene(simState, function(node) {
    return Object3DUtil.filterByCategory(node, categories, includeOtherObjects);
  });
};

/**
 * Find object in scene matching object id
 * @param simState {SimState}
 * @returns {Array<{id: string, node: THREE.Object3D, modelInstance: ModelInstance}>}
 */
SimOperations.prototype.findObjectsInSceneByObjectId = function(simState, ids) {
  return this.findObjectsInScene(simState, function(node) {
    return ids.indexOf(node.userData.id) >= 0;
  });
};

/**
 * Find object in scene matching model id
 * @param simState {SimState}
 * @returns {Array<{id: string, node: THREE.Object3D, modelInstance: ModelInstance}>}
 */
SimOperations.prototype.findObjectsInSceneByModelId = function(simState, ids) {
  return this.findObjectsInScene(simState, function(node) {
    var modelInstance = Object3DUtil.getModelInstance(node);
    return modelInstance && ids.indexOf(modelInstance.model.info.fullId) >= 0;
  });
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
 * @param action {string} Action name
 * @param [args] {Array} Arguments to action
 * @returns {{capability, state}}
 */
SimOperations.prototype.actOnObject = function(simState, obj, action, args) {
  return this.__sceneOperations.actOnObject({
    object3D: obj.node,
    modelInstance: obj.modelInstance,
    action: action,
    arguments: args
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
  var objIndices = _.map(objs, function(obj) { return sensedObjects.index.indexOf(obj.id); });
  // TODO: Have the final score be proportional to the pixel count
  return function(v) { return (objIndices.indexOf(v) >= 0)? 1 : 0; };
}

/**
 * Sample a reasonable position for object
 * @param simState {SimState}
 * @param observations Set of visual observations as context for placement
 * @param observations.objectId {sim.sensors.SemanticSensor.Frame} observations by object id
 * @param observations.normal {sim.sensors.NormalSensor.Frame} normal observations
 * @param objs {Array<{id: string, node: THREE.Object3D, modelInstance: ModelInstance, count: number}>}
 * @param constraints Additional constraints on the placement of the objects
 * @param constraints.supportSurfaceNormal {THREE.Vector3} Target support surface normal
 * @param [constraints.childBoundingBoxDims] estimated object bounding box dimensions for child object
 * @param objectScorer {function(string): number} Scores a object by the object id
 * @returns {*}
 */
SimOperations.prototype.samplePositionOnObjects = function(simState, observations, objs, constraints, objectScorer) {
  var sensedObjects = observations.objectId;
  var sampler = this.simulator.sampler;
  var normalPixels = new Uint8Array(observations.normal.data);
  var objectPixels = new Uint8Array(sensedObjects.data);
  var samples = sampler.sample({
    elements: _.getIterator(0, objectPixels.length, 4),
    nsamples: 20,
    scorer: function(i) {
      return scoreObjectSupport(objectPixels, normalPixels, i, constraints.supportSurfaceNormal, objectScorer);
    }
  });
  //console.log('samples', samples);
  var sampled = samples[0];
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

/**
 * Find a reasonable position for object
 * @param simState {SimState}
 * @param observations Set of visual observations as context for placement
 * @param observations.objectId {sim.sensors.SemanticSensor.Frame} observations by object id
 * @param observations.normal {sim.sensors.NormalSensor.Frame} normal observations
 * @param constraints Additional constraints specifying what the object to be placed is and where it should be positioned
 * @param constraints.supportCategories {string[]} List of valid support categories for placement
 * @param constraints.childModelInfo {Object} information about child to be placed
 * @returns {*}
 */
SimOperations.prototype.findPlacementPosition = function(simState, observations, constraints) {
  var targetObjs = this.findObjectsInViewByCategory(simState, observations.objectId, constraints.supportCategories, true);
  if (targetObjs.length <= 0) {
    return { error: "No matching " + constraints.supportCategories };
  } else {
    // TODO: Sample pixel point with given targetObj and try to place object there
    var objectScorer = scoreObjectByIds(observations.objectId, targetObjs);
    var supportSurfaceNormal = new THREE.Vector3(0,1,0);
    var childBoundingBoxDims = null;
    if (constraints.childModelInfo && constraints.childModelInfo['aligned.dims']) {
      var scale = Constants.virtualUnitToMeters / 0.01;
      childBoundingBoxDims = constraints.childModelInfo['aligned.dims'];
      childBoundingBoxDims = childBoundingBoxDims.split(',').map(function(x) { return x*scale; });
    }
    var sampled = this.samplePositionOnObjects(simState, observations, targetObjs,
      { supportSurfaceNormal: supportSurfaceNormal, childBoundingBoxDims: childBoundingBoxDims }, objectScorer);
    if (sampled) {
      return { object: sampled.targetObject, position: sampled.point };
    } else {
      return { error: "No placement possible" };
    }
  }
};

/**
 * Callback for adding an object
 * @callback addObjectCallback
 * @param error
 * @param {model.ModelInstance} Added object
 */

module.exports = SimOperations;