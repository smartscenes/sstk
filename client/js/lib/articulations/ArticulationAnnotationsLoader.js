const async = require('async');
const _ = require('util/util');

// Some old code to handle if vector stored with x,y,z
function toVector3(v) {
  if (v.x != null) {
    return [ parseFloat(v.x), parseFloat(v.y), parseFloat(v.z) ];
  } else {
    return v;
  }
}

class ArticulationAnnotationsLoader {

  static loadArticulationAnnotations(articulations_filename, precomputed_filename, callback) {
    function convertArticulation(articulation) {
      return {
        pid: parseInt(articulation.pid),
        type: articulation.type,
        base: articulation.base.map(b => parseInt(b)),
        axis: toVector3(articulation.axis),
        origin: toVector3(articulation.origin),
        rangeMin: parseFloat(articulation.rangeMin),
        rangeMax: parseFloat(articulation.rangeMax)
      };
    }

    console.time('loadArticulations');
    async.parallel([
      function (cb) {
        _.getJSON(articulations_filename, cb);
      },
      function (cb) {
        if (precomputed_filename && precomputed_filename !== 'none') {
          _.getJSON(precomputed_filename, cb);
        } else {
          cb(null, null);
        }
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