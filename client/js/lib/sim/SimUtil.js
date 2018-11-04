var Object3DUtil = require('geo/Object3DUtil');
var _ = require('util/util');

/**
 * Utility functions for Simulator
 * @memberOf sim
 */
function SimUtil() {
}

/**
 * Find objects in observation matching category
 * @param {SimState} state - Simulator state
 * @param {sim.sensors.SemanticSensor.Frame} objects - Observations for objects (semantic mask)
 * @param {string|array} categories - categories to find
 * @param {boolean} [includeOtherObjects=boolean] whether to include objects that are not model instances
 * @returns {Array<{id: string, node: THREE.Object3D, modelInstance: ModelInstance, count: number}>}
 */
SimUtil.findObjectsByCategory = function(state, objects, categories, includeOtherObjects) {
  if (!Array.isArray(categories)) {
    categories = [categories];
  }
  var objectIds = _.keys(objects.counts);
  var objectInfos = state.getObjectInfos(objectIds);
  var filtered = objectInfos.filter(function(x) {
    return Object3DUtil.filterByCategory(x.node, categories, includeOtherObjects);
  });
  _.each(filtered, function(x) {
    x.modelInstance = Object3DUtil.getModelInstance(x.node);
    x.count = objects.counts[x.id];
  });
  filtered = _.sortBy(filtered, function(x) { return -x.count; });
  return filtered;
};

/**
 * Find objects in observation matching category
 * @param {SimState} state - Simulator state
 * @param {sim.sensors.SemanticSensor.Frame} objects - Observations for objects (semantic mask)
 * @param {Function} filter - Filter of objects
 */
SimUtil.findObjects = function(state, objects, filter) {
  var objectIds = _.keys(objects.counts);
  var objectInfos = state.getObjectInfos(objectIds);
  var filtered = objectInfos.filter(filter);
  _.each(filtered, function(x) {
    x.modelInstance = Object3DUtil.getModelInstance(x.node);
    x.count = objects.counts[x.id];
  });
  filtered = _.sortBy(filtered, function(x) { return -x.count; });
  return filtered;
};

/**
 * Return category to object count
 * @param {SimState} state - Simulator state
 * @param {sim.sensors.SemanticSensor.Frame} objects - Observations for objects (semantic mask)
 */
SimUtil.getCategoryCounts = function(state, objects) {
  var objectIds = _.keys(objects.counts);
  var objectInfos = state.getObjectInfos(objectIds);
  //console.log(objectInfos);
  var counts = _.countByMulti(objectInfos, function(x,k) {
    var modelInstance = Object3DUtil.getModelInstance(x.node);
    if (modelInstance) {
      return modelInstance.model.getCategories();
    } else if (x.node && x.node.userData.type != undefined) {
      return [x.node.userData.type];
    } else {
      return [];
    }
  });
  return counts;
};


module.exports = SimUtil;