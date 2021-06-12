'use strict';

var Constants = require('lib/Constants');
var AssetManager = require('assets/AssetManager');
var SearchController = require('search/SearchController');
var SolrQuerySuggester = require('search/SolrQuerySuggester');
var ModelSchema = require('model/ModelSchema');
var ModelSearchPanelHelper = require('ui/ModelSearchPanelHelper');
var LabelsPreviewPanel = require('ui/LabelsPreviewPanel');
var CustomListLabelsPreviewPanel = require('ui/CustomListLabelsPreviewPanel');
var LabelCountsPanel = require('ui/LabelCountsPanel');
var AnnotationsPanel = require('ui/AnnotationsPanel');
var _ = require('util/util');
require('dragscrollable');
require('jquery-lazy');

/**
 * Interface for categorizing models
 * @param params
 * @param [options.source] {string} Source to use for the search panel
 * @param [options.nImagesPerModel] {int} Number of image that each model has
 * @param [options.imageIndex] {int} Index of image to show for a model
 * @param [options.inspect] {boolean} Whether to enable inspect model
 * @memberOf model-tools
 * @constructor
 */
function ModelCategorizer(params) {
  // Keep our own copy of categories
  // categories are stored as map:
  //   fullId -> { cat1: 'del', cat2: 'add', cat3: '', ...}
  params = params || {};
  this.submitCategoriesUrl = Constants.baseUrl + '/submitCategories';
  this.modelCategories = {};
  var urlParams = _.getUrlParams();
  var defaults = {
    nImagesPerModel: 14,
    imageIndex: 13
  };
  var allParams = _.defaultsDeep(Object.create(null), urlParams, params, defaults);
  this.nImagesPerModel = allParams['nImagesPerModel'];
  this.defaultImageIndex = allParams['imageIndex'];
  this.addInspectModelResultButtons = allParams.inspect;
  this.includeExtraAssets = allParams.extra;
  this.allowUpdateByQuery = allParams.updateByQuery;
  this.source = allParams.source;
  this.categoryField = 'category';
  this.init();
}

