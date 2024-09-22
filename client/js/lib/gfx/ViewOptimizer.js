const Object3DUtil = require('geo/Object3DUtil');
const Sampler = require('math/Sampler');
const SceneUtil = require('scene/SceneUtil');
const RendererFactory = require('gfx/RendererFactory');
const _ = require('util/util');

/**
 * Interface for classes that scores viewpoints
 * @param opts
 * @interface
 * @memberOf gfx
 */
function ViewScorer(opts) {
}

/**
 * Specifies a range of values
 * @typedef {Object} RangeSpec
 * @property start {number} Start of range
 * @property end {number} End of range
 * @property n {int} Number of bins to bucket the range into
 * @property rangeSize {number} Extent of range (end - start, used to determine end if start is specified, but end is not)
 * @property step {number} For n steps, how many steps is needed to cover the range (range.end - range.start)/range.n
 **/

const ViewOptimizerDefaults = {
  'scoring': {
    'visibility': {
      threshold: 0.05,
      type: 'percent'                       /* percent or absolute number of pixels */
    }
  },
  'view': {
    phi: {start: 0, n: 4},                /* can be number or rangeSpec */
    theta: Math.PI / 4,                   /* can be number or rangeSpec */
    distanceScale: 2.0
  }
};

/**
 * Initializes the ViewScorer
 * @function
 * @param camera {THREE.Camera}
 */
ViewScorer.prototype.init = function(camera) {
};

/**
 * Returns a score for the current camera view
 * @param camera {THREE.Camera}
 * @param sceneState {scene.SceneState} Scene
 * @param targetObjs {THREE.Object3D[]} Objects to look at
 * @returns {number} How good the camera view point was
 */
ViewScorer.prototype.score = function(camera, sceneState, targetObjs) {
  return 0.0;
};

function keepDistance(object3D, currentPos, targetPos, distance) {
  // direction toward target
  var dir = targetPos.clone().sub(currentPos).normalize();
  var c = getCollision(object3D, currentPos, dir);
  // Try to be d distance away from object3D or from target point
  var curDistance = c? c.distance : currentPos.distanceTo(targetPos);
  // Need to move this much in direction toward target
  var delta = curDistance - distance;
  var res = currentPos.clone().addScaledVector(dir, delta);
  var p = c? c.getContactPoint : targetPos;
  return {
    point: res,
    contact: p
  };
}

function getCollision(objects, point, dir, raycaster) {
  if (!Array.isArray(objects)) {
    objects = [objects];
  }
  // 1. Aim the ray from point to dir.
  var raycaster = raycaster || new THREE.Raycaster();
  raycaster.set(point, dir);
  var intersects = raycaster.intersectObjects(objects, true);
  if (intersects && intersects.length > 0) {
    return intersects[0];
  }
}

// Returns collision from point to target with some filtering
function collisionsBetween(objects, point, target, filter, raycaster) {
  var ZERO_TOLERANCE = 0.00000001;
  var distanceToTarget = point.distanceTo(target);
  var myfilter = function(r) {
    if (r.distance > ZERO_TOLERANCE && r.distance < distanceToTarget) {
      return (!filter || filter(r));
    } else {
      return false;
    }
  };
  return collisionsFrom(objects, point, target, myfilter, raycaster);
}

// Returns collision from point to target
function collisionsFrom(objects, point, target, filter, raycaster) {
  if (!Array.isArray(objects)) {
    objects = [objects];
  }

  // 1. Aim the ray from point to dir.
  var dir = target.clone().sub(point).normalize();
  var raycaster = raycaster || new THREE.Raycaster();
  raycaster.set(point, dir);
  var intersects = raycaster.intersectObjects(objects, true);
  if (intersects && intersects.length > 0) {
    if (filter) {
      return intersects.filter(filter);
    } else {
      return intersects;
    }
  }
}

function findPositionWithVisibleTargets(opts) {
  var scene = opts.scene;
  var currentPos = opts.position;
  var targetObjs = opts.targets;

  // direction toward target
  var bbox = Object3DUtil.getBoundingBox(targetObjs);
  var bbcenter = bbox.centroid();
  var dir = opts.dir || bbcenter.clone().sub(currentPos).normalize();

  var MeshHelpers = require('geo/MeshHelpers');
  var bbNode = new MeshHelpers.BoxMinMax(bbox.min, bbox.max, 'gray');
  bbNode.updateMatrixWorld();
  var collision = getCollision(bbNode, currentPos, dir);
  var bbpoint = (collision)? collision.point : bbcenter;
  var distanceFromCenter = currentPos.distanceTo(bbcenter);
  // See what is between us and the target
  // do ray from bbpoint to currentPos and get the first contact point
  var collisions = collisionsBetween(scene, bbpoint, currentPos,
    function(x) { return !Object3DUtil.isDescendantOf(x.object, targetObjs, true); });
  if (collisions && collisions.length > 0) {
    return {
      position: collisions[0].point,
      distance: collisions[0].distance,
      originalDistanceFromCenter: distanceFromCenter,
      target: bbpoint
    };
  }
}

