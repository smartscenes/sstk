class ObjectInfo {
  constructor(id, label, properties) {
    this.id = id;
    this.label = label;
    if (properties) {
      Object.assign(this, properties);
    }
  }

  get maxLinked() {
    return this.isCustom? 1 : Infinity;
  }

  toString() {
    return this.id + ' : ' + this.label;
  }
}

// Allocate ids for point instances that don't have masks
let __nextPointInstId = 10001;

/**
 * ObjectInfoStore keeps information about objects that should be annotated.
 */
class ObjectInfoStore {
  constructor(config, objectsInfoJson, restrictLabels) {
    const idField = 'id';
    const labelField = config.label_field;
    // set of allowed labels (set showAllLabels to allow all labels)
    const allowedLabels = restrictLabels? config.allowed_object_labels : null;
    this.config = config;
    this.idObjectInfoMap = new Map();
    this.parent = null;

    if (objectsInfoJson.length === 0) {
      return;
    }
    if (objectsInfoJson[0] instanceof ObjectInfo) {
      // Copy constructor
      objectsInfoJson.forEach(objectInfo => {
        this.idObjectInfoMap.set(objectInfo.id, objectInfo);
      });
    } else {
      // Constructor to parse json
      objectsInfoJson.forEach(objectInfoJson => {
        // NOTE(AXC): we are dropping a lot of information here
        const objInfo = new ObjectInfo(objectInfoJson[idField], objectInfoJson[labelField]);
        this.idObjectInfoMap.set(objInfo.id, objInfo);
      });
    }

    if (allowedLabels) {
      console.log('Allowed labels', allowedLabels);
      // Filter allowed labels
      this.idObjectInfoMap.forEach((v, k) => {
        if (!allowedLabels.includes(v.label)) {
          this.idObjectInfoMap.delete(k);
        }
      });
    }
  }

  filterMasks(maskQualifiers) {
    const passedObjectInfos = [];
    if (maskQualifiers == null) {
      // Special case: No masks provided. Use all masks.
      console.log('No viewpoint mask assignments given');
      this.idObjectInfoMap.forEach((v, k) => {
        passedObjectInfos.push(v);
      });
    } else if (typeof(maskQualifiers) === 'function') {
      console.log('Filtering masks by function');
      this.idObjectInfoMap.forEach((v, k) => {
        if (maskQualifiers(v,k)) {
          passedObjectInfos.push(v);
        }
      });
    } else {
      console.log('Filtering masks by ids');
      const allowedMasks = maskQualifiers;
      this.idObjectInfoMap.forEach((v, k) => {
        if (allowedMasks.has(k)) {
          passedObjectInfos.push(v);
        }
      });
    }
    const filtered = new ObjectInfoStore(this.config, passedObjectInfos, false);
    filtered.parent = this;
    return filtered;
  }

  /**
   * Return the total number of objects to be annotated.
   */
  get size() {
    return this.idObjectInfoMap.size;
  }

  /**
   * Check whether info is available for a mask id.
   * @param {int} maskId
   */
  has(maskId) {
    return this.idObjectInfoMap.has(maskId);
  }

  get(maskId) {
    return this.idObjectInfoMap.get(maskId);
  }

  getMaskLabel(maskId) {
    const maskInfo = this.idObjectInfoMap.get(maskId);
    return maskInfo? maskInfo.label : null;
  }

  keys() {
    return this.idObjectInfoMap.keys();
  }

 values() {
    return this.idObjectInfoMap.values();
  }

  updateObjectInfos(instanceIdToInfo) {
    instanceIdToInfo.forEach((properties, id) => {
      const objectInfo = this.idObjectInfoMap.get(id);
      if (objectInfo) {
        Object.assign(objectInfo, properties);
      }
    });
  }

  // Extension of existing object ids (with masks) to new clicked instances
  __getNextId() {
    const id = __nextPointInstId;
    __nextPointInstId++;
    return id;
  }

  setObjectInfo(id, info) {
    if (!(info instanceof ObjectInfo)) {
      info = new ObjectInfo(id, info.label, info);
    }
    if (__nextPointInstId <= id) {
      __nextPointInstId = id + 1;
    }
    this.idObjectInfoMap.set(id, info);
    if (this.parent) {
      this.parent.setObjectInfo(id, info);
    }
  }

  deleteObjectInfo(id) {
    this.idObjectInfoMap.delete(id);
    if (this.parent) {
      this.parent.deleteObjectInfo(id);
    }
  }

  clearCustomObjectInfos() {
    const customInstances = this.getCustomInstances();
    for (let info of customInstances) {
      this.idObjectInfoMap.delete(info.id);
    }
    if (this.parent) {
      this.parent.clearCustomObjectInfos();
    }
  }

  addPointInstance(photoId, label, pointNormalized, point3d) {
    const objectInfo = new ObjectInfo(this.__getNextId(), label, {
      type: 'point',
      isCustom: true,
      photoId: photoId,
      point3d: point3d,
      pointNormalized: pointNormalized
    });
    this.setObjectInfo(objectInfo.id, objectInfo);
    return objectInfo;
  }

  removePointInstance(id) {
    const maskInfo = this.idObjectInfoMap.get(id);
    if (maskInfo && maskInfo.isCustom) {
      // can be removed
      this.deleteObjectInfo(id);
      return maskInfo;
    } else if (maskInfo) {
      console.warn('Attempting to remove non-point instance', maskInfo);
    }
  }

  getCustomInstances() {
    return [...this.idObjectInfoMap.values()].filter(v => v.isCustom);
  }

  getPointInstances() {
    return [...this.idObjectInfoMap.values()].filter(v => v.type === 'point');
  }

}

module.exports = ObjectInfoStore;