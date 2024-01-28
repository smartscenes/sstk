// Create annotations view with groupings
var Constants = require('Constants');
var AssetGroup = require('assets/AssetGroup');
var AssetManager = require('assets/AssetManager');
var UIUtil = require('ui/UIUtil');
var async = require('async');
var _ = require('util/util');
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
 * @param [params.annotateUrl] {string} Link to go to to annotate the scan
 * @param [params.annotationsUrl=${baseUrl}/scans/segment-annotations/list] {string} Link to go to view list of annotations
 * @param [params.listAnnotationsUrl=params.annotationsUrl] {string} Link to go to get JSON list of annotations
 * @param [params.annotationConditions] {string[]} Array of annotation conditions to filter by (when querying)
 * @param [params.alignAnnotationsUrl=${baseUrl}/scans/annotations/list] {string} Link for getting list of align model annotations
 * @param [params.alignUrl=${baseUrl}/scans/annotations/scan-model-aligner] {string} Link to go to do scan model alignment
 * @param [params.alignParams] {Object} Additional parameters for scan model alignment (set to false to disable alignment button)
 * @param [params.articulateAnnotationsUrl=${baseUrl}/articulation-annotations/list] {string} Link for getting list of articulation annotations
 * @param [params.articulateUrl=${baseUrl}/motion-annotator] {string} Link to go to do motion annotation
 * @param [params.articulateParams] {Object} Additional parameters for motion annotator (set to false to disable articulate button)
 * @param [params.taskType] {string} Optional annotation task type (for filtering results)
 * @param [params.segmentType=surfaces] {string} Segmentation type to use (for statistics)
 * @param [params.nTargetAnnotations=3] {int} Number of target annotations that we want to have (once this number is reached, the button becomes green, before that, the button is yellow-gold)
 * @param [params.parentType='scan'] {string} Name of group
 * @param [params.childType='region'] {string} Name of scan in group
 * @param [params.sortBy] {string} Field to sort by
 * @param [params.showId] {boolean} Whether to show scan id
 * @constructor
 * @memberOf scannet
 */
function GroupedAnnotationsViewer(params) {
  this.groupBy = params.groupBy || 'parentId';
  this.nTargetAnnotations = params.nTargetAnnotations || 3;
  this.segmentTargetPercent = params.segmentTargetPercent || 75;
  this.segmentType = params.segmentType || 'surfaces';
  this.annotationConditions = params.annotationConditions;
  this.container = $(params.container);
  this.loadingElement = $(params.loadingMessageSelector || '#loadingMessage');
  this.assetGroup = params.assetGroup;
  this.parentAssetGroup = params.parentAssetGroup;
  // URLS
  this.viewerUrl = params.viewerUrl || Constants.baseUrl + '/model-viewer';
  this.annotateUrl = params.annotateUrl;
  this.viewerParams = params.viewerParams;
  this.parentViewerUrl = params.parentViewerUrl || this.viewerUrl;
  this.annotationsUrl = params.annotationsUrl || Constants.baseUrl + '/scans/segment-annotations/list';
  this.listAnnotationsUrl = params.listAnnotationsUrl || this.annotationsUrl;
  // Annotator settings
  this.annotationSettings = {
    // segment: {
    //   annotateUrl: params.segmentAnnotateUrl || Constants.baseUrl + '/scans/segment-annotator-single',
    //   listUrl: params.segmentAnnotationsUrl || Constants.baseUrl + '/scans/segment-annotations/list'
    // },
    alignModel: {
      annotateUrl:  params.alignUrl || Constants.baseUrl + '/scans/scan-model-aligner',
      annotateParams: params.alignParams,
      listUrl: params.alignAnnotationsUrl || Constants.baseUrl + '/scans/annotations/list',
      listParams: params.alignAnnotationParams
    },
    articulate: {
      annotateUrl: params.articulateUrl || Constants.baseUrl + '/motion-annotator',
      annotateParams: params.articulateParams,
      listUrl:  params.articulateAnnotationsUrl || Constants.baseUrl + '/articulation-annotations/list'
    },
    annotateObb: {
      annotateUrl: params.annotateObbUrl || Constants.baseUrl + '/scans/scan-obb-aligner',
      annotateParams: params.annotateObbParams,
      listUrl: params.obbAnnotationsUrl || Constants.baseUrl + '/scans/annotations/list',
      listParams: params.obbAnnotationsParams
    }
  };
  this.__groupedAnnotationsByType = {};

  // Other fields
  this.taskType = params.taskType;
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
    // viewer params have priority
    _.defaults(queryParams,
      { taskMode: 'fixup',
        startFrom: assetInfo.startFrom,
        segmentType: assetInfo.segmentType
      });
  }

  var url = viewerUrl + '?' + $.param(queryParams);
  return url;
};

