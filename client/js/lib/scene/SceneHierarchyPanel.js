'use strict';

var Constants = require('Constants');
var AssetLoader = require('assets/AssetLoader');
var ConfigControls  = require('ui/ConfigControls');
var Object3DUtil = require('geo/Object3DUtil');
var MeshHelpers = require('geo/MeshHelpers');
var FileUtil = require('io/FileUtil');
var UIUtil = require('ui/UIUtil');
var SceneUtil = require('scene/SceneUtil');
var TypeUtils = require('data/TypeUtils');
var keymap = require('controls/keymap');
var hilbert = require('hilbert');
var _ = require('util');

// The SceneHierarchyPanel visualizes the scene graph as is
//   with each node in the tree mapping to a object3D
// Note: Some object3D instances in the scene graph
//   may not be represented as a tree node
// (to keep the tree relatively clean, semantic objects are shown, and
//   raw meshes are typically not displayed)
function SceneHierarchyPanel(params) {
  // Container in which the scene hierarchy is displayed
  this.container = params.container;
  this.assetManager = params.assetManager;
  this.tooltipIncludeFields = params.tooltipIncludeFields;
  this.onhoverCallback = params.onhoverCallback;
  this.allowEditScene = params.allowEditScene;
  this.allowEditHierarchy = params.allowEditHierarchy;
  this.allowLoadSave = (params.allowLoadSave != undefined)? params.allowLoadSave : true;
  this.autoCreateTree = (params.autoCreateTree != undefined)? params.autoCreateTree : true;
  this.supportAttachment = (params.supportAttachment != undefined)? params.supportAttachment : true;
  this.useIcons = params.useIcons;
  this.useSort = params.useSort;
  this.defaultSortOrder = params.defaultSortOrder || 'hilbert';
  this.modelViewerUrl = params.modelViewerUrl || (params.app? params.app.modelViewerUrl: undefined) || 'model-viewer';
  this.app = params.app;
  // TODO: Remove this __treeNodes and __freeTreeNodes
  this.__treeNodes = null; // list of tree nodes used to construct the hierarchy (use internally only)
  this.__freeTreeNodes = [];
  this.__prefix = _.uniqueId('sh') + '_';
  this.__dataIdToNodeId = {}; // Map of external data id to our tree node id
  this.__nodeIdToMetadata = {};  // Make of node id to metadata
  this.__bbNodes = new THREE.Group(); // For holding our bounding box meshes
  this.__bbNodes.name = this.constructor.name + '-BoundingBoxes';
  this.init();
}

SceneHierarchyPanel.prototype.init = function () {
  if (this.container && this.container.length > 0) {
    var scope = this;
    this.configPanel = $('<div></div>');
    var configOptions = [];
    if (this.app.includeCeiling) {
      configOptions.push({
        id: 'showCeiling',
        name: 'showCeiling',
        text: 'Show Ceiling',
        type: 'boolean',
        defaultValue: this.app.showCeiling,
        onchange: function(event) {
          scope.app.showCeiling = scope.configControls.getFieldValue('showCeiling');
        }
      });
    }
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
    if (this.useSort) {
      configOptions.push({
        id: 'sort',
        name: 'sort',
        text: 'Sort',
        type: 'text',
        values: ['none', 'name', 'hilbert'],
        defaultValue: this.defaultSortOrder,
        onchange: function (event) {
          scope.tree.jstree('refresh');
        }
      });
    }
    if (this.supportAttachment) {
      configOptions.push({
        id: 'addGroupsToSupport',
        name: 'addGroupsToSupport',
        text: 'Use grouping within support hierarchy',
        type: 'boolean',
        defaultValue: true
      });
      configOptions.push({
        id: 'useStatsForSupport',
        name: 'useStatsForSupport',
        text: 'Use aggregated statistics',
        type: 'boolean',
        defaultValue: true
      });
    }
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

    if (this.supportAttachment) {
      var identifySupportHierarchyButton = $('<input type="button" value="Support Hierarchy"/>')
        .click(function () {
          scope.identifySupportHierarchy();
        });
      this.buttonsPanel.append(identifySupportHierarchyButton);
    }

    this.configPanel.append(this.treeSearchPanel);
    this.configPanel.append(this.buttonsPanel);
    this.container.append(this.configPanel);
    this.container.append(this.treePanel);

    keymap({ on: 'g', do: 'Group selected models', filter: function(evt) {
      return $.contains(scope.treePanel[0], evt.target);
    } }, function () {
      if (scope.allowEditHierarchy) {
        scope.__groupSelected();
      }
    });

    keymap({ on: 'esc', do: 'Group selected models', filter: function(evt) {
      return $.contains(scope.treePanel[0], evt.target);
    } }, function () {
      if (scope.allowEditHierarchy) {
        scope.tree.jstree('deselect_all');
      }
    });
  }
};

