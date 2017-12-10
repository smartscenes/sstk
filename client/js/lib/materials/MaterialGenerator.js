var Materials = require('materials/Materials');

function MaterialGenerator() {

}

MaterialGenerator.prototype.generate = function(params) {
  if (params.texture) {
    return Materials.createMaterial({ map: { src: params.texture } });
  } else {
    var mat = Materials.toMaterial(params.color.name || params.color);
    if (params.colorNoise) {
      var c = mat.color;
      c.offsetHSL(
        THREE.Math.randFloatSpread(params.colorNoise.h),
        THREE.Math.randFloatSpread(params.colorNoise.s),
        THREE.Math.randFloatSpread(params.colorNoise.l)
      );
    }
    return mat;
  }
};

module.exports = MaterialGenerator;