var Constants = require('Constants');
var Colors = require('util/Colors');
var ImageUtil = require('util/ImageUtil');
var _ = require('util/util');
require('vendor/three/environments/RoomEnvironment'); // for neutral envmap

// AXC: Legacy three MultiMaterial that we haven't quite eliminated
var __warnedMultiMaterial = false;
THREE.MultiMaterial = function( materials = [] ) {
  if (!__warnedMultiMaterial) {
    console.warn( 'THREE.MultiMaterial has been removed. Use an Array instead.' );
    __warnedMultiMaterial = true;
  }
  materials.isMultiMaterial = true;
  materials.materials = materials;
  materials.clone = function () {
    return materials.slice();
  };

  return materials;
};

Object.defineProperty(THREE.Material.prototype, 'colorHex', {
  get: function () { return this.color.getHex(); },
  set: function (v) {
    this.color.setHex(v);
  }
});

/**
 * Utilities for dealing with materials (operates only on materials/textures)
 * @module
 */
var Materials = {};
Materials.DefaultMaterialType = THREE.MeshPhysicalMaterial;
Materials.DefaultMaterialSide = THREE.DoubleSide;
Materials.FalseMaterialType = THREE.MeshPhongMaterial;
Materials.DefaultTextureEncoding = THREE.LinearEncoding;
//Materials.DefaultTextureEncoding = THREE.sRGBEncoding;

Materials.textureMapFields =
  ['map', 'bumpMap', 'normalMap', 'specularMap', 'envMap', 'roughnessMap',
  'alphaMap', 'aoMap', 'displacementMap', 'emissiveMap', 'lightMap', 'metalnessMap',
  'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap', 'transmissionMap'];

Materials.setDefaultMaterialType = function(defaultMatType, falseMatType) {
  if (defaultMatType != null) {
    if (typeof defaultMatType === 'string') {
      defaultMatType = Materials.getMaterialType(defaultMatType);
    }
    Materials.DefaultMaterialType = defaultMatType;
    THREE.Loader.DefaultMaterialType = new defaultMatType().type;
  }
  if (falseMatType != null) {
    if (typeof falseMatType === 'string') {
      falseMatType = Materials.getMaterialType(falseMatType);
    }
    Materials.FalseMaterialType = falseMatType;
  }
};

/**
 * Helper to load image for a texture
 * @param texture {THREE.Texture}
 * @param opts.url {string} URL to load image from
 * @param [opts.crossOrigin]
 * @param [opts.onLoad]
 * @param [opts.onProgress]
 * @param [opts.onError]
 * @param [opts.manager] {THREE.LoadingManager}
 * @static
 */
function loadTextureImage ( texture, opts ) {
  var onLoad = opts.onLoad;
  var onProgress = opts.onProgress;
  var onError = opts.onError;

  var manager =  (opts.manager !== undefined ) ? opts.manager : THREE.DefaultLoadingManager;
  var loader = new THREE.ImageLoader( manager );
  loader.setCrossOrigin( opts.crossOrigin );
  //console.log('Load image', opts.url);
  loader.load( opts.url, function (image, imageLoadCompleteCb) {
    ImageUtil.ensurePowerOfTwo(image, texture, function(err, resizedImage) {
      //console.log('Resized image to power of two', opts.url);
      if (err) {
        console.warn('Error resizing image to power of two', opts.url, err);
      }
      texture.image = resizedImage || image;
      texture.needsUpdate = true;
      if ( onLoad ) onLoad( texture );
      if ( imageLoadCompleteCb ) { imageLoadCompleteCb(null, texture.image); }
    });
  }, onProgress, onError, true);
}
Materials.loadTextureImage = loadTextureImage;

/**
 * Helper to load texture
 * @param opts.url {string} URL to load image from
 * @param [opts.crossOrigin]
 * @param [opts.onLoad]
 * @param [opts.onProgress]
 * @param [opts.onError]
 * @param [opts.manager] {THREE.LoadingManager}
 * @param [opts.mapping]
 * @param [opts.encoding]
 * @param [opts.isDataTexture]
 * @returns {THREE.Texture}
 */
function loadTexture(opts) {
  var url = opts.url;
  var manager = opts.manager || THREE.DefaultLoadingManager;

  var texture;
  var loader = manager.getHandler( url );

  if ( loader !== null ) {
    texture = loader.load( url, opts.onLoad );
  } else {
    texture = new THREE.Texture();
    texture.name = url;
    texture.sourceFile = url;

    loadTextureImage(texture, opts);
  }

  if (opts.isDataTexture) {
    texture.generateMipmaps = false;
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    //    texture.unpackAlignment = 1;
  }
  if ( opts.mapping !== undefined ) {
    texture.mapping = opts.mapping;
  }
  texture.encoding = opts.encoding || Materials.DefaultTextureEncoding;
  return texture;
}
Materials.loadTexture = loadTexture;

