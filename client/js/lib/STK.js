// Include everything in STK-core
var STK = require('./STK-core');

STK.Constants.sys = {
  fs: require('io/FileUtil'),
  Buffer: Buffer
};

// Include additional UI apps and utils
STK.util.assign(STK, {
  DataViz: require('./viz/DataVizUI'),
  ModelSchema: require('./model/ModelSchema'),
  ModelQuerier: require('./query/ModelQuerier'),
  ModelViewer: require('./model-viewer/ModelViewer'),
  VoxelViewer: require('./model-viewer/VoxelViewer'),
  RecordingViewer: require('./interaction-viewer/RecordingViewer'),
  ScanSchema: require('./model/ScanSchema'),
  ScanQuerier: require('./query/ScanQuerier'),
  SceneSchema: require('./scene/SceneSchema'),
  SceneViewer: require('./scene-viewer/SceneViewer'),
  SceneQuerier: require('./query/SceneQuerier'),
  SearchController: require('./search/SearchController'),
  SimpleAssetQuerier: require('./query/SimpleAssetQuerier'),
  Stats: require('./stats/stats'),
  SimpleModelViewer: require('./model-viewer/SimpleModelViewer'),
  SimpleModelViewerWithControls: require('./model-viewer/SimpleModelViewerWithControls'),
  SimViewer: require('./sim/SimViewer'),
  UIUtil: require('./ui/UIUtil'),
  FileUtil: require('./io/FileUtil'),
  TaxonomyViewer: require('./taxonomy/TaxonomyViewer'),
  WordnetTaxonomyDetailsHandler: require('./taxonomy/WordnetTaxonomyDetailsHandler')
});

module.exports = STK;