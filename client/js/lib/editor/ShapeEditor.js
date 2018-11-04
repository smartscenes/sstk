/* 2D editor */

var PubSub = require('PubSub');
var BBox = require('geo/BBox');
var CanvasUtil = require('ui/CanvasUtil');
var Object3DUtil = require('geo/Object3DUtil');
var MeshHelpers = require('geo/MeshHelpers');
var LabelsPanel = require('ui/LabelsPanel');
var HighlightControls = require('controls/HighlightControls');
var Constants = require('Constants');
var FileUtil = require('io/FileUtil');
var _ = require('util/util');

var DrawModes = Object.freeze({
  Select: 0,
  Line: 1,
  Wall: 2,
  Box: 3,
  Poly: 4
});

function getLineWidth(p) {
  return p*0.01*Constants.metersToVirtualUnit;
}

var EditLineMaterial = function (parameters) {
  THREE.LineBasicMaterial.call(this);

  this.depthTest = false;
  this.depthWrite = false;
  this.transparent = true;
  this.linewidth = getLineWidth(1);

  this.setValues(parameters);

  this.oldColor = this.color.clone();
  this.oldOpacity = this.opacity;

  this.highlight = function (highlighted) {
    if (highlighted) {
      this.color.setRGB(1, 1, 0);
      this.opacity = 1;
    } else {
      this.color.copy(this.oldColor);
      this.opacity = this.oldOpacity;
    }
  };
};

EditLineMaterial.prototype = Object.create(THREE.LineBasicMaterial.prototype);
EditLineMaterial.prototype.constructor = EditLineMaterial;

var EditWallMaterial = function (parameters) {
  THREE.MeshBasicMaterial.call(this);
  this.setValues(parameters);
  this.oldColor = this.color.clone();
  this.oldOpacity = this.opacity;

  this.highlight = function (highlighted) {
    if (highlighted) {
      this.color.setRGB(1, 1, 0);
      this.opacity = 1;
    } else {
      this.color.copy(this.oldColor);
      this.opacity = this.oldOpacity;
    }
  };
};

EditWallMaterial.prototype = Object.create(THREE.MeshBasicMaterial.prototype);
EditWallMaterial.prototype.constructor = EditWallMaterial;

/**
 * Base component editor class
 * @param editor {editor.ShapeEditor}
 * @param opts Additional options
 * @param [opts.lineWidth=5] {number} How thick the lines should be (in virtual units)
 * @param [opts.color=silver] {string} What color to use
 * @constructor
 * @memberOf editor
 */
var ComponentEditor = function (editor, opts) {
  var defaults = {
    lineWidth: getLineWidth(5),
    color: 'silver'
  };
  opts = _.defaultsDeep(Object.create(null), opts, defaults);
  PubSub.call(this);
  this.drawSteps = ['INIT', 'DRAW', 'EDIT', 'END'];
  this.editor = editor;
  this.labelInfo = null;
  this.reset();
  this.material = new EditLineMaterial({ color: opts.color });
  this.lineWidth = opts.lineWidth;
  this.object = null;
};

ComponentEditor.prototype = Object.create(PubSub.prototype);
ComponentEditor.prototype.constructor = ComponentEditor;

ComponentEditor.prototype.reset = function () {
  this.drawStep = this.drawSteps[0];
};

ComponentEditor.prototype.onMouseClick = function (event) {
};

ComponentEditor.prototype.onMouseMove = function (event) {
};

ComponentEditor.prototype.onMouseDown = function (event) {
};

ComponentEditor.prototype.onMouseUp = function (event) {
};

ComponentEditor.prototype.isActive = function () {
  return this.drawStep === 'DRAW';
};

ComponentEditor.prototype.updateCursor = function () {
  if (this.labelInfo && this.labelInfo.cssColor) {
    var str = CanvasUtil.getColoredArrowCursor(this.labelInfo.cssColor, 32);
    //this.editor.container;
    $('canvas').css('cursor', str);
  } else {
    this.editor.container.style.cursor = 'crosshair';
  }
};

ComponentEditor.prototype.setLabelInfo = function (labelInfo) {
  this.labelInfo = labelInfo;
  if (this.labelInfo) {
    this.material = this.__getMaterial(labelInfo);
  }
  this.updateCursor();
};

ComponentEditor.prototype.__getMaterial = function (labelInfo) {
  if (labelInfo) {
    if (labelInfo.colorMat) {
      return labelInfo.colorMat;
    } else if (labelInfo.color) {
      return new EditLineMaterial({color: labelInfo.color});
    }
  }
};

ComponentEditor.prototype.getLabel = function () {
  if (this.labelInfo) return this.labelInfo.name;
};

ComponentEditor.prototype.getObject = function () {
  if (this.object) {
    this.object.userData = this.getObjectData();
  }
  return this.object;
};

ComponentEditor.prototype.getObjectData = function () {
  return { type: 'unknown' };
};

/**
 * This function is called when the draw step is finished
 */
ComponentEditor.prototype.finish = function () {
  this.drawStep = 'END';
  if (this.object && this.isAcceptable(this.object)) {
    var obj = this.getObject();
    this.editor.addObject(obj, false);
  } else {
    this.editor.stagingNode.remove(this.object);
  }
  this.object = null;
};

