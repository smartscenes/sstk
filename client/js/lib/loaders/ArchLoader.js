var ArchCreator = require('geo/ArchCreator');
var _ = require('util/util');

/**
 * Loader for wall files
 * @param params
 * @constructor
 * @memberOf loaders
 */
function ArchLoader(params) {
  this.fs = params.fs;

  var archCreatorOptions = ArchCreator.DEFAULTS;
  if (params.archOptions) {
    archCreatorOptions = _.defaultsDeep(Object.create(null), params.archOptions, archCreatorOptions);
  }
  // console.log('archCreatorOptions', params.archOptions);
  this.archFilter = ArchCreator.getFilter({
    includeCeiling: archCreatorOptions.filter.includeCeiling,
    includeFloor: archCreatorOptions.filter.includeFloor,
    includeWalls: archCreatorOptions.filter.includeWalls,
    room: archCreatorOptions.filter.room,
    level: archCreatorOptions.filter.level,
    archIds: archCreatorOptions.filter.archIds
  });
  this.archCreator = new ArchCreator(archCreatorOptions);
}


ArchLoader.prototype.load = function(file, callback) {
  if (file.file) { file = file.file; }
  var filename = file.name || file;
  var scope = this;
  this.fs.readAsync(file, 'json', function(err, data) {
    if (err) {
      callback(err);
    } else {
      callback(null, scope.parse(filename, data));
    }
  });
};

ArchLoader.prototype.parse = function(filename, data) {
  var json = (typeof(data) === 'string')? JSON.parse(data) : data;
  var archData = _.cloneDeep(json);
  var arch = this.archCreator.createArch(archData, {
    filterElements: this.archFilter, groupRoomsToLevels: true });
  return { json: json, arch: arch };
};

module.exports = ArchLoader;