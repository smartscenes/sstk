'use strict';

var Constants                 = require('Constants');
var ModelInstance             = require('model/ModelInstance');
var Object3DUtil              = require('geo/Object3DUtil');
var PubSub                    = require('PubSub');
var ScenePriors               = require('scene/ScenePriors');
var SearchController          = require('search/SearchController');
var UILog                     = require('editor/UILog');
var _                         = require('util/util');
require('jquery-ui');

/**
 * Controls for querying for a model using surrounding 3D scene and other objects as context.
 * These controls supports "smart" object insertion and replacements by suggesting what objects to place
 *  based on selection (e.g. point clicked, bounding box) and context (e.g. support object, and support surface normal).
 * To facilitate testing of different conditions of the controls, there are various flags that can be turned on and off.
 * @param params
 * @param params.container
 * @param params.picker {controls.Picker}
 * @param [params.queryResultsContainer=#contextQueryResultsContainer] {string} Selector for container in which to display the query results
 * @param [params.scene] {THREE.Scene} Scene (call {@link reset} to update when scene is switched)
 * @param [params.sceneState] {scene.SceneState} Scene state (call {@link reset} to update when scene is switched)
 * @param [params.camera] {THREE.Camera} Camera (call {@link reset} to update when scene is switched)
 * @param [params.controls] {controls.SceneEditControls} Scene edit controls (call {@link reset} to update when scene is switched)
 * @param [params.sceneType] {string} Scene type to use when querying priors (call {@link reset} to update when scene is switched)
 * @param [params.defaultSceneType=Room] {string} Default scene type to use (if `sceneType` is unspecified)
 * @param [params.useScenePriors=false] {boolean} Whether to use semantic priors (e.g. statistics of what goes on what) in suggesting models for placement.
 * @param [params.useOrientationPriors=false] {boolean} Whether to suggest orientation based on previously observed orientation statistics.
 * @param [params.useObjectCounts=true] {boolean}
 * @param [params.includeHyperCategories=true] {boolean}
 * @param [params.useSuggestedPlacements=false] {boolean} Whether to query for suggestions of placement of object based on position and normal
 * @param [params.showPriorsViz=false] {boolean} Whether to show visualization (bar chart) of distribution of object categories
 * @param [params.groupCategories=true] {boolean} Whether to group models representing the same categories together.
 * @param [params.allowGroupExpansion=false] {boolean} Whether to allow expansion of representative instance for each category and show more results for that category
 * @param [params.autoLoad=true] {boolean} Whether the first suggested object should be automatically loaded and inserted into the scene.
 * @constructor
 * @memberOf controls
 */
