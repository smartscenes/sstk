var Object3DUtil = require('geo/Object3DUtil');
var SegmentationUtil = require('geo/seg/SegmentationUtil');
var _ = require('util/util');

var IndexedSegmentationUtil = {};

IndexedSegmentationUtil.indexedSegmentationToHierarchicalSegments = function (object3D, nTris, segmentationsByName, meshIndices, segLevels, opts) {
  return IndexedSegmentationUtil.__indexedSegmentationToHierarchicalSegmentsUseExisting(object3D, nTris, segmentationsByName, meshIndices, segLevels, opts);
};

IndexedSegmentationUtil.__indexedSegmentationToHierarchicalSegmentsUseExisting = function (object3D, nTris, segmentationsByName, meshIndices, segLevels, opts) {
  var meshes = Object3DUtil.getMeshList(object3D);
  var meshIndex = meshIndices? meshIndices.meshIndex : _.get(segmentationsByName, 'meshes', 'index');
  var meshTriIndex = meshIndices? meshIndices.meshTriIndex : null;

  var combinedIndex = [];
  for (var i = 0; i < nTris; i++) {
    var index = segLevels.map( function(name) { return segmentationsByName[name].index[i]; }).join('_');
    combinedIndex.push(index);
  }
  var rawSegments = SegmentationUtil.triIndexedSegmentationToMeshTriSegments(combinedIndex,
    (meshes.length > 1)? meshIndex : undefined, meshTriIndex);
  var segmented = SegmentationUtil.remeshObjectUsingMeshTriSegments(object3D, rawSegments,
    opts.keepMaterials? null : Object3DUtil.ClearMat);
  var segments = segmented.children;
  // Take segmented object and hierarchically cluster it
  var levels = segLevels.length-1;
  while (levels > 0) {
    var grouped = _.groupBy(segments, function(s) {
      var id = s.userData.id;
      var li = id.lastIndexOf('_');
      return li >= 0? id.substring(0, li) : id;
    });
    //console.log(grouped);
    var newChildren = _.map(grouped, function(ss,k) {
      //console.log(ss);
      var group = new THREE.Group();
      group.name = k;
      group.userData.id = k;
      for (var i = 0; i < ss.length; i++) {
        group.add(ss[i]);
      }
      return group;
    });
    for (var i = 0; i < newChildren.length; i++) {
      segmented.add(newChildren[i]);
    }
    segments = newChildren;
    levels = levels - 1;
  }
  // Apply labels
  function applyLabels(root, level) {
    var segLevelName = segLevels[level];
    if (segmentationsByName[segLevelName] && segmentationsByName[segLevelName].labels) {
      var segLevelLabels = segmentationsByName[segLevelName].labels;
      for (var i = 0; i < root.children.length; i++) {
        var c = root.children[i];
        var p = parseInt(c.userData.id);
        if (segLevelLabels[p]) {
          c.userData.label = segLevelLabels[p];
        }
        if (level + 1 < segLevels) {
          applyLabels(c, level + 1);
        }
      }
    }
  }
  applyLabels(segmented, 0);
  return { index: combinedIndex, segmented: segmented };
};

IndexedSegmentationUtil.__indexedSegmentationToHierarchicalSegmentsRegroup = function (object3D, nTris, segmentationsByName, meshIndices, segLevels, opts) {
  var meshes = Object3DUtil.getMeshList(object3D);
  var meshIndex = meshIndices? meshIndices.meshIndex : _.get(segmentationsByName, 'meshes', 'index');
  var meshTriIndex = meshIndices? meshIndices.meshTriIndex : null;

//  var segLevels = ['components', 'pieces', 'surfaces'];
  var combinedIndex = [];
  for (var i = 0; i < nTris; i++) {
    var index = segLevels.map( function(name) { return segmentationsByName[name].index[i]; }).join('_');
    combinedIndex.push(index);
  }
  var rawSegments = SegmentationUtil.triIndexedSegmentationToMeshTriSegments(combinedIndex, (meshes.length > 1)? meshIndex : undefined);
  var segmented = SegmentationUtil.remeshObjectUsingMeshTriSegments(object3D, rawSegments,
    opts.keepMaterials? null : Object3DUtil.ClearMat);
  var segments = segmented.children;
  var grouped = IndexedSegmentationUtil.__groupSegmentsToHierarchicalSegments(segments);
  grouped.name = segmented.name;
  return { index: combinedIndex, segmented: grouped };
};

IndexedSegmentationUtil.__groupSegmentsToHierarchicalSegments = function (segments) {
  var BVH = require('geo/BVH');
  var bvh = new BVH(segments, { splitStrategy: BVH.SplitStrategy.CUBICITY_HEURISTIC });

  // Take bvh and group segments
  var threeNodes = {};
  // TODO: Flatten down into max levels
  bvh.traverse(function(bvhNode) {
    },
    function(bvhNode) {
      var node = threeNodes[bvhNode.id];
      if (!node) {
        node = new THREE.Group();
        node.name = 'BVH-' + bvhNode.id;
        threeNodes[bvhNode.id] = node;
        if (bvhNode.isLeaf) {
          for (var j = 0; j < bvhNode.objects.length; j++) {
            var obj = bvhNode.objects[j];
            node.add(obj);
          }
        } else {
          for (var j = 0; j < bvhNode.children.length; j++) {
            var child = bvhNode.children[j];
            var childNode = threeNodes[child.id];
            node.add(childNode);
          }
        }
        node.userData.splitAxis = bvhNode.splitAxis;
      }
    }
  );

  var grouped = threeNodes[bvh.root.id];
  return grouped;
};

module.exports = IndexedSegmentationUtil;