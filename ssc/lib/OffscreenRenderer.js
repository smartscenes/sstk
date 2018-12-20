var async = require('async');
var PNG = require('pngjs').PNG;
var _ = require('lodash');

function __getTempFilename(prefix, ext) {
  var crypto = require('crypto');
  var os = require('os');
  var token = crypto.randomBytes(8).toString('hex');
  return os.tmpdir() + '/' + prefix + '_' + token + '.' + ext;
}

function OffscreenRendererFactory (baseRendererClass) {
  var OffscreenRenderer = function (params) {
    var gl = require('gl');
    // var _gl = gl(1000, 1000);  // gl context will be resized later
    // var ext = _gl.getExtension('STACKGL_resize_drawingbuffer');
    // ext.resize(params.width, params.height);
    // params.context = _gl;
    params.context = gl(params.width, params.height);
    params.isOffscreen = true;
    this.compress = params.compress;  // whether to compress PNG output
    this.skip_existing = params.skip_existing;  // whether to skip rendering existing files
    this.flipxy = params.flipxy; // whether to flip xy when writing out the png image
    this.__fs = params.fs || require('./file-util.js');  // filesystem to use for IO
    this.__debugCount = 0; // For debug output
    this.__debugFilename = params.debugFilename;
    baseRendererClass.call(this, params);
    this.__needFlipY = true;
    this.__maxViewportDims = [1000, 1000];
    this.canvas = params.canvas;  // Reference to dummy canvas
    this.viewlogFilename = params.viewlogFilename;  // Log of views that were generated
  };
  OffscreenRenderer.prototype = Object.create(baseRendererClass.prototype);
  OffscreenRenderer.prototype.super = baseRendererClass.prototype;
  OffscreenRenderer.prototype.constructor = OffscreenRenderer;

  OffscreenRenderer.prototype.setSize = function(width, height) {
    if (width !== this.width || height !== this.height) {
      console.warn('Set size is not properly supported in offscreen mode');
    }
    baseRendererClass.prototype.setSize.call(this, width, height);
  };

  // Renders scene from given camera into pngFile and returns raw RGBA pixels
  OffscreenRenderer.prototype.renderToPng = function (scene, camera, basename, opts) {
    var pngfile = _.endsWith(basename, '.png') ? basename : basename + '.png';
    if (this.skip_existing && this.__fs.existsSync(pngfile)) {
      console.log('Skipping render for existing file: ' + pngfile);
      return;
    }
    var pixels = this.render(scene, camera, opts);
    this.writePNG(pngfile, this.width, this.height, pixels);
    var viewlogFilename = (opts? opts.viewlogFilename : null) || this.viewlogFilename;
    if (viewlogFilename) {
      var logdata = { filename: pngfile, width: this.width, height: this.height, worldCamera: camera.toJSON() };
      if (opts && opts.logdata) {
        _.defaults(logdata, opts.logdata);
      }
      this.__fs.writeToFile(viewlogFilename, JSON.stringify(logdata) + '\n', { append: true });
    }
    if (this.compress) {
      this.__fs.execSync('pngquant -f --ext .png ' + pngfile, { encoding: 'utf8' });
    }
    return pixels;
  };

  // Renders scene from given camera into raw RGBA pixels
  OffscreenRenderer.prototype.render = function (scene, camera, opts) {
    var pixels = this.super.render.call(this, scene, camera, opts);
    if (this.__debugFilename) {
      this.writePNG(this.__debugFilename + '-' + this.__debugCount + '.png', this.width, this.height, pixels);
      this.__debugCount++;
    }
    return pixels;
  };

  // Renders scene from given camera into raw RGBA pixels
  OffscreenRenderer.prototype.renderToRawPixels = function (scene, camera, opts) {
    return this.render(scene, camera, opts);
  };

  OffscreenRenderer.prototype.renderToBuffer = function (scene, camera, opts) {
    var pixels = this.render(scene, camera, opts);
    var png = new PNG({ width: this.width, height: this.height });
    png.data = Buffer.from(pixels);
    var buff = PNG.sync.write(png);
    return buff;
  };

  OffscreenRenderer.prototype.renderViews = function(scene, opts) {
    if (opts.views === 'turntable') {
      this.renderTurntable(scene, opts);
    } else if (opts.views === 'all') {
      this.renderAllViews(scene, opts);
    } else  {
      console.error('Unknown views: ' + opts.views);
    }
  };

  // Renders turntable views of scene and saves into pngs strippedId_<0-359>.png
  OffscreenRenderer.prototype.renderTurntable = function (scene, opts) {
    var cameraControls = opts.cameraControls;
    var targetBBox = opts.targetBBox;
    var basename = opts.basename;
    var onDone = opts.callback;
    var tilt = opts.tilt || 60;
    var theta = tilt  / 180 * Math.PI;
    var distanceScale = opts.distanceScale || 1.5;
    var angleStart = opts.angleStart || 0;
    var angleEnd = opts.angleEnd || 360;
    var angleStep = opts.angleStep || 1;
    var framerate = opts.framerate || 25;

    var scope = this;
    var angles = _.range(angleStart, angleEnd, angleStep);
    async.forEachOfSeries(angles, function (angle, key, callback) {
      var phi = angle / 180 * Math.PI;
      cameraControls.viewTarget({
        targetBBox: targetBBox, distanceScale: distanceScale,
        theta: theta,
        phi: phi
      });
      var pngfile = basename + '-' + _.padStart(key.toString(), 4, '0') + '.png';
      cameraControls.camera.updateProjectionMatrix();
      var renderOpts = _.clone(opts);
      renderOpts.logdata = _.defaults({ cameraConfig: cameraControls.lastViewConfig },
        opts.logdata || {});
      scope.renderToPng(scene, cameraControls.camera, pngfile, renderOpts);
      setTimeout(function () { callback(); });
    }, function () {
      if (!opts.skipVideo) {
        scope.pngSeqToVideo(basename + '-%04d.png', basename + '.mp4',
          {width: scope.width, height: scope.height, framerate: framerate});
      }
      onDone();
    });
  };

// Renders all views of scene and saves into pngs strippedId_<viewName>.png
  OffscreenRenderer.prototype.renderAllViews = function (scene, opts) {
    var cameraControls = opts.cameraControls;
    var targetBBox = opts.targetBBox;
    var basename = opts.basename;
    var onDone = opts.callback;

    var views = cameraControls.generateViews(targetBBox, this.width, this.height);
    var scope = this;
    async.forEachSeries(views, function (view, callback) {
      cameraControls.viewTarget(view);
      var pngfile = basename + '-' + view.name + '.png';
      scope.renderToPng(scene, cameraControls.camera, pngfile, opts);
      setTimeout(function () { callback(); });
    }, function () {
      onDone();
    });
  };

  // Flip XY with respect to upper left corner
  OffscreenRenderer.prototype.__flipXY_ul = function (p, width, height, pout) {
    var numElementsPerRow = 4 * width;
    var numElementsPerColumn = 4 * height;
    for (var row = 0; row < height; row++) {
      var base = numElementsPerRow * row;
      for (var col = 0; col < width; col++) {
        var idx = base + (col << 2);
        var idxOut = numElementsPerColumn*col + (row << 2);
        for (var k = 0; k < 4; k++) {
          pout[idxOut + k] = p[idx + k];
        }
      }
    }
  };

  // Flip XY with respect to lower left corner
  OffscreenRenderer.prototype.__flipXY_ll = function (p, width, height, pout) {
    var numElementsPerRow = 4 * width;
    var numElementsPerColumn = 4 * height;
    for (var row = 0; row < height; row++) {
      var base = numElementsPerRow * row;
      var rowOut = height - row - 1;
      for (var col = 0; col < width; col++) {
        var colOut = width - col - 1;
        var idx = base + (col << 2);
        var idxOut = numElementsPerColumn*colOut + (rowOut << 2);
        for (var k = 0; k < 4; k++) {
          pout[idxOut + k] = p[idx + k];
        }
      }
    }
  };

  OffscreenRenderer.prototype.writePNG = function (pngFile, width, height, pixels) {
    var opts = { width: width, height: height, bpp: 4 };
    if (pixels instanceof Uint16Array) {  // 16-bit depth
      opts.inputColorType = 0;
      opts.inputHasAlpha = false;
      opts.colorType = 0;
      opts.bitDepth = 16;
      opts.bpp = 2;
    }
    var buf = Buffer.alloc(opts.bpp * opts.width * opts.height);
    if (this.flipxy) {
      opts.width = height;  opts.height = width;
      if (this.flipxy === 'lower_left') {
        this.__flipXY_ll(pixels, width, height, buf);
      } else {
        this.__flipXY_ul(pixels, width, height, buf);
      }
    } else {
      var pixbuf = new Uint8Array(pixels.buffer);
      for (var i = 0; i < pixbuf.length; i++) {
        buf[i] = pixbuf[i];
      }
    }
    var outbuf = PNG.sync.write({ width: opts.width, height: opts.height, data: buf}, opts);
    this.__fs.writeFileSync(pngFile, outbuf);
    console.log('Saved ' + pngFile);
  };

// converts png sequence input to video file out
  OffscreenRenderer.prototype.pngSeqToVideo = function (input, out, opts) {
    var tmpfilename = __getTempFilename('white', 'png');
    //console.log(tmpfilename);
    var whitePixels = new Array(opts.width * opts.height * 4).fill(255);
    this.writePNG(tmpfilename, opts.width, opts.height, whitePixels);
    var framerate = opts.framerate || 25;
    var cmdWithArgs = ['ffmpeg', '-y', '-loop','1','-i',tmpfilename,
      '-r', framerate, '-i', input, '-filter_complex','overlay=shortest=1',
      '-r', framerate, out];
    var cmdline = cmdWithArgs.join(' ');
    this.__fs.execSync(cmdline);
    this.__fs.execSync('rm -f ' + tmpfilename);
  };

  return OffscreenRenderer;
}

module.exports = OffscreenRendererFactory;
