var Constants = require('Constants');
var SceneState = require('scene/SceneState');
var SceneLoader = require('scene/SceneLoader');
var Model = require('model/Model');
var Room = require('objects/Room');
var Materials = require('materials/Materials');
var Object3DUtil = require('geo/Object3DUtil');
var async = require('async');

function Front3DSceneLoader(params) {
  SceneLoader.call(this, params);
  this.defaultSource = '3dfModel';
  this.textureSource = '3dfTexture';
  this.loadNormalizedModels = false;  // Whether to load the normalized models
  this.useProxyBBox = false; // Whether to use bounding box as proxy for missing models
  this.ensureBBoxScale = false; // Whether to ensure the scaling of the model based on the bbox
  this.bboxSizeField = 'bbox'; // 'size' or 'bbox' (used if ensureBBoxScale is set)
}

Front3DSceneLoader.prototype = Object.create(SceneLoader.prototype);
Front3DSceneLoader.prototype.constructor = Front3DSceneLoader;

Front3DSceneLoader.prototype.load = function (url, onLoad, onProgress, onError) {
  var scope = this;
  var loader = new THREE.FileLoader(scope.manager);
  //loader.setCrossOrigin(this.crossOrigin);
  return loader.load(url, function (text) {
    var json = JSON.parse(text);
    scope.parse(json, onLoad, url);
  }, onProgress, onError);
};

function setPosRotScale(object3D, json, multiplyScale) {
  var rotation = Object3DUtil.toQuaternion(json.rot);
  var scale = Object3DUtil.toVector3(json.scale);
  var position = Object3DUtil.toVector3(json.pos);
  if (rotation) {
    object3D.quaternion.copy(rotation);
  } else {
    console.warn('Missing rotation', json.type, json.instanceid);
  }
  if (scale) {
    if (multiplyScale) {
      object3D.scale.multiply(scale);
    } else {
      object3D.scale.copy(scale);
    }
  } else {
    console.warn('Missing scale', json.type, json.instanceid);
  }
  if (position) {
    object3D.position.copy(position, json.type, json.instanceid);
  } else {
    console.warn('Missing position', json.type, json.instanceid);
  }
}

Front3DSceneLoader.prototype.__parseRoom = function (sceneState, json, context) {
  var room = new Room(json.instanceid);
  room.userData.roomType = json.type;
  setPosRotScale(room, json);
  if (json.children) {
    for (var i = 0; i < json.children.length; i++) {
      var childJson = json.children[i];
      var asset = context.uidToAsset[childJson.ref];
      // replace_jid indicate that this model was replaced (already reflected in loaded asset) and replace_bbox
      if (asset) {
        var node;
        if (asset.object3D) {
          // ModelInstance
          asset = asset.clone();
          node = asset.object3D;
          sceneState.addObject(asset, false);
          setPosRotScale(node, childJson, true);
        } else {
          node = new THREE.Object3D();
          node.add(asset);
          node.name = asset.userData.type;
          node.userData.type = asset.userData.type;
          sceneState.addExtraObject(node, true);
          setPosRotScale(node, childJson);
        }
        room.add(node);
        node.userData.id = childJson.instanceid;
        node.userData.roomId = room.userData.id;
      } else {
        console.warn('Cannot find asset for ', childJson);
      }
    }
  }
  return room;
};

Front3DSceneLoader.prototype.__parseScene = function (sceneState, json, context) {
  var scene = sceneState.scene;
  setPosRotScale(scene, json);
  for (var i = 0; i < json.room.length; i++) {
    var room = this.__parseRoom(sceneState, json.room[i], context);
    scene.add(room);
  }
  return scene;
};

Front3DSceneLoader.prototype.__createMaterial = function(json, context) {
  var color = json.color.map( c => c/255);
  var rgb = new THREE.Color( color[0], color[1], color[2]);
  var textureMap = null; // TODO
  var normalMap = null;  // TODO
  if (json.jid && json.jid.length > 0) {
    if (this.assetManager.getAssetInfo(this.textureSource +'.' + json.jid)) {
      var texturePath = this.assetManager.getTexturePath(this.textureSource, json.jid);
      if (texturePath) {
        textureMap = this.assetManager.getTexture(texturePath);
      }
    } else {
      console.warn('Unknown texture', this.textureSource, json.jid);
    }
  }
  var material = Materials.createMaterial({
    type: 'standard',
    color: rgb,
    opacity: color[3],
    map: textureMap,
    normalMap: normalMap
  });
  context.uidToAsset[json.uid] = material;
  return material;
};

