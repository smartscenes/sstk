var webpack = require('webpack');
var _ = require('lodash');
var glob = require( 'glob' )
  , path = require( 'path' );

var cmd = require('commander')
cmd.option('--out <out>', 'Build output', 'build')
  .parse(process.argv)
var outpath = path.resolve(__dirname, cmd.out);

require('better-require')('json yaml');

function replaceRefs(object, dir) {
  // Look for '$ref' fields and replace them
  return _.cloneDeepWith(object, function(v) {
    if (_.isPlainObject(v)) {
      if (v['$ref']) {
        var filepath = v['$ref'];
        if (dir) {
          filepath = path.resolve(dir, filepath);
        }
        var data = require(filepath);
        return replaceRefs(data, path.dirname(filepath));
      }
    }
  });
}

function requireDir(dirname) {
  // Simple one level require
  var obj = {};
  var patterns = [dirname + '*.@(js|json)', dirname + '/*/index.@(js|json)'];
  for (var i = 0; i < patterns.length; i++) {
    var pattern = patterns[i];
    glob.sync(pattern).forEach(function (file) {
      console.log('require', file);
      var name = file.replace(/\/index\.(json|js)/, '');
      var ps = name.split('/');
      ps = ps[ps.length-1].split('.');
      name = ps[0];
      obj[name] = require(path.resolve(file));
      // Resolve refs
      obj[name] = replaceRefs(obj[name], path.dirname(file));
    });
  }
  return obj;
}

var aliases = {
  // JQuery
  'jquery': 'vendor/jquery-ui/js/jquery-2.1.4.min',
  'jquery-ui': 'vendor/jquery-ui/js/jquery-ui-1.11.4.min',
  'jquery-lazy': 'vendor/jquery-ui/js/jquery.lazy', // Lazy image loading
  'jquery-console': 'vendor/jquery-ui/js/jquery.console', // Console for text2scene in scene viewer
  'jquery.countdown': 'vendor/jquery-ui/js/jquery.countdown.min', // (used in image annotator)
  'jquery.contextMenu': 'vendor/jquery-ui/js/jquery.contextMenu',
  'jquery.plugin': 'vendor/jquery-ui/js/jquery.plugin',
  'jquery-pagination': 'vendor/jquery-ui/js/jquery.pagination',
  'jstree': 'jstree.min', // Tree widget (used in taxonomy viewer)
  // 'jpicker': 'vendor/jpicker/jpicker-1.1.6.min', // Color picker
  'dragscrollable': 'vendor/jquery-ui/js/dragscrollable',  // Used in model categorizer
  'opentip': 'vendor/jquery-ui/js/opentip-jquery-excanvas',

  // Visual search
  'visualsearch': 'vendor/visualsearch/visualsearch',
  'underscore': 'lodash', // use lodash instead of underscore

  // Bootstrap
  'bootstrap': 'vendor/bootstrap.min',
  // Bootbox -- note: bootbox is now pulled from npm
  // 'bootbox': 'vendor/bootbox.min',

  // Three.js
  'three': 'vendor/three/three.min',
  'three-geometry': 'vendor/three/geo/Geometry',
  'three-convexgeo': 'vendor/three/geo/ConvexGeometry',
  'three-convexhull': 'vendor/three/math/ConvexHull',
  'three-mirror': 'vendor/three/gfx/Mirror',
  'three-OBB': 'vendor/three/geo/OBB',
  'three-octree': 'vendor/three/geo/Octree',
  'three-loaders': 'loaders',
  'three-volume': 'vendor/three/geo/Volume',
  'three-volumeslice': 'vendor/three/geo/VolumeSlice',
  'three-controls': 'vendor/three/controls',
  'three-exporters': 'vendor/three/exporters',
  'three-modifiers': 'vendor/three/modifiers',
  'three-shaders': 'vendor/three/shaders',
  'stats': 'vendor/three/libs/stats.min',
  'system': 'vendor/three/libs/system.min',
  'tween': 'vendor/three/libs/tween.min',
  'dat.gui': 'vendor/three/libs/dat.gui.min',  // Dat gui
  'lil.gui': 'vendor/three/libs/lil-gui.umd',  // Lil gui
  'voxel-mesh': 'vendor/voxel/voxel-mesh', // Voxel mesh
  'voxel-browser': 'vendor/voxel/voxel-browser', // Voxel browser

  // Binary reading
  'jdataview': 'vendor/jbinary/jdataview',
  'jbinary': 'vendor/jbinary/jbinary',
  'bitview': 'vendor/jbinary/bitview',

  // Visualization -- note: d3, d3-tip are now pulled from npm
  'd3': 'vendor/d3/d3-3.5.12.min',  // D3
  'dagre-d3': 'vendor/d3/dagre-d3.min',  // Graphs for D3

  // Others
  // note: mds is now pulled from github (fork of the original mds)
  // 'mds' : 'vendor/mds', // Multidimensional scaling for projecting/display in 2D (used in sim viewer)
  'tsne': 'vendor/tsne', // TSNE visualization for projecting/display in 2D (used in sim viewer)
  'mmturkey': 'vendor/mmturkey' // MTurk (used in image annotator),
};

