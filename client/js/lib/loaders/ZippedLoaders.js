const ZIPLoader = require('loaders/ZIPLoader');
const _ = require('util/util');

class KMZLoader extends ZIPLoader {
  constructor(params) {
    params = _.defaults(params || {}, { regex: /^.*\.dae$/ });
    super(params);

    const scope = this;
    const colladaLoader = params.loader || new THREE.ColladaLoader();
    colladaLoader.options.loadTextureCallback = function loadTexture(basePath, relPath) {
      return scope.loadTexture(basePath, relPath);
    };
    function load(zipLoader, url, readyCallback, progressCallback, errorCallback) {
      try {
        const text = zipLoader.zip.file(url).asText();
        const parsed = colladaLoader.parse(text, url);
        readyCallback(parsed);
      } catch (err) {
        if (errorCallback) {
          console.error('Error parsing kmz', err);
          errorCallback('Error parsing kmz: ' + err);
        }
      }
    }

    colladaLoader.zippedLoad = load;

    params.loader = colladaLoader;
  }
}

class ZippedObjLoader extends ZIPLoader {
  constructor(params) {
    params = _.defaults(params || {}, { regex: /^.*\.obj$/ });
    super(params);

    const scope = this;
    const baseLoader = params.loader || new THREE.OBJLoader();
    const mtlLoader = new THREE.MTLLoader(baseLoader.manager);
    mtlLoader.load = function(url, onLoad, onProgress, onError) {
      url = scope.normalizePath(url);
      const mtlfile = scope.zip.file(url);
      if (mtlfile) {
        const text = mtlfile.asText();
        onLoad( mtlLoader.parse(text) );
      } else {
        onError('Error loading mtl ' + url + ' from zip file ' + scope.zip.path);
      }
    };
    params.loadTexture = function loadTexture(url, mapping, onLoad, onProgress, onError) {
      const texture = scope.loadTexture('', url);
      if ( mapping !== undefined ) texture.mapping = mapping;
      if (onLoad) {
        onLoad(texture);
      }
      return texture;
    };

    baseLoader.getFileLoader = function() {
      return {
        load: function(url, onLoad, onProgress, onError) {
          const text = scope.zip.file(url).asText();
          onLoad(text);
        },
        setPath: function() {}
      };
    };

    params.loader = baseLoader;
    params.mtlLoader = mtlLoader;

    baseLoader.setOptions(this.options);
    baseLoader.setMtlOptions(this.options);
  }
}

class ZippedObjMtlLoader extends ZIPLoader {
  constructor(params) {
    params = _.defaults(params || {}, { regex: /^.*\.obj$/ });
    super(params);

    const scope = this;

    const baseLoader = params.loader || new THREE.OBJMTLLoader();
    const mtlLoader = new THREE.MTLLoader(baseLoader.manager);
    mtlLoader.load = function(url, onLoad, onProgress, onError) {
      url = scope.normalizePath(url);
      const mtlfile = scope.zip.file(url);
      if (mtlfile) {
        const text = mtlfile.asText();
        onLoad( mtlLoader.parse(text) );
      } else {
        onError('Error loading mtl ' + url + ' from zip file ' + scope.zip.path);
      }
    };
    params.loadTexture = function loadTexture(url, mapping, onLoad, onProgress, onError) {
      const texture = scope.loadTexture('', url);
      if ( mapping !== undefined ) texture.mapping = mapping;
      if (onLoad) {
        onLoad(texture);
      }
      return texture;
    };

    baseLoader.getFileLoader = function() {
      return {
        load: function(url, onLoad, onProgress, onError) {
          const text = scope.zip.file(url).asText();
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
  }
}

THREE.ZIPloader = ZIPLoader;
THREE.KMZLoader = KMZLoader;
THREE.ZippedObjLoader = ZippedObjLoader;
THREE.ZippedObjMtlLoader = ZippedObjMtlLoader;