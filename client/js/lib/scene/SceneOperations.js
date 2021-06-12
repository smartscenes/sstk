var Constants = require('Constants');
var Object3DUtil = require('geo/Object3DUtil');
var _ = require('util/util');

/**
 * Various operations that can be performed to change the state of a scene
 * @param params
 * @constructor
 * @memberOf scene
 */
function SceneOperations(params) {
  this.assetManager = params.assetManager;
}

/**
 * Prepares a new model instance for placement into a scene
 * @param modelInstance {model.ModelInstance}
 * @param [opts] Additional options on how the model would be preprocessed
 * @param [opts.transform=null] {THREE.Matrix4} Explicit transform matrix to use for the object
 * @param [opts.alignTo] {string} What the model instance should be aligned to (`scene|world`) if `transform` is not specified.
 * @param [opts.sceneState] {scene.SceneState} If `alignTo=scene`, the scene state to align to.
 * @param [opts.useShadows] {boolean} Whether shadows need to be enabled
 * @param [opts.enableMirrors] {boolean} Whether mirror should be enabled.
 *    (if true, requires specification of `opts.renderer`, `opts.assetManager`, `opts.camera`)
 * @param [opts.renderer] {gfx.Renderer} If `opts.enableMirrors` is set, used for rendering textures for the mirror
 * @param [opts.assetManager] {assets.AssetManager} If `opts.enableMirrors` is set, used to indicate dynamic asset is loaded.  If not specified, default `assetManager` is used
 * @param [opts.camera] {THREE.Camera} If `opts.enableMirrors` is set,  used for rendering textures for the mirror
 * @returns {model.ModelInstance}
 */
SceneOperations.prototype.prepareModelInstance = function(modelInstance, opts) {
  opts = opts || {};
  // Prepares model instance for inclusion into a scene
  if (opts.transform) {
    Object3DUtil.setMatrix(modelInstance.object3D, opts.transform);
  } else if (opts.alignTo === 'scene') {
    var sceneState = opts.sceneState;
    modelInstance.alignAndScale(sceneState.getUp(), sceneState.getFront(), sceneState.getVirtualUnit());
  } else if (opts.alignTo === 'world') {
    modelInstance.alignAndScale(Constants.worldUp, Constants.worldFront, Constants.virtualUnitToMeters);
  }
  modelInstance.ensureNormalizedModelCoordinateFrame();
  // Update shadows
  if (opts.useShadows) {
    Object3DUtil.setCastShadow(modelInstance.object3D, true);
    Object3DUtil.setReceiveShadow(modelInstance.object3D, true);
  }
  // Whether to have mirrors
  if (opts.enableMirrors) {
    var assetManager = this.assetManager;
    Object3DUtil.addMirrors(modelInstance.object3D, {
      ignoreSelfModel: true,
      renderer: opts.renderer.renderer,
      assetManager: opts.assetManager || assetManager,
      camera: opts.camera,
      width: opts.renderer.width,
      height: opts.renderer.height
    });
  }

  if (modelInstance.object3D.userData.id == undefined) {
    // Use a_ to indicate this object was added
    modelInstance.object3D.userData.id = 'a_' + modelInstance.object3D.id; // TODO: make sure this is unique
  }
  modelInstance.object3D.metadata = {
    modelInstance: modelInstance
  };
  return modelInstance;
};

/**
 * Create a new object and places it into the scene
 * @param opts
 * @param opts.fullId {string} Id of model to create
 * @param [opts.format] {string} Optional format to use for loading the model
 * @param [opts.prepareModelInstance] {function(ModelInstance)} Callback to prepare model instance before placing it
 * @param opts.callback {function(err, ModelInstance)}
 * See placeObject for additional options on placement of created object
 */
SceneOperations.prototype.createObject = function(opts) {
  var scope = this;
  var cb = opts.callback;
  this.assetManager.loadModel({ fullId: opts.fullId, format: opts.format }, function(err, modelInstance) {
    if (modelInstance) {
      if (opts.prepareModelInstance) {
        opts.prepareModelInstance(modelInstance);
      } else {
        scope.prepareModelInstance(modelInstance, { alignTo: 'world'});
      }
      //console.log('got modelInstance', Object3DUtil.getBoundingBox(modelInstance.object3D));
      scope.placeObject(_.defaults({ modelInstance: modelInstance }, opts));
    }
    cb(err, modelInstance);
  });
};

/**
 * Rotate object
 * @param opts
 * @param [opts.object3D] {THREE.Object3D}
 * @param [opts.modelInstance] {ModelInstance}
 * @param opts.axis {THREE.Vector3} Axis to rotate around
 * @param opts.delta {number} Number of radians to rotate
 * @param [opts.bbfaceIndex] Bounding box face to rotate around
 */
SceneOperations.prototype.rotateObject = function(opts) {
  var modelInstance = opts.modelInstance || Object3DUtil.getModelInstance(opts.object3D);
  if (opts.bbfaceIndex != undefined) {
    modelInstance.rotateWrtBBFace(opts.axis, opts.delta, opts.bbfaceIndex);
  } else {
    modelInstance.rotateAboutAxisSimple(opts.axis, opts.delta, true);
  }
};

/**
 * Places object at location
 * @param opts.sceneState {SceneState}
 * @param opts.modelInstance {ModelInstance}
 * @param opts.object3D {THREE.Object3D}
 * @param [opts.positionAt] {THREE.Vector3} World coordinate to position object at
 * @param [opts.anchorFrame='objectOrigin'] {string} What frame to use for selecting anchor point of object to position ('objectOrigin' or 'objectBBox')
 * @param [opts.anchorPosition] {THREE.Vector3} What anchor point to use for positioning object (interpreted wrt anchorFrame)
 * @param [opts.axis=Constants.worldUp] {THREE.Vector3} Axis of rotation
 * @param [opts.rotation] {number} Number of radians to rotate
 */
