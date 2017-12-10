/**
 * Loader for wall files
 * @param params
 * @constructor
 * @memberOf loaders
 */
function WallLoader(params) {
  this.fs = params.fs;
}


WallLoader.prototype.load = function(file, callback) {
  var filename = file.name || file;
  var scope = this;
  this.fs.readAsync(file, 'utf-8', function(err, data) {
    if (err) {
      callback(err);
    } else {
      callback(null, scope.parse(filename, data));
    }
  });
};

WallLoader.prototype.parse = function(filename, data) {
  if (filename.endsWith('.json')) {
    return JSON.parse(data);
  } else {
    return this.__parseWallFormat(data);
  }
};

WallLoader.prototype.__parseWallFormat = function(data) {
  // filetype wall
  // wall 0 44.51 36.34 0 44.51 37.662479000000005 2.7 0 0
  var lines = data.split('\n');
  var walls = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var parts = line.split(/\s+/);
    if (parts.length > 0) {
      if (parts[0] === 'wall') {
        var f = parts.slice(1).map(function(x) { return parseFloat(x); });
        walls.push({
          id: f[0],
          points: [[f[2], f[3], f[1]], [f[5], f[6], f[4]]]
        });
      }
    }
  }
  return walls;
};

module.exports = WallLoader;