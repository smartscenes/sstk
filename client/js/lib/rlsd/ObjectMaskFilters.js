const _ = require('util/util');

// Predefine a set of mask filters
const MaskFilters = [
  { name: 'pixelThreshold',
    getFilter: function(opts) {
      const pixelThreshold = opts.pixelThreshold;
      return function(info, id) {
        return info.npixels >= pixelThreshold;
      };
    }
  },
  {
    name: 'inSet',
    getFilter: function(opts) {
      const allowedMasksSet = new Set();
      opts.assignedMasks.forEach((m) => allowedMasksSet.add((typeof(m) === 'string')? parseInt(m) : m));
      return function(info, id) {
        return allowedMasksSet.has(id);
      };
    }
  }
];

const MaskFiltersByName = _.keyBy(MaskFilters, 'name');

class ObjectMaskFilters {
  constructor() {
  }

  static getMaskFilter(opts) {
    const filters = [];
    if (opts.pixelThreshold != null) {
      filters.push(MaskFiltersByName['pixelThreshold'].getFilter(opts));
    }
    if (opts.assignedMasks != null) {
      filters.push(MaskFiltersByName['inSet'].getFilter(opts));
    }
    if (filters.length === 0) {
      return function(info, id) { return true; }
    } else if (filters.length === 1) {
      return filters[0];
    } else {
      // assumes conjunction of filters
      return function(info, id) {
        return _.every(filters, (f) => f(info,id));
      };
    }
  }
}

module.exports = ObjectMaskFilters;