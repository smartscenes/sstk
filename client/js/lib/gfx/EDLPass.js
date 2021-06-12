'use strict';

require('three-shaders');

THREE.EDLShader = {
  uniforms: {
    "tDiffuse":     { value: null },
    "tDepth":       { value: null },
    "size":         { value: new THREE.Vector2( 512, 512 ) },
    "cameraNear":   { value: 1.0 },
    "cameraFar":    { value: 100.0 },
    "radius":       { value: 1.0 },
    "strength":     { value: 1.0 },
    "onlyAO":       { value: 0 }
  },

  vertexShader: [
    "void main() {",
    "  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",
    "}"
  ].join( "\n" ),

  fragmentShader: [
    "precision highp float;",
    "uniform float cameraNear;",
    "uniform float cameraFar;",
    "#ifdef USE_LOGDEPTHBUF",
    "uniform float logDepthBufFC;",
    "#endif",
    "uniform vec2 size;",        // texture width, height
    "uniform float radius;",
    "uniform float strength;",
    "uniform bool onlyAO;",      // use only ambient occlusion pass?
    "uniform sampler2D tDiffuse;",
    "uniform sampler2D tDepth;",

    // RGBA depth
    "#include <packing>",
    "float readDepth( const in vec2 coord ) {",
    "  float cameraFarPlusNear = cameraFar + cameraNear;",
    "  float cameraFarMinusNear = cameraFar - cameraNear;",
    "  float cameraCoef = 2.0 * cameraNear;",
    "#ifdef USE_LOGDEPTHBUF",
    "  float logz = unpackRGBAToDepth( texture2D( tDepth, coord ) );",
    "  float w = pow(2.0, (logz / logDepthBufFC)) - 1.0;",
    "  float z = (logz / w) + 1.0;",
    "#else",
    "  float z = unpackRGBAToDepth( texture2D( tDepth, coord ) );",
    "#endif",
    "  return cameraCoef / ( cameraFarPlusNear - z * cameraFarMinusNear );",
    "}",

    "void main() {",
    "  vec2 vUv = gl_FragCoord.xy / size;",
    "  vec4 color = texture2D( tDiffuse, vUv );",
    "  float x_step = radius / size.x;",
    "  float y_step = radius / size.y;",
    "  float d_c = log2(readDepth(vUv));",
    "  float d_n = log2(readDepth(vUv+vec2(     0.0,  y_step)));",
    "  float d_s = log2(readDepth(vUv+vec2(     0.0, -y_step)));",
    "  float d_w = log2(readDepth(vUv+vec2( -x_step,     0.0)));",
    "  float d_e = log2(readDepth(vUv+vec2(  x_step,     0.0)));",
    "",
    "  float response = 0.0;",
    "  response += max(0.0, d_c - d_n);",
    "  response += max(0.0, d_c - d_s);",
    "  response += max(0.0, d_c - d_e);",
    "  response += max(0.0, d_c - d_w);",
    "  response /= 4.0;",
    "",
    "  float edl_shade = exp(-response * 300.0 * strength);",
    "  float edl_alpha = float(response > 0.0);",
    "",
    "  if ( onlyAO ) {",
    "    gl_FragColor = vec4( vec3(edl_shade), clamp(edl_alpha, 0.0, 1.0) );",
    "  } else {",
    "    gl_FragColor = vec4( color.rgb * edl_shade, clamp(color.a, 0.0, 1.0) );",
    "  }",
    "}"
  ].join( "\n" )
};


/**
 * Eye-dome lighting shader pass
 *
 * Has the following parameters
 *  - radius
 *  - strength
 * To output to screen set renderToScreens true
 * @class THREE.EDLPass
 */
THREE.EDLPass = function ( scene, camera, width, height ) {
  THREE.ShaderPass.call( this, THREE.EDLShader );

  this.width = ( width !== undefined ) ? width : 512;
  this.height = ( height !== undefined ) ? height : 256;

  this.renderToScreen = false;

  this.camera2 = camera;
  this.scene2 = scene;

  //Depth material
  this.depthMaterial = new THREE.MeshDepthMaterial();
  this.depthMaterial.depthPacking = THREE.RGBADepthPacking;
  this.depthMaterial.blending = THREE.NoBlending;

  //Depth render target
  this.depthRenderTarget = new THREE.WebGLRenderTarget( this.width, this.height,
    { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter } );

  //Shader uniforms
  this.uniforms[ 'tDepth' ].value = this.depthRenderTarget.texture;
  this.uniforms[ 'size' ].value.set( this.width, this.height );
  this.uniforms[ 'cameraNear' ].value = this.camera2.near;
  this.uniforms[ 'cameraFar' ].value = this.camera2.far;

  this.uniforms[ 'radius' ].value = 1;
  this.uniforms[ 'strength' ].value = 1;
  this.uniforms[ 'onlyAO' ].value = false;

  //Setters and getters for uniforms
  var self = this;
  Object.defineProperties(this, {
    radius: {
      get: function() { return self.uniforms[ 'radius' ].value; },
      set: function( value ) { self.uniforms[ 'radius' ].value = value; }
    },
    strength: {
      get: function() { return self.uniforms[ 'strength' ].value; },
      set: function( value ) { self.uniforms[ 'strength' ].value = value; }
    },
    onlyAO: {
      get: function() { return self.uniforms[ 'onlyAO' ].value; },
      set: function( value ) { self.uniforms[ 'onlyAO' ].value = value; }
    }
  });
};

THREE.EDLPass.prototype = Object.create( THREE.ShaderPass.prototype );

/**
 * Render using this pass.
 *
 * @method THREE.EDLPass.render
 * @param {WebGLRenderer} renderer
 * @param {WebGLRenderTarget} writeBuffer Buffer to write output.
 * @param {WebGLRenderTarget} readBuffer Input buffer.
 * @param {Number} delta Delta time in milliseconds.
 * @param {Boolean} maskActive Not used in this pass.
 */
THREE.EDLPass.prototype.render = function( renderer, writeBuffer, readBuffer, delta, maskActive ) {
  // AXC: Save oldOverrideMaterial so it can be restored
  var oldOverrideMaterial = this.scene2.overrideMaterial;
  this.scene2.overrideMaterial = this.depthMaterial;
  renderer.setRenderTarget( this.depthRenderTarget );
  renderer.clear();
  renderer.render( this.scene2, this.camera2 );
  this.scene2.overrideMaterial = oldOverrideMaterial;
  THREE.ShaderPass.prototype.render.call( this, renderer, writeBuffer, readBuffer, delta, maskActive );
};

/**
 * Change scene to be renderer by this render pass.
 *
 * @method THREE.EDLPass.setScene
 * @param {Scene} scene
 */
THREE.EDLPass.prototype.setScene = function(scene) {
  this.scene2 = scene;
};

/**
 * Set camera used by this render pass.
 *
 * @method THREE.EDLPass.setCamera
 * @param {Camera} camera
 */
THREE.EDLPass.prototype.setCamera = function( camera ) {
  this.camera2 = camera;
  this.uniforms[ 'cameraNear' ].value = this.camera2.near;
  this.uniforms[ 'cameraFar' ].value = this.camera2.far;
};

/**
 * Set resolution of this render pass.
 *
 * @method THREE.EDLPass.setSize
 * @param {Number} width
 * @param {Number} height
 */
THREE.EDLPass.prototype.setSize = function( width, height ) {
  this.width = width;
  this.height = height;
  this.uniforms[ 'size' ].value.set( this.width, this.height );
  this.depthRenderTarget.setSize( this.width, this.height );
};
