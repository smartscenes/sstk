var OBB = require('geo/OBB');
var numeric = require('numeric');

var self = {};

function fitOBB(points, opts) {
  opts = opts || {};
  var obb;

  if (points.length === 1) {
    // Return obb at center and 0 halfLength
    return new OBB(points[0].clone());
  }

  if (opts.constrainVertical) {
    obb = findOBB3DVertical(points);
  } else {
    obb = findOBB3DUnconstrained(points);
  }

  // TODO: Avoid degenerate boxes by enforcing non-zero width along all dimensions
  //var minWidth = 1e-6;
  //for (var i = 0; i < 3; i++) {
  //  if (r_[i] < minWidth) { r_[i] = minWidth; }
  //}
  //this.__computeTransforms();
  return obb;
}
self.fitOBB = fitOBB;

function findOBB3DVertical(points) {
  // Get centroid, z range and x-y points for 2D rect fitting
  var minV = Number.MAX_VALUE;
  var maxV = -Number.MAX_VALUE;
  // Assumes y up
  for (var i = 0; i < points.length; i++) {
    var p = points[i];
    if (p.y < minV) { minV = p.y; } else if (p.y > maxV) { maxV = p.y; }
  }
  // Find minimum rectangle in x-z plane
  var obb2D = findOBB2D(points, 'x', 'z');

  // Set x and y bbox axes from 2D rectangle axes
  var center2D = obb2D.center;
  var v0n = obb2D.axes[0];
  var v1n = obb2D.axes[1];
  var position = new THREE.Vector3(center2D[0], 0.5*(minV + maxV), center2D[1]);
  var halfSizes = new THREE.Vector3(obb2D.size[0], maxV - minV, obb2D.size[1]).multiplyScalar(0.5);
  var basis = new THREE.Matrix4();
  basis.set(
    v0n[0], 0, v1n[0], 0,
    0,      1, 0, 0,
    v0n[1], 0, v1n[1], 0,
    0, 0, 0, 1
  );
  return new OBB(position, halfSizes, basis);
}

function findOBB3DUnconstrained(points) {
  console.error('Unimplemented!!!!');
}

function findOBB2D(points, xfield, yfield) {
  // copy the [x,y] array
  // input: dataPoints is an array of Vector3

  var xyArray = [];
  for (var i = 0; i < points.length; i++) {
    xyArray.push([points[i][xfield], points[i][yfield]]);
  }

  // find mean
  var xbar = 0;
  var ybar = 0;
  for (var i = 0; i < xyArray.length; i++) {
    xbar += xyArray[i][0];
    ybar += xyArray[i][1];
  }
  xbar /= xyArray.length;
  ybar /= xyArray.length;

  // adjust data
  for (var i = 0; i < xyArray.length; i++) {
    xyArray[i][0] -= xbar;
    xyArray[i][1] -= ybar;
  }

  // covariance matrix
  var xx = 0;
  var xy = 0;
  var yy = 0;
  for (var i = 0; i < xyArray.length; i++) {
    xx += xyArray[i][0] * xyArray[i][0];
    xy += xyArray[i][0] * xyArray[i][1];
    yy += xyArray[i][1] * xyArray[i][1];
  }

  // solve eigenvectors
  var cM = [
    [xx, xy],
    [xy, yy]
  ];
  var ev = numeric.eig(cM);

  // pick PC1 as +x
  var PC1 = [ev.E.x[0][0], ev.E.x[1][0]];

  // rotate 90 CCW as +y}
  var PC2 = [-PC1[1], PC1[0]];

  // change basis
  for (var i = 0; i < xyArray.length; i++) {
    var xp = numeric.dot(xyArray[i], PC1);
    var yp = numeric.dot(xyArray[i], PC2);
    xyArray[i][0] = xp;
    xyArray[i][1] = yp;
  }

  // find xy extreme values
  var xMin, xMax, yMin, yMax;
  xMin = yMin = 1e10;
  xMax = yMax = -1e10;

  for (var i = 0; i < xyArray.length; i++) {
    if (xyArray[i][0] < xMin) xMin = xyArray[i][0];
    if (xyArray[i][0] > xMax) xMax = xyArray[i][0];
    if (xyArray[i][1] < yMin) yMin = xyArray[i][1];
    if (xyArray[i][1] > yMax) yMax = xyArray[i][1];
  }

  // recover world-space centroid
  var m1 = (xMax+xMin)/2;
  var m2 = (yMax+yMin)/2;
  var centroid = [m1*PC1[0] + m2*PC2[0] + xbar, m1*PC1[1] + m2*PC2[1] + ybar];

  // get 4 corners
  return {
    mean: [xbar, ybar],
    center: centroid,
    axes: [PC1, PC2],
    size: [xMax-xMin, yMax-yMin],
    range: [
      [xMin, xMax],
      [yMin, yMax]
    ]
  };
}

module.exports = self;
