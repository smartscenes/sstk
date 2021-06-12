'use strict';

var AssetQuerier = require('query/AssetQuerier');
var AssetManager = require('assets/AssetManager');
var SceneSchema = require('scene/SceneSchema');
var RoomSchema = require('scene/RoomSchema');
var _ = require('util/util');

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

Object.defineProperty(SceneQuerier.prototype, 'showRoomWithEntireScene', {
  get: function () { return this.__showRoomWithEntireSceneElem != null && this.__showRoomWithEntireSceneElem.prop('checked'); }
});

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

SceneQuerier.prototype.__onSourceChanged = function(source) {
  if (this.selectedAssetType === 'room') {
    if (!this.__showRoomWithEntireSceneElem) {
      this.__showRoomWithEntireSceneElem = $('<input/>').attr('type', 'checkbox');
      var label = $('<label></label>').append(this.__showRoomWithEntireSceneElem).append('Show room with entire scene');
      label.insertAfter(this.searchController.searchPanel.sourceElem);
    }
    this.__showRoomWithEntireSceneElem.show();
  } else {
    if (this.__showRoomWithEntireSceneElem) {
      this.__showRoomWithEntireSceneElem.hide();
    }
  }
};

SceneQuerier.prototype.getViewResultUrl = function(fullId, result) {
  return this.viewerUrl + '?allowEdit=false&sceneId=' + fullId;
};

SceneQuerier.prototype.showResult = function (source, id, result) {
  if (this.selectedAssetType === 'room') {
    var sceneSource = (source.endsWith('Room'))? source.substring(0, source.length - 4) + 'Scene' : source;
    var fullId = AssetManager.toFullId(sceneSource, result.sceneId);
    this.showRoom(fullId, result.floor, result.roomIndex, this.showRoomWithEntireScene);
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

SceneQuerier.prototype.showLevel = function (fullId, level) {
  var url = this.viewerUrl + '?allowEdit=false&sceneId=' + fullId + '&floor=' + level;
  this.openViewer(url, 'Scene Viewer');
};

SceneQuerier.prototype.showRoom = function (fullId, level, room, loadAll) {
  loadAll = !!loadAll;
  var url = this.viewerUrl + '?allowEdit=false&loadAll=' + loadAll + '&sceneId=' + fullId + '&floor=' + level + '&room=' + room;
  this.openViewer(url, 'Room Viewer');
};

// Exports
module.exports = SceneQuerier;
