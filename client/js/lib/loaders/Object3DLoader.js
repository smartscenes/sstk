var Constants = require('Constants');
var AssetLoader = require('assets/AssetLoader');
var Materials = require('materials/Materials');
var Object3DUtil = require('geo/Object3DUtil');
var SimpleMobilityOBJPartLoader = require('loaders/SimpleMobilityOBJPartLoader');
var PartNetOBJPartLoader = require('loaders/PartNetOBJPartLoader');
var Shape2MotionOBJPartLoader = require('loaders/Shape2MotionOBJPartLoader');
var PTSLoader = require('loaders/PTSLoader');
var URDFLoader = require('loaders/URDFLoader');
var _ = require('util/util');
require('three-loaders');
var MeshoptDecoder = require('vendor/three/libs/meshopt_decoder'); // for GLTF mesh decoding

// Wrapper for THREE loaders for loading a single mesh
var Object3DLoader = function(assetManager) {
  this.assetManager = assetManager;
};

Object3DLoader.enableCompressedLoading = function(renderer) {
  const THREE_PATH = `https://unpkg.com/three@0.${THREE.REVISION}.x`;
  if (!Object3DLoader.__dracoLoader) {
    Object3DLoader.__dracoLoader = new THREE.DRACOLoader().setDecoderPath(`${THREE_PATH}/examples/js/libs/draco/gltf/`);
  }
  if (!Object3DLoader.__ktx2loader) {
    Object3DLoader.__ktx2loader = new THREE.KTX2Loader().setTranscoderPath(`${THREE_PATH}/examples/js/libs/basis/`);
    Object3DLoader.__ktx2loader.detectSupport(renderer);
  }
};

function getExtension(path) {
  var lastDot = path.lastIndexOf('.');
  if (lastDot >= 0) {
    return path.substr(lastDot+1);
  }
}

function getExtensionEx(path, ignoreExtensions) {
  var extension = getExtension(path);
  if (ignoreExtensions) {
    var p = path;
    while (_.indexOf(ignoreExtensions, extension) >= 0) {
      p = p.substr(0, p.length - extension.length-1);
      var ext2 = getExtension(p);
      if (ext2.length >= p.length) {
        return extension;
      }
      extension = ext2;
    }
  }
  return extension;
}

Object3DLoader.prototype.loadErrorFirst = function (modelinfo, callback) {
  // Load with node.js error first style callback(err, result)
  this.load(modelinfo,
      function(data) { callback(null, data); },
      function(err) { callback(err, null); }
  );
};

Object3DLoader.prototype.load = function(modelinfo, onsuccess, onerror) {
  try {
    this.__load(modelinfo, onsuccess, onerror);
  } catch (err) {
    console.error(err);
    onerror(err);
  }
};

Object3DLoader.prototype.__getProcessLoadedFn = function(options) {
  if (options && (options.skipLines || options.skipPoints || options.filterEmptyGeometries)) {
    return function(object3D) {
      const removed = [];
      if (options.skipLines) {
        removed.push(Object3DUtil.removeLines(object3D));
      }
      if (options.skipPoints) {
        removed.push(Object3DUtil.removePoints(object3D));
      }
      if (options.filterEmptyGeometries) {
        removed.push(Object3DUtil.removeEmptyGeometries(object3D, _.isPlainObject(options.filterEmptyGeometries)? options.filterEmptyGeometries : null));
      }
      const totalRemoved = _.sum(removed, list => list.length);
      if (totalRemoved > 0) {
        console.log('filter out ' + totalRemoved + ' nodes');
      }
      return object3D;
    };
  }
};

