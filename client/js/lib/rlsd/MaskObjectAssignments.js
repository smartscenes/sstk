const MaskAddress = require('rlsd/MaskAddress');

class MaskObjectPair {
  constructor(maskAddress, object3d) {
    this.maskAddress = maskAddress;
    this.object3d = object3d;
  }

  equals(other) {
    return this.maskAddress == other.maskAddress && this.object3d == other.object3d;
  }
}

class MaskObjectAssignments {
  constructor(isOneToOne, deleteCallback) {
    this.maskObjectAssignments = new Map();
    this.isOneToOne = isOneToOne; // Should masks be one to one?
    this.deleteCallback = deleteCallback;
  }

  isObjectMaskAssigned(maskAddress, object3d) {
    if (!this.maskObjectAssignments.has(maskAddress.toString())) {
      return false;
    }
    const candidates = this.maskObjectAssignments.get(maskAddress.toString());
    for (let candidate of candidates) {
      if (candidate.object3d === object3d) {
        return true;
      }
    }
    return false;
  }

  findObject3DMasks(object3d) {
    const foundMatches = [];
    this.maskObjectAssignments.forEach((maskObjectPairs,k) => {
      maskObjectPairs.forEach((v) => {
        if (v.object3d === object3d) {
          // console.log("Found match: " + k);
          // foundMatch = MaskAddresss.parse(k);
          foundMatches.push(v.maskAddress);
        }
      });
    });
    return foundMatches;
  }

  findByMaskId(maskId) {
    const foundMatches = [];
    this.maskObjectAssignments.forEach((maskObjectPairs,k) => {
      maskObjectPairs.forEach((v) => {
        if (v.maskAddress.maskId === maskId) {
          // console.log("Found match: " + k);
          // foundMatch = MaskAddresss.parse(k);
          foundMatches.push(v.maskAddress);
        }
      });
    });
    return foundMatches;
  }

  lookupPhotoIdsForMaskId(maskId) {
    const matches = this.findByMaskId(maskId);
    const photoIdsSet = new Set();
    for (let maskAddress of matches) {
      photoIdsSet.add(maskAddress.photoId);
    }
    const photoIds = Array.from(photoIdsSet);
    if (photoIds.length === 0) {
      console.warn('Cannot find photo id for mask id', maskId);
    } else if (photoIds.length > 1) {
      console.warn('Multiple photos for mask id', photoIds, maskId);
    }
    return photoIds;
  }

  getAssignmentsArray(validObject3DInstancesMap) {
    const assignments = [];
    const invalidMaskObjectPairs = [];
    this.maskObjectAssignments.forEach((maskObjectPairs, k) => {
      maskObjectPairs.forEach((maskObjectPair)=>{
        if (validObject3DInstancesMap.has(maskObjectPair.object3d.userData.id)) {
          const rec = {
            photoId: maskObjectPair.maskAddress.photoId,
            maskId: maskObjectPair.maskAddress.maskId,
            clickPoint: maskObjectPair.maskAddress.clickPoint,
            objectInstanceId: maskObjectPair.object3d.userData.id
          };
          assignments.push(rec);
        } else {
          invalidMaskObjectPairs.push(maskObjectPair);
        }
      });
    });
    if (invalidMaskObjectPairs.length > 0) {
      console.error('Got ' + invalidMaskObjectPairs.length + ' invalid mask object pairs (unknown 3d object)', invalidMaskObjectPairs);
    }
    return assignments;
  }

  populate(assignments, modelInstances) {
    assignments.forEach((maskObjectAssignment) => {
      let object = modelInstances.filter((v) => v.object3D.userData.id == maskObjectAssignment.objectInstanceId);
      console.assert(object.length === 1);
      object = object[0].object3D;

      const maskAddress = new MaskAddress(maskObjectAssignment.photoId, maskObjectAssignment.maskId, maskObjectAssignment.clickPoint);
      const maskStringed = maskAddress.toString();
      if (!this.maskObjectAssignments.has(maskStringed)) {
        this.maskObjectAssignments.set(maskStringed, []);
      }
      this.maskObjectAssignments.get(maskStringed).push(new MaskObjectPair(maskAddress, object));
    });

  }