function ContextQueryControls(params) {
  PubSub.call(this);

  // query dialog variables
  this.queryResultsContainer = params.queryResultsContainer || $('#contextQueryResultsContainer');
  this.queryResultsContainer.draggable();
  this.sceneType = params.sceneType;
  this.defaultSceneType = params.defaultSceneType || 'Room';  // Default scene type if no sceneType...

  this.useScenePriors = params.useScenePriors;
  /* Allow for different orientations and select best orientation */
  this.useOrientationPriors = params.useOrientationPriors;
  /* Include object counts */
  this.useObjectCounts = (params.useObjectCounts == undefined) ? true : params.useObjectCounts;
  /* Include broader categories */
  this.includeHyperCategories = (params.includeHyperCategories == undefined) ? true : params.includeHyperCategories;
  // Query for and use suggested placements
  this.useSuggestedPlacements = params.useSuggestedPlacements;
  this.showPriorsViz = params.showPriorsViz || false;
  // Group models representing the same category together
  this.groupCategories = (params.groupCategories == undefined) ? true : params.groupCategories;
  // Whether to allow expansion of representative instance for each category
  this.allowGroupExpansion = params.allowGroupExpansion;


  this.searchSucceededCallback = params.searchSucceededCallback;
  this.onClickResultCallback = params.onClickResultCallback;
  this.getImagePreviewUrlCallback = params.getImagePreviewUrlCallback;
  this.representativeModelsFilter = params.representativeModelsFilter;
  // Autoload (i.e. insert first object)
  this.autoLoad = (params.autoLoad == undefined)? true : params.autoLoad;

  // Callback when query controls are closed
  this.onCloseCallback = params.onCloseCallback;

  this.uilog = params.uilog;
  this.defaultSource = params.source || 'wss';

  this.scenePriors = new ScenePriors({
    succeededCallback: this.__doSearch.bind(this),
    failedCallback: this.__doSearch.bind(this),
    timeout: 30000
  });

  this.createCloseButton();
  this.searchPanel = $('<div class="searchPanel"></div>');
  this.queryResultsContainer.append(this.searchPanel);
  var searchControllerOptions = {
    searchSucceededCallback: this.searchSucceededCallback,
    getImagePreviewUrlCallback: this.getImagePreviewUrlCallback,
    onClickResultCallback: this.onClickResultCallback,
    expandGroupCallback: this.allowGroupExpansion ? function (group) {
      if (group.fields && group.fields.length === 1) {
        var field = group.fields[0];
        this.__expandCategory(field.value);
      }
    }.bind(this) : undefined,
    showAnimatedOnHover: false,
    sources: [this.defaultSource],
    searchPanel: this.searchPanel,
    previewImageIndex: 13,
    tooltipIncludeAll: false,
    loadImagesLazy: true,
    nRows: 60,
    entriesPerRow: 3,
    panelType: 'overlay',
    showSearchOptions: true,
    showSearchSourceOption: false,
    showSearchSortOption: false,
    showSearchBySize: false,
    showSearchHistoryPrevNext: false,
    sortOrder: 'score desc',
    additionalSortOrder: 'id asc'
  };
  if (params.searchOptions) {
      searchControllerOptions = _.merge(searchControllerOptions, params.searchOptions);
  }
  this.searchController = new SearchController(searchControllerOptions);
  this.searchController.setSearchCallback(this.search.bind(this));

  if (searchControllerOptions.showSceneModels) {
    var scope = this;
    this.searchController.searchPanel.showCurrentModelsButton = $('<input type="button" value="Used" class="searchButton"/>');
    this.searchController.searchPanel.showCurrentModelsButton.click(function () {
      var modelIdCounts = scope.sceneState.getModelIdCounts(function(m) { return !m.model.isScan(); });
      var modelIds = _.sortBy(_.keys(modelIdCounts), function(k) { return -modelIdCounts[k]; });
      scope.searchController.searchByIds(null, modelIds);
    });
  }
  this.searchController.searchPanel.searchButton.after(this.searchController.searchPanel.showCurrentModelsButton);


  this.priorsViz = $('<div class="priorsViz"></div>');
  if (!this.showPriorsViz) { this.priorsViz.hide(); }
  this.searchController.searchPanel.insertBeforeSearchBox(this.priorsViz);

  this.placementInfo = null;
  this.isActive = false;
  this.enabled = true;

  this.scene = params.scene;
  this.sceneState = params.sceneState;
  this.camera = params.camera;
  this.controls = params.controls;
  this.container = params.container;
  this.picker = params.picker;

  this.__activeCursor = 'initial';
  this.__mouseMoveCursor = 'help';
}

ContextQueryControls.prototype = Object.create(PubSub.prototype);
ContextQueryControls.prototype.constructor = ContextQueryControls;

Object.defineProperty(ContextQueryControls.prototype, 'isAutoLoadActive', {
  get: function () {
    return this.autoLoad && !(this.placementInfo && this.placementInfo.op === 'replace');
  }
});

Object.defineProperty(ContextQueryControls.prototype, 'mouseMoveCursor', {
  get: function () {
    return this.__mouseMoveCursor;
  }
});

/**
 * Reset controls for use with a new scene
 * @param params Configuration
 * @param [params.scene] {THREE.Scene} Scene
 * @param [params.sceneState] {scene.SceneState} Scene state
 * @param [params.camera] {THREE.Camera} Camera
 * @param [params.controls] {controls.SceneEditControls} Scene edit controls
 * @param [params.sceneType] {string} Scene type to use when querying priors
 */
ContextQueryControls.prototype.reset = function (params) {
  params = params || {};
  this.sceneType = params.sceneType || this.sceneType;
  this.scene = params.scene || this.scene;
  this.sceneState = params.sceneState || this.sceneState;
  this.camera = params.camera || this.camera;
  this.controls = params.controls || this.controls;

  this.query = { queryString: '' };
  this.queryResultsContainer.css('visibility','hidden');
  this.searchController.setSearchText('');
  this.placementInfo = null;
  this.active = false;
  this.__suggestedPlacementsByCategory = null;
  console.log('sceneType is ' + this.sceneType);
  if (!this.sceneType && this.sceneType !== '') {
    this.sceneType = this.defaultSceneType;
  }
  //this.sceneType = this.defaultSceneType;
};