Object3DLoader.prototype.__load = function(modelinfo, onsuccess, onerror) {
  if (modelinfo.file) {
    if (modelinfo.file instanceof File) {
      if (modelinfo.format === undefined) {
        modelinfo.format = getExtensionEx(modelinfo.file.name, ['zip']);
      }
      modelinfo.isZipped = modelinfo.file.name.endsWith('.zip');
    } else if (typeof modelinfo.file === 'string') {
      if (modelinfo.format === undefined) {
        modelinfo.format = getExtensionEx(modelinfo.file, ['zip']);
      }
      modelinfo.isZipped = modelinfo.file.endsWith('.zip');
    }
  }

  var processLoaded = this.__getProcessLoadedFn(modelinfo.options);
  if (processLoaded) {
    var origOnsuccess = onsuccess;
    onsuccess = (object3D) => {
      if (object3D) {
        object3D = processLoaded(object3D);
      }
      origOnsuccess(object3D);
    };
  }

  if (modelinfo.extractType != null) {
    if (modelinfo.options && modelinfo.options.handleExtractTypes &&
        modelinfo.options.handleExtractTypes.indexOf(modelinfo.extractType) >= 0) {
      return this.__loadAndExtractModel(modelinfo, onsuccess, onerror);
    }
  }

  if (modelinfo.format === 'obj') {
    if (modelinfo.texture || (modelinfo.options && modelinfo.options.skipMtl)) {
      return this.__loadObjModel(modelinfo, onsuccess, onerror);
    } else {
      return this.__loadObjMtlModel(modelinfo, onsuccess, onerror);
    }
  } else if (!modelinfo.isZipped) {
    if (modelinfo.format === 'ply') {
      return this.__loadPlyModel(modelinfo, onsuccess, onerror);
    } else if (modelinfo.format === 'pts') {
      return this.__loadPtsModel(modelinfo, onsuccess, onerror);
    } else if (modelinfo.format === 'kmz') {
      return this.__loadKmzModel(modelinfo, onsuccess, onerror);
    } else if (modelinfo.format === 'collada' || modelinfo.format === 'dae') {
      return this.__loadColladaModel(modelinfo, onsuccess, onerror);
    } else if (modelinfo.format === 'fbx') {
        return this.__loadFbxModel(modelinfo, onsuccess, onerror);
    } else if (modelinfo.format === 'utf8') {
      return this.__loadUTF8Model(modelinfo, onsuccess, onerror);
    } else if (modelinfo.format === 'utf8v2') {
      return this.__loadUTF8v2Model(modelinfo, onsuccess, onerror);
    } else if (modelinfo.format === 'glb') {
      return this.__loadGLTFModel(modelinfo, onsuccess, onerror);
    } else if (modelinfo.format === 'gltf') {
      return this.__loadGLTFModel(modelinfo, onsuccess, onerror);
    } else if (modelinfo.format === 'urdf') {
      return this.__loadURDFModel(modelinfo, onsuccess, onerror);
    } else if (modelinfo.format === 'objparts') {
      return this.__loadObjPartsModel(SimpleMobilityOBJPartLoader, modelinfo, onsuccess, onerror);
    } else if (modelinfo.format === 'partnet_objparts') {
      return this.__loadObjPartsModel(PartNetOBJPartLoader, modelinfo, onsuccess, onerror);
    } else if (modelinfo.format === 'shape2motion_objparts') {
      return this.__loadObjPartsModel(Shape2MotionOBJPartLoader, modelinfo, onsuccess, onerror);
    } else {
      var message = (modelinfo.format == undefined) ? 'Unspecified format' : ('Unsupported format ' + modelinfo.format);
      console.warn(message);
      onerror(message);
    }
  } else {
    var message = (modelinfo.format == undefined) ? 'Unspecified format' : ('Unsupported zipped format ' + modelinfo.format);
    console.warn(message);
    onerror(message);
  }
};

