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
 */
SceneOperations.prototype.createObject = function(opts) {
  var scope = this;
  var cb = opts.callback;
  this.assetManager.loadModel({ fullId: opts.fullId }, function(err, modelInstance) {
    if (modelInstance) {
      if (opts.prepareModelInstance) {
        opts.prepareModelInstance(modelInstance);
      } else {
        scope.prepareModelInstance(modelInstance);
      }
      console.log('got modelInstance', Object3DUtil.getBoundingBox(modelInstance.object3D));
      scope.placeObject(_.defaults({ modelInstance: modelInstance }, opts));
    }
    cb(err, modelInstance);
  });
};

/**
 * Rotate object
 * @param opts
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
 * @param opts.object3D {Object3D}
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
  sceneState.addObject(modelInstance, keepWorldTransform);
};

/**
 * Remove object from the scene
 * @param opts
 */
SceneOperations.prototype.removeObject = function(opts) {
  var sceneState = opts.sceneState;
  var modelInstance = opts.modelInstance || Object3DUtil.getModelInstance(opts.object3D);
  var index = sceneState.modelInstances.indexOf(modelInstance);
  Object3DUtil.detachFromParent(modelInstance.object3D, sceneState.scene);
  sceneState.removeObjects([index]);
};

/**
 * Performs some action on an object
 * @param opts
 * @returns {{capability: string, state}}
 */
SceneOperations.prototype.actOnObject = function (opts) {
  var modelInstance = opts.modelInstance || Object3DUtil.getModelInstance(opts.object3D);
  if (modelInstance) {
    var capabilities = modelInstance.queryCapabilities(this.assetManager);
    for (var k in capabilities) {
      console.log(capabilities);
      if (capabilities.hasOwnProperty(k) && capabilities[k]) {
        // TODO: Support other operations
        var cap = capabilities[k];
        var operations = cap.getOperations? cap.getOperations() : [];
        var action = 'toggle';
        if (opts.action && operations.indexOf(opts.action) >= 0) {
          action = opts.action;
        }
        console.log('Trying capability ' + k + ' ' + action, operations);
        var state = capabilities[k][action]();
        return { capability: k, state: state };
      }
    }
  }
};

module.exports = SceneOperations;