// Create annotations view with groupings
var Constants = require('Constants');
var AssetGroup = require('assets/AssetGroup');
var AssetGroups = require('assets/AssetGroups');
var AssetManager = require('assets/AssetManager');
var UIUtil = require('ui/UIUtil');
var async = require('async');
var _ = require('util');
require('jquery-lazy');

/**
 * Viewer for looking at a set of annotations grouped by some field
 * @param params
 * @param params.container Selector for container where the annotation view will be
 * @param params.assetGroup {{metadata: string, ids: string}} Asset group to view
 * @param params.viewerUrl {string} Link to go to when person clicks on the image (example: #{baseUrl}/part-annotator-single)
 * @param params.annotateFromLatest {boolean} Whether to do fixup mode and annotate from latest annotation or not
 * @param params.groupBy {string} Field to group by (example: category)
 * @param [params.viewerParams] {Object} Additional parameters for viewer
 * @param [params.task] {string} Annotation task name (used in database for storing/querying)
 * @param [params.annotationTasks] {string[]} Array of annotation task names to filter by (when querying)
 * @param [params.annotationConditions] {string[]} Array of annotation conditions to filter by (when querying)
 * @param [params.nTargetAnnotations=3] {int} Number of target annotations that we want to have (once this number is reached, the button becomes green, before that, the button is yellow-gold)
 * @constructor
 * @memberOf part-annotator
 */
function GroupedAnnotationsViewer(params) {
  this.nTargetAnnotations = params.nTargetAnnotations || 3;
  this.task = params.task;
  this.annotationTasks = params.annotationTasks;
  this.annotationConditions = params.annotationConditions;
  this.annotateFromLatest = params.annotateFromLatest;
  this.container = $(params.container);
  this.loadingElement = $(params.loadingMessageSelector || '#loadingMessage');
  this.assetGroup = params.assetGroup;
  this.groupBy = _.getUrlParam('groupBy', params.groupBy);
  this.previewImageIndex = params.previewImageIndex || -1;

//   this.baseUrl = params.baseUrl || '';
//   this.listUrl = this.baseUrl + '/part-annotations/list';
//   this.viewUrl = this.baseUrl + '/part-viewer';
//   this.annotateUrl = this.baseUrl + '/part-annotator';
// //  this.editUrl = this.baseUrl + '/annotations/edit';
//   this.previewUrl = this.baseUrl + '/annotations/preview';

  this.viewerUrl = params.viewerUrl || Constants.baseUrl + '/model-viewer';
  this.viewerParams = params.viewerParams;
  this.annotationsUrl = params.annotationsUrl || Constants.baseUrl + '/part-annotations/list';
  this.assetIdField = params.assetIdField || 'modelId';
  this.sortBy = _.getUrlParam('sortBy', params.sortBy);
  this.assetManager = new AssetManager({ previewImageIndex: this.previewImageIndex });
}

GroupedAnnotationsViewer.prototype.getAssetUrl = function(assetInfo, viewerUrl) {
  viewerUrl = viewerUrl || this.viewerUrl;
  var queryParams = this.viewerParams? _.clone(this.viewerParams) : {};
  queryParams[this.assetIdField] = assetInfo.fullId;
  queryParams['task'] = this.task;
  if (this.annotateFromLatest) {
//    var prevAnn = this.__annotatedByItemId[assetInfo.fullId];
//    if (prevAnn) {
//      var prevAnnIds = prevAnn.ids;
//      var latestAnnId = _.max(prevAnnIds);
      queryParams['taskMode'] = 'fixup';
      queryParams['startFrom'] = 'latest'; //latestAnnId;
//    }
  }
  var url = viewerUrl + '?' + $.param(queryParams);
  return url;
};

GroupedAnnotationsViewer.prototype.getAnnotationsUrl = function(assetInfo) {
  return this.annotationsUrl + '?itemId=' + assetInfo.fullId;
};

GroupedAnnotationsViewer.prototype.getGroupedAnnotationsUrl = function(assetInfo) {
  return this.annotationsUrl + '?itemId[$regex]=' + this.assetGroup.source + '.' + assetInfo.id + '.*';
};

