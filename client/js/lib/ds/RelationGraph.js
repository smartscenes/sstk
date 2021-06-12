/** Small class to manage relations between nodes **/

'use strict';

var _ = require('util/util');

/**
 * Creates a graph with relationship between nodes
 * @param opts
 * @param [opts.nodes] {Node[]} Nodes
 * @param [opts.relations] {Relation[]} Relations between nodes
 * @constructor
 */
function RelationGraph(opts) {
  var nodes = opts.nodes || [];  // All nodes
  var relations = opts.relations || []; // Relations (tuples of relation_id, relation_type, relation_name, nodeIds)
  this.__init(nodes, relations);
}

RelationGraph.prototype.__init = function(nodes, relations) {
  var idre = /[a-zA-Z]*([0-9]+)/;
  function __extractNum(id) {
    var m = id.match(idre);
    if (m) {
      return parseInt(m[1]);
    } else {
      return 0;
    }
  }
  this.nodes = _.keyBy(nodes, 'id');
  this.relations = _.keyBy(relations, 'id');
  this.__nextNodeId = 0;
  if (_.size(this.nodes) > 0) {
    this.__nextNodeId = _.max(_.map(_.keys(this.nodes), __extractNum));
  }
  this.__nextRelationId = 0;
  if (_.size(this.relations) > 0) {
    this.__nextRelationId = _.max(_.map(_.keys(this.relations), __extractNum));
  }

  this.__relationsByNode = _.groupByMulti(relations, 'nodeIds');
};

RelationGraph.prototype.clear = function() {
  this.__init([], []);
};

RelationGraph.prototype.__getNextNodeId = function() {
  return 'n' + this.__nextNodeId++;
};

RelationGraph.prototype.__getNextRelationId = function() {
  return 'r' + this.__nextRelationId++;
};

RelationGraph.prototype.addGroup = function(group_type, group_name, ids, data) {
  var groupId = this.__getNextNodeId();
  this.nodes[groupId] = { id: groupId, type: group_type, name: group_name, children: ids, data: data };
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i];
    this.nodes[id].parents = this.nodes[id].parents || [];
    this.nodes[id].parents.push(id);
  }
  //this.relations.push('GROUP', group_type, _.concat([groupId], ids));
  return this.nodes[groupId];
};

RelationGraph.prototype.removeNode = function(id) {
  var g = this.nodes[id];
  delete this.nodes[id];
  // remove node from children's parents and parents' children
  if (g && g.parents) {
    for (var i = 0; i < g.parents.length; i++) {
      var p = g.parents[i];
      if (p.children) {
        _.pull(p.children, id);
      }
    }
  }
  if (g && g.children) {
    for (var i = 0; i < g.children.length; i++) {
      var c = g.children[i];
      if (c.parents) {
        _.pull(c.parents, id);
      }
    }
  }
  return g;
};

RelationGraph.prototype.addRelation = function(type, name, ids) {
  var relationId = this.__getNextRelationId();
  this.relations[relationId] = { id: relationId, type: type, name: name, nodeIds: ids };
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i];
    this.__relationsByNode[id] = this.__relationsByNode[id] || [];
    this.__relationsByNode[id].push(relationId);
  }
};

RelationGraph.prototype.removeRelation = function(rid) {
  var r = this.relations[rid];
  delete this.relations[rid];
  // Remove relation from this.__relationsByNode
  if (r && r.ids) {
    for (var i = 0; i < r.ids.length; i++) {
      var nid = r.ids[i];
      var rs = this.__relationsByNode[nid];
      if (rs) {
        _.pull(rs, rid);
      }
    }
  }
  return r;
};

RelationGraph.prototype.getNode = function(id) {
  return this.nodes[id];
};

RelationGraph.prototype.getRelation = function(rid) {
  return this.relations[rid];
};

/**
 * Get relations
 * @param opts
 * @param [opts.nodeIds] {string[]}
 * @param [opts.relationType] {string}
 * @param [opts.relationName] {string}
 * @param [opts.checkedNodeIdsOrdering] {boolean}
 * @returns {*}
 */
RelationGraph.prototype.getRelations = function(opts) {
  // Lookup relation by relationType, relationName, relationId or nodeIds
  if (opts.relationId != undefined) {
    var r = this.relations[opts.relationId];
    return r? [r] : [];
  }
  var candidates = [];
  if (opts.nodeIds) {
    candidates = this.__relationsByNode[opts.nodeIds[0]];
    // AND filtering
    for (var i = 1; i < opts.nodeIds.length; i++) {
      var nodeId = opts.nodeIds[i];
      candidates = _.filter(candidates, function(cr) {
        return cr.nodeIds.indexOf(nodeId) >= 0;
      });
    }
    if (opts.checkedNodeIdsOrdering) {
      // Make sure node ids are as ordered
      candidates = _.filter(candidates, function(cr) {
        return _.isEqual(cr.nodeIds, opts.nodeIds);
      });
    }
  } else {
    candidates = _.values(this.relations);
  }
  if (opts.relationType != undefined || opts.relationName != undefined) {
    var filterRelations = function(r) {
      var relTypeMatch = (opts.relationType != undefined) ? r.type === opts.relationType : true;
      var relNameMatch = (opts.relationName != undefined) ? r.name === opts.relationName : true;
      return relTypeMatch && relNameMatch;
    };
    candidates = _.filter(candidates, filterRelations);
  }
  return candidates;
};

/**
 * Node tuple
 * @typedef Node
 * @type {object}
 * @property {string} id
 * @property {string} type
 * @property {string} name
 * @property {string[]} children
 * @property {string[]} parents
 * @property {Object} [data]
 * @property {THREE.Object3D} [object3D]
 */

/**
 * Relation tuple
 * @typedef Relation
 * @type {object}
 * @property {string} id
 * @property {string} type
 * @property {string} name
 * @property {string[]} nodeIds
 */

module.exports = RelationGraph;