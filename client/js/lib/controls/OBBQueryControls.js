'use strict';

var ContextQueryControls = require('controls/ContextQueryControls');
var Object3DUtil = require('geo/Object3DUtil');
var _ = require('util/util');

/**
 * Controls for making a model query given a fixed OBB
 * @constructor
 * @extends controls.ContextQueryControls
 * @memberOf controls
 */
function OBBQueryControls(params) {
  var defaults = {
    searchOptions: {
      showSearchBySize: true,
      showSceneModels: true
    }
  };
  params = _.defaultsDeep(Object.create(null), params || {}, defaults);
  ContextQueryControls.call(this, params);
  this.__activeCursor = 'initial';
  this.__mouseMoveCursor = 'crosshair';
  this.sizeTolerance = 0.5;
}

OBBQueryControls.prototype = Object.create(ContextQueryControls.prototype);
OBBQueryControls.prototype.constructor = OBBQueryControls;

OBBQueryControls.prototype.reset = function (params) {
  ContextQueryControls.prototype.reset.call(this, params);
};

OBBQueryControls.prototype.__constructQueryString = function (categories) {
  var queryString = ContextQueryControls.prototype.__constructQueryString.call(this, categories);
  if (this.searchController.isSearchBySize) {
    queryString += ' AND ' + this.getSizeQuery();
  } else {
    queryString += ' AND isAligned:true';
  }
  return queryString;
};

OBBQueryControls.prototype.setPlacement = function (obb, segGroup, chosenObject) {
  this.placementInfo = {
    obb: obb,
    anchorPoint: new THREE.Vector3(0.5, 0.5, 0.5),
    segGroup: segGroup,
    lastChosenObject: chosenObject,
    op: chosenObject? 'replace' : null
  };
};

OBBQueryControls.prototype.onReplace = function (sceneState, modelInstance) {
  console.log('onReplace');
  console.log(this.placementInfo);
  var placementInfo = this.placementInfo;
  var mInstToRemove;
  if (placementInfo.lastChosenObject) {
    mInstToRemove = placementInfo.lastChosenObject;

    // Adjust placement info
    // Assume all models have been normalized
    placementInfo.quaternion = mInstToRemove.object3D.quaternion;

    var indexToRemove = sceneState.modelInstances.indexOf(mInstToRemove);
    sceneState.removeObjects([indexToRemove]);
  } else {
    // No previous model
  }
  placementInfo.lastChosenObject = modelInstance;
  sceneState.addObject(modelInstance);

  var selectedObject = modelInstance.object3D;
  Object3DUtil.clearCache(selectedObject);
  if (placementInfo.quaternion) {
    selectedObject.quaternion.copy(placementInfo.quaternion);
  }
  Object3DUtil.placeObject3D(selectedObject, placementInfo.obb.position, placementInfo.anchorPoint);
  // var obbDiag = placementInfo.obb.halfSizes.clone().multiplyScalar(2).length();
  // Object3DUtil.rescaleObject3DToFit(selectedObject, obbDiag);
  selectedObject.userData.segGroupIndex = placementInfo.segGroup? placementInfo.segGroup.index : undefined;
  this.Publish('ContextQueryModelInserted', modelInstance);
  return mInstToRemove;
};

OBBQueryControls.prototype.remove = function (sceneState) {
  if (!this.placementInfo) { return null; }
  var placementInfo = this.placementInfo;
  var mInstToRemove;
  if (placementInfo.lastChosenObject) {
    mInstToRemove = placementInfo.lastChosenObject;
    var indexToRemove = sceneState.modelInstances.indexOf(mInstToRemove);
    sceneState.removeObjects([indexToRemove]);
  }
  placementInfo.lastChosenObject = null;
  this.Publish('ContextQueryModelRemoved', mInstToRemove);
  return mInstToRemove;
};

OBBQueryControls.prototype.getQueryRegionPoints = function () {
  if (this.placementInfo && this.placementInfo.obb) {
    return this.placementInfo.obb.position;
  } else {
    return new THREE.Vector3(0, 0, 0);
  }
};

OBBQueryControls.prototype.getSizeQuery = function() {
  if (this.placementInfo && this.placementInfo.obb) {
    var obb = this.placementInfo.obb;
    var axesLengths = [obb.halfSizes.x * 2,obb.halfSizes.y * 2,obb.halfSizes.z * 2];
    var minWidth = axesLengths[0] * (1 - this.sizeTolerance);
    var maxWidth = axesLengths[0] * (1 + this.sizeTolerance);
    var minDepth = axesLengths[2] * (1 - this.sizeTolerance);
    var maxDepth = axesLengths[2] * (1 + this.sizeTolerance);
    var minHeight = axesLengths[1] * (1 - this.sizeTolerance);
    var maxHeight = axesLengths[1] * (1 + this.sizeTolerance);

    var alignedDimsWidth = 'aligned.dims_0_d:[' + minWidth + ' TO ' + maxWidth + ']';
    var alignedDimsDepth = 'aligned.dims_2_d:[' + minDepth + ' TO ' + maxDepth + ']';
    var alignedDimsWidth2 = 'aligned.dims_2_d:[' + minWidth + ' TO ' + maxWidth + ']';
    var alignedDimsDepth2 = 'aligned.dims_1_d:[' + minDepth + ' TO ' + maxDepth + ']';
    var alignedDimsHeight = 'aligned.dims_1_d:[' + minHeight + ' TO ' + maxHeight + ']';
    var isAligned = 'isAligned:true';
    var sizeQuery = [isAligned, alignedDimsHeight,
      '(' +
        [
          '(' + [alignedDimsDepth,alignedDimsWidth].join(' AND ') + ')',
          '(' + [alignedDimsDepth2,alignedDimsWidth2].join(' AND ') + ')'
        ].join(' OR ') +
      ')'
    ].join(' AND ');
    console.log('sizeQuery', sizeQuery);
    return sizeQuery;
  }
};

OBBQueryControls.prototype.__getSearchTermQuery = function (searchTerm) {
  console.log('searchBySize', this.searchController.isSearchBySize);
  if (this.searchController.isSearchBySize) {
    return searchTerm + ' AND ' + '(' + this.getSizeQuery() + ')';
  } else {
    return searchTerm;
  }
};


OBBQueryControls.prototype.onDocumentMouseDown = function (event) {
  if (this.isActive) {
  }
};

OBBQueryControls.prototype.onDocumentMouseMove = function (event) {
  if (this.isActive) {
  }
};

OBBQueryControls.prototype.onDocumentMouseUp = function (event) {
  if (this.isActive) {
  }
};

module.exports = OBBQueryControls;
