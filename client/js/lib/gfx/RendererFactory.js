var Renderer = require('gfx/Renderer');
var _ = require('util/util');

/**
 * Factor for creating more renderers
 * @param opts.rendererType Renderer class
 * @param opts.renderers {Object<string,gfx.Renderer>} Prespecified renderers
 * @param opts.configSets {Object<string,*>} Prespecified renderer configurations
 * @constructor
 * @memberOf gfx
 */
function RendererFactory(opts) {
  this.__rendererType = opts.rendererType;
  this.__cachedRenderers = {}; // Map of name to renderer
  this.__rendererConfigs = {}; // Map of config setting to renderer
  if (opts.renderers) {
    _.defaults(this.__cachedRenderers, opts.renderers); // Copy prespecified renderers
  }
  if (opts.configSets) {
    _.defaults(this.__rendererConfigs, opts.configSets); // Copy prespecified configurations
  }
}

RendererFactory.prototype.getRenderer = function(name, opts) {
  if (!this.__cachedRenderers[name]) {
    var rendererOpts = opts;
    if (opts.configSet && this.__rendererConfigs[opts.configSet]) {
      rendererOpts = _.defaults(Object.create(null), opts || {}, this.__rendererConfigs[opts.configSet]);
      if (rendererOpts.cameraArrayShape && !opts.width && !opts.height) {
        rendererOpts.width = rendererOpts.cameraArrayShape[1]*rendererOpts.width;
        rendererOpts.height = rendererOpts.cameraArrayShape[0]*rendererOpts.height;
      }
    }
    console.log('Creating new renderer ' + name, rendererOpts);
    this.__cachedRenderers[name] = new this.__rendererType(rendererOpts);
  }
  return this.__cachedRenderers[name];
};

RendererFactory.createRenderer = function(opts) {
  return new Renderer(opts);
};

RendererFactory.createOffscreenRenderer = function(opts) {
  opts = _.defaults({ isOffscreen: true }, opts, {
    useAmbientOcclusion: false,
    useLights: false,
    useShadows: false,
    reuseBuffers: true
  });
  return RendererFactory.createRenderer(opts);
};

module.exports = RendererFactory;