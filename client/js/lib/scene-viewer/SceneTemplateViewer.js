'use strict';

var Constants = require('Constants');
var dagreD3 = function () { return require('dagre-d3'); };

function SceneTemplateViewer(params) {
  // Container in which the scene template is displayed
  this.selector = params.selector;
  this.container = $(this.selector);
  this.fitToGraph = true;
  this.showModelImages = params.showModelImages;
  this.showAllModelImages = params.showAllModelImages;
  this.onClickObjectCallback = params.onClickObjectCallback;
  this.onHoverObjectCallback = params.onHoverObjectCallback;
  this.getObjectImageUrl = params.getObjectImageUrl;
  this.__dagreD3 = dagreD3();
  this.init();
}

SceneTemplateViewer.MIN_WIDTH = 100;
SceneTemplateViewer.MIN_HEIGHT = 100;
SceneTemplateViewer.OBJECT_IMAGE_SIZE = 128;

SceneTemplateViewer.prototype.getAutoWidth = function () {
  return Math.max(SceneTemplateViewer.MIN_WIDTH, this.container.width());
};

SceneTemplateViewer.prototype.getAutoHeight = function () {
  return Math.max(SceneTemplateViewer.MIN_HEIGHT, this.container.height() - this.textElem.height() - 20);
};

SceneTemplateViewer.prototype.init = function () {
  this.textElem = $('<div class="text"></div>');
  this.container.append(this.textElem);

  var canvasWidth = this.getAutoWidth();
  var canvasHeight = this.getAutoHeight();
  this.sceneTemplateElem = d3.select(this.selector)
    .append('svg')
    .attr({'width': canvasWidth, 'height': canvasHeight});
  this.graph = null;
  this.graphRendered = false;


  this.controls = $('<div class="text"></div>');
  this.container.append(this.controls);

  if (this.showModelImages) {
    // Add toggle show all model images button
    var showAllModelImagesButton = $("<span>i</span>");
    showAllModelImagesButton.click(this.toggleShowAllModelImages.bind(this));
    this.controls.append(showAllModelImagesButton);
  }
};

SceneTemplateViewer.prototype.load = function (jsonFile) {
  $.getJSON(jsonFile, this.showSceneParse.bind(this));
};

function pushValue(obj, field, val) {
  if (obj[field]) {
    obj[field].push(val);
  } else {
    obj[field] = [val];
  }
}

SceneTemplateViewer.prototype.showSceneParse = function (scene) {
  // Associate scene objects with scene template
  if (scene.template) {
    for (var i = 0; i < scene.object.length; i++) {
      var obj = scene.object[i];
      if (obj.hasOwnProperty('objectDescIndex') && obj['objectDescIndex'] >= 0) {
        var odi = obj['objectDescIndex'];
        var templateObj = scene.template.object[odi];
        pushValue(templateObj, 'objIndex', i);
      }
    }

    // Associate text spans with scene elements
    if (scene.template.sceneElemTextSpan) {
      for (var ti = 0; ti < scene.template.sceneElemTextSpan.length; ti++) {
        var se = scene.template.sceneElemTextSpan[ti];
        if (se.elem.elemType === 'OBJECT') {
          var oi = se.elem.elemIndex;
          var obj = scene.template.object[oi];
          if (se.textSpan) {
            pushValue(obj, 'textSpan', se.textSpan);
          }
        } else if (se.elem.elemType === 'OBJECT_ATTRIBUTE') {
          var ai = se.elem.elemIndex;
          var oi = se.elem.parentIndex;
          var obj = scene.template.object[oi];
          if (se.textSpan) {
            pushValue(obj.attribute[ai], 'textSpan', se.textSpan);
          }
        }
        //console.log(se);
      }
    }
    // Make sure textSpans are ordered and nonoverlapping
    // Also add imageUrl
    // TODO: Make sure nonoverlapping
    for (var i = 0; i < scene.template.object.length; i++) {
      var obj = scene.template.object[i];
      if (obj.textSpan && obj.textSpan.length > 0) {
        obj.textSpan.sort(function (a, b) {
          return a.start - b.start;
        });
      }
      if (obj['objIndex']) {
        if (obj['objIndex'].length === 1 && this.getObjectImageUrl) {
          obj['imageUrl'] = this.getObjectImageUrl(obj['objIndex'][0]);
        }
      }
    }

    this.showSceneTemplate(scene.template);
  }
};