function getNeutralEnvMap(pmremGenerator) {
  pmremGenerator.compileEquirectangularShader();
  const scene = new THREE.RoomEnvironment();
  scene.rotateY(Math.PI);
  const envMap = pmremGenerator.fromScene(scene).texture;
  return new Promise( ( resolve, reject ) => {
    resolve( { envMap: envMap } );
  });
}
Materials.getNeutralEnvMap = getNeutralEnvMap;

function getEquirectangularEnvMap(path, pmremGenerator) {
  // no envmap
  if ( ! path ) return Promise.resolve( { envMap: null } );
  pmremGenerator.compileEquirectangularShader();
  return new Promise( ( resolve, reject ) => {
    new THREE.RGBELoader()
      .load( path, ( texture ) => {
        const envMap = pmremGenerator.fromEquirectangular( texture ).texture;
        resolve( { envMap: envMap } );
      }, undefined, reject );
  });
}
Materials.getEquirectangularEnvMap = getEquirectangularEnvMap;

function getCubeMapEnvMap(paths, pmremGenerator) {
  // no envmap
  if ( ! paths ) return Promise.resolve( { envMap: null } );
  let loader;
  if (paths[0].endsWith('.hdr')) {
    loader = new THREE.HDRCubeTextureLoader();
  } else {
    loader = new THREE.CubeTextureLoader();
  }
  pmremGenerator.compileCubemapShader();
  return new Promise( ( resolve, reject ) => {
    loader.load( paths, ( texture ) => {
        const envMap = pmremGenerator.fromCubemap( texture ).texture;
        resolve( { envMap: envMap } );
      }, undefined, reject );
  });
}
Materials.getCubeMapEnvMap = getCubeMapEnvMap;

function getEnvMap(options, pmremGenerator) {
  if (options.type === 'cubemap') {
    return Materials.getCubeMapEnvMap(options.paths, pmremGenerator);
  } else if (options.type === 'equirectangular') {
    return Materials.getEquirectangularEnvMap(options.path, pmremGenerator);
  } else {
    return Materials.getNeutralEnvMap(pmremGenerator);
  }
}
Materials.getEnvMap = getEnvMap;

/**
 * Apply coloring to texture pixels (without changing alpha)
 * @param texture {THREE.Texture} Texture to recolor
 * @param opts Options for how to recolor
 * @param opts.color
 * @returns THREE.Texture
 */
Materials.recolorTexture = function(texture, opts) {
  // Apply recoloring function to texture
  if (opts.color) {
    // get texture image and recolor pixels the specified color (without changing alpha)
    var color = Colors.toColor(opts.color);
    var r = Math.floor(color.r*255);
    var g = Math.floor(color.g*255);
    var b = Math.floor(color.b*255);
    var imageData = ImageUtil.recolorImageData(texture.image, function(data, i) {
      data[i] = r;
      data[i+1] = g;
      data[i+2] = b;
    });
    var origTexture = texture;
    texture = new THREE.DataTexture(new Uint8Array(imageData.data.buffer), imageData.width, imageData.height,
      THREE.RGBAFormat, THREE.UnsignedByteType, texture.mapping, texture.wrapS, texture.wrapT);
    texture.repeat = origTexture.repeat;
    texture.offset = origTexture.offset;
    texture.needsUpdate = true;
  }
  return texture;
};

Materials.createMultiMaterial = function(materials) {
  materials.isMultiMaterial = true;
  materials.materials = materials;
  materials.clone = function () {
    return materials.slice();
  };
  return materials;
};

Materials.isMaterial = function(mat) {
  // Note: instanceof THREE.MultiMaterial no longer work, should update all code that uses it
  return (mat && (mat.isMaterial || mat.isMultiMaterial));
};

Materials.getBasicMaterial = function (color, alpha, materialSide) {
  if (Materials.isMaterial(color)) {
    return color;
  }
  if (materialSide == null) {
    materialSide = Materials.DefaultMaterialSide;
  }
  var mat = new THREE.MeshBasicMaterial({side: materialSide, color: color});
  if (alpha != undefined) {
    Materials.setMaterialOpacity(mat, alpha);
  }
  return mat;
};


/**
 * Transforms input into a material
 * @param mat {THREE.Material|THREE.MultiMaterial|color}
 * @returns {THREE.Material|THREE.MultiMaterial}
 */
