var Constants = require('Constants');
var AssetLoader = require('assets/AssetLoader');
var Materials = require('materials/Materials');
var Object3DUtil = require('geo/Object3DUtil');
var PartNetOBJPartLoader = require('loaders/OBJPartLoader');
var Shape2MotionOBJPartLoader = require('loaders/Shape2MotionOBJPartLoader');
var P5DTextureLoader = require('loaders/P5DTextureLoader');
var URDFLoader = require('loaders/URDFLoader');
var _ = require('util/util');
require('three-loaders');

// Wrapper for THREE loaders for loading a single mesh
var Object3DLoader = function(assetManager) {
  this.assetManager = assetManager;
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

  if (modelinfo.extractType != null) {
    if (modelinfo.options && modelinfo.options.handleExtractTypes &&
        modelinfo.options.handleExtractTypes.indexOf(modelinfo.extractType) >= 0) {
      return this.__loadAndExtractModel(modelinfo, onsuccess, onerror);
    }
  }

  if (modelinfo.format === 'three.js') {
    return this.__loadThreeJsModel(modelinfo, onsuccess, onerror);
  } else if (modelinfo.format === 'obj') {
    if (modelinfo.texture || (modelinfo.options && modelinfo.options.skipMtl)) {
      return this.__loadObjModel(modelinfo, onsuccess, onerror);
    } else {
      return this.__loadObjMtlModel(modelinfo, onsuccess, onerror);
    }
  } else if (!modelinfo.isZipped) {
    if (modelinfo.format === 'ply') {
      return this.__loadPlyModel(modelinfo, onsuccess, onerror);
    } else if (modelinfo.format === 'kmz') {
      return this.__loadKmzModel(modelinfo, onsuccess, onerror);
    } else if (modelinfo.format === 'p5d') {
      return this.__loadP5dModel(modelinfo, onsuccess, onerror);
    } else if (modelinfo.format === 'collada' || modelinfo.format === 'dae') {
      return this.__loadColladaModel(modelinfo, onsuccess, onerror);
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
    } else if (modelinfo.format === 'objparts' || modelinfo.format === 'partnet_objparts') {
      return this.__loadPartNetObjPartsModel(modelinfo, onsuccess, onerror);
    } else if (modelinfo.format === 'shape2motion_objparts') {
      return this.__loadShape2MotionObjPartsModel(modelinfo, onsuccess, onerror);
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

Object3DLoader.prototype.__loadPartNetObjPartsModel = function(modelInfo, callback, onerror) {
  var options = _.defaults(Object.create(null), modelInfo.options || {});
  options.loadMtl = (options.loadMtl != undefined) ? options.loadMtl : modelInfo.loadMtl;
  var loader = new PartNetOBJPartLoader({fs: Constants.sys.fs, meshPath: modelInfo.meshPath, objectLoadOptions: options, objectLoader: this });
  var supportArticulated = this.assetManager.supportArticulated;
  loader.load(modelInfo.file, function(err, partHierarchy) {
    if (err) {
      onerror(err);
    } else {
      if (modelInfo.mobility && supportArticulated) {
        loader.loadMobility(modelInfo.mobility, (err2, articulations) => {
          if (err2) {
            console.error('Error loading mobility', err2);
            callback(partHierarchy.root.object3D);
          } else {
            var articulated = loader.createArticulated(articulations, partHierarchy);
            callback(articulated);
          }
        });
      } else {
        callback(partHierarchy.root.object3D);
      }
    }
  }, options);
};

Object3DLoader.prototype.__loadShape2MotionObjPartsModel = function(modelInfo, callback, onerror) {
  var ArticulatedObject = require('articulations/ArticulatedObject');
  var options = _.defaults(Object.create(null), modelInfo.options || {});
  options.loadMtl = (options.loadMtl != undefined) ? options.loadMtl : modelInfo.loadMtl;
  var loader = new Shape2MotionOBJPartLoader({fs: Constants.sys.fs, objectLoadOptions: options, objectLoader: this} );
  loader.load(modelInfo.file, function(err, partHierarchy) {
    if (err) {
      onerror(err);
    } else {
      // non articulated version: partHierarchy.root.object3D
      var articulated = new ArticulatedObject(null, null, partHierarchy);
      //console.log(articulated);
      callback(articulated);
    }
  }, options);
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
  if (options.preserveMeshes == undefined || options.preserveMeshes) {
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
  var material = new THREE.PointsMaterial({ size: size, vertexColors: THREE.VertexColors });
  //console.log('using size', size, 'for points material', Constants.virtualUnitToMeters);
  var points = new THREE.Points(geometry, material);
  return points;
}

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
    { name: 'vertexColors', vertexColors: THREE.VertexColors, side: side });
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

Object3DLoader.prototype.__loadThreeJsModel = function (modelInfo, callback, onerror) {
  var file = modelInfo.file;
  // model
  if (file.endsWith('.zip')) {
    var zipLoader = new THREE.ZippedJsonLoader();
    var onload = function (object) {
      callback(object);
    };
    zipLoader.load(file, onload);
  } else {
    var loader = new THREE.LegacyJSONLoader();
    loader.setResourcePath(modelInfo.texturePath || modelInfo.materialBase);
    var onload = function (geometry, materials) {
      var mesh = new THREE.Mesh(geometry, new THREE.MultiMaterial(materials));
      callback(mesh);
    };
    return loader.load(file, onload, undefined, onerror);
  }
};

Object3DLoader.prototype.__loadP5dModel = function (modelInfo, callback, onerror) {
  var loader = new P5DTextureLoader();
  var scope = this;
  if (this.assetManager.autoLoadVideo) {
    loader.loadVideoTexture = function (path) {
      return scope.loadVideoTexture(path);
    };
  }
  var newCallback = function (object3D) {
    var meshes = Object3DUtil.getMeshList(object3D);
    for (var i = 0; i < meshes.length; i++) {
      var mesh = meshes[i];
      //var objectType = 'unknown';
      var config = {};
      loader.updateMaterials(mesh, config);
    }
    if (modelInfo.category) {
      if (((modelInfo.category.indexOf('hanging_kitchen_cabinet') >= 0) ||
        (modelInfo.category.indexOf('range_oven_with_hood') >=0) ||
        (modelInfo.category.indexOf('range_hood') >=0)) &&
        (modelInfo.category.indexOf('kitchen_cabinet') < 0)) {
        modelInfo.category = _.concat(['kitchen_cabinet'], modelInfo.category);
      }
    }
    callback(object3D);
  };
  if (modelInfo.file.endsWith('.obj')) {
    return this.__loadObjMtlModel(modelInfo, newCallback, onerror);
  } else {
    return this.__loadThreeJsModel(modelInfo, newCallback, onerror);
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
  return this.__loadColladaOrKmzModel(loader, modelInfo, callback, onerror);
};

Object3DLoader.prototype.__loadColladaOrKmzModel = function (loader, modelInfo, callback, onerror) {
  var scope = this;
  function colladaReady(collada) {
    var object = collada.scene;
    // Copy out some collada info into the userData so it is kept
    Object3DUtil.traverse(object, function (node) {
      if (!node.hasOwnProperty('userData')) {
        node['userData'] = {};
      }
      if (node.hasOwnProperty('colladaId')) {
        // Use collada id as the id
        node.userData.id = node.colladaId;
      } else if (node instanceof THREE.Mesh) {
        if (node.geometry.hasOwnProperty('colladaId')) {
          node.userData.id = node.geometry.colladaId;
        }
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
        modelInfo.unit = collada.dae.unit;
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
  var skipLines = _.get(modelInfo, ['options', 'skipLines']);
  if (skipLines != undefined) {
    loader.options.skipLines = skipLines;
  }
  return loader.load(file, colladaReady, undefined, onerror);
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
  var side = this.assetManager.__getMaterialSide(modelInfo);
  return loader.load(modelInfo.file, function (object) {
    callback(object);
  }, onerror, _.defaults(Object.create(null), { side: side }, modelInfo.options));
};

Object3DLoader.prototype.__loadGLTFModel = function (modelInfo, callback, onerror) {
  var loader = new THREE.GLTFLoader();
  if (Constants.isBrowser) {
    loader.getFileLoader = function(responseType) {
      var ldr = new AssetLoader({ manager: loader.manager });
      return {
        load: function(url, onLoad, onProgress, onError) {
          return ldr.load(url, responseType, onLoad, onProgress, onError);
        }
      };
    };
  }
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