SceneHierarchyPanel.prototype.identifySupportHierarchy = function() {
  var scope = this;
  if (scope.sceneState) {
    var useStatsForSupport = scope.configControls.getFieldValue('useStatsForSupport');
    if (useStatsForSupport) {
      scope.app.__cache = this.app.__cache || {};
      SceneUtil.getAggregatedSceneStatistics(scope.app.__cache, function (err, aggregatedSceneStatistics) {
        console.log('got aggregated scene statistics', aggregatedSceneStatistics);
        scope.__identifySupportHierarchy(aggregatedSceneStatistics);
      }, {fs: FileUtil});
    } else {
      scope.__identifySupportHierarchy();
    }
  }
};

SceneHierarchyPanel.prototype.__identifySupportHierarchy = function(aggregatedSceneStatistics) {
  var scope = this;
  if (scope.sceneState) {
    scope.sceneState.identifySupportHierarchy({groupBySupport: true, attachToParent: true,
        assetManager: scope.assetManager, aggregatedSceneStatistics: aggregatedSceneStatistics},
      function(err, attachments) {
        var addGroups = scope.configControls.getFieldValue('addGroupsToSupport');
        if (addGroups) {
          var supportRelations = SceneUtil.supportAttachmentsToRelations(attachments);
          var grouped = SceneUtil.identifyGroupings(scope.sceneState, supportRelations);
          // Translate groups to parent child relationship
          var regions = {};
          _.each(grouped, function(group, parentId) {
            // Each group is a BVH
            var bvh = group;
            //console.log(bvh, parentId);
            if (bvh.root.objects.length > 2) {
              bvh.traverse(function (bvhNode) {
                  var region = new THREE.Group();
                  region.name = 'Region-' + bvhNode.id;
                  region.userData.type = 'BVHGroup';
                  region.userData.sceneHierarchyGroup = true;
                  scope.sceneState.addExtraObject(region);
                  bvhNode.object3D = region;
                  if (bvhNode.parent) {
                    Object3DUtil.attachToParent(region, bvhNode.parent.object3D, scope.sceneState.scene);
                  } else {
                    var parent = scope.sceneState.findNode(function(x) { return x.name === 'Region-' + parentId + '-children'; });
                    if (parent == null) {
                      parent = scope.sceneState.findNode(function(x) { return x.userData.id === parentId; });
                    }
                    Object3DUtil.attachToParent(region, parent, scope.sceneState.scene);
                  }
                },
                function (bvhNode) {
                  if (bvhNode.objects) {
                    if (bvhNode.isLeaf) {
                      for (var j = 0; j < bvhNode.objects.length; j++) {
                        var obj = bvhNode.objects[j];
                        Object3DUtil.attachToParent(obj, bvhNode.object3D, scope.sceneState.scene);
                      }
                    }
                  }
                }
              );
            }
          });
        }
        scope.setSceneState(scope.sceneState);
      });
  }
};

SceneHierarchyPanel.prototype.getRoots = function () {
  // TODO: Return just the roots (not really used now)
  return this.tree.jstree('get_json', '#');
};

