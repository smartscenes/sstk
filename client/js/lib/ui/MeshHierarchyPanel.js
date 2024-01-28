var Constants = require('Constants');
var AnnotatorInfo = require('annotate/AnnotatorInfo');
var AnnotatorUtil = require('annotate/AnnotatorUtil');
var Materials = require('materials/Materials');
var Object3DUtil = require('geo/Object3DUtil');
var GeometryUtil = require('geo/GeometryUtil');
var MeshHelpers = require('geo/MeshHelpers');
var Form = require('ui/Form');
var PubSub = require('PubSub');
var FileUtil = require('io/FileUtil');
var UIUtil = require('ui/UIUtil');
var Colors = require('util/Colors');
var Index = require('ds/Index');
var keymap = require('controls/keymap');
var _ = require('util/util');

/**
 * Create a panel to show the scene graph as a hierarchical tree for a model
 * @param params Parameters specifying how the scene graph should be display
 * @param params.treePanel Jquery selector of the element to place the tree panel
 * @param [params.controlsPanel] Jquery selector of the element to place the tree panel controls
 * @param [params.buttonsPanel] Jquery selector of the element to place buttons for submitting part annotations
 * @param [params.submitPartAnnotationsUrl] {string} Url to use for submitting part annotations
 * @param [params.retrievePartAnnotationsUrl] {string} Url to use for retrieving part annotations
 * @param params.app {{open: function, lookAt: function, appId: string}} Parent application
 * @param [params.allowLabeling] {boolean} Whether nodes can be relabeled
 * @param [params.allowEditHierarchy] {boolean} Whether the scene graph hierarchy can be modified
 * @param [params.allowSelectMaterials] {boolean} Whether the hierarchy and select materials can be changed
 * @param [params.filterEmptyGeometries] {boolean} Whether to filter out empty geometry nodes
 * @param [params.showMultiMaterial] {boolean} Whether to show a node in the tree for each material
 * @param [params.collapseNestedPaths] {boolean} Whether to collapse path with just one child
 * @param [params.highlightByHidingOthers] {boolean} Whether only the highlighted object should be shown
 * @param [params.defaultMaterialSetting] {string} What setting ('original', 'clear', 'neutral') to use for choosing material to apply as default (non-highlighted) portions of the object
 * @param [params.neutralMaterial] {THREE.Material} Neutral material to use for neutral material
 * @param [params.clearMaterial] {THREE.Material} Neutral material to use for clear material
 * @param [params.highlightMaterialSetting] {string} What setting ('highlight', 'original') to use for choosing highlight material
 * @param [params.highlightMaterial] {THREE.Material} Material to use to indicate highlighting
 * @param [params.useSemanticMaterials] {boolean} Whether we allow the use of coloring meshes based on semantic labels / object instances
 * @param [params.onhoverCallback] {function(node, flag)} Function to call when a node is hovered over or dehovered
 * @param [params.onPartsNodeChanged] {function(oldNode, newNode)} Function call when the partNodes is completely changed
 * @param [params.getMeshId] {function(node,root)} Functions that returns the id of mesh
 * @constructor
 * @memberOf ui
 */
function MeshHierarchyPanel(params) {
  PubSub.call(this);
  this.filterEmptyGeometries = params.filterEmptyGeometries;
  this.showMultiMaterial = params.showMultiMaterial;
  this.collapseNestedPaths = params.collapseNestedPaths;
  this.highlightByHidingOthers = params.highlightByHidingOthers;

  this.useSemanticMaterials = params.useSemanticMaterials;
  this.__objectIdIndex = new Index();
  var unknownObjectIdx = this.__objectIdIndex.indexOf('unknown', true);
  this.__objectTypeIndex = new Index();
  var unknownObjectTypeIdx = this.__objectTypeIndex.indexOf('unknown', true);
  this.__palette = Colors.getNewPalette('d3_unknown_category18');
  var scope = this;
  this.__materials = {
    'clear': params.clearMaterial || Object3DUtil.ClearMat,
    'neutral': params.neutralMaterial || Object3DUtil.NeutralMat,
    'highlight': params.highlightMaterial || Object3DUtil.getSimpleFalseColorMaterial(1),
    'original': function (node) {
      var material = node.cachedData ? node.cachedData.origMaterial : null;
      return material;
    },
    'objectId': function (node) {
      var anc = Object3DUtil.findFirstAncestor(node, (n) => n.labelInfo, true);
      var part = anc? anc.ancestor : node;
      var label = part.labelInfo? part.uuid : null;
      var index = (label != undefined) ? scope.__objectIdIndex.indexOf(label, true) : unknownObjectIdx;
      return Object3DUtil.getSimpleFalseColorMaterial(index, null, scope.__palette);
    },
    'objectType': function (node) {
      var anc = Object3DUtil.findFirstAncestor(node, (n) => n.labelInfo, true);
      var part = anc? anc.ancestor : node;
      var label = part.labelInfo? part.labelInfo.label : null;
      var index = (label != undefined) ? scope.__objectTypeIndex.indexOf(label, true) : unknownObjectTypeIdx;
      return Object3DUtil.getSimpleFalseColorMaterial(index, null, scope.__palette);
    }
  };
  this.__defaultMaterialSetting = params.defaultMaterialSetting || 'original';
  this.__highlightMaterialSetting = params.highlightMaterialSetting || 'highlight';

  this.allowLabeling = params.allowLabeling;
  this.allowEditHierarchy = params.allowEditHierarchy;
  this.allowSelectMaterials = params.allowSelectMaterials;
  this.treePanel = params.treePanel;
  this.__labelControlsPanel = params.controlsPanel;
  this.__labelButtonsPanel = params.buttonsPanel;
  this.submitPartAnnotationsUrl =  params.submitPartAnnotationsUrl;
  this.retrievePartAnnotationsUrl =  params.retrievePartAnnotationsUrl;
  this.app = params.app;
  this.__annotationType = 'mesh_group';
  this.__annotatorInfo = new AnnotatorInfo(this.app, {
    appId: this.app? this.app.appId : 'MeshHierarchyPanel',
    type: this.__annotationType
  });
  this.onhoverCallback = params.onhoverCallback;
  this.onPartsNodeChanged = params.onPartsNodeChanged;

  // The model instance that we are segmenting
  this.modelInstance = null;
  this.modelId = null;
  // The original object that we are segmenting
  this.origObject3D = null;
  // Starting node of the parts hierarchy for the model
  this.partsNode = null;
  // Current selected part
  this.currentSelectedPart = null;

  if (params.getMeshId) {
    this.getMeshId = params.getMeshId;
  }

  this.sgpathPrefix = 'SGPath-';
  this.__prefix = _.uniqueId('ph') + '-';
  this.useIcons = true;
  var iconBaseUrl = Constants.baseUrl + '/images/icons/';
  this.__iconUrls = {
    'None': iconBaseUrl + 'block.svg',
    'Material': iconBaseUrl + 'material.svg',
    'Object': iconBaseUrl + 'object.svg',
    'ObjectGroup': iconBaseUrl + 'objects.svg',
    'Part': iconBaseUrl + 'part.svg',
    'PartGroup': iconBaseUrl + 'parts.svg',
    'Stuff': iconBaseUrl + 'stuff.svg',
    'Line': iconBaseUrl + 'line.svg',
    'Mesh': iconBaseUrl + 'mesh.svg',
    'Points': iconBaseUrl + 'points.svg',
    'Camera': iconBaseUrl + 'camera.svg',
    'Light': iconBaseUrl + 'light.svg',
  };
  this.__propagateLabels = true;
  this.__labelTypes = ['None', 'Part', 'PartGroup', 'Object', 'ObjectGroup', 'Stuff'];
  this.__defaultLabelType = 'Object';
  this.__defaultGroupType = 'Object';
  this.__defaultGroupLabel = 'Group';
  this.__defaultIconUrl = this.useIcons? iconBaseUrl + 'block.svg' : false;
  this.__exportCondensed = true;
  this.__hasStoredMeshGroupAnnotation = false;
  this.__showOBBs = false;
  this.__debugOBBsNode = new THREE.Group();
  this.__debugOBBsNode.name = 'Debug OBBs';
  this.__debugOBBsNode.visible = this.__showOBBs;
  this.__hovered = null;  // Hovered part node
  this.__hideEmptyMeshes = true;
  this.__skipCheckTreeChange = false;
  this.__ignoreTreeEvents = false;
  this.__allowSegmentation = true;
  this.__disableInput = false;
  this.__controls = {}; // UI elements that we manipulate
  this.clear();
  if (this.allowEditHierarchy || this.allowLabeling) {
    this.bindAnnotationKeys();
  }
}

MeshHierarchyPanel.prototype = Object.create(PubSub.prototype);
MeshHierarchyPanel.prototype.constructor = MeshHierarchyPanel;

Object.defineProperty(MeshHierarchyPanel.prototype, 'isVisible', {
  get: function () {
    return this.partsNode && this.partsNode.visible;
  }
});

Object.defineProperty(MeshHierarchyPanel.prototype, 'maxHierarchyLevel', {
  get: function () {
    return this.partsNode? this.partsNode.userData.level : -1;
  }
});

Object.defineProperty(MeshHierarchyPanel.prototype, 'defaultMaterialSetting', {
  get: function () {
    return this.__defaultMaterialSetting;
  },
  set: function (v) {
    this.__defaultMaterialSetting = v;
    this.refreshHighlighting();
  }
});

Object.defineProperty(MeshHierarchyPanel.prototype, 'hideEmptyNodes', {
  get: function () {
    return this.__hideEmptyMeshes;
  },
  set: function (flag) {
    this.__hideEmptyMeshes = flag;
    if (this.treeNodes) {
      this.__setHideEmptyMeshes(flag, this.treeNodes, this.partNodes, true);
    }
  }
});

//Gets all the mesh nodes in the model
MeshHierarchyPanel.prototype.getNodes = function () {
  return this.partNodes.filter( x => x instanceof THREE.Object3D );
};

// MeshHierarchyPanel.prototype.getMeshes = function () {
//   return _.filter(this.partNodes, function(x) { return (x instance THREE.Mesh; }));
// };

// Gets the node Id
MeshHierarchyPanel.prototype.getMeshId = function (partNode, root) {
  return this.getSGPathId(partNode, root);
};

MeshHierarchyPanel.prototype.getSGPathId = function (partNode, root) {
  if (partNode instanceof THREE.Object3D) {
    return partNode.userData.sgpath;
  } else if (partNode) {
    return partNode['mesh'].userData.sgpath + '[' + partNode['materialIndex'] + ']';
  }
};

function getSGPath(partNode, root) {
  var sgpath;
  if (partNode instanceof THREE.Object3D) {
    sgpath = Object3DUtil.getSceneGraphPath(partNode, root);
  } else {
    sgpath = Object3DUtil.getSceneGraphPath(partNode['mesh'], root) + '[' + partNode['materialIndex'] + ']';
  }
  return sgpath;
}

MeshHierarchyPanel.prototype.__saveSGPathIds = function(root) {
  var scope = this;
  Object3DUtil.traverse(root, function(mesh) {
    var meshId = scope.sgpathPrefix + getSGPath(mesh, root);
    mesh.userData.sgpath = meshId;
    return true;
  });
  //console.log(root);
};

