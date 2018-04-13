'use strict';

define(['lib/Constants', 'assets/AssetManager', 'search/SearchController', 'search/SearchModule',
    'ui/AnnotationsPanel', 'io/FileUtil', 'ui/UIUtil', 'util', 'dragscrollable', 'jquery-lazy'],
  function (Constants, AssetManager, SearchController, SearchModule, AnnotationsPanel, FileUtil, UIUtil, _) {
    // Interface for categorizing models
    function ModelCategorizer(params) {
      // Keep our own copy of categories
      // categories are stored as map:
      //   fullId -> { cat1: 'del', cat2: 'add', cat3: '', ...}
      params = params || {};
      this.submitCategoriesUrl = Constants.baseUrl + '/submitCategories';
      this.modelCategories = {};
      this.selectedModels = {};
      var urlParams = _.getUrlParams();
      var defaults = {
        nImagesPerModel: 14,
        imageIndex: 13
      };
      var allParams = _.defaultsDeep(Object.create(null), urlParams, params, defaults);
      this.nImagesPerModel = allParams['nImagesPerModel'];
      this.defaultImageIndex = allParams['imageIndex'];
      this.init();
    }

    ModelCategorizer.prototype.init = function () {
      this.assetManager = new AssetManager();

      this.categoriesPanel = $('#categoriesPanel');

      // Main search panel where models are displayed
      // Models are displayed in a grid, each model has:
      // - Checkbox (clicking on model checks/unchecks)
      // - Categories associated with model
      //    (listed at top - yellow = no change, green = added, red = deleted)
      this.searchPanel = $('#searchPanel');
      this.searchController = new SearchController({
        searchSucceededCallback: this.searchSucceeded.bind(this),
        getImagePreviewUrlCallback: this.assetManager.getImagePreviewUrl.bind(this.assetManager),
        sourceChangedCallback: this.showCategories.bind(this),
        //   onClickResultCallback: this.modelCanvas.loadModel.bind(this.modelCanvas),
        onClickResultCallback: function (source, id) {
          var checkBox = $('#check_' + source + '_' + id + '_search');
          var checked = checkBox.prop('checked');
          checkBox.prop('checked', !checked);
          this.updateNumberChecked();
          this.updateAnnotationsPanel();
        }.bind(this),
        appendResultElemCallback: function (source, id, result, elem) {
          var fullId = AssetManager.toFullId(source, id);
          elem.data('fullId', fullId);
          if (this.selectedModels[fullId]) {
            elem.addClass('searchResultSelected');
          }
          elem.append($('<input/>').attr('type', 'checkbox')
            .attr('class', 'modelCheckbox')
            .attr('id', 'check_' + source + '_' + id + '_search')
            .attr('data-id', fullId)
            .click(function (e) {
              this.updateNumberChecked();
              this.updateAnnotationsPanel();
              e.stopPropagation();
            }.bind(this))
          );
          var labels = $('<div></div>')
            .attr('class', 'searchResultLabels')
            .attr('id', 'labels_' + source + '_' + id)
            .attr('data-id', fullId);
          this.cacheCategories(result.category, fullId);
          this.addSelectedCategoriesToCached(fullId);
          this.updateLabels(labels, source, id);
          elem.prepend(labels);
          elem.dblclick(this.showModel.bind(this, fullId));
        }.bind(this),
        entriesPerRow: 6,
        nRows: 40,
        searchPanel: this.searchPanel,
        loadImagesLazy: true,
        encodeQuery: false,
        boostFields: []
      });

      // Hook up select all checkbox
      this.selectAll = $('#selectAll');
      this.selectAll.click(
        this.toggleChecked.bind(this)
      );
      this.numCheckedMsg = $('#numCheckedMsg');
      this.updateNumberChecked();

      // At side: panel to add/remove categories for the checked set of models
      // Category text
      this.categoryText = $('#category');
      this.categories = {};
      // Do auto complete for categories
      $.getJSON('resources/data/furnitureCategories.json',
        function (data) {
          this.updateCategories(data, 'json');
        }.bind(this)
      );
      this.updateSolrCategories();

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

      // Hook up selected panel elements
      var selectedAddButton = $('#selectedAdd');
      selectedAddButton.click(this.addToSelected.bind(this));

      var selectedClearButton = $('#selectedClear');
      selectedClearButton.click(this.clearSelected.bind(this));

      var selectedSaveButton = $('#selectedSave');
      selectedSaveButton.click(this.saveSelected.bind(this));

      var selectedLoad = UIUtil.createFileInput({
        id: 'selectLoad',
        label: 'Load',
        style: 'existing',
        hideFilename: true,
        labelButton: $('#selectedLoad'),
        loadFn: function(file) {
          this.loadSelected(file);
        }.bind(this)
      });
      $('#selectedControls').append(selectedLoad.group);

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

      var annotationsPanel = $('#annotationsPanel');
      if (annotationsPanel && annotationsPanel.length > 0) {
        var modelAttributes = ['wnsynset'/*,  'category', 'color', 'material', 'shape', 'depicts',
          'state', 'usedFor', 'foundIn', 'hasPart', 'attr', 'isSingleCleanObject', 'hasMultipleObjects', 'isCollection'*/];
        var readOnlyAttributes = [];
        var attributeLinks = { "wnsynset": {
            solrUrl: Constants.shapenetSearchUrl,
            taxonomy: "shapenet",
            linkType: "wordnet",
            displayField: "wnsynsetkey",  // Field to display
            // Mapping from our field names to linked fields
            // These are also fields that we should populate if the wnsynset changes
            fieldMappings: {
              wnsynsetkey: "wn30synsetkey",
              wnlemmas: "words",
              wnsynset: "synsetid",
              shapenetCoreSynset: "shapenetcoresynsetid",
              //wnsynset: "wn30synsetid"
              // Special fields
              wnhyperlemmas: "wnhyperlemmas", //"ancestors.words",
              wnhypersynsets: "wnhypersynsets", //"ancestors.synsetid"
            }
          }};
        this.annotationsPanel = new AnnotationsPanel({
          container: annotationsPanel,
          attributes: modelAttributes,
          attributesReadOnly: readOnlyAttributes,
          attributeLinks: attributeLinks,
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

    ModelCategorizer.prototype.updateCategories = function (categories, source) {
      this.categories[source] = categories;
      var allCategories = [];
      for (var s in this.categories) {
        if (this.categories.hasOwnProperty(s)) {
          allCategories = allCategories.concat(this.categories[s]);
        }
      }
      this.categoryText.autocomplete({
        source: _.sortedUniq(_.sortBy(allCategories))
      });
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
      this.updateSelectedPanel();
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
      this.updateSelectedPanel();
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
      this.updateLabels(labels, source, id);
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
      this.updateLabels(labels, source, id);
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
    ModelCategorizer.prototype.createLabel = function (source, id, category, update) {
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
          this.updateSelectedPanel();
          e.stopPropagation();
        }.bind(this));
        //change.attr('src','resources/images/16/add.png');
        label.append(change);
      } else if (update === 'add' || update === '') {
        // Have delete button
        label.click(function (e) {
          this.removeCategory(category, source, id);
          this.previewChanges();
          this.updateSelectedPanel();
          e.stopPropagation();
        }.bind(this));
        //change.attr('src','resources/images/16/delete.png');
        label.append(change);
      }
      var search = $('<img/>').attr('src', 'resources/images/16/search.png');
      label.prepend(search);
      search.click(
        function (e) {
          var query = 'category:"' + category + '"';
          this.searchController.setSearchText(query);
          this.searchController.search(query);
          e.stopPropagation();
        }.bind(this)
      );
      return label;
    };

    ModelCategorizer.prototype.createModelElem = function (comp, fullId) {
      var sid = AssetManager.toSourceId(null, fullId);
      var modelElem = $('<div></div>')
        .append($('<img/>')
          .addClass('previewImage')
          .attr('src', this.assetManager.getImagePreviewUrl(sid.source, sid.id)))
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
    ModelCategorizer.prototype.updateLabels = function (labels, source, id) {
      labels.empty();
      var fullId = AssetManager.toFullId(source, id);
      // The current category info...
      var categories = this.modelCategories[fullId];
      if (categories) {
        for (var category in categories) {
          if (categories.hasOwnProperty(category)) {
            var update = categories[category];
            var label = this.createLabel(source, id, category, update);
            labels.append(label);
          }
        }
      }
    };

    ModelCategorizer.prototype.searchSucceeded = function (source, resultList) {
      this.selectAll.prop('checked', false);
      this.updateNumberChecked();
      this.updateAnnotationsPanel();
      //    this.assetManager.cacheModelInfos(source, resultList);
    };

    ModelCategorizer.prototype.onWindowResize = function () {
      this.searchController.onResize();
      this.resizePreviewPanel();
      this.resizeSelectedPanel();
    };

    ModelCategorizer.prototype.redisplay = function () {
      //        this.modelCanvas.redisplay();
    };

    ModelCategorizer.prototype.resizePreviewPanel = function () {
      var previewPane = $('#previewPane');
      var previewNumElem = previewPane.find('#previewNum');
      var viewport = previewPane.find('.scrollableDiv');
      viewport.css('width', previewPane.width() + 'px');
      viewport.css('height', (previewPane.height() - 1 * previewNumElem.height()) + 'px');
    };

    // Previews changes
    ModelCategorizer.prototype.previewChanges = function () {
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
      var nChangedModels = 0;
      var width = 100;
      var height = width;
      var tdCss = {
        'width': width + 'px',
        'min-width': '50px',
        'max-width': width + 'px',
        'max-height': height + 'px'
      };
      for (var fullId in this.modelCategories) {
        if (this.modelCategories.hasOwnProperty(fullId)) {
          var orig = [];
          var changed = [];
          var categories = this.modelCategories[fullId];
          for (var category in categories) {
            if (categories.hasOwnProperty(category)) {
              if (categories[category]) {
                changed.push(category);
              } else {
                orig.push(category);
              }
            }
          }
          if (changed.length > 0) {
            var origElem = $('<div></div>');
            var addElem = $('<div></div>');
            var delElem = $('<div></div>');
            for (var category in categories) {
              if (categories.hasOwnProperty(category)) {
                var update = categories[category];
                var sid = AssetManager.toSourceId(null, fullId);
                var label = this.createLabel(sid.source, sid.id, category, update);
                if (update === 'add') {
                  addElem.append(label);
                } else if (update === 'del') {
                  delElem.append(label);
                } else {
                  origElem.append(label);
                }
              }
            }
            nChangedModels++;
            var modelElem = this.createModelElem('preview', fullId);
            var row = $('<tr></tr>')
              .append($('<td></td>').text(nChangedModels))
              .append($('<td></td>').css(tdCss).append(modelElem))
              .append($('<td></td>').append(origElem))
              .append($('<td></td>').append(addElem))
              .append($('<td></td>').append(delElem));
            previewTable.append(row);
          }
        }
      }
      previewNumElem.text(nChangedModels + ' changed');
    };

    ModelCategorizer.prototype.clearChanges = function () {
      this.modelCategories = {};
      this.previewChanges();
      this.updateSelectedPanel();
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
      var data = jQuery.param(params);
      var inputs = $('input');
      inputs.prop('disabled', true);
      $.ajax
      ({
        type: 'POST',
        url: this.submitCategoriesUrl,
        data: data,
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


    ModelCategorizer.prototype.categorySearchSucceeded = function (data, textStatus, jqXHR) {
      this.categoriesPanel.empty();
      var resultsList = data.facet_counts.facet_fields;
      var categories = resultsList.category;
      for (var i = 0; i < categories.length; i += 2) {
        var category = categories[i];
        var count = categories[i + 1];
        var search = $('<span class="categoryName"></span>').text(category).click(
          function (category, e) {
            var query = 'category:"' + category + '"';
            this.searchController.setSearchText(query);
            this.searchController.search(query);
          }.bind(this, category)
        );
        var categoryElem = $('<div></div>')
          .append(search)
          .append($('<span></span>').text(' (' + count + ')'));
        this.categoriesPanel.append(categoryElem);
      }

      var categoryNames = [];
      for (var i = 0; i < categories.length; i += 2) {
        var category = categories[i];
        categoryNames.push(category);
      }
      this.updateCategories(categoryNames, this.searchController.source);
    };

    ModelCategorizer.prototype.categorySearchFailed = function (jqXHR, textStatus, errorThrown) {
      console.error('Error getting updated categories: ' + textStatus);
    };

    ModelCategorizer.prototype.showCategories = function () {
      this.searchController.facetFieldSearch({
        source: this.searchController.source,
        facetField: 'category',
        facetSort: SearchModule.facetOrderCount,
        success: this.categorySearchSucceeded.bind(this),
        error: this.categorySearchFailed.bind(this)
      });
    };

    ModelCategorizer.prototype.updateSolrCategories = function () {
      this.searchController.facetFieldSearch({
        source: 'models3d',
        facetField: 'category',
        facetSort: SearchModule.facetOrderIndex,
        success: function (data, textStatus, jqXHR) {
          var resultsList = data.facet_counts.facet_fields;
          var categories = resultsList.category;
          var categoryNames = [];
          for (var i = 0; i < categories.length; i += 2) {
            var category = categories[i];
            categoryNames.push(category);
          }
          this.updateCategories(categoryNames, 'models3d');
        }.bind(this)
      });
    };

    ModelCategorizer.prototype.updateSelectedForCheckElem = function (elem, add) {
      var fullId = elem.attr('data-id');
      if (fullId) {
        if (add) {
          this.selectedModels[fullId] = [];
        } else {
          delete this.selectedModels[fullId];
        }
      }
    };

    // Add checked models to selected list
    ModelCategorizer.prototype.addToSelected = function () {
      var checked = this.searchPanel.find('.modelCheckbox:checked');
      var modelCategorizer = this;
      checked.each(
        function () {
          modelCategorizer.updateSelectedForCheckElem($(this), true);
        }
      );
      this.updateSelectedPanel();
    };

    // Removing checked models from selected list
    ModelCategorizer.prototype.removeFromSelected = function () {
      var checked = this.searchPanel.find('.modelCheckbox:checked');
      var modelCategorizer = this;
      checked.each(
        function () {
          modelCategorizer.updateSelectedForCheckElem($(this), false);
        }
      );
      this.updateSelectedPanel();
    };

    ModelCategorizer.prototype.clearSelected = function () {
      this.selectedModels = {};
      this.updateSelectedPanel();
    };

    ModelCategorizer.prototype.saveSelected = function () {
      var categorized = this.getCategorizedSelectedModels();
      console.log(JSON.stringify(categorized, null, ' '));
    };

    ModelCategorizer.prototype.addSelectedCategoriesToCached = function (fullId) {
      if (this.selectedModels[fullId] && this.selectedModels[fullId].length > 0) {
        var categories = this.modelCategories[fullId];
        if (!categories) {
          categories = {};
          this.modelCategories[fullId] = categories;
        }
        // Add these categories as well....
        for (var i = 0; i < this.selectedModels[fullId].length; i++) {
          var category = this.selectedModels[fullId][i];
          var sid = AssetManager.toSourceId(null, fullId);
          this.addCategory(category, sid.source, sid.id);
        }
      }
    };

    // Fetch missing model categories (keeps old categories if we have them)
    ModelCategorizer.prototype.fetchModelCategoriesSucceeded = function (data, textStatus, jqXHR) {
      var resultList = data.response.docs;
      for (var i = 0; i < resultList.length; i++) {
        var result = resultList[i];
        if (!this.modelCategories[result.fullId]) {
          this.cacheCategories(result.category, result.fullId);
        }
        this.addSelectedCategoriesToCached(result.fullId);
      }
      this.previewChanges();
      this.updateSelectedPanel();
    };

    ModelCategorizer.prototype.fetchModelCategoriesFailed = function (jqXHR, textStatus, errorThrown) {
      console.error('Unable to fetch model categories: ' + textStatus);
      this.updateSelectedPanel();
    };

    ModelCategorizer.prototype.fetchModelCategories = function (ids) {
      this.searchController.searchByIds(
        'models3d', ids,
        this.fetchModelCategoriesSucceeded.bind(this),
        this.fetchModelCategoriesFailed.bind(this)
      );

    };

    ModelCategorizer.prototype.loadSelected = function (jsonFile) {
      console.log('loading selected models from ' + jsonFile);
      this.selectedModels = {};
      FileUtil.readAsync(jsonFile, 'json',
        function (error, data) {
          if (error) {
            UIUtil.showAlert(null, 'Error loading file');
          } else {
            console.log(data);
            for (var cat in data) {
              // console.log(cat);
              if (data.hasOwnProperty(cat)) {
                var catIds = data[cat];
                for (var i = 0; i < catIds.length; i++) {
                  var id = catIds[i];
                  if (!this.selectedModels[id]) {
                    this.selectedModels[id] = [cat];
                  } else {
                    this.selectedModels[id].push(cat);
                  }
                }
              }
            }
            //console.log(this.selectedModels);
            this.fetchModelCategories(Object.keys(this.selectedModels));
            //this.updateSelectedPanel();
          }
        }.bind(this)
      );
    };

    ModelCategorizer.prototype.getCategorizedSelectedModels = function () {
      var categorized = {};
      for (var id in this.selectedModels) {
        if (this.selectedModels.hasOwnProperty(id)) {
          //   fullId -> { cat1: 'del', cat2: 'add', cat3: '', ...}
          var selectedCategories = this.selectedModels[id];
          var categories = (selectedCategories.length > 0) ? selectedCategories : this.getCurrentCategories(id);
          if (categories.length === 0) {
            categories.push('__NOCAT__');
          }
          for (var i = 0; i < categories.length; i++) {
            var cat = categories[i];
            if (!categorized[cat]) categorized[cat] = [];
            categorized[cat].push(id);
          }
        }
      }
      return categorized;
    };

    ModelCategorizer.prototype.getCurrentCategories = function (id) {
      var categories = this.modelCategories[id];
      var filteredKeys = [];
      if (categories) {
        for (var cat in categories) {
          if (categories.hasOwnProperty(cat) && (categories[cat] !== 'del')) {
            filteredKeys.push(cat);
          }
        }
      }

      return filteredKeys;
    };

    ModelCategorizer.prototype.showModel = function (fullId) {
      window.open('model-viewer?modelId=' + fullId, 'Model Viewer');
    };

    ModelCategorizer.prototype.resizeSelectedPanel = function () {
      var selectedPane = $('#selectedPane');
      var selectedNumElem = selectedPane.find('#selectedNum');
      var viewport = selectedPane.find('.scrollableDiv');
      viewport.css('width', selectedPane.width() + 'px');
      viewport.css('height', (selectedPane.height() - selectedNumElem.height()) + 'px');
    };

    ModelCategorizer.prototype.updateSelectedPanel = function () {
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

      var totalSelected = Object.keys(this.selectedModels).length;
      selectedNumElem.text(totalSelected + ' selected');

      var width = 100;
      var height = width;
      var tdCss = {
        'width': width + 'px',
        'max-width': width + 'px',
        'max-height': height + 'px'
      };
      var categorized = this.getCategorizedSelectedModels();
      for (var category in categorized) {
        if (categorized.hasOwnProperty(category)) {
          var fullIds = categorized[category];
          var categoryRow = $('<tr></tr>').addClass('selectedCategory')
            .append($('<td colspan="3"></td>')
              .text(category))
            .append($('<td class="selectedCatNum"></td>').text(fullIds.length));
          selectedTable.append(categoryRow);
          for (var i = 0; i < fullIds.length; i++) {
            var fullId = fullIds[i];
            var catElem = $('<div></div>');
            var sid = AssetManager.toSourceId(null, fullId);
            this.updateLabels(catElem, sid.source, sid.id);
            var modelElem = this.createModelElem('selected', fullId);
            var delElem = $('<img/>')
              .addClass('imageButton')
              .attr('src', 'resources/images/16/delete.png')
              .attr('title', 'Remove').attr('alt', 'Remove')
              .click(function (fullId) {
                delete this.selectedModels[fullId];
                this.updateSelectedPanel();
              }.bind(this, fullId));
            var row = $('<tr></tr>')
              .append($('<td></td>').text(i + 1))
              .append($('<td></td>').css(tdCss).append(modelElem))
              .append($('<td></td>').append(catElem))
              .append($('<td></td>').css('text-align', 'right').append(delElem));
            selectedTable.append(row);
          }
        }
      }
      var modelCategorizer = this;
      var searchResultElems = this.searchPanel.find('.searchResult');
      searchResultElems.each(
        function () {
          var fullId = $(this).data('fullId');
          if (modelCategorizer.selectedModels[fullId]) {
            $(this).addClass('searchResultSelected');
          } else {
            $(this).removeClass('searchResultSelected');
          }
        }
      );
    };


    // Exports
    return ModelCategorizer;
  });
