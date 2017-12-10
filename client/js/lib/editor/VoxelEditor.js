'use strict';

var PubSub = require('PubSub');
var Opentip = require('opentip');

var VoxelEditor = function (params) {
  PubSub.call(this);
  this.scene = params.scene;
  this.sceneBBox = params.sceneBBox;
  this.picker = params.picker;
  this._enabled = params.enabled;
  this.camera = params.camera;
  this.container = params.container;
  this.supportDrag = params.supportDrag;
  this.tooltipContainer = $(params.tooltipContainer || '#main');

  this.rollOverMesh = null;
  this.cubeGeo = null;
  this.cubeMaterial = null;
  this.cubeHoverMaterial = null;

  this.objects = [];
  this.gridSize = params.gridSize || 1000;
  this.voxelSize = params.voxelSize || 5;
  this.rollOverColor = 0xff0000;
  this.defaultCubeColor = 0xfeb74c;
  this.init();

  this.tooltip = new Opentip(this.tooltipContainer, { showOn: null });
};

VoxelEditor.prototype = Object.create(PubSub.prototype);
VoxelEditor.prototype.constructor = VoxelEditor;

Object.defineProperty(VoxelEditor.prototype, 'enabled', {
  get: function () {return this._enabled; },
  set: function (v) {
    this._enabled = v;
    if (v) {
      this.scene.add(this.rollOverMesh);
    } else {
      this.scene.remove(this.rollOverMesh);
    }
  }
});

VoxelEditor.prototype.reset = function (params) {
  this.scene = params.scene;
  this.sceneBBox = params.sceneBBox;
  this.camera = params.camera;
  this._updateGridPosition();
};

VoxelEditor.prototype.setLabelInfo = function (labelInfo) {
  this.labelInfo = labelInfo;
  if (labelInfo && labelInfo.colorMat) {
    this.setCubeMaterial(labelInfo.colorMat, labelInfo.hoverMat);
  }
};

VoxelEditor.prototype.setCubeMaterial = function (material, hoverMaterial) {
  this.cubeMaterial = material;
  this.cubeHoverMaterial = hoverMaterial;
  if (this.rollOverMesh) {
    this.rollOverMesh.material = this.cubeHoverMaterial;
  }
};

VoxelEditor.prototype.init = function () {
  // roll-over helpers
  var rollOverGeo = new THREE.BoxGeometry(1, 1, 1);
  var rollOverMaterial = new THREE.MeshBasicMaterial({ color: this.rollOverColor, opacity: 0.5, transparent: true });

  this.rollOverMesh = new THREE.Mesh(rollOverGeo, rollOverMaterial);
  this.rollOverMesh.scale.set(this.voxelSize, this.voxelSize, this.voxelSize);
  this.cubeHoverMaterial = rollOverMaterial;

  // cubes
  this.cubeGeo = new THREE.BoxGeometry(1, 1, 1);
  this.cubeMaterial = new THREE.MeshLambertMaterial({ color: this.defaultCubeColor });

  this.raycaster = new THREE.Raycaster();
  this.mouse = new THREE.Vector2();

  this._createGrid();
};

VoxelEditor.prototype._createGrid = function () {
  var size = this.gridSize / 2;
  var step = this.voxelSize;

  // grid
  var geometry = new THREE.Geometry();
  for (var i = -size; i <= size; i += step) {
    geometry.vertices.push(new THREE.Vector3(-size, 0, i));
    geometry.vertices.push(new THREE.Vector3(size, 0, i));
    geometry.vertices.push(new THREE.Vector3(i, 0, -size));
    geometry.vertices.push(new THREE.Vector3(i, 0,  size));
  }
  var material = new THREE.LineBasicMaterial({ color: 0x000000, opacity: 0.2, transparent: true });
  this.gridlines = new THREE.LineSegments(geometry, material);
  this.scene.add(this.gridlines);

  var geometry = new THREE.PlaneBufferGeometry(1000, 1000);
  geometry.rotateX(-Math.PI / 2);

  this.plane = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ visible: false }));
  this._updateGridPosition();

  this.scene.add(this.plane);
  this.objects.push(this.plane);
};

