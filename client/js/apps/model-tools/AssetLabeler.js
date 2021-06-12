'use strict';

var Constants = require('lib/Constants');
var AssetGroup = require('assets/AssetGroup');
var AssetGroups = require('assets/AssetGroups');
var AssetLoader = require('assets/AssetLoader');
var AssetManager = require('assets/AssetManager');
var SearchController = require('search/SearchController');
var LabelsPreviewPanel = require('ui/LabelsPreviewPanel');
var CustomListLabelsPreviewPanel = require('ui/CustomListLabelsPreviewPanel');
var LabelCountsPanel = require('ui/LabelCountsPanel');
var _ = require('util/util');
require('dragscrollable');
require('jquery-lazy');

/**
 * Interface for labeling assets
 * @param options
 * @param [options.gridWidth] {int}
 * @param [options.viewerWindowName] {string}
 * @param [options.labelField] {string}
 * @param [options.labelsPanel] Options for the labelsPanel
 * @param [options.searchPanel] Options for the searchPanel
 * @param [options.assetGroups]
 * @param [options.suggestedLabels] {string[]} Labels for autocomplete
 * @param [options.source] {string}
 * @param [options.sources] {string[]}
 * @param [options.submitLabelsUrl] {string}
 * @param [options.viewerUrl] {string}
 * @param [options.viewerIframe]
 * @param [options.viewerModal]
 * @memberOf model-tools
 * @constructor
 */
function AssetLabeler(options) {
  // Keep our own copy of labels
  // labels are stored as map:
  //   fullId -> { cat1: 'del', cat2: 'add', cat3: '', ...}
  this.assetLabels = {};
  this.metadataCache = {};
  var defaults = {
    gridWidth: 100,
    viewerWindowName: 'Asset Viewer',
    labelField: 'category',
    labelsPanel: {
      container: '#labelsPanel'
    },
    searchPanel: {
      container: '#searchPanel',
      entriesPerRow: 6,
      nRows: 80
    }
  };
  options = _.defaultsDeep(Object.create(null), options, defaults);
  this.submitDirect = true;
  this.gridWidth = options.gridWidth;
  this.submitLabelsUrl = options.submitLabelsUrl;
  this.viewerUrl = options.viewerUrl;
  this.viewerIframe = options.viewerIframe;
  this.viewerModal = options.viewerModal;
  this.viewerWindowName = options.viewerWindowName;
  this.labelField = options.labelField;
  this.source = options.source;
  this.suggestedLabels = options.suggestedLabels;
  this.init(options);
}

