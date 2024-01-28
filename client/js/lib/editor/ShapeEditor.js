/* 2D editor */

const PubSub = require('PubSub');
const BBox = require('geo/BBox');
const CanvasUtil = require('ui/CanvasUtil');
const ArchUtil = require('geo/ArchUtil');
const Object3DUtil = require('geo/Object3DUtil');
const MeshHelpers = require('geo/MeshHelpers');
const LabelsPanel = require('ui/LabelsPanel');
const HighlightControls = require('controls/HighlightControls');
const Constants = require('Constants');
const FileUtil = require('io/FileUtil');
const _ = require('util/util');

const DrawModes = Object.freeze({
  Select: 0,
  Line: 1,
  Wall: 2,
  Box: 3,
  Poly: 4
});

function getLineWidth(p) {
  return p*0.01*Constants.metersToVirtualUnit;
}

class EditLineMaterial extends THREE.LineBasicMaterial {
  constructor(parameters) {
    super();

    this.depthTest = false;
    this.depthWrite = false;
    this.transparent = true;
    this.linewidth = getLineWidth(1);

    this.setValues(parameters);

    this.oldColor = this.color.clone();
    this.oldOpacity = this.opacity;
  }

  highlight(highlighted) {
    if (highlighted) {
      this.color.setRGB(1, 1, 0);
      this.opacity = 1;
    } else {
      this.color.copy(this.oldColor);
      this.opacity = this.oldOpacity;
    }
  }
}

class EditWallMaterial extends THREE.MeshBasicMaterial {
  constructor(parameters) {
    super();
    this.setValues(parameters);
    this.oldColor = this.color.clone();
    this.oldOpacity = this.opacity;
  }

  highlight(highlighted) {
    if (highlighted) {
      this.color.setRGB(1, 1, 0);
      this.opacity = 1;
    } else {
      this.color.copy(this.oldColor);
      this.opacity = this.oldOpacity;
    }
  }
}

/**
 * Base component editor class
 * @param editor {editor.ShapeEditor}
 * @param opts Additional options
 * @param [opts.lineWidth=5] {number} How thick the lines should be (in virtual units)
 * @param [opts.color=silver] {string} What color to use
 * @constructor
 * @memberOf editor
 */
class ComponentEditor extends PubSub {
  constructor(editor, opts) {
    super();
    const defaults = {
      lineWidth: getLineWidth(5),
      color: 'silver'
    };
    opts = _.defaultsDeep(Object.create(null), opts, defaults);
    this.drawSteps = ['INIT', 'DRAW', 'EDIT', 'END'];
    this.editor = editor;
    this.labelInfo = null;
    this.material = new EditLineMaterial({color: opts.color});
    this.lineWidth = opts.lineWidth;
    this.object = null;
    this.reset();
  }

  reset() {
    this.drawStep = this.drawSteps[0];
  }

  onMouseClick(event) {
  }

  onMouseMove(event) {
  }

  onMouseDown(event) {
  }

  onMouseUp(event) {
  }

  isActive() {
    return this.drawStep === 'DRAW';
  }

  updateCursor() {
    if (this.labelInfo && this.labelInfo.cssColor) {
      const str = CanvasUtil.getColoredArrowCursor(this.labelInfo.cssColor, 32);
      //this.editor.container;
      $('canvas').css('cursor', str);
    } else {
      this.editor.container.style.cursor = 'crosshair';
    }
  }

  setLabelInfo(labelInfo) {
    this.labelInfo = labelInfo;
    if (this.labelInfo) {
      this.material = this.__getMaterial(labelInfo);
    }
    this.updateCursor();
  }

  __getMaterial(labelInfo) {
    if (labelInfo) {
      if (labelInfo.colorMat) {
        return labelInfo.colorMat;
      } else if (labelInfo.color) {
        return new EditLineMaterial({color: labelInfo.color});
      }
    }
  }

  getLabel() {
    if (this.labelInfo) return this.labelInfo.name;
  }

  getObject() {
    if (this.object) {
      this.object.userData = this.getObjectData();
    }
    return this.object;
  }

  getObjectData() {
    return {type: 'unknown'};
  }

