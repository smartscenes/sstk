var Object3DUtil = require('geo/Object3DUtil');
var GeometryUtil = require('geo/GeometryUtil');
var BBox = require('geo/BBox');
var OBB = require('geo/OBB');
var numeric = require('numeric');
var _ = require('util/util');

var self = {};

// NOTE: Currently we assume Y-Up and we return OBBs in world coordinates
// TODO: Add options for specifying transform for OBBs
var defaults = {
  debug: false,
  checkAABB: false,
  constrainVertical: false,
  upAxis: 'y',  // TODO: can specify 'x', and 'z' but may not be correct!
  tolerance: 0.01,
  minWidth: 1e-6
  // basis: THREE.Matrix4 to use for fitting (then the points are transformed to the basis and AABB is used for the fit)
};

function isBetterOrEq(obb1, obb2, opts) {
  var t = 1 + opts.tolerance;
  return (obb1.volume() <= obb2.volume() * t); // || (obb1.surfaceArea() <= obb2.surfaceArea() * t);
}

function selectBetterObb(cmp, obb1, obb2, opts, message1, message2) {
  if (cmp(obb1, obb2, opts)) {
    if (opts.debug && message1) {
      console.log(message1, 'volumes: ' + obb1.volume() + ' vs ' +  obb2.volume(),
        'surface area: ' + obb1.surfaceArea() + ' vs ' + obb2.surfaceArea());
    }
    return obb1;
  } else {
    if (opts.debug && message2) {
      console.log(message2, 'volumes: ' + obb2.volume() + ' vs ' + obb1.volume(),
        'surface area: ' + obb2.surfaceArea() + ' vs ' + obb1.surfaceArea());
    }
    return obb2;
  }
}

function __fitPointsOBB(points, opts) {
  if (!points || points.length === 0) {
    throw 'Cannot fit OBB to points: no points';
  }

  opts = opts || {};
  opts = _.defaults(opts, defaults);

  if (points.length === 1) {
    // Return obb at center and 0 halfLength
    return new OBB(points[0].clone());
  }

  var obb;
  var res2d = findOBB2D_Points3D(points, opts.upAxis);
  var obbConstrained = findOBB3DVertical(res2d.obb2d, res2d.minV, res2d.maxV, opts.upAxis);
  if (opts.constrainVertical) {
    if (opts.debug) {
      console.log('Using obb constrained to up');
    }
    obb = obbConstrained;
  } else {
    var obbUnconstrained = findOBB3DUnconstrained_Points3D(points);
    obb = selectBetterObb(isBetterOrEq, obbConstrained, obbUnconstrained, opts,
      'Using obb constrained to up', 'Using unconstrained obb');
  }
  if (opts.checkAABB) {
    var aabb = new OBB().setFromAABB(new BBox().includePoints(points));
    aabb.metadata = { constrainVertical: true, isAABB: true };
    if (opts.debug) {
      console.log('aabb vs obb', aabb.volume(), obb.volume());
    }
    obb = selectBetterObb(isBetterOrEq, aabb, obb, opts, 'using obb constrained to aabb');
  }

  if (obb) {
    ensureNotDegenerate(obb, opts.minWidth);
  }
  return obb;
}

function fitPointsWithBasis(points, basis) {
  // Find center
  var bbox1 = new BBox();
  bbox1.includePoints(points);
  // Center and transform points to local coordinates
  var binv = basis.clone();
  binv.transpose();
  var transform = new THREE.Matrix4();
  transform.setPosition(bbox1.centroid().clone().negate());
  transform.multiplyMatrices(binv, transform);
  // Get bounding box
  var bbox2 = new BBox();
  bbox2.includePoints(points, transform);
  // Get world coordinates
  var shift = bbox2.centroid();
  shift.applyMatrix4(basis);
  return new OBB(bbox1.centroid().add(shift), bbox2.getHalfSizes(), basis.clone());
}

function fitPointsOBB(points, opts) {
  opts = opts || {};
  if (opts.basis) {
    return fitPointsWithBasis(points, opts.basis);
  } else if (opts.pca) {
    return findOBB3DUnconstrained_Points3D(points);
  } else {
    return __fitPointsOBB(points, opts);
  }
}

