var GeometryUtil = require('geo/GeometryUtil');
var Object3DUtil = require('geo/Object3DUtil');

var self = {};

// TODO: Move more functions from Picker here
// Temp variables
var __raycaster = new THREE.Raycaster();
var __backfaceRaycaster = new THREE.Raycaster();
__backfaceRaycaster.intersectBackFaces = true;

/**
 * Intersection information
 * @typedef Intersect
 * @type {object}
 * @property {number} distance
 * @property {THREE.Vector3} point
 * @property {int} index
 * @property {THREE.Face3} face Face being interfacted
 * @property {int} faceIndex Index of face
 */

/**
 * Returns list of intersected for ray
 * @param raycaster {THREE.Raycaster} Raycaster
 * @param objects {THREE.Object3D[]} List objects to intersect
 * @param ignore {THREE.Object3D} Object to ignore
 * @param n {int} Number of intersects to return
 * @param renderer {THREE.Renderer}
 * @returns {Intersect[]}
 */
self.getIntersectedForRay = function (raycaster, objects, ignore, n, renderer) {
  var intersected = raycaster.intersectObjects(objects, true);
  intersected = self.filterClipped(intersected, renderer);
  self.sortIntersectionsByNormal(raycaster.ray, intersected);
  return self.selectIntersectedObjects(intersected, objects, ignore, n);
};

/**
 * Filters intersected by renderer clippingPlanes
 * @param intersected {Intersect[]}
 * @param renderer {THREE.Renderer}
 * @returns {*}
 */
self.filterClipped = function(intersected, renderer) {
  if (renderer && renderer.clippingPlanes.length > 0) {
    intersected = intersected.filter(function(elem) {
      return renderer.clippingPlanes.every(function(elem2) {
        return elem2.distanceToPoint(elem.point) > 0;
      });
    });
  }
  return intersected;
};

self.getIntersected = function(objects, opts) {
  var rc = opts.intersectBackFaces? __backfaceRaycaster : __raycaster;
  rc.ray.origin.copy(opts.position);
  rc.ray.direction.copy(opts.direction);
  rc.near = opts.near || 0;
  rc.far = opts.far || Infinity;
  return self.getIntersectedForRay(rc, objects, opts.ignore, opts.n, opts.renderer);
};

self.sortIntersectionsByNormal = function(ray, intersections) {
  var d = ray.direction;
  intersections.sort(function (a, b) {
    if (a.distance < b.distance) { return -1; }
    if (a.distance > b.distance) { return 1; }
    var na = self.getIntersectedNormal(a);
    var nb = self.getIntersectedNormal(b);
    var nadot = na? d.dot(na) : NaN;
    var nbdot = nb? d.dot(nb) : NaN;
    //console.log(nadot);
    //console.log(nbdot);
    if (nadot < nbdot) { return -1; }
    if (nadot > nbdot) { return 1; }
    return 0;
  });
};

/**
 * From list of intersected, pick out the ones that are actually in the list of objects
 * If the object is intersected multiple times, it will be picked multiple times
 * Original intersected mesh/points is moved to `descendant` field and matched object is now called `object`
 * @param intersected {Intersect[]} Array of intersected objects
 * @param objects {THREE.Object3D[]} Array of ancestor objects that we are actually interested in
 * @param [ignore] {THREE.Object3D[]} Array of objects to ignore
 * @param [n] {int} Max number of entries to return
 * @param [allowAllModelInstances] {boolean} Whether any model instance is allowed as intersected object
 * @returns {Intersect[]}
 */
self.selectIntersectedObjects = function (intersected, objects, ignore, n, allowAllModelInstances) {
  var intersectedObjects = [];
  for (var i = 0; i < intersected.length; i++) {
    var c = intersected[i].object;
    // follow parents until we reach an object we know about
    var o = c;
    var index = -1;
    var modelInstance = null;
    while (o) {
      index = objects.indexOf(o);
      if (index >= 0) {
        break;
      }
      // Drop out if model instance (not object we care about)
      modelInstance = Object3DUtil.getModelInstance(o);
      if (modelInstance) {
        break;
      }
      o = o.parent;
    }
    if (index >= 0 || allowAllModelInstances) {
      intersected[i].object = o;
      intersected[i].descendant = c;
      var ignoreObject = (ignore && Object3DUtil.isDescendantOf(o, ignore));
      if (!ignoreObject) {
        intersectedObjects.push(intersected[i]);
      }
      // Reached limit of how many we wanted
      if (n && intersectedObjects.length > n) break;
    } else {
      //console.log('Cannot find parent for intersected child');
    }
  }
  return intersectedObjects;
};

self.getClosestPerObject = function(intersected, deltaThreshold) {
  if (intersected.length < 2) { return intersected; }
  var objects = {};
  var filtered = [];
  var maxDist = (deltaThreshold != undefined)? (intersected[0].distance + deltaThreshold) : undefined;
  for (var i = 0; i < intersected.length; i++) {
    var a = intersected[i];
    if (maxDist !== undefined) {
      if (a.distance > maxDist) {
        break;
      }
    }
    if (objects[a.object.id]) {
      // Already seen this one
    } else {
      objects[a.object.id] = true;
      filtered.push(a);
    }
  }
  return filtered;
};