// MeshHierarchyPanel.prototype.findNodesByMeshId = function (meshIds) {
//   var nonSGIds = [];
//   var matchedNodes = [];
//   for (var i = 0; i < meshIds.length; i++) {
//     var meshId = meshIds[i];
//
//     if (meshId.toUpperCase().startsWith('SGPATH-')) {
//       var mesh = Object3DUtil.getNodeFromSceneGraphPath(this.partsNode, meshId.substr(7));
//       if (mesh) {
//         matchedNodes.push(mesh);
//       }
//     } else {
//       nonSGIds.push(meshId);
//     }
//   }
//   if (nonSGIds.length > 0) {
//     matchedNodes = this.findNodesSlow(nonSGIds, matchedNodes);
//   }
//   return matchedNodes;
// };

MeshHierarchyPanel.prototype.findNodesByMeshId = function (ids, matched) {
  // Does brute force find (slow!)
  var allNodes = this.getNodes();
  var matchedNodes = matched || [];
  for (var j = 0; j < ids.length; j++) {
    var id = ids[j];
    for (var i = 0; i < allNodes.length; i++) {
      var thisId = this.getMeshId(allNodes[i]);
      if (thisId === id) {
        matchedNodes.push(allNodes[i]);
      }
    }
  }
  return matchedNodes;
};

MeshHierarchyPanel.prototype.setPartsNode = function(partsNode) {
  this.partsNode = partsNode;
  this.__saveSGPathIds(partsNode);
  //Object3DUtil.applyMaterial(this.partsNode, Object3DUtil.ClearMat, true, true);
  if (this.treePanel && this.treePanel.length > 0) {
    this.__setPartHierarchy(this.partsNode);
  } else {
    this.__computePartNodes(this.partsNode);
  }
};

MeshHierarchyPanel.prototype.setTarget = function(target) {
  this.__clearOBBs();
  this.__hasStoredMeshGroupAnnotation = false;
  var stripLayersCount = 0;
  if (target instanceof THREE.Object3D) {
    this.origObject3D = target;
    this.modelInstance = null;
    this.modelId = null;
    this.__saveSGPathIds(this.origObject3D);
  } else {
    if (target.model.info.fullId) {
      this.modelId = target.model.info.fullId;
    } else if (target.model.info.modelId) {
      this.modelId = target.model.info.modelId;
    }

    // Assume is ModelInstance...
    this.origObject3D = target.object3D;
    this.modelInstance = target;
    // Strip out up to two layers (modelInstance and model wrapping)
    stripLayersCount = 2;
    this.__saveSGPathIds(this.origObject3D.children[0].children[0]);
  }
  this.__stripLayersCount = stripLayersCount;
  this.__computePartHierarchyFromObject3D(this.origObject3D, stripLayersCount);
  if (this.__controls.retrieveAnnotationsButton) {
    this.__controls.retrieveAnnotationsButton.click();
  }
  this.showSegmented = false;
};

MeshHierarchyPanel.prototype.restoreOriginalHierarchy = function() {
  if (this.origObject3D) {
    this.showSegmented = false;
    var oldPartsNode = this.partsNode;
    this.clear();
    this.__computePartHierarchyFromObject3D(this.origObject3D, this.__stripLayersCount);
    if (this.onPartsNodeChanged) {
      this.onPartsNodeChanged(oldPartsNode, this.partsNode);
    }
    this.showParts(oldPartsNode.visible);
    Object3DUtil.dispose(oldPartsNode);
  }
};

MeshHierarchyPanel.prototype.setSegmented = function(segmented) {
  this.showSegmented = true;
  this.__computePartHierarchyFromObject3D(segmented || this.origObject3D);
};

MeshHierarchyPanel.prototype.__computePartHierarchyFromObject3D = function(object3D, stripLayersCount) {
  console.log('setParts', object3D);
  this.partsNode = object3D.clone();
  this.partsNode.name = this.partsNode.name + '-parts';
  for (var i = 0; i < stripLayersCount; i++) {
    if (this.partsNode.children.length === 1) {
      var wm = this.partsNode.matrix;
      this.partsNode = this.partsNode.children[0];
      this.partsNode.applyMatrix4(wm);
    } else {
      break;
    }
  }

  // SGPath after layers are stripped
  this.__saveSGPathIds(this.partsNode);
  Object3DUtil.saveMaterials(this.partsNode);
  if (this.__defaultMaterialSetting !== 'original') {
    var mat = this.__lookupMaterialBySetting(this.__defaultMaterialSetting);
    Object3DUtil.applyMaterial(this.partsNode, mat, true, true);
  }
  if (this.treePanel && this.treePanel.length > 0) {
    this.__setPartHierarchy(this.partsNode);
  } else {
    this.__computePartNodes(this.partsNode);
  }
  this.partsNode.updateMatrixWorld();
  Object3DUtil.setVisible(this.partsNode, false);
};

MeshHierarchyPanel.prototype.__collapsePartHierarchy = function (uncollapsedTreeNodes) {
  // Index by id
  var nodesById = {};
  for (var i = 0; i < uncollapsedTreeNodes.length; i++) {
    var node = uncollapsedTreeNodes[i];
    nodesById[node.id] = {
      id: node.id,
      node: node,
      children: []
    };
  }
  // add child indices
  var roots = [];
  for (var i = 0; i < uncollapsedTreeNodes.length; i++) {
    var node = uncollapsedTreeNodes[i];
    var wrappedNode = nodesById[node.id];
    if (node.parent !== '#') {
      var parentWrappedNode = nodesById[node.parent];
      wrappedNode.parent = parentWrappedNode;
      parentWrappedNode.children.push(wrappedNode);
    } else {
      roots.push(wrappedNode);
    }
  }
  // Collapse chains
  function collapse(wnode) {
    if (wnode.children.length === 1) {
      var collapsed = collapse(wnode.children[0]);
      if (collapsed.node instanceof Array) {
        collapsed.node.splice(0, 0, wnode.node);
      } else {
        collapsed.node = [wnode.node, collapsed.node];
      }
      collapsed.parent = wnode.parent;
      return collapsed;
    } else {
      for (var j = 0; j < wnode.children.length; j++) {
        wnode.children[j] = collapse(wnode.children[j]);
      }
      return wnode;
    }
  }

  var iconUrl = this.__defaultIconUrl;
  function addCollapsedNodes(treenodes, wnode) {
    if (wnode.node instanceof Array) {
      var index = treenodes.length;
      var label = wnode.node.map(function (x) { return x.text; }).join('/');
      treenodes[index] = {
        id: wnode.id,
        parent: wnode.node[0].parent,
        //            text: wnode.node[0].text,
        text: label,
        icon: iconUrl,
        metadata: wnode.node[0].metadata,
        li_attr: wnode.node[0].li_attr
      };
    } else {
      treenodes.push(wnode.node);
    }
    for (var j = 0; j < wnode.children.length; j++) {
      addCollapsedNodes(treenodes, wnode.children[j]);
    }
  }

  var collapsedTreeNodes = [];
  for (var i = 0; i < roots.length; i++) {
    var collapsed = collapse(roots[i]);
    addCollapsedNodes(collapsedTreeNodes, collapsed);
  }
  return collapsedTreeNodes;
};

MeshHierarchyPanel.prototype.__updateNodeStatistics = function(node) {
  // Updates node statistics (assume that children have already been traversed and child statistics computed)
  var showMultiMaterial = this.showMultiMaterial;
  node.userData.nmeshes = 0;
  node.userData.nfaces = 0;
  node.userData.nleafs = 0;
  if (node instanceof THREE.Mesh) {
    var nmats = Materials.getNumMaterials(node.material);
    node.userData.geomType = 'Mesh';
    node.userData.nmeshes = 1;
    node.userData.nfaces = GeometryUtil.getGeometryFaceCount(node.geometry);
    node.userData.nmats = nmats;
    node.userData.nleafs = (showMultiMaterial)? nmats : 1;
  } else if (node instanceof THREE.Points) {
    node.userData.geomType = 'Points';
    node.userData.npointclouds = 1;
    node.userData.nleafs = 1;
  } else if (node instanceof THREE.Line) {
    node.userData.geomType = 'Line';
    node.userData.nlines = 1;
    node.userData.nleafs = 1;
  } else if (node instanceof THREE.Camera) {
    node.userData.geomType = 'Camera';
  } else if (node instanceof THREE.Light) {
    node.userData.geomType = 'Light';
  } else {
    delete node.userData.geomType;
  }

  var nfaces = node.userData.nfaces || 0;
  var nmeshes = node.userData.nmeshes || 0;
  var nlines = node.userData.nlines || 0;
  var npointclouds = node.userData.npointclouds || 0;
  var nleafs = node.userData.nleafs || 0;

  if (node.children && node.children.length > 0) {
    for (var i = 0; i < node.children.length; i++) {
      nfaces += (node.children[i].userData.nfaces || 0);
      nmeshes += (node.children[i].userData.nmeshes || 0);
      nleafs += (node.children[i].userData.nleafs || 0);
      nlines += (node.children[i].userData.nlines || 0);
      npointclouds += (node.children[i].userData.npointclouds || 0);
    }
  }
  if (nfaces > 0) node.userData.nfaces = nfaces;
  if (nmeshes > 0) node.userData.nmeshes = nmeshes;
  if (nleafs > 0) node.userData.nleafs = nleafs;
  if (nlines > 0) node.userData.nlines = nlines;
  if (npointclouds > 0) node.userData.npointclouds = nlines;
};

MeshHierarchyPanel.prototype.__computeNodeStatistics = function(root) {
  // Compute number of faces at each node
  var scope = this;
  Object3DUtil.traverse(root, function (node) {
    return true;
  }, function (node) {
    scope.__updateNodeStatistics(node);
  });
};

