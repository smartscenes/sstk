// Main modules

module.exports = {
  Constants: require('./Constants'),
  /** @namespace assets */
  assets: {
    AssetCache: require('./assets/AssetCache'),
    AssetGroup: require('./assets/AssetGroup'),
    AssetGroups: require('./assets/AssetGroups'),
    AssetLoader: require('./assets/AssetLoader'),
    AssetManager: require('./assets/AssetManager'),
    AssetsDb: require('./assets/AssetsDb'),
    CachedAssetLoader: require('./assets/CachedAssetLoader'),
    LightsLoader: require('./assets/LightsLoader')
  },
  /** @namespace controls */
  controls: {
    CameraControls: require('./controls/CameraControls')
  },
  /** @namespace ds */
  ds: {
    Alignment: require('./ds/Alignment'),
    BinaryHeap: require('./ds/BinaryHeap'),
    Index: require('./ds/Index')
  },
  /** @namespace exporters */
  exporters: {
    NRRDExporter: require('./exporters/NRRDExporter'),
    JSONExporter: require('./exporters/JSONExporter'),
    OBJMTLExporter: require('./exporters/OBJMTLExporter'),
    PLYExporter: require('./exporters/PLYExporter'),
    SUNCGExporter: require('./exporters/SUNCGExporter')
  },
  /** @namespace geo */
  geo: {
    BBox: require('./geo/BBox'),
    BVH: require('./geo/BVH'),
    ColorGrid: require('./geo/ColorGrid'),
    Distances: require('./geo/Distances'),
    GeometryUtil: require('./geo/GeometryUtil'),
    MeshHelpers: require('./geo/MeshHelpers'),
    Object3DUtil: require('./geo/Object3DUtil'),
    Segments: require('./geo/Segments'),
    ShapeGenerator: require('./geo/ShapeGenerator'),
    Voxels: require('./geo/Voxels')
  },
  /** @namespace loaders */
  loaders: {
    HouseLoader: require('./loaders/HouseLoader'),
    VoxelLoader: require('./loaders/VoxelLoader'),
    WallLoader: require('./loaders/WallLoader')
  },
  /** @namespace math */
  math: {
    RNG: require('./math/RNG'),
    Sampler: require('./math/Sampler')
  },
  /** @namespace materials */
  materials: {
    Materials: require('./materials/Materials'),
    MaterialGenerator: require('./materials/MaterialGenerator')
  },
  /** @namespace model */
  model: {
    Model: require('./model/Model'),
    ModelInstance: require('./model/ModelInstance'),
    ModelVoxels: require('./model/ModelVoxels'),
    ModelInstanceVoxels: require('./model/ModelInstanceVoxels')
  },
  /** @namespace nav */
  nav: {
    NavScene: require('./nav/NavScene')
  },
  /** @namespace gfx */
  gfx: {
    Camera: require('./gfx/Camera'),
    Lights: require('./gfx/Lights'),
    MeshSampling: require('./gfx/MeshSampling'),
    Renderer: require('./gfx/Renderer'),
    RendererFactory: require('./gfx/RendererFactory'),
    ViewOptimizer: require('./gfx/ViewOptimizer')
  },
  /** @namespace scene */
  scene: {
    SceneLoader: require('./scene/SceneLoader'),
    SceneState: require('./scene/SceneState'),
    SceneUtil: require('./scene/SceneUtil'),
    WssSceneLoader: require('./scene/WssSceneLoader')
  },
  /** @namespace search */
  search: {
    BasicSearchController: require('./search/BasicSearchController')
  },
  /** @namespace sim */
  sim: {
    FirstPersonAgent: require('./sim/FirstPersonAgent'),
    ActionTraceLog: require('./sim/ActionTraceLog'),
    ActionTraceVisualizer: require('./sim/ActionTraceVisualizer'),
    CollisionProcessorFactory: require('./sim/CollisionProcessorFactory'),
    Simulator: require('./sim/Simulator')
  },
  /** @namespace ssg */
  ssg: {
    SceneStatistics: require('./ssg/SceneStatistics')
  },
  Colors: require('./util/Colors'),
  LabelRemap: require('./util/LabelRemap'),
  ImageUtil: require('./util/ImageUtil'),
  PubSub: require('./PubSub'),
  util: require('./util')
};
