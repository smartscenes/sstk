
var webpack = require('webpack');
var webpackConfig = require('./webpack');
var fs = require('fs');
var rimraf = require('rimraf');
var cmd = require('commander')
cmd.option('--out <out>', 'Build output', './build')
  .option('--entry <entry>', 'Entry to build')
  .parse(process.argv)
var argv = cmd;

function build() {
  if (process.env.NODE_ENV === 'prod') {
    console.log('Optimizing files for prod (includes minification)');
  }

  if (process.env.STATS === 'true') {
    webpackConfig.profile = true;
  }

  var compiler = webpack(webpackConfig);

  if (process.env.NODE_ENV === 'dev') {
    return compiler.watch({
      aggregateTimeout: 300 // wait so long for more changes
    }, reportWebpackStatus);
  }
  compiler.run(reportWebpackStatus);

  function reportWebpackStatus(err, stats) {
    if (err) {
      console.log(err);
    }

    var statsObj = stats.toJson();

    if (process.env.STATS === 'true') {
      fs.writeFileSync('./stats.json', JSON.stringify(statsObj));
    }

    if (stats.hasErrors()) {
      statsObj.errors.forEach(function(webpackError) {
        console.log(webpackError);
      });
    }

    if (stats.hasWarnings()) {
      statsObj.warnings.forEach(function(warning) {
        console.log(warning);
      });
    }

    console.info('Finished build in ' + statsObj.time + ' ms');
  }
}

if (argv.entry) {
  build();
} else {
  var outpath = argv.out;
  rimraf(outpath, {
    disableGlob: true
  }, build);
}