MeshHierarchyPanel.prototype.__populateTreePanel = function(treeNodes) {
  var scope = this;
  this.treePanel.empty();
  this.tree = $('<div class="tree"></div>');
  this.treePanel.append(this.tree);
  this.treeNodes = treeNodes;

  var searchOptions = { 'case_insensitive': true };
  var plugins = ['search', 'contextmenu' /*, 'changed'*/];
  // if (this.useSort) {
  //   plugins.push('sort');
  // }
  if (this.allowEditHierarchy) {
    plugins.push('dnd');
  }
  this.tree.jstree({
    'core': {
      'check_callback' : this.__checkTreeChange.bind(this),
      'data': treeNodes,
      'themes': { 'name': 'default', 'responsive': true, 'stripes': true, 'icons': this.useIcons }
    },
    'search': searchOptions,
    'plugins': plugins,
    'contextmenu':{
      "items": function(node) {
        console.log(node);
        //var partNode = scope.partNodes[node.original.metadata['index']];
        //var clickedFrom = [partNode];
        var targets = scope.getSelectedPartNodes();
        var items = {};

        if (targets && targets.length) {
          // Items for when there are something selected
          items['lookAtItem'] = {
            "label": "Look at",
            "action": function (item) {
              // TODO: Handle look at item for multiple selected
              if (targets && targets.length) {
                scope.app.lookAt(scope.partsNode, targets);
              }
            },
            "_class": "class"
          };

          function addSetVisibleOption(items, name, label, flag, recursive) {
            items[name] = {
              "label": label,
              "action": function (item) {
                _.each(targets, function (x) {
                  scope.__setVisible(x, flag, recursive);
                });
              },
              "_class": "class"
            };
          }

          function addSetShowOnlyOption(items, name, label, recursive) {
            items[name] = {
              "label": label,
              "action": function (item) {
                scope.showPartsOnly(targets, true, recursive);
              },
              "_class": "class"
            };
          }

          var isAllVisible = _.every(targets, function (x) {
            return x.visible;
          });
          var isAllHidden = _.every(targets, function (x) {
            return !x.visible;
          });

          items["expandTree"] = {
            "label": "Expand Tree",
            "action": function (item) {
              scope.tree.jstree('open_all', node);
            },
            "_class": "class"
          };
          addSetShowOnlyOption(items, "setTreeOnlyVisibleTrue", "Show tree (hide rest)", true);
          if (isAllVisible) {
            addSetVisibleOption(items, "setTreeVisibleFalse", "Hide tree", false, true);
            addSetVisibleOption(items, "setNodeVisibleFalse", "Hide node", false, false);
          } else if (isAllHidden) {
            addSetVisibleOption(items, "setTreeVisibleTrue", "Show tree", true, true);
            addSetVisibleOption(items, "setNodeVisibleTrue", "Show node", true, false);
          } else {
            addSetVisibleOption(items, "setTreeVisibleFalse", "Hide tree", false, true);
            addSetVisibleOption(items, "setTreeVisibleTrue", "Show tree", true, true);
            addSetVisibleOption(items, "setNodeVisibleFalse", "Hide node", false, false);
            addSetVisibleOption(items, "setNodeVisibleTrue", "Show node", true, false);
          }

          items["setAllVisibleTrue"] = {
            "label": "Show all",
            "action": function (item) {
              scope.__setVisible(scope.partsNode, true, true);
            },
            "_class": "class"
          };

          if (scope.app && scope.app.open) {
            items['openItem'] = {
              "label": "Open",
              "action": function (item) {
                scope.app.open(scope.partsNode, targets);
              }
            };
          }

          if (targets[0].parent) {
            items['printSelectedIds'] = {
              "label": "Log selected ids",
              "action": function (item) {
                var paths = _.map(targets, c => scope.getMeshId(c));
                console.log('paths', paths.join(';'));
              },
              "_class": "class"
            };
          }

          if (targets.length === 1 && _.get(targets[0], 'userData.geomType') === 'Camera') {
            items['switchView'] = {
              "label": "Use Camera",
              "title": "Switch view to the camera view",
              "action": function (item) {
                scope.useCameraView(targets[0]);
              },
              "_class": "class"
            };
          }

          if (targets.length === 1 && targets[0].parent) {
            items['selectConnected'] = {
              "label": "Select connected",
              "title": "Identifies siblings that are connected to the selected node.  WARNING: This can take a long time.",
              "action": function (item) {
                scope.selectConnected(targets[0]);
              },
              "_class": "class"
            };
          }
        }

        items['unselectAll'] = {
          "label": "Unselect all",
          "action": function(item) {
            scope.tree.jstree('deselect_all', false);
            scope.clearHighlighting();
          }
        };

        var lowerNodes = targets? targets.filter(x => x.userData && x.userData.partNodesIndex !== 0) : [];
        if (lowerNodes.length && lowerNodes.length === targets.length) {
          if (scope.allowLabeling && lowerNodes.length) {
            items['label'] = {
              "separator_before": true,
              "separator_after": false,
              "label": "(L)abel",
              "action": function (item) {
                scope.__labelNodes(lowerNodes);
              },
              // Handled by key bindings
              //"shortcut": 76,
              //"shortcut_label": 'l',
              "_class": "class"
            };

            var isAllIgnored = _.every(targets, function (x) {
              return x.ignore;
            });
            var isAllUnignored = _.every(targets, function (x) {
              return !x.ignore;
            });

            function addMarkIgnoreOption(items, flag) {
              var name = flag ? 'ignore' : 'unignore';
              items[name] = {
                "label": flag ? '(I)gnore' : 'Unignore',
                "shortcut": flag ? 73 : undefined,
                "shortcut_label": flag ? 'i' : undefined,
                "action": function (item) {
                  scope.__markIgnore(lowerNodes, flag);
                },
                "_class": "class"
              };
            }

            if (isAllIgnored) {
              addMarkIgnoreOption(items, false);
            } else if (isAllUnignored) {
              addMarkIgnoreOption(items, true);
            } else {
              addMarkIgnoreOption(items, true);
              addMarkIgnoreOption(items, false);
            }
          }
          if (scope.allowEditHierarchy) {
            // Add edit entries
            items['rename'] = {
              "separator_before": false,
              "separator_after": false,
              "label": "(R)ename",
              "shortcut": 82,
              "shortcut_label": 'r',
              "action": function (obj) {
                scope.tree.jstree('edit', node);
              }
            };
            if (targets.length === 1 && targets[0].children.length === 0) {
              if (targets[0].userData.isCreatedGroup) {
                items['remove'] = {
                  "separator_before": false,
                  "separator_after": false,
                  "label": "Remove",
                  "action": function (obj) {
                    scope.tree.jstree('delete_node', node);
                  }
                };
              }
            }
            items['group'] = {
              "separator_before": false,
              "separator_after": false,
              "label": "(G)roup",
              // Handled by key bindings
              //"shortcut": 71,
              //"shortcut_label": 'g',
              "action": function (obj) {
                scope.__groupSelected(node);
              }
            };
            items['ungroup'] = {
              "separator_before": false,
              "separator_after": true,
              "label": "(U)ngroup",
              "shortcut": 85,
              "shortcut_label": 'u',
              "action": function (obj) {
                scope.__ungroup(node);
              }
            };
            if (targets.length === 1 && targets[0].children.length === 0) {
              if (scope.__allowSegmentation && targets[0] instanceof THREE.Mesh && !targets[0].userData.splitInfo) {
                var mesh = targets[0];
                items['segment'] = {
                  // "separator_before": false,
                  // "separator_after": true,
                  "label": "Segment",
                  "action": function (obj) {
                    scope.__segment(mesh);
                  }
                };

              }
            }
          }
        }

        return items;
      }
    }
  });

  this.tree.bind('open_node.jstree', function(event, data) {
    scope.__fixIconSizes();
  });
  this.tree.bind('ready.jstree', function(event, data) {
    scope.__fixIconSizes();
    scope.__autoExpandTree();
  });

  this.tree.bind('select_node.jstree',
    function (event, data) {
      //TODO: do something with meshnode
      var node = data.node.original;
      var partNode = this.partNodes[node.metadata['index']];
      if (partNode) {
        var meshId = this.getMeshId(partNode, this.partsNode);
        console.log(meshId, partNode);
        this.currentSelectedPart = partNode;
      }
      this.refreshHighlighting();
      this.Publish('SelectNode', partNode);
      Object3DUtil.setVisible(this.origObject3D, false);
    }.bind(this)
  );
  this.tree.bind('changed.jstree',
    function (event, data) {
      scope.refreshHighlighting();
    }.bind(this)
  );

  if (this.allowEditHierarchy) {
    this.__bindTreeEditEvents();
  }

  if (typeof this.onhoverCallback === 'string') {
    if (this.onhoverCallback === 'highlight') {
      this.onhoverCallback = (partnode, flag) => this.__updateHoverHighlighting(partnode, flag);
    } else {
      console.warn('Unsupported onhoverCallback: ' + this.onhoverCallback);
      this.onhoverCallback = null;
    }
  }

  if (this.onhoverCallback) {
    this.tree.bind('hover_node.jstree',
      function (event, data) {
        var meshNode = this.__getPartNode(data.node);
        // TODO: do something with meshNode
        this.onhoverCallback(meshNode, true);
      }.bind(this)
    );
    this.tree.bind('dehover_node.jstree',
      function (event, data) {
        var meshNode = this.__getPartNode(data.node);
        this.onhoverCallback(meshNode, false);
      }.bind(this)
    );
    // this.tree.bind('mouseout.jstree',
    //   function (event, data) {
    //     this.onhoverCallback(null);
    //   }.bind(this)
    // );
  }
};

MeshHierarchyPanel.prototype.__getIconUrl = function(node, labelInfo) {
  var iconUrl = null;
  if (labelInfo) {
    iconUrl = this.__iconUrls[labelInfo.type];
  }
  if (!iconUrl) {
    iconUrl = node.userData.geomType ? this.__iconUrls[node.userData.geomType] : null;
  }
  return iconUrl || this.__defaultIconUrl;
};

MeshHierarchyPanel.prototype.__getDefaultNodeLabel = function(node) {
  return (node.name || (node.userData && node.userData.id != null? node.userData.id : node.id));
};

MeshHierarchyPanel.prototype.__updateTreeNodesFromObject3D = function(treeNodes, root, object3D, partNodes, uuidToIndex) {
  var rootIndices = [];

  var filterEmptyGeometries = this.filterEmptyGeometries;
  var showMultiMaterial = this.showMultiMaterial;
  var collapseNestedPaths = this.collapseNestedPaths;
  var prefix = this.__prefix;

  var scope = this;
  Object3DUtil.traverse(object3D, function (node) {
    var nfaces = node.userData.nfaces;
    var nlines = node.userData.nlines;

    if (filterEmptyGeometries) {
      if (!nfaces && !nlines) return false;
    }

    var index = (uuidToIndex)? uuidToIndex[node.uuid] : null;
    if (index == null) {
      index = partNodes.length;
    }
    var parentId = (node !== root && node.parent) ? prefix + node.parent.uuid : '#';
    treeNodes[index] = {
      id: prefix + node.uuid,
      parent: parentId,
      text: node.labelInfo? node.labelInfo.label : scope.__getDefaultNodeLabel(node),
      icon: scope.__getIconUrl(node, node.labelInfo),
      metadata: { index: index }  // index into both partNodes and treeNodes
    };
    treeNodes[index]['a_attr'] = { 'class': __getNodeAttrClass(node) };
    if (!partNodes[index]) {
      partNodes[index] = node;
    }
    node.userData.partNodesIndex = index;

    if (parentId === '#') {
      rootIndices.push(index);
    }
    var titleJson = scope.__createSummaryInfo(node);
    if (node instanceof THREE.Mesh) {
      //var nfaces = GeometryUtil.getGeometryFaceCount(node.geometry);
      var nmats = node.userData.nmats;
      treeNodes[index]['li_attr'] = {};
      treeNodes[index]['li_attr']['title'] = JSON.stringify(titleJson, null, 2);
      if (showMultiMaterial && nmats > 1) {
        var origMat = node.cachedData? node.cachedData.origMaterial : null;
        var origMaterials = Materials.toMaterialArray(origMat);
        for (var i = 0; i < nmats; i++) {
          var mi = uuidToIndex? uuidToIndex[node.uuid + '-' + i] : null;
          if (mi == null) {
            mi = partNodes.length;
          }
          var pId = prefix + node.uuid;
          treeNodes[mi] = {
            id: prefix + node.uuid + '-' + i,
            parent: pId,
            text: origMaterials.length? origMaterials[i].name : 'material' + i,
            icon: scope.__iconUrls['Material'],
            metadata: { index: mi }   // index into both partNodes and treeNodes
          };
          if (!partNodes[mi]) {
            partNodes[mi] = {type: 'MeshMaterial', mesh: node, materialIndex: i};
          }
        }
      }
    } else if (node instanceof THREE.Object3D) {
      //var nchildren = node.children.length;
      treeNodes[index]['li_attr'] = {};
      treeNodes[index]['li_attr']['title'] = JSON.stringify(titleJson, null, 2);
    }
    return true;
  });

  if (collapseNestedPaths) {
    treeNodes = this.__collapsePartHierarchy(treeNodes, rootIndices);
  }
  if (this.__hideEmptyMeshes) {
    this.__setHideEmptyMeshes(true, treeNodes, partNodes);
  }
  return treeNodes;
};

