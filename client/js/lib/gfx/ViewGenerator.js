var Object3DUtil = require('geo/Object3DUtil');
var BBox = require('geo/BBox');
var Constants = require('Constants');
var _ = require('util/util');


/**
 * Generate appropriate camera parameters for different types of views
 * @constructor
 * @param params Configuration parameters
 * @param [params.cameraPositionStrategy=`positionToFit`] {string} General camera position strategy to use
 *    (values are `positionToFit`, `positionByDistance`, `positionByCentroid`, `positionToFixedResolution`, `positionByBBoxOffset`)
 *    Used for computing view points for bounding boxes.
 * @param params.camera {THREE.Camera} Reference camera from which fov and aspect ratio is currently taken (used for computing views for 'positionToFit')
 * @memberOf gfx
 */
function ViewGenerator(params) {
  params = params || {};
  this.defaultDistanceScale = 1.0;
  this.cameraPositionStrategy = params.cameraPositionStrategy || 'positionToFit';
  this.camera = params.camera;
}

ViewGenerator.prototype.getDefaultView = function (bbox) {
  // default view position from +y, -z (looks at front from slightly top-down view)
  return this.getBBoxViewFromOffsetPosition('default', bbox, [ 0, 1, -1 ], [ 0, 1, -0.25 ]);
};

/**
 * Generate a view targeting the centroid of a bbox and positioned from a particular offset (given by multiples of bbox dimensions)
 * @param name {string} view name
 * @param bbox {geo.BBox} target bounding box
 * @param offsetByDim {Array} offset factor (add to centroid dimension of bounding box scaled by this factor)
 * @param padByMaxDim {Array} pad factor (add to centroid max dimension of bounding box scaled by this factor)
 * @returns {{name, position, target, up}}
 */
ViewGenerator.prototype.getBBoxViewFromOffsetPosition = function (name, bbox, offsetByDim, padByMaxDim) {
  var centroid = bbox.centroid().toArray();
  var dims = bbox.dimensions().toArray();
  var maxDim = Math.max(dims[0], dims[1], dims[2]);
  var eye = [
    centroid[0] + (offsetByDim[0] * dims[0] / 2) + (padByMaxDim[0] * maxDim),
    centroid[1] + (offsetByDim[1] * dims[1] / 2) + (padByMaxDim[1] * maxDim),
    centroid[2] + (offsetByDim[2] * dims[2] / 2) + (padByMaxDim[2] * maxDim)
  ];
  return {
    name: name || ('bboxOffsetPosition-' + JSON.stringify(offsetByDim) + '-' + JSON.stringify(padByMaxDim)),
    position: eye,
    target: centroid,
    up: [ 0, 1, 0 ]
  };
};

/**
 * @typedef {Object} ViewGenerator.ViewOptions
 * @memberOf gfx
 * @property opts.name {string} view name
 * @property opts.target {THREE.Object3D|geo.BBox|THREE.Vector3} target object/bounding box/point to look at
 * @property [opts.viewIndex] {int} Prespecified views (1=left,2=right,3=bottom,4=top,5=front,6=back)
 * @property [opts.theta] {number} angle from horizontal in radians (latitude), must be specified if viewIndex is not specified
 * @property [opts.phi] {number} rotation from front in radians (longitude), must be specified if viewIndex is not specified
 * @property [opts.dists] {THREE.Vector3|number} distance from bounding box
 */

/**
 * Returns camera parameters for looking at a target
 * @param opts {gfx.ViewGenerator.ViewOptions} View parameters
 * @returns {{name, position, target, up, fov, near, far}}
 */
