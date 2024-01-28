var Index = require('ds/Index');
var GeometryUtil = require('geo/GeometryUtil');
var _ = require('util/util');

// NOTE: This ConnectivityGraph is very naive, faces are connected only if they share the exact same vertex.
function ConnectivityGraph(geometry, remapVertices) {
  this.__vertexIndex = remapVertices? this.__buildVerticesIndex(geometry) : undefined;
  this.geometry = geometry;

  // Mapping of face index to neighboring face indices
  // neighbors are those faces that share a vertex
  this.faceNeighbors = null;

  // Mapping of face index to faces that are reverse faces
  this.reverseFaceMapping = null;

  // Mapping of faceIndex1-faceIndex2 to type of neighbor
  this.faceNeighborTypes = null;

  // Populate basic faceNeighbors
  this.build(geometry);
}

var NeighborTypes = {
  REVERSE: { index: 0, name: 'REVERSE'},
  SHARED_EDGE: { index: 1, name: 'SHARED_EDGE'},
  PARTIAL_EDGE: { index: 2, name: 'PARTIAL_EDGE'},
  SHARED_VERTEX: { index: 3, name: 'SHARED_VERTEX'}
};

ConnectivityGraph.NeighborTypes = NeighborTypes;

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

function hasSharedEdge(a1, a2) {
  for (var i = 0; i < a1.length; i++) {
    var v11 = a1[i];
    var v12 = a1[(i+1)%a1.length];
    for (var j = 0; j < a2.length; j++) {
      var v21 = a2[j];
      var v22 = a2[(j+1)%a2.length];
      if (v11 === v21 && v12 === v22) {
        return true;
      } else if (v11 === v22 && v12 === v21) {
        return true;
      }
    }
  }
  return false;
}

ConnectivityGraph.prototype.__getFaceNeighborTypes = function() {
  if (this.faceNeighborTypes) {
    return this.faceNeighborTypes;
  }

  var neighborTypes = {};
  var remapping = this.__vertexIndex? this.__vertexIndex.mappedIndices : null;
  var faceNeighbors = this.faceNeighbors;
  var geometry = this.geometry;
  var t1 = new THREE.Triangle();
  var t2 = new THREE.Triangle();

  GeometryUtil.forFaceVertexIndices(geometry, function(fi1, rawVertexIndices1) {
    var neighbors = faceNeighbors[fi1];
    var vertexIndices1 = remapping? rawVertexIndices1.map(function(rawvi) { return remapping[rawvi]; }): rawVertexIndices1;
    if (neighbors && neighbors.length) {
      GeometryUtil.getTriangle(geometry, fi1, t1);
      for (var i = 0; i < neighbors.length; i++) {
        var fi2 = neighbors[i];
        var rawVertexIndices2 = GeometryUtil.getFaceVertexIndices(geometry, fi2);
        var vertexIndices2 = remapping? rawVertexIndices2.map(function(rawvi) { return remapping[rawvi]; }): rawVertexIndices2;

        var k = fi1 + '-' + fi2;
        var isReversed = _.isReversed(vertexIndices1, vertexIndices2);
        if (isReversed) {
          neighborTypes[k] = NeighborTypes.REVERSE;
        } else if (hasSharedEdge(vertexIndices1, vertexIndices2)) {
          neighborTypes[k] = NeighborTypes.SHARED_EDGE;
        } else {
          GeometryUtil.getTriangle(geometry, fi2, t2);
          if (GeometryUtil.trianglesShareEdge(t1, t2)) {
            neighborTypes[k] = NeighborTypes.PARTIAL_EDGE;
          } else {
            neighborTypes[k] = NeighborTypes.SHARED_VERTEX;
          }
        }
      }
    }
  });

  this.faceNeighborTypes = neighborTypes;
  return this.faceNeighborTypes;
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
        var isReversed = _.isReversed(vertexIndices, otherVertexIndices);
        if (isReversed) {
          if (!reverseFaceMapping[faceIndex]) {
            reverseFaceMapping[faceIndex] = [];
          }
          reverseFaceMapping[faceIndex].push(iFaceOther);
        }
      }
    }
  });
  this.reverseFaceMapping = reverseFaceMapping;
  return reverseFaceMapping;
};

ConnectivityGraph.prototype.getFaceNeighbors = function(faceIndex) {
  return this.faceNeighbors[faceIndex];
};

ConnectivityGraph.prototype.getFaceNeighborTypes = function(fi1) {
  var neighborTypes = this.__getFaceNeighborTypes();
  if (fi1 == null) {
    return neighborTypes;
  } else {
    var faceNeighbors = this.faceNeighbors[fi1];
    if (faceNeighbors && faceNeighbors.length) {
      return _.map(faceNeighbors, fi2 => {
        var key = fi1 + '-' + fi2;
        return { faceIndex: fi2, neighborType: neighborTypes[key] };
      });
    }
  }
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