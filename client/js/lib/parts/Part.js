const OBB = require('geo/OBB');

class Part {
  /**
   * Defines a part
   * @param pid {int} Part id
   * @param name {string} Part name
   * @param label {string} Part label
   * @param obb {geo.OBB} Part obb
   * @param object3D {THREE.Object3D} Part geometry
   */
  constructor(pid, label, name, obb, object3D) {
    this.pid = pid;
    this.label = label;
    this.name = name;
    this.obb = obb;
    this.object3D = object3D;

    this.parent = null;
    this.children = [];
  }

  get text() {
    return this.label;
  }

  set text(v) {
    this.label = v;
  }

  clone() {
    // Fine, as long as we never intend to modify the underlying part geometry...
    // (We can modify transforms, though)
    let clonedObject3D = null;
    if (this.object3D) {
      const oldChildren = this.object3D.children;
      const basicChildren = this.object3D.children.filter(c => c.userData.pid == null);
      this.object3D.children = basicChildren;
      clonedObject3D = this.object3D.clone();
      this.object3D.children = oldChildren;
    }
    return new Part(this.pid, this.label, this.name,
      this.obb? this.obb.clone() : null,
      clonedObject3D);
  }

  toJson() {
    return {
      pid: this.pid,
      label: this.label,
      name: this.name,
      obb: this.obb? this.obb.toJSON() : undefined,
      // skip object3D
      // Some extra information that we added for merged parts
      baseIds: this.baseIds && this.baseIds.length? this.baseIds : undefined,
      parentId: this.parentIds && this.parentIds.length? this.parentIds : undefined,
      childIds: this.childIds && this.childIds.length? this.childIds : undefined,
      sourceParts: this.sourceParts? this.sourceParts.map( p => p.toJson() ) : undefined
    };
  }

  fromJson(json) {
    // NOTE: this does not populate the object3D field
    this.pid = json.pid;
    this.label = json.label;
    this.name = json.name;
    if (json.obb) {
      this.obb = new OBB();
      this.obb.fromJSON(json.obb);
    } else {
      this.obb = null;
    }
    this.object3D = null;

    this.parent = json.parent;
    this.children = json.children || [];
  }

  static fromJson(json) {
    let part = new Part();
    part.fromJson(json);
    return part;
  }
}

module.exports = Part;