'use strict';

var Constants = require('Constants');
var AssetLoader = require('assets/AssetLoader');
var ConfigControls  = require('ui/ConfigControls');
var Object3DUtil = require('geo/Object3DUtil');
var MeshHelpers = require('geo/MeshHelpers');
var RelationGraph = require('ds/RelationGraph');
var FileUtil = require('io/FileUtil');
var UIUtil = require('ui/UIUtil');
var TypeUtils = require('data/TypeUtils');
var keymap = require('controls/keymap');
var _ = require('util/util');

// The LabelHierarchyPanel visualizes the label hierarchy as is
//   with each node in the tree mapping to a labelInfo

/**
 * The LabelHierarchyPanel visualizes the label hierarchy as is
 #   with each node in the tree mapping to a labelInfo
 * @param params
 * @param [params.container]
 * @param params.assetManager {assets.AssetManager}
 * @param [params.tooltipIncludeFields] {string[]} List of fields to include for tooltip shown on hover
 * @param [params.onhoverCallback] {function(node, objects)} Callback for hovering over a tree node
 * @param [params.allowEditLabels=false] {boolean} Whether editing of the labels are allowed
 * @param [params.allowEditHierarchy=false] {boolean} Whether editing of the hierarchy is allowed
 * @param [params.allowLoadSave=true] {boolean} Whether loading/saving of the hierarchy is supported
 * @param [params.autoCreateTree=true] {boolean}
 * @param [params.useIcons=false] {boolean} Whether to use screenshot icons in the tree nodes
 * @param [params.app] {Object} Parent application for scene hierarchy panel
 * @constructor
 */
function LabelHierarchyPanel(params) {
  // Container in which the scene hierarchy is displayed
  this.container = params.container;
  this.assetManager = params.assetManager;
  this.tooltipIncludeFields = params.tooltipIncludeFields;
  this.onhoverCallback = params.onhoverCallback;
  this.allowEditLabels = params.allowEditLabels;
  this.allowEditHierarchy = params.allowEditHierarchy;
  this.allowLoadSave = (params.allowLoadSave != undefined)? params.allowLoadSave : true;
  this.autoCreateTree = (params.autoCreateTree != undefined)? params.autoCreateTree : true;
  this.useIcons = params.useIcons;
  this.app = params.app;
  // TODO: Remove this __treeNodes and __freeTreeNodes
  this.__relationGraph = null;
  this.__treeNodes = null; // list of tree nodes used to construct the hierarchy (use internally only)
  this.__freeTreeNodes = [];
  this.__prefix = _.uniqueId('lhp') + '_';
  this.__dataIdToNodeId = {}; // Map of external data id to our tree node id
  this.__nodeIdToMetadata = {};  // Make of node id to metadata
  this.__bbNodes = new THREE.Group(); // For holding our bounding box meshes
  this.__bbNodes.name = this.constructor.name + '-BoundingBoxes';
  this.init();
}

LabelHierarchyPanel.prototype.init = function () {
  if (this.container && this.container.length > 0) {
    var scope = this;
    this.configPanel = $('<div></div>');
    var configOptions = [];
    configOptions.push({
        id: 'showBBox',
        name: 'showBBox',
        text: 'Show BBox',
        type: 'boolean',
        defaultValue: false
      });
    configOptions.push({
        id: 'autoShowOnSearch',
        name: 'autoShowOnSearch',
        text: 'Show search results in scene',
        type: 'boolean',
        defaultValue: true
      });
    this.configControls = new ConfigControls({
      container: this.configPanel,
      prefix: this.__prefix,
      options: configOptions
    });
    this.treePanel = $('<div></div>');

    // Search
    this.treeSearchPanel = $('<div></div>').attr('class', 'treeSearchOptions');
    this.treeSearchTextElem = $('<input/>').attr('type', 'text').attr('class', 'search')
      .change(function () {
        scope.searchScene();
      });
    this.treeSearchButton = $('<input type="button" value="Search"/>')
      .click(function () {
        scope.searchScene();
      });
    this.treeSearchPanel.append(this.treeSearchTextElem);
    this.treeSearchPanel.append(this.treeSearchButton);

    // Expand all button
    this.buttonsPanel = $('<div></div>');
    this.expandAllButton = $('<input type="button" value="Open All"/>')
      .click(function () {
        scope.tree.jstree('open_all');
      });
    this.buttonsPanel.append(this.expandAllButton);
    this.closeAllButton = $('<input type="button" value="Close All"/>')
      .click(function () {
        scope.tree.jstree('close_all');
      });
    this.buttonsPanel.append(this.closeAllButton);

    // Load and Save
    if (this.allowLoadSave) {
      this.treeSaveButton = $('<input type="button" value="Save"/>')
        .click(function () {
          scope.app.authenticate(
            function () {
              scope.saveHierarchy();
            }
          );
        });
      this.buttonsPanel.append(this.treeSaveButton);
      var loadFileInput = UIUtil.createFileInput({
        id: scope.__prefix + 'loadFile',
        label: 'Load',
        hideFilename: true,
        inline: true,
        style: 'basic',
        loadFn: function (file) {
          var loader = new AssetLoader();
          loader.load(file, 'json', function (json) {
            scope.loadHierarchy(json);
          }, undefined, function (err) {
            console.log(err);
          });
        }
      });
      this.buttonsPanel.append(loadFileInput.group);
    }

    this.configPanel.append(this.treeSearchPanel);
    this.configPanel.append(this.buttonsPanel);
    this.infoPanel = $('<div><div>');
    this.container.append(this.infoPanel);
    this.container.append(this.configPanel);
    this.container.append(this.treePanel);

    keymap({ on: 'g', do: 'Group selected nodes', filter: function(evt) {
      return $.contains(scope.treePanel[0], evt.target);
    } }, function () {
      if (scope.allowEditHierarchy) {
        scope.__groupSelected();
      }
    });

    keymap({ on: 'esc', do: 'Deselect all', filter: function(evt) {
      return $.contains(scope.treePanel[0], evt.target);
    } }, function () {
      if (scope.allowEditHierarchy) {
        scope.tree.jstree('deselect_all');
      }
    });
  }
};

