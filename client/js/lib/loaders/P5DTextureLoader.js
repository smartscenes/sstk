var Constants = require('Constants');

function __loadTexture(path, onLoad, onProgress, onError)  {
  var loader = new THREE.TextureLoader();
  return loader.load(path, onLoad);
}

var __defaultEnvmap = null;
function __getDefaultEnvmap() {
  if (!__defaultEnvmap) {
    __defaultEnvmap = __loadTexture(Constants.imagesDir + '/envmap-lat-lon.png');
    __defaultEnvmap.mapping = THREE.SphericalReflectionMapping;
  }
  return __defaultEnvmap;
}

var TextureLoader = function () {
  this.loadTexture = __loadTexture;
  this.loadVideoTexture = null;
};

TextureLoader.prototype.getTexturePath = function(name, origExt) {
  var digits = /^\d+$/;
  var ext = '.' + (origExt || 'jpg');
  if (!origExt) {
    if (name.substr(0, 6) === 'leaves' || name.substr(0, 6) === 'flower' ||
      name.substr(0, 5) === 'leaf_' || name.substr(0, 6) === 'spruce' || name === 'Settler') {
      ext = '.png';
    }
  }
  if (name.match(digits)) {
    return 's/' + name + ext;
  } else {
    return name + ext;
  }
};

TextureLoader.prototype.updateMaterials = function (mesh, config) {
  if (mesh.material instanceof THREE.MultiMaterial) {
    for (var i = 0, l = mesh.material.materials.length; i < l; i++) {
      var meshMaterial = mesh.material.materials[i];
      mesh.material.materials[i] = this.updateMaterial(meshMaterial, config, i);
    }
  } else if (mesh.material.index != undefined) {
    mesh.material = this.updateMaterial(mesh.material, config, mesh.material.index);
  } else {
    console.warn('Skipping applyMaterial for model ' + config.id + ': not MultiMaterial');
  }
};

TextureLoader.prototype.updateMaterial = function (meshMaterial, config, matIndex) {
  meshMaterial.side = THREE.DoubleSide;
  var matConfig = (config.materials? config.materials[matIndex] : null) || {};
  var matname = (meshMaterial.name || matConfig.name).toLowerCase();
  // if (matConfig.name && (meshMaterial.name !== matConfig.name)) {
  //   console.warn('Mismatched material name: orig=' + meshMaterial.name + ', config=' + matConfig.name + ", index=" + matIndex);
  //   console.log('Material and config', meshMaterial, config);
  // }
  var objectType = config.className;
  if ((objectType === 'Window' || objectType === 'Door') && matname === 'color_1') {
    meshMaterial.opacity = 0.3;
    meshMaterial.transparent = true;
    meshMaterial.envMap = config.reflectionCube;
    meshMaterial.metal = true;
    meshMaterial.shininess = 200;
    meshMaterial.reflectivity = 1;
    meshMaterial.refractionRatio = 0.8;
    meshMaterial.combine = THREE.MixOperation;
  }
  if (meshMaterial.map != null || matConfig.texture) {
    if (matname.startsWith('material_')) {
      // Tweak to matname based on the image src (for obj/mtl models)
      var texture = matConfig.texture || meshMaterial.map;
      var imgSrc = texture.name || (texture.image? texture.image.src : null);
      if (imgSrc) {
        var parts = imgSrc.split('/');
        matname = parts[parts.length-1].split('.')[0].toLowerCase();
      }
    }
    var alphaTweak = false;
    if (matname.substr(0, 6) === 'leaves' || matname.substr(0, 6) === 'flower' ||
      matname.substr(0, 5) === 'leaf_' || matname.substr(0, 6) === 'spruce') {
      alphaTweak = true;
    }
    if (matConfig.texture) {
      // Only load texture if the texture is different from the current one
      var textureName = this.getTexturePath(matConfig.texture);
      var textureChanged = !meshMaterial.map;
      if (meshMaterial.map) {
        // Clone so async loading of image textures don't affect our copy
        var name = meshMaterial.map.name; // not cloned for some reason
        if (textureName !== name) {
          meshMaterial.map = meshMaterial.map.clone();
          meshMaterial.map.name = name;
          textureChanged = true;
        }
        // } else {
        //   console.log("New texture: " + newMat.texture, mesh);
      }
      if (textureChanged) {
//        console.log('Replacing texture ' + origTexName + ' with ' + textureName + ' on model ' + config.id + ', material ' + material.name);
        var loadedTexture = this.loadTexture(textureName, function (material, name, texture) {
          material.map.name = name;
          material.map.image = texture.image;
          material.map.needsUpdate = true;
        }.bind(this, meshMaterial, textureName));
        if (!meshMaterial.map) {
          meshMaterial.map = loadedTexture;
        }
      }
      meshMaterial.color = new THREE.Color(matConfig.tcolor || 0xffffff);
    }
    if (alphaTweak) {
      meshMaterial.opacity = 1;
      meshMaterial.alphaTest = 0.6;
      //meshMaterial.depthWrite = false;
    }
  } else if (!meshMaterial.map && matname === 'video' && this.loadVideoTexture) {
    var vt = this.loadVideoTexture();
    meshMaterial = new THREE.MeshBasicMaterial( {
      name: "video",
      map: vt.texture,
      overdraw: 0.5 // TODO: what is right value here?
    });
    meshMaterial.video = vt.video;
  } else {
    if (matConfig.color) {
      meshMaterial.color = new THREE.Color(matConfig.color);
    }
    if (matname.substr(0, 6) == 'chrome') {
      meshMaterial.envMap = config.reflectionCube;
      meshMaterial.metal = true;
      meshMaterial.shininess = 200;
      meshMaterial.reflectivity = 1;
      meshMaterial.refractionRatio = 0.8;
      meshMaterial.ambient = new THREE.Color(0xFFFFFF);
    }
  }
  if (meshMaterial instanceof THREE.MeshPhysicalMaterial) {
    if (meshMaterial.metal) {
      meshMaterial.metalness = 1;
      // TODO(MS): Use a less hacky environment map
      meshMaterial.envMap = this.envMap || __getDefaultEnvmap();
      delete meshMaterial.metal;
    }
    if (meshMaterial.shininess) {
      meshMaterial.roughness = 1 - THREE.Math.clamp(meshMaterial.shininess / 200, 0, 1);
      delete meshMaterial.shininess;
    }
    delete meshMaterial.specular;
  }
  return meshMaterial;
};

module.exports = TextureLoader;