Materials.toMaterial = function (mat) {
  if (Materials.isMaterial(mat)) {
    return mat;
  } else {
    var color = mat || 'gray';
    if (_.isArray(color)) {
      var c = color;
      color = new THREE.Color(c[0], c[1], c[2]);
      return Materials.getStandardMaterial(color, c[3]);
    } else {
      return Materials.getStandardMaterial(Colors.toColor(color));
    }
  }
};

Materials.updateMaterialParams = function(materialType, p) {
  // Adjust for specular/shininess if material don't support them
  if (materialType === THREE.MeshStandardMaterial || materialType === THREE.MeshPhysicalMaterial) {
    var p2 = _.omit(p, ['specular', 'shininess']);
    if (p.shininess != undefined) {
      p2.roughness = 1 - THREE.MathUtils.clamp(p.shininess / 200, 0, 1);
    }
    return p2;
  } else {
    return p;
  }
};

Materials.getMaterial = function (color, alpha, materialType, materialSide) {
  if (Materials.isMaterial(color)) {
    return color;
  }
  materialType = materialType || Materials.DefaultMaterialType;
  if (materialSide == null) {
    materialSide = Materials.DefaultMaterialSide;
  }
  var c = color;
  var a = new THREE.Color();
  //a.setRGB(0.02, 0.02, 0.05);
  a.setRGB(c.r / 4, c.g / 4, c.b / 4);
  var s = new THREE.Color();
  s.setRGB(0.18, 0.18, 0.18);
  var mat = new materialType(Materials.updateMaterialParams(materialType, {
    color: c,
    //ambient: a,
    specular: s,
    shininess: 64,
    side: materialSide
  }));
  if (alpha != undefined) {
    Materials.setMaterialOpacity(mat, alpha);
  }
  return mat;
};

Materials.getStandardMaterial = function (color, alpha, materialSide) {
  return Materials.getMaterial(color, alpha, Materials.DefaultMaterialType, materialSide);
};

Materials.getSimpleFalseColorMaterial = function (id, color, palette, materialSide) {
  var c = color;
  if (c == null) {
    c = Colors.createColor(id, palette || Constants.defaultPalette);
  } else if (!(c instanceof THREE.Color)) {
    c = Colors.toColor(c);
  }

  var mat = Materials.getMaterial(c, 1, Materials.FalseMaterialType, materialSide);
  mat.name = 'color' + id;
  return mat;
};

function __setMaterialArray(targetMaterials, sourceMaterials, targetMaterialIndex) {
  if (targetMaterialIndex !== undefined) {
    var i = targetMaterialIndex;
    if (i < 0 || i >= targetMaterials.length) {
      throw('Invalid materialIndex ' + targetMaterialIndex);
    }
    targetMaterials[i] = sourceMaterials.length? sourceMaterials[i] : sourceMaterials;
  } else {
    for (var i = 0; i < targetMaterials.length; i++) {
      targetMaterials[i] = sourceMaterials.length? sourceMaterials[i] : sourceMaterials;
    }
  }
}

// Set the node material, keeping multimaterial
Materials.setNodeMaterial = function(node, material, materialIndex) {
  var materials = null;
  if (material instanceof THREE.MultiMaterial) {
    materials = material.materials;
  } else if (Array.isArray(material)) {
    materials = material;
  }
  try {
    if (Array.isArray(node.material)) {
      var oldMaterials = node.material;
      node.material = [];
      for (var i = 0; i < oldMaterials.length; i++) {
        node.material[i] = oldMaterials[i];
      }
      __setMaterialArray(node.material, materials || material, materialIndex);
    } else if (node.material instanceof THREE.MultiMaterial) {
      node.material = node.material.clone();
      __setMaterialArray(node.material.materials, materials || material, materialIndex);
    } else {
      node.material = material;
    }
    return true;
  } catch (cerr) {
    console.error('Error setting node material', cerr, node);
    return false;
  }
};

Materials.setMaterialOpacity = function (material, opacity) {
  var materials = Materials.toMaterialArray(material);
  for (var i = 0; i < materials.length; i++) {
    var m = materials[i];
    m.opacity = opacity;
    m.transparent = opacity < 1;
    m.needsUpdate = true;
  }
};

Materials.setMaterialSide = function (material, side) {
  var materials = Materials.toMaterialArray(material);
  for (var i = 0; i < materials.length; i++) {
    var m = materials[i];
    m.side = side;
    m.needsUpdate = true;
  }
};