GroupedAnnotationsViewer.prototype.getAssetImageLink = function(assetGroup, assetInfo, viewerUrl, desc) {
  //var imageUrl = this.assetManager.getImagePreviewUrl(assetInfo.source, assetInfo.id, -1, assetInfo);
  var imageUrl = assetGroup.getImagePreviewUrl(assetInfo.id, this.previewImageIndex, assetInfo);
  var assetUrl = this.getAssetUrl(assetInfo, viewerUrl);
  // TODO: Lazy loading of images
  var link = $('<a></a>').attr('href', assetUrl).append($('<img/>')
    .attr('data-src', imageUrl).attr('width', '100').attr('height', '100').addClass('lazy'));
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
  if (typeof this.assetGroup === 'string') {
    var assetGroup = AssetGroups.getAssetGroup(this.assetGroup);
    if (assetGroup) {
      this.assetGroup = assetGroup;
    } else {
      console.error('Cannot find asset group: ' + assetGroup);
    }
  }
  if (!(this.assetGroup instanceof AssetGroup)) {
    assetGroupsToRegister.push(_.defaults(Object.create(null), this.assetGroup, {
      callback: function(err, res) {
        if (res) {
          scope.assetGroup = res;
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
      scope.__queryAnnotatedStats(function(err, annotationStats) {
        if (err) {
          UIUtil.showAlert(null, 'Error fetching existing annotations');
          scope.__annotatedByItemId = {};
          cb();
        } else {
          if (scope.annotateFromLatest) {
            for (var i = 0; i < annotationStats.length; i++) {
              var s = annotationStats[i];
              var ids = s.id.split(',');
              s.ids = ids;
              s.id = ids.length;
            }
          }
          scope.__annotatedByItemId = _.keyBy(annotationStats, 'itemId');
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

GroupedAnnotationsViewer.prototype.__queryAnnotatedStats = function(callback) {
  var queryUrl = this.annotationsUrl + '?status[$ne]=rejected&status[$isnull]=true&status[$conj]=OR&$groupBy=itemId&format=json&itemId[$regex]=' + this.assetGroup.source + '.*';
  if (this.annotateFromLatest) {
    queryUrl += '&$aggr[id]=GROUP_CONCAT';
  }
  if (this.annotationTasks) {
    queryUrl += '&task[$in]=' + this.annotationTasks.join(',');
  }
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

  var groupedAssetInfos = _.groupByMulti(assetInfos, this.groupBy);
  //console.log(groupedAssetInfos);
  var stats = { counts: {}, hists: {} };
  stats.counts.totalAssets = assetInfos.length;
  stats.counts.totalAssetsAnnotated = _.size(scope.__annotatedByItemId);
  for (var groupName in groupedAssetInfos) {
    if (!groupedAssetInfos.hasOwnProperty(groupName)) continue;
    var groupInfos = groupedAssetInfos[groupName];

    //console.log(group);
    var row = $('<tr></tr>');
    var group = null;
    var nGroupAnns = 0;
    var nGroupEntries = 0;
    if (groupInfos) {
      group = _.map(groupInfos, function(assetInfo) {
        var annotatedStats = scope.__annotatedByItemId[assetInfo.fullId];
        return { assetInfo: assetInfo, nAnns: annotatedStats? annotatedStats.id : 0 };
      });
      nGroupAnns = group.filter(function(x) { return x.nAnns > 0; }).length;
      nGroupEntries = group.length;
    }

    row.append($('<td></td>')
      .append(groupName)
      .append('<br/>')
      .append(nGroupAnns + '/' + nGroupEntries)
    );
    var childCell = $('<td></td>');
    row.append(childCell);
    if (group) {
      var t2 = $('<table></table>');
      var r2 = $('<tr></tr>');
      for (var j = 0; j < group.length; j++) {
        var groupEntry = group[j];
        var assetInfo = groupEntry.assetInfo;
        var assetDetails = { id: assetInfo.id, category: assetInfo.category };
        if (assetInfo.setIds && assetInfo.setIds.length) {
          assetDetails.setIds = assetInfo.setIds;
        }
        var nAnns = groupEntry.nAnns;
        var div = $('<td></td>');
        div.append('<br/>');
        div.append(this.getAssetImageLink(this.assetGroup, assetInfo, this.viewerUrl)
          .attr('target', '_blank')
          .attr('title', JSON.stringify(assetDetails, null, 2))
        );
        div.append('<br/>');
        var annsButton = this.getButtonLink('Anns (' + nAnns + ')', this.getAnnotationsUrl(assetInfo), 'View annotations');
        annsButton.attr('target', '_blank');
        if (nAnns === 0) {
          annsButton.removeClass('btn-primary').addClass('btn-warning');
        } else if (nAnns >= nTargetAnns) {
          annsButton.removeClass('btn-primary').addClass('btn-success');
        }
        div.append(annsButton);
        r2.append(div);
      }
      t2.append(r2);
      childCell.append(t2);
    }
    table.append(row);
  }
  var c = stats.counts;
  summary.append(
      $('<span></span>').append('Annotated: '
        + c.totalAssetsAnnotated + '/' + c.totalAssets));
  this.container.append(summary);
  this.container.append(table);
  table.find('img.lazy').lazy({
    bind: 'event',
    threshold: 50,
    visibleOnly: true,
    parent: this.container
  });
  this.loadingElement.hide();
};

module.exports = GroupedAnnotationsViewer;