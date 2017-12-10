var _ = require('util');

function ContainmentMap() {
  this.nodes = {};
}

ContainmentMap.prototype.__add = function(a,b) {
  if (this.nodes[a.id] && this.nodes[a.id].inside.has(b.id)) {
    var pair = 'contains(' + a.id + ', ' + b.id + ')';
    console.log('Skipping ' + pair + ' already has inside(' + a.id + ',' + b.id + ')');
    return;
  }
  if (this.nodes[b.id] && this.nodes[b.id].contains.has(a.id)) {
    var pair = 'contains(' + a.id + ', ' + b.id + ')';
    console.log('Skipping ' + pair + ' already has contains(' + b.id + ',' + a.id + ')');
    return;
  }
  console.log('adding contains(' + a.id + ', ' + b.id + ')');
  if (!this.nodes[a.id]) {
    this.nodes[a.id] = { node: a, contains: new Set([b.id]), inside: new Set() };
  } else {
    this.nodes[a.id].contains.add(b.id);
  }
  if (!this.nodes[b.id]) {
    this.nodes[b.id] = { node: b, contains: new Set(), inside: new Set([a.id]) };
  } else {
    this.nodes[b.id].inside.add(a.id);
  }
};

ContainmentMap.prototype.get = function(id) {
  return this.nodes[id];
};

ContainmentMap.prototype.getContainers = function() {
  return _.filter(this.nodes, function(x) { return x.contains.size > 0; });
};

ContainmentMap.prototype.getSmallestContainer = function(filter) {
  // Returns id of smallest container along with the nodes it contains
  var filtered = _.filter(this.nodes, function(v,k) {
    var ok = !filter || filter(v.node);
    return ok && v.contains.size > 1;
  });
  console.log(filtered);
  if (filtered.length > 0) {
    var smallest = _.minBy(filtered, function(v) {
      return v.node.bbox.volume();
    });
    return smallest;
  }
};

ContainmentMap.prototype.addPair = function(a,b) {
  if (a.bbox.isEq(b.bbox)) { return; } // Ignore
  if (a.bbox.contains(b.bbox)) {
    this.__add(a, b);
  }
  if (b.bbox.contains(a.bbox)) {
    this.__add(b, a);
  }
};

ContainmentMap.prototype.remove = function(node) {
  var m = this.nodes[node.id];
  console.log('removing ' + node.id);
  var scope = this;
  if (m) {
    var cs = m.contains;
    cs.forEach(function(id) {
      var n = scope.nodes[id];
      if (n) {
        n.inside.delete(node.id);
      }
    });

    var is = m.inside;
    is.forEach(function(id) {
      var n = scope.nodes[id];
      if (n) {
        n.contains.delete(node.id);
      }
    });
  }
  delete this.nodes[node.id];
};

ContainmentMap.prototype.addAllPairs = function(nodes1, nodes2) {
  var scope = this;
  if (nodes1.forEach && nodes2.forEach) {
    nodes1.forEach(function (a) {
      nodes2.forEach(function (b) {
        if (a.id === b.id) return; // Ignore these
        scope.addPair(a, b);
      });
    });
  } else {
    _.forEach(nodes1, function (a) {
      _.forEach(nodes2, function (b) {
        if (a.id === b.id) return; // Ignore these
        scope.addPair(a, b);
      });
    });
  }
};

ContainmentMap.prototype.addAll = function(nodes) {
  var scope = this;
  if (nodes.forEach) {
    nodes.forEach(function (a) {
      nodes.forEach(function (b) {
        if (a.id >= b.id) return; // Ignore these
        scope.addPair(a, b);
      });
    });
  } else {
    _.forEach(nodes, function (a) {
      _.forEach(nodes, function (b) {
        if (a.id >= b.id) return; // Ignore these
        scope.addPair(a, b);
      });
    });
  }
};

module.exports = ContainmentMap;