ModelCategorizer.prototype.init = function () {
  this.assetManager = new AssetManager();

  // Main search panel where models are displayed
  // Models are displayed in a grid, each model has:
  // - Checkbox (clicking on model checks/unchecks)
  // - Categories associated with model
  //    (listed at top - yellow = no change, green = added, red = deleted)
  var scope = this;
  this.modelSearchPanelHelper = new ModelSearchPanelHelper({
    includeExtraAssets: this.includeExtraAssets
  });
  this.searchPanel = $('#searchPanel');
  this.searchController = new SearchController({
    source: scope.source,
    searchSucceededCallback: this.searchSucceeded.bind(this),
    getImagePreviewUrlCallback: this.assetManager.getImagePreviewUrl.bind(this.assetManager),
    sourceChangedCallback: this.updateCategoriesPanel.bind(this),
    //   onClickResultCallback: this.modelCanvas.loadModel.bind(this.modelCanvas),
    onClickResultCallback: function (source, id) {
      var checkBox = $('#check_' + source + '_' + id + '_search');
      var checked = checkBox.prop('checked');
      checkBox.prop('checked', !checked);
      scope.updateNumberChecked();
      scope.updateAnnotationsPanel();
    },
    appendResultElemCallback: function (source, id, result, elem) {
      if (scope.addInspectModelResultButtons) {
        scope.modelSearchPanelHelper.addModelViewIcons(source, id, result, elem);
      }
      var fullId = AssetManager.toFullId(source, id);
      elem.data('fullId', fullId);
      if (scope.isOnCustomModelList(fullId)) {
        elem.addClass('searchResultSelected');
      }
      elem.append($('<input/>').attr('type', 'checkbox')
        .attr('class', 'modelCheckbox')
        .attr('id', 'check_' + source + '_' + id + '_search')
        .attr('data-id', fullId)
        .click(function (e) {
          scope.updateNumberChecked();
          scope.updateAnnotationsPanel();
          e.stopPropagation();
        })
      );
      var labels = $('<div></div>')
        .attr('class', 'searchResultLabels')
        .attr('id', 'labels_' + source + '_' + id)
        .attr('data-id', fullId);
      scope.cacheCategories(result[scope.categoryField], fullId);
      if (scope.customModelListPanel) {
        scope.addCustomListCategoriesToCached(fullId, scope.customModelListPanel.getIdToLabels());
      }
      scope.updateLabelTags(labels, source, id);
      elem.prepend(labels);
      elem.dblclick(scope.showModel.bind(scope, fullId));
    },
    entriesPerRow: 6,
    nRows: 40,
    searchPanel: this.searchPanel,
    showLoadFile: true,
    allowSave: true,
    loadImagesLazy: true,
    encodeQuery: false,
    boostFields: []
  });
  this.searchController.searchPanel.setAutocomplete(
    new SolrQuerySuggester({
      schema: new ModelSchema()
    })
  );
  if (this.includeExtraAssets) {
    this.assetManager.registerCustomAssetGroups({
      assetFiles: Constants.indexedAssetsFile,
      searchController: this.searchController,
      callback: function (err, res) {
      }
    });
  }
  this.labelsPreviewPanel = new LabelsPreviewPanel({
    container: '#previewPane',
    gridWidth: 100,
    createLabelTag: function(fullId, label, update) {
     var sid = AssetManager.toSourceId(null, fullId);
     return scope.createLabelTag(sid.source, sid.id, label, update);
    },
    createAssetElement: function(panelTag, fullId) {
      return scope.createModelElem(panelTag, fullId);
    }
  });

  // Hook up select all checkbox
  this.selectAll = $('#selectAll');
  this.selectAll.click(function() { scope.toggleChecked(); });
  this.numCheckedMsg = $('#numCheckedMsg');
  this.updateNumberChecked();

  // At side: panel to add/remove categories for the checked set of models
  // Category text
  this.categoryText = $('#category');

  // Hook up add and remove buttons
  var addButton = $('#buttonAdd');
  addButton.click(this.addCategories.bind(this));

  var removeButton = $('#buttonRemove');
  removeButton.click(this.removeCategories.bind(this));

  // Preview shows current changes
  // Hook up clear and submit buttons
  var clearButton = $('#clear');
  clearButton.click(this.clearChanges.bind(this));

  // Submits changes to categories to backend
  var submitButton = $('#submit');
  submitButton.click(this.submitCategories.bind(this));

  // Show categories
  this.categoriesPanel = new LabelCountsPanel({
    container: '#categoriesPanel',
    searchController: this.searchController,
    labelName: this.categoryField
  });
  this.categoriesPanel.Subscribe('LabelsUpdated', this, function(labels) {
    scope.updateAutocompleteCategories(labels);
  });
  this.updateCategoriesPanel();
  // // Do auto complete for categories
  // $.getJSON('resources/data/furnitureCategories.json',
  //   function (data) {
  //     this.updateCategories(data, 'json');
  //   }.bind(this)
  // );

  // Hook up selected panel elements
  this.customModelListPanel = new CustomListLabelsPreviewPanel({
    container: '#selectedPane',
    gridWidth: 100,
    createLabelTag: function(fullId, label, update) {
      var sid = AssetManager.toSourceId(null, fullId);
      return scope.createLabelTag(sid.source, sid.id, label, update);
    },
    createAssetElement: function(panelTag, fullId) {
      return scope.createModelElem(panelTag, fullId);
    },
    getChecked: function() {
      return scope.getCheckedLabelMods();
    },
    onLoaded: function(assetIdToMods) {
      scope.fetchModelCategories(Object.keys(assetIdToMods), assetIdToMods);
    }
  });

  var imageNames = [
    'left', 'right', 'bottom', 'top', 'front', 'back', // 6
    undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, // 8
    'voxels-color-32-surface', 'voxels-color-32-solid',
    'voxels-color-64-surface', 'voxels-color-64-solid',
    'voxels-color-128-surface', 'voxels-color-128-solid',
    'voxels-color-256-surface', 'voxels-color-256-solid',
    'voxels-color-32-surface-filtered', 'voxels-color-32-solid-filtered',
    'voxels-color-64-surface-filtered', 'voxels-color-64-solid-filtered',
    'voxels-color-128-surface-filtered', 'voxels-color-128-solid-filtered'
  ];

  var newImagesCheckbox = $('#newImages');
  if (newImagesCheckbox && newImagesCheckbox.length > 0) {
    var imageIndexElem = $('#imageIndex');
    for (var i = 0; i < this.nImagesPerModel; i++) {
      var imageName = imageNames[i] || i;
      imageIndexElem.append('<option value="' + i + '">' + imageName + '</option>');
    }
    imageIndexElem.val(this.defaultImageIndex);
    var selectImagePreviewFunc = function () {
      var checked = newImagesCheckbox.prop('checked');
      if (checked) {
        scope.assetManager.previewImageIndex = imageIndexElem.val();
        imageIndexElem.show();
      } else {
        scope.assetManager.previewImageIndex = -1;
        imageIndexElem.hide();
      }
      scope.searchController.updatePreviewImages(scope.assetManager.previewImageIndex);
    };
    newImagesCheckbox.change(selectImagePreviewFunc);
    imageIndexElem.change(selectImagePreviewFunc);
    selectImagePreviewFunc();
  }

  var initialQuery = _.getUrlParam('query');
  if (initialQuery) {
    this.searchController.setSearchText(initialQuery);
    this.searchController.startSearch();
  }

  var annotationsPanel = $('#annotationsPanel');
  if (annotationsPanel && annotationsPanel.length > 0) {
    var editableAttributes = ['wnsynset', /*'category', */ 'datatags',
      'motif', 'support', 'symType',
      'color', 'material', 'shape', 'depicts',
      'state', 'usedFor', 'foundIn', 'hasPart', 'attr',
      'needCleaning', 'isCornerPiece', 'isContainerLike',
      'isSingleCleanObject', 'hasMultipleObjects', 'hasNestedObjects',
      'isArrangement', 'isCollection'];
    var readOnlyAttributes = [];
    var attributeLinks =  { 'wnsynset': ModelSchema.ShapeNetSynsetAttributeLink };
    this.annotationsPanel = new AnnotationsPanel({
      container: annotationsPanel,
      allowEnabledSelection: true,
      allowUpdateByQuery: this.allowUpdateByQuery,
      getQuery: this.allowUpdateByQuery? function() {
        return scope.searchController.searchPanel.getLastQueryOptions();
      } : null,
      enabledAttributes: ['wnsynset'],
      attributes: editableAttributes,
      attributesReadOnly: readOnlyAttributes,
      attributeLinks: attributeLinks,
      allowOpSelection: true,
      searchController: this.searchController,
      onSubmittedCallback: this.clearChanges.bind(this)
    });
    this.updateAnnotationsPanel();
  }

  // Resize
  window.addEventListener('resize', this.onWindowResize.bind(this), false);
};