Object3DLoader.prototype.__loadAndExtractModel = function(modelinfo, onsuccess, onerror) {
  var message;
  if (modelinfo.extractType === 'simple') {
    var requiredFields = ['extractType', 'sourceModelId', 'extractOperation', 'extractNodeIds'];
    var missingFields = requiredFields.filter(function(name) { return modelinfo[name] == null; });
    if (missingFields.length === 0) {
      var validOps = ['keep', 'remove'];
      var extractInfo = _.pick(modelinfo, requiredFields);
      extractInfo.extractNodeIds = extractInfo.extractNodeIds.split(';');

      if (validOps.indexOf(extractInfo.extractOperation) < 0) {
        message = 'Unsupported extractOperation: ' + extractInfo.extractOperation;
      } else {
        var sourceModelInfo = _.omit(_.cloneDeep(modelinfo), ['extractType', 'sourceModelId', 'extractOperation', 'extractNodeIds']);
        sourceModelInfo.id = modelinfo.sourceModelId;
        sourceModelInfo.fullId = this.assetManager.toFullId(sourceModelInfo.source, sourceModelInfo.id);
        this.assetManager.loadModel(sourceModelInfo, function (err, sourceModelInstance) {
          if (err) {
            onerror(err);
          } else {
            try {
              var object3d = sourceModelInstance.modelObject3D.children[0].clone();
              var extracted = Object3DUtil.extractNodes(object3d, extractInfo.extractOperation, extractInfo.extractNodeIds);
              onsuccess(extracted);
            } catch (error) {
              onerror(error);
            }
          }
        });
        return;
      }
    } else {
      message = 'Missing fields for extractType=simple: ' + missingFields.join(',');
    }
  } else {
    message = 'Unsupported extractType: ' + modelinfo.extractType;
  }
  if (message) {
    console.warn(message);
    onerror(message);
  }
};

Object3DLoader.prototype.__loadObjPartsModel = function(loaderClass, modelInfo, callback, onerror) {
  var options = _.defaults(Object.create(null), modelInfo.options || {});
  options.loadMtl = (options.loadMtl != undefined) ? options.loadMtl : modelInfo.loadMtl;
  var loader = new loaderClass({fs: Constants.sys.fs, meshPath: modelInfo.meshPath, meshFilePattern: modelInfo.meshFilePattern,
    objectLoadOptions: options, objectLoader: this });
  var supportArticulated = this.assetManager.supportArticulated;
  if (supportArticulated) {
    loader.loadArticulated(modelInfo, options, (err, res) => {
      if (res && res.articulated) {
        callback(res.articulated);
      } else if (res && res.partHierarchy) {
        callback(res.partHierarchy.root.object3D);
      } else {
        onerror(err);
      }
    });
  } else {
    loader.loadPartHierarchy(modelInfo.file, modelInfo, (err, partHierarchy) => {
      if (partHierarchy) {
        callback(partHierarchy.root.object3D);
      } else {
        onerror(err);
      }
    });
  }
};

Object3DLoader.prototype.__loadObjMtlModel = function (modelInfo, callback, onerror) {
  var objFile = modelInfo.file;
  var mtlFile = modelInfo.mtl;
  // TODO: Move this material options to be less format specific
  var side = this.assetManager.__getMaterialSide(modelInfo);
  var options = _.defaults(Object.create(null), { side: side }, modelInfo.options || {});
  this.assetManager.__updateMaterialOptions(modelInfo, options, Materials.DefaultMaterialType);

  var onLoad = function (object) {
    callback(object);
  };

  //console.log('modelInfo', modelInfo);
  options.mtl = mtlFile;
  if (options.useObjMtlLoader) {
    // TODO: Deprecate and remove
    // Use old OBJMTLLoader so we have same number of meshes as something...
    // console.log('Using old OBJMTLLoader (slow)');
    var loader = modelInfo.isZipped? new THREE.ZippedObjMtlLoader(options) : new THREE.OBJMTLLoader();
    if (modelInfo.isZipped) {
      return loader.load(objFile, onLoad, undefined, onerror);
    } else {
      return loader.load(objFile, mtlFile, options, onLoad, undefined, onerror);
    }
  } else {
    // Use new OBJLoader
    // console.log('Using new OBJLoader');
    var loader = modelInfo.isZipped? new THREE.ZippedObjLoader(options) : new THREE.OBJLoader();
    this.__updateFileLoader(loader);
    if (!modelInfo.isZipped) {
      loader.setOptions(options);
      loader.setMtlOptions(options);
    }
    return loader.load(objFile, onLoad, undefined, onerror);
  }
};