/**
 * Returns whether the created object is a valid, complete shape (for instance, has required number of points, etc).
 * As the users draw a shape it will go from invalid to valid.
 * @param obj
 * @returns {boolean}
 */
ComponentEditor.prototype.isAcceptable = function (obj) {
  return !!obj;
};

ComponentEditor.prototype.createObject = function (objData, opts) {
  console.warn('Unsupported createObject for ' + this.constructor.name + '. Please implement me!!!');
  return null;
};

ComponentEditor.prototype.__applyTransform = function(object, objData, opts) {
  if (objData.transform) {
    var matrix = new THREE.Matrix4();
    matrix.fromArray(objData.transform);
    if (opts.transform) {
      matrix.multiplyMatrices(opts.transform, matrix);
    }
    Object3DUtil.setMatrix(object, matrix);
  }
};

/**
 * Selection tool
 * @param editor {editor.ShapeEditor}
 * @param opts Additional options
 * @constructor
 * @extends ComponentEditor
 * @memberOf editor
 */
var SelectEditor = function (editor, opts) {
  this.highlightControls = new HighlightControls({
    container: editor.container,
    picker: editor.picker,
    camera: editor.camera,
    scene: editor.node
  });
  ComponentEditor.call(this, editor, opts);
  this.selected = null;
};

SelectEditor.prototype = Object.create(ComponentEditor.prototype);
SelectEditor.prototype.constructor = SelectEditor;

SelectEditor.prototype.reset = function () {
  ComponentEditor.prototype.reset.call(this);
  this.highlightControls.camera = this.editor.camera;
  this.highlightControls.scene = this.editor.node;
};

SelectEditor.prototype.onMouseMove = function (event) {
  this.highlightControls.onMouseMove(event);
};

SelectEditor.prototype.onMouseClick = function (event) {
  this.selected = this.highlightControls.intersected;
  if (this.selected) { this.editor.transformControls.attach(this.selected); }
};

SelectEditor.prototype.getSelected = function () {
  return this.selected;
};

SelectEditor.prototype.unselect = function () {
  this.editor.transformControls.detach(this.selected);
  this.selected = null;
};

SelectEditor.prototype.select = function (object) {
  this.selected = object;
  if (this.selected) { this.editor.transformControls.attach(this.selected); }
};

/**
 * Editor for drawing lines
 * @param editor {editor.ShapeEditor}
 * @param opts Additional options
 * @param [opts.minDistSq=1] {number} Minimum distance (squared) for two points to be considered separate (in virtual units)
 * @param [opts.restrictToBase=true] {boolean} Whether to restrict to an prespecified base object of the editor (e.g. a scan) or not.
 * @constructor
 * @extends editor.ComponentEditor
 * @memberOf editor
 */
var LineEditor = function (editor, opts) {
  var defaults = {
    minDistSq: 1,
    restrictToBase: true
  };
  opts = _.defaultsDeep(Object.create(null), opts, defaults);
  ComponentEditor.call(this, editor, opts);
  this.minDistSq = opts.minDistSq;
  this.restrictToBase = opts.restrictToBase;
};

LineEditor.prototype = Object.create(ComponentEditor.prototype);
LineEditor.prototype.constructor = LineEditor;

LineEditor.prototype.reset = function () {
  ComponentEditor.prototype.reset.call(this);
  this.currentSegment = [];
};

LineEditor.prototype.onMouseClick = function (event) {
  var intersects = (this.restrictToBase) ? this.editor.getIntersected(event, this.editor.baseObject) :
    this.editor.getIntersected(event);
  if (intersects.length > 0) {
    // Figure out where the position will be
    var lastPoint = intersects[0].point;
    //lastPoint.add(new THREE.Vector3(0,10,0));

    if (event.shiftKey && this.drawStep === 'DRAW') {
      // End
      this.finish();
    } else if (this.drawStep === 'INIT' || this.drawStep === 'END') {
      this.object = new THREE.Object3D();
      this.editor.stagingNode.add(this.object);

      this.drawStep = 'DRAW';
      this.currentSegment.push(lastPoint);
      this.addEndpoint(lastPoint);
    } else if (this.drawStep === 'DRAW') {
      var segmentStart = this.currentSegment[this.currentSegment.length - 1];
      var distanceSq = lastPoint.distanceToSquared(segmentStart);
      if (distanceSq > this.minDistSq) {
        this.currentSegment.push(lastPoint);
        this.addEndpoint(lastPoint);
        this.addSegment(segmentStart,lastPoint);
      }
    }
  }
};

LineEditor.prototype.addEndpoint = function (point) {
  Object3DUtil.addSphere(this.object, point, this.lineWidth, this.material);
};

LineEditor.prototype.addSegment = function (start, end) {
  //var lineGeom = new THREE.Geometry();
  //lineGeom.vertices.push(start);
  //lineGeom.vertices.push(end);
  //var lineNode = new THREE.LineSegments(lineGeom, this.lineMaterial);
  var lineNode = Object3DUtil.makeCylinder(start, end, this.lineWidth, this.material);
  this.object.add(lineNode);
};