SceneTemplateViewer.prototype.highlightTextSpan = function (text, spans) {
  if (spans !== this.textSpans) {
    var textElem = this.textElem;
    // TODO: Refactor somewhere
    if (spans) {
      // Assume sorted and nonoverlapping
      textElem.empty();
      var prevEnd = 0;
      var span;
      for (var i = 0; i < spans.length; i++) {
        span = spans[i];
        if (span.start > prevEnd) {
          var beforeHL = text.substring(prevEnd, span.start);
          textElem.append($('<span></span>').text(beforeHL));
        }
        var atHL = text.substring(span.start, span.end);
        textElem.append($('<span class="highlight"></span>').text(atHL));
        prevEnd = span.end;
      }
      if (text.length > prevEnd) {
        var afterHL = text.substring(span.end, text.length);
        textElem.append($('<span></span>').text(afterHL));
      }
    } else {
      textElem.text(text);
    }
    this.textSpans = spans;
  }
};

// Helper functions for working with scene templates
function getAttributes(attributes, name) {
  if (attributes) {
    return attributes.filter(function (x) {
      return x.name === name;
    });
  } else {
    return [];
  }
}

function getAttribute(attributes, name) {
  var attrs = getAttributes(attributes, name);
  if (attrs.length > 0) {
    return attrs[0].value;
  }
}

function getIsInferred(attributes) {
  var inferred = getAttribute(attributes, 'source');
  return inferred === 'inferred';
}

function adjustGraphPositioning(svg, g, minWidth, minHeight) {
  // Resize svg
  var newWidth = Math.max(minWidth, g.graph().width);
  var newHeight = Math.max(minHeight, g.graph().height + 40);
  svg.attr({'width': newWidth, 'height': newHeight});
  // Center the graph
  var svgGroup = svg.select('g');
  var xCenterOffset = (svg.attr('width') - g.graph().width) / 2;
  svgGroup.attr('transform', 'translate(' + xCenterOffset + ', 20)');
  svg.attr('height', g.graph().height + 40);
}

SceneTemplateViewer.prototype.updateGraphPosition = function (svg, g, minWidth, minHeight) {
  if (this.fitToGraph) {
    minWidth = g.graph().width + SceneTemplateViewer.OBJECT_IMAGE_SIZE;
    this.textElem.css('max-width', minWidth);
    minHeight = this.getAutoHeight();
  }
  adjustGraphPositioning(svg, g, minWidth, minHeight);
};

SceneTemplateViewer.prototype.renderGraph = function (svg, g, sceneTemplate) {
  // Create the renderer
  var render = new this.__dagreD3.render();
  // Run the renderer. This is what draws the final graph.
  var svgGroup = svg.select('g');
  render(svgGroup, g);

  var scope = this;
  var nodes = svgGroup.selectAll('g.node');
  nodes.on('click',
    function (d) {
      var v = d;
      var objNode = g.node(v);
      scope.highlightTextSpan(sceneTemplate.text, objNode.data.textSpan);
      if (scope.onClickObjectCallback) {
        var objIndex = objNode.data.objIndex;
        scope.onClickObjectCallback(objIndex);
      }
      console.log(g.node(v));
    }
  );

  nodes.on('mouseover',
    function (d) {
      var v = d;
      var objNode = g.node(v);
      if (scope.onHoverObjectCallback) {
        var objIndex = objNode.data.objIndex;
        scope.onHoverObjectCallback(objIndex);
      } else {
        var visibility = (scope.showAllModelImages) ? 'hidden' : 'visible';
        d3.select(this).selectAll('image').style('visibility', visibility);
      }
    }
  ).on('mouseout',
    function (d) {
      var visibility = (scope.showAllModelImages) ? 'visible' : 'hidden';
      d3.select(this).selectAll('image').style('visibility', visibility);
    }
  );

  //nodes.attr("title", function(d) {
  //    var objNode = g.node(d);
  //    return objNode.description;
  //  }
  //).each(function(v) { $(this).tipsy({ gravity: "w", opacity: 1, html: false }); });

  if (this.showModelImages) {
    var sz = SceneTemplateViewer.OBJECT_IMAGE_SIZE;
    nodes.filter(function (d, i) {
        var objNode = g.node(d);
        return objNode.data && objNode.data.imageUrl;
      })
      .append('image')
      .attr('xlink:href', function (d, i) {
        var objNode = g.node(d);
        return objNode.data.imageUrl;
      })
      .attr('x', -sz / 2)
      .attr('y', -sz / 2)
      .attr('width', sz)
      .attr('height', sz)
      .style('visibility', 'hidden')
      .style('overflow', 'visible');
  }

  this.updateGraphPosition(svg, g, svg.attr('width'), svg.attr('height'));
  this.graphRendered = true;
};

