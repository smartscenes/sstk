// Create annotations view with groupings
var Constants = require('Constants');
var AssetGroup = require('assets/AssetGroup');
var AssetManager = require('assets/AssetManager');
var UIUtil = require('ui/UIUtil');
var async = require('async');
var _ = require('util/util');
require('jquery-lazy');

/**
 * Viewer for looking at a set of assets grouped by parentId
 * @param params
 * @param params.container Selector for container where the annotation view will be
 * @param params.assetGroup {{metadata: string, ids: string}} Asset group to view
 * @param params.parentAssetGroup {{metadata: string, ids: string}} Parent asset group (for grouping)
 * @param [params.groupBy=parentId] {string} Parent id field to group by
 * @param [params.assetIdField=modelId] {string} Field to use when specifying asset id in urls
 * @param [params.viewerUrl=${baseUrl}/model-viewer] {string} Link to go to when person clicks on the image
 * @param [params.viewerParams] {Object} Additional parameters for viewer
 * @param [params.parentViewerUrl=params.viewerUrl] {string} Link to go to when person clicks on the image
 * @param [params.segmentType=surfaces] {string} Segmentation type to use (for statistics)
 * @param [params.parentType='scan'] {string} Name of group
 * @param [params.childType='region'] {string} Name of scan in group
 * @param [params.sortBy] {string} Field to sort by
 * @constructor
 * @memberOf scannet
 */
function GroupedViewer(params) {
  this.groupBy = _.getUrlParam('groupBy', params.groupBy || 'parentId');
  this.segmentType = params.segmentType || 'surfaces';
  this.container = $(params.container);
  this.loadingElement = $(params.loadingMessageSelector || '#loadingMessage');
  this.assetGroup = params.assetGroup;
  this.parentAssetGroup = params.parentAssetGroup;
  this.viewerUrl = params.viewerUrl || Constants.baseUrl + '/model-viewer';
  this.viewerParams = params.viewerParams;
  this.parentViewerUrl = params.parentViewerUrl || this.viewerUrl;
  this.assetIdField = params.assetIdField || 'modelId';
  this.parentType = params.parentType || 'scan';
  this.childType = params.childType || 'region';
  this.sortBy = params.sortBy || _.getUrlParam('sortBy');
  this.showId = (params.showId != undefined)? params.showId : true;
  this.assetManager = new AssetManager();
  this.imageSize = { width: 100, height: 100 };
  this.extraViewerUrls = params.extraViewerUrls;
  this.extraParentViewerUrls = params.extraParentViewerUrls;
}

GroupedViewer.prototype.getAssetUrl = function(assetInfo, viewerUrl) {
  viewerUrl = viewerUrl || this.viewerUrl;
  var queryParams = this.viewerParams? _.clone(this.viewerParams) : {};
  queryParams[this.assetIdField] = assetInfo.fullId;
  if (assetInfo.startFrom) {
    queryParams['taskMode'] = 'fixup';
    queryParams['startFrom'] = assetInfo.startFrom;
    queryParams['segmentType'] = assetInfo.segmentType;
  }
  var url = viewerUrl + '?' + $.param(queryParams);
  return url;
};

GroupedViewer.prototype.getAssetImageLink = function(assetGroup, assetInfo, viewerUrl, desc) {
  //var imageUrl = this.assetManager.getImagePreviewUrl(assetInfo.source, assetInfo.id, -1, assetInfo);
  var imageUrl = assetGroup.getImagePreviewUrl(assetInfo.id, -1, assetInfo);
  var assetUrl = this.getAssetUrl(assetInfo, viewerUrl);
  var link = $('<a></a>').attr('href', assetUrl).append($('<img/>')
    .attr('data-src', imageUrl).attr('width', this.imageSize.width).attr('height', this.imageSize.height).addClass('lazy'));
  if (desc) {
    link.attr('title', desc);
  }
  return link;
};

GroupedViewer.prototype.getButtonLink = function(label, url, desc) {
  var button = $('<a></a>')
    .attr('class', 'btn btn-primary')
    .attr('role', 'button')
    .attr('href', url)
    .attr('title', desc);
  button.append(label);
  return button;
};

