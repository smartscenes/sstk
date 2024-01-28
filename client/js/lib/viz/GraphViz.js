const dagreD3 = function () { return require('dagre-d3'); };

function adjustGraphPositioning(svg, g, opts) {
  // Resize svg
  const pad0 = opts.padding[0];
  const pad1 = opts.padding[1];
  const newWidth = Math.max(opts.minWidth, g.graph().width + pad0*2);
  const newHeight = Math.max(opts.minHeight, g.graph().height + pad1*2);
  svg.attr({'width': newWidth, 'height': newHeight});
  // Center the graph horizontally
  const svgGroup = svg.select('g');
  const xCenterOffset = (svg.attr('width') - g.graph().width) / 2;
  const yCenterOffset = pad1;
  svgGroup.attr('transform', 'translate(' + xCenterOffset + ',' +  yCenterOffset + ')');
//  svg.attr('height', g.graph().height + pad1*2);
}

class GraphViz {
  constructor(params) {
    // Container in which the part connectivity graph is displayed
    this.selector = params.selector;
    this.container = $(this.selector);
    this.fitToGraph = true;
    this.onClickNodeCallback = params.onClickNodeCallback;
    this.onHoverNodeCallback = params.onHoverNodeCallback;
    this.__dagreD3 = dagreD3();

    this.minWidth = params.minWidth || 100;
    this.minHeight = params.minHeight || 100;
    this.padding = params.padding || [0,0];
  }

  computeWidth() {
    return Math.max(this.minWidth, this.container.width());
  }

  computeHeight() {
    return Math.max(this.minHeight, this.container.height());
  }

  init() {
    const canvasWidth = this.computeWidth();
    const canvasHeight = this.computeHeight();
    this.__svgElement = d3.select(this.selector)
      .append('svg')
      .attr({'width': canvasWidth, 'height': canvasHeight});
    this.__graphViz = null;
    this.__graphRendered = false;
  }

  __updateGraphPosition(svg, g, minWidth, minHeight) {
    if (this.fitToGraph) {
      minWidth = g.graph().width;
      minHeight = this.computeHeight();
    }
    adjustGraphPositioning(svg, g, {
      minWidth: minWidth,
      minHeight: minHeight,
      padding: this.padding
    });
  };

  __hookupEvents(svgGroup, g) {
    // TODO: override
    const scope = this;
    const nodes = svgGroup.selectAll('g.node');
    if (scope.onClickNodeCallback) {
      nodes.on('click',
        function (d) {
          const node = g.node(d);
          scope.onClickNodeCallback(node.data);
          // console.log(g.node(d));
        }
      );
    }

    if (scope.onHoverNodeCallback) {
      nodes.on('mouseover',
        function (d) {
          const node = g.node(d);
          scope.onHoverNodeCallback(node.data, true);
        }
      ).on('mouseout',
        function (d) {
          const node = g.node(d);
          scope.onHoverNodeCallback(node.data, false);
        }
      );
    }
  }


  __renderGraph(svg, g) {
    // Create the renderer
    const render = new this.__dagreD3.render();
    // Run the renderer. This is what draws the final graph.
    const svgGroup = svg.select('g');
    render(svgGroup, g);

    this.__hookupEvents(svgGroup, g);

    this.__updateGraphPosition(svg, g, svg.attr('width'), svg.attr('height'));
    this.__graphRendered = true;
  }

  __updateGraph(g) {
    const svg = this.__svgElement;
    svg.selectAll('*').remove();
    const svgGroup = svg.append('g');
    this.__graphViz = g;
    if (this.container.is(':visible')) {
      this.__renderGraph(svg, this.__graphViz);
    } else {
      this.__graphRendered = false;
    }
  }

  __makeObjectNodesCornersRound(g, roundness) {
    g.nodes().forEach(function (v) {
      const node = g.node(v);
      // Round the corners of the nodes
      node.rx = node.ry = roundness;
    });
  }

  createGraph(populateGraph) {
    // Create the input graph
    const g = new this.__dagreD3.graphlib.Graph()
      .setGraph({})
      .setDefaultEdgeLabel(function () {
        return {};
      });

    populateGraph(g);

    this.__makeObjectNodesCornersRound(g, 5);
    this.__updateGraph(g);
  }

  onResize() {
    const canvasWidth = this.computeWidth();
    const canvasHeight = this.computeHeight();
    const svg = this.__svgElement;

    // Center the graph
    const svgGroup = svg.select('g');
    if (svgGroup && this.__graphViz) {
      if (!this.__graphRendered) {
        svg.attr({'width': canvasWidth, 'height': canvasHeight});
        this.__renderGraph(svg, this.__graphViz);
      } else {
        this.__updateGraphPosition(svg, this.__graphViz, canvasWidth, canvasHeight);
      }
    } else {
      svg.attr({'width': canvasWidth, 'height': canvasHeight});
    }
  }

}

// Exports
module.exports = GraphViz;
