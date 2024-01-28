var Constants = require('Constants');
var PubSub = require('PubSub');
var GeometryUtil = require('geo/GeometryUtil');
var Object3DUtil = require('geo/Object3DUtil');
var keymap = require('controls/keymap');
var _ = require('util/util');

var STATE_NONE = 0;
var STATE_SELECT = 1;
var STATE_DRAWLINE = 2;
var STATE_SELECT_TRIANGLE = 3;


// LineEditor (adapted from ShapeEditor.Components.LineEditor)
// Improve to show line on mouse move
var LineEditor = function (editor, opts) {
  var defaults = {
    lineWidth: 0.004*Constants.metersToVirtualUnit,
    color: 'black',
    previewColor: 'darkgray',
    minDistSq: 0
  };
  opts = _.defaults(Object.create(null), opts, defaults);

  this.drawSteps = ['INIT', 'DRAW', 'EDIT', 'END'];
  this.editor = editor;
  this.reset();
  this.lineWidth = opts.lineWidth;
  this.minDistSq = opts.minDistSq;

  this.material = new THREE.LineBasicMaterial({
    depthTest: false, depthWrite: false, transparent: true,
    linewidth: this.lineWidth, color: opts.color
  });
  this.previewMaterial = new THREE.LineBasicMaterial({
    depthTest: false, depthWrite: false, transparent: true,
    linewidth: this.lineWidth, color: opts.previewColor
  });
  this.object = null;
};

LineEditor.prototype.reset = function () {
  this.drawStep = this.drawSteps[0];
  this.linePoints = [];
  this.removeLastSegment();
//  this.__lastSegment = null;
};

LineEditor.prototype.removeLastSegment = function() {
  if (this.__lastSegment) {
    this.linePoints.pop();
    this.object.remove(this.__lastSegment.segmentNode);
    this.object.remove(this.__lastSegment.endpointNode);
    this.__lastSegment = null;
  }
};

LineEditor.prototype.onMouseMove = function(event) {
  if (this.drawStep === 'DRAW') {
    var intersected = this.editor.getIntersected(event);
    if (intersected) {
      var lastPoint = intersected.point;
      if (this.__lastSegment) {
        // Figure out where the position will be
        var p = this.linePoints[this.linePoints.length - 2];
        var segmentStart = p.position;
        this.__lastSegment.endpointNode.position.copy(lastPoint);
        Object3DUtil.updateCylinderEndpoints(this.__lastSegment.segmentNode, segmentStart, lastPoint);
        this.linePoints[this.linePoints.length - 1].position.copy(lastPoint);
      } else if (this.linePoints.length > 0) {
        var p = this.linePoints[this.linePoints.length - 1];
        var segmentStart = p.position;
        var distanceSq = lastPoint.distanceToSquared(segmentStart);
        if (distanceSq > this.minDistSq) {
          this.linePoints.push({ position: lastPoint, vertexIndex: intersected.vertexIndex });
          var endpointNode = this.addEndpoint(lastPoint, true);
          var segmentNode = this.addSegment(segmentStart,lastPoint, true);
          this.__lastSegment = { endpointNode: endpointNode, segmentNode: segmentNode };
        }
      }
    }
  }
};

LineEditor.prototype.onMouseClick = function(event) {
  if (this.drawStep === 'DRAW') {
    if (this.__lastSegment) {
      this.__lastSegment.segmentNode.material = this.material;
      this.__lastSegment.endpointNode.material = this.material;
      this.__lastSegment = null;
      return;
    }
  }

  var intersected = this.editor.getIntersected(event);
  //console.log(intersected);
  if (intersected) {
    // Figure out where the position will be
    var lastPoint = intersected.point;
    //lastPoint.add(new THREE.Vector3(0,10,0));

    if (event.shiftKey && this.drawStep === 'DRAW') {
      // End
      this.finish();
    } else if (this.drawStep === 'INIT' || this.drawStep === 'END') {
      this.object = new THREE.Object3D();
      this.editor.stagingNode.add(this.object);

      this.drawStep = 'DRAW';
      this.linePoints.push({ position: lastPoint, vertexIndex: intersected.vertexIndex });
      this.addEndpoint(lastPoint);
    }
  }
};

LineEditor.prototype.addEndpoint = function (point, isPreview) {
  return Object3DUtil.addSphere(this.object, point, this.lineWidth,
    isPreview? this.previewMaterial : this.material);
};

LineEditor.prototype.addSegment = function (start, end, isPreview) {
  var lineNode = Object3DUtil.makeCylinderStartEnd(start, end, this.lineWidth,
    isPreview? this.previewMaterial : this.material );
  this.object.add(lineNode);
  return lineNode;
};

LineEditor.prototype.finish = function () {
  this.linePoints = [];
  this.removeLastSegment();
//  this.__lastSegment = null;
};