MeshHierarchyPanel.prototype.__getTreeNodesFromRootObject3D = function(root, partNodes, uuidToIndex) {
  var treeNodes = [];
  this.__updateTreeNodesFromObject3D(treeNodes, root, root, partNodes, uuidToIndex);
  return treeNodes;
};

MeshHierarchyPanel.prototype.__setHideEmptyMeshes = function (flag, treeNodes, partNodes, updateJsTree) {
  for (var i = treeNodes.length-1; i >=0; i--) {
    if (!partNodes[i]) { continue; }
    var tnode = treeNodes[i];
    var u = partNodes[i].userData;
    if (u && !(u.nmeshes > 0 || u.nlines > 0 || u.npointclouds > 0)) {
      tnode.state = tnode.state || {};
      tnode.state.hidden = flag;
      if (updateJsTree) {
        var jstn = this.tree.jstree('get_node', tnode);
        if (jstn.state.hidden !== flag) {
          jstn.state.hidden = flag;
          this.tree.jstree('redraw_node', jstn, true);
          this.__fixIconSizes(jstn);
        }
      }
    }
  }
};

MeshHierarchyPanel.prototype.__setPartHierarchy = function (root) {
  // Convert node to jstree data
  var partNodes = [];

  this.__computeNodeStatistics(root);
  var treeNodes = this.__getTreeNodesFromRootObject3D(root, partNodes);

  //console.log(treeNodes);
  this.__populateTreePanel(treeNodes);
  this.partNodes = partNodes;

  this.__initControlsPanel();
  if (this.allowLabeling || this.allowEditHierarchy) {
    this.__initButtonsPanel();
  }
};

MeshHierarchyPanel.prototype.bindAnnotationKeys = function() {
  var scope = this;
  var keyscope = 'parts.meshHierarchy';
  var targets = null; //[ scope.app.renderer.domElement ];
  keymap({ in: keyscope, on: 'l', do: 'Label node', target: targets }, function () {
    if (scope.__disableInput) { return; }
    scope.__labelSelected();
  });
  keymap({ in: keyscope, on: 'c', do: 'Toggle coloring', target: targets }, function () {
    if (scope.__disableInput) { return; }
    if (scope.__controls.meshHierarchyMaterialSelect) {
      scope.__controls.meshHierarchyMaterialSelect.selectNext();
    }
  });
  keymap({ in: keyscope, on: 'g', do: 'Group selected', target: targets }, function () {
    if (scope.__disableInput) { return; }
    scope.__groupSelected();
  });
  keymap({ in: keyscope, on: 'b', do: 'Toggle bounding box', target: targets }, function () {
    if (scope.__disableInput) { return; }
    if (scope.__controls.showOBBsCheckbox) {
      scope.__controls.showOBBsCheckbox.click();
    }
  });
  keymap({ in: keyscope, on: 'e', do: 'Select objects in OBB', target: targets }, function () {
    if (scope.__disableInput) { return; }
    scope.__selectObjectNodesInSelectedObb();
  });
  keymap({ in: keyscope, on: 'p', do: 'Propagate labels', target: targets }, function () {
    if (scope.__disableInput) { return; }
    scope.__propagateSelectedLabels();
  });
};

MeshHierarchyPanel.prototype.__initHierarchyMaterialControls = function() {
  var scope = this;
  var semanticMaterials = ['objectId', 'objectType'];
  var hierarchyMaterials = ['clear', 'neutral', 'original'];
  if (this.useSemanticMaterials) {
    hierarchyMaterials.push(...semanticMaterials);
  }
  var meshHierarchyMaterialSelect = UIUtil.createSelect(hierarchyMaterials, this.__defaultMaterialSetting);
  this.__labelControlsPanel.append($('<label></label>').text('Hierarchy Material'))
    .append(meshHierarchyMaterialSelect).append('<br/>');
  this.__controls.meshHierarchyMaterialSelect = meshHierarchyMaterialSelect;

  meshHierarchyMaterialSelect.change(function () {
    var selected = $(this).val();
    scope.defaultMaterialSetting = selected;
  });

  var selectedMaterials = ['highlight', 'original'];
  if (this.useSemanticMaterials) {
    selectedMaterials.push(...semanticMaterials);
  }
  var selectedMaterialSelect = UIUtil.createSelect(selectedMaterials, this.__highlightMaterialSetting);
  this.__labelControlsPanel.append($('<label></label>').text('Selected Material'))
    .append(selectedMaterialSelect).append('<br/>');
  this.__controls.selectedMaterialSelect = selectedMaterialSelect;
  selectedMaterialSelect.change(function () {
    var selected = $(this).val();
    scope.__highlightMaterialSetting = selected;
    scope.refreshHighlighting();
  });
};

MeshHierarchyPanel.prototype.__initControlsPanel = function() {
  if (this.__labelControlsPanel) {
    this.__labelControlsPanel.empty();

    if (this.allowSelectMaterials) {
      this.__initHierarchyMaterialControls();
    }

    var showOBBsCheckbox = UIUtil.createCheckbox({
      id: 'showMeshHierarchyOBBs',
      text: 'Show OBBs',
      change: (flag) => this.showOBBs = flag
    }, this.__showOBBs);
    this.__labelControlsPanel.append(showOBBsCheckbox.checkbox).append(showOBBsCheckbox.label).append('<br/>');
    this.__controls.showOBBsCheckbox = showOBBsCheckbox.checkbox;

    var showEmptyNodesCheckbox = UIUtil.createCheckbox({
      id: 'showEmptyNodes',
      text: 'Show Empty',
      change: (flag) => this.hideEmptyNodes = !flag
    }, !this.hideEmptyNodes);
    this.__labelControlsPanel.append(showEmptyNodesCheckbox.checkbox).append(showEmptyNodesCheckbox.label).append('<br/>');
    this.__controls.showEmptyNodesCheckbox = showEmptyNodesCheckbox.checkbox;

    if (this.allowLabeling) {
      var defaultLabelSelect = UIUtil.createSelect(this.__labelTypes, this.__defaultLabelType);
      defaultLabelSelect.change(() => {
        this.__defaultLabelType = defaultLabelSelect.val();
      });
      this.__labelControlsPanel.append($('<label></label>').text('Label')).append(defaultLabelSelect).append('<br/>');

      var defaultGroupSelect = UIUtil.createSelect(this.__labelTypes, this.__defaultGroupType);
      defaultGroupSelect.change(() => {
        this.__defaultGroupType = defaultGroupSelect.val();
      });
      this.__labelControlsPanel.append($('<label></label>').text('Group')).append(defaultGroupSelect).append('<br/>');

      // var collapseButton = $('<button class="btn btn-default btn-xs">Collapse</button>');
      // this.controlsPanel.append(collapseButton);
      // collapseButton.click(() => {
      //   this.treeNodes = this.__collapsePartHierarchy(this.treeNodes);
      //   this.tree.jstree
      // });
    }
  }
};

MeshHierarchyPanel.prototype.__initButtonsPanel = function() {
  this.__labelButtonsPanel.empty();
  var restoreOriginalButton = $('<button></button>').text('Restore Original');
  restoreOriginalButton.click(() => {
    this.restoreOriginalHierarchy();
  });
  this.__labelButtonsPanel.append(restoreOriginalButton);

  if (this.submitPartAnnotationsUrl) {
    var submitAnnotationsButton = $('<button></button>').text('Submit Labels');
    submitAnnotationsButton.click(() => {
      this.app.authenticate(() => this.submitPartAnnotations());
    });
    this.__labelButtonsPanel.append(submitAnnotationsButton);
  }

  if (this.retrievePartAnnotationsUrl) {
    var retrieveAnnotationsButton = $('<button></button>').text('Load Labels');
    retrieveAnnotationsButton.click(() => {
      this.retrievePartAnnotations();
    });
    this.__labelButtonsPanel.append(retrieveAnnotationsButton);
    this.__controls.retrieveAnnotationsButton = retrieveAnnotationsButton;
  }

  var exportAnnotationsButton = $('<button></button>').text('Export Labels');
  exportAnnotationsButton.click(() => {
    this.app.authenticate(() => this.savePartAnnotations());
  });
  var importFileInput = UIUtil.createFileInput({
    id: 'meshHierarchyImport',
    label: 'Import Labels',
    style: 'basic',
    hideFilename: true,
    inline: true,
    loadFn: (file) => this.loadPartAnnotations({ file: file, type: 'file' })
  });
  this.__labelButtonsPanel.append(exportAnnotationsButton);
  this.__labelButtonsPanel.append(importFileInput.group);
};

MeshHierarchyPanel.prototype.__getLabelButtons = function() {
  return this.__labelButtonsPanel.find(':button');
};

MeshHierarchyPanel.prototype.__setLabelButtonsEnabledState = function(flag) {
  var buttons = this.__getLabelButtons();
  if (flag) {
    buttons.removeAttr('disabled');
  } else {
    buttons.find('button').attr('disabled', 'disabled');
  }
  if (!this.__hasStoredMeshGroupAnnotation) {
    this.__controls.retrieveAnnotationsButton.attr('disabled', 'disabled');
  }
};

// Utility functions for getting the part nodes
MeshHierarchyPanel.prototype.getSelectedPartNodes = function() {
  var selected = this.tree.jstree('get_selected', true);
  return this.__getPartNodes(selected);
};

MeshHierarchyPanel.prototype.__getPartNode = function(node) {
  if (node.original) {
    //console.log('node.original', node.original);
    return this.partNodes[node.original.metadata['index']];
  }
};

MeshHierarchyPanel.prototype.__getPartNodes = function(nodes, objects) {
  objects = objects || [];
  if (!Array.isArray(nodes)) {
    nodes = [nodes];
  }
  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    if (node.original) {
      var partNode = this.partNodes[node.original.metadata['index']];
      if (partNode) {
        objects.push(partNode);
      }
    }
  }
  return objects;
};

