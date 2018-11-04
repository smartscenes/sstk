var CharacterCreator = require('anim/CharacterCreator');
var InteractionViewer = require('interaction-viewer/InteractionViewer');
var KinectRecording = require('anim/KinectRecording');
var Object3DUtil = require('geo/Object3DUtil');
var _ = require('util/util');

function RecordingViewer(params) {
  var defaults = {
  };
  this.urlParams = _.getUrlParams();
  InteractionViewer.call(this, _.defaults(Object.create(null), params, defaults));

  this.recordingId = this.urlParams.fullId;
  this.characterCreator = new CharacterCreator();
  this.timeSlider = $(this.__options.timeSlider || '#timeSlider');
  this.annotationLabels = $(this.__options.annotationLabels || '#annotationLabels');
}

RecordingViewer.prototype = Object.create(InteractionViewer.prototype);
RecordingViewer.prototype.constructor = RecordingViewer;

RecordingViewer.prototype.__loadRecording = function(recordingInfo) {
  var scope = this;
  KinectRecording.load(this.assetLoader, recordingInfo, scope.skeleton, function(err, recording) {
    if (recording) {
      scope.recording = recording;
      console.log(scope.recording);
      //scope.timeSlider.slider('option', 'max', scope.recording.duration);
      scope.timeSlider.slider('option', 'max', scope.recording.getSkeletons().length-1);
      scope.__showSkeletonAtIndex(0);
    }
  });
};

RecordingViewer.prototype.__loadScan = function(scanId) {
  var scope = this;
  this.assetManager.loadAsset({fullId: scanId}, function (err, scan) {
    scope.setupBasicScene(scan.model.info);

    scope.scan = scan;
    scope.sceneState.addObject(scan);
    scope.cameraControls.viewTarget({
      targetBBox: Object3DUtil.getBoundingBox(scan.object3D),
      theta: Math.PI/6,
      phi: -Math.PI/4,
      distanceScale: 2.0
    });
    scope.__showSkeletonAtIndex(0);
  });
};

RecordingViewer.prototype.showRecording = function(recordingId, startTime, endTime) {
  this.scan = null;
  this.recording = null;
  var assetInfo = this.assetManager.getAssetInfo(recordingId);
  if (assetInfo) {
    // TODO: Add scan to asset csv
    if (!assetInfo.scanId) {
      assetInfo.scanId = 'vf.' + assetInfo.id.split('_')[0];
    }
    console.log(assetInfo);
    this.__loadScan(assetInfo.scanId);
    this.__loadRecording(assetInfo);
  } else {
    console.log('Unknown recordingId: ' + recordingId);
  }
};

RecordingViewer.prototype.__initSearch = function (options, assetGroups) {
  InteractionViewer.prototype.__initSearch.call(this, options, assetGroups);
  this.showRecording(this.recordingId, this.urlParams['startTime'], this.urlParams['endTime']);
};

RecordingViewer.prototype.__clearSkeleton = function() {
  if (this.character) {
    var node = this.character.object3D;
    if (node && node.parent) {
      node.parent.remove(node);
    }
    delete this.character;
  }
  delete this.skelIndex;
};

RecordingViewer.prototype.__showSkeletonAtIndex = function(index) {
  this.__clearSkeleton();

  if (this.recording && this.scan) {
    this.skelIndex = index;
    var skel = this.recording.getPosedSkeleton(index);
    this.character = this.characterCreator.create({
      name: skel.id,
      skeletonData: skel
    }, index, null);
    this.characterCreator.attachCharacter(this.sceneState, this.character, this.skeleton);
    this.annotationLabels.empty();
    var annotation = this.recording.findAnnotationAtTimestamp(skel.timestamp);
    console.log('annotation for time ' + skel.timestamp, annotation);
    if (annotation) {
      this.annotationLabels.append(annotation.labels.join('<br/>'));
    }
  }
};

RecordingViewer.prototype.setTime = function(time) {
  if (this.recording) {
    this.__showSkeletonAtIndex(time);
  }
};

RecordingViewer.prototype.setupUI = function() {
  InteractionViewer.prototype.setupUI.call(this);
  var scope = this;
  this.timeSlider.slider({
    slide: function( event, ui ) {
      scope.setTime(ui.value);
    }
  });
};


module.exports = RecordingViewer;