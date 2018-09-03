var TriangleAccessor = require('geo/TriangleAccessor');
var GeometryUtil = require('geo/GeometryUtil');
var Object3DUtil = require('geo/Object3DUtil');
var _ = require('util');

/**
 * Utility functions to compute distances
 * Taken from http://www.geometrictools.com/LibMathematics/Distance/Distance.html
 * NOTE: Distances between sets of points do not have to satisfy the triangle inequality
 *    -----   A
 *   |     |
 *   |  C  |     d(A,B) > d(A,C) + d(B,C)
 *   |     |
 *    -----   B
 *
 * @author Angel Chang
 * @private
 */

var ZERO_TOLERANCE = 0.0000000001;

function swapFields(object, fieldsPairs) {
  for (var i = 0; i < fieldsPairs.length; i++) {
    var f1 = fieldsPairs[i][0];
    var f2 = fieldsPairs[i][1];
    var tmp = object[f1];
    object[f1] = object[f2];
    object[f2] = tmp;
  }
}

function renameFields(object, fieldsPairs) {
  for (var i = 0; i < fieldsPairs.length; i++) {
    var f1 = fieldsPairs[i][0];
    var f2 = fieldsPairs[i][1];
    object[f2] = object[f1];
    delete object[f1];
  }
}

function PointPointDistanceSquared(point1, point2, opts) {
  var distanceSq = point1.distanceToSquared(point2);
  if (opts.all) {
    return {
      distanceSq: distanceSq,
      closestPoint0: point1,
      closestPoint1: point2
    }
  } else {
    return {
      distanceSq: distanceSq
    }
  }
}

/**
 * Computes the distance between a line and a line segment
 * @param line {{origin: THREE.Vector3, direction: THREE.Vector3}}
 * @param segment {{origin: THREE.Vector3, direction: THREE.Vector3, extent: number}}
 * @param opts {{all: boolean, debug: boolean}} Additional options.
 *   Use `all` to indicate that all fields should be returned (otherwise, just return `distanceSq`).
 * @returns {{distanceSq: number}}
 * @private
 */
function LineSegmentDistanceSquared(line, segment, opts) {
  function computeDistanceSquared() {
    var diff = new THREE.Vector3();
    diff.subVectors(line.origin, segment.origin);
    var a01 = -line.direction.dot(segment.direction);
    var b0 = diff.dot(line.direction);
    var c = diff.lengthSq();
    var det = Math.abs(1.0 - a01 * a01);

    var sqrDist;
    var s0;
    var s1;
    if (det >= ZERO_TOLERANCE) {
      // The line and segment are not parallel.
      var b1 = -diff.dot(segment.direction);
      s1 = a01 * b0 - b1;
      var extDet = segment.extent * det;

      if (s1 >= -extDet) {
        if (s1 <= extDet) {
          // Two interior points are closest, one on the line and one
          // on the segment.
          var invDet = 1.0 / det;
          s0 = (a01 * b1 - b0) * invDet;
          s1 *= invDet;
          sqrDist = s0 * (s0 + a01 * s1 + 2.0 * b0) + s1 * (a01 * s0 + s1 + 2.0 * b1) + c;
        } else {
          // The endpoint e1 of the segment and an interior point of
          // the line are closest.
          s1 = segment.extent;
          s0 = -(a01 * s1 + b0);
          sqrDist = -s0 * s0 + s1 * (s1 + 2.0 * b1) + c;
        }
      } else {
        // The end point e0 of the segment and an interior point of the
        // line are closest.
        s1 = -segment.extent;
        s0 = -(a01 * s1 + b0);
        sqrDist = -s0 * s0 + s1 * (s1 + 2.0 * b1) + c;
      }
    } else {
      // The line and segment are parallel.  Choose the closest pair so that
      // one point is at segment center.
      s1 = 0.0;
      s0 = -b0;
      sqrDist = b0 * s0 + c;
    }

    // Account for numerical round-off errors.
    if (sqrDist < 0.0) {
      sqrDist = 0.0;
    }

    if (opts && opts.all) {
      var closestPoint0 = line.origin.clone();
      closestPoint0.addScaledVector(line.direction, s0);
      var closestPoint1 = segment.origin.clone();
      closestPoint1.addScaledVector(segment.direction, s1);

      return {
        distanceSq: sqrDist,
        closestPoint0: closestPoint0,
        closestPoint1: closestPoint1,
        lineParameter: s0,
        segmentParameter: s1
      };
    } else {
      return {
        distanceSq: sqrDist
      };
    }
  }

  return computeDistanceSquared();
}

function SegmentLineDistanceSquared(segment, line, opts) {
  var result = LineSegmentDistanceSquared(line, segment, opts);
  if (opts.all) {
    swapFields(result, [['closestPoint0', 'closestPoint1']]);
  }
  return result;
}

/**
 * Computes the distance between a point and a triangle
 * @param point {THREE.Vector3}
 * @param triangle {THREE.Triangle}
 * @param opts {{all: boolean, debug: boolean}} Additional options.
 *   Use `all` to indicate that all fields should be returned (otherwise, just return `distanceSq`).
 *   Use `debug` to output extra debug messages
 * @returns {{distanceSq: number}}
 * @private
 */
