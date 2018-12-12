// Create annotations view with groupings
var Constants = require('Constants');
var AssetGroup = require('assets/AssetGroup');
var AssetManager = require('assets/AssetManager');
var UIUtil = require('ui/UIUtil');
var async = require('async');
var _ = require('util/util');
require('jquery-lazy');

/**
 * Viewer for looking at a set of levels of a house
 * @param params
 * @param params.container Selector for container where the annotation view will be
 * @param params.parentAssetGroup {{metadata: string, ids: string}} Parent asset group (for grouping)
 * @param params.parentViewerUrl {string} Link to go to when person clicks on the image
 * @param params.levelImages {string[]} List of image types to show for each level
 * @param [params.sortBy] {string} Field to sort by
 * @constructor
 * @memberOf scannet
 */
function LevelViewer(params) {
  this.container = $(params.container);
  this.loadingElement = $(params.loadingMessageSelector || '#loadingMessage');
  this.parentAssetGroup = params.parentAssetGroup;
  this.parentViewerUrlTemplate = _.template(params.parentViewerUrl);
  this.levelImages = params.levelImages;
  this.sortBy = params.sortBy || _.getUrlParam('sortBy');
  this.assetManager = new AssetManager();
  this.imageSize = { width: 100, height: 100 };
  this.extraViewerUrls = params.extraViewerUrls;
  this.extraParentViewerUrls = params.extraParentViewerUrls;
}

LevelViewer.prototype.getAssetImageLink = function(assetGroup, assetInfo, assetUrl, desc) {
  var imageUrl = assetGroup.getImagePreviewUrl(assetInfo.id, -1, assetInfo);
  // TODO: Lazy loading of images
  var link = $('<a></a>').attr('href', assetUrl).append($('<img/>')
    .attr('data-src', imageUrl).attr('width', this.imageSize.width).attr('height', this.imageSize.height).addClass('lazy'));
  if (desc) {
    link.attr('title', desc);
  }
  return link;
};

LevelViewer.prototype.init = function() {
  var scope = this;
  var assetGroupsToRegister = [];
  if (this.parentAssetGroup && !(this.parentAssetGroup instanceof AssetGroup)) {
    assetGroupsToRegister.push(_.defaults(Object.create(null), this.parentAssetGroup, {
      callback: function(err, res) {
        if (res) {
          scope.parentAssetGroup = res;
        }
      }
    }));
  }
  async.series([
    function(cb) {
      if (assetGroupsToRegister.length > 0) {
        scope.assetManager.registerCustomAssetGroups({
          assetFiles: assetGroupsToRegister,
          callback: cb
        });
      } else {
        setTimeout(cb, 0);
      }
    }
  ], function(err, results) {
    if (err) {
      console.log('Error initializing', err);
      UIUtil.showAlert(null, 'Error showing annotations');
    } else {
      scope.__init();
    }
  });
};

LevelViewer.prototype.getSimpleLink = function(label, url, desc) {
  var button = $('<a></a>')
    .attr('role', 'button')
    .attr('href', url)
    .attr('title', desc);
  button.append(label);
  return button;
};

LevelViewer.prototype.getExtraLinks = function(id, urlOptions, assetInfo) {
  if (urlOptions.length > 1) {
    var div = $('<div></div>').attr('class', "dropdown");
    div.append($('<span class="dropdown-toggle" type="button" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false"></span>')
      .attr('id', id)
      .text('Actions').append('<span class="caret"></span>'));
    var list = $('<ul class="dropdown-menu"></ul>').attr('aria-labelledby', id);
    _.each(urlOptions, function(urlOption) {
      list.append($('<li></li>')
        .append($('<a></a>')
          .attr('href', urlOption.template(assetInfo))
          .attr('target', '_blank')
          .attr('title', urlOption.description)
          .text(urlOption.name)
        ));
    });
    div.append(list);
    return div;
  } else {
    var urlOption = urlOptions[0];
    var url = urlOption.template(assetInfo);
    return this.getSimpleLink(urlOption.name, url, urlOption.description).attr('id', id).attr('target', '_blank');
  }
};