Object.defineProperty(ContextQueryControls.prototype, 'active', {
  get: function active() {
    return this.isActive;
  },
  set: function active(flag) {
    if (this.isActive !== flag) {
      this.isActive = flag;
      if (flag) {
        this.container.style.cursor = this.__activeCursor;
        $('#contextQueryToolHelp').css('visibility','visible');
        this.Publish('ContextQueryActive');
      } else {
        this.container.style.cursor = 'initial';
        this.reset();
        $('#contextQueryToolHelp').css('visibility','hidden');
        this.Publish('ContextQueryInactive');
      }
    }
  }
});

/**
 * What to do when mouse down event happens
 * Override for customized mouse interaction.
 * @param event {MouseEvent}
 */
ContextQueryControls.prototype.onDocumentMouseDown = function (event) {
};

/**
 * What to do when mouse move event happens
 * Override for customized mouse interaction.
 * @param event {MouseEvent}
 */
ContextQueryControls.prototype.onDocumentMouseMove = function (event) {
};

/**
 * What to do when mouse up event happens.
 * Override for customized mouse interaction.
 * Default behavior is to get the intersected point in 3D,
 *   use the clicked object surface as the support surface,
 *   and query the backend for a appropriate object to be placed there.
 * @see onQueryRegionMarked
 * @param event {MouseEvent}
 */
ContextQueryControls.prototype.onDocumentMouseUp = function (event) {
  if (this.enabled) {
    var supportObjects = (this.scene.supportObjects) ? this.scene.supportObjects : this.scene.selectables;
    var mouse = this.picker.getCoordinates(this.container, event);
    var intersects = this.picker.getIntersected(mouse.x, mouse.y, this.camera, supportObjects);
    if (intersects.length) {
      var norm = this.picker.getIntersectedNormal(intersects[0]);
      if (norm.y < -0.5) { norm.y = -norm.y; }  // HACK for flipped normal intersections
      var bbFaceIndexWorld = norm ? Object3DUtil.findClosestBBFaceByInNormal(norm) : Constants.BBoxFaceCenters.BOTTOM;
      this.placementInfo = {
        position: intersects[0].point,
        supportParent: intersects[0].object,
        supportNormal: norm,
        yRotation: 0,
        attachmentIndex: bbFaceIndexWorld
      };
      console.log(this.placementInfo);
      this.onQueryRegionMarked();
    } else {
      this.placementInfo = null;
    }
  }
};

ContextQueryControls.prototype.__getLayoutOptions = function () {
  var config = this.useOrientationPriors ?
  {
    'sceneLayout.opt.orientChildToSurface': 'true',
    'sceneLayout.opt.orientChildOptions': 'ALL',//'CARDINAL4', 'CARDINAL8', 'ALL',
    'sceneLayout.opt.rotateWallObjects': 'false',
    'sceneLayout.opt.normalizePlacements': 'false'
  } :
  {
    'sceneLayout.opt.orientChildToSurface': 'false',
    'sceneLayout.opt.orientChildOptions': 'NONE',//'CARDINAL4', 'CARDINAL8', 'ALL',
    'sceneLayout.opt.rotateWallObjects': 'false',
    'sceneLayout.opt.normalizePlacements': 'false'
  };
  return config;
};

/**
 * A query region was selected.
 * Query the backend for an appropriate suggestion of what to place there.
 */