function PointTriangleDistanceSquared(point, triangle, opts) {
  var v1 = triangle.a;
  var v2 = triangle.b;
  var v3 = triangle.c;
  var edge0 = new THREE.Vector3();
  edge0.subVectors(v2,v1);
  var edge1 = new THREE.Vector3();
  edge1.subVectors(v3,v1);
  var normal = new THREE.Vector3();

  function computeDistanceSquareNonDegenerate() {
    // This algorithm assumes that the norm is not 0 (i.e. triangle is not degenerate)
    var diff = new THREE.Vector3();
    diff.subVectors(v1, point);
    var a00 = edge0.lengthSq();
    var a01 = edge0.dot(edge1);
    var a11 = edge1.lengthSq();
    var b0 = diff.dot(edge0);
    var b1 = diff.dot(edge1);
    var c = diff.lengthSq();
    var det = Math.abs(a00*a11 - a01*a01);

    var s = a01*b1 - a11*b0;
    var t = a01*b0 - a00*b1;

    var sqrDistance;
    if (s + t <= det) {
      if (s < 0.0) {
        if (t < 0.0) {
          // region 4
          if (b0 < 0.0) {
            t = 0.0;
            if (-b0 >= a00) {
              s = 1.0;
              sqrDistance = a00 + 2.0*b0 + c;
            } else {
              s = -b0/a00;
              sqrDistance = b0*s + c;
            }
          } else {
            s = 0.0;
            if (b1 >= 0.0) {
              t = 0.0;
              sqrDistance = c;
            } else if (-b1 >= a11) {
              t = 1.0;
              sqrDistance = a11 + 2.0*b1 + c;
            } else {
              t = -b1/a11;
              sqrDistance = b1*t + c;
            }
          }
        } else {
          // region 3
          s = 0.0;
          if (b1 >= 0.0) {
            t = 0.0;
            sqrDistance = c;
          } else if (-b1 >= a11) {
            t = 1.0;
            sqrDistance = a11 + 2.0*b1 + c;
          } else {
            t = -b1/a11;
            sqrDistance = b1*t + c;
          }
        }
      } else if (t < 0.0) {
        // region 5
        t = 0.0;
        if (b0 >= 0.0) {
          s = 0.0;
          sqrDistance = c;
        } else if (-b0 >= a00) {
          s = 1.0;
          sqrDistance = a00 + 2.0*b0 + c;
        } else {
          s = -b0/a00;
          sqrDistance = b0*s + c;
        }
      } else {
        // region 0
        // minimum at interior point
        var invDet = 1.0/det;
        s *= invDet;
        t *= invDet;
        sqrDistance = s*(a00*s + a01*t + 2.0*b0) + t*(a01*s + a11*t + 2.0*b1) + c;
      }
    } else {
      if (s < 0.0) {
        // region 2
        var tmp0 = a01 + b0;
        var tmp1 = a11 + b1;
        if (tmp1 > tmp0) {
          var numer = tmp1 - tmp0;
          var denom = a00 - 2.0*a01 + a11;
          if (numer >= denom)
          {
            s = 1.0;
            t = 0.0;
            sqrDistance = a00 + 2.0*b0 + c;
          } else {
            s = numer/denom;
            t = 1.0 - s;
            sqrDistance = s*(a00*s + a01*t + 2.0*b0) + t*(a01*s + a11*t + 2.0*b1) + c;
          }
        } else {
          s = 0.0;
          if (tmp1 <= 0.0) {
            t = 1.0;
            sqrDistance = a11 + 2.0*b1 + c;
          } else if (b1 >= 0.0) {
            t = 0.0;
            sqrDistance = c;
          } else {
            t = -b1/a11;
            sqrDistance = b1*t + c;
          }
        }
      } else if (t < 0.0) {
        // region 6
        var tmp0 = a01 + b1;
        var tmp1 = a00 + b0;
        if (tmp1 > tmp0) {
          var numer = tmp1 - tmp0;
          var denom = a00 - 2.0*a01 + a11;
          if (numer >= denom) {
            t = 1.0;
            s = 0.0;
            sqrDistance = a11 + 2.0*b1 + c;
          } else {
            t = numer/denom;
            s = 1.0 - t;
            sqrDistance = s*(a00*s + a01*t + 2.0*b0) + t*(a01*s + a11*t + 2.0*b1) + c;
          }
        } else {
          t = 0.0;
          if (tmp1 <= 0.0) {
            s = 1.0;
            sqrDistance = a00 + 2.0*b0 + c;
          } else if (b0 >= 0.0) {
            s = 0.0;
            sqrDistance = c;
          } else {
            s = -b0/a00;
            sqrDistance = b0*s + c;
          }
        }
      } else {
        // region 1
        var numer = a11 + b1 - a01 - b0;
        if (numer <= 0.0) {
          s = 0.0;
          t = 1.0;
          sqrDistance = a11 + 2.0*b1 + c;
        } else {
          var denom = a00 - 2.0*a01 + a11;
          if (numer >= denom) {
            s = 1.0;
            t = 0.0;
            sqrDistance = a00 + 2.0*b0 + c;
          } else {
            s = numer/denom;
            t = 1.0 - s;
            sqrDistance = s*(a00*s + a01*t + 2.0*b0) + t*(a01*s + a11*t + 2.0*b1) + c;
          }
        }
      }
    }

    // Account for numerical round-off error.
    if (sqrDistance < 0.0) {
      sqrDistance = 0.0;
    }

    return { s: s, t: t, distanceSq: sqrDistance };
  }

  function computeDistanceSquared() {
    // TODO: Check if triangle is degenerate and do something else if needed
    var computedDist = computeDistanceSquareNonDegenerate();

    var sqrDistance = computedDist.distanceSq;
    var s = computedDist.s;
    var t = computedDist.t;
    // Check distances if from each vertex
    var ds = [v1.distanceToSquared(point), v2.distanceToSquared(point), v3.distanceToSquared(point)];
    var dsMin = Math.min.apply(null, ds);
    if (dsMin*1.01 < sqrDistance) {
      var cross = edge0.cross(edge1);
      if (opts && opts.debug && cross.lengthSq() > 0.0001) {
        console.log("Distance from vertex to point smaller than computed distance: " + dsMin + ", " + sqrDistance);
        console.log("Distances from vertices are: " + ds.join(","));
        console.log("Point is " + point);
        console.log("Triangle is " + v1 + ", " + v2 + ", " + v3);
        console.log("Triangle normal is " + triangle.getNormal(normal));
        console.log("edge0 cross edge1 is " + cross);
      }
      sqrDistance = dsMin;
      var i = ds.indexOf(sqrDistance);
      var ss = [0,1,0];
      var ts = [0,0,1];
      s = ss[i];
      t = ts[i];
    }

    if (opts && opts.all) {
      var closestPoint0 = point;
      var closestPoint1 = v1.clone();
      closestPoint1.addScaledVector(edge0, s);
      closestPoint1.addScaledVector(edge1, t);
      var triangleBary = new THREE.Vector3(1.0 - s - t, s, t);

      return {
        distanceSq: sqrDistance,
        closestPoint0: closestPoint0,
        closestPoint1: closestPoint1,
        triangleBary: triangleBary
      };
    } else {
      return {
        distanceSq: sqrDistance
      };
    }
  }

  return computeDistanceSquared();
}

