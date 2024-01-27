( function () {
	function toConvexHull(points) {
		if ( THREE.ConvexHull === undefined ) {
			console.error( 'THREE.ConvexGeometry: ConvexGeometry relies on THREE.ConvexHull' );
		}

		const convexHull = new THREE.ConvexHull({minimizeFacePlanes: true});
		convexHull.setFromPoints( points );
		return convexHull;
	}

	class ConvexGeometry extends THREE.BufferGeometry {
		// AXC: Have constructor from convexHull directly (not points)
		constructor( convexHull ) {

			super(); // buffers

			const vertices = [];
			const normals = [];

			const faces = convexHull.faces;
			// AXC: handle option to minimize face planes
			const faceIndices = convexHull.minimizeFacePlanes? convexHull.getFaceIndices() : null;

			for ( let i = 0; i < faces.length; i ++ ) {

				const face = faces[ i ];
				let edge = face.edge; // we move along a doubly-connected edge list to access all face points (see HalfEdge docs)

				do {

					const point = edge.head().point;
					vertices.push( point.x, point.y, point.z );
					normals.push( face.normal.x, face.normal.y, face.normal.z );
					edge = edge.next;

				} while ( edge !== face.edge );

			} // build geometry


			this.setAttribute( 'position', new THREE.Float32BufferAttribute( vertices, 3 ) );
			this.setAttribute( 'normal', new THREE.Float32BufferAttribute( normals, 3 ) );
			// AXC: add face indices
			if (faceIndices) {
				this.setIndex(faceIndices);
			}

		}

		static fromPoints(points) {
			const convexHull = toConvexHull(points);
			return new THREE.ConvexGeometry(convexHull);
		}

	}

	THREE.ConvexGeometry = ConvexGeometry;

} )();