AssetLabeler.prototype.init = function (options) {
  this.assetLoader = new AssetLoader();
  this.assetManager = new AssetManager();

  console.log(options);
  var scope = this;
  if (options.assetGroups) {
    var sources = [];
    for (var i = 0; i < options.assetGroups.length; i++) {
      AssetGroups.registerAssetGroup(new AssetGroup(options.assetGroups[i]));
      sources.push(options.assetGroups[i].name);
    }
    console.log(sources);
    if (!options.sources) {
      options.sources = sources;
    }
    this.submitLabelsUrl = options.assetGroups[0].updateUrl;
  }
  // Main search panel where assets are displayed
  // Assets are displayed in a grid, each asset has:
  // - Checkbox (clicking on asset checks/unchecks)
  // - labels associated with asset
  //    (listed at top - yellow = no change, green = added, red = deleted)
  this.searchPanel = $(options.searchPanel.container);
  this.searchController = new SearchController({
    searchSucceededCallback: this.searchSucceeded.bind(this),
    getImagePreviewUrlCallback: this.assetManager.getImagePreviewUrl.bind(this.assetManager),
    sourceChangedCallback: this.updateLabelsPanel.bind(this),
    onClickResultCallback: function (source, id) {
      var checkBox = $('#check_' + source + '_' + id + '_search');
      var checked = checkBox.prop('checked');
      checkBox.prop('checked', !checked);
      scope.updateNumberChecked();
    },
    appendResultElemCallback: function (source, id, result, elem) {
      var fullId = AssetManager.toFullId(source, id);
      elem.data('fullId', fullId);
      if (scope.isOnCustomModelList(fullId)) {
        elem.addClass('searchResultSelected');
      }
      elem.append($('<input/>').attr('type', 'checkbox')
        .attr('class', 'assetCheckbox')
        .attr('id', 'check_' + source + '_' + id + '_search')
        .attr('data-id', fullId)
        .click(function (e) {
          scope.updateNumberChecked();
          e.stopPropagation();
        })
      );
      var labelTags = $('<div></div>')
        .attr('class', 'searchResultLabels')
        .attr('id', 'labels_' + source + '_' + id)
        .attr('data-id', fullId);
      scope.metadataCache[fullId] = result;
      scope.cacheLabels(result[scope.labelField], fullId);
      if (scope.customAssetListPanel) {
        scope.addCustomListLabelsToCached(fullId, scope.customAssetListPanel.getIdToLabels());
      }
      scope.updateLabelTags(labelTags, source, id);
      elem.prepend(labelTags);
      elem.dblclick(scope.showAsset.bind(scope, fullId));
    },
    sources: options.sources,
    entriesPerRow: options.searchPanel.entriesPerRow,
    nRows: options.searchPanel.nRows,
    searchPanel: this.searchPanel,
    loadImagesLazy: true,
    encodeQuery: false,
    boostFields: []
  });

  if (this.source !== this.searchController.source) {
    this.source = this.searchController.source;
  }
  this.searchController.Subscribe('ClearResult', this, function() {
    this.metadataCache = {};
  });

  this.labelsPreviewPanel = new LabelsPreviewPanel({
    container: '#previewPane',
    gridWidth: 100,
    createLabelTag: function(fullId, label, update) {
      var sid = AssetManager.toSourceId(null, fullId);
      return scope.createLabelTag(sid.source, sid.id, label, update);
    },
    createAssetElement: function(panelTag, fullId) {
      return scope.createAssetElem(panelTag, fullId);
    }
  });

  // Hook up select all checkbox
  this.selectAll = $('#selectAll');
  this.selectAll.click(
    this.toggleChecked.bind(this)
  );
  this.numCheckedMsg = $('#numCheckedMsg');
  this.updateNumberChecked();

  // At side: panel to add/remove labels for the checked set of assets
  // Label text
  this.labelText = $('#label');
  if (this.suggestedLabels) {
    this.labelText.autocomplete({
      source: _.uniq(this.suggestedLabels)
    });
  }

  // Hook up add and remove buttons
  var addButton = $('#buttonAdd');
  addButton.click(this.addLabels.bind(this));

  var removeButton = $('#buttonRemove');
  removeButton.click(this.removeLabels.bind(this));

  // Preview shows current changes
  // Hook up clear and submit buttons
  var clearButton = $('#clear');
  clearButton.click(this.clearChanges.bind(this));

  // Submits changes to labels to backend
  var submitButton = $('#submit');
  submitButton.click(this.submitLabels.bind(this));

  // Show labels
  this.labelsPanel = new LabelCountsPanel({
    container: options.labelsPanel.container,
    searchController: this.searchController,
    labelName: this.labelField
  });
  this.labelsPanel.Subscribe('LabelsUpdated', this, function(labels) {
    scope.updateAutocompleteLabels(labels);
  });
  this.updateLabelsPanel();

  // Hook up selected panel elements
  this.customAssetListPanel = new CustomListLabelsPreviewPanel({
    container: '#selectedPane',
    gridWidth: 100,
    createLabelTag: function(fullId, label, update) {
      var sid = AssetManager.toSourceId(null, fullId);
      return scope.createLabelTag(sid.source, sid.id, label, update);
    },
    createAssetElement: function(panelTag, fullId) {
      return scope.createAssetElem(panelTag, fullId);
    },
    getChecked: function() {
      return scope.getCheckedLabelMods();
    },
    onLoaded: function(assetIdToMods) {
      scope.fetchAssetLabels(Object.keys(assetIdToMods), assetIdToMods);
    }
  });

  var newImagesCheckbox = $('#newImages');
  if (newImagesCheckbox && newImagesCheckbox.length > 0) {
    var imageIndexElem = $('#imageIndex');
    for (var i = 0; i < 14; i++) {
      imageIndexElem.append('<option value="' + i + '">' + i + '</option>');
    }
    imageIndexElem.val('13');
    var selectImagePreviewFunc = function () {
      var checked = newImagesCheckbox.prop('checked');
      if (checked) {
        this.assetManager.previewImageIndex = imageIndexElem.val();
        imageIndexElem.show();
      } else {
        this.assetManager.previewImageIndex = -1;
        imageIndexElem.hide();
      }
      this.searchController.updatePreviewImages(this.assetManager.previewImageIndex);
    }.bind(this);
    newImagesCheckbox.change(selectImagePreviewFunc);
    imageIndexElem.change(selectImagePreviewFunc);
    selectImagePreviewFunc();
  }

  var initialQuery = _.getUrlParam('query');
  if (initialQuery) {
    this.searchController.setSearchText(initialQuery);
    this.searchController.startSearch();
  }
  // Resize
  window.addEventListener('resize', this.onWindowResize.bind(this), false);
};