function TrianglePointDistanceSquared(triangle, point, opts) {
    var result = PointTriangleDistanceSquared(point, triangle, opts);
    if (opts.all) {
        swapFields(result, [['closestPoint0', 'closestPoint1']]);
    }
    return result;
}

function generateComplementBasis(u, v, w) {
  if (Math.abs(w.x) >= Math.abs(w.y)) {
    // w.x or w.z is the largest magnitude component, swap them
    var fInvLength = 1.0/Math.sqrt(w.x * w.x + w.z * w.z);
    u.x = -w.z * fInvLength;
    u.y = 0.0;
    u.z = +w.x * fInvLength;
    v.x = w.y * u.z;
    v.y = w.z * u.x - w.x * u.z;
    v.z = -w.y * u.x;
  } else {
    // w.y or w.z is the largest magnitude component, swap them
    var fInvLength = 1.0/Math.sqrt(w.y * w.y + w.z * w.z);
    u.x = 0.0;
    u.y = +w.z * fInvLength;
    u.z = -w.y * fInvLength;
    v.x = w.y * u.z - w.z * u.y;
    v.y = -w.x * u.z;
    v.z = w.x * u.y;
  }
}

/**
 * Computes the distance between a line and a triangle
 * @param line {{origin: THREE.Vector3, direction: THREE.Vector3}}
 * @param triangle {THREE.Triangle}
 * @param opts {{all: boolean, debug: boolean}} Additional options.
 *   Use `all` to indicate that all fields should be returned (otherwise, just return `distanceSq`).
 *   Use `debug` to output extra debug messages
 * @returns {{distanceSq: number}}
 * @private
 */
function LineTriangleDistanceSquared(line, triangle, opts) {
  var lineParameter;
  var triangleBary;
  var closestPoint0;
  var closestPoint1;

  // The intersection point closestPoint0 is inside or on the triangle.

  //----------------------------------------------------------------------------
  function computeDistanceSquared() {
    // Test if line intersects triangle.  If so, the squared distance is zero.
    var v1 = triangle.a;
    var v2 = triangle.b;
    var v3 = triangle.c;
    var edge0 = new THREE.Vector3();
    edge0.subVectors(v2,v1);
    var edge1 = new THREE.Vector3();
    edge1.subVectors(v3,v1);
    var normal = new THREE.Vector3();
    normal.crossVectors(edge0,edge1).normalize();
    var ndd = normal.dot(line.direction);
    if (Math.abs(ndd) > ZERO_TOLERANCE) {
      // The line and triangle are not parallel, so the line intersects
      // the plane of the triangle.
      var diff = line.origin - v1;
      var u = new THREE.Vector3();
      var v = new THREE.Vector3();
      generateComplementBasis(u, v, line.direction);
      var udE0 = u.dot(edge0);
      var udE1 = u.dot(edge1);
      var udDiff = u.dot(diff);
      var vdE0 = v.dot(edge0);
      var vdE1 = v.dot(edge1);
      var vdDiff = v.dot(diff);
      var invDet = 1.0/(udE0*vdE1 - udE1*vdE0);

      // Barycentric coordinates for the point of intersection.
      var b1 = (vdE1*udDiff - udE1*vdDiff)*invDet;
      var b2 = (udE0*vdDiff - vdE0*udDiff)*invDet;
      var b0 = 1.0 - b1 - b2;

      if (b0 >= 0.0 && b1 >= 0.0 && b2 >= 0.0) {
        if (opts && opts.all) {
          // Line parameter for the point of intersection.
          var ddE0 = line.direction.dot(edge0);
          var ddE1 = line.direction.dot(edge1);
          var ddDiff = line.direction.dot(diff);
          lineParameter = b1 * ddE0 + b2 * ddE1 - ddDiff;

          // Barycentric coordinates for the point of intersection.
          triangleBary = new THREE.Vector3(b0, b1, b2);
          // The intersection point is inside or on the triangle.
          closestPoint0 = line.origin.clone();
          closestPoint0.addScaledVector(line.direction, lineParameter);
          closestPoint1 = v1.clone();
          closestPoint1.addScaledVector(edge0, b1);
          closestPoint1.addScaledVector(edge1, b0);
          return {
            distanceSq: 0.0,
            closestPoint0: closestPoint0,
            closestPoint1: closestPoint1,
            lineParameter: lineParameter,
            triangleBary: triangleBary
          };
        } else {
          return { distanceSq: 0.0 };
        }
      }
    }

    // Either (1) the line is not parallel to the triangle and the point of
    // intersection of the line and the plane of the triangle is outside the
    // triangle or (2) the line and triangle are parallel.  Regardless, the
    // closest point on the triangle is on an edge of the triangle.  Compare
    // the line to all three edges of the triangle.
    var sqrDist = Infinity;
    if (opts && opts.all) {
      triangleBary = new THREE.Vector3();
      for (var i1 = 0; i1 < 3; i1++) {
        var i0 = (i1 + 2) % 3;

        var segment = getEdgeSegment(triangle, i0, i1);
        var queryLS = LineSegmentDistanceSquared(line, segment, opts);

        var sqrDistTmp = queryLS.distanceSq;
        if (sqrDistTmp < sqrDist) {
          sqrDist = sqrDistTmp;

          closestPoint0 = queryLS.closestPoint0;
          closestPoint1 = queryLS.closestPoint1;

          lineParameter = queryLS.lineParameter;
          var ratio = queryLS.segmentParameter / segment.extent;
          triangleBary.set(i0, 0.5 * (1.0 - ratio));
          triangleBary.set(i1, 1.0 - triangleBary.get(i0));
          triangleBary.set(3 - i0 - i1, 0.0);
        }
      }
      return {
        distanceSq: sqrDist,
        closestPoint0: closestPoint0,
        closestPoint1: closestPoint1,
        lineParameter: lineParameter,
        triangleBary: triangleBary
      };
    } else {
      for (var i1 = 0; i1 < 3; i1++) {
        var i0 = (i1 + 2) % 3;

        var segment = getEdgeSegment(triangle, i0, i1);
        var sqrDistTmp = LineSegmentDistanceSquared(line, segment, opts);
        if (sqrDistTmp < sqrDist) {
          sqrDist = sqrDistTmp;
        }
      }
      return { distanceSq: sqrDist };
    }
  }

  return computeDistanceSquared();
}

