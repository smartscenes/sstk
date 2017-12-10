var GeometryUtil = require('geo/GeometryUtil');

// NOTE: This ConnectivityGraph is very naive, faces are connected only if they share the exact same edge.
function ConnectivityGraph(geometry) {
  this.geometry = geometry;
  this.build(geometry);
}

ConnectivityGraph.prototype.build = function(geometry) {
  var nVertices = GeometryUtil.getGeometryVertexCount(geometry);
  var vertexToFaces = new Array(nVertices);
  GeometryUtil.forFaceVertexIndices(geometry, function(faceIndex, vertexIndices) {
    for (var i = 0; i < vertexIndices.length; i++) {
      var vi = vertexIndices[i];
      var vtof = vertexToFaces[vi];
      if (!vtof) {
        vtof = [faceIndex];
        vertexToFaces[vi] = vtof;
      } else {
        vtof.push(faceIndex);
      }
    }
  });

  var nFaces = GeometryUtil.getGeometryFaceCount(geometry);
  var faceNeighbors = new Array(nFaces);
  GeometryUtil.forFaceVertexIndices(geometry, function(faceIndex, vertexIndices) {
    var neighbors = faceNeighbors[faceIndex];
    if (!neighbors) {
      neighbors = [];
      faceNeighbors[faceIndex] = neighbors;
    }

    for (var i = 0; i < vertexIndices.length; i++) {
      var vi = vertexIndices[i];
      var vtof = vertexToFaces[vi];
      for (var j = 0; j < vtof.length; j++) {
        var iFaceOther = vtof[j];
        if (iFaceOther !== faceIndex && neighbors.indexOf(iFaceOther) < 0) {
          neighbors.push(iFaceOther);
        }
      }
    }
  });
  this.faceNeighbors = faceNeighbors;
};

ConnectivityGraph.prototype.gatherFaces = function(mainFaceIndex, maxLengthSq, normSimThreshold, point) {
  var geometry = this.geometry;
  var mainFaceVertexIndices = GeometryUtil.getFaceVertexIndices(geometry, mainFaceIndex);
  var mainFaceVertexPositions = mainFaceVertexIndices.map( function(vi) {
    return GeometryUtil.getGeometryVertex(geometry, vi);
  });
  var mainFaceNormal = GeometryUtil.computeFaceNormal.apply(null, mainFaceVertexPositions);

  if (!point) {
    var positions = mainFaceVertexPositions;
    var tri = new THREE.Triangle(positions[0], positions[1], positions[2]);
    point = tri.midpoint();
  }
  var maxRadiusSq = maxLengthSq/4;

  var cg = this.faceNeighbors;

  var faceIndices = [];
  var todo = [mainFaceIndex];
  var visited = {};
  visited[mainFaceIndex] = 1;
  var currentRadiusSq = 0;
  while (todo.length > 0) {
    var fi = todo.shift();
    var faceVertexIndices = GeometryUtil.getFaceVertexIndices(geometry, fi);
    var faceVertexPositions = faceVertexIndices.map( function(vi) {
      return GeometryUtil.getGeometryVertex(geometry, vi);
    });
    if (normSimThreshold) {
      var faceNormal = GeometryUtil.computeFaceNormal.apply(null, faceVertexPositions);
      var normSim = mainFaceNormal.dot(faceNormal);
      if (normSim < normSimThreshold) {
        continue;
      }
    }

    var distancesToFaceVertices = faceVertexPositions.map(function(p) {
      return point.distanceToSquared(p);
    });
    var dmax = Math.max.apply(null, distancesToFaceVertices);
    var dmin = Math.min.apply(null, distancesToFaceVertices);
    if (currentRadiusSq === 0 || dmax < maxRadiusSq || dmax <= currentRadiusSq) {
      faceIndices.push(fi);
      currentRadiusSq = Math.max(currentRadiusSq, dmax);
    }
    if (dmin < maxRadiusSq || dmax <= currentRadiusSq) {
      // Let's try to grow this!
      var neighbors = cg[fi];
      if (neighbors) {
        for (var j = 0; j < neighbors.length; j++) {
          var ni = neighbors[j];
          if (!visited[ni]) {
            visited[ni] = 1;
            todo.push(ni);
          }
        }
      }
    }
  }
  //console.log('gathered: r=' + currentRadiusSq + ', max=' + maxRadiusSq, faceIndices);
  return { faceIndices: faceIndices, radiusSq: currentRadiusSq };
};

module.exports = ConnectivityGraph;