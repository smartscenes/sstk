const GraphViz = require('viz/GraphViz');
const Index = require('ds/Index');

class PartHierarchyGraphViz extends GraphViz {
  constructor(params) {
    super(params);
  }

  __populateGraph(g, object3D, index, parentId) {
    const include = parentId == null || object3D.userData.pid != null;
    const nodeClass = 'graph-PART';
    const edgeClass = 'graph-EDGE';
    if (include) {
      const gid = index.indexOf(object3D.id, true);
      g.setNode(gid, {label: object3D.userData.name, class: nodeClass, data: object3D.userData});
      if (parentId != null) {
        g.setEdge(parentId, gid, { class: edgeClass });
      }
      parentId = gid;
    }
    for (let i = 0; i < object3D.children.length; i++) {
      this.__populateGraph(g, object3D.children[i], index, parentId);
    }
  }

  setHierarchy(root) {
    this.__root = root;
    this.createGraph(g => this.__populateGraph(g, root, new Index()));
  }

}

module.exports = PartHierarchyGraphViz;