LabelHierarchyPanel.prototype.getRoots = function () {
  // TODO: Return just the roots (not really used now)
  return this.tree.jstree('get_json', '#');
};

LabelHierarchyPanel.prototype.getTreeNodes = function () {
  return this.tree.jstree('get_json', '#', { flat: true });
};

LabelHierarchyPanel.prototype.getSelectedObjects = function() {
  var selected = this.tree.jstree('get_selected', true);
  return this.__getObjects(selected);
};

LabelHierarchyPanel.prototype.__getObjects = function(nodes, objects) {
  objects = objects || [];
  if (!Array.isArray(nodes)) {
    nodes = [nodes];
  }
  for (var i = 0; i < nodes.length; i++) {
    this.__getObjectsForNode(nodes[i], objects);
  }
  return objects;
};

LabelHierarchyPanel.prototype.__getObjectKey = function(object) {
  return TypeUtils.getType(object) + '-' + object.id;
};

LabelHierarchyPanel.prototype.__getTreeNodeId = function(object3D, defaultValue) {
  var id = object3D? this.__dataIdToNodeId[this.__getObjectKey(object3D)] : undefined;
  return (id != null)? id : defaultValue;
};

LabelHierarchyPanel.prototype.__setTreeNodeId = function(object3D, id) {
  this.__dataIdToNodeId[this.__getObjectKey(object3D)] = id;
};

LabelHierarchyPanel.prototype.__getTreeNodeIds = function(objects) {
  if (!Array.isArray(objects)) {
    objects = [objects];
  }
  var nodeIds = [];
  for (var i = 0; i < objects.length; i++) {
    var nodeId = this.__getTreeNodeId(objects[i]);
    if (nodeId != undefined) {
      nodeIds.push(nodeId);
    }
  }
  return nodeIds;
};

LabelHierarchyPanel.prototype.setLabels = function (labels) {
  this.__relationGraph = new RelationGraph(labels);
  this.__recreateTree();
};

LabelHierarchyPanel.prototype.__recreateTree = function() {
  this.__setRelationGraph(this.__relationGraph, true);
};

LabelHierarchyPanel.prototype.__setRelationGraph = function (relationGraph, createTree) {
  // Clear old state
  this.__clear();
  // Convert to jstree data
  this.debugNode.add(this.__bbNodes);
  if (createTree) {
    var treeNodes = this.__convertToTreeNodes(relationGraph);
    this.__updateTree(treeNodes);
  } else {
    this.__updateTree([]);
  }
};

LabelHierarchyPanel.prototype.__clear = function () {
  this.__treeNodes = [];
  this.__freeTreeNodes = [];
  // Clear the old id mappings
  this.__dataIdToNodeId = {};
  this.__nodeIdToMetadata = {};
  Object3DUtil.removeAllChildren(this.__bbNodes);
};