  /**
   * Assigns an object to given mask
   * @param {MaskAddress} selectedMask
   * @param {Object3D} object
   */
  assignObjectToMask(selectedMask, object) {
    const maskStringed = selectedMask.toString();
    console.log("Assign " + maskStringed + " to " + object.userData.id);
    if (this.isOneToOne && this.maskObjectAssignments.has(maskStringed)) {
      console.error("An object already assigned to the mask.");
      return;
    }
    if (!this.maskObjectAssignments.has(maskStringed)) {
      this.maskObjectAssignments.set(maskStringed, []);
    }
    this.maskObjectAssignments.get(maskStringed).push(new MaskObjectPair(selectedMask, object));
    // console.log(this.maskObjectAssignments);
  }

  /**
   * Clear and remove the object assigned to mask. Recursively clears mask assignment to child objects as well.
   * @param {MaskAddress} selectedMask
   */
  clearMaskAssignment(selectedMask) {
    const maskStringed = selectedMask.toString();
    if (this.maskObjectAssignments.has(maskStringed)) {
      const assignedMaskObjectPairs = this.maskObjectAssignments.get(maskStringed);

      this.maskObjectAssignments.delete(maskStringed);

      assignedMaskObjectPairs.forEach((assignedMaskObjectPair) => {
        const assignedObject3D = assignedMaskObjectPair.object3d;
        if (this.findObject3DMasks(assignedObject3D).length === 0) {
          // Delete the object since its not assigned to any other masks.

          this.deleteCallback(assignedMaskObjectPair); // Delete object after removing mask assignment. This avoids feedback loop.
          // console.log("Removed previously assigned object " + assignedObject3D.userData.id + " to " + selectedMask.toString());
          // console.log(assignedObject3D);
          // Get rid of mask assignements of children, since the parent gets removed.
          assignedObject3D.children.forEach((v) => {
            const childrenAddresses = this.findObject3DMasks(v);
            childrenAddresses.forEach((childAddress) => {
              this.removeAssignment(childAddress, v);
            });
          });
        }
      });

      return true;
    }
    return false;
  }

  removeAssignmentsForObject3D(object3d) {
    const maskAddresses = this.findObject3DMasks(object3d);
    maskAddresses.forEach((maskAddress) => {
      this.removeAssignment(maskAddress, object3d); // Last removal of this should clear mask assignments of children.
      console.log({"Unlined":{"object3d": object3d, maskAddress:maskAddress}});
    });
  }

  removeAssignment(maskAddress, targetObject3D) {
    const maskStringed = maskAddress.toString();
    let removed = false;
    if (this.maskObjectAssignments.has(maskStringed)) {
      const assignedMaskObjectPairs = this.maskObjectAssignments.get(maskStringed);
      for (var i = 0; i < assignedMaskObjectPairs.length; i++) {
        const assignedMaskObjectPair = assignedMaskObjectPairs[i];
        const assignedObject3D = assignedMaskObjectPair.object3d;
        if (assignedObject3D != targetObject3D) {
          // Skip rest since no match
          continue;
        }

        // Remove assignment
        assignedMaskObjectPairs.splice(i, 1);
        removed = true;
        if (this.findObject3DMasks(assignedObject3D).length === 0) {
          // Delete the object since its not assigned to any other masks.
          this.deleteCallback(assignedMaskObjectPair);
          //scope.deleteObjectIn3DView(assignedObject3D); // Delete object after removing mask assignment. This avoids feedback loop.

          // Get rid of mask assignments of children, since the parent gets removed.
          assignedObject3D.children.forEach((v) => {
            const childrenAddresses = this.findObject3DMasks(v);
            childrenAddresses.forEach((childAddress) => {
              this.removeAssignment(childAddress, v);
            });
          });
        }
        break;
      }
      // Remove from dictionary if list becomes empty
      if (assignedMaskObjectPairs.length === 0) {
        this.maskObjectAssignments.delete(maskStringed);
      }
    }
    return removed;
  }

  keys() {
    return this.maskObjectAssignments.keys();
  }

  has(mask) {
    if (typeof mask === 'string') {
      return this.maskObjectAssignments.has(mask);
    } else {
      return this.maskObjectAssignments.has(mask.toString());
    }
  }

  get(mask) {
    if (typeof mask === 'string') {
      return this.maskObjectAssignments.get(mask);
    } else {
      return this.maskObjectAssignments.get(mask.toString());
    }
  }

  get size() {
    return this.maskObjectAssignments.size;
  }

}

module.exports = MaskObjectAssignments;