const BasicLoader = require('loaders/BasicLoader');

/**
 * Loader for pair alignment json file
 * @param params
 * @constructor
 * @memberOf loaders
 */
class PairAlignmentJsonLoader extends BasicLoader {
  constructor(params) {
    super(params);
  }

  parse(filename, data) {
    const parsed = (typeof(data) === 'string')? JSON.parse(data) : data;
    const alignments =  parsed.alignments.map((alignment) =>  {
      const matrix =  new THREE.Matrix4();
      // Assume column order
      matrix.fromArray(alignment.s2t_transformation);
      return {
        targetId: alignment.target_id,
        s2tMatrix: matrix
      };
    });
    return {
      alignments: alignments
    };
  }
}

module.exports = PairAlignmentJsonLoader;