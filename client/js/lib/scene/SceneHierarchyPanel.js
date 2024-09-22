'use strict';

const Constants = require('Constants');
const AssetLoader = require('assets/AssetLoader');
const ConfigControls  = require('ui/ConfigControls');
const Object3DUtil = require('geo/Object3DUtil');
const MeshHelpers = require('geo/MeshHelpers');
const FileUtil = require('io/FileUtil');
const UIUtil = require('ui/UIUtil');
const SceneUtil = require('scene/SceneUtil');
const SolrQueryParser = require('search/SolrQueryParser');
const TypeUtils = require('data/TypeUtils');
const keymap = require('controls/keymap');
const hilbert = require('hilbert');
const _ = require('util/util');

/**
 * Specification for how nodes can be marked
 * @typedef scene.MarkNodesDef
 * @type {object}
 * @property fields {string[]} field names to export
 * @property marks {MarkDef[]} valid marks
 * @property [action] {function(object3D,mark)} action to apply on node
 */

/**
 * Specification for individual node mark
 * @typedef scene.MarkDef
 * @type {object}
 * @property name {string} mark name
 * @property [color] {THREE.Color|string} color to apply to object
 */

/**
 * The SceneHierarchyPanel visualizes the scene graph as is
 *   with each node in the tree mapping to a object3D
 * Note: Some object3D instances in the scene graph
 *    may not be represented as a tree node
 * (to keep the tree relatively clean, semantic objects are shown, and
 *   raw meshes are typically not displayed)
 * @param params
 * @param [params.container]
 * @param params.assetManager {assets.AssetManager}
 * @param [params.tooltipIncludeFields] {string[]} List of fields to include for tooltip shown on hover
 * @param [params.onhoverCallback] {function(node, objects)} Callback for hovering over a tree node
 * @param [params.allowEditScene=false] {boolean} Whether editing of the scene is allowed
 * @param [params.allowEditHierarchy=false] {boolean} Whether editing of the hierarchy is allowed
 * @param [params.allowOpenCloseAll=true] {boolean} Whether to add open/close all buttons
 * @param [params.allowLoadSave=true] {boolean} Whether loading/saving of the hierarchy is supported
 * @param [params.autoCreateTree=true] {boolean}
 * @param [params.supportAttachment=true] {boolean} Whether to show support attachment options
 * @param [params.useIcons=false] {boolean} Whether to use screenshot icons in the tree nodes
 * @param [params.useSort=false] {boolean} Whether the tree nodes should be sorted
 * @param [params.quiet=false] {boolean} Whether to be quiet (not to log to console information about selected objects)
 * @param [params.defaultSortOrder='name'] {string} What sort ordering the tree nodes should follow (`hilbert|name`) if `useSort` is true
 * @param [params.modelViewerUrl='model-viewer'] {string} Url for opening up the model viewer
 * @param [params.getObjectIconUrl] {function(source,id,metadata)} Function that returns the image preview url
 * @param [params.markNodes] {MarkNodesDef} Specifications for marking nodes
 * @param [params.isTreeNodeVisible] {function(data, modelInstanceOrObject3D)} Callback controlling which tree nodes should be visible
 * @param [params.app] {SceneViewer} Parent application for scene hierarchy panel
 * @constructor
 */
function SceneHierarchyPanel(params) {
  // Container in which the scene hierarchy is displayed
  this.container = params.container;
  this.assetManager = params.assetManager;
  this.tooltipIncludeFields = params.tooltipIncludeFields;
  this.onhoverCallback = params.onhoverCallback;
  this.allowEditScene = params.allowEditScene;
  this.allowEditHierarchy = params.allowEditHierarchy;
  this.allowOpenCloseAll = (params.allowOpenCloseAll != undefined)? params.allowOpenCloseAll : true;
  this.allowLoadSave = (params.allowLoadSave != undefined)? params.allowLoadSave : true;
  this.autoCreateTree = (params.autoCreateTree != undefined)? params.autoCreateTree : true;
  this.supportAttachment = (params.supportAttachment != undefined)? params.supportAttachment : true;
  this.useIcons = params.useIcons;
  this.useSort = params.useSort;
  this.markNodes = params.markNodes;
  this.defaultSortOrder = params.defaultSortOrder || 'name';
  this.modelViewerUrl = params.modelViewerUrl || (params.app? params.app.modelViewerUrl: undefined) || 'model-viewer';
  this.app = params.app;
  this.quiet = params.quiet;
  this.__isTreeNodeVisibleCb = params.isTreeNodeVisible;
  // TODO: Remove this __treeNodes and __freeTreeNodes
  this.__treeNodes = null; // list of tree nodes used to construct the hierarchy (use internally only)
  this.__freeTreeNodes = [];
  this.__prefix = _.uniqueId('sh') + '_';
  this.__dataIdToNodeId = {}; // Map of external data id to our tree node id
  this.__nodeIdToMetadata = {};  // Make of node id to metadata
  this.__bbNodes = new THREE.Group(); // For holding our bounding box meshes
  this.__bbNodes.name = this.constructor.name + '-BoundingBoxes';

  const scope = this;
  this.getObjectIconUrl = params.getObjectIconUrl || function(source, id, metadata) {
    return scope.assetManager? scope.assetManager.getImagePreviewUrl(source, id, undefined, metadata) : null;
  };

  const iconBaseUrl = Constants.baseUrl + '/images/icons/';
  this.__iconUrls = {
    'Line': iconBaseUrl + 'line.svg',
    'Mesh': iconBaseUrl + 'mesh.svg',
    'Points': iconBaseUrl + 'points.svg',
    'Camera': iconBaseUrl + 'camera.svg',
    'Light': iconBaseUrl + 'light.svg',
  };
  this.init();
}