  /**
   * This function is called when the draw step is finished
   */
  finish() {
    this.drawStep = 'END';
    if (this.object && this.isAcceptable(this.object)) {
      const obj = this.getObject();
      this.editor.addObject(obj, false);
    } else {
      this.editor.stagingNode.remove(this.object);
    }
    this.object = null;
  }

  /**
   * Returns whether the created object is a valid, complete shape (for instance, has required number of points, etc).
   * As the users draw a shape it will go from invalid to valid.
   * @param obj
   * @returns {boolean}
   */
  isAcceptable(obj) {
    return !!obj;
  }

  createObject(objData, opts) {
    console.warn('Unsupported createObject for ' + this.constructor.name + '. Please implement me!!!');
    return null;
  }

  __applyTransform(object, objData, opts) {
    if (objData.transform) {
      const matrix = new THREE.Matrix4();
      matrix.fromArray(objData.transform);
      if (opts.transform) {
        matrix.multiplyMatrices(opts.transform, matrix);
      }
      Object3DUtil.setMatrix(object, matrix);
    }
  }

  updateDatGui(gui) {
  }

}
/**
 * Selection tool
 * @param editor {editor.ShapeEditor}
 * @param opts Additional options
 * @constructor
 * @extends ComponentEditor
 * @memberOf editor
 */
class SelectEditor extends ComponentEditor {
  constructor(editor, opts) {
    super(editor, opts);
    this.highlightControls = new HighlightControls({
      container: editor.container,
      picker: editor.picker,
      camera: editor.camera,
      scene: editor.node
    });
    this.selected = null;
  }

  reset() {
    super.reset();
    if (this.highlightControls) {
      this.highlightControls.camera = this.editor.camera;
      this.highlightControls.scene = this.editor.node;
    }
  }

  onMouseMove(event) {
    this.highlightControls.onMouseMove(event);
  }

  onMouseClick(event) {
    this.selected = this.highlightControls.intersected;
    if (this.selected) { this.editor.transformControls.attach(this.selected); }
  }

  getSelected() {
    return this.selected;
  }

  unselect() {
    this.editor.transformControls.detach(this.selected);
    this.selected = null;
  }

  select(object) {
    this.selected = object;
    if (this.selected) { this.editor.transformControls.attach(this.selected); }
  }
}

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
class LineEditor extends ComponentEditor {
  constructor(editor, opts) {
    const defaults = {
      minDistSq: 1,
      restrictToBase: true
    };
    opts = _.defaultsDeep(Object.create(null), opts, defaults);
    super(editor, opts);
    this.minDistSq = opts.minDistSq;
    this.restrictToBase = opts.restrictToBase;
  }

  reset() {
    super.reset();
    this.currentSegment = [];
  }