ModelCategorizer.prototype.updateAnnotationsPanel = function() {
  if (this.annotationsPanel) {
    var checked = $('.modelCheckbox:checked');
    var modelInfos = [];
    checked.each(
      function () {
        var elem = $(this);
        var fullId = elem.attr('data-id');
        if (fullId) {
          modelInfos.push({ fullId: fullId });
        }
      }
    );
    //console.log('set modelInfos', modelInfos);
    this.annotationsPanel.setTarget(modelInfos, true);
  }
};

ModelCategorizer.prototype.updateAutocompleteCategories = function (categories) {
  this.categoryText.autocomplete({ source: categories });
};

ModelCategorizer.prototype.toggleChecked = function () {
  var status = this.selectAll.prop('checked');
  var checkboxes = this.searchPanel.find('.modelCheckbox');
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
  this.updateAnnotationsPanel();
};

ModelCategorizer.prototype.updateNumberChecked = function () {
  if (this.numCheckedMsg) {
    var checked = $('.modelCheckbox:checked');
    var numChecked = checked.size();
    this.numCheckedMsg.text(numChecked + ' checked');
  }
};

ModelCategorizer.prototype.getCheckedElements = function(all) {
  if (all) {
    return $('.modelCheckbox:checked');
  } else {
    return this.searchPanel.find('.modelCheckbox:checked');
  }
};