function SimpleViewScorer(opts) {
  ViewScorer.call(this, opts);
}

SimpleViewScorer.prototype = Object.create(ViewScorer.prototype);
SimpleViewScorer.prototype.constructor = SimpleViewScorer;

SimpleViewScorer.prototype.score = function(camera, sceneState, targetObjs) {
  // Check if target object visible from view
  // TODO: count proportion of object visible
  if (!Array.isArray(targetObjs)) {
    targetObjs = [targetObjs];
  }
  var pos = Object3DUtil.getBoundingBox(targetObjs).centroid();
  var direction = (pos.clone().sub(camera.position)).normalize();
  var raycaster = new THREE.Raycaster(camera.position, direction);
  var intersects = raycaster.intersectObjects(sceneState.fullScene.pickables, true);
  if (intersects.length > 0) {
    var firstIntersected = intersects[0].object;
    for (var i = 0; i < targetObjs.length; i++) {
      if (Object3DUtil.isDescendantOf(firstIntersected, targetObjs[i], true)) {
        return 1.0;
      }
    }
  }
  return 0.0;
};

function OffscreenScorer(opts) {
  opts = opts || {};
  ViewScorer.call(this, opts);
  this.maxWidth = opts.maxWidth;
  this.maxHeight = opts.maxHeight;
  this.__offscreenRenderer = opts.renderer || this.__getOffscreenRenderer(opts);
  this.__options = _.defaultsDeep(Object.create(null), opts.scoring || {}, ViewOptimizerDefaults.scoring);
}

OffscreenScorer.prototype = Object.create(ViewScorer.prototype);
OffscreenScorer.prototype.constructor = OffscreenScorer;

OffscreenScorer.prototype.init = function(camera) {
  this.__updateSize(camera);
};

OffscreenScorer.prototype.__setSize = function(width, height) {
  //console.log('setSize: ' + width + 'x' + height);
  this.__getOffscreenRenderer().setSize(width, height);
};

OffscreenScorer.prototype.__updateSize = function(camera) {
  if (this.maxWidth || this.maxHeight) {
    var width1 = this.maxWidth;
    var height1 = Math.round(this.maxWidth / camera.aspect);
    var width2 = Math.round(this.maxHeight * camera.aspect);
    var height2 = this.maxHeight;
    if (width2 < width1 || height2 < height1) {
      this.__setSize(width2, height2);
    } else {
      this.__setSize(width1, height1);
    }
  }
};

OffscreenScorer.prototype.__getOffscreenRenderer = function(opts) {
  if (!this.__offscreenRenderer) {
    this.__offscreenRenderer = RendererFactory.createOffscreenRenderer({
      camera: opts.camera,
      width: opts.width,
      height: opts.height
    });
  }
  return this.__offscreenRenderer;
};

OffscreenScorer.prototype.score = function(camera, sceneState, targetObjs) {
  var options = this.__options;
  // Slightly hacky
  if (!Array.isArray(targetObjs)) {
    targetObjs = [targetObjs];
  }
  var getId = function(x) { return x.id; };
  //var getId = function(object) { return object.userData.id; };
  var objCounts = SceneUtil.getPixelCounts(sceneState, {
    getId: getId,
    targetObjects: targetObjs,
    colorBy: 'objectId',
    renderer: this.__offscreenRenderer,
    camera: camera
  });
  var targetObjIds = targetObjs.map(getId);
  var thresh = (options.visibility.type === 'percent')? objCounts.nPixels * options.visibility.threshold : options.visibility.threshold;
  var targetObjCounts = targetObjIds.map(function(id) { return objCounts.counts[id] || 0; });
  var totalPixelsWithTargetObjs = _.sum(targetObjCounts);
  var nTargetObjsVisible = _.filter(targetObjCounts, function(c) { return c >= thresh; }).length;
  var score = totalPixelsWithTargetObjs/objCounts.nPixels + nTargetObjsVisible/targetObjs.length;
  return score;
};

function createScorer(params) {
  var scorer = params.scorer;
  var scorerType = 'offscreen';
  if (typeof params.scorer === 'string') {
    scorerType = params.scorer;
    scorer = null;
  }
  if (scorerType === 'simple') {
    return new SimpleViewScorer();
  } else {
    return new OffscreenScorer({
      camera: params.cameraControls.camera,
      renderer: params.renderer,
      maxWidth: params.maxWidth,
      maxHeight: params.maxHeight,
      width: params.width,
      height: params.height
    });
  }
}

