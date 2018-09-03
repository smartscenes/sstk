/**
 * @file A 3D arbitrarily oriented bounding box.
 * 
 * This data structure represents a box in 3D space. The local axes of this box
 * can be arbitrarily oriented/rotated with respect to the global world
 * coordinate system. This allows OBBs to more tightly bound objects than AABBs
 * do, which always align with the world space axes. This flexibility has the
 * drawback that the geometry tests and operations involving OBBs are more
 * costly, and representing an OBB in memory takes more space.
 * 
 * Reference:
 * 
 * This file is a JavaScript/three.js implementation of the MathGeoLib by Jukka
 * Jylänki. The prototype does not contain the entire logic of the original
 * source.
 * 
 * https://github.com/juj/MathGeoLib/blob/master/src/Geometry/OBB.h
 * https://github.com/juj/MathGeoLib/blob/master/src/Geometry/OBB.cpp
 * 
 * @author Human Interactive
 */
"use strict";

//var THREE = require( "three" );

/**
 * Creates the OBB.
 * 
 * @constructor
 * 
 * @param {THREE.Vector3} position - The center position of the OBB.
 * @param {THREE.Vector3} halfSizes - Stores half-sizes to x, y and z directions
 * in the local space of the OBB.
 * @param {THREE.Matrix4} basis - Specifies normalized direction vectors for the
 * local axes.
 */
function OBB( position, halfSizes, basis ) {

	Object.defineProperties( this, {
		position : {
			value : position || new THREE.Vector3(),
			configurable : false,
			enumerable : true,
			writable : true
		},
		halfSizes : {
			value : halfSizes || new THREE.Vector3(),
			configurable : false,
			enumerable : true,
			writable : true
		},
		basis : {
			value : basis || new THREE.Matrix4(),
			configurable : false,
			enumerable : true,
			writable : true
		},
		// The OBB-OBB test utilizes a SAT test to detect the intersection.
		// A robust implementation requires an epsilon threshold to test that
		// the used axes are not degenerate.
		_EPSILON : {
			value : 1e-3,
			configurable : false,
			enumerable : false,
			writable : false
		}
	} );
}

/**
 * Sets the OBB from a mesh.
 * 
 * The basis of the objects world matrix is assumed to be orthogonal, which
 * means no projection or shear is allowed. Additionally, the matrix must
 * contain only uniform scaling.
 * 
 * @param {THREE.Mesh} object - The mesh object to convert to an OBB.
 * 
 * @returns {OBB} The reference to the OBB.
 */
OBB.prototype.setFromObject = ( function() {

	var vector = new THREE.Vector3();

	return function( object ) {
		
		var scale, aabb, w;

		// calculate AABB, if necessary
		if ( object.geometry.boundingBox === null )
		{
			object.geometry.computeBoundingBox();
		}

		// ensure, world matrix of the object is up to date
		object.updateMatrixWorld();

		// shortcuts
		aabb = object.geometry.boundingBox;
		w = object.matrixWorld.elements;

		// assign the transform center to the position member
		aabb.center( this.position ).applyMatrix4( object.matrixWorld );

		// extract the rotation and assign it to the basis of the OBB
		// for numerical stability, you could orthonormalize the basis
		this.basis.extractRotation( object.matrixWorld );

		// calculate half sizes for each axis
		aabb.size( this.halfSizes ).multiplyScalar( 0.5 );

		// extract the (uniform) scaling and apply it to the halfSizes
		scale = vector.set( w[ 0 ], w[ 1 ], w[ 2 ] ).length();

		// do the scale
		this.halfSizes.multiplyScalar( scale );

		return this;
	};

}() );

/**
 * Sets the OBB from an Axis-Aligned Bounding Box (AABB).
 * 
 * @param {THREE.Box3} aabb - The AABB to convert to an OBB.
 * 
 * @returns {OBB} The reference to the OBB.
 */
OBB.prototype.setFromAABB = function( aabb ) {

	aabb.center( this.position );

	aabb.size( this.halfSizes ).multiplyScalar( 0.5 );

	this.basis.identity();

	return this;
};