MeshHierarchyPanel.prototype.__computePartNodes = function (root) {
  var partNodes = [];
  var filterEmptyGeometries = this.filterEmptyGeometries;
  var showMultiMaterial = this.showMultiMaterial;

  Object3DUtil.traverse(root, function (node) {
    var nfaces = node.userData.nfaces;
    var nlines = node.userData.nlines;
    if (filterEmptyGeometries) {
      if (!nfaces && !nlines) return false;
    }
    partNodes.push(node);

    if (node instanceof THREE.Mesh) {
      var nmats = Materials.getNumMaterials(node.material);
      if (showMultiMaterial && nmats > 1) {
        for (var i = 0; i < nmats; i++) {
          partNodes.push({ type: 'MeshMaterial', mesh: node, materialIndex: i });
        }
      }
    }
    return true;
  }, function(node) {
    var maxChildLevel = -1;
    if (node.children) {
      for (var i = 0; i < node.children.length; i++) {
        var c = node.children[i];
        maxChildLevel = Math.max(maxChildLevel, c.userData.level);
      }
    }
    node.userData.level = maxChildLevel + 1;
  });
  this.partNodes = partNodes;
};

MeshHierarchyPanel.prototype.clearHighlighting = function() {
  this.__clearOBBs();
  this.dehighlightPart(this.partsNode);
};

MeshHierarchyPanel.prototype.refreshHighlighting = function() {
  this.clearHighlighting();
  var selected = this.getSelectedPartNodes();
  if (selected && selected.length) {
    for (var i = 0; i < selected.length; i++) {
      this.highlightPart(selected[i]);
      if (selected[i] instanceof THREE.Object3D && selected[i].userData.nmeshes > 0) {
        var obb = Object3DUtil.getOrientedBoundingBox(selected[i],
          { constrainVertical: false, checkAABB: true, debug: false }, false);
        this.__addOBB(obb, this.__materials['highlight']);
      }
    }
  }
};

MeshHierarchyPanel.prototype.clear = function () {
  this.__clearOBBs();
  if (this.partsNode && this.partsNode.parent) {
    this.partsNode.parent.remove(this.partsNode);
  }
  this.partsNode = null;
  this.partNodes = null;
  this.treeNodes = null;
  this.__freeIndices = [];
  if (this.treePanel) {
    this.treePanel.empty();
  }
};

MeshHierarchyPanel.prototype.identifyConnectedComponents = function (nodes) {
  var ObjectSegmentator = require('geo/ObjectSegmentator');
  var segmentator = new ObjectSegmentator();
  return segmentator.identifyConnectedComponents(nodes, { minDist: 0.000000001, maxDist: 0.01 });
};

MeshHierarchyPanel.prototype.identifyConnected = function (targetNode) {
  var nodes = targetNode.parent.children;
  nodes = nodes.filter(node => {
    Object3DUtil.computeNodeStatistics(node);
    return Object3DUtil.isVisible(node) && (node.userData.nfaces > 0);
  });
  targetNode.parent.cached = targetNode.parent.cached || {};
  var cache = targetNode.parent.cached;
  cache.connected = cache.connected || {};
  var nodeids = _.map(nodes, node => node.id);
  var hash = nodeids.join(":");
  cache.connected[hash] = cache.connected[hash] || this.identifyConnectedComponents(nodes).components;
  var connectedComponents = cache.connected[hash];
  //console.log(nodes, connectedComponents);
  var component = _.find(connectedComponents, c => {
    return _.find(c, i => nodes[i] === targetNode) != null;
  });
  if (component) {
    return _.map(component, function(i) { return nodes[i]; });
  } else {
    return [targetNode];
  }
};

MeshHierarchyPanel.prototype.__findObjectNodesInObb = function(obb, root) {
  var inOBBNodes = [];
  Object3DUtil.traverse(root, (node) => {
    if (node instanceof THREE.Mesh) {
      var inOBB = GeometryUtil.isMeshInOBB(node, obb);
      if (inOBB) {
        node.userData.__inOBB = true;
      }
    }
    return true;
  }, (node) => {
    var inOBBs = [];
    var notInOBBs = 0;
    for (var i = 0; i < node.children.length; i++) {
      var child = node.children[i];
      if (child.userData.__inOBB) {
        inOBBs.push(child);
      } else if (child.userData.nmeshes > 0) {
        notInOBBs++;
      }
      delete child.userData.__inOBB;
    }
    if (notInOBBs > 0) {
      inOBBNodes.push.apply(inOBBNodes, inOBBs);
    } else if (inOBBs.length > 0) {
      node.userData.__inOBB = true;
    }
  });
  if (root.userData.__inOBB) {
    inOBBNodes.push(root);
  }
  delete root.userData.__inOBB;
  return inOBBNodes;
};

MeshHierarchyPanel.prototype.__selectObjectNodesInSelectedObb = function() {
  var targets = this.getSelectedPartNodes();
  var obb = Object3DUtil.getOrientedBoundingBox(targets);
  obb = obb.clone().scaleBy(1.01);
  var nodes = this.__findObjectNodesInObb(obb, this.partsNode);
  //console.log('in obb', obb, nodes);
  this.selectObjectNodes(nodes);
};

MeshHierarchyPanel.prototype.__segment = function(mesh, options) {
  var node = Object3DUtil.splitAndReplaceMesh(mesh,
    { splitByMaterial: true, splitByConnectivity: true, splitByClustering: false,
      adjFaceNormSimThreshold: 0.9,
      keepDoubleFacesTogether: true, includeFaceIndices: true, condenseFaceIndices: true,
      getMeshId: function(mesh) { return mesh.userData.partNodesIndex; } });
  if (node !== mesh) {
    var oldState = {
      skipCheckTreeChange: this.__skipCheckTreeChange,
      ignoreTreeEvents: this.__ignoreTreeEvents
    };
    this.__skipCheckTreeChange = true;
    this.__ignoreTreeEvents = true;
    //console.log('split mesh', node);
    // Updated - we need to update the tree as well
    this.__markFreeNodeDescendents(this.tree.jstree('get_node', this.treeNodes[node.userData.partNodesIndex]));
    var deleted = this.tree.jstree('delete_node', this.treeNodes[node.userData.partNodesIndex]);
    //console.log('deleted', deleted, this.treeNodes[node.userData.partNodesIndex]);
    this.partNodes[node.userData.partNodesIndex] = node;
    node.userData.isSegmented = true;
    var uuidToIndex = {};
    uuidToIndex[node.uuid] = node.userData.partNodesIndex;
    this.__computeNodeStatistics(node);
    this.__updateTreeNodesFromObject3D(this.treeNodes, this.partsNode, node, this.partNodes, uuidToIndex);
    Object3DUtil.traverse(node, (nd) => {
      var pi = nd.userData.partNodesIndex;
      this.tree.jstree('create_node', this.treeNodes[pi].parent, this.treeNodes[pi]);
      //console.log('updating', this.treeNodes[pi]);
      return true;
    });
    // Propagate statistics up the tree
    this.__updatePartNodeTitle(node);
    Object3DUtil.traverseAncestors(node, (nd) => {
      //this.__updateNodeStatistics(nd);
      this.__updatePartNodeTitle(nd);
    });
    this.__skipCheckTreeChange = oldState.skipCheckTreeChange;
    this.__ignoreTreeEvents = oldState.ignoreTreeEvents;
  }
};

MeshHierarchyPanel.prototype.__findNodesWithSimilarPaths = function(node, searchRoot, ignore) {
  var matched = [];
  var targetpath = this.getSGPathId(node);
  if (!targetpath) { return matched; }
  var subparts = targetpath.split('/');
  ignore = ignore || [node];
  if (subparts.length > 1) {
    var suffix = '/' + subparts[subparts.length-1];
    Object3DUtil.traverse(searchRoot, (nd) => {
      var sgpath = this.getSGPathId(nd);
      if (sgpath && sgpath.endsWith(suffix)) {
        if (ignore.indexOf(nd) < 0) {
          matched.push(nd);
        }
        return false;
      } else {
        return true;
      }
    });
  }
  return matched;
};

MeshHierarchyPanel.prototype.__propagateLabelsToSimilar = function(node, searchRoot, findSimilarFn) {
  var similar = findSimilarFn(node, searchRoot);
  var nodeLabelInfo = node.labelInfo;
  for (var i = 0; i < similar.length; i++) {
    var n = similar[i];
    if (!n.labelInfo) {
      n.labelInfo = {};
    }
    _.merge(n.labelInfo, nodeLabelInfo);
    this.__updateLabelInfo(n, n.labelInfo);
  }
  return similar;
};

MeshHierarchyPanel.prototype.__propagateSelectedLabels = function(nodes) {
  var targets = nodes || this.getSelectedPartNodes();
  var targetsWithLabels = _.filter(targets, (n) => { return n.labelInfo; });
  if (targetsWithLabels.length) {
    for (var i = 0; i < targetsWithLabels.length; i++) {
      var t = targetsWithLabels[i];
      var similar = this.__propagateLabelsToSimilar(t, this.partsNode, (node, root) => {
        return this.__findNodesWithSimilarPaths(node, root, targetsWithLabels);
      });
      // if (!similar.length) {
      //   this.__propagateLabelsToSimilar(t, this.partsNode, (node, root) => {
      //     return this.__findNodesWithSimilarPaths(node, root, targetsWithLabels);
      //   });
      // }
    }
  }
};

MeshHierarchyPanel.prototype.selectObjectNodes = function(nodes, root) {
  if (!Array.isArray(nodes)) {
    nodes = [nodes];
  }
  if (root) {
    var paths = _.map(nodes, c => this.getMeshId(c, root));
    console.log('paths', paths.join(';'));
    nodes = this.findNodesByMeshId(paths);
  }
  var treeNodes =  _.map(nodes, c => this.treeNodes[c.userData.partNodesIndex]);
  this.tree.jstree('select_node', treeNodes);
  //this.refreshHighlighting();
  //Object3DUtil.setVisible(this.origObject3D, false);
  //Object3DUtil.setVisible(this.partsNode, true);
  //this.Publish('SelectNodes', nodes);
};

MeshHierarchyPanel.prototype.deselectObjectNodes = function(nodes, root) {
  if (!Array.isArray(nodes)) {
    nodes = [nodes];
  }
  var treeNodes =  _.map(nodes, c => this.treeNodes[c.userData.partNodesIndex]);
  this.tree.jstree('deselect_node', treeNodes);
};

MeshHierarchyPanel.prototype.isObjectNodeSelected = function(node) {
  var treeNode = this.treeNodes[node.userData.partNodesIndex];
  if (treeNode) {
    return this.tree.jstree('is_selected', treeNode);
  }
};

