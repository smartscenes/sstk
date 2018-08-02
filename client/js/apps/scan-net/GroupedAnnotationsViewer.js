// Create annotations view with groupings
var Constants = require('Constants');
var AssetGroup = require('assets/AssetGroup');
var AssetManager = require('assets/AssetManager');
var UIUtil = require('ui/UIUtil');
var async = require('async');
var _ = require('util');
require('jquery-lazy');

/**
 * Viewer for looking at a set of annotations grouped by parentId
 * @param params
 * @param params.container Selector for container where the annotation view will be
 * @param params.assetGroup {{metadata: string, ids: string}} Asset group to view
 * @param params.parentAssetGroup {{metadata: string, ids: string}} Parent asset group (for grouping)
 * @param [params.groupBy=parentId] {string} Parent id field to group by
 * @param [params.assetIdField=modelId] {string} Field to use when specifying asset id in urls
 * @param [params.viewerUrl=${baseUrl}/model-viewer] {string} Link to go to when person clicks on the image
 * @param [params.viewerParams] {Object} Additional parameters for viewer
 * @param [params.parentViewerUrl=params.viewerUrl] {string} Link to go to when person clicks on the image
 * @param [params.annotationsUrl=${baseUrl}/scans/segment-annotations/list] {string} Link to go to view list of annotations
 * @param [params.annotationConditions] {string[]} Array of annotation conditions to filter by (when querying)
 * @param [params.alignAnnotationsUrl=${baseUrl}/scans/annotations/list] {string} Link for getting list of annotations
 * @param [params.alignUrl=${baseUrl}/scans/annotations/scan-model-aligner] {string} Link to go to do scan model alignment
 * @param [params.alignParams] {Object} Additional parameters for  scan model alignment
 * @param [params.segmentType=surfaces] {string} Segmentation type to use (for statistics)
 * @param [params.nTargetAnnotations=3] {int} Number of target annotations that we want to have (once this number is reached, the button becomes green, before that, the button is yellow-gold)
 * @param [params.parentType='scan'] {string} Name of group
 * @param [params.childType='region'] {string} Name of scan in group
 * @param [params.sortBy] {string} Field to sort by
 * @constructor
 * @memberOf scannet
 */
function GroupedAnnotationsViewer(params) {
  this.groupBy = params.groupBy || 'parentId';
  this.nTargetAnnotations = params.nTargetAnnotations || 3;
  this.segmentType = params.segmentType || 'surfaces';
  this.annotationConditions = params.annotationConditions;
  this.container = $(params.container);
  this.loadingElement = $(params.loadingMessageSelector || '#loadingMessage');
  this.assetGroup = params.assetGroup;
  this.parentAssetGroup = params.parentAssetGroup;
  this.viewerUrl = params.viewerUrl || Constants.baseUrl + '/model-viewer';
  this.annotateUrl = params.annotateUrl;
  this.viewerParams = params.viewerParams;
  this.parentViewerUrl = params.parentViewerUrl || this.viewerUrl;
  this.annotationsUrl = Constants.baseUrl + '/scans/segment-annotations/list';
  this.alignAnnotationsUrl = Constants.baseUrl + '/scans/annotations/list';
  this.alignUrl = params.alignUrl || Constants.baseUrl + '/scans/scan-model-aligner';
  this.alignParams = params.alignParams;
  this.assetIdField = params.assetIdField || 'modelId';
  this.showId = (params.showId != undefined)? params.showId : true;
  this.parentType = params.parentType || 'scan';
  this.childType = params.childType || 'region';
  this.sortBy = params.sortBy || _.getUrlParam('sortBy');
  this.assetManager = new AssetManager();
  this.imageSize = { width: 100, height: 100 };
}