function createPointCloud(geometry, size) {
  if (geometry.index) {
    geometry.index = null;
  }
  var material = new THREE.PointsMaterial({ size: size, vertexColors: true });
  //console.log('using size', size, 'for points material', Constants.virtualUnitToMeters);
  var points = new THREE.Points(geometry, material);
  return points;
}

/**
 * Load a ply model
 * @param modelInfo Information on how to load the ply model
 * @param modelInfo.file path to load the ply file
 * @param [modelInfo.options.isPointCloud] {boolean} Whether to treat the ply as a point cloud (ignored if there is no faces, automatically a point cloud)
 * @param [modelInfo.options.isMesh] {boolean} Whether to treat the ply as a triangular mesh (ignored if there is no faces)
 * @param [modelInfo.options.pointSize] {number} What size to use for points (used when the ply is treated as a point cloud)
 * @param [modelInfo.options.computeNormals] {boolean} Whether to compute normals
 * @param [modelInfo.options.defaultMaterial] {THREE.Material} Material to use for
 * @param [modelInfo.options.defaultMaterialType] {string} String or material class for creating a default material
 * @param [modelInfo.options.materialSidedness] {string|int} Should the material be front/back/double sided.
 * @param [modelInfo.options.propertyNameMapping] {Map<string,string>} Mapping of custom property names to standard property names
 * @param [modelInfo.options.customFaceAttributes] {string[]} Array of custom face attributes to track
 * @param [modelInfo.options.customVertexAttributes] {string[]} Array of custom vertex attributes to track
 * @param callback
 * @param onerror
 * @private
 */
Object3DLoader.prototype.__loadPlyModel = function (modelInfo, callback, onerror) {
  // Tested to work for ASCII and BINARY ply files
  var plyFile = modelInfo.file;
  var options = modelInfo.options || {};
  options = _.defaults(Object.create(null), options, _.pick(modelInfo,
    ['isPointCloud', 'isMesh', 'pointSize', 'computeNormals', 'defaultMaterial',
    'defaultMaterialType', 'propertyNameMapping', 'customFaceAttributes', 'customVertexAttributes']));
  console.log('got options', options);
  // TODO: Move more of this logic to be less format specific
  // TODO: Check modelInfo use vertex colors
  var materialType = options.defaultMaterialType || THREE.MeshBasicMaterial;
  if (_.isString(materialType)) {
    materialType = Materials.getMaterialType(materialType);
  }
  var side = this.assetManager.__getMaterialSide(modelInfo);
  var vertexColorMaterial = new materialType(
    { name: 'vertexColors', vertexColors: true, side: side });
  var material = (options.defaultMaterial) ? options.defaultMaterial : vertexColorMaterial;
  var computeNormals = options.computeNormals;
  var loader = new THREE.PLYLoader({
    computeNormals: computeNormals,
    propertyNameMapping: options.propertyNameMapping,
    customFaceAttributes: options.customFaceAttributes,
    customVertexAttributes: options.customVertexAttributes
  });
  var size = (options.pointSize != null)? options.pointSize : 1; // TODO: Have reasonable point size
  var onLoad = function (geometry) {
    if (geometry.index) {
      if (options.isPointCloud) {
        if (options.isMesh) {
          var points = createPointCloud(geometry.clone(), size);
          var object = new THREE.Object3D();
          var mesh = new THREE.Mesh(geometry, material);
          object.add(points);
          object.add(mesh);
          callback(object);
        } else {
          var points = createPointCloud(geometry, size);
          callback(points);
        }
      } else {
        var mesh = new THREE.Mesh(geometry, material);
        callback(mesh);
      }
    } else {
      // NO faces!  TODO: have reasonable size....
      var points = createPointCloud(geometry, size);
      callback(points);
    }
  };
  this.assetManager.assetLoader.load(plyFile, 'arraybuffer',
    function (data) {
      onLoad(loader.parse(data));
    }, undefined, onerror);
};