SceneHierarchyPanel.prototype.getTreeNodes = function () {
  return this.tree.jstree('get_json', '#', { flat: true });
};

SceneHierarchyPanel.prototype.getSelectedObjects = function() {
  var selected = this.tree.jstree('get_selected', true);
  return this.__getObjects(selected);
};

SceneHierarchyPanel.prototype.__getObjectKey = function(object) {
  return TypeUtils.getType(object) + '-' + object.id;
};

SceneHierarchyPanel.prototype.__getTreeNodeId = function(object3D, defaultValue) {
  var id = object3D? this.__dataIdToNodeId[this.__getObjectKey(object3D)] : undefined;
  return (id != null)? id : defaultValue;
};

SceneHierarchyPanel.prototype.__setTreeNodeId = function(object3D, id) {
  this.__dataIdToNodeId[this.__getObjectKey(object3D)] = id;
};

SceneHierarchyPanel.prototype.__getTreeNodeIds = function(objects) {
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

SceneHierarchyPanel.prototype.setSceneState = function (sceneState) {
  this.__setSceneState(sceneState, this.autoCreateTree);
};

SceneHierarchyPanel.prototype.__recreateTree = function() {
  this.__setSceneState(this.sceneState, true);
};

SceneHierarchyPanel.prototype.__setSceneState = function (sceneState, createTree) {
  // Clear old state
  this.__clear();
  // Convert scene to jstree data
  this.sceneState = sceneState;
  this.sceneState.debugNode.add(this.__bbNodes);
  if (createTree) {
    var treeNodes = this.__convertToTreeNodes(sceneState);
    this.__updateSceneTree(treeNodes);
  } else {
    this.__updateSceneTree([]);
  }
};

SceneHierarchyPanel.prototype.__clear = function () {
  this.sceneState = null;
  this.__treeNodes = [];
  this.__freeTreeNodes = [];
  // Clear the old id mappings
  this.__dataIdToNodeId = {};
  this.__nodeIdToMetadata = {};
  Object3DUtil.removeAllChildren(this.__bbNodes);
};

SceneHierarchyPanel.prototype.__createTreeNode = function(object3D, index) {
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
  var modelInstance = Object3DUtil.getModelInstance(object3D);
  if (modelInstance) {
    this.__addModelInfoToTreeNode(treeNode, modelInstance);
  } else {
    var info = this.__createSummaryInfo(object3D);
    treeNode.li_attr = {
      title: JSON.stringify(info, null, ' ')
    };
  }
  this.__nodeIdToMetadata[shId] = { object3D: object3D, modelInstance: modelInstance };
  return treeNode;
};

SceneHierarchyPanel.prototype.__addTreeNode = function(treeNodes, object3D, index) {
  if (index == null) {
    index = treeNodes.length;
  }
  treeNodes[index] = this.__createTreeNode(object3D, index);
  return treeNodes[index];
};

SceneHierarchyPanel.prototype.__createSummaryInfo = function(object3D) {
  // Create title data for a Object3D node
  var nRooms = _.sumBy(object3D.children, function(node) { return node.name === 'Room'? 1:0; });
  var nGround = _.sumBy(object3D.children, function(node) { return node.name === 'Ground'? 1:0; });
  var nBoxes = _.sumBy(object3D.children, function(node) { return node.name === 'Box'? 1:0; });
  var nWindows = _.sumBy(object3D.children, function(node) {
    return (node.userData.type === 'ModelInstance' && Object3DUtil.getModelInstance(node).model.isWindow())? 1:0;
  });
  var nDoors = _.sumBy(object3D.children, function(node) {
    return (node.userData.type === 'ModelInstance' && Object3DUtil.getModelInstance(node).model.isDoor())? 1:0;
  });
  var nPeople = _.sumBy(object3D.children, function(node) {
    return (node.userData.type === 'ModelInstance' && Object3DUtil.getModelInstance(node).model.isPerson())? 1:0;
  });
  var nPlants = _.sumBy(object3D.children, function(node) {
    return (node.userData.type === 'ModelInstance' && Object3DUtil.getModelInstance(node).model.isPlant())? 1:0;
  });
  var nStairs = _.sumBy(object3D.children, function(node) {
    return (node.userData.type === 'ModelInstance' && Object3DUtil.getModelInstance(node).model.isStairs())? 1:0;
  });
  var nStruct = _.sumBy(object3D.children, function(node) {
    return (node.userData.type === 'ModelInstance' && Object3DUtil.getModelInstance(node).model.isStructure())? 1:0;
  });
  var nObjects = _.sumBy(object3D.children, function(node) { return node.userData.type === 'ModelInstance'? 1:0; });
  nObjects = nObjects - nWindows - nDoors - nStruct - nStairs;
  var stats = { nRooms: nRooms, nStructure: nStruct, nStairs: nStairs,
    nWindows: nWindows, nDoors: nDoors, nPeople: nPeople, nPlants: nPlants,
    nObjects: nObjects, nGround: nGround, nBoxes: nBoxes,
    nChildren: object3D.children.length };
  stats = _.pickBy(stats, function(x) { return x > 0; });
  var info = _.assign(stats,
    _.pick(object3D.userData, ['id', 'roomId', 'roomType', 'origRoomType', 'holeIds']));
  return info;
};

SceneHierarchyPanel.prototype.__updateJsTreeNode = function(node) {
  if (node) {
    var object3D = this.__getObject3D(node);
    var updatedTitle = JSON.stringify(this.__createSummaryInfo(object3D), null, ' ');
    node.li_attr.title = updatedTitle;
  }
};

SceneHierarchyPanel.prototype.__addModelInfoToTreeNode = function(treeNode, modelInstance) {
  if (modelInstance && modelInstance.model.info) {
    var object = modelInstance.object3D;
    var minfo = modelInstance.model.info;
    var name = minfo.name;
    var modelid = minfo.fullId;
    if (name) treeNode.text = name;
    else if (modelid) treeNode.text = modelid;

    var info = _.pick(object.userData, ['id', 'roomIds', 'wallIds']);
    if (this.tooltipIncludeFields && this.tooltipIncludeFields.length) {
      var m = _.pick(minfo, this.tooltipIncludeFields);
      if (_.size(m) > 0) {
        info.model = m;
      }
    }
    treeNode.li_attr = {
      title: JSON.stringify(info, null, ' ')
    };
    if (this.useIcons && this.app && this.app.assetManager) {
      var screenshotUrl = this.app.assetManager.getImagePreviewUrl(minfo.source, minfo.id, undefined, minfo);
      if (screenshotUrl) {
        treeNode.icon = screenshotUrl;
      }
    }
  }
};

SceneHierarchyPanel.prototype.__convertToTreeNodes = function(sceneState) {
  var treeNodes = this.__convertModelInstancesToTreeNodes(sceneState);
  // get additional hierarchy encoded in scene structure
  // (include groups and add them as parents)
  var scope = this;
  sceneState.scene.traverse(function (object3D) {
    var nodeId = scope.__getTreeNodeId(object3D);
    if (nodeId != null) {
      var index = nodeId.replace(scope.__prefix, '');
      var parentId = scope.__getTreeNodeId(object3D.parent);
      if (parentId != null) {
        treeNodes[index].parent = parentId;
      }
    } else if (/*object3D instanceof THREE.Group*/ object3D.userData.sceneHierarchyGroup || object3D.userData.id != null) {
      scope.__addTreeNode(treeNodes, object3D);
    }
  });
  return treeNodes;
};

SceneHierarchyPanel.prototype.__convertModelInstancesToTreeNodes = function (sceneState) {
  // Convert scene to jstree data
  var treeNodes = [];
  var modelInstances = sceneState.modelInstances;
  //var roots = [];
  for (var i = 0; i < modelInstances.length; i++) {
    var modelInstance = modelInstances[i];
    var index = i;
    var shId = this.__prefix + index;
    if (modelInstance) {
      var object = modelInstance.object3D;
      this.__setTreeNodeId(object, shId);
      // Object has metadata - use it figure out how the hierarchy is
      var child = treeNodes[index];
      if (!object.parent) {
        console.warn('No parent for object', object);
      }
      var parentIndex = object.parent.index;
      var parentId = (parentIndex >= 0) ? this.__prefix + parentIndex : '#';
      if (!child) {
        treeNodes[index] = {
          id: shId,
          icon: false,
          parent: parentId,
          text: index,
          data: {objId: object.id, modelInstanceIndex: index, index: index}
        };
        child = treeNodes[index];
        this.__addModelInfoToTreeNode(child, modelInstance);
      }
    } else {
      treeNodes[index] = {
        id: shId,
        icon: false,
        parent: '#',
        text: index,
        data: { modelInstanceIndex: index, index: index }
      };
    }
  }
  return treeNodes;
};

SceneHierarchyPanel.prototype.__getModelInstanceOrObject3D = function(treeNode) {
  if (treeNode.data) {
    var modelInstanceIndex = treeNode.data['modelInstanceIndex'];
    if (modelInstanceIndex != undefined) {
      var modelInstance = this.sceneState.modelInstances[modelInstanceIndex];
      if (modelInstance) {
        return modelInstance;
      }
    }
    var objId = treeNode.data['objId'];
    if (objId != undefined) {
      return this.sceneState.fullScene.getObjectById(objId);
    }
  }
};

SceneHierarchyPanel.prototype.__getObject3D = function(treeNode) {
  if (treeNode.data) {
    var objId = treeNode.data['objId'];
    if (objId != undefined) {
      return this.sceneState.fullScene.getObjectById(objId);
    }
  }
};

SceneHierarchyPanel.prototype.__getHilbertNumber = function(node) {
  var h = this.__getMetadata(node, 'hilbert');
  if (h != undefined) return h;
  var bb = this.__getBoundingBox(node);
  if (bb) {
    var centroid = bb.centroid();
    var sceneBB = Object3DUtil.getBoundingBox(this.sceneState.scene);
    //var sceneBBDims = sceneBB.dimensions();
    var c = new THREE.Vector3();
    c.subVectors(centroid, sceneBB.min);
    //c.multiplyScalar(1024/Math.max(sceneBBDims.x, sceneBBDims.z));
    if (!this.__hilbert) {
      this.__hilbert = new hilbert.Hilbert2d(2);
    }
    h = this.__hilbert.xy2d(c.x, c.z);
    // console.log('centroid ' + Object3DUtil.vectorToString(c) + ', h=' + h);
    this.__setMetadata(node, 'hilbert', h);
    return h;
  }
};

SceneHierarchyPanel.prototype.__getBoundingBox = function(node) {
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

SceneHierarchyPanel.prototype.__showBoundingBox = function(nodes, flag) {
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

SceneHierarchyPanel.prototype.__getMetadata = function(node, field) {
  var metadata = this.__nodeIdToMetadata[node.id];
  if (metadata) {
    return metadata[field];
  }
};

SceneHierarchyPanel.prototype.__setMetadata = function(node, field, value) {
  var metadata = this.__nodeIdToMetadata[node.id];
  if (metadata) {
    metadata[field] = value;
  } else {
    this.__nodeIdToMetadata[node.id] = {};
    this.__nodeIdToMetadata[node.id][field] = value;
  }
};

SceneHierarchyPanel.prototype.__showBoundingBoxForNode = function(node, flag) {
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

SceneHierarchyPanel.prototype.__getObjects = function(nodes, objects) {
  objects = objects || [];
  if (!Array.isArray(nodes)) {
    nodes = [nodes];
  }
  for (var i = 0; i < nodes.length; i++) {
    this.__getObjectsForNode(nodes[i], objects);
  }
  return objects;
};

SceneHierarchyPanel.prototype.__getObjectsForNode = function(node, objects) {
  objects = objects || [];
  var obj = this.__getObject3D(node);
  if (obj) {
    objects.push(obj);
  }
  return objects;
};

SceneHierarchyPanel.prototype.__createGroup = function(name, parentObject3D) {
  var newgroup = new THREE.Group();
  newgroup.name = name;
  newgroup.userData.type = name;
  newgroup.userData.sceneHierarchyGroup = true;
  this.sceneState.addExtraObject(newgroup);
  Object3DUtil.attachToParent(newgroup, parentObject3D, this.sceneState.scene);
  return newgroup;
};

SceneHierarchyPanel.prototype.__markFreeNode = function(node) {
  var treeNode = this.__treeNodes[node.data.index];
  treeNode.data = _.clone(node.data);
  treeNode.__isFree = true;
  treeNode.parent = '#';
  this.__freeTreeNodes.push(treeNode);
};

SceneHierarchyPanel.prototype.__getFreeTreeNode = function(treeNodes, name, parent) {
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
    Object3DUtil.attachToParent(g, parentObject3D, this.sceneState.scene);
  } else {
    var g = this.__createGroup(name, parentObject3D);
    t = this.__addTreeNode(treeNodes, g);
  }
  t.parent = parent.id;
  return t;
};

SceneHierarchyPanel.prototype.__fixIconSizes = function() {
  // console.log('fix icon sizes');
  if (this.useIcons) {
    // Make sure the size of the icons are okay
    this.tree.find('.jstree-themeicon-custom').css('background-size', '24px');
  }
};

SceneHierarchyPanel.prototype.__updateSceneTree = function(treeNodes) {
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
        } else if (obj.userData.roomType) {
          for (var i = 0; i < obj.userData.roomType.length; i++) {
            var rt = obj.userData.roomType[i].toLowerCase();
            if (rt === s) {
              return true;
            }
          }
        } else {
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
  if (this.useSort) {
    plugins.push('sort');
  }
  if (this.allowEditHierarchy) {
    plugins.push('dnd');
  }
  this.tree.jstree({
    'core': {
      'check_callback' : this.allowEditHierarchy,
      'data': treeNodes,
      'themes': { 'name': 'default', 'responsive': true, 'stripes': true, 'icons': this.useIcons }
    },
    'sort': function(id1, id2) {
      var order = scope.configControls.getFieldValue('sort');
      var n1 = scope.tree.jstree('get_node', id1);
      var n2 = scope.tree.jstree('get_node', id2);
      var isFloor1 = n1.text.startsWith('Level#');
      var isFloor2 = n2.text.startsWith('Level#');
      if (isFloor1 || isFloor2) {
        // Have floor nodes go before
        if (isFloor1 > isFloor2) return -1;
        else if (isFloor1 < isFloor2) return 1;
        else {
          if (n1.data.index < n2.data.index) return -1;
          else if (n1.data.index > n2.data.index) return 1;
          else return 0;
        }
      }
      var isLeaf1 = n1.children.length === 0;
      var isLeaf2 = n2.children.length === 0;
      if (isLeaf1 !== isLeaf2) {
        // Have leaf nodes go before
        if (isLeaf1 > isLeaf2) return -1;
        else return 1;
      }
      var isModelInstance1 = n1.data.modelInstanceIndex != undefined;
      var isModelInstance2 = n2.data.modelInstanceIndex != undefined;
      if (isModelInstance1 !== isModelInstance2) {
        // Have model instance go before
        if (isModelInstance1 > isModelInstance2) return -1;
        else return 1;
      }

      // Sort by specified sort order
      var k1 = n1.data.index;
      var k2 = n2.data.index;
      if (order === 'name') {
        k1 = n1.text;
        k2 = n2.text;
      } else if (order === 'hilbert' && !isFloor1 && !isFloor2) {
        k1 = scope.__getHilbertNumber(n1);
        k2 = scope.__getHilbertNumber(n2);
      }
      if (k1 < k2) return -1;
      else if (k1 > k2) return 1;
      else {
        if (n1.data.index < n2.data.index) return -1;
        else if (n1.data.index > n2.data.index) return 1;
        else return 0;
      }
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
        var basicItems = {
          lookAtItem : {
            "label" : "Look at",
            "action" : function(item) {
              // Handle look at item for multiple selected
              var selected = scope.tree.jstree('get_selected', true);
              var targets = scope.__getObjects(selected);
              //var targets = scope.__getObjects(node);  // Only look at single item
              if (targets && targets.length) {
                scope.app.lookAt(targets);
              }
            },
            "_class" : "class"
          },
          showItem : {
            "label" : "(S)how - hide other nodes",
            "shortcut": 83,
            "shortcut_label": 's',
            "action" : function(item) {
              // Handle show item for multiple selected
              var selected = scope.tree.jstree('get_selected', true);
              scope.__showItems(selected);
            },
            "_class" : "class"
          },
          showAll : {
            "label" : "Show (a)ll",
            "shortcut": 65,
            "shortcut_label": 'a',
            "action" : function(item) {
              scope.app.showAll();
            },
            "_class" : "class"
          },
          openModelViewer : {
            "label" : "Show (m)odel",
            "shortcut": 77,
            "shortcut_label": 'm',
            "action" : function(item) {
              scope.__openModelViewer(node);
            },
            "_class" : "class"
          }
        };
        if (!scope.modelViewerUrl) {
          delete basicItems['openModelViewer'];
        }
        var items = basicItems;

        // Remove disallowed entries
        var target = scope.__getObject3D(node);
        var modelInstance = Object3DUtil.getModelInstance(target);
        if (!modelInstance) {
          delete items['openModelViewer'];
        } else {
          if (scope.supportAttachment) {
            items['identifyAttachment'] = {
              "separator_before": false,
              "separator_after": false,
              "label": "Identify attachment",
              "action": function (obj) {
                var attachment = scope.sceneState.identifyAttachment(modelInstance, null, { checkOpposite: true });
                console.log(attachment);
              }
            };
          }
        }
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
          if (!scope.allowEditScene) {
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
      var childObject3D = scope.__getObject3D(data.node);
      var newParentObject3D = scope.__getObject3D(newParent);
      if (childObject3D) {
        Object3DUtil.attachToParent(childObject3D, newParentObject3D, scope.sceneState.scene);
      } else {
        console.log('Cannot find object3D', data.node);
      }
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

SceneHierarchyPanel.prototype.__openModelViewer = function(node) {
  var modelInstance = this.__getModelInstanceOrObject3D(node);
  if (modelInstance && modelInstance.model) {
    var fullId = modelInstance.model.getFullID();
    window.open(this.modelViewerUrl + '?modelId=' + fullId, 'Model Viewer');
  }
};

SceneHierarchyPanel.prototype.__groupSelected = function(node) {
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

SceneHierarchyPanel.prototype.__ungroup = function(node) {
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

SceneHierarchyPanel.prototype.__notifySelectionChanged = function() {
  if (this.app.selectMode) {
    var selected = this.getSelectedObjects();
    this.app.setSelectedObjects(selected, {suppressNotify: [this]});
  }
};

SceneHierarchyPanel.prototype.__showItems = function(nodes) {
  var targets = this.__getObjects(nodes);
  this.app.showOnly(targets);
};

SceneHierarchyPanel.prototype.__showObjectDetails = function (modelInstanceOrObject3D) {
  var object3D = (modelInstanceOrObject3D instanceof THREE.Object3D)? modelInstanceOrObject3D : modelInstanceOrObject3D.object3D;
  // TODO: callback to show more information about selected model?
  if (modelInstanceOrObject3D.model) {
    console.log('clicked ' + modelInstanceOrObject3D.model.getFullID());
  }
  console.log(modelInstanceOrObject3D);
  var bb = Object3DUtil.getBoundingBox(object3D);
  console.log('BB: ' + bb.toString());
};

SceneHierarchyPanel.prototype.__showNodeDetails = function (node) {
  var target = this.__getModelInstanceOrObject3D(node);
  if (target) {
    this.__showObjectDetails(target);
  } else {
    var bb = this.__getBoundingBox(node);
    console.log('BB: ' + bb.toString());
  }
};

SceneHierarchyPanel.prototype.searchScene = function (entity) {
  if (!entity) {
    if (this.treeSearchTextElem) entity = this.treeSearchTextElem.val();
  }
  if (!entity || !this.tree) return;
  console.log('Search for ' + entity);
  this.tree.jstree('search', entity);
};

SceneHierarchyPanel.prototype.saveHierarchy = function () {
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

SceneHierarchyPanel.prototype.loadHierarchy = function(json) {
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
  var roots = [];
  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    var obj = objects[i];
    if (node.parent != undefined && node.parent >= 0) {
      var parentObj = objects[node.parent];
      //console.log('node ' + i + ', parent ' + node.parent);
      Object3DUtil.attachToParent(obj, parentObj, this.sceneState.scene);
    } else {
      roots.push(i);
      Object3DUtil.detachFromParent(obj, this.sceneState.scene);
    }
  }
  // clear empty groups from the scene
  var emptyGroups = Object3DUtil.findNodes(this.sceneState.scene, function(x) {
    return (x instanceof THREE.Group) && (x.children.length === 0) && (x.userData.sceneHierarchyGroup);
  });
  //console.log('emptyGroups', emptyGroups);
  for (var i = 0; i < emptyGroups.length; i++) {
    this.sceneState.removeExtraObject(emptyGroups[i]);
  }
  // Update our tree
  this.setSceneState(this.sceneState);
};

SceneHierarchyPanel.prototype.selectObject = function(object3D, deselectOthers) {
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
        this.__addDeferred( this.selectObject.bind(this,object3D,deselectOthers) );
      }
    } else {
      console.warn('Unable to select node ' + nodeId);
      this.__addDeferred( this.selectObject.bind(this,object3D,deselectOthers) );
    }
  }
  this.__showObjectDetails(object3D);
};

SceneHierarchyPanel.prototype.setSelectedObjects = function(objects) {
  if (this.tree) {
    var nodeIds = this.__getTreeNodeIds(objects);
    this.tree.jstree('deselect_all', true); // suppress events
    this.tree.jstree('select_node', nodeIds, true); // suppress events
  }
};

SceneHierarchyPanel.prototype.updateObjectSelection = function(objects, selected) {
  var nodeIds = this.__getTreeNodeIds(objects);
  if (nodeIds.length > 0) {
    if (selected) {
      this.tree.jstree('select_node', nodeIds, true);  // suppress events
    } else {
      this.tree.jstree('deselect_node', nodeIds, true);   // suppress events
    }
  }
};

SceneHierarchyPanel.prototype.selectAndGroup = function(objects) {
  this.setSelectedObjects(objects);
  this.__groupSelected();
};

SceneHierarchyPanel.prototype.__addDeferred = function(cb) {
  if (!this.__deferred) {
    this.__deferred = [];
  }
  this.__deferred.push(cb);
};

SceneHierarchyPanel.prototype.onResize = function() {
};

SceneHierarchyPanel.prototype.onActivate = function() {
  this.onResize();
  if (this.__deferred) {
    for (var i = 0; i < this.__deferred.length; i++) {
      this.__deferred[i]();
    }
    delete this.__deferred;
  }
};

SceneHierarchyPanel.prototype.showAlert = function(message, style) {
  UIUtil.showAlert(this.container, message, style || 'alert-danger');
};

// Exports
module.exports = SceneHierarchyPanel;
