class Tree {
  constructor(root) {
    this.root = root;
  }

  getNodes(filter) {
    var nodes = [];
    this.traverse(x => {
      if (!filter || filter(x)) {
        nodes.push(x);
      }
    });
    return nodes;
  };

  traverse(cbPre, cbPost, checkPre) {
    this.traverseNode(this.root, cbPre, cbPost, checkPre);
  };

  traverseNode(node, cbPre, cbPost, checkPre) {
    if (cbPre) {
      const traverseMore = cbPre(node);
      if (checkPre && !traverseMore) {
        return; // Stop traversal
      }
    }
    if (node.children) {
      for (let i = 0; i < node.children.length; i++) {
        this.traverseNode(node.children[i], cbPre, cbPost, checkPre);
      }
    }
    if (cbPost) {
      cbPost(node);
    }
  };

  convert(convertFn) {
    const root = this.convertNodes(this.root, convertFn);
    return new this.constructor(root);
  }

  convertNodes(node, convertFn) {
    const converted = convertFn(node);
    if (node.children) {
      converted.children = node.children.map(c => this.convertNodes(c, convertFn));
      converted.children.forEach(c => c.parent = converted);
    }
    return converted;
  }
}

module.exports = Tree;