function TriangleLineDistanceSquared(triangle, line, opts) {
    var result = LineTriangleDistanceSquared(line, triangle, opts);
    if (opts.all) {
        swapFields(result, [['closestPoint0', 'closestPoint1']]);
    }
    return result;
}

/**
 * Computes the distance between a line segment and a triangle
 * @param segment {{origin: THREE.Vector3, direction: THREE.Vector3, extent: number}}
 * @param triangle {THREE.Triangle}
 * @param opts {{all: boolean, debug: boolean}} Additional options.
 *   Use `all` to indicate that all fields should be returned (otherwise, just return `distanceSq`).
 *   Use `debug` to output extra debug messages
 * @private
 */
function LineSegmentTriangleDistanceSquared(segment, triangle, opts) {
  function computeDistanceSquared() {
    var queryLT = LineTriangleDistanceSquared(segment, triangle, { all: true });

    var sqrDist = queryLT.distanceSq;
    var segmentParameter = queryLT.lineParameter;

    var closestPoint0;
    var closestPoint1;
    var triangleBary;

    if (segmentParameter < -segment.extent) {
      closestPoint0 = segment.origin.clone();
      closestPoint0.addScaledVector(segment.direction, -segment.extent);
      segmentParameter = segment.extent;
    } else if (segmentParameter > segment.extent) {
      closestPoint0 = segment.origin.clone();
      closestPoint0.addScaledVector(segment.direction, segment.extent);
      segmentParameter = segment.extent;
    } else {
      closestPoint0 = queryLT.closestPoint0;
      closestPoint1 = queryLT.closestPoint1;
      triangleBary = queryLT.triangleBary;
    }

    if (opts && opts.all) {
      if (!closestPoint1) {
        var queryPT = PointTriangleDistanceSquared(closestPoint0, triangle, opts);
        sqrDist = queryPT.distanceSq;
        closestPoint1 = queryPT.closestPoint1;
        triangleBary = queryPT.triangleBary;
      }
      return {
        distanceSq: sqrDist,
        closestPoint0: closestPoint0,
        closestPoint1: closestPoint1,
        triangleBary: triangleBary,
        segmentParameter: segmentParameter
      };
    } else {
      if (!closestPoint1) {
        return PointTriangleDistanceSquared(closestPoint0, triangle, opts);
      } else {
        return {distanceSq: sqrDist};
      }
    }
  }
  return computeDistanceSquared();
}

function TriangleLineSegmentDistanceSquared(triangle, segment, opts) {
    var result = LineSegmentTriangleDistanceSquared(segment, triangle, opts);
    if (opts.all) {
        swapFields(result, [['closestPoint0', 'closestPoint1']]);
    }
    return result;
}



function getEdgeSegment(t, i0, i1) {
  var vs = [t.a, t.b, t.c];
  var v0 = vs[i0];
  var v1 = vs[i1];
  var d = new THREE.Vector3();
  d.subVectors(v1, v0);
  var extent = d.length();
  d.normalize();
  return { origin: v0, direction: d, extent:  extent };
}

/**
 * Computes the distance between two triangles
 * @param triangle0 {THREE.Triangle}
 * @param triangle1 {THREE.Triangle}
 * @param opts {{all: boolean, debug: boolean}} Additional options.
 *   Use `all` to indicate that all fields should be returned (otherwise, just return `distanceSq`).
 *   Use `debug` to output extra debug messages
 * @private
 */
