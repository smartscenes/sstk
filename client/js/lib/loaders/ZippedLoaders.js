var ZIPLoader = require('loaders/ZIPLoader');
var _ = require('util');

THREE.ZIPloader = ZIPLoader;

THREE.ZippedJsonLoader = function (params) {
  params = _.defaults(params || {}, { regex: /^.*\.js$/ });
  var baseLoader = params.loader || new THREE.JSONLoader();

  function load ( ziploader, url, readyCallback, progressCallback, errorCallback ) {
    var text = ziploader.zip.file(url).asText();
    var json = JSON.parse(text);
    var result = baseLoader.parse(json);
    var zmesh = new THREE.Mesh(result.geometry, new THREE.MeshFaceMaterial(result.materials));
    readyCallback(zmesh);
  }

  baseLoader.zippedLoad = load;

  params.loader = baseLoader;
  ZIPLoader.call(this, params);
};

THREE.ZippedJsonLoader.prototype = Object.create(ZIPLoader.prototype);
THREE.ZippedJsonLoader.prototype.constructor = THREE.ZippedJsonLoader;

THREE.KMZLoader = function(params) {
  params = _.defaults(params || {}, { regex: /^.*\.dae$/ });

  var scope = this;
  var colladaLoader = params.loader || new THREE.ColladaLoader();
  colladaLoader.options.loadTextureCallback = function loadTexture(basePath, relPath) {
    return scope.loadTexture(basePath, relPath);
  };
  function load( zipLoader, url, readyCallback, progressCallback, errorCallback ) {
    try {
      var text = zipLoader.zip.file(url).asText();
      var xmlParser = new DOMParser();
      var responseXML = xmlParser.parseFromString(text, "application/xml");
      colladaLoader.parse(responseXML, readyCallback, url);
    } catch (err) {
      if (errorCallback) {
        errorCallback('Error parsing kmz: ' + err);
      }
    }
  }

  colladaLoader.zippedLoad = load;

  params.loader = colladaLoader;
  ZIPLoader.call(this, params);
};

THREE.KMZLoader.prototype = Object.create(ZIPLoader.prototype);
THREE.KMZLoader.prototype.constructor = THREE.KMZLoader;

THREE.ZippedObjLoader = function(params) {
  params = _.defaults(params || {}, { regex: /^.*\.obj$/ });

  var scope = this;

  var baseLoader = params.loader || new THREE.OBJLoader();
  var mtlLoader = new THREE.MTLLoader(baseLoader.manager);
  mtlLoader.load = function(url, onLoad, onProgress, onError) {
    var text = scope.zip.file(url).asText();
    onLoad( mtlLoader.parse(text) );
  };
  params.loadTexture = function loadTexture(url, mapping, onLoad, onProgress, onError) {
    var texture = scope.loadTexture('', url);
    if ( mapping !== undefined ) texture.mapping = mapping;
    if (onLoad) {
      onLoad(texture);
    }
    return texture;
  };

  baseLoader.getFileLoader = function() {
    return {
      load: function(url, onLoad, onProgress, onError) {
        var text = scope.zip.file(url).asText();
        onLoad(text);
      },
      setPath: function() {}
    };
  };

  params.loader = baseLoader;
  params.mtlLoader = mtlLoader;
  ZIPLoader.call(this, params);
  baseLoader.setOptions(this.options);
  baseLoader.setMtlOptions(this.options);
};

THREE.ZippedObjLoader.prototype = Object.create(ZIPLoader.prototype);
THREE.ZippedObjLoader.prototype.constructor = THREE.ZippedObjLoader;

THREE.ZippedObjMtlLoader = function(params) {
  params = _.defaults(params || {}, { regex: /^.*\.obj$/ });

  var scope = this;

  var baseLoader = params.loader || new THREE.OBJMTLLoader();
  var mtlLoader = new THREE.MTLLoader(baseLoader.manager);
  mtlLoader.load = function(url, onLoad, onProgress, onError) {
    var text = scope.zip.file(url).asText();
    onLoad( mtlLoader.parse(text) );
  };
  params.loadTexture = function loadTexture(url, mapping, onLoad, onProgress, onError) {
    var texture = scope.loadTexture('', url);
    if ( mapping !== undefined ) texture.mapping = mapping;
    if (onLoad) {
      onLoad(texture);
    }
    return texture;
  };

  baseLoader.getFileLoader = function() {
    return {
      load: function(url, onLoad, onProgress, onError) {
        var text = scope.zip.file(url).asText();
        onLoad(text);
      },
      setPath: function() {}
    };
  };
  baseLoader.load = function(url, onLoad, onProgress, onError ) {

    baseLoader.loadWithMtl(url, scope.options.mtl, scope.options, onLoad, onProgress, onError);
  };

  params.loader = baseLoader;
  params.mtlLoader = mtlLoader;
  ZIPLoader.call(this, params);
};

THREE.ZippedObjMtlLoader.prototype = Object.create(ZIPLoader.prototype);
THREE.ZippedObjMtlLoader.prototype.constructor = THREE.ZippedObjMtlLoader;