/**
 * Sets the OBB from a bounding sphere.
 * 
 * @param {THREE.Sphere} sphere - The bounding sphere to convert to an OBB.
 * 
 * @returns {OBB} The reference to the OBB.
 */
OBB.prototype.setFromSphere = function( sphere ) {

	this.position.copy( sphere.center );

	this.halfSizes.set( sphere.radius, sphere.radius, sphere.radius );

	this.basis.identity();

	return this;
};

/**
 * Computes the closest point inside the OBB to the given point.
 * 
 * @param {THREE.Vector3} point - The target point.
 * 
 * @returns {THREE.Vector3} The closest point inside the OBB.
 */
OBB.prototype.closestPoint = ( function() {

	var displacement = new THREE.Vector3();

	var xAxis = new THREE.Vector3();
	var yAxis = new THREE.Vector3();
	var zAxis = new THREE.Vector3();

	return function( point ) {
		
		var index, value, axis = [];

		var closesPoint = new THREE.Vector3();

		// extract each axis
		this.basis.extractBasis( xAxis, yAxis, zAxis );

		// push axis to array
		axis.push( xAxis, yAxis, zAxis );

		// calculate displacement vector of targetPoint and center position
		displacement.subVectors( point, this.position );

		// start at the center position of the OBB
		closesPoint.copy( this.position );

		// project the target onto the OBB axes and walk towards that point
		for ( index = 0; index < 3; index++ )
		{
			value = THREE.Math.clamp( displacement.dot( axis[ index ] ), -this.halfSizes.getComponent( index ), this.halfSizes.getComponent( index ) );

			closesPoint.add( axis[ index ].multiplyScalar( value ) );
		}

		return closesPoint;
	};

}() );

/**
 * Tests if the given point is fully contained inside the OBB.
 * 
 * @param {THREE.Vector3} point - The point to test.
 * 
 * @returns {boolean} Is the point contained inside the OBB?
 */
OBB.prototype.isPointContained = ( function() {

	var displacement = new THREE.Vector3();

	var xAxis = new THREE.Vector3();
	var yAxis = new THREE.Vector3();
	var zAxis = new THREE.Vector3();

	return function( point ) {

		// calculate displacement vector of point and center position
		displacement.subVectors( point, this.position );

		// extract each axis
		this.basis.extractBasis( xAxis, yAxis, zAxis );

		// project the calculated displacement vector to each axis and
		// compare the result with the respective half size.
		return Math.abs( displacement.dot( xAxis ) ) <= this.halfSizes.x && 
			   Math.abs( displacement.dot( yAxis ) ) <= this.halfSizes.y && 
			   Math.abs( displacement.dot( zAxis ) ) <= this.halfSizes.z;
	};

}() );

/**
 * Tests if the given AABB is fully contained inside the OBB.
 * 
 * @param {THREE.Box3} aabb - The AABB to test.
 * 
 * @returns {boolean} Is the AABB fully contained inside the OBB?
 */
OBB.prototype.isAABBContained = ( function() {

	var points = [ new THREE.Vector3(), 
	               new THREE.Vector3(), 
	               new THREE.Vector3(), 
	               new THREE.Vector3(), 
	               new THREE.Vector3(), 
	               new THREE.Vector3(), 
	               new THREE.Vector3(), 
	               new THREE.Vector3() ];

	return function( aabb ) {

		// determine all corner points
		points[ 0 ].set( aabb.min.x, aabb.min.y, aabb.min.z );
		points[ 1 ].set( aabb.min.x, aabb.min.y, aabb.max.z );
		points[ 2 ].set( aabb.min.x, aabb.max.y, aabb.min.z );
		points[ 3 ].set( aabb.min.x, aabb.max.y, aabb.max.z );
		points[ 4 ].set( aabb.max.x, aabb.min.y, aabb.min.z );
		points[ 5 ].set( aabb.max.x, aabb.min.y, aabb.max.z );
		points[ 6 ].set( aabb.max.x, aabb.max.y, aabb.min.z );
		points[ 7 ].set( aabb.max.x, aabb.max.y, aabb.max.z );

		for ( var index = 0; index < 8; ++index )
		{
			// check each point
			if ( this.isPointContained( points[ index ] ) === false )
			{
				// as soon as one point is outside the OBB, return false
				return false;
			}
		}

		return true;
	};

}() );