GroupedAnnotationsViewer.prototype.__getUrl = function(info, url, params, infoParams) {
  if (params || infoParams) {
    var queryParams = params? (infoParams? _.clone(params) : params) : {};
    // parameters to be populated from info
    for (var key in infoParams) {
      var p = infoParams[key];
      var value = (typeof(p) === 'function')? p(info) : info[p];
      if (value != undefined) {
        queryParams[key] = value;
      }
    }
    return url + '?' + _.param(queryParams);
  } else {
    return url;
  }
};

GroupedAnnotationsViewer.prototype.getAlignModelUrl = function(assetInfo) {
  var setting = this.annotationSettings.alignModel;
  var infoParams = {
    segmentType: 'segmentType',
    segmentAnnotationId: 'alignUsing',
    startFrom: 'alignFrom'
  };
  infoParams[this.assetIdField] = 'fullId';
  var url = this.__getUrl(assetInfo, setting.annotateUrl, setting.annotateParams, infoParams);
  return url;
};

GroupedAnnotationsViewer.prototype.getArticulateUrl = function(assetInfo) {
  var setting = this.annotationSettings.articulate;
  var infoParams = {
    partAnnotationId: 'articulateUsing',
    articulateFrom: 'startFrom'
  };
  infoParams[this.assetIdField] = 'fullId';
  var url = this.__getUrl(assetInfo, setting.annotateUrl, setting.annotateParams, infoParams);
  return url;
};

