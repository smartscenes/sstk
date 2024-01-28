'use strict';

const Constants = require('Constants');
const AttachmentInfo = require('model/AttachmentInfo');
const BBoxUtil = require('geo/BBoxUtil');
const SemanticOBB = require('geo/SemanticOBB');
const Object3DUtil = require('geo/Object3DUtil');
const RaycasterUtil = require('geo/RaycasterUtil');
const _ = require('util/util');

/**
 * ModelInstance represents an object (an instantiation of a 3D model)
 * @param model {model.Model} Model from which to create a ModelInstance
 * @param clone {boolean|THREE.Object3D} Whether to make a clone of the Model or not (NOTE: The cloning is only applies to the node hierarchy - the geometry is reused).
 *   If a THREE.Object3D is specified, it is used as the cloned instance directly.
 * @memberOf model
 * @constructor
 * @property object3D {THREE.Object3D} Object3D corresponding to the model instance.  This will be the top level node, under which will be `modelBaseObject3D` (optional), and `modelObject3D` (required)
 * @property modelBaseObject3D {THREE.Object3D} Intermediate node used for editing operations.  Should not be accessed externally.  Automatically introduced when `setAttachmentPoint` is called.
 * @property modelObject3D {THREE.Object3D} Object3D corresponding to the model.  Use this member (getObject3D('Model')) to get the transform in the original model space.
 * @property model {model.Model} Model from which the model instance was created from (NOTE: typically the model is cloned and `this.model.object3D` and `this.object3D` will refer to different objects).
 * @property scale {number}
 * @property material {THREE.Material}
 */
function ModelInstance(model, clone) {
  this.model = model;
  this.scale = 1;
  this.material = null;
  this.type = 'ModelInstance';
  this.__isModelObject3DNormalized = false;

  if (clone instanceof THREE.Object3D) {
    if (clone.userData.type === 'Model') {
      this.modelObject3D = clone;
    } else if (clone.userData.type === 'ModelInstance') {
      this.object3D = clone;
      // Assume first child is the model or modelBase
      let modelObjectsIdentified = false;
      for (let i = 0; i < this.object3D.children.length; i++) {
        const child = this.object3D.children[i];
        if (child.userData.type === 'Model') {
          this.modelObject3D = child;
          modelObjectsIdentified = true;
          break;
        } else if (child.userData.type === 'ModelBase') {
          this.modelBaseObject3D = child;
          const firstChild = this.modelBaseObject3D.children[0];
          if (firstChild.userData.type === 'Model') {
            this.modelObject3D = firstChild;
          } else {
            console.error('ModelInstance.clone error: Invalid child type for modelBaseObject3D', firstChild);
          }
          modelObjectsIdentified = true;
          break;
        }
      }
      if (!modelObjectsIdentified) {
        console.error('ModelInstance.clone error: cannot find Model or ModelBase', clone);
      }
    } else {
      console.error('ModelInstance.clone error: Invalid object 3d as parameter', clone);
    }
  }

  if (!this.modelObject3D) {
    // We weren't passed in a object3D to use for this modelInstance, lets create our own
    // Cloning is only needed for multiple instances of same model
    if (clone) {
      this.modelObject3D = this.model.object3D.clone();
    } else {
      this.modelObject3D = this.model.object3D;
    }
  }

  if (!this.object3D) {
    this.object3D = new THREE.Object3D(); // Enclosing Object3D to handle instance transformation
    if (model.info.fullId) {
      this.object3D.name = model.info.fullId + '-inst';
    }
    this.object3D.add(this.modelObject3D);
    this.object3D.userData.modelId = model.getFullID();
    this.object3D.userData.type = 'ModelInstance';
  }
  this.object3D.metadata = {
    modelInstance: this
  };

  if (model.info.support != null) {
    // TODO: check childAttachment
    this.object3D.userData.defaultAttachment = new AttachmentInfo(null, model.info.support, null);
  }

  this.object3D.userData.lightsOn = this.modelObject3D.userData.lightsOn;
  this._updateLights();
}

Object.defineProperty(ModelInstance.prototype, 'isPickable', {
  get: function () { return this.object3D.userData.isPickable; },
  set: function (v) { this.object3D.userData.isPickable = !!v; }
});

Object.defineProperty(ModelInstance.prototype, 'isSelectable', {
  get: function () { return this.object3D.userData.isSelectable; },
  set: function (v) { this.object3D.userData.isSelectable = !!v; }
});

Object.defineProperty(ModelInstance.prototype, 'isEditable', {
  get: function () { return this.object3D.userData.isEditable; },
  set: function (v) { this.object3D.userData.isEditable = !!v; }
});

