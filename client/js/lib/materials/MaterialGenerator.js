var Materials = require('materials/Materials');

function MaterialGenerator() {

}

/**
 * Generate material from parameters
 * @param [params.texture] {string} Path to texture
 * @param [params.color] {string|int[]|THREE.Color} Color name or css hex
 * @param [params.colorNoise] {{h: number, s: number, l: number}} HSL spread of color
 * @param [params.material] {THREE.Material|THREE.MultiMaterial} Material
 * @returns {*}
 */
MaterialGenerator.prototype.generate = function(params) {
  if (params.material) {
    return params.material;
  } else if (params.texture) {
    return Materials.createMaterial({ map: { src: params.texture } });
  } else if (params.color) {
    var mat = Materials.toMaterial(params.color.name || params.color);
    if (params.colorNoise) {
      var c = mat.color;
      c.offsetHSL(
        THREE.MathUtils.randFloatSpread(params.colorNoise.h),
        THREE.MathUtils.randFloatSpread(params.colorNoise.s),
        THREE.MathUtils.randFloatSpread(params.colorNoise.l)
      );
    }
    return mat;
  } else {
    return Materials.toMaterial();
  }
};

module.exports = MaterialGenerator;