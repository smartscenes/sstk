var Object3DUtil = require('geo/Object3DUtil');

var vertexShader = [
  "varying vec3 vWorldPosition;",
  "void main() {",
  "  vec4 worldPosition = modelMatrix * vec4( position, 1.0 );",
  "  vWorldPosition = worldPosition.xyz;",
  "  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",
  "}"
].join('\n');

var fragmentShader = [
  "uniform vec3 topColor;",
  "uniform vec3 bottomColor;",
  "uniform float offset;",
  "uniform float exponent;",
  "varying vec3 vWorldPosition;",
  "void main() {",
  "  float h = normalize( vWorldPosition + offset ).y;",
  "  gl_FragColor = vec4( mix( bottomColor, topColor, max( pow( max( h , 0.0), exponent ), 0.0 ) ), 1.0 );",
  "}"
].join('\n');

function Skydome(opts) {
  this.radius = opts.radius;
  var skyGeo = new THREE.SphereGeometry(opts.radius, 32, 15);
  var skyMat;
  if (this.topColor && this.bottomColor) {
    this.topColor = opts.topColor;
    this.bottomColor = opts.bottomColor;
    var uniforms = {
      topColor: {value: opts.topColor},
      bottomColor: {value: opts.bottomColor},
      offset: {value: 33},
      exponent: {value: 0.6}
    };
    skyMat = new THREE.ShaderMaterial({
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      uniforms: uniforms,
      side: THREE.BackSide
    });
  } else {
    skyMat = Object3DUtil.getBasicMaterial(opts.color || 'blue');
  }
  if (opts.texture) {
    var texture = Object3DUtil.loadTexture(opts.texture);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4,4);
    skyMat.map = texture;
  }
  THREE.Mesh.call(this, skyGeo, skyMat);
}

Skydome.prototype = Object.create(THREE.Mesh.prototype);
Skydome.prototype.constructor = Skydome;

module.exports = Skydome;