LineEditor.prototype.getObjectData = function () {
  return { type: 'line', points: this.currentSegment, label: this.getLabel() };
};

LineEditor.prototype.isAcceptable = function (obj) {
  return obj && this.currentSegment.length  > 1;
};

LineEditor.prototype.finish = function () {
  ComponentEditor.prototype.finish.call(this);
  this.currentSegment = [];
};

LineEditor.prototype.createObject = function (objData, opts) {
  opts = opts || {};
  if (objData && objData.type === 'line') {
    var labelInfo = this.editor.getLabelInfo(objData.label, true);
    var material = this.__getMaterial(labelInfo) || this.material;
    var object = new THREE.Object3D();
    var lineWidth = this.lineWidth;
    var start = null;
    for (var i = 0; i < objData.points.length; i++) {
      var point = Object3DUtil.toVector3(objData.points[i]);
      Object3DUtil.addSphere(object, point, lineWidth, material);
      if (start) {
        var lineNode = Object3DUtil.makeCylinder(start, point, lineWidth, material);
        object.add(lineNode);
      }
      start = point;
    }
    object.name = objData.label;
    object.userData = objData;
    this.__applyTransform(object, objData, opts);
    return object;
  } else {
    console.error('Unsupported object data type: ' + objData.type, objData);
  }
};

/**
 * Wall editor - draws walls with height
 * @param editor {editor.ShapeEditor}
 * @param opts Additional options
 * @param [opts.wallHeight=2.75m] {number} Wall height (in virtual units)
 * @param [opts.restrictToBase=false] {boolean} Whether to restrict to an prespecified base object of the editor (e.g. a scan) or not.
 * @constructor
 * @extends editor.LineEditor
 * @memberOf editor
 */
var WallEditor = function (editor, opts) {
  var defaults = {
    wallHeight: Constants.metersToVirtualUnit * 2.75,
    restrictToBase: false
  };
  opts = _.defaultsDeep(Object.create(null), opts, defaults);
  LineEditor.call(this, editor, opts);
  this.material = new EditWallMaterial({ color: 'gray' });
  this.wallHeight = opts.wallHeight;
};

WallEditor.prototype = Object.create(LineEditor.prototype);
WallEditor.prototype.constructor = WallEditor;

WallEditor.prototype.addEndpoint = function (point) {
  var wallUp = this.editor.groundNormal;
  Object3DUtil.addColumn(this.object, point, wallUp, this.wallHeight, this.lineWidth, this.material);
};

WallEditor.prototype.addSegment = function (start, end) {
  var wallUp = this.editor.groundNormal;
  Object3DUtil.addWall(this.object, start, end, wallUp, this.wallHeight, this.lineWidth, this.material);
};

WallEditor.prototype.getObjectData = function () {
  var wallUp = this.editor.groundNormal;
  return { type: 'wall', height: this.wallHeight, up: wallUp.clone(), depth: this.lineWidth,
    points: this.currentSegment, label: this.getLabel() };
};

WallEditor.prototype.createObject = function (objData, opts) {
  opts = opts || {};
  if (objData && objData.type === 'wall') {
    var labelInfo = this.editor.getLabelInfo(objData.label, true);
    var material = this.__getMaterial(labelInfo) || this.material;
    var lineWidth = objData.depth || this.lineWidth;
    var wallHeight = objData.height || this.wallHeight;
    var wallUp = Object3DUtil.toVector3(objData.up);
    var object = new THREE.Object3D();
    var start = null;
    for (var i = 0; i < objData.points.length; i++) {
      var point = Object3DUtil.toVector3(objData.points[i]);
      Object3DUtil.addColumn(object, point, wallUp, wallHeight, lineWidth, material);
      if (start) {
        Object3DUtil.addWall(object, start, point, wallUp, wallHeight, lineWidth, material);
      }
      start = point;
    }
    object.name = objData.label;
    object.userData = objData;
    this.__applyTransform(object, objData, opts);
    return object;
  } else {
    console.error('Unsupported object data type: ' + objData.type, objData);
  }
};


/**
 * Polygon editor - draw polygonal shapes
 * @param editor {editor.ShapeEditor}
 * @param opts Additional options
 * @param [opts.height=0] {number} Shape extrude amount (in virtual units)
 * @param [opts.restrictToBase=true] {boolean} Whether to restrict to an prespecified base object of the editor (e.g. a scan) or not.
 * @constructor
 * @extends editor.LineEditor
 * @memberOf editor
 */
var PolygonEditor = function (editor, opts) {
  var defaults = {
    height: 0,
    restrictToBase: true
  };
  opts = _.defaultsDeep(Object.create(null), opts, defaults);
  LineEditor.call(this, editor, opts);
  this.height = opts.height;
  this.__shape = new THREE.Shape();
  this.__mesh = null;
  this.__planeNormal = new THREE.Vector3(0,1,0);//this.editor.groundNormal;
  this.__planeDir = new THREE.Vector3(0,0,1);
  this.__transform = Object3DUtil.getAlignmentMatrix(new THREE.Vector3(0,0,1), new THREE.Vector3(1,0,0), this.__planeNormal, this.__planeDir);
  this.__tmpPt = new THREE.Vector3();
};