Object.defineProperty(ModelInstance.prototype, 'isSupportObject', {
  get: function () { return this.object3D.userData.isSupportObject; },
  set: function (v) { this.object3D.userData.isSupportObject = !!v; }
});

Object.defineProperty(ModelInstance.prototype, 'isFrozen', {
  get: function () { return this.object3D.userData.isFrozen; },
  set: function (v) { this.object3D.userData.isFrozen = !!v; }
});

Object.defineProperty(ModelInstance.prototype, 'isDraggable', {
  get: function () { return this.isSelectable && this.isEditable && !this.isFrozen; }
});

ModelInstance.prototype.clone = function (clonedObject3D) {
  if (clonedObject3D === undefined) {
    Object3DUtil.revertMaterials(this.object3D);
    this.object3D.updateMatrixWorld();
    clonedObject3D = this.object3D.clone();
  }

  const newMinst = new ModelInstance(this.model, clonedObject3D);
  newMinst.scale = this.scale;
  if (this.material) {
    newMinst.material = this.material.clone();
  }
  // TODO: Properly handle this.__isModelObject3DNormalized
  if (this.__isModelObject3DNormalized) {
    if (clonedObject3D.userData.type === 'ModelInstance') {
      newMinst.__isModelObject3DNormalized = this.__isModelObject3DNormalized;
    } else {
      newMinst.ensureNormalizedModelCoordinateFrame();
    }
  }
  return newMinst;
};

ModelInstance.prototype.getObject3D = function (type) {
  if (type === undefined || type === 'ModelInstance') {
    return this.object3D;
  } else if (type === 'Model') {
    return this.modelObject3D;
  } else {
    console.error('Unknown object 3d type: ' + type);
  }
};

ModelInstance.prototype.getArticulatedObjects = function() {
  return Object3DUtil.findNodes(this.object3D, function(n) { return n.type === 'ArticulatedObject'; });
};

ModelInstance.prototype.getPartsConnectivity = function() {
  if (this.partsConnectivity) {
    return this.partsConnectivity;
  }
  let partsConnectivity = this.model.getPartsConnectivity();
  if (partsConnectivity) {
    const object3d = this.modelObject3D;
    const nodes = Object3DUtil.findNodes(object3d,(node) => node.userData.pid != null);
    const idToObj = _.keyBy(nodes, (node) => node.userData.pid );
    partsConnectivity = partsConnectivity.withPartObject3Ds(idToObj, true);
    this.partsConnectivity = partsConnectivity;
  }
  return this.partsConnectivity;
};

ModelInstance.prototype.toArticulatedObject = function(articulations) {
  const partsConnectivity = this.getPartsConnectivity();
  if (partsConnectivity) {
    if (!Array.isArray(articulations)) {
      articulations = [articulations];
    }
    const ArticulatedObject = require('articulations/ArticulatedObject');
    return new ArticulatedObject(articulations, partsConnectivity);
  }
};

ModelInstance.prototype.tumble = function () {
  Object3DUtil.tumble(this.object3D);
};

ModelInstance.prototype.__switchModel = function(m) {
  function replaceModelObject3D(obj3D, modelObject3D) {
    const modelInstChildren = _.filter(obj3D.children, function(x) { return x.userData.type === 'ModelInstance'; });
    Object3DUtil.removeAllChildren(obj3D);
    obj3D.add(modelObject3D);
    for (let i = 0; i < modelInstChildren.length; i++) {
      obj3D.add(modelInstChildren[i]);
    }
  }
  // console.log('switchModel', this, this.modelObject3D, m);
  const oldModelObject3D = this.modelObject3D;
  this.model = m;
  this.modelObject3D = m.object3D.clone();
  Object3DUtil.setMatrix(this.modelObject3D, oldModelObject3D.matrix);
  // Move materials from old model to this one
  const oldMeshes = Object3DUtil.getMeshList(oldModelObject3D);
  const newMeshes = Object3DUtil.getMeshList(this.modelObject3D);
  if (oldMeshes.length === newMeshes.length) {
    for (let i = 0; i < newMeshes.length; i++) {
      newMeshes[i].material = oldMeshes[i].material;
    }
  }
  if (this.modelBaseObject3D) {
    replaceModelObject3D(this.modelBaseObject3D, this.modelObject3D);
  } else {
    replaceModelObject3D(this.object3D, this.modelObject3D);
  }
  this.object3D.matrixWorldNeedsUpdate = true;
  Object3DUtil.clearCache(this.object3D);

  this._updateLights();

  // Propagate castShadow and receiveShadow from this object down
  Object3DUtil.setCastShadow(this.object3D, this.object3D.castShadow);
  Object3DUtil.setReceiveShadow(this.object3D, this.object3D.receiveShadow);
};

