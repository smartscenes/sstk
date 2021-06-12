var OBB = require('geo/OBB');
var GeometryUtil = require('geo/GeometryUtil');
var OBBIntersections = {};

var PLANE_SIDES = Object.freeze({
  FRONT: +1,
  ON: 0,
  BEHIND: -1
});

var _VOLUME_EPSILON = 0.00000000001;

function computeIOU(obb1, obb2, debug) {
  var vol1 = obb1.volume();
  var vol2 = obb2.volume();
  if (vol1 < _VOLUME_EPSILON || vol2 < _VOLUME_EPSILON) {
    return 0;
  }
  var intersection = computeOBBIntersection(obb1, obb2, debug);
  if (intersection) {
    var volIntersect = GeometryUtil.getVolume(intersection);
    var volUnion = vol1 + vol2 - volIntersect;
    return volIntersect / volUnion;
  } else {
    return 0;
  }
}

OBBIntersections.computeIOU = computeIOU;

function toConvexHull(points) {
  require('three-convexhull');
  require('three-convexgeo');

  var convex = THREE.ConvexBufferGeometry.fromPoints(points);
  return convex;
}

function computeOBBIntersection(obb1, obb2, debug) {
  var intersectionPoints = [];
  computeOBBIntersectionPoints(obb1, obb2, intersectionPoints, debug);
  computeOBBIntersectionPoints(obb2, obb1, intersectionPoints, debug);
  if (debug) {
    console.log(debug + ': got intersection', intersectionPoints);
  }
  if (intersectionPoints.length >= 4) {
    return toConvexHull(intersectionPoints);
  } else {
    return null;
  }
}

/** Compute the intersection points of two obbs */
function computeOBBIntersectionPoints(obb1, obb2, out, debug) {
  out = out || [];
  // Transform (rotate) both obbs to be in non-scaled coordinates of obb1
  var refToWorldTransform = obb1.basis.clone();
  refToWorldTransform.setPosition(obb1.position);
  var toRefTransform = new THREE.Matrix4();
  toRefTransform.getInverse(refToWorldTransform);
  var robb1 = obb1.clone();
  robb1.applyMatrix4(toRefTransform);
  var verts1 = robb1.getCorners();
  var robb2 = obb2.clone();
  robb2.applyMatrix4(toRefTransform);
  var verts2 = robb2.getCorners();
  for (var i = 0; i < OBB.FACE_VERTS.length; i++) {
    var vertIndices = OBB.FACE_VERTS[i];
    var face = vertIndices.map(vi => verts2[vi]);
    var clip = intersectBoxVerticesPoly(verts1, face);
    for (var j = 0; j < clip.length; j++) {
      // Transform back to world coordinates
      var wp = clip[j].clone();
      wp.applyMatrix4(refToWorldTransform);
      out.push(wp);
    }
  }
  var keypoints = [robb2.getCenter()].concat(verts2);
  for (var i = 0; i < keypoints.length; i++) {
    var p = keypoints[i];
    if (robb1.containsPoint(p)) {
      var wp = p.clone();
      wp.applyMatrix4(refToWorldTransform);
      out.push(wp);
    }
  }
  return out;
}

/*** Clips the polygon against the faces of the axis-aligned box. */
function intersectBoxVerticesPoly(boxVertices, poly) {
  for (var axis = 0; axis < 3; axis++) {
    poly = __splitPolyForPlaneSideAxis(poly, boxVertices[0], 1.0, axis).front;
    poly = __splitPolyForPlaneSideAxis(poly, boxVertices[7], -1.0, axis).front;
  }
  return poly;
}

/**
 * Split the polygon with the plane using the Sutherland-Hodgman algorithm.
 * See en.wikipedia.org/wiki/Sutherland-Hodgman_algorithm for the overview of
 * the Sutherland-Hodgman algorithm. Here we adopted a robust implementation
 * from "Real-Time Collision Detection", by Christer Ericson, page 370.
 * @param poly {THREE.Vector3[]} Array of 3D vertices of the polygon
 * @param planePoint {THREE.Vector3} vector of point on the plane
 * @param sign {int} +1 or -1 (sign indicating normal to plane vector)
 * @param axis {int} 0,1,2 indicating the axis that the plane is normal to
 * @returns { {front: THREE.Vector3[], back: THREE.Vector3[]} }
 * @private
 */
