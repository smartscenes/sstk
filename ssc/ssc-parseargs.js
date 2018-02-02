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
    this.option('--use_ambient_occlusion [flag]', 'Use ambient occlusion or not', STK.util.cmd.parseBoolean, true)
      .option('--use_lights [flag]', 'Use lights or not', STK.util.cmd.parseBoolean, false)
      .option('--use_shadows [flag]', 'Use shadows or not', STK.util.cmd.parseBoolean, false)
      .option('--width <width>', 'Image width [default: 1000]', STK.util.cmd.parseInt, 1000)
      .option('--height <height>', 'Image height [default: 1000]', STK.util.cmd.parseInt, 1000);
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
    this.option('--view_index <view_index>', 'Which view to render [0-7]', STK.util.cmd.parseInt, 0);
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
    this.option('--config_file <filename>', 'Config file with common options');
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
    var data = STK.fs.readSync(this.config_file);
    var config = replaceRefs(JSON.parse(data), path.dirname(this.config_file));
    console.log('got config', config);
    console.log('got explicit options', this.__explicitOptions);
    STK.util.merge(this, _.omit(config, _.keys(this.__explicitOptions)));
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
      var data = STK.util.readSync(ids[0]);
      ids = data.split('\n').map(function(x) { return STK.util.trim(x); }).filter(function(x) { return x.length > 0; });
    }
  }
  return ids;
};

module.exports = cmd;