AssetLabeler.prototype.updateAutocompleteLabels = function (labels) {
  var allLabels = [];
  if (this.suggestedLabels) {
    allLabels = allLabels.concat(this.suggestedLabels);
  }
  if (labels) {
    allLabels.concat(labels);
  }
  this.labelText.autocomplete({
    source: _.uniq(allLabels)
  });
};

AssetLabeler.prototype.toggleChecked = function () {
  var status = this.selectAll.prop('checked');
  var checkboxes = this.searchPanel.find('.assetCheckbox');
  if (status) {
    checkboxes.each(function () {
      $(this).prop('checked', status);
    });
  } else {
    checkboxes.each(function () {
      $(this).prop('checked', false);
    });
  }
  this.updateNumberChecked();
};

AssetLabeler.prototype.updateNumberChecked = function () {
  if (this.numCheckedMsg) {
    var checked = $('.assetCheckbox:checked');
    var numChecked = checked.size();
    this.numCheckedMsg.text(numChecked + ' checked');
  }
};

AssetLabeler.prototype.getCheckedElements = function(all) {
  if (all) {
    return $('.assetCheckbox:checked');
  } else {
    return this.searchPanel.find('.assetCheckbox:checked');
  }
};

AssetLabeler.prototype.getCheckedIds = function(all) {
  var elements = this.getCheckedElements(all);
  var ids = [];
  elements.each(function() {
    ids.push($(this).attr('data-id'));
  });
  return ids;
};

AssetLabeler.prototype.getCheckedLabelMods = function(all) {
  var elements = this.getCheckedElements(all);
  var labels = this.assetLabels;
  var map = {};
  elements.each(function() {
    var id = $(this).attr('data-id');
    map[id] = labels[id];
  });
  return map;
};

AssetLabeler.prototype.updateLabelTagsForCheckElem = function (elem, label, add) {
  var fullId = elem.attr('data-id');
  if (fullId) {
    var parts = fullId.split('.');
    var source = parts[0];
    var id = parts[1];
    if (add) {
      this.addLabel(label, source, id);
    } else {
      this.removeLabel(label, source, id);
    }
  }
};

// Adding label to checked assets
AssetLabeler.prototype.addLabels = function () {
  var label = this.labelText.val();
  if (!label) return;
  var checked = $('.assetCheckbox:checked');
  var scope = this;
  checked.each(
    function () {
      scope.updateLabelTagsForCheckElem($(this), label, true);
    }
  );
  this.previewChanges();
  this.updateCustomListPanel();
};

// Removing label from checked assets
AssetLabeler.prototype.removeLabels = function () {
  var label = this.labelText.val();
  if (!label) return;
  var checked = $('.assetCheckbox:checked');
  var scope = this;
  checked.each(
    function () {
      scope.updateLabelTagsForCheckElem($(this), label, false);
    }
  );
  this.previewChanges();
  this.updateCustomListPanel();
};