MeshHierarchyPanel.prototype.getPartAnnotations = function() {
  var annotations = [];
  var annIndex = 0;
  var uuidToAnnIndex = {};
  var annParts = [];
  var ignored = [];
  var other = [];
  var hasLabelOrSplit = [];
  // Go over nodes that are interesting
  //console.log(this.partNodes);
  for (var i = 0; i < this.partNodes.length; i++) {
    var partNode = this.partNodes[i];
    if (!partNode) { continue; }
    if (partNode.ignore) {
      ignored.push(i);
    } else if ((partNode.labelInfo && partNode.labelInfo.type && partNode.labelInfo.type !== 'None')
      || (partNode.userData && (partNode.userData.splitInfo || partNode.userData.isSegmented))) {
      var labelInfo = _.merge({
        id: annIndex+1,
        index: annIndex,
        sgpath: this.getSGPathId(partNode, this.partsNode),
        splitInfo: partNode.userData? partNode.userData.splitInfo : undefined,
        isSegmented: partNode.userData? partNode.userData.isSegmented : undefined,
      }, partNode.labelInfo || { 'label': partNode.userData.splitInfo? partNode.name : undefined });
      uuidToAnnIndex[partNode.uuid] = annIndex;
      annParts.push(partNode);
      annotations.push(labelInfo);
      annIndex++;
      hasLabelOrSplit.push(i);
    } else {
      other.push(i);
    }
  }

  // Go over other nodes
  var remaining = [];
  if (this.__exportCondensed) {
    var isIncluded = {};
    for (var i = 0; i < other.length; i++) {
      var pi = other[i];
      var partNode = this.partNodes[pi];
      var childrenModified = partNode.userData && partNode.userData.childrenModified;
      if (childrenModified) {
        remaining.push(pi);
        isIncluded[pi] = true;
      }
    }
    var included = hasLabelOrSplit.concat(ignored).concat(remaining);
    var added = included;
    while (added.length > 0) {
      var newAdded = [];
      for (var i = 0; i < added.length; i++) {
        var partNode = this.partNodes[added[i]];
        var childrenModified = partNode.userData && partNode.userData.childrenModified;
        if (childrenModified) {
          for (var j = 0; j < partNode.children.length; j++) {
            var pi = partNode.children[j].userData.partNodesIndex;
            if (!isIncluded[pi]) {
              newAdded.push(pi);
              remaining.push(pi);
              isIncluded[pi] = true;
            }
          }
        }
      }
      added = newAdded;
    }
  } else {
    remaining = remaining.concat(other);
  }
  remaining = remaining.concat(ignored);
  // Make sure remaining nodes are properly covered
  for (var j = 0; j < remaining.length; j++) {
    var i = remaining[j];
    var partNode = this.partNodes[i];
    if (uuidToAnnIndex[partNode.uuid] == null) {
      var labelInfo = {
        id: annIndex+1,
        index: annIndex,
        label: partNode.labelInfo? partNode.labelInfo.label : undefined,
        sgpath: this.getSGPathId(partNode, this.partsNode)
      };
      if (partNode.ignore) {
        labelInfo.ignore = true;
      }
      uuidToAnnIndex[partNode.uuid] = annIndex;
      annParts.push(partNode);
      annotations.push(labelInfo);
      annIndex++;
    }
  }

  // Get children and update splitInfo
  for (var i = 0; i < annParts.length; i++) {
    var partNode = annParts[i];
    if (annotations[i].splitInfo) {
      annotations[i].splitInfo = _.map(annotations[i].splitInfo, (info) => {
        var res = _.clone(info);
        res.meshIndex = uuidToAnnIndex[this.partNodes[res.meshId].uuid];
        delete res.meshId;
        return res;
      });
    }
    if (partNode.userData && partNode.userData.childrenModified) {
      annotations[i].childrenModified = true;
    }
    if (partNode.children && partNode.children.length) {
      var childIndices = partNode.children.map((n) => uuidToAnnIndex[n.uuid]).filter(x => x != null);
      // if (childIndices.length !== partNode.children.length) {
      //   console.log('childIndices and children mismatch', childIndices.length, partNode.children.length);
      // }
      if (childIndices.length) {
        annotations[i].children = childIndices;
      }
    }
  }
  //console.log(annotations, uuidToAnnIndex);
  return annotations;
};

MeshHierarchyPanel.prototype.__getNodeLookups = function(root) {
  var scope = this;
  var uuidToNode = {};
  var sgPathToNode = {};
  Object3DUtil.traverse(root, function (node) {
    var sgPathId = scope.getSGPathId(node, root);
    var uuid = node.uuid;
    uuidToNode[uuid] = node;
    sgPathToNode[sgPathId] = node;
    if (node instanceof THREE.Mesh) {
      var nMats = Materials.getNumMaterials(node.material);
      if (nMats > 1) {
        for (var i = 0; i < nMats; i++) {
          var partNode = { type: 'MeshMaterial', mesh: node, materialIndex: i };
          sgPathToNode[sgPathId + '[' + i + ']'] = partNode;
          uuidToNode[node.uuid + '-' + i] = partNode;
        }
      }
    }
    return true;
  });
  return { sgPathToNode: sgPathToNode, uuidToNode: uuidToNode };
};

MeshHierarchyPanel.prototype.__restructureFromParts = function(root, parts) {
  var lookups = this.__getNodeLookups(root);

  // Construct partNodes
  var partNodes = [];
  var uuidToPartIndex = {};
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i];
    var sgpath = part.sgpath;
    var node;
    if (sgpath) {
      // Existing node
      node = lookups.sgPathToNode[sgpath];
      if (!node) {
        if (part.splitInfo && part.splitInfo.length) {
          var splitInfo = part.splitInfo[part.splitInfo.length - 1];
          var originalMesh = lookups.sgPathToNode[parts[splitInfo.meshIndex].sgpath];
          var mesh = GeometryUtil.extractMesh(originalMesh, _.fromCondensedIndices(splitInfo.faceIndices), true);
          //mesh.userData.sgpath = sgpath;
          mesh.userData.splitInfo = part.splitInfo;
          node = mesh;
        } else {
          console.error('Cannot find node for sgpath=' + sgpath, lookups.sgPathToNode);
          continue;
        }
      } else if (part.isSegmented) {
        var newNode = Object3DUtil.createObject3DAndReplaceNode(node);
        node = newNode;
      } else if (node && node.type === 'MeshMaterial') {
        console.warn('MeshHierarchyPanel.__restructureFromParts: partNode MeshMaterial not supported', node);
        uuidToPartIndex[node.mesh.uuid + '-' + node.materialIndex] = part.index;
        continue;
      }
    } else {
      // New node
      node = this.__createGroup3D(part.name, part.type);
    }
    partNodes[part.index] = node;
    node.userData.partNodesIndex = part.index;
    if (part.childrenModified) {
      node.userData.childrenModified = true;
    }
    if (part.isSegmented) {
      node.userData.isSegmented = true;
    }
    if (part.label != null || part.type != null) {
      node.labelInfo = { label: part.label, type: part.type };
    }
    node.ignore = part.ignore;
    uuidToPartIndex[node.uuid] = part.index;
  }
  // console.log('got parts', partNodes);
  // TODO: make sure children are correct
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i];
    var partNode = partNodes[part.index];
    var tmpNode = new THREE.Group();
    if (partNode) {
      var childNodes = _.map(part.children, (index) => partNodes[index]);
      childNodes = _.filter(childNodes, (n) => n != null);
      var oldChildren = partNode.children.slice();
      var partition = _.partition(oldChildren, (node) => _.indexOf(part.children, node.userData.partNodesIndex) > 0);
      var toRemove = partition[1];
      if (part.childrenModified || part.isSegmented) {
        if (childNodes.length || toRemove.length) {
          console.log('processing part ' + i + ': removing ' + toRemove.length + ' of ' + oldChildren.length
            + ', adding ' + childNodes.length, toRemove, oldChildren, childNodes);
          for (var j = 0; j < toRemove.length; j++) {
            Object3DUtil.detachFromParent(toRemove[j], tmpNode);
          }
          for (var j = 0; j < childNodes.length; j++) {
            if (!partNode.userData.isSegmented) {
              Object3DUtil.attachToParent(childNodes[j], partNode, tmpNode);
            }
            partNode.add(childNodes[j]);
          }
        }
      } else {
        // TODO: check children
      }
    }
  }
  this.partsNode.updateMatrixWorld();
  return { uuidToPartIndex: uuidToPartIndex, partNodes: partNodes};
};

MeshHierarchyPanel.prototype.restructureFromPartAnnotations = function(parts) {
  this.restoreOriginalHierarchy();

  // Convert node to jstree data
  var root = this.partsNode;
  var res = this.__restructureFromParts(root, parts);
  var treeNodes = this.__getTreeNodesFromRootObject3D(root, res.partNodes, res.uuidToPartIndex);

  //console.log(root, treeNodes, res);
  this.__populateTreePanel(treeNodes);
  this.partNodes = res.partNodes;

  this.__initControlsPanel();
  if (this.allowLabeling || this.allowEditHierarchy) {
    this.__initButtonsPanel();
  }
};

MeshHierarchyPanel.prototype.__labelSelected = function() {
  var targets = this.getSelectedPartNodes();
  var lowerNodes = targets? targets.filter(x => x.userData.partNodesIndex !== 0) : [];
  if (lowerNodes.length && lowerNodes.length === targets.length) {
    if (this.allowLabeling && lowerNodes.length) {
      this.__labelNodes(lowerNodes);
    }
  }
};

MeshHierarchyPanel.prototype.__labelNodes = function (nodes) {
  var labelInfo = nodes[0].labelInfo || {};
  var form = new Form("Please enter a new label", [
    {
      title: 'Label',
      name: 'label',
      inputType: 'text',
      value: (labelInfo.label != null)? labelInfo.label : null,
      // TODO: Add some autocomplete
      // autocomplete: { source: ['Chair', 'Table'], delay: 0, minLength: 0 }
    },
    {
      title: 'Tags',
      name: 'tags',
      inputType: 'text',
      value: (labelInfo.tags != null)? labelInfo.tags : null
    },
    {
      title: 'Type',
      name: 'type',
      inputType: 'select',
      inputOptions: this.__labelTypes,
      value: (labelInfo.type != null)? labelInfo.type : this.__defaultLabelType
    },
    {
      title: 'Propagate label',
      name: 'propagate',
      inputType: 'boolean',
      value: this.__propagateLabels,
    }
  ]);
  var scope = this;
  var dialog = form.form(
    function (results) {
      scope.__disableInput = false;
      if (results) {
        nodes.forEach(function (n) {
          if (!n.labelInfo) {
            n.labelInfo = {};
          }
          _.merge(n.labelInfo, _.omit(results, ['propagate']));
          scope.__updateLabelInfo(n, n.labelInfo);
        });
        scope.__propagateSelectedLabels(nodes);
      }
    }
  );
  this.__disableInput = true;
};

MeshHierarchyPanel.prototype.__updateLabelInfo = function(node, labelInfo) {
  var titleJson = this.__createSummaryInfo(node);
  var hoverText = JSON.stringify(titleJson, null, 2);
  this.__updateTreeNode(node.userData.partNodesIndex, {
    'li_attr.title': hoverText,
    'text': labelInfo.label,
    'icon': this.__getIconUrl(node, labelInfo)
  });
};

function __getNodeAttrClass(n) {
  var flags = [];
  if (n.ignore) {
    flags.push("jstree-ignore");
  }
  if (n.visible != null && !n.visible) {
    flags.push("jstree-notshown");
  }
  return flags.join(" ");
}

MeshHierarchyPanel.prototype.__markIgnore = function(nodes, flag) {
  nodes.forEach((n) => {
    n.ignore = flag;
    this.__updateTreeNode(n.userData.partNodesIndex, {
      'a_attr.class': __getNodeAttrClass(n)
    });
  });
};


