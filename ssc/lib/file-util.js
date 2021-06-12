// Utility functions for working with the file system

var csv = require('papaparse');
var cpExecSync = require('child_process').execSync;
var deasync = require('deasync');
var fs = require('fs');
var path = require('path');
var shell = require('shelljs');
var request = require('request');
var _ = require('lodash');

// file system options
var __globalOptions = {
  cache: { enabled: false, dir: "cache", force: false, rewriteFilePath: null }
};

function ensureDirExists(dir) {
  shell.mkdir('-p', dir);
}

/**
 * Converts a buffer of some sort to a ArrayBuffer
 * @param buf
 * @returns {any}
 */
function toArrayBuffer(buf) {
  // See https://github.com/jhiesey/to-arraybuffer/blob/master/index.js
  // If the buffer is backed by a Uint8Array, a faster version will work
  if (buf instanceof Uint8Array) {
    // If the buffer isn't a subarray, return the underlying ArrayBuffer
    if (buf.byteOffset === 0 && buf.byteLength === buf.buffer.byteLength) {
      return buf.buffer;
    } else if (typeof buf.buffer.slice === 'function') {
      // Otherwise we need to get a proper copy
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    }
  }
  if (Buffer.isBuffer(buf)) {
    // This is the slow version that will work with any Buffer
    // implementation (even in old browsers)
    var arrayCopy = new Uint8Array(buf.length);
    var len = buf.length;
    for (var i = 0; i < len; i++) {
      arrayCopy[i] = buf[i];
    }
    return arrayCopy.buffer;
  } else {
    throw new Error('Argument must be a Buffer');
  }
}


/**
 * Asynchronously get from url
 * @param url {string}
 * @param opts {string|Object} Either string specifying encoding or additional options for download
 * @param opts.encoding {string} encoding (`arraybuffer|utf-8`)
 * @param opts.saveFile {string} Where to save the file to
 * @param cb
 */
function download(url, opts, cb) {
  // Reinterpret encoding to handle binary arraybuffer (see https://github.com/request/request)
  var encoding = (opts == undefined || typeof opts === 'string') ? opts : opts.encoding;
  var enc = convertEncodingString(encoding);
  request({ method: 'GET', url: url, encoding: enc },
    function (err, resp, body) {
      if (err) {
        cb(err, null);
      } else if (resp.statusCode >= 400 && resp.statusCode < 600) {
        // Interpret error codes
        cb(body.toString(), null);
      } else {
        if (encoding === 'arraybuffer') {
          body = toArrayBuffer(body);
        } else if (encoding === 'json') {
          try {
            body = JSON.parse(body);
          } catch (err) {
            cb(err);
            return;
          }
        }
        if (opts.saveFile) {
          // save file at cache location
          fsWriteToFileEnsureDir(opts.saveFile, body);
        }
        cb(null, body);
      }
    });
}

/**
 * Download file and save in cache
 * @param url
 * @param opts
 * @param cb
 */
function downloadWithCache(url, opts, cb) {
  opts = opts || {};
  var cacheOptions = __globalOptions.cache;
  if (!opts.saveFile && cacheOptions && cacheOptions.enabled && cacheOptions.dir) {
    var urlpath = url.replace(/.+?:/, '');
    var cacheFile = cacheOptions.dir + '/' + urlpath;
    if (cacheOptions.rewriteFilePath) {
      cacheFile = cacheOptions.rewriteFilePath(cacheFile);
    }
    // check if cacheFile exists
    if (!cacheOptions.force && fs.existsSync(cacheFile)) {
      readAsync(cacheFile, opts, cb);
    } else {
      opts = opts || {};
      if (typeof opts === 'string') {
        opts = { encoding: opts };
      }
      download(url, _.defaults({ saveFile: cacheFile}, opts), cb);
    }
  } else {
    download(url, opts, cb);
  }
}

function fsReadFile(filename, successCallback, errorCallback) {
  var content = fs.readFileSync(filename, 'utf8');
  successCallback(content);
}

function convertEncodingString(encoding) {
  if (encoding === 'arraybuffer') {
    return null;
  } else if (encoding === 'json') {
    return 'utf8';
  } else if (encoding === 'jsonl') {
    return 'utf8';
  } else {
    return encoding;
  }
}

/**
 * read URL/file from uri synchronously
 * @param uri {string} Url to file or http
 * @param opts
 * @returns {*} Contents of file
 */