/**
 * Tests if the given line segment is fully contained inside the OBB.
 * 
 * @param {THREE.Line3} line - The line segment to test.
 * 
 * @returns {boolean} Is the line segment contained inside the OBB?
 */
OBB.prototype.isLineContained = function( line ) {

	return this.isPointContained( line.start ) && 
		   this.isPointContained( line.end );
};

/**
 * Tests if the given triangle is fully contained inside the OBB.
 * 
 * @param {THREE.Triangle} triangle - The triangle to test.
 * 
 * @returns {boolean} Is the triangle contained inside the OBB?
 */
OBB.prototype.isTriangleContained = function( triangle ) {

	return this.isPointContained( triangle.a ) && 
		   this.isPointContained( triangle.b ) && 
		   this.isPointContained( triangle.c );
};

/**
 * Tests whether this OBB and the given AABB intersect.
 * 
 * @param {THREE.Box3} box - The AABB to test.
 * 
 * @returns {boolean} Is there an intersection between the given AABB and the
 * OBB?
 */
OBB.prototype.intersectsAABB = function( box ) {

	return this.intersectsOBB( new OBB().setFromAABB( box ) );
};

/**
 * Tests whether this OBB and the given sphere intersect.
 * 
 * @param {THREE.Sphere} sphere - The sphere to test.
 * 
 * @returns {boolean} Is there an intersection between the given sphere and the
 * OBB?
 */
OBB.prototype.intersectsSphere = function( sphere ) {

	return this.intersectSphere( sphere ) !== null;
};

/**
 * Tests whether this OBB and the given OBB intersect.
 * 
 * @param {OBB} box - The OBB to test.
 * 
 * @returns {boolean} Is there an intersection between the given OBB and the
 * OBB?
 */