ModelInstance.prototype.useFlippedModel = function(assetManager) {
  const flipped = assetManager.getFlippedModel(this.model);
  // Set the modelObject3D to be the flipped model
  this.__switchModel(flipped);
};

ModelInstance.prototype.useModelVariant = function(assetManager, variantId, callback) {
  const scope = this;
  assetManager.getModelVariant(this.model, variantId, function(err, variant) {
    if (err) {
      console.error(err);
    }
    if (variant) {
      // Set the modelObject3D to be the variant model
      scope.__switchModel(variant);
    }
    if (callback) {
      callback(err, variant);
    }
  });
};

ModelInstance.prototype.useNextModelVariant = function(assetManager) {
  const modelInfo = this.model.info;
  if (modelInfo.variantIds) {
    const i = modelInfo.variantIds.indexOf(modelInfo.id);
    if (i >= 0) {
      const vi = (i+1) % modelInfo.variantIds.length;
      this.useModelVariant(assetManager, modelInfo.variantIds[vi]);
      return modelInfo.variantIds[vi];
    }
  }
};

ModelInstance.prototype.getLightState = function () {
  return this.object3D.userData.lightsOn;
};

ModelInstance.prototype.setLightState = function (flag, assetManager) {
  this.object3D.userData.lightsOn = flag;
  let numLights = 0;
  const lightSpecs = this.model.info.lightSpecs;
  if (lightSpecs) {
    const modelObject = this.getObject3D('Model');
    numLights = lightSpecs.lights? lightSpecs.lights.length : 0;
    if (assetManager && numLights && modelObject.userData.lightsOn == undefined) {
      assetManager.__lightsLoader.createLights(this.model.info, modelObject);
    }
    numLights = Object3DUtil.setLights(this.object3D, flag);
    Object3DUtil.setMaterialState(this.object3D, lightSpecs.materials, flag);
  }
  return numLights;
};

ModelInstance.prototype.queryCapabilities = function(assetManager) {
  // Some capabilities to query
  const object3D = this.object3D;
  const modelInfo = this.model.info;
  const scope = this;
  // variants
  Object3DUtil.getCapability(object3D,
    'variants', function() {
      const hasVariants = modelInfo.variantIds && modelInfo.variantIds.length > 0;
      if (hasVariants) {
        const openVariants = modelInfo.variantIds.filter(function(x) { return !x.endsWith('_0'); });
        const closeVariants = modelInfo.variantIds.filter(function(x) { return x.endsWith('_0'); });
        return {
          getOperations: function() {
            return ['toggle', 'open', 'close'];
          },
          openable: function() { return openVariants.length > 0; },
          open: function(cb) {
            if (openVariants.length > 0) {
              scope.useModelVariant(assetManager, openVariants[0], cb);
            }
          },
          closeable: function() { return closeVariants.length > 0; },
          close: function(cb) {
            if (closeVariants.length > 0) {
              scope.useModelVariant(assetManager, closeVariants[0], cb);
            }
          },
          toggle: function(cb) {
            scope.useNextModelVariant(assetManager, cb);
          }
        };
      }
    });
  // lights
  Object3DUtil.getCapability(object3D,
    'lights', function() {
      const hasLights = modelInfo.lightSpecs && modelInfo.lightSpecs.lights && modelInfo.lightSpecs.lights.length > 0;
      if (hasLights) {
        const LightControls = require('capabilities/LightControls');
        return new LightControls({
          object3D: object3D
        });
      }
    });
  // video
  Object3DUtil.getCapability(object3D,
    'video', function() {
      return Object3DUtil.addVideoPlayer(object3D, { assetManager: assetManager });
    });
  // articulations
  Object3DUtil.getCapability(object3D,
      'articulation', function() {
      return Object3DUtil.addArticulationPlayer(object3D, { assetManager: assetManager });
  });
  // Return capabilities
  return Object3DUtil.getCapabilities(object3D);
};

ModelInstance.prototype._updateLights = function () {
  this.setLightState(this.object3D.userData.lightsOn);
  const lights = Object3DUtil.findLights(this.object3D);
  for (let i = 0; i < lights.length; i++) {
    const light = lights[i];
    if (light instanceof THREE.SpotLight && light.target) {
      light.parent.add(light.target);
    }
  }
};

