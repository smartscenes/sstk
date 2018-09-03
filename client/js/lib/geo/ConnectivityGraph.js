var Index = require('ds/Index');

// NOTE: This ConnectivityGraph is very naive, faces are connected only if they share the exact same edge.
function ConnectivityGraph(geometry, remapVertices) {
  this.build(geometry, remapVertices);
}

/**
 * Builds a mapping of the vertices to a collapsed set of vertices
 *   where vertices at the same position are mapped to the same index
 * @return a pair of index of vertex locations (Vector3f) to Int,
 *                   map of original vertex index to remapped vertex index
 */
ConnectivityGraph.prototype.__buildVerticesIndex = function(vertices) {
  var verticesIndex = new Index({
    id: function(v) { return v.x.toString() + ',' + v.y.toString() + ',' + v.z.toString(); }
  });
  var mappedIndices = [];
  for (var i = 0; i < vertices.length; i++) {
    var v = vertices[i];
    var mappedIndex = verticesIndex.indexOf(v, true);
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

ConnectivityGraph.prototype.getEdge = function( a, b ) {
  var map = this.sourceEdges;
  var vertexIndexA = Math.min( a, b );
  var vertexIndexB = Math.max( a, b );
  var key = vertexIndexA + "_" + vertexIndexB;
  return map[ key ];
};

function processEdge( a, b, vertices, map, face, metaVertices, vertexIndex ) {
  var ma = vertexIndex? vertexIndex.toMapped(a) : a;
  var mb = vertexIndex? vertexIndex.toMapped(b) : b;
  var mVertexIndexA = Math.min( ma, mb );
  var mVertexIndexB = Math.max( ma, mb );

  var key = mVertexIndexA + "_" + mVertexIndexB;
  var edge;
  if ( key in map ) {
    edge = map[ key ];
  } else {
    var vertexIndexA = (ma === mVertexIndexA)? a : b;
    var vertexIndexB = (ma === mVertexIndexA)? b : a;
    var vertexA = vertices[ vertexIndexA ];
    var vertexB = vertices[ vertexIndexB ];
    edge = {
      a: vertexA, // pointer reference
      b: vertexB,
      newEdge: null,
      // aIndex: a, // numbered reference
      // bIndex: b,
      lengthSq: vertexA.distanceToSquared(vertexB),
      faces: [] // pointers to face
    };
    map[ key ] = edge;
  }

  edge.faces.push( face );
  metaVertices[ a ].edges.push( edge );
  metaVertices[ b ].edges.push( edge );
  return map[key];
}

var computeArea = function () {

  var v0 = new THREE.Vector3();
  var v1 = new THREE.Vector3();

  return function (face, vertices) {
    var a = vertices[face.a];
    var b = vertices[face.b];
    var c = vertices[face.c];

    v0.subVectors( c, b );
    v1.subVectors( a, b );

    return v0.cross( v1 ).length() * 0.5;

  };
}();

function generateLookups( vertices, faces, metaVertices, edges, metaFaces, vertexIndex ) {
  var i, il, face;

  for ( i = 0, il = vertices.length; i < il; i ++ ) {
    metaVertices[ i ] = { edges: [] };
  }

  for ( i = 0, il = faces.length; i < il; i ++ ) {
    face = faces[ i ];
    var e0 = processEdge( face.a, face.b, vertices, edges, i, metaVertices, vertexIndex );
    var e1 = processEdge( face.b, face.c, vertices, edges, i, metaVertices, vertexIndex );
    var e2 = processEdge( face.c, face.a, vertices, edges, i, metaVertices, vertexIndex );
    metaFaces[i] = { face: face, area: computeArea(face, vertices) };
    if (e0.lengthSq < e1.lengthSq && e0.lengthSq < e2.lengthSq) {
      metaFaces[i].edges = (e1.lengthSq < e2.lengthSq)? [e0,e1,e2] : [e0,e2,e1];
    } else if (e1.lengthSq < e0.lengthSq && e1.lengthSq < e2.lengthSq) {
      metaFaces[i].edges = (e0.lengthSq < e2.lengthSq) ? [e1, e0, e2] : [e1, e2, e0];
    } else {
      metaFaces[i].edges = (e0.lengthSq < e1.lengthSq) ? [e2, e0, e1] : [e2, e1, e0];
    }
  }
}

ConnectivityGraph.prototype.build = function(geometry, remapVertices) {
  this.__vertexIndex = remapVertices? this.__buildVerticesIndex(geometry.vertices) : undefined;
  this.metaVertices = new Array( geometry.vertices.length ); // Vertex Index => [ edge1, edge2, ... ]
  this.sourceEdges = {}; // Edge => { vertex1, vertex2, faces[]  }
  this.metaFaces = new Array( geometry.faces.length );   // Face index => [ e0, e1, e2 ] sorted by edge length
  this.geometry = geometry;
  if (this.__vertexIndex && this.__vertexIndex.mappedIndices.length !== this.__vertexIndex.verticesIndex.__objects.length) {
    console.log(geometry.name, this.__vertexIndex);
  }
  generateLookups(geometry.vertices, geometry.faces, this.metaVertices, this.sourceEdges, this.metaFaces, this.__vertexIndex);
};

ConnectivityGraph.prototype.gatherNeighbors = function(faceIndex) {
  var f = this.metaFaces[faceIndex];
  var todo = [faceIndex];
  var visited = {};
  for (var i = 2; i >= 0; i--) {
    var edge = f.edges[i];
    // Add neighbors
    var neighbors = edge.faces;
    console.log(neighbors);
    for (var j = 0; j < neighbors.length; j++) {
      var ni = neighbors[j];
      if (!visited[ni]) {
        visited[ni] = 1;
        todo.push(ni);
      }
    }
  }
  return { faceIndices: todo, radiusSq: undefined };
};

ConnectivityGraph.prototype.gatherFaces = function(faceIndex, maxLengthSq, normSimThreshold, point) {
  var mainFace = this.metaFaces[faceIndex];
  if (!point) {
    var face = mainFace.face;
    var tri = new THREE.Triangle(this.geometry.vertices[face.a], this.geometry.vertices[face.b], this.geometry.vertices[face.c]);
    var point = new THREE.Vector3();
    point = tri.getMidPoint(point);
  }
  var maxRadiusSq = maxLengthSq/4;
  var faceIndices = [];
  var todo = [faceIndex];
  var visited = {};
  visited[faceIndex] = 1;
  var currentRadiusSq = 0;
  while (todo.length > 0) {
    var fi = todo.shift();
    var f = this.metaFaces[fi];
    if (!f) {
      console.log('no face for fi=' + fi);
      continue;
    }
    if (normSimThreshold) {
      var normSim = mainFace.face.normal.dot(f.face.normal);
      if (normSim < normSimThreshold) {
        continue;
      }
    }
    var va = this.geometry.vertices[f.face.a];
    var vb = this.geometry.vertices[f.face.b];
    var vc = this.geometry.vertices[f.face.c];
    var da = point.distanceToSquared(va);
    var db = point.distanceToSquared(vb);
    var dc = point.distanceToSquared(vc);
    var dmax = Math.max(da, db, dc);
    var dmin = Math.min(da, db, dc);
    if (currentRadiusSq === 0 || dmax < maxRadiusSq || dmax <= currentRadiusSq) {
      faceIndices.push(fi);
      currentRadiusSq = Math.max(currentRadiusSq, dmax);
    }
    if (dmin < maxRadiusSq || dmax <= currentRadiusSq) {
      // Let's try to grow this!
      for (var i = 2; i >= 0; i--) {
        var edge = f.edges[i];
        // Add neighbors
        var neighbors = edge.faces;
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