Object3DLoader.prototype.__loadPtsModel = function (modelInfo, callback, onerror) {
  // Tested to work for ASCII and BINARY ply files
  var ptsFile = modelInfo.file;
  var options = modelInfo.options || {};
  options = _.defaults(Object.create(null), options, _.pick(modelInfo,
    ['pointSize', 'computeNormals', 'fields']));
  //console.log('got options', options);
  var loader = new PTSLoader({
    computeNormals: options.computeNormals,
    fields: options.fields || ['x','y','z', 'red', 'green', 'blue']
  });
  var size = (options.pointSize != null)? options.pointSize : 0.01; // TODO: Have reasonable point size
  var onLoad = function (geometry) {
    var points = createPointCloud(geometry, size);
    callback(points);
  };
  this.assetManager.assetLoader.load(ptsFile, 'utf8',
    function (data) {
      onLoad(loader.parse(data));
    }, undefined, onerror);
};


Object3DLoader.prototype.__loadObjModel = function (modelInfo, callback, onerror) {
  var objFile = modelInfo.file;
  var textureFile = modelInfo.texture;
  var side = this.assetManager.__getMaterialSide(modelInfo);
  var material;
  if (textureFile) {
    material = new Materials.DefaultMaterialType({
      map: Object3DUtil.loadTexture(textureFile), side: side
    });
  } else if (modelInfo.options && modelInfo.options.defaultMaterial) {
    material = modelInfo.options.defaultMaterial;
  } else {
    material = new Materials.DefaultMaterialType({ side: side });
  }

  // model
  var loader = modelInfo.isZipped? new THREE.ZippedObjLoader() : new THREE.OBJLoader();
  var onload = function (object) {
    Object3DUtil.setMaterial(object, material, Object3DUtil.MaterialsAll);
    callback(object);
  };
  return loader.load(objFile, onload, undefined, onerror);
};

Object3DLoader.prototype.__updateFileLoader = function(loader) {
  if (Constants.isBrowser) {
    loader.getFileLoader = function(params) {
      var ldr = new AssetLoader({ manager: loader.manager });
      return {
        load: function(url, onLoad, onProgress, onError) {
          return ldr.load(url, params? params.responseType : null, onLoad, onProgress, onError);
        }
      };
    };
  }
};

// Kmz = zipped collada model
Object3DLoader.prototype.__loadKmzModel = function (modelInfo, callback, onerror) {
  // var loader = new THREE.KMZLoader(modelInfo.options);
  var loader = new THREE.KMZLoader(_.pick(modelInfo.options || {}, ['textureCacheOpts']));
  return this.__loadColladaOrKmzModel(loader, modelInfo, callback, onerror);
};

Object3DLoader.prototype.__loadColladaModel = function (modelInfo, callback, onerror) {
  var loader = new THREE.ColladaLoader();
  this.__updateFileLoader(loader);
  return this.__loadColladaOrKmzModel(loader, modelInfo, callback, onerror);
};

