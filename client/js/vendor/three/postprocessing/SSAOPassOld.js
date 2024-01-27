'use strict';

/**
 * Screen-space ambient occlusion pass.
 *
 * Has the following parameters
 *  - radius
 *  	- Ambient occlusion shadow radius (numeric value).
 *  - onlyAO
 *  	- Display only ambient occlusion result (boolean value).
 *  - aoClamp
 *  	- Ambient occlusion clamp (numeric value).
 *  - lumInfluence
 *  	- Pixel luminosity influence in AO calculation (numeric value).
 *
 * To output to screen set renderToScreens true
 *
 * @author alteredq / http://alteredqualia.com/
 * @author tentone
 * @class SSAOPassOld
 */
class SSAOPassOld extends THREE.ShaderPass {
	constructor( scene, camera, width, height ) {

		if (THREE.SSAOShaderOld === undefined) {

			console.warn('THREE.SSAOPassOld depends on THREE.SSAOShaderOld');

		}

		super(THREE.SSAOShaderOld);

		this.width = (width !== undefined) ? width : 512;
		this.height = (height !== undefined) ? height : 256;

		this.renderToScreen = false;

		this.camera2 = camera;
		this.scene2 = scene;

		//Depth material
		this.depthMaterial = new THREE.MeshDepthMaterial();
		this.depthMaterial.depthPacking = THREE.RGBADepthPacking;
		this.depthMaterial.blending = THREE.NoBlending;

		//Depth render target
		this.depthRenderTarget = new THREE.WebGLRenderTarget(this.width, this.height, {
			minFilter: THREE.LinearFilter,
			magFilter: THREE.LinearFilter
		});
		//this.depthRenderTarget.texture.name = 'SSAOShader.rt';

		//Shader uniforms
		this.uniforms['tDepth'].value = this.depthRenderTarget.texture;
		this.uniforms['size'].value.set(this.width, this.height);
		this.uniforms['cameraNear'].value = this.camera2.near;
		this.uniforms['cameraFar'].value = this.camera2.far;
		// AXC: Switch for perspective camera
		this.material.defines['PERSPECTIVE_CAMERA'] = this.camera2.isPerspectiveCamera ? 1 : 0;

		this.uniforms['radius'].value = 4;
		this.uniforms['onlyAO'].value = false;
		this.uniforms['aoClamp'].value = 0.25;
		this.uniforms['lumInfluence'].value = 0.7;
	}

	//Setters and getters for uniforms

	get radius() {
		return this.uniforms['radius'].value;
	}

	set radius(value) {
		this.uniforms[ 'radius' ].value = value;
  }


	get onlyAO() {
		return this.uniforms[ 'onlyAO' ].value;
	}
	set onlyAO(value) {
		this.uniforms[ 'onlyAO' ].value = value;
	}

	get aoClamp() {
		return this.uniforms[ 'aoClamp' ].value;
	}

	set aoClamp( value ) {
		this.uniforms[ 'aoClamp' ].value = value;
	}

	get lumInfluence() {
		return this.uniforms[ 'lumInfluence' ].value;
	}

	set lumInfluence( value ) {
		this.uniforms[ 'lumInfluence' ].value = value;
	}

	/**
	 * Render using this pass.
	 *
	 * @method render
	 * @param {WebGLRenderer} renderer
	 * @param {WebGLRenderTarget} writeBuffer Buffer to write output.
	 * @param {WebGLRenderTarget} readBuffer Input buffer.
	 * @param {Number} delta Delta time in milliseconds.
	 * @param {Boolean} maskActive Not used in this pass.
	 */
	render( renderer, writeBuffer, readBuffer, delta, maskActive ) {

		//Render depth into depthRenderTarget
		// AXC: Save oldOverrideMaterial so it can be restored
		const oldOverrideMaterial = this.scene2.overrideMaterial;
		this.scene2.overrideMaterial = this.depthMaterial;

		renderer.setRenderTarget( this.depthRenderTarget );
		renderer.clear();
		renderer.render( this.scene2, this.camera2 );

		this.scene2.overrideMaterial = oldOverrideMaterial;

		//SSAO shaderPass
		THREE.ShaderPass.prototype.render.call( this, renderer, writeBuffer, readBuffer, delta, maskActive );

	};

	/**
	 * Change scene to be renderer by this render pass.
	 *
	 * @method setScene
	 * @param {Scene} scene
	 */
	setScene( scene ) {

		this.scene2 = scene;

	};

	/**
	 * Set camera used by this render pass.
	 *
	 * @method setCamera
	 * @param {Camera} camera
	 */
	setCamera( camera ) {

		this.camera2 = camera;

		this.uniforms[ 'cameraNear' ].value = this.camera2.near;
		this.uniforms[ 'cameraFar' ].value = this.camera2.far;
		// AXC: switch for perspective camera
		this.material.defines[ 'PERSPECTIVE_CAMERA' ] = this.camera2.isPerspectiveCamera  ? 1 : 0;

	};

	/**
	 * Set resolution of this render pass.
	 *
	 * @method setSize
	 * @param {Number} width
	 * @param {Number} height
	 */
	setSize( width, height ) {

		this.width = width;
		this.height = height;

		this.uniforms[ 'size' ].value.set( this.width, this.height );
		this.depthRenderTarget.setSize( this.width, this.height );

	}
}

THREE.SSAOPassOld = SSAOPassOld;

module.exports = SSAOPassOld;
