var Constants = require('Constants');
var Object3DUtil = require('geo/Object3DUtil');
var _ = require('util');

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
 * Default method for preparing a model instance for placement in a scene
 * @param modelInstance
 * @param opts
 * @param [opts.alignTo=world] {string} What to align to (`scene`|`world`)
 * @param [opts.sceneState] {SceneState} SceneState for which to prepare placement (required if `opts.alignTo` is `scene`_
 * @param [opts.useShadows] {boolean} Whether shadow effects need to be enabled to model instance
 * @param [opts.enableMirrors] {boolean} Whether mirror effects need to be enabled to model instance
 *   (if true, requires specification of `opts.renderer`, `opts.assetManager`, `opts.camera`.
 * @param [opts.assetManager] {AssetManager} Used for mirror effects
 * @param [opts.renderer] {Renderer} Used for mirror effects
 * @param [opts.camera] {THREE.Camera} Used for mirror effects
 * @returns {*}
 */
SceneOperations.prototype.prepareModelInstance = function(modelInstance, opts) {
  opts = opts || {};
  // Prepares model instance for inclusion into a scene
  if (opts.alignTo === 'scene') {
    var sceneState = opts.sceneState;
    modelInstance.alignAndScale(sceneState.getUp(), sceneState.getFront(), sceneState.getVirtualUnit());
  } else {
    modelInstance.alignAndScale(Constants.worldUp, Constants.worldFront, Constants.virtualUnitToMeters);
    modelInstance.ensureNormalizedModelCoordinateFrame();
  }
  // Update shadows
  if (opts.useShadows) {
    Object3DUtil.setCastShadow(modelInstance.object3D, true);
    Object3DUtil.setReceiveShadow(modelInstance.object3D, true);
  }
  // Whether to have mirrors
  if (opts.enableMirrors) {
    Object3DUtil.addMirrors(modelInstance.object3D, {
      ignoreSelfModel: true,
      renderer: opts.renderer.renderer,
      assetManager: opts.assetManager,
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
        scope.prepareModelInstance(modelInstance);
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
 * @param [opts.modelInstance] {THREE.Object3D}
 * @param [opts.object3D] {ModelInstance}
 * @param opts.axis {THREE.Vector3} Axis to rotate around
 * @parma opts.delta {number} Number of radians to rotate
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
 */
SceneOperations.prototype.placeObject = function(opts) {
  var sceneState = opts.sceneState;
  var modelInstance = opts.modelInstance || Object3DUtil.getModelInstance(opts.object3D);
  var keepWorldTransform = false;
  // When placing the objects, we should also position the object based on the options
  if (opts.positionAt) {
    keepWorldTransform = true;
    if (opts.anchorFrame === 'objectOrigin') {
      Object3DUtil.placeObject3DByOrigin(modelInstance.object3D, opts.positionAt);
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
  sceneState.addObject(modelInstance, keepWorldTransform);
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
 * Performs some action on an object
 * @param opts
 * @param opts.sceneState {SceneState}
 * @param opts.modelInstance {ModelInstance}
 * @param opts.object3D {THREE.Object3D}
 * @param [opts.action=toggle] {string} Name of action to perform
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
        var state = capabilities[k][action]();
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