  onMouseClick(event) {
    const intersects = (this.restrictToBase) ? this.editor.getIntersected(event, this.editor.baseObject) :
      this.editor.getIntersected(event);
    if (intersects.length > 0) {
      // Figure out where the position will be
      const lastPoint = intersects[0].point;
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
        const segmentStart = this.currentSegment[this.currentSegment.length - 1];
        const distanceSq = lastPoint.distanceToSquared(segmentStart);
        if (distanceSq > this.minDistSq) {
          this.currentSegment.push(lastPoint);
          this.addEndpoint(lastPoint);
          this.addSegment(segmentStart,lastPoint);
        }
      }
    }
  }

  addEndpoint(point) {
    Object3DUtil.addSphere(this.object, point, this.lineWidth, this.material);
  }

  addSegment(start, end) {
    const lineNode = Object3DUtil.makeCylinderStartEnd(start, end, this.lineWidth, this.material);
    this.object.add(lineNode);
  }

  getObjectData() {
    return { type: 'line', points: this.currentSegment, label: this.getLabel() };
  }

  isAcceptable(obj) {
    return obj && this.currentSegment.length  > 1;
  }

  finish() {
    super.finish();
    this.currentSegment = [];
  }

  createObject(objData, opts) {
    opts = opts || {};
    if (objData && objData.type === 'line') {
      const labelInfo = this.editor.getLabelInfo(objData.label, true);
      const material = this.__getMaterial(labelInfo) || this.material;
      const object = new THREE.Object3D();
      const lineWidth = this.lineWidth;
      let start = null;
      for (let i = 0; i < objData.points.length; i++) {
        const point = Object3DUtil.toVector3(objData.points[i]);
        Object3DUtil.addSphere(object, point, lineWidth, material);
        if (start) {
          const lineNode = Object3DUtil.makeCylinderStartEnd(start, point, lineWidth, material);
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
  }
}


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
class WallEditor extends LineEditor {
  constructor(editor, opts) {
    const defaults = {
      wallHeight: Constants.metersToVirtualUnit * 2.75,
      restrictToBase: false
    };
    opts = _.defaultsDeep(Object.create(null), opts, defaults);
    super(editor, opts);
    this.material = new EditWallMaterial({color: 'gray'});
    this.wallHeight = opts.wallHeight;
  }

  addEndpoint(point) {
    const wallUp = this.editor.groundNormal;
    ArchUtil.addColumn(this.object, point, wallUp, this.wallHeight, this.lineWidth, this.material);
  }

  addSegment(start, end) {
    const wallUp = this.editor.groundNormal;
    ArchUtil.addWall(this.object, start, end, wallUp, this.wallHeight, this.lineWidth, this.material);
  }

  getObjectData() {
    const wallUp = this.editor.groundNormal;
    return {
      type: 'wall', height: this.wallHeight, up: wallUp.clone(), depth: this.lineWidth,
      points: this.currentSegment, label: this.getLabel()
    };
  }

  createObject(objData, opts) {
    opts = opts || {};
    if (objData && objData.type === 'wall') {
      const labelInfo = this.editor.getLabelInfo(objData.label, true);
      const material = this.__getMaterial(labelInfo) || this.material;
      const lineWidth = objData.depth || this.lineWidth;
      const wallHeight = objData.height || this.wallHeight;
      const wallUp = Object3DUtil.toVector3(objData.up);
      const object = new THREE.Object3D();
      let start = null;
      for (let i = 0; i < objData.points.length; i++) {
        const point = Object3DUtil.toVector3(objData.points[i]);
        ArchUtil.addColumn(object, point, wallUp, wallHeight, lineWidth, material);
        if (start) {
          ArchUtil.addWall(object, start, point, wallUp, wallHeight, lineWidth, material);
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
  }
}

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
class PolygonEditor extends LineEditor {
  constructor(editor, opts) {
    const defaults = {
      height: 0,
      restrictToBase: true
    };
    opts = _.defaultsDeep(Object.create(null), opts, defaults);
    super(editor, opts);
    this.height = opts.height;
    this.__shape = new THREE.Shape();
    this.__mesh = null;
    this.__planeNormal = new THREE.Vector3(0,1,0);//this.editor.groundNormal;
    this.__planeDir = new THREE.Vector3(0,0,1);
    this.__transform = Object3DUtil.getAlignmentMatrix(new THREE.Vector3(0,0,1), new THREE.Vector3(1,0,0), this.__planeNormal, this.__planeDir);
    this.__tmpPt = new THREE.Vector3();
  }

  reset() {
    super.reset();
    this.__shape = new THREE.Shape();
    this.__mesh = null;
  }

  isAcceptable(obj) {
    return obj && this.currentSegment.length  > 3;
  }

  __projectPoint(point) {
    this.__tmpPt.copy(point);
    this.__tmpPt.applyMatrix4(this.__transformInverse);
    return this.__tmpPt;
  }

  addEndpoint(point) {
    // TODO: Draw some balls to mark endpoints
    this.__pointMeshes = this.__pointMeshes || [];
    const pointMesh = new THREE.Mesh(new THREE.SphereBufferGeometry(this.lineWidth, 32, 16), this.material);
    pointMesh.position.copy(point);
    this.__pointMeshes.push(pointMesh);
    this.object.add(pointMesh);

    // TODO: More generic plane than with y up
    // Need to project onto plane
    //var planeNormal = this.editor.groundNormal;
    if (this.currentSegment.length > 1) {
      const p = this.__projectPoint(point);
      this.__shape.lineTo(p.x, p.y);
    } else {
      this.__planeOrigin = new THREE.Vector3(point.x, point.y, point.z);
      this.__transform.setPosition(this.__planeOrigin);
      this.__transformInverse = new THREE.Matrix4();
      this.__transformInverse.copy(this.__transform).invert();
      const p = this.__projectPoint(point);
      this.__shape.moveTo(p.x, p.y);
    }
    if (this.currentSegment.length >= 3) {
      const geometry = this.height? new THREE.ExtrudeGeometry(this.__shape, { depth: this.height }) : new THREE.ShapeGeometry(this.__shape);
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
  }

  addSegment(start, end) {
    // Nothing to do
  }

  getObjectData() {
    // TODO: proper saving
    return { type: 'polygon', height: this.height,
      points: this.currentSegment, label: this.getLabel() };
  }

  createObject(objData, opts) {
    opts = opts || {};
    if (objData && objData.type === 'polygon') {
      // TODO: proper loading
      const labelInfo = this.editor.getLabelInfo(objData.label, true);
      const material = this.__getMaterial(labelInfo) || this.material;
      const height = objData.height || this.height;
      const object = new THREE.Object3D();
      const shape = new THREE.Shape();

      for (let i = 0; i < objData.points.length; i++) {
        const point = Object3DUtil.toVector3(objData.points[i]);
        if (i === 0) {
          this.__planeOrigin = new THREE.Vector3(point.x, point.y, point.z);
          this.__transform.setPosition(this.__planeOrigin);
          this.__transformInverse = new THREE.Matrix4();
          this.__transformInverse.copy(this.__transform).invert();
          const p = this.__projectPoint(point);
          shape.moveTo(p.x, p.y);
        } else {
          const p = this.__projectPoint(point);
          shape.lineTo(p.x, p.y);
        }
      }
      const geometry = height? new THREE.ExtrudeGeometry(shape, { depth: height }) : new THREE.ShapeGeometry(shape);
      const mesh = new THREE.Mesh(geometry, material);
      Object3DUtil.setMatrix(mesh, this.__transform);
      object.add(mesh);

      object.name = objData.label;
      object.userData = objData;
      this.__applyTransform(object, objData, opts);
      return object;
    } else {
      console.error('Unsupported object data type: ' + objData.type, objData);
    }
  }
}
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
class BoxEditor extends ComponentEditor {
  constructor(editor, opts) {
    const defaults = {
      wireframe: false,
      height: Constants.metersToVirtualUnit * 2.75,
      mouseClickTimeout: 0 // Set to something to avoid conflict with double click
    };
    opts = _.defaultsDeep(Object.create(null), opts, defaults);
    super(editor, opts);
    this.wireframe = opts.wireframe;
    this.height = opts.height;
    this.minDistSq = this.height * this.height + Constants.metersToVirtualUnit * 0.01;
    this.__mouseClickTimeout = opts.mouseClickTimeout;
  }

  reset() {
    super.reset(this);

    this.start = null;
    this.end = null;
    this.min = new THREE.Vector3();
    this.max = new THREE.Vector3();
    this.__pressTimer = null;
  }

  onMouseDown(event) {
    if (this.drawStep === 'INIT' || this.drawStep === 'END') {
      const scope = this;
      if (this.__mouseClickTimeout) {
        this.__pressTimer = setTimeout(function () {
          scope.__onMouseDown(event);
        }, scope.__mouseClickTimeout);
      } else {
        scope.__onMouseDown(event);
      }
    }
  }

  __onMouseDown(event) {
    const intersects = this.editor.getIntersected(event);
    if (intersects.length > 0) {
      // Figure out where the position will be
      const lastPoint = intersects[0].point;
      if (this.drawStep === 'INIT' || this.drawStep === 'END') {
        this.start = lastPoint;
        const upOffset = this.editor.groundNormal.clone().multiplyScalar(this.height);
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
            this.boxwf.setFromObject(this.box);
            this.boxwf.update();
          }
          if (this.boxwffat) {
            this.boxwffat.setFromObject(this.boxwf);
            this.boxwffat.update();
          }
        }
      }
    }
  }

  onMouseMove(event) {
    if (!this.isActive()) return true;

    if (this.drawStep === 'DRAW') {
      var intersects = this.editor.getIntersected(event);
      if (intersects.length > 0) {
        // Figure out where the position will be
        const lastPoint = intersects[0].point;
        const upOffset = this.editor.groundNormal.clone().multiplyScalar(this.height);
        this.end = lastPoint.clone().add(upOffset);

        // Update this.box
        this.min.copy(this.start).min(this.end);
        this.max.copy(this.start).max(this.end);
        this.box.update(this.min, this.max);
        if (this.boxwf) {
          this.boxwf.setFromObject(this.box);
          this.boxwf.update();
        }
        if (this.boxwffat) {
          this.boxwffat.setFromObject(this.boxwf);
          this.boxwffat.update();
        }
      }
    }
  }

  onMouseUp(event) {
    if (this.__pressTimer) {
      clearTimeout(this.__pressTimer);
      this.__pressTimer = null;
    }
    if (this.drawStep === 'DRAW') {
      Object3DUtil.setChildAttachmentPoint(this.object, this.object.children[0], new THREE.Vector3(0.5, 0, 0.5), 'child');
      this.finish();
    }
  }

  getObjectData() {
    return {type: 'box', min: this.min.clone(), max: this.max.clone(), label: this.getLabel()};
  }

  isAcceptable(obj) {
    console.log(this.min);
    console.log(this.max);
    return obj && this.max.distanceToSquared(this.min) > this.minDistSq;
  }

  createObject(objData, opts) {
    opts = opts || {};
    if (objData && objData.type === 'box') {
      const labelInfo = this.editor.getLabelInfo(objData.label, true);
      const material = this.__getMaterial(labelInfo) || this.material;
      let min = Object3DUtil.toVector3(objData.min);
      let max = Object3DUtil.toVector3(objData.max);
      if (!objData.transform && opts.transform) {
        const bbox = new BBox(min, max);
        const tbbox = bbox.toTransformedBBox(opts.transform);
        min = tbbox.min;
        max = tbbox.max;
      }
      const object = new THREE.Object3D();
      const box = new MeshHelpers.BoxMinMax(min, max, material);
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
  }

  updateDatGui(gui) {
    super.updateDatGui(gui);
    gui.add(this, 'height', this.height).name('boxHeight').min(0).max(10 * Constants.metersToVirtualUnit).listen();
  }
}

/**
 * Box selector - draw axis aligned bounding box and uses it to select other objects
 * @param editor {editor.ShapeEditor}
 * @param opts Additional options
 * @param [opts.wireframe=true] {boolean} Whether to draw wireframe or solid box
 * @constructor
 * @extends editor.BoxEditor
 * @memberOf editor
 */
class BoxSelector extends BoxEditor {
  constructor(editor, opts) {
    const defaults = {
      wireframe: true,
      includePickables: false
    };
    opts = _.defaultsDeep(Object.create(null), opts, defaults);
    super(editor, opts);
    this.includePickables = false;
    this.selected = null;
    this.selectFn = BoxSelector.SelectFns.CONTAIN_INTERSECT;
  }

  get selectables() {
    return this.includePickables? this.editor.scene.pickables : this.editor.scene.selectables;
  }

  onMouseMove(event) {
    super.onMouseMove(event);
    if (this.object) {
      const bb = new BBox(this.min, this.max);
      // Find objects intersected by bb
      const selectables = this.selectables;
      const selected = [];
      for (let i = 0; i < selectables.length; i++) {
        const s = selectables[i];
        if (this.selectFn(bb, s, event)) {
          selected.push(s);
        }
      }
      this.selected = selected;
      this.editor.app.setSelectedObjects(selected, { box: bb });
      //console.log(this.selected);
    }
  }

  finish() {
    this.drawStep = 'END';
    this.editor.stagingNode.remove(this.object);
    if (this.selected) {
      const bb = new BBox(this.min, this.max);
      console.log(`Select ${this.selected.length} with ${bb}`);
      const matrixWorld = this.editor.matrixWorld;
      if (matrixWorld) {
        const fromWorld = new THREE.Matrix4().copy(matrixWorld).invert();
        const sbb = bb.toTransformedBBox(fromWorld);
        console.log(`Original scene coordinates ${sbb}`);
      }
    }
    this.object = null;
  }

  getSelected() {
    return this.selected;
  }

  unselect() {
    this.selected = null;
    this.editor.app.clearSelectedObjects();
  }

  reset() {
    super.reset();
    this.unselect();
  }

  updateDatGui(gui) {
    super.updateDatGui(gui);
    gui.add(this, 'includePickables', this.includePickables).listen();
  }
}

BoxSelector.SelectFns = {
  INTERSECT: function(selector, object, event) {
    const sbb = Object3DUtil.getBoundingBox(object);
    return selector.intersects(sbb);
  },
  CONTAIN: function(selector, object, event) {
    const sbb = Object3DUtil.getBoundingBox(object);
    return selector.contains(sbb);
  },
  CONTAIN_INTERSECT: function(selector, object, event) {
    const sbb = Object3DUtil.getBoundingBox(object);
    if (event.shiftKey) {
      return selector.intersects(sbb);
    } else {
      return selector.contains(sbb);
    }
  }
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
class ShapeEditor extends PubSub {
  constructor(params) {
    super();

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
  }

  get editMode() {
    return this.mode;
  }
  set editMode(v) {
    this.setMode({ mode: v });
  }

  get enabled() {
    return this._enabled;
  }
  set enabled(v) {
    if (v) {
      this.selectedEditor.updateCursor();
    } else {
      this.container.style.cursor = 'initial';
    }
    this._enabled = v;
  }

  get boxHeight() {
    return this.componentEditors[3] ? this.componentEditors[3].height : 0;
  }
  set boxHeight(v) {
    this.componentEditors[3].height = v;
  }

  updateDatGui(gui) {
    gui.add(this, 'editMode', this.drawModes).listen();
    gui.add(this, 'boxHeight', this.boxHeight).min(0).max(10 * Constants.metersToVirtualUnit).listen();
  }

  reset(params) {
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
  }

  clearStaging(params) {
    this.node.remove(this.stagingNode);
    this.stagingNode = new THREE.Group();
    this.stagingNode.name = 'ShapeEditorStagingNode';
    this.node.add(this.stagingNode);
  }

  getLabelInfo(label, add) {
    if (!this.labelsPanel) {
      return;
    }
    let labelInfo = this.labelsPanel.getLabelInfo(label);
    if (!labelInfo) {
      if (add) {
        labelInfo = this.labelsPanel.addLabel(label, {});
      }
    }
    return labelInfo;
  }

  setMode(params) {
    const forceMode = (typeof params === 'object') ? params.force : false;
    let mode = (typeof params === 'object') ? params.mode : params;
    if (this.drawModes[mode] != undefined) {
      mode = this.drawModes[mode];
    }
    if (this.mode !== mode || forceMode) {
      if (this.selectedEditor) {
        this.selectedEditor.finish();
      }
      this.mode = mode;
      const oldEditor = this.selectedEditor;
      this.selectedEditor = this.componentEditors[this.mode];
      this.selectedEditor.reset();
      if (oldEditor && oldEditor.labelInfo) {
        this.selectedEditor.setLabelInfo(oldEditor.labelInfo);
      }
    }
  }

  onLabelChanged(labelInfo) {
    // if (labelInfo.name === 'wall') {
    //   this.setMode(DrawModes.Wall);
    // } else {
    //   this.setMode(DrawModes.Box);
    // }
    this.selectedEditor.setLabelInfo(labelInfo);
    this.Publish('labelChanged', labelInfo);
  }

  setLabels(labels) {
    this.labelsPanel.setLabels(labels);
  }

  addObject(object, autoselect) {
    const objType = object.userData.type;
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
  }

  removeObject(object) {
    const objType = object.userData.type;
    let oi = this.objects.indexOf(object);
    if (oi !== -1) {
      this.objects.splice(oi, 1);
    }
    if (this.objectsByType[objType]) {
      oi = this.objectsByType[objType].indexOf(object);
      this.objectsByType[objType].splice(oi, 1);
    }
    this.objectsNode.remove(object);
  }

  getObjects() {
    return this.objects;
  }

  clearObjects() {
    for (let i = 0; i < this.objects.length; i++) {
      this.objectsNode.remove(this.objects[i]);
    }
    this.objects = [];
    this.objectsByType = [];
    this.node.pickables = this.objects;
    if (this.selectEditor) {
      this.selectEditor.unselect();
    }
  }

  addObjects(objects, opts) {
    for (let i = 0; i < objects.length; i++) {
      const object = objects[i];
      const editor = this.editorsByObjectType[object.type];
      if (editor) {
        const obj = editor.createObject(object, opts);
        if (obj) {
          this.addObject(obj);
        }
      } else {
        console.warn('Ignoring unsupported object type: ' + object.type);
      }
    }
  }

  setObjects(objects, opts) {
    this.clearObjects();
    this.addObjects(objects, opts);
  }

  deleteSelected() {
    if (this.mode === DrawModes.Select) {
      const object = this.selectedEditor.getSelected();
      if (object) {
        this.removeObject(object);
        this.selectedEditor.unselect();
      }
    }
  }

  getIntersected(event, objects) {
    objects = objects || this.groundPlane;
    if (!Array.isArray(objects)) {
      objects = [objects];
    }
    this.mouse = this.picker.getCoordinates(this.container, event);
    this.picker.getRaycaster(this.mouse.x, this.mouse.y, this.camera, this.raycaster);
    const intersects = this.picker.getIntersected(this.mouse.x, this.mouse.y, this.camera,
      objects, undefined, 1, this.raycaster);
    return intersects;
  }

  onMouseDown(event) {
    if (!this.enabled || !this.selectedEditor) return true;
    this.selectedEditor.onMouseDown(event);
  }

  onMouseClick(event) {
    if (!this.enabled || !this.selectedEditor) return true;
    this.selectedEditor.onMouseClick(event);
  }

  onMouseMove(event) {
    if (!this.enabled || !this.selectedEditor) return true;
    this.selectedEditor.onMouseMove(event);
  }

  onMouseUp(event) {
    if (!this.enabled || !this.selectedEditor) return true;
    this.selectedEditor.onMouseUp(event);
  }

  onKeypress(event) {
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
  }

  finish() {
    if (this.selectedEditor) {
      this.selectedEditor.finish();
      this.selectedEditor.reset();
      this.componentEditors[DrawModes.Select].unselect();
    }
  }

  saveBoxes() {
    const annotations = [];
    const fromWorld = this.matrixWorld ? new THREE.Matrix4().copy(this.matrixWorld).invert() : null;
    for (let i = 0; i < this.objects.length; i++) {
      const bbox = Object3DUtil.computeBoundingBox(this.objects[i], fromWorld);
      const m = _.clone(this.objects[i].userData);
      if (m.min) { m.min = bbox.min.toArray(); }
      if (m.max) { m.max = bbox.max.toArray(); }
      console.log(m);
      annotations.push(m);
    }
    const fullId = this.scene.userData.fullId;
    const out = { fullId: fullId, annotations: annotations };
    FileUtil.saveJson(out, this.scene.userData.id + '.json');
  }

  getAnnotations(indexOffset) {
    // More generic saving of shapes (not yet tested)
    const annotations = [];
    const fromWorld = this.matrixWorld ? new THREE.Matrix4().copy(this.matrixWorld).invert() : null;
    indexOffset = indexOffset || 0;
    for (let i = 0; i < this.objects.length; i++) {
      const metadata = this.objects[i].userData;
      const m = _.clone(metadata);
      let transform = this.objects[i].matrixWorld;
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
  }

  setComponent(name, component) {
    const i = this.drawModes[name];
    if (i >= 0) {
      this.componentEditors[i] = component;
    } else {
      this.drawModes[name] = this.componentEditors.length;
      this.componentEditors.push(component);
    }
    this.setMode({ mode: this.mode, force: true });
  }

  getComponent(name) {
    const i = this.drawModes[name];
    return (i >= 0)? this.componentEditors[i] : null;
  }
}

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