OBB.prototype.intersectsOBB = ( function() {

	var xAxisA = new THREE.Vector3();
	var yAxisA = new THREE.Vector3();
	var zAxisA = new THREE.Vector3();

	var xAxisB = new THREE.Vector3();
	var yAxisB = new THREE.Vector3();
	var zAxisB = new THREE.Vector3();

	var translation = new THREE.Vector3();

	var vector = new THREE.Vector3();

	return function( obb ) {
		
		var axisA = [];
		var axisB = [];
		var rotationMatrix = [ [], [], [] ];
		var rotationMatrixAbs = [ [], [], [] ];
		
		var halfSizeA, halfSizeB;
		var t, i;

		// extract each axis
		this.basis.extractBasis( xAxisA, yAxisA, zAxisA );
		obb.basis.extractBasis( xAxisB, yAxisB, zAxisB );

		// push basis vectors into arrays, so you can access them via indices
		axisA.push( xAxisA, yAxisA, zAxisA );
		axisB.push( xAxisB, yAxisB, zAxisB );

		// get displacement vector
		vector.subVectors( obb.position, this.position );

		// express the translation vector in the coordinate frame of the current
		// OBB (this)
		for ( i = 0; i < 3; i++ )
		{
			translation.setComponent( i, vector.dot( axisA[ i ] ) );
		}

		// generate a rotation matrix that transforms from world space to the
		// OBB's coordinate space
		for ( i = 0; i < 3; i++ )
		{
			for ( var j = 0; j < 3; j++ )
			{
				rotationMatrix[ i ][ j ] = axisA[ i ].dot( axisB[ j ] );
				rotationMatrixAbs[ i ][ j ] = Math.abs( rotationMatrix[ i ][ j ] ) + this._EPSILON;
			}
		}

		// test the three major axes of this OBB
		for ( i = 0; i < 3; i++ )
		{
			vector.set( rotationMatrixAbs[ i ][ 0 ], rotationMatrixAbs[ i ][ 1 ], rotationMatrixAbs[ i ][ 2 ] );

			halfSizeA = this.halfSizes.getComponent( i );
			halfSizeB = obb.halfSizes.dot( vector );

			if ( Math.abs( translation.getComponent( i ) ) > halfSizeA + halfSizeB )
			{
				return false;
			}
		}

		// test the three major axes of other OBB
		for ( i = 0; i < 3; i++ )
		{
			vector.set( rotationMatrixAbs[ 0 ][ i ], rotationMatrixAbs[ 1 ][ i ], rotationMatrixAbs[ 2 ][ i ] );

			halfSizeA = this.halfSizes.dot( vector );
			halfSizeB = obb.halfSizes.getComponent( i );

			vector.set( rotationMatrix[ 0 ][ i ], rotationMatrix[ 1 ][ i ], rotationMatrix[ 2 ][ i ] );
			t = translation.dot( vector );

			if ( Math.abs( t ) > halfSizeA + halfSizeB )
			{
				return false;
			}
		}

		// test the 9 different cross-axes

		// A.x <cross> B.x
		halfSizeA = this.halfSizes.y * rotationMatrixAbs[ 2 ][ 0 ] + this.halfSizes.z * rotationMatrixAbs[ 1 ][ 0 ];
		halfSizeB = obb.halfSizes.y * rotationMatrixAbs[ 0 ][ 2 ] + obb.halfSizes.z * rotationMatrixAbs[ 0 ][ 1 ];

		t = translation.z * rotationMatrix[ 1 ][ 0 ] - translation.y * rotationMatrix[ 2 ][ 0 ];

		if ( Math.abs( t ) > halfSizeA + halfSizeB )
		{
			return false;
		}

		// A.x < cross> B.y
		halfSizeA = this.halfSizes.y * rotationMatrixAbs[ 2 ][ 1 ] + this.halfSizes.z * rotationMatrixAbs[ 1 ][ 1 ];
		halfSizeB = obb.halfSizes.x * rotationMatrixAbs[ 0 ][ 2 ] + obb.halfSizes.z * rotationMatrixAbs[ 0 ][ 0 ];

		t = translation.z * rotationMatrix[ 1 ][ 1 ] - translation.y * rotationMatrix[ 2 ][ 1 ];

		if ( Math.abs( t ) > halfSizeA + halfSizeB )
		{
			return false;
		}

		// A.x <cross> B.z
		halfSizeA = this.halfSizes.y * rotationMatrixAbs[ 2 ][ 2 ] + this.halfSizes.z * rotationMatrixAbs[ 1 ][ 2 ];
		halfSizeB = obb.halfSizes.x * rotationMatrixAbs[ 0 ][ 1 ] + obb.halfSizes.y * rotationMatrixAbs[ 0 ][ 0 ];

		t = translation.z * rotationMatrix[ 1 ][ 2 ] - translation.y * rotationMatrix[ 2 ][ 2 ];

		if ( Math.abs( t ) > halfSizeA + halfSizeB )
		{
			return false;
		}

		// A.y <cross> B.x
		halfSizeA = this.halfSizes.x * rotationMatrixAbs[ 2 ][ 0 ] + this.halfSizes.z * rotationMatrixAbs[ 0 ][ 0 ];
		halfSizeB = obb.halfSizes.y * rotationMatrixAbs[ 1 ][ 2 ] + obb.halfSizes.z * rotationMatrixAbs[ 1 ][ 1 ];

		t = translation.x * rotationMatrix[ 2 ][ 0 ] - translation.z * rotationMatrix[ 0 ][ 0 ];

		if ( Math.abs( t ) > halfSizeA + halfSizeB )
		{
			return false;
		}

		// A.y <cross> B.y
		halfSizeA = this.halfSizes.x * rotationMatrixAbs[ 2 ][ 1 ] + this.halfSizes.z * rotationMatrixAbs[ 0 ][ 1 ];
		halfSizeB = obb.halfSizes.x * rotationMatrixAbs[ 1 ][ 2 ] + obb.halfSizes.z * rotationMatrixAbs[ 1 ][ 0 ];

		t = translation.x * rotationMatrix[ 2 ][ 1 ] - translation.z * rotationMatrix[ 0 ][ 1 ];

		if ( Math.abs( t ) > halfSizeA + halfSizeB )
		{
			return false;
		}

		// A.y <cross> B.z
		halfSizeA = this.halfSizes.x * rotationMatrixAbs[ 2 ][ 2 ] + this.halfSizes.z * rotationMatrixAbs[ 0 ][ 2 ];
		halfSizeB = obb.halfSizes.x * rotationMatrixAbs[ 1 ][ 1 ] + obb.halfSizes.y * rotationMatrixAbs[ 1 ][ 0 ];

		t = translation.x * rotationMatrix[ 2 ][ 2 ] - translation.z * rotationMatrix[ 0 ][ 2 ];

		if ( Math.abs( t ) > halfSizeA + halfSizeB )
		{
			return false;
		}

		// A.z <cross> B.x
		halfSizeA = this.halfSizes.x * rotationMatrixAbs[ 1 ][ 0 ] + this.halfSizes.y * rotationMatrixAbs[ 0 ][ 0 ];
		halfSizeB = obb.halfSizes.y * rotationMatrixAbs[ 2 ][ 2 ] + obb.halfSizes.z * rotationMatrixAbs[ 2 ][ 1 ];

		t = translation.y * rotationMatrix[ 0 ][ 0 ] - translation.x * rotationMatrix[ 1 ][ 0 ];

		if ( Math.abs( t ) > halfSizeA + halfSizeB )
		{
			return false;
		}

		// A.z <cross> B.y
		halfSizeA = this.halfSizes.x * rotationMatrixAbs[ 1 ][ 1 ] + this.halfSizes.y * rotationMatrixAbs[ 0 ][ 1 ];
		halfSizeB = obb.halfSizes.x * rotationMatrixAbs[ 2 ][ 2 ] + obb.halfSizes.z * rotationMatrixAbs[ 2 ][ 0 ];

		t = translation.y * rotationMatrix[ 0 ][ 1 ] - translation.x * rotationMatrix[ 1 ][ 1 ];

		if ( Math.abs( t ) > halfSizeA + halfSizeB )
		{
			return false;
		}

		// A.z <cross> B.z
		halfSizeA = this.halfSizes.x * rotationMatrixAbs[ 1 ][ 2 ] + this.halfSizes.y * rotationMatrixAbs[ 0 ][ 2 ];
		halfSizeB = obb.halfSizes.x * rotationMatrixAbs[ 2 ][ 1 ] + obb.halfSizes.y * rotationMatrixAbs[ 2 ][ 0 ];

		t = translation.y * rotationMatrix[ 0 ][ 2 ] - translation.x * rotationMatrix[ 1 ][ 2 ];

		if ( Math.abs( t ) > halfSizeA + halfSizeB )
		{
			return false;
		}

		// no separating axis exists, so the two OBB don't intersect
		return true;
	};

}() );