// Adds label to asset
AssetLabeler.prototype.addLabel = function (label, source, id) {
  var labels = this.getLabels(source, id, true);
  if (labels.hasOwnProperty(label)) {
    if (labels[label] === 'del') {
      labels[label] = '';
    }
  } else {
    labels[label] = 'add';
  }
  var labelTags = $('#labels_' + source + '_' + id);
  this.updateLabelTags(labelTags, source, id);
};

// Removes label from asset
AssetLabeler.prototype.removeLabel = function (label, source, id) {
  var labels = this.getLabels(source, id, false);
  if (labels && labels.hasOwnProperty(label)) {
    if (labels[label] === 'add') {
      delete labels[label];
    } else if (labels[label] === '') {
      labels[label] = 'del';
    }
  }
  var labelTags = $('#labels_' + source + '_' + id);
  this.updateLabelTags(labelTags, source, id);
};

// Retrieves current labels associated with asset
AssetLabeler.prototype.getLabels = function (source, id, create) {
  var fullId = AssetManager.toFullId(source, id);
  var labels = this.assetLabels[fullId];
  if (!labels && create) {
    labels = {};
    this.assetLabels[fullId] = labels;
  }
  return labels;
};


// We got some label information for the asset from the backend,
// save it unless we already have a working copy
AssetLabeler.prototype.cacheLabels = function (fetchedLabels, fullId) {
  // The current label info...
  var labels = this.assetLabels[fullId];
  if (!labels && fetchedLabels) {
    labels = {};
    for (var i = 0; i < fetchedLabels.length; i++) {
      labels[fetchedLabels[i]] = '';
    }

    this.assetLabels[fullId] = labels;
  }
  return labels;
};

// Creates a UI tag for the label
//   .searchResultLabel = no change,
//   .searchResultLabel_add = added,
//   .searchResultLabel_del = deleted
// Click on +/- icon on label will cause label to be added/deleted
// Double click on tag will initiate search for label
AssetLabeler.prototype.createLabelTag = function (source, id, label, update) {
  var labelClass = 'searchResultLabel';
  if (update) {
    labelClass = labelClass + ' ' + labelClass + '_' + update;
  }
  var labelDiv = $('<div></div>')
    .attr('class', 'roundBorder ' + labelClass)
    .attr('id', 'labels_' + source + '_' + id + '_' + label)
    .attr('data-id', source + '.' + id)
    .text(label);
  var change = $('<img/>');
  if (update === 'del') {
    // Have add button
    labelDiv.click(function (e) {
      this.addLabel(label, source, id);
      this.previewChanges();
      this.updateCustomListPanel();
      e.stopPropagation();
    }.bind(this));
    //change.attr('src','resources/images/16/add.png');
    labelDiv.append(change);
  } else if (update === 'add' || update === '') {
    // Have delete button
    labelDiv.click(function (e) {
      this.removeLabel(label, source, id);
      this.previewChanges();
      this.updateCustomListPanel();
      e.stopPropagation();
    }.bind(this));
    //change.attr('src','resources/images/16/delete.png');
    labelDiv.append(change);
  }
  var search = $('<img/>').attr('src', 'resources/images/16/search.png');
  labelDiv.prepend(search);
  search.click(
    function (e) {
      var query = this.labelField + ':"' + label + '"';
      this.searchController.setSearchText(query);
      this.searchController.search(query);
      e.stopPropagation();
    }.bind(this)
  );
  return labelDiv;
};

AssetLabeler.prototype.createAssetElem = function (comp, fullId) {
  var sid = AssetManager.toSourceId(null, fullId);
  var assetElem = $('<div></div>')
    .append($('<img/>')
      .addClass('previewImage')
      .attr('src', this.assetManager.getImagePreviewUrl(sid.source, sid.id, null, this.metadataCache[fullId])))
    .attr('title', fullId)
    .click(this.showAsset.bind(this, fullId));
  assetElem.append($('<input/>').attr('type', 'checkbox')
    .attr('class', 'assetCheckbox')
    .attr('id', 'check_' + sid.source + '_' + sid.id + '_' + comp)
    .attr('data-id', sid.source + '.' + sid.id)
    .click(function (e) {
      this.updateNumberChecked();
      e.stopPropagation();
    }.bind(this))
  );
  return assetElem;
};

