// Create annotations view with groupings
var Constants = require('Constants');
var AssetGroup = require('assets/AssetGroup');
var AssetGroups = require('assets/AssetGroups');
var AssetManager = require('assets/AssetManager');
var UIUtil = require('ui/UIUtil');
var async = require('async');
var _ = require('util/util');
require('jquery-lazy');

/**
 * Viewer for looking at a set of annotations grouped by some field
 * @param params
 * @param params.container Selector for container where the annotation view will be
 * @param params.assetGroup {{metadata: string, ids: string}} Asset group to view
 * @param [params.viewerUrl='${baseUrl}/model-viewer'] {string} Link to go to when person clicks on the image (example: #{baseUrl}/part-annotator-single)
 * @param params.annotateFromLatest {boolean} Whether to do fixup mode and annotate from latest annotation or not
 * @param params.groupBy {string} Field to group by (example: category), can be specified as url parameter.
 * @param [params.groupedSortBy] {string} Field to sort by (within a group), can be specified as url parameter.
 * @param [params.sortBy] {string} Field to sort by for groups, can be specified as url parameter.
 * @param [params.viewerParams] {Object} Additional parameters for viewer
 * @param [params.task] {string} Annotation task name (used in database for storing/querying)
 * @param [params.annotationTasks] {string[]} Array of annotation task names to filter by (when querying)
 * @param [params.annotationConditions] {string[]} Array of annotation conditions to filter by (when querying)
 * @param [params.nTargetAnnotations=3] {int} Number of target annotations that we want to have (once this number is reached, the button becomes green, before that, the button is yellow-gold)
 * @param [params.annotationsUrl='${baseUrl}/part-annotations/list'] {string} Url to fetch list of annotations
 * @param [params.annotationsSummaryUrl] {string} Url to fetch summary of annotations
 * @param [params.assetIdField='modelId'] {string} Field for looking up asset in viewerUrl
 * @param [params.annotationItemIdField='itemId'] {string} Field for looking up asset in annotations
 * @param [params.ignoreGroupRegex] {RegExp|string} Regular expression pattern of groups to ignore (can be specified as url parameter)
 * @param [params.filter] {string} Filter on what items to include (can be specified as url parameter)
 * @param [params.unannotated] {boolean} Only show what is annotated (can be specified as url parameter)
 * @param [params.previewImageIndex] {int} Which image to use
 * @param [params.imageUrlTemplates] {Map<string,template|string>} Image templates
 * @param [params.useImage] {string} Which image to use
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
  this.filter = _.getUrlParam('filter', params.filter);
  this.unannotated = _.getUrlParam('unannotated', params.unannotated);

  // What image to show
  this.previewImageIndex = params.previewImageIndex || -1;
  this.imageUrlTemplates = params.imageUrlTemplates;
  if (this.imageUrlTemplates) {
    _.templatizeCollection(this.imageUrlTemplates);
  }
  this.useImage = _.getUrlParam('image', params.useImage);

//   this.baseUrl = params.baseUrl || '';
//   this.listUrl = this.baseUrl + '/part-annotations/list';
//   this.viewUrl = this.baseUrl + '/part-viewer';
//   this.annotateUrl = this.baseUrl + '/part-annotator';
// //  this.editUrl = this.baseUrl + '/annotations/edit';
//   this.previewUrl = this.baseUrl + '/annotations/preview';

  this.viewerUrl = params.viewerUrl || Constants.baseUrl + '/model-viewer';
  this.viewerParams = params.viewerParams;
  this.annotationsUrl = params.annotationsUrl || Constants.baseUrl + '/part-annotations/list';
  this.annotationsSummaryUrl = params.annotationsSummaryUrl;
  this.assetIdField = params.assetIdField || 'modelId';
  this.annotationItemIdField = params.annotationItemIdField || 'itemId';
  this.groupedSortBy = _.getUrlParam('groupedSortBy', params.groupedSortBy, _.parseSortBy);
  this.sortBy = _.getUrlParam('sortBy', params.sortBy, _.parseSortBy);
  this.assetManager = new AssetManager({ previewImageIndex: this.previewImageIndex });
  this.ignoreGroupRegex = _.getUrlParam('ignoreGroupRegex', params.ignoreGroupRegex, _.parseRegex);
  this.onHoverCallback = params.onHoverCallback;
  this.annotationSettings = {
    // segment: {
    //   annotateUrl: params.segmentAnnotateUrl || Constants.baseUrl + '/part-annotator-single'
    //   listUrl: params.segmentAnnotationsUrl || Constants.baseUrl + '/part-annotations/list'
    // },
    articulate: {
      annotateUrl: params.articulateUrl || Constants.baseUrl + '/motion-annotator',
      annotateParams: params.articulateParams,
      listUrl:  params.articulateAnnotationsUrl || Constants.baseUrl + '/articulation-annotations/list'
    }
  };
  this.__groupedAnnotationsByType = {};

  window.addEventListener('resize', this.onWindowResize.bind(this), false);
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

GroupedAnnotationsViewer.prototype.getAnnotationsUrl = function(assetInfo) {
  return this.annotationsUrl + '?' + this.annotationItemIdField + '=' + assetInfo.fullId;
};

GroupedAnnotationsViewer.prototype.getGroupedAnnotationsUrl = function(assetInfo) {
  return this.annotationsUrl + '?' + this.annotationItemIdField + '[$regex]=' + this.assetGroup.source + '.' + assetInfo.id + '.*';
};

function getCachedImageUrl(assetInfo, key, getImageUrlFn) {
  assetInfo.__cachedImageUrls = assetInfo.__cachedImageUrls || {};
  var imageUrl = assetInfo.__cachedImageUrls[key];
  if (!imageUrl) {
    imageUrl = getImageUrlFn(assetInfo, key);
    assetInfo.__cachedImageUrls[key] = imageUrl;
  }
  return imageUrl;
}

GroupedAnnotationsViewer.prototype.getAssetImageLink = function(assetGroup, assetInfo, viewerUrl, desc) {
  //var imageUrl = this.assetManager.getImagePreviewUrl(assetInfo.source, assetInfo.id, -1, assetInfo);
  var imageUrl;
  var scope = this;
  if (this.useImage && this.imageUrlTemplates && this.imageUrlTemplates[this.useImage]) {
    //imageUrl = this.imageUrlTemplates[this.useImage](assetInfo);
    imageUrl = getCachedImageUrl(assetInfo, this.useImage, function(info, key) {
      return scope.imageUrlTemplates[key](info);
    });
  } else {
    //imageUrl = assetGroup.getImagePreviewUrl(assetInfo.id, this.previewImageIndex, assetInfo);
    imageUrl = getCachedImageUrl(assetInfo, this.previewImageIndex, function(info, key) {
      return assetGroup.getImagePreviewUrl(info.id, key, info);
    });
  }
  var assetUrl = this.getAssetUrl(assetInfo, viewerUrl);
  var link = $('<a></a>').attr('href', assetUrl).append($('<img/>')
    .attr('data-src', imageUrl).attr('width', '100').attr('height', '100')
    .addClass('lazy').addClass('preview'));
  if (desc) {
    link.attr('title', desc);
  }
  if (this.onHoverCallback) {
    var cb = this.onHoverCallback;
    link.hover(function(e) {
      cb(assetInfo, true, e);
    }, function(e) {
      cb(assetInfo, false, e);
    });
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
  var annotationItemIdField = this.annotationItemIdField;
  async.parallel([
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
      scope.__queryArticulateAnnotations(function(err, anns) {
        // console.log('got articulate annotations', anns);
        scope.__groupedAnnotationsByType['articulate'] = anns? _.groupBy(anns, 'itemId') : {};
        cb();
      });
    },
    function(cb) {
      scope.__queryAnnotatedStats(function(err, annotationStats) {
        if (err) {
          UIUtil.showAlert('Error fetching existing annotations');
          scope.__annotatedByItemId = {};
          cb();
        } else {
          scope.__annotatedByItemId = _.keyBy(annotationStats, annotationItemIdField);
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

GroupedAnnotationsViewer.prototype.__queryAnnotatedStats = function(callback) {
  var queryUrl = this.annotationsSummaryUrl? (this.annotationsSummaryUrl + '?') : (this.annotationsUrl
      + '?$groupBy=' + this.annotationItemIdField + '&format=json&');
  queryUrl = queryUrl + 'status[$ne]=rejected&status[$isnull]=true&status[$conj]=OR&' + this.annotationItemIdField + '[$like]=' + this.assetGroup.source + '.%';
  if (!this.annotationsSummaryUrl && this.annotateFromLatest) {
    queryUrl += '&$aggr[id]=GROUP_CONCAT';
  }
  if (this.annotationTasks) {
    queryUrl += '&task[$in]=' + this.annotationTasks.join(',');
  }
  if (this.annotationConditions) {
    queryUrl += '&condition[$in]=' + this.annotationConditions.join(',');
  }

  var scope = this;
  _.getJSON(queryUrl, function(err, annotationStats) {
    // Populate nentries
    if (annotationStats) {
      if (scope.annotationsSummaryUrl) {
        for (var i = 0; i < annotationStats.length; i++) {
          var s = annotationStats[i];
          s.ids = s.ids.split(',');
          s.nentries = s.ids.length;
        }
      } else {
        if (scope.annotateFromLatest) {
          for (var i = 0; i < annotationStats.length; i++) {
            var s = annotationStats[i];
            if (s.id != null && s.id.split) {
              var ids = s.id.split(',');
              s.ids = ids;
              s.nentries = ids.length;
            } else {
              s.nentries = 1;
              delete s.id;
            }
          }
        } else {
          for (var i = 0; i < annotationStats.length; i++) {
            var s = annotationStats[i];
            s.nentries = 1;
            delete s.id;
          }
        }
      }
    }

    callback(err, annotationStats);
  });
};

GroupedAnnotationsViewer.prototype.__getAnnotationsForItemId = function(annType, itemId) {
  return this.__groupedAnnotationsByType[annType][itemId];
};

GroupedAnnotationsViewer.prototype.__init = function() {
  // Construct a table
  var scope = this;
  var nTargetAnns = this.nTargetAnnotations;
  var summary = $('<div></div>');
  var table = $('<table></table>');
  var assetInfos = this.filter? this.assetGroup.assetDb.getMatching(
    this.assetGroup.assetDb.getFilter(this.filter)).docs : this.assetGroup.assetDb.assetInfos;
  var annotatedAssetInfos = assetInfos.filter(assetInfo => scope.__annotatedByItemId[assetInfo.fullId]);

  var groupedAssetInfos = _.groupByMulti(assetInfos, this.groupBy);

  //console.log(groupedAssetInfos);
  var stats = { counts: {}, hists: {} };
  stats.counts.totalAssets = assetInfos.length;
  stats.counts.totalAssetsAnnotated = _.size(annotatedAssetInfos);

  var sortedGroups = [];
  for (var groupName in groupedAssetInfos) {
    if (!groupedAssetInfos.hasOwnProperty(groupName)) continue;
    if (this.ignoreGroupRegex != null && this.ignoreGroupRegex.test(groupName)) {
      continue;
    }
    var groupInfos = groupedAssetInfos[groupName];

    //console.log(group);
    var group = null;
    var nGroupAnns = 0;
    var nGroupEntries = 0;
    if (groupInfos) {
      group = _.map(groupInfos, function(assetInfo) {
        var annotatedStats = scope.__annotatedByItemId[assetInfo.fullId];
        var articulated = scope.__getAnnotationsForItemId('articulate', assetInfo.fullId);
        return {
          assetInfo: assetInfo,
          nAnns: annotatedStats? annotatedStats.nentries : 0,
          progress: annotatedStats? annotatedStats.progress : null,
          nArticulated: articulated? articulated.length : 0,
        };
      });
      if (this.unannotated) {
        group = group.filter(function(x) { return x.nAnns === 0; });
      } else if (this.unannotated === false) {
        group = group.filter(function(x) { return x.nAnns > 0; });
      }

      if (this.groupedSortBy) {
        if (this.groupedSortBy.fieldname == 'progress') {
          group = _.orderBy(group, 'progress', this.groupedSortBy.order);
        } else {
          var groupedSortBy = this.groupedSortBy;
          group = _.orderBy(group, function(x) { return x.assetInfo[groupedSortBy.fieldname]; }, this.groupedSortBy.order);
        }
      }

      nGroupAnns = group.filter(function(x) { return x.nAnns > 0; }).length;
      nGroupEntries = group.length;
      sortedGroups.push( { name: groupName, group: group, nGroupAnns: nGroupAnns, nGroupEntries: nGroupEntries })
    }
  }
  if (this.sortBy) {
    if (this.sortBy.fieldname === 'name') {
      sortedGroups = _.orderBy(sortedGroups, 'name', this.sortBy.order);
    } else if (this.sortBy.fieldname  === 'nentries') {
      sortedGroups = _.orderBy(sortedGroups, 'nGroupEntries', this.sortBy.order);
    } else if (this.sortBy.fieldname  === 'nannotated') {
      sortedGroups = _.orderBy(sortedGroups, 'nGroupAnns', this.sortBy.order);
    } else {
      console.warn('Ignoring unsupported sortBy ' + this.sortBy.fieldname );
    }
  }

  for (var i = 0; i < sortedGroups.length; i++) {
    var g = sortedGroups[i];
    var group = g.group;
    var groupName = g.name;

    if (group && group.length) {
      var row = $('<tr></tr>');
      row.append($('<td></td>')
        .append(groupName)
        .append('<br/>')
        .append(g.nGroupAnns + '/' + g.nGroupEntries)
      );
      var childCell = $('<td></td>');
      row.append(childCell);

      var t2 = $('<table class="group-entries"></table>');
      var r2 = $('<tr></tr>');
      for (var j = 0; j < group.length; j++) {
        var groupEntry = group[j];
        var assetInfo = groupEntry.assetInfo;
        var assetDetails = { id: assetInfo.id, category: assetInfo.category };
        if (assetInfo.setIds && assetInfo.setIds.length) {
          assetDetails.setIds = assetInfo.setIds;
        }
        var nAnns = groupEntry.nAnns;
        var nArticulateAnns = groupEntry.nArticulated;
        var div = $('<td></td>');
        div.append(assetInfo.id);
        div.append('<br/>');
        if (groupEntry.progress != null) {
          div.append(groupEntry.progress);
          div.append('<br/>');
        }
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

        // Show button for motion annotation
        if (this.annotationSettings.articulate.annotateParams !== false) {
          var btnClass = (nArticulateAnns === 0)? (nAnns > 0? 'btn-warning' : 'btn-default' ) : ((nAnns >= nTargetAnns)? 'btn-success' : 'btn-primary');
          var articulateButton = this.getButtonLink('Articulate (' + nArticulateAnns + ')',
            this.getArticulateUrl(assetInfo), 'Articulate annotated segments', btnClass)
            .attr('target', '_blank');
          div.append('<br/>').append(articulateButton);
        }

        r2.append(div);
      }
      t2.append(r2);
      childCell.append(t2);

      table.append(row);
    }
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

GroupedAnnotationsViewer.prototype.onWindowResize = function () {
};

module.exports = GroupedAnnotationsViewer;