self.fitPointsOBB = fitPointsOBB;

function fitMeshOBB(meshes, opts) {
  opts = opts || {};
  opts = _.defaults(opts, defaults);
  if (!Array.isArray(meshes)) {
    meshes = [meshes];
  }

  var obb;
  var res2d = findOBB2D_Meshes(meshes, opts.upAxis);
  var obbConstrained = findOBB3DVertical(res2d.obb2d, res2d.minV, res2d.maxV, opts.upAxis);
  if (opts.constrainVertical) {
    //console.log('Using obb constrained to up');
    obb = obbConstrained;
  } else {
    var obbUnconstrained = findOBB3DUnconstrained_Meshes(meshes);
    obb = selectBetterObb(isBetterOrEq, obbConstrained, obbUnconstrained, opts,
      'Using obb constrained to up', 'Using unconstrained obb');
  }
  if (opts.checkAABB) {
    var aabb = new OBB().setFromAABB(new BBox().includeMeshes(meshes));
    aabb.metadata = { constrainVertical: true, isAABB: true };
    if (opts.debug) {
      console.log('aabb vs obb', aabb.volume(), obb.volume());
    }
    obb = selectBetterObb(isBetterOrEq, aabb, obb, opts, 'using obb constrained to aabb');
  }

  if (obb) {
    ensureNotDegenerate(obb, opts.minWidth);
  }
  return obb;
}
self.fitMeshOBB = fitMeshOBB;

function fitObjectOBB(objects, opts) {
  opts = opts || {};
  if (!_.isArray(objects)) {
    objects = [objects];
  }
  var meshes = [];
  for (var i = 0; i < objects.length; i++) {
    var object = objects[i];
    Object3DUtil.getPrimitives(object, opts.recursive, meshes);
  }
  if (opts.basis) {
    return fitMeshWithBasis(meshes, opts.basis);
  } else {
    return fitMeshOBB(meshes, opts);
  }
}
self.fitObjectOBB = fitObjectOBB;
self.fitOBB = fitObjectOBB;

function fitMeshWithBasis(meshes, basis) {
  // Find center
  var bbox1 = new BBox();
  bbox1.includeMeshes(meshes);
  // Center and transform points to local coordinates
  var binv = basis.clone();
  binv.transpose();
  var transform = new THREE.Matrix4();
  transform.setPosition(bbox1.centroid().clone().negate());
  transform.multiplyMatrices(binv, transform);
  // Get bounding box
  var bbox2 = new BBox();
  bbox2.includeMeshes(meshes, transform);
  // Get world coordinates
  var shift = bbox2.centroid();
  shift.applyMatrix4(basis);
  return new OBB(bbox1.centroid().add(shift), bbox2.getHalfSizes(), basis.clone());
}

function ensureNotDegenerate(obb, minWidth) {
  // TODO: Avoid degenerate boxes by enforcing non-zero width along all dimensions
  minWidth = minWidth || 0;
  if (obb.halfSizes.x < minWidth) { obb.halfSizes.x = minWidth; }
  if (obb.halfSizes.y < minWidth) { obb.halfSizes.y = minWidth; }
  if (obb.halfSizes.z < minWidth) { obb.halfSizes.z = minWidth; }
}

function makeBasisXY(a0, a1) {
  var v0 = (a0 instanceof THREE.Vector3)? a0 : new THREE.Vector3(a0[0], a0[1], a0[2]);
  var v1 = (a1 instanceof THREE.Vector3)? a1 : new THREE.Vector3(a1[0], a1[1], a1[2]);
  var v2 = v0.clone();
  v2.cross(v1).normalize();

  var basis = new THREE.Matrix4();
  //basis.makeBasis(v0, v1, v2);
  basis.set(
      v0.x, v1.x, v2.x, 0,
      v0.y, v1.y, v2.y, 0,
      v0.z, v1.z, v2.z, 0,
      0, 0, 0, 1
  );
  //console.log(a0, a1, v0, v1, v2);
  return basis;
}

