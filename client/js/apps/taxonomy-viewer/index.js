'use strict';

// Application entry point
define(['Constants','taxonomy/WordnetTaxonomyDetailsHandler', 'taxonomy/TaxonomyViewer'],
  function (Constants, WordnetTaxonomyDetailsHandler, TaxonomyViewer) {
    var wordnetViewerOptions = {
      'all': {
        jsonFile: 'data/taxonomy/all.wordnet.taxonomy.json',
        debug: true
      },
      'wss': {
        jsonFile: 'data/taxonomy/wss.wordnet.taxonomy.json',
        searchModelsFilter: 'source:wss',
        minScreenshotIndex: 0,
        maxScreenshotIndex: 13,
        defaultScreenshotIndex: 13,
        debug: true
      },
      'archive3d': {
        jsonFile: 'data/taxonomy/archive3d.wordnet.taxonomy.json',
        searchModelsFilter: 'source:archive3d',
        minScreenshotIndex: 0,
        maxScreenshotIndex: 13,
        defaultScreenshotIndex: 13,
        debug: true
      },
      'ShapeNet': {
        jsonFile: 'data/taxonomy/shapenet.synsets.taxonomy.json',
        jsonUrl: Constants.taxonomyUrl + '?tax=shapenet',
        searchUrl: Constants.shapenetSearchUrl,
        searchModelsFilter: 'source:(3dw OR yobi3d)',
        defaultEntity: '02691156',
        debug: false
      },
      'ShapeNetCore': {
        jsonFile: 'data/taxonomy/shapenetcore.taxonomy.json',
        jsonUrl: Constants.taxonomyUrl + '?tax=shapenetcore',
        searchUrl: Constants.shapenetSearchUrl,
        searchModelsFilter: 'source:(3dw OR yobi3d) AND isSingleCleanObject:true AND isAligned:true AND updated:*',
        minScreenshotIndex: 0,
        maxScreenshotIndex: 13,
        defaultScreenshotIndex: 13,
        defaultEntity: '02691156',
        debug: false
      },
      'ShapeNetSem': {
        jsonFile: 'data/taxonomy/shapenetsem.taxonomy.json',
        jsonUrl: Constants.taxonomyUrl + '?tax=shapenetsem',
        searchModelsFilter: 'source:wss',
        searchModelsField: 'category',
        searchModelsHypernymField: 'hypercategory',
        minScreenshotIndex: 0,
        maxScreenshotIndex: 13,
        defaultScreenshotIndex: 13,
        defaultEntity: 'Chair',
        debug: false
      }
    };

    var tabDiv = $('#tab-content');
    var wordnetViewer = new TaxonomyViewer({
      treePanel: $('#treePanel'),
      taxonomySelectElem: $('#taxonomySelect'),
      taxonomyDetailsPanel: $('#taxonomyDetailsPanel'),
      taxonomyInfoPanel: $('#taxonomyInfoPanel'),
      modelResultsPanel: $('#synsetDetailsPanel'),
      taxonomySearchTextElem: $('#taxonomySearchText'),
      taxonomySearchButton: $('#taxonomySearchButton'),
      taxonomySearchResultsPanel: $('#taxonomySearchResultsPanel'),
      taxonomyTreemapPanel: $('#taxonomyTreemapPanel'),
      taxonomyStatsPanel: $('#taxonomyStatsPanel'),
      taxonomyMeasuresPanel: $('#taxonomyMeasuresPanel'),
      taxonomySearchResultsModal: $('#taxonomySearchResultsModal'),
      taxonomyOptionsPanel: $('#searchNavbarOptions'),
      viewerModal: $('#viewerModal'),
      viewerIframe: $('#viewerIframe'),
      kmzSourceButton: $('#kmzSourceButton'),
      viewerSourceButton: $('#viewerSourceButton'),
      thumbnailIncrButton: $('#synsetDetailsLeftButton, #treemapLeftButton'),
      thumbnailDecrButton: $('#synsetDetailsRightButton, #treemapRightButton'),
      dataTabs: tabDiv,
      jsonUrl: Constants.taxonomyUrl + '?tax=wordnet',
      //        jsonUrl: Constants.taxonomyUrl + '?tax=wordnet&desc=true',
      searchUrl: Constants.wordnetSearchUrl,
      detailsHandler: new WordnetTaxonomyDetailsHandler(),
      taxonomies: wordnetViewerOptions,
      defaultTaxonomy: 'ShapeNetCore'
    });

    tabDiv.tabs();
    tabDiv.bind('tabsactivate', function (event, ui) {
      switch (ui.newPanel.attr('id')){
        case 'synsetDetailsTab':
          wordnetViewer.searchController.onResize();
          break;
        case 'taxonomyTreemapTab':
          wordnetViewer.treemap.onResize();
          break;
      }
    }.bind(this));

    // Prevent hiding of dropdown on clicking of contained item
    $('.dropdown-menu').on('click', function (e) {
      if ($(this).hasClass('dropdown-menu-form')) {
        e.stopPropagation();
      }
    });

    //Window.wordnetViewer = wordnetViewer;
  });