ViewGenerator.prototype.getView = function (opts) {
  var obj = opts.target;
  if (opts.viewIndex != undefined && opts.phi == undefined && opts.theta == undefined) {
    var thetaPhi = Constants.BBoxFacesThetaPhi[opts.viewIndex-1];
    if (thetaPhi) {
      opts = _.merge(Object.create(null), opts, {theta: thetaPhi[0], phi: thetaPhi[1] });
    }
  }
  if (obj instanceof THREE.Object3D) {
    var bbox = Object3DUtil.getBoundingBox(obj);
    return this.getViewForBBox(_.merge(Object.create(null), opts, { target: bbox }));
  } else if (obj instanceof BBox) {
    return this.getViewForBBox(opts);
  } else if (obj instanceof THREE.Vector3) {
    return this.getViewForPoint(opts.name, obj, opts.theta, opts.phi, opts.dists);
  } else {
    console.warn('Cannot get view for object ' + typeof obj);
  }
};

ViewGenerator.prototype.__getDistsFromBBoxCenter = function(bbox, dists, cameraPositionStrategy) {
  cameraPositionStrategy = cameraPositionStrategy || this.cameraPositionStrategy;
  if (!dists || typeof dists === 'number') {
    var dims = bbox.dimensions();
    var maxDim = Math.max(dims.x, dims.y, dims.z);
    var distanceScale = dists || this.defaultDistanceScale;
    if (cameraPositionStrategy === 'positionToFit') {
      var d = this.__getDistsToFitBBox(bbox);
      dists = new THREE.Vector3(dims.x / 2 + d[0],dims.y / 2 + d[1],dims.z / 2 + d[2]);
    } else if (cameraPositionStrategy === 'positionByDistance') {
      var d = maxDim * distanceScale;
      dists = new THREE.Vector3(dims.x / 2 + d,dims.y / 2 + d,dims.z / 2 + d);
    } else if (cameraPositionStrategy === 'positionByCentroid') {
      var d = maxDim * distanceScale;
      dists = new THREE.Vector3(d, d, d);
    }
  }
  return dists;
};

ViewGenerator.prototype.__getDistsFromBBoxFaces = function(bbox, dists, cameraPositionStrategy) {
  cameraPositionStrategy = cameraPositionStrategy || this.cameraPositionStrategy;
  if (!dists || typeof dists === 'number') {
    var dims = bbox.dimensions();
    var maxDim = Math.max(dims.x, dims.y, dims.z);
    var distanceScale = dists || this.defaultDistanceScale;
    if (cameraPositionStrategy === 'positionToFit') {
      var d = this.__getDistsToFitBBox(bbox);
      dists = new THREE.Vector3(d[0], d[1], d[2]);
    } else if (cameraPositionStrategy === 'positionByDistance') {
      var d = maxDim * distanceScale;
      dists = new THREE.Vector3(d, d, d);
    } else if (cameraPositionStrategy === 'positionByCentroid') {
      var d = maxDim * distanceScale;
      dists = new THREE.Vector3(d - dims.x / 2, d - dims.y / 2, d - dims.z / 2);
    }
  }
  return dists;
};

/**
 * Returns a good view for an axis aligned bounding box
 * @param opts View parameters
 * @param opts.name {string} view name
 * @param opts.bbox {geo.BBox} axis aligned bounding box
 * @param opts.theta {number} angleFromHorizontal (latitude)
 * @param opts.phi {number} rotation from front (longitude)
 * @param [opts.dists] {THREE.Vector3|number} distance from bounding box
 * @param [opts.cameraPositionStrategy] {string} Optional camera position strategy (overrides `this.cameraPositionStrategy`)
 * @param [opts.objectDepth] {number} depth of target in view frustum in meters (far - near, for 'positionToFixedResolution'))
 * @param [opts.imageHeight] {number} maximum image height in meters (for 'positionToFixedResolution'))
 * @param [opts.pixelWidth] {number}  width of single pixel in image plane in meters (for 'positionToFixedResolution'))
 * @param [opts.useSquareImage] {boolean} Whether image should be square (for 'positionToFixedResolution')
 * @param [opts.offsetByDim] {Array} offset camera by this multiple of bounding box dimensions (for 'positionByBBoxOffset')
 * @param [opts.padByMaxDim] {Array} offset camera by this multiple of maximum bounding box dimensions (for 'positionByBBoxOffset')
 * @returns {{name, position, target, up, fov, near, far}}
 */