GroupedAnnotationsViewer.prototype.getAssetUrl = function(assetInfo, viewerUrl) {
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

GroupedAnnotationsViewer.prototype.getAlignUrl = function(assetInfo) {
  var alignUrl = this.alignUrl;
  var queryParams = this.alignParams? _.clone(this.alignParams) : {};
  queryParams[this.assetIdField] = assetInfo.fullId;
  queryParams['segmentType'] = assetInfo.segmentType;
  if (assetInfo.alignUsing != undefined) {
    queryParams['segmentAnnotationId'] = assetInfo.alignUsing;
  }
  if (assetInfo.alignFrom != undefined) {
    queryParams['startFrom'] = assetInfo.alignFrom;
  }
  var url = alignUrl + '?' + $.param(queryParams);
  return url;
};

GroupedAnnotationsViewer.prototype.getAnnotationsUrl = function(assetInfo) {
  return this.annotationsUrl + '?itemId=' + assetInfo.fullId;
};

GroupedAnnotationsViewer.prototype.getGroupedAnnotationsUrl = function(assetInfo) {
  return this.annotationsUrl + '?itemId[$regex]=' + this.assetGroup.source +  '[.]' + assetInfo.id + '.*';
};

GroupedAnnotationsViewer.prototype.getAssetImageLink = function(assetGroup, assetInfo, viewerUrl, desc) {
  //var imageUrl = this.assetManager.getImagePreviewUrl(assetInfo.source, assetInfo.id, -1, assetInfo);
  var imageUrl = assetGroup.getImagePreviewUrl(assetInfo.id, -1, assetInfo);
  var assetUrl = this.getAssetUrl(assetInfo, viewerUrl);
  // TODO: Lazy loading of images
  var link = $('<a></a>').attr('href', assetUrl).append($('<img/>')
    .attr('data-src', imageUrl).attr('width', this.imageSize.width).attr('height', this.imageSize.height).addClass('lazy'));
  if (desc) {
    link.attr('title', desc);
  }
  return link;
};

GroupedAnnotationsViewer.prototype.getButtonLink = function(label, url, desc) {
  var button = $('<a></a>')
    .attr('class', 'btn btn-primary')
    .attr('role', 'button')
    .attr('href', url)
    .attr('title', desc);
  button.append(label);
  return button;
};

GroupedAnnotationsViewer.prototype.init = function() {
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
    },
    function(cb) {
      scope.__queryAlignAnnotations(function(err, alignAnnotations) {
        if (alignAnnotations) {
          scope.__alignAnnotationsByItemId = _.groupBy(alignAnnotations, 'itemId');
        } else {
          scope.__alignAnnotationsByItemId = {};
        }
        cb();
      });
    },
    function(cb) {
      scope.__queryAnnotations(function(err, annotations) {
        if (err) {
          UIUtil.showAlert(null, 'Error fetching existing annotations');
          scope.__annotatedByItemId = {};
          cb();
        } else {
          for (var i = 0; i < annotations.length; i++) {
            var ann = annotations[i];
            if (ann.data && ann.data.stats && ann.data.stats.totalVertices) {
              ann.data.stats = { total: ann.data.stats, delta: ann.data.stats };
            }
          }
          var annotationsByItemId = _.groupBy(annotations, 'itemId');
          scope.__annotatedByItemId = _.mapValues(annotationsByItemId, function(anns, itemId) {
            var fixup = _.filter(anns, function(r) { return r.taskMode === 'fixup'; });
            var raw = _.filter(anns, function(r) { return r.taskMode === 'new'; });
            var latestFixup = fixup.length? _.maxBy(fixup, 'id') : null;
            var bestRaw = raw.length? _.maxBy(raw, 'data.stats.total.percentComplete') : null;
            var res = {
              itemId: itemId,
              records: anns,
              fixup: fixup,
              raw: raw,
              latestFixup: latestFixup,
              bestRaw: bestRaw
            };
            return res;
          });
          cb();
        }
      });
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

GroupedAnnotationsViewer.prototype.__queryAnnotations = function(callback) {
  var queryUrl = this.annotationsUrl + '?status[$ne]=rejected&status[$isnull]=true&status[$conj]=OR&format=json&itemId[$regex]=' + this.assetGroup.source + '[.].*';
  if (this.annotationConditions) {
    queryUrl += '&condition[$in]=' + this.annotationConditions.join(',');
  }
  _.getJSON(queryUrl, callback);
};

GroupedAnnotationsViewer.prototype.__queryAlignAnnotations = function(callback) {
  var queryUrl = this.alignAnnotationsUrl + '?task=scan-model-align&status[$ne]=rejected&status[$isnull]=true&status[$conj]=OR&format=json&itemId[$regex]=' + this.assetGroup.source + '[.].*';
  if (this.annotationConditions) {
    queryUrl += '&condition[$in]=' + this.annotationConditions.join(',');
  }
  _.getJSON(queryUrl, callback);
};

GroupedAnnotationsViewer.prototype.__queryAnnotationStats = function(callback) {
  var queryUrl = this.annotationsUrl + '?status[$ne]=rejected&status[$isnull]=true&status[$conj]=OR&$groupBy=itemId&format=json&itemId[$regex]=' + this.assetGroup.source + '[.].*';
  if (this.annotationConditions) {
    queryUrl += '&condition[$in]=' + this.annotationConditions.join(',');
  }
  _.getJSON(queryUrl, callback);
};

GroupedAnnotationsViewer.prototype.__init = function() {
  // Construct a table
  var scope = this;
  var nTargetAnns = this.nTargetAnnotations;
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
        var annotated = scope.__annotatedByItemId[assetInfo.fullId];
        var aligned = scope.__alignAnnotationsByItemId[assetInfo.fullId];
        var aggregationStatistics = _.get(assetInfo, [segmentType, 'statistics']);
        var latestStatistics = aggregationStatistics;
        var startFrom = 'latest';
        var alignUsing;
        var alignFrom;
        var annSegmentType = segmentType;
        var summaryPercentComplete = { aggr: aggregationStatistics? aggregationStatistics.percentComplete : 0 };
        if (aligned && aligned.length) {
          var latestAlign = _.maxBy(aligned, 'id');
          alignFrom = latestAlign.id;
        }
        if (annotated && annotated.latestFixup) {
          latestStatistics = annotated.latestFixup.data.stats.total;
          alignUsing = annotated.latestFixup.id;
          annSegmentType = _.get(annotated.latestFixup, 'data.metadata.segmentType') || segmentType;
          summaryPercentComplete.latestFixup = latestStatistics.percentComplete;
        }
        if (annotated && annotated.bestRaw) {
          summaryPercentComplete.bestRaw = annotated.bestRaw.data.stats.total.percentComplete;
          if (!annotated.latestFixup && summaryPercentComplete.bestRaw > summaryPercentComplete.aggr) {
            latestStatistics = annotated.bestRaw.data.stats.total;
            startFrom = annotated.bestRaw.id;
            alignUsing = startFrom;
            annSegmentType = _.get(annotated.bestRaw, 'data.metadata.segmentType') || segmentType;
          }
        }
        return { assetInfo: assetInfo,
          nAnns: annotated? annotated.records.length : 0,
          annotations: annotated,
          nAlignments: aligned? aligned.length : 0,
          aggregationStatistics: aggregationStatistics, latestStatistics: latestStatistics, annotationsSummary: summaryPercentComplete,
          startFrom: startFrom, alignFrom: alignFrom, alignUsing: alignUsing,
          annSegmentType: annSegmentType };
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
    var groupAnnsButton = this.getButtonLink('Anns (' + nregionsAnnotated + '/' + nregions + ')',  this.getGroupedAnnotationsUrl(parentAssetInfo), 'View annotations');
    if (nregionsAnnotated === 0) {
      groupAnnsButton.removeClass('btn-primary').addClass('btn-warning');
    } else if (nregionsAnnotated === nregions) {
      groupAnnsButton.removeClass('btn-primary').addClass('btn-success');
    }
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
          : $('<div></div>').text(parentAssetInfo.id).css('width', this.imageSize.width).css('height', this.imageSize.height) )
          .attr('target', '_blank')
      .append(groupAnnsButton);
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
        assetInfo.startFrom = groupEntry.startFrom;
        assetInfo.alignFrom = groupEntry.alignFrom;
        assetInfo.alignUsing = groupEntry.alignUsing;
        assetInfo.segmentType = groupEntry.annSegmentType;
        if (this.showId) {
          div.append(assetDetails.id).append('<br/>');
        }
        div.append(this.getAssetImageLink(this.assetGroup, assetInfo, this.annotateUrl || this.viewerUrl)
          .attr('title', JSON.stringify(assetDetails, null, 2))
          .attr('target', '_blank')
        );
        div.append('<br/>');
        // Show buttons linking to list of annotations
        var annsButton = this.getButtonLink('Anns (' + nAnns + ')', this.getAnnotationsUrl(assetInfo), 'View annotations')
          .attr('target', '_blank');
        if (nAnns === 0) {
          annsButton.removeClass('btn-primary').addClass('btn-warning');
        } else if (nAnns >= nTargetAnns) {
          annsButton.removeClass('btn-primary').addClass('btn-success');
        }
        if (annotationsSummary) {
          annsButton.attr('title', JSON.stringify(annotationsSummary, null, 2));
        }
        div.append(annsButton);

        // Show button for aligning annotation
        var alignButton = this.getButtonLink('CAD (' + nAlignments + ')', this.getAlignUrl(assetInfo), 'Align CAD models')
          .attr('target','_blank');
        if (nAlignments === 0) {
          alignButton.removeClass('btn-primary').addClass('btn-warning');
        } else if (nAnns >= nTargetAnns) {
          alignButton.removeClass('btn-primary').addClass('btn-success');
        }
        div.append('<br/>').append(alignButton);

        if (this.annotateUrl && this.annotateUrl !== this.viewerUrl) {
          var viewButton = this.getButtonLink('View', this.getAssetUrl(assetInfo), 'View').attr('target', '_blank');
          viewButton.removeClass('btn-primary').addClass('btn-default');
          div.append('<br/>').append(viewButton);
        }
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

module.exports = GroupedAnnotationsViewer;