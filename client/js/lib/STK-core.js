// Main modules
require('three-geometry');

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
  /** @namespace articulations */
  articulations: {
    PartsLoader: require('./articulations/PartsLoader'),
    ConnectivityGraphHelper: require('./articulations/ConnectivityGraphHelper'),
    ArticulationAnnotationsLoader: require('./articulations/ArticulationAnnotationsLoader'),
    Articulation: require('./articulations/Articulation'),
    DisplayAxis: require('./articulations/DisplayAxis'),
    DisplayRadar: require('./articulations/DisplayRadar'),
    ArticulationsRenderHelper: require('./articulations/ArticulationsRenderHelper'),
    ArticulationsRenderDataGenerator: require('./articulations/ArticulationsRenderDataGenerator'),
    ArticulatedObject: require('./articulations/ArticulatedObject')
  },
  /** @namespace controls */
  controls: {
    CameraControls: require('./controls/CameraControls'),
    OffscreenPicker: require('./controls/OffscreenPicker')
  },
  /** @namespace ds */
  ds: {
    Alignment: require('./ds/Alignment'),
    BinaryHeap: require('./ds/BinaryHeap'),
    Index: require('./ds/Index')
  },
  /** @namespace exporters */
  exporters: {
    AJSONExporter: require('./exporters/AJSONExporter'),
    GLTFExporter: require('./exporters/GLTFExporter'),
    NRRDExporter: require('./exporters/NRRDExporter'),
    JSONExporter: require('./exporters/JSONExporter'),
    OBJMTLExporter: require('./exporters/OBJMTLExporter'),
    PLYExporter: require('./exporters/PLYExporter'),
    URDFExporter: require('./exporters/URDFExporter'),
    SceneStateExporter: require('./exporters/SceneStateExporter')
  },
  /** @namespace geo */
  geo: {
    BBox: require('./geo/BBox'),
    BVH: require('./geo/BVH'),
    ColorGrid: require('./geo/ColorGrid'),
    Distances: require('./geo/Distances'),
    GeometryUtil: require('./geo/GeometryUtil'),
    MeshHelpers: require('./geo/MeshHelpers'),
    MeshSampling: require('./geo/MeshSampling'),
    MeshAligner: require('./geo/MeshAligner'),
    OBB: require('./geo/OBB'),
    OBBFitter: require('./geo/OBBFitter'),
    OBBIntersections: require('./geo/OBBIntersections'),
    Object3DUtil: require('./geo/Object3DUtil'),
    ObjectCleaner: require('./geo/ObjectCleaner'),
    ObjectSegmentator: require('./geo/ObjectSegmentator'),
    Segments: require('./geo/Segments'),
    SemanticOBB: require('./geo/SemanticOBB'),
    Voxels: require('./geo/Voxels')
  },
  /** @namespace loaders */
  loaders: {
    HouseLoader: require('./loaders/HouseTxtLoader'),
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
    ModelInfo: require('./model/ModelInfo'),
    ModelInstance: require('./model/ModelInstance'),
    ModelVoxels: require('./model/ModelVoxels'),
    ModelInstanceVoxels: require('./model/ModelInstanceVoxels'),
    ModelUtil: require('./model/ModelUtil'),
  },
  /** @namespace nav */
  nav: {
    NavScene: require('./nav/NavScene')
  },
  /** @namespace gfx */
  gfx: {
    Camera: require('./gfx/Camera'),
    ClippingBox: require('./gfx/ClippingBox'),
    EDLPass: require('./gfx/EDLPass'),
    Lights: require('./gfx/Lights'),
    SceneSetupHelper: require('./gfx/SceneSetupHelper'),
    Renderer: require('./gfx/Renderer'),
    RendererFactory: require('./gfx/RendererFactory'),
    ViewOptimizer: require('./gfx/ViewOptimizer'),
    ViewUtils: require('./gfx/ViewUtils')
  },
  /** @namespace scene */
  scene: {
    SceneRawVoxels: require('./scene/SceneRawVoxels'),
    SceneLoader: require('./scene/SceneLoader'),
    SceneOperations: require('./scene/SceneOperations'),
    SceneState: require('./scene/SceneState'),
    SceneUtil: require('./scene/SceneUtil'),
    WssSceneLoader: require('./scene/WssSceneLoader')
  },
  /** @namespace search */
  search: {
    BasicSearchController: require('./search/BasicSearchController'),
    SolrQuerier: require('./search/SolrQuerier')
  },
  /** @namespace shape */
  shape: {
    CompositeShapeGenerator: require('./shape/CompositeShapeGenerator'),
    MissingGeometryGenerator: require('./shape/MissingGeometryGenerator'),
    ShapeGenerator: require('./shape/ShapeGenerator')
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
  /** @namespace parts */
  parts: {
    LabeledParts: require('./parts/LabeledParts'),
    Part: require('./parts/Part'),
    PartConnectivityGraph: require('./parts/PartConnectivityGraph'),
    PartGeomsGen: require('./parts/PartGeomsGen')
  },
  Colors: require('./util/Colors'),
  LabelRemap: require('./util/LabelRemap'),
  ImageUtil: require('./util/ImageUtil'),
  Timings: require('./util/Timings'),
  TaskQueue: require('./util/TaskQueue'),
  PubSub: require('./PubSub'),
  util: require('./util/util')
};
