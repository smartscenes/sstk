const Constants = require('Constants');
const Object3DUtil = require('geo/Object3DUtil');
const MeshHelpers = require('geo/MeshHelpers');
const BBox = require('geo/BBox');
const OBB = require('geo/OBB');
const _ = require('util/util');

class ExpandedBBox {
  constructor(boxGap) {
    this.boxGap = boxGap;
    this.bbox = new BBox();
    this.expandedBox = this.bbox.expandBy(this.boxGap);
  }

  includePoint(pt) {
    this.bbox.includePoint(pt);
    this.bbox.expandBy(this.boxGap, this.expandedBox);
  }

  includeBBox(bbox) {
    this.bbox.includeBBox(bbox);
    this.bbox.expandBy(this.boxGap, this.expandedBox);
  }

  containsPoint(pt) {
    if (this.bbox.contains(pt)) {
      return ExpandedBBox.CONTAINS_INTERNAL;
    } else if (this.expandedBox.contains(pt)) {
      return ExpandedBBox.CONTAINS_EXPANDED;
    }
  }

  intersectsExpanded(bbox) {
    return this.expandedBox.intersects(bbox.expandedBox);
  }
}

ExpandedBBox.CONTAINS_INTERNAL = 1;
ExpandedBBox.CONTAINS_EXPANDED = 2;

// Information about how attachment of an object
// Three coordinate frames
//  world
//  parent local
//  child local (base / canonical)
class ObjectAttachment {
  constructor(object3D) {
    this.object3D = object3D;  // This should be the modelInstance.object3D
    this.modelInstance = Object3DUtil.getModelInstance(object3D);
    this.attachments = null;
  }

  getAttachmentIndex() {
    const object = this.object3D;
    const u = object.userData;
    let childAttachmentIndex = u['attachmentIndex'];
    if (childAttachmentIndex == undefined) {
      // TODO: Try to guess attachment index
      childAttachmentIndex = (object.userData.defaultAttachment && object.userData.defaultAttachment.childBBFaceIndex != null)?
        object.userData.defaultAttachment.childBBFaceIndex : Constants.BBoxFaceCenters.BOTTOM;
    }
    return childAttachmentIndex;
  }

  baseNormToParentLocalNorm(baseNorm) {
    const localNorm = baseNorm.clone();
    localNorm.applyQuaternion(this.object3D.quaternion);
    return localNorm;
  }

  parentLocalNormToBaseNorm(localNorm) {
    const localToBaseQuaternion = new THREE.Quaternion();
    localToBaseQuaternion.copy(this.object3D.quaternion);
    localToBaseQuaternion.invert();
    const baseNorm = localNorm.clone();
    baseNorm.applyQuaternion(localToBaseQuaternion);
    return baseNorm;
  }

  baseNormToWorldNorm(baseNorm) {
    const baseToWorldQuaternion = new THREE.Quaternion();
    this.object3D.getWorldQuaternion(baseToWorldQuaternion);
    const worldNorm = baseNorm.clone();
    worldNorm.applyQuaternion(baseToWorldQuaternion);
    return worldNorm;
  }

  worldNormToBaseNorm(worldNorm) {
    const worldToBaseQuaternion = new THREE.Quaternion();
    this.object3D.getWorldQuaternion(worldToBaseQuaternion);
    worldToBaseQuaternion.invert();
    const baseNorm = worldNorm.clone();
    baseNorm.applyQuaternion(worldToBaseQuaternion);
    return baseNorm;
  }

  parentLocalNormToWorldNorm(localNorm) {
    if (this.object3D.parent) {
      const localToWorldQuaternion = new THREE.Quaternion();
      this.object3D.parent.getWorldQuaternion(localToWorldQuaternion);
      const worldNorm = localNorm.clone();
      worldNorm.applyQuaternion(localToWorldQuaternion);
      return worldNorm;
    } else {
      return localNorm;
    }
  }

