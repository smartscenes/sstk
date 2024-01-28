// Annotations associated with object masks
const MaskObjectAssignments = require('rlsd/MaskObjectAssignments');
class MaskAnnotations {
  constructor(params) {
    this.maskObjectAssignments = new MaskObjectAssignments(params.oneToOne, params.deleteMaskObjectCallback);
    this.maskCommentMap = new Map();
  }

  // Populate annotations from json
  populate(json, modelInstances) {
    if (json.maskObjectAssignments) {
      // console.log("Load object mask correspondences");
      this.maskObjectAssignments.populate(json.maskObjectAssignments, modelInstances);
    }
    if (json.maskComments) {
      json.maskComments.forEach(maskComment => {
        if (!this.maskCommentMap.has(maskComment.maskId)) {
          this.maskCommentMap.set(maskComment.maskId, maskComment);
        }
      });
    }
  }

  getAnnotation(mask) {
    const maskStringed = (typeof mask === 'string') ? mask : mask.toString();
    const objects = this.maskObjectAssignments.get(maskStringed);
    const commentJson = this.maskCommentMap.get(maskStringed);
    const annotation = Object.assign({}, commentJson); // shallow copy (for when comment is a object)
    delete annotation.maskId;
    annotation.objects = objects;
    return annotation;
  }

  getComment(mask) {
    if (mask) {
      const maskStringed = (typeof mask === 'string') ? mask : mask.toString();
      return this.maskCommentMap.get(maskStringed);
    }
  }

  deleteComment(mask) {
    if (mask) {
      const maskStringed = (typeof mask === 'string') ? mask : mask.toString();
      this.maskCommentMap.delete(maskStringed);
    }
  }

  setComment(mask, commentJson) {
    if (mask) {
      const maskStringed = (typeof mask === 'string')? mask : mask.toString();
      if (commentJson == null) {
        if (this.maskCommentMap.has(maskStringed)) {
          this.maskCommentMap.delete(maskStringed);
        }
      } else {
        commentJson.maskId = maskStringed;
        this.maskCommentMap.set(maskStringed, commentJson);
      }
    }
  }

  getCommentsArray() {
    const comments = [];
    this.maskCommentMap.forEach((v, k) => {
      comments.push(v);
    });
    return comments;
  }

  hasAnnotation(mask) {
    const maskStringed = (typeof mask === 'string')? mask : mask.toString();
    return this.maskObjectAssignments.has(maskStringed) || this.maskCommentMap.has(maskStringed);
  }

  hasAssignedObjects(mask) {
    const maskStringed = (typeof mask === 'string')? mask : mask.toString();
    return this.maskObjectAssignments.has(maskStringed);
  }

  hasComment(mask) {
    const maskStringed = (typeof mask === 'string')? mask : mask.toString();
    return this.maskCommentMap.has(maskStringed);
  }

  getAnnotatedCount() {
    let count = 0;
    this.maskCommentMap.forEach((v, k) => {
      if (!this.maskObjectAssignments.has(k)) {
        count++;
      }
    });
    return count + this.maskObjectAssignments.size;
  }

  getAnnotatedIds() {
    const ids = new Set();
    for (let k of this.maskObjectAssignments.keys()) {
      ids.add(parseInt(k));
    }
    for (let k of this.maskCommentMap.keys()) {
      ids.add(parseInt(k));
    }
    return ids;
  }

  findObject3DMasks(object3d) {
    return this.maskObjectAssignments.findObject3DMasks(object3d);
  }

  getStatistics() {
    const annotated = this.getAnnotatedCount();
    const hasComments = this.maskCommentMap.size;
    const hasObjectAssignments = this.maskObjectAssignments.size;
    return { annotated: annotated, hasComments: hasComments, hasObjectAssignments: hasObjectAssignments };
  }

}

module.exports = MaskAnnotations;