LabelHierarchyPanel.prototype.__createTreeNode = function(object3D, index) {
  var parentId = this.__getTreeNodeId(object3D.parent, '#');
  var shId = this.__prefix + index;
  this.__setTreeNodeId(object3D, shId);
  var treeNode = {
    id: shId,
    icon: false,
    parent: parentId,
    text: object3D.name || index,
    data: {objId: object3D.id, index: index}
  };
  var info = this.__createSummaryInfo(object3D);
  treeNode.li_attr = {
    title: JSON.stringify(info, null, ' ')
  };
  this.__nodeIdToMetadata[shId] = { object3D: object3D };
  return treeNode;
};

LabelHierarchyPanel.prototype.__addTreeNode = function(treeNodes, object3D, index) {
  if (index == null) {
    index = treeNodes.length;
  }
  treeNodes[index] = this.__createTreeNode(object3D, index);
  return treeNodes[index];
};

LabelHierarchyPanel.prototype.__createSummaryInfo = function(node) {
  // TODO: Update this
  // var stats = {};
  // stats = _.pickBy(stats, function(x) { return x > 0; });
  // // Create title data for a Object3D node
  // var object3D = this.__getObject3D(node);
  // var info = _.assign(stats,
  //   _.pick(object3D.userData, ['id']));
  // return info;
  return { id: node.id, type: node.type, name: node.name };
};

LabelHierarchyPanel.prototype.__updateJsTreeNode = function(node) {
  if (node) {
    var updatedTitle = JSON.stringify(this.__createSummaryInfo(node), null, ' ');
    node.li_attr.title = updatedTitle;
  }
};

LabelHierarchyPanel.prototype.__convertToTreeNodes = function(relationGraph) {
  // Convert relationGraph to jstree data
  var treeNodes = {};
  var nodes = relationGraph.nodes;
  //var roots = [];
  _.each(nodes, function(node, id) {
    var shId = this.__prefix + id;
    var parentId = node.parents? node.parents[0] : null;  // TODO: Pick good parent
    if (parentId == undefined) {
      parentId = '#';
    }
    treeNodes[id] = {
      id: shId,
      icon: false,
      parent: parentId,
      text: node.name + "(" + node.type + ")",
      data: { nodeId: id }
    };
  });
  return treeNodes;
};

LabelHierarchyPanel.prototype.__getObject3D = function(treeNode) {
  if (treeNode.data) {
    var nodeId = treeNode.data['nodeId'];
    var node = this.__relationGraph.getNode(nodeId);
    if (node != undefined) {
      return node.object3D;
    }
  }
};

LabelHierarchyPanel.prototype.__getRootObject3D = function() {
  // TODO: Replace scene state
  return this.sceneState.scene;
};

LabelHierarchyPanel.prototype.__reattach3DObjects = function(treeNode, newParent, oldParent) {
  // Reattach child to new parent (for restructuring underlying scene graph)
  var childObject3D = this.__getObject3D(treeNode);
  var newParentObject3D = this.__getObject3D(newParent);
  if (childObject3D) {
    Object3DUtil.attachToParent(childObject3D, newParentObject3D, this.__getRootObject3D());
  } else {
    console.log('Cannot find object3D', treeNode);
  }
};

LabelHierarchyPanel.prototype.__getBoundingBox = function(node) {
  var obj3D = this.__getObject3D(node);
  if (obj3D) {
    return Object3DUtil.getBoundingBox(obj3D);
  } else {
    var objects = this.__getObjects(node);
    if (objects && objects.length > 0) {
      return Object3DUtil.getBoundingBox(objects);
    }
  }
};

LabelHierarchyPanel.prototype.__showBoundingBox = function(nodes, flag) {
  this.__bbNodes.visible = flag;
  // console.log('bbnodes: ' + this.__bbNodes.children.length + ', ' + this.__bbNodes.visible, nodes);
  if (nodes) {
    if (!Array.isArray(nodes)) {
      nodes = [nodes];
    }
    for (var i = 0; i < nodes.length; i++) {
      this.__showBoundingBoxForNode(nodes[i], flag);
    }
  } else {
    if (flag) {
      for (var i = 0; i < this.__treeNodes.length; i++) {
        if (!this.__treeNodes[i].__isFree) {
          var node = this.tree.jstree('get_node', this.__treeNodes[i].id);
          this.__showBoundingBoxForNode(node, flag);
        }
      }
    }
  }
};

LabelHierarchyPanel.prototype.__getMetadata = function(node, field) {
  var metadata = this.__nodeIdToMetadata[node.id];
  if (metadata) {
    return metadata[field];
  }
};

