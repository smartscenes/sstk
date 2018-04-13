
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

/**
 * Computes the distance between a line and a line segment
 * @param line {{origin: THREE.Vector3, direction: THREE.Vector3}}
 * @param segment {{origin: THREE.Vector3, direction: THREE.Vector3, extent: number}}
 * @param opts
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

/**
 * Computes the distance between a point and a triangle
 * @param point {THREE.Vector3}
 * @param triangle {THREE.Triangle}
 * @param opts
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
    var ds = [v1.distanceSq(point), v2.distanceSq(point), v3.distanceSq(point)];
    if (ds.min*1.01 < sqrDistance) {
      var cross = edge0.cross(edge1);
      if (opts && opts.debug && cross.lengthSq() > 0.0001) {
        console.log("Distance from vertex to point smaller than computed distance: " + ds.min + ", " + sqrDistance);
        console.log("Distances from vertices are: " + ds.join(","));
        console.log("Point is " + point);
        console.log("Triangle is " + v1 + ", " + v2 + ", " + v3);
        console.log("Triangle normal is " + triangle.normal());
        console.log("edge0 cross edge1 is " + cross);
      }
      sqrDistance = ds.min;
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
      closestPoint1.addScaledVector(edge0, t);
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

/**
 * Computes the distance between a line and a triangle
 * @param line {{origin: THREE.Vector3, direction: THREE.Vector3}}
 * @param triangle {THREE.Triangle}
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
      // TODO: FIX this function!!!
      Vector3f.generateComplementBasis(u, v, line.direction);
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

/**
 * Computes the distance between a line segment and a triangle
 * @param segment
 * @param triangle
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

// Computes the distance between two triangles
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
      }
    } else {
      return {
        distanceSq: distSq
      }
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

module.exports = {

};