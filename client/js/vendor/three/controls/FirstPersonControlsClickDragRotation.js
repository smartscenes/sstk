/**
 * @author mrdoob / http://mrdoob.com/
 * @author alteredq / http://alteredqualia.com/
 * @author paulirish / http://paulirish.com/
 */

THREE.FirstPersonControlsClickDragRotation = function ( object, domElement ) {
	this.object = object;
	this.target = new THREE.Vector3( 0, 0, 0 );

	this.domElement = ( domElement !== undefined ) ? domElement : document;

	this.enabled = true;

	this.movementSpeed = 1.0;
	this.lookSpeed = 0.005;

	this.lookVertical = true;
	this.autoForward = false;

	this.heightSpeed = false;
	this.heightCoef = 1.0;
	this.heightMin = 0.0;
	this.heightMax = 1.0;

	this.constrainVertical = false;
	this.verticalMin = 0;
	this.verticalMax = Math.PI;

	// internals

	this.autoSpeedFactor = 0.0;

	this.mouseX = 0;
	this.mouseY = 0;

	this.moveForward = false;
	this.moveBackward = false;
	this.moveLeft = false;
	this.moveRight = false;

	this.mouseDragOn = false;

	this.viewHalfX = 0;
	this.viewHalfY = 0;

	this.prevMouseLoc = null;

	if ( this.domElement !== document ) {

		this.domElement.setAttribute( 'tabindex', -1 );

	}

	//

	this.handleResize = function () {

		if ( this.domElement === document ) {

			this.viewHalfX = window.innerWidth / 2;
			this.viewHalfY = window.innerHeight / 2;

		} else {

			this.viewHalfX = this.domElement.offsetWidth / 2;
			this.viewHalfY = this.domElement.offsetHeight / 2;

		}

	};

	this.onMouseDown = function ( event ) {

		if ( this.enabled === false ) return;

		if ( this.domElement !== document ) {

			this.domElement.focus();

		}

		event.preventDefault();
		event.stopPropagation();

		this.mouseDragOn = true;
		this.prevMouseLoc = {x: this.mouseX, y: this.mouseY}
	};

	this.onMouseUp = function ( event ) {

		event.preventDefault();
		event.stopPropagation();

		this.mouseDragOn = false;

	};

	this.onMouseMove = function ( event ) {

		if ( this.enabled === false ) return;

		if ( this.domElement === document ) {
			this.mouseX = event.pageX - this.viewHalfX;
			this.mouseY = event.pageY - this.viewHalfY;
		} else {
			this.mouseX = event.pageX - this.domElement.offsetLeft - this.viewHalfX;
			this.mouseY = event.pageY - this.domElement.offsetTop - this.viewHalfY;
		}

		if (this.mouseDragOn) {
			this.rotateCamera();
		}
	};

	this.rotateCamera = function() {
		var targetPosition = this.target;
		var position = this.object.position;

		var deltaX = this.mouseX-this.prevMouseLoc.x;
		var deltaY = this.mouseY-this.prevMouseLoc.y;

		targetPosition.y -= deltaY;
		this.object.lookAt( targetPosition );
	};

	this.onKeyDown = function ( event ) {

		if ( this.enabled === false ) return;

		//event.preventDefault();

		switch (event.keyCode ) {

			case 38: /*up*/
			case 87: /*W*/ this.moveForward = true; break;

			case 37: /*left*/
			case 65: /*A*/ this.moveLeft = true; break;

			case 40: /*down*/
			case 83: /*S*/ this.moveBackward = true; break;

			case 39: /*right*/
			case 68: /*D*/ this.moveRight = true; break;

			case 82: /*R*/ this.moveUp = true; break;
			case 70: /*F*/ this.moveDown = true; break;

		}
	};



	this.onKeyUp = function ( event ) {

		switch( event.keyCode ) {

			case 38: /*up*/
			case 87: /*W*/ this.moveForward = false; break;

			case 37: /*left*/
			case 65: /*A*/ this.moveLeft = false; break;

			case 40: /*down*/
			case 83: /*S*/ this.moveBackward = false; break;

			case 39: /*right*/
			case 68: /*D*/ this.moveRight = false; break;

			case 82: /*R*/ this.moveUp = false; break;
			case 70: /*F*/ this.moveDown = false; break;

		}

	};

	this.update = function( delta ) {

		if ( this.enabled === false ) return;

		if ( this.heightSpeed ) {

			var y = THREE.MathUtils.clamp( this.object.position.y, this.heightMin, this.heightMax );
			var heightDelta = y - this.heightMin;

			this.autoSpeedFactor = delta * ( heightDelta * this.heightCoef );

		} else {

			this.autoSpeedFactor = 0.0;

		}

		var actualMoveSpeed = delta * this.movementSpeed;

		if ( this.moveForward || ( this.autoForward && !this.moveBackward ) ) this.object.translateZ( - ( actualMoveSpeed + this.autoSpeedFactor ) );
		if ( this.moveBackward ) this.object.translateZ( actualMoveSpeed );

		if ( this.moveLeft ) this.object.translateX( - actualMoveSpeed );
		if ( this.moveRight ) this.object.translateX( actualMoveSpeed );

		if ( this.moveUp ) this.object.translateY( actualMoveSpeed );
		if ( this.moveDown ) this.object.translateY( - actualMoveSpeed );

	};


	this.domElement.addEventListener( 'contextmenu', function ( event ) { event.preventDefault(); }, false );
	this.domElement.addEventListener( 'pointermove', bind( this, this.onMouseMove ), false );
	this.domElement.addEventListener( 'pointerdown', bind( this, this.onMouseDown ), false );
	this.domElement.addEventListener( 'pointerup', bind( this, this.onMouseUp ), false );

	window.addEventListener( 'keydown', bind( this, this.onKeyDown ), false );
	window.addEventListener( 'keyup', bind( this, this.onKeyUp ), false );

	function bind( scope, fn ) {

		return function () {

			fn.apply( scope, arguments );

		};

	};

	this.handleResize();

};