MeshHierarchyPanel.prototype.__fixIconSizes = function(jsnode) {
  // console.log('fix icon sizes');
  if (this.useIcons) {
    // Make sure the size of the icons are okay
    if (jsnode && jsnode.a_attr) {
      this.tree.find('#' + jsnode.a_attr.id + ' .jstree-themeicon-custom').css('background-size', '24px');
    } else {
      this.tree.find('.jstree-themeicon-custom').css('background-size', '24px');
    }
  }
};

MeshHierarchyPanel.prototype.__updateTreeNode = function(partNodesIndex, updates, updateOnlyIfChanged) {
  var tn = this.treeNodes[partNodesIndex];
  var jstn = this.tree.jstree('get_node', tn);
  var update = updateOnlyIfChanged? false : true;
  _.each(updates, function(value, key) {
    if (!update) {
      update = _.get(jstn, key) != value;
    }
    _.set(tn, key, value);
    _.set(jstn, key, value);
  });
  if (update) {
    this.tree.jstree('redraw_node', jstn);
    this.__fixIconSizes(jstn);
  }
  return update;
};

MeshHierarchyPanel.prototype.__updateNodeAttrClass = function(root, recursive) {
  var scope = this;
  if (recursive) {
    root.traverse(function(n) {
      scope.__updateTreeNode(n.userData.partNodesIndex, {
        'a_attr.class': __getNodeAttrClass(n)
      }, true);
    });
  } else {
    this.__updateTreeNode(root.userData.partNodesIndex, {
      'a_attr.class': __getNodeAttrClass(root)
    }, true);
  }
};

MeshHierarchyPanel.prototype.selectConnected = function (node) {
  var connected = this.identifyConnected(node);
  //console.log(connected);
  this.selectObjectNodes(connected);
  return connected;
};

MeshHierarchyPanel.prototype.setPartMaterial = function (part, mat, filter) {
  Object3DUtil.applyPartMaterial(part, mat, true, true, filter);
};

MeshHierarchyPanel.prototype.__lookupMaterialBySetting = function(setting, checked) {
  var m = this.__materials[setting];
  if (_.isString(m)) {
    if (checked == null || checked.indexOf(m) < 0) {
      if (checked == null) {
        checked = [m];
      } else {
        checked.push(m);
      }
      return this.__lookupMaterialBySetting(m, checked);
    } else {
      console.warn('Cycle detected when looking up material for ' + setting, checked);
      return;
    }
  } else {
    return m;
  }
};

MeshHierarchyPanel.prototype.__getPartMaterialForSetting = function(part, setting) {
  var mat = this.__lookupMaterialBySetting(setting);
  if (_.isFunction(mat)) {
    return mat(part);
  } else {
    return mat;
  }
};

MeshHierarchyPanel.prototype.__getPartMaterial = function(part, useColor) {
  // Returns main part material (without highlighting)
  var color = part.userData.color;
  if (useColor && color) {
    return color;
  } else {
    return this.__getPartMaterialForSetting(part, this.__defaultMaterialSetting);
  }
};


MeshHierarchyPanel.prototype.dehighlightPart = function (part) {
  if (part) {
    if (this.highlightByHidingOthers) {
      this.showParts(true);
    } else {
      var scope = this;
      this.setPartMaterial(part, function(node) { return scope.__getPartMaterial(node, true); });
    }
  }
};

// Update hover highlighting for a part
MeshHierarchyPanel.prototype.__clearHovered = function() {
  if (this.__hovered) {
    this.__hovered.isHighlighted = false;
    this.__hovered = null;
  }
};

MeshHierarchyPanel.prototype.__updateHoverHighlighting = function(partnode, hovered) {
  // console.log('update hovering', partnode, hovered);
  if (partnode) {
    if (this.__hovered !== partnode) {
      this.__clearHovered();
    }
    partnode.isHighlighted = hovered;
    if (hovered) {
      this.__hovered = partnode;
    }
  } else {
    this.__clearHovered();
    this.partsNode.traverse((node) => {
      delete node.isHighlighted;
    });
  }
};

//Highlights a particular part of the model
MeshHierarchyPanel.prototype.highlightPart = function (part) {
  if (part) {
    if (this.highlightByHidingOthers) {
      this.showPartOnly(part, true);
    } else {
      var mat = this.__lookupMaterialBySetting(this.__highlightMaterialSetting);
      this.setPartMaterial(part, mat);
      Object3DUtil.setVisible(this.partsNode, true);
    }
  }
};

//Colors a particular part of the model
MeshHierarchyPanel.prototype.colorPart = function (part, colorMaterial, filter) {
  if (part) {
    this.setPartMaterial(part, colorMaterial, filter);
    Object3DUtil.setVisible(this.partsNode, true);
  }
};

//Decolors a particular part of the model
MeshHierarchyPanel.prototype.decolorPart = function (part) {
  if (part) {
    var scope = this;
    this.setPartMaterial(part, function(node) { return scope.__getPartMaterial(node, false); });
  }
};

// Functions for controlling part visibility
MeshHierarchyPanel.prototype.showParts = function (bool) {
  Object3DUtil.setVisible(this.partsNode, bool);
};

MeshHierarchyPanel.prototype.showPartOnly = function(part, flag) {
  var scope = this;
  if (part) {
    var root = this.partsNode;
    if (part !== this.partsNode && flag) {
      // set other parts to be not visible
      var obj = part;
      Object3DUtil.traverseAncestors(part, function(p) {
        for (var i = 0; i < p.children.length; i++) {
          if (p.children[i] !== obj) {
            scope.__setVisible(p.children[i], false);
          } else {
            scope.__setVisible(p.children[i], true);
          }
        }
        obj = p;
        return (p !== root);
      });
    }
    // Show visibility of part
    scope.__setVisible(part, flag, true);
  }
};

MeshHierarchyPanel.prototype.__setVisible = function(object, visible, recursive) {
  Object3DUtil.setVisible(object, visible, recursive);
  this.__updateNodeAttrClass(object, recursive);
};

MeshHierarchyPanel.prototype.showPartsOnly = function(parts, flag, recursive) {
  var root = this.partsNode;
  // set other parts to be not visible
  if (flag) {
    Object3DUtil.setVisible(root, false, true);
  }
  Object3DUtil.setPartsVisible(root, parts, flag, recursive);
  this.__updateNodeAttrClass(root, true);
};

MeshHierarchyPanel.prototype.setPartsVisibility = function(parts, flag, recursive) {
  var root = this.partsNode;
  Object3DUtil.setPartsVisible(root, parts, flag, recursive);
  this.__updateNodeAttrClass(root, true);
};

// For rearranging and editing the tree

