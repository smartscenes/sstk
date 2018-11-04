'use strict';

var Constants = require('lib/Constants');
var AssetGroup = require('assets/AssetGroup');
var AssetGroups = require('assets/AssetGroups');
var AssetLoader = require('assets/AssetLoader');
var AssetManager = require('assets/AssetManager');
var SearchController = require('search/SearchController');
var SearchModule = require('search/SearchModule');
var _ = require('util/util');
require('dragscrollable');
require('jquery-lazy');

// Interface for labeling assets
function AssetLabeler(options) {
  // Keep our own copy of labels
  // labels are stored as map:
  //   fullId -> { cat1: 'del', cat2: 'add', cat3: '', ...}
  this.assetLabels = {};
  this.selectedAssets = {};
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

  this.labelsPanel = $(options.labelsPanel.container);

  console.log(options);
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
    sourceChangedCallback: this.showLabels.bind(this),
    onClickResultCallback: function (source, id) {
      var checkBox = $('#check_' + source + '_' + id + '_search');
      var checked = checkBox.prop('checked');
      checkBox.prop('checked', !checked);
      this.updateNumberChecked();
    }.bind(this),
    appendResultElemCallback: function (source, id, result, elem) {
      var fullId = AssetManager.toFullId(source, id);
      elem.data('fullId', fullId);
      if (this.selectedAssets[fullId]) {
        elem.addClass('searchResultSelected');
      }
      elem.append($('<input/>').attr('type', 'checkbox')
        .attr('class', 'assetCheckbox')
        .attr('id', 'check_' + source + '_' + id + '_search')
        .attr('data-id', fullId)
        .click(function (e) {
          this.updateNumberChecked();
          e.stopPropagation();
        }.bind(this))
      );
      var labelTags = $('<div></div>')
        .attr('class', 'searchResultLabels')
        .attr('id', 'labels_' + source + '_' + id)
        .attr('data-id', fullId);
      this.metadataCache[fullId] = result;
      this.cacheLabels(result[this.labelField], fullId);
      this.addSelectedLabelsToCached(fullId);
      this.updateLabelTags(labelTags, source, id);
      elem.prepend(labelTags);
      elem.dblclick(this.showAsset.bind(this, fullId));
    }.bind(this),
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

  this.labels = {};
  this.updateSolrLabels();

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

  // Hook up selected panel elements
  var selectedAddButton = $('#selectedAdd');
  selectedAddButton.click(this.addToSelected.bind(this));

  var selectedClearButton = $('#selectedClear');
  selectedClearButton.click(this.clearSelected.bind(this));

  var selectedSaveButton = $('#selectedSave');
  selectedSaveButton.click(this.saveSelected.bind(this));

  var selectedLoadButton = $('#selectedLoad');
  selectedLoadButton.click(this.loadSelected.bind(this));


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

AssetLabeler.prototype.updateLabels = function (labels, source) {
  this.labels[source] = labels;
  var allLabels = [];
  if (this.suggestedLabels) {
    allLabels = allLabels.concat(this.suggestedLabels);
  }
  for (var s in this.labels) {
    if (this.labels.hasOwnProperty(s)) {
      allLabels = allLabels.concat(this.labels[s]);
    }
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
  this.updateSelectedPanel();
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
  this.updateSelectedPanel();
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
      this.updateSelectedPanel();
      e.stopPropagation();
    }.bind(this));
    //change.attr('src','resources/images/16/add.png');
    labelDiv.append(change);
  } else if (update === 'add' || update === '') {
    // Have delete button
    labelDiv.click(function (e) {
      this.removeLabel(label, source, id);
      this.previewChanges();
      this.updateSelectedPanel();
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
  this.resizeSelectedPanel();
};

AssetLabeler.prototype.redisplay = function () {
  //        this.modelCanvas.redisplay();
};

AssetLabeler.prototype.resizePreviewPanel = function () {
  var previewPane = $('#previewPane');
  var previewNumElem = previewPane.find('#previewNum');
  var viewport = previewPane.find('.scrollableDiv');
  viewport.css('width', previewPane.width() + 'px');
  viewport.css('height', (previewPane.height() - 1 * previewNumElem.height()) + 'px');
};

// Previews changes
AssetLabeler.prototype.previewChanges = function () {
  var previewPane = $('#previewPane');
  var previewNumElem = previewPane.find('#previewNum');
  if (previewNumElem.length === 0) {
    previewNumElem = $('<div id="previewNum"></div>');
    previewPane.append(previewNumElem);
  }
  var previewTable = previewPane.find('table');
  if (previewTable.length === 0) {
    previewTable = $('<table></table>');
    previewTable.addClass('dragger');
    var viewport = $('<div></div>').addClass('scrollableDiv');
    previewPane.append(viewport.append(previewTable));
    viewport.
    dragscrollable({dragSelector: '.dragger:first', acceptPropagatedEvent: true});
  }
  previewTable.empty();
  var nChangedAssets = 0;
  var width = this.gridWidth;
  var height = width;
  var tdCss = {
    'width': width + 'px',
    'min-width': '50px',
    'max-width': width + 'px',
    'max-height': height + 'px'
  };
  for (var fullId in this.assetLabels) {
    if (this.assetLabels.hasOwnProperty(fullId)) {
      var orig = [];
      var changed = [];
      var labels = this.assetLabels[fullId];
      for (var label in labels) {
        if (labels.hasOwnProperty(label)) {
          if (labels[label]) {
            changed.push(label);
          } else {
            orig.push(label);
          }
        }
      }
      if (changed.length > 0) {
        var origElem = $('<div></div>');
        var addElem = $('<div></div>');
        var delElem = $('<div></div>');
        for (var label in labels) {
          if (labels.hasOwnProperty(label)) {
            var update = labels[label];
            var sid = AssetManager.toSourceId(null, fullId);
            var labelTag = this.createLabelTag(sid.source, sid.id, label, update);
            if (update === 'add') {
              addElem.append(labelTag);
            } else if (update === 'del') {
              delElem.append(labelTag);
            } else {
              origElem.append(labelTag);
            }
          }
        }
        nChangedAssets++;
        var assetElem = this.createAssetElem('preview', fullId);
        var row = $('<tr></tr>')
          .append($('<td></td>').text(nChangedAssets))
          .append($('<td></td>').css(tdCss).append(assetElem))
          .append($('<td></td>').append(origElem))
          .append($('<td></td>').append(addElem))
          .append($('<td></td>').append(delElem));
        previewTable.append(row);
      }
    }
  }
  previewNumElem.text(nChangedAssets + ' changed');
};

AssetLabeler.prototype.clearChanges = function () {
  this.assetLabels = {};
  this.previewChanges();
  this.updateSelectedPanel();
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

    $.ajax
    ({
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

    var data = jQuery.param(params);
    $.ajax
    ({
      type: 'POST',
      url: this.submitLabelsUrl,
      data: data,
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


AssetLabeler.prototype.labelSearchSucceeded = function (data, textStatus, jqXHR) {
  this.labelsPanel.empty();
  var resultsList = data.facet_counts.facet_fields;
  var labels = resultsList[this.labelField];
  for (var i = 0; i < labels.length; i += 2) {
    var label = labels[i];
    var count = labels[i + 1];
    var search = $('<span class="labelName"></span>').text(label).click(
      function (label, e) {
        var query = this.labelField + ':"' + label + '"';
        this.searchController.setSearchText(query);
        this.searchController.search(query);
      }.bind(this, label)
    );
    var labelElem = $('<div></div>')
      .append(search)
      .append($('<span></span>').text(' (' + count + ')'));
    this.labelsPanel.append(labelElem);
  }

  var labelNames = [];
  for (var i = 0; i < labels.length; i += 2) {
    labelNames.push(labels[i]);
  }
  this.updateLabels(labelNames, this.searchController.source);
};

AssetLabeler.prototype.labelSearchFailed = function (jqXHR, textStatus, errorThrown) {
  console.error('Error getting updated labels: ' + textStatus);
};

AssetLabeler.prototype.showLabels = function () {
  this.searchController.facetFieldSearch({
    source: this.searchController.source,
    facetField: this.labelField,
    facetSort: SearchModule.facetOrderCount,
    success: this.labelSearchSucceeded.bind(this),
    error: this.labelSearchFailed.bind(this)
  });
};

AssetLabeler.prototype.updateSolrLabels = function () {
  this.searchController.facetFieldSearch({
    source: this.source,
    facetField: this.labelField,
    facetSort: SearchModule.facetOrderIndex,
    success: function (data, textStatus, jqXHR) {
      var resultsList = data.facet_counts.facet_fields;
      var labels = resultsList[this.labelField];
      var labelNames = [];
      for (var i = 0; i < labels.length; i += 2) {
        labelNames.push(labels[i]);
      }
      this.updateLabels(labelNames, this.source);
    }.bind(this)
  });
};

AssetLabeler.prototype.updateSelectedForCheckElem = function (elem, add) {
  var fullId = elem.attr('data-id');
  if (fullId) {
    if (add) {
      this.selectedAssets[fullId] = [];
    } else {
      delete this.selectedAssets[fullId];
    }
  }
};

// Add checked assets to selected list
AssetLabeler.prototype.addToSelected = function () {
  var checked = this.searchPanel.find('.assetCheckbox:checked');
  var scope = this;
  checked.each(
    function () {
      scope.updateSelectedForCheckElem($(this), true);
    }
  );
  this.updateSelectedPanel();
};

// Removing checked assets from selected list
AssetLabeler.prototype.removeFromSelected = function () {
  var checked = this.searchPanel.find('.assetCheckbox:checked');
  var scope = this;
  checked.each(
    function () {
      scope.updateSelectedForCheckElem($(this), false);
    }
  );
  this.updateSelectedPanel();
};

AssetLabeler.prototype.clearSelected = function () {
  this.selectedAssets = {};
  this.updateSelectedPanel();
};

AssetLabeler.prototype.saveSelected = function () {
  var labeled = this.getSelectedAssetsWithLabels();
  console.log(JSON.stringify(labeled, null, ' '));
};

AssetLabeler.prototype.addSelectedLabelsToCached = function (fullId) {
  if (this.selectedAssets[fullId] && this.selectedAssets[fullId].length > 0) {
    var labels = this.assetLabels[fullId];
    if (!labels) {
      labels = {};
      this.assetLabels[fullId] = labels;
    }
    // Add these labels as well....
    for (var i = 0; i < this.selectedAssets[fullId].length; i++) {
      var label = this.selectedAssets[fullId][i];
      var sid = AssetManager.toSourceId(null, fullId);
      this.addLabel(label, sid.source, sid.id);
    }
  }
};

// Fetch missing asset labels (keeps old labels if we have them)
AssetLabeler.prototype.fetchAssetLabelsSucceeded = function (data, textStatus, jqXHR) {
  var resultList = data.response.docs;
  for (var i = 0; i < resultList.length; i++) {
    var result = resultList[i];
    if (!this.assetLabels[result.fullId]) {
      this.cacheLabels(result[this.labelField], result.fullId);
    }
    this.addSelectedLabelsToCached(result.fullId);
  }
  this.previewChanges();
  this.updateSelectedPanel();
};

AssetLabeler.prototype.fetchAssetLabelsFailed = function (jqXHR, textStatus, errorThrown) {
  console.error('Unable to fetch asset labels: ' + textStatus);
  this.updateSelectedPanel();
};

AssetLabeler.prototype.fetchAssetLabels = function (ids) {
  this.searchController.searchByIds(
    this.source, ids,
    this.fetchAssetLabelsSucceeded.bind(this),
    this.fetchAssetLabelsFailed.bind(this)
  );

};

AssetLabeler.prototype.loadSelected = function (jsonFile) {
  console.log('loading selected assets from ' + jsonFile);
  this.selectedAssets = {};
  this.assetLoader.load(jsonFile, 'json',
    function (data) {
      console.log(data);
      for (var cat in data) {
        // console.log(cat);
        if (data.hasOwnProperty(cat)) {
          var catIds = data[cat];
          for (var i = 0; i < catIds.length; i++) {
            var id = catIds[i];
            if (!this.selectedAssets[id]) {
              this.selectedAssets[id] = [cat];
            } else {
              this.selectedAssets[id].push(cat);
            }
          }
        }
      }
      //console.log(this.selectedAssets);
      this.fetchAssetLabels(Object.keys(this.selectedAssets));
      //this.updateSelectedPanel();
    }.bind(this)
  );
};

AssetLabeler.prototype.getSelectedAssetsWithLabels = function () {
  var labeled = {};
  for (var id in this.selectedAssets) {
    if (this.selectedAssets.hasOwnProperty(id)) {
      //   fullId -> { cat1: 'del', cat2: 'add', cat3: '', ...}
      var selectedLabels = this.selectedAssets[id];
      var labels = (selectedLabels.length > 0) ? selectedLabels : this.getCurrentLabels(id);
      if (labels.length === 0) {
        labels.push('__NOCAT__');
      }
      for (var i = 0; i < labels.length; i++) {
        var label = labels[i];
        if (!labeled[label]) labeled[label] = [];
        labeled[label].push(id);
      }
    }
  }
  return labeled;
};

AssetLabeler.prototype.getCurrentLabels = function (id) {
  var labels = this.assetLabels[id];
  var filteredKeys = [];
  if (labels) {
    for (var cat in labels) {
      if (labels.hasOwnProperty(cat) && (labels[cat] !== 'del')) {
        filteredKeys.push(cat);
      }
    }
  }

  return filteredKeys;
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

AssetLabeler.prototype.resizeSelectedPanel = function () {
  var selectedPane = $('#selectedPane');
  var selectedNumElem = selectedPane.find('#selectedNum');
  var viewport = selectedPane.find('.scrollableDiv');
  viewport.css('width', selectedPane.width() + 'px');
  viewport.css('height', (selectedPane.height() - selectedNumElem.height()) + 'px');
};

AssetLabeler.prototype.updateSelectedPanel = function () {
  var selectedPane = $('#selectedPane');
  var selectedNumElem = selectedPane.find('#selectedNum');
  if (selectedNumElem.length === 0) {
    selectedNumElem = $('<div id="selectedNum"></div>');
    selectedPane.append(selectedNumElem);
  }
  var selectedTable = selectedPane.find('table');
  if (selectedTable.length === 0) {
    selectedTable = $('<table></table>');
    selectedTable.addClass('dragger');
    var viewport = $('<div></div>').addClass('scrollableDiv');
    selectedPane.append(viewport.append(selectedTable));
    viewport.
    dragscrollable({dragSelector: '.dragger:first', acceptPropagatedEvent: true});
  }
  selectedTable.empty();

  var totalSelected = Object.keys(this.selectedAssets).length;
  selectedNumElem.text(totalSelected + ' selected');

  var width = this.gridWidth;
  var height = width;
  var tdCss = {
    'width': width + 'px',
    'max-width': width + 'px',
    'max-height': height + 'px'
  };
  var labeled = this.getSelectedAssetsWithLabels();
  for (var label in labeled) {
    if (labeled.hasOwnProperty(label)) {
      var fullIds = labeled[label];
      var labelRow = $('<tr></tr>').addClass('selectedLabel')
        .append($('<td colspan="3"></td>')
          .text(label))
        .append($('<td class="selectedCatNum"></td>').text(fullIds.length));
      selectedTable.append(labelRow);
      for (var i = 0; i < fullIds.length; i++) {
        var fullId = fullIds[i];
        var catElem = $('<div></div>');
        var sid = AssetManager.toSourceId(null, fullId);
        this.updateLabelTags(catElem, sid.source, sid.id);
        var assetElem = this.createAssetElem('selected', fullId);
        var delElem = $('<img/>')
          .addClass('imageButton')
          .attr('src', 'resources/images/16/delete.png')
          .attr('title', 'Remove').attr('alt', 'Remove')
          .click(function (fullId) {
            delete this.selectedAssets[fullId];
            this.updateSelectedPanel();
          }.bind(this, fullId));
        var row = $('<tr></tr>')
          .append($('<td></td>').text(i + 1))
          .append($('<td></td>').css(tdCss).append(assetElem))
          .append($('<td></td>').append(catElem))
          .append($('<td></td>').css('text-align', 'right').append(delElem));
        selectedTable.append(row);
      }
    }
  }
  var AssetLabeler = this;
  var searchResultElems = this.searchPanel.find('.searchResult');
  searchResultElems.each(
    function () {
      var fullId = $(this).data('fullId');
      if (AssetLabeler.selectedAssets[fullId]) {
        $(this).addClass('searchResultSelected');
      } else {
        $(this).removeClass('searchResultSelected');
      }
    }
  );
};


// Exports
module.exports = AssetLabeler;