function TriangleTriangleDistanceSquared(triangle0, triangle1, opts) {
  var closestPoint0;
  var closestPoint1;
  var triangleBary0;
  var triangleBary1;

  function getResult(distSq) {
    if (opts && opts.all) {
      return {
        distanceSq: distSq,
        closestPoint0: closestPoint0,
        closestPoint1: closestPoint1,
        triangleBary0: triangleBary0,
        triangleBary1: triangleBary1
      };
    } else {
      return {
        distanceSq: distSq
      };
    }
  }

  function computeDistanceSquared() {
    // Compare edges of triangle0 to the interior of triangle1.
    var t0 = triangle0;
    var t1 = triangle1;

    var sqrDist = Infinity;
    triangleBary0 = new THREE.Vector3();
    for (var i1 = 0; i1 < 3; i1++) {
      var i0 = (i1+2)%3;

      var edge = getEdgeSegment(t0, i0, i1);

      var queryST = LineSegmentTriangleDistanceSquared(edge, t1, opts);
      var sqrDistTmp = queryST.distanceSq;
      if (sqrDistTmp < sqrDist) {
        closestPoint0 = queryST.closestPoint0;
        closestPoint1 = queryST.closestPoint1;

        sqrDist = sqrDistTmp;

        var ratio = queryST.segmentParameter/edge.extent;
        triangleBary0.set(i0, 0.5*(1.0 - ratio));
        triangleBary0.set(i1, 1.0 - triangleBary0.get(i0));
        triangleBary0.set(3-i0-i1, 0.0);
        triangleBary1 = queryST.triangleBary;

        if (sqrDist <= ZERO_TOLERANCE){
          return getResult(0.0);
        }
      }
    }

    // Compare edges of triangle1 to the interior of triangle0.
    triangleBary1 = new THREE.Vector3();
    for (var i1 = 0; i1 < 3; i1++) {
      var i0 = (i1+2)%3;
      var edge = getEdgeSegment(t1, i0, i1);

      var queryST = LineSegmentTriangleDistanceSquared(edge, triangle0, opts);
      var sqrDistTmp = queryST.distanceSq;
      if (sqrDistTmp < sqrDist) {
        closestPoint0 = queryST.closestPoint1;
        closestPoint1 = queryST.closestPoint0;

        sqrDist = sqrDistTmp;

        var ratio = queryST.segmentParameter()/edge.extent;
        triangleBary1.set(i0, 0.5*(1.0 - ratio));
        triangleBary1.set(i1, 1.0 - triangleBary1.get(i0));
        triangleBary1.set(3-i0-i1, 0.0);
        triangleBary0 = queryST.triangleBary;

        if (sqrDist <= ZERO_TOLERANCE) {
          return getResult(0.0);
        }
      }
    }

    return getResult(sqrDist);
  }

  return computeDistanceSquared();
}

function PointsPointsMinDistanceSquared(points1, points2, opts) {
  var result;
  var done = false;
  for (var i = 0; i < points1.length && !done; i++) {
    var p1 = points1[i];
    for (var j = 0; j < points2.length && !done; j++) {
      var p2 = points2[j];
      var sqrDist = p1.distanceToSquared(p2);
      if (!result || sqrDist < result.distanceSq) {
        if (opts.all) {
          result = {
            distanceSq: sqrDist,
            closestPoint0: p1,
            closestPoint1: p2
          }
        } else {
          result = {
            distanceSq: sqrDist
          }
        }
        if (opts.shortCircuit && opts.shortCircuit.minDistSq != undefined) {
          if (result.distanceSq <= opts.shortCircuit.minDistSq) {
            done = true;
          }
        }
      }
    }
  }
  return result;
}

function PointsPointsMaxDistanceSquared(points1, points2, opts) {
  var result;
  for (var i = 0; i < points1.length; i++) {
    var p1 = points1[i];
    for (var j = 0; j < points2.length; j++) {
      var p2 = points2[j];
      var sqrDist = p1.distanceToSquared(p2);
      if (!result || sqrDist > result.distanceSq) {
        if (opts.all) {
          result = {
            distanceSq: sqrDist,
            farthestPoint0: p1,
            farthestPoint1: p2
          }
        } else {
          result = {
            distanceSq: sqrDist
          }
        }
      }
    }
  }
  return result;
}

function PointsPointsHausdorffDirectedDistanceSquared(points1, points2, opts) {
  var result;
  var done = false;
  var innerOpts = _.clone(opts);
  innerOpts.shortCircuit = { minDistSq: 0 };
  for (var i = 0; i < points1.length && !done; i++) {
    var p1 = points1[i];
    var r = PointsPointsMinDistanceSquared([p1], points2, innerOpts);
    if (!result || r.distanceSq < result.distanceSq) {
      result = r;
      innerOpts.shortCircuit.minDistSq = result.distanceSq;
      if (opts.shortCircuit && opts.shortCircuit.maxDistSq != undefined) {
        if (result.distanceSq > opts.shortCircuit.maxDistSq) {
          done = true;
        }
      }
    }
  }
  if (result && opts.all) {
    renameFields(result, [['closestPoint0', 'point0'], ['closestPoint1', 'point1']]);
  }
  return result;
}

function PointsPointsHausdorffDistanceSquared(points1, points2, opts) {
  var r1 = PointsPointsHausdorffDirectedDistanceSquared(points1, points2, opts);
  var r2 = PointsPointsHausdorffDirectedDistanceSquared(points2, points1, opts);
  if (r2.distanceSq > r1.distanceSq) {
    swapFields(r2, [['closestPoint0', 'closestPoint1']]);
    return r2;
  } else {
    return r1;
  }
}

function PointMeshDistanceSquared(point, mesh, opts) {
  var triAccessor = new TriangleAccessor(mesh);
  var nTris = triAccessor.numTriangles();
  var result;
  var tmpTriangle = new THREE.Triangle();
  var savedTriangle = new THREE.Triangle();
  var done = false;
  for (var i = 0; i < nTris && !done; i++) {
    triAccessor.getTriangle(i, tmpTriangle, mesh.matrixWorld);
    var r = PointTriangleDistanceSquared(point, tmpTriangle, opts);
    if (!result || r.distanceSq < result.distanceSq) {
      result = r;
      if (opts.shortCircuit && opts.shortCircuit.minDistSq != undefined) {
        if (result.distanceSq <= opts.shortCircuit.minDistSq) {
          done = true;
        }
      }
      if (opts.all) {
        savedTriangle.copy(tmpTriangle);
        result.closestFaceIndex = i;
        result.closestTriangle = savedTriangle;
      }
    }
  }
  return result;
}

