const Object3DUtil = require('geo/Object3DUtil');
const MeshAnnotationStats = require('part-annotator/MeshAnnotationStats');
const _ = require('util/util');

class LabeledParts {
  constructor(segmentedMesh, annotation, originalObject3D) {
    this.annotation = annotation;
    this.parts = [];
    this.segmentedMesh = segmentedMesh;
    //this.originalObject3D = originalObject3D;
    for (let i = 0; i < segmentedMesh.children.length; i++) {
      const mesh = segmentedMesh.children[i];
      const partIndex = parseInt(mesh.userData.id);
      // console.log(partIndex, mesh.userData.label);
      this.parts[partIndex] = {
        label: mesh.userData.label,
        partIndex: partIndex,
        partMesh: mesh,
        object3D: originalObject3D,
        partAnnotation: annotation.parts[partIndex-1],
        addedPartMesh: null
        // partAnnotation: _.find(this.annotation.parts, function(x) {
        //   return x.partSetId == partIndex; // comparing string and int
        // })
      };
    }
    this.annotationStats = this.saveAnnotationStats('initial');
  }

  ensureOBBs(fitOBBOpts) {
    const OBBFitter = require('geo/OBBFitter');
    for (let i = 0; i < this.parts.length; i++) {
      const part = this.parts[i];
      if (part && !part.obb && part.partMesh) {
        part.obb = OBBFitter.fitMeshOBB([part.partMesh], fitOBBOpts);
      } else if (part) {
        console.error('No mesh geometry for part', part.id);
      }
    }
  }

  filterParts(filter) {
    const partitioned = _.partition(this.parts, filter);
    const kept = partitioned[0];
    const dropped = partitioned[1];
    const keptIndices = kept.map( part => part? part.partIndex : -1 );
    this.annotation.parts = _.filter(this.annotation.parts, (p,i) => keptIndices.indexOf(i+1) >= 0);
    this.parts = kept;
    //console.log('Kept ' + this.parts.length + ', ' + this.annotation.parts.length);
    for (let part of dropped) {
      if (part) {
        this.segmentedMesh.remove(part.mesh);
      }
    }
    return dropped;
  }

  getMeshes() {
    let allMeshes = Object3DUtil.getMeshList(this.segmentedMesh);
    this.parts.forEach(function(p, partIndex) {
      if (p) {
        let meshes = Object3DUtil.getMeshList(p.partMesh);
        if (p.addedPartMesh) {
          let addedMeshes = Object3DUtil.getMeshList(p.addedPartMesh);
          meshes = meshes.concat(addedMeshes);
          allMeshes.push.apply(allMeshes, addedMeshes);
        }
        if (partIndex > 0) {
          meshes.forEach(function (x) {
            x.userData.labelInfo = { label: p.label };
          });
        }
      }
    });
    return allMeshes;
  }

  saveAnnotationStats(name) {
    let meshes = this.getMeshes();
    let annotationStats = new MeshAnnotationStats(meshes);
    annotationStats.compute(meshes);
    if (name != null) {
      annotationStats.save(name);
    }
    return annotationStats;
  }

  getUpdatedAnnotationStats() {
    // Update annotation stats
    const annotationStats = this.annotationStats;
    const meshes = this.getMeshes();
    annotationStats.compute(meshes);
    const delta = annotationStats.getDelta('initial');
    const total = annotationStats.get();
    const initial = annotationStats.get('initial');
    return { initial: initial, delta: delta, total: total };
  }
}

module.exports = LabeledParts;

