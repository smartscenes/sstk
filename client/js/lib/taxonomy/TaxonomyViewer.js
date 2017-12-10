'use strict';

define(['assets/AssetManager','search/SearchController', 'model-viewer/SingleModelCanvas',
        'util/IndexSelector', 'Constants', 'util', 'jquery-lazy'],
  function (AssetManager, SearchController, SingleModelCanvas, IndexSelector, Constants, _) {
    function TaxonomyViewer(params) {
      // Container in which the taxonomy tree is displayed
      this.treePanel = params.treePanel;
      // Select for taxonomy tree
      this.taxonomySelectElem = params.taxonomySelectElem;
      // Details panel for selected taxonomy synset
      this.taxonomyDetailsPanel = params.taxonomyDetailsPanel;
      // Info panel for selected taxonomy synset
      this.taxonomyInfoPanel = params.taxonomyInfoPanel;
      // Treemap panel for selected taxonomy synset
      this.taxonomyTreemapPanel = params.taxonomyTreemapPanel;
      // Search panel for taxonomy search results
      this.modelResultsPanel = params.modelResultsPanel;
      // Search text box
      this.taxonomySearchTextElem = params.taxonomySearchTextElem;
      // Search button
      this.taxonomySearchButton = params.taxonomySearchButton;
      // Taxonomy options panel
      this.taxonomyOptionsPanel = params.taxonomyOptionsPanel;
      // Taxonomy search results panel (synset searches)
      this.taxonomySearchResultsPanel = params.taxonomySearchResultsPanel;
      this.taxonomySearchResultsModal = params.taxonomySearchResultsModal;
      // Taxonomy statistics panel (for visualization)
      this.taxonomyStatsPanel = params.taxonomyStatsPanel;
      // Taxonomy measures panel (for displaying priors on width, height, etc)
      this.taxonomyMeasuresPanel = params.taxonomyMeasuresPanel;
      // Iframe to contain preview popup
      this.viewerModal = params.viewerModal;
      this.viewerIframe = params.viewerIframe;
      this.kmzSourceButton = params.kmzSourceButton;
      this.viewerSourceButton = params.viewerSourceButton;
      // Thumbnail switching buttons
      this.thumbnailDecrButton = params.thumbnailDecrButton;
      this.thumbnailIncrButton = params.thumbnailIncrButton;

      //tabs for taxonomy data (jquery UI tabs for synset details, treemap, barchart)
      this.dataTabs = params.dataTabs;

      // Json file holding the taxonomy for display in jstree
      this.jsonFile = params.jsonFile;
      // Json url holding the taxonomy for display in jstree
      this.jsonUrl = params.jsonUrl;
      this.defaultJsonUrl = params.jsonUrl;
      // Where to get more information for taxonomy
      this.searchUrl = params.searchUrl;
      this.defaultSearchUrl = this.searchUrl;
      // How to handle displaying a node in the taxonomy
      this.detailsHandler = params.detailsHandler;
      // Extra search filters
      this.searchModelsFilter = params.searchModelsFilter;
      // Different taxonomies to load
      this.taxonomies = params.taxonomies;
      this.defaultTaxonomy = params.defaultTaxonomy;
      this.relaxedTaxonomySearch = params.relaxedTaxonomySearch;
      // Show 3D preview or use the animated gif
      this.useAnimatedGif = true;
      this.showPreview = false;
      this.usePreviewCanvas = false;

      // Whether to show dropdown for selecting different taxonomies
      this.showTaxonomySelector = true;

      // Whether to show synset OBJ zip file download links
      this.showSynsetOBJzipLinks = false;

      // Include search entries with no models
      this.includeEntriesWithNoModels = true;

      // Whether to show extra debug functionality
      this.debugMode = false;

      this.init();
    }

    TaxonomyViewer.prototype.init = function () {
      this.handleUrlInitParams();  // Ensures that URL params affecting initialization are parsed
      this.thumbnailSelector = new IndexSelector({
        current: -1,
        min: -1,
        max: -1,
        wrap: true
      });
      if (this.taxonomies) {
        for (var name in this.taxonomies) {
          if (this.showDebugTaxonomies || !this.taxonomies[name].debug) {
            this.taxonomySelectElem.append('<option value="' + name + '">' + name + '</option>');
          }
        }
        var that = this;
        this.taxonomySelectElem.change(function () {
          that.taxonomySelectElem.find('option:selected').each(function () {
            var m = $(this).val();
            that.switchTaxonomy(m);
          });
        });
      }

      this.assetManager = new AssetManager(
        {
          autoAlignModels: true,
          autoScaleModels: true,
          useBuffers: true,
          useDynamic: true // set dynamic to be true so our picking will work
        }
      );

      if (!this.useAnimatedGif) {
        // TODO: the 3d preview option is deprecated and can be removed
        this.add3DPreviewOption();
      }
      this.searchController = new SearchController({
        searchPanel: this.modelResultsPanel,
        entriesPerRow: 8,  // TODO: Make dynamic depending on layout size
        nRows: 20,
        showSearchOptions: false,
        getImagePreviewUrlCallback: function (source, id, index, metadata) {
          index = (index === undefined) ? this.thumbnailSelector.current : index;
          return this.assetManager.getImagePreviewUrl(source, id, index, metadata);
        }.bind(this),
        additionalSortOrder: ' hasModel desc, popularity desc',
        onClickResultCallback: this.showModel.bind(this),
        onHoverResultCallback: this.previewCallback,
        appendResultElemCallback: function (source, id, result, elem) {
          if (result.wnlemmas && result.wnlemmas.length > 0) {
            elem.append($('<div style="text-align: center"/>').html(result.wnlemmas[0]));
          }
        },
        loadImagesLazy: true
      });
      this.searchController.source = 'models3d';
      this.assetManager.setSearchController(this.searchController);

      // Set up the jstree (http://www.jstree.com/)
      var searchOptions = { 'case_insensitive': true };
      this.searchOptions = searchOptions;
      if (this.taxonomies && this.defaultTaxonomy) {
        this.taxonomySelectElem.val(this.defaultTaxonomy);
        this.switchTaxonomy(this.defaultTaxonomy);
      } else {
        if (this.jsonUrl) {
          var jsonUrl = this.jsonUrl;
          this.setTreeAjaxSearchOptions(jsonUrl, searchOptions);
          if (!this.jsonFile) {
            this.loadTreeUsingAjax(jsonUrl, searchOptions);
          }
        }
        if (this.jsonFile) {
          this.loadTreeFromFile(this.jsonFile, searchOptions);
        }
      }

      if (this.detailsHandler.searchTaxonomy) {
        this.taxonomySearchTextElem.change(function () { this.searchTaxonomy(); }.bind(this));
        this.taxonomySearchButton.click(function () { this.searchTaxonomy(); }.bind(this));

        this.relaxedTaxonomySearchCheckbox = $('<input/>')
          .attr('type', 'checkbox')
          .attr('id', 'relaxedTaxonomySearchCheckbox')
          .prop('checked', this.relaxedTaxonomySearch)
          .change(function () {
            this.relaxedTaxonomySearch = this.relaxedTaxonomySearchCheckbox.prop('checked');
            console.log(this.relaxedTaxonomySearch);
          }.bind(this));
        var relaxedTaxonomySearchLabel = $('<label></label>').attr('for', 'relaxedTaxonomySearchCheckbox').text('Relaxed search matching');
        this.taxonomyOptionsPanel.append(
          $('<li/>').append(this.relaxedTaxonomySearchCheckbox).append(relaxedTaxonomySearchLabel));

        this.includeEntriesWithNoModelsCheckbox = $('<input/>')
          .attr('type', 'checkbox')
          .attr('id', 'includeEntriesWithNoModelsCheckbox')
          .prop('checked', this.includeEntriesWithNoModels)
          .change(function () {
            this.includeEntriesWithNoModels = this.includeEntriesWithNoModelsCheckbox.prop('checked');
            this.searchController.enableFiltering(!this.includeEntriesWithNoModels);
          }.bind(this));
        var includeEntriesWithNoModelsLabel = $('<label></label>').attr('for', 'includeEntriesWithNoModelsCheckbox').text('Show results with no 3D models');
        this.taxonomyOptionsPanel.append(
          $('<li/>').append(this.includeEntriesWithNoModelsCheckbox).append(includeEntriesWithNoModelsLabel));
      }

      this.detailsHandler.init(this);

      // Get params from URL
      this.handleUrlParams();

      if (this.showTaxonomySelector) {
        this.taxonomySelectElem.removeClass('hidden');
      }
      window.addEventListener('resize', this.onWindowResize.bind(this), false);

      // Construct Treemap
      var TreeMap = require('viz/TreeMap');
      this.treemap = new TreeMap({
        searchUrl: Constants.models3dSearchUrl,
        container: this.taxonomyTreemapPanel,
        taxonomyViewer: this,
        assetManager: this.assetManager,
        showModelCallback: this.showModel.bind(this)
      });

      // Hookup thumbnail switching buttons
      this.thumbnailDecrButton.click(function () {
        this.thumbnailSelector.dec();
        this.searchController.updatePreviewImages(this.thumbnailSelector.value());
        this.treemap.setThumbnail(this.thumbnailSelector.value());
      }.bind(this));

      this.thumbnailIncrButton.click(function () {
        //change thumbnail
        this.thumbnailSelector.inc();
        this.searchController.updatePreviewImages(this.thumbnailSelector.value());
        this.treemap.setThumbnail(this.thumbnailSelector.value());
      }.bind(this));
    };

    TaxonomyViewer.prototype.bindTreeCallbacks_ = function () {
      this.tree.unbind('activate_node.jstree');
      this.tree.bind('activate_node.jstree',
        function (event, data) {
          var node = data.node.original;
          this.showEntityDetails(node.metadata['name'], false);
        }.bind(this)
      );
      this.tree.bind('ready.jstree',
        function (event, data) {
          var defaultEntity = this.currentTaxonomy.defaultEntity;
          this.showEntityDetails(defaultEntity, true);
          this.showTaxonomyTreeNode(defaultEntity);
        }.bind(this)
      );
    };

    TaxonomyViewer.prototype.setTreeAjaxSearchOptions = function (jsonUrl, searchOptions) {
      // Use ajax to figure out what nodes needs to be opened...
      //TODO: Do local search instead of ajax query to server
      searchOptions['ajax'] = {
        'type': 'GET',
        'url': jsonUrl,
        'success': function (data) {
          for (var i = 0; i < data.length; i++) {
            var nodeId = data[i];
            this.tree.jstree('select_node', nodeId, true);
          }
          if (data.length > 0) {
            var nodeId = data[data.length - 1];
            document.getElementById('treePanel').scrollTop = document.getElementById(nodeId).offsetTop;
          }
        }.bind(this)
      };
    };

    TaxonomyViewer.prototype.loadTreeUsingAjax = function (jsonUrl, searchOptions) {
      this.treePanel.empty();
      // Load tree hierarchy using ajax...
      // TODO: Update me
      var treeJsonData = {
        'ajax': {
          'type': 'GET',
          'url': function (node) {
            // "this" is the tree
            var url = jsonUrl;
            if (node !== -1) {
              var nodeId = node.data('name');
              var p = { 'n': nodeId };
              url = url + appendChar + $.param(p);
            }
            console.log('url is ' + url);
            return url;
          },
          'success': function (data) {
            // TODO: add to autocomplete?
            return data;
          }
        }
      };

      this.treePanel.empty();
      this.tree = $('<div class="tree"></div>');
      this.treePanel.append(this.tree);
      this.tree.jstree({
        'core': treeJsonData,
        'search': searchOptions,
        'plugins': ['search']
      });
      this.bindTreeCallbacks_();
    };

    TaxonomyViewer.prototype.loadTreeFromFile = function (jsonFile, searchOptions) {
      this.treePanel.empty();

      $.getJSON(
        jsonFile,
        function (data) {
          this.treePanel.empty();
          this.tree = $('<div class="tree"></div>');
          this.treePanel.append(this.tree);
          this.tree.jstree({
            'core': {
              'data': data,
              'themes': { 'name': 'custom', 'responsive': true, 'stripes': true, 'icons': false }
            },
            'search': searchOptions,
            'plugins': ['search']
          });
          this.bindTreeCallbacks_();
        }.bind(this)
      );
    };

    TaxonomyViewer.prototype.switchTaxonomy = function (name) {
      var tax = this.taxonomies[name];
      if (tax) {
        tax.name = name;
        this.thumbnailSelector.set(tax.defaultScreenshotIndex, tax.minScreenshotIndex, tax.maxScreenshotIndex);
        this.currentTaxonomy = tax;

        if (tax.jsonUrl) {
          this.jsonUrl = tax.jsonUrl;
        } else {
          this.jsonUrl = this.defaultJsonUrl;
        }
        if (tax.jsonFile) {
          this.jsonFile = tax.jsonFile;
        }
        if (this.jsonUrl) {
          var jsonUrl = this.jsonUrl;
          this.setTreeAjaxSearchOptions(jsonUrl, this.searchOptions);
          if (!this.jsonFile) {
            this.loadTreeUsingAjax(jsonUrl, this.searchOptions);
          }
        }
        if (this.jsonFile) {
          this.loadTreeFromFile(this.jsonFile, this.searchOptions);
        }
        if (tax.searchUrl) {
          this.searchUrl = tax.searchUrl;
        } else {
          this.searchUrl = this.defaultSearchUrl;
        }
        this.detailsHandler.searchUrl = this.searchUrl;
        this.detailsHandler.taxonomy = tax;
        this.searchModelsFilter = tax.searchModelsFilter;
        this.detailsHandler.searchModelsFilter = tax.searchModelsFilter;
      } else {
        console.log('Unknown taxonomy: ' + name);
      }
    };

    TaxonomyViewer.prototype.populateTreeSearchAutoComplete = function (data) {
      var names = {};
      var addToNames = function (data) {
        if (!data) return;
        for (var i = 0; i < data.length; i++) {
          names[data[i]['label']] = 1;
          addToNames(data[i]['children']);
        }
      };
      addToNames(data);
      //console.log(names);
      this.treeSearchTextElem.autocomplete({
        source: Object.keys(names)
      });
    };

    TaxonomyViewer.prototype.showModel = function (source, id) {
      var fullId = AssetManager.toFullId(source, id);

      this.viewerIframe.attr('src', 'view-model?modelId=' + fullId);
      //this.viewerIframe.attr("src", "simple-model-viewer2.html?modelId=" + fullId);
      if (this.kmzSourceButton) {
        this.kmzSourceButton.unbind('click');
      }
      this.viewerSourceButton.unbind('click');

      var kmzResult = this.assetManager.getLoadModelInfo(source, id);
      var kmzUrl = kmzResult && kmzResult.file;
      var sourceUrl = this.assetManager.getOriginalSourceUrl(source,id);

      if (this.kmzSourceButton) {
        if (kmzUrl) {
          this.kmzSourceButton.click(function () {
            window.open(kmzUrl);
          });
          this.kmzSourceButton.show();
        } else {
          this.kmzSourceButton.hide();
        }
      }

      if (sourceUrl) {
        this.viewerSourceButton.click(function () {
          window.open(sourceUrl);
        });
        this.viewerSourceButton.show();
      } else {
        this.viewerSourceButton.hide();
      }
      this.viewerModal.modal('show');
      //window.open("simple-model-viewer2.html?modelId=" + fullId, 'Model Viewer')
    };

    TaxonomyViewer.prototype.add3DPreviewOption = function () {
      this.previewCallback = undefined;
      if (this.showPreview) {
        this.previewCallback = this.previewModel.bind(this);
      }

      // Preview frame
      this.previewPanel = $('<span></span>').attr('class','previewPopup');
      if (this.usePreviewCanvas) {
        this.previewFrame = $('<div></div>')
          .attr('id', 'previewFrame');
      } else {
        this.previewFrame = $('<iframe></iframe>')
          .attr('scrolling', 'no')
          .attr('id', 'previewFrame');
      }
      this.previewPanel.hide();
      this.previewPanel.append(this.previewFrame);
      this.previewShowButton = $('<input/>').attr('type', 'button').attr('value', 'Show');
      this.previewPanel.append(this.previewShowButton);

      this.showPreviewCheckbox = $('<input/>')
        .attr('type', 'checkbox')
        .attr('id', 'showPreview3D')
        .prop('checked', this.showPreview)
        .change(function () {
          this.showPreview = this.showPreviewCheckbox.prop('checked');
          if (this.showPreview) {
            this.previewCallback = this.previewModel.bind(this);
          } else {
            this.previewCallback = undefined;
          }
          this.searchController.onHoverResultCallback = this.previewCallback;
          // Update search results callbacks
          var searchResultElems = $('.searchResult');
          searchResultElems.off('hover');
          if (this.previewCallback) {
            var callback = this.previewCallback;
            searchResultElems.hover(function () {
              var result = $(this).data('result');
              callback(result.source, result.id, result, $(this));
            });
          }
        }.bind(this));
      var showPreviewLabel = $('<label></label>').attr('for', 'showPreviewCheckbox').text('3D preview popup on hover');
      this.taxonomyOptionsPanel.append(
        $('<li/>').append(this.showPreviewCheckbox).append(showPreviewLabel));
      $('#pageContainer').append(this.previewPanel);

    };

    TaxonomyViewer.prototype.previewModel = function (source, id, result, elem) {
      var fullId = AssetManager.toFullId(source, id);
      elem.addClass('enlarged');
      var align = elem.attr('enlarge_align');
      if (!align) {
        align = 'center';
      }
      this.previewPanel.show();
      if (this.usePreviewCanvas) {
        if (!this.singleModelCanvas) {
          this.singleModelCanvas = new SingleModelCanvas({ container: this.previewFrame.get(0), assetManager: this.assetManager });
        }
        this.singleModelCanvas.loadModel(source, id);
      } else {
        var url = Constants.baseUrl + '/simple-model-viewer2.html?autoRotate=1&modelId=' + fullId;
        this.previewFrame.attr('src', url);
      }
      this.previewPanel.position({
        my: align,
        at: align,
        of: elem
      });
      this.previewPanel.off('hover');
      this.previewPanel.hover(function () {
      },function () {
        $(this).hide();
        elem.removeClass('enlarged');
      });
      this.previewShowButton.off('click');
      this.previewShowButton.click(function () {
        elem.click();
      });
    };

    TaxonomyViewer.prototype.showTaxonomyStatistics = function (entity, force) {
      // Show taxonomy statistics
      this.getTaxonomyStatistics(entity,
        this.getTaxonomyStatisticsSucceeded.bind(this),
        this.getTaxonomyStatisticsFailed.bind(this));
    };

    TaxonomyViewer.prototype.getTaxonomyStatisticsSucceeded = function (data, textStatus, jqXHR) {
      this.showBarChart(data);
      this.showTreeMap(data);
    };

    TaxonomyViewer.prototype.showBarChart = function (data) {
      this.taxonomyStatsPanel.empty();
      var namedCounts = data.map(function (x) {return { name: x.words, count: x.modelCount }; });

      var BarChart = require('viz/BarChart');
      BarChart.makeHorizontalBarChart({
        data: namedCounts,
        canvas: this.taxonomyStatsPanel.selector,
        width: 400,
        sort: true,
        onClick: function (data, d, i) {
          this.showEntityDetails(data[i].id, false);
          this.showTaxonomyTreeNode(data[i].id);
        }.bind(this, data)
      });
    };

    TaxonomyViewer.prototype.showMeasures = function (measures) {
      this.taxonomyMeasuresPanel.empty();
      if (!measures || !this.debugMode) {  // NOTE: Only show measures in debug mode
        this.taxonomyMeasuresPanel.append('No measure data available');
        return;
      }

      var keys = ['n', 'mean', 'min', 'max', 'var'];
      var table = $('<table></table>').addClass('table table-striped');
      var row = $('<tr></tr>').append($('<th></th>'));
      keys.forEach(function (x) { row.append($('<th></th>').text(x)); });
      table.append(row);
      for (var measure in measures) {
        if (!measures.hasOwnProperty(measure)) {
          continue;
        }
        var stats = measures[measure];
        var measureUnit = measure;
        if (stats['unit']) { measureUnit = measureUnit + ' (' + stats['unit'] + ')'; }
        row = $('<tr></tr>').append($('<td></td>').text(measureUnit));
        keys.forEach(function (x) {
          var s = stats[x];
          if (s) {
            if (measure === 'n') s = s.toPrecision(0);
            //else if (measure !== 'var' && x === 'Price') s = s.toLocaleString('en-US', { currency: 'USD' } );
            else s = s.toLocaleString('en-US', { maximumSignificantDigits: 3 });
          }
          row.append($('<td></td>').text(s || ''));
        });
        table.append(row);
      }
      this.taxonomyMeasuresPanel.append(table);
    };

    TaxonomyViewer.prototype.showTreeMap = function (data) {
      this.taxonomyTreemapPanel.empty();
      var namedCounts = data.map(function (x) {return { name: x.words, count: x.modelCount, id: x.id, parentId: x.parent }; });
      // Check if tree map is currently visible
      var loadTreeMap = this.treemap.container.is(':visible');
      //console.log("Tree map is visible: " + loadTreeMap);
      this.treemap.updateTreeMap(namedCounts, loadTreeMap);
    };

    TaxonomyViewer.prototype.getTaxonomyStatisticsFailed = function (jqXHR, textStatus, errorThrown) {
      console.log('Error getting taxonomy statistics: ' + textStatus);
    };

    TaxonomyViewer.prototype.showEntityDetails = function (entity, force) {
      this.showTaxonomyStatistics(entity, force);
      this.detailsHandler.showEntityDetails(entity, force);
    };

    TaxonomyViewer.prototype.clearEntityDetails = function () {
      this.taxonomyInfoPanel.empty();
      this.taxonomyDetailsPanel.empty();
    };

    TaxonomyViewer.prototype.resetEntityDetails = function (entity) {
      this.taxonomyInfoPanel.empty();
      this.taxonomyDetailsPanel.empty();
      var heading = $('<div id="detailsHeading"></div>').text(entity);
      this.taxonomyDetailsPanel.append(heading);
      var links = $('<div id="weblinks"></div>');
      this.taxonomyDetailsPanel.append(links);
      var webimages = $('<div id="webimages"></div>');
      this.taxonomyDetailsPanel.append(webimages);
    };

    TaxonomyViewer.prototype.searchTaxonomy = function (searchTerm) {
      if (!searchTerm) {
        if (this.taxonomySearchTextElem) {
          searchTerm = this.taxonomySearchTextElem.val();
        }
      }
      if (!searchTerm) return;
      //this.modelResultsPanel.hide();
      this.detailsHandler.searchTaxonomy(searchTerm, this.relaxedTaxonomySearch);
    };

    TaxonomyViewer.prototype.showTaxonomyTreeNode = function (entity) {
      this.tree.jstree('close_all');
      this.tree.jstree('deselect_all');
      this.tree.jstree('search', '#' + entity);
    };

    TaxonomyViewer.prototype.getTaxonomyNode = function (entity, succeededCallback, failedCallback) {
      // TODO: Correct tax
      var queryData = {
        'tax': this.currentTaxonomy.name,
        'n': entity,
        'skipChildren': true
      };
      var method = 'GET';
      $.ajax
      ({
        type: method,
        url: Constants.taxonomyUrl,
        //        url: this.jsonUrl,
        data: queryData,
        //dataType: 'jsonp',
        //jsonp: 'json.wrf',
        success: succeededCallback,
        error: failedCallback,
        timeout: 5000 // ms
      });
    };

    TaxonomyViewer.prototype.getTaxonomyStatistics = function (entity, succeededCallback, failedCallback) {
      // TODO: Correct tax
      var queryData = {
        'tax': this.currentTaxonomy.name,
        'n': entity,
        'stats': 1
      };
      var method = 'GET';
      $.ajax
      ({
        type: method,
        url: Constants.taxonomyUrl,
        //        url: this.jsonUrl,
        data: queryData,
        //dataType: 'jsonp',
        //jsonp: 'json.wrf',
        success: succeededCallback,
        error: failedCallback,
        timeout: 5000 // ms
      });
    };

    TaxonomyViewer.prototype.searchSolr = function (solrUrl, solrQuery, start, limit,
                                                   searchSucceededCallback, searchFailedCallback) {
      var queryData = {
        'q': solrQuery,
        'wt': 'json',
        'start': start,
        'rows': limit
      };
      var method = 'POST';
      $.ajax
      ({
        type: method,
        url: solrUrl,
        data: queryData,
        dataType: 'jsonp',
        jsonp: 'json.wrf',
        success: searchSucceededCallback,
        error: searchFailedCallback,
        timeout: 5000 // ms
      });
    };

    TaxonomyViewer.prototype.getSearchModelSynsetField = function (includeHypernyms) {
      var synsetField = 'wnsynset';
      var hyperSynsetField = 'wnhypersynsets';
      if (this.currentTaxonomy) {
        if (this.currentTaxonomy['searchModelsField']) {
          synsetField = this.currentTaxonomy['searchModelsField'];
        }
        if (this.currentTaxonomy['searchModelsHypernymField']) {
          hyperSynsetField = this.currentTaxonomy['searchModelsHypernymField'];
        }
      }
      if (includeHypernyms) {
        return hyperSynsetField;
      } else return synsetField;
    };

    TaxonomyViewer.prototype.searchModels = function (query) {
      //this.modelResultsPanel.show();
      this.searchController.search(query);
    };

    TaxonomyViewer.prototype.getModelMetaDataURL = function (query) {
      // // TODO(MS): Remove this query fields filtering hack and add parameter
      return this.searchController.getQueryUrl({
        source: 'models3d',
        query: query,
        start: 0,
        limit: 100000,
        fields: 'fullId,wnsynset,wnlemmas,up,front,name,tags',
        format: 'csv'
      });
    };

    TaxonomyViewer.prototype.handleUrlInitParams = function () {
      var params = _.getUrlParams();
      var debug = params['debug'];
      this.debugMode = debug;
      if (debug) {
        this.showDebugTaxonomies = true;
      }
      var stats = params['stats'];
      if (stats) {
        this.showTaxonomyStats = true;
      }
      var showSynsetOBJzipLinks = params['show-synset-obj-zip-links'];
      if (showSynsetOBJzipLinks) {
        this.showSynsetOBJzipLinks = true;
      }
    };

    TaxonomyViewer.prototype.handleUrlParams = function () {
      var params = _.getUrlParams();
      var synsetId = params['synsetId'];
      if (synsetId) {
        this.showEntityDetails(synsetId, false);
      }
      var search = params['search'];
      if (search) {
        this.searchTaxonomy(search);
      }
    };

    TaxonomyViewer.prototype.onWindowResize = function () {
      this.searchController.onResize();
      this.treemap.onResize();
    };

    //switch tabs to either barchart, synset details, or treemap
    TaxonomyViewer.prototype.changeDataTab = function (tabNum) {
      this.dataTabs.tabs({ active: tabNum });
    };

    // Exports
    return TaxonomyViewer;

  });