ViewGenerator.prototype.getViewForBBox = function (opts) {
  // Find a good view point based on the scene bounds
  var bbox = opts.target;
  var cameraPositionStrategy = opts.cameraPositionStrategy || this.cameraPositionStrategy;
  if (cameraPositionStrategy === 'positionToFixedResolution') {
    return this.getFixedResolutionViewForBBox(opts.name, bbox, opts.objectDepth, opts.imageHeight, opts.pixelWidth, opts.theta, opts.phi, opts.useSquareImage);
  } else if (cameraPositionStrategy === 'positionByBBoxOffset') {
    return this.getBBoxViewFromOffsetPosition(opts.name, bbox, opts.offsetByDim, opts.padByMaxDim);
  } else {
    var dists = this.__getDistsFromBBoxCenter(bbox, opts.dists, cameraPositionStrategy);
    return this.getViewForPoint(opts.name, bbox.centroid(), opts.theta, opts.phi, dists);
  }
};

/**
 * Get camera frustum params (fov, near, far) for target object of depth objectDepth m in frustum view direction
 * maximum image plane width objectWidth in meters, and maximum perspective width of pixelWidth for objectDepth tall plane
 * @param objectDepth {number} target object depth in frustum view direction in meters
 * @param objectWidth {number} maximum image plane width in meters
 * @param pixelWidth {number} maximum perspective width in pixels for objectDepth
 * @param [eps=0.01m] {number}
 * @returns {{fov: *, near: number, far: *}}
 */
ViewGenerator.prototype.getFrustumParams = function(objectDepth, objectWidth, pixelWidth, eps) {
  eps = eps || (Constants.metersToVirtualUnit * 0.01);
  var fov = 2 * Math.atan(pixelWidth / objectDepth);
  var objectWidthFar = 2 * (pixelWidth + (objectWidth / 2));
  var far = objectWidthFar * objectDepth / (2 * pixelWidth) + eps;
  var near = far - objectDepth - eps;
  return { fov: THREE.MathUtils.radToDeg(fov), near: near, far: far };
};

ViewGenerator.prototype.__getViewBBoxDims = function(dims, theta, phi) {
  var st = Math.abs(Math.sin(theta));
  var ct = Math.abs(Math.cos(theta));
  var sp = Math.abs(Math.sin(phi));
  var cp = Math.abs(Math.cos(phi));

  // 0,0 --> x,y,z (for w,h,d)
  // 0, PI/2 --> z,y,x
  // PI/2,0 --> x,z,y
  var w = cp*dims.x + sp*dims.z;
  var h = ct*dims.y + st*(sp*dims.x + cp*dims.z);
  var d = st*dims.y + ct*(sp*dims.x + cp*dims.z);
  return [w,h,d];
};

/**
 * Returns camera parameters for a fixed resolution view of a bbox
 * @example
 *  var viewGen = new ViewGenerator({ camera: scope.camera });
 *  var view = viewGen.getFixedResolutionViewForBBox('view', scope.getSceneBoundingBox(), 1, 10, 0.01);  // 1m tall, 10m wide, 1cm pixels
 *  scope.cameraControls.viewTarget(view);
 * @param name {string} id for generated view
 * @param bbox {geo.BBox} target bounding box
 * @param [objectDepth] {number} depth of target in view frustum in m (far - near)
 * @param [imageHeight] {number} maximum image height in m
 * @param pixelWidth {number} width of single pixel in image plane in m
 * @param theta {number} angleFromHorizontal (latitude in rad)
 * @param phi {number} rotation from front (longitude in rad)
 * @param [useSquareImage=false] {boolean} Whether to have a square image or not
 * @returns {{name, position, target, up, fov, near, far}}
 */