function makeBasisXZ(a0, a1) {
  var v0 = (a0 instanceof THREE.Vector3)? a0 : new THREE.Vector3(a0[0], a0[1], a0[2]);
  var v1 = (a1 instanceof THREE.Vector3)? a1 : new THREE.Vector3(a1[0], a1[1], a1[2]);
  var v2 = v1.clone();
  v2.cross(v0).normalize();

  var basis = new THREE.Matrix4();
  //basis.makeBasis(v0, v1, v2);
  basis.set(
    v0.x, v2.x, v1.x, 0,
    v0.y, v2.y, v1.y, 0,
    v0.z, v2.z, v1.z, 0,
    0, 0, 0, 1
  );
  //console.log(a0, a1, v0, v1, v2);
  return basis;
}

function findOBB3DVertical(obb2D, minV, maxV, upAxis) {
  // Set x and y bbox axes from 2D rectangle axes
  //console.log('got obb2D', obb2D, minV, maxV, upAxis);
  var center2D = obb2D.center;
  var v0n = obb2D.axes[0];
  var position, halfSizes, basis;
  if (upAxis == null || upAxis === 'y') {
    position = new THREE.Vector3(center2D[0], 0.5 * (minV + maxV), center2D[1]);
    halfSizes = new THREE.Vector3(obb2D.extent[0], maxV - minV, obb2D.extent[1]).multiplyScalar(0.5);
    basis = makeBasisXY([v0n[0], 0, v0n[1]], [0, 1, 0]);
  } else if (upAxis === 'x') {
    position = new THREE.Vector3(0.5 * (minV + maxV), center2D[0], center2D[1]);
    halfSizes = new THREE.Vector3(maxV - minV, obb2D.extent[0], obb2D.extent[1]).multiplyScalar(0.5);
    basis = makeBasisXY([1, 0, 0],[0, v0n[0], v0n[1]]);
  } else if (upAxis === 'z') {
    position = new THREE.Vector3(center2D[0], center2D[1], 0.5 * (minV + maxV));
    halfSizes = new THREE.Vector3(obb2D.extent[0], obb2D.extent[1], maxV - minV).multiplyScalar(0.5);
    basis = makeBasisXZ([v0n[0], v0n[1], 0], [0, 0, 1]);
  }
  var obb = new OBB(position, halfSizes, basis);
  //console.log('got obb3D', obb);
  obb.metadata = { constrainVertical: true };
  return obb;
}

function findOBB2D_Points3D(points, upAxis) {
  upAxis = (upAxis == undefined)? 'y' : upAxis;
  var otherAxes = ['x','y','z'].filter(function(a) { return a !== upAxis; });
  var minV = Infinity;
  var maxV = -Infinity;
  var xyArray = [];
  for (var i = 0; i < points.length; i++) {
    // Assumes y up
    var p = points[i];
    if (p[upAxis] < minV) {
      minV = p[upAxis];
    }
    if (p[upAxis] > maxV) {
      maxV = p[upAxis];
    }
    xyArray.push(otherAxes.map(function(a) { return p[a]; }));
  }

  // Find minimum rectangle in x-z plane and vertical range
  return { obb2d: findOBB2D(xyArray), minV: minV, maxV: maxV };
}

function findOBB2D_Meshes(meshes, upAxis) {
  upAxis = (upAxis == undefined)? 'y' : upAxis;
  var otherAxes = ['x','y','z'].filter(function(a) { return a !== upAxis; });
  if (!Array.isArray(meshes)) {
    meshes = [meshes];
  }
  var minV = Infinity;
  var maxV = -Infinity;
  var xyArray = [];
  for (var i = 0; i < meshes.length; i++) {
    // NOTE: Assumes y up
    var meshOrPartial = meshes[i];
    GeometryUtil.forMeshOrPartialMeshVertices(meshOrPartial, function (p) {
      if (p[upAxis] < minV) { minV = p[upAxis]; }
      if (p[upAxis] > maxV) { maxV = p[upAxis]; }
      xyArray.push(otherAxes.map(function(a) { return p[a]; }));
    });
  }
  // Find minimum rectangle in x-z plane and vertical range
  return { obb2d: findOBB2D(xyArray), minV: minV, maxV: maxV };
}

