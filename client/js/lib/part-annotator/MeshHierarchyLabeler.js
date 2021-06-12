var MeshLabeler = require('part-annotator/MeshLabeler');

/**
 * Allows for labeling of meshes at different granularities
 * @constructor
 * @extends MeshLabeler
 */
function MeshHierarchyLabeler(params) {
  MeshLabeler.call(this, params);
  this.hierarchyLevel = 0;  // 0 is leaf node, +1 as we go up in the hierarchy
  this.maxHierarchyLevel = 0;
}

MeshHierarchyLabeler.prototype = Object.create(MeshLabeler.prototype);
MeshHierarchyLabeler.prototype.constructor = MeshHierarchyLabeler;

// Set part based on hierarchy level
MeshHierarchyLabeler.prototype.__findPart = function (event) {
  var intersected = this.getIntersected(event);
  var n = 0;
  while (n < this.hierarchyLevel && intersected.parent) {
    //console.log('findPart: ' + this.hierarchyLevel, intersected);
    if (intersected && intersected.userData.level >= this.hierarchyLevel) {
      return intersected;
    }
    intersected = intersected.parent;
    n++;
  }
  return intersected;
};

MeshHierarchyLabeler.prototype.labelPart = function (part, labelInfo, opts) {
  if (part.userData.level > 0) {
    for (var i = 0; i < part.children.length; i++) {
      var c = part.children[i];
      this.labelPart(c, labelInfo, opts);
    }
  } else {
    MeshLabeler.prototype.labelPart.call(this, part, labelInfo, opts);
  }
};

MeshHierarchyLabeler.prototype.unlabelPart = function (part, opts) {
  MeshLabeler.prototype.unlabelPart.call(this, part, opts);
  if (part.userData.level > 0) {
    for (var i = 0; i < part.children.length; i++) {
      var c = part.children[i];
      this.unlabelPart(c, opts);
    }
  }
};

MeshHierarchyLabeler.prototype.__dehighlightPart = function (part) {
  if (part.userData.level > 0) {
    for (var i = 0; i < part.children.length; i++) {
      var c = part.children[i];
      this.__dehighlightPart(c);
    }
  } else {
    MeshLabeler.prototype.__dehighlightPart.call(this, part);
  }
};

MeshHierarchyLabeler.prototype.nextLevel = function(inc) {
  this.hierarchyLevel = this.hierarchyLevel + inc;
  if (this.hierarchyLevel < 0) {
    this.hierarchyLevel = 0;
  }
  if (this.maxHierarchyLevel && this.hierarchyLevel > this.maxHierarchyLevel) {
    this.hierarchyLevel = this.maxHierarchyLevel;
  }
  this.Publish('levelUpdated', this.hierarchyLevel);
  console.log('Set hierarchyLevel to ' + this.hierarchyLevel);
};

MeshHierarchyLabeler.prototype.setTarget = function(m) {
  MeshLabeler.prototype.setTarget.call(this, m);
  // Also get and set maxHierarchyLevel
  this.hierarchyLevel = 0;
  this.maxHierarchyLevel = this.meshHierarchy.maxHierarchyLevel;
};


module.exports = MeshHierarchyLabeler;

