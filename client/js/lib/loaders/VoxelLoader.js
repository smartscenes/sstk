var ColorGrid = require('geo/ColorGrid');
var BinvoxLoader = require('loaders/BinvoxLoader');
var LabeledGridLoader = require('loaders/LabeledGridLoader');
var NRRDLoader = require('loaders/NRRDLoader');
var FileLoader = require('io/FileLoader');
var jBinary = require('jbinary');

/**
 * Generic voxel loader that dispatches to the appropriate loader
 *  depending on format (NRRD, Binvox, LabeledGrid)
 * @constructor
 * @memberOf loaders
 */
function VoxelLoader() {

}

VoxelLoader.prototype.load = function (path, callback) {
  var loader = new FileLoader();
  var scope = this;
  loader.load(path, 'arraybuffer', function(data) {
    var binary = new jBinary(data);
    scope.__parseVoxels(path.name || path, binary, callback);
  }, null, function(err) {
    callback(err);
  });
};

VoxelLoader.prototype.__parseVoxels = function (filename, data, callback) {
  var parser;
  if (filename.endsWith('binvox')) {
    parser = new BinvoxLoader();
  } else if (filename.endsWith('vox')) {
    parser = new LabeledGridLoader();
  } else if (filename.endsWith('nrrd')) {
    parser = new NRRDLoader({ GridType: ColorGrid });
  } else {
    console.warn('Unknown grid type: ' + filename);
    callback('Unknown grid type: ' + filename);
    return;
  }
  console.time('parseVoxels');
  var grid = parser.parse(filename, data);
  console.timeEnd('parseVoxels');
  callback(null, grid);
};

module.exports = VoxelLoader;

