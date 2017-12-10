// Utility functions for working with the file system

var csv = require('papaparse');
var cpExecSync = require('child_process').execSync;
var deasync = require('deasync');
var fs = require('fs');
var request = require('request');
var _ = require('lodash');

// https://github.com/jhiesey/to-arraybuffer/blob/master/index.js
function toArrayBuffer(buf) {
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


// Synchronously get from url
var wgetSync = deasync(function (url, opts, cb) {
  var encoding = (opts == undefined || typeof opts === 'string') ? opts : opts.encoding;
  // Reinterpret encoding to handle binary arraybuffer (see https://github.com/request/request)
  var enc = (encoding === 'arraybuffer') ? null : encoding;
  request({ method: 'GET', url: url, encoding: enc },
    function (err, resp, body) {
      if (err) {
        cb(err, null);
      } else {
        if (encoding === 'arraybuffer') {
          body = toArrayBuffer(body);
        }
        cb(null, body);
      }
    });
});


function fsReadFile(filename, successCallback, errorCallback) {
  var content = fs.readFileSync(filename, 'utf8');
  successCallback(content);
}


// read URL/file from uri synchronously
function readSync(uri, opts) {
  opts = opts || 'utf8';
  //console.log('readSync ' + uri, opts);
  if (uri.startsWith('http')) {
    return wgetSync(uri, opts);
  } else {
    if (uri.startsWith('file://')) { uri = uri.substr(7); }
    if (!fs.existsSync(uri)) {
      console.warn('Cannot find file: ' + uri);
      return;
    }
    var encoding = (opts == undefined || typeof opts === 'string') ? opts : opts.encoding;
    var enc = (encoding === 'arraybuffer') ? null : encoding;
    var fsOpts = (typeof opts === 'string') ? enc : _.defaults({encoding: enc}, opts);
    var data = fs.readFileSync(uri, fsOpts);
    if (data && encoding === 'arraybuffer') {
      data = toArrayBuffer(data);
    }
    return data;
  }
}


// read URL/file from uri asynchronously
function readAsync(uri, opts, cb) {
  //console.log('readAsync ' + uri, opts);
  var encoding = (opts == undefined || typeof opts === 'string') ? opts : opts.encoding;
  if (uri.startsWith('http')) {
    // Reinterpret encoding to handle binary arraybuffer (see https://github.com/request/request)
    var enc = (encoding === 'arraybuffer') ? null : encoding;
    request({ method: 'GET', url: uri, encoding: enc },
    function (err, resp, body) {
      if (err) {
        cb(err, null);
      } else if (resp.statusCode >= 400 && resp.statusCode < 600) {
        cb(body.toString(), null);
      } else {
        if (encoding === 'arraybuffer') {
          body = toArrayBuffer(body);
        }
        cb(null, body);
      }
    });
  } else {
    if (uri.startsWith('file://')) { uri = uri.substr(7); }
    var enc = (encoding === 'arraybuffer') ? null : encoding;
    var fsOpts = (typeof opts === 'string') ? enc : _.defaults({ encoding: enc }, opts);
    fs.readFile(uri, fsOpts, function (err, data) {
      if (err) {
        cb(err, null);
      } else {
        if (encoding === 'arraybuffer') {
          data = toArrayBuffer(data);
        }
        cb(null, data);
      }
    });
  }
}


function fsExportFile(fsFilename, finalFilename) {

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

// Thin wrapper about papaparse (see http://papaparse.com/docs)
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
  existsSync: fs.existsSync,
  writeFileSync: fs.writeFileSync,
  fsReadFile: fsReadFile,
  readSync: readSync,
  readAsync: readAsync,
  readLines: readLines,
  fsExportFile: fsExportFile,
  fsWriteToFile: fsWriteToFile,
  fsAppendToFile: fsAppendToFile,
  writeToFile: writeToFile,
  loadDelimited: loadDelimited,
  loadLabelColorIndex: loadLabelColorIndex,
  execSync: execSync,
  toArrayBuffer: toArrayBuffer
};

module.exports = self;
