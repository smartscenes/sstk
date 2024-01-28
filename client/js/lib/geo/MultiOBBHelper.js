// Create semantic obbs for array of object3Ds
const Constants = require('Constants');
const MeshHelpers = require('geo/MeshHelpers');
const Object3DUtil = require('geo/Object3DUtil');
const SemanticOBB = require('geo/SemanticOBB');
const _ = require('util/util');

function __createObbMesh(sobb, userData, material, obbOptions) {
  var obb = new MeshHelpers.OBB(sobb, material);
  //console.log('createObb', sobb, obbOptions);
  if (obbOptions.useWireframe) {
    var lineWidth = obbOptions.lineWidth;
    obb = obb.toWireFrame(lineWidth, obbOptions.showNormal, null, obbOptions.showAxes, obbOptions.showOrientations);
    Object3DUtil.traverseMeshes(obb, true, function(x) { _.merge(x.userData, userData); });
  }
  obb.userData = userData;
  return obb;
}

function __createObbMeshes(name, matrix, segs, obbOptions) {
  var obbs = new THREE.Object3D();
  obbs.name = name;
  obbs.applyMatrix4(matrix);
  for (var i = 0; i < segs.length; i++) {
    if (segs[i] && segs[i].obb) {
      var sobb = segs[i].obb;
      // TODO: get color from palette
      var mat = Object3DUtil.getSimpleFalseColorMaterial(i);
      var obb = __createObbMesh(sobb, segs[i], mat, obbOptions);
      obbs.add(obb);
    } else {
      console.log('No OBB for entry ' + i);
    }
  }
  return obbs;
}

class MultiOBBHelper {
  /**
   * Create a bunch of OBBs grouped together
   * @param rootObject3D {THREE.Object3D}
   * @param components {Object[]}
   * @param obbOptions {Object}
   * @param obbFitter {function(segment, options)} Function that fits an obb to a component
   * @param [obbUserData] {Object} - User data associated with OBB group
   * @param [idField] {string} - Field that uniquely identifies a component (used in load to ensure that components are matched)
   */
  constructor(rootObject3D, components, obbOptions, obbFitter, obbUserData, idField) {
    this.rootObject3D = rootObject3D; // take transform from this rootObject3D;
    this.components = components;
    this.obbOptions = obbOptions;
    this.obbFitter = obbFitter;
    this.obbUserData = obbUserData;
    this.idField = idField;
    this.debug = false;
  }

  /**
   * Use specified obbs for components
   * @param obbs {Array<SemanticOBB|Json>} Array of semantic obbs (or something that can be converted to semantic obbs)
   * @param [options.obbMatrixIsRowMajor] {boolean} If obb is a plain JSON object, whether the basis matrix is specified in row major order
   * @param [options.autoFitObbs] {boolean} Whether to autoFit obbs if obb for segment is missing
   * @param [options.createObbMeshes] {boolean} Whether to create the obb mesh for visualization
   * @param [options.fitObbOptions] {boolean} Additional options for fitting obbs
   */
  useOBBs(obbs, options) {
    options = options || {};
    for (let i = 0; i < this.components.length; i++) {
      var comp = this.components[i];
      if (comp) {
        this.__assignObbToComponent(comp, obbs[i], options, i);
      }
    }
    if (options.createObbMeshes) {
      this.__updateObbMeshes();
    }
  }

  /**
   * Use specified obbs for components
   * @param labeledObbs {Array<Object>} Array of objects with obb field that can be converted to semantic obbs
   * @param [options.obbMatrixIsRowMajor] {boolean} If obb is a plain JSON object, whether the basis matrix is specified in row major order
   * @param [options.autoFitObbs] {boolean} Whether to autoFit obbs if obb for segment is missing
   * @param [options.createObbMeshes] {boolean} Whether to create the obb mesh for visualization
   * @param [options.fitObbOptions] {boolean} Additional options for fitting obbs
   */
  useLabeledOBBs(labeledObbs, options) {
    options = options || {};
    if (this.idField) {
      const componentsById = _.keyBy(this.components, this.idField);
      const labeledObbsById = _.keyBy(labeledObbs, this.idField);
      const componentIds = _.keys(componentsById);
      const labeledObbIds = _.keys(labeledObbsById);
      const unmatchedComponents = _.difference(componentIds, labeledObbIds);
      const unmatchedLabeledObbs = _.difference(labeledObbIds, componentIds);
      const matchedIds = _.intersection(componentIds, labeledObbIds);
      for (let id of matchedIds) {
        const comp = componentsById[id];
        const labeledObb = labeledObbsById[id];
        if (labeledObb && labeledObb.obb) {
          this.__assignObbToComponent(comp, labeledObb.obb, options, id);
        } else {
          console.warn('Missing obb for component', comp);
        }
      }
      if (this.debug) {
        console.log('Matched ' + matchedIds.length + ' obbs with components');
      }
      if (unmatchedComponents.length || unmatchedLabeledObbs.length) {
        console.warn('Unmatched components and labeled obbs', unmatchedComponents, unmatchedLabeledObbs);
      }
    } else {
      for (let i = 0; i < this.components.length; i++) {
        const comp = this.components[i];
        if (comp) {
          if (labeledObbs[i].obb) {
            this.__assignObbToComponent(comp, labeledObbs[i].obb, options, i);
          } else {
            console.warn('Missing obb for component', comp);
          }
        }
      }
    }
    if (options.createObbMeshes) {
      this.__updateObbMeshes();
    }
  }