PolygonEditor.prototype = Object.create(LineEditor.prototype);
PolygonEditor.prototype.constructor = PolygonEditor;

PolygonEditor.prototype.reset = function () {
  LineEditor.prototype.reset.call(this);
  this.__shape = new THREE.Shape();
  this.__mesh = null;
};

PolygonEditor.prototype.isAcceptable = function (obj) {
  return obj && this.currentSegment.length  > 3;
};

PolygonEditor.prototype.__projectPoint = function(point) {
  this.__tmpPt.copy(point);
  this.__tmpPt.applyMatrix4(this.__transformInverse);
  return this.__tmpPt;
};

PolygonEditor.prototype.addEndpoint = function (point) {
  // TODO: Draw some balls to mark endpoints
  this.__pointMeshes = this.__pointMeshes || [];
  var pointMesh = new THREE.Mesh(new THREE.SphereBufferGeometry(this.lineWidth, 32, 16), this.material);
  pointMesh.position.copy(point);
  this.__pointMeshes.push(pointMesh);
  this.object.add(pointMesh);

  // TODO: More generic plane than with y up
  // Need to project onto plane
  //var planeNormal = this.editor.groundNormal;
  if (this.currentSegment.length > 1) {
    var p = this.__projectPoint(point);
    this.__shape.lineTo(p.x, p.y);
  } else {
    this.__planeOrigin = new THREE.Vector3(point.x, point.y, point.z);
    this.__transform.setPosition(this.__planeOrigin);
    this.__transformInverse = new THREE.Matrix4();
    this.__transformInverse.getInverse(this.__transform);
    var p = this.__projectPoint(point);
    this.__shape.moveTo(p.x, p.y);
  }
  if (this.currentSegment.length >= 3) {
    var geometry = this.height? new THREE.ExtrudeGeometry(this.__shape, { amount: this.height }) : new THREE.ShapeGeometry(this.__shape);
    if (this.__mesh) {
      this.object.remove(this.__mesh);
      Object3DUtil.dispose(this.__mesh);
      this.__mesh = null;
    }
    if (!this.__mesh) {
      this.__mesh = new THREE.Mesh(geometry, this.material);
      Object3DUtil.setMatrix(this.__mesh, this.__transform);
      this.object.add(this.__mesh);
    }
  }
};

PolygonEditor.prototype.addSegment = function (start, end) {
  // Nothing to do
};

PolygonEditor.prototype.getObjectData = function () {
  // TODO: proper saving
  return { type: 'polygon', height: this.height,
    points: this.currentSegment, label: this.getLabel() };
};

PolygonEditor.prototype.createObject = function (objData, opts) {
  opts = opts || {};
  if (objData && objData.type === 'polygon') {
    // TODO: proper loading
    var labelInfo = this.editor.getLabelInfo(objData.label, true);
    var material = this.__getMaterial(labelInfo) || this.material;
    var height = objData.height || this.height;
    var object = new THREE.Object3D();
    var shape = new THREE.Shape();

    for (var i = 0; i < objData.points.length; i++) {
      var point = Object3DUtil.toVector3(objData.points[i]);
      if (i === 0) {
        this.__planeOrigin = new THREE.Vector3(point.x, point.y, point.z);
        this.__transform.setPosition(this.__planeOrigin);
        this.__transformInverse = new THREE.Matrix4();
        this.__transformInverse.getInverse(this.__transform);
        var p = this.__projectPoint(point);
        shape.moveTo(p.x, p.y);
      } else {
        var p = this.__projectPoint(point);
        shape.lineTo(p.x, p.y);
      }
    }
    var geometry = height? new THREE.ExtrudeGeometry(shape, { amount: height }) : new THREE.ShapeGeometry(shape);
    var mesh = new THREE.Mesh(geometry, material);
    Object3DUtil.setMatrix(mesh, this.__transform);
    object.add(mesh);

    object.name = objData.label;
    object.userData = objData;
    this.__applyTransform(object, objData, opts);
    return object;
  } else {
    console.error('Unsupported object data type: ' + objData.type, objData);
  }
};

/**
 * Box editor - draw axis aligned bounding box
 * @param editor {editor.ShapeEditor}
 * @param opts Additional options
 * @param [opts.height=2.75] {number} Box height (in virtual units)
 * @param [opts.wireframe=false] {boolean} Whether to draw wireframe or solid box
 * @param [opts.mouseClickTimeout=0] {number} Set to something to avoid conflict with double click
 * @constructor
 * @extends editor.ComponentEditor
 * @memberOf editor
 */
var BoxEditor = function (editor, opts) {
  var defaults = {
    wireframe: false,
    height: Constants.metersToVirtualUnit * 2.75,
    mouseClickTimeout: 0 // Set to something to avoid conflict with double click
  };
  opts = _.defaultsDeep(Object.create(null), opts, defaults);
  ComponentEditor.call(this, editor, opts);
  this.wireframe = opts.wireframe;
  this.height = opts.height;
  this.minDistSq = this.height * this.height + Constants.metersToVirtualUnit * 0.01;
  this.__mouseClickTimeout = opts.mouseClickTimeout;
};

