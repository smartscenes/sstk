var zlib = require('pako');
var FileUtil = require('io/FileUtil');
var _ = require('util');

/**
 * Export a voxel grid in nrdd format
 * @param options
 * @param options.fs File system to use for exporting (defaults to FileUtil)
 * @constructor
 * @memberOf exporters
 */
function NRRDExporter(options) {
  options = options || {};
  this.__fs = options.fs || FileUtil;
  this.encoding = 'gzip';
  this.endian = 'little';
}

NRRDExporter.prototype.export = function(volume, opts) {
  var fileutil = this.__fs;
  opts = opts || {};
  opts.name = opts.name || 'scene';
  opts.dir = opts.dir ? opts.dir + '/' : '';
  var filename = opts.dir + opts.name + '.nrrd';
  var callback = opts.callback;
  var compress = this.encoding === 'gzip' || this.encoding === 'gz';

  function appendData() {
    var buffer = volume.getRawData().buffer;
    if (compress) {
      buffer = zlib.gzip(new Uint8Array(buffer)).buffer;
    }
    fileutil.fsAppendToFile(filename, buffer, finishFile);
  }
  function finishFile() {
    fileutil.fsExportFile(filename, filename);
    console.log('finished exporting volume data to ' + filename);
    if (callback) { callback(); }
  }
  var params = _.defaults({}, opts, { encoding: this.encoding, endian: this.endian });
  var header = this.__getHeader(volume, params);
  fileutil.fsWriteToFile(filename, header, appendData);
};

NRRDExporter.prototype.__getHeader = function(volume, opts) {
  function toString(vec3) {
    return "(" + vec3.toArray().join(',') + ")";
  }
  var grid = volume;
  var dims = grid.orderedDims;
  var origin = grid.getOrigin();
  var basis = grid.getGridToWorldBasisOrdered();
  var spaceDirs = [];
  for (var i = 0; i < dims.length - 3; i++) {
    spaceDirs.push('none');
  }
  spaceDirs = spaceDirs.concat([toString(basis[0]), toString(basis[1]), toString(basis[2])]);
  var lines = [
    "NRRD0005",
    "# STK.NRRDExporter",
    "type: " + grid.dataType,
    "dimension: " + dims.length,
    "sizes: " + dims.join(' '),
    "encoding: " + opts.encoding,
    "endian: "  + opts.endian,
    "content: " + opts.content,
    //"space: 3D-right-handed",
    "space dimension: 3",
    "space origin: " + toString(origin),
    "space directions: " + spaceDirs.join(' ')
  ];
  return lines.join('\n') + '\n\n';
};

module.exports = NRRDExporter;