  __assignObbToComponent(component, obb, options, id) {
    // TODO: obbMatrixIsRowMajor option is currently ignored
    //       is this still used anywhere?  if so - support, otherwise, remove support
    // console.log('assign obb to component', component, obb, id);
    if (obb) {
      // TODO: options.obbMatrixIsRowMajor is ignored
      obb = SemanticOBB.asSemanticOBB(obb, options.obbMatrixIsRowMajor);
    } else if (options.autoFitObbs) {
      obb = this.obbFitter(component, options.fitObbOptions);
    } else {
      console.log('No OBB for entry ' + id);
    }
    component.obb = obb;
  }

  ensureOBBs(options) {
    const obbs = this.components.map(x => x.obb);
    this.useOBBs(obbs, options);
  }

 __updateObbsObject3D(obbsObject3D) {
    if (this.obbsObject3D) {
      const oldObject3D = this.obbsObject3D;
      obbsObject3D.visible = this.obbsObject3D.visible;
      if (oldObject3D.parent) {
        oldObject3D.parent.add(obbsObject3D);
        oldObject3D.parent.remove(oldObject3D);
        Object3DUtil.dispose(oldObject3D);
      }
    }
    this.obbsObject3D = obbsObject3D;
  }

  __updateObbMeshes() {
    const obbsName = this.rootObject3D.name + '-obbs';
    const matrix = Object3DUtil.getModelMatrixWorld(this.rootObject3D);
    const obbsObject3D = __createObbMeshes(obbsName, matrix, this.components, this.obbOptions);
    if (this.obbUserData) {
      obbsObject3D.userData = this.obbUserData;
    }
    this.__updateObbsObject3D(obbsObject3D);
  }

  updateOBB(componentIndex, obb) {
    const seg = this.components[componentIndex];
    if (seg && seg.obb !== obb) {
      if (seg.obb && seg.obb.hasFront) {
        obb.front = seg.obb.front;
      }
      if (seg.obb && seg.obb.hasUp) {
        obb.up = seg.obb.up;
      }
      seg.obb = obb;
    }
    if (this.obbsObject3D) {
      const iMatch = Object3DUtil.findChildIndex(this.obbsObject3D, function(c) { return c.userData.index === componentIndex; });
      if (iMatch >= 0) {
        const node = this.obbsObject3D.children[iMatch];
        const mesh = Object3DUtil.findNode(node, function(c) { return c.isMesh && c.userData.isOBB; });
        const mat = mesh.material;
        const isHighlighted = mesh.isHighlighted;
        const newMesh = __createObbMesh(obb, seg, mat, this.obbOptions);
        if (isHighlighted) {
          Object3DUtil.traverseMeshes(obb, true, function(x) { x.isHighlighted = true; });
        }
        Object3DUtil.replaceChild(this.obbsObject3D.children[iMatch], newMesh, iMatch, true);
      }
    }
  }

  refitOBB(componentIndex, fitObbOptions) {
    const seg = this.components[componentIndex];
    if (seg) {
      const obb = this.obbFitter(seg, fitObbOptions);
      this.updateOBB(componentIndex, obb);
      return obb;
    }
  }

  getOBB(index) {
    const seg = this.components[index];
    if (seg) {
      return seg.obb;
    }
  }

  getOBBs() {
    return this.components.map(x => x.obb);
  }

  getLocalToWorldTransform() {
    // TODO: pass in via constructor
    return Object3DUtil.getModelMatrixWorld(this.rootObject3D);
  }

  getWorldToLocalTransform() {
    // TODO: pass in via constructor
    return Object3DUtil.getModelMatrixWorldInverse(this.rootObject3D);
  }

  worldToLocalDir(vector, out) {
    const t = this.getWorldToLocalTransform();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    t.decompose(p, q, s);
    out = out || new THREE.Vector3();
    out.copy(vector);
    out.applyQuaternion(q);
    return out;
  }

  getDefaultUpLocal() {
    if (!this.__defaultUpDirLocal) {
      this.__defaultUpDirLocal = this.worldToLocalDir(Constants.worldUp);
    }
    return this.__defaultUpDirLocal;
  }

  getDefaultFrontLocal() {
    if (!this.__defaultFrontDirLocal) {
      this.__defaultFrontDirLocal = this.worldToLocalDir(Constants.worldFront);
    }
    return this.__defaultFrontDirLocal;
  }
}

module.exports = MultiOBBHelper;