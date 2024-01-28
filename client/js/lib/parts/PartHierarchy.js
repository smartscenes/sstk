const Tree = require('ds/Tree');
const Object3DUtil = require('geo/Object3DUtil');
const _ = require('util/util');

class PartHierarchy extends Tree {
  constructor(root) {
    super(root);
  }

  createObjectGroup(node, objs) {
    const g = new THREE.Group();
    g.name = (node.id >= 0)? node.id + "_" + node.name : node.name;
    for (var j = 0; j < objs.length; j++) {
      if (objs[j]) {
        g.add(objs[j]);
      } else {
        console.warn("Missing object for " + node.id + " child " + j);
      }
    }
    if (node.transform) {
      Object3DUtil.setMatrix(g, node.transform);
    }
    _.merge(g.userData, _.omit(node, ["children", "object3D", "obb", "parent"]));
    g.userData.partId = node.id;
    return g;
  };

  attachChildObject3Ds() {
    this.traverse(null,
      node => {
        if (node.children) {
          if (node.object3D) {
            const objs = _.filter(_.map(node.children, 'object3D'));
            _.each(objs, c => node.object3D.add(c));
          } else {
            const objs = _.filter(_.map(node.children, 'object3D'));
            node.object3D = this.createObjectGroup(node, objs);
          }
        }
      }
    );
  }

  clone() {
    let converted = this.convert(p => {
      return p.clone();
    });
    converted.attachChildObject3Ds();
    return converted;
  }
}

module.exports = PartHierarchy;