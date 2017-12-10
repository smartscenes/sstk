var Constants = require('Constants');
var Colors = require('util/Colors');
var ImageUtil = require('util/ImageUtil');
var _ = require('util');

/**
 * Utilities for dealing with materials (operates only on materials/textures)
 * @module
 */
var Materials = {};
Materials.DefaultMaterialType = THREE.MeshPhysicalMaterial;

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
 * @returns {THREE.Texture}
 */
function loadTexture(opts) {
  var mapping = opts.mapping;
  var url = opts.url;

  var texture;
  var loader = THREE.Loader.Handlers.get( url );

  if ( loader !== null ) {
    texture = loader.load( url, opts.onLoad );
  } else {
    texture = new THREE.Texture();
    texture.name = url;
    texture.sourceFile = url;

    loadTextureImage(texture, opts);
  }

  if ( mapping !== undefined ) {
    texture.mapping = mapping;
  }
  return texture;
}
Materials.loadTexture = loadTexture;

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


Materials.getBasicMaterial = function (color, alpha) {
  if (color instanceof THREE.Material || color instanceof THREE.MultiMaterial) {
    return color;
  }
  var mat = new THREE.MeshBasicMaterial({side: THREE.DoubleSide, color: color});
  if (alpha != undefined) {
    Materials.setMaterialOpacity(mat, alpha);
  }
  return mat;
};


Materials.toMaterial = function (mat) {
  if (mat instanceof THREE.Material || mat instanceof THREE.MultiMaterial) {
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
      p2.roughness = 1 - THREE.Math.clamp(p.shininess / 200, 0, 1);
    }
    return p2;
  } else {
    return p;
  }
};

Materials.getStandardMaterial = function (color, alpha) {
  if (color instanceof THREE.Material || color instanceof THREE.MultiMaterial) {
    return color;
  }
  var c = color;
  var a = new THREE.Color();
  //a.setRGB(0.02, 0.02, 0.05);
  a.setRGB(c.r / 4, c.g / 4, c.b / 4);
  var s = new THREE.Color();
  s.setRGB(0.18, 0.18, 0.18);
  var mat = new Materials.DefaultMaterialType(Materials.updateMaterialParams(Materials.DefaultMaterialType, {
    color: c,
    //ambient: a,
    specular: s,
    shininess: 64,
    side: THREE.DoubleSide
  }));
  if (alpha != undefined) {
    Materials.setMaterialOpacity(mat, alpha);
  }
  return mat;
};

Materials.getSimpleFalseColorMaterial = function (id, color, palette) {
  var c = color;
  if (!c) {
    c = Colors.createColor(id, palette || Constants.defaultPalette);
  } else if (!(c instanceof THREE.Color)) {
    c = Colors.toColor(c);
  }

  var mat = Materials.getStandardMaterial(c);
  mat.name = 'color' + id;
  return mat;
};


Materials.setMaterialOpacity = function (material, opacity) {
  if (material instanceof THREE.MultiMaterial) {
    for (var i = 0; i < material.materials.length; i++) {
      Materials.setMaterialOpacity(material.materials[i], opacity);
    }
  } else {
    material.opacity = opacity;
    material.transparent = true;
  }
};

Materials.createMaterial = function(params) {
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
  var maps = ['map', 'bumpMap', 'normalMap', 'specularMap', 'envMap'];
  maps.forEach(function (m) {
    if (p.hasOwnProperty(m)) {
      var textureParams = p[m];
      var texture = Materials.loadTexture({ url: textureParams.src });
      texture.name = textureParams.name;
      texture.wrapS = (textureParams.wrapS !== undefined) ? textureParams.wrapS : THREE.RepeatWrapping;
      texture.wrapT = (textureParams.wrapT !== undefined) ? textureParams.wrapT : THREE.RepeatWrapping;
      p[m] = texture;
    }
  });

  switch (params.type) {
    case 'basic':
      return new THREE.MeshBasicMaterial(p);
    case 'normal':
      return new THREE.MeshNormalMaterial(p);
    case 'depth':
      return new THREE.MeshDepthMaterial(p);
    case 'face':
      return new THREE.MultiMaterial(p);
    case 'lambert':
      return new THREE.MeshLambertMaterial(p);
    case 'phong':
      return new THREE.MeshPhongMaterial(p);
    case 'physical':
      return new THREE.MeshPhysicalMaterial(p);
    case 'standard':
      return new THREE.MeshStandardMaterial(p);
    case 'toon':
      return new THREE.MeshToonMaterial(p);
    default:
      console.log('Unknown material type: ' + params.type + ', default to ' + Materials.DefaultMaterialType.constructor.name);
      return new Materials.DefaultMaterialType(p);
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


module.exports = Materials;