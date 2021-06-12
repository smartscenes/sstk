/**
 * @author Mugen87 / https://github.com/Mugen87
 */

function toConvexHull(points) {
	if ( THREE.ConvexHull === undefined ) {
		console.error( 'THREE.ConvexBufferGeometry: ConvexBufferGeometry relies on THREE.ConvexHull' );
	}

	var convexHull = new THREE.ConvexHull({minimizeFacePlanes: true});
	convexHull.setFromPoints( points );
	return convexHull;
}

// ConvexGeometry

THREE.ConvexGeometry = function ( convexHull ) {

	THREE.Geometry.call( this );

	this.fromBufferGeometry( new THREE.ConvexBufferGeometry( convexHull ) );
	this.mergeVertices();

};

THREE.ConvexGeometry.prototype = Object.create( THREE.Geometry.prototype );
THREE.ConvexGeometry.prototype.constructor = THREE.ConvexGeometry;

THREE.ConvexGeometry.fromPoints = function(points) {
	var convexHull = toConvexHull(points);
	return new THREE.ConvexGeometry(convexHull);
}

// ConvexBufferGeometry

THREE.ConvexBufferGeometry = function (convexHull) {

	THREE.BufferGeometry.call( this );

	// buffers

	var vertices = [];
	var normals = [];

	//this.convexHull = convexHull;

	// generate vertices and normals

	var faces = convexHull.faces;
	var faceIndices = convexHull.minimizeFacePlanes? convexHull.getFaceIndices() : null;

	for ( var i = 0; i < faces.length; i ++ ) {

		var face = faces[ i ];
		var edge = face.edge;

		// we move along a doubly-connected edge list to access all face points (see HalfEdge docs)

		do {

			var point = edge.head().point;

			vertices.push( point.x, point.y, point.z );
			normals.push( face.normal.x, face.normal.y, face.normal.z );

			edge = edge.next;

		} while ( edge !== face.edge );

	}

	// build geometry

	this.setAttribute( 'position', new THREE.Float32BufferAttribute( vertices, 3 ) );
	this.setAttribute( 'normal', new THREE.Float32BufferAttribute( normals, 3 ) );
	if (faceIndices) {
		this.setIndex(faceIndices);
	}

	// console.log('got convexHull', convexHull, convexHull.faces.length);
	// console.log('got geometry', this, vertices.length/3);
};

THREE.ConvexBufferGeometry.prototype = Object.create( THREE.BufferGeometry.prototype );
THREE.ConvexBufferGeometry.prototype.constructor = THREE.ConvexBufferGeometry;

THREE.ConvexBufferGeometry.fromPoints = function(points) {
	var convexHull = toConvexHull(points);
	return new THREE.ConvexBufferGeometry(convexHull);
};