'use strict';

define(['data/DataModel', 'assets/AssetManager'], function (DataModel, AssetManager) {

  //treemap constructor
  function TreeMap(params) {
    this.searchUrl = params.searchUrl;
    this.container = params.container;
    this.height = this.container.height();
    this.width = this.container.width();
    this.treeMapDiv = null;
    this.offsetX = 16;
    this.offsetY = 50;
    this.taxonomyViewer = params.taxonomyViewer;
    this.assetManager = params.assetManager;
    this.fields = ['id', 'source', 'datasets'];
    this.imageHeight = params.imageHeight || 50;
    this.imageWidth = params.imageWidth || 50;
    this.margin = 4;
    this.inspectMode = false;
    this.showModelCallback = params.showModelCallback;
    this.thumbnail = -1;

    this.inspectButton = $('#treemapInspectButton');
    this.inspectButton.click(function () {
      this.toggleInspectMode();
    }.bind(this));

    // Counts for each synset
    // Each synset object contains:
    //  name (name of synset)
    //  id (id of synset)
    //  count (number of models belonging to the synset)
    this.data = undefined;

    // Map of synset id to models belonging to the synset
    this.synsetModels = null;
  }

  // Update treemap with named counts array for synset
  TreeMap.prototype.updateTreeMap = function (namedCounts, loadTreeMap) {
    this.thumbnail = this.taxonomyViewer.thumbnailSelector.value();
    //update data
    this.data = namedCounts;
    this.layoutObject = this.createLayoutObject_();
    var treeLayout = this.getTreeLayout_(this.layoutObject);

    this.createBoundingBox_();
    this.appendSynsetBoxes_(treeLayout);
    if (loadTreeMap) {
      this.populateWithNewModels_(this.layoutObject.children);
    } else {
      this.synsetModels = null;
    }

    if (treeLayout.length === 1) {
      this.taxonomyViewer.changeDataTab(0);
      //append message
      $('#idundefined').append('<h1> This synset is a leaf node and has no children synsets to browse</h1>');
    }
  };

  //creates bounding div for treemap, to be populated by synset boxes with pictures
  TreeMap.prototype.createBoundingBox_ = function () {
    //construct initial bounding div
    var boundingDiv = $('<div></div>')
      .css('width', this.width + 'px')
      .css('height', this.height + 'px')
      .addClass('treeMapDiv')
      .css('text-align', 'left');

    this.treeMapDiv = boundingDiv;
    this.container.append(boundingDiv);
  };

  //loads images into synset boxes of treemap, populates them for data visualization
  TreeMap.prototype.populateWithNewModels_ = function (synsets) {
    this.synsetModels = {};
    var filter = this.taxonomyViewer.currentTaxonomy.searchModelsFilter;

    for (var i = 0; i < synsets.length; i++) {
      var synset = synsets[i];
      //create new query
      var includeHypo = (synset.parentId !== synset.id);
      var constraint = filter + ' AND ' + this.taxonomyViewer.getSearchModelSynsetField(includeHypo) + ':' + synset.id;
      // calculate absolute maximum number of images to speed up data retrieval
      // Minimal value in a row or column should be 1
      var picsPerRow = Math.max(Math.floor(synset.dx / this.imageWidth), 1);
      var picsPerColumn = Math.max(Math.floor(synset.dy / this.imageHeight), 1);
      var nImages = picsPerRow * picsPerColumn;

      var query = new DataModel(this.searchUrl, constraint, this.fields, function (synset, data) {
        this.synsetModels[synset.id] = {
          synset: synset,
          models: data
        };
        this.populateDiv_(synset, data);
      }.bind(this, synset), true, 0, nImages);
      query.queryData();
    }
  };

  TreeMap.prototype.populateWithImages_ = function (synsets) {
    for (var i = 0; i < synsets.length; i++) {
      var synset = synsets[i];
      var s = this.synsetModels[synset.id];
      if (s && s.models) {
        this.populateDiv_(synset, s.models);
      } else {
        console.warn('No models for synset: ' + synset.id);
      }
    }
  };

  //populate individual synset div with images after data is loaded
  TreeMap.prototype.populateDiv_ = function (synset, data) {
    var div = d3.select('#id' + synset.id);
    div.empty();

    var w = this.imageWidth;
    var h = this.imageHeight;

    for (var i = 0; i < data.length; i++) {
      var d = data[i];
      var fullId = AssetManager.toFullId(d.source, d.id);
      //var modelURL = "simple-model-viewer2.html?modelId=" + fullId;
      var url = this.assetManager.getImagePreviewUrl(d.source, d.id, this.thumbnail, d);
      //add actual image
      div.append('img')
        .style('max-width', w + 'px')
        .style('max-height', h + 'px')
        .attr('src', url)
        .attr('modelId', fullId);
    }

    var synsetDiv = $('#id' + synset.id);
    var images = synsetDiv.find('img');
    this.updateClickEvents_(synsetDiv, images);
  };

  //appends synset boxes to treemap
  TreeMap.prototype.appendSynsetBoxes_ = function (synsets) {
    //get treemap div
    var div = d3.select(this.treeMapDiv[0]);
    var offsetX = this.offsetX;
    var offsetY = this.offsetY;

    for (var i = 0; i < synsets.length; i++) {
      var synset = synsets[i];
      //make new synset box
      div.append('div')
        .attr('id', 'id' + synset.id)
        .style('width', synset.dx + 'px')
        .style('height', synset.dy + 'px')
        .style('position', 'absolute')
        .style('top', synset.y + offsetY + 'px')
        .style('left', synset.x + offsetX + 'px')
        .classed('treeDiv', synset.name !== 'TreeMap')
        .append('span')
        .classed('treeDivLabel', true)
        .html('<b>' + this.getSynsetLabel(synset) + '</b>');
    }
  };

  //given a synset, returns a cleaned up title for that block in the treemap
  TreeMap.prototype.getSynsetLabel = function (synset) {
    var name = synset.name;

    //no label if root node
    if (name === 'TreeMap') return '';

    name = name.charAt(0).toUpperCase() + name.slice(1);
    var index = name.indexOf(',');
    return name.substring(0, index === -1 ? name.length : index);
  };

  //returns TreeMap layout object, an object that maps each synset to a box with a width, height
  //and x and y position in the TreeMap
  TreeMap.prototype.getTreeLayout_ = function (layoutObject) {
    return d3.layout.treemap()
      .size([this.width, this.height])
      .nodes(layoutObject);
  };

  //returns the layout object necessary to construct the Treemap, with children being
  //each synset and an associated count value
  TreeMap.prototype.createLayoutObject_ = function () {
    var data = this.data;
    var layoutObject = {};
    // root node under which children will reside
    layoutObject.name = 'TreeMap';
    layoutObject.value = 0;

    //log scale to normalize values
    var scale = this.getValueScale_();

    //children array
    var children = data.map(function (d) {
      return {
        name: d.name,
        id: d.id,
        parentId: d.parentId,
        value: scale(+d.count),
        count: +d.count
      };
    });

    layoutObject.children = children;
    return layoutObject;
  };

  //returns a log scale to normalize count values of synsets
  TreeMap.prototype.getValueScale_ = function () {
    var min = d3.min(this.data, function (d) {
      return +d.count;
    });

    var max = d3.max(this.data, function (d) {
      return +d.count;
    });

    return d3.scale.log()
      .domain([min, max])
      .range([1, 8]);
  };

  //fired when inspect button is clicked
  TreeMap.prototype.toggleInspectMode = function () {
    this.setInspectMode(!this.inspectMode);
  };

  TreeMap.prototype.setInspectMode = function (flag) {
    this.inspectMode = flag;
    var images = this.treeMapDiv.find('img');
    var synsetDivs = this.treeMapDiv.find('.treeDiv');
    this.updateClickEvents_(synsetDivs, images);
  };

  TreeMap.prototype.updateClickEvents_ = function (synsetDivs, images) {
    var treeMap = this;
    if (this.inspectMode) {
      // Inspect mode is on - show model on click
      this.inspectButton.addClass('active');
      this.setSynsetClickEvent_(synsetDivs, false);
      images.unbind('click');
      images.click(function (evt) {
        if (treeMap.showModelCallback) {
          var modelId = $(this).attr('modelId');
          treeMap.showModelCallback('', modelId);
        }
      });
      images.toggleClass('hoverable', true);
    } else {
      // Inspect mode is off - drill down into subcategories on click
      this.inspectButton.removeClass('active');
      this.setSynsetClickEvent_(synsetDivs, true);
      images.unbind('click');
      images.toggleClass('hoverable', false);
    }
  };

  // sets whether the divs are clickable
  TreeMap.prototype.setSynsetClickEvent_ = function (divs, clickable) {
    var taxonomy = this.taxonomyViewer;

    if (clickable) {
      divs.toggleClass('hoverable', true);
      divs.unbind('click');
      divs.click(function () {
        var id = $(this).attr('id').substring(2);
        if (id === 'undefined') return;
        taxonomy.showEntityDetails(id, false);
        taxonomy.showTaxonomyTreeNode(id);
      });
    } else {
      divs.unbind('click');
      divs.toggleClass('hoverable', false);
    }
  };

  //clears taxonomy context
  TreeMap.prototype.clearContainer = function () {
    this.treeMapDiv.html('');
  };

  //refreshes taxonomy- useful when thumbnail view is changed
  TreeMap.prototype.reset = function (fetchModels) {
    this.clearContainer();
    if (!this.layoutObject) {
      this.layoutObject = this.createLayoutObject_();
    }
    var treeLayout = this.getTreeLayout_(this.layoutObject);

    this.appendSynsetBoxes_(treeLayout);
    if (fetchModels || this.synsetModels === null) {
      this.populateWithNewModels_(this.layoutObject.children);
    } else {
      this.populateWithImages_(this.layoutObject.children);
    }
    this.setInspectMode(this.inspectMode);
  };

  TreeMap.prototype.setThumbnail = function (index) {
    this.thumbnail = index;
    this.reset(false);
  };

  TreeMap.prototype.onResize = function () {
    this.height = this.container.height();
    this.width = this.container.width();
    this.reset(false);
  };

  //exports
  return TreeMap;
});
