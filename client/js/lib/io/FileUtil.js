// Utility functions for working with the file system

const FileSaver = require('file-saver');
const _ = require('util/util');

const self = {};

function saveText(string, filename) {
  const blob = new Blob([string], {type: "text/plain;charset=utf-8"});
  FileSaver.saveAs(blob, filename);
}

self.saveText = saveText;

function saveDelimited(records, filename, fields, delimiter) {
  const text = records.map(r => fields.map(f => r[f] != null? r[f] : '').join(delimiter)).join('\n');
  this.saveText(fields.join(delimiter) + '\n' + text, filename);
}

self.saveDelimited = saveDelimited;

function saveJson(object, filename, replacer) {
  const blob = new Blob([JSON.stringify(object, replacer)], {type: "text/plain;charset=utf-8"});
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
  const encoding = (opts == undefined || typeof opts === 'string') ? opts : opts.encoding;
  const FileLoader = require('io/FileLoader');
  const fileLoader = new FileLoader();
  fileLoader.load(uri, encoding, function(data) {
    cb(null, data);
  }, null, function(err) {
    cb(err, null);
  });
}

self.readAsync = readAsync;

function loadDelimited(file, opts, callback) {
  const IOUtil = require('io/IOUtil');
  // By default, we assume there is a header, don't want empty lines, and will do dynamicTyping
  opts = _.defaults(Object.create(null), opts || {}, { filename: file.name || file });
  readAsync(file, 'utf8', function(err, data) {
    if (err) {
      callback(err);
    } else {
      const parsed = IOUtil.parseDelimited(data, opts);
      callback(null, parsed);
    }
  });
}

self.loadDelimited = loadDelimited;

function readLines(filename, callback) {
  readAsync(filename, 'utf8', function(err, data) {
    let lines;
    if (data) {
      lines = data.split('\n').map(function (x) {
        return x.trim();
      }).filter(function (x) {
        return x.length;
      });
    }
    callback(err, lines);
  });
}

self.readLines = readLines;

/* File system utils */
async function __fsGetFileAsync(filename, fs) {
  const fileHandle = await fs.root.getFileHandle(filename, {});
  return fileHandle.getFile();
}

function __fsReadFileCallback(filename, successCallback, errorCallback, fs) {
  const errorHandler = function (e) {
    console.error('Error reading file ' + filename);
    console.log(e);
    if (errorCallback) errorCallback();
  };

  __fsGetFileAsync(filename, fs)
    .then((file) => { successCallback(file) } )
    .catch(errorHandler);
}

function fsReadFile(filename, successCallback, errorCallback) {
  const callback = __fsReadFileCallback.bind(null, filename, successCallback, errorCallback);
  initFs(callback);
}

self.fsReadFile = fsReadFile;

function fsExportFile(fsFilename, finalFilename) {
  fsReadFile(fsFilename, function(blob) {
    FileSaver.saveAs(blob, finalFilename);
  });
}

self.fsExportFile = fsExportFile;

async function __fsWriteToFileAsync(opts) {
  const filename = opts.filename;
  const content = opts.content;
  const initialContent = opts.initialContent;
  const append = opts.append;
  const fs = opts.fs;

  const fileHandle = await fs.root.getFileHandle(filename, { create: true })
  console.log('Writing to file at ' + fileHandle.name + ', append=' + append + '.');
  // Create a FileWriter object for our FileEntry (log.txt).
  const fileWriter = await fileHandle.createWritable( {keepExistingData: append});
  const offset = append? (await fileHandle.getFile()).size : 0;
  // Create a new Blob and write it to filename.
  let contents = [content];
  if (initialContent && (!append || fileWriter.length === 0)) {
    // There is some initial content that should go into the file
    contents = [initialContent, content];
  }
  const blob = (typeof content === 'string')?
    new Blob(contents, { type: 'text/plain;charset=utf-8' }) :
    new Blob(contents, { type: 'application/binary' });

  await fileWriter.write( { type: 'write', data: blob, position: offset });
  await fileWriter.close();
}

function __fsWriteToFileCallback(opts) {
  const filename = opts.filename;
  const successCallback = opts.success;
  const errorCallback = opts.error;
  const errorHandler = function (e) {
    console.error('Error writing file ' + filename);
    console.log(e);
    if (errorCallback) errorCallback();
  };

  __fsWriteToFileAsync(opts)
    .then(() => successCallback())
    .catch(errorHandler);
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
  console.log('Attempt to use FS!!!');
  navigator.storage.getDirectory()
    .then((handle) => {
      callback({ root: handle });
    })
    .catch((error) => {
      console.log('Error initializing FS!!!!');
      console.log(error);
    });
}

self.initFs = initFs;

module.exports = self;