ContextQueryControls.prototype.onQueryRegionMarked = function () {
  if (this.placementInfo) {
    // We have some initial region at which the object should be placed
    // Call our backend for suggestions on what which be placed there, and how it should be oriented
    var pi = this.placementInfo;
    this.uilog.log(UILog.EVENT.CONTEXT_QUERY_STARTED, null,
      { position: pi.position, normal: pi.supportNormal }
    );
    // Prepares the query container to display search results
    this.priorsViz.empty();
    this.searchController.searchPanel.setResultMessage('Waiting for search results...');
    this.__showQueryContainer();  // Make sure query container is visible
    if (this.useScenePriors) {
      // Use priors on what should go at this location based on parent category
      var config = this.__getLayoutOptions();
      var parentCategory = this.getCategoryOfObject(pi.supportParent, 'Room');
      if (this.useSuggestedPlacements && pi.position && pi.supportNormal) {
        // Try to suggest orientation of object based on position and surface normal
        this.scenePriors.queryPlacement({
          sceneType: this.sceneType,
          useObjectCounts: this.useObjectCounts,
          supportParentCategory: parentCategory,
          includeHyperCategories: this.includeHyperCategories,
          sceneState: this.sceneState,
          queryRegion: {
            position: pi.position,
            supportParent: pi.supportParent,
            supportNormal: pi.supportNormal
          },
          config: config
        });
      } else {
        // Only use category based priors for what object should go here
        this.scenePriors.getChildCategoryGivenSupportParent(this.sceneType, parentCategory);
      }
    } else {
      // Don't use priors, just do some random searching
      this.__doSearch();
    }
  }
};

//ContextQueryControls.prototype.__queryPlacementForObjectCategory = function (objectCategory) {
//  var config = this.__getLayoutOptions();
//  var parentCategory = this.getCategoryOfObject(pi.supportParent, 'Room');
//  if (this.useSuggestedPlacements && pi.position && pi.supportNormal) {
//    this.scenePriors.queryPlacement({
//      sceneType: this.sceneType,
//      useObjectCounts: this.useObjectCounts,
//      objectCategory: objectCategory,
//      supportParentCategory: parentCategory,
//      includeHyperCategories: this.includeHyperCategories,
//      sceneState: this.sceneState,
//      queryRegion: {
//        position: pi.position,
//        supportParent: pi.supportParent,
//        supportNormal: pi.supportNormal
//      },
//      config: config
//    });
//  }
//};

ContextQueryControls.prototype.getQueryRegionPoints = function () {
  // Return points delineating query region
  if (this.placementInfo) {
    return [this.placementInfo.position];
  }
};

ContextQueryControls.prototype.createCloseButton = function () {
  this.closeButton = $('<button></button>')
    .attr('type', 'button').attr('class', 'close').attr('aria-label','Close')
    .append($('<span style="font-size:25pt;">&times</span>'));
  this.closeButton.click(this.close.bind(this));
  this.queryResultsContainer.append(this.closeButton);
};

ContextQueryControls.prototype.close = function () {
  this.uilog.log(UILog.EVENT.CONTEXT_QUERY_FINISHED, null, null);
  this.onCloseCallback();
};

ContextQueryControls.prototype.getCategoryOfObject = function (obj, defaultValue) {
  if (obj) {
    var modelInst = Object3DUtil.getModelInstance(obj);
    if (modelInst) {
      return modelInst.model.getCategory();
    }
  }
  return defaultValue;
};

ContextQueryControls.prototype.replace = function (modelInstanceOrObject, options) {
  options = options || {};
  // Person want to replace this item
  var modelInstance = (modelInstanceOrObject instanceof ModelInstance) ? modelInstanceOrObject : undefined;
  var object = modelInstanceOrObject.object3D || modelInstanceOrObject;
  if (!modelInstance) {
    modelInstance = Object3DUtil.getModelInstance(object);
  }
  // population from modelInstance...
  var attachmentIndex = object.userData['attachmentIndex'];
  if (attachmentIndex == undefined) {
    attachmentIndex = Constants.BBoxFaceCenters.BOTTOM;
  }
  var position = Object3DUtil.getBBoxFaceCenter(object, attachmentIndex);
  var norm = Object3DUtil.InNormals[attachmentIndex];
  this.placementInfo = {
    position: position,
    supportParent: object.parent,
    supportNormal: norm,
    yRotation: 0,
    attachmentIndex: attachmentIndex, // child
    lastChosenObject: modelInstance,
    op: 'replace',
    replaceObject: modelInstance,
    replaceObjectQuaternion: object.getWorldQuaternion(new THREE.Quaternion())
  };
  // do context query with this category and orientation
  // (TODO: indicate this is a replace, and upweigh our category and current orientation)
  console.log(this.placementInfo);
  var cats = modelInstance.model.getCategories();
  if (options.restrictCategories && cats && cats.length) {
    // Keep it to this category (can have instance level search)
    var catPriors = cats.map(function (x) { return { category: x, score: 1.0 }; });
    this.__doSearch(catPriors);
  } else {
    this.onQueryRegionMarked();
  }
};

