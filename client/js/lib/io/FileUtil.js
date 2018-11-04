// Utility functions for working with the file system

var FileSaver = require('file-saver');
var _ = require('util/util');

var self = {};

function saveText(string, filename) {
  var blob = new Blob([string], {type: "text/plain;charset=utf-8"});
  FileSaver.saveAs(blob, filename);
}

self.saveText = saveText;

function saveJson(object, filename, replacer) {
  var blob = new Blob([JSON.stringify(object, replacer)], {type: "text/plain;charset=utf-8"});
  FileSaver.saveAs(blob, filename);
}

self.saveJson = saveJson;

function saveBlob(blob, filename) {
  FileSaver.saveAs(blob, filename);
}

self.saveBlob = saveBlob;

function saveCanvasImage(canvas, filename) {
  canvas.toBlob(function(blob) {
    FileSaver.saveAs(blob, filename);
  }, "image/png");
}

self.saveCanvasImage = saveCanvasImage;

/* Convenience function for loading files from anywhere! */
function readAsync(uri, opts, cb) {
  var encoding = (opts == undefined || typeof opts === 'string') ? opts : opts.encoding;
  var FileLoader = require('io/FileLoader');
  var fileLoader = new FileLoader();
  fileLoader.load(uri, encoding, function(data) {
    cb(null, data);
  }, null, function(err) {
    cb(err, null);
  });
}

self.readAsync = readAsync;

function loadDelimited(file, opts, callback) {
  var IOUtil = require('io/IOUtil');
  // By default, we assume there is a header, don't want empty lines, and will do dynamicTyping
  opts = _.defaults(Object.create(null), opts || { filename: file.name || file });
  readAsync(file, 'utf8', function(err, data) {
    if (err) {
      callback(err);
    } else {
      var parsed = IOUtil.parseDelimited(data, opts);
      callback(null, parsed);
    }
  });
}

self.loadDelimited = loadDelimited;


/* File system utils */
function __fsReadFileCallback(filename, successCallback, errorCallback, fs) {
  var errorHandler = function (e) {
    console.error('Error reading file ' + filename);
    console.log(e);
    if (errorCallback) errorCallback();
  };

  fs.root.getFile(filename, {}, function(fileEntry) {
    // Get a File object representing the file,
    // then use FileReader to read its contents.
    fileEntry.file(function(file) {
      successCallback(file);
    }, errorHandler);
  }, errorHandler);
}

function fsReadFile(filename, successCallback, errorCallback) {
  var callback = __fsReadFileCallback.bind(null, filename, successCallback, errorCallback);
  initFs(callback);
}

self.fsReadFile = fsReadFile;

function fsExportFile(fsFilename, finalFilename) {
  fsReadFile(fsFilename, function(blob) {
    FileSaver.saveAs(blob, finalFilename);
  });
}

self.fsExportFile = fsExportFile;

function __fsWriteToFileCallback(opts) {
  var filename = opts.filename;
  var content = opts.content;
  var initialContent = opts.initialContent;
  var append = opts.append;
  var successCallback = opts.success;
  var errorCallback = opts.error;
  var fs = opts.fs;

  var errorHandler = function (e) {
    console.error('Error writing file ' + filename);
    console.log(e);
    if (errorCallback) errorCallback();
  };

  fs.root.getFile(filename, { create: true }, function (fileEntry) {
    console.log('Writing to file at ' + fileEntry.fullPath + ', append=' + append + '.');
    // Create a FileWriter object for our FileEntry (log.txt).
    fileEntry.createWriter(function (fileWriter) {
      var truncating = false;
      // Create a new Blob and write it to filename.
      var contents = [content];
      if (initialContent && (!append || fileWriter.length === 0)) {
        // There is some initial content that should go into the file
        contents = [initialContent, content];
      }
      var blob = (typeof content === 'string')?
        new Blob(contents, { type: 'text/plain;charset=utf-8' }) :
        new Blob(contents, { type: 'application/binary' });

      fileWriter.onwriteend = function (e) {
        if (truncating)  {
          truncating = false;
          fileWriter.write(blob);
        } else {
          console.log('Write completed.');
          if (successCallback) successCallback();
        }
      };

      fileWriter.onerror = function(e) {
        console.log('Write failed: ' + e.toString());
        if (errorCallback) errorCallback();
      };

      if (append) {
        // Appending, go to correct place
        console.log('Write to position ' + fileWriter.length + ' of ' + fileEntry.fullPath);
        fileWriter.seek(fileWriter.length);
        fileWriter.write(blob);
      } else {
        if (fileWriter.length > 0) {
          // Not appending, lets truncates file to 0
          console.log('Truncate file ' + fileEntry.fullPath );
          truncating = true;
          fileWriter.truncate(0);
          // After truncate is successful - should get onwriteend callback...
        } else {
          fileWriter.write(blob);
        }
      }
    }, errorHandler);

  }, errorHandler);

}

function fsWriteToFile(filename, content, successCallback, errorCallback) {
  initFs(function(fs) {
    __fsWriteToFileCallback({
      fs: fs,
      filename: filename,
      content: content,
      append: false,
      success: successCallback,
      error: errorCallback
    });
  });
}

self.fsWriteToFile = fsWriteToFile;

function fsAppendToFile(filename, content, successCallback, errorCallback) {
  initFs(function(fs) {
    __fsWriteToFileCallback({
      fs: fs,
      filename: filename,
      content: content,
      append: true,
      success: successCallback,
      error: errorCallback
    });
  });
}

self.fsAppendToFile = fsAppendToFile;

function writeToFile(filename, content, opts, callback) {
  opts = opts || {};
  if (typeof(opts) === 'function') {
    callback = opts;
    opts = {};
  }
  if (!callback) {
    callback = opts.callback;
  }
  initFs(function(fs) {
    __fsWriteToFileCallback({
      fs: fs,
      filename: filename,
      content: content,
      initialContent: opts.initialContent,
      append: opts.append,
      success: callback? function(data) { callback(null, data); } : null,
      error: callback? function(err) { callback(err, null); } : null
    });
  });
}

self.writeToFile = writeToFile;

function initFs(callback) {
  // Uses HTML5 file system (see http://www.html5rocks.com/en/tutorials/file/filesystem/)
  // Use the HTML5 Filesystem explorer for chrome to look at your file
  var errorHandler = function (e) {
    console.log('Error initializing FS!!!!');
    console.log(e);
  };
  console.log('Attempt to use FS!!!');
  window.requestFileSystem  = window.requestFileSystem || window.webkitRequestFileSystem;
  window.webkitStorageInfo.requestQuota(window.PERSISTENT, 500*1024*1024, function(grantedBytes) {
    window.requestFileSystem(window.PERSISTENT, grantedBytes, callback, errorHandler);
  }, function (e) {
    console.log('Error requesting quota!!!', e);
  });
}

self.initFs = initFs;

module.exports = self;
