var AssetGroups = require('assets/AssetGroups');
var Object3DUtil = require('geo/Object3DUtil');
var ModelInfo = {};

ModelInfo.getUp = function (info) {
    if (info.up && !(info.up instanceof THREE.Vector3)) {
        info.up = Object3DUtil.toVector3(info.up);
    }
    return (info.up) ? info.up : AssetGroups.getDefaultUp(info);
};

ModelInfo.getFront = function (info) {
    if (info.front && !(info.front instanceof THREE.Vector3)) {
        info.front = Object3DUtil.toVector3(info.front);
    }
    return (info.front) ? info.front : AssetGroups.getDefaultFront(info);
};

ModelInfo.getDefaultUp = function (info) {
    return AssetGroups.getDefaultUp(info);
};

ModelInfo.getDefaultFront = function (info) {
    return AssetGroups.getDefaultFront(info);
};

ModelInfo.getAlignmentMatrix = function(info1, info2) {
  return  Object3DUtil.getAlignmentMatrix(
      ModelInfo.getUp(info1), ModelInfo.getFront(info1),
      ModelInfo.getUp(info2), ModelInfo.getFront(info2));
};

ModelInfo.getUnit = function(info) {
  return (info.unit) ? info.unit : AssetGroups.getDefaultUnit(info);
};

ModelInfo.getRelativeTransform = function(info1, info2) {
  var alignMat = ModelInfo.getAlignmentMatrix(info1, info2);
  var s = ModelInfo.getUnit(info1) / ModelInfo.getUnit(info2);
  return alignMat.scale(new THREE.Vector3(s, s, s));
};

ModelInfo.getCenterTo = function(info) {
  return Object3DUtil.toVector3(info.defaultCenter);
};

ModelInfo.getDataInfo = function(info) {
  return info.dataInfo;
};

ModelInfo.getMetadataForDataType = function(info, type) {
  console.log(info);
  return info.dataInfo? info.dataInfo.dataTypes[type] : null;
};

module.exports = ModelInfo;