function PointPartialMeshDistanceSquared(point, mesh, faceIndices, opts) {
  var triAccessor = new TriangleAccessor(mesh);
  var result;
  var done = false;
  var tmpTriangle = new THREE.Triangle();
  var savedTriangle = new THREE.Triangle();
  for (var i = 0; i < faceIndices.length && !done; i++) {
    var iTri = faceIndices[i];
    triAccessor.getTriangle(iTri, tmpTriangle, mesh.matrixWorld);
    var r = PointTriangleDistanceSquared(point, tmpTriangle, opts);
    if (!result || r.distanceSq < result.distanceSq) {
      result = r;
      if (opts.shortCircuit && opts.shortCircuit.minDistSq != undefined) {
        if (result.distanceSq <= opts.shortCircuit.minDistSq) {
          done = true;
        }
      }
      if (opts.all) {
        savedTriangle.copy(tmpTriangle);
        result.closestFaceIndex = iTri;
        result.closestTriangle = savedTriangle;
      }
    }
  }
  return result;
}

function MeshPointDistanceSquared(mesh, point, opts) {
  var result = PointMeshDistanceSquared(point, mesh, opts);
  if (opts.all) {
    swapFields(result, [['closestPoint0', 'closestPoint1']]);
  }
  return result;
}

function PartialMeshPointDistanceSquared(mesh, point, opts) {
  var result = PointPartialMeshDistanceSquared(point, mesh, opts);
  if (opts.all) {
    swapFields(result, [['closestPoint0', 'closestPoint1']]);
  }
  return result;
}

function MeshMeshDistanceSquared(mesh1, mesh2, opts) {
  // TODO: use BVH
  var triAccessor1 = new TriangleAccessor(mesh1);
  var triAccessor2 = new TriangleAccessor(mesh2);
  var nTris1 = triAccessor1.numTriangles();
  var nTris2 = triAccessor2.numTriangles();
  var result;
  var tmpTriangle1 = new THREE.Triangle();
  var savedTriangle1 = new THREE.Triangle();
  var tmpTriangle2 = new THREE.Triangle();
  var savedTriangle2 = new THREE.Triangle();
  for (var i = 0; i < nTris1; i++) {
    triAccessor1.getTriangle(i, tmpTriangle1, mesh1.matrixWorld);
    for (var j = 0; j < nTris2; j++) {
      triAccessor2.getTriangle(j, tmpTriangle2, mesh2.matrixWorld);
      var r = TriangleTriangleDistanceSquared(tmpTriangle1, tmpTriangle2, opts);
      if (!result || r.distanceSq < result.distanceSq) {
        result = r;
        if (opts.all) {
          savedTriangle1.copy(tmpTriangle1);
          savedTriangle2.copy(tmpTriangle2);
          result.closestFaceIndex0 = i;
          result.closestFaceIndex1 = j;
          result.closestTriangle0 = savedTriangle1;
          result.closestTriangle1 = savedTriangle2;
        }
      }
    }
  }
  return result;
}

/**
 * Computes the directed hausdorff distance
 * @param mesh1 {THREE.Mesh}
 * @param mesh2 {THREE.Mesh}
 * @param opts
 * @param opts.shortCircuit {{maxDistSq: number}} Options for shortcircuiting the full distance computation
 * @param opts.sampler {{sampleMeshes: function(Array<THREE.Mesh|geo.PartialMesh>, int)}} Sampler for sampling meshes
 * @param opts.nsamples {int}: Number of samples to produce
 * @returns {*}
 * @constructor
 */
function MeshMeshHausdorffDirectedDistanceSquared(mesh1, mesh2, opts) {
  var result;
  var innerOpts = _.clone(opts);
  innerOpts.shortCircuit = { minDistSq: 0 };
  var done = false;
  var savedPoint = new THREE.Vector3();
  GeometryUtil.forMeshVertices(mesh1, function (v) {
      var r = PointMeshDistanceSquared(v, mesh2, innerOpts);
      if (!result || r.distanceSq > result.distanceSq) {
        result = r;
        innerOpts.shortCircuit.minDistSq = result.distanceSq;
        if (opts.shortCircuit && opts.shortCircuit.maxDistSq != undefined) {
          if (result.distanceSq >= opts.shortCircuit.maxDistSq) {
            done = true;
          }
        }
        if (opts.all) {
          savedPoint.copy(result.closestPoint0);
          result.closestPoint0 = savedPoint;
        }
      }
    },
    null, function() { return done; }
  );
  // Sample more points on surfaces to test
  if (!done && opts.sampler && opts.nsamples) {
    // Let's try to sample some points and check them
    var samples = opts.sampler.sampleMeshes([mesh1], opts.nsamples);
    samples = _.flatten(samples);
    for (var i = 0; i < samples.length && !done; i++) {
      var r = PointMeshDistanceSquared(samples[i].worldPoint, mesh2, innerOpts);
      if (!result || r.distanceSq > result.distanceSq) {
        result = r;
        innerOpts.shortCircuit.minDistSq = result.distanceSq;
        if (opts.shortCircuit && opts.shortCircuit.maxDistSq != undefined) {
          if (result.distanceSq >= opts.shortCircuit.maxDistSq) {
            done = true;
          }
        }
        if (opts.all) {
          savedPoint.copy(result.closestPoint0);
          result.closestPoint0 = savedPoint;
        }
      }
    }
  }
  if (result && opts.all) {
    renameFields(result, [['closestPoint0', 'point0'], ['closestPoint1', 'point1'],
      ['triangleBary', 'triangleBary1'],
      ['closestFaceIndex', 'faceIndex1'], ['closestTriangle', 'triangle1']]);
  }
  return result;
}