ContextQueryControls.prototype.onReplace = function (sceneState, modelInstance) {
  console.log('onReplace');
  console.log(this.placementInfo);
  var placementInfo = this.placementInfo;
  var mInstToRemove;
  if (placementInfo.lastChosenObject) {
    mInstToRemove = placementInfo.lastChosenObject;
    var indexToRemove = sceneState.modelInstances.indexOf(mInstToRemove);
    sceneState.removeObjects([indexToRemove]);
  }
  placementInfo.lastChosenObject = modelInstance;
  sceneState.addObject(modelInstance);

  // Orient object
  var selectedObject = modelInstance.object3D;
  var suggestedPlacement;
  var category;
  if (this.useSuggestedPlacements && this.__suggestedPlacementsByCategory && modelInstance.model.info) {
    var categories = modelInstance.model.info.category;
    if (categories) {
      for (var i = 0; i < categories.length; i++) {
        var cat = categories[i];
        var p = this.__suggestedPlacementsByCategory[cat];
        if (p) {
          suggestedPlacement = p;
          category = cat;
          break;
        }
      }
    }
  }

  if (suggestedPlacement && suggestedPlacement.placement) {
    console.log('suggested for ' + category);
    console.log(suggestedPlacement);
    var p = suggestedPlacement.placement;
    console.log(p);
    if (!p.objFrame) {
      var te = p.objFrameToWorld;
      var transform = new THREE.Matrix4();
      transform.set(te[0], te[4], te[8], te[12],
        te[1], te[5], te[9], te[13],
        te[2], te[6], te[10], te[14],
        te[3], te[7], te[11], te[15]
      );
      p.objFrameToWorldMat = transform;
      //var sceneTransformMatrixInverse = new THREE.Matrix4();
      //sceneTransformMatrixInverse.copy(this.scene.matrixWorld).invert();
      //p.objFrameToSceneMat = new THREE.Matrix4();
      //p.objFrameToSceneMat.multiplyMatrices(sceneTransformMatrixInverse, p.objFrameToWorldMat);
      // Get rotation out
      var quaternion = new THREE.Quaternion();
      var position = new THREE.Vector3();
      var scale = new THREE.Vector3();
      p.objFrameToWorldMat.decompose(position, quaternion, scale);
      p.objFrame = { transform: transform, position: position, quaternion: quaternion, scale: scale };
    }
    //if (!p.childQuaternion) {
    //  var te = p.childRotation;
    //  var mat = new THREE.Matrix4();
    //  mat.set(te[0], te[3], te[6], 0,
    //    te[1], te[4], te[7], 0,
    //    te[2], te[5], te[8]), 0,
    //    0, 0, 0, 1;
    //  p.childQuaternion = new THREE.Quaternion();
    //  p.childQuaternion.setFromRotationMatrix(mat);
    //}
    //var oldQuaternion = selectedObject.quaternion.clone();
    //console.log(oldQuaternion);
    selectedObject.quaternion.multiply(p.objFrame.quaternion);
  } else if (this.placementInfo.replaceObject) {
    var sameCat = this.placementInfo.replaceObject.model.hasCategory(modelInstance.model.getCategory());
    var useModelOrientation = sameCat;  // TODO: Fix
    if (useModelOrientation) {
      selectedObject.quaternion.copy(this.placementInfo.replaceObjectQuaternion);
    } else {
      selectedObject.rotateOnAxis(new THREE.Vector3(0, 1, 0), placementInfo.yRotation);
    }
  } else {
    selectedObject.rotateOnAxis(new THREE.Vector3(0, 1, 0), placementInfo.yRotation);
  }
  Object3DUtil.clearCache(selectedObject);
  Object3DUtil.placeObject3DByBBFaceCenter(selectedObject, placementInfo.position, placementInfo.attachmentIndex);
  Object3DUtil.attachToParent(selectedObject, placementInfo.supportParent, this.scene);
  this.Publish('ContextQueryModelInserted', modelInstance);
  return mInstToRemove;
};

// Performs search with default query as filter
ContextQueryControls.prototype.filter = function () {
  var filteredQuery = this.query.queryString;
  var searchTerm = this.searchController.getSearchText('');
  if (searchTerm.length) {
    filteredQuery = searchTerm + ' AND ' + this.query.queryString;
    this.uilog.log(UILog.EVENT.CONTEXT_QUERY_FILTER, null, { filterString: searchTerm, query: filteredQuery });
    this.searchController.search(filteredQuery);
  }
};