function readSync(uri, opts) {
  opts = opts || 'utf8';
  //console.log('readSync ' + uri, opts);
  if (uri.startsWith('http')) {
    return deasync(downloadWithCache)(uri, opts);
  } else {
    if (uri.startsWith('file://')) { uri = uri.substr(7); }
    if (!fs.existsSync(uri)) {
      console.warn('Cannot find file: ' + uri);
      return;
    }
    var encoding = (opts == undefined || typeof opts === 'string') ? opts : opts.encoding;
    var enc = convertEncodingString(encoding);
    var fsOpts = (typeof opts === 'string') ? enc : _.defaults({encoding: enc}, opts);
    var data = fs.readFileSync(uri, fsOpts);
    if (data && encoding === 'arraybuffer') {
      data = toArrayBuffer(data);
    } else if (data && encoding === 'json') {
      data = JSON.parse(data);
    } else if (data && encoding === 'jsonl') {
      // Not very performant jsonl parsing (see IOUtil for faster json parsing)
      data = _.map(_.filter(data.split("\n"), (x) => x.length > 0), (x) => JSON.parse(x) );
    }
    return data;
  }
}


/**
 * read URL/file from uri asynchronously
 * @param uri
 * @param opts
 * @param cb
 */
function readAsync(uri, opts, cb) {
  //console.log('readAsync ' + uri, opts);
  if (uri.startsWith('http')) {
    downloadWithCache(uri, opts, cb);
  } else {
    if (uri.startsWith('file://')) { uri = uri.substr(7); }
    var encoding = (opts == undefined || typeof opts === 'string') ? opts : opts.encoding;
    var enc = convertEncodingString(encoding);
    var fsOpts = (typeof opts === 'string') ? enc : _.defaults({ encoding: enc }, opts);
    fs.readFile(uri, fsOpts, function (err, data) {
      if (err) {
        cb(err, null);
      } else {
        if (encoding === 'arraybuffer') {
          data = toArrayBuffer(data);
        } else if (encoding === 'json' || encoding === 'jsonl') {
          try {
            if (encoding === 'json') {
              data = JSON.parse(data);
            } else {
              // Not very performant jsonl parsing (see IOUtil for faster json parsing)
              data = _.map(_.filter(data.split("\n"), (x) => x.length > 0), (x) => JSON.parse(x) );
            }
          } catch (err) {
            cb(err);
            return;
          }
        }
        cb(null, data);
      }
    });
  }
}


function fsExportFile(fsFilename, finalFilename) {

}

function fsWriteToFileEnsureDir(filename, content, successCallback, errorCallback) {
  var dir = path.dirname(filename);
  ensureDirExists(dir);
  return fsWriteToFile(filename, content, successCallback, errorCallback);
}


function fsWriteToFile(filename, content, successCallback, errorCallback) {
  if (typeof content === 'string') {
    fs.writeFileSync(filename, content);
  } else {  // assume binary
    fs.writeFileSync(filename, Buffer.from(content), { encoding: null });
  }
  if (successCallback) {
    successCallback();
  }
}


function fsAppendToFile(filename, content, successCallback, errorCallback) {
  if (typeof content === 'string') {
    fs.appendFileSync(filename, content);
  } else {  // assume binary
    console.log(filename);
    fs.appendFileSync(filename, Buffer.from(content), { encoding: null });
  }
  if (successCallback) {
    successCallback();
  }
}

// Try to mirror arguments for node writeFile
function writeToFile(filename, content, opts, callback) {
  opts = opts || {};
  if (typeof(opts) === 'function') {
    callback = opts;
    opts = {};
  }
  if (!callback) {
    callback = opts.callback;
  }
  var append = opts.append;
  if (opts.initialContent) {
    if (append) {
      // Check if file is empty
      var filesize = 0;
      if (fs.existsSync(filename)) {
        var stat = fs.statSync(filename);
        filesize = stat.size;
      }
      if (filesize === 0) {
        fsAppendToFile(filename, opts.initialContent);
      }
    } else {
      fsWriteToFile(filename, opts.initialContent);
      append = true;
    }
  }
  var successCallback = callback? function(data) { callback(null, data); } : null;
  var errorCallback = callback? function(err) { callback(err, null); } : null;
  if (append) {
    fsAppendToFile(filename, content, successCallback, errorCallback);
  } else {
    fsWriteToFile(filename, content, successCallback, errorCallback);
  }
}


