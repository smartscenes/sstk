var AssetLoaders = {};

AssetLoaders.registerDefaultLoaders = function(assetManager) {
  // TODO: Update all loaders to error first callback with additional options on how the asset is to be loaded
  assetManager.registerAssetLoader('scene', 'sceneState', require('scene/SceneStateLoader'));
  assetManager.registerAssetLoader('scene', 'wss', require('scene/WssSceneLoader'));
  assetManager.registerAssetLoader('scene', 'ssj', require('scene/WssSceneLoader'));

  // TODO: Move some of this out of the main STK
  assetManager.registerAssetLoader('scene', 'suncg', require('scene/SUNCGLoader'));

  // TODO: Have assetManager use these fancy loaders!
  assetManager.registerAssetLoader('mesh', 'ply', require('loaders/PLYLoader'));
  assetManager.registerAssetLoader('mesh', 'obj', require('loaders/OBJLoader'));
  assetManager.registerAssetLoader('mesh', 'objmtl', require('loaders/OBJMTLLoader'));
  assetManager.registerAssetLoader('mesh', 'utf8', require('loaders/UTF8Loader'));
  assetManager.registerAssetLoader('mesh', 'kmz', require('loaders/KMZLoader'));
  assetManager.registerAssetLoader('mesh', 'dae', require('loaders/ColladaLoader'));

  // The following loaders already use error first callback style
  assetManager.registerAssetLoader('wall', 'wall', require('loaders/WallLoader'));
  assetManager.registerAssetLoader('voxel', '*', require('loaders/VoxelLoader'));
  assetManager.registerAssetLoader('navmesh', 'navmesh', require('loaders/NavMeshLoader'));
  assetManager.registerAssetLoader('house', 'house', require('loaders/HouseLoader'));
  assetManager.registerAssetLoader('labelMapping', '*', require('util/LabelMapping').Loader);
};

module.exports = AssetLoaders;