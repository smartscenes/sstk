// Enhance commander with common groups of ssc options
var cmd = require('commander');
var path = require('path');
var STK = require('./stk-ssc');

cmd.Command.prototype.optionGroups = function(opts) {
  // TODO: Improve ordering of optionsGroups
  // TODO: Fix so defaults here shouldn't override defaults specified in config_file
  if (Array.isArray(opts)) {
    var list = opts;
    opts = {};
    list.forEach(function(x) { opts[x] = true; });
  }
  // Options for renderer
  if (opts.render_options) {
    this.option('--use_ambient_occlusion [flag]', 'Use ambient occlusion or not', STK.util.cmd.parseBoolean, false)
      .option('--ambient_occlusion_type <type>', 'Type of ambient occlusion to use', /^(ssao|sao|edl)$/, 'ssao')
      .option('--use_outline_shader [flag]', 'Use outline shader or not', STK.util.cmd.parseBoolean, false)
      .option('--outline_color <color>', 'Color for outlines', 'white')
      .option('--use_lights [flag]', 'Use lights or not', STK.util.cmd.parseBoolean, false)
      .option('--use_shadows [flag]', 'Use shadows or not', STK.util.cmd.parseBoolean, false)
      .option('--width <width>', 'Image width [default: 1000]', STK.util.cmd.parseInt, 1000)
      .option('--height <height>', 'Image height [default: 1000]', STK.util.cmd.parseInt, 1000)
      .option('--max_width <width>', 'Maximum image width [default: 20000]', STK.util.cmd.parseInt, 20000)
      .option('--max_height <height>', 'Maximum image height [default: 20000]', STK.util.cmd.parseInt, 20000)
      .option('--max_pixels <pixels>', 'Maximum image pixels [default: 10000*100000]', STK.util.cmd.parseInt, 10000*10000)
      .option('--save_view_log [flag]', 'Whether to save a view log', STK.util.cmd.parseBoolean);
  }
  // Options for rendering views
  if (opts.render_views) {
    this.option('--render_all_views [flag]', 'Render all canonical views [false]', STK.util.cmd.parseBoolean, false)
      .option('--render_turntable [flag]', 'Render a sequence of turntable images and a video [false]', STK.util.cmd.parseBoolean, false)
      .option('--turntable_step <degrees>', 'Degrees to step for each turntable step [1]', STK.util.cmd.parseInt, 1)
      .option('--framerate <frames per secs>', 'Frames per second for turntable video [25]', STK.util.cmd.parseInt, 25)
      .option('--skip_video [flag]', 'Skip turntable video [false]', STK.util.cmd.parseBoolean, false)
      .option('--tilt <tilt>', 'Default tilt (from horizontal) in degrees [60]', STK.util.cmd.parseInt, 60)
      .option('--compress_png [flag]', 'Compress PNG output using pngquant [false]', STK.util.cmd.parseBoolean, false)
      .option('--flipxy <fliptype>', 'Flip xy when generating image')
  }
  // Options for specifying view point
  if (opts.view) {
    this.option('--view_index <view_index>', 'Which view to render [0-7]', STK.util.cmd.parseInt);
    this.option('--use_scene_camera <camera_name>', 'Use camera from scene');
  }
  // Options for special color by
  if (opts.color_by) {
    this.option('--color_by <color_by>', 'Recoloring scheme (' + STK.scene.SceneUtil.ColorByOptions.join(',') + ')')
      .option('--color <color>', 'Color when coloring by color [silver]', 'silver')
      .option('--encode_index [flag]', 'Encode color index directly', STK.util.cmd.parseBoolean, false)
      .option('--write_index [flag]', 'Output index to file', STK.util.cmd.parseBoolean, false)
      .option('--index <filename>', 'Input index to use for consistent encoding')
      .option('--object_index <filename>', 'Input index to use for object ids')
      .option('--restrict_to_color_index [flag]', 'Restrict coloring to index', STK.util.cmd.parseBoolean, false);
  }
  // Options for scene
  if (opts.scene) {
    this.option('--empty_room [flag]', 'Use empty room for scene', STK.util.cmd.parseBoolean, false)
      .option('--arch_only [flag]', 'Include only architectural elements for scene', STK.util.cmd.parseBoolean, false)
      .option('--retexture <n>', 'Number of times to retextures', STK.util.cmd.parseInt, 0)
  }
  // Options for asset cache sizes
  if (opts.asset_cache) {
    this.option('--assetCacheSize <num>', 'Asset cache size', STK.util.cmd.parseInt, 100);
  }
  if (opts.config_file) {
    this.option('--config_file <filename>', 'Config file with common options', STK.util.cmd.collect, []);
  }
  return this;
};

function replaceRefs(object, dir) {
  // Look for '$ref' fields and replace them
  return STK.util.cloneDeepWith(object, function(v) {
    if (STK.util.isPlainObject(v)) {
      if (v['$ref']) {
        var filepath = v['$ref'];
        if (dir) {
          filepath = path.resolve(dir, filepath);
        }
        var data = STK.fs.readSync(filepath);
        return replaceRefs(JSON.parse(data), path.dirname(filepath));
      }
    }
  });
}

cmd.Command.prototype.__trackOptions = function() {
  var scope = this;
  this.__explicitOptions = {};
  STK.util.each(this.options, function(option) {
    if (!option.__trackOption) {
      scope.on('option:' + option.name(), function(val) {
        scope.__explicitOptions[option.name()] = val;
      });
      option.__trackOption = true;
    }
  });
};

cmd.Command.prototype.loadConfig = function() {
  if (this.config_file) {
    var filenames = _.isArray(this.config_file)? this.config_file : [this.config_file];
    for (var i = 0; i < filenames.length; i++) {
      var filename = filenames[i];
      var data = STK.fs.readSync(filename);
      var config = replaceRefs(JSON.parse(data), path.dirname(filename));
      console.log('got config', config);
      console.log('got explicit options', this.__explicitOptions);
      STK.util.merge(this, _.omit(config, _.keys(this.__explicitOptions)));
    }
  }
};

cmd.Command.prototype.__parse = cmd.Command.prototype.parse;
cmd.Command.prototype.parse = function() {
  this.__trackOptions();
  this.__parse.apply(this, arguments);
  this.loadConfig();
  return this;
};

cmd.Command.prototype.getIds = function(ids, assetGroup) {
  if (ids.indexOf('all') >= 0) {
    ids = assetGroup.assetsDb.getAssetIds().map(function (x) {
      return x.split('.', 2)[1];
    });
  } else {
    if (ids.length === 1 && ids[0].endsWith('.txt')) {
      // Read files form input file
      ids = STK.fs.readLines(ids[0]);
    }
  }
  return ids;
};

cmd.Command.prototype.getInputs = function(input) {
  if (input.endsWith('.txt')) {
    // Read files from input file
    return STK.fs.readLines(input);
  } else if (input.endsWith('.csv') || input.endsWith('.tsv')) {
    return STK.fs.loadDelimited(filename);
  } else {
    return input.split(',');
  }
};

cmd.Command.prototype.checkImageSize = function(options, limits) {
  limits = limits || options;
  if (options.width > limits.max_width) {
    return 'width ' + options.width + ' exceeds max width of ' + limits.max_width;
  }
  if (options.height > limits.max_height) {
    return 'height ' + options.height + ' exceeds max height of ' + limits.max_height;
  }
  if ((options.width*options.height) > limits.max_pixels) {
    return 'total pixels of ' + (options.width*options.height) + ' for width x height of '
      + options.width + 'x' + options.height + ' exceeds max pixels of ' + limits.max_pixels;
  }
};

module.exports = cmd;

