var HouseJsonLoader = require('scene/HouseJsonLoader');
var P5DTextureLoader = require('loaders/P5DTextureLoader');
var _ = require('util/util');

// Loader for SUNCG JSON format scenes
function SUNCGLoader(params) {
  params = _.defaults(params, { defaultModelSource: 'p5d', defaultSceneSource: 'p5dScene', archSource: 'suncg-arch' });
  HouseJsonLoader.call(this, params);
}

SUNCGLoader.prototype = Object.create(HouseJsonLoader.prototype);
SUNCGLoader.prototype.constructor = HouseJsonLoader;

SUNCGLoader.prototype.__getDefaultArchConfig = function() {
  return {
      up: new THREE.Vector3(0,1,0),
      front: new THREE.Vector3(0,0,1),
      unit: 1,
      defaults: {
      'Wall': {
        depth: 0.1,
          height: 2.7,
          extraHeight: 0.035,
          materials: [
          {
            "name": "inside",                          // Name of material ("inside" for inside wall)
            "texture": "wallp_1_1",                    // Texture
            "diffuse": "#ffffff"                       // Diffuse color in hex
          },
          {
            "name": "outside",                         // Name of material ("outside" for outside wall)
  //              "texture": "bricks_1",                     // Texture
            "texture": "wallp_1_1",                    // Texture
            "diffuse": "#ffffff"                       // Diffuse color in hex
          }
        ]
      },
      'Ceiling': {
        depth: 0.05,
          offset: 0.04,    // Bit offset above wall extraHeight
          materials: [
          {
            "name": "surface",
            "texture": "linen_1_4",
            "diffuse": "#ffffff"
          }
        ]
      },
      'Floor': {
        depth: 0.05,
          materials: [
          {
            "name": "surface",
            "texture": "laminate_1_2",
            "diffuse": "#ffffff"

          }
        ]
      },
      'Ground': {
        depth: 0.08,
          materials: [
          {
            "name": "surface",
            "texture": "ground_1",
            "diffuse": "#ffffff"
          }
        ]
      }
    }
  };
};

SUNCGLoader.prototype.__getTextureLoader = function() {
  return new P5DTextureLoader();
};


module.exports = SUNCGLoader;