self.getIntersectedNormal = function() {
  var edge1 = new THREE.Vector3();
  var edge2 = new THREE.Vector3();
  var va = new THREE.Vector3();
  var vb = new THREE.Vector3();
  var vc = new THREE.Vector3();
  return function (intersected) {
    if (intersected.normal) return intersected.normal;
    // TODO: Can use face.normal too (multiply by mesh.matrixWorld.extractRotation?
    if (intersected.face) {
      var mesh = intersected.descendant;
      if (mesh === undefined) {
        mesh = intersected.object;
      }
      if (mesh instanceof THREE.Mesh) {
        var geom = mesh.geometry;
        var a = GeometryUtil.getGeometryVertex(geom, intersected.face.a, mesh.matrixWorld, va);
        var b = GeometryUtil.getGeometryVertex(geom, intersected.face.b, mesh.matrixWorld, vb);
        var c = GeometryUtil.getGeometryVertex(geom, intersected.face.c, mesh.matrixWorld, vc);
        var normal = new THREE.Vector3();
        edge1.subVectors(b, a).normalize();
        edge2.subVectors(c, a).normalize();
        normal.crossVectors(edge1, edge2).normalize();
        var numFlips = Object3DUtil.countMirroringTransforms(mesh);
        var geomFlips = geom.isFlipped? 1 : 0;
        // Mismatch between number of flips we have done with the geometry vs our transform
        // flip our normal for placement purposes
        if (numFlips % 2 !== geomFlips) { normal.multiplyScalar(-1); }
        intersected.normal = normal;
      } else if (mesh instanceof THREE.Points) {

      } else if (mesh instanceof THREE.Line) {

      }
     }
    return intersected.normal;
  };
}();