BoxEditor.prototype = Object.create(ComponentEditor.prototype);
BoxEditor.prototype.constructor = BoxEditor;

BoxEditor.prototype.reset = function () {
  ComponentEditor.prototype.reset.call(this);

  this.start = null;
  this.end = null;
  this.min = new THREE.Vector3();
  this.max = new THREE.Vector3();
  this.__pressTimer = null;
};

BoxEditor.prototype.onMouseDown = function (event) {
  if (this.drawStep === 'INIT' || this.drawStep === 'END') {
    var scope = this;
    if (this.__mouseClickTimeout) {
      this.__pressTimer = setTimeout(function () {
        scope.__onMouseDown(event);
      }, scope.__mouseClickTimeout);
    } else {
      scope.__onMouseDown(event);
    }
  }
};

BoxEditor.prototype.__onMouseDown = function (event) {
  var intersects = this.editor.getIntersected(event);
  if (intersects.length > 0) {
    // Figure out where the position will be
    var lastPoint = intersects[0].point;
    if (this.drawStep === 'INIT' || this.drawStep === 'END') {
      this.start = lastPoint;
      var upOffset = this.editor.groundNormal.clone().multiplyScalar(this.height);
      this.end = lastPoint.clone().add(upOffset);
      this.drawStep = 'DRAW';

      this.min.copy(this.start).min(this.end);
      this.max.copy(this.start).max(this.end);

      // Create box
      if (this.object == null) {
        this.object = new THREE.Object3D();
        this.editor.stagingNode.add(this.object);
        this.box = new MeshHelpers.BoxMinMax(this.min, this.max, this.material);

        if (this.wireframe) {
          this.boxwf = new THREE.BoxHelper(this.box);
          this.boxwf.material = this.material;
          this.boxwffat = new MeshHelpers.FatLines(this.boxwf, this.lineWidth, this.material);
          this.object.add(this.boxwffat);
        } else {
          this.object.add(this.box);
        }
      } else {
        // Just update object (we want to reuse this object for some reason...)
        this.box.update(this.min, this.max);
        if (this.boxwf) {
          this.boxwf.update();
        }
        if (this.boxwffat) {
          this.boxwffat.update(this.boxwf);
        }
      }
    }
  }
};

BoxEditor.prototype.onMouseMove = function (event) {
  if (!this.isActive()) return true;

  if (this.drawStep === 'DRAW') {
    var intersects = this.editor.getIntersected(event);
    if (intersects.length > 0) {
      // Figure out where the position will be
      var lastPoint = intersects[0].point;
      var upOffset = this.editor.groundNormal.clone().multiplyScalar(this.height);
      this.end = lastPoint.clone().add(upOffset);

      // Update this.box
      this.min.copy(this.start).min(this.end);
      this.max.copy(this.start).max(this.end);
      this.box.update(this.min, this.max);
      if (this.boxwf) {
        this.boxwf.update(this.box);
      }
      if (this.boxwffat) {
        this.boxwffat.update(this.boxwf);
      }
    }
  }
};

BoxEditor.prototype.onMouseUp = function (event) {
  if (this.__pressTimer) {
    clearTimeout(this.__pressTimer);
    this.__pressTimer = null;
  }
  if (this.drawStep === 'DRAW') {
    Object3DUtil.setChildAttachmentPoint(this.object, this.object.children[0], new THREE.Vector3(0.5, 0, 0.5), 'child');
    this.finish();
  }
};

BoxEditor.prototype.getObjectData = function () {
  return { type: 'box', min: this.min.clone(), max: this.max.clone(), label: this.getLabel() };
};

BoxEditor.prototype.isAcceptable = function (obj) {
  console.log(this.min);
  console.log(this.max);
  return obj && this.max.distanceToSquared(this.min) > this.minDistSq;
};

BoxEditor.prototype.createObject = function (objData, opts) {
  opts = opts || {};
  if (objData && objData.type === 'box') {
    var labelInfo = this.editor.getLabelInfo(objData.label, true);
    var material = this.__getMaterial(labelInfo) || this.material;
    var min = Object3DUtil.toVector3(objData.min);
    var max = Object3DUtil.toVector3(objData.max);
    if (!objData.transform && opts.transform) {
      var bbox = new BBox(min, max);
      var tbbox = bbox.toTransformedBBox(opts.transform);
      min = tbbox.min;
      max = tbbox.max;
    }
    var object = new THREE.Object3D();
    var box = new MeshHelpers.BoxMinMax(min, max, material);
    if (this.wireframe) {
      var boxwf = new THREE.BoxHelper(box);
      boxwf.material = material;
      var boxwffat = new MeshHelpers.FatLines(boxwf, this.lineWidth, material);
      object.add(boxwffat);
    } else {
      object.add(box);
    }
    this.__applyTransform(object, objData, opts);
    object.name = objData.label;
    object.userData = objData;
    return object;
  } else {
    console.error('Unsupported object data type: ' + objData.type, objData);
  }
};