function cross2D(a, b, o) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function dot2D(p1, p2) {
  return p1[0]*p2[0] + p1[1]*p2[1];
}

/**
 * https://en.wikibooks.org/wiki/Algorithm_Implementation/Geometry/Convex_hull/Monotone_chain
 * @param points An array of [X, Y] coordinates (at least 3 points)
 * @private
 */
function findConvexHull2D(points) {
  // Sort by x, then y
  points.sort(function(a, b) {
    return a[0] == b[0] ? a[1] - b[1] : a[0] - b[0];
  });

  // lower hull (smallest to largest x)
  var lower = [];
  for (var i = 0; i < points.length; i++) {
    // remove points that will cause counter-clock turn
    while (lower.length >= 2 && cross2D(lower[lower.length - 2], lower[lower.length - 1], points[i]) <= 0) {
      lower.pop();
    }
    lower.push(points[i]);
  }

  // upper hull (largest to smallest x)
  var upper = [];
  for (var i = points.length - 1; i >= 0; i--) {
    // remove points that will cause counter-clock turn
    while (upper.length >= 2 && cross2D(upper[upper.length - 2], upper[upper.length - 1], points[i]) <= 0) {
      upper.pop();
    }
    upper.push(points[i]);
  }

  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

function minAreaRectangle2DOfHull(convexHull) {
  var minRect = { area: Infinity };
  var xyArray = convexHull;
  // TODO: make more efficient
  for (var i1 = 0; i1 < xyArray.length; i1++) {
    var i2 = (i1+1) % xyArray.length;
    var p1 = xyArray[i1];
    var p2 = xyArray[i2];
    var e = [p2[0] - p1[0], p2[1] - p1[1]];
    var en = Math.sqrt(e[0]*e[0] + e[1]*e[1]);
    var u0 = [e[0]/en, e[1]/en];
    var u1 = [-u0[1], u0[0]];

    // go through and project onto this line and find best bounding box
    var min = [Infinity, 0];
    var max = [-Infinity, -Infinity];
    for (var j = 0; j < xyArray.length; j++) {
      var p = xyArray[j];
      var pd = [p[0] - p1[0], p[1] - p1[1]];
      var d = dot2D(u0, pd);
      if (d < min[0]) {
        min[0] = d;
      }
      if (d > max[0]) {
        max[0] = d;
      }
      d = dot2D(u1, pd);
      if (d > max[1]) {
        max[1] = d;
      }
    }
    var extent = [max[0] - min[0], max[1] - min[1]];
    var area = extent[0] * extent[1];
    if (area < minRect.area) {
      var f0 = (min[0] + max[0])/2;
      var f1 = (min[1] + max[1])/2;
      minRect.center = [p1[0] + f0*u0[0] + f1*u1[0], p1[1] + f0*u0[1] + f1*u1[1]];
      minRect.axes = [u0,u1];
      minRect.extent = extent;
      minRect.area = area;
      minRect.range = [
        [min[0], max[0]],
        [min[1], max[1]]
      ];

      if (extent[1] > extent[0]) {
        // swap
        minRect.extent = [extent[1], extent[0]];
        minRect.axes = [u1, u0];
        minRect.range = [minRect.range[1], minRect.range[0]];
      }
    }
  }
  return minRect;
}

function findOBB2D(xyArray) {
  if (xyArray.length >= 3) {
    var convexHull = findConvexHull2D(xyArray);
    if (convexHull.length >= 3) {
      var rect = minAreaRectangle2DOfHull(convexHull);
      return rect;
    } else {
      xyArray = convexHull;
    }
  }

  if (xyArray.length === 2) {
    var p1 = xyArray[0];
    var p2 = xyArray[1];
    var e = [p2[0] - p1[0], p2[1] - p1[1]];
    var en = Math.sqrt(e[0]*e[0] + e[1]*e[1]);
    var u0 = [e[0]/en, e[1]/en];
    var u1 = [-u0[1], u0[0]];

    return {
      center: [(p1[0]+p2[0])/2, (p1[1]+p2[1])/2],
      axes: [u0, u1],
      extent: [en,0],
      area: 0
    };
  } else if (xyArray.length === 1) {
    return {
      center: xyArray[0],
      axes: [[0,1], [-1,0]],
      extent: [0,0],
      area: 0
    };
  }
}

// Debug function
function checkAllPointsInOBB(obb, points) {
  var notInOBB = 0;
  var messageLimit = 1;
  for (var i = 0; i < points.length; i++) {
    if (!obb.containsPoint(points[i])) {
      if (notInOBB < messageLimit) {
        console.warn('OBB does not contain point', obb, points[i]);
      }
      notInOBB++;
    }
  }
  if (notInOBB > 0) {
    console.warn('OBB does not contain ' + notInOBB + '/' + points.length);
  }
  return notInOBB;
}

function findOBB3DUnconstrained_Points3D(points) {
  if (points.length >= 8) {
    require('three-convexhull');
    require('three-convexgeo');

    var convex = THREE.ConvexGeometry.fromPoints(points);
    var obb = findOBB3DUnconstrained_Geometry(convex);
    obb.convex = convex;
    return obb;
  } else {
    var pointsSet = new Set();
    var pointsArray = [];
    for (var vi = 0; vi < points.length; vi++) {
      var p = points[vi];
      var p2 = [p.x, p.y, p.z];
      var p2str = p2.join('_');
      if (!pointsSet.has(p2str)) {
        pointsArray.push(p2);
        pointsSet.add(p2str);
      }
    }
    return findOBB3DUnconstrained_PointsArray(pointsArray);
  }
}

function getMeshPoints(meshes) {
  var points = [];
  for (var i = 0; i < meshes.length; i++) {
    var meshOrPartial = meshes[i];
    if (meshOrPartial.mesh && meshOrPartial.faceIndices) {
      GeometryUtil.getVerticesForTriIndices(meshOrPartial.mesh, meshOrPartial.faceIndices, points);
    } else {
      var mesh = meshOrPartial;
      var nverts = GeometryUtil.getGeometryVertexCount(mesh.geometry);
      for (var vi = 0; vi < nverts; vi++) {
        var p = GeometryUtil.getGeometryVertex(mesh.geometry, vi, mesh.matrixWorld);
        points.push(p);
      }
    }
  }
  return points;
}

function findOBB3DUnconstrained_Meshes(meshes) {
  if (!Array.isArray(meshes)) {
    meshes = [meshes];
  }
  var points = getMeshPoints(meshes);
  return findOBB3DUnconstrained_Points3D(points);
}

function findOBB3DUnconstrained_Geometry(geo) {
  var pointsSet = new Set();
  var points = [];
  var nverts = GeometryUtil.getGeometryVertexCount(geo);
  var p = new THREE.Vector3();
  for (var vi = 0; vi < nverts; vi++) {
    GeometryUtil.getGeometryVertex(geo, vi, null, p);
    var p2 = [p.x, p.y, p.z];
    var p2str = p2.join('_');
    if (!pointsSet.has(p2str)) {
      points.push(p2);
      pointsSet.add(p2str);
    }
  }
  //console.log('nverts', nverts, 'points', points.length);
  return findOBB3DUnconstrained_PointsArray(points);
}

function findOBB3DUnconstrained_PointsArray(points) {
  var pcaOBB3D = findOBB3D_PCA(points);
  var obb = createOBB3D(pcaOBB3D);
  obb.metadata = { constrainVertical: false };
  return obb;
}

function createOBB3D(pcaOBB3D) {
  var center = pcaOBB3D.center;
  var extent = pcaOBB3D.extent;
  var axes = pcaOBB3D.axes;
  var position = new THREE.Vector3(center[0], center[1], center[2]);
  var halfSizes = new THREE.Vector3(extent[0], extent[1], extent[2]).multiplyScalar(0.5);
  var basis = makeBasisXY(axes[0], axes[1]);
  return new OBB(position, halfSizes, basis);
}

// Code for doing PCA

function findExtrema(points, dim) {
  var min = new Array(dim);
  var max = new Array(dim);

  for (var j = 0; j < dim; j++) {
    min[j] = Infinity;
    max[j] = -Infinity;
  }
  for (var i = 0; i < points.length; i++) {
    for (var j = 0; j < dim; j++) {
      if (points[i][j] < min[j]) min[j] = points[i][j];
      if (points[i][j] > max[j]) max[j] = points[i][j];
    }
  }

  var mid = new Array(dim);
  for (var j = 0; j < dim; j++) {
    mid[j] = (min[j] + max[j])/2;
  }

  return { min: min, max: max, mid: mid };
}

function centerPoints(points, dim) {
  // find mean
  var mean = new Array(dim);
  for (var j = 0; j < dim; j++) {
    mean[j] = 0;
  }

  for (var i = 0; i < points.length; i++) {
    for (var j = 0; j < dim; j++) {
      mean[j] += points[i][j];
    }
  }

  for (var j = 0; j < mean.length; j++) {
    mean[j] /= points.length;
  }

  // adjust data
  for (var i = 0; i < points.length; i++) {
    for (var j = 0; j < dim; j++) {
      points[i][j] -= mean[j];
    }
  }

  return mean;
}

function getCovariance(points, dim) {
  // covariance matrix
  var cM = new Array(dim);
  for (var j = 0; j < dim; j++) {
    cM[j] = new Array(dim);
    for (var k = 0; k < dim; k++) {
      cM[j][k] = 0;
    }
  }
  for (var i = 0; i < points.length; i++) {
    for (var j = 0; j < dim; j++) {
      for (var k = 0; k < dim; k++) {
        cM[j][k] += points[i][j] * points[i][k];
      }
    }
  }
  for (var j = 0; j < dim; j++) {
    for (var k = 0; k < dim; k++) {
      cM[j][k] = cM[j][k]/(points.length-1);
    }
  }
  return cM;
}

function changeBasis(points, basis) {
  var tmp = new Array(basis.length);
  for (var i = 0; i < points.length; i++) {
    for (var j = 0; j < basis.length; j++) {
      tmp[j] = numeric.dot(points[i], basis[j]);
    }
    for (var j = 0; j < basis.length; j++) {
      points[i][j] = tmp[j];
    }
  }
}

function findOBB3D_PCA(points) {
  var numeric = require('numeric');

  var mean = centerPoints(points, 3);
  var cM = getCovariance(points, 3);

  // solve eigenvectors
  var ev = numeric.eig(cM);

  var PC0 = [ev.E.x[0][0], ev.E.x[1][0], ev.E.x[2][0]];
  var PC1 = [ev.E.x[0][1], ev.E.x[1][1], ev.E.x[2][1]];
  var PC2 = [ev.E.x[0][2], ev.E.x[1][2], ev.E.x[2][2]];

  // change basis
  var basis = [ PC0, PC1, PC2 ];
  changeBasis(points, basis);

  // find xy extreme values
  var extrema = findExtrema(points, 3);
  var min = extrema.min;
  var max = extrema.max;

  // recover world-space centroid
  var m = extrema.mid;
  var centroid = [
    m[0]*PC0[0] + m[1]*PC1[0] + m[2]*PC2[0] + mean[0],
    m[0]*PC0[1] + m[1]*PC1[1] + m[2]*PC2[1] + mean[1],
    m[0]*PC0[2] + m[1]*PC1[2] + m[2]*PC2[2] + mean[2]];

  // get 8 corners
  return {
    mean: mean,
    center: centroid,
    axes: basis,
    extent: [max[0]-min[0], max[1]-min[1], max[2]-min[2]],
    range: [
      [min[0], max[0]],
      [min[1], max[1]],
      [min[2], max[2]]
    ]
  };
}

module.exports = self;