Object3DLoader.prototype.__loadColladaOrKmzModel = function (loader, modelInfo, callback, onerror) {
  var scope = this;
  function colladaReady(collada) {
    var object = collada.scene;
    // Copy out some collada info into the userData so it is kept
    Object3DUtil.traverse(object, function (node) {
      if (node.userData.hasOwnProperty('colladaId')) {
        // Use collada id as the id
        node.userData.id = node.userData.colladaId;
      } else if (node !== object) {
        console.warn('Node without colladaId', node);
      }
      if (node.hasOwnProperty('layer') && node.layer != null && node.layer !== '') {
        node.userData.layer = node.layer;
      }
      return true;
    });
    // TODO: Improve control over whether the collada scale is used
    if (scope.useColladaScale || (scope.useColladaScale == null && modelInfo.options && modelInfo.options.applyScale)) {
      // Assumes to be scaled with collada to meters
      modelInfo.formatOptions['applyScale'] = true;
      modelInfo.unit = 1.0;
    } else {
      // Unset any object scale that was set by the ColladaLoader so we can set and scale it in our framework
      object.scale.set(1, 1, 1);
      if (!modelInfo.unit) {
        modelInfo.unit = collada.metadata.unit;
      }
    }
    //console.log('Unit for model ' + modelInfo.fullId + ': ' + modelInfo.unit);
    Object3DUtil.flipMirroredNodes(object);
    callback(object);
  }

  var file = modelInfo.file;
  modelInfo.formatOptions = {};
  this.assetManager.__updateMaterialOptions(modelInfo, loader.options, Materials.DefaultMaterialType);
  // TODO: Beware some weird automatic setting of convertUpAxis
  if (scope.convertUpAxis != null) {
    loader.options.convertUpAxis = scope.convertUpAxis;
  } else if (modelInfo.options && modelInfo.options.convertUpAxis != null) {
    loader.options.convertUpAxis = modelInfo.options.convertUpAxis;
  } else {
    if (!modelInfo.source) {
      loader.options.convertUpAxis = true;
    } else {
      loader.options.convertUpAxis = false;
    }
  }
  modelInfo.formatOptions['applyUp'] = loader.options.convertUpAxis;
  return loader.load(file, colladaReady, undefined, onerror);
};

Object3DLoader.prototype.__loadFbxModel = function (modelInfo, callback, onerror) {
  var loader = new THREE.FBXLoader();
  return loader.load(modelInfo.file, function (object) {
    callback(object);
  }, undefined, onerror);
};

Object3DLoader.prototype.__loadUTF8Model = function (modelInfo, callback, onerror) {
  var file = modelInfo.file;
  var texture = modelInfo.texture;
  var metadata = modelInfo.metadata;
  var loader = new THREE.UTF8Loader();
  var side = this.assetManager.__getMaterialSide(modelInfo);
  return loader.load(file, function (geometry) {
    var material = new Materials.DefaultMaterialType({
      map: Object3DUtil.loadTexture(texture),
      side: side
    });

    var object = new THREE.Mesh(geometry, material);
    callback(object);
  }, onerror, metadata);
};

Object3DLoader.prototype.__loadUTF8v2Model = function (modelInfo, callback, onerror) {
  var loader = new THREE.UTF8Loader();
  var options = {};
  this.assetManager.__updateMaterialOptions(modelInfo, options, Materials.DefaultMaterialType)
  return loader.load(modelInfo.file, function (object) {
    callback(object);
  }, onerror, _.defaults(Object.create(null), options, modelInfo.options));
};

Object3DLoader.prototype.__loadGLTFModel = function (modelInfo, callback, onerror) {
  var loader = new THREE.GLTFLoader()
    .setDRACOLoader( Object3DLoader.__dracoLoader )
    .setKTX2Loader( Object3DLoader.__ktx2loader )
    .setMeshoptDecoder( MeshoptDecoder );

  this.__updateFileLoader(loader);
  if (!_.isString(modelInfo.file)) {
    loader.setPath('');
  }
  var options = _.defaults({}, modelInfo.options || {});
  options.computeNormals = (options.computeNormals != undefined) ? options.computeNormals : modelInfo.computeNormals;
  this.assetManager.__updateMaterialOptions(modelInfo, options, Materials.DefaultMaterialType);
  loader.setOptions(options);
  return loader.load(modelInfo.file, function (object) {
    //console.log(object);
    callback(object.scene);
  }, function(progress) {}, onerror, modelInfo.options);
};

Object3DLoader.prototype.__loadURDFModel = function (modelInfo, callback, onerror) {
  var manager = new THREE.LoadingManager();
  var loader = new URDFLoader(manager);
  var scope = this;
  return loader.load(modelInfo.file, function (object) {
    callback(object);
  }, {
    loadMeshCb: function(path, manager, done) {
      scope.assetManager.__loadObject3D({ file: path }, done, function(err) {
        done(null, err);
        onerror(err);
      });
    }
  });
};

module.exports = Object3DLoader;