/**
 * Box selector - draw axis aligned bounding box and uses it to select other objects
 * @param editor {editor.ShapeEditor}
 * @param opts Additional options
 * @param [opts.wireframe=true] {boolean} Whether to draw wireframe or solid box
 * @constructor
 * @extends editor.BoxEditor
 * @memberOf editor
 */
var BoxSelector = function (editor, opts) {
  var defaults = {
    wireframe: true
  };
  opts = _.defaultsDeep(Object.create(null), opts, defaults);
  BoxEditor.call(this, editor, opts);
  this.selected = null;
  this.selectFn = BoxSelector.SelectFns.CONTAIN_INTERSECT;
};

BoxSelector.SelectFns = {
  INTERSECT: function(selector, object, event) {
    var sbb = Object3DUtil.getBoundingBox(object);
    return selector.intersects(sbb);
  },
  CONTAIN: function(selector, object, event) {
    var sbb = Object3DUtil.getBoundingBox(object);
    return selector.contains(sbb);
  },
  CONTAIN_INTERSECT: function(selector, object, event) {
    var sbb = Object3DUtil.getBoundingBox(object);
    if (event.shiftKey) {
      return selector.intersects(sbb);
    } else {
      return selector.contains(sbb);
    }
  }
};

BoxSelector.prototype = Object.create(BoxEditor.prototype);
BoxSelector.prototype.constructor = BoxSelector;

BoxSelector.prototype.onMouseMove = function (event) {
  BoxEditor.prototype.onMouseMove.call(this, event);
  if (this.object) {
    var bb = new BBox(this.min, this.max);
    // Find objects intersected by bb
    var selectables = this.editor.scene.selectables;
    var selected = [];
    for (var i = 0; i < selectables.length; i++) {
      var s = selectables[i];
      if (this.selectFn(bb, s, event)) {
        selected.push(s);
      }
    }
    this.selected = selected;
    this.editor.app.setSelectedObjects(selected);
    //console.log(this.selected);
  }
};

BoxSelector.prototype.finish = function () {
  this.drawStep = 'END';
  this.editor.stagingNode.remove(this.object);
  this.object = null;
};

BoxSelector.prototype.getSelected = function () {
  return this.selected;
};

BoxSelector.prototype.unselect = function () {
  this.selected = null;
  this.editor.app.clearSelectedObjects();
};

BoxSelector.prototype.reset = function () {
  BoxEditor.prototype.reset.call(this);
  this.unselect();
};

/**
 * 3D shape editor for drawing boxes, lines, etc.  This class is responsible for delegating to the specific
 *  selected {@link editor.ComponentEditor} for drawing/editing the corresponding shape.
 * @param params
 * @param params.app Main application using this shape editor
 * @param params.container
 * @param params.picker
 * @param params.camera
 * @param params.scene
 * @param params.groundPlane
 * @param params.groundNormal
 * @param params.defaultDrawMode
 * @param [params.enabled=false]
 * @param [params.mode=Box]
 * @constructor
 * @memberOf editor
 */
var ShapeEditor = function (params) {
  PubSub.call(this);

  this.app = params.app;
  this.container = params.container;
  this.picker = params.picker;
  this.camera = params.camera;
  this.scene = params.scene;
  this.transformControls = new THREE.TransformControls(this.app.cameraControls.camera, this.container);
  this.transformControls.setMode('translate');
  this.transformControls.addEventListener('change', this.app.render);
  this.scene.add(this.transformControls);

  this.groundPlane = params.groundPlane;
  this.groundNormal = params.groundNormal || Constants.worldUp;

  this._enabled = params.enabled;

  this.node = new THREE.Group();
  this.scene.add(this.node);
  this.objectsByType = {};   // Objects by type { 'line': [], 'wall': [], 'box': [] }
  this.objects = []; // Array of objects
  this.node.pickables = this.objects;

  this.drawModes = _.clone(DrawModes);
  this.defaultDrawMode = (params.defaultDrawMode != undefined) ? params.defaultDrawMode : DrawModes.Select;
  this.selectEditor = new SelectEditor(this);
  this.componentEditors = [
    this.selectEditor,
    new LineEditor(this),
    new WallEditor(this),
    new BoxEditor(this),
    new PolygonEditor(this)
  ];
  this.editorsByObjectType = {
    'line': this.componentEditors[DrawModes.Line],
    'wall': this.componentEditors[DrawModes.Wall],
    'box': this.componentEditors[DrawModes.Box],
    'poly': this.componentEditors[DrawModes.Poly]
  };
  this.setMode({ mode: (params.mode != undefined)? params.mode : this.defaultDrawMode });
  this.raycaster = new THREE.Raycaster();
  if (params.labelsPanel) {
    this.labelsPanel = new LabelsPanel(params.labelsPanel);
    this.labelsPanel.createPanel();
    this.labelsPanel.Subscribe('labelSelected', this, this.onLabelChanged.bind(this));
  }
};

ShapeEditor.prototype = Object.create(PubSub.prototype);
ShapeEditor.prototype.constructor = ShapeEditor;

Object.defineProperty(ShapeEditor.prototype, 'editMode', {
  get: function () {
    return this.mode;
  },
  set: function (v) {
    this.setMode({ mode: v });
  }
});