LabelHierarchyPanel.prototype.__setMetadata = function(node, field, value) {
  var metadata = this.__nodeIdToMetadata[node.id];
  if (metadata) {
    metadata[field] = value;
  } else {
    this.__nodeIdToMetadata[node.id] = {};
    this.__nodeIdToMetadata[node.id][field] = value;
  }
};

LabelHierarchyPanel.prototype.__showBoundingBoxForNode = function(node, flag) {
  var bboxMesh = this.__getMetadata(node, 'boundingBoxMesh');
  if (!bboxMesh && !flag) {
    return; // No bounding box: OKAY
  }
  var bbox = this.__getBoundingBox(node);
  var createMesh = !bboxMesh;
  if (!createMesh) {
    // If scene was edited, will need to update bounding box mesh
    // TODO: check if boundingBoxMesh and current bounding box of node is compatible
  }
  if (createMesh) {
    if (bboxMesh) {
      this.__bbNodes.remove(bboxMesh);
    }
    var mesh = new MeshHelpers.BoxMinMax(bbox.min, bbox.max, Object3DUtil.TransparentMat);
    var boxwf = new THREE.BoxHelper(mesh);
    var material = this.app.picker.highlightMaterial;
    var boxwffat = new MeshHelpers.FatLines(boxwf, 0.05*Constants.metersToVirtualUnit, material);

    bboxMesh = boxwffat;
    this.__bbNodes.add(bboxMesh);
    this.__setMetadata(node, 'boundingBoxMesh', bboxMesh);
  }
  Object3DUtil.setVisible(bboxMesh, flag);
};

LabelHierarchyPanel.prototype.__getObjectsForTreeNodes = function(treeNodes, objects) {
  treeNodes = treeNodes || [];
  if (!Array.isArray(treeNodes)) {
    treeNodes = [treeNodes];
  }
  var scope = this;
  var nodes = _.map(treeNodes, function(tn) {
    var nodeId = tn.data.nodeId;
    return scope.__relationGraph.getNode(nodeId);
  });
  nodes = _.filter(nodes);
  return this.__getObjectsForNodes(nodes, objects);
};

LabelHierarchyPanel.prototype.__getObjectsForNodes = function(nodes, objects) {
  objects = objects || [];
  if (!Array.isArray(nodes)) {
    nodes = [nodes];
  }
  for (var i = 0; i < nodes.length; i++) {
    this.__getObjectsForNode(nodes[i], objects);
  }
  objects = _.uniq(objects);
  return objects;
};

LabelHierarchyPanel.prototype.__getObjectsForNode = function(node, objects) {
  objects = objects || [];
  var obj = node.object3D;
  if (obj) {
    objects.push(obj);
  }
  if (node.children) {
    for (var i = 0; i < node.children.length; i++) {
      var childId = node.children[i];
      var child = this.__relationGraph.getNode(childId);
      if (child) {
        this.__getObjectsForNode(child, objects);
      }
    }
  }
  objects = _.uniq(objects);
  return objects;
};

LabelHierarchyPanel.prototype.__markFreeNode = function(node) {
  var treeNode = this.__treeNodes[node.data.index];
  treeNode.data = _.clone(node.data);
  treeNode.__isFree = true;
  treeNode.parent = '#';
  this.__freeTreeNodes.push(treeNode);
};

LabelHierarchyPanel.prototype.__getFreeTreeNode = function(treeNodes, name, parent) {
  var parentObject3D = this.__getObject3D(parent);
  //var ti;
  var t;
  if (this.__freeTreeNodes.length > 0) {
    t = this.__freeTreeNodes.pop();
    if (!t.__isFree) {
      console.warn('Attempting to reuse non-free tree node', t);
    }
    delete t.__isFree;
    t.name = name;

    var g = this.__getObject3D(t);
    console.log('free node', t, g);
    if (!(g instanceof THREE.Group) || g.children.length > 0 || g.userData.id != null) {
      console.warn('Attempting to reuse object3D', g);
    }
    g.name = name;
    g.userData.type = name;
    Object3DUtil.attachToParent(g, parentObject3D, this.__getRootObject3D());
  } else {
    var g = this.__createGroup(name, parentObject3D);
    t = this.__addTreeNode(treeNodes, g);
  }
  t.parent = parent.id;
  return t;
};

LabelHierarchyPanel.prototype.__fixIconSizes = function() {
  // console.log('fix icon sizes');
  if (this.useIcons) {
    // Make sure the size of the icons are okay
    this.tree.find('.jstree-themeicon-custom').css('background-size', '24px');
  }
};