function MeshMeshHausdorffDistanceSquared(mesh1, mesh2, opts) {
  var r1 = MeshMeshHausdorffDistanceSquared(mesh1, mesh2, opts);
  var r2 = MeshMeshHausdorffDistanceSquared(mesh2, mesh1, opts);
  if (r2.distanceSq > r1.distanceSq) {
    swapFields(r2, [['point0', 'point1'], ['faceIndex0', 'faceIndex1'],
      ['triangle0', 'triangle1'], ['triangleBary0', 'triangleBary1']]);
    return r2;
  } else {
    return r1;
  }
}

function PointMeshesDistanceSquared(point, meshes, opts) {
  if (opts.profile) {
    console.time('PointMeshesDistanceSquared');
  }
  var result;
  var done = false;
  for (var i = 0; i < meshes.length && !done; i++) {
    var mesh = meshes[i];
    if (result) {
      // check if this mesh is worth comparing against
      var bbox = Object3DUtil.getBoundingBox(mesh.mesh || mesh);
      var distToBBox = bbox.distanceToPoint(point, 'signed');
      var distSqToBBox = distToBBox*distToBBox;
      if (distToBBox > 0 && distSqToBBox > result.distanceSq) {
        // mesh too far from point
        // console.log('skipping mesh', i);
        continue;
      }
    }
    if (mesh instanceof THREE.Mesh) {
      var r = PointMeshDistanceSquared(point, mesh, opts);
      if (!result || r.distanceSq < result.distanceSq) {
        result = r;
        if (opts.shortCircuit && opts.shortCircuit.minDistSq != undefined) {
          if (result.distanceSq <= opts.shortCircuit.minDistSq) {
            done = true;
          }
        }
        if (opts.all) {
          r.meshIndex = i;
        }
      }
    } else if (mesh.mesh && mesh.faceIndices) {
      var r = PointPartialMeshDistanceSquared(point, mesh.mesh, mesh.faceIndices, opts);
      if (!result || r.distanceSq < result.distanceSq) {
        result = r;
        if (opts.shortCircuit && opts.shortCircuit.minDistSq != undefined) {
          if (result.distanceSq <= opts.shortCircuit.minDistSq) {
            done = true;
          }
        }
        if (opts.all) {
          r.meshIndex = i;
        }
      }
    } else {
      throw "Unsupported mesh type";
    }
  }
  if (opts.profile) {
    console.timeEnd('PointMeshesDistanceSquared');
  }
  return result;
}

function MeshesPointDistanceSquared(meshes, point, opts) {
  var result = PointMeshesDistanceSquared(point, meshes, opts);
  if (opts.all) {
    swapFields(result, [['closestPoint0', 'closestPoint1']]);
  }
  return result;
}

/**
 * Computes the directed hausdorff distance
 * @param meshes1 {Array<THREE.Mesh|geo.PartialMesh>}
 * @param meshes2 {Array<THREE.Mesh|geo.PartialMesh>}
 * @param opts
 * @param opts.shortCircuit {{maxDistSq: number}} Options for shortcircuiting the full distance computation
 * @param opts.sampler {{sampleMeshes: function(Array<THREE.Mesh|geo.PartialMesh>, int)}} Sampler for sampling meshes
 * @param opts.nsamples {int}: Number of samples to produce
 * @returns {*}
 * @constructor
 */
function MeshesMeshesHausdorffDirectedDistanceSquared(meshes1, meshes2, opts) {
  // TODO: Add more candidate points that is at the vertex of meshes1
  console.time('MeshesMeshesHausdorffDirectedDistanceSquared');
  var innerOpts = _.clone(opts);
  innerOpts.shortCircuit = { minDistSq: 0 };
  var result;
  var tmpPoint = new THREE.Vector3();
  var savedPoint = new THREE.Vector3();
  var done = false;
  for (var i = 0; i < meshes1.length && !done; i++) {
    var mesh1 = meshes1[i];
    if (mesh1 instanceof THREE.Mesh) {
      GeometryUtil.forMeshVertices(mesh1, function (v) {
          var r = PointMeshesDistanceSquared(v, meshes2, innerOpts);
          if (!result || r.distanceSq > result.distanceSq) {
            result = r;
            innerOpts.shortCircuit.minDistSq = result.distanceSq;
            if (opts.shortCircuit && opts.shortCircuit.maxDistSq != undefined) {
              if (result.distanceSq > opts.shortCircuit.maxDistSq) {
                done = true;
              }
            }
            if (opts.all) {
              savedPoint.copy(result.closestPoint0);
              result.closestPoint0 = savedPoint;
              result.meshIndex0 = i;
            }
          }
        },
      null, function() { return done; });
    } else if (mesh1.mesh && mesh1.faceIndices) {
      var transform = mesh1.mesh.matrixWorld;
      var checkedIVerts = new Set();
      for (var k = 0; k < mesh1.faceIndices.length && !done; k++) {
        var iTri = mesh1.faceIndices[k];
        var iVerts = GeometryUtil.getFaceVertexIndices(mesh1.mesh.geometry, iTri);
        for (var j = 0; j < iVerts.length && !done; j++) {
          var iVert = iVerts[j];
          if (checkedIVerts.has(iVert)) {
            continue;
          }
          checkedIVerts.add(iVert);
          GeometryUtil.getGeometryVertex(mesh1.mesh.geometry, iVert, transform, tmpPoint);
          // TODO: check vertices directly
          // var vertCheck = findVertexInMeshes(meshes2, mesh1, iVert);
          // _.defaults({ mesh: mesh1, iVert: iVert }, innerOpts);
          // var tmp = _.filter(meshes2, function(x) { return x.mesh? x.mesh.uuid === mesh1.mesh.uuid : x.uuid === mesh1.mesh.uuid; });
          // var compare = tmp.length? tmp : meshes2;
          var r = PointMeshesDistanceSquared(tmpPoint, meshes2, innerOpts);
          if (!result || r.distanceSq > result.distanceSq) {
            result = r;
            innerOpts.shortCircuit.minDistSq = result.distanceSq;
            // TODO: better name  for short circuit distance
            if (opts.shortCircuit && opts.shortCircuit.maxDistSq != undefined) {
              if (result.distanceSq > opts.shortCircuit.maxDistSq) {
                done = true;
              }
            }
            if (opts.all) {
              savedPoint.copy(result.closestPoint0);
              result.closestPoint0 = savedPoint;
              result.meshIndex0 = i;
              result.faceIndex0 = iTri;
            }
          }
        }
      }
    } else {
      throw "Unsupported mesh type";
    }
  }
  // Sample more points on surfaces to test
  if (!done && opts.sampler && opts.nsamples) {
    // Let's try to sample some points and check them
    var samples = opts.sampler.sampleMeshes(meshes1, opts.nsamples);
    samples = _.flatten(samples);
    for (var i = 0; i < samples.length && !done; i++) {
      var r = PointMeshesDistanceSquared(samples[i].worldPoint, meshes2, innerOpts);
      if (!result || r.distanceSq > result.distanceSq) {
        result = r;
        innerOpts.shortCircuit.minDistSq = result.distanceSq;
        if (opts.shortCircuit && opts.shortCircuit.maxDistSq != undefined) {
          if (result.distanceSq >= opts.shortCircuit.maxDistSq) {
            done = true;
          }
        }
        if (opts.all) {
          savedPoint.copy(result.closestPoint0);
          result.closestPoint0 = savedPoint;
          result.meshIndex0 = samples[i].meshIndex;
          result.faceIndex0 = samples[i].face;
        }
      }
    }
  }
  if (result && opts.all) {
    renameFields(result, [['closestPoint0', 'point0'], ['closestPoint1', 'point1'],
      ['meshIndex', 'meshIndex1'], ['triangleBary', 'triangleBary1'],
      ['closestFaceIndex', 'faceIndex1'], ['closestTriangle', 'triangle1']]);
  }
  console.timeEnd('MeshesMeshesHausdorffDirectedDistanceSquared');
  return result;
}