function __splitPolyForPlaneSideAxis(poly, planePoint, sign, axis) {
  var frontVerts = [];
  var backVerts = [];
  if (poly.length <= 1) {
    return { front: frontVerts, back: backVerts };
  }

  // is the entire polygon already on clipping plane
  var polyInPlane = true;

  // test all the edges in the polygon against the clipping plane.
  var rels = poly.map((p) => getPointToAxisAlignedPlaneRelation(p, planePoint, sign, axis));
  var prevPoint = poly[poly.length-1];
  var prevRel = rels[poly.length-1];
  for (var i = 0; i < poly.length; i++) {
    var point = poly[i];
    var rel = rels[i];
    if (rel === PLANE_SIDES.FRONT) {
      // current point in front of plane
      polyInPlane = false;
      if (prevRel === PLANE_SIDES.BEHIND) {
        // moved from behind to front (add intersected point)
        var intersect = getPlaneLineSegIntersection(planePoint, prevPoint, point, axis);
        frontVerts.push(intersect);
        backVerts.push(intersect);
      } else if (prevRel === PLANE_SIDES.ON) {
        // moved from on plane to front (add intersected point to front)
        // double check prevPoint not already added
        if (frontVerts.length === 0 || frontVerts[frontVerts.length-1] !== prevPoint) {
          frontVerts.push(prevPoint);
        }
      }
      frontVerts.push(point);
    } else if (rel === PLANE_SIDES.BEHIND) {
      polyInPlane = false;
      if (prevRel === PLANE_SIDES.FRONT) {
        // moved from front to behind (add intersected point)
        var intersect = getPlaneLineSegIntersection(planePoint, prevPoint, point, axis);
        frontVerts.push(intersect);
        backVerts.push(intersect);
      } else if (prevRel === PLANE_SIDES.ON) {
        // moved from on plane to behind (add intersected point to back)
        // double check prevPoint not already added
        if (backVerts.length === 0 || backVerts[frontVerts.length-1] !== prevPoint) {
          backVerts.push(prevPoint);
        }
      }
      backVerts.push(point);
    } else {
      if (prevRel === PLANE_SIDES.FRONT) {
        frontVerts.push(point); // Going from front to on (should go into frontVerts too)
      } else if (prevRel === PLANE_SIDES.BEHIND) {
        backVerts.push(point);  // Going from behind to on (should go into backVerts too)
      }
    }
    prevPoint = point;
    prevRel = rel;
  }
  if (polyInPlane) {
    return { front: poly, back: poly };
  } else {
    return { front: frontVerts, back: backVerts };
  }
}

/**
 * Returns the intersection of a line segment with an axis-aligned plane
 * @param planePoint {THREE.Vector3} vector of point on the plane
 * @param p1 {THREE.Vector3} previous point
 * @param p2 {THREE.Vector3} current point
 * @param axis {int} 0,1,2 indicating the axis that the plane is normal to
 * @returns {THREE.Vector3} Intersection point of a line segment with the plane
 */
function getPlaneLineSegIntersection(planePoint, p1, p2, axis, out) {
  var d = p2.getComponent(axis) - p1.getComponent(axis);
  var pd = p2.getComponent(axis) - planePoint.getComponent(axis);
  var alpha = pd/d;
  var intersect = out || new THREE.Vector3();
  //p1*alpha + (1-alpha)*p2 = (p1-p2)*alpha + p2
  intersect.lerpVectors(p2, p1, alpha);
  return intersect;
}

/**
 * Returns which side of the plan the point is located
 * See Real-Time Collision Detection, by Christer Ericson, page 364.
 * @param point {THREE.Vector3}
 * @param planePoint {THREE.Vector3} vector of point on the plane
 * @param sign {int} +1 or -1 (sign indicating normal to plane vector)
 * @param axis {int} 0,1,2 indicating the axis that the plane is normal to
 * @param thickness_epsilon {float} Plane thickness epsilon
 */
function getPointToAxisAlignedPlaneRelation(point, planePoint, sign, axis, thickness_epsilon= 0.000001) {
  var signed_distance = sign * (point.getComponent(axis) - planePoint.getComponent(axis));
  if (signed_distance > thickness_epsilon) {
    return PLANE_SIDES.FRONT;
  } else if (signed_distance < -thickness_epsilon) {
    return PLANE_SIDES.BEHIND;
  } else {
    return PLANE_SIDES.ON;
  }
}

module.exports = OBBIntersections;