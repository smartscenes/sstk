const Colors = require('util/Colors');
const MaterialHelper = require('materials/MaterialHelper');
const GeometryUtil = require('geo/GeometryUtil');

/**
 * Utility class getting material colors
 */
const MeshColors = {}

function __populateMeshSampleColor(mesh, sample, texuv, warned) {
  let material = mesh.material;
  const materialIndex = (sample.face != null)? sample.face.materialIndex : sample.materialIndex;
  if (Array.isArray(material)) {
    material = material[materialIndex];
  } else if (material instanceof THREE.MultiMaterial) {
    material = material.materials[materialIndex];
  }

  if (material.transparent) {
    sample.opacity = material.opacity;
  } else {
    sample.opacity = 1;
  }

  if (material.vertexColors) {
    sample.color = sample.vertexColor;
  }

  let textureOpacity = 1;
  if (material.map && sample.uv) {
    if (!material.map.imageData) {
      material.map.imageData = MaterialHelper.getImageData(material.map.image);
    }
    if (material.map.imageData) {
      texuv.copy(sample.uv);
      material.map.transformUv(texuv);
      const pix = MaterialHelper.getPixelAtUV(material.map.imageData, texuv.x, texuv.y);
      if (Colors.isValidColor(pix)) {
        sample.color = new THREE.Color(pix.r / 255, pix.g / 255, pix.b / 255);  // overwrites color
        // Handle alpha from transparent PNGs
        textureOpacity = pix.a / 255;
      } else {
        console.log('MeshSampling: Invalid color from material map', material.map, sample, texuv);
      }
    } else {
      if (!warned || !warned[material.map.name]) {
        console.warn('MeshSampling: Cannot get image data for texture', material.map.name);
        warned[material.map.name] = 1;
      }
    }
  }

  if (textureOpacity < 1 && material.transparent) {
    sample.opacity = textureOpacity;
  }
  if (material.color) {
    if (!sample.color) {  // just copy material color
      sample.color = material.color;
    } else {
      // TODO: Combine material.color with sampled texture color
      if (textureOpacity < 1) {
        // Handles when texture is a bit transparent
        const matWeight = 1 - textureOpacity;
        const sampleWeight = textureOpacity;
        sample.color.setRGB(
          sample.color.r * sampleWeight + material.color.r * matWeight,
          sample.color.g * sampleWeight + material.color.g * matWeight,
          sample.color.b * sampleWeight + material.color.b * matWeight
        );
      }
    }
  }
}

/**
 * Populate one sample with color and opacity
 * @param mesh {THREE.Mesh}
 * @param sample {{uv: THREE.Vector2, face: {materialIndex: int}}
 * @private
 */
MeshColors.populateSampleUVColor = (function() {
  const texuv = new THREE.Vector2();
  return function(mesh, sample) {
    return __populateMeshSampleColor(mesh, sample, texuv);
  }
})();


/**
 * Populate each sample with color and opacity
 * @param mesh {THREE.Mesh}
 * @param samples {Array<{uv: THREE.Vector2, face: {materialIndex: int}>}
 * @private
 */
function populateMeshSampleUVColors(mesh, samples) {
  const texuv = new THREE.Vector2();
  const warned = {};
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    __populateMeshSampleColor(mesh, sample, texuv, warned);
  }
}
MeshColors.populateMeshSampleUVColors = populateMeshSampleUVColors;

function populateMeshVertexColors(mesh) {
  const geom = mesh.geometry;
  if (!geom.hasAttribute('uv')) {
    console.error('[MeshSampling.textureToVertexColors] no uv coordinates, aborting');
    return;
  }

  const uvs = geom.getAttribute('uv');
  const positions = geom.getAttribute('position');
  const numVerts = positions.count;
  const samples = [];
  const materialGroups = GeometryUtil.getMaterialGroups(geom);
  let materialIndex = 0;
  for (let iVert = 0; iVert < numVerts; iVert++) {
    if (materialGroups && materialGroups.length > 1) {
      const group = materialGroups[materialIndex];
      if (iVert >= group.start + group.count) {
        materialIndex++;
      }
    }
    const sample = { uv: new THREE.Vector2(uvs.getX(iVert), uvs.getY(iVert)), materialIndex: materialIndex };
    samples.push(sample);
  }
  populateMeshSampleUVColors(mesh, samples);
  const colors = new Float32Array(numVerts * 3);
  for (let iVert = 0; iVert < numVerts; iVert++) {
    const sample = samples[iVert];
    const color = sample.color;
    color.toArray(colors, iVert * 3);
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

MeshColors.populateMeshVertexColors = populateMeshVertexColors;

module.exports = MeshColors;