/**
 * Ensures that the model coordinate frame is normalized to be aligned with our world coordinate frame.
 * Any scaling on the model instance is also absorbed into the `modelObject3D`.
 * This means that the transform on `modelObject3D` is such that the `modelObject3D`
 *  is oriented in the same way as our world coordinate frame (with same up and front), and positioning the `modelObject3D`
 *  positions the axis-aligned bbox center of the `modelObject3D`.
 * NOTE: This operation need to happen before any other nodes are introduced between the main `object3D` for this
 *   model instance and the `modelObject3D` (e.g. it needs to happen before `setAttachmentPoint` is ever called)
 * @returns {THREE.Matrix4} New localToWorld transform of this modelInstance's object3D.
 */
ModelInstance.prototype.ensureNormalizedModelCoordinateFrame = function () {
  if (this.__isModelObject3DNormalized) {
    // Already normalized
    console.log('Model is already normalized', this.model.getFullID());
    return this.object3D.matrix;
  }
  // NOTE: Assumes that this.modelObject3D is a direct child of this.object3D and that
  //       there are no other children for this.object3D
  const modelInstanceMatrix = this.object3D.matrix.clone();
  const modelObjectMatrix = this.modelObject3D.matrix.clone();

  const matrix = new THREE.Matrix4();
  matrix.multiplyMatrices(modelInstanceMatrix, modelObjectMatrix);

  const alignment = this.model.getAlignmentMatrix();
  Object3DUtil.normalize(this.modelObject3D, alignment, this.object3D.scale);

  const newModelObjectMatrixInv = new THREE.Matrix4();
  newModelObjectMatrixInv.copy(this.modelObject3D.matrix).invert();
  matrix.multiply(newModelObjectMatrixInv);

  Object3DUtil.setMatrix(this.object3D, matrix);
  //this.object3D.position.set(0,0,0);
  //this.object3D.rotation.set(0,0,0);
  //this.object3D.scale.set(1,1,1);
  //this.object3D.updateMatrix();

  //this.object3D.applyMatrix4(matrix);
  //this.object3D.updateMatrix();  // make sure matrixWorldNeedsUpdate is set

  //Object3DUtil.clearCache(this.object3D);
  this.__isModelObject3DNormalized = true;
  return this.object3D.matrix;
};

/**
 * Set attachment point.  To ensure that editing operations use a reasonable coordinate frame,
 *  the `modelBaseObject3D` is introduced here so that operations on `this.object3D` can now assume that
 *  the origin of `this.object3D` is at the attachment point (so movement, rotation, scaling will all be about that point)
 * The `modelBaseObject3D` wraps around the normalized `modelObject3D` which has consistent orientation.
 * @param options
 * @param [options.position] {THREE.Vector3} Position at which to place attachment point
 * @param [options.coordFrame] {string} Coordinate frame is 'worldBB', 'parentBB', 'childBB', or 'child'
 * @param [options.useModelContactPoint=false] {boolean} Whether to use annotated contact point
 */
ModelInstance.prototype.setAttachmentPoint = function (options) {
  // Wrapping so we have ModelInstance
  // with ModelBase (transformed so aligned and centered at attachment point)
  // with Model (transformed so aligned and centered at origin)
  //this.object3D.updateMatrixWorld();
  if (!this.modelBaseObject3D) {
    this.modelBaseObject3D = new THREE.Object3D();
    if (!this.modelBaseObject3D.userData) {
      this.modelBaseObject3D.userData = {};
    }
    this.modelBaseObject3D.userData['attachmentPoint'] = new THREE.Vector3(0.5, 0.5, 0.5);
    this.modelBaseObject3D.userData['type'] = 'ModelBase';
    this.modelBaseObject3D.add(this.modelObject3D);
    this.modelBaseObject3D.name = this.modelObject3D.name + '-base';
    this.object3D.add(this.modelBaseObject3D);
  } else {
    // NOTE: attachmentPoint is not cloned correctly since it is a Vector3
    // We should avoid storing anything that is not a plain js object in userData
    const u = this.modelBaseObject3D.userData;
    const ap = u['attachmentPoint'];
    if (!(ap instanceof THREE.Vector3)) {
      u['attachmentPoint'] = new THREE.Vector3(ap.x, ap.y, ap.z);
    }
  }
  let p = options.position;
  let pCoordFrame = options.coordFrame;
  if (options.useModelContactPoint) {
    const contactPointInModelSpace = this.model.getAnnotatedContactPoint();
    if (contactPointInModelSpace) {
      console.log('contactPoint');
      console.log(contactPointInModelSpace);
      // Get the point in modelBaseObject3D
      p = contactPointInModelSpace.clone().applyMatrix4(this.modelObject3D.matrix);
      console.log(p);
      pCoordFrame = 'child';
    }
  }

  if (!this.modelBaseObject3D.userData['attachmentPoint'].equals(p)) {
    Object3DUtil.setChildAttachmentPoint(this.object3D, this.modelBaseObject3D, p, pCoordFrame);
  }
};