Materials.setTextureProperty = function (material, propName, propValue) {
  var materials = Materials.toMaterialArray(material);
  for (var i = 0; i < materials.length; i++) {
    var m = materials[i];
    if (m.map) {
      m.map[propName] = propValue;
    }
    if (m.emissiveMap) {
      m.emissiveMap[propName] = propValue;
    }
    if (m.map || m.emissiveMap) {
      m.needsUpdate = true;
    }
  }
};

Materials.createTexture = function(opts, textures) {
  var texture = Materials.loadTexture({ url: opts.src || opts.url, encoding: opts.encoding });
  texture.name = opts.name;
  texture.wrapS = (opts.wrapS != null) ? opts.wrapS : ((opts.wrap != null)? opts.wrap : THREE.RepeatWrapping);
  texture.wrapT = (opts.wrapT != null) ? opts.wrapT : ((opts.wrap != null)? opts.wrap : THREE.RepeatWrapping);
  if (opts.repeat) {
    texture.repeat.copy(opts.repeat);
  }
  if (opts.anisotropy != null) {
    texture.anisotropy = opts.anisotropy;
  }
  return texture;
};

Materials.createMaterial = function(params, textures) {
  // NOTE: Cannot have type set!!!
  var p = _.omit(params, ['type']);
  if (p.opacity < 1) {
    p.transparent = true;
  }
  var colors = ['color', 'emissive', 'specular'];
  colors.forEach(function (c) {
    if (p.hasOwnProperty(c)) {
      if (typeof p[c] === 'string') {
        p[c] = new THREE.Color(parseInt(p[c], 16));
      } else if (typeof p[c] instanceof THREE.Color) {
      } else {
        p[c] = new THREE.Color(p[c]);
      }
    }
  });
  Materials.textureMapFields.forEach(function (m) {
    if (p.hasOwnProperty(m) && p[m]) {
      var texture = Materials.createTexture(p[m], textures);
      p[m] = texture;
    }
  });

  var materialType = Materials.getMaterialType(params.type);
  var material = new materialType(p);
  if (params.name != null) {
    material.name = params.name;
  }
  material.side = Materials.getMaterialSide(params.side, Materials.DefaultMaterialSide);
  return material;
};

Materials.getMaterialSide = function(sidedness, defaultSide) {
  if (sidedness === THREE.FrontSide || sidedness === THREE.BackSide || sidedness === THREE.DoubleSide) {
    return sidedness;
  } else if (typeof(sidedness) === 'string') {
    sidedness = sidedness.toLowerCase();
    if (sidedness === "front") {
      return THREE.FrontSide;
    } else if (sidedness === "back") {
      return THREE.BackSide;
    } else if (sidedness === "double") {
      return THREE.DoubleSide;
    } else {
      console.warn('Unknown sidedness: ' + sidedness);
    }
  } else if (sidedness == undefined) {
    // console.log('Unspecified sidedness')
  } else {
    console.warn('Invalid sidedness type:' + typeof(sidedness));
  }
  return defaultSide;
};

Materials.getCombineOperation = function(combine, defaultCombine) {
  if (combine === THREE.MultiplyOperation || combine === THREE.MixOperation ||
      combine === THREE.AddOperation) {
    return combine;
  } else if (typeof(combine) === 'string') {
    combine = combine.toLowerCase();
    if (combine === 'multiply') {
      return THREE.MultiplyOperation;
    } else if (combine === 'mix') {
      return THREE.MixOperation;
    } else if (combine === 'add') {
      return THREE.AddOperation;
    } else {
      console.warn('Unknown combine operation:' + combine);
    }
  } else if (combine != null) {
    console.warn('Invalid combine type:' + typeof(combine));
  }
  return defaultCombine;
};

Materials.getMaterialType = function(mtype) {
  switch (mtype) {
    case 'basic':
      return THREE.MeshBasicMaterial;
    case 'normal':
      return THREE.MeshNormalMaterial;
    case 'depth':
      return THREE.MeshDepthMaterial;
    case 'face':
      return THREE.MultiMaterial;
    case 'lambert':
      return THREE.MeshLambertMaterial;
    case 'phong':
      return THREE.MeshPhongMaterial;
    case 'physical':
      return THREE.MeshPhysicalMaterial;
    case 'standard':
      return THREE.MeshStandardMaterial;
    case 'toon':
      return THREE.MeshToonMaterial;
    default:
      console.log('Unknown material type: ' + mtype + ', default to ' + Materials.DefaultMaterialType.constructor.name);
      return Materials.DefaultMaterialType;
  }
};

