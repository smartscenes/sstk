define(["jszip-utils",
  "jszip"], function (JSZipUtils, JSZip) {

  THREE.ZIPLoader = function(params) {
    var options = params;
    var zip = null;

    function load ( url, readyCallback, progressCallback, errorCallback ) {
      JSZipUtils.getBinaryContent(url, function(err, data) {
        if(err) {
          throw err; // or handle err
        }

        var zip = new JSZip(data);
        var regex = options.regex;
        var mainFile = null;
        for (var filename in zip.files) {
          var match = regex.exec(filename);
          if (match) {
            mainFile = filename;
            break;
          }
        }

        if (mainFile) {
          var loader = options.loader;
          loader.zippedLoad(zip, mainFile, readyCallback, progressCallback, errorCallback);
        } else {
          console.error("Cannot find file matching regex " + regex + " in zip: " + url);
        }
      });
    }

    return {
      load: load,
      options: options
    };
  };

  // TODO: Handle zipped materials
  THREE.ZippedJsonLoader = function () {
    var baseLoader = new THREE.JSONLoader();

    function load ( zip, url, readyCallback, progressCallback ) {
      var text = zip.file(url).asText();
      var json = JSON.parse(text);
      var result = baseLoader.parse(json);
      var zmesh = new THREE.Mesh( result.geometry, new THREE.MeshFaceMaterial( result.materials ) );
      readyCallback(zmesh);
    }

    baseLoader.zippedLoad = load;

    return baseLoader;
  };

});
