// Takes cubemap and creates equirectangular panorama
// Adapted from https://github.com/spite/THREE.CubemapToEquirectangular
// MIT License

var Constants = require('Constants');
var _ = require('util/util');

var vertexShader = [
  "attribute vec3 position;",
  "attribute vec2 uv;",

  "uniform mat4 projectionMatrix;",
  "uniform mat4 modelViewMatrix;",

  "varying vec2 vUv;",

  "void main()  {",

  "  vUv = vec2( 1.- uv.x, 1. - uv.y );",
  "  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",

  "}"
].join("\n");

var fragmentShader = [
  "precision mediump float;",

  "uniform samplerCube map;",

  "varying vec2 vUv;",

  "#define M_PI 3.1415926535897932384626433832795",

  "void main()  {",

  "  vec2 uv = vUv;",

  "  float longitude = uv.x * 2. * M_PI - M_PI + M_PI / 2.;",
  "  float latitude = uv.y * M_PI;",

  "  vec3 dir = vec3(",
  "    - sin( longitude ) * sin( latitude ),",
  "    cos( latitude ),",
  "    - cos( longitude ) * sin( latitude )",
  "  );",
  "  normalize( dir );",

  "  gl_FragColor = textureCube( map, dir );",

  "}"
].join("\n");

function CubemapToEquirectangular( renderer, width, height, options ) {
  width = width || 4096;
  height = height || 2048;

  options = _.defaults(Object.create(null), options || {}, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter
  });

  this.width = 1;
  this.height = 1;

  this.renderer = renderer;
  this.minFilter = options.minFilter;
  this.magFilter = options.magFilter;

  this.material = new THREE.RawShaderMaterial( {
    uniforms: {
      map: { type: 't', value: null }
    },
    vertexShader: vertexShader,
    fragmentShader: fragmentShader,
    side: THREE.DoubleSide,
    transparent: true
  } );

  this.scene = new THREE.Scene();
  this.quad = new THREE.Mesh(
    new THREE.PlaneBufferGeometry( 1, 1 ),
    this.material
  );
  this.scene.add( this.quad );
  this.camera = new THREE.OrthographicCamera( 1 / - 2, 1 / 2, 1 / 2, 1 / - 2, -10000, 10000 );

  this.cubeCamera = null;

  this.setSize( width, height );

  var gl = this.renderer.getContext();
  this.maxCubeMapSize = gl.getParameter( gl.MAX_CUBE_MAP_TEXTURE_SIZE );

  this.setupCubeCamera( 2048 );
}

CubemapToEquirectangular.prototype.setSize = function( width, height ) {

  this.width = width;
  this.height = height;

  this.quad.scale.set( this.width, this.height, 1 );

  this.camera.left = this.width / - 2;
  this.camera.right = this.width / 2;
  this.camera.top = this.height / 2;
  this.camera.bottom = this.height / - 2;

  this.camera.updateProjectionMatrix();

  if (this.output == null) {
    this.output = new THREE.WebGLRenderTarget( this.width, this.height, {
      minFilter: this.minFilter,
      magFilter: this.magFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType
    });
  } else {
    this.output.setSize(this.width, this.height);
  }
};

CubemapToEquirectangular.prototype.setupCubeCamera = function( size ) {

  var cubeMapSize = Math.min( this.maxCubeMapSize, size );
  var options = { format: THREE.RGBAFormat, magFilter: this.magFilter, minFilter: this.minFilter };
  var cubeRenderTarget = new THREE.WebGLCubeRenderTarget( cubeMapSize, options );
  this.cubeCamera = new THREE.CubeCamera( .1*Constants.metersToVirtualUnit, 1000*Constants.metersToVirtualUnit, cubeRenderTarget );

  return this.cubeCamera;

};

CubemapToEquirectangular.prototype.getPixels = function(pixels) {
  pixels = pixels || new Uint8Array( 4 * this.width * this.height );
  this.renderer.readRenderTargetPixels( this.output, 0, 0, this.width, this.height, pixels );
  return pixels;
};

CubemapToEquirectangular.prototype.getCubemapPixels = function(pixels, cubeFace) {
  var cubeMapSize = this.cubeCamera.renderTarget.width;
  pixels = pixels || new Uint8Array( 4 * cubeMapSize * cubeMapSize );
  this.cubeCamera.renderTarget.activeCubeFace = cubeFace;
  this.renderer.readRenderTargetPixels( this.cubeCamera.renderTarget, 0, 0, cubeMapSize, cubeMapSize, pixels );
  return pixels;
};

CubemapToEquirectangular.prototype.render = function( scene, camera, renderTarget ) {
  var oldAutoClear = this.renderer.autoClear;
  this.renderer.autoClear = true;
  this.cubeCamera.setFromCamera(camera);
  this.cubeCamera.update( this.renderer, scene );
  this.renderer.autoClear = oldAutoClear;

  this.quad.material.uniforms.map.value = this.cubeCamera.renderTarget.texture;
  this.renderer.setRenderTarget(renderTarget? renderTarget : null);
  this.renderer.clear();
  this.renderer.render( this.scene, this.camera );
};

CubemapToEquirectangular.prototype.update = function( scene, camera ) {
  this.render(scene, camera, this.output);
};

module.exports = CubemapToEquirectangular;