// Updates all labels
AssetLabeler.prototype.updateLabelTags = function (labelTags, source, id) {
  labelTags.empty();
  var fullId = AssetManager.toFullId(source, id);
  // The current label info...
  var labels = this.assetLabels[fullId];
  if (labels) {
    for (var label in labels) {
      if (labels.hasOwnProperty(label)) {
        var update = labels[label];
        var labelTag = this.createLabelTag(source, id, label, update);
        labelTags.append(labelTag);
      }
    }
  }
};

AssetLabeler.prototype.searchSucceeded = function (source, resultList) {
  this.selectAll.prop('checked', false);
  this.updateNumberChecked();
  //    this.assetManager.cacheModelInfos(source, resultList);
};

AssetLabeler.prototype.onWindowResize = function () {
  this.searchController.onResize();
  this.resizePreviewPanel();
  this.resizeCustomListPanel();
};

AssetLabeler.prototype.redisplay = function () {
  //        this.modelCanvas.redisplay();
};

AssetLabeler.prototype.resizePreviewPanel = function () {
  this.labelsPreviewPanel.resize();
};

// Previews changes
AssetLabeler.prototype.previewChanges = function () {
  this.labelsPreviewPanel.update(this.assetLabels);
};

AssetLabeler.prototype.clearChanges = function () {
  this.assetLabels = {};
  this.previewChanges();
  this.updateCustomListPanel();
  this.searchController.refreshSearch();
};

// Submits to backend
AssetLabeler.prototype.submitLabels = function () {
  // Figure out which assets need to be updated
  var changedAssets = [];
  for (var fullId in this.assetLabels) {
    if (this.assetLabels.hasOwnProperty(fullId)) {
      var changed = 0;
      var updates = [];
      var final = [];
      var labels = this.assetLabels[fullId];
      for (var label in labels) {
        if (labels.hasOwnProperty(label)) {
          var update = labels[label];
          if (update) {
            changed++;
          }
          if (update !== 'del') {
            final.push(label);
          }
          updates.push(update + ':' + label);
        }
      }
      if (changed > 0) {
        // Changed!  Add to changedAssets
        var m = {
          fullId: fullId,
          label: final, //  new set of labels
          update: updates  // sequence of update operations
        };
        changedAssets.push(m);
      }
    }
  }

  if (changedAssets.length === 0) return;

  var scope = this;
  var params = {};
  if (this.submitDirect) {
    var labelField = this.labelField;
    //console.log(changedAssets);
    var changes = changedAssets.map(function(asset) {
      var sid = AssetManager.toSourceId(scope.source, asset.fullId);
      var res = {
        'id': sid.id,
        'fullId': asset.fullId
      };
      res[labelField] = { 'set': asset.label };
      return res;
    });
    params = changes;

    var inputs = $('input');
    inputs.prop('disabled', true);

    $.ajax({
      type: 'POST',
      url: this.submitLabelsUrl + '?commit=true',
      contentType: 'application/json;charset=utf-8',
      data: JSON.stringify(params),
      dataType: 'json',
      success: function (response, textStatus, jqXHR) {
        console.log('labels successfully submitted for ' + changedAssets.length + ' assets!!!');
        this.clearChanges();
      }.bind(this),
      error: function (jqXHR, textStatus, errorThrown) {
        console.error('Error submitting labels for ' + changedAssets.length + ' assets!!!');
      },
      complete: function () {
        // Re-enable inputs
        inputs.prop('disabled', false);
      }
    });

  } else {
    params = {
      assets: changedAssets,
      //            userId: (window.globals)? window.globals.userId : "unknown",
      updateMain: Constants.submitUpdateMain
    };

    var inputs = $('input');
    inputs.prop('disabled', true);

    var data = params;
    $.ajax
    ({
      type: 'POST',
      url: this.submitLabelsUrl,
      contentType: 'application/json;charset=utf-8',
      data: JSON.stringify(data),
      success: function (response, textStatus, jqXHR) {
        console.log('labels successfully submitted for ' + changedAssets.length + ' assets!!!');
        this.clearChanges();
      }.bind(this),
      error: function (jqXHR, textStatus, errorThrown) {
        console.error('Error submitting labels for ' + changedAssets.length + ' assets!!!');
      },
      complete: function () {
        // Re-enable inputs
        inputs.prop('disabled', false);
      }
    });
  }
};

