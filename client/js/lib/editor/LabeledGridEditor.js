'use strict';

var VoxelEditor = require('editor/VoxelEditor');
var Object3DUtil = require('geo/Object3DUtil');

var LabeledGridEditor = function (params) {
  VoxelEditor.call(this, params);
};

LabeledGridEditor.prototype = Object.create(VoxelEditor.prototype);
LabeledGridEditor.prototype.constructor = LabeledGridEditor;

LabeledGridEditor.prototype.setVoxels = function (v) {
  console.log('got voxels');
  this.showTooltip = true;
  this.voxels = v;
  this.objects = [];
  this.objects.push(v.getVoxelNode());
  v.getVoxelNode().userData['name'] = 'our voxels';
  this._createGrid();

  // TODO: Clear voxels
  //console.time('setVoxels');
  //var maxVoxels = 100;
  //var nVoxels = 0;
  //var dims = this.voxelGrid.dims;
  //var gp = new THREE.Vector3();
  //for (var x = 0; x < dims[0]; x++) {
  //  for (var y = 0; y < dims[1]; y++) {
  //    for (var z = 0; z < dims[2]; z++) {
  //      var isSet = this.voxelGrid.isVoxelSet(x,y,z);
  //      if (isSet) {
  //        gp.set(x,y,z);
  //        this.addVoxel(gp);
  //        nVoxels++;
  //        if (nVoxels >= maxVoxels) {
  //          console.timeEnd('setVoxels');
  //          return;
  //        }
  //      }
  //    }
  //  }
  //}
  //console.timeEnd('setVoxels');
};

LabeledGridEditor.prototype._createGrid = function () {
  if (this.gridlines) {
    this.scene.remove(this.gridlines);
  }
  if (this.plane) {
    this.scene.remove(this.plane);
  }
  if (!this.voxels) {
    VoxelEditor.prototype._createGrid.call(this);
    return;
  }

  // Save away transforms (assumes that models are not going to move)
  this.gridToWorld = this.voxels.getGridToWorld();
  this.worldToGrid = this.voxels.getWorldToGrid();

  // grid
  var dims = this.voxels.voxelGrid.dims;
  var geometry = new THREE.Geometry();
  for (var i = 0; i <= dims[0]; i++) {
    geometry.vertices.push(new THREE.Vector3(i, 0, 0));
    geometry.vertices.push(new THREE.Vector3(i, dims[1], 0));
  }
  for (var i = 0; i <= dims[1]; i++) {
    geometry.vertices.push(new THREE.Vector3(0, i, 0));
    geometry.vertices.push(new THREE.Vector3(dims[0], i, 0));
  }
  var material = new THREE.LineBasicMaterial({ color: 0x000000, opacity: 0.2, transparent: true });
  this.gridlines = new THREE.LineSegments(geometry, material);
  Object3DUtil.setMatrix(this.gridlines, this.gridToWorld);
  this.scene.add(this.gridlines);

  this.voxelUnit = this.gridlines.scale.x;  // Assumes scales are the same
  this.voxelFactor = 1;//Math.round(this.voxelSize / this.voxelUnit);
  this.voxelSize = this.voxelUnit * this.voxelFactor;
  this.rollOverMesh.scale.set(this.voxelSize, this.voxelSize, this.voxelSize);

  var geometry = new THREE.PlaneBufferGeometry(1000, 1000);
  geometry.rotateX(-Math.PI / 2);

  this.plane = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ visible: false }));
  this._updateGridPosition();

  this.scene.add(this.plane);
  this.objects.push(this.plane);
};

LabeledGridEditor.prototype._updateGridPosition = function () {
  if (this.sceneBBox) {
    var p = this.sceneBBox.getWorldPosition(new THREE.Vector3(0.5, 0, 0.5));
    this.plane.position.set(p.x, p.y, p.z);
    this.plane.updateMatrix();
    if (!this.voxels) {
      this.gridlines.position.set(p.x, p.y, p.z);
      this.gridlines.updateMatrix();
    } else {
      // Position gridLines at bottom of scene (the voxel grid may not start at 0)
      // Keep gridlines x,z the same
      this.gridlines.position.y = p.y;
      this.gridlines.updateMatrix();
    }
  }
};

LabeledGridEditor.prototype.onMouseMove = function (event) {
  VoxelEditor.prototype.onMouseMove.call(this, event);
};

LabeledGridEditor.prototype.onMouseDown = function (event) {
  VoxelEditor.prototype.onMouseDown.call(this, event);
};