ViewGenerator.prototype.getFixedResolutionViewForBBox = function (name, bbox, objectDepth, imageHeight, pixelWidth, theta, phi, useSquareImage) {
  pixelWidth = pixelWidth || 0.01;  // 1cm
  theta = (theta != undefined)? theta : (Math.PI / 2);
  phi = (phi != undefined)? phi : 0;

  var dims = bbox.dimensions();
  var viewDims = this.__getViewBBoxDims(dims, theta, phi);
  //console.log('got viewDims', viewDims, theta, phi);
  var imageHeightVU;
  if (!imageHeight) {  // Find a good view point based on the scene bounds
    var width = useSquareImage? Math.max(viewDims[0], viewDims[1]) : viewDims[1];
    imageHeightVU = width * this.defaultDistanceScale;  // maximum image dimension in virtual units
  } else {
    imageHeightVU = imageHeight * Constants.metersToVirtualUnit;  // rescale from meters to virtual units
  }

  var objectDepthVU = objectDepth? (objectDepth * Constants.metersToVirtualUnit) : (viewDims[2] * this.defaultDistanceScale);
  var params = this.getFrustumParams(objectDepthVU, imageHeightVU, pixelWidth * Constants.metersToVirtualUnit);
  var dists = new THREE.Vector3(params.far - objectDepthVU/2, params.far - objectDepthVU/2, params.far - objectDepthVU/2);
  var viewOpts = this.getViewForPoint(name, bbox.centroid(), theta, phi, dists, params.fov, params.near, params.far);
  viewOpts.imageHeightMeters = imageHeightVU / Constants.metersToVirtualUnit;
  viewOpts.objectDepthMeters = objectDepthVU / Constants.metersToVirtualUnit;
  viewOpts.pixelWidthMeters = pixelWidth;
  viewOpts.imageSize = useSquareImage?
    [
      Math.ceil(viewOpts.imageHeightMeters / viewOpts.pixelWidthMeters),
      Math.ceil(viewOpts.imageHeightMeters / viewOpts.pixelWidthMeters)
    ] :
    [
      Math.ceil((viewDims[0] / Constants.metersToVirtualUnit) / viewOpts.pixelWidthMeters),
      Math.ceil((viewDims[1] / Constants.metersToVirtualUnit) / viewOpts.pixelWidthMeters)
    ];
  return viewOpts;
};

/**
 * Returns camera parameters for looking at a point
 * @param name {string} view name
 * @param target {THREE.Vector3} target point to look at
 * @param theta {number} angleFromHorizontal (latitude in rad)
 * @param phi {number} rotation from front (longitude in rad)
 * @param [dists] {THREE.Vector3|number} distance from bounding box
 * @param [fov] {number} field of view
 * @param [near] {number}
 * @param [far] {number}
 * @returns {{name, position, target, up, fov, near, far}}
 */
ViewGenerator.prototype.getViewForPoint = function (name, target, theta, phi, dists, fov, near, far) {
  var ry = dists.y;
  var rz = dists.z * Math.cos(phi) * (-1);
  var rx = dists.x * Math.sin(phi);
  var camX = target.x + (rx * Math.cos(theta));
  var camY = target.y + (ry * Math.sin(theta));
  var camZ = target.z + (rz * Math.cos(theta));

  var eye = [camX, camY, camZ];
  var up = Constants.worldUp.clone();
  var camVec = new THREE.Vector3(target.x - camX, target.y - camY, target.z - camZ);
  var lookatUp;
  var dot = Math.abs(camVec.normalize().dot(up));
  if (dot > 0.95) {
    lookatUp = Constants.worldFront.clone().negate();
  }
  return {
    name: name,
    position: eye,
    target: target,
    lookatUp: lookatUp,
    up: up,
    fov: fov,
    near: near,
    far: far
  };
};

/**
 * Generate views with varying theta and phi
 * @param target {THREE.Object3D|geo.BBox|THREE.Point}
 * @param thetaRange {Range|number}
 * @param phiRange {Range|number}
 * @returns {Array}
 */
ViewGenerator.prototype.generateRotatingViews = function (target, thetaRange, phiRange) {
  var views = [];
  if (_.isNumber(thetaRange)) { thetaRange = { start: thetaRange, end: thetaRange + 1, step: 1 }; }
  if (_.isNumber(phiRange)) { phiRange = { start: phiRange, end: phiRange + 1, step: 1 }; }
  for (var theta = thetaRange.start; theta < thetaRange.end; theta += thetaRange.step) {
    for (var phi = phiRange.start; phi < phiRange.end; phi += phiRange.step) {
      var view = this.getView({ name: 'view-' + theta + '-' + phi, target: target, theta: theta, phi: phi});
      views.push(view);
    }
  }
  return views;
};


