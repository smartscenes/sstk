var Object3DUtil = require('geo/Object3DUtil');

function LightControls(params) {
  this.object3D = params.object3D;
  this.modelInstance = params.modelInstance || Object3DUtil.getModelInstance(this.object3D);
  this.assetManager = params.assetManager;
  this.isOn = this.modelInstance? this.modelInstance.getLightState() : this.object3D.userData.lightsOn;

  var scope = this;
  this.getOperations = function() {
    return ['turnOn', 'turnOff', 'toggle'];
  };

  this.setLights = function(flag) {
    scope.isOn = flag;
    if (scope.modelInstance) {
      scope.modelInstance.setLightState(flag, scope.assetManager);
    } else {
      Object3DUtil.setLights(scope.object3D, flag);
    }
    return scope.isOn;
  };

  this.turnOn = function() {
    return scope.setLights(true);
  };

  this.turnOff = function() {
    return scope.setLights(false);
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

module.exports = LightControls;