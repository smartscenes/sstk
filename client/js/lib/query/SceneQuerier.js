'use strict';

var AssetQuerier = require('query/AssetQuerier');
var AssetManager = require('assets/AssetManager');
var SceneSchema = require('scene/SceneSchema');
var RoomSchema = require('scene/RoomSchema');
var _ = require('util');

function SceneQuerier(options) {
  // Set reasonable defaults
  var defaults = {
    viewerUrl: 'scene-viewer.html',
    viewerWindowName: 'Scene Viewer',
    previewImageIndex: null,
    assetTypes: ['scene'],
    schemas: {
      'scene': new SceneSchema(),
      'room': new RoomSchema()
    },
    customizeResult: this.customizeResult.bind(this)
  };
  options = _.defaults({}, options, defaults);
  AssetQuerier.call(this, options);
}

SceneQuerier.prototype = Object.create(AssetQuerier.prototype);
SceneQuerier.prototype.constructor = SceneQuerier;

SceneQuerier.prototype.customizeResult = function (source, id, result, elem) {
    var fullId = AssetManager.toFullId(source, id);
    elem.data('fullId', fullId);
    if (result.nlevels && result.nlevels > 1) {
      for (var i = 0; i < result.nlevels; i++) {
        elem.append($('<input/>').attr('type', 'button')
          .attr('value', i)
          .attr('title', 'Show level ' + i)
          .hover(function (level, e) {
              // Show image for floor
              elem.find('img.resultImg').attr('src',
                this.assetManager.getImagePreviewUrl(source, id, level, result));
            }.bind(this, i),
            function() {
              // Show default screen shot
              elem.find('img.resultImg').attr('src',
                this.assetManager.getImagePreviewUrl(source, id, undefined, result));
            }.bind(this, i)
          )
          .click(function (level, e) {
              this.showLevel(fullId, level);
              e.stopPropagation();
            }.bind(this, i)
          )
        );
    }
  }
};

SceneQuerier.prototype.getViewResultUrl = function(fullId, result) {
  return this.viewerUrl + '?allowEdit=false&sceneId=' + fullId;
};

SceneQuerier.prototype.showResult = function (source, id, result) {
  if (this.selectedAssetType === 'room') {
    var sceneSource = (source === 'p5dRoom')? 'p5dScene' : source;
    var fullId = AssetManager.toFullId(sceneSource, result.sceneId);
    this.showRoom(fullId, result.floor, result.roomIndex);
  } else {
    // Assume scene
    this.showScene(source, id);
  }
};

SceneQuerier.prototype.showScene = function (source, id) {
  var fullId = AssetManager.toFullId(source, id);
  var url = this.viewerUrl + '?allowEdit=false&sceneId=' + fullId;
  this.openViewer(url, 'Scene Viewer');
};

SceneQuerier.prototype.showLevel = function (fullId, floor) {
  var url = this.viewerUrl + '?allowEdit=false&sceneId=' + fullId + '&floor=' + floor;
  this.openViewer(url, 'Scene Viewer');
};

SceneQuerier.prototype.showRoom = function (fullId, floor, room) {
  var url = this.viewerUrl + '?allowEdit=false&loadAll=true&sceneId=' + fullId + '&floor=' + floor + '&room=' + room;
  this.openViewer(url, 'Room Viewer');
};

// Exports
module.exports = SceneQuerier;