GroupedAnnotationsViewer.prototype.getAnnotateObbButton = function(assetInfo) {
  var setting = this.annotationSettings.annotateObb;
  var infoParams = {
    partAnnotationId: 'articulateUsing',
    annotateObbFrom: 'startFrom'
  };
  infoParams[this.assetIdField] = 'fullId';
  var url = this.__getUrl(assetInfo, setting.annotateUrl, setting.annotateParams, infoParams);
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

GroupedAnnotationsViewer.prototype.getButtonLink = function(label, url, desc, buttonClass) {
  var button = $('<a></a>')
    .attr('class', 'btn')
    .attr('role', 'button')
    .attr('href', url)
    .attr('title', desc);
  if (buttonClass) {
    button.addClass(buttonClass);
  }
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
      var segStatsFile = _.get(scope.assetGroup, scope.segmentType + '.files.statistics') ||
        _.get(scope.assetGroup, 'statistics.' + scope.segmentType);
      if (segStatsFile) {
        scope.showOverallStatistics = true;
        scope.assetGroup.assetDb.loadAssetInfo(scope.assetGroup, segStatsFile, cb,
          { mode: 'merge', assetField: scope.segmentType + '.statistics' });
      } else {
        setTimeout(cb, 0);
      }
    },
    function(cb) {
      scope.__queryAlignModelAnnotations(function(err, anns) {
        scope.__groupedAnnotationsByType['alignModel'] = anns? _.groupBy(anns, 'itemId') : {};
        cb();
      });
    },
    function(cb) {
      scope.__queryArticulateAnnotations(function(err, anns) {
        // console.log('got articulate annotations', anns);
        scope.__groupedAnnotationsByType['articulate'] = anns? _.groupBy(anns, 'itemId') : {};
        cb();
      });
    },
    function(cb) {
      scope.__queryAnnotateObbAnnotations(function(err, anns) {
        // console.log('got align obb annotations', anns);
        scope.__groupedAnnotationsByType['annotateObb'] = anns? _.groupBy(anns, 'itemId') : {};
        cb();
      });
    },
    function(cb) {
      scope.__queryAnnotationStats(function(err, annotations) {
        if (err) {
          UIUtil.showAlert('Error fetching existing annotations');
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
      UIUtil.showAlert('Error showing annotations');
    } else {
      scope.__init();
    }
  });
};

GroupedAnnotationsViewer.prototype.__getQueryValidAnnotationsUrl = function(url, source, params) {
  var queryParams = params? _.clone(params) : {};
  _.merge(queryParams, {
    'status[$ne]': 'rejected',
    'status[$isnull]': 'true',
    'status[$conj]': 'OR',
    'format': 'json',
    'itemId[$regex]': source + '[.].*'
  });
  return url + '?' + _.param(queryParams);
};

GroupedAnnotationsViewer.prototype.__queryAnnotations = function(callback) {
  var params = {};
  if (this.annotationConditions != null) {
    params['condition[$in]'] = this.annotationConditions.join(',');
  }
  if (this.taskType != null) {
    params['type'] = this.taskType;
  }
  var queryUrl = this.__getQueryValidAnnotationsUrl(this.listAnnotationsUrl, this.assetGroup.source, params);
  _.getJSON(queryUrl, callback);
};

GroupedAnnotationsViewer.prototype.__queryAlignModelAnnotations = function(callback) {
  var setting = this.annotationSettings.alignModel;
  var params = _.defaults(setting.listParams || {}, { type: 'scan-model-align' });
  var queryUrl = this.__getQueryValidAnnotationsUrl(setting.listUrl, this.assetGroup.source, params);
  _.getJSON(queryUrl, callback);
};

GroupedAnnotationsViewer.prototype.__queryAnnotateObbAnnotations = function(callback) {
  var setting = this.annotationSettings.annotateObb;
  var params = _.defaults(setting.listParams || {}, { type: 'obb-align' });
  var queryUrl = this.__getQueryValidAnnotationsUrl(setting.listUrl, this.assetGroup.source, params);
  _.getJSON(queryUrl, callback);
};

GroupedAnnotationsViewer.prototype.__queryArticulateAnnotations = function(callback) {
  // TODO: this articulateAnnotationsUrl is for some other table, really should just use our annotations table
  var setting = this.annotationSettings.articulate;
  var queryUrl = setting.listUrl + '?format=json&full_id[$regex]=' + this.assetGroup.source + '[.].*';
  _.getJSON(queryUrl, (err, res) => {
    if (res) {
      res.forEach(x => {
        // TODO: should camel case rest
        x.itemId = x.full_id;
        delete x.full_id;
        delete x.model_id;
      });
    }
    callback(err, res);
  });
};

GroupedAnnotationsViewer.prototype.__queryAnnotationStats = function(callback) {
  // '$groupBy': 'itemId'
  var params = { extractData: 'stats' };
  if (this.annotationConditions != null) {
    params['condition[$in]'] = this.annotationConditions.join(',');
  }
  if (this.taskType != null) {
    params['type'] = this.taskType;
  }
  var queryUrl = this.__getQueryValidAnnotationsUrl(this.listAnnotationsUrl, this.assetGroup.source, params);
  _.getJSON(queryUrl, callback);
};

GroupedAnnotationsViewer.prototype.__getAnnotationsForItemId = function(annType, itemId) {
  return this.__groupedAnnotationsByType[annType][itemId];
};

GroupedAnnotationsViewer.prototype.__init = function() {
  // Construct a table
  var scope = this;
  var nTargetAnns = this.nTargetAnnotations;
  var segmentTargetPercent = this.segmentTargetPercent;
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
        var aligned = scope.__getAnnotationsForItemId('alignModel', assetInfo.fullId);
        var articulated = scope.__getAnnotationsForItemId('articulate', assetInfo.fullId);
        var hasObbAligned = scope.__getAnnotationsForItemId('annotateObb', assetInfo.fullId);

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
          nArticulated: articulated? articulated.length : 0,
          nHasObbAligned: hasObbAligned? hasObbAligned.length : 0,
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
    var groupAnnsButton = this.getButtonLink('Anns (' + nregionsAnnotated + '/' + nregions + ')',
      this.getGroupedAnnotationsUrl(parentAssetInfo), 'View annotations', 'btn-primary');
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
      var t2 = $('<table class="group-entries"></table>');
      var r2 = $('<tr></tr>');
      for (var j = 0; j < group.length; j++) {
        var groupEntry = group[j];
        var assetInfo = groupEntry.assetInfo;
        var assetDetails = { id: assetInfo.id, roomType: assetInfo.roomType };
        var assetSegmentStatistics = groupEntry.latestStatistics;
        var annotationsSummary = groupEntry.annotationsSummary;
        var nAnns = groupEntry.nAnns;
        var nAlignments = groupEntry.nAlignments;
        var nArticulateAnns = groupEntry.nArticulated;
        var nObbAnns = groupEntry.nHasObbAligned;
        var div = $('<td></td>').append('<br/>');
        // Show percent complete for asset
        var segmentTargetReached = false;
        if (assetSegmentStatistics) {
          assetDetails['stats'] = assetSegmentStatistics;
          if (assetSegmentStatistics.percentComplete != undefined) {
            div.append(assetSegmentStatistics.percentComplete.toFixed(2));
            segmentTargetReached = assetSegmentStatistics.percentComplete >= segmentTargetPercent;
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
          div.append('<br/>').append(assetDetails.id).append('<br/>');
        }
        div.append(this.getAssetImageLink(this.assetGroup, assetInfo, this.annotateUrl || this.viewerUrl)
          .attr('title', JSON.stringify(assetDetails, null, 2))
          .attr('target', '_blank')
        );
        div.append('<br/>');
        // Show buttons linking to list of annotations
        var annButtonClass = (nAnns === 0)? 'btn-warning' : (segmentTargetReached? 'btn-success' : 'btn-primary');
        var annsButton = this.getButtonLink('Anns (' + nAnns + ')', this.getAnnotationsUrl(assetInfo),
          'View annotations', annButtonClass)
          .attr('target', '_blank');
        if (annotationsSummary) {
          annsButton.attr('title', JSON.stringify(annotationsSummary, null, 2));
        }
        div.append(annsButton);

        // Show button for aligning annotation
        if (this.annotationSettings.alignModel.annotateParams !== false) {
          var btnClass = (nAlignments === 0)? (nAnns > 0? 'btn-warning' : 'btn-default' ) : (segmentTargetReached? 'btn-success' : 'btn-primary');
          var alignButton = this.getButtonLink('CAD (' + nAlignments + ')', this.getAlignModelUrl(assetInfo),
            'Align CAD models', btnClass)
            .attr('target', '_blank');
          div.append('<br/>').append(alignButton);
        }

        // Show button for motion annotation
        if (this.annotationSettings.articulate.annotateParams !== false) {
          var btnClass = (nArticulateAnns === 0)? (nAnns > 0? 'btn-warning' : 'btn-default' ) : (segmentTargetReached? 'btn-success' : 'btn-primary');
          var articulateButton = this.getButtonLink('Articulate (' + nArticulateAnns + ')',
            this.getArticulateUrl(assetInfo), 'Articulate annotated segments', btnClass)
            .attr('target', '_blank');
          div.append('<br/>').append(articulateButton);
        }

        // Show button for obb annotation
        if (this.annotationSettings.annotateObb.annotateParams !== false) {
          var btnClass = (nObbAnns === 0)? (nAnns > 0? 'btn-warning' : 'btn-default' ) : (segmentTargetReached? 'btn-success' : 'btn-primary');
          var obbButton = this.getButtonLink('OBB (' + nObbAnns + ')',
            this.getAnnotateObbButton(assetInfo), 'Annotate OBB', btnClass)
            .attr('target', '_blank');
          div.append('<br/>').append(obbButton);
        }

        if (this.annotateUrl && this.annotateUrl !== this.viewerUrl) {
          var viewButton = this.getButtonLink('View', this.getAssetUrl(assetInfo), 'View', 'btn-default')
            .attr('target', '_blank');
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