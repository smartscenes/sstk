'use strict';

// Simple drag and drop that moves object in a plane
define(['Constants', 'controls/Picker', 'model/ModelInstance', 'geo/Object3DUtil', 'controls/HighlightControls', 'PubSub',
  'editor/UILog', 'geo/AttachmentBasedBoundingBoxHelper'],
  function (Constants, Picker, ModelInstance, Object3DUtil, HighlightControls, PubSub, UILog,
            AttachmentBasedBoundingBoxHelper) {
    DragDrop.SSC = Constants.EditStrategy.SupportSurfaceChange;

    /**
     * Allows for drag and drop of a object in 3D.
     * Drag and drag publishes the following events
     * Each event has a parameter indicating the command type (string), and an optional parameter indicating
     *   the object being manipulated
     *  Constants.EDIT_OPSTATE.INIT
     *  Constants.EDIT_OPSTATE.DONE
     * @param params Configuration
     * @param params.container Main view container element (used for setting cursor style and picking coordinates)
     * @param params.picker {controls.Picker} Picker to use for picking
     * @param params.controls Camera controls that need to be disabled when drag drop happens
     * @param params.uilog {editor.UILog} UILog to track user actions
     * @param params.sceneUpdatedCallback {controls.Picker} Picker to use for picking
     * @param [params.enabled=false] {boolean} Whether drag drop is enabled or not.
     * @param [params.allowAny=false] {boolean} Whether any object3D is can be drag and dropped or just object3D with userData isEditable.
     * @param [params.attachToParent=false] {boolean} Whether to automatically attach to support parent or remain detached when putOnObject is true.
     * @param [params.useModelBase=false] {boolean} Whether to use model base ...
     * @param [params.useModelContactPoint=true] {boolean} Whether to use prespecified model contact points.
     * @param [params.putOnObject=true] {boolean} Whether objects need to be placed on an support object.
     * @param [params.allowFloating=false] {boolean} Whether to allow floating obejcts (if putOnObject is true - does this work?).
     * @param [params.supportSurfaceChange=DragDrop.SSC.NONE] {DragDrop.SSC.NONE|DragDrop.SSC.SWITCH_ATTACHMENT|DragDrop.SSC.REORIENT_CHILD}
     *    Whether to visualize the bounding box of selected object.
     * @param [params.useVisualizer=false] {boolean} Whether to visualize the bounding box of selected object.
     * @constructor
     */
    function DragDrop(params) {
      PubSub.call(this);

      this.container = params.container;
      this.picker = params.picker;
      this.controls = params.controls;
      this.sceneUpdatedCallback = params.sceneUpdatedCallback;
      this.useVisualizer = params.useVisualizer;
      this.uilog = params.uilog;
      this.allowAny = params.allowAny;
      this.attachToParent = params.attachToParent;
      this.useModelBase = params.useModelBase;
      this.useModelContactPoint = (params.useModelContactPoint != undefined)? params.useModelContactPoint:true;
      this.pickerPlaneSize = 100*Constants.metersToVirtualUnit;

      // Drag and drop is enabled
      this.enabled = (params.enabled != undefined)? params.enabled : false;
      // Should we always try to have objects be supported?
      this.putOnObject = (params.putOnObject != undefined)? params.putOnObject : true;
      // If putOnObject is true, but we didn't find parent object, do we allow the object to be floating in the air?
      this.allowFloating = (params.allowFloating != undefined)? params.allowFloating : false;
      // What to do when support surface changes
      this.supportSurfaceChange = (params.supportSurfaceChange !== undefined) ? params.supportSurfaceChange : DragDrop.SSC.NONE;
      if (this.supportSurfaceChange === DragDrop.SSC.REORIENT_CHILD) {
        if (!this.useModelBase) {
          console.log('Using supportSurfaceChange REORIENT_CHILD - setting useModelBase to true');
          this.useModelBase = true;
        }
      }
      // Different cursor stype to use
      this.cursorMoveStyle = 'none'; //'move';

      this.defaultCursor = 'auto';

      this.userIsInserting = false;//true after user has clicked on a model, but before mouse enters container
      this.insertMode = false;//true when user is in process of placing inserted model

      this.shouldPush = false;//true when mouse is dragged
      this.mouseDown = false;//used for determining mouse drag

      this.yTranslateOn = false;

      this.reset(params);
    }

    DragDrop.prototype = Object.create(PubSub.prototype);
    DragDrop.prototype.constructor = DragDrop;

    DragDrop.prototype.reset = function (params) {
      this.camera = params.camera;
      this.scene = params.scene;
      this.controls = params.controls;
      this.enabled = (params.enabled !== undefined) ? params.enabled : this.enabled;

      // We have selected this object3D
      this.selected = null;
      // Our mouse is over this object3D
      this.intersected = null;
      // The plane that we will move in
      // NOTE: Starting from THREE.js r72, we need to make the material not visible
      //       so the object is not displayed, but still intersectable by the RayCaster
      this.plane = this.plane || new THREE.Mesh(new THREE.PlaneBufferGeometry(this.pickerPlaneSize, this.pickerPlaneSize, 8, 8),
        new THREE.MeshBasicMaterial({
          color: 0x000000,
          opacity: 0.25,
          transparent: true,
          wireframe: true,
          visible: false
        }));
      this.plane.name = 'FloatPickingPlane';
      this.ignore = [this.plane];
      if (this.scene) {
        this.scene.add(this.plane);
      }

      this.mouse = new THREE.Vector2();
      this.placementInfo = {
        offset: new THREE.Vector3()
      };
      this.highlightControls = this.createHighlightControls();
    };

    //Called after user selects model from side panel and model is loaded
    DragDrop.prototype.onInsert = function (object3D) {
      if (this.enabled) {
        // Inserting an object, indicate the selected object
        this.selected = object3D;
        this.selected.visible = true;

        // Set booleans appropriately
        this.shouldPush = true;
        this.userIsInserting = true;
        this.insertMode = true;

        this.container.style.cursor = this.cursorMoveStyle;

        // TODO: set appropriate attachment based on priors
        var attachments = this.identifyAttachmentsForPlacement(object3D);
        this.selectedPoint = attachments[this.placementInfo.attachmentIndex].world.pos;

        this.oldParent = null;
      }
    };

    DragDrop.prototype.__identifyBoundingBoxAttachments = function(object3D) {
      this.placementInfo.origBBox = Object3DUtil.getBoundingBox(object3D);
      var bbfaceCenters = this.placementInfo.origBBox.getFaceCenters();
      var attachmentPoints = [];
      for (var i = 0; i < bbfaceCenters.length; i++) {
        var p = Object3DUtil.FaceCenters01[i];
        attachmentPoints.push({
          type: 'bbface',
          frame: 'worldBB',
          bbfaceIndex: i,
          local: {pos: p, out: Object3DUtil.OutNormals[i]},
          world: {pos: bbfaceCenters[i], out: Object3DUtil.OutNormals[i]},
          index: i
        });
      }
      this.placementInfo.attachments = attachmentPoints;
    };

    DragDrop.prototype.identifyAttachmentsForPlacement = function (object3D) {
      // Assume attaching on the bottom
      // Conceptually, the different bbface centers represent possible attachment points for the object
      var modelInstance = Object3DUtil.getModelInstance(object3D);
      var u = object3D.userData;
      var childWorldBBFaceIndex = u['childWorldBBFaceIndex'];
      if (childWorldBBFaceIndex == undefined) {
        childWorldBBFaceIndex = Constants.BBoxFaceCenters.BOTTOM;
      }
      this.placementInfo.childWorldBBFaceIndex = childWorldBBFaceIndex;
      if (modelInstance) {
        this.placementInfo.attachments = modelInstance.getCandidateAttachmentPoints();
        // HACKY!!! Find annotated attachment point if available...
        var contactPointAttachmentIndex = -1;
        if (this.useModelContactPoint) {
          var arr = this.placementInfo.attachments;
          for (var i = 0; i < arr.length; i++) {
            if (arr[i].type === 'annotated') {
              // Set attachmentIndex to this
              contactPointAttachmentIndex = i;
              break;
            }
          }
        }
        if (contactPointAttachmentIndex >= 0) {
          this.placementInfo.attachmentIndex = contactPointAttachmentIndex;
        } else {
          this.__identifyBoundingBoxAttachments(object3D);
          u['attachmentIndex'] = undefined;
          this.placementInfo.attachmentIndex = childWorldBBFaceIndex;
        }
      } else {
        // Some other thingy... code path not really tested
        this.__identifyBoundingBoxAttachments(object3D);
        u['attachmentIndex'] = undefined;
        this.placementInfo.attachmentIndex = childWorldBBFaceIndex;
      }
      this.updateAttachmentIndex(this.selected, this.placementInfo.attachmentIndex, this.placementInfo.childWorldBBFaceIndex);
      return this.placementInfo.attachments;
    };

    DragDrop.prototype.identifyAttachmentIndex = function (intersects) {
      // TODO: Depending on the normal of the support surface, pick appropriate face to attach
      // TODO: Decouple world bbox and object semantic frame
      var norm = this.picker.getIntersectedNormal(intersects[0]);
      var bbFaceIndexWorld = norm ? Object3DUtil.findClosestBBFaceByInNormal(norm) : -1;
      if (bbFaceIndexWorld >= 0) {
        if (this.supportSurfaceChange === DragDrop.SSC.SWITCH_ATTACHMENT) {
          if (this.placementInfo.attachmentIndex >= 6) {
            // Special, don't change // HACKY, HACKY
            return this.placementInfo.childWorldBBFaceIndex === bbFaceIndexWorld;
          } else {
            if (bbFaceIndexWorld !== this.placementInfo.childWorldBBFaceIndex) {
              this.placementInfo.attachmentIndex = bbFaceIndexWorld;
              this.placementInfo.childWorldBBFaceIndex = bbFaceIndexWorld;
              this.updateAttachmentIndex(this.selected, this.placementInfo.attachmentIndex, bbFaceIndexWorld);
            }
            return true;
          }
        } else if (this.supportSurfaceChange === DragDrop.SSC.REORIENT_CHILD) {
          // Reorient so normal from attachment point is in same direction as the norm
          var selected = this.selected;
          var localObjInNormal = selected.userData['attachmentDir1'];
          var quaternion = selected.getWorldQuaternion(new THREE.Quaternion());
          var worldObjInNormal = localObjInNormal?
            localObjInNormal.clone() : Object3DUtil.InNormals[Constants.BBoxFaceCenters.BOTTOM].clone();
          worldObjInNormal.applyQuaternion(quaternion);
          var targetInNormal1 = Object3DUtil.InNormals[bbFaceIndexWorld];
          if (!targetInNormal1.equals(worldObjInNormal)) {
            var targetInNormal2 = new THREE.Vector3();
            targetInNormal2.crossVectors(targetInNormal1, worldObjInNormal).normalize();
            var q = Object3DUtil.getAlignmentQuaternion(worldObjInNormal, targetInNormal2, targetInNormal1, targetInNormal2);
            selected.quaternion.multiplyQuaternions(selected.quaternion, q);
            selected.updateMatrix();
            Object3DUtil.clearCache(selected);
          }
          if (bbFaceIndexWorld !== this.placementInfo.childWorldBBFaceIndex) {
            this.Publish('AttachmentChanged', { bbFaceIndex: bbFaceIndexWorld });
          }
          this.placementInfo.childWorldBBFaceIndex = bbFaceIndexWorld;
          return true;
        } else if (this.supportSurfaceChange === DragDrop.SSC.NONE) {
          return this.placementInfo.childWorldBBFaceIndex === bbFaceIndexWorld;
        }
      } else {
        return false;
      }
    };

    DragDrop.prototype.onMouseMove = function (event) {
      if (this.mouseDown) {
        this.shouldPush = true;
      }
      if (!this.enabled) return true;
      event.preventDefault();

      if (this.selected) {
        this.mouse = this.picker.getCoordinates(this.container, event);
        this.moveSelected(this.mouse.x, this.mouse.y);
        return false;
      } else {
        if (this.highlightControls) {
          // Highlight model on mouseover
          this.highlightControls.onMouseMove(event);
          this.intersected = this.highlightControls.intersected;
        }
        if (this.intersected) {
          this.container.style.cursor = 'pointer';
        } else {
          this.container.style.cursor = this.defaultCursor;
        }
        return true;
      }
    };

    DragDrop.prototype.onMouseLeave = function (event) {
      if (!this.enabled) return;
      if (!this.selected) {
        if (this.highlightControls) {
          // Highlight model on mouseover
          this.highlightControls.onMouseLeave(event);
          this.intersected = this.highlightControls.intersected;
        }
        if (this.intersected) {
          this.container.style.cursor = 'pointer';
        } else {
          this.container.style.cursor = this.defaultCursor;
        }
      }
    };

    DragDrop.prototype.clearHighlight = function () {
      if (this.highlightControls) {
        this.highlightControls.clear();
      }
    };

    DragDrop.prototype.isEditable = function (intersected) {
      if (this.allowAny) { return true; }
      else {
        var modelInstance = Object3DUtil.getModelInstance(intersected.object);
        return modelInstance && modelInstance.object3D.userData.isSelectable && modelInstance.object3D.userData.isEditable;
      }
    };

    DragDrop.prototype.isSelectable = function (intersected) {
      if (this.allowAny) { return true; }
      else {
        var modelInstance = Object3DUtil.getModelInstance(intersected.object);
        return modelInstance && modelInstance.object3D.userData.isSelectable;
      }
    };

    DragDrop.prototype.createHighlightControls = function () {
      var scope = this;
      return new HighlightControls({
        container: this.container,
        picker: this.picker,
        camera: this.camera,
        scene: this.scene,
        acceptCallback: function (intersected) {
          return scope.isSelectable(intersected);
        }
      });
    };

    DragDrop.prototype.positionPlane = function (intersected, plane) {
      // Position drag drop plane
      plane.position.copy(intersected.point);
      //TODO(MS): Have plane be positioned on support surface for putOnObject mode
      plane.lookAt(this.camera.position);
    };

    DragDrop.prototype.getOffset = function (intersected) {
      var offset = new THREE.Vector3();
      intersected.object.localToWorld(offset);
      offset.sub(intersected.point);
      return offset;
    };

    DragDrop.prototype.onMouseDown = function (event, intersected) {
      this.mouseDown = true;

      if (this.enabled && !this.insertMode) {
        event.preventDefault();
        this.mouse = this.picker.getCoordinates(this.container, event);
        if (intersected === undefined) {
          var pickables = (this.scene.pickables) ? this.scene.pickables : this.scene.children;
          intersected = this.picker.getFirstIntersected(this.mouse.x, this.mouse.y, this.camera, pickables);
        }
        if (intersected) {
          this.positionPlane(intersected, this.plane);
          var accept = this.isEditable(intersected);
          if (accept) {
            intersected.offset = this.getOffset(intersected);
            this.attach(intersected);
            return false;
          } else {
            this.detach();
          }
        } else {
          this.detach();
        }
      }
      return true;
    };

    DragDrop.prototype.getAttachmentIndex = function(object) {
      var u = object.userData;
      var childAttachmentIndex = u['attachmentIndex'];
      if (childAttachmentIndex == undefined) {
        // TODO: Try to guess attachment index
        childAttachmentIndex = Constants.BBoxFaceCenters.BOTTOM;
      }
      return childAttachmentIndex;
    };

    DragDrop.prototype.updateAttachmentIndex = function(object, childAttachmentIndex, childWorldBBFaceIndex) {
      var modelInstance = Object3DUtil.getModelInstance(object);
      if (modelInstance) {
        if (childAttachmentIndex == undefined) {
          childAttachmentIndex = this.getAttachmentIndex(modelInstance.object3D);
        }
        if (childWorldBBFaceIndex == undefined) {
          if (childAttachmentIndex >= 6) {
            childWorldBBFaceIndex = Constants.BBoxFaceCenters.BOTTOM;
          } else {
            childWorldBBFaceIndex = childAttachmentIndex;
          }
        }
        if (this.useModelBase) {
          var u = modelInstance.object3D.userData;
          if (!u['attachmentPoint'] || (u['attachmentIndex'] !== childAttachmentIndex)) {
            // update attachments?
            //this.placementInfo.attachments = modelInstance.getCandidateAttachmentPoints();
            var attachment = this.placementInfo.attachments[childAttachmentIndex];
            var p = attachment.local.pos;
            modelInstance.setAttachmentPoint({ position: p, coordFrame: attachment.frame });
            // Old logic
            //var p = Object3DUtil.FaceCenters01[childAttachmentIndex];
            //modelInstance.setAttachmentPoint({position: p, coordFrame: 'worldBB', useModelContactPoint: this.useModelContactPoint});
            u['attachmentPoint'] = p;
            u['attachmentIndex'] = childAttachmentIndex;
            u['childWorldBBFaceIndex'] = childWorldBBFaceIndex;
            //u['attachmentDir1'] = Object3DUtil.InNormals[childAttachmentIndex];
            //u['attachmentDir2'] = Object3DUtil.InNormals[(childAttachmentIndex + 2) % 6];
            this.Publish('AttachmentChanged', { bbFaceIndex: childWorldBBFaceIndex });
          }
        } else {
          this.Publish('AttachmentChanged', { bbFaceIndex: childWorldBBFaceIndex });
        }
      }
    };

    DragDrop.prototype.attach = function (intersected) {
      this.selected = intersected.object;
      this.selectedPoint = intersected.point;
      this.Publish(Constants.EDIT_OPSTATE.INIT, Constants.CMDTYPE.MOVE, { object: this.selected });

      this.placementInfo = {
        // offset of selected point from (0,0,0) in world space
        offset: intersected.offset
      };
      // Save the relative position of point with respect to the 6 cube face centers...
      if (this.putOnObject) {
        this.detachSelectedFromParent();
        this.setAllOffsets();
      }
      if (this.controls) this.controls.enabled = false;
      this.container.style.cursor = this.cursorMoveStyle;
    };

    DragDrop.prototype.detach = function () {
      this.selected = null;
      if (this.controls) this.controls.enabled = true;
      this.container.style.cursor = this.defaultCursor;
    };

    DragDrop.prototype.onMouseUp = function (event) {
      if (event)
        event.preventDefault();
      this.mouseDown = false;
      var notHandled = true;
      if (!this.enabled) return notHandled;
      if (this.selected) {
        if (this.putOnObject) {
          this.newParent = this.newParent ? this.newParent : this.oldParent;
          if (this.attachToParent) {
            Object3DUtil.attachToParent(this.selected, this.newParent, this.scene);
          }
          this.selected.visible = true;
          if (this.sceneUpdatedCallback) {
            this.sceneUpdatedCallback();
          }
        }
        if (this.shouldPush) {
          this.shouldPush = false;
          if (this.insertMode) {
            // What to log in the ui about this model
            this.Publish(Constants.EDIT_OPSTATE.DONE, Constants.CMDTYPE.INSERT);
            if (this.uilog) {
              var objInfo = ModelInstance.getUILogInfo(this.selected, true);
              this.uilog.log(UILog.EVENT.MODEL_INSERT, event, objInfo);
            }
          } else {
            // What to log in the ui about this model
            this.Publish(Constants.EDIT_OPSTATE.DONE, Constants.CMDTYPE.MOVE, { object: this.selected });
            if (this.uilog) {
              var objInfo = ModelInstance.getUILogInfo(this.selected);
              this.uilog.log(UILog.EVENT.MODEL_MOVE, event, objInfo);
            }
          }
        }
        notHandled = false;
      }
      if (this.controls) this.controls.enabled = true;
      this.selected = null;
      this.container.style.cursor = this.defaultCursor;
      this.shouldPush = false;
      this.insertMode = false;
      this.removeVisualizer();
      return notHandled;
    };

    DragDrop.prototype.moveSelected = function (x, y) {
      if (!this.yTranslateOn) {
        if (this.putOnObject) {
          //var pickables = (this.scene.pickables)? this.scene.pickables: this.scene.children;
          var selectables = (this.scene.selectables) ? this.scene.selectables : this.scene.children;
          var supportObjects = (this.scene.supportObjects) ? this.scene.supportObjects : selectables;
          var ignored = [this.plane, this.selected];

          // TODO: Should we just check if the object intersects???
          // Figure out which other object the cursor intersects
          //var screenOffset = new THREE.Vector2(0,0);
          if (this.userIsInserting) {
            var initialIntersected = this.picker.getIntersected(x, y, this.camera, supportObjects, ignored);
            if (initialIntersected.length > 0) {
              this.userIsInserting = false;
              this.selected.visible = true;
              var mouse3DLoc = initialIntersected[0].point;
              // Make sure that attachment point set correctly
              this.updateAttachmentIndex(this.selected, this.placementInfo.attachmentIndex, this.placementInfo.childWorldBBFaceIndex);
              if (this.placementInfo.attachmentIndex >= 6) {
                Object3DUtil.placeObject3DByOrigin(this.selected, mouse3DLoc);
              } else {
                Object3DUtil.placeObject3DByBBFaceCenter(this.selected, mouse3DLoc, this.placementInfo.attachmentIndex, this.placementInfo.childWorldBBFaceIndex);
              }
              this.detachSelectedFromParent();
              this.setAllOffsets();
            } else {
              // Skip whatever is happening...
              return;
            }
          }

          var screenOffset = this.placementInfo.attachmentOffsetsScreen[this.placementInfo.attachmentIndex];
          var intersects = this.picker.getIntersected(x + screenOffset.x, y + screenOffset.y,
            this.camera, supportObjects, ignored);

          var targetPoint;
          if (intersects.length > 0) {//no intersect for movement after redo
            // Figure out the supporting plane of that object
            var ok = this.identifyAttachmentIndex(intersects);
            if (ok) {
              // Figure out where new position should be...
              targetPoint = intersects[0].point.clone();
              if (this.useModelBase) {
                // Using model base - object is recentered to 0,0,0 at attachment point so we don't need the offset
              } else {
                // Not using model base, object origin remains the same, need to add offset to compensate
                var selectedPointToAttachmentOffset = this.placementInfo.attachmentOffsets[this.placementInfo.attachmentIndex];
                targetPoint.add(selectedPointToAttachmentOffset);
              }
              // Switch parent...
              this.newParent = intersects[0].object;
            }
          } else if (this.allowFloating) {
            // TODO: Have the plane be in the same orientation as the lastBBFaceIndex
            var raycaster = this.picker.getRaycaster(x, y, this.camera);
            var intersects = raycaster.intersectObject(this.plane);
            if (intersects.length > 0) {
              // Figure out where new position should be...
              targetPoint = intersects[0].point.add(this.placementInfo.offset);
            }
            this.newParent = null;
          }
          if (targetPoint) {
            var parent = this.selected.parent;
            if (parent) {
              parent.worldToLocal(targetPoint);
            }
            this.selected.position.copy(targetPoint);
            this.selected.updateMatrix();
            Object3DUtil.clearCache(this.selected);
          }
        } else {
          // Maybe just move along the plane...
          var raycaster = this.picker.getRaycaster(x, y, this.camera);
          var intersects = raycaster.intersectObject(this.plane);
          if (intersects.length > 0) {
            // Figure out where new position should be...
            var targetPoint = intersects[0].point.add(this.placementInfo.offset);
            var parent = this.selected.parent;
            if (parent) {
              parent.worldToLocal(targetPoint);
            }
            this.selected.position.copy(targetPoint);
            this.selected.updateMatrix();
            Object3DUtil.clearCache(this.selected);
          }
        }
        this.updateVisualizer();
      } else {
        var planeMesh = this.__ytranslatePlane;
        if (!planeMesh) {
          var projectionPlane = new THREE.PlaneBufferGeometry(10000, 10000, 8, 8);
          var material = new THREE.MeshBasicMaterial({side: THREE.DoubleSide, visible: false});
          this.__ytranslatePlane = new THREE.Mesh(projectionPlane, material);
          this.__ytranslatePlane.name = 'YTranslatePlane';
          this.ignore.push(this.__ytranslatePlane);
          this.scene.add(this.__ytranslatePlane);
          planeMesh = this.__ytranslatePlane;
        }

        var lookat = this.camera.position.clone();
        lookat.y = 0;
        planeMesh.lookAt(lookat);
        if (this.placementInfo.attachmentIndex) {
          planeMesh.position.copy(this.__getCurrentAttachmentPosition(this.placementInfo.attachmentIndex));
        } else {
          planeMesh.position.copy(this.selected.position);
        }
        planeMesh.updateMatrix();

        var raycaster = this.picker.getRaycaster(this.mouse.x, this.mouse.y, this.camera);
        var intersects = raycaster.intersectObject(planeMesh);
        if (intersects.length > 0) {
          var point = intersects[0].point;

          Object3DUtil.detachFromParent(this.selected, this.scene);
          this.selected.position.y = point.y;
          this.selected.updateMatrix();
          Object3DUtil.clearCache(this.selected);

          this.updateVisualizer();
        } else {
          //console.log('no plane intersected')
        }
      }
    };

    DragDrop.prototype.__getCurrentAttachmentPosition = function(attachmentIndex) {
      return Object3DUtil.getBBoxFaceCenter(this.selected, attachmentIndex);
    };

    DragDrop.prototype.cancelInsertion = function () {
      if (this.insertMode) {
        var cancelledObject = this.selected;
        this.onMouseUp();
        return cancelledObject;
      }
    };

    DragDrop.prototype.detachSelectedFromParent = function () {
      this.newParent = null;
      this.oldParent = this.selected.parent;
      Object3DUtil.detachFromParent(this.selected, this.scene);
    };

    DragDrop.prototype.setAllOffsets = function () {
      var origPos = new THREE.Vector3();
      this.selected.localToWorld(origPos);
      // Original position (0,0,0) of the object in world coordinate
      this.placementInfo.origPosition = origPos;
      // Position of the original selected point of the object
      this.placementInfo.origSelectedPoint = this.selectedPoint;
      var attachments = this.identifyAttachmentsForPlacement(this.selected);
      // offset in world space from the (0,0,0) of the object to the different attachment points
      // this allows the position operation to work
      this.placementInfo.attachmentOffsets = attachments.map(function (att) {
        var p = att.world.pos;
        var selectedPointToAttachmentOffset = origPos.clone().sub(p);
        return selectedPointToAttachmentOffset;
      });
      // Get attachment offsets projects onto the screen from the clicked point
      var camera = this.camera;
      var x = this.mouse.x;
      var y = this.mouse.y;
      this.placementInfo.attachmentOffsetsScreen = attachments.map(function (att) {
        var p = att.world.pos;
        var v = p.clone().project(camera);
        var clickedToAttachmentOffset = new THREE.Vector2(v.x - x, v.y - y);
        return clickedToAttachmentOffset;
      });
    };

    /*Visualizer is a box geometry that encloses the selected object and has
     transparent faces on all sides except for the side containing the attachment
     point of the object*/
    DragDrop.prototype.createVisualizer = function () {
      if (this.selected && !this.visualizer) {
        // Create the bbox helper and use as the visualizer
        this.visualizer = new AttachmentBasedBoundingBoxHelper(this.selected, this.placementInfo.childWorldBBFaceIndex, new THREE.Color('green'));
        this.visualizer.scaleFactor = 1.05;
        this.visualizer.update();
        this.scene.add(this.visualizer);
      }
    };

    //TODO: make faster
    DragDrop.prototype.updateVisualizer = function () {
      if (this.selected && this.useVisualizer) {
        if (this.visualizer) {
          this.visualizer.attach(this.selected);
          this.visualizer.setAttachmentFace(this.placementInfo.childWorldBBFaceIndex);
          this.visualizer.update();
          if (this.visualizer.parent !== this.scene) {
            this.scene.add(this.visualizer);
          }
        } else {
          this.createVisualizer();
        }
      } else {
        this.removeVisualizer();
      }
    };

    DragDrop.prototype.removeVisualizer = function (clear) {
      if (this.visualizer) {
        this.scene.remove(this.visualizer);
        if (clear) {
          this.visualizer = null;
        } else {
          this.visualizer.detach();
        }
      }
    };

    // Exports
    return DragDrop;

  });
