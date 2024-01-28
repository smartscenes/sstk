const _ = require('util/util');

// Utilities for adding/removing added geometries to a part
class PartGeoms {
  static initGeoms(part, geoms = []) {
    part.initialPart = {
      obb: part.obb,
      obbWorld: part.obbWorld,
      object3D: part.object3D
    };
    const initObject3D = part.initialPart.object3D;
    part.geoms = geoms;
    // TODO: these obb/obbWorld can potentially be updated to be the updated obb/obbWorld for all parts
    part.obb = part.obb.clone();
    if (part.obbWorld) {
      part.obbWorld = part.obbWorld.clone();
    }
    part.object3D = new THREE.Group();
    part.enhancedObject3D = part.object3D;  // Enhanced object3D with additional geometry
    part.object3D.name = initObject3D.name;
    _.defaults(part.object3D.userData, initObject3D.userData);
    PartGeoms.setObject3DAsInitialPart(initObject3D, true);
    const parent = initObject3D.parent;
    parent.add(part.object3D);
    part.object3D.add(initObject3D);
  }

  static setObject3DAsInitialPart(object3D, flag) {
    // userData.pid used elsewhere in code to identify that this object3d is a part...
    if (flag) {
      object3D.userData.type = 'PartInit';
      object3D.userData.belongToPart = object3D.userData.pid;
      delete object3D.userData.pid;
    } else {
      object3D.userData.type = 'Part';
      if (object3D.userData.pid == null) {
        object3D.userData.pid = object3D.userData.belongToPart;
      }
    }
  }

  static addGeom(root, part, geomSpec, geomObject3D) {
    if (!part.initialPart) {
      PartGeoms.initGeoms(part, part.geoms);
    }
    const geom = { spec: geomSpec, object3D: geomObject3D };
    part.geoms.push(geom);
    part.object3D.add(geomObject3D);
    return geom;
  }

  static restoreOriginal(part) {
    if (part.initialPart) {
      const parent = part.object3D.parent;
      parent.remove(part.object3D);
      parent.add(part.initialPart.object3D);
      part.object3D = part.initialPart.object3D;
      PartGeoms.setObject3DAsInitialPart(part.initialPart.object3D, false);
    }
  }

  static restoreEnhanced(part) {
    if (part.initialPart) {
      const parent = part.object3D.parent;
      parent.remove(part.initialPart.object3D);
      parent.add(part.enhancedObject3D);
      part.enhancedObject3D.add(part.initialPart.object3D);
      part.object3D = part.enhancedObject3D;
      PartGeoms.setObject3DAsInitialPart(part.initialPart.object3D, true);
    }
  }

  static replaceGeom(root, part, index, geomSpec, geomObject3D) {
    if (!part.initialPart) {
      PartGeoms.initGeoms(part, part.geoms);
    }
    const geom = part.geoms[index];
    if (geom.object3D) {
      part.object3D.remove(geom.object3D);
    }
    geom.spec = geomSpec;
    geom.object3D = geomObject3D;
    part.object3D.add(geomObject3D);
    return geom;
  }

  static removeGeom(part, geomOrIndex) {
    if (part.geoms) {
      const index = (typeof (geomOrIndex) === 'number') ? geomOrIndex : part.geoms.indexOf(geomOrIndex);
      if (index >= 0) {
        const geom = part.geoms[index];
        part.geoms.splice(index, 1);
        part.object3D.remove(geom.object3D);
        return geom;
      }
    }
  }

  static getGeom(part, index) {
    return part.geoms? null : part.geoms[index];
  }
}

module.exports = PartGeoms;