LabelHierarchyPanel.prototype.__updateTree = function(treeNodes) {
  this.__treeNodes = treeNodes;
  //console.log(treeNodes);

  if (!this.treePanel) return;  // No tree panel!!!
  var scope = this;
  var searchOptions = {
    'case_insensitive': true,
    'search_callback': function(searchStr, node) {
      if (!searchStr) return false;
      var obj = scope.__getObject3D(node);
      if (obj) {
        var s = searchStr.toLowerCase();
        //console.log(node);
        if (node.text && node.text.toLowerCase().indexOf(s) >= 0) {
          return true;
        } else if (obj.userData.id != null && obj.userData.id.toString().toLowerCase() === s) {
          return true;
        } else {
          // TODO: Update this
          var modelInstance = Object3DUtil.getModelInstance(obj);
          if (modelInstance) {
            if (modelInstance.model.hasCategorySimilar(s)) {
              return true;
            }
          }
        }
      }
      return false;
    }
  };
  this.treePanel.empty();
  this.tree = $('<div class="tree"></div>');
  this.treePanel.append(this.tree);
  var plugins = ['search', 'contextmenu', 'changed'];
  if (this.allowEditHierarchy) {
    plugins.push('dnd');
  }
  this.tree.jstree({
    'core': {
      'check_callback' : this.allowEditHierarchy,
      'data': treeNodes,
      'themes': { 'name': 'default', 'responsive': true, 'stripes': true, 'icons': this.useIcons }
    },
    'search': searchOptions,
    'dnd': {
      'copy': false, // Disallow copy on drag and drop
      'is_draggable': function(nodes, event) {
        var objects = scope.__getObjects(nodes);
        var draggable = _.all(objects, function(obj) {
          return obj.userData.isEditable == undefined || obj.userData.isEditable;
        });
        return draggable;
      }
    },
    'contextmenu':{
      "items": function(node) {
        var selected = scope.tree.jstree('get_selected', true);
        var targets = scope.__getObjects(selected);
        var basicItems = {
          lookAtItem: {
            "label": "Look at",
            "action": function (item) {
              // Handle look at item for multiple selected
              //var targets = scope.__getObjects(node);  // Only look at single item
              if (targets && targets.length) {
                scope.app.lookAt(targets);
              }
            },
            "_class": "class"
          },
          toggleVisible: {
            "label": function (item) {
              var label = "Toggle visible";
              if (targets && targets.length) {
                var isAllVisible = _.every(targets, function (x) {
                  return x.visible;
                });
                var isAllHidden = _.every(targets, function (x) {
                  return !x.visible;
                });
                if (isAllVisible) {
                  label += " (hide)";
                }
                else if (isAllHidden) {
                  label += " (show)";
                }
              }
              return label;
            },
            "action": function (item) {
              if (targets && targets.length) {
                _.each(targets, function (target) {
                  target.visible = !target.visible;
                });
              }
            },
            "_class": "class"
          },
          showItem: {
            "label": "(S)how - hide other nodes",
            "shortcut": 83,
            "shortcut_label": 's',
            "action": function (item) {
              // Handle show item for multiple selected
              scope.__showItems(selected);
            },
            "_class": "class"
          },
          showAll: {
            "label": "Show (a)ll",
            "shortcut": 65,
            "shortcut_label": 'a',
            "action": function (item) {
              scope.app.showAll();
            },
            "_class": "class"
          }
        };

        function addSetVisibleOption(items, name, label, flag, recursive) {
          basicItems[name] = {
            "label" : label,
            "action" : function(item) {
              _.each(targets, function(x) {
                Object3DUtil.setVisible(x, flag, recursive);
              });
            },
            "_class" : "class"
          };

        }

        if (targets && targets.length) {

          var isAllVisible = _.every(targets, function(x) { return x.visible; });
          var isAllHidden = _.every(targets, function(x) { return !x.visible; });

          if (isAllVisible) {
            //addSetVisibleOption(basicItems, "setTreeVisibleFalse", "Hide tree", false, true);
            addSetVisibleOption(basicItems, "setNodeVisibleFalse", "Hide node", false, false);
          } else if (isAllHidden) {
            //addSetVisibleOption(basicItems, "setTreeVisibleTrue", "Show tree", true, true);
            addSetVisibleOption(basicItems, "setNodeVisibleTrue", "Show node", true, false);
          } else {
            //addSetVisibleOption(basicItems, "setTreeVisibleFalse", "Hide tree", false, true);
            //addSetVisibleOption(basicItems, "setTreeVisibleTrue", "Show tree", true, true);
            addSetVisibleOption(basicItems, "setNodeVisibleFalse", "Hide node", false, false);
            addSetVisibleOption(basicItems, "setNodeVisibleTrue", "Show node", true, false);
          }
        }

        var items = basicItems;

        // Remove disallowed entries
        var target = scope.__getObject3D(node);
        if (scope.allowEditHierarchy) {
          // Add edit entries
          items = _.merge(basicItems,
            {
              "Rename": {
                "separator_before": false,
                "separator_after": false,
                "label": "(R)ename",
                "shortcut": 82,
                "shortcut_label": 'r',
                "action": function (obj) {
                  scope.tree.jstree('edit', node);
                }
              },
              "Group": {
                "separator_before": true,
                "separator_after": false,
                "label": "(G)roup",
                "shortcut": 71,
                "shortcut_label": 'g',
                "action": function (obj) {
                  scope.__groupSelected(node);
                }
              },
              "Ungroup": {
                "separator_before": false,
                "separator_after": false,
                "label": "(U)ngroup",
                "shortcut": 85,
                "shortcut_label": 'u',
                "action": function (obj) {
                  scope.__ungroup(node);
                }
              }
              // "Remove": {
              //   "separator_before": false,
              //   "separator_after": false,
              //   "label": "Remove",
              //   "action": function (obj) {
              //     scope.tree.jstree('delete_node', node);
              //   }
              // }
            });
          var nodeIsGroup = (target instanceof THREE.Group);

          if (!nodeIsGroup) {
            delete items['Ungroup'];
          }
          if (!scope.allowEditLabels) {
            delete items['Remove'];
            if (!nodeIsGroup) {
              delete items['Rename'];
            }
          }
        }
        return items;
      }
    },
    'plugins': plugins
  });

  this.tree.bind('open_node.jstree', function(event, data) {
    scope.__fixIconSizes();
  });
  this.tree.bind('ready.jstree', function(event, data) {
    scope.__fixIconSizes();
  });

  this.tree.bind('select_node.jstree',
    function (event, data) {
      console.log('select_node', data);
      scope.__showNodeDetails(data.node);
    }
  );
  this.tree.bind('create_node.jstree',
    function (event, data) {
    }
  );
  this.tree.bind('rename_node.jstree',
    function (event, data) {
      console.log('rename_node', data);
      var target = scope.__getObject3D(data.node);
      if (target) {
        target.name = data.text;
      }
    }
  );
  this.tree.bind('delete_node.jstree',
    function (event, data) {
      console.log('delete_node', data);
      var target = scope.__getObject3D(data.node);
      if (target) {
        if (!(target instanceof THREE.Group) || target.children.length > 0 || target.userData.id != null) {
          console.warn('deleting important scene objects from hierarchy', target);
        }
//            scope.app.deleteObject(target);
      }
      scope.__markFreeNode(data.node);
    }
  );
  this.tree.bind('move_node.jstree',
    function (event, data) {
      console.log('move_node', data);
      var oldParent = scope.tree.jstree('get_node', data.old_parent);
      var newParent = scope.tree.jstree('get_node', data.parent);
      scope.__reattach3DObjects(data.node, newParent, oldParent);
      scope.__updateJsTreeNode(oldParent);
      scope.__updateJsTreeNode(newParent);
      scope.__fixIconSizes();
      scope.tree.jstree('redraw');
    }
  );
  this.tree.bind('search.jstree',
    function (event, data) {
      if (scope.configControls.getFieldValue('autoShowOnSearch')) {
        var res = data.res;
        scope.tree.jstree('deselect_all');
        scope.tree.jstree('select_node', res);
        var selected = scope.tree.jstree('get_selected', true);
        scope.__showItems(selected);
      }
    }
  );
  this.tree.bind('changed.jstree',
    // Selection changed
    function (event, data) {
      scope.__notifySelectionChanged();
    }
  );

  // Our hover/dehover
  this.tree.bind('hover_node.jstree',
    function (event, data) {
      //console.log('hover_node', data);
      if (scope.configControls.getFieldValue('showBBox')) {
        scope.__showBoundingBox(data.node, true);
      }
    }
  );
  this.tree.bind('dehover_node.jstree',
    function (event, data) {
      scope.__showBoundingBox(data.node, false);
    }
  );

  // Custom hover/dehover
  if (this.onhoverCallback) {
    this.tree.bind('hover_node.jstree',
      function (event, data) {
        scope.onhoverCallback(data.node, scope.__getObjects(data.node));
      }
    );
    this.tree.bind('mouseout.jstree',
      function (event, data) {
        scope.onhoverCallback(null);
      }
    );
  }
};