LevelViewer.prototype.__init = function() {
  // See if we have extra urls
  if (this.extraViewerUrls) {
    _.each(this.extraViewerUrls, function(urlOption) {
      urlOption.template = _.template(urlOption.url);
    });
  }
  if (this.extraParentViewerUrls) {
    _.each(this.extraParentViewerUrls, function(urlOption) {
      urlOption.template = _.template(urlOption.url);
    });
  }

  // Construct a table
  var table = $('<table></table>');
  var parentAssetInfos = this.parentAssetGroup.assetDb.assetInfos;
  //console.log('parentAssetInfos', parentAssetInfos);
  if (this.sortBy === 'id') {
    parentAssetInfos = _.sortBy(parentAssetInfos, 'id');
  } else if (this.sortBy === 'nlevels') {
    parentAssetInfos = _.sortBy(parentAssetInfos, ['nlevels', 'id']);
  }
  for (var i = 0; i < parentAssetInfos.length; i++) {
    var row = $('<tr></tr>').addClass(i % 2? 'row-odd' : 'row-even');
    var parentAssetInfo = parentAssetInfos[i];

    var parentDetails = _.omit(parentAssetInfo, ['meshId', 'fullId', 'source', 'isCustomAsset']);
    if (!parentDetails.sceneType) {
      delete parentDetails.sceneType;
    }

    // Show parent cell
    var parentCell = $('<td></td>').append('<b>' + parentAssetInfo.id + '</b>').append('<br/>').addClass('cell-parent');
    parentCell
      .append(this.parentAssetGroup?
          this.getAssetImageLink(this.parentAssetGroup, parentAssetInfo, this.parentViewerUrlTemplate(parentAssetInfo))
            .attr('title', JSON.stringify(parentDetails, null, 2))
            .attr('target', '_blank')
          : $('<div></div>').text(parentAssetInfo.id).css('width', this.imageSize.width).css('height', this.imageSize.height));
    parentCell.data(parentAssetInfo.fullId);
    if (this.extraParentViewerUrls) {
      parentCell.append(this.getExtraLinks('links_' + parentAssetInfo.id, this.extraParentViewerUrls, parentAssetInfo));
    }
    row.append(parentCell);

    // Show levels
    var nlevels = parentAssetInfo.nlevels;
    for (var level = 0; level < nlevels; level++) {
      if (level > 0) {
        // Start a new row with empty cell
        row = $('<tr></tr>').addClass(i % 2? 'row-odd' : 'row-even');
        row.append($('<td></td>'));
      }

      var childCell = $('<td></td>');
      row.append(childCell);

      var t2 = $('<table></table>');
      var r2 = $('<tr></tr>');
      for (var j = 0; j < this.levelImages.length; j++) {
        var imageType = this.levelImages[j];
        var levelInfo = _.defaults({ level: level }, parentAssetInfo);
        var imageUrl = this.parentAssetGroup.getImageUrl(parentAssetInfo.id, imageType, levelInfo);
        var div = $('<td></td>').append('<br/>');
        div.append($('<img/>').attr('data-src', imageUrl).addClass('lazy'));
        div.data('assetId', parentAssetInfo.fullId + '_' + level);
        div.append('<br/>');
        if (j === 0) {
          if (this.extraViewerUrls) {
            div.append(this.getExtraLinks('links_' + parentAssetInfo.id + '_' + level, this.extraViewerUrls, levelInfo));
          }
        }
        r2.append(div);
      }
      t2.append(r2);
      childCell.append(t2);

      table.append(row);
    }

  }
  this.container.append(table);
  table.find('img.lazy').lazy({
    bind: 'event',
    visibleOnly: true,
    threshold: 50,
    parent: this.container
  });
  this.loadingElement.hide();
};

module.exports = LevelViewer;