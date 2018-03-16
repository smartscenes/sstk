'use strict';

define(['Constants','model/ModelInstance','geo/Object3DUtil','geo/GeometryUtil','geo/RaycasterUtil','geo/Attachments',
    'scene/SceneUtil', 'assets/AssetGroups', 'ds/Index', 'async', 'util'],
  function (Constants, ModelInstance, Object3DUtil, GeometryUtil, RaycasterUtil, Attachments, SceneUtil, AssetGroups, Index, async, _) {

    /**
     * Create a new SceneState.
     *   A SceneState consists of a scene (a set of objects and transforms on the objects)
     *     and a set of selected objects
     *
     *   Metadata associated with the scene includes:
     *   <ul>
     *     <li>source - scene database from which this scene is taken ("wssScenes")</li>
     *     <li>id - Unique id (for given source)</li>
     *   </ul>
     *
     *   Populated after retrieving information from solr:
     *   <ul>
     *     <li>name - Name of scene</li>
     *     <li>tags - Tags associated with the scene</li>
     *     <li>unit - Number specifying the physical unit (in meters) the scene is specified in
     *            (defaults to Constants.defaultModelUnit)</li>
     *     <li>up - Up vector for scene ( defaults to the z-vector (0,0,1) )</li>
     *     <li>front - Front vector for scene ( defaults to the y-vector (0,1,0)? )</li>
     *     <li>category - Category of scene</li>
     *   </ul>
     *
     * @param scene - Three.Scene that contains the Three.js scene graph for the scene
     * @param info - Additional metadata about the scene
     * @constructor SceneState
     * @memberOf scene
     * @public
     */
    function SceneState(scene, info) {
      this.init(scene, info);
    }

    SceneState.getArchType = function(sceneinfo) {
      return sceneinfo.emptyRoom? 'empty' : (sceneinfo.archOnly? 'arch' : 'furnished');
    };

    SceneState.prototype.init = function (scene, info) {
      this.info = info;
      this.lights = [];
      this.extraObjects = [];   // Extra objects that are not models but do something in the scene
      this.selectedObjects = [];
      this.modelInstancesMeta = [];
      this.modelInstances = [];
      this.modelInstancesErrors = 0;
      this.modelInstancesLoaded = 0;
      this.currentCamera = null;
      this.currentCameraControls = null;
      this.manipulator = null;
      this.rootModelInstance = null;
      this.sceneType = '';

      // Basic Three.Scene that contains just the models
      if (scene) {
        this.scene = scene;
      } else {
        this.scene = new THREE.Scene();
      }
      // Full Three.Scene with lighting and cameras
      this.finalizeScene();
    };

    SceneState.prototype.addDefaultLights = function (sceneBBox, cameraPos, intensity) {
      var lights = this.lights;
      var fullScene = this.fullScene;
      if (lights.length > 0) {
        return;
      }
      var light = new THREE.HemisphereLight(0xffffff, 0x202020, intensity);
      fullScene.add(light);
      lights.push(light);
      return lights;
    };

    SceneState.prototype.addLights = function (lights) {
      for (var i = 0; i < lights.length; i++) {
        var light = lights[i];
        if (light.parent !== this.fullScene) {
          this.fullScene.add(light);
          this.lights.push(light);
        }
      }
    };

    SceneState.prototype.getNumberOfObjects = function () {
      return this.modelInstances.length;
    };

    SceneState.prototype.isEmpty = function () {
      return this.getNumberOfObjects() === 0 && this.extraObjects.length === 0;
    };

    SceneState.prototype.identifyAttachments = function () {
      console.time('identifyAttachments');
      for (var i = 0; i < this.modelInstances.length; i++) {
        var m = this.modelInstances[i];
        if (!m) { continue; }
        this.setAttachmentPointToParent(m);
      }
      console.timeEnd('identifyAttachments');
    };

    SceneState.prototype.setAttachmentPointToParent = function(modelInst) {
      var m = modelInst;
      if (m.object3D) {
        m.setAttachmentPoint({ position: new THREE.Vector3(0.5, 0.5, 0.5), coordFrame: 'childBB' });
      }
      if (m.object3D.parent) {
        m.attachment = Attachments.identifyAttachment([m.object3D.parent], { modelInstance: m, attachments: m.getCandidateAttachmentPoints() }, { sameModelCost: 1.0 });
        if (m.attachment) {
          //var ball = Object3DUtil.makeBall(m.attachment.childAttachment.world.pos, 0.05*Constants.metersToVirtualUnit);
          //this.fullScene.add(ball);
          var p = m.attachment.childAttachment.local.pos;
          var u = m.object3D.userData;
          m.setAttachmentPoint({ position: p, coordFrame: 'child' });
          u['attachmentPoint'] = p;
          u['attachmentIndex'] = m.attachment.index;
          u['childWorldBBFaceIndex'] = m.attachment.childWorldBBFaceIndex;
        }
      }
      return m.attachment;
    };

    SceneState.prototype.identifyAttachment = function (modelInst, candidateSupportObjects) {
      candidateSupportObjects = candidateSupportObjects || this.fullScene.supportObjects;
      var filteredCandidateSupportObjects = candidateSupportObjects;
      if (modelInst.object3D.userData.wallIds) {
        filteredCandidateSupportObjects = _.filter(candidateSupportObjects, function(cobj) {
          return modelInst.object3D.userData.wallIds.indexOf(cobj.userData.id) >= 0;
        });
        //console.log('wallIds', modelInst.object3D.userData.wallIds, filteredCandidateSupportObjects);
      }
      return this.__identifyAttachment(modelInst, filteredCandidateSupportObjects);
    };

    SceneState.prototype.__identifyAttachment = function (modelInst, candidateSupportObjects) {
      var supportObjectsForMe = candidateSupportObjects.filter(function(x) {
        return !Object3DUtil.isDescendantOf(x, modelInst.object3D);
      });
      if (supportObjectsForMe.length > 0) {
        var attachment = Attachments.identifyAttachment(supportObjectsForMe, { modelInstance: modelInst, attachments: modelInst.getCandidateAttachmentPoints() }, { sameModelCost: 1.0 });
        if (attachment) {
          //var ball = Object3DUtil.makeBall(attachment.childAttachment.world.pos, 0.05*Constants.metersToVirtualUnit);
          //this.fullScene.add(ball);
          attachment.parentInst = Object3DUtil.getModelInstance(attachment.parent, true);
          return attachment;
        }
      }
    };

    // Do something with doors closed (revert door state afterwards)
    SceneState.prototype.__doWithDoorsClosed = function(assetManager, act, callback) {
      // Make sure close variants of doors are used
      if (assetManager) {
        var doors = this.findModelInstances(function(mi) {
          return mi.model.isDoor() ;
        });
        //console.log('got doors', doors);
        var doorsWithClosedVariants = _.filter(doors, function(mi) {
          var capabilities = mi.queryCapabilities(assetManager);
          //console.log('capabilities', mi);
          var variants = capabilities.variants;
          return variants && variants.closeable();
        });
        var initialDoorIds = [];
        for (var i = 0; i < doorsWithClosedVariants.length; i++) {
          initialDoorIds[i] = doorsWithClosedVariants[i].model.info.id;
        }

        async.each(doorsWithClosedVariants, function(door, cb) {
            var capabilites = door.queryCapabilities(assetManager);
            var variants = capabilites.variants;
            variants.close(cb);
          },
          function(err){
            var result = act();
            // restore old variants
            async.eachOf(doorsWithClosedVariants, function(door, i, cb) {
              door.useModelVariant(assetManager, initialDoorIds[i], cb);
            }, function(err) {
              callback(null, result);
            });
          }
        );
      } else {
        var result = act();
        callback(null, result);
      }
    };

    // Do something with ceiling (restore ceiling visibility afterwards)
    SceneState.prototype.__doWithCeiling = function(act) {
      // Make ceilings visible
      var ceilings = Object3DUtil.findNodes(this.scene, function (node) {
        return node.userData.type === 'Ceiling';
      });
      var ceilingsVisibility = [];
      for (var i = 0; i < ceilings.length; i++) {
        ceilingsVisibility[i] = ceilings[i].visible;
        Object3DUtil.setVisible(ceilings[i], true);
      }

      var result = act();

      // Restore ceiling visibility
      for (var i = 0; i < ceilings.length; i++) {
        Object3DUtil.setVisible(ceilings[i], ceilingsVisibility[i]);
      }

      return result;
    };

      // Asynchronous version of identify support hierarchy that makes sure doors are closed
    SceneState.prototype.identifySupportHierarchy = function(opts, callback) {
      console.time('identifySupportHierarchyAll');
      var scope = this;
      this.__doWithDoorsClosed(opts.assetManager, function() {
        return scope.__doWithCeiling(function() {
          return scope.__identifySupportHierarchy(opts);
        });
      }, function(err, res) {
        console.timeEnd('identifySupportHierarchyAll');
        callback(err, res);
      });
    };

    SceneState.prototype.__identifySupportHierarchy = function(opts) {
      console.time('identifySupportHierarchy');
      var allCandidateSupportObjects = this.fullScene.supportObjects;
      var attachments = [];
      for (var i = 0; i < this.modelInstances.length; i++) {
        var m = this.modelInstances[i];
        if (!m) { continue; }
        attachments[i] = this.identifyAttachment(m, allCandidateSupportObjects);
      }
      // Go through attachments and identify groups of modelInstances
      var groups = [];
      var indexToGroup = {};
      for (var i = 0; i < this.modelInstances.length; i++) {
        if (indexToGroup[i]) { continue; } // We have visited this index before
        var m = this.modelInstances[i];
        var attachment = attachments[i];
        if (!attachment) { continue; } // No attachment, continue
        // Follow parent until root or cycle
        var p = attachment.parentInst;
        var indices = [];
        var nodes = [];
        nodes.push(m);
        indices.push(m.index);
        while (p && indices.indexOf(p.index) < 0) {
          indices.push(p.index);
          nodes.push(p);
          if (attachments[p.index]) {
            p = attachments[p.index].parentInst;
          } else {
            p = null;
          }
        }
        var group = {
          nodes: nodes,
          isCycle: !!p
        };
        if (p) {
          group.cycleNode = p;
        }
        groups.push(group);
        for (var j = 0; j < nodes.length; j++) {
          var index = nodes[j].index;
          indexToGroup[index] = group;
        }
      }

      // Go through cycles and break cycles by marking one as parent of another
      // If one object contains another, it should be support of other...
      var cycles = groups.filter(function(x) { return x.isCycle; });
      //console.log('groups', groups);
      //console.log('cycles', cycles);

      for (var i = 0; i < cycles.length; i++) {
        var cycle = cycles[i];
        var cycleNode = cycle.cycleNode;
        // Find the largest object in cycle and break the link between it and it's so called parent
        var largest = cycleNode;
        var largestSize = Object3DUtil.getBoundingBox(cycleNode.object3D).volume();
        var p = cycleNode;
        while (p.id !== cycleNode.id) {
          p = attachments[p.index].parentInst;
          var pSize = Object3DUtil.getBoundingBox(p.object3D);
          if (pSize > largestSize) {
            largest = p;
            largestSize = pSize;
          }
        }
        if (Constants.isBrowser) {
          console.log('Breaking cycle: ', cycle, largest);
        }
        cycle.removedAttachment = attachments[largest.index];
        attachments[largest.index] = null;
      }

      if (opts) {
        if (opts.groupBySupport) {
          var parentToChildren = {};
          for (var i = 0; i < this.modelInstances.length; i++) {
            var m = this.modelInstances[i];
            var attachment = attachments[i];
            if (!attachment) { continue; }
            var group = indexToGroup[i];
            //if (group.isCycle) { continue; } // skip

            var parentId = attachment.parent.uuid;
            if (!parentToChildren.hasOwnProperty(parentId)) {
              parentToChildren[parentId] = { parent: attachment.parent, parentInst: attachment.parentInst, children: [m] };
            } else {
              parentToChildren[parentId].children.push(m);
            }
          }
          for (var parentId in parentToChildren) {
            if (parentToChildren.hasOwnProperty(parentId)) {
              var g = parentToChildren[parentId];
              if (g.parentInst && opts.attachToParent) {
                for (var i = 0; i < g.children.length; i++) {
                  Object3DUtil.attachToParent(g.children[i].object3D, g.parentInst.object3D, this.scene);
                }
              } else {
                var region = new THREE.Group();
                region.name = 'Region-' + g.parent.userData.id;
                region.userData.type = 'SupportGroup';
                region.userData.sceneHierarchyGroup = true;
                this.addExtraObject(region);
                var grandParent = g.parent.parent;
                Object3DUtil.attachToParent(g.parent, region, this.scene);
                Object3DUtil.attachToParent(region, grandParent, this.scene);

                var region2 = new THREE.Group();
                region2.name = 'Region-' + g.parent.userData.id + '-children';
                region2.userData.type = 'SupportGroupChildren';
                region2.userData.sceneHierarchyGroup = true;
                this.addExtraObject(region2);
                Object3DUtil.attachToParent(region2, region, this.scene);
                for (var i = 0; i < g.children.length; i++) {
                  if (g.children[i].object3D.parent.userData.type === 'SupportGroup') {
                    Object3DUtil.attachToParent(g.children[i].object3D.parent, region2, this.scene);
                  } else {
                    Object3DUtil.attachToParent(g.children[i].object3D, region2, this.scene);
                  }
                }
              }
            }
          }
        } else if (opts.attachToParent) {
          for (var i = 0; i < this.modelInstances.length; i++) {
            var m = this.modelInstances[i];
            var attachment = attachments[i];
            if (!attachment) { continue; }
            var group = indexToGroup[i];
            if (group.isCycle) { continue; } // skip
            var parentInst = attachment.parentInst;
            if (parentInst) {
              //console.log('attachToParent', m.object3D, parentInst.object3D);
              Object3DUtil.attachToParent(m.object3D, parentInst.object3D);
            }
          }
        }
      }
      console.timeEnd('identifySupportHierarchy');
      return attachments;
    };

    SceneState.prototype.__initHouseData = function() {
      var regionsData = _.get(this.info, 'regions.data');
      if (regionsData && this.info.regions.assetType === 'house') {
        var house = regionsData;
        house.name = this.info.fullId;
        // TODO: update house.label
        // house.label = ???
        if (!house.object3D) {
          house.createGeometry({ includeParts: { 'RegionShape': true, 'Surface': true,  'BBox': false, 'Object': false} });
        }
        Object3DUtil.setMatrix(house.object3D, this.scene.matrixWorld);
        house.object3D.updateMatrixWorld();
        this.house = house;
      }
    };

    SceneState.prototype.finalizeScene = function () {
      // Wrap scene since we will use the resulting scene and add camera and lights and stuff
      //    which we want to be in a consistent world space
      var wrappedScene = new THREE.Scene();
      wrappedScene.name = "fullScene";
      wrappedScene.add(this.scene);
      this.extraObjectNode = new THREE.Group();
      this.extraObjectNode.name = "extraObjects";
      this.extraObjectNode.applyMatrix(this.scene.matrix);
      this.debugNode = new THREE.Group();
      this.debugNode.name = 'debugNode';
      wrappedScene.add(this.extraObjectNode);
      wrappedScene.add(this.debugNode);

      if (this.info && this.info.rootObjectIndex != undefined) {
        var modelInstance = this.modelInstances[this.info.rootObjectIndex];
        if (modelInstance) {
          //console.log('Got rootModelInstance', modelInstance);
          //this.rootModelInstance = modelInstance;
          this.info.up = modelInstance.model.getUp();
          this.info.front = modelInstance.model.getFront();
          this.info.unit = modelInstance.model.getUnit();
        }
      }

      // Align and scale
      this.alignToWorld();
      // Rescale scene so we have proper mapping between virtual and physical units
      var scale = this.getVirtualUnit();
      Object3DUtil.rescaleObject3D(this.scene, scale);
      this.fullScene = wrappedScene;
      this.fullScene.updateMatrixWorld();
      // Initialize any house information
      this.__initHouseData();
      // Initialize roomIndex
      if (this.house) {
        this.__roomIndex = new Index();
        this.__roomIndex.add('unknown');
        for (var i = 0; i < this.house.regions.length; i++) {
          var region = this.house.regions[i];
          this.__roomIndex.indexOf(region.object3D.userData.id, true, { room: region.object3D });
        }
      } else {
        this.__roomIndex = this.computeRoomIndex();
      }
      // Make sure selectables and such are set
      this.populateSelectables();
      if (this.info && this.info.precomputeAttachments) {
        this.identifyAttachments();
      }
      if (!this.sceneType && this.info) {
        this.sceneType = (this.info.source === 'wssScenes')?
          this.getWssRoomCategory() : this.getCategory();
      }
    };

    SceneState.prototype.resetCoordFrame = function(up, front, unit) {
      // NOTE: only use for empty scenes!
      if (!this.info) {
        this.info = {};
      }
      this.info.up = up;
      this.info.front = front;
      this.info.unit = unit;
      this.alignToWorld();
      var scale = this.getVirtualUnit();
      Object3DUtil.rescaleObject3D(this.scene, scale);
    };

    SceneState.prototype.alignToWorld = function () {
      var up = this.getUp();
      var front = this.getFront();
      //console.log('aligning scene to world: up=' + JSON.stringify(up) + ', front=' + JSON.stringify(front));
      Object3DUtil.alignToUpFrontAxes(this.scene, up, front, Constants.worldUp, Constants.worldFront);
      // Invalidate cached bbox
      if (this.info) this.info.bbox = null;
    };

    SceneState.prototype.getUp = function () {
      var defaultUp = AssetGroups.getDefaultUp(this.info, Constants.defaultSceneUp);
      return this._getMetadataVector3('up', defaultUp);
    };

    SceneState.prototype.getFront = function () {
      var defaultFront = AssetGroups.getDefaultFront(this.info, Constants.defaultSceneFront);
      return this._getMetadataVector3('front', defaultFront);
    };

    SceneState.prototype.getUnit = function () {
      var defaultUnit = AssetGroups.getDefaultUnit(this.info, Constants.defaultSceneUnit);
      // Get stored unit (in meters)
      var metadata = this._getMetadata();
      if (metadata && metadata.unit) {
        return metadata.unit;
      } else {
        return defaultUnit;
      }
    };

    SceneState.prototype.getVirtualUnit = function () {
      var unit = this.getUnit();
      // Convert from stored physical unit to centimeters
      unit = unit * Constants.metersToVirtualUnit;
      return unit;
    };

    SceneState.prototype._getMetadataVector3 = function (field, defaultValue) {
      var v = defaultValue;
      var metadata = this._getMetadata();
      if (metadata && metadata[field]) {
        if (!(metadata[field] instanceof THREE.Vector3)) {
          metadata[field] = Object3DUtil.toVector3(metadata[field]);
        }
        if (metadata[field]) {
          v = metadata[field];
        }
      }
      return v;
    };

    SceneState.prototype._getMetadata = function () {
      if (this.info && this.info.metadata) {
        return this.info.metadata;
      } else if (this.json && this.json.scene) {
        return this.json.scene;
      } else if (this.info) {
        return this.info;
      }
    };

    SceneState.prototype.hasCategory = function (cat) {
      return this.info && this.info.category && this.info.category.indexOf(cat) >= 0;
    };

    SceneState.prototype.getCategory = function () {
      if (this.info && this.info.category && this.info.category.length > 0) {
        return this.info.category[0];
      } else { return null; }
    };

    SceneState.prototype.getWssRoomCategory = function() {
      var roomTypes = ["LivingRoom", "Bathroom", "LaundryRoom", "Bedroom", "Kitchen", "Study", "Laboratory" ];
      var categoryToRoomType = {
        "EntertainmentCenterWithSofa": "LivingRoom",
        "EntertainmentCenter": "LivingRoom",
        "CoffeeTable": "LivingRoom",
        "LivingRoomTable": "LivingRoom",
        "Bed": "Bedroom",
        "NightStand": "Bedroom",
        "Dresser": "Bedroom",
        "Desk": "Study",
        "KitchenCounter": "Kitchen",
        "DiningTable": "Kitchen",
        "Bookshelf": "Room"
      };
      if (this.info && this.info.category && this.info.category.length > 0) {
        for (var i = 0; i < this.info.category.length; i++) {
          var cat = this.info.category[i];
          var roomType = categoryToRoomType[cat];
          if (roomType) return roomType;
          if (roomTypes.indexOf(cat) >= 0) return cat;
        }
      }
      return null;
    };

    SceneState.prototype.findNodeById = function(id) {
      return this.findNode(function(x) { return x.userData.id === id; });
    };

    SceneState.prototype.findNode = function(filter) {
      var nodes = Object3DUtil.findNodes(this.scene, filter);
      if (nodes.length > 0) { return nodes[0]; }
    };

    SceneState.prototype.findNodes = function(filter) {
      return Object3DUtil.findNodes(this.scene, filter);
    };

    SceneState.prototype.getFullID = function () {
      if (this.info) {
        return this.info.fullId;
      }
    };

    SceneState.prototype.getSceneName = function() {
      return this.scene.name;
    };

    SceneState.prototype.getBBox = function () {
      if (!this.info.bbox) {
        this.info.bbox = Object3DUtil.getBoundingBox(this.scene);
      }
      return this.info.bbox;
    };

    SceneState.prototype.getBBoxDims = function () {
      return Object3DUtil.getBoundingBoxDims(this.scene, this.getBBox());
    };

    SceneState.prototype.findModelInstances = function (match) {
      if (!match) {
        return this.modelInstances;
      }
      if (_.isString(match)) {
        var modelId = match;
        match = function (mi) { return mi.model.getFullID() === modelId; };
      }
      // Find model instances in scene matching filter
      return _.filter(this.modelInstances, match);
    };

    SceneState.prototype.createModelIdToInstanceMap = function () {
      // Find model instances in scene matching modelId
      var map = {};
      for (var i = 0; i < this.modelInstances.length; i++) {
        var modelInstance = this.modelInstances[i];
        if (modelInstance && modelInstance.model) {
          var modelId = modelInstance.model.getFullID();
          var list = map[modelId];
          if (!list) {
            list = [];
            map[modelId] = list;
          }
          modelInstance.modelInstanceId = modelId + '#' + list.length;
          list.push(modelInstance);
        }
      }
      return map;
    };

    SceneState.prototype.assignObjectIndices = function () {
      for (var i = 0; i < this.modelInstances.length; i++) {
        var modelInstance = this.modelInstances[i];
        if (modelInstance) {
          modelInstance.index = i;
          modelInstance.object3D.index = i;
          modelInstance.object3D.userData['objectIndex'] = i;
        }
      }
    };

    SceneState.prototype.removeAll = function () {
      // Explicitly remove objects since some objects are attached to the extraObjects (not the scene)
      var indices = _.range(0, this.modelInstances.length);
      this.removeObjects(indices);
      // Clear everything
      this.selectedObjects = [];
      this.modelInstancesMeta = [];
      this.modelInstances = [];
      this.modelInstancesErrors = 0;
      this.modelInstancesLoaded = 0;
      this.rootModelInstance = null;

      // Remove extra objects
      Object3DUtil.removeAllChildren(this.extraObjectNode);
      this.extraObjects = [];
      // Make sure everything is removed from scene
      Object3DUtil.removeAllChildren(this.scene);
      this.compactify();
    };

    SceneState.prototype.removeSelected = function () {
      var selectedIndices = this.getSelectedModelIndices();
      this.removeObjects(selectedIndices, true);
      this.selectedObjects = [];
    };

    SceneState.prototype.removeObjects = function (indices, skipSelectedUpdate) {
      var removedIndicesSet = {};
      for (var i = 0; i < indices.length; i++) {
        var index = indices[i];
        var modelInstance = this.modelInstances[index];
        // Keep track of children that were also removed...
        removedIndicesSet[index] = 1;
        if (modelInstance) {
          if (modelInstance.object3D.parent) {
            modelInstance.object3D.parent.remove(modelInstance.object3D);
          }
          /*jshint -W083 */
          Object3DUtil.traverseModelInstances(modelInstance, function (m) {
            removedIndicesSet[m.index] = 1;
          });
        }
      }
      var removed = [];
      for (var index in removedIndicesSet) {
        if (removedIndicesSet.hasOwnProperty(index)) {
          var modelInstance = this.modelInstances[index];
          this.modelInstances[index] = null;
          removed.push(modelInstance);
        }
      }
      if (!skipSelectedUpdate) {
        var newSelected = [];
        for (var i = 0; i < this.selectedObjects; i++) {
          var s = this.selectedObjects[i];
          if (removed.indexOf(s) < 0) {
            newSelected.push(s);
          }
        }
        this.selectedObjects = newSelected;
      }
      this.compactify();
    };

    /**
     * Add a modelInstance to the SceneState
     * @param modelInstance {model.ModelInstance} Model instance to add
     * @param [keepWorldTransform=false] {boolean} Whether to keep world transform of the object when adding the object to the scene or not
     */
    SceneState.prototype.addObject = function (modelInstance, keepWorldTransform) {
      this.modelInstances.push(modelInstance);
      if (keepWorldTransform) {
        Object3DUtil.attachToParent(modelInstance.object3D, this.scene);
      } else {
        this.scene.add(modelInstance.object3D);
      }
      Object3DUtil.clearCache(this.scene);

      this.setObjectFlags(modelInstance);
      this._addObject3DToFullScene(modelInstance.object3D);
    };

    SceneState.prototype.pasteObject = function (rootObject, modelInstances) {
      Object3DUtil.attachToParent(rootObject, this.scene);
      for (var i = 0; i < modelInstances.length; i++) {
        var modelInstance = modelInstances[i];
        this.modelInstances.push(modelInstance);

        //this.setObjectFlags(modelInstance);
        this._addObject3DToFullScene(modelInstance.object3D);
      }
      this.assignObjectIndices();
      //Object3DUtil.clearCache(this.scene);
    };

    SceneState.prototype.setObjectFlags = function (modelInstance) {
      if (modelInstance) {
        if (modelInstance.model.isScan()) {  // Don't allow selection for reconstructed scenes
          // Make semi transparent
          //Object3DUtil.setTransparency(modelInstance.object3D, 0.5);
          // Set depthWrite to false so the other objects always appear on top
          //Object3DUtil.setDepthWrite(modelInstance.object3D, false);
          // Make the object not pickable, selectable, and not a support object
          modelInstance.object3D.userData.isPickable = false;
          modelInstance.object3D.userData.isSelectable = false;
          modelInstance.object3D.userData.isEditable = modelInstance.object3D.userData.isSelectable;
          modelInstance.object3D.userData.isSupportObject = false;
          // Set the current scene type to be the category of the vf model
          this.rootModelInstance = modelInstance;
          this.sceneType = modelInstance.model.getCategory();
        } else {
          modelInstance.object3D.userData.isPickable = true;
          // TODO: check if object3D.userData.isRoot (to be set when loading) is true and make not selectable if isRoot
          modelInstance.object3D.userData.isSelectable = !modelInstance.model.hasCategory('Room') && !modelInstance.model.hasCategory('Courtyard');
          modelInstance.object3D.userData.isEditable = modelInstance.object3D.userData.isSelectable;
          modelInstance.object3D.userData.isSupportObject = true;
        }
      }
    };

    SceneState.prototype.clearGhostScene = function () {
      if (this.ghostScene) {
        this.fullScene.remove(this.ghostScene);
      }
      this.ghostScene = undefined;
    };

    SceneState.prototype.showGhostScene = function (flag) {
      if (this.ghostScene) {
        Object3DUtil.setVisible(this.scene, !flag);
        Object3DUtil.setVisible(this.ghostScene, flag);
      }
    };

    SceneState.prototype.hideObjectSegmentation = function (opts) {
      for (var i = 0; i < this.modelInstances.length; i++) {
        var modelInstance = this.modelInstances[i];
        // Remove segments
        if (modelInstance.segments) {
          modelInstance.object3D.remove(modelInstance.segments);
        }
      }
    };

    SceneState.prototype.showObjectSegmentation = function (opts) {
      function applyMaterial(object3D) {
        var segmentName = opts.segmentName;
        var getMaterialFn = function(object3D, material, meshIndex) {
          if (segmentName === 'materials') {
            return opts.getMaterial(object3D, { material: material, partIndex: material.id });
          } else if (segmentName === 'meshes' || segmentName === 'surfaces') {
            return opts.getMaterial(object3D, { material: material, partIndex: meshIndex });
          } else {
            return opts.getMaterial(object3D, { material: material, partIndex: 0 });
          }
        };
        var getMeshMaterial = function(mesh) {
          if (mesh.material instanceof THREE.MultiMaterial) {
            var materials = mesh.material.materials.map(function(m) {
              return getMaterialFn(object3D, m, mesh.index);
            });
            return new THREE.MultiMaterial(materials);
          } else {
            return getMaterialFn(object3D, mesh.material, mesh.index);
          }
        };
        opts.applyMaterial(object3D, getMeshMaterial);
      }

      for (var i = 0; i < this.modelInstances.length; i++) {
        var modelInstance = this.modelInstances[i];
        var segmentationData = modelInstance.model.segmentations? modelInstance.model.segmentations[opts.segmentType] : null;
        if (segmentationData && segmentationData.data) {
          // Remove segments
          if (modelInstance.segments) {
            modelInstance.object3D.remove(modelInstance.segments);
          }
          modelInstance.segments = segmentationData.getSegments(
            {segmentName: opts.segmentName, useOriginalMaterial: opts.useOriginalMaterial,
              getMaterial: opts.getMaterial, object3D: modelInstance.object3D}
          );
          opts.applyMaterial(modelInstance.object3D, Object3DUtil.InvisibleMat);
          Object3DUtil.attachToParent(modelInstance.segments, modelInstance.object3D, this.scene);
        } else {
          applyMaterial(modelInstance.object3D);
        }
      }

      for (var i = 0; i < this.extraObjects.length; i++) {
        var object3D = this.extraObjects[i];
        applyMaterial(object3D);
      }
    };

    SceneState.prototype.createGhostSceneWithSegmentation = function (opts) {
      // Clone the current scene
      this.clearGhostScene();
      this.ghostScene = new THREE.Object3D();
      this.fullScene.add(this.ghostScene);

      var segmentName = opts.segmentName;
      for (var i = 0; i < this.modelInstances.length; i++) {
        var modelInstance = this.modelInstances[i];
        modelInstance.segments = modelInstance.model.segmentation.getSegments(
          {segmentName: opts.segmentName, getMaterial: opts.getMaterial, object3D: modelInstance.object3D}
        );
        Object3DUtil.attachToParent(modelInstance.segments, this.ghostScene, this.fullScene);
      }
      for (var i = 0; i < this.extraObjects.length; i++) {
        var object3D = this.extraObjects[i];
        var segmented = object3D.clone();
        segmented.name = object3D.name + '-segmented';
        _.merge(segmented.userData, object3D.userData, { segmentType: opts.segmentType, segmentName: opts.segmentName });
        Object3DUtil.traverseMeshes(segmented, false, function(mesh) {
          if (segmentName === 'materials') {
            Object3DUtil.applyMaterial(segmented, opts.getMaterial(object3D, mesh.index));
          } else if (segmentName === 'meshes' || segmentName === 'surfaces') {
            Object3DUtil.applyMaterial(segmented, opts.getMaterial(object3D, mesh.index));
          } else {
            Object3DUtil.applyMaterial(segmented, opts.getMaterial(object3D, 0));
          }
        });
        object3D.updateMatrixWorld();
        Object3DUtil.setMatrix(segmented, object3D.matrixWorld);
        Object3DUtil.attachToParent(segmented, this.ghostScene, this.fullScene);
      }
      Object3DUtil.setVisible(this.scene, false);
      Object3DUtil.setVisible(this.ghostScene, true);
    };

    SceneState.prototype.createGhostSceneWithParts = function (objectParts) {
      // Clone the current scene
      console.log('Got ' + objectParts.length + ' parts');
      //console.log(objectParts);
      this.clearGhostScene();
      this.ghostScene = new THREE.Object3D();
      var clone = this.scene.clone();
      //Object3DUtil.copyModelInstancesOfChildren(this.scene, clone);
      this.ghostScene.add(clone);
      this.fullScene.add(this.ghostScene);
      Object3DUtil.setMaterial(this.ghostScene, Object3DUtil.ClearMat);
      // go over the scene and highlight the object parts
      var indexedObjects = Object3DUtil.getIndexedObject3Ds(this.ghostScene);
      // console.log(indexedObjects);
      for (var iPart = 0; iPart < objectParts.length; iPart++) {
        var objPart = objectParts[iPart];
        var index = objPart['objectIndex'];
        var obj = indexedObjects[index];
        if (obj && objPart.segment && objPart.segment.length) {
          var color;
          if (objPart.attribute) {
            for (var i = 0; i < objPart.attribute.length; i++) {
              var attr = objPart.attribute[i];
              if (attr.name === 'color') {
                color = Object3DUtil.getColor(attr.value);
                break;
              }
            }
          }
          var mat = Object3DUtil.getSimpleFalseColorMaterial(iPart, color);
          var segments = Object3DUtil.remeshObject(obj, objPart.segment);
          Object3DUtil.setMaterial(segments, mat);
          this.ghostScene.add(segments);
        }
      }
      Object3DUtil.setVisible(this.scene, false);
      Object3DUtil.setVisible(this.ghostScene, true);
    };

    SceneState.prototype.compactify = function () {
      // Re-order models so our array of model instances doesn't have any gaps
      var newModelInstances = [];
      for (var i = 0; i < this.modelInstances.length; i++) {
        var modelInstance = this.modelInstances[i];
        if (modelInstance) {
          newModelInstances.push(modelInstance);
        }
      }
      this.modelInstances = newModelInstances;
      this.assignObjectIndices();
      this.populateSelectables();
    };

    // Private helper function to addObject3D
    SceneState.prototype._addObject3DToFullScene = function (obj) {
      if (obj.userData.isPickable !== false) {
        this.fullScene.pickables.push(obj);
      }
      if (obj.userData.isSelectable !== false) {
        this.fullScene.selectables.push(obj);
      }
      if (obj.userData.isEditable !== false) {
        this.fullScene.editables.push(obj);
      }
      if (obj.userData.isSupportObject !== false) {
        this.fullScene.supportObjects.push(obj);
      }
      this.__onObjectAdded(obj);
    };

    SceneState.prototype._removeObject3DFromFullScene = function (obj) {
      if (obj.userData.isPickable !== false) {
        _.pull(this.fullScene.pickables, obj);
      }
      if (obj.userData.isSelectable !== false) {
        _.pull(this.fullScene.selectables, obj);
      }
      if (obj.userData.isEditable !== false) {
        _.pull(this.fullScene.editables, obj);
      }
      if (obj.userData.isSupportObject !== false) {
        _.pull(this.fullScene.supportObjects, obj);
      }
      this.__onObjectRemoved(obj);
    };

    SceneState.prototype.addExtraObject = function (obj) {
      // Extra objects
      var matInv = new THREE.Matrix4();
      matInv.getInverse(this.extraObjectNode.matrix);
      obj.applyMatrix(matInv);
      this.extraObjectNode.add(obj);
      this.extraObjects.push(obj);
      this._addObject3DToFullScene(obj);
    };

    SceneState.prototype.removeExtraObject = function (obj) {
      if (obj.parent) {
        obj.parent.remove(obj);
      }
      _.pull(this.extraObjects, obj);
      this._removeObject3DFromFullScene(obj);
    };

    SceneState.prototype.populateSelectables = function () {
      var objects = this.modelInstances.map(function (m) { return m.object3D; });
      this.fullScene.pickables = objects.filter(
        function (o) { return o && o.userData.isPickable !== false; }
      );

      this.fullScene.selectables = objects.filter(
        function (o) { return o && o.userData.isSelectable !== false; }
      );

      this.fullScene.editables = objects.filter(
        function (o) { return o && o.userData.isEditable !== false; }
      );

      this.fullScene.supportObjects = objects.filter(
        function (o) { return o && o.userData.isSupportObject !== false; }
      );

      this.extraObjects.forEach(this._addObject3DToFullScene.bind(this));
    };

    SceneState.prototype.setCurrentCamera = function (camera) {
      this.currentCamera = camera;
    };

    SceneState.prototype.setCurrentCameraControls = function (cameraControls, setCameraTo) {
      this.currentCameraControls = cameraControls;
      return this.applyCameraState(setCameraTo);
    };

    SceneState.prototype.applyCameraState = function (setCameraTo) {
      if (setCameraTo) {
        var currentCam = this.getCameraJson(this.json, setCameraTo);
        if (currentCam && this.currentCameraControls) {
          var sceneToWorld = this.getSceneToWorldMatrix();
          // Convert to world orientation
          var scale = this.getVirtualUnit();
          currentCam = this.transformCameraState(currentCam, sceneToWorld, scale);
          this.currentCameraControls.restoreCameraState(currentCam);
          return true;
        }
      }
    };

    SceneState.prototype.updateState = function (json) {
      // Set selected models
      this.json = json;
      if (json.selected) {
        this.selectedObjects = json.selected.map(function (selection) {
          var i = selection.objectIndex;
          console.log('is selected: ' + i);
          this.modelInstances[i].object3D.userData.isSelected = true;
          return this.modelInstances[i].object3D;
        }.bind(this));
      }
      // Set current camera
      this.applyCameraState('current');
    };

    SceneState.prototype.getCameraJson = function (json, name) {
      if (json && json.scene && json.scene.camera) {
        var cameras = json.scene.camera;
        for (var ci = 0; ci < cameras.length; ci++) {
          var cf = cameras[ci];
          if (cf.name === name) {
            return cf;
          }
        }
      }
    };

    SceneState.prototype.getCoordinateFrameJson = function (json, name) {
      if (json && json.scene && json.scene.coordinateFrame) {
        var coordinateFrames = json.scene.coordinateFrame;
        for (var ci = 0; ci < coordinateFrames.length; ci++) {
          var cf = coordinateFrames[ci];
          if (cf.frameType === name) {
            return cf;
          }
        }
      }
    };

    SceneState.prototype.setObjectWorldMatrix = function (modelIndex, parentIndex, worldMatrix) {
      var modelInstance = this.modelInstances[modelIndex];
      var object3D = modelInstance.object3D;
      var parent = (parentIndex >= 0) ? this.modelInstances[parentIndex].object3D : this.scene;
      Object3DUtil.detachFromParent(object3D, this.fullScene);
      object3D.position.set(0,0,0);
      object3D.rotation.set(0,0,0);
      object3D.scale.set(1,1,1);
      object3D.updateMatrix();
      object3D.applyMatrix(worldMatrix);
      object3D.matrixWorldNeedsUpdate = true;
      Object3DUtil.attachToParent(object3D, parent);
    };

    SceneState.prototype.getSelectedModelIndices = function () {
      // Assign indices
      this.assignObjectIndices();
      var sceneSelections = this.selectedObjects.map(function (x) {
        var modelInstance = Object3DUtil.getModelInstance(x);
        return modelInstance? modelInstance.index : -1;
      }).filter(function(x) { return x >= 0;});
      return sceneSelections;
    };

    SceneState.prototype.getWorldToSceneMatrix = function () {
      return Object3DUtil.getAlignmentMatrix(Constants.worldUp, Constants.worldFront, this.getUp(), this.getFront());
    };

    SceneState.prototype.getSceneToWorldMatrix = function () {
      return Object3DUtil.getAlignmentMatrix(this.getUp(), this.getFront(), Constants.worldUp, Constants.worldFront);
    };

    SceneState.prototype.transformCameraState = function (camState, matrix, scale) {
      // Takes camera state using matrix
      var fields = ['up', 'position', 'target', 'direction'];
      var transformedCamState = {};
      for (var i = 0; i < fields.length; i++) {
        var field = fields[i];
        var fieldValue = camState[field];
        if (fieldValue) {
          transformedCamState[field] = new THREE.Vector3();
          if (fieldValue instanceof Array) {
            transformedCamState[field].set(fieldValue[0], fieldValue[1], fieldValue[2]);
          } else {
            transformedCamState[field].copy(fieldValue);
          }
          transformedCamState[field].applyMatrix4(matrix);
          if (field === 'position' || field === 'target') {
            // also apply scale
            transformedCamState[field].multiplyScalar(scale);
          }
        }
      }
      for (var prop in camState) {
        if (camState.hasOwnProperty(prop) && !transformedCamState[prop]) {
          transformedCamState[prop] = camState[prop];
        }
      }
      return transformedCamState;
    };

    SceneState.prototype.__getMatchingRegions = function(object3D, rtype, level) {
      var rooms = [];
      object3D.traverse(function (node) {
        if (node instanceof THREE.Group && node.userData.type === rtype) {
          // check that this room belongs to the specified level (do type compatible check)
          if (level == undefined || node.userData.level == level) {
            rooms.push(node);
          }
        }
      });
      return rooms;
    };

    SceneState.prototype.getGrounds = function (level, filter) {
      if (level != null && _.isNumber(level)) {
        var levels = this.getLevels();
        level = levels[level];
      }
      // Try to get cached grounds
      var grounds = level? level.__grounds : this.__grounds;
      if (!grounds) {
        if (level instanceof THREE.Object3D) {
          grounds = this.__getMatchingRegions(level, 'Ground');
        } else {
          grounds = this.__getMatchingRegions(this.scene, 'Ground', level);
        }
        if (level) {
          level.__grounds = grounds;
        } else {
          this.__grounds = grounds;
        }
      }
      if (filter) {
        grounds = _.filter(grounds, filter);
      }
      return grounds;
    };

    SceneState.prototype.getRooms = function (level) {
      if (level instanceof THREE.Object3D) {
        return this.__getMatchingRegions(level, 'Room');
      } else {
        return this.__getMatchingRegions(this.scene, 'Room', level);
      }
    };

    SceneState.prototype.getHouseRegions = function(level) {
      var rooms = [];
      if (level instanceof THREE.Object3D) {
        rooms = this.__getMatchingRegions(level, 'Region');
      } else if (this.house && this.house.object3D) {
        rooms = this.__getMatchingRegions(this.house.object3D, 'Region', level);
      }
      return rooms;
    };

    SceneState.prototype.getRoomsOrHouseRegions = function (level, filter) {
      if (level != null && _.isNumber(level)) {
        var levels = this.getLevels();
        level = levels[level];
      }
      // Try to get cached roomsOrHouseRegions
      var rooms = level? level.__roomsOrHouseRegions : this.__roomsOrHouseRegions;
      if (!rooms) {
        rooms = this.getRooms(level);
        if (rooms.length === 0) {
          rooms = this.getHouseRegions(level);
        }
        if (level) {
          level.__roomsOrHouseRegions = rooms;
        } else {
          this.__roomsOrHouseRegion = rooms;
        }
      }
      if (filter) {
        rooms = _.filter(rooms, filter);
      }
      return rooms;
    };

    SceneState.prototype.getRoomInfo = function (room) {
      if (!room) {
        return { id: '', roomType: '' };
      }
      var roomType = room.userData.roomType || room.userData.regionType || [];
      if (_.isArray(roomType)) {
        if (roomType.length) {
          roomType = roomType[0];  // Hackishly pick first roomType only
        } else if (roomType.length === 0 && room.userData.origRoomType) {  // Use origRoomType if roomType empty
          roomType = room.userData.origRoomType;
        } else {
          roomType = '';
        }
      }
      return { id: room.userData.id, roomType: roomType };
    };

    SceneState.prototype.__getLevels = function (object3D) {
      var levels = [];
      object3D.traverse(function (node) {
        if (node instanceof THREE.Group && node.userData.type === 'Level' && node.children.length > 0) {
          levels.push(node);
        }
      });
      levels.sort(function (x) { return x.userData.id; });
      return levels;
    };

    SceneState.prototype.getLevels = function() {
      var levels = this.__getLevels(this.scene);
      if (!levels.length && this.house && this.house.object3D) {
        levels = this.__getLevels(this.house.object3D);
      }
      if (!levels.length) {
        levels = [this.scene]; // No real levels, return whole scene as one level
      }
      return levels;
    };

    SceneState.prototype.getLevelByIndex = function(index) {
      var levels = this.getLevels();
      return levels[index];
    };

    SceneState.prototype.getSelectedObjects = function() {
      return this.selectedObjects;
    };

    SceneState.prototype.getSceneJson = function () {
      if (this.json && this.json.scene) {
        return this.json.scene;
      }
    };

    SceneState.prototype.getSceneTemplate = function () {
      if (this.json && this.json.scene && this.json.scene.template) {
        return this.json.scene.template;
      }
    };

    SceneState.prototype.toJsonString = function () {
      var json = this.toJson();
      return JSON.stringify(json);
    };

    SceneState.prototype.toJson = function (includeUserData) {
      // Assign indices
      this.assignObjectIndices();
      // Populate a scene state
      var sceneObjects = [];
      var sceneTransformMatrixInverse = new THREE.Matrix4();
      sceneTransformMatrixInverse.getInverse(this.scene.matrixWorld);
      for (var i = 0; i < this.modelInstances.length; i++) {
        var modelInstance = this.modelInstances[i];
        var modelObject = modelInstance.getObject3D('Model');
        modelObject.updateMatrixWorld();
        var transformMatrix = new THREE.Matrix4();
        transformMatrix.multiplyMatrices(sceneTransformMatrixInverse, modelObject.matrixWorld);
        var transform = Object3DUtil.matrix4ToProto(transformMatrix);
        var parentIndex = (modelInstance.object3D.parent) ? modelInstance.object3D.parent.index : -1;
        if (parentIndex === undefined || parentIndex === null) {
          parentIndex = -1;
        }
        var sceneObject = {
          modelId: modelInstance.model.getFullID(),
          index: modelInstance.object3D.index,
          parentIndex: parentIndex,
          transform: transform
          //          objectDescIndex: -1
        };
        if (includeUserData) {
          sceneObject.userData = modelInstance.object3D.userData;
        }
        sceneObjects.push(sceneObject);
      }

      var scene = {
        up: this.getUp(),
        front: this.getFront(),
        unit: this.getUnit(),
        object: sceneObjects
      };

      // TODO: Save extraObjects
      var includeExtraObjects = true;
      if (includeExtraObjects && this.extraObjects.length > 0) {
        // Get objects (but exclude modelInstances and references to other objects)
      }
      // NOTE: this field added July 13, 2015-- sceneStates prior to this do not contain this
      // NOTE: This is not handled by the text2scene backend
      // if (this.wrappedThreeObjects.length) {
      //   scene['wrappedThreeObjects'] = this.wrappedThreeObjects.map(function (x) {
      //     return x.toJson();
      //   });
      // }

      var sceneId = this.getFullID();
      if (sceneId) {
        scene.sceneId = sceneId;
      }
      if (this.currentCameraControls) {
        // Set viewer coordinate frame
        var currentCameraState = this.currentCameraControls.getCurrentCameraState();
        // Convert to scene orientation
        var worldToScene = this.getWorldToSceneMatrix();
        var scale = 1.0 / this.getVirtualUnit();
        currentCameraState = this.transformCameraState(currentCameraState, worldToScene, scale);
        currentCameraState['name'] = 'current';
        // Let the Babysherlock set the viewer coordinate frame from the current camera state
        // Also set the scene cameras
        scene['camera'] = [currentCameraState];
      }

      var selectedIndices = this.getSelectedModelIndices();
      var sceneSelections = selectedIndices.map(function (index) {
        var selection = {
          objectIndex: index
        };
        return selection;
      });

      var ss = {
        format: 'sceneState',
        scene: scene,
        selected: sceneSelections
      };
      return ss;
    };

    SceneState.prototype.changeTexture = function(materialIndex, mi, texture) {
      // Updates material with new texture
      this.changeMaterial(materialIndex, mi, { map: texture });
    };

    SceneState.prototype.changeMaterial = function(materialIndex, mi, materialChanges) {
      // Updates material with new material
      var metadata = materialIndex.metadata(mi);
      if (metadata && metadata.materials) {
        for (var i = 0; i < metadata.materials.length; i++) {
          var m = metadata.materials[i].m;
          if (m) {
            _.merge(m, materialChanges);
          }
        }
      }
    };

    SceneState.prototype.getObject3Ds = function() {
      var modelInstances = Object3DUtil.findModelInstances(this.scene);
      var object3Ds = _.map(modelInstances, function (mInst) {
        return mInst.object3D;
      });
      return object3Ds.concat(this.extraObjects);
    };

    SceneState.prototype.computeObjectIndex = function() {
      var objectIndex = new Index();
      objectIndex.add('unknown');
      var object3Ds = this.getObject3Ds();
      var sorted = _.sortBy(object3Ds, function(object3D) {
        var id = object3D.userData.id;
        var parts = id.split('_');
        parts[0] = parseInt(parts[0]);
        parts[1] = parts.length >= 2? parseInt(parts[1]) : -1;
        parts[2] = parts.length >= 3? parseInt(parts[2]) : -1;
        return parts;
      });
      for (var i = 0; i < sorted.length; i++) {
        var object3D = sorted[i];
        var modelInstance = Object3DUtil.getModelInstance(object3D);
        var objectCategory = modelInstance? modelInstance.model.getCategory() : (object3D.userData.type || object3D.name);
        var metadata = {
          modelId: modelInstance? modelInstance.model.getFullID() : undefined,
          category: objectCategory
        };
        objectIndex.indexOf(object3D.userData.id, true, metadata);
      }
      return objectIndex;
    };

    SceneState.prototype.getObjectIndex = function() {
      if (!this.__objectIndex) {
        this.__objectIndex = this.computeObjectIndex();
      }
      return this.__objectIndex;
    };

    SceneState.prototype.computeRoomIndex = function() {
      var roomIndex = new Index();
      roomIndex.add('unknown');
      var rooms = this.getRooms();
      var sorted = _.sortBy(rooms, function(room) {
        var id = room.userData.id;
        var parts = id.split('_');
        parts[0] = parseInt(parts[0]);
        parts[1] = parts.length >= 2? parseInt(parts[1]) : -1;
        return parts;
      });
      for (var i = 0; i < sorted.length; i++) {
        var room = sorted[i];
        room.userData.index = roomIndex.indexOf(room.userData.id, true, { room: room }) - 1; // Have stored index be 0 based
      }
      return roomIndex;
    };

    SceneState.prototype.getRoomIndex = function() {
      if (!this.__roomIndex) {
        this.__roomIndex = this.computeRoomIndex();
      }
      return this.__roomIndex;
    };

    SceneState.prototype.getRoomByIndex1 = function(roomIndex) {
      if (_.isFinite(roomIndex) && roomIndex > 0) {
        // input roomIndex is one based
        if (this.house) {
          var region = this.house.regions[roomIndex-1];  // regions start at index 0
          return region? region.object3D : null;
        } else {
          var metadata = this.getRoomIndex().metadata(roomIndex); // 0 is unknown - real rooms start at 1
          return metadata? metadata.room : null;
        }
      }
    };

    SceneState.prototype.setVisible = function(flag, filter, recursive) {
      var matching = Object3DUtil.findNodes(this.scene, filter);
      for (var i = 0; i < matching.length; i++) {
        Object3DUtil.setVisible(matching[i], flag, recursive);
      }
    };

    /**
     * Returns a list of model ids in use in this scene
     */
    SceneState.prototype.getModelIds = function(filter) {
      var mInsts = filter? _.filter(this.modelInstances, filter) : this.modelInstances;
      var modelIds = _.map(mInsts, function(x) { return x.model.getFullID(); });
      modelIds = _.uniq(modelIds);
      return modelIds;
    };

    SceneState.prototype.getModelIdCounts = function(filter) {
      var mInsts = filter? _.filter(this.modelInstances, filter) : this.modelInstances;
      var modelIdCounts = _.countBy(mInsts, function(x) { return x.model.getFullID(); });
      return modelIdCounts;
    };


    /** When scene state is updated we may also need to dynamically update auxiliary information kept with the scene */
    SceneState.prototype.__onObjectAdded = function(object3D) {
      // Update BVH
      if (this.bvh) {
        // TODO: update bvh more efficiently
        this.bvh = null;
      }
      if (this.octree) {
        // TODO: update octree more efficiently
        this.octree = null;
      }
    };

    SceneState.prototype.__onObjectRemoved = function(object3D) {
      // Update BVH
      if (this.bvh) {
        // TODO: update bvh more efficiently
        this.bvh = null;
      }
      if (this.octree) {
        // TODO: update octree more efficiently
        this.octree = null;
      }
    };

    SceneState.prototype.__onObjectChanged = function(object3D) {
      // Update BVH
      if (this.bvh) {
        // TODO: update bvh more efficiently
        this.bvh = null;
      }
      if (this.octree) {
        // TODO: update octree more efficiently
        this.octree = null;
      }
    };


    SceneState.prototype.__getIntersectedRoomAt = function (rooms, position, distThreshold) {
      function selectRoom(candidates) {
        candidates = RaycasterUtil.getClosestPerObject(candidates, distThreshold);
        // Select smallest room
        return _.minBy(candidates, function(c) {
          return SceneUtil.getRoomFloorArea(c.object);
        });
      }
      var room;
      //console.log('rooms', rooms.map( function(r) { return Object3DUtil.getBoundingBox(r); }));
      var downwards = RaycasterUtil.getIntersected(rooms, { position: position, direction: Constants.worldDown, intersectBackFaces: true});
      if (downwards && downwards.length) {
        room = selectRoom(downwards);
      }
      var upwards = RaycasterUtil.getIntersected(rooms, { position: position, direction: Constants.worldUp, intersectBackFaces: true});
      if (upwards && upwards.length) {
        var c = selectRoom(upwards);
        if (room && c) {
          if (c.distance < room.distance) {
            room = c;
          }
        } else if (c) {
          room = c;
        }
      }
      return room;
    };

    SceneState.prototype.getIntersectedRoomAt = function(position, level, distThreshold) {
      if (distThreshold == undefined) {
        distThreshold = 0.05*Constants.metersToVirtualUnit;
      }
      var rooms = this.getRoomsOrHouseRegions(level);
      return this.__getIntersectedRoomAt(rooms, position, distThreshold);
    }

    SceneState.prototype.getIntersectedGroundAt = function(position, level, distThreshold) {
      if (distThreshold == undefined) {
        distThreshold = 0.05*Constants.metersToVirtualUnit;
      }
      var rooms = this.getGrounds(level);
      return this.__getIntersectedRoomAt(rooms, position, distThreshold);
    }

    SceneState.prototype.computeFloorHeight = function (room, defaultFloorHeight) {
      if (room instanceof THREE.Object3D) {
        var floors = Object3DUtil.findNodes(room, function(node) {
          return node.userData.type === 'Floor' || node.userData.type === 'Ground';
        });
        if (floors.length > 0) {
          if (floors.length === 1) {
            return Object3DUtil.getBoundingBox(floors[0]).max.y
          } else {
            var weightedHeights = _.map(floors, function(floor) {
              return {
                weight: SceneUtil.getRoomFloorArea(floor),
                height: Object3DUtil.getBoundingBox(floor).max.y
              };
            });
            var totalWeight = _.sum(_.map(weightedHeights, function(x) { return x.weight; }));
            var weightedSum = _.sum(_.map(weightedHeights, function(x) { return x.weight*x.height; }));
            console.log('floor height ' + weightedSum/totalWeight);
            return weightedSum/totalWeight;
          }
        }
        return (defaultFloorHeight != undefined)? defaultFloorHeight : Object3DUtil.getBoundingBox(room).min.y;
      }
    };

    SceneState.prototype.getFloorHeight = function (room, defaultFloorHeight) {
      if (room instanceof THREE.Object3D) {
        if (room.userData.floorHeight == undefined) {
          room.userData.floorHeight = this.computeFloorHeight(room, defaultFloorHeight);
        }
        return room.userData.floorHeight;
      }
      if (!room) {
        if (this.info.floorHeight != undefined) {
          return this.info.floorHeight;
        } else if (this.info.baseModelInfo) {
          return this.info.baseModelInfo.floorHeight;
        } else {
          return defaultFloorHeight;
        }
      }
    };
    // Exports
    return SceneState;

  });
