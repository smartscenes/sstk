'use strict';

var LocalFileLoader = function (manager) {
  this.manager = (manager !== undefined) ? manager : THREE.DefaultLoadingManager;
};

LocalFileLoader.prototype = {

  constructor: LocalFileLoader,

  load: function (file, encodingType, onLoad, onProgress, onError) {
    var scope = this;
    var filename = file.name;
    var fileReader = new FileReader();
    fileReader.onload = function (fileLoadedEvent) {
      var loaded = fileLoadedEvent.target.result;
      if (encodingType === 'json') {
        try {
          loaded = JSON.parse(loaded);
        } catch (err) {
          if (onError) {
            onError(err);
          } else {
            console.error('Error parsing file ' + filename + ' as json', err);
          }
          scope.manager.itemError(filename);
          return;
        }
      }
      if (onLoad) onLoad(loaded);
      scope.manager.itemEnd(filename);
    }.bind(this);

    if (onProgress) {
      fileReader.onprogress = function (event) {
        onProgress(event);
      };
    }

    fileReader.onerror = function (event) {
      if (onError) onError(event);
      scope.manager.itemError(filename);
    };

    if (encodingType === 'binary') {
      fileReader.readAsBinaryString(file);
    } else if (encodingType === 'arraybuffer') {
      fileReader.readAsArrayBuffer(file);
    } else if (encodingType === 'dataURL') {
      fileReader.readAsDataURL(file);
    } else if (encodingType === 'json') {
      fileReader.readAsText(file, 'UTF-8');
    } else {
      fileReader.readAsText(file, encodingType);
    }

    scope.manager.itemStart(filename);
    return fileReader;
  }

};

module.exports = LocalFileLoader;