function MeshCutterControls(params) {
  PubSub.call(this);
  this.container = params.container;
  this.picker = params.picker;
  this.enabled = params.enabled;
  this.camera = params.camera;
  this.tesselator = params.tesselator;

  // State of mesh cutter
  var scope = this;
  this.object3D = null;
  this.state = STATE_NONE;
  this.meshes = null;
  this.__originalMeshVisibility = null;
  this.activeMesh = null;
  this.enabled = params.enabled;
  this.restrictToVertices = true;

  this.stagingNode = new THREE.Group();
  this.lineEditor = new LineEditor({
    stagingNode: this.stagingNode,
    getIntersected: function(event) {
      var intersected = scope.getIntersected(event, scope.activeMesh);
      if (intersected && scope.restrictToVertices) {
        var vertexInfo = GeometryUtil.getClosestVertexWorld(intersected.object, intersected.point);
        intersected.originalPoint = intersected.point;
        intersected.point = vertexInfo.position;
        intersected.vertexIndex = vertexInfo.index;
      }
      return intersected;
    }
  });
}

MeshCutterControls.prototype = Object.create(PubSub.prototype);
MeshCutterControls.prototype.constructor = MeshCutterControls;

MeshCutterControls.prototype.init = function() {
  this.registerEventListeners(this.container);
  var scope = this;
  keymap({'in': 'mesh_cutting', 'on': 'esc'}, function() { scope.cancel(); });
  keymap({'in': 'mesh_cutting', 'on': 'c'}, function() { scope.cut(); });
};

MeshCutterControls.prototype.cut = function() {
  this.lineEditor.finish();
  console.log('cutting');
//  GeometryUtil.cutMesh(this.activeMesh)
};

/**
 * Register event handlers for mouse and keyboard interaction
 * @function
 */
MeshCutterControls.prototype.registerEventListeners = function (domElement) {
  domElement.addEventListener('pointermove', this.onMouseMove.bind(this), false);
  domElement.addEventListener('pointerup', this.onMouseUp.bind(this), false);
  domElement.addEventListener('pointerleave', this.onMouseLeave.bind(this), false);
  domElement.addEventListener('click', this.onMouseClick.bind(this), false);
};

MeshCutterControls.prototype.getIntersected = function(e, baseObject) {
  var mouse = this.picker.getCoordinates(this.container, e);
  var intersects = this.picker.getIntersectedDescendants(mouse.x, mouse.y, this.camera, [baseObject]);
  if (intersects.length) {
    return intersects[0];
  }
};

MeshCutterControls.prototype.onMouseUp = function (e) {
  if (!this.enabled) {
    return;
  }
};

MeshCutterControls.prototype.onMouseLeave = function (e) {
  if (!this.enabled) {
    return;
  }
};

MeshCutterControls.prototype.onMouseMove = function (e) {
  //Can only color when enabled
  if (!this.enabled) {
    return;
  }

  if (this.state === STATE_DRAWLINE) {
    return this.lineEditor.onMouseMove(e);
  }
};

MeshCutterControls.prototype.onMouseClick = function (e) {
  if (!this.enabled) {
    return;
  }

  if (this.state === STATE_SELECT) {
    var intersected  = this.getIntersected(e, this.object3D);
    if (intersected) {
      //console.log(intersected.object);
      this.setActiveMesh(intersected.object);
      this.state = STATE_DRAWLINE;
    }
  }

  if (this.state === STATE_DRAWLINE) {
    return this.lineEditor.onMouseClick(e);
  }
};

MeshCutterControls.prototype.setActiveMesh = function(mesh, saveOriginalVisibility) {
  if (saveOriginalVisibility) {
    this.__originalMeshVisibility = _.map(this.meshes, function(m) {return m.visible; });
  }
  this.activeMesh = mesh;
  for (var i = 0; i < this.meshes.length; i++) {
    if (this.meshes[i] !== this.activeMesh) {
      this.meshes[i].visible = false;
    }
  }
};

MeshCutterControls.prototype.reset = function() {
  this.activeMesh = null;
  this.state = STATE_SELECT;
  this.lineEditor.reset();
  Object3DUtil.removeAllChildren(this.stagingNode);

  // Restore visibility of meshes
  if (this.meshes) {
    for (var i = 0; i < this.meshes.length; i++) {
      if (this.meshes[i] !== this.activeMesh) {
        this.meshes[i].visible = this.__originalMeshVisibility ? this.__originalMeshVisibility[i] : true;
      }
    }
  }
};

MeshCutterControls.prototype.cancel = function() {
  if (this.state === STATE_DRAWLINE && this.lineEditor.drawStep === 'DRAW') {
    this.lineEditor.reset();
  } else {
    this.reset();
  }
};


MeshCutterControls.prototype.attach = function(object3D) {
  this.object3D = object3D;
  this.meshes = Object3DUtil.getMeshList(object3D, true);
  this.__originalMeshVisibility = null;
  this.activeMesh = null;
  this.enabled = true;
  this.state = STATE_SELECT;
  this.stagingNode.visible = true;
  $(this.container).css('cursor', 'default');
  keymap.pushScope('mesh_cutting');
};

MeshCutterControls.prototype.detach = function() {
  this.object3D = null;
  this.meshes = null;
  this.__originalMeshVisibility = null;
  this.activeMesh = null;
  this.enabled = false;
  this.state = STATE_NONE;
  this.stagingNode.visible = false;
  keymap.popScope('mesh_cutting');
};

module.exports = MeshCutterControls;