LabelHierarchyPanel.prototype.__groupSelected = function(node) {
  var selected = this.tree.jstree('get_selected');
  if (!selected.length) return;  // Nothing to group
  if (!node) {
    // No node, use first selected
    node = this.tree.jstree('get_node', selected[0]);
  }

  var parent = this.tree.jstree('get_node', node.parent);
  var newnode_data = this.__getFreeTreeNode(this.__treeNodes, 'Region', parent);

  var newpos = parent.children.indexOf(node.id) + 1;
  var newnode = this.tree.jstree('create_node', node.parent, newnode_data, newpos);
  // Put all selected nodes under new node
  this.tree.jstree('move_node', selected, newnode);
  this.tree.jstree('open_node', newnode);
};

LabelHierarchyPanel.prototype.__ungroup = function(node) {
  var parent = this.tree.jstree('get_node', node.parent);
  var pos = parent.children.indexOf(node.id) + 1;
  //console.log('ungroup', node.children);
  var children = node.children.slice(); // Make copy
  this.tree.jstree('move_node', children, node.parent, pos);
  var object3D = this.__getObject3D(node);
  if (object3D && object3D.userData.id) {
    // Keep
  } else {
    this.tree.jstree('delete_node', node);
  }
  this.tree.jstree('select_node', children);
  this.__fixIconSizes();
  //console.log('move_node all done!')
};

