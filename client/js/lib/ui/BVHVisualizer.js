// Utility for visualizing BVH hierarchies with jstree

var TreeVisualizer = require('scene/SceneHierarchyPanel');
var BVH = require('geo/BVH');
var Object3DUtil = require('geo/Object3DUtil');
var SceneUtil = require('scene/SceneUtil');
var ConfigControls = require('ui/ConfigControls');
var _ = require('util');

function BVHVisualizer(params) {
  params.allowLoadSave = false; //  Load save not supported for BVH
  this.showObjectsAtAllNodes = false;
  TreeVisualizer.call(this, params);
  this.__bvh = null;
}

BVHVisualizer.prototype = Object.create(TreeVisualizer.prototype);
BVHVisualizer.prototype.constructor = BVHVisualizer;

BVHVisualizer.prototype.init = function () {
  TreeVisualizer.prototype.init.call(this);
  this.bvhConfigControls = new ConfigControls({
    container: this.configPanel,
    prefix: this.__prefix,
    options: [{
      id: 'splitStrategy',
      name: 'splitStrategy',
      text: 'Split strategy',
      type: 'number',
      values: BVH.SplitStrategy,
      defaultValue: BVH.DefaultOptions.splitStrategy
    }, {
      id: 'axisChoiceStrategy',
      name: 'axisChoiceStrategy',
      text: 'Axis choice strategy',
      type: 'number',
      values: BVH.AxisChoiceStrategy,
      defaultValue: BVH.DefaultOptions.axisChoiceStrategy
    }, {
      id: 'includeArchitecture',
      name: 'includeArchitecture',
      text: 'Include rooms (wall, floor, ceiling)',
      type: 'string',
      values: ['exclude', 'include', 'obstacle'],
      defaultValue: 'exclude'
    }]
  });
  var bvhCreateButton = $('<input type="button" value="Create"/>')
    .click(function () {
      this.__recreateTree();
    }.bind(this));
  this.configPanel.append(bvhCreateButton);
  var detectOutliersButton = $('<input type="button" value="Outliers"/>')
    .click(function () {
      this.__detectOutliers();
    }.bind(this));
  this.configPanel.append(detectOutliersButton);
};


BVHVisualizer.prototype.__clear = function () {
  TreeVisualizer.prototype.__clear.call(this);
  this.__bvh = null;
};

BVHVisualizer.prototype.__detectOutliers = function() {
  if (this.sceneState) {
    var oldIncludeArch = this.bvhConfigControls.setFieldValue('includeArchitecture', 'include');
    if (!this.__bvh || oldIncludeArch !== 'include') {
      // Let's recreate the BVH!
      this.__recreateTree();
    }
    var result = SceneUtil.detectOutlierObjects(this.sceneState, { bvh: this.__bvh });
    this.app.setSelectedObjects(result.outliers);
  } else {
    this.showAlert('Please load a scene first');
  }
};

BVHVisualizer.prototype.__convertToTreeNodes = function(sceneState) {
  var modelInstances = Object3DUtil.findModelInstances(sceneState.scene);
  var object3Ds = _.map(modelInstances, function (mInst) { return mInst.object3D; });
  var bvhConfig = this.bvhConfigControls.getConfig();
  if (bvhConfig.includeArchitecture == 'include') {
    object3Ds = object3Ds.concat(sceneState.extraObjects);
  } else if (bvhConfig.includeArchitecture == 'obstacle') {
    bvhConfig.obstacles = sceneState.extraObjects;
  }
  console.log(bvhConfig);
  var bvh = new BVH(object3Ds, bvhConfig);
  var nodes = this.__convertBVHToTreeNodes(bvh);
  return nodes;
};

BVHVisualizer.prototype.__createBvhTreeNode = function(bvhNode, index) {
  var parentId = this.__getTreeNodeId(bvhNode.parent, '#');
  var shId = this.__prefix + index;
  this.__setTreeNodeId(bvhNode, shId);
  var treeNode = {
    id: shId,
    icon: false,
    parent: parentId,
    text: 'BVH-' + bvhNode.id + ' (' + bvhNode.objects.length + ')',
    data: {bvhId: bvhNode.id, index: index}
  };
  var info = _.pick(bvhNode, ['id', 'depth', 'splitAxis']);
  info.nObjects = bvhNode.objects.length;
  treeNode.li_attr = {
    title: JSON.stringify(info, null, ' ')
  };
  this.__nodeIdToMetadata[shId] = { bvhNode: bvhNode };
  return treeNode;
};

BVHVisualizer.prototype.__convertBVHToTreeNodes = function(bvh) {
  var scope = this;
  this.__bvh = bvh;
  //var bvhNodes = bvh.getNodeArray();
  //console.log('converting BVH to treenodes', bvhNodes);
  var treeNodes = [];
  bvh.traverse(function(bvhNode) {
      var bvhTreeNode = scope.__createBvhTreeNode(bvhNode, treeNodes.length);
      treeNodes.push(bvhTreeNode);
    },
    function(bvhNode) {
      if (bvhNode.objects) {
        if (scope.showObjectsAtAllNodes || bvhNode.isLeaf) {
          var parentId = scope.__getTreeNodeId(bvhNode);
          for (var j = 0; j < bvhNode.objects.length; j++) {
            var obj = bvhNode.objects[j];
            var treeNode = scope.__createTreeNode(obj, treeNodes.length);
            treeNode.parent = parentId;
            treeNodes.push(treeNode);
          }
        }
      }
    }
  );
  return treeNodes;
};

BVHVisualizer.prototype.__getObjectsForNode = function(node, objects) {
  objects = objects || [];
  var metadata = this.__nodeIdToMetadata[node.id];
  if (metadata && metadata.bvhNode) {
    objects.push.apply(objects, metadata.bvhNode.objects);
  } else {
    var obj = this.__getObject3D(node);
    if (obj) {
      objects.push(obj);
    }
  }
  return objects;
};

BVHVisualizer.prototype.__getBoundingBox = function(node) {
  var metadata = this.__nodeIdToMetadata[node.id];
  if (metadata && metadata.bvhNode) {
    return metadata.bvhNode.bbox;
  }
  return TreeVisualizer.prototype.__getBoundingBox.call(this, node);
};

module.exports = BVHVisualizer;