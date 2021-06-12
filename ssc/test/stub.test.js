var STK = require('../stk-ssc');
var _ = STK.util;

describe('STK SSC basic check', function () {
	var assetManager = new STK.assets.AssetManager({
	  autoAlignModels: false, autoScaleModels: false, assetCacheSize: 100,
	  useColladaScale: false, convertUpAxis: false,
	  searchController: false
	});
});