  worldNormToParentLocalNorm(worldNorm) {
    if (this.object3D.parent) {
      const worldToLocalQuaternion = new THREE.Quaternion();
      this.object3D.parent.getWorldQuaternion(worldToLocalQuaternion);
      worldToLocalQuaternion.invert();
      const localNorm = worldNorm.clone();
      localNorm.applyQuaternion(worldToLocalQuaternion);
      return localNorm;
    } else {
      return worldNorm;
    }
  }

  childAttachmentIndexToBaseInNorm(childAttachmentIndex) {
    if (childAttachmentIndex >= 0 && childAttachmentIndex < 6) {
      const inNorm = Object3DUtil.InNormals[childAttachmentIndex];
      return inNorm;
    } else {
      // TODO: Figure out what to do here
      const attachments = this.attachments;
      const attachment = attachments? attachments[childAttachmentIndex] : null;
      return null;
    }
  }

  childAttachmentIndexToWorldBBFaceIndex(childAttachmentIndex) {
    if (childAttachmentIndex >= 0 && childAttachmentIndex < 6) {
      const baseInNorm = Object3DUtil.InNormals[childAttachmentIndex];
      //const localInNorm = this.baseNormToLocalNorm(baseInNorm);
      const worldNorm = this.baseNormToWorldNorm(baseInNorm);
      const bbFaceIndexWorld = Object3DUtil.findClosestBBFaceByInNormal(worldNorm);
      return bbFaceIndexWorld;
    } else {
      // TODO: Figure out what to do here
      return Constants.BBoxFaceCenters.BOTTOM;
    }
  }

  getAttachmentInfoFromWorldSurfaceInNormal(worldSurfaceNorm) {
    // TODO: take child and identify appropriate object semantic frame (local coordinates)
    const baseInNorm = this.worldNormToBaseNorm(worldSurfaceNorm);
    const bbFaceIndexBase = Object3DUtil.findClosestBBFaceByInNormal(baseInNorm);
    const bbFaceIndexWorld = Object3DUtil.findClosestBBFaceByInNormal(worldSurfaceNorm);
    return { bbFaceIndexBase: bbFaceIndexBase, bbFaceIndexWorld: bbFaceIndexWorld,
      baseInNorm: baseInNorm, worldInNorm: worldSurfaceNorm };
  }

  updateAttachment(attachments, childAttachmentIndex, childWorldBBFaceIndex) {
    var modelInstance = this.modelInstance;
    var u = modelInstance.object3D.userData;
    if (!u['attachmentPoint'] || (u['attachmentIndex'] !== childAttachmentIndex) ||
      (u['childWorldBBFaceIndex'] !== childWorldBBFaceIndex)) {
      // update attachments?
      //this.placementInfo.attachments = modelInstance.getCandidateAttachmentPoints();
      var attachment = attachments[childAttachmentIndex];
      var p = attachment.local.pos;
      console.log('set attachmentIndex', u['attachmentIndex'], childAttachmentIndex);
      if (u['attachmentIndex'] !== childAttachmentIndex) {
        modelInstance.setAttachmentPoint({position: p, coordFrame: attachment.frame});
      }
      // Old logic
      //var p = Object3DUtil.FaceCenters01[childAttachmentIndex];
      //modelInstance.setAttachmentPoint({position: p, coordFrame: 'worldBB', useModelContactPoint: this.useModelContactPoint});
      u['attachmentPoint'] = p;
      u['attachmentIndex'] = childAttachmentIndex;
      u['childWorldBBFaceIndex'] = childWorldBBFaceIndex;
      u['attachmentWorldPos'] = attachment.world.pos;
      u['attachmentWorldOut'] = attachment.world.out;
      u['attachmentBaseIn'] = Object3DUtil.InNormals[childAttachmentIndex];
      u['attachmentBaseDir2'] = Object3DUtil.InNormals[(childAttachmentIndex + 2) % 6];
      return attachment;
    }
  }

