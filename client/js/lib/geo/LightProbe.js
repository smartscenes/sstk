function LightProbe(defaultRadius, metersToVirtualUnit) {
  this._x = 0;
  this._y = 0;
  this._z = 0;
  this._radius = 0;
  this.defaultRadius = defaultRadius;
  var sphere = new THREE.SphereGeometry(1, 20, 10);
  var material = new THREE.MeshPhongMaterial({ color: 0xffff00, emissive: 0xffff00 });
  this.mesh = new THREE.Mesh(sphere, material);
  this.light = new THREE.PointLight();
  this.mesh.add(this.light);
  var R = this.defaultRadius * metersToVirtualUnit;
  this.mesh.scale.set(R, R, R);
}
Object.defineProperty(LightProbe.prototype, 'x', {
  get: function () { return this._x; },
  set: function (v) {
    this._x = v;
    this.mesh.position.x = v;
  }
});
Object.defineProperty(LightProbe.prototype, 'y', {
  get: function () { return this._y; },
  set: function (v) {
    this._y = v;
    this.mesh.position.y = v;
  }
});
Object.defineProperty(LightProbe.prototype, 'z', {
  get: function () { return this._z; },
  set: function (v) {
    this._z = v;
    this.mesh.position.z = v;
  }
});
Object.defineProperty(LightProbe.prototype, 'radius', {
  get: function () { return this._radius; },
  set: function (v) {
    this._radius = v;
    this.light.intensity = v * v / (this.defaultRadius * this.defaultRadius);
    this.mesh.scale.set(v, v, v);
  }
});

module.exports = LightProbe;