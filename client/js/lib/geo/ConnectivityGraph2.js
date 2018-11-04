var Index = require('ds/Index');
var GeometryUtil = require('geo/GeometryUtil');

// NOTE: This ConnectivityGraph is very naive, faces are connected only if they share the exact same vertex.
function ConnectivityGraph(geometry, remapVertices) {
  this.__vertexIndex = remapVertices? this.__buildVerticesIndex(geometry) : undefined;
  this.geometry = geometry;
  this.build(geometry);
}

/**
 * Builds a mapping of the vertices to a collapsed set of vertices
 *   where vertices at the same position are mapped to the same index
 * @return a pair of index of vertex locations (Vector3f) to Int,
 *                   map of original vertex index to remapped vertex index
 */
ConnectivityGraph.prototype.__buildVerticesIndex = function(geometry) {
  var verticesIndex = new Index({
    id: function(v) { return v.x.toString() + ',' + v.y.toString() + ',' + v.z.toString(); }
  });
  var mappedIndices = [];
  var position = new THREE.Vector3();
  var nVertices = GeometryUtil.getGeometryVertexCount(geometry);
  for (var i = 0; i < nVertices; i++) {
    GeometryUtil.copyGeometryVertex(position, geometry, i);
    var mappedIndex = verticesIndex.indexOf(position, true);
    mappedIndices[i] = mappedIndex;
  }
  return {
    verticesIndex: verticesIndex,
    mappedIndices: mappedIndices,
    toMapped: function(vis) {
      if (vis.length) {
        return vis.map(function (vi) {
          return mappedIndices[vi];
        });
      } else {
        return mappedIndices[vis];
      }
    }
  };
};

ConnectivityGraph.prototype.build = function(geometry) {
  var nVertices = GeometryUtil.getGeometryVertexCount(geometry);
  var vertexToFaces = new Array(nVertices);
  var remapping = this.__vertexIndex? this.__vertexIndex.mappedIndices : null;
  GeometryUtil.forFaceVertexIndices(geometry, function(faceIndex, vertexIndices) {
    for (var i = 0; i < vertexIndices.length; i++) {
      var rawvi = vertexIndices[i];
      var vi = remapping? remapping[rawvi] : rawvi;
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
      var rawvi = vertexIndices[i];
      var vi = remapping? remapping[rawvi] : rawvi;
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

ConnectivityGraph.prototype.getReverseFaceMappings = function() {
  if (this.reverseFaceMapping) {
    return this.reverseFaceMapping;
  }
  var remapping = this.__vertexIndex? this.__vertexIndex.mappedIndices : null;
  var reverseFaceMapping = [];
  var faceNeighbors = this.faceNeighbors;
  var geometry = this.geometry;
  GeometryUtil.forFaceVertexIndices(geometry, function(faceIndex, rawVertexIndices) {
    var neighbors = faceNeighbors[faceIndex];
    var vertexIndices = remapping? rawVertexIndices.map(function(rawvi) { return remapping[rawvi]; }): rawVertexIndices;
    if (neighbors && neighbors.length) {
      for (var i = 0; i < neighbors.length; i++) {
        var iFaceOther = neighbors[i];
        var rawOtherVertexIndices = GeometryUtil.getFaceVertexIndices(geometry, iFaceOther);
        var otherVertexIndices = remapping? rawOtherVertexIndices.map(function(rawvi) { return remapping[rawvi]; }): rawOtherVertexIndices;
        if (vertexIndices.length === otherVertexIndices.length) {
//          var matched = _.every(vertexIndices, function(vi) { return otherVertexIndices.indexOf(vi) >= 0; });
          var matched = true;
          for (var j = 0; j < vertexIndices.length; j++) {
            if (vertexIndices[j] !== otherVertexIndices[otherVertexIndices.length - j - 1]) {
              matched = false;
              break;
            }
          }
          if (matched) {
            if (!reverseFaceMapping[faceIndex]) {
              reverseFaceMapping[faceIndex] = [];
            }
            reverseFaceMapping[faceIndex].push(iFaceOther);
          }
        }
      }
    }
  });
  this.reverseFaceMapping = reverseFaceMapping;
  return reverseFaceMapping;
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
    point = tri.getMidpoint(new THREE.Vector3());
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