/**
 * Tests whether this OBB and the given plane intersect.
 * 
 * @param {THREE.Plane} plane - The plane to test.
 * 
 * @returns {boolean} Is there an intersection between the given plane and the
 * OBB?
 */
OBB.prototype.intersectsPlane = ( function() {

	var xAxis = new THREE.Vector3();
	var yAxis = new THREE.Vector3();
	var zAxis = new THREE.Vector3();

	return function( plane ) {
		
		var t, s;

		// extract each axis
		this.basis.extractBasis( xAxis, yAxis, zAxis );

		// compute the projection interval radius of this OBB onto L(t) =
		// this->pos + x * p.normal;
		t = this.halfSizes.x * Math.abs( plane.normal.dot( xAxis ) ) + 
			this.halfSizes.y * Math.abs( plane.normal.dot( yAxis ) ) + 
			this.halfSizes.z * Math.abs( plane.normal.dot( zAxis ) );

		// compute the distance of this OBB center from the plane
		s = plane.normal.dot( this.position ) - plane.constant;

		return Math.abs( s ) <= t;
	};

}() );

/**
 * Tests whether this OBB and the given ray intersect.
 * 
 * @param {THREE.Ray} ray - The ray to test.
 * 
 * @returns {boolean} Is there an intersection between the given ray and the
 * OBB?
 */