/**
 * View optimizer
 * @param params Configuration for the view optimizer
 * @param [params.scorer] {ViewScorer|string} Viewer scorer or scorer type ('offscreen' or 'simple')
 * @constructor
 * @memberOf gfx
 */
function ViewOptimizer(params) {
  this.cameraControls = params.cameraControls;
  this.scorer = createScorer(params);
}

/**
 * Samples some views
 * @param options
 * @param options.targetBBox {geo.BBox}
 * @param options.sceneState
 * @param options.target
 * @param options.nsamples {int} Number of samples
 * @param options.rng {math.RNG} Random number generator
 * @param [options.viewGenerator] Generator with generate() function for generating stream of views
 * @returns {{targetBBox: BBox, theta: number, phi: number, score: number}}
 */
ViewOptimizer.prototype.sample = function(options) {
  var scope = this;
  function scorer(view) {
    if (view.score == undefined) {
      scope.cameraControls.viewTarget(view);
      view.score = scope.scorer.score(scope.cameraControls.camera, options.sceneState, options.target);
    }
    return view.score;
  }

  this.scorer.init(this.cameraControls.camera);
  var views = options.viewGenerator.generate();
  var sampler = new Sampler({ rng: options.rng });
  return sampler.sample(_.merge({ elements: views, scorer: scorer }, _.pick(options, ['nsamples'])));
};

/**
 * Find and returns the best view parameters
 * @param options
 * @param options.targetBBox {geo.BBox}
 * @param options.sceneState
 * @param options.target
 * @param [options.viewGenerator] Generator with generate() function for generating stream of views
 * @param [options.phi=[0,Math.PI x 2]] {number|RangeSpec}
 * @param [options.theta=Math.PI/4] {number|RangeSpec}
 * @param [options.keepTargetsVisible] {boolean}
 * @param [options.scoredViews] {Array}
 * @param [options.minScore=0] {number}
 * @returns {{targetBBox: BBox, theta: number, phi: number, score: number}}
 */
ViewOptimizer.prototype.optimize = function(options) {
  if (options.viewGenerator) {
    this.scorer.init(this.cameraControls.camera);
    var views = options.viewGenerator.generate();
    var minScore = options.minScore || 0;
    var next = views.next();
    var best = undefined;
    while (next && !next.done) {
      var opts = next.value;
      this.cameraControls.viewTarget(opts);
      opts.score = this.scorer.score(this.cameraControls.camera, options.sceneState, options.target);
      if (options.scoredViews && opts.score > minScore) {
        options.scoredViews.push(opts);
      }
      //console.log('Got score: ' + opts.score + ', best so far ', best);
      if (!best || opts.score > best.score) {
        best = opts;
      }
      next = views.next();
    }
    return best;
  } else {
    return this.__optimizeRotatingViewsForDistances(options);
  }
};

function getRangeSpecification(value, defaults) {
  if (_.isNumber(value)) {
    return { start: value, end: value, step: 0, n: 1 };
  } else {
    var range = {start: value.start, end: value.end, step: value.step, n: value.n};
    if (range.start == null) {
      range.start = defaults.start;
    }
    var inferN = range.n == null;
    var inferStep = range.step == null;
    if (range.n == null && range.step == null) {
      // Take these values from defaults
      range.n = defaults.n;
      range.step = defaults.step;
    }
    if (range.end == null) {
      if (range.n === 1) {
        range.end = range.start;
      } else {
        range.end = range.start + defaults.rangeSize;
      }
    }
    if (inferN && range.step) {
      range.n = Math.floor((range.end - range.start) / (range.step) + 1);
    } else if (inferStep && range.n != null) {
      range.step = (range.end - range.start)/range.n;
    }
    return range;
  }
}
/**
 * Find and returns the best view parameters
 * @param options
 * @param options.targetBBox {geo.BBox}
 * @param options.sceneState
 * @param options.target
 * @param [options.phi=[0,Math.PI x 2]] {number|RangeSpec}
 * @param [options.theta=Math.PI/4] {number|RangeSpec}
 * @param [options.keepTargetsVisible] {boolean}
 * @param [options.scoredViews] {Array}
 * @param [options.minScore=0] {number}
 * @returns {{targetBBox: BBox, theta: number, phi: number, score: number}}
 */