Front3DSceneLoader.prototype.__createGeometry = function(json) {
  var geom = new THREE.BufferGeometry();
  var xyz = new THREE.Float32BufferAttribute(json.xyz, 3);
  geom.setAttribute('position', xyz);
  var normal = new THREE.Float32BufferAttribute(json.normal, 3);
  geom.setAttribute('normal', normal);
  var uv = new THREE.Float32BufferAttribute(json.uv, 2);
  geom.setAttribute('uv', uv);
  if (json.xyz.length/3 < 65536) {
    geom.setIndex(new THREE.Uint16BufferAttribute(json.faces, 1));
  } else {
    geom.setIndex(new THREE.Uint32BufferAttribute(json.faces, 1));
  }
  geom.groups[0] = { start: 0, count: json.faces.length, index: 0 };   //very important!
  geom.computeBoundingSphere();
  return geom;
};

Front3DSceneLoader.prototype.__createMesh = function(json, context) {
  var geometry = this.__createGeometry(json);
  var material = context.uidToAsset[json.material];
  var mesh = new THREE.Mesh(geometry, material);
  mesh.userData.type = json.type;
  mesh.name = json.type;
  if (json.type.indexOf('Ceiling') >= 0) {
    mesh.userData.type = 'Ceiling';
  }
  return mesh;
};

Front3DSceneLoader.prototype.__loadMaterials = function(list, context) {
  var materials = [];
  for (var i = 0; i < list.length; i++) {
    var material = this.__createMaterial(list[i], context);
    materials.push(material);
    context.uidToAsset[list[i].uid] = material;
  }
  return materials;
};

Front3DSceneLoader.prototype.__loadMeshes = function (list, context) {
  var meshes = [];
  for (var i = 0; i < list.length; i++) {
    var mesh = this.__createMesh(list[i], context);
    meshes.push(mesh);
    context.uidToAsset[list[i].uid] = mesh;
  }
  return meshes;
};

Front3DSceneLoader.prototype.__loadModelFromJson = function(json, callback) {
  var bboxSize = json[this.bboxSizeField];
  if (bboxSize && bboxSize[0].length) {
    bboxSize = bboxSize[0];
  }
  if (json.valid) {
    var modelFormat = (this.loadNormalizedModels)? 'normalized' : null;
    this.assetManager.getModelInstance(this.defaultSource, json.jid,
      (modelInstance) => {
        if (this.ensureBBoxScale && bboxSize) {
          var object3D = modelInstance.getObject3D('Model');
          var bbox = Object3DUtil.computeBoundingBoxLocal(object3D);
          var bbdims = bbox.dimensions();
          var scale = new THREE.Vector3(bboxSize[0], bboxSize[2], bboxSize[1]);
          scale.divide(bbdims);
          object3D.scale.copy(scale);
          console.log('rescale', json.jid, bbdims.toArray(), bboxSize, scale.toArray());
        }
        callback(null, modelInstance);
      },
      (err) => {
        console.warn('Error loading model ' + json.jid, err);
        callback(null, null);
      },
      { defaultFormat: modelFormat }
    );
  } else {
    if (this.useProxyBBox && bboxSize) {
      var boxGeom = new THREE.BoxBufferGeometry(bboxSize[0], bboxSize[2], bboxSize[1]);
      var mesh = new THREE.Mesh(boxGeom, Object3DUtil.TransparentMat);
      mesh.position.fromArray(bboxSize);
      mesh.position.divideScalar(2);
      var source = this.defaultSource;
      var model = new Model(mesh, { id: json.jid, fullId: source + '.' + json.jid,
        source: source, unit: 1, category: json.category? [json.category] : undefined, isBox: true });
      callback(null, model.newInstance(false));
    } else {
      callback();
    }
  }
};

Front3DSceneLoader.prototype.__loadModels = function(list, context, callback) {
  var scope = this;
  async.mapLimit(list, Constants.MAX_ASYNC_REQS, function(json, cb) {
    scope.__loadModelFromJson(json, cb);
  }, function(err, results) {
    for (var i = 0; i < results.length; i++) {
      if (results[i]) {
        const json = list[i];
        context.uidToAsset[json.uid] = results[i];
      }
    }
    callback();
  });
};

Front3DSceneLoader.prototype.parse = function (json, callback, url) {
  // uid
  // design_version
  // code_version
  // north_vector
  // furniture
  // mesh
  // material
  // extension
  // scene

  var context = {
    json: json,
    uidToAsset: {}
  };
  context.meshes = this.__loadMeshes(json.mesh, context);
  context.materials = this.__loadMaterials(json.material, context);
  var sceneState = new SceneState(null, null);
  this.__loadModels(json.furniture, context, () => {
    this.__parseScene(sceneState, json.scene, context, callback);
    callback(sceneState);
  });
};

module.exports = Front3DSceneLoader;