var _defaultAssets = require('../server/static/data/assets.json');
for (var i = 0; i < _defaultAssets.length; i++) {
  var asset = _defaultAssets[i];
  if (typeof asset.metadata === 'string') {
    // Pull metadata
    var filename = asset.metadata;
    filename = filename.replace('${assetsDir}', '../server/static/');
    asset.metadataFilename = filename;
    asset.metadata = require(filename);
  }
}

var _config = requireDir('./config');

var plugins = [
  new webpack.ProvidePlugin({  // references -> autoload dependency
    //THREE: 'three'
    d3: 'd3'
  }),
  new webpack.DefinePlugin({
    VERSION:  JSON.stringify(require('./package.json').version),
    BUILD: JSON.stringify(new Date().toUTCString()),
    ASSETS: JSON.stringify(_defaultAssets),
    CONFIG: JSON.stringify(_config)
  }),
  function () {
    this.plugin('watch-run', function (watching, callback) {
      console.log('[info] Begin build at ' + new Date());
      callback();
    });
  }
];

var rules = [
  {
    test: /\.js$/,
    enforce: 'pre',
    loader: 'transform-loader?envify'
  },
  {
    test: /bootbox/,
    loader: 'imports-loader?define=>false,require=>false,exports=>false'
  },
  {
    test: require.resolve('d3-tip'),
    loader: 'imports-loader?define=>false,require=>false,exports=>false'
  },
  {
    test: require.resolve('datatables'),
    loader: 'imports-loader?define=>false,require=>false,exports=>false'
  },
  {
    test: /system/,
    loader: 'exports-loader?System'
  }
];

// Actual webpack options
var webpackOptions = {
  mode: process.env.NODE_ENV === 'prod'? 'production' : 'development',
  context: __dirname,
  entry: {
    'STK': './js/lib/STK',
    'STK-core': ['./js/lib/STK-core'],
    // modules
    'articulationAnnotator': './js/apps/articulations/articulation-annotator',
    'articulationGroupedViewer': './js/apps/articulations/articulation-annotator/GroupedAnnotationsViewer',
    'articulationMultiModelView': './js/apps/articulations/multi-model-view',
    'modelScaler': './js/apps/model-scaler',
    'modelTools': './js/apps/model-tools',
    'partAnnotator': './js/apps/part-annotator',
    'rlsd': './js/apps/rlsd',
    'scanAnnotator': './js/apps/scan-annotator',
    'scanAnnotationsViewer': './js/apps/scan-annotator/ScanAnnotationsViewer',
    'sceneViewer': './js/apps/scene-viewer',
    'taxonomyViewer': './js/apps/taxonomy-viewer',
    'viz': './js/apps/viz',
  },
  output: {
    path: outpath,
    filename: '[name].bundle.js',
    chunkFilename: '[chunkhash].bundle.js',
    library: ['STK'],
    libraryTarget: 'umd'
  },
  resolve: {
    modules: ['js', 'js/lib', 'js/vendor', 'node_modules', '../server/static/data'],
    alias: aliases,
    extensions: ['.js', '.json'],
    enforceExtension: false
  },
  module: {
    rules: rules,
    noParse: [/lazy/, /min\.js/]
  },
  node: {
    setImmediate: false,
    fs: 'empty',
  },
  plugins: plugins,
  externals: [{
    // See http://webpack.github.io/docs/configuration.html#externals
    // require("jquery") is external and available on the global var jQuery
    jquery: {
      root: 'jQuery',
      commonjs: 'jquery',
      commonjs2: 'jquery',
      amd: 'jquery'
    },
    d3: 'var d3',
    three: {
      root: 'THREE',
      commonjs: 'three',
      commonjs2: 'three',
      amd: 'three'
    },
    bootbox: 'var bootbox'
  }],
  stats: {
    colors: true
  }
};

// if (process.env.STK === 'extDeps') {
//   webpackOptions.entry = { 'STK': './client/js/lib/STK' };
//   webpackOptions.output.library = [ 'STK', 'STK' ];
//  } else if (process.env.STK === 'inclDeps') {
//    webpackOptions.entry = { 'STKWithDeps': './client/js/lib/STK-with-deps' };
//    webpackOptions.output.library = [ 'STK', 'STKWithDeps' ];
//    webpackOptions.module.noParse = [ /lazy/, /dagre/ ];
// }

if (process.env.NODE_ENV === 'dev') {
//  webpackOptions.debug = true;
  webpackOptions.devtool = '#eval-source-map';
  webpackOptions.output.pathinfo = true;
}
webpackOptions.entry.common = ['dummy'];

module.exports = webpackOptions;
