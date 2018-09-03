var BasicLoader = require('loaders/BasicLoader');

/**
 * Loader for aln (meshlab alignment matrices) files
 * @param params
 * @constructor
 * @memberOf loaders
 */
function ALNLoader(params) {
  this.fs = params.fs;
}

ALNLoader.prototype = Object.create(BasicLoader.prototype);
ALNLoader.prototype.constructor = ALNLoader;

ALNLoader.prototype.parse = function(filename, data) {
  return this.__parseMatrices(filename, data);
};

ALNLoader.prototype.__parseMatrices = function(filename, data) {
  // 1
  // scene0700_00_vh_clean_2.ply
  // #
  // -0.809017   0.587785          0   0.352544
  // -0.587785  -0.809017          0    3.71646
  // 0          0          1 -0.0462523
  // 0          0          0          1
  // 0

  // Format of file:
  // number of aligment matrices
  // repeating
  //   Name of scene
  //   #
  //   matrix
  // 0
  var lines = data.split('\n');
  var ws = /\s+/;
  if (lines.length > 0) {
    var lineno = 0;
    var nmatrices = parseInt(lines[lineno++].trim());
    var matrices = [];
    for (var i = 0; i < nmatrices; i++) {
      var filename = lines[lineno++].trim();
      var sep = lines[lineno++].trim();
      if (sep !== '#') {
        throw 'Unexpected line at ' + filename + ':' + lineno;
      }
      var r0 = lines[lineno++].trim().split(ws);
      var r1 = lines[lineno++].trim().split(ws);
      var r2 = lines[lineno++].trim().split(ws);
      var r3 = lines[lineno++].trim().split(ws);
      var m = new THREE.Matrix4();
      m.set(
        r0[0], r0[1], r0[2], r0[3],
        r1[0], r1[1], r1[2], r1[3],
        r2[0], r2[1], r2[2], r2[3],
        r3[0], r3[1], r3[2], r3[3]
      );
      matrices.push({ filename: filename, matrix: m });
    }
    return matrices;
  }
};

module.exports = ALNLoader;