ModelInstance.prototype.getCurrentAttachment = function() {
  // Return information about current attachment
  if (this.modelBaseObject3D) {
    const u = this.modelBaseObject3D.userData;
    return {
      position: u.attachmentPoint,
      coordFrame: u.attachmentPointCoordFrame
    };
  }
};

/**
 * Returns attachment point in local normalized coordinate
 * @returns {THREE.Vector3}
 */
ModelInstance.prototype.getAttachmentPointLocal = function () {
  if (this.modelBaseObject3D) {
    return this.modelBaseObject3D.userData['attachmentPoint'];
  }
};

/**
 * Returns attachment point in world coordinate
 * @returns {THREE.Vector3}
 */
ModelInstance.prototype.getAttachmentPointWorld = function () {
  if (this.modelBaseObject3D) {
    const v = new THREE.Vector3();
    this.object3D.updateMatrixWorld();
    v.setFromMatrixPosition(this.object3D.matrixWorld);
    return v;
  }
};

/**
 * @typedef {Object} AttachmentPoint
 * @memberOf model
 * @property type {string} Type of attachment `bbface` or `annotated`
 * @property frame {string} Coordinate frame `child`
 * @property bbfaceIndex {int} If attachment is `bbface`, which face.
 * @property local {{pos: THREE.Vector3, out: THREE.Vector3}}
 * @property world {{pos: THREE.Vector3, out: THREE.Vector3}}
 * @property index: attachment index (id)
 */

/**
 * Returns candidate attachment points (6 canonical points at the centers of the bounding box, and any annotated attachments)
 * @returns {model.AttachmentPoint[]}
 */
ModelInstance.prototype.getCandidateAttachmentPoints = function() {
  // Returns as candidate attachment points the 6 canonical bbox sides
  // along with any annotated contact points
  this.object3D.updateMatrixWorld();
  const modelBB = Object3DUtil.computeBoundingBoxLocal(this.modelObject3D.parent);

  //console.log('got modelBBDimsWorld', modelBBDimsWorld);
  const attachmentPoints = [];
  for (let i = 0; i < 6; i++) {
    const fc = Object3DUtil.FaceCenters01[i];
    const outNorm = Object3DUtil.OutNormals[i];
    const p = modelBB.getWorldPosition(fc);
    attachmentPoints.push({
      type: 'bbface',
      frame: 'child',
      bbfaceIndex: i,
      local: { pos: p, out: outNorm },
      index: attachmentPoints.length
    });
  }
  const contactPointInModelSpace = this.model.getAnnotatedContactPoint();
  if (contactPointInModelSpace) {
    // Get the point in modelBaseObject3D
    const p = contactPointInModelSpace.clone().applyMatrix4(this.modelObject3D.matrix);
    const outNorm = Object3DUtil.OutNormals[Constants.BBoxFaceCenters.BOTTOM];
    attachmentPoints.push({
      type: 'annotated',
      local: { pos: p, out: outNorm },
      index: attachmentPoints.length
    });
  }
  this.updateCandidateAttachmentPointsWorld(attachmentPoints, modelBB);
  return attachmentPoints;
};

ModelInstance.prototype.updateCandidateAttachmentPointsWorld = function(attachmentPoints, modelBB) {
  this.object3D.updateMatrixWorld();
  const mw = this.modelObject3D.parent.matrixWorld;

  modelBB = modelBB || Object3DUtil.computeBoundingBoxLocal(this.modelObject3D.parent);
  const modelBBDims = modelBB.dimensions();
  const modelBBDimsWorld = (new THREE.Vector3()).setFromMatrixScale(mw).multiply(modelBBDims);
  const modelBBFaceDimsWorld = BBoxUtil.getFaceDims(modelBBDimsWorld);

  for (let i = 0; i < attachmentPoints.length; i++) {
    const ap = attachmentPoints[i];
    if (ap.world) {
      ap.world.pos.copy(ap.local.pos).applyMatrix4(mw);
      ap.world.out.copy(ap.local.out).transformDirection(mw);
    } else {
      ap.world = {
        pos: ap.local.pos.clone().applyMatrix4(mw),
        out: ap.local.out.clone().transformDirection(mw)
      };
    }
    ap.world.size = Math.abs(modelBBDimsWorld.dot(ap.local.out));
    if (ap.bbfaceIndex != null) {
      ap.world.faceDims = modelBBFaceDimsWorld[ap.bbfaceIndex];
    }
  }
};