ModelCategorizer.prototype.getCheckedIds = function(all) {
  var elements = this.getCheckedElements(all);
  var ids = [];
  elements.each(function() {
    ids.push($(this).attr('data-id'));
  });
  return ids;
};

ModelCategorizer.prototype.getCheckedLabelMods = function(all) {
  var elements = this.getCheckedElements(all);
  var labels = this.modelCategories;
  var map = {};
  elements.each(function() {
    var id = $(this).attr('data-id');
    map[id] = labels[id];
  });
  return map;
};

ModelCategorizer.prototype.updateCategoriesForCheckElem = function (elem, category, add) {
  var fullId = elem.attr('data-id');
  if (fullId) {
    var parts = fullId.split('.');
    var source = parts[0];
    var id = parts[1];
    if (add) {
      this.addCategory(category, source, id);
    } else {
      this.removeCategory(category, source, id);
    }
  }
};

// Adding category to checked models
ModelCategorizer.prototype.addCategories = function () {
  var category = this.categoryText.val();
  if (!category) return;
  var checked = $('.modelCheckbox:checked');
  var modelCategorizer = this;
  checked.each(
    function () {
      modelCategorizer.updateCategoriesForCheckElem($(this), category, true);
    }
  );
  this.previewChanges();
  this.updateCustomListPanel();
};

// Removing category from checked models
ModelCategorizer.prototype.removeCategories = function () {
  var category = this.categoryText.val();
  if (!category) return;
  var checked = $('.modelCheckbox:checked');
  var modelCategorizer = this;
  checked.each(
    function () {
      modelCategorizer.updateCategoriesForCheckElem($(this), category, false);
    }
  );
  this.previewChanges();
  this.updateCustomListPanel();
};

// Adds category to model
ModelCategorizer.prototype.addCategory = function (category, source, id) {
  var categories = this.getCategories(source, id, true);
  if (categories.hasOwnProperty(category)) {
    if (categories[category] === 'del') {
      categories[category] = '';
    }
  } else {
    categories[category] = 'add';
  }
  var labels = $('#labels_' + source + '_' + id);
  this.updateLabelTags(labels, source, id);
};

// Removes category from model
ModelCategorizer.prototype.removeCategory = function (category, source, id) {
  var categories = this.getCategories(source, id, false);
  if (categories && categories.hasOwnProperty(category)) {
    if (categories[category] === 'add') {
      delete categories[category];
    } else if (categories[category] === '') {
      categories[category] = 'del';
    }
  }
  var labels = $('#labels_' + source + '_' + id);
  this.updateLabelTags(labels, source, id);
};

// Retrieves current categories associated with model
ModelCategorizer.prototype.getCategories = function (source, id, create) {
  var fullId = AssetManager.toFullId(source, id);
  var categories = this.modelCategories[fullId];
  if (!categories && create) {
    categories = {};
    this.modelCategories[fullId] = categories;
  }
  return categories;
};


// We got some category information for the model from the backend,
// save it unless we already have a working copy
ModelCategorizer.prototype.cacheCategories = function (fetchedCategory, fullId) {
  // The current category info...
  var categories = this.modelCategories[fullId];
  if (!categories && fetchedCategory) {
    categories = {};
    for (var i = 0; i < fetchedCategory.length; i++) {
      categories[fetchedCategory[i]] = '';
    }

    this.modelCategories[fullId] = categories;
  }
  return categories;
};

