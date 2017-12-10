/**
 * Character meta data
 *
 * @constructor
 * @author Angel Chang
 * @memberOf anim
 */
function CharacterMetadata(json) {
  // String assetFile;
  // Float unit;
  // Vector3f up;
  // Vector3f front;
  // Vector3f boneDir;
  // Vector3f boneNormalDir;
  // Map from kinect joints to bones defined by this character
  // Map<String, Map<String, JointMapping>> jointMappings;
  // Map from normalized animation names to ones supported by this character
  // Map<String, String> animMappings;
  //
  // Temporaries
  // Map from parent bones to the kinect joint
  // Map<String, String> parentBoneToKinectJointMap;
  // Map from joints defined by kinect joints to canonical joint coordinate frames
  // Map<String, JointCoordFrame> kinectJointCoordFrameMap;
  // Skeleton skeleton;
  // Vector3f right;
}

function JointMapping(json) {
  // String sourceJoint;
  // String parent;  // parent bone
  // String position;  // Bone whose position corresponds to the position of this joint
}


// CharacterMetadata.prototype.update = function() {
//   if (this.jointMappings != null) {
//     for (Map.Entry<String, Map<String, JointMapping>> entry : jointMappings.entrySet()) {
//       for (Map.Entry<String, JointMapping> mappingEntry : entry.getValue().entrySet()) {
//         mappingEntry.getValue().sourceJoint = mappingEntry.getKey();
//       }
//     }
//   }
//   this.right = front.cross(up).normalizeLocal();
// };
//
// CharacterMetadata.prototype.bindSkeleton = function(skeleton) {
//   if (this.skeleton != skeleton) {
//     this.skeleton = skeleton;
//     this.kinectJointCoordFrameMap = computeJointCoordFramesForBindPose(this.skeleton);
//   }
// };

// @JsonIgnore
// public Map<String, JointCoordFrame> getKinectJointCoordFrames() {
//   return kinectJointCoordFrameMap;
// }
//
// @JsonIgnore
// public Map<String, String> getParentBoneToKinectJointMapping() {
//   if (parentBoneToKinectJointMap == null) {
//     parentBoneToKinectJointMap = new HashMap<String, String>();
//     Map<String,JointMapping> kinectJointMapping = jointMappings.get("kinect");
//     if (kinectJointMapping != null) {
//       for (JointMapping mapping : kinectJointMapping.values()) {
//         if (mapping.parent != null) {
//           if (parentBoneToKinectJointMap.containsKey(mapping.parent)) {
//             System.err.println("Cannot map from parent bone " + mapping.parent + " to Kinect joint " + mapping.sourceJoint
//               + ", mapping from " + mapping.parent + " to "
//               + parentBoneToKinectJointMap.get(mapping.parent) + " already exists.");
//           } else {
//             parentBoneToKinectJointMap.put(mapping.parent, mapping.sourceJoint);
//           }
//         }
//       }
//     }
//   }
//   return parentBoneToKinectJointMap;
// }
//
// @JsonIgnore
// public Map<String,JointMapping> getKinectJointMapping() {
//   return jointMappings.get("kinect");
// }
//
// @Override
// public void write(JmeExporter jmeExporter) throws IOException {
//   OutputCapsule output = jmeExporter.getCapsule(this);
//
//   output.write(unit, "unit", 1.0f);
//   output.write(up, "up", null);
//   output.write(front, "front", null);
//   output.write(boneDir, "boneDir", null);
//   output.write(boneNormalDir, "boneNormalDir", null);
//   // TODO: write rest
// }
//
// @Override
// public void read(JmeImporter jmeImporter) throws IOException {
//   InputCapsule input = jmeImporter.getCapsule(this);
//
//   unit = input.readFloat("unit", 1.0f);
//   up = (Vector3f) input.readSavable("up", null);
//   front = (Vector3f) input.readSavable("front", null);
//   boneDir = (Vector3f) input.readSavable("boneDir", null);
//   boneNormalDir = (Vector3f) input.readSavable("boneNormalDir", null);
//   // TODO: read rest
// }
//
//
function JointCoordFrame(opts) {
  //String kinectJoint;
  //String boneName;
  //String parentBoneName;
  //Transform bodyToJoint;
  //Transform jointToBody;
  //Transform bindToJoint;
  //Transform jointToBind;
  //Transform parentBindToJoint;
  //Transform jointToParentBind;

  this.kinectJoint = opts.kinectJoint;
  this.boneName = opts.boneName;
  this.parentBoneName = opts.parentBoneName;
  if (opts.position && opts.rotation) {
    // Initialize from position and rotation
    this.jointToBody = new THREE.Matrix4();
    this.jointToBody.compose(opts.position, opts.rotation, opts.scale);
  } else {
    this.jointToBody = opts.jointToBody;
  }
  this.bodyToJoint = new THREE.Matrix4();
  this.bodyToJoint.getInverse(this.jointToBody);
}

