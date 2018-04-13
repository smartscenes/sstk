var SceneEditUI = require('scene-viewer/SceneEditUI');

/**
 * Handles interactive editing of scene for simulator
 * @param opts
 * @constructor
 * @memberOf sim
 */
function SimEditUI(opts) {
  this.simulator = opts.simulator;
  this.editUI = new SceneEditUI(opts);
}

Object.defineProperty(SimEditUI.prototype, 'isVisible', {
  get: function () { return this.editUI.editPanel.is(':visible'); },
  set: function (v) {
    if (v) { this.show(); }
    else { this.hide(); }
  }
});

SimEditUI.prototype.init = function() {
  var scope = this;
  scope.editUI.init();
  this.simulator.Subscribe('SceneLoaded', this, function(sceneState) {
    scope.editUI.reset({
      sceneState: scope.simulator.state.sceneState,
      cameraControls: { camera: scope.editUI.app.camera }
    });
  });
};

SimEditUI.prototype.show = function() {
  this.editUI.show();
  if (!this.editUI.editMode) {
    this.editUI.toggleEditMode();
  }
};

SimEditUI.prototype.hide = function() {
  this.editUI.hide();
  if (this.editUI.editMode) {
    this.editUI.toggleEditMode();
  }
};

SimEditUI.prototype.onResize = function(options) {
  this.editUI.onResize(options);
};

module.exports = SimEditUI;