// TODO: Cleanup following functions

/**
 * Generate canonical views for looking at a bounding box
 * @param bbox {geo.BBox}
 * @param width {number}
 * @param height {number}
 * @returns {Array}
 */
ViewGenerator.prototype.generateViewsForBBox = function (bbox, width, height) {
  // TODO: Make this function respect cameraPositioningStrategy
  var basicViews = this.__generateBasicViewsForBBoxToFit(bbox, width, height);
  var defaultView = this.getDefaultView(bbox);
  var views = [];
  views.push(defaultView);
  views = views.concat(basicViews);
  return views;
};

// TODO: Make this function more general
ViewGenerator.prototype.generateViews = ViewGenerator.prototype.generateViewsForBBox;

ViewGenerator.prototype.__generateBasicViewsForBBoxWithDistScale = function (bbox, distScale) {
  if (!distScale) {
    // Some default distance scale
    distScale = this.defaultDistanceScale;
  }
  // Find a good view point based on the scene bounds
  var dims = bbox.dimensions().toArray();
  var maxDim = Math.max(dims[0], dims[1], dims[2]);
  var dists = [maxDim * distScale, maxDim * distScale, maxDim * distScale];
  return this.__generateBasicViewsForBBoxWithDists(bbox, dists);
};

ViewGenerator.prototype.__generateBasicViewsForBBoxToFit = function (bbox, width, height) {
  // Find a good view point based on the scene bounds
  var dists = this.__getDistsToFitBBox(bbox, width, height);
  return this.__generateBasicViewsForBBoxWithDists(bbox, dists);
};

/**
 * Returns distance to fit giving bounding box in view
 * @private
 */
ViewGenerator.prototype.__getDistsToFitBBox = function (bbox, width, height) {
  var dims = bbox.dimensions().toArray();
  var aspectRatio = (width > 0 && height > 0) ? width / height : this.camera.aspect;
  var maxDims = [
      Math.max(dims[2] / aspectRatio, dims[1]),
      Math.max(dims[0] / aspectRatio, dims[2]),
      Math.max(dims[0] / aspectRatio, dims[1])
  ];
  var tanFov = Math.tan((Math.PI / 180) * this.camera.fov / 2);
  var dists = maxDims.map(function (m) {
      return 0.5 * m / tanFov;
  });
  return dists;
};

/**
 * Generate 6 canonical views for a bounding box with given distances
 * @param bbox
 * @param dists
 * @returns {Array}
 * @private
 */
ViewGenerator.prototype.__generateBasicViewsForBBoxWithDists = function (bbox, dists) {
  // Find a good view point based on the scene bounds
  var centroid = bbox.centroid().toArray();
  var bbMin = bbox.min.toArray();
  var bbMax = bbox.max.toArray();

  var lookAt = centroid;
  var up = [0, 1, 0];
  var camPositions = [
    [bbMin[0] - dists[0], centroid[1], centroid[2]],
    [bbMax[0] + dists[0], centroid[1], centroid[2]],
    [centroid[0], bbMin[1] - dists[1], centroid[2]],
    [centroid[0], bbMax[1] + dists[1], centroid[2]],
    [centroid[0], centroid[1], bbMin[2] - dists[2]],
    [centroid[0], centroid[1], bbMax[2] + dists[2]]
  ];
  var camNames = [
    'left',
    'right',
    'bottom',
    'top',
    'front',
    'back'
  ];
  var camUps = [
    up,
    up,
    [0, 0, 1],
    [0, 0, 1],
    up,
    up
  ];
  var views = camPositions.map(function (x, index) {
    return {
      name: camNames[index],
      position: x,
      target: lookAt,
      lookatUp: camUps[index]
    };
  });
  return views;
};


module.exports = ViewGenerator;