// Performs search without filter
ContextQueryControls.prototype.search = function () {
  var searchTerm = this.searchController.getSearchText('');
  if (searchTerm) {
    var searchQuery = this.__getSearchTermQuery(searchTerm);
    this.uilog.log(UILog.EVENT.CONTEXT_QUERY_SEARCH, null, { query: searchQuery, searchTerm: searchTerm });
    this.searchController.search(searchQuery);
  }
};

// Performs search without filter
ContextQueryControls.prototype.searchByTerm = function (searchTerm, showSearchPanel, callback) {
  if (searchTerm) {
    this.searchController.setSearchText(searchTerm);
  } else {
    searchTerm = this.searchController.getSearchText('');
  }
  if (searchTerm) {
    var searchQuery = this.__getSearchTermQuery(searchTerm);
    this.uilog.log(UILog.EVENT.CONTEXT_QUERY_SEARCH, null, { query: searchQuery, searchTerm: searchTerm });
    this.searchController.search(searchQuery, callback);
  }
  if (showSearchPanel) {
    this.__showQueryContainer();
  }
};

ContextQueryControls.prototype.__getSearchTermQuery = function(searchTerm) {
  return searchTerm;
};

ContextQueryControls.prototype.__processCategoryPriors = function (rawCategoryPriors) {
  //console.log(categoryPriors);
  var scope = this;
  if (rawCategoryPriors && Array.isArray(rawCategoryPriors)) {
    var categoryPriors = rawCategoryPriors.filter(function (x) { return x.score > 0; }); // filter
    var BarChart = require('viz/BarChart');
    var barchart = new BarChart({
      key: { name: 'category', label: 'category' },
      value: { name: 'score', label: 'score' },
      data: categoryPriors,
      dom: this.priorsViz,
      width: 100,
      height: 100,
      bars: 'vertical',
      onClickFn: function (item) {
        // Drill down for this one category
        //console.log(item);
        scope.__expandCategory(item.category);
      }
    });
    var categories = categoryPriors.map(function (x) { return x.category; });
    return categories;
  }
};

ContextQueryControls.prototype.__constructQueryString = function (categories) {
  var categoriesQueryString = '';
  if (categories && Array.isArray(categories) && categories.length) {
    categoriesQueryString = this.searchController.getQuery('category', categories);
  }
  var and = ' AND ';
  var queryString = 'source:' + this.defaultSource;
  if (categoriesQueryString) {
    queryString = queryString + and + categoriesQueryString;
  }
  return queryString;
};

ContextQueryControls.prototype.__constructQuery = function (categories) {
  var customOptions = {};
  if (categories && Array.isArray(categories) && categories.length) {
    if (this.groupCategories) {
      customOptions['group'] = true;
      customOptions['group.query'] = categories.map(function (x) { return 'category:' + x; });
      //customOptions['group.limit'] = 2; // number of entries to return per group
    }
  }

  var queryString = this.__constructQueryString(categories);
  var query = {
    queryString: queryString,
    customOptions: customOptions
  };
  return query;
};

ContextQueryControls.prototype.__expandCategory = function (category) {
  var queryString = this.__constructQueryString([category]);
  this.__sendSearchQuery({ queryString: queryString, isExpandedGroup: true });
};

// Initiate query by sending it
ContextQueryControls.prototype.__sendSearchQuery = function (query) {
  if (typeof query === 'string') {
    query = { queryString: query };
  }
  this.__showQueryContainer();  // Make sure query container is visible
  this.searchController.source = this.defaultSource;
  this.searchController.search(_.defaults({ searchText: query.queryString, start: 0 }, query.customOptions), null, {
    isExpandedGroup: query.isExpandedGroup, ensureGroupedModelsUnique: true });
  this.uilog.log(UILog.EVENT.CONTEXT_QUERY_MODELS_STARTED, event, { queryString: query.queryString });
};

