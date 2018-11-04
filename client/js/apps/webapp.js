var Constants = require('Constants');
Constants.sys = {
  fs: require('io/FileUtil'),
  Buffer: Buffer
};

module.exports = {
  Constants: Constants,
  util: require('util/util')
};