VoxelEditor.prototype._updateGridPosition = function () {
  if (this.sceneBBox) {
    var p = this.sceneBBox.getWorldPosition(new THREE.Vector3(0.5, 0, 0.5));
    this.plane.position.set(p.x, p.y, p.z);
    this.plane.updateMatrix();
    this.gridlines.position.set(p.x, p.y, p.z);
    this.gridlines.updateMatrix();
  }
};

VoxelEditor.prototype.onMouseMove = function (event) {
  if (!this.enabled) return true;
  event.preventDefault();
  var intersects = this._getIntersected(event);
  if (intersects.length > 0) {
    var intersect = intersects[0];
    if (this.isMouseDown) {
      this._processAction(event, intersect);
    } else {
      this._previewAction(event, intersect);
    }
  }
};

VoxelEditor.prototype.onMouseDown = function (event) {
  if (!this.enabled) return true;
  event.preventDefault();
  if (this.supportDrag) {
    this.isMouseDown = true;
  }
  var intersects = this._getIntersected(event);
  if (intersects.length > 0) {
    var intersect = intersects[0];
    this._processAction(event, intersect);
  }
};

VoxelEditor.prototype.onMouseUp = function (event) {
  this.isMouseDown = false;
};

VoxelEditor.prototype._getIntersected = function (event) {
  var objects = this.objects;
  this.mouse = this.picker.getCoordinates(this.container, event);
  this.picker.getRaycaster(this.mouse.x, this.mouse.y, this.camera, this.raycaster);
  var intersects = this.picker.getIntersected(this.mouse.x, this.mouse.y, this.camera, objects, undefined, 1, this.raycaster);
  //var intersects = this.raycaster.intersectObjects(objects, true);
  //console.log(intersects);
  return intersects;
};

// Remove, Place, or Change voxel material
VoxelEditor.prototype._previewAction = function (event, intersect) {
  var isVoxel = intersect.object !== this.plane;
  var isShiftDown = event.shiftKey;
  var isCtrlDown = event.ctrlKey || event.metaKey;
  var selectingExistingVoxel = false;
  var selectedLabel = intersect.object.userData ? intersect.object.userData.name : null;
  if ((isShiftDown || isCtrlDown) && isVoxel) {
    // remove or replace mode
    // highlight picked voxel
    this._setVoxelPosition(this.rollOverMesh, intersect.point);
    selectingExistingVoxel = intersect.object.position.equals(this.rollOverMesh.position);
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
VoxelEditor.prototype._processAction = function (event, intersect) {
  var scene = this.scene;
  var objects = this.objects;

  var isVoxel = intersect.object !== this.plane;
  var isShiftDown = event.shiftKey;
  var isCtrlDown = event.ctrlKey || event.metaKey;

  if (isShiftDown) {
    // delete cube
    if (isVoxel) {
      scene.remove(intersect.object);
      objects.splice(objects.indexOf(intersect.object), 1);
    }
    // create cube
  } else {
    if (isCtrlDown && isVoxel && intersect.object.position.equals(this.rollOverMesh.position)) {
      intersect.object.material = this.cubeMaterial;
    } else {
      var voxel = new THREE.Mesh(this.cubeGeo, this.cubeMaterial);
      voxel.scale.set(this.voxelSize, this.voxelSize, this.voxelSize);
      this._setVoxelPosition(voxel, intersect.point, intersect.face.normal);
      voxel.userData = this.labelInfo;
      scene.add(voxel);

      objects.push(voxel);
    }
  }
};

VoxelEditor.prototype._setVoxelPosition = function (voxel, position, delta) {
  voxel.position.copy(position);
  if (delta) {
    voxel.position.add(delta);
  }
  voxel.position.divideScalar(this.voxelSize).floor().multiplyScalar(this.voxelSize).addScalar(this.voxelSize / 2);
  return voxel;
};

module.exports = VoxelEditor;