OBB.prototype.intersectsRay = function( ray ) {

	return this.intersectRay( ray ) !== null;
};

/**
 * Calculates the intersection point between this OBB and the given ray.
 * 
 * @param {THREE.Ray} ray - The ray to test.
 * 
 * @returns {THREE.Vector3} The intersection point.
 */
OBB.prototype.intersectRay = ( function() {

	var zeroVector = new THREE.Vector3();
	var size = new THREE.Vector3();
	var aabb = new THREE.Box3();
	var rayLocal = new THREE.Ray();

	var transformationMatrix = new THREE.Matrix4();
	var transformationMatrixInverse = new THREE.Matrix4();

	return function( ray ) {

		var intersection;
		
		// get size of OBB
		this.size( size );

		// set AABB to origin with the size of the OBB
		aabb.setFromCenterAndSize( zeroVector, size );

		// transform ray to the local space of the OBB
		transformationMatrix.copy( this.basis );
		transformationMatrix.setPosition( this.position );

		rayLocal.copy( ray );
		rayLocal.applyMatrix4( transformationMatrixInverse.getInverse( transformationMatrix ) );

		// do ray <-> AABB intersection
		intersection = rayLocal.intersectBox( aabb, new THREE.Vector3() );

		if ( intersection !== null )
		{
			// transform the intersection point back to world space
			intersection.applyMatrix4( transformationMatrix );
		}

		return intersection;
	};

}() );

/**
 * Calculates the intersection point between this OBB and the given sphere.
 * 
 * @param {THREE.Sphere} sphere - The sphere to test.
 * 
 * @returns {THREE.Vector3} The intersection point.
 */
OBB.prototype.intersectSphere = function( sphere ) {

	// find the point on this OBB closest to the sphere center
	var closestPoint = this.closestPoint( sphere.center );

	// if that point is inside the sphere, the OBB and sphere intersect
	if ( closestPoint.distanceToSquared( sphere.center ) <= sphere.radius * sphere.radius )
	{
		return closestPoint;
	}

	return null;
};

/**
 * Gets the size of the OBB.
 * 
 * @param {THREE.Vector3} optionalTarget - An optional target for the operation.
 * 
 * @returns {THREE.Vector3} The size of the OBB.
 */
OBB.prototype.size = function( optionalTarget ) {
	
	var result = optionalTarget || new THREE.Vector3();

	return result.copy( this.halfSizes ).multiplyScalar( 2 );
};

/**
 * Translates the OBB in world space.
 * 
 * @param {THREE.Vector3} offset - The amount of displacement to apply to this
 * OBB, in world space coordinates.
 * 
 * @returns {OBB} The reference to the OBB.
 */
OBB.prototype.translate = function( offset ) {

	this.position.add( offset );

	return this;
};

/**
 * Copies the values of a given OBB to the current OBB.
 * 
 * @param {OBB} obb - The OBB to copy.
 * 
 * @returns {OBB} The reference to the OBB.
 */
OBB.prototype.copy = function( obb ) {

	this.position.copy( obb.position );
	this.halfSizes.copy( obb.halfSizes );
	this.basis.copy( obb.basis );

	return this;
};

/**
 * Creates a new instance from the current OBB.
 * 
 * @returns {OBB} The new OBB.
 */
OBB.prototype.clone = function() {

	return new OBB().copy( this );
};

module.exports = OBB;