MeshHierarchyPanel.prototype.__bindTreeEditEvents = function() {
  var scope = this;
  this.tree.bind('create_node.jstree',
    function (event, data) {
      if (scope.__ignoreTreeEvents) { return; }
    }
  );
  this.tree.bind('rename_node.jstree',
    function (event, data) {
      if (scope.__ignoreTreeEvents) { return; }
      console.log('rename_node', data);
      var target = scope.__getObject3D(data.node);
      if (target) {
        target.labelInfo = target.labelInfo || { type: scope.__defaultLabelType };
        target.labelInfo.label = data.text;
        scope.__updateLabelInfo(target, target.labelInfo);
      }
    }
  );
  this.tree.bind('delete_node.jstree',
    function (event, data) {
      if (scope.__ignoreTreeEvents) { return; }
      console.log('delete_node', data);
      var target = scope.__getObject3D(data.node);
      if (target) {
        if (!(target instanceof THREE.Group) || target.children.length > 0 || target.userData.id != null) {
          console.warn('deleting important scene objects from hierarchy', target);
        }
        // scope.app.deleteObject(target);
      }
      scope.__markFreeNode(data.node);
      scope.tree.jstree("refresh");
    }
  );
  this.tree.bind('move_node.jstree',
    function (event, data) {
      if (scope.__ignoreTreeEvents) { return; }
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
};

MeshHierarchyPanel.prototype.__checkTreeChange = function (operation, node, node_parent, node_position, more) {
  if (this.__skipCheckTreeChange) { return true; }
  if (!this.allowEditHierarchy) return false;
  // operation can be 'create_node', 'rename_node', 'delete_node', 'move_node', 'copy_node' or 'edit'
  // in case of 'rename_node' node_position is filled with the new node name
  if (node_parent.parent === null) {
    return false;
  }
  // Don't allow materials to be regrouped
  var partNode = this.__getPartNode(node);
  if (partNode && partNode.mesh) {
     return false;
  }
  console.log('checking', operation, node_parent, partNode);
  return true;
};

MeshHierarchyPanel.prototype.__getRootObject3D = function() {
  return this.partsNode;
};

MeshHierarchyPanel.prototype.__getObject3D = function(node) {
  return this.__getPartNode(node);
};

MeshHierarchyPanel.prototype.__getObjectKey = function(object3D) {
  if (object3D.uuid != null) {
    return object3D.uuid;
  } else {
    return object3D.mesh.uuid + '-' + object3D.materialIndex;
  }
};

MeshHierarchyPanel.prototype.__getTreeNodeId = function(object3D, defaultValue) {
  var id = object3D? this.__getObjectKey(object3D) : undefined;
  return (id != null)? this.__prefix + id : defaultValue;
};

MeshHierarchyPanel.prototype.__getFreeTreeNode = function(name, type, parent) {
  var parentObject3D = this.__getObject3D(parent);
  var g = this.__createGroup3D(name, type, parentObject3D);
  var index = null;
  if (this.__freeIndices.length > 0) {
    index = this.__freeIndices.pop();
    if (this.treeNodes[index] || this.partNodes[index]) {
      console.warn('Attempting to reuse non-free tree node at index=', index);
    }
  }
  var t = this.__addTreeNode(this.treeNodes, g, index);
  this.partNodes[t.metadata.index] = g;
  g.userData.partNodesIndex = t.metadata.index;
  t.parent = parent.id;
  return t;
};

MeshHierarchyPanel.prototype.__markFreeNodeDescendents = function(jsnode) {
  console.log('__markFreeNodeDescendents', jsnode);
  for (var i = 0; i < jsnode.children.length; i++) {
    var cnode = this.tree.jstree('get_node', jsnode.children[i]);
    //console.log('child node',i, cnode);
    this.__markFreeNodeDescendents(cnode);
    this.__markFreeNode(cnode);
  }
};

MeshHierarchyPanel.prototype.__markFreeNode = function(jsnode) {
  var index = jsnode.original.metadata.index;
  console.log('freeing', index);
  delete this.treeNodes[index];
  delete this.partNodes[index];
  this.__freeIndices.push(index);
};

MeshHierarchyPanel.prototype.__createSummaryInfo = function(partNode, updateStats) {
  if (updateStats) {
    this.__updateNodeStatistics(partNode);
    // console.log('got partNode userData', object3D.userData);
  }
  var summaryInfo = _.defaults({}, partNode.labelInfo || {}, _.omit(partNode.userData, ['origMaterial', 'sgpath', 'splitInfo']));
  if (partNode.userData.splitInfo) {
    summaryInfo.splitInfo = _.map(partNode.userData.splitInfo, (x) => _.omit(x, ['faceIndices']));
  }
  return summaryInfo;
};

MeshHierarchyPanel.prototype.__updatePartNodeTitle = function(partNode) {
  var updatedTitle = JSON.stringify(this.__createSummaryInfo(partNode, true), null, ' ');
  this.__updateTreeNode(partNode.userData.partNodesIndex, {
    'li_attr.title': updatedTitle
  });
};

MeshHierarchyPanel.prototype.__updateJsTreeNode = function(node) {
  if (node) {
    var partNode = this.__getPartNode(node);
    if (partNode) {
      this.__updatePartNodeTitle(partNode);
    }
  }
};

MeshHierarchyPanel.prototype.__groupSelected = function(node) {
  var selected = this.tree.jstree('get_selected');
  if (!selected.length) return;  // Nothing to group
  if (!node) {
    // No node, use first selected
    node = this.tree.jstree('get_node', selected[0]);
  }

  var parent = this.tree.jstree('get_node', node.parent);
  var newnode_data = this.__getFreeTreeNode(this.__defaultGroupLabel, this.__defaultGroupType, parent);

  var newpos = parent.children.indexOf(node.id) + 1;
  var newnode = this.tree.jstree('create_node', node.parent, newnode_data, newpos);
  // Put all selected nodes under new node
  this.tree.jstree('move_node', selected, newnode);
  this.tree.jstree('open_node', newnode);
};

MeshHierarchyPanel.prototype.__ungroup = function(node) {
  var parent = this.tree.jstree('get_node', node.parent);
  var pos = parent.children.indexOf(node.id) + 1;
  //console.log('ungroup', node.children);
  var children = node.children.slice(); // Make copy
  this.tree.jstree('move_node', children, node.parent, pos);
  var partNode = this.__getPartNode(node);
  if (partNode && !partNode.userData.isCreatedGroup) {
    // Keep
  } else {
    this.tree.jstree('delete_node', node);
  }
  this.tree.jstree('select_node', children);
  this.__fixIconSizes();
  //console.log('move_node all done!')
};

MeshHierarchyPanel.prototype.__createTreeNode = function(object3D, index) {
  var parentId = this.__getTreeNodeId(object3D.parent, '#');
  var shId = this.__prefix + index;
  //this.__setTreeNodeId(object3D, shId);
  var treeNode = {
    id: shId,
    parent: parentId,
    text: object3D.name || index.toString(),
    icon: this.__defaultIconUrl,
    metadata: { index: index }
  };
  var info = this.__createSummaryInfo(object3D, true);
  treeNode.li_attr = {
    title: JSON.stringify(info, null, ' ')
  };
  // this.__nodeIdToMetadata[shId] = { object3D: object3D, modelInstance: modelInstance };
  return treeNode;
};

MeshHierarchyPanel.prototype.__addTreeNode = function(treeNodes, object3D, index) {
  if (index == null) {
    index = treeNodes.length;
  }
  treeNodes[index] = this.__createTreeNode(object3D, index);
  return treeNodes[index];
};

// Operations with scene graph
MeshHierarchyPanel.prototype.__reattach3DObjects = function(treeNode, newParent, oldParent) {
  // Reattach child to new parent (for restructuring underlying scene graph)
  var childObject3D = this.__getObject3D(treeNode);
  var newParentObject3D = this.__getObject3D(newParent);
  if (childObject3D) {
    var root = this.__getRootObject3D();
    var oldParentObject3D = childObject3D.parent;
    Object3DUtil.attachToParent(childObject3D, newParentObject3D, root);
    if (oldParentObject3D !== childObject3D.parent) {
      oldParentObject3D.userData.childrenModified = true;
      childObject3D.parent.userData.childrenModified = true;
    }
  } else {
    console.log('Cannot find object3D', treeNode);
  }
};

MeshHierarchyPanel.prototype.__createGroup3D = function(name, type, parentObject3D) {
  var newgroup = new THREE.Group();
  newgroup.name = name;
  newgroup.labelInfo = { label: name, type: type };
  newgroup.userData.isCreatedGroup = true;
  if (parentObject3D) {
    parentObject3D.userData.childrenModified = true;
  }
  Object3DUtil.attachToParent(newgroup, parentObject3D, this.__getRootObject3D());
  return newgroup;
};

MeshHierarchyPanel.prototype.__getAncestorNodeFromMesh = function(mesh) {
  var node = mesh;
  var root = this.partsNode;
  Object3DUtil.traverseAncestors(mesh, (n) => {
    if (n.children.length === 1 && n !== root) {
      node = n;
      return true;
    }
  });
  return node;
};

MeshHierarchyPanel.prototype.onPartClicked = function(intersects, mode) {
  if (intersects.length > 0) {
    var node =  this.__getAncestorNodeFromMesh(intersects[0].object);
    if (mode === 'add') {
      this.selectObjectNodes(node);
    } else if (mode === 'del') {
      this.deselectObjectNodes(node);
    } else if (mode === 'new') {
      this.tree.jstree('deselect_all', false);
      this.clearHighlighting();
      this.selectObjectNodes(node);
    } else if (mode === 'toggle') {
      if (this.isObjectNodeSelected(node)) {
        this.deselectObjectNodes(node);
      } else {
        this.selectObjectNodes(node);
      }
    }
  }
};

MeshHierarchyPanel.prototype.onPartHovered = function(intersects) {
  if (intersects.length > 0) {
    var node = this.__getAncestorNodeFromMesh(intersects[0].object);
    this.__updateHoverHighlighting(node, true);
  } else {
    this.__clearHovered();
  }
};

MeshHierarchyPanel.prototype.useCameraView = function(camera) {
  this.app.cameraControls.setCameraMatrix(camera.matrixWorld);
};

// Functions for submit/export/import
MeshHierarchyPanel.prototype.getAnnotationsJson = function(annotations) {
  var data = this.__annotatorInfo.getMerged({
    itemId: this.modelId,
    modelId: this.modelId,
    annotations: annotations,
    //screenshot: screenshot,
  });
  console.log(data);
  return data;
};

MeshHierarchyPanel.prototype.savePartAnnotations = function () {
  var annotations = this.getPartAnnotations();
  if (annotations.length === 0) {
    UIUtil.showAlert('Please provide some part annotations before saving', 'alert-warning');
    return;
  }

  var filename = (this.modelId != null)? this.modelId + '.parts.json' : 'parts.json';
  var data = this.getAnnotationsJson(annotations);
  FileUtil.saveJson(data, filename);
};

MeshHierarchyPanel.prototype.__loadPartAnnotations = function(err, data, options) {
  console.log('got', err, data, options);
  if (err) {
    UIUtil.showAlert('Error loading part annotations from ' + options.type);
    console.error('Error loading part annotations from ' + options.type, err);
  } else {
    var modelId = (data.modelId != null)? data.modelId : data.itemId;
    if (modelId !== this.modelId) {
      UIUtil.showAlert('Part annotation does not match current model id');
      console.error('Part annotation does not match current model id: got model id ' +
        modelId + ', expected ' + this.modelId);
    } else if (data.annotations) {
      try {
        this.restructureFromPartAnnotations(data.annotations);
      } catch (cerr) {
        UIUtil.showAlert('Error creating tree based on part annotations');
        console.error('Error creating tree based on part annotations', cerr);
      }
    } else {
      UIUtil.showAlert('Invalid part annotations');
      console.error('Invalid part annotations', data);
    }
  }
};

MeshHierarchyPanel.prototype.loadPartAnnotations = function(options) {
  console.log('loading part annotations');
  this.__setLabelButtonsEnabledState(false);
  FileUtil.readAsync(options.file || options.path, 'json', (err, data) => {
    this.__loadPartAnnotations(err, data, options);
    this.__setLabelButtonsEnabledState(true);
  });
};

MeshHierarchyPanel.prototype.retrievePartAnnotations = function() {
  var options = { path: this.retrievePartAnnotationsUrl, type: 'url' };
  this.__setLabelButtonsEnabledState(false);
  AnnotatorUtil.retrieveAnnotations(this.retrievePartAnnotationsUrl, this.__annotationType, this.modelId,
    (err, res) => {
      if (err) {
        this.__hasStoredMeshGroupAnnotation = false;
      } else {
        console.log('loadPartAnnotations', res);
        this.__loadPartAnnotations(null, res, options);
        this.__hasStoredMeshGroupAnnotation = true;
      }
      this.__setLabelButtonsEnabledState(true);
  });
};

MeshHierarchyPanel.prototype.submitPartAnnotations = function () {
  var annotations = this.getPartAnnotations();
  if (annotations.length === 0) {
    UIUtil.showAlert('Please provide some part annotations before submitting', 'alert-warning');
    return;
  }

  this.__setLabelButtonsEnabledState(false);
  var data = this.getAnnotationsJson(annotations);
  AnnotatorUtil.submitAnnotations(this.submitPartAnnotationsUrl, data, this.modelId,
    (err, res) => { this.__setLabelButtonsEnabledState(true); });
};

Object.defineProperty(MeshHierarchyPanel.prototype, 'showOBBs', {
  get: function () { return this.__showOBBs; },
  set: function (v) {
    this.__showOBBs = v;
    this.__debugOBBsNode.visible = this.__showOBBs;
  }
});

MeshHierarchyPanel.prototype.__clearOBBs = function() {
  Object3DUtil.removeAllChildren(this.__debugOBBsNode);
};

MeshHierarchyPanel.prototype.__addOBB = function (obb, material, transform) {
  var obj3D = new THREE.Object3D();
  if (transform) {
    Object3DUtil.setMatrix(obj3D, transform);
  }
  var mesh = new MeshHelpers.OBB(obb, material);
  var meshwf = mesh.toWireFrame(2.0 / obj3D.scale.length(), true);
  obj3D.add(meshwf);
  this.__debugOBBsNode.add(obj3D);
  if (obb.convex) {
    this.__debugOBBsNode.add(new THREE.Mesh(obb.convex, Object3DUtil.getSimpleFalseColorMaterial(2, 'red')));
  }
  return obj3D;
};

MeshHierarchyPanel.prototype.attach = function(parent) {
  if (this.partsNode) {
    parent.add(this.partsNode);
  }
  parent.add(this.__debugOBBsNode);
};

MeshHierarchyPanel.prototype.detach = function(parent) {
  if (this.partsNode) {
    parent.remove(this.partsNode);
  }
  parent.remove(this.__debugOBBsNode);
};

MeshHierarchyPanel.prototype.__autoExpandTree = function() {
  Object3DUtil.traverse(this.partsNode, (node) => {
    var treenode = this.treeNodes[node.userData.partNodesIndex];
    if (treenode) {
      //console.log('open_node', node.userData.partNodesIndex, treenode.id);
      this.tree.jstree('open_node', treenode.id);
    }
    var hasMeshes = 0;
    for (var i = 0; i < node.children.length; i++) {
      if (node.children[i].userData.nmeshes > 0) {
        hasMeshes++;
      }
    }
    return (hasMeshes === 1);
  });
};

module.exports = MeshHierarchyPanel;