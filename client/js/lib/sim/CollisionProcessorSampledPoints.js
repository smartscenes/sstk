var CollisionProcessorNull = require('sim/CollisionProcessorNull');
var Constants = require('Constants');
var MeshSampling = require('gfx/MeshSampling');
var VPTreeFactory = require('ds/VPTree');
var _ = require('util');

/**
 * Collision processor using point samples to determine collisions
 * @constructor
 * @extends CollisionProcessorNull
 * @memberOf sim
 * @param opts Configuration parameters for collision processing
 * @param [opts.nsamples=1000000] {int} Number of samples to generate
 **/
function CollisionProcessorSampledPoints(opts) {
  CollisionProcessorNull.call(this, opts);
  opts = _.defaultsDeep(Object.create(null), opts, {
    nsamples: 1000000 // default to one million samples
  });
  this.nsamples = opts.nsamples;
}
CollisionProcessorSampledPoints.prototype = Object.create(CollisionProcessorNull.prototype);
CollisionProcessorSampledPoints.prototype.constructor = CollisionProcessorSampledPoints;

CollisionProcessorSampledPoints.prototype.__prepareScene = function(sceneState, opts) {
  var sampledPoints = sceneState.__sampledPoints;
  if (!sampledPoints) {
    console.time('samplePoints');
    var object3D = (sceneState instanceof THREE.Object3D)? sceneState : sceneState.scene;
    object3D.updateMatrixWorld();
    sampledPoints = MeshSampling.sampleObject(object3D, this.nsamples, {
      weightFn: 'area',
      recursive: true,
      convertSample: function(s) { return s.worldPoint; },
      skipUVColors: true
    });
    sampledPoints = _.flatten(sampledPoints);
    sceneState.__sampledPoints = sampledPoints;
    console.timeEnd('samplePoints');
  }
  // TODO: Pull this standard metrics into VPTree
  if (opts['2dlinf'] && !sceneState.__sampledVPTree2DLInf) {
    console.time('buildVPTree2DLInf');
    sceneState.__sampledVPTree2DLInf = VPTreeFactory.build(sampledPoints, function (a, b) {
      var dx = a.x - b.x;
      var dz = a.z - b.z;
      return Math.max(Math.abs(dx), Math.abs(dz));
    });
    console.timeEnd('buildVPTree2DLInf');
  }
  if (opts['2dl2'] && !sceneState.__sampledVPTree2DL2) {
    console.time('buildVPTree2DL2');
    sceneState.__sampledVPTree2DL2 = VPTreeFactory.build(sampledPoints, function (a, b) {
      var dx = a.x - b.x;
      var dz = a.z - b.z;
      return Math.sqrt(dx * dx + dz * dz);
    });
    console.timeEnd('buildVPTree2DL2');
  }
  if (opts['3dl2'] && !sceneState.__sampledVPTree3DL2) {
    console.time('buildVPTree3DL2');
    sceneState.__sampledVPTree3DL2 = VPTreeFactory.build(sampledPoints, function(a,b) {
      return a.distanceTo(b);
    });
    console.timeEnd('buildVPTree3DL2');
  }
};

CollisionProcessorSampledPoints.prototype.isSpaceOccupied = function (sceneState, opts) {
  opts = opts || {};
  if (opts.shape === 'bbox') {
    this.__prepareScene(sceneState, { '2dlinf': true });
    var miny = (opts.min)? opts.min.y : (opts.center.y - opts.radius);
    var maxy = (opts.max)? opts.max.y : (opts.center.y + opts.radius);
    var points = sceneState.__sampledVPTree2DLInf.search(opts.center, 1, opts.radius, null, function(p) {
      return p.y >= miny && p.y <= maxy;
    });
    return points && points.length > 0;
  } else if (opts.shape === 'sphere') {
    this.__prepareScene(sceneState, { '3dl2': true });
    var points = sceneState.__sampledVPTree3DL2.search(opts.center, 1, opts.radius);
    return points && points.length > 0;
  } else if (opts.shape === 'cylinder') {
    this.__prepareScene(sceneState, { '2dl2': true });
    var miny = (opts.min)? opts.min.y : (opts.center.y - opts.height/2);
    var maxy = (opts.max)? opts.max.y : (opts.center.y + opts.height/2);
    var points = sceneState.__sampledVPTree2DL2.search(opts.center, 1, opts.radius, null, function(p) {
      return p.y >= miny && p.y <= maxy;
    });
    return points && points.length > 0;
  } else {
    throw 'Unsupported shape: ' + opts.shape;
  }
};

CollisionProcessorSampledPoints.prototype.isPositionAgentCanStandAt = function (sceneState, agent, pFeet, opts) {
  opts = opts || {};
  this.__prepareScene(sceneState, { '2dlinf': true });
  var targetRadius = (opts.radius || agent.radius) * Constants.metersToVirtualUnit;
  var bottomHeight = pFeet.y + this.traversableFloorHeight * Constants.metersToVirtualUnit;
  var topHeight = pFeet.y + agent.height * Constants.metersToVirtualUnit;
  var points = sceneState.__sampledVPTree2DLInf.search(pFeet, 1, targetRadius, null, function(p) {
    return p.y >= bottomHeight && p.y <= topHeight;
  });
  var occupied = points && points.length > 0;
  return !occupied;
};

module.exports = CollisionProcessorSampledPoints;