AssetLabeler.prototype.updateLabelsPanel = function () {
  if (!this.labelsPanel) return;
  this.labelsPanel.updateSolrLabels();
};

AssetLabeler.prototype.isOnCustomAssetList = function(fullId) {
  return (this.customAssetListPanel && this.customAssetListPanel.assetIdToLabelMods[fullId]);
};

AssetLabeler.prototype.addCustomListLabelsToCached = function (fullId, loadedIdToLabels) {
  var customAssets = loadedIdToLabels;
  if (customAssets[fullId] && customAssets[fullId].length > 0) {
    var labels = this.assetLabels[fullId];
    if (!labels) {
      labels = {};
      this.assetLabels[fullId] = labels;
    }
    // Add these labels as well....
    for (var i = 0; i < customAssets[fullId].length; i++) {
      var label = customAssets[fullId][i];
      var sid = AssetManager.toSourceId(null, fullId);
      this.addLabel(label, sid.source, sid.id);
    }
  }
};

// Fetch missing asset labels (keeps old labels if we have them)
AssetLabeler.prototype.updateAssetLabels = function (resultList, customIdToLabels) {
  for (var i = 0; i < resultList.length; i++) {
    var result = resultList[i];
    if (!this.assetLabels[result.fullId]) {
      this.cacheLabels(result[this.labelField], result.fullId);
    }
    this.addCustomListLabelsToCached(result.fullId, customIdToLabels);
  }
  this.previewChanges();
  this.updateCustomListPanel();
};

AssetLabeler.prototype.fetchAssetLabels = function (ids, customIdToLabels) {
  this.searchController.searchByIds(
    this.source, ids,
    function(data, textStatus, jqXHR) {
      this.updateAssetLabels(data.response.docs, customIdToLabels);
    }.bind(this),
    function (jqXHR, textStatus, errorThrown) {
      console.error('Unable to fetch asset labels: ' + textStatus);
      this.updateCustomListPanel();
    }.bind(this)
  );
};

AssetLabeler.prototype.getViewAssetUrl = function(fullId) {
  return this.viewerUrl + '?fullId=' + fullId;
};

AssetLabeler.prototype.showAsset = function (fullId) {
  this.openViewer(this.getViewAssetUrl(fullId), this.viewerWindowName);
};

AssetLabeler.prototype.openViewer = function (url, windowName) {
  if (this.viewerIframe && this.viewerModal) {
    this.viewerIframe.attr('src', url);
    this.viewerModal.modal('show');
  } else {
    window.open(url, windowName);
  }
};

AssetLabeler.prototype.resizeCustomListPanel = function () {
  this.customAssetListPanel.resize();
};

AssetLabeler.prototype.updateCustomListPanel = function () {
  this.customAssetListPanel.updateLabels(this.assetLabels);
  this.customAssetListPanel.update(this.customAssetListPanel.assetIdToLabelMods);
  var customListPanel = this.customAssetListPanel;
  var searchResultElems = this.searchPanel.find('.searchResult');
  searchResultElems.each(
    function () {
      var fullId = $(this).data('fullId');
      if (customListPanel.assetIdToLabelMods[fullId]) {
        $(this).addClass('searchResultSelected');
      } else {
        $(this).removeClass('searchResultSelected');
      }
    }
  );
};


// Exports
module.exports = AssetLabeler;