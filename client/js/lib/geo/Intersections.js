'use strict';

var Intersections = {};

// Line clipping algorithm
// https://en.wikipedia.org/wiki/Liang%E2%80%93Barsky_algorithm

function isZero(a) {
  return a < 0.000001 && a > -0.000001;
}

function pointInside(min, max, a) {
  return a.x >= min.x && a.x <= max.x && a.y >= min.y && a.y <= max.y;
}

function clipT(num, denom, ts) {
  if (isZero(denom)) { return (num <= 0.0); }
  var t = num / denom;
  if (denom > 0) {
    if (t > ts.L) { return false; }
    if (t > ts.E) { ts.E = t; }
  } else {
    if (t < ts.E) { return false; }
    if (t < ts.L) { ts.L = t; }
  }
  return true;
}

// For line(a, b) and bbox(min, max) Return {E: t(entry), L: t(leave), intersects: true/false}
// by clipping line against bbox.
function clipLine(min, max, line) {
  var dx = line.b.x - line.a.x;  var dy = line.b.y - line.a.y;
  var ts = { E: 0, L: 1, intersects: false, clippedLine: { a: line.a.clone(), b: line.b.clone() } };
  if (isZero(dx) && isZero(dy) && pointInside(min, max, line.a)) {
    ts.intersects = true;
    return ts;
  }
  // NOTE: ordering of clipT is important due to mutations of ts
  if (clipT(min.x - line.a.x,  dx, ts) && clipT(line.a.x - max.x, -dx, ts) &&
      clipT(min.y - line.a.y,  dy, ts) && clipT(line.a.y - max.y, -dy, ts)) {
    if (ts.L < 1) {
      ts.clippedLine.b.x = line.a.x + ts.L * dx;
      ts.clippedLine.b.y = line.a.y + ts.L * dy;
    }
    if (ts.E > 0) {
      ts.clippedLine.a.x += ts.E * dx;
      ts.clippedLine.a.y += ts.E * dy;
    }
    ts.intersects = ts.E >= 0 && ts.L <= 1 && ts.E <= ts.L;
  }
  return ts;
}

Intersections.clipLine = clipLine;

function projectPoints(line, points) {
  var dx = line.b.x - line.a.x;  var dy = line.b.y - line.a.y;
  var d2 = dx*dx + dy*dy;
  return points.map(function(p) {
    var pdx = p.x - line.a.x; var pdy = p.y - line.a.y;
    var d = pdx*dx + pdy*dy;
    return new THREE.Vector2(line.a.x + dx*d/d2, line.a.y + dy*d/d2);
  });
}

Intersections.projectPoints = projectPoints;

function projectPointsToRatio(line, points) {
  var dx = line.b.x - line.a.x;  var dy = line.b.y - line.a.y;
  var d2 = dx*dx + dy*dy;
  return points.map(function(p) {
    var pdx = p.x - line.a.x; var pdy = p.y - line.a.y;
    var d = pdx*dx + pdy*dy;
    return d/d2;
  });
}

Intersections.projectPointsToRatio = projectPointsToRatio;

// Exports
module.exports = Intersections;
