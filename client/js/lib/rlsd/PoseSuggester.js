const CachedAssetLoader = require('assets/CachedAssetLoader');
const _ = require('util/util');

class PoseSuggester {
  constructor(config) {
    _.defaults(config, {
      cacheSize: 20
    });
    this.sceneWizard = config.sceneWizard;
    this.enabled = config.enabled;
    this.prefetch = config.prefetch;
    this.__cachedPoseLoader = new CachedAssetLoader({
      loadFn: (q, cb) => {
        return this.sceneWizard.getAzimuth(q, cb);
      },
      assetCacheSize: config.cacheSize
    });
  }

  __fetchPose(query, callback) {
    const key = this.__getKey(query);
    this.__cachedPoseLoader.load({
      skipCache: false,
      key: key,
      loadOpts: query,
      dispose: null,
      callback: callback
    });
  }

  __getKey(query) {
    return 'PoseSuggestor-' + JSON.stringify(query);
  }

  __getQuery(archId, modelInstance, maskedView, selectedMask) {
    const modelId  = modelInstance? modelInstance.object3D.userData.modelId : null;
    const query = {
      rgbUrl: maskedView.rgbUrl,
      maskUrl: maskedView.maskUrl,
      modelId: modelId,
      maskId: selectedMask.maskId,
      maskLabel: selectedMask.maskLabel,
      archId: archId,
      photoId: selectedMask.photoId
    };
    return query;
  }


  getPose(archId, modelInstance, maskedView, selectedMask) {
    const query = this.__getQuery(archId, modelInstance, maskedView, selectedMask);
    const key = this.__getKey(query);
    return this.__cachedPoseLoader.get(key);
  }

  fetchPose(archId, modelInstance, maskedView, selectedMask, callback) {
    if (this.enabled) {
      const query = this.__getQuery(archId, modelInstance, maskedView, selectedMask, callback);
      this.__fetchPose(query, (err, result) => {
        if (err) {
          console.warn('Error fetching pose', query);
          callback(err);
        } else {
          console.log('pose suggester', query, result);
          result.query = query;
          callback(null, result);
        }
      });
    }
  }

}


module.exports = PoseSuggester;