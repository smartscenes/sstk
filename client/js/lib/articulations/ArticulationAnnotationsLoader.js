const async = require('async');

class ArticulationAnnotationsLoader {

  static loadArticulationAnnotations(articulations_filename, precomputed_filename, callback) {
    function convertArticulation(articulation) {
      // TODO: Store data in DB with correct types
      return {
        pid: parseInt(articulation.pid),
        type: articulation.type,
        base: articulation.base.map(b => parseInt(b)),
        axis: [ parseFloat(articulation.axis.x), parseFloat(articulation.axis.y), parseFloat(articulation.axis.z) ],
        origin: [ parseFloat(articulation.origin.x), parseFloat(articulation.origin.y), parseFloat(articulation.origin.z) ],
        rangeMin: parseFloat(articulation.rangeMin),
        rangeMax: parseFloat(articulation.rangeMax),
      };
    }

    console.time('loadArticulations');
    async.parallel([
      function (cb) {
        _.getJSON(articulations_filename, cb);
      },
      function (cb) {
        _.getJSON(precomputed_filename, cb);
      }
    ], function (err, res) {
      console.timeEnd('loadArticulations');
      if (err) {
        callback(err);
      } else {
        let articulations = res[0];
        articulations.data.articulations = articulations.data.articulations.map(x => convertArticulation(x));
        console.log(articulations.data.articulations);
        let precomputed = res[1];
        callback(null, { articulations: articulations, precomputed: precomputed });
      }
    });
  }
}

module.exports = ArticulationAnnotationsLoader;