  identifyWorldBoundingBoxAttachments() {
    var origBBox = Object3DUtil.getBoundingBox(this.object3D);
    var bbfaceCenters = origBBox.getFaceCenters();
    var attachmentPoints = [];
    for (var i = 0; i < bbfaceCenters.length; i++) {
      var p = Object3DUtil.FaceCenters01[i];
      attachmentPoints.push({
        type: 'bbface',
        frame: 'worldBB',
        bbfaceIndex: i,
        local: {pos: p, out: Object3DUtil.OutNormals[i]},
        world: {pos: bbfaceCenters[i], out: Object3DUtil.OutNormals[i]},
        index: i
      });
    }
    return attachmentPoints;
  }

  getBoundingBoxes(points, clusterDistThreshold) {
    if (points.length) {
      let bboxes = [];
      for (let i = 0; i < points.length; i++) {
        // Try to cluster points into little boxes
        const pt = points[i];
        let foundIndex = -1;
        let mergeNeeded = false;
        for (let j = 0; j < bboxes.length; j++) {
          const bbox = bboxes[j];
          const contains = bbox.containsPoint(pt);
          if (contains) {
            bbox.includePoint(pt);
            mergeNeeded = (contains === ExpandedBBox.CONTAINS_EXPANDED);
            foundIndex = j;
            break;
          }
        }
        if (foundIndex >= 0) {
          const targetBBox = bboxes[foundIndex];
          while (mergeNeeded) {
            // need to merge boxes
            const toRemove = [];
            for (let j = 0; j < bboxes.length; j++) {
              const bbox = bboxes[j];
              if (bbox !== targetBBox) {
                if (targetBBox.intersectsExpanded(bbox)) {
                  targetBBox.includeBBox(bbox.bbox);
                  toRemove.push(j);
                }
              }
            }
            mergeNeeded = toRemove.length > 0;
            if (toRemove.length) {
              bboxes = bboxes.filter((box,index) => toRemove.indexOf(index) < 0);
            }
          }
        } else {
          // create a new box
          const bbox = new ExpandedBBox(clusterDistThreshold);
          bbox.includePoint(pt);
          bboxes.push(bbox);
        }
      }
      return bboxes;
    }
  }

  identifyAttachmentOnSideBySampling(attachmentSide, opts) {
    opts = _.defaults(Object.create(null), opts || {}, {
      nsamples: 10000,
      clusterDistThreshold: 0.01*Constants.metersToVirtualUnit,
      //useRelativeThreshold: false,
      transform: null
    });
    const origBBox = Object3DUtil.getBoundingBox(this.object3D);
    // Find bounding box for that side
    const dim = origBBox.getFaceNormalDims()[attachmentSide];
    const faceBBox = origBBox.getFaceBBox(attachmentSide, dim*0.01);
    const clusterDistThreshold = opts.clusterDistThreshold;
    if (faceBBox) {
      // console.log('got dim', dim, faceBBox, origBBox);
      const bboxMesh = new MeshHelpers.BoxMinMax(faceBBox.min, faceBBox.max, 'white');
      const intersected = Object3DUtil.getIntersectingPoints(this.object3D, bboxMesh, dim*0.01, opts.nsamples, true);
      if (intersected.length) {
        const attachmentBBox = new BBox();
        attachmentBBox.includePoints(intersected);
        const grouped = (clusterDistThreshold > 0)? this.getBoundingBoxes(intersected, clusterDistThreshold) : [];
        // to obbs
        const attachmentObb = OBB.fromAABB(attachmentBBox, opts.transform);
        grouped.forEach(expanded => expanded.obb = OBB.fromAABB(expanded.bbox, opts.transform));
        return { points: intersected, obb: attachmentObb, components: grouped.map(expanded => expanded.obb) };
      }
    }
  }
}

module.exports = ObjectAttachment;