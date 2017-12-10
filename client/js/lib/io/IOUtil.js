var csv = require('papaparse');
var _ = require('util');

var IOUtil = {};

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
  if (opts.remapFields) {
    parsed.data = _.each(parsed.data, function(d) {
      _.each(opts.remapFields, function(nf,of) {
        d[nf] = d[of];
      });
    });
  }
  if (opts.keyBy) {
    parsed.data = _.keyBy(parsed.data, opts.keyBy);
  }
  return parsed;
}

IOUtil.parseDelimited = parseDelimited;

module.exports = IOUtil;