ModelInstance.prototype.setMaterial = function (material) {
  this.material = material;
  Object3DUtil.setMaterial(this.object3D, material);
};

ModelInstance.prototype.alignAndScale = function (targetUp, targetFront, sceneUnit) {
  // Assumes that the model has not been aligned/scaled
  // Aligns and scales the model instance based on the model unit and front/up
  const model = this.model;
  if (targetUp && targetFront) {
    const up = model.getUp();
    const front = model.getFront();
    Object3DUtil.alignToUpFrontAxes(this.object3D, up, front, targetUp, targetFront);
  }
  if (sceneUnit) {
    const targetScale = model.getVirtualUnit() / sceneUnit;
    this.setScale(targetScale);
  }
};

ModelInstance.prototype.alignAndScaleObject3D = function(object3D, targetUp, targetFront) {
  const model = this.model;
  const up = model.getUp();
  const front = model.getFront();
  Object3DUtil.alignToUpFrontAxes(object3D, up, front, targetUp, targetFront);
  Object3DUtil.rescaleObject3D(object3D, model.getVirtualUnit());
};

// TODO: Fix interface to these calls (detect vector vs numbers)

ModelInstance.prototype.translate = function (delta) {
  this.object3D.position.add(delta);
  this.object3D.updateMatrix();
  Object3DUtil.clearCache(this.object3D);
};

ModelInstance.prototype.setTranslation = function (x, y, z) {
  if (x instanceof THREE.Vector3) {
    this.object3D.position.copy(x);
  } else {
    this.object3D.position.set(x, y, z);
  }
  this.object3D.updateMatrix();
  Object3DUtil.clearCache(this.object3D);
};

ModelInstance.prototype.centerTo = function(relPos) {
  Object3DUtil.placeObject3D(this.object3D, new THREE.Vector3(0,0,0), relPos);
};

ModelInstance.prototype.scaleBy = function (scale, maintainAttachmentAt) {
  //console.time('scaleBy');
  if (maintainAttachmentAt != undefined) {
    const oldPosition = Object3DUtil.getBBoxFaceCenter(this.object3D,maintainAttachmentAt);
    this.setScale(this.scale * scale);
    Object3DUtil.placeObject3DByBBFaceCenter(this.object3D,oldPosition,maintainAttachmentAt);
  } else {
    this.setScale(this.scale * scale);
  }
  //console.timeEnd('scaleBy');
};

ModelInstance.prototype.setScale = function (scale) {
  // Debug logging
  // console.log("Scaling model instance " + this.object3D.id + ", model " + this.model.getFullID() + " to " + scale);
  // const bbdims = this.getBBoxDims();
  // console.log("Before bbdims: [" + bbdims.x + "," + bbdims.y + "," + bbdims.z + "]");
  // Actual scaling
  if (this.object3D.parent && this.scale) {
    // Has parent, just do relative scaling
    const sf = scale / this.scale;
    const s = this.object3D.scale;
    this.object3D.scale.set(s.x * sf, s.y * sf, s.z * sf);
  } else {
    // No parent, just set our scale
    this.object3D.scale.set(scale, scale, scale);
  }
  this.scale = scale;
  this.object3D.updateMatrix();
  Object3DUtil.clearCache(this.object3D);

  // Debug logging
  //bbdims = this.getBBoxDims();
  // console.log("After bbdims: [" + bbdims.x + "," + bbdims.y + "," + bbdims.z + "]");
};


ModelInstance.prototype.setScaleToDefault = function () {
  this.setScale(Constants.metersToVirtualUnit * Constants.defaultModelUnit / this.model.getVirtualUnit());
};

ModelInstance.prototype.convertScaleToNewUnit = function (unit) {
  this.setScale(unit / this.model.getVirtualUnit());
};

ModelInstance.prototype.getScale = function () {
  return this.scale;
};

// Returns the unit that this model instance wants to be in
ModelInstance.prototype.getVirtualUnit = function () {
  return this.scale * this.model.getVirtualUnit();
};

ModelInstance.prototype.getPhysicalSize = function (sizeBy) {
  const dims = this.getPhysicalDims();
  return Object3DUtil.convertBbDimsToSize(dims, sizeBy);
};

ModelInstance.prototype.setToPhysicalSize = function (sizeBy, targetSize) {
  const dims = this.model.getPhysicalDims();
  const modelSize = Object3DUtil.convertBbDimsToSize(dims, sizeBy);
  if (modelSize) {
    const scale = targetSize / modelSize;
    this.setScale(scale);
  } else {
    console.error('Unable to get model size using sizeBy ' + this.sizeBy);
  }
};

