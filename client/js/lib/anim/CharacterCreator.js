var _ = require('util/util');
var Constants = require('Constants');
var Object3DUtil = require('geo/Object3DUtil');
var MeshHelpers = require('geo/MeshHelpers');
var Character = require('anim/Character');

function CharacterCreator() {
  this.debug = false;
  this.boneColor = [1.0, 242.0/255.0, 181.0/255.0, 1.0];
  this.boneMaterial = Object3DUtil.getSimpleFalseColorMaterial(1, new THREE.Color(this.boneColor[0], this.boneColor[1], this.boneColor[2]));
  if (this.debug) {
    Object3DUtil.setMaterialOpacity(this.boneMaterial, 0.5);
  }
  this.alwaysIncludeCustomSkel = true;
}

CharacterCreator.prototype.create = function(characterInfo, index, characterMetadata) {
  if (characterMetadata) {
     //this.assetManager.loadModel()
    throw Error('Please implement me!!!');
  } else {
    return new Character({
      metadata: characterMetadata,
      info: characterInfo,
      index: index,
      name: characterInfo.name
    });
  }
};

CharacterCreator.prototype.attachCharacter = function(sceneState, character, skeletonMetadata) {
  // console.log(character);
  // if (character.metadata != null) {
  //   this.__attachCharacterWithMetadata(scene, character, skeletonMetadata)
  // }

  if (this.alwaysIncludeCustomSkel || character.metadata == null) {
    var node = (character.metadata != null)? character.object3D : new THREE.Group();
    if (!character.object3D) {
      character.object3D = node;
    }
    var characterGeom = this.__createCharacterGeometrySimple(character.info, skeletonMetadata, sceneState.getUnit());
    node.add(characterGeom);
    // var skel = this.__createSkeleton(character.info, skeletonMetadata, useAllBones = true);
    // node.addControl(new SkeletonControl(skel))
    // val axisScale = getAxisScale(gscene.scene.unit.toFloat)
    // //JmeUtils.attachSkeletonDebugger(node, skel, axisScale)(assetManager)
    // assetCreator.attachChild(gscene.node, node)
    //sceneState.addExtraObject(node);
    sceneState.scene.add(node);
  }
};


function __attachCharacterJoint(node, name, jointGroup, jointPos, jointQuat, unit, showOrientations) {
  if (jointGroup) {
    var size = jointGroup.size  / unit;
    var ball = Object3DUtil.makeBall(jointPos, size, jointGroup.color);
    ball.name = name;
    node.add(ball);
    if (showOrientations) {
      var axisScale = __getAxisScale(unit);
      var rotAxes = new MeshHelpers.FatAxes(axisScale, 2, jointPos, jointQuat);
      rotAxes.name = name + '-coord';
      node.add(rotAxes);
    }
  }
}

function __attachCharacterJoints(node, characterInfo, skeletonMetadata, unit, showOrientations) {
  _.forEach(skeletonMetadata.joints, function(j) {
    if (j.jointGroup != null) {
      var jointGroup = skeletonMetadata.getJointGroup(j.jointGroup);
      var jointScenePos = __getJointPositionScene(characterInfo, j.id);
      var jointSceneQuat = __getJointQuatScene(characterInfo, j.id, null);
      __attachCharacterJoint(node, j.name, jointGroup, jointScenePos, jointSceneQuat, unit, showOrientations);
    }
  });
}

CharacterCreator.prototype.__createCharacterGeometrySimple = function(characterInfo, skeletonMetadata, unit, useAllBones) {
  var node = new THREE.Group();
  node.name = characterInfo.skeletonData.id;
  var size = 5 / (unit * Constants.metersToVirtualUnit);
  for (var i = 0; i < skeletonMetadata.bones.length; i++) {
    var b = skeletonMetadata.bones[i];
    if (useAllBones || b.isBigBone) {
      var sourceJoint = skeletonMetadata.getJoint(b.src);
      var targetJoint = skeletonMetadata.getJoint(b.tgt);
      var sourceJointScenePos = __getJointPositionScene(characterInfo, sourceJoint.id);
      var targetJointScenePos = __getJointPositionScene(characterInfo, targetJoint.id);
      var targetJointSceneQuat = __getJointQuatScene(characterInfo, targetJoint.id, __defaultBoneAlignQuat);

      // Make bounding box that goes from source to target!
      var bone = Object3DUtil.makeBoxFromToOrientation(sourceJointScenePos, targetJointScenePos, targetJointSceneQuat, size, this.boneMaterial);
      bone.name = b.name;
      node.add(bone);
    }
  }
  __attachCharacterJoints(node, characterInfo, skeletonMetadata, unit);
  return node;
};

