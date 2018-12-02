'use strict';

define(['geo/BBox', 'geo/Object3DUtil','Constants', 'util/util'], function (BBox, Object3DUtil, Constants, _) {

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

    if (clone instanceof THREE.Object3D) {
      if (clone.userData.type === 'Model') {
        this.modelObject3D = clone;
      } else if (clone.userData.type === 'ModelInstance') {
        this.object3D = clone;
        // Assume first child is the model...
        this.modelObject3D = this.object3D.children[0];
      } else {
        console.error('Invalid object 3d as parameter');
        console.log(clone);
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

    this.object3D.userData.lightsOn = this.modelObject3D.userData.lightsOn;
    this._updateLights();
  }

  ModelInstance.prototype.clone = function (clonedObject3D) {
    if (clonedObject3D === undefined) {
      Object3DUtil.revertMaterials(this.object3D);
      this.object3D.updateMatrixWorld();
      clonedObject3D = this.object3D.clone();
    }

    var newMinst = new ModelInstance(this.model, clonedObject3D);
    newMinst.scale = this.scale;
    if (this.material) {
      newMinst.material = this.material.clone();
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

  ModelInstance.prototype.tumble = function () {
    Object3DUtil.tumble(this.object3D);
  };

  ModelInstance.prototype.__switchModel = function(m) {
    function replaceModelObject3D(obj3D, modelObject3D) {
      var modelInstChildren = _.filter(obj3D.children, function(x) { return x.userData.type === 'ModelInstance'; });
      Object3DUtil.removeAllChildren(obj3D);
      obj3D.add(modelObject3D);
      for (var i = 0; i < modelInstChildren.length; i++) {
        obj3D.add(modelInstChildren[i]);
      }
    }
    // console.log('switchModel', this, this.modelObject3D, m);
    var oldModelObject3D = this.modelObject3D;
    this.model = m;
    this.modelObject3D = m.object3D.clone();
    Object3DUtil.setMatrix(this.modelObject3D, oldModelObject3D.matrix);
    // Move materials from old model to this one
    var oldMeshes = Object3DUtil.getMeshes(oldModelObject3D).list;
    var newMeshes = Object3DUtil.getMeshes(this.modelObject3D).list;
    if (oldMeshes.length === newMeshes.length) {
      for (var i = 0; i < newMeshes.length; i++) {
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
    var flipped = assetManager.getFlippedModel(this.model);
    // Set the modelObject3D to be the flipped model
    this.__switchModel(flipped);
  };

  ModelInstance.prototype.useModelVariant = function(assetManager, variantId, callback) {
    var scope = this;
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
    var modelInfo = this.model.info;
    if (modelInfo.variantIds) {
      var i = modelInfo.variantIds.indexOf(modelInfo.id);
      if (i >= 0) {
        var vi = (i+1) % modelInfo.variantIds.length;
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
    var numLights = 0;
    var lightSpecs = this.model.info.lightSpecs;
    if (lightSpecs) {
      var modelObject = this.getObject3D('Model');
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
    var object3D = this.object3D;
    var modelInfo = this.model.info;
    var scope = this;
    // variants
    Object3DUtil.getCapability(object3D,
      'variants', function() {
        var hasVariants = modelInfo.variantIds && modelInfo.variantIds.length > 0;
        if (hasVariants) {
          var openVariants = modelInfo.variantIds.filter(function(x) { return !x.endsWith('_0'); });
          var closeVariants = modelInfo.variantIds.filter(function(x) { return x.endsWith('_0'); });
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
        var hasLights = modelInfo.lightSpecs && modelInfo.lightSpecs.lights && modelInfo.lightSpecs.lights.length > 0;
        if (hasLights) {
          var LightControls = require('capabilities/LightControls');
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
    // Return capabilities
    return Object3DUtil.getCapabilities(object3D);
  };

  ModelInstance.prototype._updateLights = function () {
    this.setLightState(this.object3D.userData.lightsOn);
    var lights = Object3DUtil.findLights(this.object3D);
    for (var i = 0; i < lights.length; i++) {
      var light = lights[i];
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
    // NOTE: Assumes that this.modelObject3D is a direct child of this.object3D and that
    //       there are no other children for this.object3D
    var modelInstanceMatrix = this.object3D.matrix.clone();
    var modelObjectMatrix = this.modelObject3D.matrix.clone();

    var matrix = new THREE.Matrix4();
    matrix.multiplyMatrices(modelInstanceMatrix, modelObjectMatrix);

    var alignment = this.model.getAlignmentMatrix();
    Object3DUtil.normalize(this.modelObject3D, alignment, this.object3D.scale);

    var newModelObjectMatrixInv = new THREE.Matrix4();
    newModelObjectMatrixInv.getInverse(this.modelObject3D.matrix);
    matrix.multiply(newModelObjectMatrixInv);

    Object3DUtil.setMatrix(this.object3D, matrix);
    //this.object3D.position.set(0,0,0);
    //this.object3D.rotation.set(0,0,0);
    //this.object3D.scale.set(1,1,1);
    //this.object3D.updateMatrix();

    //this.object3D.applyMatrix(matrix);
    //this.object3D.updateMatrix();  // make sure matrixWorldNeedsUpdate is set

    //Object3DUtil.clearCache(this.object3D);
    return this.object3D.matrix;
  };

  /**
   * Set attachment point.  To ensure that editing operations use a reasonable coordinate frame,
   *  the `modelBaseObject3D` is introduced here so that operations on `this.object3D` can now assume that
   *  the origin of `this.object3D` is at the attachment point (so movement, rotation, scaling will all be about that point)
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
    }
    var p = options.position;
    var pCoordFrame = options.coordFrame;
    if (options.useModelContactPoint) {
      var contactPointInModelSpace = this.model.getAnnotatedContactPoint();
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
      var v = new THREE.Vector3();
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
    var modelBB = Object3DUtil.computeBoundingBoxLocal(this.modelObject3D.parent);
    var modelBBDims = modelBB.dimensions();
    var mw = this.modelObject3D.parent.matrixWorld;
    var modelBBDimsWorld = new THREE.Vector3();
    var modelBBWorldCenter = new THREE.Vector3(0,0,0).applyMatrix4(mw);
    modelBBDimsWorld.fromArray([new THREE.Vector3(1,0,0), new THREE.Vector3(0,1,0), new THREE.Vector3(0,0,1)].map(
      function (x) {
        return x.multiply(modelBBDims).applyMatrix4(mw).sub(modelBBWorldCenter).length();
      }));
    var modelBBFaceDimsWorld = BBox.getFaceDims(modelBBDimsWorld);
    var normalMatrixWorld = new THREE.Matrix3();
    normalMatrixWorld.getNormalMatrix(mw);

    //console.log('got modelBBDimsWorld', modelBBDimsWorld);
    var attachmentPoints = [];
    for (var i = 0; i < 6; i++) {
      var fc = Object3DUtil.FaceCenters01[i];
      var outNorm = Object3DUtil.OutNormals[i];
      var p = modelBB.getWorldPosition(fc);
      var wp = p.clone().applyMatrix4(this.modelObject3D.parent.matrixWorld);
      var woutNorm = outNorm.clone().applyMatrix3(normalMatrixWorld).normalize();
      var s = Math.abs(modelBBDimsWorld.dot(outNorm));
      attachmentPoints.push({
        type: 'bbface',
        frame: 'child',
        bbfaceIndex: i,
        local: { pos: p, out: outNorm },
        world: { pos: wp, out: woutNorm, size: s, faceDims: modelBBFaceDimsWorld[i] },
        index: attachmentPoints.length
      });
    }
    var contactPointInModelSpace = this.model.getAnnotatedContactPoint();
    if (contactPointInModelSpace) {
      // Get the point in modelBaseObject3D
      var p = contactPointInModelSpace.clone().applyMatrix4(this.modelObject3D.matrix);
      var wp = p.clone().applyMatrix4(this.modelObject3D.parent.matrixWorld);
      var outNorm = Object3DUtil.OutNormals[Constants.BBoxFaceCenters.BOTTOM];
      var woutNorm = outNorm.clone().applyMatrix3(normalMatrixWorld).normalize();
      var s = Math.abs(modelBBDimsWorld.dot(outNorm));
      attachmentPoints.push({
        type: 'annotated',
        local: { pos: p, out: outNorm },
        world: { pos: wp, out: woutNorm, size: s },
        index: attachmentPoints.length
      });
    }
    return attachmentPoints;
  };

  ModelInstance.prototype.setMaterial = function (material) {
    this.material = material;
    Object3DUtil.setMaterial(this.object3D, material);
  };

  ModelInstance.prototype.alignAndScale = function (targetUp, targetFront, sceneUnit) {
    // Assumes that the model has not been aligned/scaled
    // Aligns and scales the model instance based on the model unit and front/up
    var model = this.model;
    var up = model.getUp();
    var front = model.getFront();
    Object3DUtil.alignToUpFrontAxes(this.object3D, up, front, targetUp, targetFront);
    if (sceneUnit) {
      var targetScale = model.getVirtualUnit() / sceneUnit;
      this.setScale(targetScale);
    }
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

  ModelInstance.prototype.scaleBy = function (scale, maintainAttachmentAt) {
    //console.time('scaleBy');
    if (maintainAttachmentAt != undefined) {
      var oldPosition = Object3DUtil.getBBoxFaceCenter(this.object3D,maintainAttachmentAt);
      this.setScale(this.scale * scale);
      Object3DUtil.placeObject3DByBBFaceCenter(this.object3D,oldPosition,maintainAttachmentAt);
    } else {
      this.setScale(this.scale * scale);
    }
    //console.timeEnd('scaleBy');
  };

  ModelInstance.prototype.setScale = function (scale) {
    // Debug logging
    //console.log("Scaling model instance " + this.object3D.id + ", model " + this.model.getFullID() + " to " + scale);
    //var bbdims = this.getBBoxDims();
    // console.log("Before bbdims: [" + bbdims.x + "," + bbdims.y + "," + bbdims.z + "]");
    // Actual scaling
    if (this.object3D.parent && this.scale) {
      // Has parent, just do relative scaling
      var sf = scale / this.scale;
      var s = this.object3D.scale;
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
    var dims = this.getPhysicalDims();
    return Object3DUtil.convertBbDimsToSize(dims, sizeBy);
  };

  ModelInstance.prototype.setToPhysicalSize = function (sizeBy, targetSize) {
    var dims = this.model.getPhysicalDims();
    var modelSize = Object3DUtil.convertBbDimsToSize(dims, sizeBy);
    if (modelSize) {
      var scale = targetSize / modelSize;
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
    var r = this.object3D.rotation;
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
        var modelRotation = this.model.object3D.rotation;
        this.rotate(new THREE.Vector3(-modelRotation.x,-modelRotation.y,-modelRotation.z), 'ZYX');
      }
    };

  // transform is THREE.Matrix4
  ModelInstance.prototype.applyTransform = function (transform) {
    this.object3D.applyMatrix(transform);
    this.object3D.updateMatrix();  // make sure matrixWorldNeedsUpdate is set
    this.scale = this.object3D.scale.x;
    Object3DUtil.clearCache(this.object3D);
  };

  /**
   * Returns the world axis-aligned bounding box of this model instance
   */
  ModelInstance.prototype.getBBox = function () {
    return Object3DUtil.getBoundingBox(this.object3D);
  };

  ModelInstance.prototype.getBBoxDims = function () {
    var bbox = this.getBBox();
    return bbox.dimensions();
  };

  ModelInstance.prototype.getPhysicalDims = function () {
    var unscaledPhysicalDims = this.model.getPhysicalDims();
    var physicalDims = new THREE.Vector3();
    physicalDims.copy(unscaledPhysicalDims);
    physicalDims.multiply(this.object3D.scale);
    return physicalDims;
  };

  ModelInstance.prototype.getUpFrontAxes = function (targetUp, targetFront, snapTo) {
    var r = new THREE.Quaternion();
    if (this.modelBaseObject3D) {
      r.multiplyQuaternions(this.object3D.quaternion, this.modelBaseObject3D.quaternion);
      r.multiplyQuaternions(r, this.modelObject3D.quaternion);
    } else {
      r.multiplyQuaternions(this.object3D.quaternion, this.modelObject3D.quaternion);
    }
    return Object3DUtil.getObjUpFrontAxes(r, targetUp, targetFront, snapTo);
  };

  ModelInstance.prototype.getUILogInfo = function (detailed) {
    var logInfo = detailed ? {
      modelIndex: this.index,
      modelId: this.model.getFullID(),
      category: this.model.getCategory()
    } : {
      modelIndex: this.index
    };
    return logInfo;
  };

  ModelInstance.getUILogInfo = function (obj, detailed) {
    if (obj instanceof THREE.Object3D) {
      var selectedInstance = Object3DUtil.getModelInstance(obj);
      return selectedInstance.getUILogInfo(detailed);
    } else if (obj instanceof ModelInstance) {
      return obj.getUILogInfo(detailed);
    }
  };

  // Exports
  return ModelInstance;

});