SceneTemplateViewer.prototype.toggleShowAllModelImages = function () {
  this.setShowAllModelImages(!this.showAllModelImages);
};

SceneTemplateViewer.prototype.setShowAllModelImages = function (flag) {
  this.showAllModelImages = flag;
  var visibility = (this.showAllModelImages) ? 'visible' : 'hidden';
  var svg = this.sceneTemplateElem;
  svg.selectAll('image').style('visibility', visibility);
};

SceneTemplateViewer.prototype.showSceneTemplate = function (sceneTemplate) {
  var ignoreAttributes = ['modelId', 'objIndex', 'corefId', 'part', 'source'];
  // Take scene template and create a graph
  this.textElem.text(sceneTemplate.text);
  this.textSpans = undefined;

  // Create the input graph
  var g = new this.__dagreD3.graphlib.Graph()
    .setGraph({})
    .setDefaultEdgeLabel(function () {
      return {};
    });

  // Make nodes from object and attributes
  var attrIndex = sceneTemplate.object.length;
  for (var i = 0; i < sceneTemplate.object.length; i++) {
    var obj = sceneTemplate.object[i];
    var nodeData = obj;
    var isInferred = getIsInferred(obj.attribute);
    var nodeClass = (isInferred) ? 'graph-OBJECT-inferred' : 'graph-OBJECT';
    g.setNode(obj.index, { label: obj.category, class: nodeClass, data: nodeData });
    if (obj.attribute) {
      for (var ai = 0; ai < obj.attribute.length; ai++) {
        // Add attributes
        var attr = obj.attribute[ai];
        var isIgnore = ignoreAttributes.indexOf(attr.name) >= 0;
        if (!isIgnore) {
          g.setNode(attrIndex, { label: attr.value, class: 'graph-ATTRIBUTE', data: attr });
          g.setEdge(obj.index, attrIndex, { label: attr.name });
          attrIndex++;
        }
      }
    }
    if (obj.count && obj.count > 1) {
      g.setNode(attrIndex, { label: obj.count, class: 'graph-ATTRIBUTE', data: {} });
      g.setEdge(obj.index, attrIndex, { label: 'count' });
      attrIndex++;
    }
  }
  // Make edges connecting nodes
  if (sceneTemplate.constraint) {
    for (var j = 0; j < sceneTemplate.constraint.length; j++) {
      var rel = sceneTemplate.constraint[j];
      // Assume binary spatial relation with two args (both of which are nodes...)
      // Not quite the case...
      var isInferred = getIsInferred(rel.attribute);
      var edgeClass = (isInferred) ? 'graph-CONSTRAINT-inferred' : 'graph-CONSTRAINT';
      g.setEdge(rel.arg[0], rel.arg[1],
        {
          label: rel.name,
          class: edgeClass
        });
    }
  }

  g.nodes().forEach(function (v) {
    var node = g.node(v);
    // Round the corners of the nodes
    node.rx = node.ry = 5;
  });

  var svg = this.sceneTemplateElem;
  svg.selectAll('*').remove();
  var svgGroup = svg.append('g');
  this.graph = g;
  this.sceneTemplate = sceneTemplate;
  if (this.container.is(':visible')) {
    this.renderGraph(svg, this.graph, this.sceneTemplate);
  } else {
    this.graphRendered = false;
  }
};

SceneTemplateViewer.prototype.onResize = function () {
  var canvasWidth = this.getAutoWidth();
  var canvasHeight = this.getAutoHeight();
  var svg = this.sceneTemplateElem;

  // Center the graph
  var svgGroup = svg.select('g');
  if (svgGroup && this.graph) {
    if (!this.graphRendered) {
      svg.attr({'width': canvasWidth, 'height': canvasHeight});
      this.renderGraph(svg, this.graph, this.sceneTemplate);
    } else {
      this.updateGraphPosition(svg, this.graph, canvasWidth, canvasHeight);
    }
  } else {
    svg.attr({'width': canvasWidth, 'height': canvasHeight});
  }
};

SceneTemplateViewer.prototype.submit = function () {
};

// Exports
module.exports = SceneTemplateViewer;