// Creats a label for category
//   .searchResultLabel = no change,
//   .searchResultLabel_add = added,
//   .searchResultLabel_del = deleted
// Click on +/- icon on label will cause label to be added/deleted
// Double click on label will initiate search for category
ModelCategorizer.prototype.createLabelTag = function (source, id, category, update) {
  var catClass = 'searchResultLabel';
  if (update) {
    catClass = catClass + ' ' + catClass + '_' + update;
  }
  var label = $('<div></div>')
    .attr('class', 'roundBorder ' + catClass)
    .attr('id', 'labels_' + source + '_' + id + '_' + category)
    .attr('data-id', source + '.' + id)
    .text(category);
  var change = $('<img/>');
  if (update === 'del') {
    // Have add button
    label.click(function (e) {
      this.addCategory(category, source, id);
      this.previewChanges();
      this.updateCustomListPanel();
      e.stopPropagation();
    }.bind(this));
    //change.attr('src','resources/images/16/add.png');
    label.append(change);
  } else if (update === 'add' || update === '') {
    // Have delete button
    label.click(function (e) {
      this.removeCategory(category, source, id);
      this.previewChanges();
      this.updateCustomListPanel();
      e.stopPropagation();
    }.bind(this));
    //change.attr('src','resources/images/16/delete.png');
    label.append(change);
  }
  var search = $('<img/>').attr('src', 'resources/images/16/search.png');
  label.prepend(search);
  search.click(
    function (e) {
      var query = this.categoryField + ':"' + category + '"';
      this.searchController.setSearchText(query);
      this.searchController.search(query);
      e.stopPropagation();
    }.bind(this)
  );
  return label;
};

ModelCategorizer.prototype.createModelElem = function (comp, fullId) {
  var sid = AssetManager.toSourceId(null, fullId);
  var assetManager = this.assetManager;
  var previewUrl = assetManager.getImagePreviewUrl(sid.source, sid.id,
    assetManager.previewImageIndex, assetManager.getAssetInfo(fullId));
  console.log('assetInfo', assetManager.getAssetInfo(fullId), fullId);
  var modelElem = $('<div></div>')
    .append($('<img/>')
      .addClass('previewImage')
      .attr('src', previewUrl))
    .attr('title', fullId)
    .click(this.showModel.bind(this, fullId));
  modelElem.append($('<input/>').attr('type', 'checkbox')
    .attr('class', 'modelCheckbox')
    .attr('id', 'check_' + sid.source + '_' + sid.id + '_' + comp)
    .attr('data-id', sid.source + '.' + sid.id)
    .click(function (e) {
      this.updateNumberChecked();
      this.updateAnnotationsPanel();
      e.stopPropagation();
    }.bind(this))
  );
  return modelElem;
};

// Updates all labels
ModelCategorizer.prototype.updateLabelTags = function (labelTags, source, id) {
  labelTags.empty();
  var fullId = AssetManager.toFullId(source, id);
  // The current category info...
  var categories = this.modelCategories[fullId];
  if (categories) {
    for (var category in categories) {
      if (categories.hasOwnProperty(category)) {
        var update = categories[category];
        var labelTag = this.createLabelTag(source, id, category, update);
        labelTags.append(labelTag);
      }
    }
  }
};

ModelCategorizer.prototype.searchSucceeded = function (source, resultList) {
  this.selectAll.prop('checked', false);
  this.updateNumberChecked();
  this.updateAnnotationsPanel();
  // So we can use the metadata to have correct preview image
  this.assetManager.cacheModelInfos(source, resultList);
};

ModelCategorizer.prototype.onWindowResize = function () {
  this.searchController.onResize();
  this.resizePreviewPanel();
  this.resizeCustomListPanel();
};

ModelCategorizer.prototype.redisplay = function () {
  //        this.modelCanvas.redisplay();
};

ModelCategorizer.prototype.resizePreviewPanel = function () {
  this.labelsPreviewPanel.resize();
};

// Previews changes
ModelCategorizer.prototype.previewChanges = function () {
  this.labelsPreviewPanel.update(this.modelCategories);
};

ModelCategorizer.prototype.clearChanges = function () {
  this.modelCategories = {};
  this.previewChanges();
  this.updateCustomListPanel();
  this.searchController.refreshSearch();
};

