const FormUtil = {};

// Custom parser objects that handles conversion between string and type `T`
// `name` (`string`),
// `parse` (`function(string):T`),
// `toString` (`function(T):string`)

FormUtil.Parsers = {
  Vector3D: {
    name: 'vector3d',
    parse: (string, delimiter = ',') => {
      const list = string.split(delimiter).map(x => parseFloat(x.trim()));
      return new THREE.Vector3(list[0], list[1], list[2]);
    },
    toString: (v) => { return v? v.toArray().join(',') : ''; }
  }
};

module.exports = FormUtil;