// Modified version of Mesh.raycast to allow for intersection with subsets of triangles (need to be updated for three.js 8x and not really helping yet)
self.raycastMeshTriangles = ( function () {

  var inverseMatrix = new THREE.Matrix4();
  var ray = new THREE.Ray();
  var sphere = new THREE.Sphere();

  var vA = new THREE.Vector3();
  var vB = new THREE.Vector3();
  var vC = new THREE.Vector3();

  var tempA = new THREE.Vector3();
  var tempB = new THREE.Vector3();
  var tempC = new THREE.Vector3();

  var uvA = new THREE.Vector2();
  var uvB = new THREE.Vector2();
  var uvC = new THREE.Vector2();

  var barycoord = new THREE.Vector3();

  var intersectionPoint = new THREE.Vector3();
  var intersectionPointWorld = new THREE.Vector3();

  function uvIntersection( point, p1, p2, p3, uv1, uv2, uv3 ) {

    THREE.Triangle.barycoordFromPoint( point, p1, p2, p3, barycoord );

    uv1.multiplyScalar( barycoord.x );
    uv2.multiplyScalar( barycoord.y );
    uv3.multiplyScalar( barycoord.z );

    uv1.add( uv2 ).add( uv3 );

    return uv1.clone();

  }

  function checkIntersection( object, raycaster, ray, pA, pB, pC, point ){

    var intersect;
    var material = object.material;

    // AXC: Add control for raycaster to not do back face culling (by setting raycaster.intersectBackFaces)
    if ( material.side === THREE.BackSide ) {

      intersect = ray.intersectTriangle( pC, pB, pA, !raycaster.intersectBackFaces && true, point );

    } else {

      intersect = ray.intersectTriangle( pA, pB, pC, !raycaster.intersectBackFaces && material.side !== THREE.DoubleSide, point );

    }

    if ( intersect === null ) return null;

    intersectionPointWorld.copy( point );
    intersectionPointWorld.applyMatrix4( object.matrixWorld );

    var distance = raycaster.ray.origin.distanceTo( intersectionPointWorld );

    if ( distance < raycaster.near || distance > raycaster.far ) return null;

    return {
      distance: distance,
      point: intersectionPointWorld.clone(),
      object: object
    };

  }

  function checkBufferGeometryIntersection( object, raycaster, ray, positions, uvs, a, b, c ) {

    vA.fromArray( positions, a * 3 );
    vB.fromArray( positions, b * 3 );
    vC.fromArray( positions, c * 3 );

    var intersection = checkIntersection( object, raycaster, ray, vA, vB, vC, intersectionPoint );

    if ( intersection ) {

      if ( uvs ) {

        uvA.fromArray( uvs, a * 2 );
        uvB.fromArray( uvs, b * 2 );
        uvC.fromArray( uvs, c * 2 );

        intersection.uv = uvIntersection( intersectionPoint,  vA, vB, vC,  uvA, uvB, uvC );

      }

      intersection.face = new THREE.Face3( a, b, c, THREE.Triangle.normal( vA, vB, vC ) );
      intersection.faceIndex = a;

    }

    return intersection;

  }

  return function raycast( mesh, triIndices, raycaster, raylocal, intersects ) {

    var geometry = mesh.geometry;
    var material = mesh.material;

    if ( material === undefined ) return;

    ray.copy(raylocal);
    // if (raycasterIsWorld) {
    //   var matrixWorld = mesh.matrixWorld;
    //   inverseMatrix.getInverse(matrixWorld);
    //   ray.applyMatrix4(inverseMatrix);
    // }
    //
    // if (checkBounds) {
    //   // Checking boundingSphere distance to ray
    //
    //   if (geometry.boundingSphere === null) geometry.computeBoundingSphere();
    //
    //   if (ray.isIntersectionSphere(geometry.boundingSphere) === false) return;
    //
    //   // Check boundingBox before continuing
    //
    //   if (geometry.boundingBox !== null) {
    //
    //     if (ray.isIntersectionBox(geometry.boundingBox) === false) return;
    //
    //   }
    // }

    var uvs, intersection;

    if ( geometry instanceof THREE.BufferGeometry ) {

      var a, b, c;
      var index = geometry.index;
      var attributes = geometry.attributes;
      var positions = attributes.position.array;

      if ( attributes.uv !== undefined ){

        uvs = attributes.uv.array;

      }

      if ( index !== null ) {

        var indices = index.array;

        for ( var ti = 0, l = triIndices.length; ti < l; ti ++ ) {
          var f = triIndices[ti];
          var i = triIndices[ti]*3;
          a = indices[ i ];
          b = indices[ i + 1 ];
          c = indices[ i + 2 ];

          intersection = checkBufferGeometryIntersection( mesh, raycaster, ray, positions, uvs, a, b, c );

          if ( intersection ) {

            intersection.faceIndex = f; // triangle number in indices buffer semantics
            intersects.push( intersection );

          }

        }

      } else {


        for ( var ti = 0, l = triIndices.length; ti < l; ti ++ ) {
          var f = triIndices[ti];
          a = f * 3;
          b = a + 1;
          c = a + 2;

          intersection = checkBufferGeometryIntersection( mesh, raycaster, ray, positions, uvs, a, b, c );

          if ( intersection ) {

            // AXC: Fix faceIndex
            intersection.faceIndex = f; // triangle number in positions buffer semantics
            intersects.push( intersection );

          }

        }

      }

    } else if ( geometry instanceof THREE.Geometry ) {

      var fvA, fvB, fvC;
      var isFaceMaterial = material instanceof THREE.MeshFaceMaterial;
      var materials = isFaceMaterial === true ? material.materials : null;

      var vertices = geometry.vertices;
      var faces = geometry.faces;
      var faceVertexUvs = geometry.faceVertexUvs[ 0 ];
      if ( faceVertexUvs.length > 0 ) uvs = faceVertexUvs;

      for ( var ti = 0, l = triIndices.length; ti < l; ti ++ ) {
        var f = triIndices[ti];

        var face = faces[ f ];
        var faceMaterial = isFaceMaterial === true ? materials[ face.materialIndex ] : material;

        if ( faceMaterial === undefined ) continue;

        fvA = vertices[ face.a ];
        fvB = vertices[ face.b ];
        fvC = vertices[ face.c ];

        if ( faceMaterial.morphTargets === true ) {

          var morphTargets = geometry.morphTargets;
          var morphInfluences = mesh.morphTargetInfluences;

          vA.set( 0, 0, 0 );
          vB.set( 0, 0, 0 );
          vC.set( 0, 0, 0 );

          for ( var t = 0, tl = morphTargets.length; t < tl; t ++ ) {

            var influence = morphInfluences[ t ];

            if ( influence === 0 ) continue;

            var targets = morphTargets[ t ].vertices;

            vA.addScaledVector( tempA.subVectors( targets[ face.a ], fvA ), influence );
            vB.addScaledVector( tempB.subVectors( targets[ face.b ], fvB ), influence );
            vC.addScaledVector( tempC.subVectors( targets[ face.c ], fvC ), influence );

          }

          vA.add( fvA );
          vB.add( fvB );
          vC.add( fvC );

          fvA = vA;
          fvB = vB;
          fvC = vC;

        }

        intersection = checkIntersection( mesh, raycaster, ray, fvA, fvB, fvC, intersectionPoint );

        if ( intersection ) {
          if ( uvs && uvs[ f ]) {  // NOTE(MS): This check avoids error due to sparse uvs

            var uvs_f = uvs[ f ];
            uvA.copy( uvs_f[ 0 ] );
            uvB.copy( uvs_f[ 1 ] );
            uvC.copy( uvs_f[ 2 ] );

            intersection.uv = uvIntersection( intersectionPoint, fvA, fvB, fvC, uvA, uvB, uvC );

          }

          intersection.face = face;
          intersection.faceIndex = f;
          intersects.push( intersection );

        }

      }

    }

  };

}() );



module.exports = self;