LabelHierarchyPanel.prototype.__notifySelectionChanged = function() {
  if (this.app.selectMode) {
    var selected = this.getSelectedObjects();
    this.app.setSelectedObjects(selected, {suppressNotify: [this]});
  }
};

LabelHierarchyPanel.prototype.__showItems = function(nodes) {
  var targets = this.__getObjects(nodes);
  this.app.showOnly(targets);
};

LabelHierarchyPanel.prototype.__showObjectDetails = function (modelInstanceOrObject3D) {
  var object3D = (modelInstanceOrObject3D instanceof THREE.Object3D)? modelInstanceOrObject3D : modelInstanceOrObject3D.object3D;
  // TODO: callback to show more information about selected model?
  if (modelInstanceOrObject3D.model) {
    console.log('clicked ' + modelInstanceOrObject3D.model.getFullID());
  }
  console.log(modelInstanceOrObject3D);
  var bb = Object3DUtil.getBoundingBox(object3D);
  console.log('BB: ' + bb.toString());
};

LabelHierarchyPanel.prototype.__showNodeDetails = function (node) {
  var target = this.__getModelInstanceOrObject3D(node);
  if (target) {
    this.__showObjectDetails(target);
  } else {
    var bb = this.__getBoundingBox(node);
    console.log('BB: ' + bb.toString());
  }
};

LabelHierarchyPanel.prototype.searchScene = function (entity) {
  if (!entity) {
    if (this.treeSearchTextElem) entity = this.treeSearchTextElem.val();
  }
  if (!entity || !this.tree) return;
  console.log('Search for ' + entity);
  this.tree.jstree('search', entity);
};

LabelHierarchyPanel.prototype.saveHierarchy = function () {
  // Create json summarizing the scene hierarchy
  var nodes = [];
  var treeNodes = this.getTreeNodes();
  var idIndexRemapping = {};
  for (var i = 0; i < treeNodes.length; i++) {
    var t = treeNodes[i];
    if (!t.__isFree) {
      // Make sure we are using a legit node
      var j = nodes.length;
      idIndexRemapping[t.id] = j;
      var obj3D = this.__getObject3D(t);
      var bbox = this.__getBoundingBox(t);
      var newNode = _.merge({
        index: j,
        name: t.text,
        parent: t.parent, // need remapping
        bbox: bbox.toJSON()
      }, _.pick(obj3D.userData, ['type', 'id']));
      var modelInstance = Object3DUtil.getModelInstance(obj3D);
      if (modelInstance) {
        newNode.category = modelInstance.model.info.category;
      }
      nodes.push(newNode);
    }
  }
  for (var j = 0; j < nodes.length; j++) {
    var node = nodes[j];
    if (node.parent === '#') {
      delete node.parent;
    } else {
      node.parent = idIndexRemapping[node.parent];
    }
  }

  var sh = {
    sceneId: this.sceneState.getFullID(),
    appId: this.app? this.app.appId : undefined,
    userId: this.app? this.app.userId : undefined,
    version: 'ssg@0.0.1',
    //name: this.sceneState.getSceneName(),
    nodes: nodes
  };
  var id = this.sceneState.info.id;
  FileUtil.saveJson(sh, id + '.hierarchy.json');
};