ViewOptimizer.prototype.__optimizeRotatingViews = function(options) {
  // iterate over theta and phi
  this.scorer.init(this.cameraControls.camera);
  var thetaRange = getRangeSpecification(options.theta, {start: Math.PI / 4, end: Math.PI / 4, n: 1, rangeSize: Math.PI*2});
  var phiRange = getRangeSpecification(options.phi, {start: 0, end: Math.PI * 2, n: 8, rangeSize: Math.PI*2});
  var best;
  var minScore = options.minScore || 0;
  for (let itheta = 0, theta = thetaRange.start; itheta < thetaRange.n; theta += thetaRange.step, itheta++) {
    for (let iphi = 0, phi = phiRange.start; iphi < phiRange.n; phi += phiRange.step, iphi++) {
      var opts = {
        targetBBox: options.targetBBox,
        theta: theta,
        phi: phi
      };
      this.cameraControls.viewTarget(opts);
      opts.score = this.scorer.score(this.cameraControls.camera, options.sceneState, options.target);
      if (options.scoredViews && opts.score > minScore) {
        options.scoredViews.push(opts);
      }
      //console.log('Got score: ' + opts.score + ', best so far ', best);
      if (!best || opts.score > best.score) {
        best = opts;
      }
      if (opts.score < 0.05 && options.keepTargetsVisible) {
        var res = findPositionWithVisibleTargets({
          scene: options.sceneState.scene,
          position: this.cameraControls.camera.position,
          targets: options.target
        });
        if (res) {
          var opts2 = {position: res.position, target: res.target};
          this.cameraControls.viewTarget(opts2);
          // Add distance penalty
          var distPenaltyUnscaled = res.distance / res.originalDistanceFromCenter;

          opts2.score = this.scorer.score(this.cameraControls.camera, options.sceneState, options.target) * distPenaltyUnscaled;
          //console.log('Got score2: ' + opts2.score + ', best so far ', best, res);
          if (!best || opts2.score > best.score) {
            best = opts2;
          }
          if (options.scoredViews && opts.score > minScore) {
            options.scoredViews.push(opts2);
          }
        }
      }
    }
  }
  return best;
};

ViewOptimizer.prototype.__optimizeRotatingViewsForDistances = function(options) {
  // iterate over distanceScale
  var best;
  var distRange = getRangeSpecification(options.distanceScale, { n: 1 });
  var targetBBox = options.targetBBox;
  for (let idist = 0, dist = distRange.start; idist < distRange.n; dist += distRange.step, idist++) {
    // console.log('use distance scale', dist, distRange);
    const bbox = targetBBox.clone();
    bbox.scaleBy(dist);
    options.targetBBox = bbox;
    const b = this.__optimizeRotatingViews(options);
    if (!best || b.score > best.score) {
      best = b;
    }
  }
  options.targetBBox = targetBBox;
  return best;
};


ViewOptimizer.prototype.select = function(scoredViews, n) {
  scoredViews = _.sortBy(scoredViews, s => -s.score);
  const selected = _.take(scoredViews, n);
  return selected;
};

ViewOptimizer.prototype.lookAt = function(sceneState, objects, viewOpts) {
  // TODO: Find a good view point of looking at the object
  console.time('lookAt');
  viewOpts = _.defaults(Object.create(null), viewOpts || {}, ViewOptimizerDefaults.view);
  var bbox = Object3DUtil.getBoundingBox(objects);
  // Limit this by the size of the scene
  var opt = this.optimize({
    sceneState: sceneState,
    target: objects,
    targetBBox: bbox,
    phi: viewOpts.phi,
    theta: viewOpts.theta,
    distanceScale: viewOpts.distanceScale,
    scoredViews: viewOpts.scoredViews,
    minScore: viewOpts.minScore
  });
  // TODO: Improve optimization and scoring
  if (opt.score < 0.05) {
    var opt2 = this.optimize({
      sceneState: sceneState,
      target: objects,
      targetBBox: bbox,
      phi: { start: viewOpts.phi.start + Math.PI / viewOpts.phi.n, n: viewOpts.phi.n },
      theta: viewOpts.theta,
      distanceScale: viewOpts.distanceScale,
      scoredViews: viewOpts.scoredViews,
      minScore: viewOpts.minScore
    });
    if (opt2.score > opt.score) {
      opt = opt2;
    }
  }
  if (opt.score < 0.01) {
    var opt2 = this.optimize({
      sceneState: sceneState,
      target: objects,
      targetBBox: bbox,
      phi: { start: viewOpts.phi.start + Math.PI / viewOpts.phi.n, n: viewOpts.phi.n * 2 },
      theta: viewOpts.theta,
      distanceScale: viewOpts.distanceScale,
      keepTargetsVisible: true,
      scoredViews: viewOpts.scoredViews,
      minScore: viewOpts.minScore
    });
    if (opt2.score > opt.score) {
      opt = opt2;
    }
  }
  console.timeEnd('lookAt');
  return opt;
};

module.exports = ViewOptimizer;