function MeshesMeshesHausdorffDistanceSquared(meshes1, meshes2, opts) {
  var r1 = MeshesMeshesHausdorffDistanceSquared(meshes1, meshes2, opts);
  var r2 = MeshesMeshesHausdorffDistanceSquared(meshes1, meshes2, opts);
  if (r2.distanceSq > r1.distanceSq) {
    swapFields(r2, [['point0', 'point1'], ['meshIndex0', 'meshIndex1'], ['faceIndex0', 'faceIndex1'],
      ['triangle0', 'triangle1'], ['triangleBary0', 'triangleBary1']]);
    return r2;
  } else {
    return r1;
  }
}


var distanceFnMapping = {
  'point-point': PointPointDistanceSquared,
  'point-line': null,
  'point-segment': null,
  'point-triangle': PointTriangleDistanceSquared,
  'point-mesh': PointMeshDistanceSquared,
  'line-point': null,
  'line-line': null,
  'line-segment': LineSegmentDistanceSquared,
  'line-triangle': LineTriangleDistanceSquared,
  'line-mesh': null,
  'segment-point': null,
  'segment-line': SegmentLineDistanceSquared,
  'segment-segment': null,
  'segment-triangle': LineSegmentTriangleDistanceSquared,
  'segment-mesh': null,
  'triangle-point': TrianglePointDistanceSquared,
  'triangle-line': TriangleLineDistanceSquared,
  'triangle-segment': TriangleLineSegmentDistanceSquared,
  'triangle-triangle': TriangleTriangleDistanceSquared,
  'triangle-mesh': null,
  'points-points': PointsPointsMinDistanceSquared,
  'mesh-point': MeshPointDistanceSquared,
  'mesh-line': null,
  'mesh-segment': null,
  'mesh-triangle': null,
  'mesh-mesh': MeshMeshDistanceSquared,
  'point-meshes': PointMeshesDistanceSquared,
  'meshes-point': MeshesPointDistanceSquared
};

function computeDistance(object1, object2, opts) {
  function getType(obj) {
    if (obj.type) { return obj.type; }
    if (obj instanceof THREE.Triangle) { return 'triangle'; }
    if (obj instanceof THREE.Mesh) { return 'mesh'; }
  }
  var type1 = getType(object1);
  var type2 = getType(object2);
  var fn = distanceFnMapping[type1 + '-' + type2];
  if (fn) {
    return fn(object1, object2, opts);
  } else {
    throw "Unsupported distance computation " + type1 + " and " + type2;
  }
}

module.exports = {
  PointPointDistanceSquared: PointPointDistanceSquared,
  PointTriangleDistanceSquared: PointTriangleDistanceSquared,
  PointMeshDistanceSquared: PointMeshDistanceSquared,
  LineSegmentDistanceSquared: LineSegmentDistanceSquared,
  LineSegmentTriangleDistanceSquared: LineSegmentTriangleDistanceSquared,
  LineTriangleDistanceSquared: LineTriangleDistanceSquared,
  TriangleTriangleDistanceSquared: TriangleTriangleDistanceSquared,
  // Hausdorff distance
  PointsPointsHausdorffDirectedDistanceSquared: PointsPointsHausdorffDirectedDistanceSquared,
  PointsPointsHausdorffDistanceSquared: PointsPointsHausdorffDistanceSquared,
  MeshMeshHausdorffDirectedDistanceSquared: MeshMeshHausdorffDirectedDistanceSquared,
  MeshMeshHausdorffDistanceSquared: MeshMeshHausdorffDistanceSquared,
  MeshesMeshesHausdorffDirectedDistanceSquared: MeshesMeshesHausdorffDirectedDistanceSquared,
  MeshesMeshesHausdorffDistanceSquared: MeshesMeshesHausdorffDistanceSquared,
  // Generic compute distance
  computeDistance: computeDistance
};