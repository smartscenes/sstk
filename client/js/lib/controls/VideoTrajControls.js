var AssetLoader = require('assets/AssetLoader');
var Object3DUtil = require('geo/Object3DUtil');

// Controls camera using video + trajectory with transforms
function VideoTrajControls(params) {
  this.modelInstance = null;
  this.trajectory = null;
  this.__loader = new AssetLoader();
  this.fps = params.fps || 24;
  this.video = params.video; // Video element
  this.cameraControls = params.cameraControls;

  var scope = this;
  this.video.ontimeupdate = function() {
    var time = scope.video.currentTime;
    var f = Math.floor(time * scope.fps);
    console.log('Time: ' + time + ', frame: ' + f);
    if (scope.trajectory) {
      var t = scope.trajectory[f];
      console.log('transform ', t);
      if (t && t.camxform) {
        scope.cameraControls.setCameraMatrix(t.camxform);
      }
    }
  };
}

VideoTrajControls.prototype.show = function(flag) {
  if (flag || flag == null) {
    $(this.video).show();
  } else {
    $(this.video).hide();
  }
};

VideoTrajControls.prototype.attach = function(m) {
  var scope = this;
  var modelInfo = m.model.info;
  this.modelInstance = m;
  this.video.src = modelInfo.video;
  this.video.load();
  this.trajectory = null;
  this.__loader.load(modelInfo.trajectory, 'json', function(json) {
    var traj = json.trajectory;
    var modelObject3D = scope.modelInstance.getObject3D('Model');
    modelObject3D.updateMatrixWorld();
    var modelWorldMatrix = modelObject3D.matrixWorld;
    // Convert from array to matrix and compute camera transform in our coordinate system
    for (var i = 0; i < traj.length; i++) {
      if (traj[i].transform) {
        traj[i].transform = Object3DUtil.arrayToMatrix4(traj[i].transform, true);
        traj[i].camxform = new THREE.Matrix4();
        traj[i].camxform.multiplyMatrices(modelWorldMatrix, traj[i].transform);
      }
    }
    scope.trajectory = traj;
  });
};

module.exports = VideoTrajControls;