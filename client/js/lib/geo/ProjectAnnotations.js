const GeometryUtil = require('geo/GeometryUtil');
const Object3DUtil = require('geo/Object3DUtil');
const ElemToLabelIndexBuffer = require('geo/seg/ElemToLabelIndexBuffer');
const _ = require('util/util');

class ProjectAnnotations {
  project(srcModelInst, tgtModelInst, srcAnns, options) {
    if (srcAnns.type === 'segment-triindices') {
      return this.projectTriIndexAnns(srcModelInst, tgtModelInst, srcAnns, options);
    } else {
      throw 'Unsupported annotation type: ' + srcAnns.type;
    }
  }

  projectTriIndexAnns(srcModelInst, tgtModelInst, srcAnns, options) {
    // Propagate annotations on triIndices
    const srcMeshes = Object3DUtil.getMeshList(srcModelInst.object3D);
    const tgtMeshes = Object3DUtil.getMeshList(tgtModelInst.object3D);
    if (srcMeshes.length !== 1) {
      throw 'Cannot project from multiple source meshes';
    }
    if (tgtMeshes.length !== 1) {
      throw 'Cannot project to multiple source meshes';
    }
    const srcMesh = srcMeshes[0];
    const tgtMesh = tgtMeshes[0];
    const tgt2srcTriMap = GeometryUtil.getTriCentroidMapping(tgtMesh.geometry, srcMesh.geometry,
      options.maxDist, options.tgtTransform, options.srcTransform);

    const numSrcTris = GeometryUtil.getGeometryFaceCount(srcMesh.geometry);
    const numTgtTris = GeometryUtil.getGeometryFaceCount(tgtMesh.geometry);
    const srcElemToLabelIndex = new ElemToLabelIndexBuffer(numSrcTris);
    srcElemToLabelIndex.fromGroupedElemIndices(srcAnns.data.annotations, 'partId', 'triIndices');
    const tgtElemToLabelIndex = new ElemToLabelIndexBuffer(numTgtTris);
    tgtElemToLabelIndex.populateWithMapping(srcElemToLabelIndex, tgt2srcTriMap);
    const tgtElemIndexGrouped = tgtElemToLabelIndex.getGrouped();

    const annotations = srcAnns.data.annotations.map(x => {
      const ann = _.clone(x);
      ann.triIndices = tgtElemIndexGrouped[ann.partId] || [];
      if (x.triIndices.length && !ann.triIndices) {
        console.warn('No triangles mapped for part ' + ann.partId + ' with label ' + ann.label);
      }
      return ann;
    });
    const finalTargetAnnotation = {
      appId: 'project-annotations-v0.1',
      type: srcAnns.type,
      modelId: srcAnns.modelId,
      labels: srcAnns.labels,
      data: {
        annotations: annotations
      }
    };

    return finalTargetAnnotation;
  }
}

module.exports = ProjectAnnotations;