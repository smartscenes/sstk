var Constants = require('Constants');
var Agent = require('sim/Agent');
var Object3DUtil = require('geo/Object3DUtil');
var SimUtil = require('sim/SimUtil');
var _ = require('util');

/**
 * Basic dialog handling for simulator
 * @param opts
 * @constructor
 * @memberOf sim
 */
function SimDialog(opts) {
  this.simulator = opts.simulator;
}

var nounRemap = {
  'door': ['door', 'arch', 'garage_door'],
  'lamp': ['indoor_lamp', 'outdoor_lamp'],
  'light': ['indoor_lamp', 'outdoor_lamp'],
  'tv': ['television']
};

var verbRemap = {
  'pick up': 'take',
  'turn on': 'turnOn',
  'turn off': 'turnOff'
};

/**
 * Process text input wrt to observations from the last action
 * @param lastActionResult {Object} Observations from the last action
 * @param text {string} Text input
 * @param callback {function(string)}
 */
SimDialog.prototype.process = function(lastActionResult, text, callback) {
  var parts = text.split(/\s+/);
  var verb = parts[0];
  var noun = parts[1];
  var target = parts[2];
  // Remap
  var action = verbRemap[verb] || verb;
  var simState = this.simulator.getState();
  // use lastObservation to see what is up!
  var sensedObjects = lastActionResult.observation.sensors.objectId;
  var normalFrame = lastActionResult.observation.sensors.normal;
  var operations = this.simulator.__simOperations;

  if (action === 'help') {
    // TODO: flesh out help
    callback("Please try 'list', 'take sofa', 'put sofa', 'toggle door'");
  } if (action === 'list') {
    var counts = SimUtil.getCategoryCounts(simState, sensedObjects);
    if (_.size(counts) > 0) {
      var countsMsg = _.map(_.sortBy(_.toPairs(counts), function (c, k) {
        return -c[1];
      }), function (c, k) {
        return c[0] + ': ' + c[1];
      }).join('\n');
      callback(countsMsg);
    } else {
      callback("I don't see anything");
    }
  } else if (noun) {
    // Find closest door in image
    var nouns = noun + 's';
    var categories = nounRemap[noun] || [noun];
    var targetCategories = target? (nounRemap[target]) || [target] : null;

    if (action === 'add') {
      // Let's get a new object
      var objPosition = simState.agent.localToWorldPosition(Agent.DIRS.forward.clone().multiplyScalar(2));
      var simulator = this.simulator;
      var prepareModelInstance = function(modelInstance) {
        operations.__sceneOperations.prepareModelInstance(modelInstance, {
          useShadows: simulator.useShadows,
          enableMirrors: simulator.enableMirrors // TODO: these are scene options
        });
        // Have attachment point
        modelInstance.setAttachmentPoint({ position: new THREE.Vector3(0.5, 0, 0.5), coordFrame: 'childBB' });
      };
      if (targetCategories) {
        var targetPlacement = operations.findPlacementPosition(simState, sensedObjects, normalFrame, targetCategories);
        if (targetPlacement.error) {
          callback(targetPlacement.error);//"I can't find any " + target);
          return;
        } else {
          objPosition.copy(targetPlacement.position);
        }
      }
      var addOptions = { anchorFrame: 'objectOrigin', positionAt: objPosition, prepareModelInstance: prepareModelInstance };
      operations.addObjectWithCategory(simState, categories, addOptions,
        function(err, res) {
          if (err) {
            callback(err);
            // Try to add with keywords (disabled for now)
            // operations.addObjectWithKeywords(simState, categories, addOptions,
            //   function(err, res) {
            //     if (err) {
            //       callback(err);
            //     } else {
            //       callback('Ok!');
            //     }}
            //  );
          } else {
            callback('Ok!');
          }
      });
    } else if (action === 'put') {
      var objs = operations.findObjectsInBagByCategory(simState, categories);
      if (objs.length > 0) {
        var placeOptions;
        if (targetCategories) {
          var targetPlacement = operations.findPlacementPosition(simState, sensedObjects, normalFrame, targetCategories);
          if (targetPlacement.error) {
            callback(targetPlacement.error);//"I can't find any " + target);
          } else {
            placeOptions = { anchorFrame: 'objectOrigin', positionAt: targetPlacement.position };
          }
        }
        var modelInstance = objs[0];
        operations.putDown(simState, {modelInstance: modelInstance}, placeOptions);
        callback("Ok!");
      } else {
        callback("I don't have any " + nouns);
      }
    } else {
      var objs = operations.findObjectsInViewByCategory(simState, sensedObjects, categories);
      if (objs.length > 0) {
        console.log(noun, objs);
        var obj = objs[0];
        // Generic actions
        if (action === 'take') {
          operations.take(simState, obj);
        } else if (action === 'move') {
          // Agent centric movement
          var agentDir = Agent.DIRS[target];
          if (target) {
            var worldDir = simState.agent.localToWorldDirection(agentDir);
            var objBB = Object3DUtil.getBoundingBox(obj.node);
            var objLocation = Object3DUtil.getBBoxFaceCenter(obj.node, Constants.BBoxFaceCenters.BOTTOM);
            var objSize = objBB.radius();
            var updatedObjLocation = objLocation.clone();
            updatedObjLocation.addScaledVector(worldDir, objSize);
            operations.move(simState, obj, {
              anchorFrame: 'objectBBox',
              anchorPosition: Object3DUtil.FaceCenters01[Constants.BBoxFaceCenters.BOTTOM],
              positionAt: updatedObjLocation
            });
          } else {
            callback('Please specify direction the object should be moved  (left, right, up, down, forward, back)');
            return;
          }
        } else {
          var result = operations.actOnObject(simState, obj, action);
          console.log('Got result', result);
        }
        callback("Ok!");
      } else {
        callback("I don't see any " + nouns + ".  Please show me what is a " + noun + ".");
      }
    }
  } else {
    callback("I don't understand!  I have a very limited vocabulary.  Please say 'toggle door'.");
  }
};

module.exports = SimDialog;