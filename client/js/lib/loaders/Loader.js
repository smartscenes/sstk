class Loader extends THREE.Loader {
  constructor(params) {
    const manager = ( params ) ? params.manager : undefined;
    super(manager);
    this.options = {};
  }

  setOptions(options) {
    this.options = options;
  }

  getFileLoader(options) {
    const loader =  new THREE.FileLoader(this.manager);
    if (options && options.responseType != null) {
      loader.setResponseType(options.responseType);
    } else {
      // (default utf8)?
      loader.setResponseType('text');
    }
    if (options && options.path != null) {
      loader.setPath(options.path);
    }
    loader.setRequestHeader( this.requestHeader );
    loader.setWithCredentials( this.withCredentials );
    return loader;
  }

  // AXC: Refactor try parse out of load function
  __tryParse(text, onParse, onError, url) {
    const debug = this.options && this.options.debug;
    const parseLabel = 'parse';
    if (debug) {
      console.time(parseLabel);
    }
    try {
      const res = onParse(text);
      if (debug) {
        console.timeEnd(parseLabel);
      }
      return res;
    } catch (err) {
      if (debug) {
        console.timeEnd(parseLabel);
      }
      if ( onError ) {
        onError(err);
      } else {
        console.error(err);
      }
      this.manager.itemError( url );
    }
  }

  __tryParseAndLoad(text, onParse, onLoad, onError, url) {
    const res = this.__tryParse(text, onParse, onError, url);
    if (res) {
      onLoad(res);
    }
  }

  __doLoad(loader, url, onParse, onLoad, onProgress, onError) {
    const scope = this;
    const debug = this.options && this.options.debug;
    const loadLabel = 'load';
    if (debug) {
      console.time(loadLabel);
    }
    loader.load( url, function ( data ) {
      if (debug) {
        console.timeEnd(loadLabel);
      }
      const res = scope.__tryParse(data, onParse, onError, url);
      if (res) {
        onLoad(res);
      }
    }, onProgress, function(err) {
      if (debug) {
        console.timeEnd(loadLabel);
      }
      onError(err);
    });
  }

}

module.exports = Loader;