LabelHierarchyPanel.prototype.loadHierarchy = function(json) {
  var version = json.version;
  var format = (typeof version === 'string')? version.split('@')[0] : undefined;
  if (format !== 'ssg') {
    this.showAlert('Not a valid scene hierarchy file');
    return;
  }
  if (json.sceneId !== this.sceneState.getFullID()) {
    this.showAlert('Scene ID mismatch');
    return;
  }
  var scope = this;
  var nodes = json.nodes;
  var objects = nodes.map(function(node) {
    if (node.id != undefined) {
      var object = scope.sceneState.findNode(function(x) { return x.userData.id == node.id && x.userData.type == node.type; });
      if (!object) {
        console.error('No object for node!!!', node);
      }
      return object;
    } else {
      var group = scope.__createGroup(node.type);
      group.name = node.name;
      return group;
    }
  });
  // Parent
  var rootObject3D = this.__getRootObject3D();
  var roots = [];
  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    var obj = objects[i];
    if (node.parent != undefined && node.parent >= 0) {
      var parentObj = objects[node.parent];
      //console.log('node ' + i + ', parent ' + node.parent);
      Object3DUtil.attachToParent(obj, parentObj, rootObject3D);
    } else {
      roots.push(i);
      Object3DUtil.detachFromParent(obj, rootObject3D);
    }
  }
  // clear empty groups from the scene
  var emptyGroups = Object3DUtil.findNodes(rootObject3D, function(x) {
    return (x instanceof THREE.Group) && (x.children.length === 0) && (x.userData.sceneHierarchyGroup);
  });
  //console.log('emptyGroups', emptyGroups);
  for (var i = 0; i < emptyGroups.length; i++) {
    this.sceneState.removeExtraObject(emptyGroups[i]);
  }
  // Update our tree
  this.setSceneState(this.sceneState);
};

LabelHierarchyPanel.prototype.selectObject = function(object3D, deselectOthers) {
  var nodeId = this.__getTreeNodeId(object3D);
  if (nodeId != null) {
    var treeNode = this.tree.jstree('get_node', nodeId);
    if (treeNode) {
      if (deselectOthers) {
        this.tree.jstree('deselect_all', true);  // suppress events
      }
      this.tree.jstree('select_node', nodeId, true);   // suppress events
      var element = document.getElementById( treeNode.id );
      if (element) {
        element.scrollIntoView();
      } else {
        this.__addDeferred( this.selectObject.bind(this,object3D,deselectOthers));
      }
    } else {
      console.warn('Unable to select node ' + nodeId);
      this.__addDeferred( this.selectObject.bind(this,object3D,deselectOthers));
    }
  }
  this.__showObjectDetails(object3D);
};

LabelHierarchyPanel.prototype.setSelectedObjects = function(objects) {
  if (this.tree) {
    var nodeIds = this.__getTreeNodeIds(objects);
    this.tree.jstree('deselect_all', true); // suppress events
    this.tree.jstree('select_node', nodeIds, true); // suppress events
  }
};

LabelHierarchyPanel.prototype.updateObjectSelection = function(objects, selected) {
  var nodeIds = this.__getTreeNodeIds(objects);
  if (nodeIds.length > 0) {
    if (selected) {
      this.tree.jstree('select_node', nodeIds, true);  // suppress events
    } else {
      this.tree.jstree('deselect_node', nodeIds, true);   // suppress events
    }
  }
};

LabelHierarchyPanel.prototype.selectAndGroup = function(objects) {
  this.setSelectedObjects(objects);
  this.__groupSelected();
};

LabelHierarchyPanel.prototype.__addDeferred = function(cb) {
  if (!this.__deferred) {
    this.__deferred = [];
  }
  this.__deferred.push(cb);
};

LabelHierarchyPanel.prototype.onResize = function() {
};

LabelHierarchyPanel.prototype.onActivate = function() {
  this.onResize();
  if (this.__deferred) {
    for (var i = 0; i < this.__deferred.length; i++) {
      this.__deferred[i]();
    }
    delete this.__deferred;
  }
};

LabelHierarchyPanel.prototype.showAlert = function(message, style) {
  UIUtil.showAlertWithPanel(this.container, message, style || 'alert-danger');
};

LabelHierarchyPanel.prototype.hide = function() {
  this.container.hide();
};

LabelHierarchyPanel.prototype.show = function() {
  this.container.show();
};

// Exports
module.exports = LabelHierarchyPanel;
