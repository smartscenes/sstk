const Colors = require('util/Colors');
const GeometryUtil = require('geo/GeometryUtil');
const ObjectAttachment = require('model/ObjectAttachment');
const ObjectSegmentator = require('geo/ObjectSegmentator');
const Object3DUtil = require('geo/Object3DUtil');
const MeshHelpers  = require('geo/MeshHelpers');
const Materials = require('materials/Materials');
const Surface = require('geo/Surface');
const Constants = require('Constants');
const ViewUtils = require('gfx/ViewUtils');
const _ = require('util/util');

const ModelUtil = {};

function identifySupportSurfaces(object3D, opts, vizNodeOptions) {
  opts = _.defaults(Object.create(null), opts || {}, {
    nsamples: 100,
    adjFaceNormSimThreshold: 0.95,
    planarNormSimThreshold: 0.9,
    minInternalIntersectDist: 0.01,
    minArea: 0.05,
    debug: false
  });
  const segmentator = new ObjectSegmentator();
  object3D.updateMatrixWorld();
  const segmented = segmentator.getSegmentation(object3D,
    { format: 'meshSegs', method: 'clustering',
      adjFaceNormSimThreshold: opts.adjFaceNormSimThreshold,
      restrictToPlanarSurfaces: true, planarNormSimThreshold: opts.planarNormSimThreshold,
      includeFaceIndices: true, condenseFaceIndices: true }
  );
  const minArea = Constants.metersToVirtualUnit*Constants.metersToVirtualUnit*opts.minArea;
  const surfaces = [];
  const objectBBox = Object3DUtil.getBoundingBox(object3D);
  const objectBBoxDims = objectBBox.dimensions();
  const minInternalIntersectDist = Constants.metersToVirtualUnit*opts.minInternalIntersectDist;
  let meshIndex = 0;
  for (let s of segmented) {
    const mesh = s.mesh;
    const meshSegs = s.meshSegs;
    for (let meshSeg of meshSegs) {
      meshSeg.meshIndex = meshIndex;
      const area = meshSeg.area(mesh.matrixWorld);
      if (area > minArea) {
        const surface = new Surface(object3D, meshSeg, surfaces.length);
        const surfaceNorm = meshSeg.areaWeightedNormal(mesh.matrixWorld);
        const maxExtent = Math.abs(surfaceNorm.dot(objectBBoxDims));
        const isInternal = surface.isInternalSurface(
          { nsamples: opts.nsamples, intersectDistRatioThreshold: 0.1, radius: maxExtent, minIntersectDist: minInternalIntersectDist });
        if (!isInternal) {
          surfaces.push(surface);
          // console.log(surface.isInteriorSurface(object3D, { nsamples: 100 }));
        } else {
          if (opts.debug) {
            console.log(`filter out internal segment with area ${area}, normal ${meshSeg.normal.toArray()}, min area is ${minArea}`);
          }
        }
      } else {
        if (opts.debug) {
          console.log(`filter out segment with area ${area}, normal ${meshSeg.normal.toArray()}, min area is ${minArea}`);
        }
      }
    }
    meshIndex++;
  }
  // console.log('got surfaces', surfaces, segmented);
  if (surfaces.length && vizNodeOptions) {
    for (let surface of surfaces) {
      const vizGroup = new THREE.Group();
      vizGroup.name = 'Surface-' + surface.index;
      const segMesh = surface.meshSeg.toMesh(surface.meshSeg.mesh.matrixWorld);
      //let colorIndex = surface.index;
      let colorIndex = 0;
      const surfaceNormal = surface.normal;
      if (surface.obb.isHorizontalPlane()) {
        if (surfaceNormal.dot(Constants.worldUp) >= 0.95) {
          colorIndex |= 0x01;
        } else {
          colorIndex |= 0x02;
        }
      }
      if (surface.obb.isVerticalPlane()) {
        colorIndex |= 0x04;
      }
      if (colorIndex === 0) {
        if (surfaceNormal.dot(Constants.worldUp) >= 0.95) {
          colorIndex |= 0x08;
        }
      }
      //colorIndex = surface.index;
      surface.colorIndex = colorIndex;
      segMesh.material = Materials.getSimpleFalseColorMaterial(colorIndex, null, Colors.palettes.d3_unknown_category18, THREE.FrontSide);
      vizGroup.add(segMesh);
      surface.vizNode = vizGroup;
    }
  }
  return surfaces;
}

ModelUtil.identifySupportSurfaces = identifySupportSurfaces;