// Initial query for models after clicking or creating bbox
ContextQueryControls.prototype.__doSearch = function (categoryPriors) {
  console.log('got placement suggestions');
  console.log(categoryPriors);
  this.__suggestedPlacementsByCategory = categoryPriors?
    _.keyBy(categoryPriors, 'category') : undefined;
  var categories = this.__processCategoryPriors(categoryPriors);
  if (categories && categories.length === 0) {
    this.searchController.setResultList(this.defaultSource, []);
    this.__showQueryContainer();  // Make sure query container is visible
  } else {
    this.query = this.__constructQuery(categories);
    if (this.representativeModelsFilter) {
      var query = _.clone(this.query);
      query.queryString = query.queryString + ' AND ' + this.representativeModelsFilter;
      this.__sendSearchQuery(query);
    } else {
      this.__sendSearchQuery(this.query);
    }
  }
};

ContextQueryControls.prototype.__showQueryContainer = function () {
  var regionPts = this.getQueryRegionPoints();
  // convert from 3D to 2D screen coords
  var pos = this.__topRightCoordinate(regionPts);
  pos.y = THREE.MathUtils.clamp(pos.y, 100,
    this.container.clientHeight - this.queryResultsContainer.height() - 100);

  if (pos.x > this.container.clientWidth - 350) {  // right side
    pos.x = this.__topLeftCoordinate(regionPts).x - this.queryResultsContainer.width();
    pos.x -= 120;
  } else {  // left side
    pos.x += 120;
  }
  pos.x = THREE.MathUtils.clamp(pos.x, 30, pos.x + 1);

  this.queryResultsContainer.css('left', pos.x + 'px');
  this.queryResultsContainer.css('top', pos.y + 'px');
  this.queryResultsContainer.css('visibility', 'visible');
};

/**
 * Create and show a little dialog prompting the user to enter/select the sceneType
 */
ContextQueryControls.prototype.showSceneTypeDialog = function () {
  var sceneType = this.sceneType || '';
  var scope = this;
  bootbox.dialog({
      title: 'Please select a scene type.',
      message: '<div class="row">  ' +
      '<div class="col-md-12"> ' +
      '<form class="form-horizontal"> ' +
      '<div class="form-group ui-front"> ' +  // ui-front for jquery autocomplete
      '<label class="col-md-4 control-label" for="name">Scene Type</label> ' +
      '<div class="col-md-4"> ' +
      '<input id="cqcSceneType" name="sceneType" type="text" placeholder="' + sceneType + '" class="form-control input-md"> ' +
      //'<span class="help-block">Type of scene you are trying to create</span> </div> ' +
      '</div> ' +
      '</div> </div>' +
      '</form> </div>  </div>',
      buttons: {
        success: {
          label: 'Ok',
          className: 'btn-success',
          callback: function () {
            scope.sceneType = $('#cqcSceneType').val();
            console.log(sceneType);
          }
        }
      }
    }
  );
  var sceneTypes = ['LivingRoom', 'Bathroom', 'LaundryRoom', 'Bedroom', 'Kitchen', 'Study', 'Laboratory',
                    'Desk', 'DiningTable', 'Bookshelf', 'Room'];
  $('#cqcSceneType').autocomplete({
    source: sceneTypes,
    minLength: 0
  });
};

// TODO: Refactor this to be somewhere more generic
ContextQueryControls.prototype.__topRightCoordinate = function (points3D) {
  var pos = {};
  pos.x = Number.MIN_SAFE_INTEGER;
  pos.y = Number.MAX_SAFE_INTEGER;
  for (var i = 0; i < points3D.length; i++) {
    var curr2DLoc = this.__pixelCoordinates(points3D[i]);
    pos.x = Math.max(pos.x, curr2DLoc.x);
    pos.y = Math.min(pos.y, curr2DLoc.y);
  }
  return pos;
};

ContextQueryControls.prototype.__topLeftCoordinate = function (points3D) {
  var pos = {};
  pos.x = Number.MAX_SAFE_INTEGER;
  pos.y = Number.MAX_SAFE_INTEGER;
  for (var i = 0; i < points3D.length; i++) {
    var curr2DLoc = this.__pixelCoordinates(points3D[i]);
    pos.x = Math.min(pos.x, curr2DLoc.x);
    pos.y = Math.min(pos.y, curr2DLoc.y);
  }
  return pos;
};

ContextQueryControls.prototype.__pixelCoordinates = function (point3D) {
  var vector = point3D.clone().project(this.camera);
  vector.x = (vector.x + 1) / 2 * this.container.clientWidth;
  vector.y = -(vector.y - 1) / 2 * this.container.clientHeight;
  return vector;
};

module.exports = ContextQueryControls;
