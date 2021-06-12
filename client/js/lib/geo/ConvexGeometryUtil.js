var GeometryUtil = require('geo/GeometryUtil');
var Object3DUtil = require('geo/Object3DUtil');

require('three-convexhull');
require('three-convexgeo');

var ConvexGeometryUtil = {};

ConvexGeometryUtil.pointsToConvexGeometry = function(points) {
  return new THREE.ConvexBufferGeometry.fromPoints(points);
};

ConvexGeometryUtil.meshesToConvexGeometry = function(meshes) {
  if (!Array.isArray(meshes)) {
    meshes = [meshes];
  }
  var points = [];
  for (var i = 0; i < meshes.length; i++) {
    var mesh = meshes[i];
    var nverts = GeometryUtil.getGeometryVertexCount(mesh.geometry);
    for (var vi = 0; vi < nverts; vi++) {
      var p = GeometryUtil.getGeometryVertex(mesh.geometry, vi, mesh.matrixWorld);
      points.push(p);
    }
  }
  return ConvexGeometryUtil.pointsToConvexGeometry(points);
};

ConvexGeometryUtil.objectsToConvexGeometry = function(objects, opts) {
  opts = opts || {};
  if (!Array.isArray(objects)) {
    objects = [objects];
  }
  var meshes = [];
  for (var i = 0; i < objects.length; i++) {
    var object = objects[i];
    Object3DUtil.getPrimitives(object, opts.recursive, meshes);
  }
  return ConvexGeometryUtil.meshesToConvexGeometry(meshes);
};

module.exports = ConvexGeometryUtil;