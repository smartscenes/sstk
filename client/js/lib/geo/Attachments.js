'use strict';

var Constants = require('Constants');
var Object3DUtil = require('geo/Object3DUtil');
var Picker = require('controls/Picker');
var _ = require('util');

var Attachments = {};

// Identify and score attachments
function identifyAttachments(parents, modelInstWithCandidates, opts) {
  // Options
  // sameModelCost - Cost for same model
  // contactDistThreshold - Contact dist threshold
  // includeAllCandidates - Returns array of all candidates within threshold
  opts = opts || {};
  //console.log('identifyAttachments opts', opts);
  var contactDistThreshold = opts.contactDistThreshold || (0.10 * Constants.metersToVirtualUnit);
  var modelInstance = modelInstWithCandidates.modelInstance;
  var candidatesAttachments = modelInstWithCandidates.attachments;
  function isBetter(cand, best) {
    var intersected = cand.parentAttachment;
    //console.log('compare', cand, best);
    if (intersected.distance > contactDistThreshold) {
      return false;
    }
    if (!best) {
      return true;
    }
    var modelIdSameCostBest = 0;
    var modelIdSameCostCurr = 0;
    if (opts.sameModelCost > 0) {
      // Check if the two models are the same
      var bestModelInst = Object3DUtil.getModelInstance(best.parentAttachment.object, true);
      var currentModelInst = Object3DUtil.getModelInstance(cand.parentAttachment.object, true);
      var childModelId = modelInstance? modelInstance.model.info.fullId : null;
      var parentModelIdBest = bestModelInst? bestModelInst.model.info.fullId : null;
      var parentModelIdCurr = currentModelInst? currentModelInst.model.info.fullId : null;
      var modelIdSameBest = parentModelIdBest? parentModelIdBest === childModelId : false;
      modelIdSameCostBest = modelIdSameBest? opts.sameModelCost : 0;
      var modelIdSameCurr = parentModelIdCurr? parentModelIdCurr === childModelId : false;
      modelIdSameCostCurr = modelIdSameCurr? opts.sameModelCost : 0;
      //console.log('modelIdSameCosts: ', modelIdSameCostBest, modelIdSameCostCurr);
    }
    if (Math.abs(intersected.distance - best.parentAttachment.distance) < contactDistThreshold/2) {
      if (Math.abs(intersected.normSim - best.parentAttachment.normSim) < 0.01) {
        // Favor big flat surfaces
        // var candFaceMin = cand.childWorldBBFaceDims? Math.min(cand.childWorldBBFaceDims.x, cand.childWorldBBFaceDims.y) : 0;
        // var bestFaceMin = best.childWorldBBFaceDims? Math.min(best.childWorldBBFaceDims.x, best.childWorldBBFaceDims.y) : 0;
        var candBBFaceDims = _.get(cand, ['candidate', 'world', 'faceDims']);
        var bestBBFaceDims = _.get(cand, ['candidate', 'world', 'faceDims']);
        var candFaceMin = candBBFaceDims? Math.min(candBBFaceDims.x, candBBFaceDims.y) : 0;
        var bestFaceMin = bestBBFaceDims? Math.min(bestBBFaceDims.x, bestBBFaceDims.y) : 0;
        //console.log('compare faces', candFaceMin, bestFaceMin);
        if (candFaceMin > bestFaceMin*5) {
          return true;
        } else if (bestFaceMin > candFaceMin*5) {
          return false;
        }
        // TODO: Determine preferred normal based on object type (curtain to windows, etc)
        // prefer world bottom attachment
        if (intersected.normal.dot(Constants.worldUp) > 0.99) {
          return true;
        } else if (best.parentSurfaceNormal.dot(Constants.worldUp) > 0.99) {
          return false;
        } else if (intersected.normal.dot(Constants.worldUp) < -0.99) {
          return false;
        } else if (best.parentSurfaceNormal.dot(Constants.worldUp) < -0.99) {
          return true;
        }
      } else {
        return (intersected.normSim > best.parentAttachment.normSim);
      }
    }
    return (modelIdSameCostCurr < modelIdSameCostBest || intersected.distance < best.parentAttachment.distance);
  }
  // Raytrace out from candidate attachments
  var picker = new Picker();
  var raycaster = new THREE.Raycaster();
  //var raycasterOpposite = new THREE.Raycaster();
  var best = null;
  var candidates = [];
  //var bbox = modelInstance.getBBox();
  //var bbdims = bbox.dimensions();
  for (var i = 0; i < candidatesAttachments.length; i++) {
    var candidate = candidatesAttachments[i];
    //console.log('candidate', candidate);
    raycaster.ray.origin.copy(candidate.world.pos);
    // Go back just a little
    var s = candidate.world.size;
    //var s = Math.abs(bbdims.x * candidate.world.out.x) + Math.abs(bbdims.y * candidate.world.out.y) + Math.abs(bbdims.z * candidate.world.out.z);
    //console.log('compare', s, candidate.world.size);
    var offset = 0.2*s;
    raycaster.ray.origin.addScaledVector(candidate.world.out, -offset);
    raycaster.ray.direction.copy(candidate.world.out);
    var intersected = picker.getIntersectedForRay(raycaster, parents);
    // Select the closest parent (favoring attachment with parent surface normal up)
    //console.log('intersected', intersected, raycaster.ray.origin, raycaster.ray.direction, parents.map(function(p) { return Object3DUtil.getBoundingBox(p); }));
    if (intersected.length > 0) {
      _.forEach(intersected, function(i) { i.distance = Math.max(i.distance - offset, 0); }); // subtract offset from distance
      var closest = intersected[0];
      if (closest.distance > contactDistThreshold) continue; // Skip
      var intersectedWithinThreshold = intersected.filter( function(x) {
        return x.distance <= contactDistThreshold;
      });

      //console.log('closest', closest);

      // Don't remember what this is for (disable)
      // Check if there is a better intersection slightly before this one
      // if (intersectedWithinThreshold.length > 1) {
      //   raycasterOpposite.ray.origin.copy(closest.point);
      //   raycasterOpposite.ray.direction.copy(candidate.world.out);
      //   raycasterOpposite.ray.direction.negate();
      //   var intersectedOpposite = picker.getIntersectedForRay(raycasterOpposite, parents);
      //   if (intersectedOpposite.length > 0) {
      //     //console.log('intersectedOpposite', intersectedOpposite);
      //     for (var j = 1; j < intersectedWithinThreshold.length; j++) {
      //       var intersect1 = intersectedWithinThreshold[j];
      //       for (var k = 0; k < intersectedOpposite.length; k++) {
      //         var intersect2 = intersectedOpposite[k];
      //         if (intersect2.distance < contactDistThreshold) {
      //           if (intersect2.object === intersect1.object) {
      //             //console.log('Using intersectedOpposite', intersect1, intersect2);
      //             closest = intersect1;
      //             break;
      //           }
      //         } else {
      //           break;
      //         }
      //       }
      //     }
      //   }
      // }

      //console.log('closest', closest);
      var candidateNormOut = candidate.world.out.clone().negate();
      var norm = picker.getIntersectedNormal(closest);
      var normSim = candidateNormOut.dot(norm);
      closest.normSim = normSim;
      //console.log(closest);
      var childWorldBBFaceIndex = Object3DUtil.findClosestBBFaceByInNormal(norm);
      //var childWorldBBFaceDims = bbox.getFaceDims()[childWorldBBFaceIndex];
      var closestCandidate = {
        child: modelInstance? modelInstance.object3D : undefined,
        childInst: modelInstance? modelInstance : undefined,
        parent: closest.object,
        parentSurfaceNormal: norm,
        childWorldBBFaceIndex: childWorldBBFaceIndex,
        //childWorldBBFaceDims: childWorldBBFaceDims,
        parentAttachment: closest,
        childAttachment: candidate  // Candidate attachment point
      };
      if (isBetter(closestCandidate, best)) {
        best = closestCandidate;
        //console.log('updating best', best);
      }

      // Update acceptable candidates (next to)
      if (opts.includeAllCandidates) {
        for (var j = 0; j < intersectedWithinThreshold.length; j++) {
          var c = intersectedWithinThreshold[j];
          var norm = picker.getIntersectedNormal(c);
          if (c.normSim == undefined) {
            c.normSim = candidateNormOut.dot(norm);
          }
          childWorldBBFaceIndex = Object3DUtil.findClosestBBFaceByInNormal(norm);
          //childWorldBBFaceDims = bbox.getFaceDims()[childWorldBBFaceIndex];
          candidates.push({
            child: modelInstance? modelInstance.object3D : undefined,
            childInst: modelInstance? modelInstance : undefined,
            parent: c.object,
            parentSurfaceNormal: norm,
            childWorldBBFaceIndex: childWorldBBFaceIndex,
            //childWorldBBFaceDims: childWorldBBFaceDims,
            parentAttachment: c,
            childAttachment: candidate // Candidate attachment point
          });
        }
      }
    }
  }
  var res = {
    best: best
  };
  if (opts.includeAllCandidates) {
    res.candidates = candidates;
  }
  return res;
}

Attachments.identifyAttachments = identifyAttachments;

function identifyAttachment(parents, candidatesAttachments, opts) {
  // Returns best attachment
  var attachments = identifyAttachments(parents, candidatesAttachments, opts);
  if (attachments.best) {
    return attachments.best;
  }
}

Attachments.identifyAttachment = identifyAttachment;

// Exports
module.exports = Attachments;