LabeledGridEditor.prototype.onMouseUp = function (event) {
  VoxelEditor.prototype.onMouseUp.call(this, event);
};

// Remove, Place, or Change voxel material
LabeledGridEditor.prototype._previewAction = function (event, intersect) {
  var isVoxel = intersect.object !== this.plane;
  var voxelNode = this.voxels.getVoxelNode();
  var isVoxelNode = intersect.object === voxelNode;
  var isShiftDown = event.shiftKey;
  var isCtrlDown = event.ctrlKey || event.metaKey;
  var selectingExistingVoxel = false;
  var selectedLabel = null;
  var selectedLabelId = 0;
  if (isVoxel) {
    var vg = this.voxels.voxelGrid;
    var pos = this._calcVoxelPosition(intersect.point);
    var gridCoords = pos.clone().applyProjection(this.worldToGrid).floor();
    selectedLabelId = vg.getVoxel(gridCoords.x, gridCoords.y, gridCoords.z);
    selectedLabel = (selectedLabelId > 0) ? vg.labels[selectedLabelId - 1] : null;
  }
  if ((isShiftDown || isCtrlDown) && isVoxel) {
    selectingExistingVoxel = selectedLabelId;

    // remove or replace mode
    // highlight picked voxel
    this._setVoxelPosition(this.rollOverMesh, intersect.point);
    if (isShiftDown && !selectingExistingVoxel) {
      this.rollOverMesh.visible = false;
    } else {
      this.rollOverMesh.visible = true;
    }
  } else if (isShiftDown) {
    this.rollOverMesh.visible = false;
  } else {
    this.rollOverMesh.visible = true;
    this._setVoxelPosition(this.rollOverMesh, intersect.point, intersect.face.normal);
  }

  // Show tooltip of existing label
  if (this.showTooltip || selectingExistingVoxel) {
    if (selectedLabel) {
      this.tooltip.activate();
      this.tooltip.setContent(selectedLabel);
      this.tooltip.show();
    } else {
      this.tooltip.deactivate();
    }
  } else {
    this.tooltip.deactivate();
  }
};

// Remove, Place, or Change voxel material
LabeledGridEditor.prototype._processAction = function (event, intersect) {
  var scene = this.scene;
  var objects = this.objects;

  var isVoxel = intersect.object !== this.plane;
  var voxelNode = this.voxels.getVoxelNode();
  var isVoxelNode = intersect.object === voxelNode;
  var isShiftDown = event.shiftKey;
  var isCtrlDown = event.ctrlKey || event.metaKey;

  if (isShiftDown) {
    // delete cube
    if (isVoxel) {
      var vg = this.voxels.voxelGrid;
      var pos = this._calcVoxelPosition(intersect.point);
      var gridCoords = pos.clone().applyProjection(this.worldToGrid).floor();
      vg.setVoxel(gridCoords.x, gridCoords.y, gridCoords.z, 0);
      if (isVoxelNode) {
        console.log(intersect.descendant);
        // TODO: Remove faces
      } else {
        scene.remove(intersect.object);
        objects.splice(objects.indexOf(intersect.object), 1);
      }
    }
    // create cube
  } else {
    if (isCtrlDown && isVoxel && intersect.object.position.equals(this.rollOverMesh.position)) {
      intersect.object.material = this.cubeMaterial;
    } else {
      // Take from intersected to voxel grid
      var pos = this._calcVoxelPosition(intersect.point, intersect.face.normal);
      var gridCoords = pos.clone().applyProjection(this.worldToGrid).floor();
      console.log(this.labelInfo);
      this.voxels.voxelGrid.setVoxel(gridCoords.x, gridCoords.y, gridCoords.z, this.labelInfo.id);

      var voxel = new THREE.Mesh(this.cubeGeo, this.cubeMaterial);
      voxel.scale.set(this.voxelSize, this.voxelSize, this.voxelSize);
      this._setVoxelPosition(voxel, intersect.point, intersect.face.normal);
      voxel.userData = this.labelInfo;
      scene.add(voxel);

      objects.push(voxel);
    }
  }
};

LabeledGridEditor.prototype._calcVoxelPosition = function (position, delta) {
  var p = position.clone();
  if (delta) {
    p.add(delta);
  }
  p.divideScalar(this.voxelSize).floor().multiplyScalar(this.voxelSize).addScalar(this.voxelSize / 2);
  return p;
};


module.exports = LabeledGridEditor;
