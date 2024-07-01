// Enhance commander with common groups of ssc options
var cmd = require('commander');
var path = require('path');
var STK = require('./stk-ssc');
var _ = STK.util;

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
      .option('--ambient_occlusion_type <type>', 'Type of ambient occlusion to use', /^(ssao-old|ssao|sao|edl)$/, 'ssao-old')
      .option('--use_outline [flag]', 'Use outline or not', STK.util.cmd.parseBoolean, false)
      .option('--outline_color <color>', 'Color for outlines', 'white')
      .option('--use_highlight_outline [flag]', 'Use outline shader or not for highlighting', STK.util.cmd.parseBoolean, false)
      .option('--highlight_outline_color <color>', 'Color for highlight outlines', 'white')
      .option('--use_lights [flag]', 'Use lights or not', STK.util.cmd.parseBoolean, false)
      .option('--use_physical_lights [flag]', 'Use physical lights or not', STK.util.cmd.parseBoolean, false)
      .option('--use_directional_lights [flag]', 'Use directional lights or not', STK.util.cmd.parseBoolean, false)
      .option('--use_ambient_light_only [flag]', 'Use only ambient light', STK.util.cmd.parseBoolean, false)
      .option('--use_antialias_pass [flag]', 'Use extra antialiasing pass', STK.util.cmd.parseBoolean, false)
      .option('--envmap <path>', 'Use environment map')
      .option('--antialias_type <type>', 'Type of antialias to use', /^(ssaa|fxaa)$/, 'ssaa')
      .option('--use_shadows [flag]', 'Use shadows or not', STK.util.cmd.parseBoolean, false)
      .option('--width <width>', 'Image width [default: 1000]', STK.util.cmd.parseInt, 1000)
      .option('--height <height>', 'Image height [default: 1000]', STK.util.cmd.parseInt, 1000)
      .option('--max_width <width>', 'Maximum image width [default: 20000]', STK.util.cmd.parseInt, 20000)
      .option('--max_height <height>', 'Maximum image height [default: 20000]', STK.util.cmd.parseInt, 20000)
      .option('--max_pixels <pixels>', 'Maximum image pixels [default: 10000*100000]', STK.util.cmd.parseInt, 10000*10000)
      .option('--save_view_log [flag]', 'Whether to save a view log', STK.util.cmd.parseBoolean)
      .option('--log_index_info [flag]', 'Whether to save per view index count and bounding boxes (use with --save_view_log)', STK.util.cmd.parseBoolean)
      .option('--compress_png [flag]', 'Compress PNG output using pngquant [false]', STK.util.cmd.parseBoolean, false);
  }
  // Options for rendering views
  if (opts.render_views) {
    this.option('--render_all_views [flag]', 'Render all canonical views [false]', STK.util.cmd.parseBoolean, false)
      .option('--render_turntable [flag]', 'Render a sequence of turntable images and a video [false]', STK.util.cmd.parseBoolean, false)
      .option('--turntable_step <degrees>', 'Degrees to step for each turntable step [1]', STK.util.cmd.parseInt, 1)
      .option('--framerate <frames per secs>', 'Frames per second for turntable video [25]', STK.util.cmd.parseInt, 25)
      .option('--skip_video [flag]', 'Skip turntable video [false]', STK.util.cmd.parseBoolean, false)
      .option('--tilt <tilt>', 'Default tilt (from horizontal) in degrees [60]', STK.util.cmd.parseInt, 60)
      .option('--flipxy <fliptype>', 'Flip xy when generating image')
  }
  // Options for specifying view point
  if (opts.view) {
    this.option('--view_index <view_index>', 'Which view to render [0-7]', STK.util.cmd.parseInt);
    this.option('--view_target_ids <object_ids>', 'Which objects to look at (use object to include all objects)', STK.util.cmd.parseList);
    this.option('--find_good_views [flag]', 'Whether to optimize for good views or not (applies if --view_target_ids is set)', STK.util.cmd.parseBoolean, false);
    this.option('--use_scene_camera <camera_name>', 'Use camera from scene');
  }
  // Options for special color by
  if (opts.color_by) {
    this.option('--color_by <color_by>', 'Recoloring scheme (' + STK.scene.SceneUtil.ColorByTypes.join(',') + ')')
      .option('--color <color>', 'Color when coloring by color [silver]', 'silver')
      .option('--arch_color <color>', 'Color to use for coloring arch')
      .option('--encode_index [flag]', 'Encode color index directly', STK.util.cmd.parseBoolean, false)
      .option('--write_index [flag]', 'Output index to file', STK.util.cmd.parseBoolean, false)
      .option('--index <filename>', 'Input index to use for consistent encoding')
      .option('--object_index <filename>', 'Input index to use for object ids')
      .option('--restrict_to_color_index [flag]', 'Restrict coloring to index', STK.util.cmd.parseBoolean, false)
      .option('--output_image_encoding <encoding>', 'What encoding to use for output image')        // TODO: there is a bit of overlap in this two options
      .option('--model_category_mapping <filename>', 'Mapping of model id to category mappings (with id and category columns).  Can also be JSON object with path, useFullId, modelIdKey, categoryKey.', STK.util.cmd.parseJSONObjectOrString)
      .option('--convert_pixels <target_type>', "Target type for pixels (uint8|uint16)", /^(uint8|uint16)$/);
  }
  // Options for voxelization
  if (opts.voxels) {
    this.option('--use_fixed_voxel_size [flag]', 'Whether to use fixed voxel size', STK.util.cmd.parseBoolean, false)
      .option('--resolution <number>', 'Voxel grid resolution [default: 32 (32x32x32)]', STK.util.cmd.parseInt, 32)
      .option('--voxel_size <number>', 'Fixed voxel size [default: 0.1 (10 cm)]', STK.util.cmd.parseFloat, 0.10)
      .option('--samples <number>', 'Number of samples [default: 100000]', STK.util.cmd.parseInt, 100000)
      .option('--downsample <multiplier>', 'Downsample voxel grid resolution down from original voxel resolution [default: 1]. Example: use 4 to takes 128^3 to 32^3', STK.util.cmd.parseInt, 1)
      .option('--voxel_aggregate_mode <mode>', 'Mode to use for aggregating voxels [default: median]', 'median')
      .option('--voxels <voxel-type>', 'Type of voxels to use [default: none]', 'none');
  }
  // Options for transforming 3d asset
  if (opts.transform3d) {
    this.option('--center [flag]', 'Center so scene is at origin', STK.util.cmd.parseBoolean, false)
      .option('--normalize_size <type>', 'What to normalize (diagonal or max dimension)', /^(diagonal|max)$/)
      .option('--normalize_size_to <target>', 'What to normalize the size to', STK.util.cmd.parseFloat, 1.0);
  }
  // Options for normalizing geometry
  if (opts.norm_geo) {
    this.option('--to_geometry [flag]', 'Convert model to geometry instead of buffer geometry (use for scannet plys on linux machines)', STK.util.cmd.parseBoolean, false)
        .option('--to_nonindexed [flag]', 'Convert model to nonindexed buffer geometry if already buffer geometry (use for scannet plys on linux machines)', STK.util.cmd.parseBoolean, true);
  }
  // Options for scene
  if (opts.scene) {
    this.option('--empty_room [flag]', 'Use empty room for scene', STK.util.cmd.parseBoolean, false)
      .option('--arch_only [flag]', 'Include only architectural elements for scene', STK.util.cmd.parseBoolean, false)
      .option('--retexture <n>', 'Number of times to retextures', STK.util.cmd.parseInt, 0);
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

function readSyncJsonFile(filepath) {
  var ext = filepath.toLowerCase().endsWith('.jsonl')? 'jsonl' : 'json';
  var data = STK.fs.readSync(filepath, ext);
  if (!data) {
    throw 'Error reading file ' + filepath;
  }
  return data;
}

function replaceRefs(object, dir) {
  // Look for '$ref' fields and replace them
  return STK.util.cloneDeepWith(object, function(v) {
    if (STK.util.isPlainObject(v)) {
      if (v['$ref']) {
        var filepath = v['$ref'];
        if (dir) {
          filepath = path.resolve(dir, filepath);
        }
        var data = readSyncJsonFile(filepath);
        return replaceRefs(data, path.dirname(filepath));
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
      var data = readSyncJsonFile(filename);
      var config = replaceRefs(data, path.dirname(filename));
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

cmd.Command.prototype.getAssetSources = function(input_type, inputs, assetSources) {
  assetSources = assetSources || [];
  if (input_type === 'id') {
    assetSources = _.uniq(_.concat(assetSources, _.map(inputs, function(f) { return f.split('.')[0]; })));
  }

  if (this.assetInfo && this.assetInfo.source) {
    var source = this.assetInfo.source;
    if (assetSources.indexOf(source) < 0) { assetSources.push(source); }
  }

  if (this.source != null) {
    var source = this.source;
    if (assetSources.indexOf(source) < 0) { assetSources.push(source); }
  }

  return assetSources;
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
    return STK.fs.loadDelimited(input);
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

cmd.Command.prototype.combine = function(object, source, cmdopts) {
  var explicit = STK.util.keys(this.__explicitOptions);
  var specified = STK.util.filter(cmdopts, o => explicit.indexOf(o) >= 0);
  STK.util.merge(object, _.omit(source, specified));
  STK.util.defaults(object, source);
  return object;
};

cmd.Command.prototype.getRendererOptions = function(opts) {
  var use_ambient_occlusion = (opts.use_ambient_occlusion && opts.ambient_occlusion_type !== 'edl');
  return {
    width: opts.width,
    height: opts.height,
    isEncodedMode: opts.encode_index,  // Let renderer know what we want to do encoding
    // Antialiasing
    useAntialiasPass: opts.encode_index ? false : opts.use_antialias_pass,
    antialiasType: opts.antialias_type,
    // Ambient occlusion
    useAmbientOcclusion: opts.encode_index ? false : use_ambient_occlusion,
    useEDLShader: (opts.use_ambient_occlusion && opts.ambient_occlusion_type === 'edl'),
    ambientOcclusionOptions: {
      type: use_ambient_occlusion ? opts.ambient_occlusion_type : undefined
    },
    // Outline
    useEffect: (!opts.encode_index && opts.use_outline) ? 'outline' : null,
    outlineColor: opts.outline_color,
    // Highlight outline
    useOutlineShader: opts.encode_index ? false : opts.use_highlight_outline,
    pickOutlineColor: opts.highlight_outline_color,
    outlineHighlightedOnly: true,
    // Lights
    usePhysicalLights: opts.encode_index ? false : opts.use_physical_lights,
    useShadows: opts.encode_index ? false : opts.use_shadows,
    // Other options
    flipxy: opts.flipxy,
    compress: opts.compress_png,
    skip_existing: opts.skip_existing,
    reuseBuffers: true
  };
};

cmd.Command.prototype.getLightingOptions = function(opts) {
  return {
    lights: opts.lights,
    useDirectionalLights: opts.use_directional_lights,
    useAmbientLightOnly: opts.use_ambient_light_only,
    usePhysicalLights: opts.use_physical_lights,
    useLights: opts.use_lights
  };
};


Object.defineProperty(cmd.Command.prototype, 'explicitOptions', {
  get: function () {
    return this.__explicitOptions;
  }
});

module.exports = cmd;