GroupedViewer.prototype.init = function() {
  var scope = this;
  var assetGroupsToRegister = [];
  if (!(this.assetGroup instanceof AssetGroup)) {
    assetGroupsToRegister.push(_.defaults(Object.create(null), this.assetGroup, {
      callback: function(err, res) {
        if (res) {
          scope.assetGroup = res;
        }
      }
    }));
  }
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
    },
    function(cb) {
      // Load annotated statistics
      var segStatsFile = _.get(scope.assetGroup, scope.segmentType + '.files.statistics');
      if (segStatsFile) {
        scope.showOverallStatistics = true;
        scope.assetGroup.assetDb.loadAssetInfo(scope.assetGroup, segStatsFile, cb,
          { mode: 'merge', assetField: scope.segmentType + '.statistics' });
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

GroupedViewer.prototype.getSimpleLink = function(label, url, desc) {
  var button = $('<a></a>')
    .attr('role', 'button')
    .attr('href', url)
    .attr('title', desc);
  button.append(label);
  return button;
};

GroupedViewer.prototype.getExtraLinks = function(id, urlOptions, assetInfo) {
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

GroupedViewer.prototype.__init = function() {
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
  var scope = this;
  var summary = $('<div></div>');
  var table = $('<table></table>');
  var assetInfos = this.assetGroup.assetDb.assetInfos;
  var groupedAssetInfos = _.groupBy(assetInfos, this.groupBy);
  _.each(groupedAssetInfos, function(grouped, k) {
    groupedAssetInfos[k] = _.sortBy(grouped, 'id');
  });
  var parentAssetInfos = this.parentAssetGroup?
    this.parentAssetGroup.assetDb.assetInfos : _.map(groupedAssetInfos, function(g, parentId) {
      return { id: parentId };
    });
  //console.log('parentAssetInfos', parentAssetInfos);
  if (this.sortBy === 'id') {
    parentAssetInfos = _.sortBy(parentAssetInfos, 'id');
  } else if (this.sortBy === 'nregions') {
    parentAssetInfos = _.sortBy(parentAssetInfos, [function(p) {
      var group = groupedAssetInfos[p.id];
      return group? group.length : 0;
    }, 'id']);
  }
  var stats = { counts: {}, hists: {} };
  stats.counts.totalAssets = assetInfos.length;
  stats.counts.totalParents = parentAssetInfos.length;
  stats.counts.totalParentsNoRegions = 0;
  stats.counts.totalParentsWithRegions = 0;
  stats.counts.totalAssetsAnnotated = 0;
  stats.counts.totalParentsAnnotated = 0;
  stats.counts.totalParentsWithRegionsAnnotated = 0;
  stats.counts.totalVertices = 0;
  stats.counts.totalAnnotatedVertices = 0;
  stats.hists.nregions = {};
  stats.hists.nregionsAnnotated = {};
  for (var i = 0; i < parentAssetInfos.length; i++) {
    var row = $('<tr></tr>').addClass(i % 2? 'row-odd' : 'row-even');
    var parentAssetInfo = parentAssetInfos[i];
    var groupInfos = groupedAssetInfos[parentAssetInfo.id];
    var group = null;
    var segmentType = this.segmentType;
    if (groupInfos) {
      group = _.map(groupInfos, function(assetInfo) {
        var aggregationStatistics = _.get(assetInfo, [segmentType, 'statistics']);
        var summaryPercentComplete = { aggr: aggregationStatistics? aggregationStatistics.percentComplete : 0 };
        return { assetInfo: assetInfo,
          aggregationStatistics: aggregationStatistics, latestStatistics: aggregationStatistics, annotationsSummary: summaryPercentComplete
        };
      });
      var totalPercentComplete = 0;
      var totalVertices = 0;
      var totalAnnotatedVertices = 0;
      for (var j = 0; j < group.length; j++) {
        var assetSegmentStatistics = group[j].latestStatistics;
        if (assetSegmentStatistics) {
          totalPercentComplete += assetSegmentStatistics.percentComplete;
          totalVertices += assetSegmentStatistics.totalVertices;
          totalAnnotatedVertices += assetSegmentStatistics.annotatedVertices;
        }
      }
      stats.counts.totalVertices += totalVertices;
      stats.counts.totalAnnotatedVertices += totalAnnotatedVertices;
      parentAssetInfo.stats = {
        percentComplete: 100*totalAnnotatedVertices / totalVertices,
        averagePercentComplete: totalPercentComplete/group.length
      };
    }

    var nregions = group? group.length : 0;
    var nregionsAnnotated = group? _.sumBy(group, function(g) { return g.nAnns > 0? 1 : 0; }) : 0;
    stats.hists.nregions[nregions] = 1 + (stats.hists.nregions[nregions] || 0);
    stats.hists.nregionsAnnotated[nregionsAnnotated] = 1 + (stats.hists.nregionsAnnotated[nregionsAnnotated] || 0);
    stats.counts.totalParentsNoRegions += (nregions)? 0 : 1;
    stats.counts.totalParentsWithRegions += (nregions)? 1 : 0;
    stats.counts.totalAssetsAnnotated += nregionsAnnotated;
    stats.counts.totalParentsAnnotated += (nregionsAnnotated === nregions)? 1 : 0;
    stats.counts.totalParentsWithRegionsAnnotated += (nregions && nregionsAnnotated === nregions)? 1 : 0;
    var parentDetails = _.merge({ nregions: nregions }, _.omit(parentAssetInfo, ['meshId', 'fullId', 'source', 'isCustomAsset']));
    if (!parentDetails.sceneType) {
      delete parentDetails.sceneType;
    }

    // Show parent cell
    var parentCell = $('<td></td>').append('<b>' + parentAssetInfo.id + '</b>').append('<br/>').addClass('cell-parent');
    if (scope.showOverallStatistics && parentAssetInfo.stats) {
      parentCell
        .append(parentAssetInfo.stats.averagePercentComplete.toFixed(2) + '/' + parentAssetInfo.stats.percentComplete.toFixed(2))
        .append('<br/>');
    }
    parentCell
      .append(this.parentAssetGroup?
          this.getAssetImageLink(this.parentAssetGroup, parentAssetInfo, this.parentViewerUrl)
            .attr('title', JSON.stringify(parentDetails, null, 2))
            .attr('target', '_blank')
          : $('<div></div>').text(parentAssetInfo.id).css('width', this.imageSize.width).css('height', this.imageSize.height));
    parentCell.data(parentAssetInfo.fullId);
    if (this.extraParentViewerUrls) {
      parentCell.append(this.getExtraLinks('links_' + parentAssetInfo.id, this.extraParentViewerUrls, parentAssetInfo));
    }
    row.append(parentCell);
    // Show child assets
    var childCell = $('<td></td>');
    row.append(childCell);
    if (group) {
      var t2 = $('<table></table>');
      var r2 = $('<tr></tr>');
      for (var j = 0; j < group.length; j++) {
        var groupEntry = group[j];
        var assetInfo = groupEntry.assetInfo;
        var assetDetails = { id: assetInfo.id, roomType: assetInfo.roomType };
        var assetSegmentStatistics = groupEntry.latestStatistics;
        var annotationsSummary = groupEntry.annotationsSummary;
        var nAnns = groupEntry.nAnns;
        var nAlignments = groupEntry.nAlignments;
        var div = $('<td></td>').append('<br/>');
        // Show percent complete for asset
        if (assetSegmentStatistics) {
          assetDetails['stats'] = assetSegmentStatistics;
          if (assetSegmentStatistics.percentComplete != undefined) {
            div.append(assetSegmentStatistics.percentComplete.toFixed(2));
          }
        }
        if (scope.showOverallStatistics && parentAssetInfo.stats) {
          div.append('<br/>');
        }
        // Show preview of scan
        assetInfo.segmentType = groupEntry.segmentType;
        if (this.showId) {
          div.append(assetDetails.id).append('<br/>');
        }
        div.append(this.getAssetImageLink(this.assetGroup, assetInfo, this.viewerUrl)
          .attr('title', JSON.stringify(assetDetails, null, 2))
          .attr('target', '_blank')
        );
        div.data('assetId', assetInfo.fullId);
        if (this.extraViewerUrls) {
          div.append(this.getExtraLinks('links_' + assetInfo.id, this.extraViewerUrls, assetInfo));
        }
        div.append('<br/>');
        r2.append(div);
      }
      t2.append(r2);
      childCell.append(t2);
    }
    table.append(row);
  }
  var c = stats.counts;
  summary.append(
    $('<span></span>').append('Annotated ' + this.parentType + ': '
      + c.totalParentsWithRegionsAnnotated+ '/' + c.totalParentsWithRegions
      + ', ' + this.parentType + ' without ' + this.childType + ' ' + c.totalParentsNoRegions
      + ', annotated ' + this.childType + ': ' + c.totalAssetsAnnotated + '/' + c.totalAssets
      + ', percent complete: ' + (100*c.totalAnnotatedVertices/c.totalVertices).toFixed(2)));
  this.container.append(summary);
  this.container.append(table);
  table.find('img.lazy').lazy({
    bind: 'event',
    visibleOnly: true,
    threshold: 50,
    parent: this.container
  });
  this.loadingElement.hide();
};

module.exports = GroupedViewer;