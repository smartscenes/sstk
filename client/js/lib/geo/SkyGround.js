var Constants = require('Constants');
var Colors = require('util/Colors');
var Object3DUtil = require('geo/Object3DUtil');
var Skydome = require('geo/Skydome');
var _ = require('util/util');

function SkyGround(opts) {
  this.opts = _.defaultsDeep(Object.create(null), opts || {}, {
    name: 'SkyGround',
    radius: 50*Constants.metersToVirtualUnit,
    fog: true,
    position: new THREE.Vector3(),
    sky: {
      color: 'skyblue',
      //color: 0xffffff,
      texture: Constants.assetsDir + '/images/sky.jpg'
      // topColor: 0x0077ff,
      // bottomColor: 0xffffff
    },
    ground: {
      color: 0x004d00,
      texture: Constants.assetsDir + '/images/green-grass-texture.jpg'
    }
  });
  THREE.Group.call(this);
  this.name = this.opts.name;
  this.radius = this.opts.radius;

  if (this.opts.sky.topColor) {
    this.opts.sky.topColor = Colors.toColor(this.opts.sky.topColor);
  }
  if (this.opts.sky.bottomColor) {
    this.opts.sky.bottomColor = Colors.toColor(this.opts.sky.bottomColor);
  }
  if (this.opts.sky.color) {
    this.opts.sky.color = Colors.toColor(this.opts.sky.color);
  }
  this.opts.sky.radius = this.radius*0.8;
  this.opts.ground.color = Colors.toColor(this.opts.ground.color);
  this.opts.ground.width = 2*this.radius;
  this.opts.ground.height = 2*this.radius;

  this.sky = new Skydome(this.opts.sky);
  this.ground = this.__createGround(this.opts.ground);
  if (this.opts.fog) {
    this.fog = new THREE.Fog(0xffffff, this.radius/4, this.radius);
    if (this.opts.sky.bottomColor) {
      this.fog.color.copy(this.opts.sky.bottomColor);
    } else {
      this.fog.color.copy(Colors.lighten(this.opts.sky.color));
    }
  }
  this.add(this.ground);
  this.add(this.sky);
  this.position.copy(this.opts.position);
}

SkyGround.prototype = Object.create(THREE.Group.prototype);
SkyGround.prototype.constructor = SkyGround;

SkyGround.prototype.__createGround = function(opts) {
  var groundGeo = new THREE.PlaneBufferGeometry( opts.width, opts.height );
  var groundMat = new THREE.MeshBasicMaterial(
    { color: 0xffffff }
  );
  if (opts.texture) {
    var texture = Object3DUtil.loadTexture(opts.texture);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(opts.width, opts.height);
    groundMat.map = texture;
  }
  groundMat.color.copy(opts.color);
  var ground = new THREE.Mesh( groundGeo, groundMat );
  ground.rotation.x = -Math.PI/2;
  ground.receiveShadow = true;
  return ground;
};

module.exports = SkyGround;