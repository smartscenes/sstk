'use strict';

var Constants = require('Constants');
var WebService = require('io/WebService');
var _ = require('util');

/**
 * Scene and object priors
 *
 * @constructor
 */
function ScenePriors(params) {
  params = params || {};
  // Timeout in milliseconds
  params.timeout = params.timeout || 20000;
  WebService.call(this, params);
}

ScenePriors.prototype = Object.create(WebService.prototype);
ScenePriors.prototype.constructor = ScenePriors;

ScenePriors.prototype.__toResults = function(data) {
  return data.results.results;
};

ScenePriors.prototype.getChildCategoryGivenSupportParent = function (sceneType, supportParentCategory, succeededCallback1, failedCallback1) {
  this.query(Constants.getScenePriorsUrl,
    {
      queryType: 'childCategoryGivenSupportParent',
      sceneType: sceneType,
      supportParentCategory: supportParentCategory
    },
    succeededCallback1, failedCallback1);
};

ScenePriors.prototype.queryPlacement = function (options, succeededCallback1, failedCallback1) {
  console.log('queryPlacement options');
  console.log(options);
  var url = Constants.getScenePriorsUrl;
  var queryData = {
    queryType: 'contextPlacement',
    useObjectCounts: options.useObjectCounts,
    supportParentCategory: options.supportParentCategory,
    includeHyperCategories: options.includeHyperCategories
  };
  if (options.sceneType) {
    queryData['sceneType'] = options.sceneType;
  }
  if (options.config) {
    queryData['config'] = options['config'];
  }
  if (options.sceneState) {
    queryData['sceneState'] = options.sceneState.toJsonString();
  }
  if (options.queryRegion) {
    // TODO: make sure everything in scene coordinates
    var qr = _.clone(options.queryRegion);
    if (qr.supportParent) {
      qr.supportParentIndex = qr.supportParent.index;
      delete qr.supportParent;
    }
    for (var p in qr) {
      var sceneTransformMatrixInverse = new THREE.Matrix4();
      sceneTransformMatrixInverse.getInverse(options.sceneState.scene.matrixWorld);
      if (qr.hasOwnProperty(p) && qr[p] instanceof THREE.Vector3) {
        qr[p] = qr[p].clone().applyMatrix4(sceneTransformMatrixInverse);
        if (p === 'supportNormal') {
          qr[p].normalize();
        }
      }
    }
    queryData['queryRegion'] = qr;
  }
  // TODO: transform from scene coordinate to world coordinates
  this.query(url, queryData, succeededCallback1, failedCallback1);
};



// Exports
module.exports = ScenePriors;
