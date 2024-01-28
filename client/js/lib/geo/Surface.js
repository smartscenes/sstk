const MeshSampling = require('geo/MeshSampling');
const Object3DUtil = require('geo/Object3DUtil');
const MeshFaces = require('geo/MeshFaces');
const Constants = require('Constants');

class Surface {
  constructor(object3D, meshSeg, index) {
    this.object3D = object3D;
    this.modelInstance = Object3DUtil.getModelInstance(this.object3D);
    this.meshSeg = meshSeg;
    this.index = index;
    this.__samples = null;
  }

  ensureSamples(nsamples) {
    if (!this.__samples) {
      this.__samples = this.samplePoints(MeshSampling.getDefaultSampler(), nsamples);
      // console.log('got ' + this.__samples.length + ' samples', nsamples);
    } else if (this.__samples.length < nsamples) {
      const extraSamples = this.samplePoints(MeshSampling.getDefaultSampler(), nsamples - this.__samples.length);
      this.__samples.push(...extraSamples);
      // console.log('add ' + extraSamples.length + ' to get ' + this.__samples.length + ' samples', nsamples);
    }
  }

  get samples() {
    return this.__samples;
  }

  samplePoints(sampler, nsamples) {
    const samples = sampler.sampleMeshes([this.meshSeg], nsamples)[0];
    return samples;
  }
  /**
   * @param object3D {THREE.Object3D}
   * @param nsamples {int}
   * @param condition {function(intersected)}
   */
  getIntersectedWithCondition(object3D, nsamples, condition) {
    // Shoot rays from surface along normal to bounding box
    const isIntersectingMainObject = (object3D === this.object3D);
    this.ensureSamples(nsamples);
    const raycaster = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3());
    raycaster.intersectBackFaces = true;
    const samples = this.samples;
    let nSatisfied = 0;
    let n = 0;
    for (let sample of samples) {
      let intersected;
      if (isIntersectingMainObject) {
        intersected = sample.intersected;
      }
      if (intersected === undefined) {
        raycaster.set(sample.worldPoint, sample.worldNormal);
        raycaster.near = 0.0000001;
        const intersections = raycaster.intersectObject(object3D, true);
        if (intersections.length) {
          for (intersected of intersections) {
            // console.log('intersected', intersected, this)
            if (intersected.object === this.meshSeg.mesh && this.meshSeg.faceIndices.indexOf(intersected.faceIndex) >= 0) {
              // on this surface, ignore
            } else {
              if (isIntersectingMainObject) {
                sample.intersected = intersected; // cache intersection information
              }
              break;
            }
          }
        }
      }

      if (intersected) {
        if (condition(intersected)) {
          nSatisfied++;
        }
      }
      n++;
      if (n >= nsamples) {
        break;
      }
    }
    return nSatisfied;
  }

  getIntersectedRatioWithCondition(object3D, nsamples, condition) {
    const nSatisfied = this.getIntersectedWithCondition(object3D, nsamples, condition);
    return nSatisfied / nsamples;
  }
  isInternalSurface(opts) {
    // console.log('isInternalSurface', opts);
    const score = this.getIntersectedRatioWithCondition(this.object3D, opts.nsamples,
      (intersection) =>
        (intersection.distance / opts.radius < opts.intersectDistRatioThreshold) ||
        (intersection.distance < opts.minInternalIntersectDist));
    // console.log('isInternal', score, opts, this)
    return score > 0.5;
  }

  isInteriorSurface(opts) {
    const score = this.getIntersectedRatioWithCondition(this.object3D, opts.nsamples,
      (intersection) => true);
    return score > 0.5;
  }

  isUpwardFacing(up) {
    up = up || Constants.worldUp;
    return this.normal.dot(up) >= 0.9;
  }

  isDownwardFacing(up) {
    up = up || Constants.worldUp;
    return this.normal.dot(up) <= -0.9;
  }

  get obb() {
    if (!this.__obb) {
      this.__obb = this.meshSeg.obb({constrainVertical: true, checkAABB: true});
    }
    return this.__obb;
  }

  get normal() {
    return this.meshSeg.areaWeightedNormal(this.meshSeg.mesh.matrixWorld);
  }

  toJSONNoSamples() {
    const samples = this.__samples;
    const json = this.toJSON();
    this.__samples = samples;
    return json;
  }

  toJSON() {
    const obb = this.obb;
    const toWorld = this.meshSeg.mesh.matrixWorld;
    const worldToModel = this.modelInstance? this.modelInstance.getWorldToOriginalModel() : null;
    const toModel = worldToModel? worldToModel.clone().multiply(toWorld) : null;
    const surfJson = {
      index: this.index,
      meshIndex: this.meshSeg.meshIndex,
      meshFaceIndices: this.meshSeg.faceIndices,
      area: this.meshSeg.area(toWorld),
      normal: this.meshSeg.areaWeightedNormal(toWorld),
      obb: obb.toJSON(),
      modelNormal: toModel? this.meshSeg.areaWeightedNormal(toModel) : undefined,
      modelObb: worldToModel? obb.clone().applyMatrix4(worldToModel).toJSON() : undefined,
      isVertical: obb.isVerticalPlane(),
      isHorizontal: obb.isHorizontalPlane(),
      isInterior: this.isInteriorSurface(this.object3D, 100)
    };
    if (this.__samples) {
      surfJson.samples = this.__samples.map(s => {
        return {
          point: s.worldPoint.toArray(),
          normal: s.worldNormal.toArray(),
          modelPoint: worldToModel? s.worldPoint.clone().applyMatrix4(worldToModel).toArray(): undefined,
          modelNormal: worldToModel? s.worldNormal.clone().transformDirection(worldToModel).toArray(): undefined,
          uv: (s.uv)? s.uv.toArray() : undefined,
          clearance: (s.intersected)? s.intersected.distance : s.intersected
        };
      });
    }
    return surfJson;
  }

  static fromJSON(object3D, meshes, json) {
    const mesh = meshes[json.meshIndex];
    const meshSeg = new MeshFaces(mesh, json.meshFaceIndices);
    const surface = new Surface(object3D, meshSeg, json.index);
    surface.json = json;
    // if (json.samples) {
    //   surface.__samples = json.samples.
    // }
    return surface;
  }
}

module.exports = Surface;