JointCoordFrame.prototype.__computeBindTransforms = function(modelBindInverseTransform) {
  // modelBindTransform = bindToBody, modelBindInverseTransform = bodyToBind
  // jointToBind = bodyToBind x jointToBody
  this.jointToBind = this.jointToBody.clone().combineWithParent(modelBindInverseTransform);
  // bindToJoint = bodyToJoint x bindToBody
  this.bindToJoint = this.jointToBind.invert();
};

JointCoordFrame.prototype.__computeParentBindTransforms = function(modelBindInverseTransform) {
  // modelBindTransform = bindToBody, modelBindInverseTransform = bodyToBind
  // jointToBind = bodyToBind x jointToBody
  this.jointToParentBind = this.jointToBody.clone().combineWithParent(modelBindInverseTransform);
  // bindToJoint = bodyToJoint x bindToBody
  this.parentBindToJoint = this.jointToParentBind.invert();
};

// private Quaternion makeQuaternionXY(Vector3f dir1, Vector3f dir2) {
//   // Make quaternion taking x to dir1, y to dir2, make sure x is normal wrt to y
//   Vector3f nd1 = dir1.normalize();
//   Vector3f nd2 = dir2.normalize();
//   Vector3f nd3 = nd1.cross(nd2).normalizeLocal();
//   nd1 = nd2.cross(nd3, nd1).normalizeLocal();  // Put result in nd1
//   nd3 = nd1.cross(nd2, nd3).normalizeLocal();  // Put result in nd3
//   Matrix3f rot;
//   rot = new Matrix3f(
//     nd1.x, nd2.x, nd3.x,
//     nd1.y, nd2.y, nd3.y,
//     nd1.z, nd2.z, nd3.z
//   );
//   Quaternion q = new Quaternion();
//   q.fromRotationMatrix(rot);
//   return q;
// }
//
// private Quaternion makeQuaternionYZ(Vector3f dir1, Vector3f dir2) {
//   // Make quaternion taking y to dir1, z to dir2, make sure y is normal wrt to z
//   Vector3f nd1 = dir1.normalize();  // y
//   Vector3f nd2 = dir2.normalize();  // z
//   Vector3f nd3 = nd1.cross(nd2).normalizeLocal();  // x
//   nd1 = nd2.cross(nd3, nd1).normalizeLocal();  // Put result in nd1
//   nd3 = nd1.cross(nd2, nd3).normalizeLocal();  // Put result in nd3
//   Matrix3f rot;
//   rot = new Matrix3f(
//     nd3.x, nd1.x, nd2.x,
//     nd3.y, nd1.y, nd2.y,
//     nd3.z, nd1.z, nd2.z
//   );
//   Quaternion q = new Quaternion();
//   q.fromRotationMatrix(rot);
//   return q;
// }
//
// private Vector3f getDir(Vector3f from, Vector3f to) {
//   return to.subtract(from).normalizeLocal();
// }
//
// private Vector3f getBoneDir(Map<String, Vector3f> jps, String j1, String j2) {
//   return getDir(jps.get(j1), jps.get(j2));
// }
//
// private Vector3f getBoneDirToParent(Map<String, Vector3f> jps, JointMapping jm) {
//   return getDir(jps.get(jm.position), jps.get(jm.parent));
// }
//
// private Vector3f getBoneDirFromParent(Map<String, Vector3f> jps, JointMapping jm) {
//   return getDir(jps.get(jm.parent), jps.get(jm.position));
// }
//
// private Map<String, JointCoordFrame> computeJointCoordFramesForBindPose(Skeleton skeleton) {
//   skeleton.resetAndUpdate();
//
//   String[] kinectJointNames = {
//     "SpineBase", "SpineMid", "SpineShoulder", "Neck", "Head",
//     "HipLeft", "KneeLeft", "AnkleLeft", "FootLeft",
//     "HipRight", "KneeRight", "AnkleRight", "FootRight",
//     "ShoulderLeft", "ElbowLeft", "WristLeft", "HandLeft",
//     "ShoulderRight", "ElbowRight", "WristRight", "HandRight"
//   };
//
//   Map<String, JointMapping> kinectToBone = getKinectJointMapping();
//   int missingMapping = 0;
//   for (String kinectJoint : kinectJointNames) {
//     if (!kinectToBone.containsKey(kinectJoint)) {
//       System.err.println("No mapping for kinect joint: " + kinectJoint);
//       missingMapping++;
//     }
//   }
//   if (missingMapping > 0) {
//     System.err.println("Missing mapping for " + missingMapping + " joints. Cannot compute joint coordinate frames.");
//     return null;
//   }
//
//   Map<String, Vector3f> bonePositions = new HashMap<String, Vector3f>();
//   Map<String, Vector3f> kinectJointPositionsBody = new HashMap<String, Vector3f>();
//   for (Map.Entry<String,JointMapping> entry : kinectToBone.entrySet()) {
//     String kinectJoint = entry.getKey();
//     JointMapping jm = entry.getValue();
//     Vector3f bonePos = skeleton.getBone(jm.position).getModelSpacePosition();
//     kinectJointPositionsBody.put(kinectJoint, bonePos);
//     bonePositions.put(jm.position, bonePos);
//     if (jm.parent != null) {
//       bonePositions.put(jm.parent, skeleton.getBone(jm.parent).getModelSpacePosition());
//     }
//   }
//
//   Map<String, Quaternion> jointOrientationsBody = new HashMap<String, Quaternion>();
//   Quaternion qp = makeQuaternionXY(front, up);
//   jointOrientationsBody.put("SpineBase", qp);
//   jointOrientationsBody.put("SpineMid",
//     makeQuaternionXY(front, getBoneDirFromParent(bonePositions, kinectToBone.get("SpineMid"))));
//   jointOrientationsBody.put("SpineShoulder",
//     makeQuaternionXY(front, getBoneDirFromParent(bonePositions, kinectToBone.get("SpineShoulder"))));
//   jointOrientationsBody.put("Neck",
//     makeQuaternionXY(front, getBoneDirFromParent(bonePositions, kinectToBone.get("Neck"))));
//   jointOrientationsBody.put("Head",
//     makeQuaternionXY(front, getBoneDirFromParent(bonePositions, kinectToBone.get("Head"))));
//
//   jointOrientationsBody.put("HipLeft", qp);
//   jointOrientationsBody.put("KneeLeft",
//     makeQuaternionXY(front, getBoneDirToParent(bonePositions, kinectToBone.get("KneeLeft"))));
//   jointOrientationsBody.put("AnkleLeft",
//     makeQuaternionXY(getBoneDirFromParent(bonePositions, kinectToBone.get("FootLeft")), getBoneDirToParent(bonePositions, kinectToBone.get("AnkleLeft"))));
//   jointOrientationsBody.put("FootLeft", jointOrientationsBody.get("AnkleLeft"));
//
//   jointOrientationsBody.put("HipRight", qp);
//   jointOrientationsBody.put("KneeRight",
//     makeQuaternionXY(front, getBoneDirToParent(bonePositions, kinectToBone.get("KneeRight"))));
//   jointOrientationsBody.put("AnkleRight",
//     makeQuaternionXY(getBoneDirFromParent(bonePositions, kinectToBone.get("FootRight")), getBoneDirToParent(bonePositions, kinectToBone.get("AnkleRight"))));
//   jointOrientationsBody.put("FootRight", jointOrientationsBody.get("AnkleRight"));
//
//   Vector3f elbowToShoulderL = getBoneDirToParent(bonePositions, kinectToBone.get("ElbowLeft"));
//   Vector3f wristToElbowL = getBoneDirToParent(bonePositions, kinectToBone.get("WristLeft"));
//   Vector3f zhl = wristToElbowL.cross(elbowToShoulderL).normalizeLocal();
//   if (zhl.dot(right) < 0) {
//     zhl.negateLocal();
//   }
//   jointOrientationsBody.put("ShoulderLeft",
//     makeQuaternionYZ(up, getBoneDirToParent(bonePositions, kinectToBone.get("ShoulderLeft"))));
//   jointOrientationsBody.put("ElbowLeft",
//     makeQuaternionYZ(elbowToShoulderL, zhl));
//   jointOrientationsBody.put("WristLeft",
//     makeQuaternionYZ(wristToElbowL, zhl));
//   jointOrientationsBody.put("HandLeft", jointOrientationsBody.get("WristLeft"));
//
//   Vector3f elbowToShoulderR = getBoneDirToParent(bonePositions, kinectToBone.get("ElbowRight"));
//   Vector3f wristToElbowR = getBoneDirToParent(bonePositions, kinectToBone.get("WristRight"));
//   Vector3f zhr = wristToElbowR.cross(elbowToShoulderR).normalizeLocal();
//   if (zhr.dot(right) < 0) {
//     zhr.negateLocal();
//   }
//   jointOrientationsBody.put("ShoulderRight",
//     makeQuaternionYZ(up, getBoneDirFromParent(bonePositions, kinectToBone.get("ShoulderRight"))));
//   jointOrientationsBody.put("ElbowRight",
//     makeQuaternionYZ(elbowToShoulderR, zhr));
//   jointOrientationsBody.put("WristRight",
//     makeQuaternionYZ(wristToElbowR, zhr));
//   jointOrientationsBody.put("HandRight", jointOrientationsBody.get("WristRight"));
//
//   // Map from joint id to joint coord frame
//   Map<String, JointCoordFrame> jointCoordFrames = new HashMap<String, JointCoordFrame>();
//   for (String kinectJoint : kinectJointNames) {
//     JointMapping jm = kinectToBone.get(kinectJoint);
//     JointCoordFrame jcf = new JointCoordFrame(kinectJoint, jm.position, jm.parent,
//       kinectJointPositionsBody.get(kinectJoint), jointOrientationsBody.get(kinectJoint));
//     jcf.computeBindTransforms(skeleton.getBone(jm.position).getModelBindInverseTransform());
//     if (jm.parent != null) {
//       Bone parentBone = skeleton.getBone(jm.parent);
//       if (parentBone == null) {
//         System.err.println("Cannot find bone for " + jm.parent);
//       }
//       jcf.computeParentBindTransforms(parentBone.getModelBindInverseTransform());
//     }
//     jointCoordFrames.put(kinectJoint, jcf);
//   }
//   return jointCoordFrames;
// }
// }
