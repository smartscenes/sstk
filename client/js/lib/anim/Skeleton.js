var _ = require('util/util');
var Object3DUtil = require('geo/Object3DUtil');

/**
 * Skeleton
 * @param json
 * @constructor
 * @memberOf anim
 */
function Skeleton(json) {
  // String rootJoint;
  // List<Joint> joints;
  // List<Bone> bones;
  // List<JointGroup> jointGroups;
  // THREE.Vector3 up;
  // THREE.Vector3 front;
  // THREE.Vector3 boneDir;
  // THREE.Vector3 boneNormalDir

  // transient Map<String, JointGroup> jointGroupsByName;
  // transient Map<String, Joint> jointsByName;
  // transient Map<String, Bone> bonesByName;
  // transient Map<String, List<Bone>> bonesForSourceJoint;
  _.merge(this, json);
  this.rootJoint = json.rootJoint;
  this.joints = _.map(json.joints, function(x) { return new Joint(x); });
  this.bones = _.map(json.bones, function(x) { return new Bone(x); });
  this.jointGroups = _.map(json.jointGroups, function(x) { return new JointGroup(x); });
  this.up = Object3DUtil.toVector3(json.up);
  this.front = Object3DUtil.toVector3(json.front);
  this.boneDir = Object3DUtil.toVector3(json.up);
  this.boneNormalDir = Object3DUtil.toVector3(json.boneNormalDir);
  this.__update();
}

function JointGroup(json) {
  // int id;
  // String name;
  // Double[] color;
  // Double size;
  _.merge(this, json);
}

Skeleton.JointGroup = JointGroup;

function Joint(json) {
  // int id;
  // String name;
  // String jointGroup;
  // Joint parentJoint;
  _.merge(this, json);
  this.parentJoint = null;
}

Skeleton.Joint = Joint;

function Bone(json) {
  // int id;
  // String name;
  // String src;
  // String tgt;
  // String type;
  // THREE.Vector3f boneDir;
  // THREE.Vector3f boneNormalDir;
  _.merge(this, json);
  this.boneDir = json.boneDir? Object3DUtil.toVector3(json.boneDir) : null;
  this.boneNormalDir = json.boneNormalDir? Object3DUtil.toVector3(json.boneNormalDir) : null;
  if (this.type) {
    this.type = this.type.toLowerCase();
  }
}

Skeleton.Bone = Bone;

Object.defineProperty(Bone.prototype, 'isBigBone', {
  get: function () { return "big" === this.type; }
});

Skeleton.prototype.__update = function() {
  this.jointsByName = _.keyBy(this.joints, 'name');  // Map of joints by name
  this.jointGroupsByName = _.keyBy(this.jointGroups, 'name'); // Map of joint groups by name
  this.bonesByName = _.keyBy(this.bones, 'name');  // Map of bones by name
  this.bonesForSourceJoint = _.groupBy(this.bones, 'src');  // Map from source joint to attached bones
  var rootJoint = this.jointsByName[this.rootJoint];  // Root joint index
  this.rootJointIndex = rootJoint.id;

  // Make sure bone info is properly populated
  for (var i = 0; i < this.bones.length; i++) {
    var bone = this.bones[i];
    if (!bone.boneDir) {
      bone.boneDir = this.boneDir;
    }
    if (!bone.boneNormalDir) {
      bone.boneNormalDir = this.boneNormalDir;
    }
    var tgt = this.jointsByName[bone.tgt];
    var src = this.jointsByName[bone.src];
    if (!tgt.parentJoint) {
      tgt.parentJoint = src;
    } else {
      console.warn("Joint " + tgt + " already has parent " + tgt.parentJoint);
    }
  }
};

Skeleton.prototype.getRootJoint = function() {
  return this.getJoint(this.rootJoint);
};

Skeleton.prototype.getJoint = function(name) {
  if (!this.jointsByName) {
    this.__update();
  }
  return this.jointsByName[name];
};

Skeleton.prototype.getBone = function(name) {
  if (!this.bonesByName) {
    this.__update();
  }
  return this.bonesByName[name];
};

Skeleton.prototype.getBoneForJoints = function(j1, j2) {
  var bones = this.getBonesWithSourceJoint(j1);
  if (bones) {
    for (var i = 0; i < bones.length; i++) {
      if (bones[i].tgt.equals(j2)) {
        return bones[i];
      }
    }
  }
};

Skeleton.prototype.getJointGroup = function(name) {
  if (!this.jointGroupsByName) {
    this.__update();
  }
  return this.jointGroupsByName[name];
};

Skeleton.prototype.getBonesWithSourceJoint = function(name) {
  if (!this.bonesForSourceJoint) {
    this.__update();
  }
  return this.bonesForSourceJoint[name];
};


Skeleton.prototype.getBonesWithSourceJoint = function(name) {
  if (!this.bonesForSourceJoint) {
    this.__update();
  }
  return this.bonesForSourceJoint[name];
};

module.exports = Skeleton;
