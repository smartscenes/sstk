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
  var maxCandidates = opts.maxCandidates || Infinity;
  var maxCandidatesToCheck = opts.maxCandidatesToCheck || maxCandidates;
  var contactDistThreshold = opts.contactDistThreshold || (0.10 * Constants.metersToVirtualUnit);
  var modelInstance = modelInstWithCandidates.modelInstance;
  var candidatesAttachments = modelInstWithCandidates.attachments;
  var childModelId = modelInstance? modelInstance.model.info.fullId : null;
  var childObjectId = modelInstance? modelInstance.object3D.userData.id : null;

  function isBetter(cand, best, debug) {
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
      var bestModelInst = best.parentInst;
      var currentModelInst = cand.parentInst;
      var parentModelIdBest = bestModelInst? bestModelInst.model.info.fullId : null;
      var parentModelIdCurr = currentModelInst? currentModelInst.model.info.fullId : null;
      var modelIdSameBest = parentModelIdBest? parentModelIdBest === childModelId : false;
      modelIdSameCostBest = modelIdSameBest? opts.sameModelCost : 0;
      var modelIdSameCurr = parentModelIdCurr? parentModelIdCurr === childModelId : false;
      modelIdSameCostCurr = modelIdSameCurr? opts.sameModelCost : 0;
      //if (debug) console.log('modelIdSameCosts: ', modelIdSameCostBest, modelIdSameCostCurr);
    }
    if (Math.abs(intersected.distance - best.parentAttachment.distance) < contactDistThreshold*0.75) {
      if (Math.abs(intersected.normSim - best.parentAttachment.normSim) < 0.01) {
        if (opts.aggregatedSceneStatistics) {
          var ss = opts.aggregatedSceneStatistics;
          // Determine preferred normal and attachment based on object id/type (curtain to windows, etc)
          // Get parent child statistics for the object types
          var childIdAttachmentCounts = ss.getObjectIdChildAttachmentCounts();
          var counter = childIdAttachmentCounts.get([childModelId]);
          var total = counter? counter.sum : 0;
          var modelCats = modelInstance ? modelInstance.model.getCategories() : [];
          var selectedCat = null;
          while (total < 20 && modelCats.length) {
            var cat = modelCats[modelCats.length - 1];
            var childTypeAttachmentCounts = ss.getObjectTypeChildAttachmentCounts();
            counter = childTypeAttachmentCounts.get([cat]);
            total = counter? counter.sum : 0;
            selectedCat = cat;
          }
          if (total > 50) {
            var countThreshold = total * 0.1;
            var candAttachmentFace = ss.bbfaceIndexToAttachmentTypeIndex(cand.childAttachment.bbfaceIndex);
            var bestAttachmentFace = ss.bbfaceIndexToAttachmentTypeIndex(best.childAttachment.bbfaceIndex);
            var candCount = counter.get(candAttachmentFace);
            var bestCount = counter.get(bestAttachmentFace);
            //if (debug) console.log('got attachment priors for object', childObjectId, 'model', childModelId, selectedCat,
            //  'total', total, 'threshold', countThreshold,
            //  'cand', ss.getAttachmentType(candAttachmentFace), candCount,
            //  'best', ss.getAttachmentType(bestAttachmentFace), bestCount);
            if (candCount > (bestCount + countThreshold)) {
              //if (debug) console.log('select cand', childObjectId);
              return true;
            } else if (bestCount > (candCount + countThreshold)) {
              //if (debug) console.log('select best', childObjectId);
              return false;
            }
          }
        }
        // Favor big flat surfaces
        var candBBFaceDims = _.get(cand, ['childAttachment', 'world', 'faceDims']);
        var bestBBFaceDims = _.get(best, ['childAttachment', 'world', 'faceDims']);
        var candFaceMin = candBBFaceDims? Math.min(candBBFaceDims.x, candBBFaceDims.y) : 0;
        var bestFaceMin = bestBBFaceDims? Math.min(bestBBFaceDims.x, bestBBFaceDims.y) : 0;
        //if (debug) console.log('compare faces', childModelId, cand, candFaceMin, best, bestFaceMin);
        if (candFaceMin > bestFaceMin*5) {
          return true;
        } else if (bestFaceMin > candFaceMin*5) {
          return false;
        }
        // prefer world bottom attachment
        if (intersected.normal.dot(Constants.worldUp) > 0.99) {
          return true;
        } else if (best.parentSurfaceNormal.dot(Constants.worldUp) > 0.99) {
          return false;
        } else if (intersected.normal.dot(Constants.worldUp) < -0.99) {
          return false;
        } else if (best.parentSurfaceNormal.dot(Constants.worldUp) < -0.99) {
          return true;
        } else {
          var candFaceArea = candBBFaceDims? candBBFaceDims.x * candBBFaceDims.y : 0;
          var bestFaceArea = bestBBFaceDims? bestBBFaceDims.x * bestBBFaceDims.y : 0;
          //if (debug) console.log('compare faces', childModelId, cand, candFaceArea, best, bestFaceArea);
          if (candFaceArea > bestFaceArea*2) {
            return true;
          } else if (bestFaceArea > candFaceArea*2) {
            return false;
          }
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
  var raycasterOpposite = new THREE.Raycaster();
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

      //console.log('closest', childObjectId, closest);

      // Don't remember what this is for
      // Check if there is a better intersection slightly before this one
      // if (opts.checkOpposite && intersectedWithinThreshold.length > 1) {
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

      // console.log('closest', childObjectId, closest, intersectedWithinThreshold);
      // Compute normSim
      var candidateNormOut = candidate.world.out.clone().negate();
      for (var j = 0; j < intersectedWithinThreshold.length; j++) {
        var c = intersectedWithinThreshold[j];
        c.order = j;
        var norm = picker.getIntersectedNormal(c);
        if (c.normSim == undefined) {
          c.normSim = candidateNormOut.dot(norm);
        }
      }

      if (opts.disallowSameModelHorizontalAttachment && childModelId != null) {
        intersectedWithinThreshold = _.filter(intersectedWithinThreshold, function(intersect) {
          var parentInst = Object3DUtil.getModelInstance(intersect.object, true);
          if (parentInst && parentInst.model.info.fullId === childModelId) {
            if (childWorldBBFaceIndex === Constants.BBoxFaces.TOP || childWorldBBFaceIndex === Constants.BBoxFaces.BOTTOM) {
              return true;
            } else {
              console.log('filtering out potential support due to disallowSameModelHorizontalAttachment for ' +  childObjectId + ' and ' + intersect.object.userData.id);
              return false;
            }
          } else {
            return true;
          }
        });
      }
      // Group by object id
      var groupedByObjectId = _.groupBy(intersectedWithinThreshold, function(x) { return x.object.uuid; });
      var objectIds = _.keys(groupedByObjectId);
      objectIds = _.sortBy(objectIds, function(id) { return groupedByObjectId[id][0].order; });

      // Update acceptable candidates (next to)
      var nCandidates = Math.min(objectIds.length, maxCandidates);
      for (var k = 0; k < nCandidates; k++) {
        var objectId = objectIds[k];
        var intersectsForObject = groupedByObjectId[objectId];
        for (var j = 0; j < intersectsForObject.length; j++) {
          var c = intersectsForObject[j];
          var norm = picker.getIntersectedNormal(c);
          var childWorldBBFaceIndex = Object3DUtil.findClosestBBFaceByInNormal(norm);
          //childWorldBBFaceDims = bbox.getFaceDims()[childWorldBBFaceIndex];
          var parentInst = Object3DUtil.getModelInstance(c.object, true);
          var candidateToCheck = {
            child: modelInstance ? modelInstance.object3D : undefined,
            childInst: modelInstance ? modelInstance : undefined,
            parent: c.object,
            parentInst: parentInst,
            parentSurfaceNormal: norm,
            childWorldBBFaceIndex: childWorldBBFaceIndex,
            //childWorldBBFaceDims: childWorldBBFaceDims,
            parentAttachment: c,
            childAttachment: candidate // Candidate attachment point
          };
          if (k < maxCandidatesToCheck && isBetter(candidateToCheck, best, false)) {
            best = candidateToCheck;
            //console.log('updating best', childObjectId, best);
          }
          if (opts.includeCandidates) {
            candidates.push(candidateToCheck);
          }
        }
      }
    }
  }
  var res = {
    best: best
  };
  if (opts.includeCandidates) {
    candidates.sort(function(a,b) { return isBetter(a,b,false)? -1 : 1; });  // NOTE this compare is not necessarily valid
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