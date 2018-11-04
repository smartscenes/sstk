var _ = require('util/util');

// Add functions to object3D that allows for toggling of video
function VideoPlayer(params) {
  this.object3D = params.object3D;
  this.videoMaterials = params.videoMaterials;
  this.assetManager = params.assetManager;
  this.isOn = false;
  this.isPaused = false;

  var scope = this;

  this.getOperations = function() {
    return ['load', 'pause', 'play', 'turnOn', 'turnOff', 'toggle'];
  };

  this.load = function(path) {
    scope.videoTexture = scope.assetManager.loadVideoTexture(path);
    scope.videoMaterial = new THREE.MeshBasicMaterial( {
      name: "video",
      map: scope.videoTexture.texture,
      overdraw: 0.5 // TODO: what is right value here?
    });
    scope.videoMaterial.video = scope.videoTexture.video;
  };

  this.__pause = function() {
    scope.videoTexture.video.pause();
  };

  this.pause = function() {
    scope.__pause();
    scope.isPaused = true;
  };

  this.play = function(path) {
    if (path || !scope.videoTexture) {
      scope.load(path);
    }
    if (!scope.isOn) {
      scope.__turnOn();
    }
    scope.videoTexture.video.play();
    scope.isPaused = false;
  };

  this.__turnOn = function() {
    _.each(scope.videoMaterials, function(mat) {
      mat.setMaterial(scope.videoMaterial);
    });
    scope.isOn = true;
    return scope.isOn;
  };

  this.turnOn = function() {
    if (!scope.isOn) {
      scope.play();
    }
  };

  this.turnOff = function() {
    scope.__pause();
    _.each(scope.videoMaterials, function(mat) {
      mat.setMaterial(mat.material);
    });
    scope.isOn = false;
    return scope.isOn;
  };

  this.toggle = function() {
    if (scope.isOn) {
      scope.turnOff();
    } else {
      scope.turnOn();
    }
    return scope.isOn;
  };
}

module.exports = VideoPlayer;