Materials.getMaterialParams = function (material) {
  var includeFields = [
    'id', 'name', 'side', 'opacity', 'shininess', 'reflexivity',
    'color', 'emissive', 'specular', 'metalness', 'roughness',
    'map', 'bumpMap', 'normalMap', 'specularMap', 'envMap'];
  var params = _.pick(material, includeFields);
  if (material instanceof THREE.MeshPhongMaterial) {
    params['type'] = 'phong';
  } else if (material instanceof THREE.MeshLambertMaterial) {
    params['type'] = 'lambert';
  } else if (material instanceof THREE.MeshBasicMaterial) {
    params['type'] = 'basic';
  } else if (material instanceof THREE.MeshNormalMaterial) {
    params['type'] = 'normal';
  } else if (material instanceof THREE.MeshDepthMaterial) {
    params['type'] = 'depth';
  } else if (material instanceof THREE.MultiMaterial) {
    params['type'] = 'face';
  } else if (material instanceof THREE.MeshPhysicalMaterial) {
    params['type'] = 'physical';
  } else if (material instanceof THREE.MeshToonMaterial) {
    params['type'] = 'toon';
  } else if (material instanceof THREE.MeshStandardMaterial) {
    params['type'] = 'standard';
  }
  return params;
};

Materials.getTextureParams = function (texture) {
  var includeFields = [
    'id', 'name', 'src', 'wrapS', 'wrapT'];
  var params = _.pick(texture, includeFields);
  if (params.src === undefined) {
    params.src = texture.image.src;
  }
  return params;
};

Materials.cloneMaterial = function(m) {
  if (Array.isArray(m)) {
    var copy = [];
    for (var i = 0; i < m.length; i++) {
      copy[i] = m[i].clone();
    }
    return copy;
  } else {
    return m.clone();
  }
};

Materials.toMaterialArray = function(material) {
  if (material != null) {
    if (material instanceof THREE.MultiMaterial) {
      return material.materials;
    } else if (Array.isArray(material)) {
      return material;
    } else {
      return [material];
    }
  } else {
    return [];
  }
};

Materials.getNumMaterials = function(material) {
  if (material != null) {
    if (material instanceof THREE.MultiMaterial) {
      return material.materials.length;
    } else if (Array.isArray(material)) {
      return material.length;
    } else {
      return 1;
    }
  } else {
    return 0;
  }
};

/**
 * Returns material of the intersected triangle
 * @param intersected {Intersect}
 */
Materials.getMaterialAtIntersected = function(intersected) {
  var material = intersected.object.material;
  if (material instanceof THREE.MultiMaterial) {
    material = material.materials;
  }
  if (Array.isArray(material)) {
    var iFaceMaterial = intersected.face.materialIndex;
    return material[iFaceMaterial];
  }
  return material;
};

Materials.getMaterialWithRepeat = function(material, repeatX, repeatY, clone) {
  if (material) {
    var textureMapFields = Materials.textureMapFields.filter(field => material[field] && material[field].repeat);
    if (textureMapFields.length) {
      var mat = clone? material.clone() : material;
      for (var i = 0; i < textureMapFields.length; i++) {
        var field = textureMapFields[i];
        if (clone) {
          mat[field] = mat[field].clone();
          mat[field].needsUpdate = true;
        }
        mat[field].repeat.set(repeatX, repeatY);
      }
      return mat;
    } else {
      return material;
    }
  }
};

function isMaterialExactlySame(mat1, mat2) {
  return mat1.uuid === mat2.uuid;
}

function isMaterialSame(mat1, mat2) {
  if (mat1.uuid === mat2.uuid) {
    return true;
  }
  const matJson1 = _.omit(mat1.toJSON(), ['uuid']);
  const matJson2 = _.omit(mat2.toJSON(), ['uuid']);
  return _.isEqual(matJson1, matJson2);
}

Materials.isMaterialsSame = function(mat1, mat2, exactMatch) {
  var mats1 = Materials.toMaterialArray(mat1);
  var mats2 = Materials.toMaterialArray(mat2);
  var isSame = exactMatch? isMaterialExactlySame : isMaterialSame;
  if (mats1.length === mats2.length) {
    // TODO: order materials
    for (let i = 0; i < mats1.length; i++) {
      // console.log('check material ${i} ${exactMatch}')
      if (!isSame(mats1[i], mats2[i])) {
        return false;
      }
    }
    return true;
  } else {
    return false;
  }
};

module.exports = Materials;


/**
 * Material definition
 * @memberOf materials
 * @typedef MaterialDef
 * @type {object}
 * @property {string} type - Material type (`basic|phong|physical`)
 * @property {THREE.Color|string} [color] - Material color
 */