Object.defineProperty(ShapeEditor.prototype, 'enabled', {
  get: function () {return this._enabled; },
  set: function (v) {
    if (v) {
      this.selectedEditor.updateCursor();
    } else {
      this.container.style.cursor = 'initial';
    }
    this._enabled = v;
  }
});

Object.defineProperty(ShapeEditor.prototype, 'boxHeight', {
  get: function () { return this.componentEditors[3] ? this.componentEditors[3].height : 0; },
  set: function (v) {
    this.componentEditors[3].height = v;
  }
});


ShapeEditor.prototype.updateDatGui = function (gui) {
  gui.add(this, 'editMode', this.drawModes).listen();
  gui.add(this, 'boxHeight', this.boxHeight).min(0).max(10 * Constants.metersToVirtualUnit).listen();
};

ShapeEditor.prototype.reset = function (params) {
  this.camera = params.camera;
  this.scene = params.scene;
  this.matrixWorld = params.matrixWorld;
  this.scene.remove(this.node);
  this.node = new THREE.Group();
  this.node.name = 'ShapeEditorNode';
  this.stagingNode = new THREE.Group();
  this.stagingNode.name = 'ShapeEditorStagingNode';
  this.objectsNode = new THREE.Group();
  this.objectsNode.name = 'ShapeEditorObjectsNode';
  this.node.add(this.stagingNode);
  this.node.add(this.objectsNode);
  this.scene.add(this.node);
  if (this.transformControls) {
    this.scene.add(this.transformControls);
    this.transformControls.camera = this.camera;
  }
  this.objects = [];
  this.objectsByType = {};
  this.node.pickables = this.objects;
  this.selectedEditor.reset();
};

ShapeEditor.prototype.clearStaging = function (params) {
  this.node.remove(this.stagingNode);
  this.stagingNode = new THREE.Group();
  this.stagingNode.name = 'ShapeEditorStagingNode';
  this.node.add(this.stagingNode);
};

ShapeEditor.prototype.getLabelInfo = function(label, add) {
  if (!this.labelsPanel) {
    return;
  }
  var labelInfo = this.labelsPanel.getLabelInfo(label);
  if (!labelInfo) {
    if (add) {
      labelInfo = this.labelsPanel.addLabel(label, {});
    }
  }
  return labelInfo;
};

ShapeEditor.prototype.setMode = function (params) {
  var forceMode = (typeof params === 'object') ? params.force : false;
  var mode = (typeof params === 'object') ? params.mode : params;
  if (this.drawModes[mode] != undefined) {
    mode = this.drawModes[mode];
  }
  if (this.mode !== mode || forceMode) {
    if (this.selectedEditor) {
      this.selectedEditor.finish();
    }
    this.mode = mode;
    var oldEditor = this.selectedEditor;
    this.selectedEditor = this.componentEditors[this.mode];
    this.selectedEditor.reset();
    if (oldEditor && oldEditor.labelInfo) {
      this.selectedEditor.setLabelInfo(oldEditor.labelInfo);
    }
  }
};

ShapeEditor.prototype.onLabelChanged = function (labelInfo) {
  // if (labelInfo.name === 'wall') {
  //   this.setMode(DrawModes.Wall);
  // } else {
  //   this.setMode(DrawModes.Box);
  // }
  this.selectedEditor.setLabelInfo(labelInfo);
  this.Publish('labelChanged', labelInfo);
};

ShapeEditor.prototype.setLabels = function (labels) {
  this.labelsPanel.setLabels(labels);
};

ShapeEditor.prototype.addObject = function (object, autoselect) {
  var objType = object.userData.type;
  this.objects.push(object);
  if (!this.objectsByType[objType]) {
    this.objectsByType[objType] = [object];
  } else {
    this.objectsByType[objType].push(object);
  }
  if (object.parent !== this.objectsNode) {
    this.objectsNode.add(object);
  }
  if (this.selectEditor && autoselect) {
    this.selectEditor.select(object);
  }
};

ShapeEditor.prototype.removeObject = function (object) {
  var objType = object.userData.type;
  var oi = this.objects.indexOf(object);
  if (oi !== -1) {
    this.objects.splice(oi, 1);
  }
  if (this.objectsByType[objType]) {
    oi = this.objectsByType[objType].indexOf(object);
    this.objectsByType[objType].splice(oi, 1);
  }
  this.objectsNode.remove(object);
};

ShapeEditor.prototype.getObjects = function() {
  return this.objects;
};

ShapeEditor.prototype.clearObjects = function() {
  for (var i = 0; i < this.objects.length; i++) {
    this.objectsNode.remove(this.objects[i]);
  }
  this.objects = [];
  this.objectsByType = [];
  this.node.pickables = this.objects;
  if (this.selectEditor) {
    this.selectEditor.unselect();
  }
};

ShapeEditor.prototype.addObjects = function(objects, opts) {
  for (var i = 0; i < objects.length; i++) {
    var object = objects[i];
    var editor = this.editorsByObjectType[object.type];
    if (editor) {
      var obj = editor.createObject(object, opts);
      if (obj) {
        this.addObject(obj);
      }
    } else {
      console.warn('Ignoring unsupported object type: ' + object.type);
    }
  }
};

