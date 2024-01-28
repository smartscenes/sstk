// Loaders under the THREE name space

define(["loaders/MTLLoader",
        "loaders/OBJLoader",
        "loaders/OBJMTLLoader",
        "loaders/ColladaLoader",
        "loaders/PLYLoader",
        "loaders/UTF8Loader",
        "loaders/GLTFLoader",
        "vendor/three/loaders/DRACOLoader",          // for mesh/pcd compression https://threejs.org/docs/#examples/en/loaders/DRACOLoader
        "vendor/three/loaders/KTX2Loader",           // for GPU texture compression https://threejs.org/docs/#examples/en/loaders/KTX2Loader
        "vendor/three/loaders/HDRCubeTextureLoader",
        "vendor/three/loaders/RGBELoader",
        "loaders/FBXLoader",
        "loaders/ZippedLoaders"], function () {
});
