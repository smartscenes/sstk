// A structure that maps from objects to integers
var _ = require('util');

function Index(opts) {
  opts = opts || {};
  this.name = opts.name;
  this.filename = opts.filename || opts.name;
  if (opts.id) {
    if (_.isFunction(opts.id)) {
      this.__idFn = opts.id;
    } else if (_.isString(opts.id)) {
      this.__idFn = function(x) { return x[opts.id]; };
    } else {
      throw new TypeError('Unsupported id field: ' + opts.id);
    }
  } else {
    this.__idFn = function(x) { return x; };
  }
  this.clear();
}

Index.prototype.clear = function() {
  this.__objects = [];
  this.__idToIndex = new Map();

  // Support additional metadata associated with the index
  this.__indexToMetadata = {}; // Additional metadata for objects (by index)
  this.__metadataFields = [];
};

Object.defineProperty(Index.prototype, 'idToIndex', {
  get: function () { return this.__idToIndex; }
});

Index.prototype.id = function(obj) {
  return this.__idFn(obj);
};

Index.prototype.indexOf = function(obj, add, metadata) {
  var id = this.__idFn(obj);
  var i = this.__idToIndex[id];
  if (i == undefined) {
    if (add) {
      i = this.__objects.length;
      this.__objects.push(obj);
      this.__idToIndex[id] = i;
      if (metadata) {
        this.__indexToMetadata[i] = metadata;
        var scope = this;
        _.forEach(metadata, function(v,k) {
          if (scope.__metadataFields.indexOf(k) < 0) {
            scope.__metadataFields.push(k);
          }
        });
      }
    }
  }
  return i;
};

Index.prototype.get = function(index) {
  return this.__objects[index];
};

Index.prototype.metadata = function(index, field) {
  var m = this.__indexToMetadata[index];
  if (field != null) {
    return m? m[field] : undefined;
  } else {
    return m;
  }
};

Index.prototype.add = function(obj, metadata) {
  // return true if added, false otherwise
  var sz = this.size();
  var index = this.indexOf(obj, true, metadata);
  return (index >= sz);
};

Index.prototype.addAll = function(list) {
  for (var i = 0; i < list.length; i++) {
    this.indexOf(list[i], true);
  }
};

Index.prototype.indices = function(filter) {
  var keys = _.map(this.__objects, function(v,k) { return filter(v,k)? k : -1; });
  return _.filter(keys, function(i) { return i >= 0; });
};

Index.prototype.objects = function() {
  return this.__objects;
};

Index.prototype.size = function() {
  return this.__objects.length;
};

Index.prototype.importCsv = function(opts) {
  var fs = opts.fs;
  var filename = opts.filename;
  var callback = opts.callback;

  var scope = this;
  fs.readAsync(filename, 'utf-8', function(err, data) {
    if (data) {
      scope.parse(data, opts);
    }
    callback(err, scope);
  });
};
Index.prototype.import = Index.prototype.importCsv;

Index.prototype.parse = function(data, opts) {
  opts = opts || {};
  var indexField = opts.indexField || 'index';
  var idField = opts.idField || 'label';
  this.clear();
  var IOUtil = require('io/IOUtil');
  var parsed = IOUtil.parseDelimited(data, { header: true, skipEmptyLines: true, dynamicTyping: true });
  var fields = parsed.meta.fields;
  this.__metadataFields = fields.filter(function(x) { return x !== idField && x !== indexField; });
  for (var i = 0; i < parsed.data.length; i++) {
    var d = parsed.data[i];
    this.__objects[d[indexField]] = d[idField];
    this.__idToIndex[d[idField]] = d[indexField];
    if (this.__metadataFields.length) {
      this.__indexToMetadata[d.index] = _.omit(d, [indexField, idField]);
    }
  }
};

Index.prototype.fromLabelIndexMap = function(map) {
  var scope = this;
  _.forEach(map, function(i,k) {
    scope.__objects[i] = k;
    scope.__idToIndex[k] = i;
  });
};

Index.prototype.exportCsv = function(opts) {
  var fs = opts.fs;
  var outfilename = opts.filename;
  var callback = opts.callback;

  var scope = this;
  var header = _.concat(['index', 'label'], this.__metadataFields);
  var labelsStr = header.map(function(x) { return _.escapeCsv(x); }).join(',') + '\n' + _.map(this.__objects, function(object,i) {
    var label = scope.__idFn(object);
    var metadata = scope.__indexToMetadata[i] || {};
    var row = _.concat([i, label], scope.__metadataFields.map(function(x) { return (metadata[x] != undefined)? metadata[x] : ''; }));
    return row.map(function(x) { return _.escapeCsv(x); }).join(',');
  }).join('\n');
  fs.fsWriteToFile(outfilename, labelsStr, function() {
    fs.fsExportFile(outfilename, outfilename);
    console.log('Exported label index to ' + outfilename);
    callback(null, null);
  }, function(err) {
    console.warn('Error exporting labels to ' + outfilename + ': ', err);
    callback(err, null);
  });
};
Index.prototype.export = Index.prototype.exportCsv;

Index.import = function(opts) {
  var index = new Index();
  index.import(opts);
  return index;
};

module.exports = Index;