// Submits to backend
ModelCategorizer.prototype.submitCategories = function () {
  // Figure out which models need to be updated
  var changedModels = [];
  for (var fullId in this.modelCategories) {
    if (this.modelCategories.hasOwnProperty(fullId)) {
      var changed = 0;
      var updates = [];
      var final = [];
      var categories = this.modelCategories[fullId];
      for (var category in categories) {
        if (categories.hasOwnProperty(category)) {
          var update = categories[category];
          if (update) {
            changed++;
          }
          if (update !== 'del') {
            final.push(category);
          }
          updates.push(update + ':' + category);
        }
      }
      if (changed > 0) {
        // Changed!  Add to changedModels
        var m = {
          modelId: fullId,
          category: final, //  new set of categories
          update: updates  // sequence of update operations
        };
        changedModels.push(m);
      }
    }
  }

  if (changedModels.length === 0) return;

  var params = {
    models: changedModels,
    //            userId: (window.globals)? window.globals.userId : "unknown",
    updateMain: Constants.submitUpdateMain
  };
  var data = params;
  var inputs = $('input');
  inputs.prop('disabled', true);
  $.ajax
  ({
    type: 'POST',
    url: this.submitCategoriesUrl,
    contentType: 'application/json;charset=utf-8',
    data: JSON.stringify(data),
    success: function (response, textStatus, jqXHR) {
      console.log('Categories successfully submitted for ' + changedModels.length + ' models!!!');
      this.clearChanges();
    }.bind(this),
    error: function (jqXHR, textStatus, errorThrown) {
      console.error('Error submitting categories for ' + changedModels.length + ' models!!!');
    },
    complete: function () {
      // Re-enable inputs
      inputs.prop('disabled', false);
    }
  });
};

ModelCategorizer.prototype.updateCategoriesPanel = function () {
  if (!this.categoriesPanel) return;
  this.categoriesPanel.updateSolrLabels();
};

ModelCategorizer.prototype.isOnCustomModelList = function(fullId) {
  return (this.customModelListPanel && this.customModelListPanel.assetIdToLabelMods[fullId]);
};

ModelCategorizer.prototype.addCustomListCategoriesToCached = function (fullId, loadedIdToLabels) {
  var customModels = loadedIdToLabels;
  if (customModels[fullId] && customModels[fullId].length > 0) {
    var categories = this.modelCategories[fullId];
    if (!categories) {
      categories = {};
      this.modelCategories[fullId] = categories;
    }
    // Add these categories as well....
    for (var i = 0; i < customModels[fullId].length; i++) {
      var category = customModels[fullId][i];
      var sid = AssetManager.toSourceId(null, fullId);
      this.addCategory(category, sid.source, sid.id);
    }
  }
};

// Fetch missing model categories (keeps old categories if we have them)
ModelCategorizer.prototype.updateModelCategories = function (resultList, customIdToLabels) {
  for (var i = 0; i < resultList.length; i++) {
    var result = resultList[i];
    if (!this.modelCategories[result.fullId]) {
      this.cacheCategories(result[this.categoryField], result.fullId);
    }
    if (customIdToLabels) {
      this.addCustomListCategoriesToCached(result.fullId, customIdToLabels);
    }
  }
  this.previewChanges();
  this.updateCustomListPanel();
};

ModelCategorizer.prototype.fetchModelCategories = function (ids, customIdToLabels) {
  this.searchController.searchByIds(
    'models3d', ids,
    function(data, textStatus, jqXHR) {
      this.updateModelCategories(data.response.docs, customIdToLabels);
    }.bind(this),
    function(jqXHR, textStatus, errorThrown) {
      console.error('Unable to fetch model categories: ' + textStatus);
      this.updateCustomListPanel();
    }.bind(this)
  );
};

ModelCategorizer.prototype.showModel = function (fullId) {
  this.modelSearchPanelHelper.openModelViewer(fullId /*, 'Model Viewer'*/);
};

ModelCategorizer.prototype.resizeCustomListPanel = function () {
  this.customModelListPanel.resize();
};

ModelCategorizer.prototype.updateCustomListPanel = function () {
  this.customModelListPanel.updateLabels(this.modelCategories);
  this.customModelListPanel.update(this.customModelListPanel.assetIdToLabelMods);
  var customListPanel = this.customModelListPanel;
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
module.exports = ModelCategorizer;