SceneHierarchyPanel.prototype.init = function () {
  if (this.container && this.container.length > 0) {
    const scope = this;
    this.configPanel = $('<div></div>');
    const configOptions = [];
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
        defaultValue: false
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
    if (this.allowOpenCloseAll) {
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
    }

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
      const loadFileInput = UIUtil.createFileInput({
        id: scope.__prefix + 'loadFile',
        label: 'Load',
        hideFilename: true,
        inline: true,
        style: 'basic',
        loadFn: function (file) {
          const loader = new AssetLoader();
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
      const identifySupportHierarchyButton = $('<input type="button" value="Support Hierarchy"/>')
        .click(function () {
          scope.identifySupportHierarchy();
        });
      this.buttonsPanel.append(identifySupportHierarchyButton);
    }

    this.configPanel.append(this.treeSearchPanel);
    this.configPanel.append(this.buttonsPanel);
    this.infoPanel = $('<div><div>');
    this.container.append(this.infoPanel);
    this.container.append(this.configPanel);
    this.container.append(this.treePanel);

    keymap({ on: 'g', do: 'Group selected models', filter: function(evt) {
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

SceneHierarchyPanel.prototype.identifySupportHierarchy = function() {
  const scope = this;
  if (scope.sceneState) {
    const useStatsForSupport = scope.configControls.getFieldValue('useStatsForSupport');
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
  const scope = this;
  if (scope.sceneState) {
    scope.sceneState.identifySupportHierarchy({groupBySupport: true, attachToParent: true,
        assetManager: scope.assetManager, aggregatedSceneStatistics: aggregatedSceneStatistics},
      function(err, attachments) {
        const addGroups = scope.configControls.getFieldValue('addGroupsToSupport');
        if (addGroups) {
          const supportRelations = SceneUtil.supportAttachmentsToRelations(attachments);
          const grouped = SceneUtil.identifyGroupings(scope.sceneState, supportRelations);
          // Translate groups to parent child relationship
          const regions = {};
          _.each(grouped, function(group, parentId) {
            // Each group is a BVH
            const bvh = group;
            //console.log(bvh, parentId);
            if (bvh.root.objects.length > 2) {
              bvh.traverse(function (bvhNode) {
                  const region = new THREE.Group();
                  region.name = 'Region-' + bvhNode.id;
                  region.userData.type = 'BVHGroup';
                  region.userData.sceneHierarchyGroup = true;
                  scope.sceneState.addExtraObject(region);
                  bvhNode.object3D = region;
                  if (bvhNode.parent) {
                    Object3DUtil.attachToParent(region, bvhNode.parent.object3D, scope.sceneState.scene);
                  } else {
                    let parent = scope.sceneState.findNode(function(x) { return x.name === 'Region-' + parentId + '-children'; });
                    if (parent == null) {
                      parent = scope.sceneState.findNode(function(x) { return x.userData.id === parentId; });
                    }
                    Object3DUtil.attachToParent(region, parent, scope.sceneState.scene);
                  }
                },
                function (bvhNode) {
                  if (bvhNode.objects) {
                    if (bvhNode.isLeaf) {
                      for (let j = 0; j < bvhNode.objects.length; j++) {
                        const obj = bvhNode.objects[j];
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
  const selected = this.tree.jstree('get_selected', true);
  return this.__getObjects(selected);
};

SceneHierarchyPanel.prototype.__getObjectKey = function(object) {
  return TypeUtils.getType(object) + '-' + object.id;
};

SceneHierarchyPanel.prototype.__getTreeParentNodeId = function(object3D, recursive, root) {
  if (recursive) {
    while (object3D.parent != null) {
      const tid = this.__getTreeNodeId(object3D.parent);
      if (tid != null) {
        return tid;
      }
      object3D = object3D.parent;
    }
    return root;
  } else {
    return this.__getTreeNodeId(object3D.parent ,root);
  }
};

SceneHierarchyPanel.prototype.__getTreeNodeId = function(object3D, defaultValue) {
  const id = object3D? this.__dataIdToNodeId[this.__getObjectKey(object3D)] : undefined;
  return (id != null)? id : defaultValue;
};

SceneHierarchyPanel.prototype.__setTreeNodeId = function(object3D, id) {
  this.__dataIdToNodeId[this.__getObjectKey(object3D)] = id;
};

SceneHierarchyPanel.prototype.__getTreeNodeIds = function(objects) {
  if (!Array.isArray(objects)) {
    objects = [objects];
  }
  const nodeIds = [];
  for (let i = 0; i < objects.length; i++) {
    const nodeId = this.__getTreeNodeId(objects[i]);
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
  const id = sceneState.getFullID();
  this.infoPanel.text(id != undefined? id : "");
  if (createTree) {
    const treeNodes = this.__convertToTreeNodes(sceneState);
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
  const parentId = this.__getTreeParentNodeId(object3D, true, '#');
  const shId = this.__prefix + index;
  this.__setTreeNodeId(object3D, shId);
  const treeNode = {
    id: shId,
    icon: false,
    parent: parentId,
    text: object3D.name || index.toString(),
    data: {objId: object3D.id, index: index}
  };
  if (object3D.userData.mark != null) {
    if (this.markNodes != null && this.markNodes.action) {
      const mark = this.markNodes.marks.find(m => m.name === object3D.userData.mark);
      if (mark) {
        this.markNodes.action(object3D, mark);
      }
    }
    treeNode.a_attr = {
      class: 'jstree-mark-' + object3D.userData.mark.toLowerCase()
    };
  }
  const modelInstance = Object3DUtil.getModelInstance(object3D);
  if (modelInstance) {
    this.__addModelInfoToTreeNode(treeNode, modelInstance);
  } else {
    const info = this.__createSummaryInfo(object3D);
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
  const nRooms = _.sumBy(object3D.children, function(node) { return node.name === 'Room'? 1:0; });
  const nGround = _.sumBy(object3D.children, function(node) { return node.name === 'Ground'? 1:0; });
  const nBoxes = _.sumBy(object3D.children, function(node) { return node.name === 'Box'? 1:0; });
  const nWindows = _.sumBy(object3D.children, function(node) {
    return (node.userData.type === 'ModelInstance' && Object3DUtil.getModelInstance(node).model.isWindow())? 1:0;
  });
  const nDoors = _.sumBy(object3D.children, function(node) {
    return (node.userData.type === 'ModelInstance' && Object3DUtil.getModelInstance(node).model.isDoor())? 1:0;
  });
  const nPeople = _.sumBy(object3D.children, function(node) {
    return (node.userData.type === 'ModelInstance' && Object3DUtil.getModelInstance(node).model.isPerson())? 1:0;
  });
  const nPlants = _.sumBy(object3D.children, function(node) {
    return (node.userData.type === 'ModelInstance' && Object3DUtil.getModelInstance(node).model.isPlant())? 1:0;
  });
  const nStairs = _.sumBy(object3D.children, function(node) {
    return (node.userData.type === 'ModelInstance' && Object3DUtil.getModelInstance(node).model.isStairs())? 1:0;
  });
  const nStruct = _.sumBy(object3D.children, function(node) {
    return (node.userData.type === 'ModelInstance' && Object3DUtil.getModelInstance(node).model.isStructure())? 1:0;
  });
  let nObjects = _.sumBy(object3D.children, function(node) { return node.userData.type === 'ModelInstance'? 1:0; });
  nObjects = nObjects - nWindows - nDoors - nStruct - nStairs;
  let stats = { nRooms: nRooms, nStructure: nStruct, nStairs: nStairs,
    nWindows: nWindows, nDoors: nDoors, nPeople: nPeople, nPlants: nPlants,
    nObjects: nObjects, nGround: nGround, nBoxes: nBoxes,
    nChildren: object3D.children.length };
  stats = _.pickBy(stats, function(x) { return x > 0; });
  const info = _.assign(stats,
    _.pick(object3D.userData, ['id', 'roomId', 'roomType', 'origRoomType', 'holeIds', 'level', 'wallId', 'mark']));
  return info;
};

SceneHierarchyPanel.prototype.__updateJsTreeNode = function(node) {
  if (node) {
    const object3D = this.__getObject3D(node);
    if (object3D) {
      const updatedTitle = JSON.stringify(this.__createSummaryInfo(object3D), null, ' ');
      node.li_attr.title = updatedTitle;
      this.tree.jstree('redraw_node', node);
    }
  }
};

SceneHierarchyPanel.prototype.__addModelInfoToTreeNode = function(treeNode, modelInstance) {
  //console.log('addModelInfoToTreeNode', modelInstance, this.useIcons, treeNode);
  if (modelInstance && modelInstance.model.info) {
    const object = modelInstance.object3D;
    const minfo = modelInstance.model.info;
    const name = minfo.name;
    const modelid = minfo.fullId;
    if (name) treeNode.text = name;
    else if (modelid) treeNode.text = modelid;

    const info = _.pick(object.userData, ['id', 'roomIds', 'wallIds', 'level']);
    if (this.tooltipIncludeFields && this.tooltipIncludeFields.length) {
      const m = _.pick(minfo, this.tooltipIncludeFields);
      if (_.size(m) > 0) {
        info.model = m;
      }
    }
    treeNode.li_attr = {
      title: JSON.stringify(info, null, ' ')
    };
    if (this.useIcons && this.getObjectIconUrl && minfo.id != null) {
      const screenshotUrl = this.getObjectIconUrl(minfo.source, minfo.id, minfo);
      if (screenshotUrl) {
        treeNode.icon = screenshotUrl;
      }
    }
    if (this.useIcons && !treeNode.icon) {
      const nodeType = modelInstance.model.nodeType;
      treeNode.icon = nodeType ? this.__iconUrls[nodeType] : null;
    }
  }
};

SceneHierarchyPanel.prototype.__convertToTreeNodes = function(sceneState) {
  const treeNodes = this.__convertModelInstancesToTreeNodes(sceneState);
  // get additional hierarchy encoded in scene structure
  // (include groups and add them as parents)
  const scope = this;
  // TODO: Do something about object3D.userData.type === 'Part' in scene hierarchy
  sceneState.scene.traverse(function (object3D) {
    const nodeId = scope.__getTreeNodeId(object3D);
    if (nodeId != null) {
      const index = nodeId.replace(scope.__prefix, '');
      const parentId = scope.__getTreeParentNodeId(object3D, true);
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
  const treeNodes = [];
  const modelInstances = sceneState.modelInstances;
  for (let i = 0; i < modelInstances.length; i++) {
    const modelInstance = modelInstances[i];
    const index = i;
    const shId = this.__prefix + index;
    if (modelInstance) {
      const object = modelInstance.object3D;
      this.__setTreeNodeId(object, shId);
      // Object has metadata - use it figure out how the hierarchy is
      let child = treeNodes[index];
      if (!object.parent) {
        console.warn('No parent for object', object);
      }
      const parentIndex = object.parent.index;
      const parentId = (parentIndex >= 0) ? this.__prefix + parentIndex : '#';
      if (!child) {
        treeNodes[index] = {
          id: shId,
          icon: false,
          parent: parentId,
          text: index.toString(),
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
        text: index.toString(),
        data: { modelInstanceIndex: index, index: index }
      };
    }
  }
  return treeNodes;
};

SceneHierarchyPanel.prototype.__getModelInstanceOrObject3D = function(treeNode) {
  if (treeNode.data) {
    const modelInstanceIndex = treeNode.data['modelInstanceIndex'];
    if (modelInstanceIndex != undefined) {
      const modelInstance = this.sceneState.modelInstances[modelInstanceIndex];
      if (modelInstance) {
        return modelInstance;
      }
    }
    const objId = treeNode.data['objId'];
    if (objId != undefined) {
      return this.sceneState.fullScene.getObjectById(objId);
    }
  }
};

SceneHierarchyPanel.prototype.__getObject3D = function(treeNode) {
  if (treeNode.data) {
    const objId = treeNode.data['objId'];
    if (objId != undefined) {
      return this.sceneState.fullScene.getObjectById(objId);
    }
  }
};

SceneHierarchyPanel.prototype.__getRootObject3D = function() {
  return this.sceneState.scene;
};

SceneHierarchyPanel.prototype.__getHilbertNumber = function(node) {
  let h = this.__getMetadata(node, 'hilbert');
  if (h != undefined) return h;
  const bb = this.__getBoundingBox(node);
  if (bb) {
    const centroid = bb.centroid();
    const sceneBB = Object3DUtil.getBoundingBox(this.sceneState.scene);
    //constsceneBBDims = sceneBB.dimensions();
    const c = new THREE.Vector3();
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
  const obj3D = this.__getObject3D(node);
  if (obj3D) {
    return Object3DUtil.getBoundingBox(obj3D);
  } else {
    const objects = this.__getObjects(node);
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
    for (let i = 0; i < nodes.length; i++) {
      this.__showBoundingBoxForNode(nodes[i], flag);
    }
  } else {
    if (flag) {
      for (let i = 0; i < this.__treeNodes.length; i++) {
        if (!this.__treeNodes[i].__isFree) {
          const node = this.tree.jstree('get_node', this.__treeNodes[i].id);
          this.__showBoundingBoxForNode(node, flag);
        }
      }
    }
  }
};

SceneHierarchyPanel.prototype.__getMetadata = function(node, field) {
  const metadata = this.__nodeIdToMetadata[node.id];
  if (metadata) {
    return metadata[field];
  }
};

SceneHierarchyPanel.prototype.__setMetadata = function(node, field, value) {
  const metadata = this.__nodeIdToMetadata[node.id];
  if (metadata) {
    metadata[field] = value;
  } else {
    this.__nodeIdToMetadata[node.id] = {};
    this.__nodeIdToMetadata[node.id][field] = value;
  }
};

SceneHierarchyPanel.prototype.__showBoundingBoxForNode = function(node, flag) {
  let bboxMesh = this.__getMetadata(node, 'boundingBoxMesh');
  if (!bboxMesh && !flag) {
    return; // No bounding box: OKAY
  }
  const bbox = this.__getBoundingBox(node);
  const createMesh = !bboxMesh;
  if (!createMesh) {
    // If scene was edited, will need to update bounding box mesh
    // TODO: check if boundingBoxMesh and current bounding box of node is compatible
  }
  if (createMesh) {
    if (bboxMesh) {
      this.__bbNodes.remove(bboxMesh);
    }
    const mesh = new MeshHelpers.BoxMinMax(bbox.min, bbox.max, Object3DUtil.TransparentMat);
    const boxwf = new THREE.BoxHelper(mesh);
    const material = this.app.picker.highlightMaterial;
    const boxwffat = new MeshHelpers.FatLines(boxwf, 0.05*Constants.metersToVirtualUnit, material);

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
  for (let i = 0; i < nodes.length; i++) {
    this.__getObjectsForNode(nodes[i], objects);
  }
  return objects;
};

SceneHierarchyPanel.prototype.__getObjectsForNode = function(node, objects) {
  objects = objects || [];
  const obj = this.__getObject3D(node);
  if (obj) {
    objects.push(obj);
  }
  return objects;
};

SceneHierarchyPanel.prototype.__reattach3DObjects = function(treeNode, newParent, oldParent) {
  // Reattach child to new parent (for restructuring underlying scene graph)
  const childObject3D = this.__getObject3D(treeNode);
  const newParentObject3D = this.__getObject3D(newParent);
  if (childObject3D) {
    Object3DUtil.attachToParent(childObject3D, newParentObject3D, this.__getRootObject3D());
  } else {
    console.log('Cannot find object3D', treeNode);
  }
};

SceneHierarchyPanel.prototype.__createGroup3D = function(name, parentObject3D) {
  const newgroup = new THREE.Group();
  newgroup.name = name;
  newgroup.userData.type = name;
  newgroup.userData.sceneHierarchyGroup = true;
  this.sceneState.addExtraObject(newgroup);
  Object3DUtil.attachToParent(newgroup, parentObject3D, this.__getRootObject3D());
  return newgroup;
};

SceneHierarchyPanel.prototype.__markObject3DNodes = function(object3Ds, mark, action) {
  object3Ds.forEach(object3D => {
    // console.log('markNode', node.userData, mark);
    object3D.userData.mark = mark ? mark.name : undefined;
    if (action) {
      action(object3D, mark);
    }
    const nodeId = this.__getTreeNodeId(object3D);
    const jstn = this.tree.jstree('get_node', nodeId);
    const attrclass = _.get(jstn, 'a_attr.class', '').split(' ').filter(x => !x.startsWith('jstree-mark'));
    if (mark) {
      attrclass.push('jstree-mark-' + mark.name.toLowerCase());
    }
    _.set(jstn, 'a_attr.class', attrclass.join(' '));
    this.__updateJsTreeNode(jstn);
  });
};

SceneHierarchyPanel.prototype.__editMarkNote = function(object3Ds, markFields) {
  // Requires special bootbox with form support
  const markNote = object3Ds[0].userData.markNote || {};
  const questions = markFields.map(x => {
    const c = _.clone(x);
      c.value = markNote[x.name];
      return c;
    });
  bootbox.form({
    title: 'Mark note',
    inputs: questions,
    callback: function(results) {
      if (results) {
        const config = {}
        _.each(questions, function(q,i) {
          if (results[i].length > 0) {
            config[q.name] = results[i];
          }
        });
        object3Ds.forEach(object3D => {
          object3D.userData.markNote = config;
        });
      }
    }
  });
};

SceneHierarchyPanel.prototype.__exportMarkedObject3DNodes = function(fields) {
  const root = this.__getRootObject3D();
  const marked = Object3DUtil.findNodes(root, function (node) {
    return node.userData.mark != null || node.userData.markNote != null;
  });
  const saveFields = fields.concat(['mark','markNote']);
  const marks = marked.map(x => { return _.pick(x.userData, saveFields) });
  const id = this.sceneState.info.id;
  FileUtil.saveJson({ id: id, marks: marks }, id + '.marked.json');
};

SceneHierarchyPanel.prototype.__importMarkedObject3DNodes = function(entries) {
  if (!this.markNodes.marksByName) {
    this.markNodes.marksByName = _.keyBy(this.markNodes.marks, 'name');
  }
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const eid = entry.id;
    let object3D = null;
    if (entry.holeIndex !== '') {
      object3D = this.sceneState.findNode(obj => {
        return obj.userData.wallId === entry.wallId && obj.userData.id === eid;
      });
    } else {
      object3D = this.sceneState.findNodeById(eid);
    }
    if (object3D) {
      const mark = this.markNodes.marksByName[entry.mark];
      if (mark) {
        this.__markObject3DNodes([object3D], mark, this.markNodes.action);
      } else {
        console.warn('Error importing marks: Unknown mark ' + entry.mark + ' for entry ' + i,
          entry, Object.keys(this.markNodes.marksByName));
      }
      if (entry.markNote) {
        object3D.userData.markNote = entry.markNote;
      }
    } else {
      console.warn('Error importing marks: Cannot find object for entry ' + i, entry);
    }
  }
};

SceneHierarchyPanel.prototype.__importMarkedObject3DNodesFromFile = function(options) {
  FileUtil.readAsync(options.file || options.path, 'json', (err, parsed) => {
    if (err) {
      this.showAlert('Error importing marks');
      console.error('Error importing marks', options, err);
      callback(err, null);
    } else {
      this.__importMarkedObject3DNodes(parsed.marks);
    }
  });
};

SceneHierarchyPanel.prototype.__markFreeNode = function(node) {
  const treeNode = this.__treeNodes[node.data.index];
  treeNode.data = _.clone(node.data);
  treeNode.__isFree = true;
  treeNode.parent = '#';
  this.__freeTreeNodes.push(treeNode);
};

SceneHierarchyPanel.prototype.__getFreeTreeNode = function(treeNodes, name, parent) {
  const parentObject3D = this.__getObject3D(parent);
  let t;
  if (this.__freeTreeNodes.length > 0) {
    t = this.__freeTreeNodes.pop();
    if (!t.__isFree) {
      console.warn('Attempting to reuse non-free tree node', t);
    }
    delete t.__isFree;
    t.name = name;

    const g = this.__getObject3D(t);
    console.log('free node', t, g);
    if (!(g instanceof THREE.Group) || g.children.length > 0 || g.userData.id != null) {
      console.warn('Attempting to reuse object3D', g);
    }
    g.name = name;
    g.userData.type = name;
    Object3DUtil.attachToParent(g, parentObject3D, this.__getRootObject3D());
  } else {
    const g = this.__createGroup3D(name, parentObject3D);
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

SceneHierarchyPanel.prototype.__searchTreeCb = function(searchStr, node) {
  if (!searchStr) return false;
  const obj = this.__getObject3D(node);
  if (obj) {
    if (searchStr.indexOf(':') > 0) {
      // Try term value search
      console.log('Try solr query', searchStr);
      const filter = SolrQueryParser.getFilterCached(searchStr);
      console.log('check filter',  obj.userData, filter(obj.userData));
      let matched = filter(obj.userData);
      if (!matched) {
        const modelInstance = Object3DUtil.getModelInstance(obj);
        if (modelInstance) {
          matched = filter(modelInstance.model.info);
        }
      }
      return matched;
    } else {
      // Basic search
      const s = searchStr.toLowerCase();
      //console.log(node);
      if (node.text && node.text.toLowerCase().indexOf(s) >= 0) {
        return true;
      } else if (obj.userData.id != null && obj.userData.id.toString().toLowerCase() === s) {
        return true;
      } else if (obj.userData.roomType) {
        for (let i = 0; i < obj.userData.roomType.length; i++) {
          const rt = obj.userData.roomType[i].toLowerCase();
          if (rt === s) {
            return true;
          }
        }
      } else {
        const modelInstance = Object3DUtil.getModelInstance(obj);
        if (modelInstance) {
          if (modelInstance.model.hasCategorySimilar(s)) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

SceneHierarchyPanel.prototype.__updateSceneTree = function(treeNodes) {
  this.__treeNodes = treeNodes;
  //console.log(treeNodes);

  if (!this.treePanel) return;  // No tree panel!!!
  const scope = this;
  const searchOptions = {
    'case_insensitive': true,
    'search_callback': function(searchStr, node) {
      return scope.__searchTreeCb(searchStr, node);
    }
  };
  this.treePanel.empty();
  this.tree = $('<div class="tree"></div>');
  this.treePanel.append(this.tree);
  const plugins = ['search', 'contextmenu', 'changed'];
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
      const order = scope.configControls.getFieldValue('sort');
      const n1 = scope.tree.jstree('get_node', id1);
      const n2 = scope.tree.jstree('get_node', id2);
      const isFloor1 = (typeof(n1.text) === 'string') && n1.text.startsWith('Level#');
      const isFloor2 = (typeof(n2.text) === 'string') && n2.text.startsWith('Level#');
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
      const isLeaf1 = n1.children.length === 0;
      const isLeaf2 = n2.children.length === 0;
      if (isLeaf1 !== isLeaf2) {
        // Have leaf nodes go before
        if (isLeaf1 > isLeaf2) return -1;
        else return 1;
      }
      const isModelInstance1 = n1.data.modelInstanceIndex != undefined;
      const isModelInstance2 = n2.data.modelInstanceIndex != undefined;
      if (isModelInstance1 !== isModelInstance2) {
        // Have model instance go before
        if (isModelInstance1 > isModelInstance2) return -1;
        else return 1;
      }

      // Sort by specified sort order
      let k1 = n1.data.index;
      let k2 = n2.data.index;
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
        const objects = scope.__getObjects(nodes);
        const draggable = _.all(objects, function(obj) {
          return obj.userData.isEditable == undefined || obj.userData.isEditable;
        });
        return draggable;
      }
    },
    'contextmenu':{
      "items": function(node) {
        const selected = scope.tree.jstree('get_selected', true);
        const targets = scope.__getObjects(selected);
        const basicItems = {
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
              let label = "Toggle visible";
              if (targets && targets.length) {
                const isAllVisible = _.every(targets, function (x) {
                  return x.visible;
                });
                const isAllHidden = _.every(targets, function (x) {
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

          const isAllVisible = _.every(targets, function(x) { return x.visible; });
          const isAllHidden = _.every(targets, function(x) { return !x.visible; });

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

        basicItems['expandTree'] = {
          "label": "Expand Tree",
          "action": function(item) {
            selected.forEach(node => {
              scope.tree.jstree('open_all', node);
            });
          }
        };

        if (scope.markNodes) {
          if (targets && targets.length) {
            basicItems['unmark'] = {
              "separator_before": true,
              "label": "Unmark",
              "action": function (item) {
                scope.__markObject3DNodes(targets, undefined, scope.markNodes.action);
              }
            };
            scope.markNodes.marks.forEach(mark => {
              basicItems['mark' + mark.name] = {
                "label": 'Mark ' + (mark.label || mark.name) + (mark.shortcut? ' (' + mark.shortcut + ')' : ''),
                "action": function (item) {
                  scope.__markObject3DNodes(targets, mark, scope.markNodes.action);
                },
                "shortcut": mark.shortcut? mark.shortcut.toUpperCase().charCodeAt(0)  : null,
                "shortcut_label": mark.shortcut? mark.shortcut : null,
              };
            });
            if (scope.markNodes.additionalMarkFields) {
              basicItems['markNote'] = {
                "label": "Add/edit mark note",
                "action": function(item) {
                  scope.__editMarkNote(targets, scope.markNodes.additionalMarkFields);
                }
              };
            }
          }
          basicItems['importMarks'] = {
            "label": "Import Marks",
            "action": function(item) {
              UIUtil.popupFileInput(file => {
                scope.__importMarkedObject3DNodesFromFile({ file: file });
              });
            }
          };
          basicItems['exportMarks'] = {
            "separator_after": true,
            "label": "Export Marks",
            "action": function(item) {
              scope.__exportMarkedObject3DNodes(scope.markNodes.fields);
            }
          };
        }

        if (scope.modelViewerUrl) {
          basicItems['openModelViewer'] = {
            "label" : "Show (m)odel",
            "shortcut": 77,
            "shortcut_label": 'm',
            "action" : function(item) {
              scope.__openModelViewer(node);
            },
            "_class" : "class"
          };
        }

        let items = basicItems;

        // Remove disallowed entries
        const target = scope.__getObject3D(node);
        const modelInstance = Object3DUtil.getModelInstance(target);
        if (!modelInstance) {
          delete items['openModelViewer'];
        } else {
          if (scope.supportAttachment) {
            items['identifyAttachment'] = {
              "separator_before": false,
              "separator_after": false,
              "label": "Identify attachment",
              "action": function (obj) {
                const attachment = scope.sceneState.identifyAttachment(modelInstance, null, { debug: true, checkOpposite: true });
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
          const nodeIsGroup = (target instanceof THREE.Group);

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
    scope.setTreeNodesVisibility();
  });
  this.tree.bind('refresh.jstree', function(event, data) {
    scope.__fixIconSizes();
    scope.setTreeNodesVisibility();
  });

  this.tree.bind('select_node.jstree',
    function (event, data) {
      if (!scope.quiet) {
        console.log('select_node', data);
      }
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
      const target = scope.__getObject3D(data.node);
      if (target) {
        target.name = data.text;
      }
    }
  );
  this.tree.bind('delete_node.jstree',
    function (event, data) {
      console.log('delete_node', data);
      const target = scope.__getObject3D(data.node);
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
      const oldParent = scope.tree.jstree('get_node', data.old_parent);
      const newParent = scope.tree.jstree('get_node', data.parent);
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
        const res = data.res;
        scope.tree.jstree('deselect_all');
        scope.tree.jstree('select_node', res);
        const selected = scope.tree.jstree('get_selected', true);
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
  const modelInstance = this.__getModelInstanceOrObject3D(node);
  if (modelInstance && modelInstance.model) {
    const fullId = modelInstance.model.getFullID();
    window.open(this.modelViewerUrl + '?modelId=' + fullId, 'Model Viewer');
  }
};

SceneHierarchyPanel.prototype.__groupSelected = function(node) {
  const selected = this.tree.jstree('get_selected');
  if (!selected.length) return;  // Nothing to group
  if (!node) {
    // No node, use first selected
    node = this.tree.jstree('get_node', selected[0]);
  }

  const parent = this.tree.jstree('get_node', node.parent);
  const newnode_data = this.__getFreeTreeNode(this.__treeNodes, 'Region', parent);

  const newpos = parent.children.indexOf(node.id) + 1;
  const newnode = this.tree.jstree('create_node', node.parent, newnode_data, newpos);
  // Put all selected nodes under new node
  this.tree.jstree('move_node', selected, newnode);
  this.tree.jstree('open_node', newnode);
};

SceneHierarchyPanel.prototype.__ungroup = function(node) {
  const parent = this.tree.jstree('get_node', node.parent);
  const pos = parent.children.indexOf(node.id) + 1;
  //console.log('ungroup', node.children);
  const children = node.children.slice(); // Make copy
  this.tree.jstree('move_node', children, node.parent, pos);
  const object3D = this.__getObject3D(node);
  if (object3D && object3D.userData.id != null) {
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
    const selected = this.getSelectedObjects();
    this.app.setSelectedObjects(selected, {suppressNotify: [this]});
  }
};

SceneHierarchyPanel.prototype.__showItems = function(nodes) {
  const targets = this.__getObjects(nodes);
  this.app.showOnly(targets);
};

SceneHierarchyPanel.prototype.__showObjectDetails = function (modelInstanceOrObject3D) {
  if (this.quiet) { return; }
  const object3D = (modelInstanceOrObject3D instanceof THREE.Object3D)? modelInstanceOrObject3D : modelInstanceOrObject3D.object3D;
  // TODO: callback to show more information about selected model?
  if (modelInstanceOrObject3D.model) {
    console.log('clicked ' + modelInstanceOrObject3D.model.getFullID(), modelInstanceOrObject3D.model.info);
  }
  if (object3D) {
    const idstr = (object3D.userData.id != null)? " id: " + object3D.userData.id : "";
    console.log('object user data ' + idstr, object3D.userData);
  }
  console.log(modelInstanceOrObject3D);
  const bb = Object3DUtil.getBoundingBox(object3D);
  console.log('BB: ' + bb.toString());
};

SceneHierarchyPanel.prototype.__showNodeDetails = function (node) {
  const target = this.__getModelInstanceOrObject3D(node);
  if (target) {
    this.__showObjectDetails(target);
  } else {
    const bb = this.__getBoundingBox(node);
    console.log('BB: ' + bb.toString());
  }
};

SceneHierarchyPanel.prototype.searchScene = function (entity) {
  if (!entity) {
    if (this.treeSearchTextElem) {
      entity = this.treeSearchTextElem.val();
    }
  }
  if (!entity || !this.tree) return;
  console.log('Search for ' + entity);
  this.tree.jstree('search', entity);
};

SceneHierarchyPanel.prototype.saveHierarchy = function () {
  // Create json summarizing the scene hierarchy
  const nodes = [];
  const treeNodes = this.getTreeNodes();
  const idIndexRemapping = {};
  for (let i = 0; i < treeNodes.length; i++) {
    const t = treeNodes[i];
    if (!t.__isFree) {
      // Make sure we are using a legit node
      const j = nodes.length;
      idIndexRemapping[t.id] = j;
      const obj3D = this.__getObject3D(t);
      const bbox = this.__getBoundingBox(t);
      const newNode = _.merge({
        index: j,
        name: t.text,
        parent: t.parent, // need remapping
        bbox: bbox.toJSON()
      }, _.pick(obj3D.userData, ['type', 'id']));
      const modelInstance = Object3DUtil.getModelInstance(obj3D);
      if (modelInstance) {
        newNode.category = modelInstance.model.info.category;
      }
      nodes.push(newNode);
    }
  }
  for (let j = 0; j < nodes.length; j++) {
    const node = nodes[j];
    if (node.parent === '#') {
      delete node.parent;
    } else {
      node.parent = idIndexRemapping[node.parent];
    }
  }

  const sh = {
    sceneId: this.sceneState.getFullID(),
    appId: this.app? this.app.appId : undefined,
    userId: this.app? this.app.userId : undefined,
    version: 'ssg@0.0.1',
    //name: this.sceneState.getSceneName(),
    nodes: nodes
  };
  const id = this.sceneState.info.id;
  FileUtil.saveJson(sh, id + '.hierarchy.json');
};

SceneHierarchyPanel.prototype.loadRelations = function(json) {
  let sceneId = (json.sceneId != undefined)? json.sceneId : json.id;
  if (sceneId != undefined) {
    const lastDot = sceneId.lastIndexOf('.');
    if (lastDot < 0 && this.sceneState.info) {
      sceneId = this.sceneState.info.source + '.' + sceneId;
    }
    //console.log('check sceneId', sceneId, this.sceneState.getFullID());
    if (sceneId !== this.sceneState.getFullID()) {
      this.showAlert('Scene ID mismatch');
      return;
    }
  }
  const supportAttachments = SceneUtil.relationsToSupportAttachments(this.sceneState, json.relations.support);
  this.sceneState.groupNodesByAttachment(supportAttachments, {groupBySupport: true, attachToParent: true});
  this.setSceneState(this.sceneState);
};

SceneHierarchyPanel.prototype.loadHierarchy = function(json) {
  const version = json.version;
  const format = (typeof version === 'string')? version.split('@')[0] : undefined;
  if (format !== 'ssg') {
    if (json.relations && json.relations.support) {
      this.loadRelations(json);
    } else {
      this.showAlert('Not a valid scene hierarchy file');
    }
    return;
  }
  if (json.sceneId !== this.sceneState.getFullID()) {
    this.showAlert('Scene ID mismatch');
    return;
  }
  const scope = this;
  const nodes = json.nodes;
  const objects = nodes.map(function(node) {
    if (node.id != undefined) {
      const object = scope.sceneState.findNode(function(x) {
        return x.userData.id == node.id && x.userData.type == node.type;
      });
      if (!object) {
        console.error('No object for node!!!', node);
      }
      return object;
    } else {
      const group = scope.__createGroup3D(node.type);
      group.name = node.name;
      return group;
    }
  });
  // Parent
  const rootObject3D = this.__getRootObject3D();
  const roots = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const obj = objects[i];
    if (node.parent != undefined && node.parent >= 0) {
      const parentObj = objects[node.parent];
      //console.log('node ' + i + ', parent ' + node.parent);
      Object3DUtil.attachToParent(obj, parentObj, rootObject3D);
    } else {
      roots.push(i);
      Object3DUtil.detachFromParent(obj, rootObject3D);
    }
  }
  // clear empty groups from the scene
  const emptyGroups = Object3DUtil.findNodes(rootObject3D, function(x) {
    return (x instanceof THREE.Group) && (x.children.length === 0) && (x.userData.sceneHierarchyGroup);
  });
  //console.log('emptyGroups', emptyGroups);
  for (let i = 0; i < emptyGroups.length; i++) {
    this.sceneState.removeExtraObject(emptyGroups[i]);
  }
  // Update our tree
  this.setSceneState(this.sceneState);
};

SceneHierarchyPanel.prototype.selectObject = function(object3D, deselectOthers, showContextMenu) {
  const nodeId = this.__getTreeNodeId(object3D);
  if (nodeId != null) {
    const treeNode = this.tree.jstree('get_node', nodeId);
    if (treeNode) {
      if (deselectOthers) {
        this.tree.jstree('deselect_all', true);  // suppress events
      }
      this.tree.jstree('select_node', nodeId, true);   // suppress events
      const element = document.getElementById( treeNode.id );
      if (element) {
        element.scrollIntoView();
        if (showContextMenu) {
          this.tree.jstree('show_contextmenu', nodeId);
        }
      } else {
        this.__addDeferred( this.selectObject.bind(this,object3D,deselectOthers, showContextMenu) );
      }
    } else {
      console.warn('Unable to select node ' + nodeId);
      this.__addDeferred( this.selectObject.bind(this,object3D,deselectOthers, showContextMenu) );
    }
  }
  this.__showObjectDetails(object3D);
};

SceneHierarchyPanel.prototype.hideContextMenu = function() {
  // Hacky
  $.vakata.context.hide();
};

SceneHierarchyPanel.prototype.contextMenuKeyPressed = function(e) {
  const a = $('.vakata-context').find('.vakata-contextmenu-shortcut-' + e.which).parent();
  if (a.parent().not('.vakata-context-disabled')) {
    a.trigger('click');
  }
};

SceneHierarchyPanel.prototype.setSelectedObjects = function(objects) {
  if (this.tree) {
    const nodeIds = this.__getTreeNodeIds(objects);
    this.tree.jstree('deselect_all', true); // suppress events
    this.tree.jstree('select_node', nodeIds, true); // suppress events
  }
};

SceneHierarchyPanel.prototype.updateObjectSelection = function(objects, selected) {
  const nodeIds = this.__getTreeNodeIds(objects);
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
    for (let i = 0; i < this.__deferred.length; i++) {
      this.__deferred[i]();
    }
    delete this.__deferred;
  }
};

SceneHierarchyPanel.prototype.setIsTreeNodeVisible = function(isVisibleFn) {
  this.__isTreeNodeVisibleCb = isVisibleFn;
};

SceneHierarchyPanel.prototype.setTreeNodesVisibility = function(isVisibleFn) {
  if (!isVisibleFn) {
    isVisibleFn = this.__isTreeNodeVisibleCb;
  }
  if (!isVisibleFn) return;
  console.log('set tree node visiblity');
  // Goes over tree nodes and uses isVisibleFn to determine whether the tree node should be visible or not
  for (let i = 0; i < this.__treeNodes.length; i++) {
    const treeNode = this.__treeNodes[i];
    if (!treeNode.__isFree) {
      const node = this.tree.jstree('get_node', treeNode.id);
      const isVisible = isVisibleFn(treeNode.data, this.__getModelInstanceOrObject3D(treeNode));
      treeNode.state = treeNode.state || {};
      treeNode.state.hidden = !isVisible;
      if (node) {
        node.state = node.state || {};
        node.state.hidden = !isVisible;
      }
    }
  }
};

SceneHierarchyPanel.prototype.showAlert = function(message, style) {
  console.log(message);
  UIUtil.showAlertWithPanel(this.container, message, style || 'alert-danger');
};

// Exports
module.exports = SceneHierarchyPanel;