CharacterCreator.prototype.__createCharacterGeometryHierarchical = function(characterInfo, skeletonMetadata, unit, useAllBones) {
  var scope = this;
  var node = new THREE.Group();
  node.name = characterInfo.skeletonData.id;
  var size = 5 / (unit * Constants.metersToVirtualUnit);

  function processJoint(joint, parent) {
    var bones = skeletonMetadata.getBonesWithSourceJoint(joint.name);
    if (bones) {
      for (var i = 0; i < bones.length; i++) {
        var b = bones[i];
        var sourceJoint = skeletonMetadata.getJoint(b.src);
        var targetJoint = skeletonMetadata.getJoint(b.tgt);
        var p = parent;
        if (useAllBones || b.isBigBone) {
          var sourceJointScenePos = __getJointPositionScene(characterInfo, sourceJoint.id);
          var targetJointScenePos = __getJointPositionScene(characterInfo, targetJoint.id);
          var targetJointSceneQuat = __getJointQuatScene(characterInfo, targetJoint.id, __defaultBoneAlignQuat);

          // Make bounding box that goes from source to target!
          var bb = Object3DUtil.makeBoxFromToOrientation(sourceJointScenePos, targetJointScenePos, targetJointSceneQuat, size, scope.boneMaterial);
          bb.name = b.name;
          var bbNode = new THREE.Group(b.name + "-node");
          bbNode.add(bb);
          Object3DUtil.attachToParent(bbNode, parent);
          parent.add(bbNode);
          p = bbNode;
        }
        processJoint(targetJoint, p);
      }
    }
  }

  var rootJoint = skeletonMetadata.getRootJoint();
  processJoint(rootJoint, node);
  __attachCharacterJoints(node, characterInfo, skeletonMetadata, unit);
  return node;
};


// Helper functions
function __getAxisScale(unit) {
  return (0.20 / unit);
}

function __useKinectPositions(characterInfo) {
  return false || characterInfo.skeletonData.bonePositions == null;
}

function __useKinectOrientations(characterInfo) {
  return false || characterInfo.skeletonData.boneOrientations == null;
}

function __getJointPositionScene(characterInfo, jointId) {
  var useKinect = __useKinectPositions(characterInfo);
  return characterInfo.skeletonData.getJointPositionScene(jointId, useKinect);
}

// Kinect bone dirs?
var __targetBoneDir = new THREE.Vector3(0, 1, 0);
var __targetBoneNormDir = new THREE.Vector3(0, 0, 1);
function __getBoneAlignQuat(boneDir, boneNormalDir) {
  if (boneDir != null && boneNormalDir != null) {
    return Object3DUtil.getAlignmentQuaternion(boneDir, boneNormalDir, __targetBoneDir, __targetBoneNormDir);
  } else {
    // Unit quaternion
    return new THREE.Quaternion(0, 0, 0, 1);
  }
}
var  __defaultBoneAlignQuat = __getBoneAlignQuat(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0));


function __getJointQuatScene(characterInfo, j, alignQuat) {
  var useKinect = __useKinectOrientations(characterInfo);
  var q = characterInfo.skeletonData.getJointCoordFrameScene(j, useKinect);
  if (alignQuat != null) {
    var res = new THREE.Quaternion();
    res.multiplyQuaternions(q, alignQuat);
    return res;
  } else {
    return q;
  }
}

function __getJointQuatBody(characterInfo, j, alignQuat) {
  var q = characterInfo.skeletonData.getJointCoordFrameBody(j);
  if (alignQuat != null) {
    var res = new THREE.Quaternion();
    res.multiplyQuaternions(q, alignQuat);
    return res;
  } else {
    return q;
  }
}

module.exports = CharacterCreator;