function loadLabelColorIndex(filename) {
  var data = fs.readFileSync(filename, 'utf8');
  var lines = data.split('\n');
  var labelToIndex = {};
  labelToIndex['unknown'] = 0;  //'#A9A9A9';
  for (var i = 0; i < lines.length; i++) {
    if (lines[i]) {
      labelToIndex[lines[i]] = i + 1;
    }
  }
  return labelToIndex;
}


function execSync(cmd, opts) {
  opts = opts || {};
  if (!opts.silent) { console.log(cmd); }
  var cout = cpExecSync(cmd, { encoding: 'utf8' });  // for returning string cout
  if (!opts.silent) { console.log(cout); }
  return cout;
}

/**
 * Parses delimited text data such as csv or tsv
 * This is a thin wrapper about papaparse (see http://papaparse.com/docs)
 * @param data {string}
 * @param opts
 * @param [opts.delimiter=','] {string}
 * @param [opts.quoteChar] {string}
 * @param [opts.header=true] {boolean} Includes header row
 * @param [opts.skipEmptyLines=true] {boolean} Ignore empty lines
 * @param [opts.dynamicTyping=true] {boolean} Automatically guess and convert type
 * @param [opts.keyBy] {string} If specified, data is converted to a map with the specified key.  Otherwise, array is returned.
 * @param [opts.filename] {string} If filename ends with '.tsv' then delimiter and quoteChar is set for tab delimited files.
 * @returns {data: {array|map}, errors: array, meta: object}
 */
function parseDelimited(data, opts) {
  // By default, we assume there is a header, don't want empty lines, and will do dynamicTyping
  opts = _.defaults(Object.create(null), opts || {}, { header: true, skipEmptyLines: true, dynamicTyping: true });
  // Delimiter is not specified
  if (opts.delimiter == null && opts.filename) {
    if (opts.filename.endsWith('.tsv')) {
      opts.delimiter = '\t';
      opts.quoteChar = '\0'; // no quote char
    }
  }
  var parsed = csv.parse(data, opts);
  if (opts.keyBy) {
    parsed.data = _.keyBy(parsed.data, opts.keyBy);
  }
  return parsed;
}

/**
 * Load delimited file
 * @param filename {string}
 * @param [opts] Additional options
 * @param [opts.delimiter=','] {string}
 * @param [opts.quoteChar] {string}
 * @param [opts.header=true] {boolean} Includes header row
 * @param [opts.skipEmptyLines=true] {boolean} Ignore empty lines
 * @param [opts.dynamicTyping=true] {boolean} Automatically guess and convert type
 * @param [opts.keyBy] {string} If specified, data is converted to a map with the specified key.  Otherwise, array is returned.
 * @param [opts.filename] {string} If filename ends with '.tsv' then delimiter and quoteChar is set for tab delimited files.
 * @param [callback] {function(err, {data: {array|map}, errors: array, meta: object})}
 * @returns {*}
 */
function loadDelimited(filename, opts, callback) {
  // By default, we assume there is a header, don't want empty lines, and will do dynamicTyping
  opts = _.defaults(Object.create(null), opts || { filename: filename });
  if (filename) {
    if (callback) {
      // async version
      readAsync(filename, 'utf8', function(err, data) {
        if (err) {
          callback(err);
        } else {
          var parsed = parseDelimited(data, opts);
          callback(null, parsed);
        }
      });
    } else {
      var data = readSync(filename, 'utf8');
      return parseDelimited(data, opts);
    }
  }
}

function readLines(filename) {
  var data = fs.readFileSync(filename, 'utf8');
  return data.split('\n').map(function (x) {
    return x.trim();
  }).filter(function (x) {
    return x.length;
  });
}

//TODO(MS) More properly wrap fs
var self = {
  options: __globalOptions,
  existsSync: fs.existsSync,
  writeFileSync: fs.writeFileSync,
  createReadStream: fs.createReadStream,
  createWriteStream: fs.createWriteStream,
  fsReadFile: fsReadFile,
  readSync: readSync,
  readAsync: readAsync,
  readLines: readLines,
  ensureDirExists: ensureDirExists,
  fsExportFile: fsExportFile,
  fsWriteToFile: fsWriteToFile,
  fsWriteToFileEnsureDir:   fsWriteToFileEnsureDir,
  fsAppendToFile: fsAppendToFile,
  writeToFile: writeToFile,
  loadDelimited: loadDelimited,
  loadLabelColorIndex: loadLabelColorIndex,
  execSync: execSync,
  toArrayBuffer: toArrayBuffer
};

module.exports = self;