ShapeEditor.prototype.setObjects = function(objects, opts) {
  this.clearObjects();
  this.addObjects(objects, opts);
};

ShapeEditor.prototype.deleteSelected = function () {
  if (this.mode == DrawModes.Select) {
    var object = this.selectedEditor.getSelected();
    if (object) {
      this.removeObject(object);
      this.selectedEditor.unselect();
    }
  }
};

ShapeEditor.prototype.getIntersected = function (event, objects) {
  objects = objects || this.groundPlane;
  if (!Array.isArray(objects)) {
    objects = [objects];
  }
  this.mouse = this.picker.getCoordinates(this.container, event);
  this.picker.getRaycaster(this.mouse.x, this.mouse.y, this.camera, this.raycaster);
  var intersects = this.picker.getIntersected(this.mouse.x, this.mouse.y, this.camera,
    objects, undefined, 1, this.raycaster);
  return intersects;
};

ShapeEditor.prototype.onMouseDown = function (event) {
  if (!this.enabled || !this.selectedEditor) return true;
  this.selectedEditor.onMouseDown(event);
};

ShapeEditor.prototype.onMouseClick = function (event) {
  if (!this.enabled || !this.selectedEditor) return true;
  this.selectedEditor.onMouseClick(event);
};

ShapeEditor.prototype.onMouseMove = function (event) {
  if (!this.enabled || !this.selectedEditor) return true;
  this.selectedEditor.onMouseMove(event);
};

ShapeEditor.prototype.onMouseUp = function (event) {
  if (!this.enabled || !this.selectedEditor) return true;
  this.selectedEditor.onMouseUp(event);
};

ShapeEditor.prototype.onKeypress = function (event) {
  switch (event.which) {
    case 27: // escape
      this.finish();
      break;
    case 8:  // backspace
    case 46: // delete
      this.deleteSelected();
      this.setMode(this.defaultDrawMode);
      break;
    case 66: // B
      if (this.mode === DrawModes.Box) {
        this.setMode(DrawModes.Select);
      } else {
        this.setMode(DrawModes.Box);
      }
      return false;
    case 87: // W
      if (this.mode === DrawModes.Wall) {
        this.setMode(DrawModes.Select);
      } else {
        this.setMode(DrawModes.Wall);
      }
      return false;
    case 82: // R
      this.transformControls.setMode('translate');
      return false;
    case 83: // S
      this.transformControls.setMode('scale');
      return false;
    case 80: // P
      this.saveBoxes();
      break;
  }
};

ShapeEditor.prototype.finish = function () {
  if (this.selectedEditor) {
    this.selectedEditor.finish();
    this.selectedEditor.reset();
    this.componentEditors[DrawModes.Select].unselect();
  }
};

ShapeEditor.prototype.saveBoxes = function() {
  var annotations = [];
  var fromWorld = this.matrixWorld ? new THREE.Matrix4().getInverse(this.matrixWorld) : null;
  for (var i = 0; i < this.objects.length; i++) {
    var bbox = Object3DUtil.computeBoundingBox(this.objects[i], fromWorld);
    var m = _.clone(this.objects[i].userData);
    if (m.min) { m.min = bbox.min.toArray(); }
    if (m.max) { m.max = bbox.max.toArray(); }
    console.log(m);
    annotations.push(m);
  }
  var fullId = this.scene.userData.fullId;
  var out = { fullId: fullId, annotations: annotations };
  FileUtil.saveJson(out, this.scene.userData.id + '.json');
};

ShapeEditor.prototype.getAnnotations = function(indexOffset) {
  // More generic saving of shapes (not yet tested)
  var annotations = [];
  var fromWorld = this.matrixWorld ? new THREE.Matrix4().getInverse(this.matrixWorld) : null;
  indexOffset = indexOffset || 0;
  for (var i = 0; i < this.objects.length; i++) {
    var metadata = this.objects[i].userData;
    var m = _.clone(metadata);
    var transform = this.objects[i].matrixWorld;
    if (fromWorld) {
      transform = fromWorld.clone();
      transform.multiply(this.objects[i].matrixWorld);
    }
    m.transform = transform.toArray();
    m.index = indexOffset + i;
    metadata.objectIndex = m.index;  // useful for rendering
    annotations.push(m);
  }
  return { annotations: annotations };
};

ShapeEditor.prototype.setComponent = function(name, component) {
  var i = this.drawModes[name];
  if (i >= 0) {
    this.componentEditors[i] = component;
  } else {
    this.drawModes[name] = this.componentEditors.length;
    this.componentEditors.push(component);
  }
  this.setMode({ mode: this.mode, force: true });
};

ShapeEditor.DrawModes = DrawModes;

ShapeEditor.Components = {
  // Selectors
  Selector: SelectEditor,
  BoxSelector: BoxSelector,
  // Editors
  LineEditor: LineEditor,
  WallEditor: WallEditor,
  PolygonEditor: PolygonEditor,
  BoxEditor: BoxEditor
};

module.exports = ShapeEditor;
