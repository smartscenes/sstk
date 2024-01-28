const GraphViz = require('viz/GraphViz');
const ConnectivityGraphHelper = require('articulations/ConnectivityGraphHelper');

class PartConnectivityGraphViz {
  constructor(params) {
    // Container in which the part connectivity graph is displayed
    this.separateConnectedComponents = params.separateConnectedComponents;
    this.__graphParams = params;
    this.selector = params.selector;
    this.container = $(this.selector);
  }

  init() {
    this.__graphs = null;
    this.__graphPopulated = false;
    this.connectivityGraph = null;
  }

  __populateGraphAll(g, connectivityGraph) {
    // Make nodes from parts
    const parts = connectivityGraph.parts;
    const nodeClass = 'graph-PART';
    const edgeClass = 'graph-EDGE';
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const nodeData = part;
      g.setNode(part.pid, {label: part.label, class: nodeClass, data: nodeData});
    }
    // Make edges connecting nodes
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const pids = connectivityGraph.getConnectedPartIds(part.pid);
      for (let pid of pids) {
        if (part.pid < pid) {
          g.setEdge(part.pid, pid,
            {
              class: edgeClass,
              arrowhead: 'undirected'
            });
        }
      }
    }
  }

  __populateGraphConnectedComponent(g, connectivityGraph, component) {
    const indices = component.slice();
    indices.sort();
    // Make nodes from parts
    const parts = connectivityGraph.parts;
    const nodeClass = 'graph-PART';
    const edgeClass = 'graph-EDGE';
    for (let i = 0; i < indices.length; i++) {
      const part = parts[indices[i]];
      const nodeData = part;
      g.setNode(part.pid, {label: part.label, class: nodeClass, data: nodeData});
    }
    // Make edges connecting nodes
    for (let i = 0; i < indices.length; i++) {
      const part = parts[indices[i]];
      const pids = connectivityGraph.getConnectedPartIds(part.pid);
      for (let pid of pids) {
        if (part.pid < pid) {
          g.setEdge(part.pid, pid,
            {
              class: edgeClass,
              arrowhead: 'undirected'
            });
        }
      }
    }
  }

  __getGraphConnectedComponents(connectivityGraph) {
    const connectedComponents = ConnectivityGraphHelper.identifyConnectedComponents(
      connectivityGraph.parts, (i,j) => connectivityGraph.isConnected(i,j));

    // Filter out connected components with just one node
    const filteredComponents = connectedComponents.filter(component => component.length > 1);
    return filteredComponents;
    // filteredComponents.forEach(component => {
    //   this.__populateGraphConnectedComponent(g, connectivityGraph, component);
    // });
  }

  setConnectivityGraph(connectivityGraph) {
    this.connectivityGraph = connectivityGraph;
    this.__graphPopulated = false;
  }

  __populateGraph(connectivityGraph) {
    // Create the input graph
    this.container.empty();
    if (this.separateConnectedComponents) {
      const components = this.__getGraphConnectedComponents(connectivityGraph);
      const row = $('<tr></tr>');
      const table = $('<table></table>').append(row);
      this.container.append(table);
      this.__graphs = components.map( (component,i) => {
        const id = 'graphviz-' + i;
        row.append($(`<td class="graphviz-cell"><span id="${id}"></span></td>`));
        const graphParams = Object.assign({}, this.__graphParams);
        graphParams.selector = '#' + id;
        const graph = new GraphViz(graphParams);
        graph.init();
        graph.createGraph(g => this.__populateGraphConnectedComponent(g, connectivityGraph, component));
        return graph;
      });
    } else {
      const graph = new GraphViz(this.__graphParams);
      graph.init();
      graph.createGraph(g => this.__populateGraphAll(g, connectivityGraph));
      this.__graphs = [graph];
    }
    this.__graphPopulated = true;
  }

  onResize() {
    this.container = $(this.selector);
    // console.log('check container', this.container.is(':visible'));
    if (this.container.is(':visible')) {
      if (!this.__graphPopulated) {
        this.__populateGraph(this.connectivityGraph);
      }
      if (this.__graphs) {
        this.__graphs.forEach(g => g.onResize());
      }
    }
  }
}

// Exports
module.exports = PartConnectivityGraphViz;
