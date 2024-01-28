const _ = require('util/util');

class SceneWizard {
  constructor(config) {
    this.config = config;
    this.poseSuggestorUrl = this.config.pose_suggestor_endpoint.url;
    this.objectSimilarityUrl = this.config.object_similarity_endpoint.url;
  }

  getSimilar(fullId, threshold, limit, callback) {
    const source = fullId.split('.')[0];
    const modelId = fullId.split('.')[1];
    const paramList = [source, modelId, threshold, limit];
    const url = this.objectSimilarityUrl + '/' + paramList.join('/');
    _.getJSON(url, (err, res) => {
      if (err) {
        callback(err);
      } else {
        const results = res.similar_objects.map(x => {
          return {
            modelId: source + '.' + x.object_id,
            score: x.cosine_similarity
          };
        });
        callback(null, { results: results, status: 'OK' });
      }
    });
  }

  getSimQuerier() {
    return {
      query: (queryData, onsuccess, onerror) => {
        this.getSimilar(queryData.fullId, queryData.threshold, queryData.limit, (err, res) => {
          if (err) { onerror(err); } else { onsuccess(res); }
        });
      }
    };
  }

  getAzimuth(query, callback) {
    // TODO: There should be a proper API here (not just pulling stuff from iqc)
    const url = this.poseSuggestorUrl;
    _.postJSON(url, {
        "rgb_url": query.rgbUrl,
        "mask_url": query.maskUrl,
        "shape_id": query.modelId,
        "instance_id": query.maskId,
        "category": query.maskLabel,
        "arch_id": query.archId,
        "full_panorama_id": query.photoId
      },{
      dataType: "json",
      success: function(result) {
        //console.log("azi angle: ", result);
        callback(null, { azimuth: result['prediction'], isSupported: result["supported"] });
      },
      error: function(err) {
        //console.log(`Error: ${err}`);
        callback(err);
      }
    });
  }

}

module.exports = SceneWizard;