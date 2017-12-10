var GeometryUtil = require('geo/GeometryUtil');

function getFaceFaceDistanceCalculator(geometry) {
  return function(a,b) {
    var v1Indices = GeometryUtil.getFaceVertexIndices(geometry, a);
    var v2Indices = GeometryUtil.getFaceVertexIndices(geometry, b);
    var v1Positions = v1Indices.map( function(vi) {
      return GeometryUtil.getGeometryVertex(geometry, vi);
    });
    var v2Positions = v2Indices.map( function(vi) {
      return GeometryUtil.getGeometryVertex(geometry, vi);
    });
    var maxDistance = 0;
    for (var i = 0; i < v1Positions.length; i++) {
      for (var j = 0; j < v2Positions.length; j++) {
        var d = v1Positions[i].distanceToSquared(v2Positions[j]);
        if (d > maxDistance) {
          maxDistance = d;
        }
      }
    }
    return maxDistance;
  };
}

function getPointFaceVerticesDistanceCalculator(geometry) {
  return function(p,a) {
    var v1Indices = GeometryUtil.getFaceVertexIndices(geometry, a);
    var v1Positions = v1Indices.map( function(vi) {
      return GeometryUtil.getGeometryVertex(geometry, vi);
    });
    var maxDistance = 0;
    for (var i = 0; i < v1Positions.length; i++) {
      var d = p.distanceToSquared(v1Positions[i]);
      if (d > maxDistance) {
        maxDistance = d;
      }
    }
    return maxDistance;
  };
}

function createVPTreeVertex(geometry) {
  var VPTreeFactory = require('ds/VPTree');
  return VPTreeFactory.build(GeometryUtil.getGeometryVertexCount(geometry), function(a,b) {
    var v1 = GeometryUtil.getGeometryVertex(geometry, a);
    var v2 = GeometryUtil.getGeometryVertex(geometry, b);
    return v1.distanceToSquared(v2);
  });
}

function createVPTreeFace(geometry) {
  var VPTreeFactory = require('ds/VPTree');
  return VPTreeFactory.build(GeometryUtil.getGeometryFaceCount(geometry), getFaceFaceDistanceCalculator(geometry));
}

// NOTE: This ConnectivityGraph is very naive, faces are connected only if they share the exact same edge.
function ConnectivitySearch(geometry, restrictToConnected) {
  this.geometry = geometry;
  this.restrictToConnected = restrictToConnected;
  this.vptree = createVPTreeFace(geometry);
}

function buildEdgeMap(geometry, faceIndices) {
  var edgeMap = {};
  for (var i = 0; i < faceIndices.length; i++) {
    var iFace = faceIndices[i];
    var faceVertexIndices = GeometryUtil.getFaceVertexIndices(geometry, iFace);
    for (var iFaceVert = 0; iFaceVert < faceVertexIndices.length; iFaceVert++) {
      var iVert1a = faceVertexIndices[iFaceVert];
      var iVert2a = faceVertexIndices[(iFaceVert + 1) % faceVertexIndices.length];
      var iVert1 = Math.min( iVert1a, iVert2a );
      var iVert2 = Math.max( iVert1a, iVert2a );

      var edgeKey = iVert1 + '-' + iVert2;
      var edge = edgeMap[edgeKey];
      if (!edge) {
        edge = {
          v1: iVert1,
          v2: iVert2,
          faces: []
        };
        edgeMap[edgeKey] = edge;
      }
      edge.faces.push(iFace);
    }
  }
  return edgeMap;
}

function buildConnectivityGraph(geometry, faceIndices, edgeMap) {
  if (!edgeMap) {
    edgeMap = buildEdgeMap(geometry, faceIndices);
  }
  var faceMap = {};
  for (var i = 0; i < faceIndices.length; i++) {
    var iFace = faceIndices[i];
    var neighbors = faceMap[iFace];
    if (!neighbors) {
      neighbors = [];
      faceMap[iFace] = neighbors;
    }
    var faceVertexIndices = GeometryUtil.getFaceVertexIndices(geometry, iFace);
    for (var iFaceVert = 0; iFaceVert < faceVertexIndices.length; iFaceVert++) {
      var iVert1a = faceVertexIndices[iFaceVert];
      var iVert2a = faceVertexIndices[(iFaceVert + 1) % faceVertexIndices.length];
      var iVert1 = Math.min(iVert1a, iVert2a);
      var iVert2 = Math.max(iVert1a, iVert2a);

      var edgeKey = iVert1 + '-' + iVert2;
      var edge = edgeMap[edgeKey];
      if (edge) {
        for (var j = 0; j < edge.faces.length; j++) {
          var iFaceOther = edge.faces[j];
          if (iFaceOther !== iFace && neighbors.indexOf(iFaceOther) < 0) {
            neighbors.push(iFaceOther);
          }
        }
      }
    }

  }
  return faceMap;
}

ConnectivitySearch.prototype.gatherFaces = function(mainFaceIndex, maxLengthSq, normSimThreshold, point) {
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
  var neighboringFaceIndices = this.vptree.search(mainFaceIndex, null, maxRadiusSq*1.1).map( function(x) {
    return x.i;  // x has dist and i
  });

  if (!this.restrictToConnected) {
    if (normSimThreshold) {
      neighboringFaceIndices = neighboringFaceIndices.filter(function(fi) {
        var faceVertexIndices = GeometryUtil.getFaceVertexIndices(geometry, fi);
        var faceVertexPositions = faceVertexIndices.map( function(vi) {
          return GeometryUtil.getGeometryVertex(geometry, vi);
        });
        var faceNormal = GeometryUtil.computeFaceNormal.apply(null, faceVertexPositions);
        var normSim = mainFaceNormal.dot(faceNormal);
        return (normSim >= normSimThreshold);
      });
    }

    var currentRadiusSq = 0;
    var distanceCalculator = getPointFaceVerticesDistanceCalculator(geometry);
    for (var i = 0; i < neighboringFaceIndices.length; i++) {
      var d = distanceCalculator(point, neighboringFaceIndices[i]);
      if (d > currentRadiusSq) {
        currentRadiusSq = d;
      }
    }
    return { faceIndices: neighboringFaceIndices, radiusSq: currentRadiusSq };
  }

  var cg = buildConnectivityGraph(geometry, neighboringFaceIndices);

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

module.exports = ConnectivitySearch;