ModelInstance.prototype.setScaleVector = function (sx, sy, sz) {
  if (sx instanceof THREE.Vector3) {
    this.object3D.scale.copy(sx);
  } else {
    this.object3D.scale.set(sx, sy, sz);
  }
  this.object3D.updateMatrix();
  Object3DUtil.clearCache(this.object3D);
};

ModelInstance.prototype.rotate = function (delta, order, bbBoxPoint) {
  Object3DUtil.rotateObject3DEuler(this.object3D, delta, order, bbBoxPoint);
};

ModelInstance.prototype.rotateAboutAxis = function (axis, delta, bbBoxPoint) {
  Object3DUtil.rotateObject3DAboutAxis(this.object3D, axis, delta, bbBoxPoint);
};

ModelInstance.prototype.rotateAboutAxisSimple = function (axis, delta, isWorld) {
  Object3DUtil.rotateObject3DAboutAxisSimple(this.object3D, axis, delta, isWorld);
};

ModelInstance.prototype.rotateWrtBBFace = function (axis, delta, bbface) {
  Object3DUtil.rotateObject3DWrtBBFace(this.object3D, axis, delta, bbface);
  //Object3DUtil.rotateObject3D(this.object3D, delta, order);
};

ModelInstance.prototype.setRotation = function (x, y, z) {
  //console.log(this.object3D.position, this.object3D.rotation);
  const r = this.object3D.rotation;
  this.rotate(new THREE.Vector3(-r.x,-r.y,-r.z), 'ZYX');
  this.rotate(new THREE.Vector3(x,y,z));
  // Just setting the rotation doesn't quite work (object moved)
  //this.object3D.rotation.set(x, y, z);
  //this.object3D.updateMatrix();
};

ModelInstance.prototype.setQuaternion = function (x, y, z, w) {
  if (x instanceof THREE.Quaternion) {
    this.object3D.quaternion.copy(x);
  } else {
    this.object3D.quaternion.set(x, y, z, w);
  }
  this.object3D.updateMatrix();
  Object3DUtil.clearCache(this.object3D);
};

ModelInstance.prototype.clearRotation = function (undoModelRotation) {
    this.setRotation(0,0,0);
    if (undoModelRotation) {
      const modelRotation = this.model.object3D.rotation;
      this.rotate(new THREE.Vector3(-modelRotation.x,-modelRotation.y,-modelRotation.z), 'ZYX');
    }
  };

// transform is THREE.Matrix4
ModelInstance.prototype.applyTransform = function (transform) {
  this.object3D.applyMatrix4(transform);
  this.object3D.updateMatrix();  // make sure matrixWorldNeedsUpdate is set
  this.scale = this.object3D.scale.x;
  Object3DUtil.clearCache(this.object3D);
};

ModelInstance.prototype.worldToModel = function(p, out) {
  const inv = new THREE.Matrix4();
  inv.copy(this.modelObject3D.matrixWorld).invert();
  out = out || new THREE.Vector3();
  out.copy(p);
  out.applyMatrix4(inv);
  return out;
};

ModelInstance.prototype.modelToWorld = function(p, out) {
  out = out || new THREE.Vector3();
  out.copy(p);
  out.applyMatrix4(this.modelObject3D.matrixWorld);
  return out;
};

ModelInstance.prototype.getNormalizedModelToWorld = function(out) {
  out = out || new THREE.Matrix4();
  if (!this.__isModelObject3DNormalized) {
    throw "Model not normalized";
  }
  out.copy(this.modelObject3D.parent.matrixWorld);
  return out;
};

ModelInstance.prototype.getWorldToNormalizedModel = function(out) {
  out = this.getNormalizedModelToWorld(out);
  out.copy(out).invert();
  return out;
};

ModelInstance.prototype.getOriginalModelToWorld = function(out) {
  out = out || new THREE.Matrix4();
  out.copy(this.modelObject3D.matrixWorld);
  return out;
};

ModelInstance.prototype.getWorldToOriginalModel = function(out) {
  out = this.getOriginalModelToWorld(out);
  out.copy(out).invert();
  return out;
};

/**
 * Returns the world axis-aligned bounding box of this model instance
 */
ModelInstance.prototype.getBBox = function () {
  return Object3DUtil.getBoundingBox(this.object3D);
};

ModelInstance.prototype.getBBoxDims = function () {
  const bbox = this.getBBox();
  return bbox.dimensions();
};

