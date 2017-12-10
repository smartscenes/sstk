var Object3DUtil = require('geo/Object3DUtil');
var PosedSkeleton = require('anim/PosedSkeleton');
var _ = require('util');

var __kTimestampToSecs = 1.0e-7;
var __kSecsToTimestamp = 1.0e+7;

function KinectRecording(info, data, skeletonDef) {
  this.info = info;
  this.data = data;
  this.skeletonDef = skeletonDef; // skeleton definition
  // Data consists of:
  // id: recording id string
  // camera: 4x4 matrix as flattened array
  // colorTimestamps: array of raw timestamps into color video for each color frame
  // depthTimestamps: array of raw timestamps into depth video for each depth frame
  // startTime: start time of recording
  // endTime: last time of recording
  // skeletons: array of skeletons
  this.cameraTransform = Object3DUtil.arrayToMatrix4(this.data.camera, true);
  // this.cameraScale = new THREE.Vector3();
  // this.cameraPosition = new THREE.Vector3();
  // this.cameraQuaternion = new THREE.Quaternion();
  // this.cameraTransform.decompose(this.cameraPosition, this.cameraQuaternion, this.cameraScale);

  this.data.duration = this.data.endTime - this.data.startTime;
}

Object.defineProperty(KinectRecording.prototype, 'startTime', {
  get: function () { return this.data.startTime; }
});

Object.defineProperty(KinectRecording.prototype, 'endTime', {
  get: function () { return this.data.endTime; }
});

Object.defineProperty(KinectRecording.prototype, 'duration', {
  get: function () { return this.data.duration; }
});

KinectRecording.prototype.getPosedSkeleton = function(index) {
  var skelData = this.data.skeletons[index];
  if (skelData) {
    return new PosedSkeleton({
      id: this.data.id + '-skel' + _.padStart(index, 6, '0'),
      timestamp: skelData.timestamp,
      cameraTransform: this.cameraTransform,
      //worldPosition: skelData['jointPositions'][this.skeletonDef.rootJointIndex],
      //worldOrientation: skelData['jointOrientations'][this.skeletonDef.rootJointIndex],
      worldPosition: this.cameraPosition,
      worldOrientation: this.cameraQuaternion,
      jointPositions: skelData['jointPositions'],
      jointOrientations: skelData['jointOrientations'],
      jointConfidences: skelData['jointConfidences'],
      // bonePositions: [],
      // boneOrientations: [],
      // boneLengths: []
    });
  }
};

function __findIndexAtTime(records, time, timeField1, timeField2) {
  for (var i = 0; i < records.length; i++) {
    var rec = records[i];
    if (rec[timeField1] <= time && rec[timeField2] >= time) {
      return i;
    }
  }
}

KinectRecording.prototype.findAnnotationAtTimestamp = function(time) {
  var i =  __findIndexAtTime(this.interactionAnnotations, time, 'startTimestamp', 'endTimestamp');
  return this.interactionAnnotations[i];
};

KinectRecording.prototype.getSkeletons = function() {
  return this.data.skeletons;
};


var __parseInteractionAnnotations = function(recording, data) {
  //var annTimestampStart = recording.data.colorTimestamps[0]; // Take the timestamp of the first video frame as the start of the annotation timestamp
  var annTimestampStart = recording.data.skeletons[0].timestamp;
  var annotations = [];
  var lines = data.split('\n');
  for (var i = 0; i < lines.length; i++) {
    var line = _.trim(lines[i]);
    if (line.length > 0) {
      var parts = line.split(',', 2);
      var timeRange = parts[0].split('-', 2);
      var labels = parts[1].split('|');
      var ann = {
        start: parseFloat(timeRange[0]),
        end: parseFloat(timeRange[1]),
        labels: labels
      };
      ann.startTimestamp = ann.start * __kSecsToTimestamp + annTimestampStart;
      ann.endTimestamp = ann.end * __kSecsToTimestamp + annTimestampStart;
      annotations.push(ann);
    }
  }
  return annotations;
};


KinectRecording.load = function(assetLoader, recordingInfo, skeletonDef, callback) {
  assetLoader.load(recordingInfo.recordingFile, 'json', function(data) {
    var recording = new KinectRecording(recordingInfo, data, skeletonDef);
    assetLoader.load(recordingInfo.interactionsFile, 'utf-8', function(data) {
      recording.interactionAnnotations = __parseInteractionAnnotations(recording, data);
      callback(null, recording);
    },
    null,
    function(err) {
      console.error('Error loading recording annotations from ' + recordingInfo.interactionsFile + ': ' + err);
      callback(null, recording);
    });
  },
  null,
  function (err) {
    callback(err, null);
  });
};

module.exports = KinectRecording;