function loadSupportSurfaces(object3D, filename, opts) {
  const callback = opts.callback;
  const meshes = Object3DUtil.getMeshList(object3D);
  _.getJSON(filename)
    .done((data) => {
      const condensed = (data.metadata && data.metadata.condenseFaceIndices);
      const supportSurfaces = data.supportSurfaces.map(surfaceJson => {
        if (condensed) {
          surfaceJson = _.clone(surfaceJson);
          surfaceJson.meshFaceIndices = _.fromCondensedIndices(condensed);
        }
        return Surface.fromJSON(object3D, meshes, surfaceJson);
      });
      callback(null, supportSurfaces);
    })
    .fail(callback);
}

ModelUtil.loadSupportSurfaces = loadSupportSurfaces;

function populateSurfaceVisibility(object3D, supportSurfaces, opts) {
  opts = opts || {};
  const meshes = Object3DUtil.getMeshList(object3D);
  for (let i = 0; i < meshes.length; i++) {
    meshes[i].userData.meshIndex = i;
  }

  const d =  Math.max(opts.resolution || 0, 256); // Make sure resolution is at least somewhat okay
  const getMeshId = (mesh) => mesh.userData.meshIndex;
  const visibleThreshold = opts.threshold || 10;
  const visibleTriangles = ViewUtils.identifyVisibleTriangles({ scene: object3D, width: d, height: d, getMeshId: getMeshId });
  for (let surface of supportSurfaces) {
    const mesh = surface.meshSeg.mesh;
    const meshId = getMeshId(mesh);
    const visibleMeshTriIndices = visibleTriangles[meshId];
    surface.visibility = 0;
    if (visibleMeshTriIndices) {
      const areaRatio = surface.meshSeg.getAreaRatio((faceIndex) => visibleMeshTriIndices[faceIndex] > visibleThreshold);
      surface.visibility = areaRatio.value;
    }
    console.log('surface visibility', surface.visibility);
  }
}

ModelUtil.populateSurfaceVisibility = populateSurfaceVisibility;

function simplifySurfaces(supportSurfaces, options) {
  const simplifyModifier = new THREE.SimplifyModifier();
  let simplifiedSurfaces = [];
  for (let surface of supportSurfaces) {
    const mesh = surface.meshSeg.mesh;
    const nvertices = GeometryUtil.getGeometryVertexCount(mesh);
    const maxVertices = options.maxVertices;
    if (maxVertices && nvertices > maxVertices) {
      simplifiedSurfaces.push(surface);
      surface.meshSeg.mesh = simplifyModifier.modify(mesh, nvertices - maxVertices);
    }
  }
  return simplifiedSurfaces;
}

ModelUtil.simplifySurfaces = simplifySurfaces;


function identifyObjectAttachments(object3D, supportOpts, vizNodeOptions) {
  const objAttachment = new ObjectAttachment(object3D);
  const sides = [];
  if (supportOpts && supportOpts.support) {
    for (let i = 0; i < supportOpts.support.length; i++) {
      const s = supportOpts.support[i];
      if (s === 'vertical') {
        sides.push(Constants.BBoxFaces.BACK);
      } else if (s === 'top') {
        sides.push(Constants.BBoxFaces.TOP);
      } else if (s === 'bottom') {
        sides.push(Constants.BBoxFaces.BOTTOM);
      }
    }
  } else {
    sides.push(Constants.BBoxFaces.BOTTOM);
  }
  const attachments = [];
  for (let side of sides) {
    const attachment = objAttachment.identifyAttachmentOnSideBySampling(side, supportOpts);
    if (attachment) {
      let vizGroup;
      if (vizNodeOptions) {
        let lineWidth = vizNodeOptions.lineWidth || 0;
        let attachmentColor = vizNodeOptions.color || 'yellow';
        let componentColor = vizNodeOptions.componentColor || 'blue';
        vizGroup = new THREE.Group();
        let obbMesh = new MeshHelpers.OBB(attachment.obb, attachmentColor);
        let obbMeshWf = obbMesh.toWireFrame(lineWidth);
        vizGroup.add(obbMeshWf);
        if (attachment.components) {
          for (let obb of attachment.components) {
            obbMesh = new MeshHelpers.OBB(obb, componentColor);
            obbMeshWf = obbMesh.toWireFrame(lineWidth);
            vizGroup.add(obbMeshWf);
          }
        }
      }
      attachments.push({ side: Constants.BBoxFaceNames[side], attachment: attachment, vizNode: vizGroup });
    }
  }
  return attachments;
}
ModelUtil.identifyObjectAttachments = identifyObjectAttachments;

function getTightObbForSide(object3D, side, nsamples, transform) {
  const objAttachment = new ObjectAttachment(object3D);
  // Don't cluster
  const attachment = objAttachment.identifyAttachmentOnSideBySampling(side,
    { nsamples: nsamples, transform: transform, clusterDistThreshold: 0 });
  if (attachment) {
    return attachment.obb;
  }
}
ModelUtil.getTightObbForSide = getTightObbForSide;

module.exports = ModelUtil;