SceneOperations.prototype.placeObject = function(opts) {
  //console.log('placeObject', opts);
  var sceneState = opts.sceneState;
  var modelInstance = opts.modelInstance || Object3DUtil.getModelInstance(opts.object3D);
  var keepWorldTransform = false;
  // When placing the objects, we should also position the object based on the options
  if (opts.positionAt) {
    keepWorldTransform = true;
    if (opts.anchorFrame === 'objectOrigin') {
      //console.log('before add place', Object3DUtil.getBoundingBox(modelInstance.object3D).toString());
      Object3DUtil.placeObject3DByOrigin(modelInstance.object3D, opts.positionAt);
      //console.log('after place', Object3DUtil.getBoundingBox(modelInstance.object3D).toString());
    } else if (opts.anchorFrame === 'objectBBox') {
      // TODO: we should differentiate between objectBBox and objectWorldBBox
      Object3DUtil.placeObject3D(modelInstance.object3D, opts.positionAt, opts.anchorPosition);
    } else {
      console.error('Unknown anchorFrame ' + opts.anchorFrame + ': defaulting to objectOrigin');
      Object3DUtil.placeObject3DByOrigin(modelInstance.object3D, opts.positionAt);
    }
  }
  if (opts.rotation) {
    // TODO: Flesh out rotation
    this.rotateObject({modelInstance: modelInstance, axis: opts.axis || Constants.worldUp, delta: opts.rotation});
  }
  //console.log('before add modelInstance', Object3DUtil.getBoundingBox(modelInstance.object3D).toString());
  sceneState.addObject(modelInstance, keepWorldTransform);
  //console.log('after add modelInstance', Object3DUtil.getBoundingBox(modelInstance.object3D).toString());
};

/**
 * Remove object from the scene
 * @param opts
 * @param opts.sceneState {SceneState}
 * @param opts.modelInstance {ModelInstance}
 * @param opts.object3D {THREE.Object3D}
 */
SceneOperations.prototype.removeObject = function(opts) {
  var sceneState = opts.sceneState;
  var modelInstance = opts.modelInstance || Object3DUtil.getModelInstance(opts.object3D);
  var index = sceneState.modelInstances.indexOf(modelInstance);
  Object3DUtil.detachFromParent(modelInstance.object3D, sceneState.scene);
  sceneState.removeObjects([index]);
};

/**
 * Remove objects from the scene
 * @param opts
 * @param opts.sceneState {SceneState}
 * @param opts.filter {Function(ModelInstance)}
 */
SceneOperations.prototype.removeObjects = function(opts) {
  var sceneState = opts.sceneState;
  var filter = opts.filter;
  var indices = [];
  for (var i = 0; i < sceneState.modelInstances.length; i++) {
    if (filter(sceneState.modelInstances[i])) {
      indices.push(i);
    }
  }
  if (indices.length) {
    return sceneState.removeObjects(indices);
  }
};

/**
 * Set object material
 * @param opts
 * @param [opts.objects] {THREE.Object3D|THREE.Object3D[]}
 * @param [opts.sceneState] {SceneState}
 * @param [opts.filter] {Function(THREE.Object3D)}
 * @param opts.material {THREE.Material}
 */
SceneOperations.prototype.setObjectMaterial = function(opts) {
  if (opts.objects) {
    var objects = opts.objects;
    if (!Array.isArray(objects)) {
      objects = [objects];
    }
    _.each(objects, function (obj) {
      console.log('applymaterial', obj, opts.material);
      Object3DUtil.applyMaterial(obj, opts.material, true, false);
    });
  } else if (opts.sceneState) {
    var objects = opts.sceneState.findNodes(opts.filter || function(x) { return x; });
    _.each(objects, function (obj) {
      Object3DUtil.applyMaterial(obj, opts.material, true, false);
    });
  } else {
    throw "Please specify either sceneState and filter or objects";
  }
};


/**
 * Performs some action on an object
 * @param opts
 * @param opts.sceneState {SceneState}
 * @param opts.modelInstance {ModelInstance}
 * @param opts.object3D {THREE.Object3D}
 * @param [opts.action=toggle] {string} Name of action to perform
 * @param [opts.arguments] {Array} arguments to pass to action
 * @returns {{capability: string, state}}
 */
SceneOperations.prototype.actOnObject = function (opts) {
  var modelInstance = opts.modelInstance || Object3DUtil.getModelInstance(opts.object3D);
  if (modelInstance) {
    var capabilities = modelInstance.queryCapabilities(this.assetManager);
    for (var k in capabilities) {
      //console.log(capabilities);
      if (capabilities.hasOwnProperty(k) && capabilities[k]) {
        // TODO: Support other operations
        var cap = capabilities[k];
        var operations = cap.getOperations? cap.getOperations() : [];
        var action = 'toggle';
        if (opts.action && operations.indexOf(opts.action) >= 0) {
          action = opts.action;
        }
        //console.log('Trying capability ' + k + ' ' + action, operations);
        var state = capabilities[k][action](...opts.arguments);
        return { capability: k, state: state };
      }
    }
  }
};

/**
 * Placement Options
 * @typedef PlacementOption
 * @type {object}
 * @property [opts.positionAt] {THREE.Vector3} World coordinate to position object at
 * @property [opts.anchorFrame='objectOrigin'] {string} What frame to use for selecting anchor point of object to position ('objectOrigin' or 'objectBBox')
 * @property [opts.anchorPosition] {THREE.Vector3} What anchor point to use for positioning object (interpreted wrt anchorFrame)
 */

module.exports = SceneOperations;