ModelInstance.prototype.__getNormalizedModelBBox = function() {
  // TODO: cache local bounding box?
  const transform = this.getWorldToNormalizedModel();
  return Object3DUtil.computeBoundingBox(this.modelObject3D, transform);
};

ModelInstance.prototype.getSemanticOBB = function(transform) {
  const bbox = this.__getNormalizedModelBBox();
  const semanticOBB = new SemanticOBB(new THREE.Vector3(), bbox.getHalfSizes(), new THREE.Matrix4());
  if (transform) {
    if (typeof (transform) === 'string') {
      if (transform === 'world') {
        semanticOBB.applyMatrix4(this.getNormalizedModelToWorld());
      } else {
        throw "Unsupported transform: " + transform;
      }
    } else if (transform instanceof THREE.Matrix4) {
      semanticOBB.applyMatrix4(transform);
    } else {
      throw "Unsupported transform type";
    }
  }
  return semanticOBB;
};

ModelInstance.prototype.getPhysicalDims = function () {
  const unscaledPhysicalDims = this.model.getPhysicalDims();
  const physicalDims = new THREE.Vector3();
  physicalDims.copy(unscaledPhysicalDims);
  physicalDims.multiply(this.object3D.scale);
  return physicalDims;
};

ModelInstance.prototype.getUpFrontAxes = function (targetUp, targetFront, snapTo) {
  const r = new THREE.Quaternion();
  if (this.modelBaseObject3D) {
    r.multiplyQuaternions(this.object3D.quaternion, this.modelBaseObject3D.quaternion);
    r.multiplyQuaternions(r, this.modelObject3D.quaternion);
  } else {
    r.multiplyQuaternions(this.object3D.quaternion, this.modelObject3D.quaternion);
  }
  return Object3DUtil.getObjUpFrontAxes(r, targetUp, targetFront, snapTo);
};

ModelInstance.prototype.alignObbUpFront = function(obb, targetUp, targetFront) {
  Object3DUtil.alignObjectObbUpFront(this.object3D, obb, targetUp, targetFront);
};

ModelInstance.prototype.checkBBFaceClear = function(objects, intersectObjects, faceIndex, opts) {
  var intersectOpts = {
    intersectBackFaces: true,
    allowAllModelInstances: true,
    ignore: [this.object3D],
    near: opts.near,
    far: opts.far,
    callback: opts.callback
  };
  var semanticOBB = this.getSemanticOBB('world');
  var faceNormalDims = BBoxUtil.getFaceNormalDims(semanticOBB.dimensions());
  var offset = 0.05 * faceNormalDims[faceIndex];
  intersectOpts.near = Math.max(offset, intersectOpts.near);
  var sampler = {
    sample: function(origin, direction) {
      semanticOBB.sampleFace(faceIndex, origin);
      direction.copy(BBoxUtil.OutNormals[faceIndex]);
      semanticOBB.localDirToWorldDir(direction);
    }
  };
  var intersected = RaycasterUtil.getIntersectedForSamples(intersectObjects, sampler, opts.nsamples, intersectOpts);
  var ratio = intersected / opts.nsamples;
  return { intersectedCount: intersected, intersectedRatio: ratio, isClear: ratio < opts.isClearThreshold };
};


ModelInstance.prototype.getPartMeshes = function() {
  return Object3DUtil.getMeshList(this.object3D);
};

ModelInstance.prototype.getUILogInfo = function (detailed) {
  const logInfo = detailed ? {
    modelIndex: this.index,
    modelId: this.model.getFullID(),
    category: this.model.getCategory(),
    id: this.object3D.userData.id
  } : {
    modelIndex: this.index,
    id: this.object3D.userData.id
  };
  return logInfo;
};

ModelInstance.getUILogInfo = function (obj, detailed) {
  if (obj instanceof THREE.Object3D) {
    const selectedInstance = Object3DUtil.getModelInstance(obj);
    return selectedInstance.getUILogInfo(detailed);
  } else if (obj instanceof ModelInstance) {
    return obj.getUILogInfo(detailed);
  }
};

ModelInstance.prototype.getParentObject3D = function() {
  const anc = Object3DUtil.findFirstAncestor(this.object3D, (node) => (node.userData.id != null || node.index != null), false);
  return anc? anc.ancestor : undefined;
};

ModelInstance.prototype.getParentRegion = function() {
  const anc = Object3DUtil.findFirstAncestor(this.object3D, (node) => (node.userData.type === 'Room'), false);
  return anc? anc.ancestor : undefined;
};

// Exports
module.exports = ModelInstance;
